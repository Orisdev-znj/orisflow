"""Repérage des lignes de la feuille « Synthèse » par leur libellé (colonne A).

Les numéros de ligne changent d'un classeur à l'autre (une ligne insérée suffit : c'est
arrivé le 29/09/2026 avec ECOBANK). Écrire à un numéro fixe sans vérifier le libellé
risquerait de placer un montant sur la mauvaise ligne d'un document financier, sans alerte.
Chaque ligne utilisée par Orisflow est donc retrouvée par son libellé ; si une ligne manque
ou apparaît deux fois, la génération s'arrête avec un message clair plutôt que d'écrire.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any, Callable, Iterable, Optional


# Cellule nommée du modèle standard où Orisflow écrit la mention « Généré par Orisflow … ».
NOM_CELLULE_SIGNATURE = "ORISFLOW_SIGNATURE"


def normaliser_libelle(valeur: Any) -> str:
    """Majuscules, sans accents, sans espaces ni ponctuation (« ENCOURS  DEPOTS » →
    « ENCOURSDEPOTS ») : insensible aux variantes de saisie du classeur."""
    texte = unicodedata.normalize("NFKD", str(valeur)).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^A-Z0-9]", "", texte.upper())


def _egal(*valeurs: str) -> Callable[[str], bool]:
    return lambda n: n in valeurs


def _commence(*prefixes: str) -> Callable[[str], bool]:
    return lambda n: n.startswith(prefixes)


# clé interne -> (libellé affiché dans les messages, règle de reconnaissance du libellé normalisé).
# Les fautes de frappe présentes dans les classeurs réels (« WERSTERN », « SALRIÉS ») sont acceptées.
LIGNES_ATTENDUES: dict[str, tuple[str, Callable[[str], bool]]] = {
    "courants": ("COMPTES COURANT ENTREPRISES", _commence("COMPTESCOURANT")),
    "cheques": ("COMPTES CHEQUE", _commence("COMPTESCHEQUE")),
    "epargne": ("COMPTES EPARGNE", _commence("COMPTESEPARGNE")),
    "garanties": ("COMPTES DE GARANTIES", _commence("COMPTESDEGARANTIE")),
    "collectes": ("COMPTES COLLECTES", _commence("COMPTESCOLLECTE")),
    "fonctionnaires": ("COMPTES FONCTIONNAIRES", _commence("COMPTESFONCTIONNAIRE")),
    "salaries": ("COMPTES SALARIÉS SECTEUR PRIVÉ", _commence("COMPTESSALRIE", "COMPTESSALARIE")),
    "total_comptes": ("TOTAUX COMPTES", _egal("TOTAUXCOMPTES")),
    "total_comptes_j1": ("TOTAUX COMPTES J-1", _egal("TOTAUXCOMPTESJ1")),
    "depots": ("ENCOURS DEPOTS", _egal("ENCOURSDEPOTS")),
    "depots_j1": ("ENCOURS DE DEPOTS J-1", _egal("ENCOURSDEDEPOTSJ1", "ENCOURSDEPOTSJ1")),
    "engagements": ("ENCOURS ENGAGEMENTS", _egal("ENCOURSENGAGEMENTS")),
    "engagements_j1": ("ENCOURS ENGAGEMENTS J-1", _egal("ENCOURSENGAGEMENTSJ1", "ENCOURSDENGAGEMENTSJ1")),
    "cca_bank": ("CCA-BANK", _egal("CCABANK")),
    "afriland": ("AFRILAND FIRST BANK", _commence("AFRILAND")),
    "bgfi": ("BGFI BANK", _commence("BGFI")),
    "uba": ("UBA", _egal("UBA")),
    "access_bank": ("ACCESS BANK", _commence("ACCESSBANK")),
    "ecobank": ("ECOBANK", _egal("ECOBANK")),
    "western_union": ("WESTERN UNION", _egal("WESTERNUNION", "WERSTERNUNION")),
    "total_banques_j1": ("TOTAL BANQUES J-1", _egal("TOTALBANQUESJ1")),
    "uv_orange": ("UV ORANGE MONEY", _egal("UVORANGEMONEY")),
    "uv_mtn": ("UV MTN MoMo", _commence("UVMTN")),
    "uv_maviance": ("SOLDE MAVIANCE (UV)", lambda n: "MAVIANCE" in n),
}

LIGNES_BANQUES = ("cca_bank", "afriland", "bgfi", "uba", "access_bank", "ecobank", "western_union")


def _libelles_colonne_a(feuille) -> Iterable[tuple[int, Any]]:
    for numero, (valeur,) in enumerate(feuille.iter_rows(min_col=1, max_col=1, values_only=True), start=1):
        if valeur is not None:
            yield numero, valeur


def localiser_lignes(feuille, cles: Optional[Iterable[str]] = None) -> tuple[dict[str, int], list[str]]:
    """Retourne ({clé: numéro de ligne}, erreurs). Une erreur par ligne introuvable ou en
    double : l'appelant ne doit rien écrire tant que la liste d'erreurs n'est pas vide."""
    cles = list(cles) if cles is not None else list(LIGNES_ATTENDUES)
    trouvees: dict[str, list[int]] = {cle: [] for cle in cles}
    for numero, valeur in _libelles_colonne_a(feuille):
        libelle = normaliser_libelle(valeur)
        if not libelle:
            continue
        for cle in cles:
            if LIGNES_ATTENDUES[cle][1](libelle):
                trouvees[cle].append(numero)

    lignes: dict[str, int] = {}
    erreurs: list[str] = []
    for cle, numeros in trouvees.items():
        affiche = LIGNES_ATTENDUES[cle][0]
        if not numeros:
            erreurs.append(f"ligne « {affiche} » introuvable")
        elif len(numeros) > 1:
            erreurs.append(f"ligne « {affiche} » présente plusieurs fois (lignes {', '.join(map(str, numeros))})")
        else:
            lignes[cle] = numeros[0]
    if not erreurs and "courants" in lignes and "total_comptes" in lignes and lignes["courants"] >= lignes["total_comptes"]:
        erreurs.append("les lignes de comptes ne précèdent pas la ligne « TOTAUX COMPTES »")
    return lignes, erreurs


def valeur_numerique(feuille_valeurs, adresse: str) -> int | float:
    """Valeur calculée d'une cellule ; 0 si vide, texte ou formule sans valeur en cache."""
    valeur = feuille_valeurs[adresse].value
    return valeur if isinstance(valeur, (int, float)) else 0


def lignes_comptes(lignes: dict[str, int]) -> range:
    """Bloc des lignes de comptes additionnées par « TOTAUX COMPTES » (de « COMPTES
    COURANT » jusqu'à la ligne juste au-dessus du total, « AUTRES COMPTES » comprise)."""
    return range(lignes["courants"], lignes["total_comptes"])
