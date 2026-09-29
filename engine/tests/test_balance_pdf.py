"""Tests du sprint 5 (29/09/2026) : lecture des balances CloudBank classe 3 et classe 5.

Règle vérifiée sur les 12 agences réelles (voir CLAUDE.md §19-20) :
- dépôts      = « Total Classe : 3 » → Crédit Solde fin
- engagements = « Total Classe : 3 » → Débit Solde fin
- caisse      = « Total : 57 »       → Débit Solde fin

Les PDF synthétiques ci-dessous reproduisent la mise en page réelle (mêmes
positions de colonnes) sans utiliser de données réelles.
"""

import os
import sys

import pymupdf

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from orisflow_engine.balance_pdf import (
    detecter_type_balance,
    lire_agence,
    lire_balance_classe3,
    lire_balance_classe5,
)

# Positions des colonnes observées sur les vrais documents CloudBank (voir CLAUDE.md §19.1).
ANCRES = [231, 291, 351, 411, 471, 531]
DECALAGE = 21


def _fabriquer_balance(chemin, chapitre, groupe, valeurs_6_colonnes):
    """valeurs_6_colonnes : [Débit début, Crédit début, Débit MVT, Crédit MVT, Débit fin, Crédit fin]."""
    document = pymupdf.open()
    page = document.new_page()
    page.insert_text((10, 50), f"Balance generale consolidée   Chapitre de : {chapitre}  à : {chapitre}")
    page.insert_text((10, 70), f"Groupe: {groupe}   {groupe}")

    # En-tête (mêmes positions que le vrai document)
    page.insert_text((10, 150), "Compte")
    page.insert_text((71, 150), "Intitulé")
    for i, x in enumerate(ANCRES):
        page.insert_text((x, 150), "Debit" if i % 2 == 0 else "Crédit")

    # Ligne totale
    libelle = f"Total Classe : {chapitre}" if chapitre == "3" else "Total : 57"
    page.insert_text((10, 175), f"{libelle} INTITULE TEST")
    for x, valeur in zip(ANCRES, valeurs_6_colonnes):
        page.insert_text((x + DECALAGE, 175), str(valeur))

    document.save(chemin)
    document.close()


def test_detecte_le_type_balance_classe3(tmp_path):
    chemin = tmp_path / "test_c3.pdf"
    _fabriquer_balance(chemin, "3", "TEST AKWA", [1, 2, 3, 4, 5, 6])
    assert detecter_type_balance(str(chemin)) == "balance_classe3"


def test_detecte_le_type_balance_classe5(tmp_path):
    chemin = tmp_path / "test_c5.pdf"
    _fabriquer_balance(chemin, "5", "TEST AKWA", [1, 2, 3, 4, 5, 6])
    assert detecter_type_balance(str(chemin)) == "balance_classe5"


def test_lit_les_depots_et_engagements_classe3(tmp_path):
    chemin = tmp_path / "test_c3.pdf"
    # Débit début=100, Crédit début=200, Débit MVT=300, Crédit MVT=400, Débit fin=500 (engagements), Crédit fin=600 (dépôts)
    _fabriquer_balance(chemin, "3", "DOUALA AKWA", [100, 200, 300, 400, 500, 600])

    resultat = lire_balance_classe3(str(chemin))

    assert resultat["depots"] == 600       # Crédit Solde fin
    assert resultat["engagements"] == 500  # Débit Solde fin


def test_lit_la_caisse_classe5(tmp_path):
    chemin = tmp_path / "test_c5.pdf"
    _fabriquer_balance(chemin, "5", "DOUALA PK14", [10, 20, 30, 40, 50000, 0])

    resultat = lire_balance_classe5(str(chemin))

    assert resultat["caisse"] == 50000  # Débit Solde fin


def test_agence_lue_dans_le_contenu_pas_le_nom_du_fichier(tmp_path):
    chemin = tmp_path / "peu_importe_le_nom_0000847.pdf"
    _fabriquer_balance(chemin, "3", "DOUALA AKWA", [0, 0, 0, 0, 0, 0])

    assert lire_agence(str(chemin)) == "DOUALA AKWA"


def test_fichier_sans_ligne_totale_renvoie_aucune_valeur(tmp_path):
    document = pymupdf.open()
    page = document.new_page()
    page.insert_text((10, 50), "Balance generale consolidée   Chapitre de : 3  à : 3")
    page.insert_text((10, 70), "Groupe: DOUALA AKWA   DOUALA AKWA")
    page.insert_text((10, 150), "Compte")
    page.insert_text((71, 150), "Intitulé")
    for i, x in enumerate(ANCRES):
        page.insert_text((x, 150), "Debit" if i % 2 == 0 else "Crédit")
    # Aucune ligne « Total Classe : 3 » sur cette page : la ligne totale manque.
    chemin = tmp_path / "test_sans_total.pdf"
    document.save(str(chemin))
    document.close()

    resultat = lire_balance_classe3(str(chemin))
    assert resultat["depots"] is None
    assert resultat["engagements"] is None
