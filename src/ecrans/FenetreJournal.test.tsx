import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import FenetreJournal from "./FenetreJournal";

describe("FenetreJournal", () => {
  it("affiche les évènements avec un libellé lisible", async () => {
    window.orisflow = {
      listerJournal: vi.fn(async () => ({
        ok: true,
        evenements: [
          {
            horodatage: "2026-10-08T07:30:00.000Z",
            utilisateur: "adminorisflow",
            nomAffiche: "Arnold",
            action: "generation_classeur",
            details: { cheminGenere: "C:\\Resultats\\TRESORERIE JOURNALIÈRE et TDB DU  07 10 2026.xlsx" },
          },
        ],
      })),
    } as unknown as typeof window.orisflow;

    render(<FenetreJournal onFermer={vi.fn()} />);

    expect(await screen.findByText("Classeur généré")).toBeInTheDocument();
    expect(screen.getByText("Arnold")).toBeInTheDocument();
    expect(
      screen.getByText((contenu) => contenu.includes("TRESORERIE JOURNALIÈRE et TDB DU") && contenu.includes("07 10 2026")),
    ).toBeInTheDocument();
  });

  it("indique quand aucune action n'est encore enregistrée", async () => {
    window.orisflow = {
      listerJournal: vi.fn(async () => ({ ok: true, evenements: [] })),
    } as unknown as typeof window.orisflow;

    render(<FenetreJournal onFermer={vi.fn()} />);

    expect(await screen.findByText("Aucune action enregistrée pour l'instant.")).toBeInTheDocument();
  });

  it("affiche l'erreur renvoyée si la lecture échoue", async () => {
    window.orisflow = {
      listerJournal: vi.fn(async () => ({ ok: false, erreur: "Réservé à l'administrateur." })),
    } as unknown as typeof window.orisflow;

    render(<FenetreJournal onFermer={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Réservé à l'administrateur.");
  });

  it("refiltre en relisant le journal quand on change le type d'action", async () => {
    const listerJournal = vi.fn(async () => ({ ok: true, evenements: [] }));
    window.orisflow = { listerJournal } as unknown as typeof window.orisflow;
    const utilisateur = userEvent.setup();

    render(<FenetreJournal onFermer={vi.fn()} />);
    await screen.findByText("Aucune action enregistrée pour l'instant.");

    await utilisateur.selectOptions(screen.getByLabelText("Filtrer par type d'action"), "connexion");

    expect(listerJournal).toHaveBeenLastCalledWith({ action: "connexion", limite: 200 });
  });
});
