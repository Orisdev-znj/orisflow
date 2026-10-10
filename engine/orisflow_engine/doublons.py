"""Détection des fichiers reçus en double.

Deux cas, traités différemment :
- **Doublon** : même contenu, ou mêmes valeurs utiles pour la même agence (un état
  CloudBank réexporté plusieurs fois). Un exemplaire est utilisé, les autres sont ignorés
  automatiquement (`est_doublon`) : ce n'est pas une anomalie, aucune action n'est requise.
- **Conflit** : plusieurs fichiers pour la même agence avec des valeurs différentes (ou
  illisibles). Orisflow ne peut pas savoir lequel est le bon : tous restent bloquants.
"""

from __future__ import annotations

import hashlib
import os
from typing import Any, Optional

from .chemins import chemin_lecture
from .regles_agences import AGENCE_LIBELLES

TYPES_RELEVES = ("releve_cca", "releve_afriland", "releve_bgfi")


def _dossier_court(f: dict[str, Any]) -> str:
    parties = os.path.normpath(os.path.dirname(f["chemin"])).split(os.sep)
    return os.sep.join(parties[-2:]) if len(parties) >= 2 else os.path.dirname(f["chemin"])


def _designation(reference: dict[str, Any], autre: dict[str, Any]) -> str:
    """« nom » du fichier de référence, avec son dossier quand les deux fichiers portent le
    même nom (sinon le message « identique à X » cite un nom indiscernable du fichier lui-même)."""
    if reference["nom"].lower() == autre["nom"].lower():
        return f"« {reference['nom']} » du dossier « {_dossier_court(reference)} »"
    return f"« {reference['nom']} »"


def _marquer_doublon(f: dict[str, Any], conserve: dict[str, Any], raison: str) -> None:
    f["niveau"] = "bloquant"
    f["est_doublon"] = True
    f["messages"].append(
        f"Doublon de {_designation(conserve, f)} ({raison}) : ignoré automatiquement, "
        "l'autre exemplaire est utilisé. Aucune action nécessaire."
    )


def detecter_fichiers_identiques(fichiers: list[dict[str, Any]]) -> None:
    """Contenu strictement identique (empreinte SHA-256), quel que soit le nom : le premier
    exemplaire est conservé, les suivants deviennent des doublons."""
    vus: dict[str, dict[str, Any]] = {}
    for f in fichiers:
        if f["type_detecte"] is None:
            continue
        lecture = chemin_lecture(f["chemin"])
        if not os.path.isfile(lecture):
            continue
        empreinte = hashlib.sha256()
        with open(lecture, "rb") as fichier:
            for bloc in iter(lambda: fichier.read(1 << 20), b""):
                empreinte.update(bloc)
        cle = empreinte.hexdigest()
        if cle in vus:
            _marquer_doublon(f, vus[cle], "contenu identique")
        else:
            vus[cle] = f


def cle_doublon(f: dict[str, Any]) -> Optional[tuple]:
    """D'habitude (type, agence). Pour les relevés, le compte précis (clé RIB ou numéro BGFI) :
    une agence peut légitimement recevoir plusieurs comptes d'une même banque (Akwa : 12 et 39)."""
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


def signature_valeurs(f: dict[str, Any]) -> Optional[tuple]:
    """Valeurs qui doivent concorder pour que deux fichiers soient un simple doublon, même
    si leur contenu binaire diffère (horodatage interne d'un réexport). None si illisibles :
    le fichier est alors traité comme un conflit, jamais résolu automatiquement."""
    type_detecte = f["type_detecte"]
    if type_detecte == "balance_classe3":
        if f.get("depots") is None or f.get("engagements") is None:
            return None
        return ("depots_engagements", f["depots"], f["engagements"])
    if type_detecte == "balance_classe5":
        return None if f.get("caisse") is None else ("caisse", f["caisse"])
    if type_detecte == "compte":
        return None if not f.get("comptages") else ("comptages", tuple(sorted(f["comptages"].items())))
    if type_detecte in TYPES_RELEVES:
        return None if f.get("solde_releve") is None else ("solde", f["solde_releve"])
    return None


def detecter_doublons(fichiers: list[dict[str, Any]], type_libelles: dict[str, str]) -> None:
    """Regroupe par `cle_doublon` les fichiers qui ne sont pas déjà des doublons de contenu.
    Valeurs toutes identiques : un exemplaire gardé, les autres doublons. Sinon : conflit."""
    groupes: dict[tuple, list[dict[str, Any]]] = {}
    for f in fichiers:
        if f.get("est_doublon"):
            continue
        cle = cle_doublon(f)
        if cle is not None:
            groupes.setdefault(cle, []).append(f)

    for (type_detecte, deuxieme_cle), groupe in groupes.items():
        if len(groupe) <= 1:
            continue
        if type_detecte in TYPES_RELEVES:
            designation = f"le compte {deuxieme_cle}"
        else:
            designation = AGENCE_LIBELLES.get(deuxieme_cle, deuxieme_cle)
        libelle_type = type_libelles.get(type_detecte, type_detecte)

        signatures = {signature_valeurs(f) for f in groupe}
        if len(signatures) == 1 and None not in signatures:
            conserve, *doublons = groupe
            for f in doublons:
                _marquer_doublon(f, conserve, f"mêmes valeurs pour {designation}")
            continue

        noms = [g["nom"] for g in groupe]
        noms_affiches = ", ".join(noms[:3]) + (f", … ({len(noms) - 3} autres)" if len(noms) > 3 else "")
        for f in groupe:
            f["niveau"] = "bloquant"
            f["messages"].append(
                f"{len(groupe)} fichiers correspondent à « {libelle_type} » pour {designation}, "
                f"avec des valeurs différentes : {noms_affiches}. Gardez le bon et décochez les autres."
            )
