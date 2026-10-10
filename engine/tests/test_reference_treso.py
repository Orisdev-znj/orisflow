"""Tests de `trouver_classeur_recent` (recherche du dernier classeur de référence)."""

import os
import sys
from datetime import date

import openpyxl
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))
from aide_modele import poser_libelles

from orisflow_engine.reference_treso import lire_totaux_comptes_precedents, trouver_classeur_recent


def _classeur_vide(dossier, nom):
    chemin = dossier / nom
    openpyxl.Workbook().save(chemin)
    return str(chemin)


def test_trouve_le_plus_recent_sans_filtre(tmp_path):
    _classeur_vide(tmp_path, "TRESORERIE JOURNALIÈRE et TDB DU  28 09 2026.xlsx")
    recent = _classeur_vide(tmp_path, "TRESORERIE JOURNALIÈRE et TDB DU  30 09 2026.xlsx")

    assert trouver_classeur_recent(str(tmp_path)) == recent


def test_avant_exclut_un_classeur_date_du_jour_genere_ou_plus_tard(tmp_path):
    """Corrige le bug du 01/10/2026 : si le dossier de référence contient déjà un classeur
    daté du jour qu'on s'apprête à générer (ou plus tard), il ne doit jamais être choisi
    comme son propre modèle."""
    plus_ancien = _classeur_vide(tmp_path, "TRESORERIE JOURNALIÈRE et TDB DU  29 09 2026.xlsx")
    _classeur_vide(tmp_path, "TRESORERIE JOURNALIÈRE et TDB DU  30 09 2026.xlsx")  # jour généré
    _classeur_vide(tmp_path, "TRESORERIE JOURNALIÈRE et TDB DU  01 10 2026.xlsx")  # plus tard encore

    resultat = trouver_classeur_recent(str(tmp_path), avant=date(2026, 9, 30))

    assert resultat == plus_ancien


def test_avant_renvoie_none_si_aucun_classeur_anterieur(tmp_path):
    _classeur_vide(tmp_path, "TRESORERIE JOURNALIÈRE et TDB DU  30 09 2026.xlsx")

    assert trouver_classeur_recent(str(tmp_path), avant=date(2026, 9, 30)) is None


def _classeur_avec_totaux_en_formule(dossier, nom):
    """Classeur « Synthèse » dont la ligne 16 (TOTAUX COMPTES) est une formule jamais
    recalculée par Excel : reproduit un classeur généré par Orisflow puis jamais rouvert."""
    chemin = dossier / nom
    classeur = openpyxl.Workbook()
    feuille = classeur.active
    feuille.title = "Synthèse"
    poser_libelles(feuille)
    feuille["C7"] = 10
    feuille["C8"] = 5
    feuille["C16"] = "=C7+C8"
    classeur.save(chemin)
    return str(chemin)


@pytest.mark.libreoffice
def test_recalcule_le_modele_si_aucun_total_nest_lisible(tmp_path):
    """Trouvé le 10/10/2026 : un classeur de référence jamais rouvert dans Excel ne donnait
    aucun total (« Aucun total de la veille disponible ») — recalculé automatiquement via
    LibreOffice (voir recalcul.py) avant d'abandonner."""
    _classeur_avec_totaux_en_formule(tmp_path, "TRESORERIE JOURNALIÈRE et TDB DU  30 09 2026.xlsx")

    resultat = lire_totaux_comptes_precedents(str(tmp_path))

    assert resultat["totaux"].get("akwa") == 15


def test_sans_libreoffice_le_resultat_reste_vide_sans_planter(tmp_path, monkeypatch):
    import orisflow_engine.reference_treso as reference_treso

    monkeypatch.setattr(reference_treso, "recalculer_classeur", lambda chemin, **k: None)
    _classeur_avec_totaux_en_formule(tmp_path, "TRESORERIE JOURNALIÈRE et TDB DU  30 09 2026.xlsx")

    resultat = lire_totaux_comptes_precedents(str(tmp_path))

    assert resultat["totaux"] == {}
