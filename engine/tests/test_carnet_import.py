import os
import sys
from datetime import date

import openpyxl

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))
from aide_modele import poser_libelles

from orisflow_engine import carnet


def _classeur(dossier, cellules):
    """Classeur de trésorerie minimal : feuille « Synthèse » avec les cellules données."""
    classeur = openpyxl.Workbook()
    feuille = classeur.active
    feuille.title = "Synthèse"
    poser_libelles(feuille)
    for adresse, valeur in cellules.items():
        feuille[adresse] = valeur
    chemin = os.path.join(dossier, "TRESORERIE JOURNALIÈRE et TDB DU  02 10 2026.xlsx")
    classeur.save(chemin)
    return chemin


def test_import_cca_akwa_retrouve_chaque_compte(tmp_path):
    chemin = _classeur(tmp_path, {"C28": "=510000000+151847746+199692276+5051695"})
    jour, soldes, avertissements = carnet.extraire_soldes_classeur(chemin)
    assert jour == date(2026, 10, 2)
    assert soldes["cca:12"] == 199692276
    assert soldes["cca:39"] == 5051695
    assert avertissements == []


def test_import_bgfi_dans_l_ordre_des_comptes(tmp_path):
    # Termes triés par numéro de compte : 011, 012, 013.
    chemin = _classeur(tmp_path, {"C30": "=36820915+25548218+15278821"})
    _, soldes, _ = carnet.extraire_soldes_classeur(chemin)
    assert soldes["bgfi:70024583011"] == 36820915
    assert soldes["bgfi:70024583012"] == 25548218
    assert soldes["bgfi:70024583013"] == 15278821


def test_import_ignore_une_cellule_ambigue_et_le_signale(tmp_path):
    chemin = _classeur(tmp_path, {"C28": "=510000000+151847746+199692276"})  # un seul terme pour deux comptes
    _, soldes, avertissements = carnet.extraire_soldes_classeur(chemin)
    assert "cca:12" not in soldes and "cca:39" not in soldes
    assert any("impossible de les distinguer" in a for a in avertissements)


def test_import_ne_modifie_pas_le_classeur_source(tmp_path):
    chemin = _classeur(tmp_path, {"C28": "=510000000+151847746+199692276+5051695"})
    avant = open(chemin, "rb").read()
    carnet.extraire_soldes_classeur(chemin)
    assert open(chemin, "rb").read() == avant
