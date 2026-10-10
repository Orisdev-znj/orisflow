"""Contrôle du classeur modèle standard (10/10/2026)."""

import os
import shutil
import sys
import zipfile

import openpyxl
import pytest
from openpyxl.drawing.image import Image
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.protection import SheetProtection
from PIL import Image as PILImage

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))
from aide_modele import poser_libelles

from orisflow_engine.modele_standard import controler_modele


def _modele(dossier, nom="modele.xlsx", *, logo_en="A1", nom_signature=True, protege=True, insertion_permise=False,
            fige=True, structure=True, onglet_en_trop=False, sans_libelle=None):
    classeur = openpyxl.Workbook()
    feuille = classeur.active
    feuille.title = "Synthèse"
    poser_libelles(feuille, sauf=(sans_libelle,) if sans_libelle else ())
    png = os.path.join(dossier, "logo.png")
    PILImage.new("RGBA", (280, 111), (7, 28, 155, 255)).save(png)
    image = Image(png)
    image.width, image.height = 140, 55
    feuille.add_image(image, logo_en)
    if fige:
        feuille.freeze_panes = "C4"
    if protege:
        feuille.protection = SheetProtection(
            sheet=True, password="secret", insertRows=not insertion_permise, insertColumns=True,
            deleteRows=True, deleteColumns=True)
        feuille.protection.enable()
    if structure:
        classeur.security.lockStructure = True
    if nom_signature:
        classeur.defined_names["ORISFLOW_SIGNATURE"] = DefinedName("ORISFLOW_SIGNATURE", attr_text="'Synthèse'!$F$1")
    if onglet_en_trop:
        classeur.create_sheet("Suivi de la treso")
    chemin = os.path.join(dossier, nom)
    classeur.save(chemin)
    return chemin


def _controle(bilan, fragment):
    return next(c for c in bilan["controles"] if fragment in c["libelle"])


def test_modele_conforme_tout_est_vert(tmp_path):
    bilan = controler_modele(_modele(str(tmp_path)))

    assert bilan["ok"] is True
    assert bilan["bloquants"] == 0 and bilan["a_corriger"] == 0, [c for c in bilan["controles"] if not c["ok"]]
    assert _controle(bilan, "conserve tout")["ok"] is True


def test_le_fichier_controle_nest_jamais_modifie(tmp_path):
    chemin = _modele(str(tmp_path))
    avant = open(chemin, "rb").read()
    controler_modele(chemin)
    assert open(chemin, "rb").read() == avant


def test_une_ligne_manquante_est_bloquante(tmp_path):
    bilan = controler_modele(_modele(str(tmp_path), sans_libelle=20))

    assert bilan["ok"] is False
    assert "ENCOURS DEPOTS" in _controle(bilan, "libellé")["detail"]


def test_sans_cellule_signature_a_corriger_mais_pas_bloquant(tmp_path):
    bilan = controler_modele(_modele(str(tmp_path), nom_signature=False))

    assert bilan["ok"] is True
    assert _controle(bilan, "signature")["ok"] is False
    assert bilan["a_corriger"] == 1


def test_insertion_de_lignes_encore_permise_est_signalee(tmp_path):
    bilan = controler_modele(_modele(str(tmp_path), insertion_permise=True))

    controle = _controle(bilan, "insérer ou supprimer")
    assert controle["ok"] is False
    assert "insérer des lignes" in controle["detail"]


def test_logo_pas_en_haut_a_gauche(tmp_path):
    bilan = controler_modele(_modele(str(tmp_path), logo_en="H30"))
    assert _controle(bilan, "Logo")["ok"] is False


def test_classeur_non_protege_ni_fige(tmp_path):
    bilan = controler_modele(_modele(str(tmp_path), protege=False, fige=False, structure=False))

    assert bilan["ok"] is True
    assert bilan["a_corriger"] >= 4


def test_onglet_en_trop_signale(tmp_path):
    bilan = controler_modele(_modele(str(tmp_path), onglet_en_trop=True))
    assert "Suivi de la treso" in _controle(bilan, "Seul l'onglet")["detail"]


def test_une_forme_serait_perdue_donc_bloquant(tmp_path):
    chemin = _modele(str(tmp_path))
    avec_forme = os.path.join(str(tmp_path), "avec_forme.xlsx")
    with zipfile.ZipFile(chemin) as entree, zipfile.ZipFile(avec_forme, "w", zipfile.ZIP_DEFLATED) as sortie:
        for element in entree.infolist():
            sortie.writestr(element, entree.read(element.filename))
        sortie.writestr(
            "xl/drawings/drawing9.xml",
            b'<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing">'
            b"<xdr:twoCellAnchor><xdr:sp></xdr:sp></xdr:twoCellAnchor></xdr:wsDr>",
        )

    bilan = controler_modele(avec_forme)

    assert bilan["ok"] is False
    assert "forme" in _controle(bilan, "conserve tout")["detail"]


def test_fichier_illisible_ou_chiffre_est_bloquant(tmp_path):
    chemin = tmp_path / "chiffre.xlsx"
    chemin.write_bytes(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + os.urandom(2048))  # conteneur Office chiffré

    bilan = controler_modele(str(chemin))

    assert bilan["ok"] is False
    assert "mot de passe d'OUVERTURE" in bilan["controles"][0]["detail"]
