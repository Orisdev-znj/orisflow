"""Recalcul forcé d'un classeur via LibreOffice en mode sans interface (10/10/2026).

Un classeur enregistré par openpyxl (celui qu'Orisflow produit, ou tout classeur jamais
rouvert dans Excel depuis) ne porte aucune valeur mise en cache pour ses cellules-formules —
openpyxl ne calcule jamais une formule, seul Excel ou LibreOffice le fait, et seulement à
l'ouverture. Jusqu'ici, la correction demandait d'ouvrir le fichier dans Excel et de
l'enregistrer manuellement avant de pouvoir lire un « J-1 » fiable (voir CLAUDE.md §21 et
§25 — « avertissements_modele »).

Ce module automatise cette étape : une COPIE jetable du classeur est recalculée par
LibreOffice (`--headless --convert-to xlsx`), jamais le fichier d'origine, qui n'est ouvert
qu'en lecture. Si LibreOffice n'est pas installé ou que la conversion échoue (délai dépassé,
erreur), la fonction retourne `None` : l'appelant retombe alors sur le comportement
précédent (valeur absente, avertissement existant), sans jamais bloquer l'analyse ni la
génération — le recalcul est une amélioration, jamais une dépendance bloquante.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from typing import Optional

CHEMINS_SOFFICE_CANDIDATS = [
    r"C:\Program Files\LibreOffice\program\soffice.exe",
    r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    "soffice",  # sur le PATH (autre poste, autre système)
]

DELAI_PAR_DEFAUT_SECONDES = 60


def _trouver_soffice() -> Optional[str]:
    for candidat in CHEMINS_SOFFICE_CANDIDATS:
        if os.path.isfile(candidat):
            return candidat
    return shutil.which("soffice")


def recalculer_classeur(chemin: str, delai_secondes: int = DELAI_PAR_DEFAUT_SECONDES) -> Optional[str]:
    """Convertit une copie jetable de `chemin` sur elle-même via LibreOffice headless, ce qui
    force le recalcul de toutes les formules (même effet qu'ouvrir puis enregistrer dans
    Excel). Retourne le chemin du fichier recalculé, dans un dossier temporaire créé pour
    l'occasion (à supprimer par l'appelant une fois lu), ou `None` si LibreOffice est
    introuvable, si `chemin` n'existe pas, ou si la conversion échoue. Ne modifie et
    n'ouvre jamais `chemin` lui-même autrement qu'en lecture (copie avant conversion)."""
    soffice = _trouver_soffice()
    if soffice is None or not os.path.isfile(chemin):
        return None

    dossier_temp = tempfile.mkdtemp(prefix="orisflow_recalcul_")
    copie = os.path.join(dossier_temp, os.path.basename(chemin))
    try:
        shutil.copyfile(chemin, copie)
        resultat = subprocess.run(
            [soffice, "--headless", "--norestore", "--convert-to", "xlsx", "--outdir", dossier_temp, copie],
            capture_output=True,
            timeout=delai_secondes,
        )
        recalcule = os.path.join(dossier_temp, os.path.splitext(os.path.basename(copie))[0] + ".xlsx")
        if resultat.returncode != 0 or not os.path.isfile(recalcule):
            shutil.rmtree(dossier_temp, ignore_errors=True)
            return None
        return recalcule
    except (OSError, subprocess.SubprocessError):
        shutil.rmtree(dossier_temp, ignore_errors=True)
        return None


def nettoyer(chemin_recalcule: Optional[str]) -> None:
    """Supprime le dossier temporaire produit par `recalculer_classeur`, sans jamais lever
    d'exception (nettoyage du dossier de travail, jamais bloquant)."""
    if chemin_recalcule is None:
        return
    shutil.rmtree(os.path.dirname(chemin_recalcule), ignore_errors=True)
