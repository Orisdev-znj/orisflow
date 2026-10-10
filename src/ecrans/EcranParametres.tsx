import { useEffect, useState } from "react";
import { AGENCES_RESEAU } from "../lib/agences";
import type { CarnetInfo, EtapeDiagnostic, ParametresApplication, TableComptesInfo } from "../lib/types";
import { nettoyerErreur } from "../lib/format";
import ControleModele from "./ControleModele";

type EtatMoteur =
  | { etat: "inconnu" }
  | { etat: "test"; etapes: EtapeDiagnostic[]; pourcentage: number }
  | { etat: "ok"; version: string; python?: string; etapes: EtapeDiagnostic[]; reussi: boolean }
  | { etat: "erreur"; message: string };

type EtatTableComptes =
  | { etat: "inconnu" }
  | { etat: "construction" }
  | { etat: "erreur"; message: string };

type EtatCarnet =
  | { etat: "inconnu" }
  | { etat: "import" }
  | { etat: "importe"; jour: string; comptes: number; avertissements: string[] }
  | { etat: "erreur"; message: string };

export default function EcranParametres() {
  const api = window.orisflow;
  const [parametres, setParametres] = useState<ParametresApplication | null>(null);
  const [moteur, setMoteur] = useState<EtatMoteur>({ etat: "inconnu" });
  const [nomSaisi, setNomSaisi] = useState("");
  const [identiteEnregistree, setIdentiteEnregistree] = useState(false);
  const [tableComptes, setTableComptes] = useState<TableComptesInfo | null>(null);
  const [etatTableComptes, setEtatTableComptes] = useState<EtatTableComptes>({ etat: "inconnu" });
  const [carnet, setCarnet] = useState<CarnetInfo | null>(null);
  const [etatCarnet, setEtatCarnet] = useState<EtatCarnet>({ etat: "inconnu" });

  useEffect(() => {
    api
      ?.lireParametres()
      .then((reponse) => {
        setParametres(reponse);
        setNomSaisi(reponse.identite);
      })
      .catch(() => setParametres(null));
    api?.lireTableComptesInfo().then(setTableComptes).catch(() => setTableComptes(null));
    api?.lireCarnetInfo().then(setCarnet).catch(() => setCarnet(null));
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
    setMoteur({ etat: "test", etapes: [], pourcentage: 0 });
    const arreterEcoute = api.surEvenementMoteur((evenement) => {
      setMoteur((precedent) =>
        precedent.etat === "test"
          ? {
              etat: "test",
              pourcentage: evenement.pourcentage ?? precedent.pourcentage,
              etapes:
                evenement.message !== undefined
                  ? [...precedent.etapes, { etape: "", ok: !evenement.message.startsWith("✗"), detail: evenement.message }]
                  : precedent.etapes,
            }
          : precedent,
      );
    });
    try {
      const reponse = await api.testerMoteur();
      setMoteur({ etat: "ok", version: reponse.version, python: reponse.python, etapes: reponse.etapes, reussi: reponse.ok });
    } catch (erreur) {
      setMoteur({ etat: "erreur", message: nettoyerErreur(erreur) });
    } finally {
      arreterEcoute();
    }
  };

  const construireTableComptes = async () => {
    if (!api) return;
    setEtatTableComptes({ etat: "construction" });
    try {
      const reponse = await api.construireTableComptes();
      if (reponse) {
        setTableComptes(await api.lireTableComptesInfo());
      }
      setEtatTableComptes({ etat: "inconnu" });
    } catch (erreur) {
      setEtatTableComptes({ etat: "erreur", message: nettoyerErreur(erreur) });
    }
  };

  const importerClasseurCarnet = async () => {
    if (!api) return;
    setEtatCarnet({ etat: "import" });
    try {
      const reponse = await api.importerClasseurCarnet();
      if (reponse) {
        setCarnet(await api.lireCarnetInfo());
        setEtatCarnet({
          etat: "importe",
          jour: reponse.jour,
          comptes: reponse.comptes_importes,
          avertissements: reponse.avertissements,
        });
      } else {
        setEtatCarnet({ etat: "inconnu" });
      }
    } catch (erreur) {
      setEtatCarnet({ etat: "erreur", message: nettoyerErreur(erreur) });
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

      <h2>Reconnaissance des agences par numéro de compte</h2>
      <p className="aide">
        Orisflow reconnaît l'agence d'une liste de comptes même quand le fichier n'est pas renommé, grâce à une
        table de 15 numéros de compte par agence. Cette table se construit une fois à partir de quelques jours de
        fichiers déjà nommés par agence (ex. Akwa_Compte.xls) ; à refaire si le réseau d'agences change.
      </p>
      <p className="aide">
        {tableComptes?.existe
          ? `${Object.keys(tableComptes.agences).length} agence(s) reconnaissable(s) sur ${AGENCES_RESEAU.length} ` +
            `(construite le ${tableComptes.construiteLe ?? "?"}).`
          : "Aucune table construite pour l'instant : la reconnaissance par numéro de compte est inactive."}
      </p>
      {tableComptes?.existe && Object.keys(tableComptes.agences).length < AGENCES_RESEAU.length && (
        <p className="message message--avertissement" role="status">
          Agence(s) sans table encore fiable :{" "}
          {AGENCES_RESEAU.filter((a) => !(a.cle in tableComptes.agences)).map((a) => a.libelle).join(", ")}.
        </p>
      )}
      <div className="actions actions--ligne">
        <button
          type="button"
          className="bouton"
          onClick={construireTableComptes}
          disabled={!api || etatTableComptes.etat === "construction"}
        >
          {tableComptes?.existe ? "Reconstruire la table…" : "Construire la table…"}
        </button>
        {etatTableComptes.etat === "construction" && <span className="aide-inline">Construction en cours…</span>}
      </div>
      {etatTableComptes.etat === "erreur" && (
        <p role="alert" className="message message--erreur">
          {etatTableComptes.message}
        </p>
      )}

      <ControleModele />

      <h2>Carnet des soldes bancaires</h2>
      <p className="aide">
        Orisflow garde le solde de chaque compte bancaire suivi, pour proposer la valeur de la veille quand un
        relevé manque un matin. Si le carnet est encore vide (nouvelle installation, ou historique perdu), importez
        un classeur de trésorerie que vous avez déjà validé comme correct : Orisflow en retire les soldes par
        compte et les ajoute au carnet, sans jamais modifier ce classeur.
      </p>
      <p className="aide">
        {carnet?.existe
          ? `${carnet.nombreComptes} compte(s) suivi(s) sur ${carnet.nombreJours} jour(s), dernier jour connu le ${carnet.dernierJour}.`
          : "Carnet vide pour l'instant : aucune valeur de la veille ne sera proposée si un relevé manque."}
      </p>
      <div className="actions actions--ligne">
        <button
          type="button"
          className="bouton"
          onClick={importerClasseurCarnet}
          disabled={!api || etatCarnet.etat === "import"}
        >
          Importer un classeur validé…
        </button>
        {etatCarnet.etat === "import" && <span className="aide-inline">Lecture en cours…</span>}
      </div>
      {etatCarnet.etat === "importe" && (
        <div>
          <p role="status" className="message message--succes">
            {etatCarnet.comptes} compte(s) importé(s) pour le {etatCarnet.jour}.
          </p>
          {etatCarnet.avertissements.length > 0 && (
            <ul className="journal-etapes" aria-label="Avertissements de l'import">
              {etatCarnet.avertissements.map((message, index) => (
                <li key={index}>{message}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {etatCarnet.etat === "erreur" && (
        <p role="alert" className="message message--erreur">
          {etatCarnet.message}
        </p>
      )}

      <h2>Moteur de calcul</h2>
      <p className="aide">Le moteur lit les fichiers et effectue les calculs. Ce test vérifie chaque étape en détail.</p>
      <div className="actions actions--ligne">
        <button type="button" className="bouton" onClick={tester} disabled={!api || moteur.etat === "test"}>
          Tester le moteur
        </button>
      </div>
      {moteur.etat === "test" && (
        <div role="status" aria-live="polite">
          <p>Test en cours… <strong>{moteur.pourcentage} %</strong></p>
          <progress className="progression" value={moteur.pourcentage} max={100} aria-label="Avancement du test" />
          {moteur.etapes.length > 0 && (
            <ol className="journal-etapes" aria-label="Journal du test">
              {moteur.etapes.map((etape, index) => (
                <li key={index}>{etape.detail}</li>
              ))}
            </ol>
          )}
        </div>
      )}
      {moteur.etat === "ok" && (
        <div>
          <p role="status" className={`message ${moteur.reussi ? "message--succes" : "message--avertissement"}`}>
            {moteur.reussi ? "Le moteur répond correctement" : "Le moteur répond, mais une vérification a échoué"}
            {" "}(version {moteur.version}
            {moteur.python ? `, Python ${moteur.python}` : ""}).
          </p>
          <ol className="journal-etapes" aria-label="Détail du test">
            {moteur.etapes.map((etape, index) => (
              <li key={index}>
                {etape.ok ? "✓" : "✗"} {etape.etape} — {etape.detail}
              </li>
            ))}
          </ol>
        </div>
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
