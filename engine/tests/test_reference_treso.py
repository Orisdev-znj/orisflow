"""Tests de `trouver_classeur_recent` (recherche du dernier classeur de référence)."""

import os
import sys
from datetime import date

import openpyxl

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from orisflow_engine.reference_treso import trouver_classeur_recent


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
