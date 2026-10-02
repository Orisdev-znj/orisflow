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

from .balance_pdf import detecter_type_balance, lire_agence, lire_balance_classe3, lire_balance_classe5
from .comptes import analyser_comptes, total_categorise
from .pdf_releves import detecter_releve
from .reference_treso import lire_totaux_comptes_precedents
from .regles_agences import (
    AGENCE_LIBELLES,
    agences_dont_le_total_serait_proche,
    detecter_agence,
    detecter_agence_depuis_texte,
)
from .regles_banques import (
    CHAMP_MANUEL_WESTERN_UNION_SECOURS,
    CHAMPS_MANUELS_TOUJOURS,
    RIB_AFRILAND_VERS_AGENCE,
    RIB_CCA_VERS_AGENCE,
    RIB_CCA_WESTERN_UNION,
)

SEUIL_ECART_ANORMAL = 0.20  # 20 % : au-delà, le total du jour est jugé suspect.

TYPE_LIBELLES = {
    "compte": "Liste de comptes",
    "engagement": "Engagements",
    "caisse": "Caisse",
    "releve_cca": "Relevé bancaire (CCA-Bank)",
    "releve_afriland": "Relevé bancaire (Afriland First Bank)",
    "releve_bgfi": "Relevé bancaire (BGFI)",
    "releve_bancaire": "Relevé bancaire (banque non reconnue)",
    "balance_classe3": "Balance CloudBank — classe 3 (dépôts, engagements)",
    "balance_classe5": "Balance CloudBank — classe 5 (caisse)",
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
        "comptages": None,
        "doublons": [],
        "mal_formes": [],
        "depots": None,
        "engagements": None,
        "caisse": None,
        "cle_rib": None,
        "code_client": None,
        "solde_releve": None,
        # Où ce relevé bancaire doit alimenter la génération : "cca_bank" | "afriland" |
        # "bgfi" | "western_union" | None (compte non reconnu, voir regles_banques.py).
        "ligne_banque_cible": None,
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
                analyse = analyser_comptes(chemin)
                resultat["comptages"] = analyse["comptages"]
                resultat["total_comptes"] = total_categorise(analyse["comptages"])
                resultat["doublons"] = analyse["doublons"]
                resultat["mal_formes"] = analyse["mal_formes"]
                if analyse["doublons"]:
                    resultat["niveau"] = "avertissement" if resultat["niveau"] == "information" else resultat["niveau"]
                    resultat["messages"].append(
                        f"{len(analyse['doublons'])} numéro(s) de compte en double dans ce fichier "
                        f"(compté(s) plusieurs fois) : {', '.join(analyse['doublons'][:5])}"
                        + (" …" if len(analyse["doublons"]) > 5 else "")
                    )
                if analyse["mal_formes"]:
                    resultat["niveau"] = "avertissement" if resultat["niveau"] == "information" else resultat["niveau"]
                    resultat["messages"].append(
                        f"{len(analyse['mal_formes'])} numéro(s) de compte ne respectent pas le format attendu "
                        f"(5 chiffres-6 chiffres-2 chiffres) : {', '.join(analyse['mal_formes'][:5])}"
                        + (" …" if len(analyse["mal_formes"]) > 5 else "")
                    )
            except Exception as erreur:
                resultat["niveau"] = "bloquant"
                resultat["messages"].append(f"Ce fichier n'a pas pu être lu comme une liste de comptes : {erreur}")

    elif extension == ".pdf":
        releve = detecter_releve(chemin)
        type_balance = None if releve.type_detecte in ("releve_cca", "releve_bgfi") else detecter_type_balance(chemin)

        if type_balance in ("balance_classe3", "balance_classe5"):
            resultat["type_detecte"] = type_balance
            resultat["type_libelle"] = TYPE_LIBELLES[type_balance]
            texte_agence = lire_agence(chemin)
            agence = detecter_agence_depuis_texte(texte_agence) if texte_agence else detecter_agence_depuis_texte("")
            resultat["agence_detectee"] = agence.cle
            resultat["agence_libelle"] = agence.libelle
            resultat["confiance_agence"] = agence.confiance
            if agence.cle is None:
                resultat["niveau"] = "avertissement"
                resultat["messages"].append(
                    f"Aucune agence n'a pu être reconnue dans le contenu de ce PDF (ligne « Groupe: {texte_agence or '?'} »)."
                )
            if type_balance == "balance_classe3":
                valeurs = lire_balance_classe3(chemin)
                resultat["depots"] = valeurs["depots"]
                resultat["engagements"] = valeurs["engagements"]
                if valeurs["depots"] is None or valeurs["engagements"] is None:
                    resultat["niveau"] = "bloquant"
                    resultat["messages"].append("La ligne « Total Classe : 3 » n'a pas été trouvée dans ce PDF.")
                else:
                    resultat["messages"].append(
                        f"Encours dépôts : {valeurs['depots']:,} — Encours engagements : {valeurs['engagements']:,}"
                        .replace(",", " ")
                    )
            else:
                valeurs = lire_balance_classe5(chemin)
                resultat["caisse"] = valeurs["caisse"]
                if valeurs["caisse"] is None:
                    resultat["niveau"] = "bloquant"
                    resultat["messages"].append("La ligne « Total : 57 » n'a pas été trouvée dans ce PDF.")
                else:
                    resultat["messages"].append(f"Caisse : {valeurs['caisse']:,}".replace(",", " "))
        else:
            resultat["type_detecte"] = releve.type_detecte
            resultat["type_libelle"] = TYPE_LIBELLES.get(releve.type_detecte, "Relevé bancaire")
            resultat["numero_compte_pdf"] = releve.numero_compte
            resultat["cle_rib"] = releve.cle_rib
            resultat["code_client"] = releve.code_client
            resultat["solde_releve"] = releve.solde

            if releve.type_detecte == "illisible":
                resultat["niveau"] = "bloquant"
                resultat["messages"].append("Ce PDF n'a pas pu être lu (page vide ou fichier corrompu).")

            elif releve.type_detecte == "releve_bancaire":
                resultat["niveau"] = "avertissement"
                resultat["messages"].append(
                    "Relevé bancaire d'un gabarit non reconnu, ou « Code client » inconnu (ni CCA-Bank, ni "
                    "Afriland) : il n'alimente aucune ligne du classeur. Si c'est un compte connu, signalez-le "
                    "pour l'ajouter à la table de correspondance."
                )

            elif releve.type_detecte in ("releve_cca", "releve_afriland"):
                table = RIB_CCA_VERS_AGENCE if releve.type_detecte == "releve_cca" else RIB_AFRILAND_VERS_AGENCE
                if releve.type_detecte == "releve_cca" and releve.cle_rib == RIB_CCA_WESTERN_UNION:
                    resultat["agence_detectee"] = "akwa"
                    resultat["agence_libelle"] = AGENCE_LIBELLES["akwa"]
                    resultat["confiance_agence"] = "regle_banque"
                    resultat["ligne_banque_cible"] = "western_union"
                    resultat["messages"].append("Relevé reconnu : alimente la ligne Western Union.")
                elif releve.cle_rib and releve.cle_rib in table:
                    agence_cle = table[releve.cle_rib]
                    resultat["agence_detectee"] = agence_cle
                    resultat["agence_libelle"] = AGENCE_LIBELLES[agence_cle]
                    resultat["confiance_agence"] = "regle_banque"
                    resultat["ligne_banque_cible"] = "afriland" if releve.type_detecte == "releve_afriland" else "cca_bank"
                    resultat["messages"].append(
                        f"Relevé {releve.banque_libelle} reconnu ({AGENCE_LIBELLES[agence_cle]})."
                    )
                else:
                    resultat["niveau"] = "avertissement"
                    resultat["messages"].append(
                        f"Clé RIB « {releve.cle_rib or '?'} » non reconnue pour {releve.banque_libelle} : "
                        "ce compte n'alimente encore aucune ligne (table à compléter)."
                    )
                if releve.solde is None:
                    resultat["niveau"] = "avertissement" if resultat["niveau"] == "information" else resultat["niveau"]
                    resultat["messages"].append("Le solde final n'a pas pu être lu dans ce relevé.")

            else:  # releve_bgfi : toujours consolidé dans la colonne Akwa (confirmé le 02/10/2026)
                resultat["agence_detectee"] = "akwa"
                resultat["agence_libelle"] = AGENCE_LIBELLES["akwa"]
                resultat["confiance_agence"] = "regle_banque"
                resultat["ligne_banque_cible"] = "bgfi"
                if releve.solde is None:
                    resultat["niveau"] = "avertissement"
                    resultat["messages"].append("Le solde final n'a pas pu être lu dans ce relevé BGFI.")
                else:
                    resultat["messages"].append("Relevé BGFI reconnu.")

            if not releve.numero_compte:
                resultat["messages"].append("Le numéro de compte n'a pas pu être lu dans ce PDF.")

    else:
        resultat["type_detecte"] = "inconnu"
        resultat["type_libelle"] = TYPE_LIBELLES["inconnu"]
        resultat["niveau"] = "avertissement"
        resultat["messages"].append("Ce type de fichier n'est pas pris en charge (Excel ou PDF attendu).")

    return resultat


def _cle_doublon(f: dict[str, Any]) -> Optional[tuple]:
    """D'habitude (type, agence) suffit. Mais une même agence peut légitimement recevoir
    plusieurs comptes CCA-Bank/Afriland différents (ex. Akwa cumule les clés RIB 12 et 39,
    voir regles_banques.py) : pour ces types, c'est le compte précis (clé RIB, ou le numéro
    de compte pour BGFI qui n'a pas de clé RIB) qui distingue un doublon réel d'un second
    compte légitime pour la même agence."""
    type_detecte = f["type_detecte"]
    if type_detecte in (None, "inconnu"):
        return None
    if type_detecte in ("releve_cca", "releve_afriland") and f.get("cle_rib"):
        return (type_detecte, f["cle_rib"])
    if type_detecte == "releve_bgfi" and f.get("numero_compte_pdf"):
        return (type_detecte, f["numero_compte_pdf"])
    if f["agence_detectee"] is None:
        return None
    return (type_detecte, f["agence_detectee"])


def detecter_doublons(fichiers: list[dict[str, Any]]) -> None:
    """Marque en « bloquant » les fichiers qui partagent le même type et, selon le type,
    la même agence ou le même compte précis (voir `_cle_doublon`)."""
    vus: dict[tuple, list[dict[str, Any]]] = {}
    for f in fichiers:
        cle = _cle_doublon(f)
        if cle is None:
            continue
        vus.setdefault(cle, []).append(f)
    for (type_detecte, deuxieme_cle), groupe in vus.items():
        if len(groupe) <= 1:
            continue
        noms = ", ".join(g["nom"] for g in groupe)
        if type_detecte in ("releve_cca", "releve_afriland", "releve_bgfi"):
            designation = f"le compte {deuxieme_cle}"
        else:
            designation = AGENCE_LIBELLES.get(deuxieme_cle, deuxieme_cle)
        for f in groupe:
            f["niveau"] = "bloquant"
            f["messages"].append(
                f"Plusieurs fichiers correspondent à « {TYPE_LIBELLES.get(type_detecte, type_detecte)} » "
                f"pour {designation} : {noms}. Retirez les fichiers en trop."
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

    return {
        "total": len(fichiers),
        "fichiers": fichiers,
        "reference": reference,
        "ok": ok,
        "champs_manuels_requis": _champs_manuels_requis(fichiers),
    }


def _champs_manuels_requis(fichiers: list[dict[str, Any]]) -> list[str]:
    """Champs à demander dans la fenêtre unique de saisie manuelle avant de générer le
    classeur (demande du 02/10/2026) : toujours les UV/UBA/Ecobank/Access Bank (aucune
    lecture automatisée prévue), plus Western Union seulement si son relevé (clé RIB 97)
    n'a pas été reconnu aujourd'hui (secours — automatique sinon, confirmé par l'utilisateur)."""
    western_union_trouve = any(
        f.get("ligne_banque_cible") == "western_union" and f["niveau"] != "bloquant"
        for f in fichiers
    )
    requis = list(CHAMPS_MANUELS_TOUJOURS)
    if not western_union_trouve:
        requis.append(CHAMP_MANUEL_WESTERN_UNION_SECOURS)
    return requis
