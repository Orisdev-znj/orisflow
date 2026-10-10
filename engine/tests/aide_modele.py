"""Libellés de la colonne A de « Synthèse », tels que dans les classeurs réels d'octobre 2026,
aux numéros de ligne habituels — pour les classeurs modèles fabriqués par les tests."""

LIBELLES_REELS = {
    7: "COMPTES  COURANT ENTREPRISES",
    8: "COMPTES  CHEQUE",
    9: "COMPTES EPARGNE",
    10: "COMPTES DE GARANTIES",
    11: "COMPTES COLLECTES",
    12: "COMPTES FONCTIONNAIRES",
    13: "COMPTES SALRIÉS SECTEUR PRIVÉ",
    14: "COMPTES ASSOCIATIONS",
    15: "AUTRES COMPTES",
    16: "TOTAUX COMPTES",
    17: "TOTAUX COMPTES J-1",
    18: "VARIATIONS TOTAUX COMPTES",
    20: "ENCOURS  DEPOTS",
    21: "ENCOURS DE DEPOTS J-1",
    22: "INCREMENTAL DEPOTS",
    23: "ENCOURS ENGAGEMENTS",
    24: "ENCOURS ENGAGEMENTS j-1",
    25: "variation ENGAGEMENTS",
    28: "CCA-BANK",
    29: "AFRILAND FIRST BANK",
    30: "BGFI BANK",
    31: "UBA",
    32: "ACCESS BANK",
    33: "ECOBANK",
    34: "WERSTERN UNION",
    35: "TOTAL BANQUES",
    36: "TOTAL BANQUES J-1",
    37: "VARIATIONS TOTAL BANQUES",
    56: "UV ORANGE MONEY",
    57: "UV MTN MoMo",
    58: "SOLDE MAVIANCE ( UV)",
    81: "ENVOIS WESTERN UNION",
    82: "PMT WESTERN UNION",
}


def poser_libelles(feuille, sauf=()):
    for ligne, libelle in LIBELLES_REELS.items():
        if ligne not in sauf:
            feuille[f"A{ligne}"] = libelle
