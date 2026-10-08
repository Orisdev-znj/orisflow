// Passerelle sécurisée entre l'interface (React) et le processus principal.
const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("orisflow", {
  etatAuth: () => ipcRenderer.invoke("auth:etat"),
  creerCompteInitial: (donnees) => ipcRenderer.invoke("auth:creerCompteInitial", donnees),
  connecter: (identifiant, motDePasse) => ipcRenderer.invoke("auth:connecter", identifiant, motDePasse),
  deconnecter: () => ipcRenderer.invoke("auth:deconnecter"),
  listerUtilisateurs: () => ipcRenderer.invoke("auth:listerUtilisateurs"),
  creerUtilisateur: (donnees) => ipcRenderer.invoke("auth:creerUtilisateur", donnees),
  supprimerUtilisateur: (identifiant) => ipcRenderer.invoke("auth:supprimerUtilisateur", identifiant),
  reinitialiserMotDePasse: (identifiant, nouveauMotDePasse) =>
    ipcRenderer.invoke("auth:reinitialiserMotDePasse", identifiant, nouveauMotDePasse),
  listerJournal: (filtres) => ipcRenderer.invoke("journal:lister", filtres),
  choisirFichiers: () => ipcRenderer.invoke("fichiers:choisir"),
  // Fichiers glissés dans la fenêtre : on récupère leur chemin réel.
  decrireFichiersDeposes: (fichiers) => {
    const chemins = Array.from(fichiers).map((f) => webUtils.getPathForFile(f)).filter(Boolean);
    return ipcRenderer.invoke("fichiers:decrire", chemins);
  },
  testerMoteur: () => ipcRenderer.invoke("moteur:tester"),
  lireTableComptesInfo: () => ipcRenderer.invoke("agences:tableComptesInfo"),
  construireTableComptes: () => ipcRenderer.invoke("agences:construireTable"),
  lireCarnetInfo: () => ipcRenderer.invoke("carnet:info"),
  importerClasseurCarnet: () => ipcRenderer.invoke("carnet:importerClasseur"),
  classer: (chemins, agencesManuelles) => ipcRenderer.invoke("moteur:classer", chemins, agencesManuelles),
  generer: (chemins, valeursManuelles, relevesSaisis) =>
    ipcRenderer.invoke("moteur:generer", chemins, valeursManuelles, relevesSaisis),
  surEvenementMoteur: (rappel) => {
    const ecouteur = (_evenement, message) => rappel(message);
    ipcRenderer.on("moteur:evenement", ecouteur);
    return () => ipcRenderer.removeListener("moteur:evenement", ecouteur);
  },
  lireParametres: () => ipcRenderer.invoke("parametres:lire"),
  choisirDossierTravail: () => ipcRenderer.invoke("parametres:choisirDossier"),
  choisirDossierReference: () => ipcRenderer.invoke("parametres:choisirDossierReference"),
  ouvrirDossierTravail: () => ipcRenderer.invoke("parametres:ouvrirDossier"),
  choisirDossierBordereau: () => ipcRenderer.invoke("parametres:choisirDossierBordereau"),
  definirIdentite: (nom) => ipcRenderer.invoke("identite:definir", nom),
  bordereauChoisirPieceJointe: () => ipcRenderer.invoke("bordereau:choisirPieceJointe"),
  bordereauCreer: (donnees) => ipcRenderer.invoke("bordereau:creer", donnees),
  bordereauEvenement: (donnees) => ipcRenderer.invoke("bordereau:evenement", donnees),
  bordereauLister: () => ipcRenderer.invoke("bordereau:lister"),
});
