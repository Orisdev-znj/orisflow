/** Agences du réseau avec leur code CloudBank (sélection d'une agence ; aucune règle comptable ici).
 * Reprend les codes du référentiel `agences.json` du moteur. */
export const AGENCES_CLOUDBANK: { code: string; libelle: string }[] = [
  { code: "10000", libelle: "Siège" },
  { code: "10001", libelle: "Akwa" },
  { code: "10002", libelle: "PK14" },
  { code: "10003", libelle: "Bépanda" },
  { code: "10004", libelle: "Ndogpassi" },
  { code: "20000", libelle: "Mokolo" },
  { code: "20001", libelle: "Étoudi" },
  { code: "20002", libelle: "Marché Central" },
  { code: "20003", libelle: "Nkoabang" },
  { code: "20004", libelle: "Ekounou" },
  { code: "30000", libelle: "Bafoussam" },
  { code: "30001", libelle: "Balessing" },
  { code: "40000", libelle: "Kousseri" },
];

export const MOIS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
