/** Lecture d'un montant saisi à la main, dans les formats courants d'un comptable :
 * « 1 234 567 », « 1 234 567,50 », « 1.234.567 », « 1234567.50 », « 2 500 000 FCFA ».
 * Un texte vide n'est pas une erreur (la valeur de la veille est alors conservée) ; un texte
 * illisible en est une, signalée à l'écran plutôt qu'ignorée en silence. */
export type LectureMontant = { valeur: number | null; erreur: string | null };

const SUFFIXES_MONNAIE = /\s*(f\s*cfa|fcfa|xaf|cfa|f)\.?\s*$/i;

export function lireMontant(texte: string | undefined): LectureMontant {
  let propre = (texte ?? "").trim();
  if (!propre) return { valeur: null, erreur: null };

  propre = propre.replace(SUFFIXES_MONNAIE, "");
  propre = propre.replace(/[\s  ']/g, ""); // espaces, insécables, apostrophes de milliers

  const negatif = propre.startsWith("-");
  if (negatif) propre = propre.slice(1);

  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(propre)) {
    // « 1.234.567 » ou « 1.234.567,50 » : points de milliers, virgule décimale.
    propre = propre.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(propre)) {
    // « 1,234,567 » ou « 1,234,567.50 » : virgules de milliers (format anglais).
    propre = propre.replace(/,/g, "");
  } else {
    propre = propre.replace(",", ".");
  }

  if (!/^\d+(\.\d+)?$/.test(propre)) {
    return {
      valeur: null,
      erreur: "Montant non reconnu : saisissez un nombre, par exemple 2 500 000 ou 2 500 000,50.",
    };
  }
  const valeur = Number(propre);
  return { valeur: negatif ? -valeur : valeur, erreur: null };
}

export function formaterMontant(valeur: number): string {
  return `${valeur.toLocaleString("fr-FR")} FCFA`;
}
