import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import EcranResultats from "./EcranResultats";
import type { FichierClasse, ResultatClassement } from "../lib/types";

function fichier(partiel: Partial<FichierClasse> = {}): FichierClasse {
  return {
    nom: "Akwa_Compte.xlsx",
    chemin: "C:\\Orisflow\\Imports\\Akwa_Compte.xlsx",
    extension: ".xlsx",
    type_detecte: "compte",
    type_libelle: "Liste de comptes",
    agence_detectee: "akwa",
    agence_libelle: "Akwa",
    confiance_agence: "nom",
    numero_compte_pdf: null,
    total_comptes: 123,
    doublons: [],
    mal_formes: [],
    depots: null,
    engagements: null,
    caisse: null,
    cle_rib: null,
    code_client: null,
    solde_releve: null,
    ligne_banque_cible: null,
    niveau: "information",
    messages: [],
    ...partiel,
  };
}

function resultat(fichiers: FichierClasse[]): ResultatClassement {
  return {
    type: "resultat",
    commande: "classer",
    ok: true,
    version: "0.1.0",
    total: fichiers.length,
    fichiers,
    reference: { disponible: true, chemin: "C:\\ref\\... 09 10 2026.xlsx", date: "2026-10-09" },
    champs_manuels_requis: [],
    releves_manquants: [],
    journal_etapes: ["1 agence confirmée manuellement."],
  };
}

describe("Rapport d'analyse copiable et téléchargeable (10/10/2026)", () => {
  it("copie le rapport dans le presse-papiers au clic", async () => {
    const utilisateur = userEvent.setup();

    render(
      <EcranResultats
        resultat={resultat([fichier()])}
        generation={{ etat: "attente" }}
        fichiersExclus={new Set()}
        onBasculerFichier={() => undefined}
        onRetourImport={() => undefined}
        onGenerer={() => undefined}
      />,
    );

    await utilisateur.click(screen.getByRole("button", { name: "Copier le rapport d'analyse" }));

    expect(await screen.findByText("Copié dans le presse-papiers.")).toBeInTheDocument();
  });

  it("télécharge le rapport en Excel via le moteur et affiche l'emplacement enregistré", async () => {
    const exporterRapport = vi.fn().mockResolvedValue({ ok: true, chemin: "C:\\Orisflow\\Resultats\\Rapport.xlsx" });
    window.orisflow = { exporterRapport } as unknown as typeof window.orisflow;
    const utilisateur = userEvent.setup();

    render(
      <EcranResultats
        resultat={resultat([fichier()])}
        generation={{ etat: "attente" }}
        fichiersExclus={new Set()}
        onBasculerFichier={() => undefined}
        onRetourImport={() => undefined}
        onGenerer={() => undefined}
      />,
    );

    await utilisateur.click(screen.getByRole("button", { name: "Télécharger le rapport (Excel)" }));

    await waitFor(() => expect(exporterRapport).toHaveBeenCalledTimes(1));
    expect(exporterRapport).toHaveBeenCalledWith([fichier()], ["1 agence confirmée manuellement."]);
    expect(await screen.findByText(/Rapport\.xlsx/)).toBeInTheDocument();
  });

  it("plusieurs remarques sont repliées sous un résumé cliquable", () => {
    render(
      <EcranResultats
        resultat={resultat([
          fichier({
            niveau: "bloquant",
            messages: ["Première remarque.", "Deuxième remarque."],
          }),
        ])}
        generation={{ etat: "attente" }}
        fichiersExclus={new Set()}
        onBasculerFichier={() => undefined}
        onRetourImport={() => undefined}
        onGenerer={() => undefined}
      />,
    );

    const resume = screen.getByText("2 remarques");
    expect(resume.closest("details")).not.toBeNull();
    expect(resume.closest("details")).not.toHaveAttribute("open");
  });
});
