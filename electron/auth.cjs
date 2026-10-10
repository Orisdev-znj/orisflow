// Authentification d'Orisflow (version 1.1.0).
//
// Chaque utilisateur a un identifiant et un mot de passe. Les mots de passe ne sont
// jamais stockés en clair : seuls un sel aléatoire et le résultat d'un hachage (scrypt,
// fourni par Node, aucune dépendance supplémentaire) sont conservés. Le fichier de comptes
// vit hors du dépôt (dossier `userData` d'Electron, comme `parametres.json`) et n'est
// jamais versionné.
//
// Module volontairement indépendant d'Electron (aucun `require("electron")` ici) : il ne
// connaît qu'un chemin de fichier, passé par l'appelant — comme les modules du moteur
// Python ne connaissent jamais de chemin en dur. `main.cjs` lui fournit ce chemin et
// l'expose à l'interface via IPC.

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const TAILLE_HACHAGE = 64;
const LONGUEUR_MOT_DE_PASSE_MIN = 8;

// Protection minimale contre les essais répétés : après 5 échecs sur un même identifiant,
// une courte pause est imposée avant de pouvoir réessayer. Mémoire du processus seulement
// (remise à zéro à chaque lancement d'Orisflow, cohérent avec la session elle-même).
const MAX_ECHECS_AVANT_PAUSE = 5;
const DUREE_PAUSE_MS = 30_000;
const tentatives = new Map(); // identifiant (normalisé) -> { echecs, bloqueJusque }
const SEL_FACTICE = crypto.randomBytes(16).toString("hex");

function normaliserIdentifiant(identifiant) {
  return String(identifiant || "").trim().toLowerCase();
}

function genererSel() {
  return crypto.randomBytes(16).toString("hex");
}

function hacherMotDePasse(motDePasse, selHex) {
  return crypto.scryptSync(String(motDePasse), Buffer.from(selHex, "hex"), TAILLE_HACHAGE).toString("hex");
}

/** Comparaison à temps constant : évite qu'un attaquant mesure le temps de réponse pour
 * deviner le mot de passe caractère par caractère. */
function hachagesEgaux(a, b) {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function lireFichierComptes(chemin) {
  const donnees = JSON.parse(fs.readFileSync(chemin, "utf-8"));
  if (!donnees || !Array.isArray(donnees.utilisateurs)) throw new Error("structure inattendue");
  return { utilisateurs: donnees.utilisateurs };
}

/** Comptes enregistrés. Si le fichier est corrompu, la sauvegarde `.bak` (état précédent)
 * prend le relais ; si elle l'est aussi, `illisible` est vrai : le fichier existe mais ne peut
 * pas être lu. Il ne doit alors jamais être traité comme « aucun compte » — sinon l'écran de
 * premier lancement réapparaîtrait et créer un administrateur effacerait tous les comptes. */
function lireComptes(cheminComptes) {
  if (!cheminComptes || !fs.existsSync(cheminComptes)) return { utilisateurs: [], illisible: false };
  try {
    return { ...lireFichierComptes(cheminComptes), illisible: false };
  } catch {
    try {
      return { ...lireFichierComptes(cheminComptes + ".bak"), illisible: false };
    } catch {
      return { utilisateurs: [], illisible: true };
    }
  }
}

function enregistrerComptes(cheminComptes, donnees) {
  fs.mkdirSync(path.dirname(cheminComptes), { recursive: true });
  // Sauvegarde de l'état précédent, seulement s'il est lisible (jamais une copie corrompue).
  try {
    lireFichierComptes(cheminComptes);
    fs.copyFileSync(cheminComptes, cheminComptes + ".bak");
  } catch {
    /* pas encore de fichier, ou fichier illisible : on garde la sauvegarde existante */
  }
  const temporaire = cheminComptes + ".tmp";
  fs.writeFileSync(temporaire, JSON.stringify({ utilisateurs: donnees.utilisateurs }, null, 2), "utf-8");
  fs.renameSync(temporaire, cheminComptes);
}

const MESSAGE_COMPTES_ILLISIBLES =
  "Le fichier des comptes utilisateurs est illisible (et sa sauvegarde aussi). Aucune modification n'est possible : " +
  "contactez l'administrateur pour le restaurer.";

function versPublic(utilisateur) {
  return {
    identifiant: utilisateur.identifiant,
    nomAffiche: utilisateur.nomAffiche,
    role: utilisateur.role,
    creeLe: utilisateur.creeLe,
  };
}

/** Vrai dès qu'un fichier de comptes existe, même illisible : le premier lancement (création
 * libre d'un administrateur) n'est proposé que s'il n'y a réellement aucun fichier. */
function aUnCompte(cheminComptes) {
  const comptes = lireComptes(cheminComptes);
  return comptes.illisible || comptes.utilisateurs.length > 0;
}

function comptesIllisibles(cheminComptes) {
  return lireComptes(cheminComptes).illisible;
}

function nombreAdmins(utilisateurs) {
  return utilisateurs.filter((u) => u.role === "admin").length;
}

/** Crée un compte. `premierCompte` (réservé au tout premier lancement, sans session active)
 * force le rôle admin ; dans tous les autres cas, seul un administrateur déjà connecté peut
 * en créer un (vérifié par l'appelant, voir main.cjs), et le rôle est explicite. */
function creerCompte(cheminComptes, { identifiant, motDePasse, nomAffiche, role }) {
  const identifiantNormalise = normaliserIdentifiant(identifiant);
  if (!identifiantNormalise) {
    return { ok: false, erreur: "L'identifiant ne peut pas être vide." };
  }
  if (!motDePasse || String(motDePasse).length < LONGUEUR_MOT_DE_PASSE_MIN) {
    return { ok: false, erreur: `Le mot de passe doit contenir au moins ${LONGUEUR_MOT_DE_PASSE_MIN} caractères.` };
  }
  const comptes = lireComptes(cheminComptes);
  if (comptes.illisible) return { ok: false, erreur: MESSAGE_COMPTES_ILLISIBLES };
  if (comptes.utilisateurs.some((u) => normaliserIdentifiant(u.identifiant) === identifiantNormalise)) {
    return { ok: false, erreur: "Cet identifiant est déjà utilisé." };
  }
  const sel = genererSel();
  const utilisateur = {
    identifiant: String(identifiant).trim(),
    nomAffiche: (nomAffiche || identifiant || "").trim(),
    role: role === "admin" ? "admin" : "utilisateur",
    sel,
    hachage: hacherMotDePasse(motDePasse, sel),
    creeLe: new Date().toISOString(),
  };
  comptes.utilisateurs.push(utilisateur);
  enregistrerComptes(cheminComptes, comptes);
  return { ok: true, utilisateur: versPublic(utilisateur) };
}

function supprimerCompte(cheminComptes, identifiant) {
  const identifiantNormalise = normaliserIdentifiant(identifiant);
  const comptes = lireComptes(cheminComptes);
  if (comptes.illisible) return { ok: false, erreur: MESSAGE_COMPTES_ILLISIBLES };
  const cible = comptes.utilisateurs.find((u) => normaliserIdentifiant(u.identifiant) === identifiantNormalise);
  if (!cible) {
    return { ok: false, erreur: "Cet identifiant est introuvable." };
  }
  if (cible.role === "admin" && nombreAdmins(comptes.utilisateurs) <= 1) {
    return { ok: false, erreur: "Impossible de supprimer le dernier compte administrateur." };
  }
  comptes.utilisateurs = comptes.utilisateurs.filter((u) => normaliserIdentifiant(u.identifiant) !== identifiantNormalise);
  enregistrerComptes(cheminComptes, comptes);
  return { ok: true };
}

function reinitialiserMotDePasse(cheminComptes, identifiant, nouveauMotDePasse) {
  if (!nouveauMotDePasse || String(nouveauMotDePasse).length < LONGUEUR_MOT_DE_PASSE_MIN) {
    return { ok: false, erreur: `Le mot de passe doit contenir au moins ${LONGUEUR_MOT_DE_PASSE_MIN} caractères.` };
  }
  const identifiantNormalise = normaliserIdentifiant(identifiant);
  const comptes = lireComptes(cheminComptes);
  if (comptes.illisible) return { ok: false, erreur: MESSAGE_COMPTES_ILLISIBLES };
  const cible = comptes.utilisateurs.find((u) => normaliserIdentifiant(u.identifiant) === identifiantNormalise);
  if (!cible) {
    return { ok: false, erreur: "Cet identifiant est introuvable." };
  }
  cible.sel = genererSel();
  cible.hachage = hacherMotDePasse(nouveauMotDePasse, cible.sel);
  enregistrerComptes(cheminComptes, comptes);
  return { ok: true };
}

function connecter(cheminComptes, identifiant, motDePasse) {
  const identifiantNormalise = normaliserIdentifiant(identifiant);
  const etatTentatives = tentatives.get(identifiantNormalise);
  if (etatTentatives && etatTentatives.bloqueJusque > Date.now()) {
    const secondes = Math.ceil((etatTentatives.bloqueJusque - Date.now()) / 1000);
    return { ok: false, erreur: `Trop d'essais incorrects. Réessayez dans ${secondes} seconde(s).` };
  }

  const comptes = lireComptes(cheminComptes);
  if (comptes.illisible) return { ok: false, erreur: MESSAGE_COMPTES_ILLISIBLES };
  const utilisateur = comptes.utilisateurs.find((u) => normaliserIdentifiant(u.identifiant) === identifiantNormalise);
  // Message volontairement générique (identifiant ou mot de passe) : ne jamais révéler si
  // c'est l'identifiant qui n'existe pas ou le mot de passe qui est faux.
  const echec = { ok: false, erreur: "Identifiant ou mot de passe incorrect." };
  // Un hachage est calculé même pour un identifiant inconnu : sinon la réponse, plus rapide,
  // trahirait quels identifiants existent.
  const hachageCalcule = hacherMotDePasse(motDePasse, utilisateur ? utilisateur.sel : SEL_FACTICE);

  if (!utilisateur || !hachagesEgaux(hachageCalcule, utilisateur.hachage)) {
    const precedent = tentatives.get(identifiantNormalise) || { echecs: 0, bloqueJusque: 0 };
    const echecs = precedent.echecs + 1;
    const bloqueJusque = echecs >= MAX_ECHECS_AVANT_PAUSE ? Date.now() + DUREE_PAUSE_MS : 0;
    tentatives.set(identifiantNormalise, { echecs: bloqueJusque ? 0 : echecs, bloqueJusque });
    return echec;
  }

  tentatives.delete(identifiantNormalise);
  return { ok: true, utilisateur: versPublic(utilisateur) };
}

module.exports = {
  LONGUEUR_MOT_DE_PASSE_MIN,
  aUnCompte,
  comptesIllisibles,
  connecter,
  creerCompte,
  enregistrerComptes,
  hacherMotDePasse,
  hachagesEgaux,
  genererSel,
  lireComptes,
  nombreAdmins,
  reinitialiserMotDePasse,
  supprimerCompte,
  versPublic,
};
