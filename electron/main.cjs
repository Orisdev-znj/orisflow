// Processus principal d'Orisflow : fenêtre, sélection des fichiers, appel du moteur Python.
// Aucune règle comptable ici : le moteur Python s'en charge.
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const estEmpaquete = app.isPackaged;
// Mode de vérification sans interface : défini par la variable ORISFLOW_AUTOTEST (chemin du rapport à écrire).
const cibleAutotest = process.env.ORISFLOW_AUTOTEST || "";
const modeAutotest = cibleAutotest !== "";

// ---------------------------------------------------------------------------
// Dossiers de travail et paramètres
// ---------------------------------------------------------------------------

const SOUS_DOSSIERS = ["Imports", "Resultats", "Sauvegardes", "SuiviCourrier"];

function fichierParametres() {
  return path.join(app.getPath("userData"), "parametres.json");
}

function lireParametres() {
  try {
    return JSON.parse(fs.readFileSync(fichierParametres(), "utf-8"));
  } catch {
    return {};
  }
}

function dossierTravail() {
  const parametres = lireParametres();
  if (parametres.dossierTravail) return parametres.dossierTravail;
  const racine = modeAutotest ? app.getPath("temp") : app.getPath("documents");
  return path.join(racine, "Orisflow");
}

/** Dossier des classeurs de trésorerie existants, utilisé en LECTURE SEULE pour comparer
 * le nombre de comptes du jour à celui de la veille (sprint 2). Vide tant que l'utilisateur
 * ne l'a pas choisi : aucun chemin n'est écrit en dur. */
function dossierReference() {
  return lireParametres().dossierReference || "";
}

/** Dossier partagé de Suivi Courrier (fonctionnalité démarrée le 30/09/2026, nommée par
 * l'utilisateur le 30/09/2026). Destiné à terme à un dossier réseau accessible à tout le
 * service (toutes les machines sont reliées par câble Ethernet) : configurable, jamais en
 * dur. Tant que l'utilisateur ne l'a pas choisi, un dossier LOCAL par défaut est utilisé
 * (sous le dossier de travail) pour permettre de tester la fonctionnalité dès maintenant —
 * demande explicite de l'utilisateur le 30/09/2026. Ce repli local ne sera pas visible
 * d'un autre poste : dès que le vrai dossier réseau est choisi dans Paramètres, Orisflow
 * l'utilise à la place (les transmissions de test créées en local restent dans l'ancien
 * dossier, elles ne sont pas déplacées automatiquement). */
function dossierBordereau() {
  const parametres = lireParametres();
  if (parametres.dossierBordereau) return parametres.dossierBordereau;
  return path.join(dossierTravail(), "SuiviCourrier");
}

/** Vrai seulement si l'utilisateur a explicitement choisi un dossier (donc, en principe,
 * un vrai dossier réseau partagé) : sert à afficher un avertissement clair tant qu'on est
 * encore sur le repli local de test. */
function dossierBordereauChoisiParUtilisateur() {
  return !!lireParametres().dossierBordereau;
}

/** Identité locale de l'utilisateur (son nom), utilisée comme expéditeur/auteur des
 * transmissions et évènements du bordereau. Un réglage par poste, pas partagé : chacun
 * configure son propre nom une fois, comme un compte utilisateur léger (pas de mot de
 * passe pour cette première version — usage interne sur un réseau de confiance). */
function identiteUtilisateur() {
  return lireParametres().identite || "";
}

function preparerDossiers() {
  const racine = dossierTravail();
  for (const sous of SOUS_DOSSIERS) {
    fs.mkdirSync(path.join(racine, sous), { recursive: true });
  }
  return racine;
}

// ---------------------------------------------------------------------------
// Moteur Python
// ---------------------------------------------------------------------------

function commandeMoteur() {
  if (estEmpaquete) {
    const exe = path.join(process.resourcesPath, "engine", "orisflow-engine.exe");
    return { cmd: exe, args: [], cwd: path.dirname(exe) };
  }
  return {
    cmd: process.env.ORISFLOW_PYTHON || "python",
    args: ["-m", "orisflow_engine"],
    cwd: path.join(__dirname, "..", "engine"),
  };
}

/**
 * Lance le moteur, lui envoie les paramètres en JSON et relaie ses messages.
 * Retourne le résultat final, ou lève une erreur en français.
 */
function lancerMoteur(commande, parametres, surEvenement) {
  return new Promise((resolve, reject) => {
    const { cmd, args, cwd } = commandeMoteur();
    if (estEmpaquete && !fs.existsSync(cmd)) {
      reject(new Error("Le moteur d'Orisflow est introuvable. Réinstallez l'application."));
      return;
    }
    let processus;
    try {
      processus = spawn(cmd, [...args, commande], {
        cwd,
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      });
    } catch (erreur) {
      reject(new Error(`Impossible de démarrer le moteur : ${erreur.message}`));
      return;
    }

    let resultat = null;
    let messageErreur = null;
    let tampon = "";
    let sortieErreur = "";

    const traiterLigne = (ligne) => {
      if (!ligne.trim()) return;
      let message;
      try {
        message = JSON.parse(ligne);
      } catch {
        return;
      }
      if (message.type === "resultat") resultat = message;
      else if (message.type === "erreur") messageErreur = message.message;
      else if (surEvenement) surEvenement(message);
    };

    processus.stdout.setEncoding("utf-8");
    processus.stdout.on("data", (morceau) => {
      tampon += morceau;
      const lignes = tampon.split(/\r?\n/);
      tampon = lignes.pop() ?? "";
      lignes.forEach(traiterLigne);
    });
    processus.stderr.setEncoding("utf-8");
    processus.stderr.on("data", (morceau) => {
      sortieErreur += morceau;
    });
    processus.on("error", (erreur) => {
      const introuvable = erreur.code === "ENOENT";
      reject(
        new Error(
          introuvable
            ? "Le moteur Python est introuvable sur cet ordinateur."
            : `Le moteur n'a pas pu démarrer : ${erreur.message}`,
        ),
      );
    });
    processus.on("close", (code) => {
      traiterLigne(tampon);
      if (resultat) resolve(resultat);
      else if (messageErreur) reject(new Error(messageErreur));
      else reject(new Error(`Le moteur s'est arrêté sans réponse (code ${code}). ${sortieErreur.trim()}`.trim()));
    });

    processus.stdin.write(JSON.stringify(parametres ?? {}));
    processus.stdin.end();
  });
}

// ---------------------------------------------------------------------------
// Communication avec l'interface
// ---------------------------------------------------------------------------

function decrireFichiers(chemins) {
  return chemins.map((chemin) => {
    let taille = 0;
    try {
      taille = fs.statSync(chemin).size;
    } catch {
      /* fichier illisible : la taille reste à 0 */
    }
    return { chemin, nom: path.basename(chemin), taille };
  });
}

function enregistrerCommunications() {
  ipcMain.handle("fichiers:choisir", async (evenement) => {
    const fenetre = BrowserWindow.fromWebContents(evenement.sender);
    const choix = await dialog.showOpenDialog(fenetre, {
      title: "Choisir les fichiers du jour",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Extractions et relevés", extensions: ["xls", "xlsx", "pdf"] },
        { name: "Tous les fichiers", extensions: ["*"] },
      ],
    });
    return choix.canceled ? [] : decrireFichiers(choix.filePaths);
  });

  ipcMain.handle("fichiers:decrire", (_evenement, chemins) => decrireFichiers(chemins));

  ipcMain.handle("moteur:tester", async () => lancerMoteur("ping", {}));

  ipcMain.handle("moteur:classer", async (evenement, chemins) =>
    lancerMoteur(
      "classer",
      { fichiers: chemins, dossierReference: dossierReference() || null },
      (message) => {
        evenement.sender.send("moteur:evenement", message);
      },
    ),
  );

  ipcMain.handle("moteur:generer", async (evenement, chemins, valeursManuelles) => {
    const racine = preparerDossiers();
    return lancerMoteur(
      "generer",
      {
        fichiers: chemins,
        dossierReference: dossierReference() || null,
        dossierSortie: path.join(racine, "Resultats"),
        valeursManuelles: valeursManuelles || null,
      },
      (message) => {
        evenement.sender.send("moteur:evenement", message);
      },
    );
  });

  ipcMain.handle("parametres:lire", () => ({
    dossierTravail: dossierTravail(),
    dossierReference: dossierReference(),
    dossierBordereau: dossierBordereau(),
    dossierBordereauParDefaut: !dossierBordereauChoisiParUtilisateur(),
    identite: identiteUtilisateur(),
    version: app.getVersion(),
    empaquete: estEmpaquete,
  }));

  ipcMain.handle("parametres:choisirDossier", async (evenement) => {
    const fenetre = BrowserWindow.fromWebContents(evenement.sender);
    const choix = await dialog.showOpenDialog(fenetre, {
      title: "Choisir le dossier de travail d'Orisflow",
      properties: ["openDirectory", "createDirectory"],
    });
    if (choix.canceled || choix.filePaths.length === 0) return dossierTravail();
    const parametres = { ...lireParametres(), dossierTravail: choix.filePaths[0] };
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(fichierParametres(), JSON.stringify(parametres, null, 2), "utf-8");
    preparerDossiers();
    return parametres.dossierTravail;
  });

  ipcMain.handle("parametres:ouvrirDossier", async () => {
    const racine = preparerDossiers();
    await shell.openPath(racine);
    return racine;
  });

  ipcMain.handle("parametres:choisirDossierReference", async (evenement) => {
    const fenetre = BrowserWindow.fromWebContents(evenement.sender);
    const choix = await dialog.showOpenDialog(fenetre, {
      title: "Choisir le dossier des classeurs de trésorerie (pour comparer avec la veille)",
      properties: ["openDirectory"],
    });
    if (choix.canceled || choix.filePaths.length === 0) return dossierReference();
    const parametres = { ...lireParametres(), dossierReference: choix.filePaths[0] };
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(fichierParametres(), JSON.stringify(parametres, null, 2), "utf-8");
    return parametres.dossierReference;
  });

  ipcMain.handle("parametres:choisirDossierBordereau", async (evenement) => {
    const fenetre = BrowserWindow.fromWebContents(evenement.sender);
    const choix = await dialog.showOpenDialog(fenetre, {
      title: "Choisir le dossier réseau partagé de Suivi Courrier",
      properties: ["openDirectory", "createDirectory"],
    });
    if (choix.canceled || choix.filePaths.length === 0) return dossierBordereau();
    const parametres = { ...lireParametres(), dossierBordereau: choix.filePaths[0] };
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(fichierParametres(), JSON.stringify(parametres, null, 2), "utf-8");
    return parametres.dossierBordereau;
  });

  ipcMain.handle("identite:definir", (_evenement, nom) => {
    const parametres = { ...lireParametres(), identite: (nom || "").trim() };
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(fichierParametres(), JSON.stringify(parametres, null, 2), "utf-8");
    return parametres.identite;
  });

  ipcMain.handle("bordereau:choisirPieceJointe", async (evenement) => {
    const fenetre = BrowserWindow.fromWebContents(evenement.sender);
    const choix = await dialog.showOpenDialog(fenetre, {
      title: "Joindre un fichier à la transmission",
      properties: ["openFile"],
    });
    return choix.canceled ? null : decrireFichiers(choix.filePaths)[0];
  });

  ipcMain.handle("bordereau:creer", async (_evenement, donnees) =>
    lancerMoteur("bordereau_creer", {
      dossier: dossierBordereau() || null,
      expediteur: identiteUtilisateur(),
      destinataire: donnees.destinataire,
      document: donnees.document,
      typeDocument: donnees.typeDocument,
      pieceJointeSource: donnees.pieceJointeSource || null,
      urgence: donnees.urgence || null,
      commentaire: donnees.commentaire || null,
    }),
  );

  ipcMain.handle("bordereau:evenement", async (_evenement, donnees) =>
    lancerMoteur("bordereau_evenement", {
      dossier: dossierBordereau() || null,
      transmissionId: donnees.transmissionId,
      typeEvenement: donnees.typeEvenement,
      auteur: identiteUtilisateur(),
      commentaire: donnees.commentaire || null,
    }),
  );

  ipcMain.handle("bordereau:lister", async () =>
    lancerMoteur("bordereau_lister", { dossier: dossierBordereau() || null }),
  );
}

// ---------------------------------------------------------------------------
// Fenêtre
// ---------------------------------------------------------------------------

function creerFenetre() {
  const fenetre = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    title: "Orisflow",
    backgroundColor: "#FFFFFF",
    icon: path.join(__dirname, "..", "build", "icon.ico"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  fenetre.removeMenu();
  fenetre.loadFile(path.join(__dirname, "..", "dist-renderer", "index.html"));
  return fenetre;
}

/** Vérification sans interface, avant chaque livraison : ORISFLOW_AUTOTEST=<rapport.json> puis Orisflow.exe. */
async function autotest() {
  const rapport = { moteur: null, dossier: null, erreur: null };
  try {
    rapport.dossier = preparerDossiers();
    const ping = await lancerMoteur("ping", {});
    const analyse = await lancerMoteur("analyser", { fichiers: [process.execPath, "C:\\introuvable.xlsx"] });
    rapport.moteur = { version: ping.version, python: ping.python, analyse: analyse.fichiers.map((f) => f.statut) };
  } catch (erreur) {
    rapport.erreur = erreur.message;
  }
  const texte = JSON.stringify(rapport);
  console.log(texte);
  // Une application graphique n'affiche pas de console : le rapport peut être écrit dans un fichier.
  fs.writeFileSync(cibleAutotest, texte, "utf-8");
  app.exit(rapport.erreur ? 1 : 0);
}

const verrou = modeAutotest ? true : app.requestSingleInstanceLock();
if (!verrou) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    if (modeAutotest) return autotest();
    preparerDossiers();
    enregistrerCommunications();
    creerFenetre();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) creerFenetre();
    });
  });
  app.on("window-all-closed", () => app.quit());
}
