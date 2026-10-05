"""Règles de rattachement des relevés bancaires aux lignes « banques » du classeur
« Synthèse » (lignes 28 à 34), déduites en explorant les relevés réels du 02/10/2026
(voir CLAUDE.md §26) et confirmées par l'utilisateur le même jour.

CCA-Bank et Afriland First Bank partagent exactement le même gabarit de texte
(« EXTRAIT DE COMPTE », nom de la banque en image illisible) : seul le champ
« Code client » permet de les distinguer. Connu sur 6 comptes CCA-Bank (toujours
735378) et un seul compte Afriland (00000984487, compte « Lori Autres Inst Fina »).
Un « Code client » qui ne correspond à aucun des deux n'est jamais deviné : le
fichier reste non rattaché, avec un message clair (règle CLAUDE.md 3.5).
"""

from __future__ import annotations

CODE_CLIENT_CCA_BANK = "735378"
CODES_CLIENT_AFRILAND_CONNUS: tuple[str, ...] = ("00000984487",)

# Clé RIB (2 derniers chiffres du champ « Numéro de compte ») -> agence, pour les comptes
# CCA-Bank. Table à étendre si de nouveaux comptes sont découverts : ne jamais deviner une
# clé absente d'ici, un compte non reconnu doit rester signalé plutôt que silencieusement
# rattaché à une agence au hasard.
RIB_CCA_VERS_AGENCE: dict[str, str] = {
    "12": "akwa",
    "39": "akwa",  # Akwa cumule au moins 2 comptes CCA-Bank (12 et 39).
    "86": "mokolo",
    "76": "bafoussam",
    "29": "kousseri",
}

# Clé RIB réservée à la ligne Western Union (34) : jamais sommée dans CCA-BANK (28),
# même si le compte est structurellement un compte CCA-Bank/C-online.
RIB_CCA_WESTERN_UNION = "97"

# Clé RIB -> agence, pour Afriland (table réduite à 1 entrée connue au 02/10/2026).
RIB_AFRILAND_VERS_AGENCE: dict[str, str] = {
    "65": "akwa",  # Compte « Lori Autres Inst Fina ».
}

# Montants fixes (bons de caisse / dépôts à terme) confirmés par l'utilisateur le
# 02/10/2026 : ils ne bougent jamais et ne doivent jamais être remplacés par une lecture
# de relevé. Clé : (banque, agence). Valeur : la liste des termes fixes à additionner
# (ordre conservé tel qu'observé dans le classeur du 01/10/2026, pour la lisibilité).
BONS_DE_CAISSE: dict[tuple[str, str], list[int]] = {
    ("cca_bank", "akwa"): [510_000_000, 151_847_746],
    ("afriland", "akwa"): [1_000_000, 500_000_000],
    ("uba", "akwa"): [10_000_000],
}

# Champs toujours saisis à la main (aucune lecture automatisée prévue) + le cas
# conditionnel de Western Union (en secours uniquement, si son relevé est absent).
CHAMPS_MANUELS_TOUJOURS: tuple[str, ...] = (
    "uv_orange",
    "uv_mtn",
    "uv_maviance",
    "uba_solde_banque",
    "ecobank",
    "access_bank",
)
CHAMP_MANUEL_WESTERN_UNION_SECOURS = "western_union_secours"

# Libellés humains des champs manuels, pour l'interface (fenêtre unique de saisie).
LIBELLE_CHAMP_MANUEL: dict[str, str] = {
    "uv_orange": "UV Orange Money",
    "uv_mtn": "UV MTN MoMo",
    "uv_maviance": "Solde Maviance (UV)",
    "uba_solde_banque": "UBA — solde en banque (hors bon de caisse)",
    "ecobank": "Ecobank",
    "access_bank": "Access Bank",
    "western_union_secours": "Western Union (relevé absent aujourd'hui)",
}

# Relevés attendus chaque jour, identifiés par une clé stable (voir carnet.py).
# Valeur : (libellé, banque cible, agence cible). Décision du 03/10/2026.
RELEVES_ATTENDUS: dict[str, tuple[str, str, str]] = {
    "cca:12": ("CCA-Bank — Akwa (compte 01773537801)", "cca_bank", "akwa"),
    "cca:39": ("CCA-Bank — Akwa (compte 01773537807)", "cca_bank", "akwa"),
    "cca:86": ("CCA-Bank — Mokolo (compte 01773537802)", "cca_bank", "mokolo"),
    "cca:76": ("CCA-Bank — Bafoussam (compte 01773537803)", "cca_bank", "bafoussam"),
    "cca:29": ("CCA-Bank — Kousseri (compte 01773537806)", "cca_bank", "kousseri"),
    "cca:97": ("CCA-Bank — Western Union (compte 01773537805)", "western_union", "akwa"),
    "afriland:65": ("Afriland — compte Lori (09844871001)", "afriland", "akwa"),
    "bgfi:70024583011": ("BGFI — compte 70024583011", "bgfi", "akwa"),
    "bgfi:70024583012": ("BGFI — compte 70024583012", "bgfi", "akwa"),
    "bgfi:70024583013": ("BGFI — compte 70024583013", "bgfi", "akwa"),
}


def cle_releve(type_detecte: str | None, cle_rib: str | None, numero_compte_pdf: str | None) -> str | None:
    """Clé stable d'un relevé lu : « cca:12 », « afriland:65 », « bgfi:70024583011 »."""
    if type_detecte == "releve_cca" and cle_rib:
        return f"cca:{cle_rib}"
    if type_detecte == "releve_afriland" and cle_rib:
        return f"afriland:{cle_rib}"
    if type_detecte == "releve_bgfi" and numero_compte_pdf:
        return f"bgfi:{numero_compte_pdf}"
    return None

# Bon de caisse permanent déjà présent dans le solde lu sur certains relevés (constaté le 03/10/2026
# sur Afriland : solde lu 559 242 921, dont 500 000 000 de bon). Le bon est ajouté par la formule
# du classeur : il est donc retiré du solde lu avant écriture, pour ne jamais le compter deux fois.
BON_INCLUS_DANS_RELEVE: dict[str, int] = {"afriland:65": 500_000_000}
