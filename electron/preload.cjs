// Passerelle sécurisée entre l'interface (React) et le processus principal.
const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("orisflow", {
  choisirFichiers: () => ipcRenderer.invoke("fichiers:choisir"),
  // Fichiers glissés dans la fenêtre : on récupère leur chemin réel.
  decrireFichiersDeposes: (fichiers) => {
    const chemins = Array.from(fichiers).map((f) => webUtils.getPathForFile(f)).filter(Boolean);
    return ipcRenderer.invoke("fichiers:decrire", chemins);
  },
  testerMoteur: () => ipcRenderer.invoke("moteur:tester"),
  classer: (chemins) => ipcRenderer.invoke("moteur:classer", chemins),
  generer: (chemins) => ipcRenderer.invoke("moteur:generer", chemins),
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
