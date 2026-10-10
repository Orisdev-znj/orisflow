"""Production du fichier de téléversement CloudBank (portage du skill, commande `ecrire`).

Jamais d'écrasement : un fichier déjà présent reçoit un suffixe « (2) », « (3) »…
Tous les chemins passent par `chemin_lecture` (chemins Windows > 260 caractères : bug réel
du skill autonome, à ne pas réintroduire).
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any, Optional

import openpyxl
from openpyxl.styles import Font

from .chemins import chemin_lecture
from .cloudbank_referentiels import ErreurCloudBank, Referentiels
from .cloudbank_resolution_agence import resoudre_compte_agence

COMPTE_CHARGES_DIVERSES = "6525600000001"  # toujours consolidé en une seule ligne dans le détail


def formater_compte(valeur) -> str:
    code = str(valeur).strip()
    if not re.fullmatch(r"\d{13}", code):
        raise ValueError(f"numéro de compte non conforme (13 chiffres attendus) : {valeur!r}")
    return code


def construire_nom_sortie(ref: Referentiels, modele: dict, agence=None, mois=None, annee=None) -> str:
    """<nom du modèle> - <AGENCE> - <Mois Année>.xlsx ; agence et période ajoutées seulement si connues."""
    base = Path(modele["nom_sortie"])
    morceaux = [base.stem]
    if agence is not None:
        nom_agence = ref.agences.get(str(agence))
        if nom_agence:
            morceaux.append(nom_agence)
    if mois and annee:
        morceaux.append(f"{mois} {annee}")
    return " - ".join(morceaux) + base.suffix


def chemin_sans_ecrasement(dossier: str, nom: str) -> str:
    chemin = os.path.join(dossier, nom)
    if not os.path.exists(chemin_lecture(chemin)):
        return chemin
    base, suffixe = os.path.splitext(nom)
    n = 2
    while os.path.exists(chemin_lecture(os.path.join(dossier, f"{base} ({n}){suffixe}"))):
        n += 1
    return os.path.join(dossier, f"{base} ({n}){suffixe}")


def intitule_cloudbank(ref: Referentiels, compte: str, defaut: str = "") -> str:
    return ref.cloudbank.get(compte, {}).get("intitule", defaut)


def consolider_charges_diverses(lignes_charges: list) -> list:
    """Fusionne toutes les lignes « Charges diverses » en une seule (décision du 08/10/2026) :
    contrairement aux autres comptes, jamais plusieurs lignes dans le détail."""
    diverses = [l for l in lignes_charges if l["compte"] == COMPTE_CHARGES_DIVERSES]
    if len(diverses) <= 1:
        return lignes_charges
    autres = [l for l in lignes_charges if l["compte"] != COMPTE_CHARGES_DIVERSES]
    fusionnee = dict(diverses[0])
    fusionnee["debit"] = sum(l["debit"] for l in diverses)
    fusionnee["libelle"] = "Charges diverses : " + ", ".join(l["libelle"] for l in diverses if l["libelle"])
    return autres + [fusionnee]


def composer_petite_caisse(ref: Referentiels, modele: dict, charges: list, agence, mois, annee,
                           retour=0, compte_468: Optional[str] = None) -> dict:
    """Deux feuilles : « détail » (une ligne par dépense, retour de caisse éventuel, contrepartie
    unique sur le 468) et « synthèse » (une ligne par compte de charge, mêmes retour et contrepartie)."""
    if not mois or not annee:
        raise ErreurCloudBank("Petite caisse : le mois et l'année sont nécessaires (ils servent aux libellés).")
    contrepartie = modele["contrepartie"]

    lignes_charges, total = [], 0
    for i, charge in enumerate(charges, start=1):
        if not charge.get("compte"):
            raise ErreurCloudBank(f"La ligne {i} n'a pas de compte : tous les comptes doivent être confirmés avant de générer.")
        if charge.get("montant") is None:
            raise ErreurCloudBank(f"La ligne {i} n'a pas de montant.")
        total += charge["montant"]
        lignes_charges.append({
            "compte": charge["compte"], "intitule": charge.get("intitule", ""),
            "libelle": charge.get("libelle", ""), "debit": charge["montant"], "credit": None,
            "provision": modele["provision"]["debit"], "agence": charge.get("agence", agence),
        })
    lignes_charges = consolider_charges_diverses(lignes_charges)

    lignes_retour = []
    if retour:
        retour = int(retour) if float(retour).is_integer() else retour
        r = modele["retour_caisse"]
        libelle = r["libelle"].format(mois=mois, annee=annee)
        c468 = compte_468 or ref.agences_468.get(str(agence)) or r["compte_credit"]
        lignes_retour = [
            {"compte": r["compte_debit"], "intitule": intitule_cloudbank(ref, r["compte_debit"], r["intitule_debit"]),
             "libelle": libelle, "debit": retour, "credit": None, "agence": agence,
             "provision": modele["provision"]["debit"]},
            {"compte": c468, "intitule": intitule_cloudbank(ref, c468), "libelle": libelle,
             "debit": None, "credit": retour, "agence": agence, "provision": modele["provision"]["credit"]},
        ]

    ligne_contrepartie = {
        "compte": contrepartie["compte"],
        "intitule": intitule_cloudbank(ref, contrepartie["compte"], contrepartie["intitule"]),
        "libelle": contrepartie["libelle"].format(mois=mois, annee=annee),
        "debit": None, "credit": total, "agence": agence, "provision": modele["provision"]["credit"],
    }

    par_compte: dict[str, int] = {}
    for ligne in lignes_charges:
        par_compte[ligne["compte"]] = par_compte.get(ligne["compte"], 0) + ligne["debit"]
    synthese = []
    for compte, montant in par_compte.items():
        intitule = intitule_cloudbank(ref, compte)
        synthese.append({"compte": compte, "intitule": intitule, "libelle": ref.natures.get(compte, intitule),
                         "debit": montant, "credit": None, "provision": modele["provision"]["debit"],
                         "agence": agence})
    return {"detail": lignes_charges + lignes_retour + [ligne_contrepartie],
            "synthese": synthese + lignes_retour + [ligne_contrepartie]}


def valider_lignes(ref: Referentiels, modele: dict, lignes_entree: list, avertissements: list) -> list:
    """Contrôle chaque ligne (compte, débit OU crédit, montant, PROVISION) et la prépare à l'écriture."""
    lignes, erreurs = [], []
    for i, ligne in enumerate(lignes_entree, start=1):
        try:
            compte_famille = formater_compte(ligne["compte"])
        except ValueError as e:
            erreurs.append(f"ligne {i} : {e}")
            continue
        agence = ligne.get("agence", modele["agence_defaut"])
        compte, avert_agence = resoudre_compte_agence(ref, compte_famille, agence)
        if avert_agence:
            avertissements.append(f"ligne {i} : {avert_agence}")
        if compte not in ref.cloudbank:
            avertissements.append(f"ligne {i} ({compte}) : compte absent du plan CloudBank connu, à vérifier avant téléversement")
        debit = ligne.get("debit") or None
        credit = ligne.get("credit") or None
        if (debit is None) == (credit is None):
            erreurs.append(f"ligne {i} ({compte}) : renseigner un débit OU un crédit")
            continue
        montant = debit if debit is not None else credit
        if montant <= 0:
            erreurs.append(f"ligne {i} ({compte}) : montant non positif")
            continue
        sens = "debit" if debit is not None else "credit"
        provision = ligne.get("provision")
        if provision is None:
            provision = modele["provision"][sens]
            avertissements.append(f"ligne {i} ({compte}) : PROVISION vide, valeur par défaut {provision} appliquée")
        lignes.append({"compte": compte, "intitule": ligne.get("intitule") or "", "libelle": ligne.get("libelle", ""),
                       "debit": debit, "credit": credit, "provision": provision, "agence": agence})
    if erreurs:
        raise ErreurCloudBank("Le fichier n'a pas été produit, à corriger :\n- " + "\n- ".join(erreurs))
    return lignes


def ecrire_feuille(feuille, modele: dict, lignes: list) -> None:
    for c, entete in enumerate(modele["entetes"], start=1):
        feuille.cell(1, c, entete).font = Font(bold=True)
    for lettre, largeur in modele.get("largeurs", {}).items():
        feuille.column_dimensions[lettre].width = largeur
    for r, l in enumerate(lignes, start=2):
        cellule = feuille.cell(r, 1, l["compte"])
        cellule.number_format = "@"
        feuille.cell(r, 2, l["intitule"])
        feuille.cell(r, 3, l["libelle"])
        if l["debit"] is not None:
            feuille.cell(r, 4, l["debit"])
        if l["credit"] is not None:
            feuille.cell(r, 5, l["credit"])
        feuille.cell(r, 6, l["provision"])
        feuille.cell(r, 7, l["agence"])


def totaux(lignes: list) -> tuple:
    return sum(l["debit"] or 0 for l in lignes), sum(l["credit"] or 0 for l in lignes)


def enregistrer_classeur(classeur, dossier_sortie: str, nom: str) -> str:
    os.makedirs(chemin_lecture(dossier_sortie), exist_ok=True)
    chemin = chemin_sans_ecrasement(dossier_sortie, nom)
    classeur.save(chemin_lecture(chemin))
    return chemin


def ecrire_fichier(ref: Referentiels, modele_nom: str, lignes: list, dossier_sortie: str, agence=10000,
                   mois=None, annee=None, retour=0, compte_468=None, nom: Optional[str] = None) -> dict[str, Any]:
    """Produit le fichier de téléversement. `lignes` : petite caisse {compte, intitule, libelle,
    montant} ; salaires/extourne {compte, intitule, libelle, debit|credit, agence}."""
    if modele_nom not in ref.modeles or modele_nom not in ("petite_caisse", "salaires", "extourne"):
        raise ErreurCloudBank(f"Modèle inconnu : {modele_nom}")
    modele = ref.modeles[modele_nom]
    agence = int(agence) if agence is not None else modele["agence_defaut"]

    avertissements: list[str] = []
    if modele_nom == "petite_caisse":
        composition = composer_petite_caisse(ref, modele, lignes, agence, mois, annee, retour, compte_468)
        feuilles = [(modele["feuille"], valider_lignes(ref, modele, composition["detail"], avertissements)),
                    (modele["feuille_synthese"], valider_lignes(ref, modele, composition["synthese"], avertissements))]
    else:
        feuilles = [(modele["feuille"], valider_lignes(ref, modele, lignes, avertissements))]

    rapports = []
    for nom_feuille, lignes_feuille in feuilles:
        debit, credit = totaux(lignes_feuille)
        if debit != credit:
            avertissements.append(f"feuille « {nom_feuille} » : débit et crédit différents (écart {debit - credit}) : ajustement à vérifier")
        for l in lignes_feuille:
            if not l["intitule"]:
                avertissements.append(f"compte {l['compte']} sans intitulé")
        rapports.append({"feuille": nom_feuille, "lignes": len(lignes_feuille),
                         "total_debit": debit, "total_credit": credit, "ecart": debit - credit})
    if len(feuilles) == 2 and totaux(feuilles[0][1])[0] != totaux(feuilles[1][1])[0]:
        avertissements.append("les deux feuilles n'ont pas le même total de débit")

    classeur = openpyxl.Workbook()
    for index, (nom_feuille, lignes_feuille) in enumerate(feuilles):
        feuille = classeur.active if index == 0 else classeur.create_sheet()
        feuille.title = nom_feuille
        ecrire_feuille(feuille, modele, lignes_feuille)

    chemin = enregistrer_classeur(classeur, dossier_sortie, nom or construire_nom_sortie(ref, modele, agence, mois, annee))
    return {"fichier": chemin, "modele": modele["nom"], "feuilles": rapports, "avertissements": avertissements}
