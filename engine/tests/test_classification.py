import os
import sys

import openpyxl
import pymupdf

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from orisflow_engine.classification import classer_fichiers


def _extraction_comptes(chemin, prefixes):
    """Fabrique une extraction de comptes avec des numéros au format valide
    (5 chiffres-6 chiffres-2 chiffres), à partir d'une liste de préfixes à 5 chiffres."""
    classeur = openpyxl.Workbook()
    feuille = classeur.active
    for _ in range(23):
        feuille.append([])
    feuille.append(["N°", "Numero de compte"])
    for i, prefixe in enumerate(prefixes, start=1):
        feuille.append([i, f"{prefixe}-{i:06d}-00"])
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
    _extraction_comptes(chemin, ["37110", "37120"])

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
    _extraction_comptes(chemin, ["37110"])
    resultat = classer_fichiers([str(chemin)])
    fichier = resultat["fichiers"][0]
    assert fichier["agence_detectee"] is None
    assert fichier["niveau"] == "avertissement"


def test_deux_fichiers_pour_la_meme_agence_sont_bloquants(tmp_path):
    chemin1 = tmp_path / "Akwa_Compte.xlsx"
    chemin2 = tmp_path / "Akwa_Compte_bis.xlsx"
    _extraction_comptes(chemin1, ["37110"])
    _extraction_comptes(chemin2, ["37110"])

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
    _extraction_comptes(chemin, ["37420"] * 5)  # 5 comptes Garanties
    _classeur_reference(dossier_reference, {"F": 2441, "H": 5})  # F=Bafoussam, H=Balessing

    resultat = classer_fichiers([str(chemin)], dossier_reference=str(dossier_reference))

    fichier = resultat["fichiers"][0]
    assert fichier["niveau"] == "avertissement"
    assert any("Balessing" in m for m in fichier["messages"])
    assert resultat["reference"]["disponible"] is True


def test_signale_les_doublons_de_numero_de_compte(tmp_path):
    chemin = tmp_path / "Akwa_Compte.xlsx"
    classeur = openpyxl.Workbook()
    feuille = classeur.active
    for _ in range(23):
        feuille.append([])
    feuille.append(["N°", "Numero de compte"])
    feuille.append([1, "37110-000001-00"])
    feuille.append([2, "37110-000001-00"])  # même numéro que la ligne précédente
    classeur.save(chemin)

    resultat = classer_fichiers([str(chemin)])
    fichier = resultat["fichiers"][0]
    assert fichier["doublons"] == ["37110-000001-00"]
    assert fichier["niveau"] == "avertissement"
    assert any("double" in m for m in fichier["messages"])


def test_signale_les_numeros_mal_formes(tmp_path):
    chemin = tmp_path / "Akwa_Compte.xlsx"
    classeur = openpyxl.Workbook()
    feuille = classeur.active
    for _ in range(23):
        feuille.append([])
    feuille.append(["N°", "Numero de compte"])
    feuille.append([1, "37110-000001-00"])
    feuille.append([2, "371100000100"])  # sans les tirets attendus

    classeur.save(chemin)

    resultat = classer_fichiers([str(chemin)])
    fichier = resultat["fichiers"][0]
    assert fichier["mal_formes"] == ["371100000100"]
    assert fichier["niveau"] == "avertissement"


def test_reconnait_une_balance_classe3_et_lit_agence_depuis_le_contenu(tmp_path):
    chemin = tmp_path / "EtBalance_General_Consolide_0000847.pdf"  # nom sans agence, comme les vrais fichiers
    document = pymupdf.open()
    page = document.new_page()
    ancres = [231, 291, 351, 411, 471, 531]
    page.insert_text((10, 50), "Balance generale consolidée   Chapitre de : 3  à : 3")
    page.insert_text((10, 70), "Groupe: DOUALA AKWA   DOUALA AKWA")
    page.insert_text((10, 150), "Compte")
    page.insert_text((71, 150), "Intitulé")
    for i, x in enumerate(ancres):
        page.insert_text((x, 150), "Debit" if i % 2 == 0 else "Crédit")
    page.insert_text((10, 175), "Total Classe : 3 TOTAL")
    for x, valeur in zip(ancres, [1, 2, 3, 4, 500, 600]):
        page.insert_text((x + 21, 175), str(valeur))
    document.save(str(chemin))
    document.close()

    resultat = classer_fichiers([str(chemin)])
    fichier = resultat["fichiers"][0]

    assert fichier["type_detecte"] == "balance_classe3"
    assert fichier["agence_detectee"] == "akwa"  # trouvée dans le contenu, pas dans le nom du fichier
    assert fichier["depots"] == 600
    assert fichier["engagements"] == 500


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
