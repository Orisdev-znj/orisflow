/** Cas d'usage de « Téléverser sur CloudBank » et leurs prompts (conception du 10/10/2026, §4).
 *
 * Aucune règle comptable ici : ce sont seulement des textes à copier dans Claude, qui lit le
 * document et propose le mapping. Orisflow n'envoie jamais rien à Claude (aucun appel externe).
 */

export type IdCas = "petite_caisse_consolidee" | "petite_caisse_bordereaux" | "salaires" | "extourne" | "extraire";

export interface ChampPrompt {
  cle: string;
  libelle: string;
  placeholder: string;
}

export interface CasUsage {
  id: IdCas;
  titre: string;
  description: string;
  symbole: string;
  // Modèle de fichier d'échange attendu après le passage par Claude.
  sortie: "mapping" | "final";
  // Modèle de téléversement produit par Orisflow pour les cas « mapping ».
  modele?: "petite_caisse" | "salaires";
  champs: ChampPrompt[];
  construire: (valeurs: Record<string, string>) => string;
}

const COLONNES =
  "LIBELLE | MONTANT | COMPTE PROPOSE | INTITULE | STATUT | SOURCE | COMMENTAIRE";

function ouVide(valeur: string | undefined, modele: string): string {
  return valeur && valeur.trim() ? valeur.trim() : modele;
}

export const CAS_USAGE: CasUsage[] = [
  {
    id: "petite_caisse_consolidee",
    titre: "Petite caisse",
    description: "Tableau déjà consolidé, avec un total imprimé.",
    symbole: "🧾",
    sortie: "mapping",
    modele: "petite_caisse",
    champs: [],
    construire: () =>
      `Utilise le skill « Téléverser sur CloudBank » (dossier Automation\\Claude Skills\\Televerser
sur CloudBank, voir SKILL.md) pour traiter le document de petite caisse ci-joint.

C'est un tableau déjà consolidé (une ligne = une dépense, avec un total imprimé).

Déroule les étapes du skill : extraire les lignes et le total imprimé, lancer le mapping
(mapper --total-attendu), me présenter le résumé par statut et les lignes à confirmer ou non
trouvées, me poser les questions nécessaires (comptes manquants, retour de caisse). Précise
l'agence et le mois si tu les connais déjà, sinon demande-les-moi.

Une fois tout confirmé, donne-moi un fichier Excel « MAPPING A VALIDER - <AGENCE> - <Mois
Année>.xlsx » avec une ligne par dépense et ces colonnes : ${COLONNES}. Ne génère pas directement le fichier CloudBank
final — Orisflow s'en charge après import.`,
  },
  {
    id: "petite_caisse_bordereaux",
    titre: "Bordereaux non consolidés",
    description: "Fiches individuelles (une par dépense), pas un tableau.",
    symbole: "📑",
    sortie: "mapping",
    modele: "petite_caisse",
    champs: [],
    construire: () =>
      `Utilise le skill « Téléverser sur CloudBank » (voir SKILL.md, § « Bordereaux individuels non
consolidés ») pour traiter les bordereaux ci-joints.

Ce sont des fiches individuelles (une par dépense), pas un tableau. Applique les deux règles
du skill : le montant en chiffres prime sur le montant en lettres en cas de désaccord ; un
motif illisible est classé en « frais de transport », sauf si le montant dépasse 5 000 — dans
ce cas, signale-le-moi plutôt que de le classer automatiquement.

Donne-moi le nombre de bordereaux lus et le total, et attends ma confirmation du total avant
de continuer (il n'y a pas toujours de total imprimé sur ce type de document).

Même format de sortie qu'un tableau consolidé : « MAPPING A VALIDER - <AGENCE> - <Mois
Année>.xlsx », colonnes ${COLONNES}.`,
  },
  {
    id: "salaires",
    titre: "Salaires",
    description: "Lignes complètes : compte, libellé, débit ou crédit.",
    symbole: "👥",
    sortie: "mapping",
    modele: "salaires",
    champs: [],
    construire: () =>
      `Utilise le skill « Téléverser sur CloudBank » pour traiter ce document de salaires.

Le modèle salaires attend des lignes complètes (compte, intitulé, libellé, débit OU crédit) —
les règles de contrepartie ne sont pas automatiques pour ce modèle : demande-les-moi si elles
ne sont pas déjà indiquées sur le document.

Résultat au format « MAPPING A VALIDER - <AGENCE> - <Mois Année>.xlsx », mêmes colonnes que
d'habitude, avec le sens (débit/crédit) de chaque ligne précisé dans COMMENTAIRE.`,
  },
  {
    id: "extourne",
    titre: "Extourne",
    description: "Extourner des transactions d'un historique de compte.",
    symbole: "↩️",
    sortie: "final",
    champs: [
      { cle: "regles", libelle: "Montants à extourner et comptes de contrepartie", placeholder: "ex. 500 → compte X, 96 → compte Y" },
      { cle: "client", libelle: "Compte client à créditer (13 chiffres et intitulé)", placeholder: "numéro à 13 chiffres et intitulé" },
    ],
    construire: (v) =>
      `Utilise le skill « Téléverser sur CloudBank », commande extourne (voir SKILL.md, § « Extourne
de transactions multiples »), sur l'historique de compte ci-joint.

Montants à extourner et comptes de contrepartie : [${ouVide(v.regles, "ex. « 500 → compte X, 96 → compte Y »")}].
Compte client à créditer : [${ouVide(v.client, "numéro à 13 chiffres et intitulé")}].

Lance la commande extourne du skill, ne recalcule rien à la main. Ce cas produit directement
le fichier final « EXT A TELEVERSER... » (pas de fichier de mapping intermédiaire à importer
dans Orisflow) : donne-le-moi avec le rapport (transactions trouvées, extournées, cumul
crédité).`,
  },
  {
    id: "extraire",
    titre: "Extraire d'un grand livre",
    description: "Garder certains sous-comptes d'un grand livre auxiliaire.",
    symbole: "🔎",
    sortie: "final",
    champs: [
      { cle: "termes", libelle: "Termes à chercher dans les libellés de sous-compte", placeholder: "ex. TRANSPORT COMMERCIAUX, CHARGES COMMERCIAUX" },
    ],
    construire: (v) =>
      `Utilise le skill « Téléverser sur CloudBank », commande extraire (voir SKILL.md, § « Extraire
un sous-ensemble d'un grand livre auxiliaire »), sur le grand livre ci-joint.

Termes à chercher dans les libellés de sous-compte : [${ouVide(v.termes, "ex. « TRANSPORT COMMERCIAUX, CHARGES COMMERCIAUX »")}].

Donne-moi la liste des sous-comptes retenus avant de considérer le filtrage terminé, pour que
je confirme qu'aucun libellé voisin pertinent n'a été oublié. Résultat : le fichier filtré
produit par le skill, format et mise en forme d'origine conservés — généralement une étape
préparatoire avant un prompt « Extourne ».`,
  },
];

/** Le nom du fichier suit-il la convention attendue pour ce cas ? (avertissement, jamais bloquant) */
export function nomConforme(cas: CasUsage, nom: string): boolean {
  const n = nom.toUpperCase();
  return cas.sortie === "mapping" ? n.startsWith("MAPPING A VALIDER") : n.startsWith("EXT") || n.includes("EXTRAIT");
}

/** Traduit un avertissement technique du moteur en phrase simple. `null` = à ne pas afficher. */
export function traduireAvertissement(technique: string): string | null {
  if (/PROVISION vide/i.test(technique)) return null; // note technique sans conséquence
  if (/non confirmé pour l'agence/i.test(technique))
    return "Un des comptes utilisés n'est pas encore vérifié pour cette agence — à faire contrôler avant l'envoi réel dans CloudBank.";
  if (/absent du plan CloudBank/i.test(technique))
    return "Un compte de ce fichier n'est pas dans la liste des comptes connus — à vérifier avant l'envoi.";
  if (/débit et crédit différents/i.test(technique))
    return "Le total des débits et des crédits n'est pas identique — à contrôler avant l'envoi dans CloudBank.";
  if (/n'ont pas le même total/i.test(technique))
    return "Les deux feuilles du fichier n'ont pas le même total — à contrôler avant l'envoi.";
  if (/sans intitulé/i.test(technique)) return "Un compte du fichier n'a pas d'intitulé.";
  return "Un point demande une vérification : montrez ce fichier au référent comptable avant l'envoi.";
}
