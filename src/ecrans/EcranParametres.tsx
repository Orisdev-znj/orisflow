import { useEffect, useState } from "react";
import type { ParametresApplication } from "../lib/types";
import { nettoyerErreur } from "../lib/format";

type EtatMoteur =
  | { etat: "inconnu" }
  | { etat: "test" }
  | { etat: "ok"; version: string; python?: string }
  | { etat: "erreur"; message: string };

export default function EcranParametres() {
  const api = window.orisflow;
  const [parametres, setParametres] = useState<ParametresApplication | null>(null);
  const [moteur, setMoteur] = useState<EtatMoteur>({ etat: "inconnu" });
  const [nomSaisi, setNomSaisi] = useState("");
  const [identiteEnregistree, setIdentiteEnregistree] = useState(false);

  useEffect(() => {
    api
      ?.lireParametres()
      .then((reponse) => {
        setParametres(reponse);
        setNomSaisi(reponse.identite);
      })
      .catch(() => setParametres(null));
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

  const changerDossierBordereau = async () => {
    if (!api) return;
    const dossier = await api.choisirDossierBordereau();
    setParametres((precedent) => (precedent ? { ...precedent, dossierBordereau: dossier } : precedent));
  };

  const enregistrerIdentite = async () => {
    if (!api) return;
    const nom = await api.definirIdentite(nomSaisi);
    setParametres((precedent) => (precedent ? { ...precedent, identite: nom } : precedent));
    setIdentiteEnregistree(true);
    setTimeout(() => setIdentiteEnregistree(false), 2500);
  };

  const tester = async () => {
    if (!api) return;
    setMoteur({ etat: "test" });
    try {
      const reponse = await api.testerMoteur();
      setMoteur({ etat: "ok", version: reponse.version, python: reponse.python });
    } catch (erreur) {
      setMoteur({ etat: "erreur", message: nettoyerErreur(erreur) });
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

      <h2>Votre identité</h2>
      <p className="aide">
        Votre nom identifie vos transmissions sur Suivi Courrier (expéditeur des documents que vous envoyez, auteur
        des accusés de réception). Réglage propre à ce poste, pas partagé avec les autres.
      </p>
      <div className="champ">
        <label htmlFor="champ-identite">Votre nom</label>
        <input
          id="champ-identite"
          type="text"
          value={nomSaisi}
          onChange={(e) => setNomSaisi(e.target.value)}
          placeholder="Ex. Arnold Tiomela"
        />
      </div>
      <div className="actions actions--ligne">
        <button type="button" className="bouton" onClick={enregistrerIdentite} disabled={!api}>
          Enregistrer
        </button>
        {identiteEnregistree && <span className="aide-inline">Enregistré.</span>}
      </div>

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

      <h2>Dossier partagé de Suivi Courrier</h2>
      <p className="aide">
        Dossier réseau accessible à tout le service (postes reliés par câble Ethernet) où Orisflow enregistre les
        transmissions et leurs accusés de réception. Doit être le même dossier pour tout le monde.
        {parametres?.dossierBordereauParDefaut && (
          <> Pour l'instant, en attendant votre choix, Suivi Courrier utilise un dossier de test local (visible sur
          ce poste seulement).</>
        )}
      </p>
      <p className="chemin">
        {parametres?.dossierBordereau ?? "—"}
        {parametres?.dossierBordereauParDefaut && <span className="aide-inline"> (dossier de test local)</span>}
      </p>
      <div className="actions actions--ligne">
        <button type="button" className="bouton" onClick={changerDossierBordereau} disabled={!api}>
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
