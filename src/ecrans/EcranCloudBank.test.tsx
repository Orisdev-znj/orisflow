import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CAS_USAGE, nomConforme, traduireAvertissement } from "../lib/cloudbankCas";
import type { ApiOrisflow, ResultatEcritureCloudBank, ResultatImportMapping } from "../lib/types";
import EcranCloudBank from "./EcranCloudBank";

const FICHIER = { chemin: "C:/x/MAPPING A VALIDER - MOKOLO - Septembre 2026.xlsx", nom: "MAPPING A VALIDER - MOKOLO - Septembre 2026.xlsx", taille: 9000 };

function ligne(id: number, statut: "valide" | "a_confirmer" | "non_trouve", extra = {}) {
  return {
    id, libelle: `Dépense ${id}`, montant: 1000 * (id + 1),
    compte: statut === "non_trouve" ? null : "6522000000001", compte_reel: statut === "non_trouve" ? null : "6522000000001",
    intitule: statut === "non_trouve" ? null : "Transports", statut,
    source: statut === "a_confirmer" ? "règle par mots-clés : Transport" : null, commentaire: null,
    sens: "debit" as const, avertissement: null, avertissement_agence: null, suggestions: null, ...extra,
  };
}

const IMPORT: ResultatImportMapping = {
  contexte: { conforme: true, agence: "20000", agence_nom: "MOKOLO", mois: "Septembre", annee: "2026" },
  lignes: [ligne(0, "valide"), ligne(1, "a_confirmer"), ligne(2, "non_trouve")],
  resume: { valide: 1, a_confirmer: 1, non_trouve: 1 },
  total: 6000,
};

const RESULTAT: ResultatEcritureCloudBank = {
  fichier: "C:/Doc/Orisflow/Resultats/CloudBank/ECRITURE PETITE CAISSE A TELEVERSER - MOKOLO - Septembre 2026.xlsx",
  feuilles: [{ feuille: "ECRITURE PAIE DG", lignes: 4, total_debit: 6000, total_credit: 6000, ecart: 0 }],
  avertissements: [
    "ligne 2 (6522000000001) : PROVISION vide, valeur par défaut 1 appliquée",
    "ligne 1 : compte 6522000000001 non confirmé pour l'agence 20000 (seul le Siège, 10000, est garanti) : le code générique est utilisé",
  ],
};

function api(surcharges: Partial<ApiOrisflow> = {}) {
  window.orisflow = {
    cloudbankChoisirFichier: vi.fn(async () => FICHIER),
    cloudbankImporterMapping: vi.fn(async () => IMPORT),
    cloudbankRechercher: vi.fn(async () => ({ pcemf: [], cloudbank: [{ code: "6523600000201", intitule: "Entretien et réparations" }] })),
    cloudbankConfirmerLigne: vi.fn(async (d: { compte: string }) => ({ compte: d.compte, intitule: "Entretien et réparations", connu: true, enregistre: false })),
    cloudbankEcrire: vi.fn(async () => RESULTAT),
    cloudbankDeposer: vi.fn(async () => RESULTAT),
    ouvrirResultat: vi.fn(async () => ({ ok: true })),
    ...surcharges,
  } as unknown as ApiOrisflow;
  return window.orisflow as unknown as Record<string, ReturnType<typeof vi.fn>>;
}

afterEach(() => {
  window.orisflow = undefined;
});

async function allerALImport(utilisateur: ReturnType<typeof userEvent.setup>, cas = "Petite caisse") {
  await utilisateur.click(within(screen.getByRole("heading", { name: new RegExp(cas) }).closest("article") as HTMLElement).getByRole("button", { name: "Choisir" }));
  await utilisateur.click(screen.getByRole("button", { name: /passer à l'import/ }));
}

describe("Écran 1 — cas d'usage", () => {
  it("affiche les 5 cas, puis le prompt du cas choisi avec un bouton Copier", async () => {
    api();
    const utilisateur = userEvent.setup();
    render(<EcranCloudBank />);

    expect(screen.getAllByRole("button", { name: "Choisir" })).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Importer" })).toBeDisabled();

    await utilisateur.click(within(screen.getByRole("heading", { name: /Petite caisse/ }).closest("article") as HTMLElement).getByRole("button", { name: "Choisir" }));
    expect(screen.getByLabelText("Texte à copier dans Claude")).toHaveTextContent("Téléverser sur CloudBank");
    expect(screen.getByRole("button", { name: "Copier le texte" })).toBeInTheDocument();
  });

  it("copier le prompt débloque l'onglet Importer", async () => {
    api();
    const utilisateur = userEvent.setup();
    // user-event installe son propre presse-papiers à setup() : on le remplace après.
    const ecrire = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: ecrire }, configurable: true });
    render(<EcranCloudBank />);
    await utilisateur.click(within(screen.getByRole("heading", { name: /Salaires/ }).closest("article") as HTMLElement).getByRole("button", { name: "Choisir" }));

    await utilisateur.click(screen.getByRole("button", { name: "Copier le texte" }));

    expect(ecrire).toHaveBeenCalledWith(expect.stringContaining("document de salaires"));
    expect(await screen.findByRole("heading", { name: "Importer le résultat" })).toBeInTheDocument();
  });

  it("les champs de l'extourne remplissent les crochets du prompt en direct", async () => {
    api();
    const utilisateur = userEvent.setup();
    render(<EcranCloudBank />);
    await utilisateur.click(within(screen.getByRole("heading", { name: /Extourne/ }).closest("article") as HTMLElement).getByRole("button", { name: "Choisir" }));

    await utilisateur.type(screen.getByLabelText(/Montants à extourner/), "500 vers 7200000000001");

    expect(screen.getByLabelText("Texte à copier dans Claude")).toHaveTextContent("500 vers 7200000000001");
  });
});

describe("Écran 2 — importer", () => {
  it("avertit sans bloquer quand le nom du fichier sort de la convention", async () => {
    api({ cloudbankChoisirFichier: vi.fn(async () => ({ chemin: "C:/x/mon fichier.xlsx", nom: "mon fichier.xlsx", taille: 100 })) });
    const utilisateur = userEvent.setup();
    render(<EcranCloudBank />);
    await allerALImport(utilisateur);

    await utilisateur.click(screen.getByRole("button", { name: "Choisir le fichier…" }));

    expect(await screen.findByText(/ne ressemble pas à/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Valider l'import" })).toBeEnabled();
  });

  it("une erreur de lecture s'affiche en français, sans trace technique", async () => {
    api({ cloudbankImporterMapping: vi.fn(async () => { throw new Error("Error invoking remote method 'cloudbank:importerMapping': Error: Ce fichier ne correspond pas au format attendu : les colonnes COMPTE PROPOSE sont introuvables.\n    at pile"); }) });
    const utilisateur = userEvent.setup();
    render(<EcranCloudBank />);
    await allerALImport(utilisateur);
    await utilisateur.click(screen.getByRole("button", { name: "Choisir le fichier…" }));
    await utilisateur.click(await screen.findByRole("button", { name: "Valider l'import" }));

    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent("Ce fichier ne correspond pas au format attendu");
    expect(alerte).not.toHaveTextContent("Error invoking");
    expect(alerte).not.toHaveTextContent("at pile");
  });

  it("un cas « fichier final » (extraire) dépose le fichier et mène aux résultats", async () => {
    const mock = api();
    const utilisateur = userEvent.setup();
    render(<EcranCloudBank />);
    await allerALImport(utilisateur, "Extraire");
    await utilisateur.click(screen.getByRole("button", { name: "Choisir le fichier…" }));
    await utilisateur.click(await screen.findByRole("button", { name: "Valider l'import" }));

    expect(await screen.findByRole("heading", { name: "Résultats" })).toBeInTheDocument();
    expect(mock.cloudbankDeposer).toHaveBeenCalledWith(FICHIER.chemin);
    expect(mock.cloudbankImporterMapping).not.toHaveBeenCalled();
  });
});

async function allerAuMapping(utilisateur: ReturnType<typeof userEvent.setup>) {
  await allerALImport(utilisateur);
  await utilisateur.click(screen.getByRole("button", { name: "Choisir le fichier…" }));
  await utilisateur.click(await screen.findByRole("button", { name: "Valider l'import" }));
  await screen.findByRole("heading", { name: "Confirmer le mapping" });
}

describe("Écran 3 — confirmer le mapping", () => {
  it("affiche le résumé par statut et empêche de générer tant que tout n'est pas traité", async () => {
    api();
    const utilisateur = userEvent.setup();
    render(<EcranCloudBank />);
    await allerAuMapping(utilisateur);

    const resume = screen.getByRole("list", { name: "Résumé du mapping" });
    expect(within(resume).getByText("✓ validées").previousSibling).toHaveTextContent("1");
    expect(within(resume).getByText("⚠ à confirmer").previousSibling).toHaveTextContent("1");
    expect(within(resume).getByText("✕ non trouvées").previousSibling).toHaveTextContent("1");
    expect(screen.getByText(/règle par mots-clés : Transport/)).toBeInTheDocument(); // la source est toujours affichée
    expect(screen.getByRole("button", { name: "Générer le fichier" })).toBeDisabled();
  });

  it("« Tout confirmer » ne valide jamais une ligne non trouvée", async () => {
    api();
    const utilisateur = userEvent.setup();
    render(<EcranCloudBank />);
    await allerAuMapping(utilisateur);

    await utilisateur.click(screen.getByRole("button", { name: /Tout confirmer/ }));

    const resume = screen.getByRole("list", { name: "Résumé du mapping" });
    expect(within(resume).getByText("✓ validées").previousSibling).toHaveTextContent("2");
    expect(within(resume).getByText("✕ non trouvées").previousSibling).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: "Générer le fichier" })).toBeDisabled();
  });

  it("chercher un compte dans la liste, puis générer avec le bon contenu", async () => {
    const mock = api();
    const utilisateur = userEvent.setup();
    render(<EcranCloudBank />);
    await allerAuMapping(utilisateur);

    await utilisateur.click(screen.getByRole("button", { name: /Tout confirmer/ }));
    await utilisateur.click(screen.getByRole("button", { name: "Rechercher un compte" }));
    await utilisateur.click(await screen.findByRole("button", { name: "Rechercher" }));
    await utilisateur.click(await screen.findByRole("button", { name: /6523600000201 — Entretien/ }));
    expect(mock.cloudbankConfirmerLigne).toHaveBeenCalledWith(expect.objectContaining({ compte: "6523600000201", enregistrer: false }));

    const generer = await screen.findByRole("button", { name: "Générer le fichier" });
    expect(generer).toBeEnabled();
    await utilisateur.click(generer);

    expect(mock.cloudbankEcrire).toHaveBeenCalledWith(expect.objectContaining({
      modele: "petite_caisse", agence: 20000, mois: "Septembre", annee: "2026", retour: 0,
      lignes: [
        expect.objectContaining({ compte: "6522000000001", montant: 1000 }),
        expect.objectContaining({ compte: "6522000000001", montant: 2000 }),
        expect.objectContaining({ compte: "6523600000201", montant: 3000 }),
      ],
    }));
    expect(await screen.findByRole("heading", { name: "Résultats" })).toBeInTheDocument();
  });

  it("une ligne signalée « pour plus tard » est retirée du fichier", async () => {
    const mock = api();
    const utilisateur = userEvent.setup();
    render(<EcranCloudBank />);
    await allerAuMapping(utilisateur);
    await utilisateur.click(screen.getByRole("button", { name: /Tout confirmer/ }));
    await utilisateur.click(screen.getByRole("button", { name: "Rechercher un compte" }));
    await utilisateur.click(await screen.findByRole("button", { name: /Signaler cette ligne/ }));

    await utilisateur.click(await screen.findByRole("button", { name: "Générer le fichier" }));

    expect((mock.cloudbankEcrire.mock.calls[0][0] as { lignes: unknown[] }).lignes).toHaveLength(2);
  });

  it("le retour de caisse demande un montant valide avant de générer", async () => {
    api();
    const utilisateur = userEvent.setup();
    render(<EcranCloudBank />);
    await allerAuMapping(utilisateur);
    await utilisateur.click(screen.getByRole("button", { name: /Tout confirmer/ }));
    await utilisateur.click(screen.getByRole("button", { name: "Rechercher un compte" }));
    await utilisateur.click(await screen.findByRole("button", { name: /Signaler cette ligne/ }));

    await utilisateur.click(screen.getByLabelText("Oui"));
    expect(screen.getByRole("button", { name: "Générer le fichier" })).toBeDisabled();
    await utilisateur.type(screen.getByLabelText(/Montant du retour/), "2 500");
    expect(screen.getByRole("button", { name: "Générer le fichier" })).toBeEnabled();
  });
});

describe("Écran 4 — résultats", () => {
  async function allerAuxResultats() {
    const mock = api();
    const utilisateur = userEvent.setup();
    render(<EcranCloudBank />);
    await allerAuMapping(utilisateur);
    await utilisateur.click(screen.getByRole("button", { name: /Tout confirmer/ }));
    await utilisateur.click(screen.getByRole("button", { name: "Rechercher un compte" }));
    await utilisateur.click(await screen.findByRole("button", { name: /Signaler cette ligne/ }));
    await utilisateur.click(await screen.findByRole("button", { name: "Générer le fichier" }));
    await screen.findByRole("heading", { name: "Résultats" });
    return { mock, utilisateur };
  }

  it("traduit les avertissements en français simple et masque la note technique PROVISION", async () => {
    await allerAuxResultats();

    expect(screen.getByText(/n'est pas encore vérifié pour cette agence/)).toBeInTheDocument();
    expect(screen.queryByText(/PROVISION/)).not.toBeInTheDocument();
    expect(screen.queryByText(/code générique/)).not.toBeInTheDocument();
    expect(screen.getByText(/✓ équilibré/)).toBeInTheDocument();
  });

  it("ouvre le dossier du résultat et permet de repartir", async () => {
    const { mock, utilisateur } = await allerAuxResultats();

    await utilisateur.click(screen.getByRole("button", { name: "Ouvrir le dossier" }));
    expect(mock.ouvrirResultat).toHaveBeenCalledWith(RESULTAT.fichier, "dossier");

    await utilisateur.click(screen.getByRole("button", { name: "Nouveau document" }));
    expect(screen.getByRole("heading", { name: "Téléverser sur CloudBank" })).toBeInTheDocument();
  });
});

describe("Textes et règles d'affichage", () => {
  it("les 5 cas d'usage existent et leur prompt cite le skill", () => {
    expect(CAS_USAGE).toHaveLength(5);
    for (const cas of CAS_USAGE) expect(cas.construire({})).toContain("Téléverser sur CloudBank");
  });

  it("la convention de nom dépend du cas", () => {
    const [petite, , , extourne] = CAS_USAGE;
    expect(nomConforme(petite, "MAPPING A VALIDER - AKWA - Septembre 2026.xlsx")).toBe(true);
    expect(nomConforme(petite, "autre.xlsx")).toBe(false);
    expect(nomConforme(extourne, "EXT A TELEVERSER - BALESSING.xlsx")).toBe(true);
  });

  it("aucun avertissement inconnu n'est montré tel quel", () => {
    expect(traduireAvertissement("Traceback (most recent call last)")).not.toContain("Traceback");
  });
});
