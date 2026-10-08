import os
import sys

import openpyxl
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from orisflow_engine.classification import classer_fichiers
from orisflow_engine.comptes_agences import (
    charger_table,
    construire_table,
    construire_table_depuis_dossiers,
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


# --- Robustesse : fichiers corrompus et configuration illisible (06/10/2026) -------------


def test_fichier_de_reference_illisible_ne_plante_pas_la_construction(jours, tmp_path):
    """Un fichier de comptes corrompu parmi les jours de référence (ex. téléchargement
    interrompu) ne doit jamais empêcher la construction de la table pour les autres
    agences : il compte simplement comme absent ce jour-là."""
    dossiers, akwa, mokolo, _ = jours
    # Le fichier Akwa du premier jour est remplacé par un contenu illisible.
    chemin_corrompu = dossiers[0]["akwa"]
    with open(chemin_corrompu, "wb") as fichier:
        fichier.write(b"ceci n'est pas un classeur Excel valide")

    table = construire_table(dossiers)  # ne doit lever aucune exception

    assert "mokolo" in table and len(table["mokolo"]) == 15
    assert "akwa" not in table  # pas assez de jours lisibles pour en tirer 15 comptes stables


def test_construire_table_depuis_dossiers_ignore_un_fichier_corrompu(tmp_path):
    """Même garantie via `construire_table_depuis_dossiers` (utilisé par le bouton
    Paramètres), avec un fichier corrompu nommé comme une vraie extraction."""
    dossier = tmp_path / "jour1"
    dossier.mkdir()
    (dossier / "Akwa_Compte.xls").write_bytes(b"pas un fichier Excel valide")
    table = construire_table_depuis_dossiers([str(dossier)])
    assert table == {}  # un seul jour, illisible : rien d'exploitable, mais pas de plantage


def test_table_json_corrompue_est_traitee_comme_absente(tmp_path):
    chemin = tmp_path / "comptes_par_agence.json"
    chemin.write_text("ceci n'est pas du JSON valide {{{", encoding="utf-8")
    assert charger_table(str(chemin)) == {}


def test_table_json_de_forme_inattendue_est_traitee_comme_absente(tmp_path):
    chemin = tmp_path / "comptes_par_agence.json"
    chemin.write_text('["pas", "le", "bon", "format"]', encoding="utf-8")
    assert charger_table(str(chemin)) == {}
