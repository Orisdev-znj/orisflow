export interface FichierImporte {
  chemin: string;
  nom: string;
  taille: number;
}

export type NiveauFichier = "information" | "avertissement" | "bloquant";
export type ConfianceAgence = "nom" | "code" | "aucune" | "sans_objet";

export interface FichierClasse {
  nom: string;
  chemin: string;
  extension: string;
  type_detecte: string | null;
  type_libelle: string | null;
  agence_detectee: string | null;
  agence_libelle: string | null;
  confiance_agence: ConfianceAgence;
  numero_compte_pdf: string | null;
  total_comptes: number | null;
  doublons: string[];
  mal_formes: string[];
  depots: number | null;
  engagements: number | null;
  caisse: number | null;
  niveau: NiveauFichier;
  messages: string[];
}

export interface ReferenceComparaison {
  disponible: boolean;
  chemin: string | null;
  date: string | null;
}

export interface Classement {
  ok: boolean;
  total: number;
  fichiers: FichierClasse[];
  reference: ReferenceComparaison;
}

export interface ResultatClassement extends Classement {
  type: "resultat";
  commande: "classer";
  version: string;
}

export interface ResultatGeneration {
  type: "resultat";
  commande: "generer";
  version: string;
  ok: true;
  chemin_genere: string;
  date: string;
  modele_utilise: string;
  agences_mises_a_jour: string[];
  // Dépôts/engagements (lignes 20/23), distincts des comptes : une agence peut être mise
  // à jour sur l'un sans l'être sur l'autre (ajouté le 01/10/2026, sprint 5).
  agences_balance_mises_a_jour: string[];
  agences_non_mises_a_jour: string[];
  fichiers_ignores: string[];
  classement: Classement;
}

export interface ResultatPing {
  type: "resultat";
  commande: "ping";
  ok: boolean;
  version: string;
  python?: string;
  systeme?: string;
}

export interface EvenementMoteur {
  type: "progression";
  courant: number;
  total: number;
  fichier: string;
}

export interface ParametresApplication {
  dossierTravail: string;
  dossierReference: string;
  dossierBordereau: string;
  // true tant que l'utilisateur n'a pas choisi lui-même un dossier (Suivi Courrier utilise
  // alors un repli local, sous le dossier de travail, pour rester testable dès maintenant).
  dossierBordereauParDefaut: boolean;
  identite: string;
  version: string;
  empaquete: boolean;
}

export type EtatGeneration =
  | { etat: "attente" }
  | { etat: "encours" }
  | { etat: "succes"; resultat: ResultatGeneration }
  | { etat: "erreur"; message: string };

// --- Suivi Courrier (bordereau de transmission), démarré le 30/09/2026, nommé le 30/09/2026 --
// Voir Orisflow/Contexte/Bordereau-Transmission-Documents.md pour le contexte complet.

export type StatutTransmission = "Transmis" | "Reçu" | "Pris en charge" | "Traité" | "Rejeté";
export type TypeEvenementTransmission = "accuse_reception" | "pris_en_charge" | "traite" | "rejete";

export interface EvenementTransmission {
  id: string;
  transmission_id: string;
  type_evenement: TypeEvenementTransmission;
  auteur: string;
  date: string;
  commentaire: string | null;
}

export interface Transmission {
  id: string;
  document: string;
  type_document: string;
  expediteur: string;
  destinataire: string;
  date_transmission: string;
  piece_jointe: string | null;
  urgence: string | null;
  commentaire: string | null;
  statut: StatutTransmission;
  evenements: EvenementTransmission[];
}

export interface ResultatListeTransmissions {
  type: "resultat";
  commande: "bordereau_lister";
  version: string;
  ok: boolean;
  disponible: boolean;
  transmissions: Transmission[];
  erreurs_lecture: string[];
}

export interface NouvelleTransmission {
  destinataire: string;
  document: string;
  typeDocument: string;
  pieceJointeSource?: string | null;
  urgence?: string | null;
  commentaire?: string | null;
}

export interface NouvelEvenementTransmission {
  transmissionId: string;
  typeEvenement: TypeEvenementTransmission;
  commentaire?: string | null;
}

export interface ResultatTransmissionCreee {
  type: "resultat";
  commande: "bordereau_creer";
  version: string;
  ok: true;
  transmission: Transmission;
}

export interface ResultatEvenementCree {
  type: "resultat";
  commande: "bordereau_evenement";
  version: string;
  ok: true;
  evenement: EvenementTransmission;
}

/** API exposée par l'application de bureau (fichier electron/preload.cjs). */
export interface ApiOrisflow {
  choisirFichiers(): Promise<FichierImporte[]>;
  decrireFichiersDeposes(fichiers: FileList | File[]): Promise<FichierImporte[]>;
  testerMoteur(): Promise<ResultatPing>;
  classer(chemins: string[]): Promise<ResultatClassement>;
  generer(chemins: string[]): Promise<ResultatGeneration>;
  surEvenementMoteur(rappel: (evenement: EvenementMoteur) => void): () => void;
  lireParametres(): Promise<ParametresApplication>;
  choisirDossierTravail(): Promise<string>;
  choisirDossierReference(): Promise<string>;
  ouvrirDossierTravail(): Promise<string>;
  choisirDossierBordereau(): Promise<string>;
  definirIdentite(nom: string): Promise<string>;
  bordereauChoisirPieceJointe(): Promise<FichierImporte | null>;
  bordereauCreer(donnees: NouvelleTransmission): Promise<ResultatTransmissionCreee>;
  bordereauEvenement(donnees: NouvelEvenementTransmission): Promise<ResultatEvenementCree>;
  bordereauLister(): Promise<ResultatListeTransmissions>;
}

declare global {
  interface Window {
    orisflow?: ApiOrisflow;
  }
}
