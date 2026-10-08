// Journal des actions des utilisateurs (version 1.1.0) : qui a fait quoi, et quand.
//
// Même principe que Suivi Courrier (`bordereau.py`) : un fichier par évènement, jamais de
// modification d'un fichier existant. Pensé pour rester fiable même si ce dossier devient un
// jour un dossier réseau partagé entre plusieurs postes (le réseau ORIS est câblé en Ethernet) :
// deux postes qui écrivent en même temps créent chacun leur fichier, sans jamais se gêner,
// contrairement à un seul gros fichier qu'il faudrait relire puis réécrire en entier.
//
// Module indépendant d'Electron (comme auth.cjs) : il ne connaît qu'un chemin de dossier,
// jamais en dur, passé par l'appelant.

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function consignerEvenement(dossierJournal, { utilisateur, action, details }) {
  fs.mkdirSync(dossierJournal, { recursive: true });
  const horodatage = new Date().toISOString();
  const nomFichier = `evenement_${horodatage.replace(/[:.]/g, "-")}_${crypto.randomBytes(4).toString("hex")}.json`;
  const evenement = {
    horodatage,
    utilisateur: utilisateur ? utilisateur.identifiant : null,
    nomAffiche: utilisateur ? utilisateur.nomAffiche : null,
    action,
    details: details || {},
  };
  const chemin = path.join(dossierJournal, nomFichier);
  const temporaire = chemin + ".tmp";
  fs.writeFileSync(temporaire, JSON.stringify(evenement, null, 2), "utf-8");
  fs.renameSync(temporaire, chemin); // écriture atomique : jamais de fichier à moitié écrit
  return evenement;
}

/** `filtres.utilisateur` et `filtres.action` filtrent sur une égalité exacte ; `filtres.limite`
 * coupe après les N plus récents. Un fichier corrompu ou à moitié écrit (ex. coupure de
 * courant) est ignoré, jamais une exception qui casserait la lecture du reste du journal. */
function listerEvenements(dossierJournal, filtres = {}) {
  if (!dossierJournal || !fs.existsSync(dossierJournal)) return [];
  let noms;
  try {
    noms = fs.readdirSync(dossierJournal).filter((n) => n.startsWith("evenement_") && n.endsWith(".json"));
  } catch {
    return [];
  }
  const evenements = [];
  for (const nom of noms) {
    try {
      evenements.push(JSON.parse(fs.readFileSync(path.join(dossierJournal, nom), "utf-8")));
    } catch {
      // Fichier illisible : ignoré.
    }
  }
  evenements.sort((a, b) => (a.horodatage < b.horodatage ? 1 : -1)); // le plus récent d'abord
  let resultat = evenements;
  if (filtres.utilisateur) resultat = resultat.filter((e) => e.utilisateur === filtres.utilisateur);
  if (filtres.action) resultat = resultat.filter((e) => e.action === filtres.action);
  if (filtres.limite) resultat = resultat.slice(0, filtres.limite);
  return resultat;
}

module.exports = { consignerEvenement, listerEvenements };
