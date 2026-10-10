import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FichierImporte } from "../lib/types";
import EcranImport from "./EcranImport";

const fichier = (nom: string): FichierImporte => ({ chemin: `C:\\Imports\\${nom}`, nom, taille: 1200 });

function afficher(fichiers: FichierImporte[]) {
  const onVider = vi.fn();
  render(
    <EcranImport
      fichiers={fichiers}
      onAjouter={vi.fn()}
      onRetirer={vi.fn()}
      onVider={onVider}
      onLancer={vi.fn()}
      dateClasseur="2026-10-09"
      onDateChange={vi.fn()}
      dateUtilisable
    />,
  );
  return { onVider };
}

describe("EcranImport : « Tout retirer »", () => {
  it("avec plusieurs fichiers, demande confirmation et n'efface rien avant", async () => {
    const { onVider } = afficher([fichier("a.xls"), fichier("b.xls"), fichier("c.xls")]);
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole("button", { name: "Tout retirer" }));

    expect(screen.getByRole("alertdialog", { name: "Retirer tous les fichiers ?" })).toBeInTheDocument();
    expect(screen.getByText(/3 fichiers seront retirés de la liste d'import/)).toBeInTheDocument();
    expect(screen.getByText(/ils restent à leur place sur le disque/)).toBeInTheDocument();
    expect(onVider).not.toHaveBeenCalled();
  });

  it("confirmer vide la liste une seule fois et ferme la fenêtre", async () => {
    const { onVider } = afficher([fichier("a.xls"), fichier("b.xls")]);
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole("button", { name: "Tout retirer" }));
    await utilisateur.click(within_dialogue("Tout retirer"));

    expect(onVider).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("annuler garde la liste", async () => {
    const { onVider } = afficher([fichier("a.xls"), fichier("b.xls")]);
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole("button", { name: "Tout retirer" }));
    await utilisateur.click(screen.getByRole("button", { name: "Annuler" }));

    expect(onVider).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("avec un seul fichier, vide directement sans fenêtre", async () => {
    const { onVider } = afficher([fichier("a.xls")]);

    await userEvent.setup().click(screen.getByRole("button", { name: "Tout retirer" }));

    expect(onVider).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});

// Le bouton de confirmation porte le même libellé que celui de la page : on prend celui de la fenêtre.
function within_dialogue(libelle: string): HTMLElement {
  const dialogue = screen.getByRole("alertdialog");
  const bouton = Array.from(dialogue.querySelectorAll("button")).find((b) => b.textContent === libelle);
  if (!bouton) throw new Error(`Bouton « ${libelle} » introuvable dans la fenêtre`);
  return bouton;
}
