"""Vérifie que le jeu de fichiers de test anonymisés (sprint 0, voir
`tests/fixtures/anonymises/README.md`) reste valide et démontre bien le
contrôle de cohérence du sprint 2, notamment sur le cas réel de l'échange
Bafoussam / Balessing du 10/09/2026 (CLAUDE.md, T19).

Si ce test échoue après une modification de `generer_fixtures.py`, relancer :
    python tests/fixtures/generer_fixtures.py
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from orisflow_engine.classification import classer_fichiers

DOSSIER_FIXTURES = os.path.join(os.path.dirname(__file__), "..", "..", "tests", "fixtures", "anonymises")

pytestmark = pytest.mark.skipif(
    not os.path.isdir(DOSSIER_FIXTURES),
    reason="Fixtures anonymisées absentes : lancer tests/fixtures/generer_fixtures.py",
)


def _chemin(nom):
    return os.path.join(DOSSIER_FIXTURES, nom)


def test_fichier_de_comptes_normal_ne_declenche_aucun_avertissement():
    resultat = classer_fichiers([_chemin("Akwa_Compte.xlsx")], dossier_reference=DOSSIER_FIXTURES)
    fichier = resultat["fichiers"][0]
    assert fichier["type_detecte"] == "compte"
    assert fichier["agence_detectee"] == "akwa"
    assert fichier["niveau"] == "information"


def test_echange_bafoussam_balessing_est_detecte_et_la_bonne_agence_suggeree():
    resultat = classer_fichiers(
        [_chemin("Bafoussam_Compte.xlsx"), _chemin("Balessing_Compte.xlsx")],
        dossier_reference=DOSSIER_FIXTURES,
    )
    par_agence = {f["agence_detectee"]: f for f in resultat["fichiers"]}

    assert par_agence["bafoussam"]["niveau"] == "avertissement"
    assert any("Balessing" in m for m in par_agence["bafoussam"]["messages"])

    assert par_agence["balessing"]["niveau"] == "avertissement"
    assert any("Bafoussam" in m for m in par_agence["balessing"]["messages"])


def test_fichiers_engagement_et_caisse_reconnus_par_leur_contenu():
    resultat = classer_fichiers(
        [_chemin("Akwa_EtBalance_Exemple_Chapitre3.xlsx"), _chemin("Akwa_EtBalance_Exemple_Chapitre5.xlsx")]
    )
    types = {f["nom"]: f["type_detecte"] for f in resultat["fichiers"]}
    assert types["Akwa_EtBalance_Exemple_Chapitre3.xlsx"] == "engagement"
    assert types["Akwa_EtBalance_Exemple_Chapitre5.xlsx"] == "caisse"


def test_classeur_de_reference_est_trouve_et_lu():
    resultat = classer_fichiers([_chemin("Akwa_Compte.xlsx")], dossier_reference=DOSSIER_FIXTURES)
    assert resultat["reference"]["disponible"] is True
    assert "10 09 2026" in resultat["reference"]["chemin"]
