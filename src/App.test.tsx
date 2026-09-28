import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
      version: "0.1.0",
      empaquete: false,
    }),
    choisirDossierTravail: async () => "C:\\Orisflow",
    choisirDossierReference: async () => "C:\\Orisflow\\Reference",
    ouvrirDossierTravail: async () => "C:\\Orisflow",
    ...surcharges,
  };
}

describe("Orisflow", () => {
  it("affiche l'écran d'import vide au démarrage", () => {
    render(<App />);
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

    await utilisateur.click(screen.getByRole("button", { name: "Choisir des fichiers…" }));
    await utilisateur.click(await screen.findByRole("button", { name: "Analyser les fichiers" }));

    expect(await screen.findByText("Avertissement")).toBeInTheDocument();
    expect(screen.getByText(/Ce total ressemble plutôt à celui de la veille pour : Balessing/)).toBeInTheDocument();
    expect(screen.getByText(/Comparaison faite avec le classeur du 2026-09-10/)).toBeInTheDocument();
  });
});
