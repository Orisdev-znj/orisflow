export interface FichierImporte {
  chemin: string;
  nom: string;
  taille: number;
}

export type NiveauFichier = "information" | "avertissement" | "bloquant";
export type ConfianceAgence =
  | "nom"
  | "code"
  | "aucune"
  | "sans_objet"
  | "contenu_document"
  | "regle_banque"
  // Déduite du champ « Gestionnaire » (table configurée par l'utilisateur) ou, en
  // dernier recours, par proximité du total de comptes avec la veille — 03/10/2026.
  | "gestionnaire"
  | "comptage"
  // Choisie par l'utilisateur dans la fenêtre « Agence à confirmer » (03/10/2026).
  | "manuelle";

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
  // Relevés bancaires (banques, ajouté le 02/10/2026 — voir CLAUDE.md §26) :
  cle_rib: string | null;
  code_client: string | null;
  solde_releve: number | null;
  ligne_banque_cible: "cca_bank" | "afriland" | "bgfi" | "western_union" | null;
  // Nom lu dans le champ « Gestionnaire » d'une liste de comptes (03/10/2026).
  gestionnaire: string | null;
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
  // Champs à demander dans la fenêtre unique de saisie manuelle avant de générer (UV,
  // UBA, Ecobank, Access Bank, et Western Union seulement en secours) — voir
  // lib/champsManuels.ts pour les libellés. Ajouté le 02/10/2026.
  champs_manuels_requis: string[];
  // Étapes résumées de l'analyse (comptage, gestionnaire, confirmations) — 03/10/2026.
  journal_etapes?: string[];
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
  // Banques (28-34), ajouté le 02/10/2026 — voir CLAUDE.md §26.
  agences_banques_mises_a_jour: string[];
  // Lignes banques restées inchangées faute de relevé ou de valeur saisie (avertissement
  // plus visible que la liste « agences_non_mises_a_jour », demande du 02/10/2026).
  avertissements_banques: string[];
  agences_non_mises_a_jour: string[];
  fichiers_ignores: string[];
  classement: Classement;
}

/** Valeurs saisies dans la fenêtre unique avant de générer (voir lib/champsManuels.ts). */
export type ValeursManuelles = Record<string, number>;

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
  // Ajoutés le 03/10/2026 : barre de progression en % et journal d'étapes lisible.
  pourcentage?: number;
  message?: string;
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
  // Table gestionnaire → agence (clé agence, ex. "akwa"), configurée par l'utilisateur
  // (Paramètres → Gestionnaires, 03/10/2026). Vide par défaut, jamais devinée.
  gestionnaires: Record<string, string>;
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
  classer(chemins: string[], agencesManuelles?: Record<string, string>): Promise<ResultatClassement>;
  generer(chemins: string[], valeursManuelles?: ValeursManuelles): Promise<ResultatGeneration>;
  surEvenementMoteur(rappel: (evenement: EvenementMoteur) => void): () => void;
  lireParametres(): Promise<ParametresApplication>;
  choisirDossierTravail(): Promise<string>;
  choisirDossierReference(): Promise<string>;
  ouvrirDossierTravail(): Promise<string>;
  choisirDossierBordereau(): Promise<string>;
  definirIdentite(nom: string): Promise<string>;
  enregistrerGestionnaires(mapping: Record<string, string>): Promise<Record<string, string>>;
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
