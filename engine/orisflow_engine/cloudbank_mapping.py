"""Rattachement d'un libellé à un compte (portage du skill « Téléverser sur CloudBank »).

Entièrement déterministe, sans IA ni réseau. Mais PAS fiable à 100 % seul : les statuts
`a_confirmer` et `non_trouve` supposent toujours une relecture humaine, jamais une validation
silencieuse (deux faux positifs réels : « provision » dans « approvisionnement », « adaptateur »
classé en matériel informatique).
"""

from __future__ import annotations

import difflib

from .cloudbank_referentiels import Referentiels, normaliser

SEUIL_LIBELLE_PROCHE = 0.9
SEUIL_MOT_PCEMF = 4  # longueur minimale d'un mot pour chercher dans le PCEMF
# Mots trop généraux : ils ramènent des comptes sans rapport (ex. « achat » -> crédit-bail).
MOTS_VIDES = {
    "achat", "achats", "avec", "dans", "pour", "sans", "sont", "entre", "vers", "depuis",
    "autre", "autres", "hors", "reseau", "frais", "mois", "septembre", "octobre", "aout",
}


def comptes_cloudbank_pour(ref: Referentiels, code_pcemf: str, limite: int = 3) -> list[dict]:
    """Comptes à 13 chiffres commençant par le code PCEMF (ex. 65220 -> 6522000000001)."""
    trouves = [c for code, c in sorted(ref.cloudbank.items()) if code.startswith(code_pcemf)]
    return trouves[:limite]


def chercher_pcemf(ref: Referentiels, texte: str, limite: int = 5) -> list[dict]:
    mots = {m for m in normaliser(texte).split() if len(m) >= SEUIL_MOT_PCEMF and m not in MOTS_VIDES}
    if not mots:
        return []
    scores = []
    for compte in ref.pcemf:
        libelle = normaliser(compte["libelle"])
        commun = sum(1 for m in mots if m in libelle)
        if commun:
            scores.append((commun, -compte["niveau"], compte))
    scores.sort(key=lambda s: (s[0], s[1]), reverse=True)
    return [
        {
            "code_pcemf": compte["code"],
            "libelle_pcemf": compte["libelle"],
            "comptes_cloudbank": comptes_cloudbank_pour(ref, compte["code"]),
        }
        for _, _, compte in scores[:limite]
    ]


def rechercher(ref: Referentiels, texte: str) -> dict:
    """Recherche par mots, dans le PCEMF et dans les comptes CloudBank (écran « Rechercher un compte »)."""
    mots = normaliser(texte).split()
    return {
        "pcemf": chercher_pcemf(ref, texte, limite=8),
        "cloudbank": [c for c in ref.cloudbank.values()
                      if mots and all(m in normaliser(c["intitule"]) for m in mots)][:10],
    }


def evoque_une_fonction(ref: Referentiels, libelle: str) -> bool:
    """Le libellé désigne-t-il une fonction/un poste plutôt qu'une nature de dépense ?"""
    norme = normaliser(libelle)
    return any(f in norme for f in ref.fonctions)


def detecter_type_document(ref: Referentiels, lignes: list, resume: dict) -> dict | None:
    """Repère un relevé organisé par agent (fonction/poste) plutôt que par nature de charge :
    demander un compte par ligne ne mène alors nulle part, il faut une répartition par nature,
    décidée avec l'utilisateur."""
    if not lignes:
        return None
    nb_fonctions = sum(1 for ligne in lignes if evoque_une_fonction(ref, ligne["libelle"]))
    proportion = nb_fonctions / len(lignes)
    trouve = resume.get("valide", 0) + resume.get("a_confirmer", 0)
    if proportion >= 0.6 and trouve <= max(1, len(lignes) // 10):
        return {
            "type_probable": "relevé organisé par agent (fonction/poste), pas par nature de dépense",
            "proportion_lignes_avec_fonction": round(proportion, 2),
        }
    return None


def mapper_ligne(ref: Referentiels, libelle: str) -> dict:
    norme = normaliser(libelle)

    # 1. Libellé identique à une écriture validée.
    if norme in ref.mappings:
        m = ref.mappings[norme]
        return {"statut": "valide", "compte": m["compte"], "intitule": m["intitule"],
                "source": "écriture validée (modèle de référence)"}

    # 2. Libellé très proche d'une écriture validée : à confirmer.
    proche = difflib.get_close_matches(norme, list(ref.mappings), n=1, cutoff=SEUIL_LIBELLE_PROCHE)
    if proche:
        m = ref.mappings[proche[0]]
        return {"statut": "a_confirmer", "compte": m["compte"], "intitule": m["intitule"],
                "source": f"libellé proche d'une écriture validée : « {m['libelle']} »"}

    # 3. Règle par mots-clés : à confirmer.
    for regle in ref.regles:
        if any(m in norme for m in regle["_mots"]) and not any(e in norme for e in regle["_exclus"]):
            if not regle["compte_present"]:
                continue
            code = regle["compte"]
            return {"statut": "a_confirmer", "compte": code, "intitule": ref.cloudbank[code]["intitule"],
                    "source": f"règle par mots-clés : {regle['nature']}"}

    # 4. Rien de sûr : suggestions du PCEMF, l'utilisateur tranche.
    return {"statut": "non_trouve", "compte": None, "intitule": None, "source": None,
            "suggestions": chercher_pcemf(ref, libelle)}
