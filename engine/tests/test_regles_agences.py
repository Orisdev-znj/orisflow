import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from orisflow_engine.regles_agences import (
    agences_dont_le_total_serait_proche,
    deduire_agences_par_comptage,
    detecter_agence,
    detecter_agence_depuis_gestionnaire,
)


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


def test_code_agence_colle_a_dautres_chiffres_nest_pas_un_faux_positif():
    """Bug réel trouvé le 03/10/2026 sur un fichier brut pas encore renommé : l'identifiant
    technique « 100007fadde8d1a0fd6c5079 » contient par coïncidence « 10000 » (code du
    Siège) — ne doit jamais être pris pour une vraie correspondance de code agence."""
    agence = detecter_agence("ETListeCompte_NoHeader_0006870_100007fadde8d1a0fd6c5079-5bf7.xls")
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


# --- Gestionnaire (démarré le 03/10/2026) ---------------------------------------------


def test_agence_reconnue_par_le_gestionnaire():
    mapping = {"ECLADORE MBIAPOUO": "akwa", "MATSIKOU KEGNE": "bepanda"}
    agence = detecter_agence_depuis_gestionnaire("ECLADORE MBIAPOUO", mapping)
    assert (agence.cle, agence.libelle, agence.confiance) == ("akwa", "Akwa", "gestionnaire")


def test_gestionnaire_tolere_les_espaces_et_la_casse():
    mapping = {"Matsikou Kegne  ": "bepanda"}  # espaces en trop, vus sur un vrai fichier
    agence = detecter_agence_depuis_gestionnaire("  matsikou kegne", mapping)
    assert agence.cle == "bepanda"


def test_gestionnaire_absent_de_la_table():
    agence = detecter_agence_depuis_gestionnaire("UN AUTRE NOM", {"ECLADORE MBIAPOUO": "akwa"})
    assert agence.cle is None
    assert agence.confiance == "aucune"


def test_gestionnaire_ou_table_vide_ne_plante_pas():
    assert detecter_agence_depuis_gestionnaire(None, {"X": "akwa"}).cle is None
    assert detecter_agence_depuis_gestionnaire("X", {}).cle is None


# --- Déduction par comptage, sur tout le lot (démarré le 03/10/2026) -----------------


def test_deduit_agence_par_comptage_quand_proche():
    totaux_veille = {"akwa": 3379, "mokolo": 500}
    resultats = deduire_agences_par_comptage([("fichier_a.xls", 3380)], totaux_veille, set())
    assert resultats["fichier_a.xls"][0] == "akwa"


def test_deduction_par_comptage_evite_les_conflits_dans_le_meme_lot():
    """Deux fichiers du même lot, tous deux proches d'Akwa : le plus proche gagne, l'autre
    reçoit la 2e meilleure option plutôt qu'un conflit (demande du 03/10/2026 : toujours
    importer les 12 listes ensemble)."""
    totaux_veille = {"akwa": 3379, "mokolo": 500}
    resultats = deduire_agences_par_comptage(
        [("fichier_a.xls", 3380), ("fichier_b.xls", 3379)], totaux_veille, set()
    )
    # Les deux se disputent Akwa ; un seul l'obtient, l'autre n'a pas de 2e candidat proche.
    agences_attribuees = {v[0] for v in resultats.values()}
    assert agences_attribuees == {"akwa"}
    assert len(resultats) == 1


def test_deduction_par_comptage_ignore_les_agences_deja_utilisees():
    totaux_veille = {"akwa": 3379}
    resultats = deduire_agences_par_comptage([("fichier_a.xls", 3380)], totaux_veille, {"akwa"})
    assert resultats == {}


def test_deduction_par_comptage_respecte_la_tolerance():
    totaux_veille = {"akwa": 1000}
    # 40 % d'écart : bien au-delà de la tolérance par défaut (20 %).
    resultats = deduire_agences_par_comptage([("fichier_a.xls", 1400)], totaux_veille, set())
    assert resultats == {}


def test_egalite_parfaite_nest_jamais_affectee_au_hasard():
    """Deux listes de même total (ex. 3384 et 3384) : le comptage ne peut pas les départager,
    aucune ne doit être affectée (vu sur les vrais fichiers du 03/10/2026)."""
    totaux_veille = {"akwa": 3384}
    resultats = deduire_agences_par_comptage(
        [("fichier_a.xls", 3384), ("fichier_b.xls", 3384)], totaux_veille, set()
    )
    assert resultats == {}
