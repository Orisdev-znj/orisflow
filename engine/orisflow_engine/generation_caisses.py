"""Écriture des caisses par agence et des J-1 « caisses » et « liquidités ».

Chaque agence a sa ligne « CAISSE(S) <AGENCE> », retrouvée par son libellé ; le montant est
la colonne « Débit Solde fin » de `Total : 57` de la balance classe 5 (`balance_pdf`).
"""

from __future__ import annotations

from typing import Any, Optional

from .regles_agences import AGENCE_COLONNE, AGENCE_LIBELLES, detecter_agence_depuis_texte
from .structure_modele import normaliser_libelle, valeur_numerique


def _ligne_par_libelle(feuille, libelle: str) -> Optional[int]:
    cible = normaliser_libelle(libelle)
    for numero, (valeur,) in enumerate(feuille.iter_rows(min_col=1, max_col=1, values_only=True), start=1):
        if valeur is not None and normaliser_libelle(valeur) == cible:
            return numero
    return None


def _lignes_caisse(feuille) -> dict[str, int]:
    lignes: dict[str, int] = {}
    for numero, (valeur,) in enumerate(feuille.iter_rows(min_col=1, max_col=1, values_only=True), start=1):
        if not valeur:
            continue
        libelle = normaliser_libelle(valeur)
        if not libelle.startswith("CAISSE") or "TOTAL" in libelle or "PLAFOND" in libelle or "DEVISES" in libelle:
            continue
        # « PK-14 » et « PK 14 » désignent la même agence.
        agence = detecter_agence_depuis_texte(str(valeur).replace("PK-", "PK").replace("PK ", "PK"))
        if agence.cle is not None:
            lignes[agence.cle] = numero
    return lignes


def ecrire_caisses(feuille, feuille_valeurs, classement: dict[str, Any]) -> dict[str, Any]:
    """Retourne {"agences": [...], "avertissements": [...], "montants": {agence: caisse}}."""
    avertissements: list[str] = []
    agences_mises_a_jour: list[str] = []

    montants: dict[str, int] = {}
    for f in classement["fichiers"]:
        if f["type_detecte"] != "balance_classe5" or f["niveau"] == "bloquant" or f["agence_detectee"] is None:
            continue
        if f.get("caisse") is not None:
            montants[f["agence_detectee"]] = int(f["caisse"])

    for agence, ligne in _lignes_caisse(feuille).items():
        if agence in montants:
            feuille[f"{AGENCE_COLONNE[agence]}{ligne}"] = montants[agence]
            agences_mises_a_jour.append(agence)
        else:
            avertissements.append(
                f"Caisse {AGENCE_LIBELLES[agence]} : ligne inchangée depuis la veille (balance classe 5 non reçue)."
            )

    for libelle_total, libelle_j1 in (("TOTAL CAISSES", "TOTAL CAISSES J-1"), ("TOTAL LIQUIDITE", "LIQUIDITES J-1")):
        ligne_total = _ligne_par_libelle(feuille, libelle_total)
        ligne_j1 = _ligne_par_libelle(feuille, libelle_j1)
        if ligne_total and ligne_j1:
            for colonne in AGENCE_COLONNE.values():
                feuille[f"{colonne}{ligne_j1}"] = valeur_numerique(feuille_valeurs, f"{colonne}{ligne_total}")

    return {
        "agences": agences_mises_a_jour,
        "avertissements": avertissements,
        "montants": {a: m for a, m in montants.items() if a in agences_mises_a_jour},
    }
