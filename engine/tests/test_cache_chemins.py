"""Cache des lectures de fichiers, chemins Windows trop longs, doublons de même nom (audit du 09/10/2026)."""

import os
import sys

import openpyxl
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))
from aide_modele import poser_libelles

from orisflow_engine import classification
from orisflow_engine.cache import CacheFichiers
from orisflow_engine.chemins import chemin_lecture
from orisflow_engine.classification import classer_fichiers


def _extraction_comptes(chemin, prefixes):
    classeur = openpyxl.Workbook()
    feuille = classeur.active
    for _ in range(23):
        feuille.append([])
    feuille.append(["N°", "Numero de compte"])
    for i, prefixe in enumerate(prefixes, start=1):
        feuille.append([i, f"{prefixe}-{i:06d}-00"])
    classeur.save(chemin)


def test_cache_evite_de_relire_un_fichier_inchange(tmp_path, monkeypatch):
    chemin = tmp_path / "Akwa_Compte.xlsx"
    _extraction_comptes(chemin, ["37110"])
    cache = str(tmp_path / "cache")

    premier = classer_fichiers([str(chemin)], dossier_cache=cache)
    monkeypatch.setattr(classification, "_classer_un_fichier", lambda *a: pytest.fail("fichier relu malgré le cache"))
    second = classer_fichiers([str(chemin)], dossier_cache=cache)

    assert second["fichiers"][0]["total_comptes"] == premier["fichiers"][0]["total_comptes"]


def test_cache_ignore_un_fichier_modifie(tmp_path):
    chemin = tmp_path / "Akwa_Compte.xlsx"
    _extraction_comptes(chemin, ["37110"])
    cache = str(tmp_path / "cache")
    classer_fichiers([str(chemin)], dossier_cache=cache)

    _extraction_comptes(chemin, ["37110", "37110"])
    os.utime(chemin, ns=(os.stat(chemin).st_atime_ns, os.stat(chemin).st_mtime_ns + 10_000_000))

    assert classer_fichiers([str(chemin)], dossier_cache=cache)["fichiers"][0]["total_comptes"] == 2


def test_cache_inutilisable_nest_jamais_bloquant(tmp_path):
    fichier_a_la_place_du_dossier = tmp_path / "cache"
    fichier_a_la_place_du_dossier.write_text("pas un dossier")
    cache = CacheFichiers(str(fichier_a_la_place_du_dossier))
    assert cache.lire("classement", str(tmp_path)) is None
    cache.ecrire("classement", str(tmp_path), {"a": 1})  # aucune exception


@pytest.mark.skipif(os.name != "nt", reason="limite propre à Windows")
def test_chemin_long_recoit_le_prefixe_windows():
    court = r"C:\dossier\fichier.xls"
    long = "C:\\" + "\\".join(["dossier_tres_long_" + str(i) for i in range(15)]) + "\\fichier.xls"
    assert chemin_lecture(court) == court
    assert chemin_lecture(long).startswith("\\\\?\\C:\\")
    assert chemin_lecture("\\\\serveur\\partage\\" + "x" * 250).startswith("\\\\?\\UNC\\serveur")


@pytest.mark.skipif(os.name != "nt", reason="limite propre à Windows")
def test_fichier_au_chemin_de_plus_de_260_caracteres_est_lu(tmp_path):
    dossier = tmp_path
    while len(str(dossier)) < 250:
        dossier = dossier / "Extraction liste des comptes par agence"
    os.makedirs(chemin_lecture(str(dossier)), exist_ok=True)
    chemin = str(dossier / "ETListeCompte_NoHeader_0006966.xlsx")
    _extraction_comptes(chemin_lecture(chemin), ["37110"])
    assert len(chemin) > 260

    resultat = classer_fichiers([chemin])

    fichier = resultat["fichiers"][0]
    assert fichier["chemin"] == chemin  # chemin rendu à l'interface tel qu'il a été choisi
    assert fichier["total_comptes"] == 1


def test_doublon_de_meme_nom_cite_le_dossier_dorigine(tmp_path):
    for sous in ("Telechargements", "Fichier Originaux"):
        (tmp_path / sous).mkdir()
        _extraction_comptes(tmp_path / sous / "Akwa_Compte.xlsx", ["37110"])

    resultat = classer_fichiers([
        str(tmp_path / "Telechargements" / "Akwa_Compte.xlsx"),
        str(tmp_path / "Fichier Originaux" / "Akwa_Compte.xlsx"),
    ])

    message = " ".join(resultat["fichiers"][1]["messages"])
    assert "Telechargements" in message
    assert resultat["fichiers"][1]["est_doublon"] is True


def test_valeurs_de_la_veille_des_champs_manuels(tmp_path):
    reference = tmp_path / "reference"
    reference.mkdir()
    classeur = openpyxl.Workbook()
    feuille = classeur.active
    feuille.title = "Synthèse"
    poser_libelles(feuille)
    feuille["C16"] = 3000
    feuille["C56"] = 2_512_306
    feuille["C31"] = 58_500_000  # UBA : bon de caisse fixe (10 000 000) + solde en banque
    feuille["I32"] = 16_375_373  # Access Bank, colonne Marché Central
    classeur.save(reference / "TRESORERIE JOURNALIÈRE et TDB DU  07 10 2026.xlsx")

    resultat = classer_fichiers([], dossier_reference=str(reference))

    veille = resultat["valeurs_veille_manuelles"]
    assert veille["uv_orange"] == 2_512_306
    assert veille["uba_solde_banque"] == 48_500_000
    assert veille["access_bank"] == 16_375_373
