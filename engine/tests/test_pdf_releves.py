import os
import sys

import pymupdf

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from orisflow_engine.pdf_releves import detecter_releve


def _fabriquer_pdf(chemin, texte):
    document = pymupdf.open()
    page = document.new_page()
    page.insert_text((50, 50), texte, fontsize=10)
    document.save(chemin)
    document.close()


def test_reconnait_un_releve_cca_bank(tmp_path):
    chemin = tmp_path / "cca.pdf"
    _fabriquer_pdf(
        chemin,
        "EXTRAIT DE COMPTE\nNumero de compte : 10038-01773537801-12\nSolde initial (XAF) : 100",
    )
    releve = detecter_releve(str(chemin))
    assert releve.type_detecte == "releve_cca"
    assert releve.banque_libelle == "CCA-Bank"
    assert releve.numero_compte == "10038-01773537801-12"


def test_reconnait_un_releve_bgfi(tmp_path):
    chemin = tmp_path / "bgfi.pdf"
    _fabriquer_pdf(chemin, "RELEVE DE COMPTE\n70024583011\nORIS FINANCE LIBERATION CAPITAL")
    releve = detecter_releve(str(chemin))
    assert releve.type_detecte == "releve_bgfi"
    assert releve.numero_compte == "70024583011"


def test_gabarit_non_reconnu(tmp_path):
    chemin = tmp_path / "autre.pdf"
    _fabriquer_pdf(chemin, "Un document quelconque sans rapport avec un relevé.")
    releve = detecter_releve(str(chemin))
    assert releve.type_detecte == "releve_bancaire"


def test_pdf_vide_est_signale_illisible(tmp_path):
    chemin = tmp_path / "vide.pdf"
    document = pymupdf.open()
    document.new_page()
    document.save(str(chemin))
    document.close()
    releve = detecter_releve(str(chemin))
    assert releve.type_detecte == "illisible"
