// Processus principal d'Orisflow : fenêtre, sélection des fichiers, appel du moteur Python.
// Aucune règle comptable ici : le moteur Python s'en charge.
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const auth = require("./auth.cjs");
const journal = require("./journal.cjs");

const estEmpaquete = app.isPackaged;
// Mode de vérification sans interface : défini par la variable ORISFLOW_AUTOTEST (chemin du rapport à écrire).
const cibleAutotest = process.env.ORISFLOW_AUTOTEST || "";
const modeAutotest = cibleAutotest !== "";

// ---------------------------------------------------------------------------
// Dossiers de travail et paramètres
// ---------------------------------------------------------------------------

const SOUS_DOSSIERS = ["Imports", "Resultats", "Sauvegardes", "SuiviCourrier", "Carnet", "Config", "Journal", "Cache"];

function fichierParametres() {
  return path.join(app.getPath("userData"), "parametres.json");
}

// ---------------------------------------------------------------------------
// Authentification (version 1.1.0) : voir auth.cjs pour la logique (comptes, mots de
// passe hachés, verrouillage anti-force brute). Ici, seulement le chemin du fichier
// (jamais en dur ailleurs que dans ce dossier hors dépôt) et la session en cours — en
// mémoire du processus seulement, donc remise à zéro à chaque lancement d'Orisflow,
// et conservée tant que l'application reste ouverte (décision du 06/10/2026).
function fichierComptes() {
  return path.join(app.getPath("userData"), "comptes.json");
}

// Journal des actions (06/10/2026) : qui a fait quoi, et quand — dans le dossier de travail,
// au même titre que le carnet ou les résultats (jamais dans Documents\Orisflow caché).
function dossierJournal() {
  return path.join(dossierTravail(), "Journal");
}

let sessionCourante = null;

/** L'identité affichée dans Suivi Courrier suit désormais la session connectée : plus
 * besoin de la saisir à part (l'ancien champ « Votre identité » reste utilisable en secours). */
function synchroniserIdentite(nomAffiche) {
  if (!nomAffiche) return;
  ecrireParametres({ identite: nomAffiche });
}

/** Met à jour `parametres.json` de façon atomique (fichier temporaire puis renommage) : un
 * arrêt brutal pendant l'écriture ne peut jamais laisser un fichier vide ou tronqué. */
function ecrireParametres(maj) {
  const parametres = { ...lireParametres(), ...maj };
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  const temporaire = fichierParametres() + ".tmp";
  fs.writeFileSync(temporaire, JSON.stringify(parametres, null, 2), "utf-8");
  fs.renameSync(temporaire, fichierParametres());
  return parametres;
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

/** Carnet interne des soldes bancaires (décision du 03/10/2026) : dans le dossier de travail. */
function dossierCarnet() {
  return path.join(dossierTravail(), "Carnet");
}

/** Table « 15 comptes par agence » (décision du 05/10/2026), construite une fois pour
 * toutes depuis des dossiers de référence (voir agences:construireTable) puis utilisée à
 * chaque classement pour reconnaître une liste de comptes sans dépendre de son nom. */
function fichierTableComptes() {
  // Emplacement fixe (décision du 06/10/2026) : la table ne dépend pas du dossier de travail,
  // qui peut changer ; elle reste dans Documents\Orisflow\Config (jamais versionnée).
  const racine = modeAutotest ? app.getPath("temp") : app.getPath("documents");
  return path.join(racine, "Orisflow", "Config", "comptes_par_agence.json");
}

/** Résumé de la table de reconnaissance, pour l'afficher dans Paramètres sans relancer
 * le moteur (lecture directe du fichier de configuration). */
function lireTableComptesInfo() {
  try {
    const donnees = JSON.parse(fs.readFileSync(fichierTableComptes(), "utf-8"));
    const agences = donnees.agences && typeof donnees.agences === "object" ? donnees.agences : {};
    return {
      existe: true,
      construiteLe: donnees.construite_le || null,
      joursDeReference: donnees.jours_de_reference || [],
      agences: Object.fromEntries(Object.entries(agences).map(([cle, comptes]) => [cle, comptes.length])),
    };
  } catch {
    return { existe: false, construiteLe: null, joursDeReference: [], agences: {} };
  }
}

/** Résumé du carnet des soldes, pour l'afficher dans Paramètres (lecture directe, même
 * fichier que celui que le moteur Python lit/écrit — voir orisflow_engine/carnet.py). */
function lireCarnetInfo() {
  try {
    const donnees = JSON.parse(fs.readFileSync(path.join(dossierCarnet(), "soldes_bancaires.json"), "utf-8"));
    const jours = Object.keys(donnees).sort();
    const comptesConnus = new Set();
    for (const jour of jours) {
      for (const compte of Object.keys(donnees[jour] || {})) comptesConnus.add(compte);
    }
    return { existe: jours.length > 0, dernierJour: jours.at(-1) || null, nombreJours: jours.length, nombreComptes: comptesConnus.size };
  } catch {
    return { existe: false, dernierJour: null, nombreJours: 0, nombreComptes: 0 };
  }
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

// Processus du moteur en cours, pour pouvoir les arrêter (bouton « Annuler ») et pour ne
// jamais laisser un moteur bloqué figer l'écran indéfiniment.
const processusMoteur = new Set();
const DELAI_MOTEUR_MS = 15 * 60 * 1000;

/**
 * Lance le moteur, lui envoie les paramètres en JSON et relaie ses messages.
 * Retourne le résultat final, ou lève une erreur en français. Arrêté au bout de
 * `delaiMs` (15 minutes par défaut) ou sur demande (`annulerMoteur`).
 */
function lancerMoteur(commande, parametres, surEvenement, { delaiMs = DELAI_MOTEUR_MS } = {}) {
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
    let arret = null; // "delai" | "annulation"
    processusMoteur.add(processus);
    processus.arreter = (motif) => {
      arret = motif;
      processus.kill();
    };
    const minuterie = setTimeout(() => processus.arreter("delai"), delaiMs);

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
      clearTimeout(minuterie);
      processusMoteur.delete(processus);
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
      clearTimeout(minuterie);
      processusMoteur.delete(processus);
      traiterLigne(tampon);
      if (arret === "annulation") reject(new Error("Opération annulée."));
      else if (arret === "delai") reject(new Error("Le traitement a pris trop de temps et a été arrêté. Réessayez ; si le problème persiste, vérifiez les fichiers importés."));
      else if (resultat) resolve(resultat);
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

/** Les commandes ne sont accessibles qu'avec une session ouverte : la connexion protège
 * aussi le processus principal, pas seulement l'affichage. */
function exigerSession() {
  if (!sessionCourante) throw new Error("Votre session n'est plus ouverte : reconnectez-vous.");
}

function avecSession(traitement) {
  return (...args) => {
    exigerSession();
    return traitement(...args);
  };
}

function dossierResultats() {
  return path.join(dossierTravail(), "Resultats");
}

function dossierCache() {
  return path.join(dossierTravail(), "Cache");
}

const EXTENSIONS_IMPORT = new Set([".xls", ".xlsx", ".pdf"]);

/** Fichiers importables d'un dossier et de ses sous-dossiers (les fichiers temporaires
 * d'Excel `~$…` sont ignorés). */
function fichiersDuDossier(dossier, profondeur = 0) {
  if (profondeur > 6) return [];
  let entrees;
  try {
    entrees = fs.readdirSync(dossier, { withFileTypes: true });
  } catch {
    return [];
  }
  const trouves = [];
  for (const entree of entrees) {
    const chemin = path.join(dossier, entree.name);
    if (entree.isDirectory()) trouves.push(...fichiersDuDossier(chemin, profondeur + 1));
    else if (EXTENSIONS_IMPORT.has(path.extname(entree.name).toLowerCase()) && !entree.name.startsWith("~$")) {
      trouves.push(chemin);
    }
  }
  return trouves;
}

/** Vrai seulement pour un classeur produit par Orisflow (dans le dossier Résultats) : rien
 * d'autre ne peut être ouvert depuis l'interface. */
function estClasseurGenere(chemin) {
  if (typeof chemin !== "string") return false;
  const resolu = path.resolve(chemin);
  const racine = path.resolve(dossierResultats()) + path.sep;
  return resolu.toLowerCase().startsWith(racine.toLowerCase()) && path.extname(resolu).toLowerCase() === ".xlsx" && fs.existsSync(resolu);
}

function enregistrerCommunications() {
  ipcMain.handle("fichiers:choisirDossier", avecSession(async (evenement) => {
    const fenetre = BrowserWindow.fromWebContents(evenement.sender);
    const dernier = lireParametres().dernierDossierImport;
    const choix = await dialog.showOpenDialog(fenetre, {
      title: "Choisir le dossier des fichiers du jour (sous-dossiers compris)",
      properties: ["openDirectory"],
      defaultPath: dernier && fs.existsSync(dernier) ? dernier : undefined,
    });
    if (choix.canceled || choix.filePaths.length === 0) return [];
    // On mémorise le dossier parent : le lendemain, le dossier du nouveau jour sera à côté.
    ecrireParametres({ dernierDossierImport: path.dirname(choix.filePaths[0]) });
    return decrireFichiers(fichiersDuDossier(choix.filePaths[0]));
  }));

  ipcMain.handle("moteur:annuler", avecSession(() => {
    for (const processus of processusMoteur) processus.arreter("annulation");
    return true;
  }));

  ipcMain.handle("resultats:ouvrir", avecSession(async (_evenement, chemin, mode) => {
    if (!estClasseurGenere(chemin)) return { ok: false, erreur: "Ce fichier ne peut pas être ouvert depuis Orisflow." };
    if (mode === "dossier") {
      shell.showItemInFolder(path.resolve(chemin));
      return { ok: true };
    }
    const erreur = await shell.openPath(path.resolve(chemin));
    return erreur ? { ok: false, erreur: `Le classeur n'a pas pu être ouvert : ${erreur}` } : { ok: true };
  }));

  ipcMain.handle("historique:lister", avecSession(() => {
    const dossier = dossierResultats();
    let noms = [];
    try {
      noms = fs.readdirSync(dossier).filter((n) => n.toLowerCase().endsWith(".xlsx") && !n.startsWith("~$"));
    } catch {
      return [];
    }
    return noms
      .map((nom) => {
        const chemin = path.join(dossier, nom);
        const infos = fs.statSync(chemin);
        return { nom, chemin, modifieLe: infos.mtime.toISOString(), taille: infos.size };
      })
      .sort((a, b) => (a.modifieLe < b.modifieLe ? 1 : -1))
      .slice(0, 100);
  }));

  ipcMain.handle("fichiers:choisir", avecSession(async (evenement) => {
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
  }));

  ipcMain.handle("fichiers:decrire", avecSession((_evenement, chemins) => decrireFichiers(chemins)));

  ipcMain.handle("moteur:tester", avecSession(async (evenement) =>
    lancerMoteur("diagnostic", { fichierTableComptes: fichierTableComptes(), dossierTravail: dossierTravail() }, (message) => {
      evenement.sender.send("moteur:evenement", message);
    }),
  ));

  ipcMain.handle("agences:tableComptesInfo", () => lireTableComptesInfo());

  ipcMain.handle("agences:construireTable", avecSession(async (evenement) => {
    const fenetre = BrowserWindow.fromWebContents(evenement.sender);
    const choix = await dialog.showOpenDialog(fenetre, {
      title: "Choisir les dossiers de référence (un par jour, fichiers déjà nommés par agence)",
      properties: ["openDirectory", "multiSelections"],
    });
    if (choix.canceled || choix.filePaths.length === 0) return null;
    return lancerMoteur("table_comptes_construire", {
      dossiers: choix.filePaths,
      fichierSortie: fichierTableComptes(),
    });
  }));

  ipcMain.handle("carnet:info", () => lireCarnetInfo());

  ipcMain.handle("carnet:importerClasseur", avecSession(async (evenement) => {
    const fenetre = BrowserWindow.fromWebContents(evenement.sender);
    const choix = await dialog.showOpenDialog(fenetre, {
      title: "Choisir un classeur de trésorerie déjà validé comme correct",
      properties: ["openFile"],
      filters: [{ name: "Classeurs Excel", extensions: ["xlsx", "xlsm"] }],
    });
    if (choix.canceled || choix.filePaths.length === 0) return null;
    return lancerMoteur("carnet_importer_classeur", {
      cheminClasseur: choix.filePaths[0],
      dossierCarnet: dossierCarnet(),
    });
  }));

  ipcMain.handle("moteur:classer", avecSession(async (evenement, chemins, agencesManuelles) =>
    lancerMoteur(
      "classer",
      {
        fichiers: chemins,
        dossierReference: dossierReference() || null,
        agencesManuelles: agencesManuelles || null,
        dossierCarnet: dossierCarnet(),
        // Table « 15 comptes par agence » (décision du 05/10/2026) : fichier de configuration local.
        fichierTableComptes: fichierTableComptes(),
        dossierCache: dossierCache(),
      },
      (message) => {
        evenement.sender.send("moteur:evenement", message);
      },
    ),
  ));

  ipcMain.handle("moteur:generer", avecSession(async (evenement, chemins, valeursManuelles, relevesSaisis) => {
    const racine = preparerDossiers();
    const resultat = await lancerMoteur(
      "generer",
      {
        fichiers: chemins,
        dossierReference: dossierReference() || null,
        dossierSortie: path.join(racine, "Resultats"),
        valeursManuelles: valeursManuelles || null,
        dossierCarnet: dossierCarnet(),
        relevesSaisis: relevesSaisis || null,
        fichierTableComptes: fichierTableComptes(),
        dossierCache: dossierCache(),
      },
      (message) => {
        evenement.sender.send("moteur:evenement", message);
      },
    );
    // Traçabilité (06/10/2026) : chaque classeur produit est consigné avec son auteur —
    // demande explicite, indépendante du reste du résultat renvoyé à l'interface.
    if (resultat && resultat.ok) {
      journal.consignerEvenement(dossierJournal(), {
        utilisateur: sessionCourante,
        action: "generation_classeur",
        details: {
          cheminGenere: resultat.chemin_genere,
          date: resultat.date,
          modeleUtilise: resultat.modele_utilise,
          agencesComptes: resultat.agences_mises_a_jour,
          agencesBalances: resultat.agences_balance_mises_a_jour,
          agencesBanques: resultat.agences_banques_mises_a_jour,
          agencesCaisses: resultat.agences_caisses_mises_a_jour,
        },
      });
    }
    return resultat;
  }));

  // Export du rapport d'analyse en Excel (10/10/2026) : les données viennent telles quelles
  // de l'écran (résultat déjà reçu de « classer »), le moteur se contente de les écrire —
  // aucune nouvelle lecture des fichiers sources, aucune règle ici.
  ipcMain.handle("rapport:exporter", avecSession(async (evenement, fichiers, journalEtapes) => {
    const fenetre = BrowserWindow.fromWebContents(evenement.sender);
    const racine = preparerDossiers();
    const horodatage = new Date();
    const deuxChiffres = (n) => String(n).padStart(2, "0");
    const nomSuggere =
      `Rapport-analyse-${deuxChiffres(horodatage.getDate())}-${deuxChiffres(horodatage.getMonth() + 1)}-` +
      `${horodatage.getFullYear()}-${deuxChiffres(horodatage.getHours())}h${deuxChiffres(horodatage.getMinutes())}.xlsx`;
    const choix = await dialog.showSaveDialog(fenetre, {
      title: "Enregistrer le rapport d'analyse",
      defaultPath: path.join(racine, "Resultats", nomSuggere),
      filters: [{ name: "Classeur Excel", extensions: ["xlsx"] }],
    });
    if (choix.canceled || !choix.filePath) return null;
    return lancerMoteur("rapport_exporter", {
      fichiers: fichiers || [],
      journalEtapes: journalEtapes || null,
      chemin: choix.filePath,
    });
  }));

  // --- Authentification -----------------------------------------------------------

  ipcMain.handle("auth:etat", () => ({
    premierLancement: !auth.aUnCompte(fichierComptes()),
    comptesIllisibles: auth.comptesIllisibles(fichierComptes()),
    utilisateurConnecte: sessionCourante,
  }));

  ipcMain.handle("auth:creerCompteInitial", (_evenement, donnees) => {
    if (auth.aUnCompte(fichierComptes())) {
      return { ok: false, erreur: "Un compte administrateur existe déjà." };
    }
    const resultat = auth.creerCompte(fichierComptes(), { ...donnees, role: "admin" });
    if (resultat.ok) {
      sessionCourante = resultat.utilisateur;
      synchroniserIdentite(resultat.utilisateur.nomAffiche);
      journal.consignerEvenement(dossierJournal(), { utilisateur: sessionCourante, action: "creation_compte_admin" });
    }
    return resultat;
  });

  ipcMain.handle("auth:connecter", (_evenement, identifiant, motDePasse) => {
    const resultat = auth.connecter(fichierComptes(), identifiant, motDePasse);
    if (resultat.ok) {
      sessionCourante = resultat.utilisateur;
      synchroniserIdentite(resultat.utilisateur.nomAffiche);
      journal.consignerEvenement(dossierJournal(), { utilisateur: sessionCourante, action: "connexion" });
    }
    return resultat;
  });

  ipcMain.handle("auth:deconnecter", () => {
    if (sessionCourante) {
      journal.consignerEvenement(dossierJournal(), { utilisateur: sessionCourante, action: "deconnexion" });
    }
    sessionCourante = null;
    return true;
  });

  function exigerAdmin() {
    if (!sessionCourante || sessionCourante.role !== "admin") {
      return { ok: false, erreur: "Réservé à l'administrateur." };
    }
    return null;
  }

  ipcMain.handle("auth:listerUtilisateurs", () => {
    const refus = exigerAdmin();
    if (refus) return refus;
    return { ok: true, utilisateurs: auth.lireComptes(fichierComptes()).utilisateurs.map(auth.versPublic) };
  });

  ipcMain.handle("auth:creerUtilisateur", (_evenement, donnees) => {
    const refus = exigerAdmin();
    if (refus) return refus;
    const resultat = auth.creerCompte(fichierComptes(), donnees);
    if (resultat.ok) {
      journal.consignerEvenement(dossierJournal(), {
        utilisateur: sessionCourante,
        action: "creation_utilisateur",
        details: { identifiantCree: resultat.utilisateur.identifiant, role: resultat.utilisateur.role },
      });
    }
    return resultat;
  });

  ipcMain.handle("auth:supprimerUtilisateur", (_evenement, identifiant) => {
    const refus = exigerAdmin();
    if (refus) return refus;
    if (String(identifiant || "").trim().toLowerCase() === String(sessionCourante.identifiant).trim().toLowerCase()) {
      return { ok: false, erreur: "Vous ne pouvez pas supprimer le compte avec lequel vous êtes connecté." };
    }
    const resultat = auth.supprimerCompte(fichierComptes(), identifiant);
    if (resultat.ok) {
      journal.consignerEvenement(dossierJournal(), {
        utilisateur: sessionCourante,
        action: "suppression_utilisateur",
        details: { identifiantSupprime: identifiant },
      });
    }
    return resultat;
  });

  ipcMain.handle("auth:reinitialiserMotDePasse", (_evenement, identifiant, nouveauMotDePasse) => {
    const refus = exigerAdmin();
    if (refus) return refus;
    const resultat = auth.reinitialiserMotDePasse(fichierComptes(), identifiant, nouveauMotDePasse);
    if (resultat.ok) {
      journal.consignerEvenement(dossierJournal(), {
        utilisateur: sessionCourante,
        action: "reinitialisation_mot_de_passe",
        details: { identifiantCible: identifiant },
      });
    }
    return resultat;
  });

  ipcMain.handle("journal:lister", (_evenement, filtres) => {
    const refus = exigerAdmin();
    if (refus) return refus;
    // 500 évènements au plus par affichage : le journal grossit chaque jour.
    return { ok: true, evenements: journal.listerEvenements(dossierJournal(), { limite: 500, ...(filtres || {}) }) };
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

  ipcMain.handle("parametres:choisirDossier", avecSession(async (evenement) => {
    const fenetre = BrowserWindow.fromWebContents(evenement.sender);
    const choix = await dialog.showOpenDialog(fenetre, {
      title: "Choisir le dossier de travail d'Orisflow",
      properties: ["openDirectory", "createDirectory"],
    });
    if (choix.canceled || choix.filePaths.length === 0) return dossierTravail();
    const parametres = ecrireParametres({ dossierTravail: choix.filePaths[0] });
    preparerDossiers();
    return parametres.dossierTravail;
  }));

  ipcMain.handle("parametres:ouvrirDossier", avecSession(async () => {
    const racine = preparerDossiers();
    await shell.openPath(racine);
    return racine;
  }));

  ipcMain.handle("parametres:choisirDossierReference", avecSession(async (evenement) => {
    const fenetre = BrowserWindow.fromWebContents(evenement.sender);
    const choix = await dialog.showOpenDialog(fenetre, {
      title: "Choisir le dossier des classeurs de trésorerie (pour comparer avec la veille)",
      properties: ["openDirectory"],
    });
    if (choix.canceled || choix.filePaths.length === 0) return dossierReference();
    const parametres = ecrireParametres({ dossierReference: choix.filePaths[0] });
    return parametres.dossierReference;
  }));

  ipcMain.handle("parametres:choisirDossierBordereau", async (evenement) => {
    const fenetre = BrowserWindow.fromWebContents(evenement.sender);
    const choix = await dialog.showOpenDialog(fenetre, {
      title: "Choisir le dossier réseau partagé de Suivi Courrier",
      properties: ["openDirectory", "createDirectory"],
    });
    if (choix.canceled || choix.filePaths.length === 0) return dossierBordereau();
    const parametres = ecrireParametres({ dossierBordereau: choix.filePaths[0] });
    return parametres.dossierBordereau;
  });

  ipcMain.handle("identite:definir", (_evenement, nom) => {
    const parametres = ecrireParametres({ identite: (nom || "").trim() });
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
  // Aucune nouvelle fenêtre, aucune navigation hors de l'application.
  fenetre.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  fenetre.webContents.on("will-navigate", (evenement, url) => {
    if (!url.startsWith("file://")) evenement.preventDefault();
  });
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
