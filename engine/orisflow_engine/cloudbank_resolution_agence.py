"""Compte réel d'une écriture selon l'agence (règle n°7 du skill — la plus importante).

Un compte de charge n'a pas le même numéro à 13 chiffres selon l'agence qui l'utilise
(découvert le 07/10/2026 sur Mokolo). Les comptes de `mappings_valides.json`,
`regles_motscles.json` et `modeles.json` viennent du modèle du Siège (10000) : fiables tels
quels pour cette agence. Pour toute autre agence, on cherche le compte réel confirmé ; s'il
n'est pas encore connu, on garde le compte générique MAIS on avertit au lieu de deviner.

Tout est indexé PAR AGENCE (voir `Referentiels.comptes_deja_resolus_par_agence`) : deux agences
peuvent avoir le même numéro par coïncidence (le 468 de Balessing et de Kousseri), cela ne
doit jamais dispenser une troisième agence de l'avertissement.
"""

from __future__ import annotations

from .cloudbank_referentiels import Referentiels


def resoudre_compte_agence(ref: Referentiels, compte_famille: str, agence) -> tuple[str, str | None]:
    agence_s = str(agence)
    variantes = ref.comptes_par_agence.get(compte_famille)
    if variantes and agence_s in variantes:
        return variantes[agence_s], None
    if compte_famille not in ref.comptes_geres:
        # Compte externe déjà complet (compte client, TVA, produit) : rien à résoudre, aucun bruit.
        return compte_famille, None
    if agence_s == "10000" or compte_famille in ref.comptes_deja_resolus_par_agence.get(agence_s, ()):
        return compte_famille, None
    return compte_famille, (
        f"compte {compte_famille} non confirmé pour l'agence {agence_s} (seul le Siège, 10000, "
        f"est garanti) : le code générique est utilisé, à vérifier dans CloudBank avant téléversement"
    )
