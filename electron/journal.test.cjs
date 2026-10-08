const fs = require("fs");
const os = require("os");
const path = require("path");

const journal = require("./journal.cjs");

const ARNOLD = { identifiant: "adminorisflow", nomAffiche: "Arnold" };
const JULIEN = { identifiant: "julien", nomAffiche: "Julien" };

describe("journal.cjs : traçabilité des actions par utilisateur", () => {
  let dossier;

  beforeEach(() => {
    dossier = fs.mkdtempSync(path.join(os.tmpdir(), "orisflow-journal-"));
  });

  afterEach(() => {
    fs.rmSync(dossier, { recursive: true, force: true });
  });

  it("aucun évènement dans un dossier qui n'existe pas encore", () => {
    expect(journal.listerEvenements(path.join(dossier, "absent"))).toEqual([]);
  });

  it("un évènement consigné se retrouve à la lecture, avec son auteur", () => {
    journal.consignerEvenement(dossier, { utilisateur: ARNOLD, action: "connexion" });
    const evenements = journal.listerEvenements(dossier);
    expect(evenements).toHaveLength(1);
    expect(evenements[0]).toMatchObject({
      utilisateur: "adminorisflow",
      nomAffiche: "Arnold",
      action: "connexion",
      details: {},
    });
    expect(evenements[0].horodatage).toEqual(expect.any(String));
  });

  it("un classeur généré est consigné avec ses détails", () => {
    journal.consignerEvenement(dossier, {
      utilisateur: ARNOLD,
      action: "generation_classeur",
      details: { chemin_genere: "C:\\Resultats\\TRESORERIE...02 10 2026.xlsx", date: "2026-10-02" },
    });
    const [evenement] = journal.listerEvenements(dossier);
    expect(evenement.details.date).toBe("2026-10-02");
  });

  it("chaque évènement a son propre fichier (jamais une modification d'un fichier existant)", () => {
    journal.consignerEvenement(dossier, { utilisateur: ARNOLD, action: "connexion" });
    journal.consignerEvenement(dossier, { utilisateur: ARNOLD, action: "deconnexion" });
    const fichiers = fs.readdirSync(dossier).filter((n) => n.endsWith(".json"));
    expect(fichiers).toHaveLength(2);
  });

  it("l'écriture est atomique (pas de fichier .tmp résiduel)", () => {
    journal.consignerEvenement(dossier, { utilisateur: ARNOLD, action: "connexion" });
    expect(fs.readdirSync(dossier).some((n) => n.endsWith(".tmp"))).toBe(false);
  });

  it("les évènements sont lus du plus récent au plus ancien", async () => {
    journal.consignerEvenement(dossier, { utilisateur: ARNOLD, action: "connexion" });
    await new Promise((r) => setTimeout(r, 2));
    journal.consignerEvenement(dossier, { utilisateur: ARNOLD, action: "deconnexion" });
    const evenements = journal.listerEvenements(dossier);
    expect(evenements.map((e) => e.action)).toEqual(["deconnexion", "connexion"]);
  });

  it("filtre par utilisateur", () => {
    journal.consignerEvenement(dossier, { utilisateur: ARNOLD, action: "connexion" });
    journal.consignerEvenement(dossier, { utilisateur: JULIEN, action: "connexion" });
    const evenements = journal.listerEvenements(dossier, { utilisateur: "julien" });
    expect(evenements).toHaveLength(1);
    expect(evenements[0].nomAffiche).toBe("Julien");
  });

  it("filtre par action", () => {
    journal.consignerEvenement(dossier, { utilisateur: ARNOLD, action: "connexion" });
    journal.consignerEvenement(dossier, { utilisateur: ARNOLD, action: "generation_classeur" });
    const evenements = journal.listerEvenements(dossier, { action: "generation_classeur" });
    expect(evenements).toHaveLength(1);
  });

  it("limite le nombre d'évènements renvoyés", () => {
    for (let i = 0; i < 5; i += 1) journal.consignerEvenement(dossier, { utilisateur: ARNOLD, action: "connexion" });
    expect(journal.listerEvenements(dossier, { limite: 3 })).toHaveLength(3);
  });

  // --- Robustesse (même exigence que partout ailleurs) -------------------------------------

  it("un fichier d'évènement corrompu est ignoré, sans exception", () => {
    journal.consignerEvenement(dossier, { utilisateur: ARNOLD, action: "connexion" });
    fs.writeFileSync(path.join(dossier, "evenement_corrompu.json"), "{{{ pas du JSON valide");
    expect(() => journal.listerEvenements(dossier)).not.toThrow();
    expect(journal.listerEvenements(dossier)).toHaveLength(1);
  });

  it("un évènement sans utilisateur connu (ex. avant la première connexion) ne plante pas", () => {
    journal.consignerEvenement(dossier, { utilisateur: null, action: "creation_compte_admin" });
    const [evenement] = journal.listerEvenements(dossier);
    expect(evenement.utilisateur).toBeNull();
  });
});
