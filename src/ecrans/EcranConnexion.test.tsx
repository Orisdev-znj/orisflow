import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import EcranConnexion from "./EcranConnexion";

describe("EcranConnexion", () => {
  it("premier lancement : crée le compte administrateur et transmet l'utilisateur créé", async () => {
    const utilisateurCree = { identifiant: "adminorisflow", nomAffiche: "Admin", role: "admin" as const, creeLe: "x" };
    const creerCompteInitial = vi.fn(async () => ({ ok: true, utilisateur: utilisateurCree }));
    window.orisflow = { creerCompteInitial } as unknown as typeof window.orisflow;
    const onConnecte = vi.fn();
    const utilisateur = userEvent.setup();

    render(<EcranConnexion etat={{ premierLancement: true, utilisateurConnecte: null }} onConnecte={onConnecte} />);

    expect(screen.getByRole("heading", { name: "Créer le compte administrateur" })).toBeInTheDocument();
    await utilisateur.type(screen.getByLabelText("Identifiant"), "adminorisflow");
    await utilisateur.type(screen.getByLabelText("Mot de passe"), "UnMotDePasseSolide1");
    await utilisateur.type(screen.getByLabelText("Confirmer le mot de passe"), "UnMotDePasseSolide1");
    await utilisateur.click(screen.getByRole("button", { name: "Créer le compte" }));

    expect(creerCompteInitial).toHaveBeenCalledWith({
      identifiant: "adminorisflow",
      motDePasse: "UnMotDePasseSolide1",
      nomAffiche: "adminorisflow",
    });
    expect(onConnecte).toHaveBeenCalledWith(utilisateurCree);
  });

  it("premier lancement : deux mots de passe différents sont refusés sans appeler l'application", async () => {
    const creerCompteInitial = vi.fn();
    window.orisflow = { creerCompteInitial } as unknown as typeof window.orisflow;
    const utilisateur = userEvent.setup();

    render(<EcranConnexion etat={{ premierLancement: true, utilisateurConnecte: null }} onConnecte={vi.fn()} />);

    await utilisateur.type(screen.getByLabelText("Identifiant"), "adminorisflow");
    await utilisateur.type(screen.getByLabelText("Mot de passe"), "UnMotDePasseSolide1");
    await utilisateur.type(screen.getByLabelText("Confirmer le mot de passe"), "AutreChose1");
    await utilisateur.click(screen.getByRole("button", { name: "Créer le compte" }));

    expect(screen.getByRole("alert")).toHaveTextContent("ne correspondent pas");
    expect(creerCompteInitial).not.toHaveBeenCalled();
  });

  it("connexion normale : identifiant ou mot de passe incorrect affiche le message renvoyé", async () => {
    const connecter = vi.fn(async () => ({ ok: false, erreur: "Identifiant ou mot de passe incorrect." }));
    window.orisflow = { connecter } as unknown as typeof window.orisflow;
    const utilisateur = userEvent.setup();

    render(<EcranConnexion etat={{ premierLancement: false, utilisateurConnecte: null }} onConnecte={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Connexion à Orisflow" })).toBeInTheDocument();
    // Pas de champ de confirmation ni de nom affiché en dehors du premier lancement.
    expect(screen.queryByLabelText("Confirmer le mot de passe")).not.toBeInTheDocument();

    await utilisateur.type(screen.getByLabelText("Identifiant"), "arnold");
    await utilisateur.type(screen.getByLabelText("Mot de passe"), "mauvais");
    await utilisateur.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Identifiant ou mot de passe incorrect.");
    expect(connecter).toHaveBeenCalledWith("arnold", "mauvais");
  });

  it("connexion réussie : transmet l'utilisateur connecté", async () => {
    const utilisateurConnecte = { identifiant: "arnold", nomAffiche: "Arnold", role: "admin" as const, creeLe: "x" };
    window.orisflow = {
      connecter: vi.fn(async () => ({ ok: true, utilisateur: utilisateurConnecte })),
    } as unknown as typeof window.orisflow;
    const onConnecte = vi.fn();
    const utilisateur = userEvent.setup();

    render(<EcranConnexion etat={{ premierLancement: false, utilisateurConnecte: null }} onConnecte={onConnecte} />);
    await utilisateur.type(screen.getByLabelText("Identifiant"), "arnold");
    await utilisateur.type(screen.getByLabelText("Mot de passe"), "UnMotDePasseSolide1");
    await utilisateur.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(onConnecte).toHaveBeenCalledWith(utilisateurConnecte);
  });

  it("sans pont Electron, affiche un message clair plutôt que de rien faire", () => {
    window.orisflow = undefined as unknown as typeof window.orisflow;
    render(<EcranConnexion etat={{ premierLancement: false, utilisateurConnecte: null }} onConnecte={vi.fn()} />);
    fireEvent.submit(screen.getByRole("button", { name: "Se connecter" }).closest("form")!);
    expect(screen.getByRole("alert")).toHaveTextContent("disponible que dans l'application Orisflow");
  });
});
