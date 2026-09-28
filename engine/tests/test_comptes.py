import os
import sys

import openpyxl

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from orisflow_engine.comptes import compter_comptes, total_categorise

# Reproduit le format réel des extractions (voir CLAUDE.md §6) :
# en-tête en ligne 24, colonne « Numero de compte », données à partir de la ligne 25.
NUMEROS = [
    "37110-000001-00",  # Courants
    "37120-000002-00",  # Courants
    "37220-000003-00",  # Cheques (préfixe 372)
    "37221-000004-00",  # Cheques + Fonctionnaires si 37225... ici juste Cheques
    "37225-000005-00",  # Cheques ET Fonctionnaires (double comptage volontairement reproduit)
    "37300-000006-00",  # Epargne (préfixe 373)
    "37340-000007-00",  # Epargne (cas particulier)
    "37420-000008-00",  # Garanties
    "98411-000009-00",  # Non catégorisé (comme dans la production actuelle)
]


def _fabriquer_extraction(chemin):
    classeur = openpyxl.Workbook()
    feuille = classeur.active
    for _ in range(23):
        feuille.append([])
    feuille.append(["N°", "Numero de compte", "Intitulé"])  # ligne 24
    for i, numero in enumerate(NUMEROS, start=1):
        feuille.append([i, numero, "Client test"])
    classeur.save(chemin)


def test_compter_comptes_reproduit_les_regles_du_script_actuel(tmp_path):
    chemin = tmp_path / "Test_Compte.xlsx"
    _fabriquer_extraction(chemin)

    comptages = compter_comptes(chemin)

    assert comptages == {
        "Courants": 2,
        "Cheques": 3,      # 37220, 37221, 37225
        "Epargne": 2,      # 37300, 37340
        "Garanties": 1,
        "Fonctionnaires": 1,  # 37225, compté une seconde fois (double comptage connu, voir CLAUDE.md)
    }
    # Le total « brut » (ligne 16 du classeur) inclut ce double comptage, à l'identique de la production.
    assert total_categorise(comptages) == 9


def test_colonne_numero_absente_leve_une_erreur_claire(tmp_path):
    chemin = tmp_path / "Sans_Colonne.xlsx"
    classeur = openpyxl.Workbook()
    feuille = classeur.active
    for _ in range(23):
        feuille.append([])
    feuille.append(["N°", "Autre colonne"])
    classeur.save(chemin)

    try:
        compter_comptes(chemin)
        assert False, "une ValueError était attendue"
    except ValueError as erreur:
        assert "Numero de compte" in str(erreur)
