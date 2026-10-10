"""Recalcul d'un classeur via LibreOffice en mode sans interface.

openpyxl ne calcule jamais une formule : un classeur enregistré par Orisflow (ou jamais
rouvert dans Excel) n'a aucune valeur en cache pour ses cellules-formules, et son « J-1 »
serait lu comme 0. Ce module produit une copie recalculée par LibreOffice — même effet
qu'ouvrir puis enregistrer le fichier dans Excel — sans jamais modifier l'original.

La copie recalculée est conservée dans un cache (clé : chemin, taille, date de
modification) : le même classeur de référence n'est converti qu'une fois, même s'il est
relu par l'analyse puis par la génération. Si LibreOffice est absent ou échoue, la fonction
retourne `None` et l'appelant garde le comportement sans recalcul (avertissement).
"""

from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
import tempfile
import time
from typing import Optional

CHEMINS_SOFFICE_CANDIDATS = [
    r"C:\Program Files\LibreOffice\program\soffice.exe",
    r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
]

DELAI_PAR_DEFAUT_SECONDES = 90
TENTATIVES = 2
DUREE_VIE_CACHE_SECONDES = 3 * 24 * 3600

# Modifiable par les tests ; lu à chaque appel.
DOSSIER_CACHE = os.path.join(tempfile.gettempdir(), "orisflow_recalcul")


def _trouver_soffice() -> Optional[str]:
    for candidat in CHEMINS_SOFFICE_CANDIDATS:
        if os.path.isfile(candidat):
            return candidat
    return shutil.which("soffice")


def _cle_cache(chemin: str) -> str:
    infos = os.stat(chemin)
    brut = f"{os.path.normcase(os.path.abspath(chemin))}|{infos.st_size}|{infos.st_mtime_ns}"
    return hashlib.sha1(brut.encode("utf-8")).hexdigest()


def _purger_cache(dossier: str) -> None:
    limite = time.time() - DUREE_VIE_CACHE_SECONDES
    try:
        for nom in os.listdir(dossier):
            chemin = os.path.join(dossier, nom)
            if os.path.isfile(chemin) and os.path.getmtime(chemin) < limite:
                os.remove(chemin)
    except OSError:
        pass


def recalculer_classeur(chemin: str, delai_secondes: int = DELAI_PAR_DEFAUT_SECONDES) -> Optional[str]:
    """Chemin d'une copie recalculée de `chemin` (dans le cache, à ne pas supprimer par
    l'appelant), ou `None` si LibreOffice est introuvable, si `chemin` n'existe pas, ou si
    la conversion échoue. `chemin` n'est jamais ouvert autrement qu'en lecture."""
    if not os.path.isfile(chemin):
        return None
    dossier_cache = DOSSIER_CACHE
    os.makedirs(dossier_cache, exist_ok=True)
    _purger_cache(dossier_cache)
    cible = os.path.join(dossier_cache, _cle_cache(chemin) + ".xlsx")
    if os.path.isfile(cible):
        return cible

    soffice = _trouver_soffice()
    if soffice is None:
        return None

    dossier_temp = tempfile.mkdtemp(prefix="orisflow_recalcul_", dir=dossier_cache)
    # Entrée et sortie dans deux dossiers distincts : écrire le résultat par-dessus le fichier
    # source, que LibreOffice tient ouvert, échoue selon les cas (« Write Code 12 »).
    dossier_entree = os.path.join(dossier_temp, "entree")
    dossier_sortie = os.path.join(dossier_temp, "sortie")
    os.makedirs(dossier_entree)
    os.makedirs(dossier_sortie)
    copie = os.path.join(dossier_entree, "source" + os.path.splitext(chemin)[1])
    recalcule = os.path.join(dossier_sortie, "source.xlsx")
    # Profil LibreOffice propre à Orisflow, conservé d'une fois sur l'autre : la conversion
    # fonctionne même si LibreOffice est déjà ouvert, et le profil n'est initialisé qu'une fois.
    profil = "file:///" + os.path.join(dossier_cache, "profil_libreoffice").replace("\\", "/")
    commande = [soffice, f"-env:UserInstallation={profil}", "--headless", "--norestore",
                "--convert-to", "xlsx", "--outdir", dossier_sortie, copie]
    try:
        shutil.copyfile(chemin, copie)
        # LibreOffice plante parfois au premier démarrage d'un profil neuf (code 0xC0000409) :
        # une seconde tentative, profil désormais initialisé, réussit.
        for _tentative in range(TENTATIVES):
            resultat = subprocess.run(commande, capture_output=True, timeout=delai_secondes)
            if resultat.returncode == 0 and os.path.isfile(recalcule):
                os.replace(recalcule, cible)
                return cible
        return None
    except (OSError, subprocess.SubprocessError):
        return None
    finally:
        shutil.rmtree(dossier_temp, ignore_errors=True)
