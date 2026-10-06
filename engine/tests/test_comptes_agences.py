import os
import sys

import openpyxl
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from orisflow_engine.classification import classer_fichiers
from orisflow_engine.comptes_agences import (
    charger_table,
    construire_table,
    enregistrer_table,
    identifier,
)


def _liste(chemin, numeros):
    classeur = openpyxl.Workbook()
    feuille = classeur.active
    for _ in range(23):
        feuille.append([])
    feuille.append(["N°", "Numero de compte"])
    for i, numero in enumerate(numeros, start=1):
        feuille.append([i, numero])
    classeur.save(chemin)
    return str(chemin)


def _comptes(prefixe, n):
    return [f"{prefixe}-{i:06d}-{i % 90 + 10}" for i in range(1, n + 1)]


@pytest.fixture
def jours(tmp_path):
    """Deux agences, trois jours : Akwa a 20 comptes propres, Mokolo 18, plus un compte partagé."""
    akwa, mokolo = _comptes("37110", 20), _comptes("37120", 18)
    partage = "37110-999999-99"
    dossiers = []
    for j in range(3):
        dossier = tmp_path / f"jour{j}"
        dossier.mkdir()
        dossiers.append({
            "akwa": _liste(dossier / "Akwa_Compte.xls", akwa + [partage]),
            "mokolo": _liste(dossier / "Mokolo_Compte.xls", mokolo + [partage]),
        })
    return dossiers, akwa, mokolo, partage


def test_table_15_comptes_stables_et_non_partages(jours):
    dossiers, akwa, mokolo, partage = jours
    table = construire_table(dossiers)
    assert len(table["akwa"]) == 15 and len(table["mokolo"]) == 15
    assert partage not in table["akwa"] + table["mokolo"]  # présent dans les deux agences
    assert set(table["akwa"]) <= set(akwa)


def test_identifie_une_liste_par_ses_comptes_sans_son_nom(jours, tmp_path):
    dossiers, akwa, mokolo, _ = jours
    table = construire_table(dossiers)
    fichier = _liste(tmp_path / "ETListeCompte_NoHeader_0001_xyz.xls", mokolo)
    r = classer_fichiers([fichier], None, table_comptes=table)
    f = r["fichiers"][0]
    assert f["agence_detectee"] == "mokolo"
    assert f["confiance_agence"] == "comptes"
    assert f["niveau"] == "information"


def test_moins_de_dix_comptes_nidentifie_pas(jours):
    dossiers, akwa, mokolo, _ = jours
    table = construire_table(dossiers)
    resultat = identifier(set(table["akwa"][:9]), table)
    assert resultat.agence is None
    assert resultat.score == 9


def test_egalite_nidentifie_pas(jours):
    dossiers, akwa, mokolo, _ = jours
    table = {"a": _comptes("1", 15), "b": _comptes("2", 15)}
    numeros = set(table["a"][:12]) | set(table["b"][:12])
    assert identifier(numeros, table).agence is None


def test_nom_contredit_par_les_comptes_est_signale(jours, tmp_path):
    dossiers, akwa, mokolo, _ = jours
    table = construire_table(dossiers)
    fichier = _liste(tmp_path / "Akwa_Compte.xls", mokolo)  # le nom dit Akwa, les comptes disent Mokolo
    r = classer_fichiers([fichier], None, table_comptes=table)
    f = r["fichiers"][0]
    assert f["agence_detectee"] == "mokolo"
    assert f["niveau"] == "avertissement"
    assert any("correspondent à Mokolo" in m for m in f["messages"])


def test_sans_comptes_reconnus_le_gestionnaire_leve_lambiguite(jours, tmp_path):
    dossiers, akwa, mokolo, _ = jours
    table = construire_table(dossiers)
    classeur = openpyxl.Workbook()
    feuille = classeur.active
    feuille.append(["Agence: DIRECTION GENERALE"])
    for _ in range(9):
        feuille.append([])
    feuille.append([None, "Gestionnaire:ECLADORE MBIAPOUO"])  # ligne 11, comme les vrais exports
    for _ in range(12):
        feuille.append([])
    feuille.append(["N°", "Numero de compte"])
    for i, numero in enumerate(["99999-000001-01", "99999-000002-02"], start=1):
        feuille.append([i, numero])
    fichier = str(tmp_path / "ETListeCompte_NoHeader_0002_xyz.xls")
    classeur.save(fichier)

    r = classer_fichiers(
        [fichier], None, gestionnaires={"ECLADORE MBIAPOUO": "akwa"}, table_comptes=table,
    )
    f = r["fichiers"][0]
    assert f["agence_detectee"] == "akwa"
    assert f["confiance_agence"] == "gestionnaire"
    assert f["niveau"] == "avertissement"


def test_table_enregistree_puis_relue(tmp_path):
    chemin = str(tmp_path / "config" / "comptes_par_agence.json")
    enregistrer_table(chemin, {"akwa": _comptes("37110", 15)}, ["jour1"])
    assert charger_table(chemin) == {"akwa": _comptes("37110", 15)}
    assert charger_table(str(tmp_path / "absent.json")) == {}


def test_code_dans_un_identifiant_technique_nest_pas_une_alerte(jours, tmp_path):
    """Constaté le 06/10/2026 : « ETListeCompte_NoHeader_0006914_10000-… » contient le code du
    Siège, mais la liste appartient à Bépanda (15/15). Aucune alerte ne doit subsister."""
    dossiers, akwa, mokolo, _ = jours
    table = construire_table(dossiers)
    fichier = _liste(tmp_path / "ETListeCompte_NoHeader_0006914_10000-5ca72a131a10.xls", mokolo)
    r = classer_fichiers([fichier], None, table_comptes=table)
    f = r["fichiers"][0]
    assert f["agence_detectee"] == "mokolo"
    assert f["niveau"] == "information"
    assert not any("Siège" in m for m in f["messages"])


def test_nom_d_agence_contredit_reste_signale(jours, tmp_path):
    """Un vrai nom d'agence qui contredit les numéros de compte reste une alerte."""
    dossiers, akwa, mokolo, _ = jours
    table = construire_table(dossiers)
    fichier = _liste(tmp_path / "Akwa_Compte.xls", mokolo)
    r = classer_fichiers([fichier], None, table_comptes=table)
    assert r["fichiers"][0]["niveau"] == "avertissement"
