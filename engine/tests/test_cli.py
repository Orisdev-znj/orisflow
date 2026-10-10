"""Tests du moteur (sprint 1) : protocole JSON, réception des fichiers, non-modification des sources."""

import io
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.dirname(__file__))
from aide_modele import poser_libelles

from orisflow_engine import VERSION, cli  # noqa: E402


def executer(commande, parametres, monkeypatch, capsys):
    monkeypatch.setattr(sys, "stdin", io.StringIO(json.dumps(parametres)))
    code = cli.main([commande])
    lignes = [json.loads(ligne) for ligne in capsys.readouterr().out.splitlines() if ligne.strip()]
    return code, lignes


def test_ping_repond_avec_la_version(monkeypatch, capsys):
    code, messages = executer("ping", {}, monkeypatch, capsys)
    assert code == 0
    assert messages[-1]["type"] == "resultat"
    assert messages[-1]["ok"] is True
    assert messages[-1]["version"] == VERSION


def test_analyser_classe_les_fichiers(monkeypatch, capsys, tmp_path):
    excel = tmp_path / "Akwa_Compte.xls"
    excel.write_bytes(b"contenu")
    inconnu = tmp_path / "notes.docx"
    inconnu.write_bytes(b"contenu")
    absent = tmp_path / "absent.pdf"

    code, messages = executer(
        "analyser", {"fichiers": [str(excel), str(inconnu), str(absent)]}, monkeypatch, capsys
    )

    assert code == 0
    resultat = messages[-1]
    statuts = {f["nom"]: f["statut"] for f in resultat["fichiers"]}
    assert statuts == {
        "Akwa_Compte.xls": "lisible",
        "notes.docx": "non_pris_en_charge",
        "absent.pdf": "introuvable",
    }
    assert resultat["ok"] is False
    assert [m["courant"] for m in messages if m["type"] == "progression"] == [1, 2, 3]


def test_analyser_ne_modifie_jamais_les_fichiers_sources(monkeypatch, capsys, tmp_path):
    source = tmp_path / "PK14_Compte.xls"
    source.write_bytes(b"donnees d'origine")
    avant = (source.read_bytes(), source.stat().st_mtime_ns)

    executer("analyser", {"fichiers": [str(source)]}, monkeypatch, capsys)

    assert (source.read_bytes(), source.stat().st_mtime_ns) == avant


def test_commande_inconnue_renvoie_un_message_lisible(monkeypatch, capsys):
    code, messages = executer("inconnue", {}, monkeypatch, capsys)
    assert code == 2
    assert messages[-1]["type"] == "erreur"
    assert "inconnue" in messages[-1]["message"]


def test_parametres_illisibles(monkeypatch, capsys):
    monkeypatch.setattr(sys, "stdin", io.StringIO("ceci n'est pas du json"))
    code = cli.main(["ping"])
    sortie = json.loads(capsys.readouterr().out.strip())
    assert code == 3
    assert sortie["type"] == "erreur"


def test_generer_sans_dossier_reference_renvoie_une_erreur_claire(monkeypatch, capsys):
    code, messages = executer("generer", {"fichiers": []}, monkeypatch, capsys)
    assert code == 0  # ce n'est pas un plantage du moteur, juste un paramétrage manquant
    assert messages[-1]["type"] == "erreur"
    assert "référence" in messages[-1]["message"]


def test_generer_de_bout_en_bout_via_le_protocole_cli(monkeypatch, capsys, tmp_path):
    import openpyxl

    dossier_reference = tmp_path / "reference"
    dossier_reference.mkdir()
    classeur = openpyxl.Workbook()
    classeur.active.title = "Synthèse"
    poser_libelles(classeur.active)
    classeur.save(dossier_reference / "TRESORERIE JOURNALIÈRE et TDB DU  10 09 2026.xlsx")

    code, messages = executer(
        "generer",
        {
            "fichiers": [],
            "dossierReference": str(dossier_reference),
            "dossierSortie": str(tmp_path / "sortie"),
            "date": "2026-09-29",
        },
        monkeypatch,
        capsys,
    )

    assert code == 0
    resultat = messages[-1]
    assert resultat["type"] == "resultat"
    assert resultat["commande"] == "generer"
    assert resultat["date"] == "2026-09-29"
    assert os.path.isfile(resultat["chemin_genere"])


def test_fichier_avec_accents_dans_le_nom(monkeypatch, capsys, tmp_path):
    fichier = tmp_path / "TRESORERIE JOURNALIÈRE et TDB.xlsx"
    fichier.write_bytes(b"x")
    _, messages = executer("analyser", {"fichiers": [str(fichier)]}, monkeypatch, capsys)
    assert messages[-1]["fichiers"][0]["statut"] == "lisible"
    assert "JOURNALIÈRE" in messages[-1]["fichiers"][0]["nom"]


def test_bordereau_creer_puis_lister_via_le_protocole_cli(monkeypatch, capsys, tmp_path):
    dossier = str(tmp_path)
    code, messages = executer(
        "bordereau_creer",
        {
            "dossier": dossier,
            "expediteur": "Arnold",
            "destinataire": "Julien",
            "document": "Facture EDF",
            "typeDocument": "Facture",
        },
        monkeypatch,
        capsys,
    )
    assert code == 0
    assert messages[-1]["commande"] == "bordereau_creer"
    assert messages[-1]["transmission"]["document"] == "Facture EDF"

    code, messages = executer("bordereau_lister", {"dossier": dossier}, monkeypatch, capsys)
    assert code == 0
    resultat = messages[-1]
    assert resultat["disponible"] is True
    assert len(resultat["transmissions"]) == 1
    assert resultat["transmissions"][0]["statut"] == "Transmis"


def test_bordereau_evenement_change_le_statut(monkeypatch, capsys, tmp_path):
    dossier = str(tmp_path)
    _, creation = executer(
        "bordereau_creer",
        {"dossier": dossier, "expediteur": "Arnold", "destinataire": "Julien", "document": "Facture", "typeDocument": "Facture"},
        monkeypatch,
        capsys,
    )
    transmission_id = creation[-1]["transmission"]["id"]

    code, messages = executer(
        "bordereau_evenement",
        {"dossier": dossier, "transmissionId": transmission_id, "typeEvenement": "accuse_reception", "auteur": "Julien"},
        monkeypatch,
        capsys,
    )
    assert code == 0
    assert messages[-1]["commande"] == "bordereau_evenement"

    _, liste = executer("bordereau_lister", {"dossier": dossier}, monkeypatch, capsys)
    assert liste[-1]["transmissions"][0]["statut"] == "Reçu"


def test_bordereau_sans_dossier_renvoie_une_erreur_claire(monkeypatch, capsys):
    code, messages = executer(
        "bordereau_creer",
        {"dossier": "", "expediteur": "Arnold", "destinataire": "Julien", "document": "Facture", "typeDocument": "Facture"},
        monkeypatch,
        capsys,
    )
    assert code == 0  # le moteur ne s'arrête jamais brutalement : il émet un message clair
    assert messages[-1]["type"] == "erreur"
    assert "dossier" in messages[-1]["message"].lower()


def test_rapport_exporter_via_le_protocole_cli(monkeypatch, capsys, tmp_path):
    chemin = tmp_path / "Rapport-analyse.xlsx"
    code, messages = executer(
        "rapport_exporter",
        {
            "fichiers": [{"nom": "Akwa_Compte.xlsx", "type_libelle": "Liste de comptes",
                          "agence_libelle": "Akwa", "confiance_agence": "nom",
                          "total_comptes": 123, "niveau": "information", "messages": []}],
            "journalEtapes": ["1 agence confirmée manuellement."],
            "chemin": str(chemin),
        },
        monkeypatch,
        capsys,
    )
    assert code == 0
    assert messages[-1]["type"] == "resultat"
    assert messages[-1]["ok"] is True
    assert messages[-1]["chemin"] == str(chemin)
    assert chemin.is_file()


def test_rapport_exporter_sans_chemin_renvoie_une_erreur_claire(monkeypatch, capsys):
    code, messages = executer("rapport_exporter", {"fichiers": []}, monkeypatch, capsys)
    assert code == 0
    assert messages[-1]["type"] == "erreur"


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-q"]))
