import { useEffect, useState } from "react";
import type { ParametresApplication } from "../lib/types";

type EtatMoteur =
  | { etat: "inconnu" }
  | { etat: "test" }
  | { etat: "ok"; version: string; python?: string }
  | { etat: "erreur"; message: string };

export default function EcranParametres() {
  const api = window.orisflow;
  const [parametres, setParametres] = useState<ParametresApplication | null>(null);
  const [moteur, setMoteur] = useState<EtatMoteur>({ etat: "inconnu" });

  useEffect(() => {
    api?.lireParametres().then(setParametres).catch(() => setParametres(null));
  }, [api]);

  const changerDossier = async () => {
    if (!api) return;
    const dossier = await api.choisirDossierTravail();
    setParametres((precedent) => (precedent ? { ...precedent, dossierTravail: dossier } : precedent));
  };

  const changerDossierReference = async () => {
    if (!api) return;
    const dossier = await api.choisirDossierReference();
    setParametres((precedent) => (precedent ? { ...precedent, dossierReference: dossier } : precedent));
  };

  const tester = async () => {
    if (!api) return;
    setMoteur({ etat: "test" });
    try {
      const reponse = await api.testerMoteur();
      setMoteur({ etat: "ok", version: reponse.version, python: reponse.python });
    } catch (erreur) {
      setMoteur({ etat: "erreur", message: erreur instanceof Error ? erreur.message : "Le moteur ne répond pas." });
    }
  };

  return (
    <section aria-labelledby="titre-parametres">
      <h1 id="titre-parametres">Paramètres</h1>

      {!api && (
        <p className="message message--avertissement" role="status">
          Les paramètres ne sont disponibles que dans l'application Orisflow.
        </p>
      )}

      <h2>Dossier de travail</h2>
      <p className="aide">
        Orisflow y range ses copies de travail, les fichiers générés et les sauvegardes (Imports, Résultats, Sauvegardes).
      </p>
      <p className="chemin">{parametres?.dossierTravail ?? "—"}</p>
      <div className="actions actions--ligne">
        <button type="button" className="bouton" onClick={changerDossier} disabled={!api}>
          Changer de dossier…
        </button>
        <button type="button" className="bouton" onClick={() => api?.ouvrirDossierTravail()} disabled={!api}>
          Ouvrir le dossier
        </button>
      </div>

      <h2>Dossier de référence (contrôle de cohérence)</h2>
      <p className="aide">
        Dossier des classeurs de trésorerie déjà produits. Orisflow le lit seul, jamais ne l'écrit, pour comparer
        le nombre de comptes du jour à celui de la veille et repérer les écarts anormaux.
      </p>
      <p className="chemin">{parametres?.dossierReference || "Non défini"}</p>
      <div className="actions actions--ligne">
        <button type="button" className="bouton" onClick={changerDossierReference} disabled={!api}>
          Choisir le dossier…
        </button>
      </div>

      <h2>Moteur de calcul</h2>
      <p className="aide">Le moteur lit les fichiers et effectue les calculs. Ce test vérifie qu'il répond.</p>
      <div className="actions actions--ligne">
        <button type="button" className="bouton" onClick={tester} disabled={!api || moteur.etat === "test"}>
          Tester le moteur
        </button>
      </div>
      {moteur.etat === "test" && <p role="status">Test en cours…</p>}
      {moteur.etat === "ok" && (
        <p role="status" className="message message--succes">
          Le moteur répond correctement (version {moteur.version}
          {moteur.python ? `, Python ${moteur.python}` : ""}).
        </p>
      )}
      {moteur.etat === "erreur" && (
        <p role="alert" className="message message--erreur">
          {moteur.message}
        </p>
      )}

      <h2>À propos</h2>
      <p className="aide">Orisflow version {parametres?.version ?? "0.1.0"} · ORIS FINANCE</p>
    </section>
  );
}
