"""Identification de l'agence d'une liste de comptes par ses numéros de compte.

Décision du 05/10/2026 : chaque agence possède des numéros de compte qui lui sont propres
(vérifié sur 17 556 comptes : aucun numéro n'apparaît dans deux agences). Une table de
15 comptes par agence, choisis dans les fichiers renommés de plusieurs jours (29/09, 30/09,
01/10), suffit à reconnaître l'agence d'un fichier brut, sans dépendre de son nom.

Règle : l'agence dont le plus de comptes figurent dans le fichier est retenue, à condition
d'en trouver au moins `SEUIL_COMPTES` (10 sur 15). En dessous, Orisflow ne décide pas seul :
le nom du fichier reste retenu, signalé à vérifier par l'utilisateur.

La table contient de vrais numéros de compte : elle vit dans le dossier de travail de
l'utilisateur (`Documents\\Orisflow\\Config`), jamais dans le dépôt git.
"""

from __future__ import annotations

import json
import os
from datetime import date
from typing import Any, NamedTuple, Optional

import pandas as pd

from .comptes import _colonne_numero
from .regles_agences import detecter_agence

SEUIL_COMPTES = 10
NB_COMPTES_PAR_AGENCE = 15
NOM_FICHIER_TABLE = "comptes_par_agence.json"


class Identification(NamedTuple):
    agence: Optional[str]     # clé d'agence retenue, ou None si le seuil n'est pas atteint
    score: int                # nombre de comptes de l'agence retenue présents dans le fichier
    second_score: int         # meilleur score d'une autre agence (pour détecter une égalité)


def lire_numeros(chemin: str) -> set[str]:
    """Numéros de compte d'une liste (en-tête ligne 24, comme pour le comptage)."""
    df = pd.read_excel(chemin, sheet_name=0, header=23, dtype=str)
    return set(df[_colonne_numero(df)].dropna().str.strip())


def _lire_numeros_sans_planter(chemin: str) -> set[str]:
    """Comme `lire_numeros`, mais ne laisse jamais remonter d'exception : un fichier de
    référence corrompu ou mal formé ne doit jamais empêcher la construction du reste de la
    table (06/10/2026) — ce jour-là compte simplement comme absent pour cette agence."""
    try:
        return lire_numeros(chemin)
    except Exception:
        return set()


def construire_table(fichiers_par_jour: list[dict[str, str]]) -> dict[str, list[str]]:
    """Construit la table agence -> comptes à partir de plusieurs jours de fichiers renommés.

    `fichiers_par_jour` : une entrée par jour, chacune {clé d'agence: chemin du fichier}.
    Pour chaque agence, on ne retient que des comptes présents chez elle **tous les jours**
    et **nulle part ailleurs** ; les 15 premiers, dans l'ordre alphabétique (choix déterministe).
    Une agence qui n'a pas 15 comptes stables n'apparaît pas dans le résultat : elle sera
    signalée comme « table incomplète » par l'appelant.
    """
    if not fichiers_par_jour:
        return {}
    numeros_par_jour = [
        {agence: _lire_numeros_sans_planter(chemin) for agence, chemin in jour.items()}
        for jour in fichiers_par_jour
    ]
    agences = set().union(*(set(jour) for jour in numeros_par_jour))
    table: dict[str, list[str]] = {}
    for agence in sorted(agences):
        if any(agence not in jour for jour in numeros_par_jour):
            continue  # agence absente d'un des jours de référence
        communs = set.intersection(*(jour[agence] for jour in numeros_par_jour))
        autres: set[str] = set()
        for jour in numeros_par_jour:
            for autre, numeros in jour.items():
                if autre != agence:
                    autres |= numeros
        stables = sorted(communs - autres)
        if len(stables) >= NB_COMPTES_PAR_AGENCE:
            table[agence] = stables[:NB_COMPTES_PAR_AGENCE]
    return table


def construire_table_depuis_dossiers(dossiers: list[str]) -> dict[str, list[str]]:
    """Comme `construire_table`, à partir de dossiers de fichiers renommés (`Akwa_Compte.xls`…).

    L'agence est lue dans le nom par `detecter_agence` ; un fichier sans agence reconnue est
    ignoré (jamais deviné).
    """
    fichiers_par_jour = []
    for dossier in dossiers:
        jour: dict[str, str] = {}
        for nom in sorted(os.listdir(dossier)):
            if not nom.lower().endswith((".xls", ".xlsx")):
                continue
            agence = detecter_agence(nom)
            if agence.cle is not None and agence.confiance == "nom":
                jour[agence.cle] = os.path.join(dossier, nom)
        fichiers_par_jour.append(jour)
    return construire_table(fichiers_par_jour)


def identifier(numeros: set[str], table: dict[str, list[str]]) -> Identification:
    """Agence d'une liste, à partir de ses numéros de compte et de la table."""
    scores = sorted(
        ((sum(1 for c in comptes if c in numeros), agence) for agence, comptes in table.items()),
        reverse=True,
    )
    if not scores:
        return Identification(None, 0, 0)
    meilleur, agence = scores[0]
    second = scores[1][0] if len(scores) > 1 else 0
    if meilleur < SEUIL_COMPTES or meilleur == second:
        return Identification(None, meilleur, second)
    return Identification(agence, meilleur, second)


def charger_table(chemin: Optional[str]) -> dict[str, list[str]]:
    """Table agence -> comptes lue dans le fichier de configuration ; vide si absente ou illisible."""
    if not chemin or not os.path.isfile(chemin):
        return {}
    try:
        with open(chemin, "r", encoding="utf-8") as fichier:
            donnees: Any = json.load(fichier)
    except (OSError, json.JSONDecodeError):
        return {}
    agences = donnees.get("agences") if isinstance(donnees, dict) else None
    return agences if isinstance(agences, dict) else {}


def enregistrer_table(chemin: str, table: dict[str, list[str]], jours: list[str]) -> None:
    """Écrit la table de façon atomique (fichier temporaire puis renommage)."""
    os.makedirs(os.path.dirname(chemin) or ".", exist_ok=True)
    donnees = {
        "version": 1,
        "construite_le": date.today().isoformat(),
        "jours_de_reference": jours,
        "seuil_comptes": SEUIL_COMPTES,
        "comptes_par_agence": NB_COMPTES_PAR_AGENCE,
        "agences": table,
    }
    temporaire = chemin + ".tmp"
    with open(temporaire, "w", encoding="utf-8") as fichier:
        json.dump(donnees, fichier, ensure_ascii=False, indent=2)
    os.replace(temporaire, chemin)
