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
from .classification import classer_fichiers
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


COMMANDES = {
    "ping": commande_ping,
    "analyser": commande_analyser,
    "classer": commande_classer,
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
