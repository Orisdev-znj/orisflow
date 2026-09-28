import os
import sys

import openpyxl
import pymupdf

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from orisflow_engine.classification import classer_fichiers


def _extraction_comptes(chemin, numeros):
    classeur = openpyxl.Workbook()
    feuille = classeur.active
    for _ in range(23):
        feuille.append([])
    feuille.append(["N°", "Numero de compte"])
    for i, numero in enumerate(numeros, start=1):
        feuille.append([i, numero])
    classeur.save(chemin)


def _classeur_reference(dossier, valeurs_ligne16):
    """Fabrique un classeur minimal « TRESORERIE JOURNALIÈRE... » avec une feuille Synthèse."""
    classeur = openpyxl.Workbook()
    feuille = classeur.active
    feuille.title = "Synthèse"
    for colonne, valeur in valeurs_ligne16.items():
        feuille[f"{colonne}16"] = valeur
    chemin = dossier / "TRESORERIE JOURNALIÈRE et TDB DU  10 09 2026.xlsx"
    classeur.save(chemin)
    return dossier


def test_reconnait_type_et_agence_dun_fichier_de_comptes(tmp_path):
    chemin = tmp_path / "Bafoussam_Compte.xlsx"
    _extraction_comptes(chemin, ["37110-1-1", "37120-2-2"])

    resultat = classer_fichiers([str(chemin)])

    assert resultat["ok"] is True
    fichier = resultat["fichiers"][0]
    assert fichier["type_detecte"] == "compte"
    assert fichier["agence_detectee"] == "bafoussam"
    assert fichier["total_comptes"] == 2
    assert fichier["niveau"] == "information"


def test_fichier_introuvable_est_bloquant():
    resultat = classer_fichiers([r"C:\ceci\nexiste\pas.xlsx"])
    assert resultat["ok"] is False
    assert resultat["fichiers"][0]["niveau"] == "bloquant"


def test_agence_inconnue_est_un_avertissement(tmp_path):
    chemin = tmp_path / "export_du_jour.xlsx"
    _extraction_comptes(chemin, ["37110-1-1"])
    resultat = classer_fichiers([str(chemin)])
    fichier = resultat["fichiers"][0]
    assert fichier["agence_detectee"] is None
    assert fichier["niveau"] == "avertissement"


def test_deux_fichiers_pour_la_meme_agence_sont_bloquants(tmp_path):
    chemin1 = tmp_path / "Akwa_Compte.xlsx"
    chemin2 = tmp_path / "Akwa_Compte_bis.xlsx"
    _extraction_comptes(chemin1, ["37110-1-1"])
    _extraction_comptes(chemin2, ["37110-1-1"])

    resultat = classer_fichiers([str(chemin1), str(chemin2)])

    assert resultat["ok"] is False
    assert all(f["niveau"] == "bloquant" for f in resultat["fichiers"])


def test_ecart_anormal_avec_la_veille_suggere_lagence_probable(tmp_path):
    dossier_extractions = tmp_path / "extractions"
    dossier_extractions.mkdir()
    dossier_reference = tmp_path / "reference"
    dossier_reference.mkdir()

    # Le fichier nommé « Bafoussam » contient en réalité le total de Balessing (cas du 10/09/2026).
    chemin = dossier_extractions / "Bafoussam_Compte.xlsx"
    _extraction_comptes(chemin, ["37420-1-1"] * 5)  # 5 comptes Garanties
    _classeur_reference(dossier_reference, {"F": 2441, "H": 5})  # F=Bafoussam, H=Balessing

    resultat = classer_fichiers([str(chemin)], dossier_reference=str(dossier_reference))

    fichier = resultat["fichiers"][0]
    assert fichier["niveau"] == "avertissement"
    assert any("Balessing" in m for m in fichier["messages"])
    assert resultat["reference"]["disponible"] is True


def test_reconnait_un_releve_bancaire_pdf(tmp_path):
    chemin = tmp_path / "releve.pdf"
    document = pymupdf.open()
    page = document.new_page()
    page.insert_text((50, 50), "EXTRAIT DE COMPTE\nNumero de compte : 10038-01773537801-12")
    document.save(str(chemin))
    document.close()

    resultat = classer_fichiers([str(chemin)])

    fichier = resultat["fichiers"][0]
    assert fichier["type_detecte"] == "releve_cca"
    assert fichier["numero_compte_pdf"] == "10038-01773537801-12"
    assert fichier["agence_detectee"] is None  # sans objet pour un relevé bancaire
