// `globals: true` (vite.config.mts) injecte describe/it/expect/beforeEach/afterEach :
// ne jamais faire `require("vitest")` ici, Vitest ne s'importe pas en CommonJS.
const fs = require("fs");
const os = require("os");
const path = require("path");

const auth = require("./auth.cjs");

describe("auth.cjs : comptes et connexion", () => {
  let dossier;
  let cheminComptes;

  beforeEach(() => {
    dossier = fs.mkdtempSync(path.join(os.tmpdir(), "orisflow-auth-"));
    cheminComptes = path.join(dossier, "comptes.json");
  });

  afterEach(() => {
    fs.rmSync(dossier, { recursive: true, force: true });
  });

  it("aucun compte au départ : premier lancement détecté", () => {
    expect(auth.aUnCompte(cheminComptes)).toBe(false);
  });

  it("le mot de passe n'est jamais écrit en clair sur le disque", () => {
    auth.creerCompte(cheminComptes, {
      identifiant: "adminorisflow",
      motDePasse: "UnMotDePasseSolide1",
      nomAffiche: "Administrateur",
      role: "admin",
    });
    const brut = fs.readFileSync(cheminComptes, "utf-8");
    expect(brut).not.toContain("UnMotDePasseSolide1");
  });

  it("connexion réussie avec le bon mot de passe", () => {
    auth.creerCompte(cheminComptes, {
      identifiant: "adminorisflow",
      motDePasse: "UnMotDePasseSolide1",
      nomAffiche: "Administrateur",
      role: "admin",
    });
    const resultat = auth.connecter(cheminComptes, "adminorisflow", "UnMotDePasseSolide1");
    expect(resultat.ok).toBe(true);
    expect(resultat.utilisateur).toEqual({
      identifiant: "adminorisflow",
      nomAffiche: "Administrateur",
      role: "admin",
      creeLe: expect.any(String),
    });
  });

  it("l'identifiant n'est pas sensible à la casse ni aux espaces superflus", () => {
    auth.creerCompte(cheminComptes, { identifiant: "Arnold", motDePasse: "UnMotDePasseSolide1" });
    expect(auth.connecter(cheminComptes, "  arnold  ", "UnMotDePasseSolide1").ok).toBe(true);
  });

  it("mauvais mot de passe : message générique, jamais quel champ est faux", () => {
    auth.creerCompte(cheminComptes, { identifiant: "arnold", motDePasse: "UnMotDePasseSolide1" });
    const resultat = auth.connecter(cheminComptes, "arnold", "mauvais mot de passe");
    expect(resultat.ok).toBe(false);
    expect(resultat.erreur).toBe("Identifiant ou mot de passe incorrect.");
  });

  it("identifiant inconnu : le même message générique", () => {
    const resultat = auth.connecter(cheminComptes, "personne", "peu importe");
    expect(resultat.ok).toBe(false);
    expect(resultat.erreur).toBe("Identifiant ou mot de passe incorrect.");
  });

  it("un identifiant déjà utilisé est refusé", () => {
    auth.creerCompte(cheminComptes, { identifiant: "arnold", motDePasse: "UnMotDePasseSolide1" });
    const resultat = auth.creerCompte(cheminComptes, { identifiant: "Arnold ", motDePasse: "AutreMotDePasse1" });
    expect(resultat.ok).toBe(false);
    expect(resultat.erreur).toMatch(/déjà utilisé/);
  });

  it("un mot de passe trop court est refusé", () => {
    const resultat = auth.creerCompte(cheminComptes, { identifiant: "arnold", motDePasse: "court" });
    expect(resultat.ok).toBe(false);
    expect(resultat.erreur).toMatch(/au moins/);
  });

  it("le dernier compte administrateur ne peut pas être supprimé", () => {
    auth.creerCompte(cheminComptes, { identifiant: "adminorisflow", motDePasse: "UnMotDePasseSolide1", role: "admin" });
    const resultat = auth.supprimerCompte(cheminComptes, "adminorisflow");
    expect(resultat.ok).toBe(false);
    expect(resultat.erreur).toMatch(/dernier compte administrateur/);
  });

  it("un second administrateur peut être supprimé", () => {
    auth.creerCompte(cheminComptes, { identifiant: "admin1", motDePasse: "UnMotDePasseSolide1", role: "admin" });
    auth.creerCompte(cheminComptes, { identifiant: "admin2", motDePasse: "UnMotDePasseSolide1", role: "admin" });
    expect(auth.supprimerCompte(cheminComptes, "admin2").ok).toBe(true);
  });

  it("après réinitialisation, seul le nouveau mot de passe fonctionne", () => {
    auth.creerCompte(cheminComptes, { identifiant: "arnold", motDePasse: "AncienMotDePasse1" });
    auth.reinitialiserMotDePasse(cheminComptes, "arnold", "NouveauMotDePasse1");
    expect(auth.connecter(cheminComptes, "arnold", "AncienMotDePasse1").ok).toBe(false);
    expect(auth.connecter(cheminComptes, "arnold", "NouveauMotDePasse1").ok).toBe(true);
  });

  it("après plusieurs échecs, une courte pause est imposée (protection anti-force brute)", () => {
    auth.creerCompte(cheminComptes, { identifiant: "arnold", motDePasse: "UnMotDePasseSolide1" });
    for (let i = 0; i < 5; i += 1) auth.connecter(cheminComptes, "arnold", "mauvais");
    const resultat = auth.connecter(cheminComptes, "arnold", "UnMotDePasseSolide1"); // même le bon mot de passe
    expect(resultat.ok).toBe(false);
    expect(resultat.erreur).toMatch(/Trop d'essais/);
  });

  // --- Robustesse (même exigence que le moteur Python : un fichier corrompu ne doit --------
  // --- jamais empêcher Orisflow de démarrer) -----------------------------------------------

  it("un fichier de comptes absent est traité comme un départ sans compte", () => {
    expect(auth.lireComptes(path.join(dossier, "absent.json"))).toEqual({ utilisateurs: [], illisible: false });
  });

  it("un fichier corrompu n'est jamais pris pour « aucun compte » (sinon un nouvel admin effacerait tout)", () => {
    fs.writeFileSync(cheminComptes, "ceci n'est pas du JSON valide {{{");
    expect(() => auth.lireComptes(cheminComptes)).not.toThrow();
    expect(auth.lireComptes(cheminComptes)).toEqual({ utilisateurs: [], illisible: true });
    expect(auth.aUnCompte(cheminComptes)).toBe(true);
    expect(auth.creerCompte(cheminComptes, { identifiant: "intrus", motDePasse: "UnMotDePasseSolide1" }).ok).toBe(false);
    expect(fs.readFileSync(cheminComptes, "utf-8")).toContain("pas du JSON"); // jamais écrasé
  });

  it("un fichier de forme inattendue (pas un objet) est signalé illisible", () => {
    fs.writeFileSync(cheminComptes, JSON.stringify(["pas", "le", "bon", "format"]));
    expect(auth.lireComptes(cheminComptes).illisible).toBe(true);
  });

  it("si le fichier est corrompu, la sauvegarde de l'état précédent prend le relais", () => {
    // Identifiant propre à ce test : le verrouillage anti-force brute d'un autre test ne s'applique pas.
    auth.creerCompte(cheminComptes, { identifiant: "sauvegarde", motDePasse: "UnMotDePasseSolide1", role: "admin" });
    auth.creerCompte(cheminComptes, { identifiant: "julien", motDePasse: "UnMotDePasseSolide2" });
    fs.writeFileSync(cheminComptes, "corrompu");

    const comptes = auth.lireComptes(cheminComptes);
    expect(comptes.illisible).toBe(false);
    expect(comptes.utilisateurs.map((u) => u.identifiant)).toEqual(["sauvegarde"]);
    expect(auth.connecter(cheminComptes, "sauvegarde", "UnMotDePasseSolide1").ok).toBe(true);
  });

  it("identifiant inconnu : même message générique, sans exception", () => {
    auth.creerCompte(cheminComptes, { identifiant: "arnold", motDePasse: "UnMotDePasseSolide1" });
    expect(auth.connecter(cheminComptes, "personne", "peu importe").erreur).toBe("Identifiant ou mot de passe incorrect.");
  });

  it("l'écriture du fichier de comptes est atomique (pas de fichier à moitié écrit)", () => {
    auth.creerCompte(cheminComptes, { identifiant: "arnold", motDePasse: "UnMotDePasseSolide1" });
    expect(fs.existsSync(cheminComptes + ".tmp")).toBe(false);
    expect(JSON.parse(fs.readFileSync(cheminComptes, "utf-8")).utilisateurs).toHaveLength(1);
  });
});
