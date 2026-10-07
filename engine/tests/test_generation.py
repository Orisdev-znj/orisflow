"""Tests du sprint 4 : génération d'un nouveau classeur de trésorerie."""

import os
import sys
from datetime import date, timedelta

import openpyxl
import pymupdf
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from orisflow_engine.generation import generer_classeur

# Positions des colonnes observées sur les vrais documents CloudBank (voir CLAUDE.md §19.1
# et tests/test_balance_pdf.py).
_ANCRES = [231, 291, 351, 411, 471, 531]
_DECALAGE = 21


def _extraction_comptes(chemin, prefixes):
    classeur = openpyxl.Workbook()
    feuille = classeur.active
    for _ in range(23):
        feuille.append([])
    feuille.append(["N°", "Numero de compte"])
    for i, prefixe in enumerate(prefixes, start=1):
        feuille.append([i, f"{prefixe}-{i:06d}-00"])
    classeur.save(chemin)


def _extraction_balance_classe3(chemin, groupe, depots, engagements):
    """PDF synthétique de balance CloudBank classe 3 (dépôts/engagements), même mise en
    page que les vrais documents (voir CLAUDE.md §19.1 et test_balance_pdf.py)."""
    document = pymupdf.open()
    page = document.new_page()
    page.insert_text((10, 50), "Balance generale consolidée   Chapitre de : 3  à : 3")
    page.insert_text((10, 70), f"Groupe: {groupe}   {groupe}")
    page.insert_text((10, 150), "Compte")
    page.insert_text((71, 150), "Intitulé")
    for i, x in enumerate(_ANCRES):
        page.insert_text((x, 150), "Debit" if i % 2 == 0 else "Crédit")
    # Valeurs : [Débit début, Crédit début, Débit MVT, Crédit MVT, Débit fin (engagements), Crédit fin (dépôts)]
    page.insert_text((10, 175), "Total Classe : 3 INTITULE TEST")
    for x, valeur in zip(_ANCRES, [0, 0, 0, 0, engagements, depots]):
        page.insert_text((x + _DECALAGE, 175), str(valeur))
    document.save(chemin)
    document.close()


def _releve_cca_ou_afriland(chemin, numero_compte, cle_rib, solde, code_client="735378"):
    """PDF synthétique « EXTRAIT DE COMPTE » (CCA-Bank si code_client=735378, Afriland
    pour le seul autre code connu au 02/10/2026 — voir regles_banques.py)."""
    document = pymupdf.open()
    page = document.new_page()
    page.insert_text((10, 50), f"Code client : {code_client}")
    page.insert_text((10, 70), "EXTRAIT DE COMPTE")
    page.insert_text((10, 90), f"Numero de compte : {numero_compte}-{cle_rib}")
    page.insert_text((10, 110), "Solde initial (XAF) : 1")
    page.insert_text((10, 130), f"Solde (XAF) au 02/10/2026 : {solde}")
    document.save(chemin)
    document.close()


def _releve_bgfi(chemin, numero_compte, solde):
    """Reproduit le vrai gabarit BGFI (vérifié le 02/10/2026) : le nombre précède son
    étiquette « SOLDE DISPONIBLE », milliers séparés par des virgules, décimales en point."""
    document = pymupdf.open()
    page = document.new_page()
    page.insert_text((10, 50), "RELEVE DE COMPTE")
    page.insert_text((10, 70), str(numero_compte))
    page.insert_text((10, 90), "ORIS FINANCE LIBERATION CAPITAL")
    page.insert_text((10, 110), f"{solde:,}.00\nSOLDE DISPONIBLE :\n02/10/2026\nXAF")
    document.save(chemin)
    document.close()


def _classeur_modele(dossier, nom_fichier="TRESORERIE JOURNALIÈRE et TDB DU  10 09 2026.xlsx"):
    """Classeur de référence minimal, avec une feuille « Suivi de la treso » à exclure."""
    classeur = openpyxl.Workbook()
    synthese = classeur.active
    synthese.title = "Synthèse"
    synthese["A7"] = "COMPTES  COURANT ENTREPRISES"
    synthese["C7"] = 50  # ancienne valeur Akwa, doit se retrouver en C17 (J-1)
    synthese["C16"] = "=SUM(C7:C15)"  # formule à préserver
    synthese["F7"] = 30  # ancienne valeur Bafoussam
    synthese["F16"] = "=SUM(F7:F15)"
    synthese["A20"] = "ENCOURS  DEPOTS"
    synthese["C20"] = 1_000_000  # ancien dépôt Akwa, doit se retrouver en C21 (J-1)
    synthese["C22"] = "=C20-C21"  # formule à préserver
    synthese["F20"] = 2_000_000  # ancien dépôt Bafoussam
    synthese["A23"] = "ENCOURS ENGAGEMENTS"
    synthese["C23"] = 500_000  # ancien engagement Akwa, doit se retrouver en C24 (J-1)
    synthese["C25"] = "=C23-C24"  # formule à préserver
    synthese["F23"] = 800_000  # ancien engagement Bafoussam

    # Banques (28-36) : anciennes valeurs, pour vérifier que le total J-1 (36) avance bien
    # (somme de 28 à 34), quelle que soit la banque effectivement mise à jour ce jour-là.
    synthese["C28"] = 100_000_000  # CCA-Bank Akwa (sera remplacé)
    synthese["C29"] = 10_000_000  # Afriland Akwa (sera remplacé)
    synthese["C30"] = 5_000_000  # BGFI Akwa (sera remplacé)
    synthese["C31"] = "=10000000+1_000_000".replace("_", "")  # UBA Akwa (sera remplacé)
    synthese["C34"] = 2_000_000  # Western Union Akwa (sera remplacé)
    synthese["D28"] = 3_000_000  # CCA-Bank Mokolo (sera remplacé)
    synthese["C35"] = "=SUM(C28:C34)"
    synthese["C37"] = "=C35-C36"
    synthese["D35"] = "=SUM(D28:D34)"

    suivi = classeur.create_sheet("Suivi de la treso")
    suivi["A1"] = "Ne doit jamais apparaître dans le fichier généré"

    # Feuilles mortes héritées de l'ancienne méthode (voir CLAUDE.md, 29/09/2026) :
    # aucune formule de Synthèse ne les référence, elles doivent disparaître elles aussi.
    for nom in ("Agences", "Dépôts", "Caisse", "SYNTHESE 2025", "Feuil1"):
        classeur.create_sheet(nom)["A1"] = "Feuille morte, à exclure"

    chemin = dossier / nom_fichier
    classeur.save(chemin)
    return str(chemin)


@pytest.fixture
def contexte(tmp_path):
    dossier_reference = tmp_path / "reference"
    dossier_reference.mkdir()
    dossier_extractions = tmp_path / "extractions"
    dossier_extractions.mkdir()
    dossier_sortie = tmp_path / "sortie"

    _classeur_modele(dossier_reference)

    return {
        "reference": str(dossier_reference),
        "extractions": dossier_extractions,
        "sortie": str(dossier_sortie),
    }


def test_genere_un_nouveau_fichier_date_du_jour(contexte):
    chemin_akwa = contexte["extractions"] / "Akwa_Compte.xlsx"
    _extraction_comptes(chemin_akwa, ["37110", "37120"])

    resultat = generer_classeur(
        [str(chemin_akwa)], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29)
    )

    assert resultat["ok"] is True
    assert os.path.basename(resultat["chemin_genere"]) == "TRESORERIE JOURNALIÈRE et TDB DU  29 09 2026.xlsx"
    assert os.path.isfile(resultat["chemin_genere"])


def test_ne_modifie_jamais_le_modele_source(contexte):
    chemin_akwa = contexte["extractions"] / "Akwa_Compte.xlsx"
    _extraction_comptes(chemin_akwa, ["37110"])
    chemin_modele = os.path.join(contexte["reference"], "TRESORERIE JOURNALIÈRE et TDB DU  10 09 2026.xlsx")
    avant = open(chemin_modele, "rb").read()

    generer_classeur([str(chemin_akwa)], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29))

    assert open(chemin_modele, "rb").read() == avant


def test_exclut_toujours_suivi_de_la_treso(contexte):
    chemin_akwa = contexte["extractions"] / "Akwa_Compte.xlsx"
    _extraction_comptes(chemin_akwa, ["37110"])

    resultat = generer_classeur([str(chemin_akwa)], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29))

    classeur = openpyxl.load_workbook(resultat["chemin_genere"])
    assert "Suivi de la treso" not in classeur.sheetnames


def test_exclut_les_feuilles_mortes_de_lancienne_methode(contexte):
    chemin_akwa = contexte["extractions"] / "Akwa_Compte.xlsx"
    _extraction_comptes(chemin_akwa, ["37110"])

    resultat = generer_classeur([str(chemin_akwa)], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29))

    classeur = openpyxl.load_workbook(resultat["chemin_genere"])
    for nom in ("Agences", "Dépôts", "Caisse", "SYNTHESE 2025", "Feuil1"):
        assert nom not in classeur.sheetnames
    assert classeur.sheetnames == ["Synthèse"]


def test_remplit_les_comptes_et_decale_le_j1(contexte):
    chemin_akwa = contexte["extractions"] / "Akwa_Compte.xlsx"
    _extraction_comptes(chemin_akwa, ["37110", "37120", "37220"])  # 2 Courants, 1 Chèques

    resultat = generer_classeur([str(chemin_akwa)], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29))

    classeur = openpyxl.load_workbook(resultat["chemin_genere"])
    synthese = classeur["Synthèse"]
    assert synthese["C7"].value == 2  # Courants (37110+37120)
    assert synthese["C8"].value == 1  # Chèques (37220)
    assert synthese["C11"].value == 0  # Collectes : toujours 0
    assert synthese["C13"].value == 0  # Salariés : toujours 0
    assert synthese["C16"].value == "=SUM(C7:C15)"  # formule préservée, jamais remplacée
    assert synthese["C17"].value == 50  # J-1 = l'ancienne valeur de C16 (comptée hier)
    assert "Akwa" in resultat["agences_mises_a_jour"]


def test_agence_sans_fichier_reste_inchangee_mais_signalee(contexte):
    chemin_akwa = contexte["extractions"] / "Akwa_Compte.xlsx"
    _extraction_comptes(chemin_akwa, ["37110"])

    resultat = generer_classeur([str(chemin_akwa)], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29))

    classeur = openpyxl.load_workbook(resultat["chemin_genere"])
    synthese = classeur["Synthèse"]
    assert synthese["F7"].value == 30  # Bafoussam inchangé (aucun fichier reçu)
    assert synthese["F17"].value == 30  # J-1 avancé quand même (ancienne valeur de F16, la formule)
    assert "Bafoussam" in resultat["agences_non_mises_a_jour"]
    assert "Bafoussam" not in resultat["agences_mises_a_jour"]


def test_ne_jamais_ecraser_un_fichier_deja_genere(contexte):
    chemin_akwa = contexte["extractions"] / "Akwa_Compte.xlsx"
    _extraction_comptes(chemin_akwa, ["37110"])

    premier = generer_classeur([str(chemin_akwa)], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29))
    second = generer_classeur([str(chemin_akwa)], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29))

    assert premier["chemin_genere"] != second["chemin_genere"]
    assert os.path.isfile(premier["chemin_genere"])
    assert os.path.isfile(second["chemin_genere"])


def test_fichier_bloquant_est_ignore_pas_utilise(contexte):
    chemin_akwa = contexte["extractions"] / "Akwa_Compte.xlsx"
    _extraction_comptes(chemin_akwa, ["37110"])
    chemin_illisible = contexte["extractions"] / "Akwa_Compte_bis.xlsx"
    _extraction_comptes(chemin_illisible, ["37110"])  # même agence : le doublon devient bloquant

    resultat = generer_classeur(
        [str(chemin_akwa), str(chemin_illisible)], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29)
    )

    assert "Akwa" not in resultat["agences_mises_a_jour"]
    assert set(resultat["fichiers_ignores"]) == {"Akwa_Compte.xlsx", "Akwa_Compte_bis.xlsx"}


def test_aucun_modele_disponible_est_signale_clairement(tmp_path):
    dossier_reference_vide = tmp_path / "reference_vide"
    dossier_reference_vide.mkdir()

    resultat = generer_classeur([], str(dossier_reference_vide), str(tmp_path / "sortie"))

    assert resultat["ok"] is False
    assert "modèle" in resultat["erreur"] or "référence" in resultat["erreur"]


def test_par_defaut_la_date_est_celle_dhier(contexte):
    """Corrige le bug signalé par l'utilisateur le 01/10/2026 : le classeur généré sans
    date explicite portait la date du jour d'exécution, alors que la trésorerie traitée
    chaque matin concerne la journée précédente."""
    resultat = generer_classeur([], contexte["reference"], contexte["sortie"])  # pas de `jour`

    attendu = date.today() - timedelta(days=1)
    assert resultat["date"] == attendu.isoformat()
    assert os.path.basename(resultat["chemin_genere"]) == (
        f"TRESORERIE JOURNALIÈRE et TDB DU  {attendu.day:02d} {attendu.month:02d} {attendu.year}.xlsx"
    )


def test_remplit_depots_et_engagements_et_decale_leur_j1(contexte):
    """Corrige le bug signalé par l'utilisateur le 01/10/2026 : les lignes 20/21 et 23/24
    du premier essai réel contenaient deux fois la même valeur (le N-1 n'était pas lu dans
    le classeur de référence)."""
    chemin_balance = contexte["extractions"] / "balance_akwa.pdf"
    _extraction_balance_classe3(chemin_balance, "DOUALA AKWA", depots=1_200_000, engagements=600_000)

    resultat = generer_classeur([str(chemin_balance)], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29))

    classeur = openpyxl.load_workbook(resultat["chemin_genere"])
    synthese = classeur["Synthèse"]
    assert synthese["C20"].value == 1_200_000  # nouveau dépôt Akwa
    assert synthese["C21"].value == 1_000_000  # J-1 = l'ancien dépôt du modèle (C20 avant écriture)
    assert synthese["C22"].value == "=C20-C21"  # formule préservée, jamais remplacée
    assert synthese["C23"].value == 600_000  # nouvel engagement Akwa
    assert synthese["C24"].value == 500_000  # J-1 = l'ancien engagement du modèle
    assert "Akwa" in resultat["agences_balance_mises_a_jour"]


def test_agence_sans_balance_garde_ses_valeurs_mais_j1_avance(contexte):
    chemin_balance = contexte["extractions"] / "balance_akwa.pdf"
    _extraction_balance_classe3(chemin_balance, "DOUALA AKWA", depots=1_200_000, engagements=600_000)

    resultat = generer_classeur([str(chemin_balance)], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29))

    classeur = openpyxl.load_workbook(resultat["chemin_genere"])
    synthese = classeur["Synthèse"]
    # Bafoussam n'a reçu aucun fichier de balance : la valeur reste celle du modèle (2 000 000
    # / 800 000), mais le J-1 avance quand même vers cette même valeur (variation nulle, comme
    # pour les comptes).
    assert synthese["F20"].value == 2_000_000
    assert synthese["F21"].value == 2_000_000
    assert synthese["F23"].value == 800_000
    assert synthese["F24"].value == 800_000
    assert "Bafoussam" not in resultat["agences_balance_mises_a_jour"]


def test_nutilise_jamais_un_classeur_date_du_jour_genere_comme_son_propre_modele(tmp_path):
    """Corrige le bug du 01/10/2026 : si le dossier de référence contient déjà un classeur
    daté du jour qu'on génère (rattrapage, saisie en avance...), ce classeur ne doit jamais
    devenir son propre modèle (sinon son propre J-1 deviendrait une référence de lui-même)."""
    dossier_reference = tmp_path / "reference"
    dossier_reference.mkdir()
    _classeur_modele(dossier_reference, "TRESORERIE JOURNALIÈRE et TDB DU  29 09 2026.xlsx")
    # Un classeur daté du jour qu'on s'apprête à générer existe déjà (ex. rempli à la main) :
    classeur_meme_jour = openpyxl.Workbook()
    classeur_meme_jour.active.title = "Synthèse"
    classeur_meme_jour["Synthèse"]["C20"] = 999_999_999  # ne doit jamais se retrouver en J-1
    classeur_meme_jour.save(dossier_reference / "TRESORERIE JOURNALIÈRE et TDB DU  30 09 2026.xlsx")

    resultat = generer_classeur([], str(dossier_reference), str(tmp_path / "sortie"), jour=date(2026, 9, 30))

    assert resultat["ok"] is True
    assert "29 09 2026" in resultat["modele_utilise"]
    classeur = openpyxl.load_workbook(resultat["chemin_genere"])
    assert classeur["Synthèse"]["C21"].value != 999_999_999


def test_fichier_balance_bloquant_nest_jamais_utilise(contexte):
    chemin_1 = contexte["extractions"] / "balance_akwa_1.pdf"
    _extraction_balance_classe3(chemin_1, "DOUALA AKWA", depots=1_200_000, engagements=600_000)
    chemin_2 = contexte["extractions"] / "balance_akwa_2.pdf"
    _extraction_balance_classe3(chemin_2, "DOUALA AKWA", depots=1_300_000, engagements=650_000)

    resultat = generer_classeur(
        [str(chemin_1), str(chemin_2)], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29)
    )

    classeur = openpyxl.load_workbook(resultat["chemin_genere"])
    synthese = classeur["Synthèse"]
    assert synthese["C20"].value == 1_000_000  # inchangé : les deux fichiers en doublon sont ignorés
    assert "Akwa" not in resultat["agences_balance_mises_a_jour"]
    assert set(resultat["fichiers_ignores"]) == {"balance_akwa_1.pdf", "balance_akwa_2.pdf"}


# --- Banques (28-36), voir CLAUDE.md §26 — règles du 02/10/2026 ---------------------------


def test_cca_bank_akwa_cumule_plusieurs_comptes_et_ses_bons_de_caisse(contexte):
    chemin_12 = contexte["extractions"] / "cca_12.pdf"
    _releve_cca_ou_afriland(chemin_12, "10038-01773537801", "12", 186_412_276)
    chemin_39 = contexte["extractions"] / "cca_39.pdf"
    _releve_cca_ou_afriland(chemin_39, "10035-01773537807", "39", 5_051_695)

    resultat = generer_classeur(
        [str(chemin_12), str(chemin_39)], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29)
    )

    classeur = openpyxl.load_workbook(resultat["chemin_genere"])
    synthese = classeur["Synthèse"]
    # Bons de caisse (fixes, 510M + 151 847 746) + les 2 comptes lus, dans l'ordre des clés RIB.
    assert synthese["C28"].value == "=510000000+151847746+186412276+5051695"
    assert "Akwa" in resultat["agences_banques_mises_a_jour"]


def test_cca_bank_mokolo_compte_unique_reste_une_valeur_simple(contexte):
    chemin = contexte["extractions"] / "cca_86.pdf"
    _releve_cca_ou_afriland(chemin, "10007-01773537802", "86", 4_789_180)

    resultat = generer_classeur([str(chemin)], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29))

    classeur = openpyxl.load_workbook(resultat["chemin_genere"])
    assert classeur["Synthèse"]["D28"].value == 4_789_180  # valeur simple, pas de formule
    assert "Mokolo" in resultat["agences_banques_mises_a_jour"]


def test_afriland_akwa_avec_ses_bons_de_caisse(contexte):
    chemin = contexte["extractions"] / "afriland_lori.pdf"
    _releve_cca_ou_afriland(chemin, "00078-09844871001", "65", 134_381_673, code_client="00000984487")

    resultat = generer_classeur([str(chemin)], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29))

    classeur = openpyxl.load_workbook(resultat["chemin_genere"])
    assert classeur["Synthèse"]["C29"].value == "=1000000+500000000+134381673"


def test_bgfi_akwa_plusieurs_comptes_sans_bon_de_caisse(contexte):
    chemin_1 = contexte["extractions"] / "bgfi_1.pdf"
    _releve_bgfi(chemin_1, "70024583011", 36_820_915)
    chemin_2 = contexte["extractions"] / "bgfi_2.pdf"
    _releve_bgfi(chemin_2, "70024583012", 25_548_218)

    resultat = generer_classeur(
        [str(chemin_1), str(chemin_2)], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29)
    )

    classeur = openpyxl.load_workbook(resultat["chemin_genere"])
    assert classeur["Synthèse"]["C30"].value == "=36820915+25548218"


def test_western_union_automatique_depuis_le_releve_cle_97(contexte):
    chemin = contexte["extractions"] / "cca_97.pdf"
    _releve_cca_ou_afriland(chemin, "10038-01773537805", "97", 20_111_324)

    resultat = generer_classeur([str(chemin)], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29))

    classeur = openpyxl.load_workbook(resultat["chemin_genere"])
    assert classeur["Synthèse"]["C34"].value == 20_111_324
    assert not any("Western Union" in a for a in resultat["avertissements_banques"])


def test_western_union_valeur_de_secours_si_releve_absent(contexte):
    resultat = generer_classeur(
        [], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29),
        valeurs_manuelles={"western_union_secours": 21_000_000},
    )

    classeur = openpyxl.load_workbook(resultat["chemin_genere"])
    assert classeur["Synthèse"]["C34"].value == 21_000_000


def test_western_union_avertissement_fort_si_rien_fourni(contexte):
    resultat = generer_classeur([], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29))

    classeur = openpyxl.load_workbook(resultat["chemin_genere"])
    assert classeur["Synthèse"]["C34"].value == 2_000_000  # inchangé depuis le modèle
    assert any("Western Union" in a for a in resultat["avertissements_banques"])


def test_uba_formule_bon_de_caisse_plus_valeur_manuelle(contexte):
    resultat = generer_classeur(
        [], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29),
        valeurs_manuelles={"uba_solde_banque": 9_200_000},
    )

    classeur = openpyxl.load_workbook(resultat["chemin_genere"])
    assert classeur["Synthèse"]["C31"].value == "=10000000+9200000"


def test_ecobank_access_bank_uv_valeurs_manuelles_directes(contexte):
    resultat = generer_classeur(
        [], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29),
        valeurs_manuelles={
            "ecobank": 21_000_000,
            "access_bank": 5_000_000,
            "uv_orange": 3_000_000,
            "uv_mtn": 1_800_000,
            "uv_maviance": 39_000_000,
        },
    )

    classeur = openpyxl.load_workbook(resultat["chemin_genere"])
    synthese = classeur["Synthèse"]
    assert synthese["C33"].value == 21_000_000
    assert synthese["I32"].value == 5_000_000  # Access Bank : Marché Central (colonne I)
    assert synthese["C56"].value == 3_000_000
    assert synthese["C57"].value == 1_800_000
    assert synthese["C58"].value == 39_000_000


def test_total_banques_j1_avance_meme_sans_aucun_relever(contexte):
    resultat = generer_classeur([], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29))

    classeur = openpyxl.load_workbook(resultat["chemin_genere"])
    synthese = classeur["Synthèse"]
    # Ancien total banques Akwa = 100M (CCA) + 10M (Afriland) + 5M (BGFI) + 11M (UBA, formule
    # non évaluée par openpyxl donc ignorée du calcul, voir note) + 2M (WU) — seules les
    # valeurs littérales comptent (C31 est une formule, non recalculée par openpyxl).
    assert synthese["C36"].value == 100_000_000 + 10_000_000 + 5_000_000 + 2_000_000


def test_cle_rib_non_reconnue_est_ignoree_pas_bloquante(contexte):
    chemin = contexte["extractions"] / "cca_inconnu.pdf"
    _releve_cca_ou_afriland(chemin, "10038-01773537999", "50", 7_000_000)

    resultat = generer_classeur([str(chemin)], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29))

    assert resultat["ok"] is True
    assert "cca_inconnu.pdf" in resultat["fichiers_ignores"]
    classeur = openpyxl.load_workbook(resultat["chemin_genere"])
    assert classeur["Synthèse"]["C28"].value == 100_000_000  # inchangé


# --- Carnet interne et valeurs de la veille (décision du 03/10/2026, option A) ----------


def test_releve_absent_repris_de_la_veille_puis_carnet_du_jour_enregistre(contexte, tmp_path):
    """Le relevé CCA-Bank d'Akwa (clé 12) manque aujourd'hui : l'utilisateur choisit la valeur
    de la veille, qui est écrite. Le carnet du jour ne retient que les soldes réellement lus."""
    from orisflow_engine import carnet

    dossier_carnet = str(tmp_path / "carnet")
    chemin_releve = contexte["extractions"] / "releve_cca_12.pdf"
    _releve_cca_ou_afriland(chemin_releve, "10038-01773537801", "12", 555_000_000)
    carnet.enregistrer(os.path.join(dossier_carnet, carnet.NOM_FICHIER), date(2026, 9, 28), {"cca:86": 1234})

    resultat = generer_classeur(
        [str(chemin_releve)],
        contexte["reference"],
        contexte["sortie"],
        jour=date(2026, 9, 29),
        dossier_carnet=dossier_carnet,
        releves_saisis={"cca:39": 42_000_000},
    )

    classeur = openpyxl.load_workbook(resultat["chemin_genere"])
    feuille = classeur["Synthèse"]
    # Bons de caisse, relevé lu (clé 12), puis valeur de la veille (clé 39), ordre des clés RIB.
    assert feuille["C28"].value == "=510000000+151847746+555000000+42000000"
    # Le relevé lu (12) et la valeur saisie pour le relevé absent (39) sont consignés ; la veille
    # (cca:86 du 28/09) n'est jamais recopiée dans le carnet du jour.
    assert carnet.lire(os.path.join(dossier_carnet, carnet.NOM_FICHIER))["2026-09-29"] == {
        "cca:12": 555_000_000, "cca:39": 42_000_000,
    }


def test_releve_absent_sans_choix_nest_pas_repris_de_la_veille(contexte, tmp_path):
    from orisflow_engine import carnet

    dossier_carnet = str(tmp_path / "carnet")
    chemin_releve = contexte["extractions"] / "releve_cca_12.pdf"
    _releve_cca_ou_afriland(chemin_releve, "10038-01773537801", "12", 555_000_000)

    resultat = generer_classeur(
        [str(chemin_releve)], contexte["reference"], contexte["sortie"],
        jour=date(2026, 9, 29), dossier_carnet=dossier_carnet,
    )

    classeur = openpyxl.load_workbook(resultat["chemin_genere"])
    # Le relevé de la clé 39 manque et aucune valeur de la veille n'a été choisie : seul le
    # relevé lu (clé 12) entre dans la cellule, la clé 39 n'est jamais reprise d'office.
    assert classeur["Synthèse"]["C28"].value == "=510000000+151847746+555000000"


# --- Robustesse : modèle jamais recalculé par Excel (06/10/2026) ------------------------


def test_signale_une_cellule_formule_sans_valeur_calculee_dans_le_modele(contexte):
    """Le modèle de `contexte` contient C31 (UBA Akwa) en formule jamais recalculée (écrite
    par openpyxl, sans valeur en cache) : Orisflow doit le signaler plutôt que de compter 0
    silencieusement pour le J-1 (constaté le 05/10/2026 sur les lignes banques réelles)."""
    chemin_akwa = contexte["extractions"] / "Akwa_Compte.xlsx"
    _extraction_comptes(chemin_akwa, ["37110"])

    resultat = generer_classeur([str(chemin_akwa)], contexte["reference"], contexte["sortie"], jour=date(2026, 9, 29))

    assert resultat["ok"] is True
    assert len(resultat["avertissements_modele"]) == 1
    assert "pas été recalculé par Excel" in resultat["avertissements_modele"][0]
    assert "1 cellule" in resultat["avertissements_modele"][0]


def test_aucune_fausse_alerte_quand_le_modele_na_que_des_valeurs(tmp_path):
    """À l'inverse d'un modèle avec formule non recalculée : un modèle où toutes les
    cellules utilisées pour le J-1 sont des valeurs simples ne doit déclencher aucune alerte."""
    reference = tmp_path / "reference"
    reference.mkdir()
    sortie = tmp_path / "sortie"
    classeur = openpyxl.Workbook()
    synthese = classeur.active
    synthese.title = "Synthèse"
    synthese["A7"] = "COMPTES  COURANT ENTREPRISES"
    synthese["C7"] = 50  # valeur simple, aucune formule
    synthese["A20"] = "ENCOURS  DEPOTS"
    synthese["C20"] = 1_000_000
    synthese["A23"] = "ENCOURS ENGAGEMENTS"
    synthese["C23"] = 500_000
    synthese["C28"] = 100_000_000  # CCA-Bank Akwa, valeur simple
    classeur.save(reference / "TRESORERIE JOURNALIÈRE et TDB DU  10 09 2026.xlsx")

    resultat = generer_classeur([], str(reference), str(sortie), jour=date(2026, 9, 29))

    assert resultat["ok"] is True
    assert resultat["avertissements_modele"] == []


def test_modele_sans_feuille_synthese_est_signale_clairement(tmp_path):
    reference = tmp_path / "reference"
    reference.mkdir()
    classeur = openpyxl.Workbook()
    classeur.active.title = "Autre chose"
    classeur.save(reference / "TRESORERIE JOURNALIÈRE et TDB DU  10 09 2026.xlsx")

    resultat = generer_classeur([], str(reference), str(tmp_path / "sortie"), jour=date(2026, 9, 29))

    assert resultat["ok"] is False
    assert "Synthèse" in resultat["erreur"]


def test_modele_sans_aucune_ligne_de_caisse_reconnaissable_ne_plante_pas(tmp_path):
    """Un classeur restructuré au point qu'aucun libellé « CAISSE… » n'existe plus (ou une
    feuille quasi vide) ne doit jamais faire planter la génération : simplement rien à écrire."""
    reference = tmp_path / "reference"
    reference.mkdir()
    classeur = openpyxl.Workbook()
    synthese = classeur.active
    synthese.title = "Synthèse"
    synthese["A7"] = "COMPTES  COURANT ENTREPRISES"
    classeur.save(reference / "TRESORERIE JOURNALIÈRE et TDB DU  10 09 2026.xlsx")

    resultat = generer_classeur([], str(reference), str(tmp_path / "sortie"), jour=date(2026, 9, 29))

    assert resultat["ok"] is True
    assert resultat["agences_caisses_mises_a_jour"] == []
