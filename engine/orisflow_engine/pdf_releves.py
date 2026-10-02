"""Reconnaissance des relevés bancaires PDF (texte, générés par ordinateur).

Gabarits identifiés le 28/09/2026 sur des exemples réels (`Téléchargements\\Statements`),
complétés le 02/10/2026 (voir CLAUDE.md §26) :
- CCA-Bank et Afriland First Bank : « EXTRAIT DE COMPTE », même gabarit exact, numéro du
  type 10038-01773537801-12 (les 2 derniers chiffres sont la clé RIB, qui identifie le
  compte — voir `regles_banques.py`). Le nom de la banque est une image (illisible par
  extraction de texte) : seul le champ « Code client » distingue les deux banques.
- BGFI : « RELEVÉ DE COMPTE », numéro purement numérique (ex. 70024583011), pas de clé
  RIB séparée sur la page lue.
"""

from __future__ import annotations

import re
from typing import NamedTuple, Optional

from .regles_banques import CODE_CLIENT_CCA_BANK, CODES_CLIENT_AFRILAND_CONNUS

try:
    # Nom d'import recommandé (l'ancien nom « fitz » affiche un avertissement sur
    # sa sortie standard, ce qui casse le flux JSON échangé avec Electron).
    import pymupdf as fitz
except ImportError:  # pragma: no cover - absent seulement si la dépendance manque
    fitz = None

_MOTIF_NUMERO_COMPTE = re.compile(r"num[ée]ro de compte\s*:?\s*([\d]{4,5}-[\d]{6,}-[\d]{1,2})", re.IGNORECASE)
_MOTIF_CLE_RIB = re.compile(r"num[ée]ro de compte\s*:?\s*\d{4,5}-\d{6,}-(\d{1,2})\b", re.IGNORECASE)
_MOTIF_CODE_CLIENT = re.compile(r"code client\s*:?\s*([0-9]+)", re.IGNORECASE)
_MOTIF_BGFI_COMPTE = re.compile(r"^\s*(\d{9,12})\s*$", re.MULTILINE)

# « Solde (XAF) au JJ/MM/AAAA : N » — le solde final d'un relevé CCA-Bank/Afriland.
# Ne confond jamais avec « Solde initial (XAF) : N » (pas de « au DATE ») : recherche le
# DERNIER motif trouvé (texte lu page par page, la dernière page porte le solde final).
_MOTIF_SOLDE_EXTRAIT = re.compile(
    r"Solde\s*\(XAF\)\s*au\s*\d{2}/\d{2}/\d{4}\s*:?\s*([\d\s]+)", re.IGNORECASE
)
# « SOLDE DISPONIBLE au JJ/MM/AAAA XAF : N,00 » — le solde final d'un relevé BGFI. Ne
# confond jamais avec « SOLDE PRÉCÉDENT AU ... » (mot « DISPONIBLE » exigé explicitement).
_MOTIF_SOLDE_BGFI = re.compile(
    r"SOLDE\s+DISPONIBLE\s+au\s+\d{2}/\d{2}/\d{4}\s*XAF\s*:?\s*([\d\s]+)[.,]", re.IGNORECASE
)


class ReleveDetecte(NamedTuple):
    type_detecte: str          # "releve_cca" | "releve_afriland" | "releve_bgfi" | "releve_bancaire" | "illisible"
    banque_libelle: Optional[str]
    numero_compte: Optional[str]
    cle_rib: Optional[str]     # uniquement CCA-Bank/Afriland
    code_client: Optional[str]  # uniquement CCA-Bank/Afriland
    solde: Optional[int]       # solde final lu dans le relevé, quand trouvé


def _texte_toutes_pages(chemin: str) -> str:
    if fitz is None:
        raise RuntimeError("La lecture de PDF (PyMuPDF) n'est pas installée.")
    document = fitz.open(chemin)
    try:
        return "\n".join(page.get_text() for page in document)
    finally:
        document.close()


def _nombre_depuis_texte(brut: str) -> Optional[int]:
    nettoye = brut.replace(" ", "").replace("\xa0", "").strip()
    nettoye = re.sub(r"[.,]\d{0,2}$", "", nettoye)  # retire un éventuel ",00" ou ".00" final
    try:
        return int(nettoye)
    except ValueError:
        return None


def lire_cle_rib(texte: str) -> Optional[str]:
    correspondance = _MOTIF_CLE_RIB.search(texte)
    return correspondance.group(1) if correspondance else None


def lire_code_client(texte: str) -> Optional[str]:
    correspondance = _MOTIF_CODE_CLIENT.search(texte)
    return correspondance.group(1) if correspondance else None


def lire_solde_releve(texte: str) -> Optional[int]:
    """Le solde final du relevé (dernier motif trouvé : la dernière page d'un relevé
    multi-pages porte le solde le plus récent)."""
    correspondances = _MOTIF_SOLDE_EXTRAIT.findall(texte)
    if correspondances:
        return _nombre_depuis_texte(correspondances[-1])
    correspondances = _MOTIF_SOLDE_BGFI.findall(texte)
    if correspondances:
        return _nombre_depuis_texte(correspondances[-1])
    return None


def detecter_releve(chemin: str) -> ReleveDetecte:
    try:
        texte = _texte_toutes_pages(chemin)
    except Exception:
        return ReleveDetecte("illisible", None, None, None, None, None)

    if not texte.strip():
        return ReleveDetecte("illisible", None, None, None, None, None)

    majuscules = texte.upper()
    if "EXTRAIT DE COMPTE" in majuscules:
        numero = _MOTIF_NUMERO_COMPTE.search(texte)
        cle_rib = lire_cle_rib(texte)
        code_client = lire_code_client(texte)
        solde = lire_solde_releve(texte)
        if code_client == CODE_CLIENT_CCA_BANK:
            type_detecte, banque = "releve_cca", "CCA-Bank"
        elif code_client in CODES_CLIENT_AFRILAND_CONNUS:
            type_detecte, banque = "releve_afriland", "Afriland First Bank"
        else:
            # Code client ni CCA-Bank ni Afriland connu : jamais deviné, signalé comme
            # relevé bancaire non rattaché (voir classification.py).
            type_detecte, banque = "releve_bancaire", None
        return ReleveDetecte(
            type_detecte, banque, numero.group(1) if numero else None, cle_rib, code_client, solde
        )

    if "RELEV" in majuscules and "COMPTE" in majuscules:
        correspondance = _MOTIF_BGFI_COMPTE.search(texte)
        solde = lire_solde_releve(texte)
        return ReleveDetecte(
            "releve_bgfi", "BGFI", correspondance.group(1) if correspondance else None, None, None, solde
        )

    return ReleveDetecte("releve_bancaire", None, None, None, None, None)
