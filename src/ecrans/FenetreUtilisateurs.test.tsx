import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import FenetreUtilisateurs from "./FenetreUtilisateurs";

const UTILISATEUR = { identifiant: "adminorisflow", nomAffiche: "Admin", role: "admin" as const, creeLe: "x" };

describe("FenetreUtilisateurs", () => {
  it("liste les utilisateurs existants au chargement", async () => {
    window.orisflow = {
      listerUtilisateurs: vi.fn(async () => ({ ok: true, utilisateurs: [UTILISATEUR] })),
    } as unknown as typeof window.orisflow;

    render(<FenetreUtilisateurs onFermer={vi.fn()} />);

    expect(await screen.findByText("adminorisflow")).toBeInTheDocument();
  });

  it("crée un utilisateur puis recharge la liste", async () => {
    const creerUtilisateur = vi.fn(async () => ({ ok: true, utilisateur: UTILISATEUR }));
    const listerUtilisateurs = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, utilisateurs: [] })
      .mockResolvedValueOnce({ ok: true, utilisateurs: [{ ...UTILISATEUR, identifiant: "julien", nomAffiche: "Julien" }] });
    window.orisflow = { listerUtilisateurs, creerUtilisateur } as unknown as typeof window.orisflow;
    const utilisateur = userEvent.setup();

    render(<FenetreUtilisateurs onFermer={vi.fn()} />);
    await screen.findByText("Créer un utilisateur");

    await utilisateur.type(screen.getByLabelText("Identifiant"), "julien");
    await utilisateur.type(screen.getByLabelText(/Mot de passe \(au moins/), "UnMotDePasseSolide1");
    await utilisateur.click(screen.getByRole("button", { name: "Créer l'utilisateur" }));

    expect(creerUtilisateur).toHaveBeenCalledWith({
      identifiant: "julien",
      motDePasse: "UnMotDePasseSolide1",
      nomAffiche: "julien",
      role: "utilisateur",
    });
    expect(await screen.findByText("julien")).toBeInTheDocument();
  });

  it("affiche l'erreur renvoyée par le moteur si la création échoue", async () => {
    window.orisflow = {
      listerUtilisateurs: vi.fn(async () => ({ ok: true, utilisateurs: [] })),
      creerUtilisateur: vi.fn(async () => ({ ok: false, erreur: "Cet identifiant est déjà utilisé." })),
    } as unknown as typeof window.orisflow;
    const utilisateur = userEvent.setup();

    render(<FenetreUtilisateurs onFermer={vi.fn()} />);
    await screen.findByText("Créer un utilisateur");
    await utilisateur.type(screen.getByLabelText("Identifiant"), "julien");
    await utilisateur.type(screen.getByLabelText(/Mot de passe \(au moins/), "UnMotDePasseSolide1");
    await utilisateur.click(screen.getByRole("button", { name: "Créer l'utilisateur" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Cet identifiant est déjà utilisé.");
  });

  it("supprime un utilisateur", async () => {
    const supprimerUtilisateur = vi.fn(async () => ({ ok: true }));
    window.orisflow = {
      listerUtilisateurs: vi.fn(async () => ({ ok: true, utilisateurs: [UTILISATEUR] })),
      supprimerUtilisateur,
    } as unknown as typeof window.orisflow;
    const utilisateur = userEvent.setup();

    render(<FenetreUtilisateurs onFermer={vi.fn()} />);
    await screen.findByText("adminorisflow");
    await utilisateur.click(screen.getByRole("button", { name: "Supprimer" }));

    expect(supprimerUtilisateur).toHaveBeenCalledWith("adminorisflow");
  });
});
