"""Signature et empreinte d'un classeur généré.

L'empreinte est un hash (SHA-256) du CONTENU des cellules (formules et valeurs saisies),
hors cellule de signature elle-même. Elle ne dépend pas de la mise en forme ni de la façon
dont le fichier est enregistré (Excel, LibreOffice, openpyxl) : ouvrir et réenregistrer le
classeur sans rien changer ne la modifie pas. L'empreinte complète est consignée dans le
journal ; seule une version courte figure dans la cellule nommée « ORISFLOW_SIGNATURE ».
"""

from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Any, Optional

from openpyxl import load_workbook

from . import VERSION
from .chemins import chemin_lecture
from .structure_modele import NOM_CELLULE_SIGNATURE

LONGUEUR_COURTE = 12


def _normaliser(valeur: Any) -> str:
    if isinstance(valeur, bool):
        return f"b:{int(valeur)}"
    if isinstance(valeur, (int, float)):
        nombre = float(valeur)
        return f"n:{int(nombre)}" if nombre == int(nombre) else f"n:{nombre!r}"
    if isinstance(valeur, datetime):
        return f"d:{valeur.isoformat()}"
    texte = str(valeur).replace("\r\n", "\n").strip()
    if texte.startswith("="):
        texte = texte.replace(" ", "").upper()
    return f"s:{texte}"


def _cellule_signature(classeur) -> Optional[tuple[str, str]]:
    nom = classeur.defined_names.get(NOM_CELLULE_SIGNATURE)
    if nom is None:
        return None
    destinations = list(nom.destinations)
    if not destinations:
        return None
    feuille, adresse = destinations[0]
    return feuille, adresse.replace("$", "")


def calculer_empreinte(classeur) -> str:
    """Hash du contenu de toutes les cellules non vides, hors cellule de signature."""
    exclue = _cellule_signature(classeur)
    morceaux: list[str] = []
    for feuille in classeur.worksheets:
        for ligne in feuille.iter_rows():
            for cellule in ligne:
                if cellule.value is None:
                    continue
                if exclue and (feuille.title, cellule.coordinate) == exclue:
                    continue
                morceaux.append(f"{feuille.title}!{cellule.coordinate}={_normaliser(cellule.value)}")
    return hashlib.sha256("\n".join(morceaux).encode("utf-8")).hexdigest()


def libelle_mention(empreinte: str, horodatage: datetime, auteur: Optional[str]) -> str:
    par = f" par {auteur}" if auteur else ""
    return (f"Généré par Orisflow V{VERSION} le {horodatage.strftime('%d/%m/%Y à %H:%M')}{par} "
            f"— empreinte {empreinte[:LONGUEUR_COURTE].upper()}")


def signer_classeur(classeur, auteur: Optional[str], horodatage: Optional[datetime] = None) -> dict[str, Any]:
    """Écrit la mention dans la cellule nommée (si elle existe) et retourne la signature.
    Appelée juste avant l'enregistrement ; l'empreinte exclut la cellule de signature."""
    horodatage = horodatage or datetime.now()
    empreinte = calculer_empreinte(classeur)
    mention = libelle_mention(empreinte, horodatage, auteur)
    cible = _cellule_signature(classeur)
    avertissement = None
    if cible and cible[0] in classeur.sheetnames:
        classeur[cible[0]][cible[1]].value = mention
    else:
        avertissement = (f"La cellule nommée « {NOM_CELLULE_SIGNATURE} » est absente du modèle : "
                         "la mention n'est pas inscrite dans le classeur (l'empreinte reste consignée au journal).")
    return {
        "empreinte": empreinte,
        "empreinte_courte": empreinte[:LONGUEUR_COURTE].upper(),
        "horodatage": horodatage.isoformat(timespec="seconds"),
        "auteur": auteur,
        "version": VERSION,
        "mention": mention if not avertissement else None,
        "avertissement": avertissement,
    }


def verifier_fichier(chemin: str) -> dict[str, Any]:
    """Relit un classeur et retourne son empreinte actuelle et la mention inscrite (lecture seule)."""
    classeur = load_workbook(chemin_lecture(chemin))
    cible = _cellule_signature(classeur)
    mention = None
    if cible and cible[0] in classeur.sheetnames:
        mention = classeur[cible[0]][cible[1]].value
    return {"empreinte": calculer_empreinte(classeur), "mention": mention}
