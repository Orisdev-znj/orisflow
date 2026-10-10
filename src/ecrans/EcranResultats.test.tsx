import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import EcranResultats from "./EcranResultats";
import type { EtatGeneration, FichierClasse, ResultatClassement } from "../lib/types";

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
        dateClasseur="2026-10-08"
        onDateChange={() => undefined}
        dateUtilisable
      />,
    );

    await utilisateur.click(screen.getByRole("button", { name: "Copier le rapport d'analyse" }));

    expect(await screen.findByText("Copié dans le presse-papiers.")).toBeInTheDocument();
    // La confirmation est dans une zone d'annonce (role="status") présente dès le départ.
    const zones = screen.getAllByRole("status");
    expect(zones.some((z) => z.textContent === "Copié dans le presse-papiers.")).toBe(true);
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
        dateClasseur="2026-10-08"
        onDateChange={() => undefined}
        dateUtilisable
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
        dateClasseur="2026-10-08"
        onDateChange={() => undefined}
        dateUtilisable
      />,
    );

    const resume = screen.getByText("2 remarques");
    expect(resume.closest("details")).not.toBeNull();
    expect(resume.closest("details")).not.toHaveAttribute("open");
  });
});

describe("Lisibilité des résultats (audit du 09/10/2026)", () => {
  const afficher = (fichiers: FichierClasse[], generation: EtatGeneration = { etat: "attente" }) =>
    render(
      <EcranResultats
        resultat={resultat(fichiers)}
        generation={generation}
        fichiersExclus={new Set()}
        onBasculerFichier={() => undefined}
        onRetourImport={() => undefined}
        onGenerer={() => undefined}
        dateClasseur="2026-10-08"
        onDateChange={() => undefined}
        dateUtilisable
      />,
    );

  it("les doublons sont regroupés à part, en gris, et ne comptent pas comme des rejets", () => {
    afficher([
      fichier({ nom: "Akwa_Compte.xlsx", chemin: "C:/a/Akwa_Compte.xlsx" }),
      fichier({ nom: "Akwa_bis.xlsx", chemin: "C:/a/Akwa_bis.xlsx", niveau: "bloquant", est_doublon: true }),
    ]);

    const sectionDoublons = screen.getByText(/1 doublon\(s\) ignoré\(s\) automatiquement/).closest("details")!;
    expect(within(sectionDoublons).getByText("Akwa_bis.xlsx")).toBeInTheDocument();
    expect(within(sectionDoublons).getByText("Ignoré (doublon)")).toHaveClass("badge--doublon");
    const resume = screen.getByRole("list", { name: "Résumé de l'analyse" });
    expect(within(resume).getByText("Rejetés").previousSibling).toHaveTextContent("0");
    expect(within(resume).getByText("Doublons ignorés").previousSibling).toHaveTextContent("1");
  });

  it("les fichiers à traiter apparaissent en tête du tableau", () => {
    afficher([
      fichier({ nom: "conforme.xlsx", chemin: "C:/a/1" }),
      fichier({ nom: "rejete.xlsx", chemin: "C:/a/2", niveau: "bloquant", messages: ["Conflit."] }),
      fichier({ nom: "a_verifier.xlsx", chemin: "C:/a/3", niveau: "avertissement" }),
    ]);

    // Seules les lignes de fichiers ont une case « utiliser pour la génération ».
    const noms = screen
      .getAllByRole("row")
      .filter((ligne) => within(ligne).queryByRole("checkbox"))
      .map((ligne) => (ligne as HTMLTableRowElement).cells[1].textContent);
    expect(noms).toEqual(["rejete.xlsx", "a_verifier.xlsx", "conforme.xlsx"]);
  });

  it("après génération : ouvrir le classeur, caisses mises à jour et récapitulatif des montants", async () => {
    const ouvrirResultat = vi.fn().mockResolvedValue({ ok: true });
    window.orisflow = { ouvrirResultat } as unknown as typeof window.orisflow;
    const utilisateur = userEvent.setup();
    afficher([fichier()], {
      etat: "succes",
      resultat: {
        type: "resultat",
        commande: "generer",
        version: "1.1.0",
        ok: true,
        chemin_genere: "C:/Orisflow/Resultats/TRESORERIE.xlsx",
        date: "2026-10-08",
        modele_utilise: "C:/ref/x.xlsx",
        chemin_reference_mis_a_jour: null,
        agences_mises_a_jour: ["Akwa"],
        agences_balance_mises_a_jour: ["Akwa"],
        agences_banques_mises_a_jour: [],
        agences_caisses_mises_a_jour: ["Akwa", "PK14"],
        avertissements_banques: ["Ecobank : ligne inchangée depuis la veille."],
        avertissements_modele: [],
        agences_non_mises_a_jour: [],
        fichiers_ignores: [],
        doublons_ignores: [],
        recapitulatif_agences: [{ agence: "Akwa", depots: 2_978_331_528, caisse: 61_170_275 }],
        recapitulatif_banques: [],
        classement: resultat([]),
      },
    });

    expect(screen.getByText((_, el) => el?.tagName === "LI" && el.textContent === "Caisses : Akwa, PK14")).toBeInTheDocument();
    expect(screen.getByText(/2.978.331.528/)).toBeInTheDocument();
    expect(screen.getByText(/1 ligne\(s\) gardent la valeur de la veille/)).toBeInTheDocument();
    await utilisateur.click(screen.getByRole("button", { name: "Ouvrir le classeur" }));
    expect(ouvrirResultat).toHaveBeenCalledWith("C:/Orisflow/Resultats/TRESORERIE.xlsx", "fichier");
  });

  it("pendant la génération : étape en cours et bouton Annuler", () => {
    afficher([fichier()], { etat: "encours", etape: "Écriture des banques et des caisses…" });
    expect(screen.getByText("Écriture des banques et des caisses…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Annuler" })).toBeInTheDocument();
  });
});

describe("Accès rapide à la génération (UI/UX 2.3, 10/10/2026)", () => {
  const afficher = (fichiers: FichierClasse[], exclus: string[] = []) =>
    render(
      <EcranResultats
        resultat={resultat(fichiers)}
        generation={{ etat: "attente" }}
        fichiersExclus={new Set(exclus)}
        onBasculerFichier={() => undefined}
        onRetourImport={() => undefined}
        onGenerer={() => undefined}
        dateClasseur="2026-10-08"
        onDateChange={() => undefined}
        dateUtilisable
      />,
    );

  it("rappelle en haut le nombre de fichiers retenus et la date, avec un lien vers la génération", () => {
    afficher([fichier({ chemin: "C:/a/1" }), fichier({ nom: "Mokolo.xlsx", chemin: "C:/a/2" })]);

    expect(screen.getByText(/Prêt à générer/)).toHaveTextContent("2 fichier(s) retenu(s), classeur du 08/10/2026");
    expect(screen.getByRole("button", { name: "Aller à la génération" })).toBeInTheDocument();
  });

  it("le lien place le focus sur le titre « Générer le classeur de trésorerie »", async () => {
    afficher([fichier()]);

    await userEvent.setup().click(screen.getByRole("button", { name: "Aller à la génération" }));

    expect(screen.getByRole("heading", { name: /Générer le classeur de trésorerie/ })).toHaveFocus();
  });

  it("si tous les fichiers sont décochés, le rappel n'apparaît pas", () => {
    afficher([fichier({ chemin: "C:/a/1" })], ["C:/a/1"]);

    expect(screen.queryByText(/Prêt à générer/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aller à la génération" })).not.toBeInTheDocument();
  });

  it("ne compte pas les doublons ni les fichiers rejetés comme « retenus »", () => {
    afficher([
      fichier({ chemin: "C:/a/1" }),
      fichier({ nom: "bis.xlsx", chemin: "C:/a/2", est_doublon: true }),
      fichier({ nom: "rejete.xlsx", chemin: "C:/a/3", niveau: "bloquant" }),
    ]);

    expect(screen.getByText(/Prêt à générer/)).toHaveTextContent("1 fichier(s) retenu(s)");
  });
});
