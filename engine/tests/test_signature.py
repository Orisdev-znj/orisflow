"""Signature et empreinte des classeurs générés (10/10/2026)."""

import os
import sys

import openpyxl
from openpyxl.workbook.defined_name import DefinedName

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from orisflow_engine import VERSION
from orisflow_engine.signature import calculer_empreinte, signer_classeur, verifier_fichier


def _classeur(avec_nom=True):
    classeur = openpyxl.Workbook()
    feuille = classeur.active
    feuille.title = "Synthèse"
    feuille["A1"] = "TOTAL"
    feuille["B2"] = 1000
    feuille["B3"] = "=B2+1"
    if avec_nom:
        classeur.defined_names["ORISFLOW_SIGNATURE"] = DefinedName("ORISFLOW_SIGNATURE", attr_text="'Synthèse'!$A$20")
    return classeur


def test_la_mention_est_ecrite_dans_la_cellule_nommee():
    classeur = _classeur()
    signature = signer_classeur(classeur, "Arnold")
    texte = classeur["Synthèse"]["A20"].value
    assert f"Orisflow V{VERSION}" in texte and "par Arnold" in texte and signature["empreinte_courte"] in texte
    assert signature["avertissement"] is None


def test_la_signature_nest_pas_comptee_dans_lempreinte():
    classeur = _classeur()
    avant = calculer_empreinte(classeur)
    signer_classeur(classeur, "Arnold")
    assert calculer_empreinte(classeur) == avant


def test_modifier_une_valeur_change_lempreinte():
    classeur = _classeur()
    avant = calculer_empreinte(classeur)
    classeur["Synthèse"]["B2"] = 1001
    assert calculer_empreinte(classeur) != avant


def test_lempreinte_survit_a_un_enregistrement(tmp_path):
    classeur = _classeur()
    signature = signer_classeur(classeur, None)
    chemin = str(tmp_path / "c.xlsx")
    classeur.save(chemin)
    assert verifier_fichier(chemin)["empreinte"] == signature["empreinte"]
    rouvert = openpyxl.load_workbook(chemin)
    rouvert.save(str(tmp_path / "d.xlsx"))
    assert verifier_fichier(str(tmp_path / "d.xlsx"))["empreinte"] == signature["empreinte"]


def test_cellule_nommee_absente_avertit_sans_bloquer():
    signature = signer_classeur(_classeur(avec_nom=False), "Arnold")
    assert signature["avertissement"] and signature["mention"] is None and signature["empreinte"]
