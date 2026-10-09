"""Tests du recalcul automatique d'un classeur via LibreOffice headless (10/10/2026)."""

import os
import sys

import openpyxl
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from orisflow_engine.recalcul import _trouver_soffice, nettoyer, recalculer_classeur


def _classeur_avec_formule_non_calculee(chemin):
    classeur = openpyxl.Workbook()
    feuille = classeur.active
    feuille["A1"] = 2
    feuille["A2"] = 3
    feuille["A3"] = "=A1+A2"  # openpyxl n'évalue jamais cette formule à l'écriture
    classeur.save(chemin)


@pytest.mark.skipif(_trouver_soffice() is None, reason="LibreOffice non installé sur ce poste")
def test_recalcule_une_formule_non_evaluee(tmp_path):
    chemin = tmp_path / "test.xlsx"
    _classeur_avec_formule_non_calculee(chemin)

    # Avant recalcul : openpyxl ne lit aucune valeur pour la formule.
    sans_recalcul = openpyxl.load_workbook(chemin, data_only=True)
    assert sans_recalcul.active["A3"].value is None

    chemin_recalcule = recalculer_classeur(str(chemin))
    try:
        assert chemin_recalcule is not None
        avec_recalcul = openpyxl.load_workbook(chemin_recalcule, data_only=True)
        assert avec_recalcul.active["A3"].value == 5
    finally:
        nettoyer(chemin_recalcule)


def test_ne_modifie_jamais_le_fichier_dorigine(tmp_path):
    chemin = tmp_path / "test.xlsx"
    _classeur_avec_formule_non_calculee(chemin)
    empreinte_avant = chemin.read_bytes()

    chemin_recalcule = recalculer_classeur(str(chemin))
    nettoyer(chemin_recalcule)

    assert chemin.read_bytes() == empreinte_avant


def test_fichier_introuvable_renvoie_none():
    assert recalculer_classeur(r"C:\chemin\qui\nexiste\pas.xlsx") is None


def test_soffice_absent_renvoie_none_sans_exception(tmp_path, monkeypatch):
    import orisflow_engine.recalcul as recalcul

    monkeypatch.setattr(recalcul, "_trouver_soffice", lambda: None)
    chemin = tmp_path / "test.xlsx"
    _classeur_avec_formule_non_calculee(chemin)

    assert recalculer_classeur(str(chemin)) is None


def test_nettoyer_ignore_none():
    nettoyer(None)  # ne doit jamais lever d'exception
