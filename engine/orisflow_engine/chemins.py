"""Chemins de fichiers Windows trop longs.

Au-delà de 260 caractères (limite MAX_PATH), Windows refuse d'ouvrir un fichier, même s'il
apparaît dans la liste du dossier — constaté le 10/10/2026 sur les listes de comptes du
dossier « Extraction liste des comptes par agence\\Fichier Originaux » (285 caractères).
Le préfixe `\\\\?\\` lève cette limite. Il n'est ajouté qu'aux chemins longs, pour ne rien
changer aux autres, et uniquement au moment de lire : les chemins renvoyés à l'interface
restent ceux que l'utilisateur a choisis.
"""

from __future__ import annotations

import os

SEUIL_CHEMIN_LONG = 240


def chemin_lecture(chemin: str) -> str:
    if os.name != "nt" or not chemin or chemin.startswith("\\\\?\\"):
        return chemin
    absolu = os.path.abspath(chemin)
    if len(absolu) < SEUIL_CHEMIN_LONG:
        return chemin
    if absolu.startswith("\\\\"):
        return "\\\\?\\UNC\\" + absolu[2:]
    return "\\\\?\\" + absolu
