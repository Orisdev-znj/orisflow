"""Lecture des balances CloudBank classe 3 et classe 5 (PDF), sprint 5.

Règle confirmée par l'utilisateur le 29/09/2026 (voir CLAUDE.md §19-20), vérifiée
chiffre par chiffre sur les 12 agences réelles :
- Encours dépôts    = « Total Classe : 3 » → colonne Crédit Solde fin
- Encours engagements = « Total Classe : 3 » → colonne Débit Solde fin
- Caisse            = « Total : 57 »        → colonne Débit Solde fin

Le texte d'un PDF CloudBank ne suit PAS l'ordre visuel des colonnes : on relit les
mots avec leurs coordonnées, on les regroupe en lignes puis en nombres, et on les
rattache à la bonne colonne par leur position horizontale. Les positions des
colonnes sont détectées dans l'en-tête de CHAQUE fichier (pas figées en dur) :
l'utilisateur a déjà constaté un décalage d'une ligne entre deux classeurs
différents (voir CLAUDE.md §20), donc aucune position n'est supposée stable
sans être vérifiée sur le document lui-même.
"""

from __future__ import annotations

import re
from typing import NamedTuple, Optional

try:
    import pymupdf
except ImportError:  # pragma: no cover
    pymupdf = None

NOMS_COLONNES = [
    "Debit SoldeDebut", "Credit SoldeDebut",
    "Debit MVT", "Credit MVT",
    "Debit SoldeFin", "Credit SoldeFin",
]
ECART_NOUVEAU_NOMBRE = 20  # points : au-delà, deux jetons numériques appartiennent à des nombres différents


class LigneBalance(NamedTuple):
    libelle: str
    valeurs: dict  # nom de colonne -> valeur (les colonnes absentes sur la ligne ne sont pas présentes)


def _regrouper_mots_par_ligne(page) -> dict:
    lignes: dict[float, list[tuple[float, str]]] = {}
    for x0, y0, x1, y1, mot, *_ in page.get_text("words"):
        lignes.setdefault(round(y0, 1), []).append((x0, mot))
    return {y: sorted(v) for y, v in sorted(lignes.items())}


def _detecter_ancres_colonnes(lignes: dict) -> Optional[list[float]]:
    """Cherche la ligne d'en-tête (« Compte Intitulé Debit Crédit Debit Crédit Debit Crédit »)
    et retourne les positions x des 6 colonnes Debit/Crédit, telles qu'imprimées sur CE document."""
    for y, mots in lignes.items():
        textes = [m for _, m in mots]
        if textes.count("Debit") + textes.count("Crédit") >= 6 and "Compte" in textes:
            positions = [x for x, m in mots if m in ("Debit", "Crédit")]
            if len(positions) >= 6:
                return positions[:6]
    return None


def _extraire_valeurs_ligne(mots_ligne: list[tuple[float, str]], ancres: list[float], decalage: float) -> dict:
    groupes: list[list[tuple[float, str]]] = []
    courant: list[tuple[float, str]] = []
    dernier_x = None
    for x, m in mots_ligne:
        if not any(c.isdigit() for c in m):
            continue
        if dernier_x is not None and x - dernier_x > ECART_NOUVEAU_NOMBRE:
            groupes.append(courant)
            courant = []
        courant.append((x, m))
        dernier_x = x
    if courant:
        groupes.append(courant)

    valeurs = {}
    for groupe in groupes:
        x0 = groupe[0][0]
        valeur = int("".join(m for _, m in groupe))
        idx = min(range(len(ancres)), key=lambda i: abs((x0 - decalage) - ancres[i]))
        valeurs[NOMS_COLONNES[idx]] = valeur
    return valeurs


def _trouver_ligne(chemin_pdf: str, motif_debut: str) -> Optional[dict]:
    """Retourne les valeurs des 6 colonnes pour la première ligne dont le texte
    commence par `motif_debut` (ex. "Total Classe : 3", "Total : 57")."""
    if pymupdf is None:
        raise RuntimeError("La lecture de PDF (PyMuPDF) n'est pas installée.")
    try:
        document = pymupdf.open(chemin_pdf)
    except Exception:
        # Fichier corrompu, ou pas un PDF malgré son extension : jamais une exception qui
        # remonterait jusqu'à l'appelant et interromprait le classement du lot (06/10/2026).
        return None
    try:
        for page in document:
            lignes = _regrouper_mots_par_ligne(page)
            ancres = _detecter_ancres_colonnes(lignes)
            if ancres is None:
                continue
            # Décalage entre l'ancre d'en-tête et la position réelle des chiffres,
            # mesuré sur ce document (constaté ~21pt le 29/09/2026, jamais supposé fixe).
            decalage = 21
            for y, mots in lignes.items():
                texte = " ".join(m for _, m in mots)
                if texte.startswith(motif_debut):
                    return _extraire_valeurs_ligne(mots, ancres, decalage)
        return None
    except Exception:
        return None
    finally:
        document.close()


def detecter_type_balance(chemin_pdf: str) -> Optional[str]:
    """Reconnaît un PDF de balance CloudBank classe 3 ou classe 5, par son contenu
    (« Balance generale consolidée » + « Chapitre de : 3 » ou « ... : 5 »)."""
    if pymupdf is None:
        raise RuntimeError("La lecture de PDF (PyMuPDF) n'est pas installée.")
    try:
        document = pymupdf.open(chemin_pdf)
        try:
            if document.page_count == 0:
                return None
            texte = document[0].get_text().upper()
        finally:
            document.close()
    except Exception:
        return None  # fichier corrompu, ou pas un PDF malgré son extension (06/10/2026)
    if "BALANCE" not in texte:
        return None
    if "CHAPITRE DE : 3" in texte:
        return "balance_classe3"
    if "CHAPITRE DE : 5" in texte:
        return "balance_classe5"
    return None


def lire_agence(chemin_pdf: str) -> Optional[str]:
    """Lit le nom de l'agence dans le contenu du PDF (ligne « Groupe: ... »),
    jamais dans le nom du fichier (constaté le 29/09/2026 : le nom de fichier
    ne porte aucune information sur l'agence)."""
    if pymupdf is None:
        raise RuntimeError("La lecture de PDF (PyMuPDF) n'est pas installée.")
    try:
        document = pymupdf.open(chemin_pdf)
        try:
            texte = document[0].get_text()
        finally:
            document.close()
    except Exception:
        return None  # fichier corrompu, ou pas un PDF malgré son extension (06/10/2026)
    correspondance = re.search(r"Groupe:\s*(\S+(?:\s+\S+){0,3}?)\s{2,}", texte)
    return correspondance.group(1).strip() if correspondance else None


def lire_balance_classe3(chemin_pdf: str) -> dict:
    """Retourne {"agence": str|None, "depots": int|None, "engagements": int|None}."""
    valeurs = _trouver_ligne(chemin_pdf, "Total Classe : 3")
    return {
        "agence": lire_agence(chemin_pdf),
        "depots": valeurs.get("Credit SoldeFin") if valeurs else None,
        "engagements": valeurs.get("Debit SoldeFin") if valeurs else None,
    }


def lire_balance_classe5(chemin_pdf: str) -> dict:
    """Retourne {"agence": str|None, "caisse": int|None}."""
    valeurs = _trouver_ligne(chemin_pdf, "Total : 57")
    return {
        "agence": lire_agence(chemin_pdf),
        "caisse": valeurs.get("Debit SoldeFin") if valeurs else None,
    }
