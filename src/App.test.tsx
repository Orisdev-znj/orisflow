import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import App from "./App";
import type { ApiOrisflow } from "./lib/types";

function fausseApi(surcharges: Partial<ApiOrisflow> = {}): ApiOrisflow {
  return {
    choisirFichiers: async () => [],
    decrireFichiersDeposes: async () => [],
    testerMoteur: async () => ({ type: "resultat", commande: "ping", ok: true, version: "0.1.0" }),
    classer: async () => ({
      type: "resultat",
      commande: "classer",
      ok: true,
      version: "0.1.0",
      total: 0,
      fichiers: [],
      reference: { disponible: false, chemin: null, date: null },
    }),
    surEvenementMoteur: () => () => undefined,
    lireParametres: async () => ({
      dossierTravail: "C:\\Orisflow",
      dossierReference: "",
      dossierBordereau: "",
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
      agences_mises_a_jour: ["Akwa"],
      agences_non_mises_a_jour: [],
      fichiers_ignores: [],
      classement: { ok: true, total: 0, fichiers: [], reference: { disponible: false, chemin: null, date: null } },
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
      disponible: false,
      transmissions: [],
      erreurs_lecture: [],
    }),
    ...surcharges,
  };
}

/** Depuis l'accueil, entre dans le module Trésorerie (comme le ferait un utilisateur). */
async function ouvrirTresorerie(utilisateur: ReturnType<typeof userEvent.setup>) {
  await utilisateur.click(screen.getByRole("button", { name: /Suivi de la trésorerie/ }));
}

describe("Accueil (hub)", () => {
  it("affiche les trois cartes de modules au démarrage", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Que voulez-vous faire aujourd'hui ?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Suivi de la trésorerie/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /États financiers/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bordereau de transmission/ })).toBeInTheDocument();
  });

  it("ouvre le module Trésorerie sans régression sur son flux existant", async () => {
    const utilisateur = userEvent.setup();
    render(<App />);

    await ouvrirTresorerie(utilisateur);

    expect(screen.getByRole("heading", { name: "Importer les fichiers du jour" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyser les fichiers" })).toBeDisabled();
  });

  it("ouvre le module États financiers sur l'écran « en cours de développement »", async () => {
    const utilisateur = userEvent.setup();
    render(<App />);

    await utilisateur.click(screen.getByRole("button", { name: /États financiers/ }));

    expect(screen.getByRole("heading", { name: "États financiers" })).toBeInTheDocument();
    expect(screen.getByText(/en cours de développement/i)).toBeInTheDocument();
  });

  it("revient à l'accueil depuis l'écran « en cours de développement »", async () => {
    const utilisateur = userEvent.setup();
    render(<App />);

    await utilisateur.click(screen.getByRole("button", { name: /États financiers/ }));
    await utilisateur.click(screen.getByRole("button", { name: "Retour à l'accueil" }));

    expect(screen.getByRole("heading", { name: "Que voulez-vous faire aujourd'hui ?" })).toBeInTheDocument();
  });

  it("revient à l'accueil depuis le module Trésorerie via le bouton d'en-tête", async () => {
    const utilisateur = userEvent.setup();
    render(<App />);

    await ouvrirTresorerie(utilisateur);
    await utilisateur.click(screen.getByRole("button", { name: /Accueil/ }));

    expect(screen.getByRole("heading", { name: "Que voulez-vous faire aujourd'hui ?" })).toBeInTheDocument();
  });
});

describe("Module Trésorerie (sans régression)", () => {
  it("affiche l'écran d'import vide à l'ouverture du module", async () => {
    const utilisateur = userEvent.setup();
    render(<App />);
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
    render(<App />);
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
    render(<App />);
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
    render(<App />);
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
            niveau: "avertissement",
            messages: [
              "Écart anormal avec la veille : 1273 comptes aujourd'hui contre 2441 (Bafoussam, écart de 48 %).",
              "Ce total ressemble plutôt à celui de la veille pour : Balessing.",
            ],
          },
        ],
      }),
    });
    const utilisateur = userEvent.setup();
    render(<App />);
    await ouvrirTresorerie(utilisateur);

    await utilisateur.click(screen.getByRole("button", { name: "Choisir des fichiers…" }));
    await utilisateur.click(await screen.findByRole("button", { name: "Analyser les fichiers" }));

    expect(await screen.findByText("À vérifier")).toBeInTheDocument();
    expect(screen.getByText(/Ce total ressemble plutôt à celui de la veille pour : Balessing/)).toBeInTheDocument();
    expect(screen.getByText(/Comparaison faite avec le classeur du 2026-09-10/)).toBeInTheDocument();
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
            niveau: "information",
            messages: [],
          },
        ],
      }),
    });
    const utilisateur = userEvent.setup();
    render(<App />);
    await ouvrirTresorerie(utilisateur);

    await utilisateur.click(screen.getByRole("button", { name: "Choisir des fichiers…" }));
    await utilisateur.click(await screen.findByRole("button", { name: "Analyser les fichiers" }));
    await utilisateur.click(await screen.findByRole("button", { name: "Générer le classeur" }));

    expect(await screen.findByText(/Fichier généré/)).toBeInTheDocument();
    expect(screen.getByText(/Agences mises à jour : Akwa/)).toBeInTheDocument();
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
      agences_mises_a_jour: ["Akwa"],
      agences_non_mises_a_jour: [],
      fichiers_ignores: [],
      classement: { ok: true, total: 0, fichiers: [], reference: { disponible: false, chemin: null, date: null } },
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
            niveau: "information",
            messages: [],
          },
        ],
      }),
      generer: genererEspion,
    });
    const utilisateur = userEvent.setup();
    render(<App />);
    await ouvrirTresorerie(utilisateur);

    await utilisateur.click(screen.getByRole("button", { name: "Choisir des fichiers…" }));
    await utilisateur.click(await screen.findByRole("button", { name: "Analyser les fichiers" }));

    await utilisateur.click(await screen.findByRole("checkbox", { name: /Mokolo_Compte.xls/ }));
    await utilisateur.click(screen.getByRole("button", { name: "Générer le classeur" }));

    await waitFor(() => expect(genererEspion).toHaveBeenCalledWith(["C:\\x\\Akwa_Compte.xls"]));
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
            niveau: "information",
            messages: [],
          },
        ],
      }),
    });
    const utilisateur = userEvent.setup();
    render(<App />);
    await ouvrirTresorerie(utilisateur);

    await utilisateur.click(screen.getByRole("button", { name: "Choisir des fichiers…" }));
    await utilisateur.click(await screen.findByRole("button", { name: "Analyser les fichiers" }));

    expect(await screen.findByRole("button", { name: "Générer le classeur" })).toBeDisabled();
    expect(screen.getByText(/Aucun classeur de référence trouvé/)).toBeInTheDocument();
  });
});

describe("Bordereau de transmission (démarré le 30/09/2026)", () => {
  it("signale qu'aucun dossier partagé n'est configuré", async () => {
    window.orisflow = fausseApi();
    const utilisateur = userEvent.setup();
    render(<App />);

    await utilisateur.click(screen.getByRole("button", { name: /Bordereau de transmission/ }));

    expect(await screen.findByText(/Aucun dossier partagé n'est configuré/)).toBeInTheDocument();
  });

  it("crée une transmission puis permet d'en accuser réception", async () => {
    let transmissions: any[] = [];
    window.orisflow = fausseApi({
      lireParametres: async () => ({
        dossierTravail: "C:\\Orisflow",
        dossierReference: "",
        dossierBordereau: "\\\\reseau\\Orisflow\\Bordereau",
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
    render(<App />);

    await utilisateur.click(screen.getByRole("button", { name: /Bordereau de transmission/ }));
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
