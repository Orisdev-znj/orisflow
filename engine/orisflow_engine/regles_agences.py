"""Règles d'identification des agences, reprises à l'identique du script actuel.

Source : `Automation/Tresorerie/remplissage_tresorerie.py` (copie de référence :
`TRESORERIE_ORIS`), fonctions `AGENCE_COLONNE`, `CAISSE_LIGNE` et `detecter_agence`,
lu en entier le 26/09/2026. Reprises ici à l'identique pour ne jamais diverger
d'un comportement déjà validé en production (règle CLAUDE.md : ne pas deviner
une règle comptable si elle existe déjà ailleurs).
"""

from __future__ import annotations

import re
import unicodedata
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
    """Reproduit `detecter_agence` du script B : préfixe du nom, puis code agence.

    Le code agence doit apparaître comme un jeton isolé (pas collé à un autre chiffre ou
    lettre) : trouvé le 03/10/2026 sur un fichier brut pas encore renommé
    (« ETListeCompte_NoHeader_0006870_100007fadde8d1a0fd6c5079-5bf7.xls ») — l'identifiant
    technique « 100007fadde... » contient par coïncidence « 10000 » (code du Siège), ce qui
    aurait affecté silencieusement le fichier au Siège sans rapport avec sa vraie agence.
    Le script B d'origine n'avait jamais ce problème : il ne traitait que des fichiers déjà
    renommés par l'utilisateur, jamais ces noms bruts."""
    nom = nom_fichier.rsplit(".", 1)[0].lower()

    for alias, cle in _ALIAS_NOM.items():
        if nom.startswith(alias):
            return AgenceDetectee(cle, AGENCE_LIBELLES[cle], "nom")

    for code, cle in CODE_AGENCE.items():
        if re.search(rf"(?<![0-9a-z]){code}(?![0-9a-z])", nom):
            return AgenceDetectee(cle, AGENCE_LIBELLES[cle], "code")

    return AgenceDetectee(None, None, "aucune")


def _normaliser(texte: str) -> str:
    """Majuscules, sans accents, sans ponctuation — pour comparer des libellés
    d'origines différentes (nom de fichier, texte lu dans un PDF)."""
    texte = unicodedata.normalize("NFKD", texte).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^A-Z0-9]+", " ", texte.upper()).strip()


_VILLES_A_IGNORER = ("DOUALA", "YAOUNDE")


def detecter_agence_depuis_texte(texte: str) -> AgenceDetectee:
    """Reconnaît l'agence à partir d'un texte libre lu dans un document (ex. la ligne
    « Groupe: DOUALA AKWA » d'une balance CloudBank), plutôt que d'un nom de fichier.

    Nécessaire pour les PDF de balance (classe 3, classe 5) : l'agence n'y est jamais
    indiquée dans le nom du fichier, seulement dans le contenu (constaté le 29/09/2026).
    """
    nettoye = _normaliser(texte)
    for ville in _VILLES_A_IGNORER:
        nettoye = nettoye.replace(ville, " ")
    nettoye = re.sub(r"\s+", " ", nettoye).strip()

    for cle, libelle in AGENCE_LIBELLES.items():
        libelle_norm = _normaliser(libelle)
        if libelle_norm and libelle_norm in nettoye:
            return AgenceDetectee(cle, libelle, "contenu_document")
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


def _normaliser_nom(nom: str) -> str:
    """Majuscules, espaces multiples réduits — les noms lus dans les fichiers ont parfois
    des espaces en trop (ex. « MATSIKOU KEGNE  », vu le 02/10/2026)."""
    return re.sub(r"\s+", " ", nom.strip().upper())


def detecter_agence_depuis_gestionnaire(
    gestionnaire: Optional[str], gestionnaires_vers_agence: dict[str, str]
) -> AgenceDetectee:
    """Reconnaît l'agence via la table gestionnaire → agence configurée par l'utilisateur
    (écran Paramètres, démarré le 03/10/2026) : aucune règle métier devinée ici, la table
    est entièrement fournie par l'utilisateur (voir CLAUDE.md 3.5)."""
    if not gestionnaire or not gestionnaires_vers_agence:
        return AgenceDetectee(None, None, "aucune")
    nom_normalise = _normaliser_nom(gestionnaire)
    for nom_connu, agence_cle in gestionnaires_vers_agence.items():
        if _normaliser_nom(nom_connu) == nom_normalise and agence_cle in AGENCE_LIBELLES:
            return AgenceDetectee(agence_cle, AGENCE_LIBELLES[agence_cle], "gestionnaire")
    return AgenceDetectee(None, None, "aucune")


def deduire_agences_par_comptage(
    fichiers_sans_agence: list[tuple[str, int]],
    totaux_precedents: dict[str, int],
    agences_deja_utilisees: set[str],
    tolerance: float = 0.20,
) -> dict[str, tuple[str, float]]:
    """Affecte, par proximité du total de comptes à la veille, les fichiers dont l'agence
    n'a pu être déduite ni du nom ni du gestionnaire — demande du 03/10/2026 : l'utilisateur
    important toujours les 12 listes ensemble, Orisflow peut comparer le lot entier plutôt
    qu'un fichier isolé.

    `fichiers_sans_agence` : liste de (identifiant_fichier, total_comptes). Apparie en
    priorité les écarts les plus faibles (algorithme glouton), pour qu'un fichier ne « vole »
    pas l'agence la plus proche d'un autre fichier du même lot resté avec un moins bon score.
    Retourne {identifiant_fichier: (agence_cle, écart relatif)} — jamais une affectation
    silencieuse côté appelant : à afficher comme une suggestion à vérifier, pas une certitude.
    """
    candidats: list[tuple[float, str, int, str]] = []
    for identifiant, total_observe in fichiers_sans_agence:
        for agence_cle, total_veille in totaux_precedents.items():
            if agence_cle in agences_deja_utilisees or total_veille <= 0:
                continue
            ecart = abs(total_observe - total_veille) / total_veille
            if ecart <= tolerance:
                candidats.append((ecart, identifiant, total_observe, agence_cle))
    candidats.sort(key=lambda c: c[0])

    resultats: dict[str, tuple[str, float]] = {}
    agences_prises = set(agences_deja_utilisees)
    fichiers_assignes: set[str] = set()
    for ecart, identifiant, _total_observe, agence_cle in candidats:
        if identifiant in fichiers_assignes or agence_cle in agences_prises:
            continue
        resultats[identifiant] = (agence_cle, ecart)
        fichiers_assignes.add(identifiant)
        agences_prises.add(agence_cle)
    return resultats
