"""Sprint 4 : génération d'un nouveau classeur de trésorerie journalière.

Principes (CLAUDE.md) :
- On part toujours du **dernier classeur existant** (décision du 26/09/2026) : il est
  copié, jamais modifié sur place, jamais écrasé.
- Lignes remplies avec confiance : les comptes (7 à 13), et depuis le 01/10/2026 les
  dépôts et engagements (20, 23), avec leurs « J-1 » (21, 24) correctement avancés —
  voir CLAUDE.md pour le détail du bug corrigé ce jour-là. Les banques, caisses et UV
  restent hors périmètre (sprint 5 toujours en cours), et clairement signalées comme
  non mises à jour.
- Par défaut (si aucune date n'est transmise), le classeur généré porte la date de
  **la veille**, pas celle du jour d'exécution : la trésorerie traitée chaque matin
  concerne la journée précédente (confirmé par l'utilisateur le 01/10/2026 — il avait
  initialement reçu un fichier daté du jour même, ce qui était incorrect).
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
from datetime import date, timedelta
from typing import Any, Optional

from openpyxl import load_workbook

from .classification import classer_fichiers
from .reference_treso import NOM_FEUILLE_SYNTHESE, trouver_classeur_recent
from .regles_agences import AGENCE_COLONNE, AGENCE_LIBELLES
from .regles_banques import BONS_DE_CAISSE, LIBELLE_CHAMP_MANUEL

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
LIGNE_DEPOTS = 20
LIGNE_DEPOTS_J1 = 21
LIGNE_ENGAGEMENTS = 23
LIGNE_ENGAGEMENTS_J1 = 24

# Banques (28-36), voir CLAUDE.md §26 — exploration et règles du 02/10/2026. CCA-Bank
# est la seule répartie par agence ; les autres (confirmées le 02/10/2026) sont
# consolidées dans la seule colonne Akwa.
LIGNE_CCA_BANK = 28
LIGNE_AFRILAND = 29
LIGNE_BGFI = 30
LIGNE_UBA = 31
LIGNE_ACCESS_BANK = 32
LIGNE_ECOBANK = 33
LIGNE_WESTERN_UNION = 34
LIGNE_TOTAL_BANQUES_J1 = 36
# Unités virtuelles (56-58) : jamais de lecture automatisée, toujours saisies via la
# fenêtre de valeurs manuelles.
LIGNE_UV_ORANGE = 56
LIGNE_UV_MTN = 57
LIGNE_UV_MAVIANCE = 58


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


def _ecrire_montant(feuille, adresse: str, termes: list[int]) -> None:
    """Un seul terme : valeur littérale (comme les comptes CCA-Bank de Mokolo/Bafoussam/
    Kousseri, observés tels quels dans les classeurs réels). Plusieurs termes : une formule
    d'addition reconstituée (demande explicite de l'utilisateur, 02/10/2026 — garder la
    lisibilité déjà présente dans le classeur, plutôt qu'un total en valeur brute)."""
    if len(termes) == 1:
        feuille[adresse] = termes[0]
    else:
        feuille[adresse] = "=" + "+".join(str(t) for t in termes)


def _ecrire_banques(
    feuille, classement: dict[str, Any], valeurs_manuelles: dict[str, Any]
) -> tuple[list[str], list[str], list[str]]:
    """Écrit les lignes banques (28 à 34) et avance le J-1 du total (36), pour toutes les
    agences. CCA-Bank est répartie par agence (voir `regles_banques.RIB_CCA_VERS_AGENCE`) ;
    Afriland, BGFI, UBA, Ecobank, Access Bank et Western Union sont consolidées dans la
    seule colonne Akwa (confirmé par l'utilisateur le 02/10/2026).

    Retourne (agences_banques_mises_a_jour, avertissements_banques, fichiers_ignores).
    """
    avertissements: list[str] = []
    fichiers_ignores: list[str] = []
    agences_mises_a_jour: list[str] = []

    # J-1 du total banques, pour TOUTES les agences, lu avant toute écriture (même
    # principe que les comptes/dépôts/engagements : sinon on lirait nos propres valeurs
    # du jour au lieu de celles du modèle).
    for colonne in AGENCE_COLONNE.values():
        total = 0
        for r in range(LIGNE_CCA_BANK, LIGNE_WESTERN_UNION + 1):
            v = feuille[f"{colonne}{r}"].value
            if isinstance(v, (int, float)):
                total += v
        feuille[f"{colonne}{LIGNE_TOTAL_BANQUES_J1}"] = total

    colonne_akwa = AGENCE_COLONNE["akwa"]

    # CCA-Bank : regrouper les comptes reconnus par agence (une agence peut en cumuler
    # plusieurs, ex. Akwa avec les clés RIB 12 et 39).
    comptes_cca: dict[str, list[tuple[str, int]]] = {}
    for f in classement["fichiers"]:
        if f["type_detecte"] != "releve_cca":
            continue
        if f.get("ligne_banque_cible") == "western_union":
            continue  # traité séparément plus bas, jamais « ignoré »
        if f.get("ligne_banque_cible") != "cca_bank" or f["niveau"] == "bloquant" or f["solde_releve"] is None or f["agence_detectee"] is None:
            fichiers_ignores.append(f["nom"])
            continue
        comptes_cca.setdefault(f["agence_detectee"], []).append((f["cle_rib"] or "", f["solde_releve"]))

    for agence, comptes in comptes_cca.items():
        colonne = AGENCE_COLONNE[agence]
        termes = list(BONS_DE_CAISSE.get(("cca_bank", agence), [])) + [
            solde for _, solde in sorted(comptes, key=lambda c: c[0])
        ]
        _ecrire_montant(feuille, f"{colonne}{LIGNE_CCA_BANK}", termes)
        agences_mises_a_jour.append(agence)

    # Afriland (Akwa uniquement pour l'instant — un seul compte connu au 02/10/2026).
    soldes_afriland: list[int] = []
    for f in classement["fichiers"]:
        if f["type_detecte"] != "releve_afriland" or f.get("ligne_banque_cible") != "afriland":
            continue
        if f["niveau"] == "bloquant" or f["solde_releve"] is None:
            fichiers_ignores.append(f["nom"])
            continue
        soldes_afriland.append(f["solde_releve"])
    if soldes_afriland:
        termes = list(BONS_DE_CAISSE.get(("afriland", "akwa"), [])) + soldes_afriland
        _ecrire_montant(feuille, f"{colonne_akwa}{LIGNE_AFRILAND}", termes)
        if "akwa" not in agences_mises_a_jour:
            agences_mises_a_jour.append("akwa")

    # BGFI (Akwa uniquement, pas de bon de caisse — confirmé le 02/10/2026).
    soldes_bgfi: list[int] = []
    for f in classement["fichiers"]:
        if f["type_detecte"] != "releve_bgfi" or f.get("ligne_banque_cible") != "bgfi":
            continue
        if f["niveau"] == "bloquant" or f["solde_releve"] is None:
            fichiers_ignores.append(f["nom"])
            continue
        soldes_bgfi.append(f["solde_releve"])
    if soldes_bgfi:
        _ecrire_montant(feuille, f"{colonne_akwa}{LIGNE_BGFI}", soldes_bgfi)
        if "akwa" not in agences_mises_a_jour:
            agences_mises_a_jour.append("akwa")

    # Western Union : automatique si son relevé (clé RIB 97) est reconnu aujourd'hui,
    # sinon la valeur de secours saisie manuellement, sinon avertissement fort (décision
    # de l'utilisateur, 02/10/2026) — le J-1 du total avance quand même (ci-dessus).
    fichier_wu = next(
        (
            f for f in classement["fichiers"]
            if f.get("ligne_banque_cible") == "western_union" and f["niveau"] != "bloquant" and f["solde_releve"] is not None
        ),
        None,
    )
    if fichier_wu:
        feuille[f"{colonne_akwa}{LIGNE_WESTERN_UNION}"] = fichier_wu["solde_releve"]
    elif valeurs_manuelles.get("western_union_secours") is not None:
        feuille[f"{colonne_akwa}{LIGNE_WESTERN_UNION}"] = int(valeurs_manuelles["western_union_secours"])
    else:
        avertissements.append(
            f"{LIBELLE_CHAMP_MANUEL['western_union_secours']} : "
            "ligne inchangée depuis la veille (aucun relevé reçu, aucune valeur saisie)."
        )

    # UBA : bon de caisse fixe + solde en banque saisi manuellement (la lecture du relevé
    # UBA reste manuelle, décision de l'utilisateur du 02/10/2026).
    if valeurs_manuelles.get("uba_solde_banque") is not None:
        fixe = BONS_DE_CAISSE[("uba", "akwa")][0]
        feuille[f"{colonne_akwa}{LIGNE_UBA}"] = f"={fixe}+{int(valeurs_manuelles['uba_solde_banque'])}"
    else:
        avertissements.append(f"{LIBELLE_CHAMP_MANUEL['uba_solde_banque']} : ligne inchangée depuis la veille.")

    # Ecobank, Access Bank, UV : valeur manuelle directe (aucune lecture automatisée).
    for champ, ligne in (
        ("ecobank", LIGNE_ECOBANK),
        ("access_bank", LIGNE_ACCESS_BANK),
        ("uv_orange", LIGNE_UV_ORANGE),
        ("uv_mtn", LIGNE_UV_MTN),
        ("uv_maviance", LIGNE_UV_MAVIANCE),
    ):
        valeur = valeurs_manuelles.get(champ)
        if valeur is not None:
            feuille[f"{colonne_akwa}{ligne}"] = valeur
        else:
            avertissements.append(f"{LIBELLE_CHAMP_MANUEL[champ]} : ligne inchangée depuis la veille.")

    return agences_mises_a_jour, avertissements, fichiers_ignores


def generer_classeur(
    fichiers: list[str],
    dossier_reference: str,
    dossier_sortie: str,
    jour: Optional[date] = None,
    valeurs_manuelles: Optional[dict[str, Any]] = None,
    gestionnaires: Optional[dict[str, str]] = None,
) -> dict[str, Any]:
    # La trésorerie traitée un matin donné concerne la journée précédente (confirmé par
    # l'utilisateur le 01/10/2026) : par défaut, le classeur porte donc la date d'hier,
    # pas celle du jour d'exécution. `jour` reste un paramètre explicite pour les tests
    # et pour un éventuel réglage manuel depuis l'interface.
    jour = jour or (date.today() - timedelta(days=1))

    classement = classer_fichiers(fichiers, dossier_reference, gestionnaires=gestionnaires)
    # `avant=jour` : exclut tout classeur du dossier de référence daté du jour généré ou
    # plus tard, pour ne jamais prendre un classeur comme son propre modèle (bug corrigé
    # le 01/10/2026, voir reference_treso.py et CLAUDE.md).
    chemin_modele = trouver_classeur_recent(dossier_reference, avant=jour)
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
    #
    # Lues AVANT toute écriture : sinon on lirait nos propres valeurs du jour au lieu de
    # celles du classeur de référence (bug corrigé le 01/10/2026, voir CLAUDE.md — les
    # lignes 20/21 et 23/24 du premier essai réel contenaient deux fois la même valeur).
    valeurs_precedentes: dict[str, Any] = {}
    depots_precedents: dict[str, Any] = {}
    engagements_precedents: dict[str, Any] = {}
    for colonne in AGENCE_COLONNE.values():
        total = 0
        for r in range(7, 16):
            v = feuille[f"{colonne}{r}"].value
            if isinstance(v, (int, float)):
                total += v
        valeurs_precedentes[colonne] = total

        v_depot = feuille[f"{colonne}{LIGNE_DEPOTS}"].value
        depots_precedents[colonne] = v_depot if isinstance(v_depot, (int, float)) else 0
        v_engagement = feuille[f"{colonne}{LIGNE_ENGAGEMENTS}"].value
        engagements_precedents[colonne] = v_engagement if isinstance(v_engagement, (int, float)) else 0

    # La veille avance d'un jour pour toutes les agences, que leur fichier du jour
    # soit arrivé ou non (le total « aujourd'hui » ne bouge alors pas pour celles
    # dont le fichier manque : c'est la même limite qu'avec le procédé manuel).
    for colonne, valeur in valeurs_precedentes.items():
        feuille[f"{colonne}{LIGNE_TOTAL_COMPTES_J1}"] = valeur
    for colonne, valeur in depots_precedents.items():
        feuille[f"{colonne}{LIGNE_DEPOTS_J1}"] = valeur
    for colonne, valeur in engagements_precedents.items():
        feuille[f"{colonne}{LIGNE_ENGAGEMENTS_J1}"] = valeur

    agences_comptes_mises_a_jour: list[str] = []
    agences_balance_mises_a_jour: list[str] = []
    fichiers_ignores: list[str] = []
    for fichier_classe in classement["fichiers"]:
        type_detecte = fichier_classe["type_detecte"]
        if type_detecte not in ("compte", "balance_classe3"):
            continue
        if fichier_classe["niveau"] == "bloquant":
            fichiers_ignores.append(fichier_classe["nom"])
            continue
        agence_cle = fichier_classe["agence_detectee"]
        if agence_cle is None:
            fichiers_ignores.append(fichier_classe["nom"])
            continue
        colonne = AGENCE_COLONNE[agence_cle]

        if type_detecte == "compte":
            comptages = fichier_classe["comptages"]
            if comptages is None:
                fichiers_ignores.append(fichier_classe["nom"])
                continue
            for type_compte, ligne in LIGNE_COMPTE.items():
                feuille[f"{colonne}{ligne}"] = comptages.get(type_compte, 0)
            feuille[f"{colonne}{LIGNE_COLLECTES}"] = 0
            feuille[f"{colonne}{LIGNE_SALARIES}"] = 0
            agences_comptes_mises_a_jour.append(agence_cle)
        else:  # balance_classe3 : dépôts (20) et engagements (23), voir CLAUDE.md §19-20
            depots = fichier_classe["depots"]
            engagements = fichier_classe["engagements"]
            if depots is None or engagements is None:
                fichiers_ignores.append(fichier_classe["nom"])
                continue
            feuille[f"{colonne}{LIGNE_DEPOTS}"] = depots
            feuille[f"{colonne}{LIGNE_ENGAGEMENTS}"] = engagements
            agences_balance_mises_a_jour.append(agence_cle)

    agences_banques_mises_a_jour, avertissements_banques, fichiers_ignores_banques = _ecrire_banques(
        feuille, classement, valeurs_manuelles or {}
    )
    fichiers_ignores.extend(fichiers_ignores_banques)

    agences_non_mises_a_jour = [
        cle for cle in AGENCE_COLONNE if cle not in agences_comptes_mises_a_jour
    ]

    classeur.save(chemin_sortie)

    return {
        "ok": True,
        "chemin_genere": chemin_sortie,
        "date": jour.isoformat(),
        "modele_utilise": chemin_modele,
        "agences_balance_mises_a_jour": [AGENCE_LIBELLES[c] for c in agences_balance_mises_a_jour],
        "agences_banques_mises_a_jour": [AGENCE_LIBELLES[c] for c in agences_banques_mises_a_jour],
        "avertissements_banques": avertissements_banques,
        "agences_mises_a_jour": [AGENCE_LIBELLES[c] for c in agences_comptes_mises_a_jour],
        "agences_non_mises_a_jour": [AGENCE_LIBELLES[c] for c in agences_non_mises_a_jour],
        "fichiers_ignores": fichiers_ignores,
        "classement": classement,
    }
