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

import hashlib
import os
from datetime import date, timedelta
from typing import Any, Callable, Optional

import pandas as pd

from .balance_pdf import detecter_type_balance, lire_agence, lire_balance_classe3, lire_balance_classe5
from .comptes import analyser_comptes, lire_gestionnaire, total_categorise
from .pdf_releves import detecter_releve
from .reference_treso import lire_totaux_comptes_precedents
from .regles_agences import (
    AGENCE_LIBELLES,
    agences_dont_le_total_serait_proche,
    deduire_agences_par_comptage,
    detecter_agence,
    detecter_agence_depuis_gestionnaire,
    detecter_agence_depuis_texte,
)
from . import carnet
from .comptes_agences import SEUIL_COMPTES, NB_COMPTES_PAR_AGENCE, identifier, lire_numeros
from .regles_banques import (
    RELEVES_ATTENDUS,
    cle_releve,
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


def _message_erreur_lecture(erreur: Exception) -> str:
    """Message clair pour une erreur de lecture, en priorité le cas le plus fréquent en
    pratique : le fichier est encore ouvert dans Excel au moment où Orisflow le lit
    (06/10/2026) — plutôt qu'un nom de classe Python incompréhensible pour un comptable."""
    if isinstance(erreur, PermissionError):
        return "Ce fichier n'a pas pu être lu : il est peut-être encore ouvert dans Excel. Fermez-le puis réessayez."
    return (
        f"Ce fichier n'a pas pu être lu ({erreur.__class__.__name__}) : vérifiez qu'il n'est pas "
        "corrompu, qu'il correspond bien au type attendu, et qu'il n'est pas déjà ouvert ailleurs."
    )


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
        # Nom lu dans le champ « Gestionnaire : » de l'en-tête (uniquement pour les listes
        # de comptes) — voir comptes.lire_gestionnaire, démarré le 03/10/2026.
        "gestionnaire": None,
        "messages": [],
        "niveau": "information",
    }

    try:
        _classer_selon_extension(resultat, extension, nom, chemin)
    except Exception as erreur:
        # Filet de sécurité (06/10/2026) : une erreur inattendue dans un lecteur (fichier
        # corrompu, gabarit jamais vu...) ne doit jamais interrompre le classement du reste
        # du lot. On revient toujours à un résultat exploitable, jamais à une exception.
        resultat["type_detecte"] = resultat["type_detecte"] or "illisible"
        resultat["type_libelle"] = TYPE_LIBELLES.get(resultat["type_detecte"], "Fichier illisible")
        resultat["niveau"] = "bloquant"
        resultat["messages"].append(_message_erreur_lecture(erreur))
    return resultat


def _classer_selon_extension(resultat: dict[str, Any], extension: str, nom: str, chemin: str) -> None:
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

        if type_detecte == "compte":
            # Toujours lu, même si le nom suffit déjà : utile pour la fenêtre Paramètres
            # (voir le bouton « Configurer les gestionnaires ») et pour le recours
            # gestionnaire plus bas dans `classer_fichiers` si le nom ne suffit pas.
            resultat["gestionnaire"] = lire_gestionnaire(chemin)

        resultat["agence_detectee"] = agence.cle
        resultat["agence_libelle"] = agence.libelle
        resultat["confiance_agence"] = agence.confiance
        if agence.cle is None:
            resultat["niveau"] = "avertissement"
            resultat["messages"].append(
                "Aucune agence n'a pu être reconnue dans le nom de ce fichier. "
                + (
                    "Orisflow va essayer de la déduire par comparaison avec la veille, puis par le gestionnaire."
                    if type_detecte == "compte"
                    else "Choisissez-la manuellement."
                )
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
                # Numéros répétés dans une même liste : pas d'avertissement (décision du 03/10/2026).
                # Un doublon, c'est un fichier dont le contenu est identique à un autre (voir
                # `detecter_fichiers_identiques`).
                if analyse["mal_formes"]:
                    resultat["niveau"] = "avertissement" if resultat["niveau"] == "information" else resultat["niveau"]
                    resultat["messages"].append(
                        f"{len(analyse['mal_formes'])} numéro(s) de compte ne respectent pas le format attendu "
                        f"(5 chiffres-6 chiffres-2 chiffres) : {', '.join(analyse['mal_formes'][:5])}"
                        + (" …" if len(analyse["mal_formes"]) > 5 else "")
                    )
            except PermissionError:
                resultat["niveau"] = "bloquant"
                resultat["messages"].append(_message_erreur_lecture(PermissionError()))
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


def detecter_fichiers_identiques(fichiers: list[dict[str, Any]]) -> None:
    """Un doublon, c'est un fichier dont le contenu est strictement identique à un autre,
    quel que soit son nom (décision du 03/10/2026). Le premier reste utilisable ; les
    suivants sont bloquants, pour qu'un même contenu ne soit jamais compté deux fois."""
    vus: dict[str, dict[str, Any]] = {}
    for f in fichiers:
        if f["type_detecte"] is None or not os.path.isfile(f["chemin"]):
            continue
        with open(f["chemin"], "rb") as fichier:
            empreinte = hashlib.sha256(fichier.read()).hexdigest()
        if empreinte in vus:
            f["niveau"] = "bloquant"
            f["messages"].append(
                f"Contenu identique à « {vus[empreinte]['nom']} » : ce fichier est un doublon. "
                "Retirez-le de l'import."
            )
        else:
            vus[empreinte] = f


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


def identifier_agences_par_comptes(
    fichiers: list[dict[str, Any]],
    table: dict[str, list[str]],
    gestionnaires: dict[str, str],
) -> dict[str, int]:
    """Identifie l'agence des listes de comptes par leurs numéros de compte (décision du
    05/10/2026). Prime sur le nom du fichier. Si moins de SEUIL_COMPTES numéros correspondent,
    le gestionnaire lève l'ambiguïté ; à défaut, le nom reste retenu avec un avertissement.
    Ne touche jamais aux agences confirmées manuellement.

    Retourne le décompte : {"identifiees": n, "contredisent_le_nom": n, "faibles": n}.
    """
    from .regles_agences import detecter_agence_depuis_gestionnaire

    bilan = {"identifiees": 0, "contredisent_le_nom": 0, "faibles": 0}
    if not table:
        return bilan
    for f in fichiers:
        if f["type_detecte"] != "compte" or f["niveau"] == "bloquant" or f["confiance_agence"] == "manuelle":
            continue
        try:
            numeros = lire_numeros(f["chemin"])
        except (ValueError, OSError):
            continue  # colonne introuvable : la lecture du comptage signalera le problème
        ident = identifier(numeros, table)
        nom_agence = f["agence_detectee"]
        f["messages"] = [m for m in f["messages"] if not m.startswith("Aucune agence n'a pu être reconnue")]

        if ident.agence is not None:
            bilan["identifiees"] += 1
            libelle = AGENCE_LIBELLES[ident.agence]
            if f["confiance_agence"] == "code":
                # Un code dans un identifiant technique (ex. « 10000-… ») n'est pas un nom de fichier
                # fiable : les numéros de compte priment, sans alerte (demande du 06/10/2026).
                f["messages"] = [m for m in f["messages"] if not m.startswith("Agence déduite d'un code")]
                f["messages"].append(
                    f"Agence confirmée par ses numéros de compte ({ident.score}/{NB_COMPTES_PAR_AGENCE})."
                )
                if f["niveau"] == "avertissement" and not f["doublons"] and not f["mal_formes"]:
                    f["niveau"] = "information"  # l'avertissement ne venait que du nom
            elif nom_agence and nom_agence != ident.agence:
                bilan["contredisent_le_nom"] += 1
                f["messages"].append(
                    f"Le nom du fichier indique {f['agence_libelle']}, mais ses numéros de compte "
                    f"correspondent à {libelle} ({ident.score}/{NB_COMPTES_PAR_AGENCE}). {libelle} est retenue : "
                    "vérifiez le nom de ce fichier."
                )
                _relever_niveau(f, "avertissement")
            elif not nom_agence and f["niveau"] == "avertissement" and not f["messages"]:
                # Le nom ne portait pas d'agence (seul motif d'avertissement) : levé par les comptes.
                f["niveau"] = "information"
            f["agence_detectee"] = ident.agence
            f["agence_libelle"] = libelle
            f["confiance_agence"] = "comptes"
            continue

        # Seuil non atteint : le gestionnaire lève l'ambiguïté, sinon le nom reste retenu.
        bilan["faibles"] += 1
        agence_gestionnaire = detecter_agence_depuis_gestionnaire(f.get("gestionnaire"), gestionnaires)
        if agence_gestionnaire.cle is not None:
            f["messages"].append(
                f"Seulement {ident.score} comptes sur {NB_COMPTES_PAR_AGENCE} correspondent à une agence "
                f"(seuil : {SEUIL_COMPTES}). Agence déduite du gestionnaire : {agence_gestionnaire.libelle}."
            )
            f["agence_detectee"] = agence_gestionnaire.cle
            f["agence_libelle"] = agence_gestionnaire.libelle
            f["confiance_agence"] = "gestionnaire"
        else:
            f["messages"].append(
                f"Seulement {ident.score} comptes sur {NB_COMPTES_PAR_AGENCE} correspondent à une agence "
                f"(seuil : {SEUIL_COMPTES}) : vérifiez l'agence de ce fichier."
            )
        _relever_niveau(f, "avertissement")
    return bilan


def _relever_niveau(f: dict[str, Any], niveau: str) -> None:
    """Ne baisse jamais le niveau d'un fichier (un bloquant reste bloquant)."""
    ordre = {"information": 0, "avertissement": 1, "bloquant": 2}
    if ordre[niveau] > ordre[f["niveau"]]:
        f["niveau"] = niveau


def deduire_agences_manquantes_par_comptage(fichiers: list[dict[str, Any]], totaux_veille: dict[str, int]) -> int:
    """Pour les listes de comptes dont l'agence reste introuvable après le nom du fichier,
    propose une agence par proximité du total de comptes à la veille — **premier recours**
    automatique après le nom (demande du 03/10/2026, avant le gestionnaire : l'utilisateur
    important toujours les 12 listes ensemble, comparer le lot entier limite les conflits
    entre fichiers, et ne demande aucune configuration préalable).

    Ne remplace jamais silencieusement : affecte `agence_detectee` avec `confiance_agence
    = "comptage"` (niveau avertissement, message explicite) — à vérifier absolument,
    jamais une certitude comme un nom de fichier. Retourne le nombre de fichiers résolus.
    """
    if not totaux_veille:
        return 0
    agences_deja_utilisees = {f["agence_detectee"] for f in fichiers if f.get("agence_detectee")}
    candidats = [
        (f["chemin"], f["total_comptes"])
        for f in fichiers
        if f["type_detecte"] == "compte" and f["agence_detectee"] is None and f["total_comptes"] is not None
        and f["niveau"] != "bloquant"
    ]
    if not candidats:
        return 0

    affectations = deduire_agences_par_comptage(candidats, totaux_veille, agences_deja_utilisees)
    par_chemin = {f["chemin"]: f for f in fichiers}
    for chemin, (agence_cle, ecart) in affectations.items():
        f = par_chemin[chemin]
        f["agence_detectee"] = agence_cle
        f["agence_libelle"] = AGENCE_LIBELLES[agence_cle]
        f["confiance_agence"] = "comptage"
        f["niveau"] = "avertissement" if f["niveau"] == "information" else f["niveau"]
        f["messages"].append(
            f"Agence non reconnue dans le nom : suggérée par proximité du total de comptes avec la veille "
            f"({AGENCE_LIBELLES[agence_cle]}, écart de {ecart * 100:.0f} %). À vérifier absolument."
        )
    return len(affectations)


def deduire_agences_manquantes_par_gestionnaire(
    fichiers: list[dict[str, Any]], gestionnaires: dict[str, str]
) -> int:
    """Second recours (après le comptage) : rattache l'agence via la table gestionnaire
    configurée par l'utilisateur (écran Paramètres), pour les fichiers encore sans agence.
    Jamais devinée : seulement les correspondances explicitement renseignées par
    l'utilisateur. Retourne le nombre de fichiers résolus."""
    if not gestionnaires:
        return 0
    n = 0
    for f in fichiers:
        if f["type_detecte"] != "compte" or f["agence_detectee"] is not None or f["niveau"] == "bloquant":
            continue
        agence = detecter_agence_depuis_gestionnaire(f.get("gestionnaire"), gestionnaires)
        if agence.cle is None:
            continue
        f["agence_detectee"] = agence.cle
        f["agence_libelle"] = agence.libelle
        f["confiance_agence"] = agence.confiance
        f["messages"].append(f"Agence déduite du gestionnaire « {f['gestionnaire']} » ({agence.libelle}).")
        n += 1
    return n


def appliquer_agences_manuelles(fichiers: list[dict[str, Any]], agences_manuelles: dict[str, str]) -> int:
    """Applique les choix faits par l'utilisateur dans la fenêtre « Agence à confirmer »
    (démarré le 03/10/2026) : la correspondance la plus sûre, toujours prioritaire sur les
    mécanismes automatiques. Clé : chemin du fichier. Retourne le nombre appliqué."""
    if not agences_manuelles:
        return 0
    n = 0
    for f in fichiers:
        agence_cle = agences_manuelles.get(f["chemin"])
        if not agence_cle or agence_cle not in AGENCE_LIBELLES:
            continue
        f["agence_detectee"] = agence_cle
        f["agence_libelle"] = AGENCE_LIBELLES[agence_cle]
        f["confiance_agence"] = "manuelle"
        f["niveau"] = "information" if f["niveau"] == "avertissement" else f["niveau"]
        f["messages"].append(f"Agence confirmée manuellement : {AGENCE_LIBELLES[agence_cle]}.")
        n += 1
    return n


def controler_coherence_comptes(
    fichiers: list[dict[str, Any]], totaux_veille: dict[str, int], reference_lue: dict[str, Any]
) -> dict[str, Any]:
    """Compare le total de comptes de chaque fichier à celui de la veille (même agence).

    Ne bloque jamais : une référence absente ou illisible est simplement signalée,
    sans empêcher la suite. `totaux_veille`/`reference_lue` viennent d'un seul appel à
    `lire_totaux_comptes_precedents`, partagé avec `deduire_agences_manquantes_par_comptage`.
    """
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

    return {"disponible": bool(totaux_veille), "chemin": reference_lue["chemin"], "date": reference_lue["date"]}


def classer_fichiers(
    chemins: list[str],
    dossier_reference: Optional[str] = None,
    gestionnaires: Optional[dict[str, str]] = None,
    agences_manuelles: Optional[dict[str, str]] = None,
    sur_fichier_classe: Optional[Callable[[dict[str, Any]], None]] = None,
    dossier_carnet: Optional[str] = None,
    jour: Optional[date] = None,
    table_comptes: Optional[dict[str, list[str]]] = None,
) -> dict[str, Any]:
    """`sur_fichier_classe` (optionnel) : appelé juste après chaque fichier individuel
    classé, avant les passes par lot ci-dessous — sert à construire un journal d'étapes
    visible pendant l'analyse (demande du 03/10/2026, voir cli.py). `agences_manuelles`
    vient de la fenêtre « Agence à confirmer » : la correspondance la plus sûre, appliquée
    avant toute déduction automatique."""
    fichiers = []
    for chemin in chemins:
        if not os.path.isfile(chemin):
            f = {
                "nom": os.path.basename(chemin), "chemin": chemin,
                "extension": os.path.splitext(chemin)[1].lower(),
                "type_detecte": None, "type_libelle": None,
                "agence_detectee": None, "agence_libelle": None, "confiance_agence": "sans_objet",
                "numero_compte_pdf": None, "total_comptes": None,
                "niveau": "bloquant", "messages": ["Le fichier est introuvable."],
            }
        else:
            f = classer_un_fichier(chemin)
        fichiers.append(f)
        if sur_fichier_classe:
            sur_fichier_classe(f)

    journal_etapes: list[str] = []

    # 1. Confirmations manuelles de l'utilisateur : toujours prioritaires.
    n = appliquer_agences_manuelles(fichiers, agences_manuelles or {})
    if n:
        journal_etapes.append(f"{n} agence(s) confirmée(s) manuellement.")

    # 1 bis. Numéros de compte (décision du 05/10/2026) : prime sur le nom du fichier.
    table_comptes = table_comptes or {}
    if table_comptes:
        bilan = identifier_agences_par_comptes(fichiers, table_comptes, gestionnaires or {})
        if bilan["identifiees"]:
            journal_etapes.append(
                f"{bilan['identifiees']} agence(s) identifiée(s) par leurs numéros de compte "
                f"({SEUIL_COMPTES} comptes sur {NB_COMPTES_PAR_AGENCE} au minimum)."
            )
        if bilan["contredisent_le_nom"]:
            journal_etapes.append(
                f"{bilan['contredisent_le_nom']} nom(s) de fichier contredit(s) par les numéros de compte : à vérifier."
            )
        if bilan["faibles"]:
            journal_etapes.append(
                f"{bilan['faibles']} fichier(s) avec moins de {SEUIL_COMPTES} comptes reconnus : "
                "gestionnaire ou confirmation demandés."
            )

    detecter_fichiers_identiques(fichiers)
    detecter_doublons(fichiers)

    reference_lue = (
        lire_totaux_comptes_precedents(dossier_reference)
        if dossier_reference
        else {"chemin": None, "date": None, "totaux": {}}
    )
    totaux_veille = reference_lue["totaux"]

    # 2. Comptage : premier recours automatique (demande du 03/10/2026), avant le
    # gestionnaire — ne demande aucune configuration, utilise ce qu'Orisflow a déjà.
    n = deduire_agences_manquantes_par_comptage(fichiers, totaux_veille)
    if n:
        journal_etapes.append(f"{n} agence(s) déduite(s) par proximité du total de comptes avec la veille.")

    # 3. Gestionnaire : second recours, seulement si le comptage n'a pas suffi.
    n = deduire_agences_manquantes_par_gestionnaire(fichiers, gestionnaires or {})
    if n:
        journal_etapes.append(f"{n} agence(s) déduite(s) de la table des gestionnaires.")

    reference = controler_coherence_comptes(fichiers, totaux_veille, reference_lue)

    n_restants = sum(
        1 for f in fichiers
        if f["type_detecte"] == "compte" and f["agence_detectee"] is None and f["niveau"] != "bloquant"
    )
    if n_restants:
        journal_etapes.append(f"{n_restants} fichier(s) encore sans agence : votre confirmation sera demandée.")

    niveaux = {f["niveau"] for f in fichiers}
    ok = "bloquant" not in niveaux

    return {
        "total": len(fichiers),
        "fichiers": fichiers,
        "reference": reference,
        "ok": ok,
        "champs_manuels_requis": _champs_manuels_requis(fichiers),
        "releves_manquants": _releves_manquants(fichiers, dossier_carnet, jour or date.today() - timedelta(days=1)),
        "journal_etapes": journal_etapes,
    }


def releves_presents(fichiers: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Relevés bancaires reconnus et exploitables aujourd'hui, par clé (voir RELEVES_ATTENDUS)."""
    presents: dict[str, dict[str, Any]] = {}
    for f in fichiers:
        cle = cle_releve(f.get("type_detecte"), f.get("cle_rib"), f.get("numero_compte_pdf"))
        if cle is None or f["niveau"] == "bloquant" or f.get("solde_releve") is None:
            continue
        presents.setdefault(cle, f)
    return presents


def _releves_manquants(
    fichiers: list[dict[str, Any]], dossier_carnet: Optional[str], jour: date
) -> list[dict[str, Any]]:
    """Relevés attendus mais absents aujourd'hui, avec la valeur de la veille si le carnet la connaît."""
    presents = releves_presents(fichiers)
    carnet_lu = carnet.lire(dossier_carnet and os.path.join(dossier_carnet, carnet.NOM_FICHIER)) if dossier_carnet else {}
    manquants = []
    for cle, (libelle, _banque, _agence) in RELEVES_ATTENDUS.items():
        if cle in presents:
            continue
        manquants.append({
            "cle": cle,
            "libelle": libelle,
            "veille": carnet.valeur_de_la_veille(carnet_lu, cle, jour),
        })
    return manquants


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
