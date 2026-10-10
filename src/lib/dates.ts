/** Dates du classeur : toujours au format ISO « AAAA-MM-JJ » dans l'état et vers le moteur,
 * calculées avec l'heure LOCALE du poste (jamais UTC : à minuit, UTC donnerait un jour de décalage). */

function iso(date: Date): string {
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  const jour = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mois}-${jour}`;
}

/** Jour couvert par défaut : la veille (la trésorerie traitée un matin concerne la journée d'avant). */
export function hierISO(maintenant: Date = new Date()): string {
  const date = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() - 1);
  return iso(date);
}

export function aujourdhuiISO(maintenant: Date = new Date()): string {
  return iso(maintenant);
}

function depuisISO(valeur: string): Date | null {
  const correspondance = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur);
  if (!correspondance) return null;
  const date = new Date(Number(correspondance[1]), Number(correspondance[2]) - 1, Number(correspondance[3]));
  return Number.isNaN(date.getTime()) || iso(date) !== valeur ? null : date;
}

export function dateValide(valeur: string): boolean {
  return depuisISO(valeur) !== null;
}

/** « samedi 10 octobre 2026 » : le jour de la semaine évite de choisir sans le voir un week-end. */
export function formaterDateLongue(valeur: string): string {
  const date = depuisISO(valeur);
  return date
    ? date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : valeur;
}

/** « 08/10/2026 », pour les messages. */
export function formaterDateCourte(valeur: string): string {
  const date = depuisISO(valeur);
  return date ? date.toLocaleDateString("fr-FR") : valeur;
}

export function estWeekEnd(valeur: string): boolean {
  const date = depuisISO(valeur);
  return date !== null && (date.getDay() === 0 || date.getDay() === 6);
}
