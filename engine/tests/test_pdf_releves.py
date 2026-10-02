import os
import sys

import pymupdf

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from orisflow_engine.pdf_releves import detecter_releve, lire_cle_rib, lire_code_client, lire_solde_releve


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
        "Code client : 735378\nEXTRAIT DE COMPTE\nNumero de compte : 10038-01773537801-12\n"
        "Solde initial (XAF) : 100\nSolde (XAF) au 02/10/2026 : 186 412 276",
    )
    releve = detecter_releve(str(chemin))
    assert releve.type_detecte == "releve_cca"
    assert releve.banque_libelle == "CCA-Bank"
    assert releve.numero_compte == "10038-01773537801-12"
    assert releve.cle_rib == "12"
    assert releve.code_client == "735378"
    assert releve.solde == 186412276


def test_reconnait_un_releve_afriland(tmp_path):
    """Afriland First Bank partage le même gabarit que CCA-Bank (voir CLAUDE.md §26) :
    seul le « Code client » les distingue."""
    chemin = tmp_path / "afriland.pdf"
    _fabriquer_pdf(
        chemin,
        "Code client : 00000984487\nEXTRAIT DE COMPTE\nNumero de compte : 00078-09844871001-65\n"
        "Solde initial (XAF) : 100\nSolde (XAF) au 02/10/2026 : 134 381 673",
    )
    releve = detecter_releve(str(chemin))
    assert releve.type_detecte == "releve_afriland"
    assert releve.banque_libelle == "Afriland First Bank"
    assert releve.cle_rib == "65"
    assert releve.solde == 134381673


def test_code_client_non_reconnu_nest_jamais_devine(tmp_path):
    chemin = tmp_path / "inconnu.pdf"
    _fabriquer_pdf(
        chemin,
        "Code client : 999999\nEXTRAIT DE COMPTE\nNumero de compte : 10038-01773537999-50\n"
        "Solde initial (XAF) : 100",
    )
    releve = detecter_releve(str(chemin))
    assert releve.type_detecte == "releve_bancaire"  # ni CCA-Bank ni Afriland : jamais deviné


def test_reconnait_un_releve_bgfi(tmp_path):
    chemin = tmp_path / "bgfi.pdf"
    _fabriquer_pdf(
        chemin,
        "RELEVE DE COMPTE\n70024583011\nORIS FINANCE LIBERATION CAPITAL\n"
        "SOLDE PRECEDENT AU 01/09/2026 XAF : 35 260 077,00\n"
        "SOLDE DISPONIBLE au 02/10/2026 XAF : 36 820 915,00",
    )
    releve = detecter_releve(str(chemin))
    assert releve.type_detecte == "releve_bgfi"
    assert releve.numero_compte == "70024583011"


def test_bgfi_gabarit_reel_nombre_avant_etiquette_et_virgules(tmp_path):
    """Le vrai gabarit BGFI (vérifié le 02/10/2026) place le nombre AVANT son étiquette
    (ordre du texte scrambled, comme les balances CloudBank) et sépare les milliers par
    des virgules avec un point décimal (« 36,820,915.00 »), pas des espaces."""
    chemin = tmp_path / "bgfi_reel.pdf"
    _fabriquer_pdf(
        chemin,
        "RELEVE DE COMPTE\nORIS FINANCE LIBERATION CAPITAL\n70024583011\nXAF\n"
        "35,260,077.00\n  RELEVE DES OPERATIONS\n01/09/2026\nXAF\n"
        "36,820,915.00\nSOLDE DISPONIBLE :\n02/10/2026\nXAF",
    )
    releve = detecter_releve(str(chemin))
    assert releve.type_detecte == "releve_bgfi"
    assert releve.solde == 36820915  # jamais le solde précédent (35 260 077)


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


def test_lire_cle_rib_directement():
    assert lire_cle_rib("Numéro de compte : 10038-01773537801-12 XAF") == "12"
    assert lire_cle_rib("Aucun numéro ici") is None


def test_lire_code_client_directement():
    assert lire_code_client("Code client : 735378") == "735378"


def test_lire_solde_releve_prend_le_dernier_trouve():
    texte = "Solde (XAF) au 10/09/2026 : 1 000\nSolde (XAF) au 02/10/2026 : 2 000"
    assert lire_solde_releve(texte) == 2000
