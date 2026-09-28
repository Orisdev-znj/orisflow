# -*- coding: utf-8 -*-
"""Génère le jeu de fichiers de test anonymisés (sprint 0 → Orisflow, 28/09/2026).

Ces fichiers reproduisent la STRUCTURE des extractions réelles (mêmes en-têtes,
mêmes colonnes, mêmes règles de format), avec des données entièrement fictives
(noms, numéros de compte, montants). Objectif : permettre de versionner des
exemples dans Git et de documenter le format attendu, sans jamais exposer de
donnée réelle de client ni de montant réel d'ORIS FINANCE.

Cas particulier reproduit : l'échange Bafoussam / Balessing du 10/09/2026
(voir CLAUDE.md, zone d'ombre T19), pour garder un exemple concret et testable
de ce que le contrôle de cohérence du sprint 2 doit détecter.

Relancer ce script régénère tous les fichiers à l'identique (aucun aléa).
"""
from __future__ import annotations

import os

from openpyxl import Workbook

# Piège openpyxl (constaté le 28/09/2026) : `feuille.append([])` n'avance PAS `max_row`
# (calculé à partir des cellules réellement écrites, pas d'un compteur de lignes). Une
# boucle `while feuille.max_row < cible: feuille.append([])` ne se termine donc jamais.
# Solution retenue : un nombre FIXE d'appends (comme dans `engine/tests/test_comptes.py`,
# qui fonctionne), jamais une condition basée sur `max_row`.

ICI = os.path.dirname(os.path.abspath(__file__))
DOSSIER = os.path.join(ICI, "anonymises")
os.makedirs(DOSSIER, exist_ok=True)


# ---------------------------------------------------------------------------
# Fichiers de comptes (format « *_Compte.xls » du script B)
# ---------------------------------------------------------------------------

ENTETE_COMPTE = [
    "N°", "Numero de compte", "Intitulé", "Date Ouverture", "Client",
    "Adresse", "Téléphone", "Autorisation", "Date d'échéance", "Solde",
]

# (préfixe compte à 5 chiffres, nom fictif) — un exemple par catégorie reconnue
# par `classer_compte`, plus deux préfixes NON reconnus (37350 Collectes, 37221
# Salariés) pour montrer que ces deux lignes restent à 0, comme dans le script B.
MODELE_COMPTES = [
    ("37110", "Client fictif A"),   # Courants
    ("37120", "Client fictif B"),   # Courants
    ("37220", "Client fictif C"),   # Chèques
    ("37225", "Client fictif D"),   # Chèques + Fonctionnaires (double comptage reproduit)
    ("37300", "Client fictif E"),   # Épargne
    ("37340", "Client fictif F"),   # Épargne (cas particulier)
    ("37420", "Client fictif G"),   # Garanties
    ("37350", "Client fictif H"),   # Collectes — non reconnu, doit rester à 0
    ("37221", "Client fictif I"),   # Préfixe 372 → compté en Chèques, PAS en Salariés
                                     # (aucune règle ne reconnaît les Salariés ; voir CLAUDE.md, zone d'ombre T3)
    ("98411", "Client fictif J"),   # Hors catégorie (comme en production)
]


def fabriquer_fichier_comptes(chemin: str, agence_affichee: str, nb_repetitions: int) -> None:
    classeur = Workbook()
    feuille = classeur.active
    feuille.title = "Feuille1"

    for _ in range(23):
        feuille.append([])
    feuille.append(ENTETE_COMPTE)  # 23 lignes vides + l'en-tête = ligne 24, comme dans les exports réels
    feuille["A2"] = f"Agence: {agence_affichee} (donnée fictive)"
    feuille["A15"] = "LISTE DES COMPTES CLIENTS (exemple anonymisé — aucune donnée réelle)"
    feuille["A18"] = "Periode 2024-10-14"

    ligne = 1
    for _ in range(nb_repetitions):
        for prefixe, nom in MODELE_COMPTES:
            numero = f"{prefixe}-{ligne:06d}-00"
            feuille.append([ligne, numero, nom, "01/01/2025", nom, "Adresse fictive", "600000000"])
            ligne += 1

    classeur.save(chemin)


# ---------------------------------------------------------------------------
# Fichiers « engagement » et « caisse » (format EtBalance, header ligne 9)
# ---------------------------------------------------------------------------

ENTETE_BALANCE = [
    "", "Agence", "Compte", "Intitule", "Debit_debut", "Credit_debut",
    "Debit_mvt", "Credit_mvt", "Debit_fin", "Credit_fin",
]


def fabriquer_fichier_engagement(chemin: str, agence_affichee: str, montant_total: int) -> None:
    classeur = Workbook()
    feuille = classeur.active
    for _ in range(8):
        feuille.append([])
    feuille.append(ENTETE_BALANCE)  # 8 lignes vides + l'en-tête = ligne 9
    feuille.append(["", agence_affichee, "40200-000001-11", "Crédit fictif", 0, 0, montant_total, 0, montant_total, 0])
    feuille.append(["", agence_affichee, "", "TOTAL", 0, 0, montant_total, 0, montant_total, 0])
    feuille["A5"] = "Chapitre"
    feuille["B5"] = "3 a 3"  # déclenche la reconnaissance "engagement" (chapitre 3)
    classeur.save(chemin)


def fabriquer_fichier_caisse(chemin: str, agence_affichee: str, montant_caisse: int) -> None:
    classeur = Workbook()
    feuille = classeur.active
    for _ in range(8):
        feuille.append([])
    feuille.append(ENTETE_BALANCE)  # 8 lignes vides + l'en-tête = ligne 9
    feuille.append(["", agence_affichee, "57100-000001-11", "Caisse fictive", 0, 0, montant_caisse, 0, montant_caisse, 0])
    feuille.append(["", agence_affichee, " Total : 57100", "TOTAL 5710", 0, 0, montant_caisse, 0, montant_caisse, 0])
    feuille["A5"] = "Chapitre"
    feuille["B5"] = "5 a 5"  # déclenche la reconnaissance "caisse" (chapitre 5)
    classeur.save(chemin)


# ---------------------------------------------------------------------------
# Classeur de référence minimal (feuille Synthèse + colonnes Q/R)
# ---------------------------------------------------------------------------

AGENCE_COLONNE = {
    "Siège": "B", "Akwa": "C", "Mokolo": "D", "Étoudi": "E", "Bafoussam": "F",
    "PK14": "G", "Balessing": "H", "Marché Central": "I", "Bépanda": "J",
    "Kousseri": "K", "Ndogpassi": "L", "Nkoabang": "M", "Ekounou": "N",
}


def fabriquer_classeur_reference(chemin: str) -> None:
    """Classeur minimal illustrant la structure réelle (Synthèse + colonnes Q/R),
    avec des totaux fictifs. Reproduit l'échange Bafoussam/Balessing du 10/09/2026
    (Bafoussam anormalement bas, Balessing anormalement haut) pour servir d'exemple
    au contrôle de cohérence du sprint 2.
    """
    classeur = Workbook()
    feuille = classeur.active
    feuille.title = "Synthèse"

    feuille["A3"] = "ELEMENTS"
    for nom, colonne in AGENCE_COLONNE.items():
        feuille[f"{colonne}3"] = nom.upper()

    feuille["A7"] = "COMPTES  COURANT ENTREPRISES"
    feuille["A16"] = "TOTAUX COMPTES "
    feuille["Q16"] = "Manus"
    feuille["A20"] = "ENCOURS  DEPOTS"
    feuille["Q20"] = "Manus"
    feuille["R20"] = "Fichiers PDF extrait du système"
    feuille["A28"] = "CCA-BANK"
    feuille["Q28"] = "Manus"
    feuille["R28"] = "Relevé bancaire au format PDF"

    # Valeurs alignées sur les totaux réellement produits par les fixtures de comptes
    # (10 comptes catégorisés par répétition du modèle) : Akwa (3 répétitions → 30) colle à
    # sa propre veille, sans avertissement. Bafoussam et Balessing sont VOLONTAIREMENT
    # échangés (comme le 10/09/2026 réel) : la veille de Bafoussam (80) est en fait le total
    # de Balessing, et inversement (10) — de quoi faire déclencher la suggestion du sprint 2.
    totaux_fictifs = {
        "Siège": 0, "Akwa": 30, "Mokolo": 700, "Étoudi": 480, "Bafoussam": 80,
        "PK14": 720, "Balessing": 10,
        "Marché Central": 390, "Bépanda": 350, "Kousseri": 240, "Ndogpassi": 115,
        "Nkoabang": 165, "Ekounou": 160,
    }
    for nom, colonne in AGENCE_COLONNE.items():
        feuille[f"{colonne}16"] = totaux_fictifs[nom]

    classeur.save(chemin)


def main() -> None:
    fabriquer_fichier_comptes(os.path.join(DOSSIER, "Akwa_Compte.xlsx"), "AKWA (FICTIF)", nb_repetitions=3)
    fabriquer_fichier_comptes(
        os.path.join(DOSSIER, "Bafoussam_Compte.xlsx"), "BAFOUSSAM (FICTIF)", nb_repetitions=1
    )  # volontairement petit : simule le fichier « échangé » avec Balessing
    fabriquer_fichier_comptes(
        os.path.join(DOSSIER, "Balessing_Compte.xlsx"), "BALESSING (FICTIF)", nb_repetitions=8
    )  # volontairement gros : total proche de celui attendu pour Bafoussam
    # Noms volontairement proches des vrais exports serveur (« EtBalance… »), sans les mots
    # « engagement »/« caisse » dans le nom : cela force le moteur à utiliser la détection
    # par le contenu (case « Chapitre »), comme il devrait le faire sur les vrais fichiers
    # de ce type (voir CLAUDE.md §6, T23 : aucun exemple réel de ce format n'est disponible
    # au 28/09/2026, ce sont donc des exemples de STRUCTURE, pas des exports authentiques).
    fabriquer_fichier_engagement(os.path.join(DOSSIER, "Akwa_EtBalance_Exemple_Chapitre3.xlsx"), "AKWA (FICTIF)", 12_345_000)
    fabriquer_fichier_caisse(os.path.join(DOSSIER, "Akwa_EtBalance_Exemple_Chapitre5.xlsx"), "AKWA (FICTIF)", 5_678_000)
    fabriquer_classeur_reference(
        os.path.join(DOSSIER, "TRESORERIE JOURNALIÈRE et TDB DU  10 09 2026 (EXEMPLE ANONYMISÉ).xlsx")
    )
    print("Fixtures générées dans", DOSSIER)


if __name__ == "__main__":
    main()
