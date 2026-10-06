"""Point d'entrée du moteur, appelé par l'application Electron.

Protocole (sprint 1) :
- la commande est le premier argument (`ping`, `analyser`) ;
- les paramètres arrivent en JSON sur l'entrée standard ;
- le moteur répond par des lignes JSON sur la sortie standard :
    {"type": "progression", ...}   avancement
    {"type": "resultat", ...}      résultat final (une seule fois)
    {"type": "erreur", ...}        erreur lisible par un comptable
Le moteur ne modifie jamais les fichiers qu'on lui transmet.
"""

from __future__ import annotations

import json
import os
import platform
import sys
from typing import Any, Dict

from . import VERSION
from .bordereau import ajouter_evenement, creer_transmission, lister_transmissions
from . import carnet
from .classification import classer_fichiers
from .comptes_agences import charger_table, construire_table_depuis_dossiers, enregistrer_table, NB_COMPTES_PAR_AGENCE, SEUIL_COMPTES
from .generation import generer_classeur

EXTENSIONS_PRISES_EN_CHARGE = {".xls", ".xlsx", ".pdf"}


def emettre(**message: Any) -> None:
    print(json.dumps(message, ensure_ascii=False), flush=True)


def lire_parametres() -> Dict[str, Any]:
    if sys.stdin is None or sys.stdin.isatty():
        return {}
    brut = sys.stdin.read().strip()
    return json.loads(brut) if brut else {}


def commande_ping(_: Dict[str, Any]) -> None:
    emettre(
        type="resultat",
        commande="ping",
        ok=True,
        version=VERSION,
        python=platform.python_version(),
        systeme=platform.platform(),
    )


def _etapes_diagnostic(parametres: Dict[str, Any]):
    """Liste des vérifications du moteur (nom, fonction sans argument -> (ok, détail))."""
    import tempfile

    def _verifier_bibliotheques():
        import importlib

        manquantes = []
        for module in ("pandas", "openpyxl", "xlrd", "pymupdf"):
            try:
                importlib.import_module(module)
            except ImportError:
                manquantes.append(module)
        if manquantes:
            return False, f"Bibliothèque(s) manquante(s) : {', '.join(manquantes)}."
        return True, "pandas, openpyxl, xlrd, pymupdf présents."

    def _verifier_lecture_excel():
        import openpyxl
        import pandas as pd

        with tempfile.TemporaryDirectory() as dossier:
            chemin = os.path.join(dossier, "test.xlsx")
            classeur = openpyxl.Workbook()
            classeur.active["A1"] = "orisflow"
            classeur.save(chemin)
            lu = pd.read_excel(chemin, sheet_name=0, header=None)
            if lu.iloc[0, 0] != "orisflow":
                return False, "La valeur relue ne correspond pas à la valeur écrite."
        return True, "Écriture et lecture d'un classeur Excel réussies."

    def _verifier_lecture_pdf():
        import pymupdf

        with tempfile.TemporaryDirectory() as dossier:
            chemin = os.path.join(dossier, "test.pdf")
            document = pymupdf.open()
            page = document.new_page()
            page.insert_text((72, 72), "orisflow")
            document.save(chemin)
            document.close()
            relu = pymupdf.open(chemin)
            texte = relu.load_page(0).get_text()
            relu.close()
            if "orisflow" not in texte:
                return False, "Le texte relu ne correspond pas au texte écrit."
        return True, "Écriture et lecture d'un PDF réussies."

    def _verifier_dossier_travail():
        dossier = parametres.get("dossierTravail")
        if not dossier:
            return True, "Non vérifié (dossier de travail non transmis)."
        try:
            os.makedirs(dossier, exist_ok=True)
            chemin = os.path.join(dossier, ".orisflow_test_ecriture")
            with open(chemin, "w", encoding="utf-8") as fichier:
                fichier.write("test")
            os.remove(chemin)
        except OSError as erreur:
            return False, f"Écriture impossible dans {dossier} ({erreur})."
        return True, f"Écriture et suppression réussies dans {dossier}."

    def _verifier_table_comptes():
        table = charger_table(parametres.get("fichierTableComptes") or None)
        if not table:
            return True, "Table non construite : la reconnaissance par numéro de compte est inactive (voir Paramètres)."
        return True, f"{len(table)} agence(s) reconnaissables par leurs numéros de compte."

    return [
        ("Interpréteur Python", lambda: (True, f"Python {platform.python_version()} ({platform.platform()}).")),
        ("Bibliothèques requises", _verifier_bibliotheques),
        ("Lecture/écriture Excel", _verifier_lecture_excel),
        ("Lecture/écriture PDF", _verifier_lecture_pdf),
        ("Dossier de travail", _verifier_dossier_travail),
        ("Table de reconnaissance des agences", _verifier_table_comptes),
    ]


def commande_diagnostic(parametres: Dict[str, Any]) -> None:
    """Fait tourner une série de vérifications concrètes du moteur (demande du 05/10/2026,
    remplace le simple `ping`) : chaque étape émet sa progression et son détail, pour un
    journal complet et une barre d'avancement en %, au lieu d'une réponse unique figée."""
    etapes = _etapes_diagnostic(parametres)
    total = len(etapes)
    resultats = []
    for position, (libelle, verifier) in enumerate(etapes, start=1):
        try:
            ok, detail = verifier()
        except Exception as erreur:  # une vérification ne doit jamais interrompre les suivantes
            ok, detail = False, f"Erreur inattendue : {erreur}"
        resultats.append({"etape": libelle, "ok": ok, "detail": detail})
        emettre(
            type="progression",
            courant=position,
            total=total,
            pourcentage=round(100 * position / total),
            fichier="",
            message=f"{'✓' if ok else '✗'} {libelle} — {detail}",
        )
    emettre(
        type="resultat",
        commande="diagnostic",
        ok=all(r["ok"] for r in resultats),
        version=VERSION,
        python=platform.python_version(),
        systeme=platform.platform(),
        etapes=resultats,
    )


def commande_analyser(parametres: Dict[str, Any]) -> None:
    """Commande de test du sprint 1 : vérifie chaque fichier reçu, sans le modifier.

    La reconnaissance du type de fichier et de l'agence est prévue au sprint 2.
    """
    chemins = parametres.get("fichiers", [])
    total = len(chemins)
    fichiers = []
    for position, chemin in enumerate(chemins, start=1):
        nom = os.path.basename(chemin)
        extension = os.path.splitext(nom)[1].lower()
        if not os.path.isfile(chemin):
            statut, message = "introuvable", "Le fichier est introuvable."
            taille = 0
        elif extension not in EXTENSIONS_PRISES_EN_CHARGE:
            statut = "non_pris_en_charge"
            message = "Ce type de fichier n'est pas pris en charge (Excel ou PDF attendu)."
            taille = os.path.getsize(chemin)
        else:
            statut, message = "lisible", "Fichier reçu, prêt pour l'analyse."
            taille = os.path.getsize(chemin)
        fichiers.append(
            {"nom": nom, "chemin": chemin, "extension": extension,
             "taille": taille, "statut": statut, "message": message}
        )
        emettre(type="progression", courant=position, total=total, fichier=nom)

    anomalies = [f for f in fichiers if f["statut"] != "lisible"]
    emettre(
        type="resultat",
        commande="analyser",
        ok=not anomalies,
        version=VERSION,
        total=total,
        fichiers=fichiers,
    )


def commande_classer(parametres: Dict[str, Any]) -> None:
    """Sprint 2 : reconnaît le type et l'agence de chaque fichier, sans jamais les modifier.

    Paramètres attendus : {"fichiers": [chemins...], "dossierReference": chemin|null,
    "gestionnaires": {nom: agence}|null}. `dossierReference` est le dossier des classeurs
    de trésorerie existants, utilisé pour comparer le nombre de comptes à celui de la
    veille (lecture seule) et, depuis le 03/10/2026, pour suggérer l'agence d'une liste de
    comptes par proximité de ce total quand ni le nom ni le gestionnaire ne suffisent.
    `gestionnaires` est la table configurée par l'utilisateur (Paramètres), jamais devinée.
    """
    chemins = parametres.get("fichiers", [])
    dossier_reference = parametres.get("dossierReference") or None
    gestionnaires = parametres.get("gestionnaires") or None
    agences_manuelles = parametres.get("agencesManuelles") or None
    dossier_carnet = parametres.get("dossierCarnet") or None
    table_comptes = charger_table(parametres.get("fichierTableComptes") or None)
    total = len(chemins)
    compteur = {"valeur": 0}

    def rapporter_fichier(fichier: dict[str, Any]) -> None:
        # Un message par fichier, émis dès qu'il est classé : le journal d'étapes est
        # visible pendant l'analyse (demande du 03/10/2026), et `pourcentage` alimente la barre.
        compteur["valeur"] += 1
        emettre(
            type="progression",
            courant=compteur["valeur"],
            total=total,
            pourcentage=round(100 * compteur["valeur"] / max(total, 1)),
            fichier=fichier["nom"],
            message=_message_etape(fichier),
        )

    resultat = classer_fichiers(
        chemins,
        dossier_reference,
        gestionnaires=gestionnaires,
        agences_manuelles=agences_manuelles,
        sur_fichier_classe=rapporter_fichier,
        dossier_carnet=dossier_carnet,
        table_comptes=table_comptes,
    )
    for etape in resultat.pop("journal_etapes", []):
        emettre(type="progression", courant=total, total=total, pourcentage=100, fichier="", message=etape)
    emettre(type="resultat", commande="classer", version=VERSION, **resultat)


def _message_etape(fichier: dict[str, Any]) -> str:
    """Une ligne lisible du journal d'analyse, pour un fichier."""
    if fichier.get("type_detecte") is None:
        return f"{fichier['nom']} : introuvable."
    type_libelle = fichier.get("type_libelle") or "type inconnu"
    if fichier.get("agence_libelle"):
        return f"{fichier['nom']} : {type_libelle} — agence {fichier['agence_libelle']}."
    return f"{fichier['nom']} : {type_libelle} — agence non encore identifiée."


def commande_generer(parametres: Dict[str, Any]) -> None:
    """Sprint 4 : génère un nouveau classeur daté à partir du dernier classeur existant.

    Paramètres attendus : {"fichiers": [...], "dossierReference": chemin,
    "dossierSortie": chemin, "date": "AAAA-MM-JJ"|null, "valeursManuelles": {champ: nombre}
    |null}. `valeursManuelles` vient de la fenêtre unique de saisie manuelle (UV, UBA,
    Ecobank, Access Bank, Western Union en secours — voir regles_banques.py, 02/10/2026).
    Ne modifie jamais le classeur de référence ni les fichiers importés ; n'écrase jamais
    un fichier déjà généré.
    """
    from datetime import date as _date

    chemins = parametres.get("fichiers", [])
    dossier_reference = parametres.get("dossierReference") or None
    dossier_sortie = parametres.get("dossierSortie")
    jour_parametre = parametres.get("date")
    jour = _date.fromisoformat(jour_parametre) if jour_parametre else None
    valeurs_manuelles = parametres.get("valeursManuelles") or None
    gestionnaires = parametres.get("gestionnaires") or None
    dossier_carnet = parametres.get("dossierCarnet") or None
    releves_saisis = parametres.get("relevesSaisis") or None
    table_comptes = charger_table(parametres.get("fichierTableComptes") or None)

    if not dossier_reference:
        emettre(type="erreur", message="Aucun dossier de référence n'est configuré (voir Paramètres).")
        return
    if not dossier_sortie:
        emettre(type="erreur", message="Aucun dossier de sortie n'est configuré.")
        return

    for position, chemin in enumerate(chemins, start=1):
        emettre(type="progression", courant=position, total=len(chemins), fichier=os.path.basename(chemin))

    resultat = generer_classeur(
        chemins,
        dossier_reference,
        dossier_sortie,
        jour=jour,
        valeurs_manuelles=valeurs_manuelles,
        gestionnaires=gestionnaires,
        dossier_carnet=dossier_carnet,
        releves_saisis=releves_saisis,
        table_comptes=table_comptes,
    )
    if not resultat["ok"]:
        emettre(type="erreur", message=resultat["erreur"])
        return
    emettre(type="resultat", commande="generer", version=VERSION, **resultat)


def commande_bordereau_creer(parametres: Dict[str, Any]) -> None:
    """Bordereau de transmission (30/09/2026) : enregistre une nouvelle transmission.

    Paramètres attendus : {"dossier": chemin, "expediteur": str, "destinataire": str,
    "document": str, "typeDocument": str, "pieceJointeSource": chemin|null,
    "urgence": str|null, "commentaire": str|null}.
    """
    try:
        transmission = creer_transmission(
            dossier=parametres.get("dossier") or "",
            expediteur=parametres.get("expediteur") or "",
            destinataire=parametres.get("destinataire") or "",
            document=parametres.get("document") or "",
            type_document=parametres.get("typeDocument") or "",
            piece_jointe_source=parametres.get("pieceJointeSource") or None,
            urgence=parametres.get("urgence") or None,
            commentaire=parametres.get("commentaire") or None,
        )
    except ValueError as erreur:
        emettre(type="erreur", message=str(erreur))
        return
    emettre(type="resultat", commande="bordereau_creer", version=VERSION, ok=True, transmission=transmission)


def commande_bordereau_evenement(parametres: Dict[str, Any]) -> None:
    """Bordereau de transmission : enregistre un évènement (accusé de réception, pris en
    charge, traité, rejeté) sur une transmission existante.

    Paramètres attendus : {"dossier": chemin, "transmissionId": str, "typeEvenement": str,
    "auteur": str, "commentaire": str|null}.
    """
    try:
        evenement = ajouter_evenement(
            dossier=parametres.get("dossier") or "",
            transmission_id=parametres.get("transmissionId") or "",
            type_evenement=parametres.get("typeEvenement") or "",
            auteur=parametres.get("auteur") or "",
            commentaire=parametres.get("commentaire") or None,
        )
    except ValueError as erreur:
        emettre(type="erreur", message=str(erreur))
        return
    emettre(type="resultat", commande="bordereau_evenement", version=VERSION, ok=True, evenement=evenement)


def commande_bordereau_lister(parametres: Dict[str, Any]) -> None:
    """Bordereau de transmission : liste les transmissions du dossier partagé, en
    reconstruisant le statut de chacune à partir de ses évènements. Toujours en lecture
    seule. Paramètres attendus : {"dossier": chemin|null}."""
    resultat = lister_transmissions(parametres.get("dossier") or "")
    emettre(type="resultat", commande="bordereau_lister", version=VERSION, **resultat)


def commande_table_comptes_construire(parametres: Dict[str, Any]) -> None:
    """Construit la table « 15 comptes par agence » (décision du 05/10/2026).

    Paramètres : {"dossiers": [dossier de fichiers renommés, un par jour de référence],
    "fichierSortie": chemin du fichier JSON}. Les fichiers sources ne sont jamais modifiés.
    """
    dossiers = parametres.get("dossiers") or []
    fichier_sortie = parametres.get("fichierSortie")
    if not dossiers or not fichier_sortie:
        emettre(type="erreur", message="Il faut au moins un dossier de référence et un fichier de sortie.")
        return
    table = construire_table_depuis_dossiers(dossiers)
    enregistrer_table(fichier_sortie, table, [os.path.basename(os.path.normpath(d)) for d in dossiers])
    emettre(
        type="resultat", commande="table_comptes_construire", version=VERSION, ok=True,
        fichier=fichier_sortie,
        agences={a: len(c) for a, c in table.items()},
        seuil=SEUIL_COMPTES, comptes_par_agence=NB_COMPTES_PAR_AGENCE,
    )


def commande_carnet_importer(parametres: Dict[str, Any]) -> None:
    """Alimente rétroactivement le carnet des soldes depuis un classeur que l'utilisateur
    a validé comme correct (décision du 05/10/2026, après comparaison d'un classeur généré
    à un classeur de référence — voir carnet.extraire_soldes_classeur).

    Paramètres : {"cheminClasseur": chemin du classeur validé, "dossierCarnet": dossier du
    carnet (même convention que « classer »/« generer »)}. Le classeur source n'est jamais
    modifié.
    """
    chemin_classeur = parametres.get("cheminClasseur")
    dossier_carnet = parametres.get("dossierCarnet")
    if not chemin_classeur or not dossier_carnet:
        emettre(type="erreur", message="Il faut un classeur à importer et un dossier de carnet.")
        return
    try:
        jour, soldes, avertissements = carnet.extraire_soldes_classeur(chemin_classeur)
    except Exception as erreur:
        emettre(type="erreur", message=f"Ce classeur n'a pas pu être lu : {erreur}")
        return
    carnet.enregistrer(os.path.join(dossier_carnet, carnet.NOM_FICHIER), jour, soldes)
    emettre(
        type="resultat", commande="carnet_importer_classeur", version=VERSION, ok=True,
        jour=jour.isoformat(), comptes_importes=len(soldes), avertissements=avertissements,
    )


COMMANDES = {
    "ping": commande_ping,
    "diagnostic": commande_diagnostic,
    "analyser": commande_analyser,
    "classer": commande_classer,
    "table_comptes_construire": commande_table_comptes_construire,
    "carnet_importer_classeur": commande_carnet_importer,
    "generer": commande_generer,
    "bordereau_creer": commande_bordereau_creer,
    "bordereau_evenement": commande_bordereau_evenement,
    "bordereau_lister": commande_bordereau_lister,
}


def main(argv: list[str] | None = None) -> int:
    for flux in (sys.stdout, sys.stderr):
        if hasattr(flux, "reconfigure"):
            flux.reconfigure(encoding="utf-8")
    if sys.stdin is not None and hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8-sig")

    argv = sys.argv[1:] if argv is None else argv
    nom = argv[0] if argv else ""
    commande = COMMANDES.get(nom)
    if commande is None:
        emettre(type="erreur", message=f"Commande inconnue : « {nom} ».")
        return 2
    try:
        commande(lire_parametres())
    except json.JSONDecodeError:
        emettre(type="erreur", message="Les paramètres transmis au moteur sont illisibles.")
        return 3
    except Exception as erreur:  # le moteur ne doit jamais s'arrêter sans message clair
        emettre(type="erreur", message=f"Erreur inattendue du moteur : {erreur}")
        return 1
    return 0
