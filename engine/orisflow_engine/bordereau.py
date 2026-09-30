"""Bordereau de transmission numérique (fonctionnalité proposée le 30/09/2026, démarrée
le même jour à la demande de l'utilisateur, en parallèle du sprint 5 de la Trésorerie).

Contexte et modèle de données détaillés dans `Orisflow/Contexte/Bordereau-Transmission-Documents.md`.

Contrairement à Trésorerie et États financiers (mono-poste), cette fonctionnalité est
multi-personnes : deux postes différents (expéditeur et destinataire) doivent voir le
même enregistrement. Architecture retenue (option C du document ci-dessus) : un journal
d'évènements par fichiers, sur un dossier réseau partagé (chemin fourni par l'appelant,
jamais en dur ici — voir règle CLAUDE.md 10.2).

- Une **transmission** crée un fichier `transmission_<horodatage>_<id>.json`, jamais
  modifié après coup.
- Un **évènement** (accusé de réception, pris en charge, traité, rejeté) crée un fichier
  `evenement_<horodatage>_<id>.json` référençant la transmission d'origine, jamais une
  modification d'un fichier existant.
- Le statut affiché d'une transmission est déduit du dernier évènement qui la concerne.
- Écriture atomique (fichier temporaire puis renommage) : un lecteur qui scanne le dossier
  au même moment qu'une écriture ne voit jamais un fichier à moitié écrit.

Cette approche évite tout serveur à héberger et tout risque de corruption par écriture
concurrente (contrairement à une base SQLite partagée sur un dossier réseau).
"""

from __future__ import annotations

import json
import os
import shutil
import unicodedata
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# Liste indicative, non contraignante (le moteur n'impose pas cette liste côté écriture :
# c'est l'interface qui guide l'utilisateur ; voir CLAUDE.md 10.2, aucune règle métier
# rigide sans validation explicite).
TYPES_DOCUMENT = ["Facture", "Courrier", "Contrat", "Rapport", "Pièce comptable", "Autre"]

TYPES_EVENEMENT = ("accuse_reception", "pris_en_charge", "traite", "rejete")

LIBELLE_STATUT: dict[Optional[str], str] = {
    None: "Transmis",
    "accuse_reception": "Reçu",
    "pris_en_charge": "Pris en charge",
    "traite": "Traité",
    "rejete": "Rejeté",
}

PREFIXE_TRANSMISSION = "transmission_"
PREFIXE_EVENEMENT = "evenement_"
SOUS_DOSSIER_PIECES_JOINTES = "pieces_jointes"


def _horodatage() -> str:
    return datetime.now().strftime("%Y%m%dT%H%M%S%f")


def _nouvel_identifiant() -> str:
    return uuid.uuid4().hex[:8]


def _ecrire_json_atomique(chemin: Path, donnees: dict[str, Any]) -> None:
    """Écrit un fichier temporaire puis le renomme : un lecteur concurrent (autre poste,
    même dossier réseau) ne voit jamais un fichier à moitié écrit."""
    chemin.parent.mkdir(parents=True, exist_ok=True)
    temporaire = chemin.with_suffix(chemin.suffix + ".tmp")
    with open(temporaire, "w", encoding="utf-8") as fichier:
        json.dump(donnees, fichier, ensure_ascii=False, indent=2)
    os.replace(temporaire, chemin)


def _nettoyer_nom_fichier(nom: str) -> str:
    """Un nom de pièce jointe sûr pour un système de fichiers (accents conservés, mais
    caractères interdits sous Windows retirés)."""
    nom = unicodedata.normalize("NFC", nom)
    return "".join(caractere for caractere in nom if caractere not in '\\/:*?"<>|').strip() or "piece_jointe"


def creer_transmission(
    dossier: str,
    expediteur: str,
    destinataire: str,
    document: str,
    type_document: str,
    piece_jointe_source: Optional[str] = None,
    urgence: Optional[str] = None,
    commentaire: Optional[str] = None,
) -> dict[str, Any]:
    """Enregistre une nouvelle transmission. Ne modifie jamais un fichier existant :
    crée uniquement un nouveau fichier `transmission_...json` (et, si une pièce jointe est
    fournie, une copie dans `<dossier>/pieces_jointes/`, jamais le fichier original)."""
    if not dossier:
        raise ValueError("Aucun dossier partagé n'est configuré pour le bordereau de transmission.")
    if not expediteur:
        raise ValueError("L'expéditeur n'est pas identifié (voir Paramètres → Votre identité).")
    if not destinataire:
        raise ValueError("Le destinataire est obligatoire.")
    if not document:
        raise ValueError("Le nom ou la description du document est obligatoire.")

    identifiant = _nouvel_identifiant()
    horodatage = _horodatage()

    nom_piece_jointe = None
    if piece_jointe_source:
        if not os.path.isfile(piece_jointe_source):
            raise ValueError("La pièce jointe sélectionnée est introuvable.")
        nom_original = _nettoyer_nom_fichier(os.path.basename(piece_jointe_source))
        nom_piece_jointe = f"{identifiant}_{nom_original}"
        chemin_copie = Path(dossier) / SOUS_DOSSIER_PIECES_JOINTES / nom_piece_jointe
        chemin_copie.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(piece_jointe_source, chemin_copie)  # jamais le fichier d'origine touché

    donnees = {
        "type": "transmission",
        "id": identifiant,
        "document": document,
        "type_document": type_document,
        "expediteur": expediteur,
        "destinataire": destinataire,
        # Précision à la microseconde : nécessaire pour trier fiablement deux transmissions
        # créées la même seconde (sinon l'ordre d'affichage devient instable).
        "date_transmission": datetime.now(timezone.utc).astimezone().isoformat(timespec="microseconds"),
        "piece_jointe": nom_piece_jointe,
        "urgence": urgence or None,
        "commentaire": commentaire or None,
    }
    chemin = Path(dossier) / f"{PREFIXE_TRANSMISSION}{horodatage}_{identifiant}.json"
    _ecrire_json_atomique(chemin, donnees)
    return donnees


def ajouter_evenement(
    dossier: str,
    transmission_id: str,
    type_evenement: str,
    auteur: str,
    commentaire: Optional[str] = None,
) -> dict[str, Any]:
    """Enregistre un évènement (accusé de réception, pris en charge, traité, rejeté) sur
    une transmission existante. Ne modifie jamais le fichier de la transmission d'origine :
    crée uniquement un nouveau fichier `evenement_...json`."""
    if not dossier:
        raise ValueError("Aucun dossier partagé n'est configuré pour le bordereau de transmission.")
    if type_evenement not in TYPES_EVENEMENT:
        raise ValueError(f"Type d'évènement inconnu : « {type_evenement} ».")
    if not auteur:
        raise ValueError("L'auteur de l'évènement n'est pas identifié (voir Paramètres → Votre identité).")
    if not transmission_id:
        raise ValueError("La transmission concernée est obligatoire.")

    identifiant = _nouvel_identifiant()
    horodatage = _horodatage()
    donnees = {
        "type": "evenement",
        "id": identifiant,
        "transmission_id": transmission_id,
        "type_evenement": type_evenement,
        "auteur": auteur,
        "date": datetime.now(timezone.utc).astimezone().isoformat(timespec="microseconds"),
        "commentaire": commentaire or None,
    }
    chemin = Path(dossier) / f"{PREFIXE_EVENEMENT}{horodatage}_{identifiant}.json"
    _ecrire_json_atomique(chemin, donnees)
    return donnees


def lister_transmissions(dossier: str) -> dict[str, Any]:
    """Scanne le dossier partagé et reconstruit l'état de chaque transmission (dernier
    évènement = statut actuel). Lecture seule : aucun fichier n'est modifié ici.

    Toujours en lecture seule, tolérant aux fichiers illisibles (un fichier corrompu ou en
    cours d'écriture par un autre poste est ignoré et signalé dans `erreurs_lecture`,
    plutôt que de faire échouer tout l'affichage — règle CLAUDE.md 3.6, distinguer ce qui
    est vérifié de ce qui est supposé)."""
    if not dossier or not os.path.isdir(dossier):
        return {"ok": True, "disponible": False, "transmissions": [], "erreurs_lecture": []}

    erreurs_lecture: list[str] = []
    transmissions: dict[str, dict[str, Any]] = {}
    evenements_par_transmission: dict[str, list[dict[str, Any]]] = {}

    for chemin in sorted(Path(dossier).glob(f"{PREFIXE_TRANSMISSION}*.json")):
        try:
            with open(chemin, "r", encoding="utf-8") as fichier:
                donnees = json.load(fichier)
            transmissions[donnees["id"]] = donnees
        except (json.JSONDecodeError, OSError, KeyError):
            erreurs_lecture.append(chemin.name)

    for chemin in sorted(Path(dossier).glob(f"{PREFIXE_EVENEMENT}*.json")):
        try:
            with open(chemin, "r", encoding="utf-8") as fichier:
                evenement = json.load(fichier)
            evenements_par_transmission.setdefault(evenement["transmission_id"], []).append(evenement)
        except (json.JSONDecodeError, OSError, KeyError):
            erreurs_lecture.append(chemin.name)

    resultats = []
    for identifiant, transmission in transmissions.items():
        evenements = sorted(
            evenements_par_transmission.get(identifiant, []), key=lambda evenement: evenement["date"]
        )
        dernier_type = evenements[-1]["type_evenement"] if evenements else None
        resultats.append(
            {
                **transmission,
                "statut": LIBELLE_STATUT.get(dernier_type, dernier_type),
                "evenements": evenements,
            }
        )

    resultats.sort(key=lambda transmission: transmission["date_transmission"], reverse=True)
    return {"ok": True, "disponible": True, "transmissions": resultats, "erreurs_lecture": erreurs_lecture}


def chemin_piece_jointe(dossier: str, nom_piece_jointe: str) -> str:
    """Chemin absolu d'une pièce jointe déjà enregistrée, pour l'ouvrir depuis l'interface."""
    return str(Path(dossier) / SOUS_DOSSIER_PIECES_JOINTES / nom_piece_jointe)
