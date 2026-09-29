"""Sprint 4 : génération d'un nouveau classeur de trésorerie journalière.

Principes (CLAUDE.md) :
- On part toujours du **dernier classeur existant** (décision du 26/09/2026) : il est
  copié, jamais modifié sur place, jamais écrasé.
- Seules les lignes déjà automatisées avec confiance sont remplies : les comptes
  (lignes 7 à 13, colonne « Total » via la formule déjà présente). Tout le reste
  (dépôts, engagements, banques, caisses, UV) est laissé tel quel, en attendant le
  sprint 5, et clairement signalé comme non mis à jour.
- Un fichier dont un contrôle de classification est **bloquant** n'est jamais utilisé
  pour remplir une cellule (il est ignoré, avec un message clair) ; un avertissement
  n'empêche pas l'utilisation, mais reste visible dans le rapport.
- L'onglet « Suivi de la treso » n'apparaît jamais dans le fichier généré (décision
  de l'utilisateur, 28/09/2026) : ses formules ne lisent que « Synthèse », jamais
  l'inverse, sa suppression est donc sans risque pour le reste du classeur.
- Les feuilles masquées héritées de l'ancienne méthode (Agences, Dépôts, Caisse,
  SYNTHESE 2025, Feuil1) sont retirées elles aussi (décision de l'utilisateur,
  29/09/2026) : vérifié qu'aucune formule de « Synthèse » ne les référence — leur
  suppression est donc sans impact sur les soldes calculés.
"""

from __future__ import annotations

import os
import shutil
from datetime import date
from typing import Any, Optional

from openpyxl import load_workbook

from .classification import classer_fichiers
from .reference_treso import NOM_FEUILLE_SYNTHESE, trouver_classeur_recent
from .regles_agences import AGENCE_COLONNE, AGENCE_LIBELLES

FEUILLES_A_EXCLURE = (
    "Suivi de la treso",
    "Agences",
    "Dépôts",
    "Caisse",
    "SYNTHESE 2025",
    "Feuil1",
)

LIGNE_COMPTE = {
    "Courants": 7,
    "Cheques": 8,
    "Epargne": 9,
    "Garanties": 10,
    # 11 (Collectes) et 13 (Salariés) : aucune règle ne les remplit, remis à 0
    # comme le fait le script actuel (zone d'ombre acceptée, voir CLAUDE.md).
    "Fonctionnaires": 12,
}
LIGNE_COLLECTES = 11
LIGNE_SALARIES = 13
LIGNE_TOTAL_COMPTES = 16
LIGNE_TOTAL_COMPTES_J1 = 17


def _nom_fichier_du_jour(jour: date) -> str:
    # Deux espaces avant la date : convention observée sur tous les classeurs réels
    # (ex. "TRESORERIE JOURNALIÈRE et TDB DU  11 09 2026.xlsx").
    return f"TRESORERIE JOURNALIÈRE et TDB DU  {jour.day:02d} {jour.month:02d} {jour.year}.xlsx"


def _chemin_disponible(dossier: str, nom: str) -> str:
    """Ajoute un suffixe numéroté si `nom` existe déjà dans `dossier` (jamais d'écrasement)."""
    base, extension = os.path.splitext(nom)
    chemin = os.path.join(dossier, nom)
    compteur = 2
    while os.path.exists(chemin):
        chemin = os.path.join(dossier, f"{base} ({compteur}){extension}")
        compteur += 1
    return chemin


def generer_classeur(
    fichiers: list[str],
    dossier_reference: str,
    dossier_sortie: str,
    jour: Optional[date] = None,
) -> dict[str, Any]:
    jour = jour or date.today()

    classement = classer_fichiers(fichiers, dossier_reference)
    chemin_modele = trouver_classeur_recent(dossier_reference)
    if chemin_modele is None:
        return {
            "ok": False,
            "erreur": "Aucun classeur de référence trouvé : impossible de savoir de quel modèle partir.",
            "classement": classement,
        }

    os.makedirs(dossier_sortie, exist_ok=True)
    chemin_sortie = _chemin_disponible(dossier_sortie, _nom_fichier_du_jour(jour))
    shutil.copyfile(chemin_modele, chemin_sortie)

    classeur = load_workbook(chemin_sortie)  # formules conservées (pas data_only)
    for nom_feuille in FEUILLES_A_EXCLURE:
        if nom_feuille in classeur.sheetnames:
            del classeur[nom_feuille]

    feuille = next((classeur[n] for n in NOM_FEUILLE_SYNTHESE if n in classeur.sheetnames), None)
    if feuille is None:
        return {
            "ok": False,
            "erreur": "La feuille « Synthèse » est introuvable dans le classeur de référence.",
            "classement": classement,
        }

    # Valeurs de la veille (celles qui vont devenir les « J-1 » du nouveau fichier) :
    # calculées nous-mêmes en sommant les lignes 7 à 15, comme le fait la formule de la
    # ligne 16 — plutôt que de lire une valeur mise en cache par Excel (`data_only`), qui
    # serait absente si le classeur source n'a jamais été recalculé/réenregistré.
    valeurs_precedentes: dict[str, Any] = {}
    for colonne in AGENCE_COLONNE.values():
        total = 0
        for r in range(7, 16):
            v = feuille[f"{colonne}{r}"].value
            if isinstance(v, (int, float)):
                total += v
        valeurs_precedentes[colonne] = total

    # La veille avance d'un jour pour toutes les agences, que leur fichier du jour
    # soit arrivé ou non (le total « aujourd'hui » ne bouge alors pas pour celles
    # dont le fichier manque : c'est la même limite qu'avec le procédé manuel).
    for colonne, valeur in valeurs_precedentes.items():
        feuille[f"{colonne}{LIGNE_TOTAL_COMPTES_J1}"] = valeur

    agences_mises_a_jour: list[str] = []
    fichiers_ignores: list[str] = []
    for fichier_classe in classement["fichiers"]:
        if fichier_classe["type_detecte"] != "compte":
            continue
        if fichier_classe["niveau"] == "bloquant":
            fichiers_ignores.append(fichier_classe["nom"])
            continue
        agence_cle = fichier_classe["agence_detectee"]
        comptages = fichier_classe["comptages"]
        if agence_cle is None or comptages is None:
            fichiers_ignores.append(fichier_classe["nom"])
            continue
        colonne = AGENCE_COLONNE[agence_cle]
        for type_compte, ligne in LIGNE_COMPTE.items():
            feuille[f"{colonne}{ligne}"] = comptages.get(type_compte, 0)
        feuille[f"{colonne}{LIGNE_COLLECTES}"] = 0
        feuille[f"{colonne}{LIGNE_SALARIES}"] = 0
        agences_mises_a_jour.append(agence_cle)

    agences_non_mises_a_jour = [
        cle for cle in AGENCE_COLONNE if cle not in agences_mises_a_jour
    ]

    classeur.save(chemin_sortie)

    return {
        "ok": True,
        "chemin_genere": chemin_sortie,
        "date": jour.isoformat(),
        "modele_utilise": chemin_modele,
        "agences_mises_a_jour": [AGENCE_LIBELLES[c] for c in agences_mises_a_jour],
        "agences_non_mises_a_jour": [AGENCE_LIBELLES[c] for c in agences_non_mises_a_jour],
        "fichiers_ignores": fichiers_ignores,
        "classement": classement,
    }
