import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import FenetreValeursManuelles from "./FenetreValeursManuelles";

describe("FenetreValeursManuelles : relevés absents", () => {
  it("ne reprend la veille que si l'utilisateur coche explicitement la case", () => {
    const onConfirmer = vi.fn();
    render(
      <FenetreValeursManuelles
        champs={[]}
        relevesManquants={[
          { cle: "cca:39", libelle: "CCA-Bank — Akwa (39)", veille: 42_000_000 },
          { cle: "afriland:65", libelle: "Afriland — Lori", veille: null },
        ]}
        onAnnuler={() => {}}
        onConfirmer={onConfirmer}
      />,
    );

    expect(screen.getByText(/aucune valeur de la veille connue/)).toBeInTheDocument();
    const dialogue = screen.getByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Confirmer et générer" }));
    expect(onConfirmer).toHaveBeenLastCalledWith({}, {});

    fireEvent.click(screen.getByRole("checkbox", { name: /utiliser la valeur de la veille/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmer et générer" }));
    expect(onConfirmer).toHaveBeenLastCalledWith({}, { "cca:39": 42_000_000 });
    expect(dialogue).toBeInTheDocument();
  });
});
