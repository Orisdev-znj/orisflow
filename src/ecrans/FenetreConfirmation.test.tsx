import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import FenetreConfirmation from "./FenetreConfirmation";

function afficher() {
  const onConfirmer = vi.fn();
  const onAnnuler = vi.fn();
  render(
    <FenetreConfirmation
      titre="Retirer tous les fichiers ?"
      message="3 fichiers seront retirés de la liste."
      libelleConfirmer="Tout retirer"
      onConfirmer={onConfirmer}
      onAnnuler={onAnnuler}
    />,
  );
  return { onConfirmer, onAnnuler };
}

describe("FenetreConfirmation", () => {
  it("est une boîte d'alerte avec son titre et son message", () => {
    afficher();
    const dialogue = screen.getByRole("alertdialog", { name: "Retirer tous les fichiers ?" });
    expect(dialogue).toHaveAccessibleDescription("3 fichiers seront retirés de la liste.");
  });

  it("« Annuler » appelle onAnnuler, jamais onConfirmer", async () => {
    const { onConfirmer, onAnnuler } = afficher();
    await userEvent.setup().click(screen.getByRole("button", { name: "Annuler" }));
    expect(onAnnuler).toHaveBeenCalledTimes(1);
    expect(onConfirmer).not.toHaveBeenCalled();
  });

  it("le bouton de confirmation appelle onConfirmer", async () => {
    const { onConfirmer, onAnnuler } = afficher();
    await userEvent.setup().click(screen.getByRole("button", { name: "Tout retirer" }));
    expect(onConfirmer).toHaveBeenCalledTimes(1);
    expect(onAnnuler).not.toHaveBeenCalled();
  });

  it("Échap annule", async () => {
    const { onConfirmer, onAnnuler } = afficher();
    await userEvent.setup().keyboard("{Escape}");
    expect(onAnnuler).toHaveBeenCalledTimes(1);
    expect(onConfirmer).not.toHaveBeenCalled();
  });

  it("le focus initial est sur le choix sûr, « Annuler »", () => {
    afficher();
    expect(screen.getByRole("button", { name: "Annuler" })).toHaveFocus();
  });
});
