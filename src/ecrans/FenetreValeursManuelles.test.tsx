import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import FenetreValeursManuelles from "./FenetreValeursManuelles";

const releves = [
  { cle: "cca:39", libelle: "CCA-Bank — Akwa (39)", veille: 42_000_000 },
  { cle: "afriland:65", libelle: "Afriland — Lori", veille: null },
];

describe("FenetreValeursManuelles : relevés absents", () => {
  it("passer ou champ vide conserve la veille (aucune valeur saisie)", () => {
    const onConfirmer = vi.fn();
    render(
      <FenetreValeursManuelles champs={[]} relevesManquants={releves} onAnnuler={() => {}} onConfirmer={onConfirmer} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Passer" }));
    expect(onConfirmer).toHaveBeenLastCalledWith({}, {});
  });

  it("transmet le solde du jour saisi, et seulement celui-là", () => {
    const onConfirmer = vi.fn();
    render(
      <FenetreValeursManuelles champs={[]} relevesManquants={releves} onAnnuler={() => {}} onConfirmer={onConfirmer} />,
    );
    fireEvent.change(screen.getByLabelText(/CCA-Bank — Akwa/), { target: { value: "40 000 000" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmer et générer" }));
    expect(onConfirmer).toHaveBeenLastCalledWith({}, { "cca:39": 40_000_000 });
  });

  it("affiche la veille quand elle est connue", () => {
    render(
      <FenetreValeursManuelles champs={[]} relevesManquants={releves} onAnnuler={() => {}} onConfirmer={() => {}} />,
    );
    expect(screen.getByText(/veille : 42 000 000 FCFA/)).toBeInTheDocument();
    expect(screen.getByText(/aucune valeur de la veille connue/)).toBeInTheDocument();
  });
});
