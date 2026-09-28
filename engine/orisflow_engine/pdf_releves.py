"""Reconnaissance des relevés bancaires PDF (texte, générés par ordinateur).

Sprint 2 : reconnaître le gabarit et extraire le numéro de compte, pour pouvoir
plus tard (sprint 5) les rattacher à une ligne « banques » du classeur. La lecture
de la valeur (solde) n'est pas encore faite ici.

Gabarits identifiés le 28/09/2026 sur des exemples réels (`Téléchargements\\Statements`) :
- CCA-Bank : « EXTRAIT DE COMPTE », numéro du type 10038-01773537801-12.
- BGFI     : « RELEVÉ DE COMPTE », numéro purement numérique (ex. 70024583011).
"""

from __future__ import annotations

import re
from typing import NamedTuple, Optional

try:
    # Nom d'import recommandé (l'ancien nom « fitz » affiche un avertissement sur
    # sa sortie standard, ce qui casse le flux JSON échangé avec Electron).
    import pymupdf as fitz
except ImportError:  # pragma: no cover - absent seulement si la dépendance manque
    fitz = None

_MOTIF_CCA = re.compile(r"num[ée]ro de compte\s*:?\s*([\d]{4,5}-[\d]{6,}-[\d]{1,2})", re.IGNORECASE)
_MOTIF_BGFI = re.compile(r"^\s*(\d{9,12})\s*$", re.MULTILINE)


class ReleveDetecte(NamedTuple):
    type_detecte: str          # "releve_cca" | "releve_bgfi" | "releve_bancaire" | "illisible"
    banque_libelle: Optional[str]
    numero_compte: Optional[str]


def _texte_premiere_page(chemin: str) -> str:
    if fitz is None:
        raise RuntimeError("La lecture de PDF (PyMuPDF) n'est pas installée.")
    document = fitz.open(chemin)
    try:
        if document.page_count == 0:
            return ""
        return document[0].get_text()
    finally:
        document.close()


def detecter_releve(chemin: str) -> ReleveDetecte:
    try:
        texte = _texte_premiere_page(chemin)
    except Exception:
        return ReleveDetecte("illisible", None, None)

    if not texte.strip():
        return ReleveDetecte("illisible", None, None)

    majuscules = texte.upper()
    if "EXTRAIT DE COMPTE" in majuscules:
        correspondance = _MOTIF_CCA.search(texte)
        return ReleveDetecte("releve_cca", "CCA-Bank", correspondance.group(1) if correspondance else None)

    if "RELEV" in majuscules and "COMPTE" in majuscules:
        correspondance = _MOTIF_BGFI.search(texte)
        return ReleveDetecte("releve_bgfi", "BGFI", correspondance.group(1) if correspondance else None)

    return ReleveDetecte("releve_bancaire", None, None)
