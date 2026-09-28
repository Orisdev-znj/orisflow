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
from .classification import classer_fichiers

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

    Paramètres attendus : {"fichiers": [chemins...], "dossierReference": chemin|null}.
    `dossierReference` est le dossier des classeurs de trésorerie existants, utilisé
    uniquement pour comparer le nombre de comptes à celui de la veille (lecture seule).
    """
    chemins = parametres.get("fichiers", [])
    dossier_reference = parametres.get("dossierReference") or None
    total = len(chemins)

    for position, chemin in enumerate(chemins, start=1):
        emettre(type="progression", courant=position, total=total, fichier=os.path.basename(chemin))

    resultat = classer_fichiers(chemins, dossier_reference)
    emettre(type="resultat", commande="classer", version=VERSION, **resultat)


COMMANDES = {"ping": commande_ping, "analyser": commande_analyser, "classer": commande_classer}


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
