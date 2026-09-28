import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from orisflow_engine.regles_agences import agences_dont_le_total_serait_proche, detecter_agence


def test_agence_reconnue_par_le_nom():
    agence = detecter_agence("Bafoussam_Compte.xls")
    assert (agence.cle, agence.libelle, agence.confiance) == ("bafoussam", "Bafoussam", "nom")


def test_agence_reconnue_par_un_code_serveur():
    agence = detecter_agence("EtListeCompte_20001_20260912.xls")
    assert (agence.cle, agence.confiance) == ("etoudi", "code")


def test_agence_non_reconnue():
    agence = detecter_agence("export_du_jour.xls")
    assert agence.cle is None
    assert agence.confiance == "aucune"


def test_marche_central_a_deux_alias():
    assert detecter_agence("MarcheCentral_Compte.xls").cle == "marchecentral"
    assert detecter_agence("marche_central_Compte.xls").cle == "marchecentral"


def test_suggestion_agence_proche():
    precedents = {"bafoussam": 2441, "balessing": 1273}
    # Un total de 1273 aujourd'hui ne colle plus à Bafoussam (veille 2441) mais à Balessing.
    suggestions = agences_dont_le_total_serait_proche(1273, precedents)
    assert suggestions == ["balessing"]
