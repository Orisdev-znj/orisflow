import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, vi } from "vitest";
import App from "./App";
import type { ApiOrisflow } from "./lib/types";

const UTILISATEUR_TEST = { identifiant: "test", nomAffiche: "Test", role: "admin" as const, creeLe: "2026-01-01" };

function fausseApi(surcharges: Partial<ApiOrisflow> = {}): ApiOrisflow {
  return {
    // Authentification (06/10/2026) : une session est déjà ouverte par défaut, pour que les
    // tests existants (écrits avant l'authentification) continuent de voir l'application
    // normale sans passer par l'écran de connexion.
    etatAuth: async () => ({ premierLancement: false, utilisateurConnecte: UTILISATEUR_TEST }),
    creerCompteInitial: async () => ({ ok: true, utilisateur: UTILISATEUR_TEST }),
    connecter: async () => ({ ok: true, utilisateur: UTILISATEUR_TEST }),
    deconnecter: async () => true,
    listerUtilisateurs: async () => ({ ok: true, utilisateurs: [UTILISATEUR_TEST] }),
    creerUtilisateur: async () => ({ ok: true, utilisateur: UTILISATEUR_TEST }),
    supprimerUtilisateur: async () => ({ ok: true }),
    reinitialiserMotDePasse: async () => ({ ok: true }),
    listerJournal: async () => ({ ok: true, evenements: [] }),
    choisirFichiers: async () => [],
    decrireFichiersDeposes: async () => [],
    testerMoteur: async () => ({
      type: "resultat",
      commande: "diagnostic",
      ok: true,
      version: "0.1.0",
      python: "3.14.4",
      systeme: "Windows-10",
      etapes: [],
    }),
    lireTableComptesInfo: async () => ({ existe: false, construiteLe: null, joursDeReference: [], agences: {} }),
    construireTableComptes: async () => null,
    lireCarnetInfo: async () => ({ existe: false, dernierJour: null, nombreJours: 0, nombreComptes: 0 }),
    importerClasseurCarnet: async () => null,
    classer: async () => ({
      type: "resultat",
      commande: "classer",
      ok: true,
      version: "0.1.0",
      total: 0,
      fichiers: [],
      reference: { disponible: false, chemin: null, date: null },
      champs_manuels_requis: [], releves_manquants: [],
    }),
    surEvenementMoteur: () => () => undefined,
    lireParametres: async () => ({
      dossierTravail: "C:\\Orisflow",
      dossierReference: "",
      dossierBordereau: "C:\\Orisflow\\SuiviCourrier",
      dossierBordereauParDefaut: true,
      identite: "",
      version: "0.1.0",
      empaquete: false,
    }),
    generer: async () => ({
      type: "resultat",
      commande: "generer",
      version: "0.1.0",
      ok: true,
      chemin_genere: "C:\\Orisflow\\Resultats\\TRESORERIE JOURNALIÈRE et TDB DU  29 09 2026.xlsx",
      date: "2026-09-29",
      modele_utilise: "C:\\ref\\... 28 09 2026.xlsx",
      chemin_reference_mis_a_jour: null,
      agences_mises_a_jour: ["Akwa"],
      agences_balance_mises_a_jour: [],
      agences_banques_mises_a_jour: [],
      avertissements_banques: [],
      avertissements_modele: [],
      agences_non_mises_a_jour: [],
      fichiers_ignores: [],
      agences_caisses_mises_a_jour: [],
      doublons_ignores: [],
      recapitulatif_agences: [],
      recapitulatif_banques: [],
      classement: {
        ok: true,
        total: 0,
        fichiers: [],
        reference: { disponible: false, chemin: null, date: null },
        champs_manuels_requis: [], releves_manquants: [],
      },
    }),
    choisirDossierTravail: async () => "C:\\Orisflow",
    choisirDossierReference: async () => "C:\\Orisflow\\Reference",
    ouvrirDossierTravail: async () => "C:\\Orisflow",
    choisirDossierBordereau: async () => "\\\\reseau\\Orisflow\\Bordereau",
    definirIdentite: async (nom) => nom,
    bordereauChoisirPieceJointe: async () => null,
    bordereauCreer: async () => ({
      type: "resultat",
      commande: "bordereau_creer",
      version: "0.1.0",
      ok: true,
      transmission: {
        id: "abc123",
        document: "Document",
        type_document: "Autre",
        expediteur: "",
        destinataire: "",
        date_transmission: "2026-09-30T10:00:00",
        piece_jointe: null,
        urgence: null,
        commentaire: null,
        statut: "Transmis",
        evenements: [],
      },
    }),
    bordereauEvenement: async () => ({
      type: "resultat",
      commande: "bordereau_evenement",
      version: "0.1.0",
      ok: true,
      evenement: {
        id: "evt1",
        transmission_id: "abc123",
        type_evenement: "accuse_reception",
        auteur: "",
        date: "2026-09-30T10:05:00",
        commentaire: null,
      },
    }),
    bordereauLister: async () => ({
      type: "resultat",
      commande: "bordereau_lister",
      version: "0.1.0",
      ok: true,
      disponible: true, // le dossier de test local par défaut existe toujours (créé par Electron)
      transmissions: [],
      erreurs_lecture: [],
    }),
    exporterRapport: async () => null,
    choisirDossierImport: async () => [],
    annulerMoteur: async () => true,
    ouvrirResultat: async () => ({ ok: true }),
    listerHistorique: async () => [],
    controlerModele: async () => null,
    verifierClasseur: async () => ({ ok: true, statut: "conforme" as const }),
    ...surcharges,
  };
}

/** Depuis l'accueil, entre dans le module Trésorerie (comme le ferait un utilisateur). */
/** Monte l'application et attend que la session (déjà ouverte par `fausseApi`) soit reprise
 * et que l'accueil s'affiche réellement — l'authentification (06/10/2026) vérifie la session
 * de façon asynchrone avant d'afficher quoi que ce soit d'autre. */
async function monterApplication() {
  render(<App />);
  await screen.findByRole("heading", { name: "Que voulez-vous faire aujourd'hui ?" });
}

async function ouvrirTresorerie(utilisateur: ReturnType<typeof userEvent.setup>) {
  await utilisateur.click(await screen.findByRole("button", { name: /Suivi de la trésorerie/ }));
}

describe("Accueil (hub)", () => {
  it("affiche les quatre cartes de modules au démarrage", async () => {
    await monterApplication();
    expect(screen.getByRole("heading", { name: "Que voulez-vous faire aujourd'hui ?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Suivi de la trésorerie/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /États financiers/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Suivi Courrier/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Évaluation budgétaire/ })).toBeInTheDocument();
  });

  it("ouvre le module Évaluation budgétaire avec des données fictives clairement annoncées", async () => {
    const utilisateur = userEvent.setup();
    await monterApplication();

    await utilisateur.click(screen.getByRole("button", { name: /Évaluation budgétaire/ }));

    expect(screen.getByRole("heading", { name: "Évaluation budgétaire" })).toBeInTheDocument();
    expect(screen.getByText(/Données fictives/)).toBeInTheDocument();

    await utilisateur.click(screen.getByRole("button", { name: "Retour à l'accueil" }));
    expect(screen.getByRole("heading", { name: "Que voulez-vous faire aujourd'hui ?" })).toBeInTheDocument();
  });

  it("ouvre le module Trésorerie sans régression sur son flux existant", async () => {
    const utilisateur = userEvent.setup();
    await monterApplication();

    await ouvrirTresorerie(utilisateur);

    expect(screen.getByRole("heading", { name: "Importer les fichiers du jour" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyser les fichiers" })).toBeDisabled();
  });

  it("ouvre le module États financiers sur l'écran « en cours de développement »", async () => {
    const utilisateur = userEvent.setup();
    await monterApplication();

    await utilisateur.click(screen.getByRole("button", { name: /États financiers/ }));

    expect(screen.getByRole("heading", { name: "États financiers" })).toBeInTheDocument();
    expect(screen.getByText(/en cours de développement/i)).toBeInTheDocument();
  });

  it("revient à l'accueil depuis l'écran « en cours de développement »", async () => {
    const utilisateur = userEvent.setup();
    await monterApplication();

    await utilisateur.click(screen.getByRole("button", { name: /États financiers/ }));
    await utilisateur.click(screen.getByRole("button", { name: "Retour à l'accueil" }));

    expect(screen.getByRole("heading", { name: "Que voulez-vous faire aujourd'hui ?" })).toBeInTheDocument();
  });

  it("revient à l'accueil depuis le module Trésorerie via le bouton d'en-tête", async () => {
    const utilisateur = userEvent.setup();
    await monterApplication();

    await ouvrirTresorerie(utilisateur);
    await utilisateur.click(screen.getByRole("button", { name: /Accueil/ }));

    expect(screen.getByRole("heading", { name: "Que voulez-vous faire aujourd'hui ?" })).toBeInTheDocument();
  });
});

describe("Module Trésorerie (sans régression)", () => {
  it("affiche l'écran d'import vide à l'ouverture du module", async () => {
    const utilisateur = userEvent.setup();
    await monterApplication();
    await ouvrirTresorerie(utilisateur);

    expect(screen.getByRole("heading", { name: "Importer les fichiers du jour" })).toBeInTheDocument();
    expect(screen.getByText("Aucun fichier importé pour le moment.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyser les fichiers" })).toBeDisabled();
  });

  it("liste les fichiers choisis et permet de les retirer", async () => {
    window.orisflow = fausseApi({
      choisirFichiers: async () => [{ chemin: "C:\\x\\Akwa_Compte.xls", nom: "Akwa_Compte.xls", taille: 2048 }],
    });
    const utilisateur = userEvent.setup();
    await monterApplication();
    await ouvrirTresorerie(utilisateur);

    await utilisateur.click(screen.getByRole("button", { name: "Choisir des fichiers…" }));
    expect(await screen.findByText("Akwa_Compte.xls")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyser les fichiers" })).toBeEnabled();

    await utilisateur.click(screen.getByRole("button", { name: "Retirer Akwa_Compte.xls" }));
    expect(screen.queryByText("Akwa_Compte.xls")).not.toBeInTheDocument();
  });

  it("n'importe pas deux fois le même fichier", async () => {
    const fichier = { chemin: "C:\\x\\Akwa_Compte.xls", nom: "Akwa_Compte.xls", taille: 10 };
    window.orisflow = fausseApi({ choisirFichiers: async () => [fichier] });
    const utilisateur = userEvent.setup();
    await monterApplication();
    await ouvrirTresorerie(utilisateur);

    await utilisateur.click(screen.getByRole("button", { name: "Choisir des fichiers…" }));
    await utilisateur.click(screen.getByRole("button", { name: "Choisir des fichiers…" }));
    await waitFor(() => expect(screen.getAllByText("Akwa_Compte.xls")).toHaveLength(1));
  });

  it("affiche un message clair en français si le moteur échoue", async () => {
    window.orisflow = fausseApi({
      choisirFichiers: async () => [{ chemin: "C:\\x\\a.xls", nom: "a.xls", taille: 1 }],
      classer: async () => {
        throw new Error("Le moteur Python est introuvable sur cet ordinateur.");
      },
    });
    const utilisateur = userEvent.setup();
    await monterApplication();
    await ouvrirTresorerie(utilisateur);

    await utilisateur.click(screen.getByRole("button", { name: "Choisir des fichiers…" }));
    await utilisateur.click(await screen.findByRole("button", { name: "Analyser les fichiers" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "L'analyse n'a pas pu aboutir. Le moteur Python est introuvable sur cet ordinateur.",
    );
  });

  it("montre le résultat de l'analyse avec le type, l'agence et le niveau de chaque fichier", async () => {
    window.orisflow = fausseApi({
      choisirFichiers: async () => [{ chemin: "C:\\x\\Bafoussam_Compte.xls", nom: "Bafoussam_Compte.xls", taille: 1 }],
      classer: async () => ({
        type: "resultat",
        commande: "classer",
        ok: false,
        version: "0.1.0",
        total: 1,
        reference: { disponible: true, chemin: "C:\\ref\\... 10 09 2026.xlsx", date: "2026-09-10" },
        fichiers: [
          {
            nom: "Bafoussam_Compte.xls",
            chemin: "C:\\x\\Bafoussam_Compte.xls",
            extension: ".xls",
            type_detecte: "compte",
            type_libelle: "Liste de comptes",
            agence_detectee: "bafoussam",
            agence_libelle: "Bafoussam",
            confiance_agence: "nom",
            numero_compte_pdf: null,
            total_comptes: 1273,
            doublons: [],
            mal_formes: [],
            depots: null,
            engagements: null,
            caisse: null,
            cle_rib: null,
            code_client: null,
            solde_releve: null,
            ligne_banque_cible: null,
            niveau: "avertissement",
            messages: [
              "Écart anormal avec la veille : 1273 comptes aujourd'hui contre 2441 (Bafoussam, écart de 48 %).",
              "Ce total ressemble plutôt à celui de la veille pour : Balessing.",
            ],
          },
        ],
        champs_manuels_requis: [], releves_manquants: [],
      }),
    });
    const utilisateur = userEvent.setup();
    await monterApplication();
    await ouvrirTresorerie(utilisateur);

    await utilisateur.click(screen.getByRole("button", { name: "Choisir des fichiers…" }));
    await utilisateur.click(await screen.findByRole("button", { name: "Analyser les fichiers" }));

    expect(await screen.findByText("À vérifier", { selector: ".badge" })).toBeInTheDocument();
    expect(screen.getByText(/Ce total ressemble plutôt à celui de la veille pour : Balessing/)).toBeInTheDocument();
    expect(screen.getByText(/Comparaison faite avec le classeur du 10\/09\/2026/)).toBeInTheDocument();
  });

  it("permet de générer le classeur et affiche le résultat", async () => {
    window.orisflow = fausseApi({
      choisirFichiers: async () => [{ chemin: "C:\\x\\Akwa_Compte.xls", nom: "Akwa_Compte.xls", taille: 1 }],
      classer: async () => ({
        type: "resultat",
        commande: "classer",
        ok: true,
        version: "0.1.0",
        total: 1,
        reference: { disponible: true, chemin: "C:\\ref\\...28 09 2026.xlsx", date: "2026-09-28" },
        fichiers: [
          {
            nom: "Akwa_Compte.xls",
            chemin: "C:\\x\\Akwa_Compte.xls",
            extension: ".xls",
            type_detecte: "compte",
            type_libelle: "Liste de comptes",
            agence_detectee: "akwa",
            agence_libelle: "Akwa",
            confiance_agence: "nom",
            numero_compte_pdf: null,
            total_comptes: 30,
            doublons: [],
            mal_formes: [],
            depots: null,
            engagements: null,
            caisse: null,
            cle_rib: null,
            code_client: null,
            solde_releve: null,
            ligne_banque_cible: null,
            niveau: "information",
            messages: [],
          },
        ],
        champs_manuels_requis: [], releves_manquants: [],
      }),
    });
    const utilisateur = userEvent.setup();
    await monterApplication();
    await ouvrirTresorerie(utilisateur);

    await utilisateur.click(screen.getByRole("button", { name: "Choisir des fichiers…" }));
    await utilisateur.click(await screen.findByRole("button", { name: "Analyser les fichiers" }));
    await utilisateur.click(await screen.findByRole("button", { name: "Générer le classeur" }));

    expect(await screen.findByText(/Classeur généré/)).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === "LI" && element.textContent === "Comptes : Akwa")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ouvrir le classeur" })).toBeInTheDocument();
  });

  it("ouvre la fenêtre de saisie manuelle avant de générer quand des champs sont requis", async () => {
    const genererEspion = vi.fn(async () => ({
      type: "resultat" as const,
      commande: "generer" as const,
      version: "0.1.0",
      ok: true as const,
      chemin_genere: "C:\\Orisflow\\Resultats\\TRESORERIE JOURNALIÈRE et TDB DU  29 09 2026.xlsx",
      date: "2026-09-29",
      modele_utilise: "C:\\ref\\... 28 09 2026.xlsx",
      chemin_reference_mis_a_jour: null,
      agences_mises_a_jour: ["Akwa"],
      agences_balance_mises_a_jour: [],
      agences_banques_mises_a_jour: [],
      avertissements_banques: [],
      avertissements_modele: [],
      agences_non_mises_a_jour: [],
      fichiers_ignores: [],
      agences_caisses_mises_a_jour: [],
      doublons_ignores: [],
      recapitulatif_agences: [],
      recapitulatif_banques: [],
      classement: {
        ok: true,
        total: 0,
        fichiers: [],
        reference: { disponible: false, chemin: null, date: null },
        champs_manuels_requis: [], releves_manquants: [],
      },
    }));
    window.orisflow = fausseApi({
      choisirFichiers: async () => [{ chemin: "C:\\x\\Akwa_Compte.xls", nom: "Akwa_Compte.xls", taille: 1 }],
      classer: async () => ({
        type: "resultat",
        commande: "classer",
        ok: true,
        version: "0.1.0",
        total: 1,
        reference: { disponible: true, chemin: "C:\\ref\\...28 09 2026.xlsx", date: "2026-09-28" },
        fichiers: [
          {
            nom: "Akwa_Compte.xls",
            chemin: "C:\\x\\Akwa_Compte.xls",
            extension: ".xls",
            type_detecte: "compte",
            type_libelle: "Liste de comptes",
            agence_detectee: "akwa",
            agence_libelle: "Akwa",
            confiance_agence: "nom",
            numero_compte_pdf: null,
            total_comptes: 30,
            doublons: [],
            mal_formes: [],
            depots: null,
            engagements: null,
            caisse: null,
            cle_rib: null,
            code_client: null,
            solde_releve: null,
            ligne_banque_cible: null,
            niveau: "information",
            messages: [],
          },
        ],
        champs_manuels_requis: ["ecobank", "uv_orange"], releves_manquants: [],
      }),
      generer: genererEspion,
    });
    const utilisateur = userEvent.setup();
    await monterApplication();
    await ouvrirTresorerie(utilisateur);

    await utilisateur.click(screen.getByRole("button", { name: "Choisir des fichiers…" }));
    await utilisateur.click(await screen.findByRole("button", { name: "Analyser les fichiers" }));
    await utilisateur.click(await screen.findByRole("button", { name: "Générer le classeur" }));

    expect(await screen.findByText("Montants à renseigner avant de générer")).toBeInTheDocument();
    expect(genererEspion).not.toHaveBeenCalled();

    await utilisateur.type(screen.getByLabelText("Ecobank"), "21000000");
    await utilisateur.click(screen.getByRole("button", { name: "Confirmer et générer" }));

    await waitFor(() =>
      expect(genererEspion).toHaveBeenCalledWith(
        ["C:\\x\\Akwa_Compte.xls"],
        { ecobank: 21000000 },
        {},
        expect.stringMatching(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/),
      ),
    );
  });

  it("exclut de la génération un fichier décoché sur l'écran des résultats", async () => {
    const genererEspion = vi.fn(async () => ({
      type: "resultat" as const,
      commande: "generer" as const,
      version: "0.1.0",
      ok: true as const,
      chemin_genere: "C:\\Orisflow\\Resultats\\TRESORERIE JOURNALIÈRE et TDB DU  29 09 2026.xlsx",
      date: "2026-09-29",
      modele_utilise: "C:\\ref\\... 28 09 2026.xlsx",
      chemin_reference_mis_a_jour: null,
      agences_mises_a_jour: ["Akwa"],
      agences_balance_mises_a_jour: [],
      agences_banques_mises_a_jour: [],
      avertissements_banques: [],
      avertissements_modele: [],
      agences_non_mises_a_jour: [],
      fichiers_ignores: [],
      agences_caisses_mises_a_jour: [],
      doublons_ignores: [],
      recapitulatif_agences: [],
      recapitulatif_banques: [],
      classement: {
        ok: true,
        total: 0,
        fichiers: [],
        reference: { disponible: false, chemin: null, date: null },
        champs_manuels_requis: [], releves_manquants: [],
      },
    }));
    window.orisflow = fausseApi({
      choisirFichiers: async () => [
        { chemin: "C:\\x\\Akwa_Compte.xls", nom: "Akwa_Compte.xls", taille: 1 },
        { chemin: "C:\\x\\Mokolo_Compte.xls", nom: "Mokolo_Compte.xls", taille: 1 },
      ],
      classer: async () => ({
        type: "resultat",
        commande: "classer",
        ok: true,
        version: "0.1.0",
        total: 2,
        reference: { disponible: true, chemin: "C:\\ref\\...28 09 2026.xlsx", date: "2026-09-28" },
        fichiers: [
          {
            nom: "Akwa_Compte.xls",
            chemin: "C:\\x\\Akwa_Compte.xls",
            extension: ".xls",
            type_detecte: "compte",
            type_libelle: "Liste de comptes",
            agence_detectee: "akwa",
            agence_libelle: "Akwa",
            confiance_agence: "nom",
            numero_compte_pdf: null,
            total_comptes: 30,
            doublons: [],
            mal_formes: [],
            depots: null,
            engagements: null,
            caisse: null,
            cle_rib: null,
            code_client: null,
            solde_releve: null,
            ligne_banque_cible: null,
            niveau: "information",
            messages: [],
          },
          {
            nom: "Mokolo_Compte.xls",
            chemin: "C:\\x\\Mokolo_Compte.xls",
            extension: ".xls",
            type_detecte: "compte",
            type_libelle: "Liste de comptes",
            agence_detectee: "mokolo",
            agence_libelle: "Mokolo",
            confiance_agence: "nom",
            numero_compte_pdf: null,
            total_comptes: 45,
            doublons: [],
            mal_formes: [],
            depots: null,
            engagements: null,
            caisse: null,
            cle_rib: null,
            code_client: null,
            solde_releve: null,
            ligne_banque_cible: null,
            niveau: "information",
            messages: [],
          },
        ],
        champs_manuels_requis: [], releves_manquants: [],
      }),
      generer: genererEspion,
    });
    const utilisateur = userEvent.setup();
    await monterApplication();
    await ouvrirTresorerie(utilisateur);

    await utilisateur.click(screen.getByRole("button", { name: "Choisir des fichiers…" }));
    await utilisateur.click(await screen.findByRole("button", { name: "Analyser les fichiers" }));

    await utilisateur.click(await screen.findByRole("checkbox", { name: /Mokolo_Compte.xls/ }));
    await utilisateur.click(screen.getByRole("button", { name: "Générer le classeur" }));

    await waitFor(() =>
      expect(genererEspion).toHaveBeenCalledWith(
        ["C:\\x\\Akwa_Compte.xls"],
        {},
        {},
        expect.stringMatching(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/),
      ),
    );
  });

  it("désactive « Générer le classeur » et prévient quand aucun dossier de référence n'est configuré", async () => {
    window.orisflow = fausseApi({
      choisirFichiers: async () => [{ chemin: "C:\\x\\Akwa_Compte.xls", nom: "Akwa_Compte.xls", taille: 1 }],
      classer: async () => ({
        type: "resultat",
        commande: "classer",
        ok: true,
        version: "0.1.0",
        total: 1,
        reference: { disponible: false, chemin: null, date: null },
        fichiers: [
          {
            nom: "Akwa_Compte.xls",
            chemin: "C:\\x\\Akwa_Compte.xls",
            extension: ".xls",
            type_detecte: "compte",
            type_libelle: "Liste de comptes",
            agence_detectee: "akwa",
            agence_libelle: "Akwa",
            confiance_agence: "nom",
            numero_compte_pdf: null,
            total_comptes: 30,
            doublons: [],
            mal_formes: [],
            depots: null,
            engagements: null,
            caisse: null,
            cle_rib: null,
            code_client: null,
            solde_releve: null,
            ligne_banque_cible: null,
            niveau: "information",
            messages: [],
          },
        ],
        champs_manuels_requis: [], releves_manquants: [],
      }),
    });
    const utilisateur = userEvent.setup();
    await monterApplication();
    await ouvrirTresorerie(utilisateur);

    await utilisateur.click(screen.getByRole("button", { name: "Choisir des fichiers…" }));
    await utilisateur.click(await screen.findByRole("button", { name: "Analyser les fichiers" }));

    expect(await screen.findByRole("button", { name: "Générer le classeur" })).toBeDisabled();
    expect(screen.getByText(/Aucun classeur de référence trouvé/)).toBeInTheDocument();
  });
});

describe("Suivi Courrier (démarré le 30/09/2026)", () => {
  it("signale qu'un dossier de test local est utilisé tant qu'aucun dossier réseau n'est choisi", async () => {
    window.orisflow = fausseApi();
    const utilisateur = userEvent.setup();
    await monterApplication();

    await utilisateur.click(screen.getByRole("button", { name: /Suivi Courrier/ }));

    expect(await screen.findByText(/Dossier partagé pas encore choisi/)).toBeInTheDocument();
  });

  it("crée une transmission puis permet d'en accuser réception", async () => {
    let transmissions: any[] = [];
    window.orisflow = fausseApi({
      lireParametres: async () => ({
        dossierTravail: "C:\\Orisflow",
        dossierReference: "",
        dossierBordereau: "\\\\reseau\\Orisflow\\SuiviCourrier",
        dossierBordereauParDefaut: false,
        identite: "Julien",
          version: "0.1.0",
        empaquete: false,
      }),
      bordereauLister: async () => ({
        type: "resultat",
        commande: "bordereau_lister",
        version: "0.1.0",
        ok: true,
        disponible: true,
        transmissions,
        erreurs_lecture: [],
      }),
      bordereauCreer: async (donnees) => {
        const transmission = {
          id: "t1",
          document: donnees.document,
          type_document: donnees.typeDocument,
          expediteur: "Julien",
          destinataire: donnees.destinataire,
          date_transmission: "2026-09-30T10:00:00",
          piece_jointe: null,
          urgence: null,
          commentaire: null,
          statut: "Transmis" as const,
          evenements: [],
        };
        transmissions = [transmission];
        return { type: "resultat", commande: "bordereau_creer", version: "0.1.0", ok: true, transmission };
      },
      bordereauEvenement: async ({ transmissionId }) => {
        transmissions = transmissions.map((t) =>
          t.id === transmissionId ? { ...t, statut: "Reçu" } : t,
        );
        return {
          type: "resultat",
          commande: "bordereau_evenement",
          version: "0.1.0",
          ok: true,
          evenement: {
            id: "e1",
            transmission_id: transmissionId,
            type_evenement: "accuse_reception",
            auteur: "Julien",
            date: "2026-09-30T10:05:00",
            commentaire: null,
          },
        };
      },
    });
    const utilisateur = userEvent.setup();
    await monterApplication();

    await utilisateur.click(screen.getByRole("button", { name: /Suivi Courrier/ }));
    await utilisateur.click(await screen.findByRole("button", { name: "Nouvelle transmission" }));

    await utilisateur.type(screen.getByLabelText("Destinataire"), "Julien");
    await utilisateur.type(screen.getByLabelText("Document"), "Facture EDF septembre");
    await utilisateur.click(screen.getByRole("button", { name: "Transmettre" }));

    expect(await screen.findByText("Facture EDF septembre")).toBeInTheDocument();
    expect(screen.getByText("Transmis")).toBeInTheDocument();

    await utilisateur.click(screen.getByRole("button", { name: "Accuser réception" }));

    expect(await screen.findByText("Reçu")).toBeInTheDocument();
  });
});

describe("Authentification (06/10/2026)", () => {
  it("affiche le nom de l'utilisateur connecté et le bouton Utilisateurs pour un administrateur", async () => {
    window.orisflow = fausseApi({
      etatAuth: async () => ({
        premierLancement: false,
        utilisateurConnecte: { identifiant: "adminorisflow", nomAffiche: "Admin", role: "admin", creeLe: "x" },
      }),
    });
    const utilisateur = userEvent.setup();
    await monterApplication();
    await utilisateur.click(screen.getByRole("button", { name: /Admin/ }));
    expect(screen.getByRole("menuitem", { name: "Utilisateurs" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Journal des actions" })).toBeInTheDocument();
  });

  it("masque le bouton Utilisateurs pour un compte non administrateur", async () => {
    window.orisflow = fausseApi({
      etatAuth: async () => ({
        premierLancement: false,
        utilisateurConnecte: { identifiant: "julien", nomAffiche: "Julien", role: "utilisateur", creeLe: "x" },
      }),
    });
    const utilisateur = userEvent.setup();
    await monterApplication();
    await utilisateur.click(screen.getByRole("button", { name: /Julien/ }));
    expect(screen.getByRole("menuitem", { name: "Paramètres" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Utilisateurs" })).not.toBeInTheDocument();
  });

  it("l'écran de connexion s'affiche tant qu'aucune session n'est reprise", async () => {
    const connecter = vi.fn(async () => ({
      ok: true,
      utilisateur: { identifiant: "arnold", nomAffiche: "Arnold", role: "admin" as const, creeLe: "x" },
    }));
    window.orisflow = fausseApi({
      etatAuth: async () => ({ premierLancement: false, utilisateurConnecte: null }),
      connecter,
    });
    const utilisateur = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Connexion à Orisflow" })).toBeInTheDocument();
    await utilisateur.type(screen.getByLabelText("Identifiant"), "arnold");
    await utilisateur.type(screen.getByLabelText("Mot de passe"), "UnMotDePasseSolide1");
    await utilisateur.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findByRole("heading", { name: "Que voulez-vous faire aujourd'hui ?" })).toBeInTheDocument();
    expect(connecter).toHaveBeenCalledWith("arnold", "UnMotDePasseSolide1");
  });

  it("se déconnecter renvoie à l'écran de connexion", async () => {
    const deconnecter = vi.fn(async () => true);
    let connecte = true;
    window.orisflow = fausseApi({
      etatAuth: async () => ({
        premierLancement: false,
        utilisateurConnecte: connecte
          ? { identifiant: "arnold", nomAffiche: "Arnold", role: "admin", creeLe: "x" }
          : null,
      }),
      deconnecter: async () => {
        connecte = false;
        return deconnecter();
      },
    });
    const utilisateur = userEvent.setup();
    await monterApplication();

    await utilisateur.click(screen.getByRole("button", { name: /Arnold/ }));
    await utilisateur.click(screen.getByRole("menuitem", { name: "Se déconnecter" }));

    expect(await screen.findByRole("heading", { name: "Connexion à Orisflow" })).toBeInTheDocument();
    expect(deconnecter).toHaveBeenCalled();
  });

  it("signale un fichier de comptes endommagé sur l'écran de connexion", async () => {
    window.orisflow = fausseApi({
      etatAuth: async () => ({ premierLancement: false, comptesIllisibles: true, utilisateurConnecte: null }),
    });
    render(<App />);
    expect(await screen.findByText(/fichier des comptes utilisateurs est endommagé/)).toBeInTheDocument();
  });
});

describe("Navigation et parcours (audit du 09/10/2026)", () => {
  it("Paramètres s'ouvre depuis le menu utilisateur, quel que soit le module", async () => {
    window.orisflow = fausseApi();
    const utilisateur = userEvent.setup();
    await monterApplication();

    await utilisateur.click(screen.getByRole("button", { name: /Test/ }));
    await utilisateur.click(screen.getByRole("menuitem", { name: "Paramètres" }));

    expect(await screen.findByRole("heading", { name: "Paramètres" })).toBeInTheDocument();
  });

  it("importe tous les fichiers d'un dossier en une fois", async () => {
    window.orisflow = fausseApi({
      choisirDossierImport: async () => [
        { chemin: "E:/08-10-2026/Classe 3/a.pdf", nom: "a.pdf", taille: 1 },
        { chemin: "E:/08-10-2026/Classe 5/b.pdf", nom: "b.pdf", taille: 1 },
      ],
    });
    const utilisateur = userEvent.setup();
    await monterApplication();
    await ouvrirTresorerie(utilisateur);

    await utilisateur.click(screen.getByRole("button", { name: "Importer le dossier du jour…" }));

    expect(await screen.findByText("Fichiers importés (2)")).toBeInTheDocument();
    const etape = screen.getAllByRole("button").find((b) => b.classList.contains("onglet") && /Import/.test(b.textContent ?? ""));
    expect(etape).toHaveClass("onglet--fait");
    expect(etape).toHaveTextContent("(terminé)");
  });

  it("l'historique liste les classeurs déjà générés", async () => {
    window.orisflow = fausseApi({
      listerHistorique: async () => [
        { nom: "TRESORERIE JOURNALIÈRE et TDB DU  08 10 2026.xlsx", chemin: "C:/R/t.xlsx", modifieLe: "2026-10-09T10:19:00Z", taille: 15688 },
      ],
    });
    const utilisateur = userEvent.setup();
    await monterApplication();
    await ouvrirTresorerie(utilisateur);

    await utilisateur.click(screen.getByRole("button", { name: "Historique" }));

    expect(await screen.findByText(/TDB DU\s+08 10 2026\.xlsx/)).toBeInTheDocument();
  });

  it("l'historique permet de vérifier un classeur et affiche s'il a été modifié", async () => {
    window.orisflow = fausseApi({
      listerHistorique: async () => [
        { nom: "TRESORERIE JOURNALIÈRE et TDB DU  08 10 2026.xlsx", chemin: "C:/R/t.xlsx", modifieLe: "2026-10-09T10:19:00Z", taille: 15688 },
      ],
      verifierClasseur: async () => ({ ok: true, statut: "modifie" as const }),
    });
    const utilisateur = userEvent.setup();
    await monterApplication();
    await ouvrirTresorerie(utilisateur);
    await utilisateur.click(screen.getByRole("button", { name: "Historique" }));

    await utilisateur.click(await screen.findByRole("button", { name: "Vérifier" }));

    expect(await screen.findByText(/Contenu modifié depuis sa génération/)).toBeInTheDocument();
  });

  it("affiche le pied de page avec la version, une fois connecté", async () => {
    window.orisflow = fausseApi();
    await monterApplication();
    expect(screen.getByText(`Orisflow v${__VERSION_APP__} · Usage interne ORIS FINANCE`)).toBeInTheDocument();
  });

  it("les modules pas encore disponibles sont annoncés « Bientôt »", async () => {
    window.orisflow = fausseApi();
    await monterApplication();
    expect(screen.getByRole("button", { name: /États financiers.*Bientôt/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Suivi de la trésorerie/ })).not.toHaveTextContent("Bientôt");
  });
});

describe("Date du classeur (10/10/2026)", () => {
  afterEach(() => vi.useRealTimers());

  it("propose « hier » par défaut et la transmet à l'analyse puis à la génération", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 10, 9, 0) });
    const classer = vi.fn(async () => (await fausseApi().classer([])) as never);
    const generer = vi.fn(async () => (await fausseApi().generer([])) as never);
    window.orisflow = fausseApi({
      choisirDossierImport: async () => [{ chemin: "E:/j/Akwa_Compte.xls", nom: "Akwa_Compte.xls", taille: 1 }],
      classer,
      generer,
    });
    const utilisateur = userEvent.setup({ advanceTimers: () => undefined });
    await monterApplication();
    await ouvrirTresorerie(utilisateur);

    expect(screen.getByLabelText("Date du classeur")).toHaveValue("2026-10-09");
    await utilisateur.click(screen.getByRole("button", { name: "Importer le dossier du jour…" }));
    await utilisateur.click(await screen.findByRole("button", { name: "Analyser les fichiers" }));

    expect(classer).toHaveBeenCalledWith(["E:/j/Akwa_Compte.xls"], undefined, "2026-10-09");
    await screen.findByRole("button", { name: "Générer le classeur" });
  });

  it("une date modifiée (lundi : vendredi) part avec la génération ; un week-end est signalé", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 12, 9, 0) });
    const generer = vi.fn(async (..._arguments: unknown[]) => (await fausseApi().generer([])) as never);
    window.orisflow = fausseApi({
      choisirDossierImport: async () => [{ chemin: "E:/j/Akwa_Compte.xls", nom: "Akwa_Compte.xls", taille: 1 }],
      classer: async () => ({
        ...(await fausseApi().classer([])),
        total: 1,
        reference: { disponible: true, chemin: "C:/ref/x.xlsx", date: "2026-10-09" },
        fichiers: [
          {
            nom: "Akwa_Compte.xls", chemin: "E:/j/Akwa_Compte.xls", extension: ".xls", type_detecte: "compte",
            type_libelle: "Liste de comptes", agence_detectee: "akwa", agence_libelle: "Akwa", confiance_agence: "nom",
            numero_compte_pdf: null, total_comptes: 30, doublons: [], mal_formes: [], depots: null, engagements: null,
            caisse: null, cle_rib: null, code_client: null, solde_releve: null, ligne_banque_cible: null,
            niveau: "information", messages: [],
          },
        ],
      }),
      generer,
    });
    const utilisateur = userEvent.setup({ advanceTimers: () => undefined });
    await monterApplication();
    await ouvrirTresorerie(utilisateur);

    // Lundi 12/10 : « hier » = dimanche, signalé comme week-end.
    expect(screen.getByLabelText("Date du classeur")).toHaveValue("2026-10-11");
    expect(screen.getByText(/dimanche 11 octobre 2026 — week-end/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Date du classeur"), { target: { value: "2026-10-09" } });
    expect(screen.getByText("vendredi 9 octobre 2026")).toBeInTheDocument();

    await utilisateur.click(screen.getByRole("button", { name: "Importer le dossier du jour…" }));
    await utilisateur.click(await screen.findByRole("button", { name: "Analyser les fichiers" }));
    await utilisateur.click(await screen.findByRole("button", { name: "Générer le classeur" }));

    await waitFor(() => expect(generer).toHaveBeenCalled());
    expect(generer.mock.calls[0][3]).toBe("2026-10-09");
  });

  it("une date vide ou future bloque l'analyse", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 10, 9, 0) });
    window.orisflow = fausseApi({
      choisirDossierImport: async () => [{ chemin: "E:/j/a.xls", nom: "a.xls", taille: 1 }],
    });
    const utilisateur = userEvent.setup({ advanceTimers: () => undefined });
    await monterApplication();
    await ouvrirTresorerie(utilisateur);
    await utilisateur.click(screen.getByRole("button", { name: "Importer le dossier du jour…" }));

    fireEvent.change(screen.getByLabelText("Date du classeur"), { target: { value: "2026-10-12" } });
    expect(screen.getByText(/dans le futur/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyser les fichiers" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Date du classeur"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Analyser les fichiers" })).toBeDisabled();
  });
});
