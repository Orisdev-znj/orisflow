"""Carnet interne des soldes bancaires (décision du 03/10/2026, option A).

Orisflow consigne chaque jour le solde de chaque compte bancaire suivi, dans un petit fichier
JSON interne (dossier de travail, jamais partagé). Il sert le lendemain quand un relevé
manque : l'utilisateur peut alors choisir « utiliser la valeur de la veille ».

Structure : { "AAAA-MM-JJ": { "cca:12": 186412276, "afriland:65": 134381673, ... } }
Écriture atomique (fichier temporaire puis renommage), comme le bordereau.
"""

from __future__ import annotations

import json
import os
from datetime import date
from typing import Optional

NOM_FICHIER = "soldes_bancaires.json"


def lire(chemin: str) -> dict[str, dict[str, int]]:
    """Retourne le carnet complet, ou un dictionnaire vide si absent ou illisible."""
    if not chemin or not os.path.isfile(chemin):
        return {}
    try:
        with open(chemin, "r", encoding="utf-8") as fichier:
            donnees = json.load(fichier)
    except (OSError, json.JSONDecodeError):
        return {}
    return donnees if isinstance(donnees, dict) else {}


def valeur_de_la_veille(carnet: dict[str, dict[str, int]], cle: str, jour: date) -> Optional[int]:
    """Dernier solde connu de `cle` strictement antérieur à `jour`."""
    anterieurs = sorted(d for d in carnet if d < jour.isoformat() and cle in carnet[d])
    return carnet[anterieurs[-1]][cle] if anterieurs else None


def enregistrer(chemin: str, jour: date, soldes: dict[str, int]) -> None:
    """Ajoute ou remplace les soldes du jour, sans toucher aux autres jours."""
    if not chemin or not soldes:
        return
    carnet = lire(chemin)
    carnet.setdefault(jour.isoformat(), {}).update(soldes)
    os.makedirs(os.path.dirname(chemin) or ".", exist_ok=True)
    temporaire = chemin + ".tmp"
    with open(temporaire, "w", encoding="utf-8") as fichier:
        json.dump(carnet, fichier, ensure_ascii=False, indent=2, sort_keys=True)
    os.replace(temporaire, chemin)
