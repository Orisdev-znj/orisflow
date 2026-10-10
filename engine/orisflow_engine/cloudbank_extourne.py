"""Extourne de transactions d'un historique de compte CloudBank (portage de `commande_extourne`)."""

from __future__ import annotations

from typing import Any, Optional

import xlrd

from .chemins import chemin_lecture
from .cloudbank_ecriture import ecrire_feuille, enregistrer_classeur, construire_nom_sortie, totaux, valider_lignes
from .cloudbank_referentiels import ErreurCloudBank, Referentiels, normaliser

import openpyxl


def lire_historique_compte(chemin: str) -> list[dict]:
    """Lit un export CloudBank « Historique compte » (.xls) : transactions (libellé, débit, crédit).

    Pas d'en-tête fixe (quelques lignes d'identification avant le tableau) : la ligne d'en-tête
    est repérée par la cellule « Libelle », puis on lit jusqu'à « TOTAL » ou la fin. Lecture seule."""
    feuille = xlrd.open_workbook(chemin_lecture(chemin)).sheet_by_index(0)
    ligne_entete, colonnes = None, {}
    for r in range(feuille.nrows):
        valeurs = [normaliser(feuille.cell_value(r, c)) for c in range(feuille.ncols)]
        if "libelle" in valeurs:
            ligne_entete = r
            for c, v in enumerate(valeurs):
                if v in ("date", "libelle", "debit", "credit"):
                    colonnes[v] = c
            break
    if ligne_entete is None or not {"libelle", "debit", "credit"} <= set(colonnes):
        raise ErreurCloudBank("Ce fichier n'est pas un historique de compte CloudBank : la ligne d'en-tête "
                              "(Date / Libelle / Debit / Credit) est introuvable.")

    transactions = []
    for r in range(ligne_entete + 1, feuille.nrows):
        libelle = str(feuille.cell_value(r, colonnes["libelle"])).strip()
        if not libelle or normaliser(libelle).startswith("total"):
            break
        debit = feuille.cell_value(r, colonnes["debit"])
        credit = feuille.cell_value(r, colonnes["credit"])
        transactions.append({"libelle": libelle,
                             "debit": float(debit) if debit not in ("", None) else 0.0,
                             "credit": float(credit) if credit not in ("", None) else 0.0})
    return transactions


def extourner(ref: Referentiels, chemin_historique: str, regles: list[dict], compte_client: str,
              intitule_client: str, agence: int, dossier_sortie: str, libelle_credit: Optional[str] = None,
              nom: Optional[str] = None) -> dict[str, Any]:
    """`regles` : [{"montant": 500, "compte": "...", "intitule": "..."}]. Un débit détaillé par
    transaction extournée (jamais cumulé) ; un seul crédit (le cumul) sur le compte du client."""
    modele = ref.modeles["extourne"]
    par_montant = {float(r["montant"]): (r["compte"], r.get("intitule", "")) for r in regles}
    if not par_montant:
        raise ErreurCloudBank("Extourne : aucun montant à extourner n'a été indiqué.")

    transactions = lire_historique_compte(chemin_historique)
    correspondantes = [t for t in transactions if t["debit"] in par_montant]
    if not correspondantes:
        raise ErreurCloudBank("Extourne : aucune transaction du fichier ne correspond aux montants demandés.")

    lignes, cumul = [], 0
    for t in correspondantes:
        compte, intitule = par_montant[t["debit"]]
        # La ligne qui porte le compte de CHARGE extourné reçoit « EXT » ; la contrepartie, jamais.
        lignes.append({"compte": compte, "intitule": intitule, "libelle": f"EXT {t['libelle']}",
                       "debit": t["debit"], "agence": agence})
        cumul += t["debit"]
    lignes.append({"compte": compte_client, "intitule": intitule_client,
                   "libelle": libelle_credit or f"Cumul extourne {intitule_client} — {len(lignes)} transaction(s)",
                   "credit": cumul, "agence": agence})

    avertissements: list[str] = []
    validees = valider_lignes(ref, modele, lignes, avertissements)
    debit, credit = totaux(validees)
    if debit != credit:
        avertissements.append(f"débit et crédit différents (écart {debit - credit}) : ajustement à vérifier")

    classeur = openpyxl.Workbook()
    feuille = classeur.active
    feuille.title = modele["feuille"]
    ecrire_feuille(feuille, modele, validees)
    chemin = enregistrer_classeur(classeur, dossier_sortie, nom or construire_nom_sortie(ref, modele, agence))
    return {"fichier": chemin, "modele": modele["nom"], "transactions_trouvees": len(transactions),
            "transactions_extournees": len(correspondantes), "cumul_credite": cumul, "lignes": len(validees),
            "total_debit": debit, "total_credit": credit, "ecart": debit - credit, "avertissements": avertissements}
