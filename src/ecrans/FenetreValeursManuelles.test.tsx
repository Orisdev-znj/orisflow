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
    expect(screen.getByText(/la valeur de la veille \(42.000.000 FCFA\) est conservée/)).toBeInTheDocument();
    expect(screen.getByText("Vide : la valeur de la veille est conservée.")).toBeInTheDocument();
  });
});

describe("FenetreValeursManuelles : saisie des montants (audit du 09/10/2026)", () => {
  it.each([
    ["1 234 567,50", 1_234_567.5],
    ["1.234.567", 1_234_567],
    ["2 500 000 FCFA", 2_500_000],
    ["2 500 000", 2_500_000],
  ])("« %s » est compris comme %d", (texte, attendu) => {
    const onConfirmer = vi.fn();
    render(
      <FenetreValeursManuelles champs={["ecobank"]} relevesManquants={[]} onAnnuler={() => {}} onConfirmer={onConfirmer} />,
    );
    fireEvent.change(screen.getByLabelText("Ecobank"), { target: { value: texte } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmer et générer" }));
    expect(onConfirmer).toHaveBeenLastCalledWith({ ecobank: attendu }, {});
  });

  it("un montant illisible est signalé et bloque la génération, au lieu d'être ignoré", () => {
    const onConfirmer = vi.fn();
    render(
      <FenetreValeursManuelles champs={["ecobank"]} relevesManquants={[]} onAnnuler={() => {}} onConfirmer={onConfirmer} />,
    );
    fireEvent.change(screen.getByLabelText("Ecobank"), { target: { value: "deux millions" } });
    expect(screen.getByText(/Montant non reconnu/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmer et générer" })).toBeDisabled();
    expect(onConfirmer).not.toHaveBeenCalled();
  });

  it("rappelle la valeur de la veille d'un champ manuel", () => {
    render(
      <FenetreValeursManuelles
        champs={["ecobank"]}
        relevesManquants={[]}
        valeursVeille={{ ecobank: 20_000_000 }}
        onAnnuler={() => {}}
        onConfirmer={() => {}}
      />,
    );
    expect(screen.getByText(/veille \(20.000.000 FCFA\)/)).toBeInTheDocument();
  });

  it("Échap ferme la fenêtre", () => {
    const onAnnuler = vi.fn();
    render(<FenetreValeursManuelles champs={["ecobank"]} relevesManquants={[]} onAnnuler={onAnnuler} onConfirmer={() => {}} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onAnnuler).toHaveBeenCalled();
  });
});
