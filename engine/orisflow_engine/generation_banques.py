"""Écriture des lignes banques et unités virtuelles de la feuille « Synthèse ».

CCA-Bank est répartie par agence (`regles_banques.RIB_CCA_VERS_AGENCE`) ; Afriland, BGFI,
UBA, Ecobank et Western Union sont consolidées sous Akwa, Access Bank sous Marché Central
(confirmé par l'utilisateur les 02 et 05/10/2026). Les lignes sont repérées par leur
libellé (`structure_modele.localiser_lignes`), jamais par un numéro fixe.
"""

from __future__ import annotations

from typing import Any

from .regles_agences import AGENCE_COLONNE, AGENCE_LIBELLES
from .regles_banques import (
    BON_INCLUS_DANS_RELEVE,
    BONS_DE_CAISSE,
    LIBELLE_CHAMP_MANUEL,
    RELEVES_ATTENDUS,
    cle_releve,
)
from .structure_modele import LIGNES_ATTENDUES, LIGNES_BANQUES, valeur_numerique

_TYPE_PAR_BANQUE = {
    "cca_bank": "releve_cca",
    "western_union": "releve_cca",
    "afriland": "releve_afriland",
    "bgfi": "releve_bgfi",
}


def ecrire_montant(feuille, adresse: str, termes: list[int]) -> int:
    """Un seul terme : valeur littérale. Plusieurs : formule d'addition reconstituée (garde la
    lisibilité du classeur, demande du 02/10/2026). Retourne le total écrit."""
    if len(termes) == 1:
        feuille[adresse] = termes[0]
    else:
        feuille[adresse] = "=" + "+".join(str(t) for t in termes)
    return sum(termes)


def terme_releve(f: dict[str, Any]) -> int:
    """Solde lu, sans le bon de caisse permanent quand le relevé l'inclut déjà (règle du
    05/10/2026, `BON_INCLUS_DANS_RELEVE`) — sinon il serait compté deux fois."""
    solde = int(f["solde_releve"])
    bon = BON_INCLUS_DANS_RELEVE.get(cle_releve(f.get("type_detecte"), f.get("cle_rib"), f.get("numero_compte_pdf")) or "")
    if bon is not None and solde >= bon:
        return solde - bon
    return solde


def _ignorer(f: dict[str, Any], fichiers_ignores: list[str], doublons_ignores: list[str]) -> None:
    (doublons_ignores if f.get("est_doublon") else fichiers_ignores).append(f["nom"])


def ecrire_banques(
    feuille,
    feuille_valeurs,
    lignes: dict[str, int],
    classement: dict[str, Any],
    valeurs_manuelles: dict[str, Any],
) -> dict[str, Any]:
    """Écrit les lignes banques et UV, et avance le J-1 du total banques pour toutes les agences.

    Retourne {"agences": [...], "avertissements": [...], "fichiers_ignores": [...],
    "doublons_ignores": [...], "recapitulatif": [{"ligne", "agence", "montant"}]}."""
    avertissements: list[str] = []
    fichiers_ignores: list[str] = []
    doublons_ignores: list[str] = []
    agences_mises_a_jour: list[str] = []
    recapitulatif: list[dict[str, Any]] = []

    def noter(cle_ligne: str, agence: str, montant: int | float) -> None:
        recapitulatif.append({"ligne": LIGNES_ATTENDUES[cle_ligne][0], "agence": AGENCE_LIBELLES[agence], "montant": montant})

    # J-1 du total banques, lu dans les valeurs calculées du modèle AVANT toute écriture.
    for colonne in AGENCE_COLONNE.values():
        feuille[f"{colonne}{lignes['total_banques_j1']}"] = sum(
            valeur_numerique(feuille_valeurs, f"{colonne}{lignes[cle]}") for cle in LIGNES_BANQUES
        )

    colonne_akwa = AGENCE_COLONNE["akwa"]

    comptes_cca: dict[str, list[tuple[str, int]]] = {}
    for f in classement["fichiers"]:
        if f["type_detecte"] != "releve_cca" or f.get("ligne_banque_cible") == "western_union":
            continue
        if f.get("ligne_banque_cible") != "cca_bank" or f["niveau"] == "bloquant" or f["solde_releve"] is None or f["agence_detectee"] is None:
            _ignorer(f, fichiers_ignores, doublons_ignores)
            continue
        comptes_cca.setdefault(f["agence_detectee"], []).append((f["cle_rib"] or "", f["solde_releve"]))
    for agence, comptes in comptes_cca.items():
        termes = list(BONS_DE_CAISSE.get(("cca_bank", agence), [])) + [solde for _, solde in sorted(comptes, key=lambda c: c[0])]
        noter("cca_bank", agence, ecrire_montant(feuille, f"{AGENCE_COLONNE[agence]}{lignes['cca_bank']}", termes))
        agences_mises_a_jour.append(agence)

    soldes_afriland: list[int] = []
    for f in classement["fichiers"]:
        if f["type_detecte"] != "releve_afriland" or f.get("ligne_banque_cible") != "afriland":
            continue
        if f["niveau"] == "bloquant" or f["solde_releve"] is None:
            _ignorer(f, fichiers_ignores, doublons_ignores)
            continue
        soldes_afriland.append(terme_releve(f))
    if soldes_afriland:
        termes = list(BONS_DE_CAISSE.get(("afriland", "akwa"), [])) + soldes_afriland
        noter("afriland", "akwa", ecrire_montant(feuille, f"{colonne_akwa}{lignes['afriland']}", termes))
        if "akwa" not in agences_mises_a_jour:
            agences_mises_a_jour.append("akwa")

    # BGFI : triés par numéro de compte, pour pouvoir ré-associer chaque terme à son compte.
    comptes_bgfi: list[tuple[str, int]] = []
    for f in classement["fichiers"]:
        if f["type_detecte"] != "releve_bgfi" or f.get("ligne_banque_cible") != "bgfi":
            continue
        if f["niveau"] == "bloquant" or f["solde_releve"] is None:
            _ignorer(f, fichiers_ignores, doublons_ignores)
            continue
        comptes_bgfi.append((f.get("numero_compte_pdf") or "", f["solde_releve"]))
    if comptes_bgfi:
        termes = [solde for _, solde in sorted(comptes_bgfi, key=lambda c: c[0])]
        noter("bgfi", "akwa", ecrire_montant(feuille, f"{colonne_akwa}{lignes['bgfi']}", termes))
        if "akwa" not in agences_mises_a_jour:
            agences_mises_a_jour.append("akwa")

    # Western Union : relevé du jour, sinon valeur de secours saisie, sinon ligne inchangée.
    fichier_wu = next(
        (
            f for f in classement["fichiers"]
            if f.get("ligne_banque_cible") == "western_union" and f["niveau"] != "bloquant" and f["solde_releve"] is not None
        ),
        None,
    )
    adresse_wu = f"{colonne_akwa}{lignes['western_union']}"
    if fichier_wu:
        feuille[adresse_wu] = fichier_wu["solde_releve"]
        noter("western_union", "akwa", fichier_wu["solde_releve"])
    elif valeurs_manuelles.get("western_union_secours") is not None:
        feuille[adresse_wu] = int(valeurs_manuelles["western_union_secours"])
        noter("western_union", "akwa", int(valeurs_manuelles["western_union_secours"]))
    else:
        avertissements.append(
            f"{LIBELLE_CHAMP_MANUEL['western_union_secours']} : "
            "ligne inchangée depuis la veille (aucun relevé reçu, aucune valeur saisie)."
        )

    # UBA : bon de caisse fixe + solde en banque saisi manuellement.
    if valeurs_manuelles.get("uba_solde_banque") is not None:
        fixe = BONS_DE_CAISSE[("uba", "akwa")][0]
        solde = valeurs_manuelles["uba_solde_banque"]
        noter("uba", "akwa", ecrire_montant(feuille, f"{colonne_akwa}{lignes['uba']}", [fixe, solde]))
    else:
        avertissements.append(f"{LIBELLE_CHAMP_MANUEL['uba_solde_banque']} : ligne inchangée depuis la veille.")

    for champ, cle_ligne, agence in (
        ("ecobank", "ecobank", "akwa"),
        ("access_bank", "access_bank", "marchecentral"),
        ("uv_orange", "uv_orange", "akwa"),
        ("uv_mtn", "uv_mtn", "akwa"),
        ("uv_maviance", "uv_maviance", "akwa"),
    ):
        valeur = valeurs_manuelles.get(champ)
        if valeur is not None:
            feuille[f"{AGENCE_COLONNE[agence]}{lignes[cle_ligne]}"] = valeur
            noter(cle_ligne, agence, valeur)
        else:
            avertissements.append(f"{LIBELLE_CHAMP_MANUEL[champ]} : ligne inchangée depuis la veille.")

    return {
        "agences": agences_mises_a_jour,
        "avertissements": avertissements,
        "fichiers_ignores": fichiers_ignores,
        "doublons_ignores": doublons_ignores,
        "recapitulatif": recapitulatif,
    }


def releves_fictifs(valeurs: dict[str, int], origine: str) -> list[dict[str, Any]]:
    """Soldes saisis (ou repris de la veille) pour un relevé absent, au format d'un relevé lu."""
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


def soldes_du_jour(fichiers: list[dict[str, Any]]) -> dict[str, int]:
    """Soldes lus aujourd'hui, par clé (« cca:12 », « depots:akwa »…), pour le carnet."""
    soldes: dict[str, int] = {}
    for f in fichiers:
        cle = cle_releve(f.get("type_detecte"), f.get("cle_rib"), f.get("numero_compte_pdf"))
        if cle is None or cle in soldes or f["niveau"] == "bloquant" or f.get("solde_releve") is None:
            continue
        soldes[cle] = terme_releve(f)
    for f in fichiers:
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
