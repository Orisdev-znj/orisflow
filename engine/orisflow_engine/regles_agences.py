"""Règles d'identification des agences, reprises à l'identique du script actuel.

Source : `Automation/Tresorerie/remplissage_tresorerie.py` (copie de référence :
`TRESORERIE_ORIS`), fonctions `AGENCE_COLONNE`, `CAISSE_LIGNE` et `detecter_agence`,
lu en entier le 26/09/2026. Reprises ici à l'identique pour ne jamais diverger
d'un comportement déjà validé en production (règle CLAUDE.md : ne pas deviner
une règle comptable si elle existe déjà ailleurs).
"""

from __future__ import annotations

from typing import NamedTuple, Optional

# Ordre du classeur « Synthèse » (colonnes B à N).
AGENCE_LIBELLES: dict[str, str] = {
    "siege": "Siège",
    "akwa": "Akwa",
    "mokolo": "Mokolo",
    "etoudi": "Étoudi",
    "bafoussam": "Bafoussam",
    "pk14": "PK14",
    "balessing": "Balessing",
    "marchecentral": "Marché Central",
    "bepanda": "Bépanda",
    "kousseri": "Kousseri",
    "ndogpassi": "Ndogpassi",
    "nkoabang": "Nkoabang",
    "ekounou": "Ekounou",
}

# Alias de nom de fichier vers la clé d'agence (script B : AGENCE_COLONNE).
_ALIAS_NOM: dict[str, str] = {
    "siege": "siege",
    "akwa": "akwa",
    "mokolo": "mokolo",
    "etoudi": "etoudi",
    "bafoussam": "bafoussam",
    "pk14": "pk14",
    "balessing": "balessing",
    "marchecentral": "marchecentral",
    "marche_central": "marchecentral",
    "bepanda": "bepanda",
    "kousseri": "kousseri",
    "ndogpassi": "ndogpassi",
    "nkoabang": "nkoabang",
    "ekounou": "ekounou",
}

# Code agence présent dans les noms de fichiers générés par le serveur (script B : CODE_AGENCE).
CODE_AGENCE: dict[str, str] = {
    "10000": "siege",
    "10001": "akwa",
    "10002": "pk14",
    "10003": "bepanda",
    "10004": "ndogpassi",
    "20000": "mokolo",
    "20001": "etoudi",
    "20002": "marchecentral",
    "20003": "nkoabang",
    "20004": "ekounou",
    "30000": "bafoussam",
    "30001": "balessing",
    "40000": "kousseri",
}

# Colonne du classeur « Synthèse » pour chaque agence (script B : AGENCE_COLONNE).
AGENCE_COLONNE: dict[str, str] = {
    "siege": "B", "akwa": "C", "mokolo": "D", "etoudi": "E", "bafoussam": "F",
    "pk14": "G", "balessing": "H", "marchecentral": "I", "bepanda": "J",
    "kousseri": "K", "ndogpassi": "L", "nkoabang": "M", "ekounou": "N",
}


class AgenceDetectee(NamedTuple):
    cle: Optional[str]           # ex. "bafoussam", ou None si non reconnue
    libelle: Optional[str]       # ex. "Bafoussam"
    confiance: str                # "nom" | "code" | "aucune"


def detecter_agence(nom_fichier: str) -> AgenceDetectee:
    """Reproduit `detecter_agence` du script B : préfixe du nom, puis code agence."""
    nom = nom_fichier.rsplit(".", 1)[0].lower()

    for alias, cle in _ALIAS_NOM.items():
        if nom.startswith(alias):
            return AgenceDetectee(cle, AGENCE_LIBELLES[cle], "nom")

    for code, cle in CODE_AGENCE.items():
        if code in nom:
            return AgenceDetectee(cle, AGENCE_LIBELLES[cle], "code")

    return AgenceDetectee(None, None, "aucune")


def agences_dont_le_total_serait_proche(
    total_observe: int, totaux_precedents: dict[str, int], tolerance: float = 0.05
) -> list[str]:
    """Agences dont le total de la veille est proche (± `tolerance`) du total observé.

    Sert à suggérer une agence de repli quand le total observé ne correspond pas
    du tout à l'agence détectée par le nom du fichier (cas réel du 10/09/2026 :
    Bafoussam et Balessing avaient échangé leurs colonnes).
    """
    suggestions = []
    for cle, total_veille in totaux_precedents.items():
        if total_veille <= 0:
            continue
        ecart = abs(total_observe - total_veille) / total_veille
        if ecart <= tolerance:
            suggestions.append(cle)
    return suggestions
