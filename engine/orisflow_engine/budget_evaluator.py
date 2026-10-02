"""Squelette du futur module « Évaluation Budgétaire » (prévisions vs réalisations).

Demandé le 02/10/2026, en anticipation du besoin — **aucun fichier budgétaire réel ni
structure de donnée n'est disponible à ce jour**. Ce fichier ne doit PAS être deviné ou
rempli par supposition (règle CLAUDE.md 3.5 : ne jamais deviner une règle comptable).

Isolation (demande explicite) : ce module est totalement autonome, **n'est pas importé par
`cli.py`** et n'est donc appelé par aucune commande du moteur pour l'instant. Il ne touche
ni ne dépend d'aucun code du sprint 5 (classification.py, generation.py, balance_pdf.py,
pdf_releves.py). Rien ici ne peut donc casser ce qui tourne déjà.

Quand les vrais fichiers budgétaires seront disponibles (prévu : semaine prochaine, selon
l'utilisateur), reprendre ce squelette aux endroits marqués TODO :
1. Déterminer le ou les formats de fichier source (Excel ? Export du système comptable ?
   Un fichier par agence, par mois ?) — ne pas supposer, lire un exemple réel d'abord.
2. Écrire les fonctions de lecture (sur le modèle de `balance_pdf.py` ou `comptes.py` selon
   le format trouvé), en lecture seule, jamais sur les fichiers sources.
3. Écrire le calcul des écarts (réalisé − prévu), avec les règles de regroupement par
   catégorie validées par l'utilisateur/la supervision (pas une simple soustraction par
   ligne sans savoir ce que chaque ligne représente).
4. Si ce module doit être exposé à l'interface, ajouter une commande dans `cli.py`
   (`COMMANDES["evaluer_budget"] = commande_evaluer_budget`, même protocole JSON que les
   autres commandes) et le canal IPC correspondant côté Electron — pas fait pour l'instant.
5. Écrire des tests (sur le modèle de `test_balance_pdf.py` ou `test_generation.py`) avant
   de considérer ce module terminé — aucun test n'existe encore ici, volontairement.
"""

from __future__ import annotations

from typing import Any, Optional


def lire_budget_previsionnel(chemin: str) -> dict[str, Any]:
    """TODO : lire le fichier de prévisions budgétaires (format encore inconnu).

    Doit rester en lecture seule, comme toutes les lectures de fichiers sources
    d'Orisflow (jamais de `.save()` sur un fichier fourni par l'utilisateur).
    """
    raise NotImplementedError(
        "Lecture du budget prévisionnel pas encore implémentée : "
        "le format du fichier source n'est pas encore connu (en attente de l'utilisateur)."
    )


def lire_realise(chemin: str) -> dict[str, Any]:
    """TODO : lire les montants réalisés (source probable : balances déjà lues par
    d'autres modules du moteur — comptes.py, balance_pdf.py — ou un nouvel export dédié,
    à confirmer avec l'utilisateur avant de coder quoi que ce soit ici)."""
    raise NotImplementedError(
        "Lecture du réalisé pas encore implémentée : source de donnée à confirmer."
    )


def calculer_ecarts(
    previsionnel: Optional[dict[str, Any]], realise: Optional[dict[str, Any]]
) -> list[dict[str, Any]]:
    """TODO : calculer l'écart (réalisé - prévu) par catégorie budgétaire.

    Ne pas deviner les catégories ni la règle de regroupement : les lignes du budget
    d'ORIS FINANCE n'ont pas encore été vues. Structure de retour proposée, à ajuster :
        [{"categorie": str, "prevu": float, "realise": float, "ecart": float}, ...]
    """
    raise NotImplementedError(
        "Calcul des écarts pas encore implémenté : catégories et règles de regroupement "
        "à valider avec l'utilisateur une fois les fichiers réels disponibles."
    )
