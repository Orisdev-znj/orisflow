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
  version: string;
  empaquete: boolean;
}

export type EtatGeneration =
  | { etat: "attente" }
  | { etat: "encours" }
  | { etat: "succes"; resultat: ResultatGeneration }
  | { etat: "erreur"; message: string };

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
}

declare global {
  interface Window {
    orisflow?: ApiOrisflow;
  }
}
