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
from . import carnet
from .regles_agences import AGENCE_COLONNE, AGENCE_LIBELLES
from .regles_banques import BON_INCLUS_DANS_RELEVE, RELEVES_ATTENDUS, cle_releve
from .comptes_agences import charger_table, NB_COMPTES_PAR_AGENCE
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
    feuille, classement: dict[str, Any], valeurs_manuelles: dict[str, Any], feuille_valeurs=None
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
    # Valeurs calculées (et non formules) : certaines cellules de banque sont des additions
    # (ex. « =510000000+151847746+… ») qu'une lecture de la formule compterait pour zéro.
    feuille_valeurs = feuille_valeurs if feuille_valeurs is not None else feuille
    for colonne in AGENCE_COLONNE.values():
        total = 0
        for r in range(LIGNE_CCA_BANK, LIGNE_WESTERN_UNION + 1):
            total += _valeur(feuille_valeurs, f"{colonne}{r}")
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
        soldes_afriland.append(_terme_releve(f))
    if soldes_afriland:
        termes = list(BONS_DE_CAISSE.get(("afriland", "akwa"), [])) + soldes_afriland
        _ecrire_montant(feuille, f"{colonne_akwa}{LIGNE_AFRILAND}", termes)
        if "akwa" not in agences_mises_a_jour:
            agences_mises_a_jour.append("akwa")

    # BGFI (Akwa uniquement, pas de bon de caisse — confirmé le 02/10/2026).
    # Triés par numéro de compte (comme CCA-Bank par clé RIB) : sans ordre fixe, on ne peut
    # plus retrouver, en relisant un classeur, quel terme appartient à quel compte (05/10/2026).
    comptes_bgfi: list[tuple[str, int]] = []
    for f in classement["fichiers"]:
        if f["type_detecte"] != "releve_bgfi" or f.get("ligne_banque_cible") != "bgfi":
            continue
        if f["niveau"] == "bloquant" or f["solde_releve"] is None:
            fichiers_ignores.append(f["nom"])
            continue
        comptes_bgfi.append((f.get("numero_compte_pdf") or "", f["solde_releve"]))
    if comptes_bgfi:
        termes = [solde for _, solde in sorted(comptes_bgfi, key=lambda c: c[0])]
        _ecrire_montant(feuille, f"{colonne_akwa}{LIGNE_BGFI}", termes)
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
    # Access Bank est rangée sous Marché Central (colonne I), comme dans le classeur
    # (confirmé par l'utilisateur le 05/10/2026) ; les autres lignes restent sous Akwa.
    colonne_access = AGENCE_COLONNE["marchecentral"]
    for champ, ligne, colonne in (
        ("ecobank", LIGNE_ECOBANK, colonne_akwa),
        ("access_bank", LIGNE_ACCESS_BANK, colonne_access),
        ("uv_orange", LIGNE_UV_ORANGE, colonne_akwa),
        ("uv_mtn", LIGNE_UV_MTN, colonne_akwa),
        ("uv_maviance", LIGNE_UV_MAVIANCE, colonne_akwa),
    ):
        valeur = valeurs_manuelles.get(champ)
        if valeur is not None:
            feuille[f"{colonne}{ligne}"] = valeur
        else:
            avertissements.append(f"{LIBELLE_CHAMP_MANUEL[champ]} : ligne inchangée depuis la veille.")

    return agences_mises_a_jour, avertissements, fichiers_ignores


def _terme_releve(f: dict[str, Any]) -> int:
    """Montant à écrire pour un relevé lu : le solde, sans le bon de caisse permanent si le
    solde le contient (règle du 05/10/2026, voir regles_banques.BON_INCLUS_DANS_RELEVE)."""
    solde = int(f["solde_releve"])
    bon = BON_INCLUS_DANS_RELEVE.get(cle_releve(f.get("type_detecte"), f.get("cle_rib"), f.get("numero_compte_pdf")) or "")
    if bon is not None and solde >= bon:
        return solde - bon
    return solde


def _valeur(feuille_valeurs, adresse: str) -> int:
    """Valeur calculée d'une cellule (lue dans le modèle tel qu'enregistré par Excel) ; 0 si vide ou texte."""
    v = feuille_valeurs[adresse].value
    return v if isinstance(v, (int, float)) else 0


# Lignes (fixes, hors caisses/liquidité qui bougent d'un classeur à l'autre — voir
# `_ecrire_caisses`) utilisées pour calculer un J-1 à partir du modèle.
_LIGNES_J1_A_VERIFIER = list(range(7, 16)) + [LIGNE_DEPOTS, LIGNE_ENGAGEMENTS] + list(range(
    LIGNE_CCA_BANK, LIGNE_WESTERN_UNION + 1
))


def _verifier_modele_recalcule(feuille, feuille_valeurs, lignes: list[int]) -> list[str]:
    """Un classeur enregistré par openpyxl (donc aussi un classeur généré par Orisflow puis
    jamais rouvert dans Excel) perd la valeur calculée de ses cellules-formules : les lire
    pour un J-1 donnerait silencieusement 0 (constaté le 05/10/2026 sur les lignes banques).
    Ici, on le détecte et on prévient, plutôt que de laisser passer un J-1 faux sans alerte."""
    manquantes = 0
    for colonne in AGENCE_COLONNE.values():
        for r in lignes:
            brute = feuille[f"{colonne}{r}"].value
            est_formule = isinstance(brute, str) and brute.startswith("=")
            if est_formule and feuille_valeurs[f"{colonne}{r}"].value is None:
                manquantes += 1
    if not manquantes:
        return []
    return [
        f"Le classeur de référence n'a pas été recalculé par Excel depuis son enregistrement : "
        f"{manquantes} cellule(s) utilisée(s) pour le « J-1 » n'ont pas de valeur connue et ont été "
        "comptées comme 0. Ouvrez ce classeur dans Excel, enregistrez-le, puis régénérez pour un J-1 fiable."
    ]


def _ligne_par_libelle(feuille, libelle: str) -> int | None:
    """Numéro de ligne dont le libellé (colonne A) vaut `libelle`, sans tenir compte des espaces
    ni de la casse. Les numéros de ligne changent d'un classeur à l'autre : on ne les suppose jamais."""
    cible = "".join(libelle.upper().split())
    for r in range(1, feuille.max_row + 1):
        v = feuille[f"A{r}"].value
        if v is not None and "".join(str(v).upper().split()) == cible:
            return r
    return None


def _ecrire_caisses(feuille, feuille_valeurs, classement: dict[str, Any]) -> tuple[list[str], list[str]]:
    """Caisses par agence (balance classe 5, colonne « Débit Solde fin » de `Total : 57`, lue par
    `balance_pdf.lire_balance_classe5`), écrites sur la ligne de chaque agence repérée par son libellé,
    puis J-1 des caisses (total de la veille) et J-1 des liquidités (total de la veille)."""
    from .regles_agences import detecter_agence_depuis_texte

    avertissements: list[str] = []
    agences_mises_a_jour: list[str] = []

    lignes_caisse: dict[str, int] = {}
    for r in range(1, feuille.max_row + 1):
        libelle = feuille[f"A{r}"].value
        if not libelle:
            continue
        lib = "".join(str(libelle).upper().split())
        if not lib.startswith("CAISSE") or "TOTAL" in lib or "PLAFOND" in lib or "DEVISES" in lib:
            continue
        # « PK-14 » et « PK 14 » désignent la même agence (libellé du classeur).
        agence = detecter_agence_depuis_texte(str(libelle).replace("PK-", "PK").replace("PK ", "PK"))
        if agence.cle is not None:
            lignes_caisse[agence.cle] = r

    montants: dict[str, int] = {}
    for f in classement["fichiers"]:
        if f["type_detecte"] != "balance_classe5" or f["niveau"] == "bloquant" or f["agence_detectee"] is None:
            continue
        if f.get("caisse") is None:
            continue
        montants[f["agence_detectee"]] = int(f["caisse"])

    for agence, ligne in lignes_caisse.items():
        colonne = AGENCE_COLONNE[agence]
        if agence in montants:
            feuille[f"{colonne}{ligne}"] = montants[agence]
            agences_mises_a_jour.append(agence)
        else:
            avertissements.append(
                f"Caisse {AGENCE_LIBELLES[agence]} : ligne inchangée depuis la veille (balance classe 5 non reçue)."
            )

    ligne_total = _ligne_par_libelle(feuille, "TOTAL CAISSES")
    ligne_total_j1 = _ligne_par_libelle(feuille, "TOTAL CAISSES J-1")
    if ligne_total and ligne_total_j1:
        for colonne in AGENCE_COLONNE.values():
            feuille[f"{colonne}{ligne_total_j1}"] = _valeur(feuille_valeurs, f"{colonne}{ligne_total}")

    ligne_liquidite = _ligne_par_libelle(feuille, "TOTAL LIQUIDITE")
    ligne_liquidite_j1 = _ligne_par_libelle(feuille, "LIQUIDITES J-1")
    if ligne_liquidite and ligne_liquidite_j1:
        for colonne in AGENCE_COLONNE.values():
            feuille[f"{colonne}{ligne_liquidite_j1}"] = _valeur(feuille_valeurs, f"{colonne}{ligne_liquidite}")

    return agences_mises_a_jour, avertissements


def _soldes_du_jour(classement: dict[str, Any]) -> dict[str, int]:
    """Soldes lus aujourd'hui, par clé de relevé (ex. « cca:12 »), pour le carnet."""
    soldes: dict[str, int] = {}
    for f in classement["fichiers"]:
        cle = cle_releve(f.get("type_detecte"), f.get("cle_rib"), f.get("numero_compte_pdf"))
        if cle is None or cle in soldes or f["niveau"] == "bloquant" or f.get("solde_releve") is None:
            continue
        soldes[cle] = _terme_releve(f)
    for f in classement["fichiers"]:
        if f["niveau"] == "bloquant" or f["agence_detectee"] is None:
            continue
        if f["type_detecte"] == "balance_classe3":
            if f.get("depots") is not None:
                soldes.setdefault(f"depots:{f['agence_detectee']}", int(f["depots"]))
            if f.get("engagements") is not None:
                soldes.setdefault(f"engagements:{f['agence_detectee']}", int(f["engagements"]))
        elif f["type_detecte"] == "balance_classe5" and f.get("caisse") is not None:
            soldes.setdefault(f"caisse:{f['agence_detectee']}", int(f["caisse"]))
    return soldes


# Saisies manuelles enregistrées au carnet, sous les mêmes noms que dans le carnet existant.
# Maviance n'y figure pas : saisie manuelle chaque jour (décision du 05/10/2026).
_NOMS_CARNET_MANUELS = {
    "uv_orange": "uv:orange_money",
    "uv_mtn": "uv:mtn_momo",
    "ecobank": "ecobank:akwa",
    "access_bank": "access_bank:marche_central",
    "uba_solde_banque": "uba:akwa",
}


_TYPE_PAR_BANQUE = {
    "cca_bank": "releve_cca",
    "western_union": "releve_cca",
    "afriland": "releve_afriland",
    "bgfi": "releve_bgfi",
}


def _releves_fictifs(valeurs: dict[str, int], origine: str) -> list[dict[str, Any]]:
    """Transforme les soldes de la veille choisis par l'utilisateur en relevés « fictifs »,
    au même format que ceux lus dans les PDF, marqués comme provenant de la veille."""
    injectes: list[dict[str, Any]] = []
    for cle, valeur in valeurs.items():
        if cle not in RELEVES_ATTENDUS or valeur is None:
            continue
        libelle, banque, agence = RELEVES_ATTENDUS[cle]
        type_detecte = _TYPE_PAR_BANQUE[banque]
        identifiant = cle.split(":", 1)[1]
        injectes.append({
            "nom": f"{libelle} ({'valeur saisie' if origine == 'saisi' else 'valeur de la veille'})",
            "origine": origine,
            "type_detecte": type_detecte,
            "ligne_banque_cible": banque,
            "agence_detectee": agence,
            "cle_rib": identifiant if type_detecte != "releve_bgfi" else None,
            "numero_compte_pdf": identifiant if type_detecte == "releve_bgfi" else None,
            "solde_releve": int(valeur),
            "niveau": "avertissement",
            "messages": [
                "Valeur saisie pour un relevé absent aujourd'hui."
                if origine == "saisi"
                else "Valeur de la veille conservée (relevé absent aujourd'hui)."
            ],
        })
    return injectes


def generer_classeur(
    fichiers: list[str],
    dossier_reference: str,
    dossier_sortie: str,
    jour: Optional[date] = None,
    valeurs_manuelles: Optional[dict[str, Any]] = None,
    gestionnaires: Optional[dict[str, str]] = None,
    dossier_carnet: Optional[str] = None,
    releves_saisis: Optional[dict[str, int]] = None,
    table_comptes: Optional[dict[str, list[str]]] = None,
) -> dict[str, Any]:
    # La trésorerie traitée un matin donné concerne la journée précédente (confirmé par
    # l'utilisateur le 01/10/2026) : par défaut, le classeur porte donc la date d'hier,
    # pas celle du jour d'exécution. `jour` reste un paramètre explicite pour les tests
    # et pour un éventuel réglage manuel depuis l'interface.
    jour = jour or (date.today() - timedelta(days=1))

    classement = classer_fichiers(
        fichiers, dossier_reference, gestionnaires=gestionnaires, dossier_carnet=dossier_carnet, jour=jour,
        table_comptes=table_comptes,
    )
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
    classeur_valeurs = load_workbook(chemin_sortie, data_only=True)  # valeurs calculées, pour les J-1
    for nom_feuille in FEUILLES_A_EXCLURE:
        if nom_feuille in classeur.sheetnames:
            del classeur[nom_feuille]

    feuille = next((classeur[n] for n in NOM_FEUILLE_SYNTHESE if n in classeur.sheetnames), None)
    feuille_valeurs = classeur_valeurs[feuille.title] if feuille is not None else None
    avertissements_modele = (
        _verifier_modele_recalcule(feuille, feuille_valeurs, _LIGNES_J1_A_VERIFIER) if feuille is not None else []
    )
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
            total += _valeur(feuille_valeurs, f"{colonne}{r}")
        valeurs_precedentes[colonne] = total

        depots_precedents[colonne] = _valeur(feuille_valeurs, f"{colonne}{LIGNE_DEPOTS}")
        engagements_precedents[colonne] = _valeur(feuille_valeurs, f"{colonne}{LIGNE_ENGAGEMENTS}")

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

    # Relevés manquants pour lesquels l'utilisateur a demandé la valeur de la veille (carnet) :
    # injectés comme des relevés ordinaires, pour que les écritures ci-dessus les traitent
    # de la même façon (aucune règle bancaire dupliquée). Jamais enregistrés au carnet du jour.
    # Règle du 05/10/2026 : un relevé absent garde la valeur de la veille ; la génération demande
    # de la saisir (fenêtre) ; « passer » = la valeur de la veille est conservée.
    saisis = {cle: int(v) for cle, v in (releves_saisis or {}).items() if v is not None}
    injectes = _releves_fictifs(saisis, "saisi")
    absents_avec_veille = {
        m["cle"]: m["veille"]
        for m in classement["releves_manquants"]
        if m["cle"] not in saisis and m["veille"] is not None
    }
    injectes += _releves_fictifs(absents_avec_veille, "veille")
    classement_banques = {**classement, "fichiers": classement["fichiers"] + injectes}

    agences_banques_mises_a_jour, avertissements_banques, fichiers_ignores_banques = _ecrire_banques(
        feuille, classement_banques, valeurs_manuelles or {}, feuille_valeurs=feuille_valeurs
    )
    agences_caisses_mises_a_jour, avertissements_caisses = _ecrire_caisses(feuille, feuille_valeurs, classement)
    avertissements_banques = list(avertissements_banques) + avertissements_caisses
    fichiers_ignores.extend(fichiers_ignores_banques)

    agences_non_mises_a_jour = [
        cle for cle in AGENCE_COLONNE if cle not in agences_comptes_mises_a_jour
    ]

    classeur.save(chemin_sortie)

    # Carnet : on consigne les soldes réellement lus aujourd'hui (jamais ceux repris de la veille).
    if dossier_carnet:
        soldes_a_consigner = _soldes_du_jour(
            {"fichiers": classement["fichiers"] + [i for i in injectes if i["origine"] == "saisi"]}
        )
        for champ, cle_carnet in _NOMS_CARNET_MANUELS.items():
            if (valeurs_manuelles or {}).get(champ) is not None:
                soldes_a_consigner[cle_carnet] = int(valeurs_manuelles[champ])
        carnet.enregistrer(os.path.join(dossier_carnet, carnet.NOM_FICHIER), jour, soldes_a_consigner)

    return {
        "ok": True,
        "chemin_genere": chemin_sortie,
        "date": jour.isoformat(),
        "modele_utilise": chemin_modele,
        "agences_balance_mises_a_jour": [AGENCE_LIBELLES[c] for c in agences_balance_mises_a_jour],
        "agences_banques_mises_a_jour": [AGENCE_LIBELLES[c] for c in agences_banques_mises_a_jour],
        "avertissements_banques": avertissements_banques,
        "avertissements_modele": avertissements_modele,
        "agences_caisses_mises_a_jour": [AGENCE_LIBELLES[c] for c in agences_caisses_mises_a_jour],
        "releves_repris_de_la_veille": [i["nom"] for i in injectes if i["origine"] == "veille"],
        "releves_saisis": [i["nom"] for i in injectes if i["origine"] == "saisi"],
        "agences_mises_a_jour": [AGENCE_LIBELLES[c] for c in agences_comptes_mises_a_jour],
        "agences_non_mises_a_jour": [AGENCE_LIBELLES[c] for c in agences_non_mises_a_jour],
        "fichiers_ignores": fichiers_ignores,
        "classement": classement,
    }
