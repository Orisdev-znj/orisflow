"""Référentiels du module « Téléverser sur CloudBank » (portage du skill, 10/10/2026).

Deux emplacements, jamais mélangés :
- les données PAR DÉFAUT, embarquées dans l'exécutable (`cloudbank_donnees/`), jamais modifiées ;
- une copie MODIFIABLE dans `<dossier de travail>/CloudBank/Reférences/`, créée au premier
  usage. C'est elle que le moteur lit et enrichit (aucun chemin écrit en dur).

Le moteur ne fait aucun appel réseau et ne devine jamais un compte : voir `cloudbank_mapping`.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import sys
import unicodedata

from .chemins import chemin_lecture

FICHIERS_REFERENTIELS = (
    "agences.json",
    "agences_468.json",
    "cloudbank_comptes.json",
    "comptes_par_agence.json",
    "fonctions_personnel.json",
    "mappings_valides.json",
    "modeles.json",
    "natures_comptes.json",
    "pcemf_comptes.json",
    "regles_motscles.json",
)


class ErreurCloudBank(ValueError):
    """Erreur lisible par un comptable (affichée telle quelle dans l'interface)."""


def dossier_donnees_par_defaut() -> str:
    base = getattr(sys, "_MEIPASS", None) or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, "orisflow_engine", "cloudbank_donnees")


def preparer_references(dossier_references: str | None) -> str:
    """Retourne le dossier à lire. Sans dossier configuré : les données embarquées, en lecture
    seule. Sinon : copie modifiable, créée au besoin (un fichier déjà présent n'est jamais écrasé)."""
    defaut = dossier_donnees_par_defaut()
    if not dossier_references:
        return defaut
    os.makedirs(chemin_lecture(dossier_references), exist_ok=True)
    for nom in FICHIERS_REFERENTIELS:
        cible = os.path.join(dossier_references, nom)
        if not os.path.exists(chemin_lecture(cible)):
            shutil.copyfile(os.path.join(defaut, nom), chemin_lecture(cible))
    return dossier_references


def normaliser(texte) -> str:
    """Minuscules, sans accents ni ponctuation : sert à comparer les libellés."""
    t = unicodedata.normalize("NFKD", str(texte or ""))
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    t = re.sub(r"[^a-z0-9]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def _lire_json(dossier: str, nom: str):
    with open(chemin_lecture(os.path.join(dossier, nom)), encoding="utf-8") as f:
        return json.load(f)


class Referentiels:
    def __init__(self, dossier_references: str | None = None) -> None:
        self.dossier = preparer_references(dossier_references)
        self.copie_modifiable = bool(dossier_references)
        lire = lambda nom: _lire_json(self.dossier, nom)  # noqa: E731
        self.modeles = lire("modeles.json")
        self.cloudbank = {c["code"]: c for c in lire("cloudbank_comptes.json")}
        self.pcemf = lire("pcemf_comptes.json")
        self.mappings = {normaliser(m["libelle"]): m for m in lire("mappings_valides.json")}
        self.regles = lire("regles_motscles.json")["regles"]
        self.natures = {k: v for k, v in lire("natures_comptes.json").items() if not k.startswith("_")}
        self.agences_468 = {k: v for k, v in lire("agences_468.json").items() if not k.startswith("_")}
        self.comptes_par_agence = {k: v for k, v in lire("comptes_par_agence.json").items() if not k.startswith("_")}
        self.agences = {k: v for k, v in lire("agences.json").items() if not k.startswith("_")}

        # Comptes déjà résolus, PAR AGENCE (jamais toutes agences confondues : deux agences peuvent
        # avoir confirmé le même numéro par coïncidence, ex. le 468 de Balessing et de Kousseri
        # valent tous deux 4680000000001 — ça ne doit pas dispenser Ndogpassi de l'avertissement).
        self.comptes_deja_resolus_par_agence: dict[str, set[str]] = {}
        for variantes in self.comptes_par_agence.values():
            for code_agence, compte_reel in variantes.items():
                self.comptes_deja_resolus_par_agence.setdefault(code_agence, set()).add(compte_reel)

        # Comptes « gérés » par le mapping (sources possibles d'un compte générique du Siège, donc
        # concernés par la résolution par agence). Un compte absent de cet ensemble (compte client,
        # TVA, compte produit fournis tels quels) n'a jamais besoin de résolution : l'avertissement
        # serait du bruit, pas un vrai doute.
        self.comptes_geres: set[str] = {m["compte"] for m in lire("mappings_valides.json")}
        self.comptes_geres.update(r["compte"] for r in self.regles)
        for modele in self.modeles.values():
            if "contrepartie" in modele:
                self.comptes_geres.add(modele["contrepartie"]["compte"])
            if "retour_caisse" in modele:
                self.comptes_geres.add(modele["retour_caisse"]["compte_debit"])
                self.comptes_geres.add(modele["retour_caisse"]["compte_credit"])
        self.fonctions = [normaliser(f) for f in lire("fonctions_personnel.json")["fonctions"]]
        for regle in self.regles:
            regle["_mots"] = [normaliser(m) for m in regle["mots_cles"]]
            regle["_exclus"] = [normaliser(m) for m in regle["mots_exclus"]]
            regle["compte_present"] = regle["compte"] in self.cloudbank

    def code_agence(self, nom: str | None) -> str | None:
        """Code agence d'après son nom (« MARCHE CENTRAL » → 20002), None si inconnu."""
        cible = normaliser(nom)
        for code, libelle in self.agences.items():
            if normaliser(libelle) == cible:
                return code
        return None


def ajouter_mapping_valide(ref: Referentiels, libelle: str, compte: str, intitule: str) -> bool:
    """Ajoute une écriture validée à `mappings_valides.json` de la COPIE modifiable (jamais aux
    données embarquées). Retourne False si le libellé existe déjà ou si aucune copie modifiable
    n'est configurée. Appelée seulement sur demande explicite de l'utilisateur."""
    if not ref.copie_modifiable or normaliser(libelle) in ref.mappings:
        return False
    chemin = chemin_lecture(os.path.join(ref.dossier, "mappings_valides.json"))
    with open(chemin, encoding="utf-8") as f:
        donnees = json.load(f)
    donnees.append({"libelle": libelle, "compte": compte, "intitule": intitule, "valide": True,
                    "source": "confirmé dans Orisflow"})
    with open(chemin, "w", encoding="utf-8") as f:
        json.dump(donnees, f, ensure_ascii=False, indent=2)
    ref.mappings[normaliser(libelle)] = donnees[-1]
    return True
