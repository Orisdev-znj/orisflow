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
  // Par proximité du total de comptes avec la veille — 03/10/2026.
  | "comptage"
  // Reconnue par ses numéros de compte, via la table « 15 comptes par agence » — 05/10/2026.
  | "comptes"
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
  // Étapes résumées de l'analyse (comptage, numéros de compte, confirmations) — 03/10/2026.
  journal_etapes?: string[];
  // Relevés bancaires attendus mais absents aujourd'hui, avec la valeur de la veille si le
  // carnet la connaît (décision du 03/10/2026, option A). Jamais repris sans accord de l'utilisateur.
  releves_manquants: ReleveManquant[];
}

export interface ReleveManquant {
  cle: string;
  libelle: string;
  veille: number | null;
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
  // Copie automatique du classeur généré dans le dossier de référence, pour que la
  // prochaine génération en reparte (chaînage J-1, décision du 06/10/2026) ; `null` si
  // le dossier de référence est introuvable ou identique au dossier de sortie.
  chemin_reference_mis_a_jour: string | null;
  agences_mises_a_jour: string[];
  // Dépôts/engagements (lignes 20/23), distincts des comptes : une agence peut être mise
  // à jour sur l'un sans l'être sur l'autre (ajouté le 01/10/2026, sprint 5).
  agences_balance_mises_a_jour: string[];
  // Banques (28-34), ajouté le 02/10/2026 — voir CLAUDE.md §26.
  agences_banques_mises_a_jour: string[];
  // Lignes banques restées inchangées faute de relevé ou de valeur saisie (avertissement
  // plus visible que la liste « agences_non_mises_a_jour », demande du 02/10/2026).
  avertissements_banques: string[];
  // Cellules-formules du modèle sans valeur calculée (classeur jamais recalculé par Excel) :
  // le J-1 correspondant aurait silencieusement valu 0 sans ce signalement (06/10/2026).
  avertissements_modele: string[];
  agences_non_mises_a_jour: string[];
  fichiers_ignores: string[];
  classement: Classement;
}

/** Valeurs saisies dans la fenêtre unique avant de générer (voir lib/champsManuels.ts). */
export type ValeursManuelles = Record<string, number>;

/** Clé de relevé absent (ex. « cca:39 ») -> solde du jour saisi par l'utilisateur. Absent = la veille est conservée. */
export type RelevesSaisis = Record<string, number>;

export interface ResultatPing {
  type: "resultat";
  commande: "ping";
  ok: boolean;
  version: string;
  python?: string;
  systeme?: string;
}

/** Une vérification concrète du moteur (ex. « Lecture/écriture Excel ») parmi celles
 * effectuées par « Tester le moteur » (remplace le simple ping le 05/10/2026). */
export interface EtapeDiagnostic {
  etape: string;
  ok: boolean;
  detail: string;
}

export interface ResultatDiagnostic {
  type: "resultat";
  commande: "diagnostic";
  ok: boolean;
  version: string;
  python: string;
  systeme: string;
  etapes: EtapeDiagnostic[];
}

/** État de la table « 15 comptes par agence » (décision du 05/10/2026), qui permet de
 * reconnaître une liste de comptes sans dépendre de son nom de fichier. */
export interface TableComptesInfo {
  existe: boolean;
  construiteLe: string | null;
  joursDeReference: string[];
  // Nombre de comptes stables retenus, par clé d'agence.
  agences: Record<string, number>;
}

export interface ResultatTableComptesConstruite {
  type: "resultat";
  commande: "table_comptes_construire";
  version: string;
  ok: true;
  fichier: string;
  agences: Record<string, number>;
  seuil: number;
  comptes_par_agence: number;
}

/** État du carnet des soldes bancaires (décision du 03/10/2026, complété le 05/10/2026
 * par l'import depuis un classeur validé — voir carnet.py). */
export interface CarnetInfo {
  existe: boolean;
  dernierJour: string | null;
  nombreJours: number;
  nombreComptes: number;
}

export interface ResultatCarnetImporte {
  type: "resultat";
  commande: "carnet_importer_classeur";
  version: string;
  ok: true;
  jour: string;
  comptes_importes: number;
  avertissements: string[];
}

/** État du carnet des soldes bancaires (décision du 03/10/2026, complété le 05/10/2026
 * par l'import depuis un classeur validé — voir carnet.py). */
export interface CarnetInfo {
  existe: boolean;
  dernierJour: string | null;
  nombreJours: number;
  nombreComptes: number;
}

export interface ResultatCarnetImporte {
  type: "resultat";
  commande: "carnet_importer_classeur";
  version: string;
  ok: true;
  jour: string;
  comptes_importes: number;
  avertissements: string[];
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
// --- Authentification (06/10/2026) -----------------------------------------------------

export type RoleUtilisateur = "admin" | "utilisateur";

/** Jamais de mot de passe, de sel ni de hachage ici : uniquement ce qui peut être affiché. */
export interface UtilisateurPublic {
  identifiant: string;
  nomAffiche: string;
  role: RoleUtilisateur;
  creeLe: string;
}

export interface EtatAuth {
  premierLancement: boolean;
  utilisateurConnecte: UtilisateurPublic | null;
}

export interface ResultatAuth {
  ok: boolean;
  utilisateur?: UtilisateurPublic;
  erreur?: string;
}

export interface ResultatSimple {
  ok: boolean;
  erreur?: string;
}

export interface ResultatListeUtilisateurs {
  ok: boolean;
  utilisateurs?: UtilisateurPublic[];
  erreur?: string;
}

export interface NouvelUtilisateur {
  identifiant: string;
  motDePasse: string;
  nomAffiche?: string;
  role?: RoleUtilisateur;
}

// --- Journal des actions (06/10/2026) ---------------------------------------------------

export interface EvenementJournal {
  horodatage: string;
  utilisateur: string | null;
  nomAffiche: string | null;
  action: string;
  details: Record<string, unknown>;
}

export interface FiltresJournal {
  utilisateur?: string;
  action?: string;
  limite?: number;
}

export interface ResultatJournal {
  ok: boolean;
  evenements?: EvenementJournal[];
  erreur?: string;
}

export interface ApiOrisflow {
  etatAuth(): Promise<EtatAuth>;
  creerCompteInitial(donnees: NouvelUtilisateur): Promise<ResultatAuth>;
  connecter(identifiant: string, motDePasse: string): Promise<ResultatAuth>;
  deconnecter(): Promise<boolean>;
  listerUtilisateurs(): Promise<ResultatListeUtilisateurs>;
  creerUtilisateur(donnees: NouvelUtilisateur): Promise<ResultatAuth>;
  supprimerUtilisateur(identifiant: string): Promise<ResultatSimple>;
  reinitialiserMotDePasse(identifiant: string, nouveauMotDePasse: string): Promise<ResultatSimple>;
  listerJournal(filtres?: FiltresJournal): Promise<ResultatJournal>;
  choisirFichiers(): Promise<FichierImporte[]>;
  decrireFichiersDeposes(fichiers: FileList | File[]): Promise<FichierImporte[]>;
  testerMoteur(): Promise<ResultatDiagnostic>;
  lireTableComptesInfo(): Promise<TableComptesInfo>;
  construireTableComptes(): Promise<ResultatTableComptesConstruite | null>;
  lireCarnetInfo(): Promise<CarnetInfo>;
  importerClasseurCarnet(): Promise<ResultatCarnetImporte | null>;
  classer(chemins: string[], agencesManuelles?: Record<string, string>): Promise<ResultatClassement>;
  generer(
    chemins: string[],
    valeursManuelles?: ValeursManuelles,
    relevesSaisis?: RelevesSaisis,
  ): Promise<ResultatGeneration>;
  // Export du rapport d'analyse en Excel (10/10/2026) : null si l'utilisateur annule la
  // boîte de dialogue « Enregistrer sous ».
  exporterRapport(
    fichiers: FichierClasse[],
    journalEtapes: string[] | null,
  ): Promise<{ ok: boolean; chemin: string } | null>;
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
