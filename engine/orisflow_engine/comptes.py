"""Comptage des comptes clients, repris à l'identique du script actuel.

Source : `remplissage_tresorerie.py`, fonctions `classer_compte` et `compter_comptes`,
lu en entier le 26/09/2026. Reprise volontairement identique, y compris le double
comptage connu des comptes fonctionnaires (voir CLAUDE.md, zones d'ombre acceptées,
26/09/2026) : Orisflow doit d'abord se comporter comme la production actuelle avant
toute correction validée par la supervision comptable.
"""

from __future__ import annotations

import pandas as pd

TYPES_COMPTES = ("Courants", "Cheques", "Epargne", "Garanties", "Fonctionnaires")


def classer_compte(identifiant_5: str) -> list[str]:
    types: list[str] = []
    prefix3 = identifiant_5[:3]
    if identifiant_5 in ("37110", "37120"):
        types.append("Courants")
    if prefix3 == "372":
        types.append("Cheques")
    if prefix3 == "373" or identifiant_5 == "37340":
        types.append("Epargne")
    if identifiant_5 == "37420":
        types.append("Garanties")
    if identifiant_5 == "37225":
        types.append("Fonctionnaires")
    return types


def compter_comptes(chemin) -> dict[str, int]:
    """Lit un fichier « *_Compte » et retourne le nombre de comptes par catégorie.

    Lève `ValueError` si la colonne « Numero de compte » est introuvable (en-tête
    ligne 24, comme dans le script actuel) : le fichier n'a probablement pas le
    format attendu.
    """
    df = pd.read_excel(chemin, sheet_name=0, header=23, dtype=str)
    col_compte = next((c for c in df.columns if "numero" in str(c).lower()), None)
    if col_compte is None:
        raise ValueError("Colonne « Numero de compte » introuvable (en-tête ligne 24 attendue).")
    df = df[[col_compte]].dropna()
    df["id5"] = df[col_compte].str.strip().str[:5]
    comptages = {t: 0 for t in TYPES_COMPTES}
    for id5 in df["id5"]:
        for t in classer_compte(id5):
            comptages[t] += 1
    return comptages


def total_categorise(comptages: dict[str, int]) -> int:
    """Somme des catégories, telle qu'écrite en ligne 16 du classeur (double compte inclus)."""
    return sum(comptages.values())
