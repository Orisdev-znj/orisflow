"""Tests du sprint 4 : génération d'un nouveau classeur de trésorerie."""

import os
import sys
from datetime import date

import openpyxl
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from orisflow_engine.generation import generer_classeur


def _extraction_comptes(chemin, prefixes):
    classeur = openpyxl.Workbook()
    feuille = classeur.active
    for _ in range(23):
        feuille.append([])
    feuille.append(["N°", "Numero de compte"])
    for i, prefixe in enumerate(prefixes, start=1):
        feuille.append([i, f"{prefixe}-{i:06d}-00"])
    classeur.save(chemin)


def _classeur_modele(dossier, nom_fichier="TRESORERIE JOURNALIÈRE et TDB DU  10 09 2026.xlsx"):
    """Classeur de référence minimal, avec une feuille « Suivi de la treso » à exclure."""
    classeur = openpyxl.Workbook()
    synthese = classeur.active
    synthese.title = "Synthèse"
    synthese["A7"] = "COMPTES  COURANT ENTREPRISES"
    synthese["C7"] = 50  # ancienne valeur Akwa, doit se retrouver en C17 (J-1)
    synthese["C16"] = "=SUM(C7:C15)"  # formule à préserver
    synthese["F7"] = 30  # ancienne valeur Bafoussam
    synthese["F16"] = "=SUM(F7:F15)"

    suivi = classeur.create_sheet("Suivi de la treso")
    suivi["A1"] = "Ne doit jamais apparaître dans le fichier généré"

    # Feuilles mortes héritées de l'ancienne méthode (voir CLAUDE.md, 29/09/2026) :
    # aucune formule de Synthèse ne les référence, elles doivent disparaître elles aussi.
    for nom in ("Agences", "Dépôts", "Caisse", "SYNTHESE 2025", "Feuil1"):
        classeur.create_sheet(nom)["A1"] = "Feuille morte, à exclure"

    chemin = dossier / nom_fichier
    classeur.save(chemin)
    return str(chemin)


@pytest.fixture
def contexte(tmp_path):
    dossier_reference = tmp_path / "reference"
    dossier_reference.mkdir()
    dossier_extractions = tmp_path / "extractions"
    dossier_extractions.mkdir()
    dossier_sortie = tmp_path / "sortie"

    _classeur_modele(dossier_reference)

    return {
        "reference": str(dossier_reference),
        "extractions": dossier_extractions,
        "sortie": str(dossier_sortie),
    }


def test_genere_un_nouveau_fichier_date_du_jour(contexte):
    chemin_akwa = contexte["extractions"] / "Akwa_Compte.xlsx"
    _extraction_comptes(chemin_akwa, ["37110", "37120"])

    resultat = generer_classeur(
        [str(chemin_akwa)], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29)
    )

    assert resultat["ok"] is True
    assert os.path.basename(resultat["chemin_genere"]) == "TRESORERIE JOURNALIÈRE et TDB DU  29 09 2026.xlsx"
    assert os.path.isfile(resultat["chemin_genere"])


def test_ne_modifie_jamais_le_modele_source(contexte):
    chemin_akwa = contexte["extractions"] / "Akwa_Compte.xlsx"
    _extraction_comptes(chemin_akwa, ["37110"])
    chemin_modele = os.path.join(contexte["reference"], "TRESORERIE JOURNALIÈRE et TDB DU  10 09 2026.xlsx")
    avant = open(chemin_modele, "rb").read()

    generer_classeur([str(chemin_akwa)], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29))

    assert open(chemin_modele, "rb").read() == avant


def test_exclut_toujours_suivi_de_la_treso(contexte):
    chemin_akwa = contexte["extractions"] / "Akwa_Compte.xlsx"
    _extraction_comptes(chemin_akwa, ["37110"])

    resultat = generer_classeur([str(chemin_akwa)], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29))

    classeur = openpyxl.load_workbook(resultat["chemin_genere"])
    assert "Suivi de la treso" not in classeur.sheetnames


def test_exclut_les_feuilles_mortes_de_lancienne_methode(contexte):
    chemin_akwa = contexte["extractions"] / "Akwa_Compte.xlsx"
    _extraction_comptes(chemin_akwa, ["37110"])

    resultat = generer_classeur([str(chemin_akwa)], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29))

    classeur = openpyxl.load_workbook(resultat["chemin_genere"])
    for nom in ("Agences", "Dépôts", "Caisse", "SYNTHESE 2025", "Feuil1"):
        assert nom not in classeur.sheetnames
    assert classeur.sheetnames == ["Synthèse"]


def test_remplit_les_comptes_et_decale_le_j1(contexte):
    chemin_akwa = contexte["extractions"] / "Akwa_Compte.xlsx"
    _extraction_comptes(chemin_akwa, ["37110", "37120", "37220"])  # 2 Courants, 1 Chèques

    resultat = generer_classeur([str(chemin_akwa)], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29))

    classeur = openpyxl.load_workbook(resultat["chemin_genere"])
    synthese = classeur["Synthèse"]
    assert synthese["C7"].value == 2  # Courants (37110+37120)
    assert synthese["C8"].value == 1  # Chèques (37220)
    assert synthese["C11"].value == 0  # Collectes : toujours 0
    assert synthese["C13"].value == 0  # Salariés : toujours 0
    assert synthese["C16"].value == "=SUM(C7:C15)"  # formule préservée, jamais remplacée
    assert synthese["C17"].value == 50  # J-1 = l'ancienne valeur de C16 (comptée hier)
    assert "Akwa" in resultat["agences_mises_a_jour"]


def test_agence_sans_fichier_reste_inchangee_mais_signalee(contexte):
    chemin_akwa = contexte["extractions"] / "Akwa_Compte.xlsx"
    _extraction_comptes(chemin_akwa, ["37110"])

    resultat = generer_classeur([str(chemin_akwa)], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29))

    classeur = openpyxl.load_workbook(resultat["chemin_genere"])
    synthese = classeur["Synthèse"]
    assert synthese["F7"].value == 30  # Bafoussam inchangé (aucun fichier reçu)
    assert synthese["F17"].value == 30  # J-1 avancé quand même (ancienne valeur de F16, la formule)
    assert "Bafoussam" in resultat["agences_non_mises_a_jour"]
    assert "Bafoussam" not in resultat["agences_mises_a_jour"]


def test_ne_jamais_ecraser_un_fichier_deja_genere(contexte):
    chemin_akwa = contexte["extractions"] / "Akwa_Compte.xlsx"
    _extraction_comptes(chemin_akwa, ["37110"])

    premier = generer_classeur([str(chemin_akwa)], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29))
    second = generer_classeur([str(chemin_akwa)], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29))

    assert premier["chemin_genere"] != second["chemin_genere"]
    assert os.path.isfile(premier["chemin_genere"])
    assert os.path.isfile(second["chemin_genere"])


def test_fichier_bloquant_est_ignore_pas_utilise(contexte):
    chemin_akwa = contexte["extractions"] / "Akwa_Compte.xlsx"
    _extraction_comptes(chemin_akwa, ["37110"])
    chemin_illisible = contexte["extractions"] / "Akwa_Compte_bis.xlsx"
    _extraction_comptes(chemin_illisible, ["37110"])  # même agence : le doublon devient bloquant

    resultat = generer_classeur(
        [str(chemin_akwa), str(chemin_illisible)], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29)
    )

    assert "Akwa" not in resultat["agences_mises_a_jour"]
    assert set(resultat["fichiers_ignores"]) == {"Akwa_Compte.xlsx", "Akwa_Compte_bis.xlsx"}


def test_aucun_modele_disponible_est_signale_clairement(tmp_path):
    dossier_reference_vide = tmp_path / "reference_vide"
    dossier_reference_vide.mkdir()

    resultat = generer_classeur([], str(dossier_reference_vide), str(tmp_path / "sortie"))

    assert resultat["ok"] is False
    assert "modèle" in resultat["erreur"] or "référence" in resultat["erreur"]
