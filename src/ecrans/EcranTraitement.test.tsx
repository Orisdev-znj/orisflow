import { render, screen } from "@testing-library/react";
import EcranTraitement from "./EcranTraitement";

describe("Analyse : pourcentage et journal (03/10/2026)", () => {
  it("affiche le pourcentage d'avancement et le journal des étapes", () => {
    render(
      <EcranTraitement
        traitement={{
          etat: "encours",
          courant: 1,
          total: 2,
          pourcentage: 50,
          fichier: "Akwa_Compte.xls",
          journal: ["Akwa_Compte.xls : Liste de comptes — agence Akwa."],
        }}
        onRetourImport={() => undefined}
        onRelancer={() => undefined}
      />,
    );

    expect(screen.getByText("50 %")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Avancement de l'analyse" })).toHaveAttribute("value", "50");
    expect(screen.getByText("Akwa_Compte.xls : Liste de comptes — agence Akwa.")).toBeInTheDocument();
  });
});
