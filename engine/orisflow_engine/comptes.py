"""Comptage des comptes clients, repris à l'identique du script actuel.

Source : `remplissage_tresorerie.py`, fonctions `classer_compte` et `compter_comptes`,
lu en entier le 26/09/2026. Reprise volontairement identique, y compris le double
comptage connu des comptes fonctionnaires (voir CLAUDE.md, zones d'ombre acceptées,
26/09/2026) : Orisflow doit d'abord se comporter comme la production actuelle avant
toute correction validée par la supervision comptable.

Sprint 3 (28/09/2026) ajoute un contrôle absent du script actuel : détection des
numéros de compte en double et des numéros mal formés, pour signaler (jamais
corriger silencieusement) un fichier suspect avant de l'utiliser.
"""

from __future__ import annotations

import re

import pandas as pd

TYPES_COMPTES = ("Courants", "Cheques", "Epargne", "Garanties", "Fonctionnaires")

# Format observé sur les exports réels : "37120-000064-35" (5 chiffres, tiret,
# 6 chiffres, tiret, 2 chiffres). Un numéro qui s'en écarte est signalé, mais
# reste classé sur ses 5 premiers chiffres si ceux-ci sont exploitables.
MOTIF_NUMERO_VALIDE = re.compile(r"^\d{5}-\d{6}-\d{2}$")


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


def _colonne_numero(df: pd.DataFrame) -> str:
    col_compte = next((c for c in df.columns if "numero" in str(c).lower()), None)
    if col_compte is None:
        raise ValueError("Colonne « Numero de compte » introuvable (en-tête ligne 24 attendue).")
    return col_compte


def compter_comptes(chemin) -> dict[str, int]:
    """Lit un fichier « *_Compte » et retourne le nombre de comptes par catégorie.

    Conservée pour compatibilité (comportement identique au script actuel) ;
    `analyser_comptes` ci-dessous ajoute les contrôles du sprint 3.
    """
    df = pd.read_excel(chemin, sheet_name=0, header=23, dtype=str)
    col_compte = _colonne_numero(df)
    df = df[[col_compte]].dropna()
    df["id5"] = df[col_compte].str.strip().str[:5]
    comptages = {t: 0 for t in TYPES_COMPTES}
    for id5 in df["id5"]:
        for t in classer_compte(id5):
            comptages[t] += 1
    return comptages


def analyser_comptes(chemin) -> dict:
    """Version enrichie (sprint 3) : comptages + doublons + numéros mal formés.

    Retour :
        {
            "comptages": {catégorie: nombre, ...},
            "total_lignes": nombre de lignes lues (hors en-tête),
            "doublons": [numéro apparu plusieurs fois, ...],
            "mal_formes": [numéro qui ne respecte pas le format attendu, ...],
        }
    """
    df = pd.read_excel(chemin, sheet_name=0, header=23, dtype=str)
    col_compte = _colonne_numero(df)
    df = df[[col_compte]].dropna()
    numeros = df[col_compte].str.strip()

    comptages = {t: 0 for t in TYPES_COMPTES}
    mal_formes: list[str] = []
    for numero in numeros:
        for t in classer_compte(numero[:5]):
            comptages[t] += 1
        if not MOTIF_NUMERO_VALIDE.match(numero):
            mal_formes.append(numero)

    comptes_vus = numeros.value_counts()
    doublons = sorted(comptes_vus[comptes_vus > 1].index.tolist())

    return {
        "comptages": comptages,
        "total_lignes": len(numeros),
        "doublons": doublons,
        "mal_formes": mal_formes,
    }


def total_categorise(comptages: dict[str, int]) -> int:
    """Somme des catégories, telle qu'écrite en ligne 16 du classeur (double compte inclus)."""
    return sum(comptages.values())
