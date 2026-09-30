/** Les 12 agences du réseau qui doivent fournir un fichier de comptes et deux balances
 * (classe 3 et classe 5) chaque matin. Le Siège est volontairement exclu : il n'a pas de
 * caisse et n'a jamais fourni ce type de fichier (voir Sprint0-Synthese-a-valider.md §1).
 *
 * Reprend à l'identique les clés d'`AGENCE_LIBELLES` côté moteur
 * (engine/orisflow_engine/regles_agences.py), Siège en moins.
 */
export const AGENCES_RESEAU: { cle: string; libelle: string }[] = [
  { cle: "akwa", libelle: "Akwa" },
  { cle: "mokolo", libelle: "Mokolo" },
  { cle: "etoudi", libelle: "Étoudi" },
  { cle: "bafoussam", libelle: "Bafoussam" },
  { cle: "pk14", libelle: "PK14" },
  { cle: "balessing", libelle: "Balessing" },
  { cle: "marchecentral", libelle: "Marché Central" },
  { cle: "bepanda", libelle: "Bépanda" },
  { cle: "kousseri", libelle: "Kousseri" },
  { cle: "ndogpassi", libelle: "Ndogpassi" },
  { cle: "nkoabang", libelle: "Nkoabang" },
  { cle: "ekounou", libelle: "Ekounou" },
];
