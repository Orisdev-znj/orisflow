"""Cache disque des lectures de fichiers importés.

Chaque commande du moteur est un nouveau processus : sans cache, « Générer » relisait
tous les PDF et listes de comptes déjà lus par « Analyser ». Une entrée est identifiée
par le chemin, la taille et la date de modification du fichier, plus la version du
moteur : un fichier modifié, ou un moteur mis à jour, ne réutilise jamais un ancien
résultat. Une entrée par fichier (pas de gros JSON partagé à réécrire), purge après
quelques jours. Toute erreur de cache est ignorée : le cache n'est jamais bloquant.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from typing import Any, Optional

from . import VERSION

DUREE_VIE_SECONDES = 3 * 24 * 3600


class CacheFichiers:
    def __init__(self, dossier: Optional[str]):
        self.dossier = dossier
        if dossier:
            try:
                os.makedirs(dossier, exist_ok=True)
                self._purger()
            except OSError:
                self.dossier = None

    def _purger(self) -> None:
        limite = time.time() - DUREE_VIE_SECONDES
        for racine, _dossiers, fichiers in os.walk(self.dossier):
            for nom in fichiers:
                chemin = os.path.join(racine, nom)
                try:
                    if os.path.getmtime(chemin) < limite:
                        os.remove(chemin)
                except OSError:
                    pass

    def _chemin_entree(self, espace: str, chemin_fichier: str) -> Optional[str]:
        if not self.dossier:
            return None
        try:
            infos = os.stat(chemin_fichier)
        except OSError:
            return None
        brut = f"{VERSION}|{espace}|{os.path.normcase(os.path.abspath(chemin_fichier))}|{infos.st_size}|{infos.st_mtime_ns}"
        return os.path.join(self.dossier, espace, hashlib.sha1(brut.encode("utf-8")).hexdigest() + ".json")

    def lire(self, espace: str, chemin_fichier: str) -> Optional[Any]:
        entree = self._chemin_entree(espace, chemin_fichier)
        if entree is None or not os.path.isfile(entree):
            return None
        try:
            with open(entree, "r", encoding="utf-8") as fichier:
                return json.load(fichier)
        except (OSError, json.JSONDecodeError):
            return None

    def ecrire(self, espace: str, chemin_fichier: str, valeur: Any) -> None:
        entree = self._chemin_entree(espace, chemin_fichier)
        if entree is None:
            return
        try:
            os.makedirs(os.path.dirname(entree), exist_ok=True)
            temporaire = entree + ".tmp"
            with open(temporaire, "w", encoding="utf-8") as fichier:
                json.dump(valeur, fichier, ensure_ascii=False)
            os.replace(temporaire, entree)
        except (OSError, TypeError, ValueError):
            pass


SANS_CACHE = CacheFichiers(None)
