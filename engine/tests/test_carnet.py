import os
import sys
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from orisflow_engine import carnet


def test_veille_prend_le_dernier_jour_anterieur(tmp_path):
    chemin = str(tmp_path / "soldes.json")
    carnet.enregistrer(chemin, date(2026, 10, 1), {"cca:39": 100})
    carnet.enregistrer(chemin, date(2026, 10, 2), {"cca:39": 200})
    c = carnet.lire(chemin)
    assert carnet.valeur_de_la_veille(c, "cca:39", date(2026, 10, 3)) == 200
    assert carnet.valeur_de_la_veille(c, "cca:39", date(2026, 10, 2)) == 100  # jamais le jour même
    assert carnet.valeur_de_la_veille(c, "cca:99", date(2026, 10, 3)) is None


def test_enregistrer_ne_touche_pas_aux_autres_jours(tmp_path):
    chemin = str(tmp_path / "soldes.json")
    carnet.enregistrer(chemin, date(2026, 10, 1), {"cca:12": 1})
    carnet.enregistrer(chemin, date(2026, 10, 2), {"cca:12": 2})
    assert carnet.lire(chemin)["2026-10-01"] == {"cca:12": 1}


def test_fichier_absent_ou_illisible_donne_un_carnet_vide(tmp_path):
    assert carnet.lire(str(tmp_path / "inexistant.json")) == {}
    mauvais = tmp_path / "mauvais.json"
    mauvais.write_text("{ pas du json", encoding="utf-8")
    assert carnet.lire(str(mauvais)) == {}
