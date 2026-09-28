"""Sprint 2 : reconnaissance du type de chaque fichier importé et de son agence,
avec un contrôle de cohérence par rapport à la veille.

Principes (voir CLAUDE.md) :
- Orisflow ne modifie jamais les fichiers reçus (lecture seule partout ici).
- Une détection incertaine est signalée, jamais appliquée silencieusement :
  la confirmation reste à l'utilisateur (écran Import).
- Les règles reprennent celles, déjà validées, du script actuel (voir
  `regles_agences.py` et `comptes.py`) : on ne réinvente pas la règle métier.
"""

from __future__ import annotations

import os
from typing import Any, Optional

import pandas as pd

from .comptes import compter_comptes, total_categorise
from .pdf_releves import detecter_releve
from .reference_treso import lire_totaux_comptes_precedents
from .regles_agences import AGENCE_LIBELLES, agences_dont_le_total_serait_proche, detecter_agence

SEUIL_ECART_ANORMAL = 0.20  # 20 % : au-delà, le total du jour est jugé suspect.

TYPE_LIBELLES = {
    "compte": "Liste de comptes",
    "engagement": "Engagements",
    "caisse": "Caisse",
    "releve_cca": "Relevé bancaire (CCA-Bank)",
    "releve_bgfi": "Relevé bancaire (BGFI)",
    "releve_bancaire": "Relevé bancaire (banque non reconnue)",
    "inconnu": "Type non reconnu",
}


def _peek_chapitre_excel(chemin: str) -> Optional[str]:
    """Reprend la détection du « Chapitre » des fichiers `EtBalance…` du script B."""
    try:
        apercu = pd.read_excel(chemin, sheet_name=0, header=None, nrows=10, dtype=str)
    except Exception:
        return None
    for _, ligne in apercu.iterrows():
        valeurs = [str(v).strip() for v in ligne.values if str(v).strip() not in ("", "nan")]
        for i, v in enumerate(valeurs):
            if "chapitre" in v.lower():
                return valeurs[i + 1] if i + 1 < len(valeurs) else v
    return None


def detecter_type_excel(nom_fichier: str, chemin: str) -> str:
    nom = nom_fichier.lower()
    if "compte" in nom or "etlistecompte" in nom:
        return "compte"
    if "engagement" in nom:
        return "engagement"
    if "caisse" in nom:
        return "caisse"
    if "etbalance" in nom or "balance" in nom:
        chapitre = _peek_chapitre_excel(chemin)
        if chapitre and "3" in chapitre:
            return "engagement"
        if chapitre and "5" in chapitre:
            return "caisse"
    return "inconnu"


def classer_un_fichier(chemin: str) -> dict[str, Any]:
    nom = os.path.basename(chemin)
    extension = os.path.splitext(nom)[1].lower()
    resultat: dict[str, Any] = {
        "nom": nom,
        "chemin": chemin,
        "extension": extension,
        "type_detecte": None,
        "type_libelle": None,
        "agence_detectee": None,
        "agence_libelle": None,
        "confiance_agence": "sans_objet",
        "numero_compte_pdf": None,
        "total_comptes": None,
        "messages": [],
        "niveau": "information",
    }

    if extension in (".xls", ".xlsx"):
        type_detecte = detecter_type_excel(nom, chemin)
        resultat["type_detecte"] = type_detecte
        resultat["type_libelle"] = TYPE_LIBELLES[type_detecte]
        if type_detecte == "inconnu":
            resultat["niveau"] = "avertissement"
            resultat["messages"].append(
                "Le type de ce fichier n'a pas pu être reconnu à partir de son nom ou de son contenu."
            )
        agence = detecter_agence(nom)
        resultat["agence_detectee"] = agence.cle
        resultat["agence_libelle"] = agence.libelle
        resultat["confiance_agence"] = agence.confiance
        if agence.cle is None:
            resultat["niveau"] = "avertissement"
            resultat["messages"].append(
                "Aucune agence n'a pu être reconnue dans le nom de ce fichier. Choisissez-la manuellement."
            )
        elif agence.confiance == "code":
            resultat["messages"].append(
                f"Agence déduite d'un code présent dans le nom ({agence.libelle}) : à vérifier."
            )

        if type_detecte == "compte":
            try:
                comptages = compter_comptes(chemin)
                resultat["total_comptes"] = total_categorise(comptages)
            except Exception as erreur:
                resultat["niveau"] = "bloquant"
                resultat["messages"].append(f"Ce fichier n'a pas pu être lu comme une liste de comptes : {erreur}")

    elif extension == ".pdf":
        releve = detecter_releve(chemin)
        resultat["type_detecte"] = releve.type_detecte
        resultat["type_libelle"] = TYPE_LIBELLES.get(releve.type_detecte, "Relevé bancaire")
        resultat["numero_compte_pdf"] = releve.numero_compte
        if releve.type_detecte == "illisible":
            resultat["niveau"] = "bloquant"
            resultat["messages"].append("Ce PDF n'a pas pu être lu (page vide ou fichier corrompu).")
        elif releve.type_detecte == "releve_bancaire":
            resultat["niveau"] = "avertissement"
            resultat["messages"].append("Relevé bancaire d'un gabarit non reconnu (ni CCA-Bank, ni BGFI).")
        else:
            resultat["messages"].append(
                "Relevé bancaire reconnu. Son rattachement à une ligne du classeur n'est pas encore automatisé "
                "(prévu à une prochaine étape)."
            )
        if not releve.numero_compte:
            resultat["messages"].append("Le numéro de compte n'a pas pu être lu dans ce PDF.")

    else:
        resultat["type_detecte"] = "inconnu"
        resultat["type_libelle"] = TYPE_LIBELLES["inconnu"]
        resultat["niveau"] = "avertissement"
        resultat["messages"].append("Ce type de fichier n'est pas pris en charge (Excel ou PDF attendu).")

    return resultat


def detecter_doublons(fichiers: list[dict[str, Any]]) -> None:
    """Marque en « bloquant » les fichiers qui partagent le même type et la même agence."""
    vus: dict[tuple, list[dict[str, Any]]] = {}
    for f in fichiers:
        if f["type_detecte"] in (None, "inconnu") or f["agence_detectee"] is None:
            continue
        cle = (f["type_detecte"], f["agence_detectee"])
        vus.setdefault(cle, []).append(f)
    for (type_detecte, agence_cle), groupe in vus.items():
        if len(groupe) <= 1:
            continue
        noms = ", ".join(g["nom"] for g in groupe)
        for f in groupe:
            f["niveau"] = "bloquant"
            f["messages"].append(
                f"Plusieurs fichiers correspondent à « {TYPE_LIBELLES.get(type_detecte, type_detecte)} » "
                f"pour {AGENCE_LIBELLES.get(agence_cle, agence_cle)} : {noms}. Retirez les fichiers en trop."
            )


def controler_coherence_comptes(fichiers: list[dict[str, Any]], dossier_reference: Optional[str]) -> dict[str, Any]:
    """Compare le total de comptes de chaque fichier à celui de la veille (même agence).

    Ne bloque jamais : une référence absente ou illisible est simplement signalée,
    sans empêcher la suite.
    """
    if not dossier_reference:
        return {"disponible": False, "chemin": None, "date": None}

    reference = lire_totaux_comptes_precedents(dossier_reference)
    totaux_veille = reference["totaux"]

    for f in fichiers:
        if f["type_detecte"] != "compte" or f["total_comptes"] is None or f["agence_detectee"] is None:
            continue
        total_veille = totaux_veille.get(f["agence_detectee"])
        if total_veille is None:
            f["messages"].append("Aucun total de la veille disponible pour cette agence : comparaison impossible.")
            continue
        if total_veille == 0:
            continue
        ecart = abs(f["total_comptes"] - total_veille) / total_veille
        if ecart <= SEUIL_ECART_ANORMAL:
            continue

        f["niveau"] = "avertissement" if f["niveau"] == "information" else f["niveau"]
        f["messages"].append(
            f"Écart anormal avec la veille : {f['total_comptes']} comptes aujourd'hui contre {total_veille} "
            f"({AGENCE_LIBELLES.get(f['agence_detectee'], f['agence_detectee'])}, écart de "
            f"{ecart * 100:.0f} %)."
        )
        suggestions = [
            cle for cle in agences_dont_le_total_serait_proche(f["total_comptes"], totaux_veille)
            if cle != f["agence_detectee"]
        ]
        if suggestions:
            noms = ", ".join(AGENCE_LIBELLES.get(cle, cle) for cle in suggestions)
            f["messages"].append(
                f"Ce total ressemble plutôt à celui de la veille pour : {noms}. "
                "Vérifiez que ce fichier correspond bien à la bonne agence avant de continuer "
                "(cas déjà survenu le 10/09/2026 entre Bafoussam et Balessing)."
            )

    return {"disponible": bool(totaux_veille), "chemin": reference["chemin"], "date": reference["date"]}


def classer_fichiers(chemins: list[str], dossier_reference: Optional[str] = None) -> dict[str, Any]:
    fichiers = []
    for chemin in chemins:
        if not os.path.isfile(chemin):
            fichiers.append({
                "nom": os.path.basename(chemin), "chemin": chemin,
                "extension": os.path.splitext(chemin)[1].lower(),
                "type_detecte": None, "type_libelle": None,
                "agence_detectee": None, "agence_libelle": None, "confiance_agence": "sans_objet",
                "numero_compte_pdf": None, "total_comptes": None,
                "niveau": "bloquant", "messages": ["Le fichier est introuvable."],
            })
            continue
        fichiers.append(classer_un_fichier(chemin))

    detecter_doublons(fichiers)
    reference = controler_coherence_comptes(fichiers, dossier_reference)

    niveaux = {f["niveau"] for f in fichiers}
    ok = "bloquant" not in niveaux

    return {"total": len(fichiers), "fichiers": fichiers, "reference": reference, "ok": ok}
