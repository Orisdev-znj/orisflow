"""Tests du bordereau de transmission (démarré le 30/09/2026)."""

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from orisflow_engine.bordereau import (
    ajouter_evenement,
    chemin_piece_jointe,
    creer_transmission,
    lister_transmissions,
)


def test_dossier_non_configure_est_signale_sans_erreur():
    resultat = lister_transmissions("")
    assert resultat == {"ok": True, "disponible": False, "transmissions": [], "erreurs_lecture": []}


def test_dossier_inexistant_est_signale_sans_erreur(tmp_path):
    resultat = lister_transmissions(str(tmp_path / "n_existe_pas"))
    assert resultat["disponible"] is False
    assert resultat["transmissions"] == []


def test_creer_une_transmission_puis_la_retrouver(tmp_path):
    dossier = str(tmp_path)
    creer_transmission(dossier, "Arnold", "Julien", "Facture EDF septembre", "Facture")

    resultat = lister_transmissions(dossier)
    assert resultat["disponible"] is True
    assert len(resultat["transmissions"]) == 1
    transmission = resultat["transmissions"][0]
    assert transmission["expediteur"] == "Arnold"
    assert transmission["destinataire"] == "Julien"
    assert transmission["document"] == "Facture EDF septembre"
    assert transmission["statut"] == "Transmis"
    assert transmission["evenements"] == []


def test_ne_modifie_jamais_le_fichier_de_transmission_existant(tmp_path):
    dossier = str(tmp_path)
    transmission = creer_transmission(dossier, "Arnold", "Julien", "Facture", "Facture")
    fichiers_avant = {f: (tmp_path / f).read_bytes() for f in os.listdir(dossier)}

    ajouter_evenement(dossier, transmission["id"], "accuse_reception", "Julien")

    for nom, contenu in fichiers_avant.items():
        assert (tmp_path / nom).read_bytes() == contenu  # le fichier transmission d'origine n'a pas bougé
    fichiers_apres = os.listdir(dossier)
    assert len(fichiers_apres) == 2  # la transmission + le nouvel évènement, jamais une modification en place


def test_statut_suit_le_dernier_evenement(tmp_path):
    dossier = str(tmp_path)
    transmission = creer_transmission(dossier, "Arnold", "Julien", "Facture", "Facture")

    ajouter_evenement(dossier, transmission["id"], "accuse_reception", "Julien")
    assert lister_transmissions(dossier)["transmissions"][0]["statut"] == "Reçu"

    ajouter_evenement(dossier, transmission["id"], "traite", "Julien")
    resultat = lister_transmissions(dossier)["transmissions"][0]
    assert resultat["statut"] == "Traité"
    assert [e["type_evenement"] for e in resultat["evenements"]] == ["accuse_reception", "traite"]


def test_type_evenement_inconnu_est_rejete(tmp_path):
    dossier = str(tmp_path)
    transmission = creer_transmission(dossier, "Arnold", "Julien", "Facture", "Facture")
    with pytest.raises(ValueError):
        ajouter_evenement(dossier, transmission["id"], "type_inexistant", "Julien")


def test_champs_obligatoires_verifies(tmp_path):
    dossier = str(tmp_path)
    with pytest.raises(ValueError):
        creer_transmission(dossier, "", "Julien", "Facture", "Facture")
    with pytest.raises(ValueError):
        creer_transmission(dossier, "Arnold", "", "Facture", "Facture")
    with pytest.raises(ValueError):
        creer_transmission(dossier, "Arnold", "Julien", "", "Facture")
    with pytest.raises(ValueError):
        creer_transmission("", "Arnold", "Julien", "Facture", "Facture")


def test_piece_jointe_copiee_jamais_le_fichier_original(tmp_path):
    dossier = tmp_path / "partage"
    dossier.mkdir()
    source = tmp_path / "poste_local" / "scan.pdf"
    source.parent.mkdir()
    source.write_bytes(b"contenu du scan")

    transmission = creer_transmission(
        str(dossier), "Arnold", "Julien", "Facture", "Facture", piece_jointe_source=str(source)
    )

    assert transmission["piece_jointe"] is not None
    chemin_copie = chemin_piece_jointe(str(dossier), transmission["piece_jointe"])
    assert os.path.isfile(chemin_copie)
    assert open(chemin_copie, "rb").read() == b"contenu du scan"
    assert source.read_bytes() == b"contenu du scan"  # l'original n'a pas bougé


def test_piece_jointe_introuvable_est_signalee(tmp_path):
    with pytest.raises(ValueError):
        creer_transmission(
            str(tmp_path), "Arnold", "Julien", "Facture", "Facture",
            piece_jointe_source=str(tmp_path / "n_existe_pas.pdf"),
        )


def test_fichier_corrompu_est_ignore_pas_bloquant(tmp_path):
    dossier = str(tmp_path)
    creer_transmission(dossier, "Arnold", "Julien", "Facture", "Facture")
    (tmp_path / "transmission_corrompue_00000000.json").write_text("{ pas du json valide", encoding="utf-8")

    resultat = lister_transmissions(dossier)
    assert len(resultat["transmissions"]) == 1  # la transmission valide reste lisible
    assert "transmission_corrompue_00000000.json" in resultat["erreurs_lecture"]


def test_plusieurs_transmissions_triees_plus_recente_d_abord(tmp_path):
    dossier = str(tmp_path)
    creer_transmission(dossier, "Arnold", "Julien", "Premier document", "Autre")
    creer_transmission(dossier, "Arnold", "Julien", "Second document", "Autre")

    resultat = lister_transmissions(dossier)
    documents = [t["document"] for t in resultat["transmissions"]]
    assert documents == ["Second document", "Premier document"]
