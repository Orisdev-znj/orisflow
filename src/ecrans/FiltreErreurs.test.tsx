import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FiltreErreurs from "./FiltreErreurs";

function Bombe(): never {
  throw new Error("donnée inattendue");
}

describe("FiltreErreurs", () => {
  beforeEach(() => {
    // React journalise volontairement les erreurs d'affichage : on évite de polluer la sortie.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("affiche normalement un enfant sans erreur", () => {
    render(
      <FiltreErreurs onAccueil={vi.fn()}>
        <p>Écran normal</p>
      </FiltreErreurs>,
    );
    expect(screen.getByText("Écran normal")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("remplace un écran qui plante par un message clair", () => {
    render(
      <FiltreErreurs onAccueil={vi.fn()}>
        <Bombe />
      </FiltreErreurs>,
    );
    const alerte = screen.getByRole("alert");
    expect(alerte).toHaveTextContent("Un écran d'Orisflow a rencontré une erreur");
    expect(alerte).toHaveTextContent("Vos fichiers n'ont pas été modifiés");
  });

  it("« Revenir à l'accueil » appelle onAccueil", async () => {
    const onAccueil = vi.fn();
    render(
      <FiltreErreurs onAccueil={onAccueil}>
        <Bombe />
      </FiltreErreurs>,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Revenir à l'accueil" }));
    expect(onAccueil).toHaveBeenCalledTimes(1);
  });

  it("copie le détail de l'erreur dans le presse-papiers", async () => {
    const utilisateur = userEvent.setup();
    const ecrire = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: ecrire }, configurable: true });
    render(
      <FiltreErreurs onAccueil={vi.fn()}>
        <Bombe />
      </FiltreErreurs>,
    );

    await utilisateur.click(screen.getByRole("button", { name: "Copier le détail de l'erreur" }));

    expect(ecrire).toHaveBeenCalledWith(expect.stringContaining("donnée inattendue"));
    expect(await screen.findByText("Détail copié.")).toBeInTheDocument();
  });
});
