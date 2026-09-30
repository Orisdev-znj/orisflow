import { useCallback, useEffect, useState } from "react";
import EcranImport from "./ecrans/EcranImport";
import EcranParametres from "./ecrans/EcranParametres";
import EcranResultats from "./ecrans/EcranResultats";
import EcranTraitement from "./ecrans/EcranTraitement";
import type { EtatTraitement } from "./ecrans/EcranTraitement";
import Home from "./ecrans/Home";
import WorkInProgress from "./ecrans/WorkInProgress";
import type { EtatGeneration, FichierImporte, ResultatClassement } from "./lib/types";
import logoOrisFinance from "./assets/logo-oris-finance.png";
import { nettoyerErreur } from "./lib/format";

// Vue de premier niveau : l'accueil (hub) donne accès aux modules. Chaque module garde
// son propre état interne (ex. `ecran` ci-dessous pour la trésorerie), inchangé.
type Vue = "accueil" | "tresorerie" | "etatsFinanciers";

type Ecran = "import" | "traitement" | "resultats" | "parametres";

const ONGLETS: { id: Ecran; libelle: string }[] = [
  { id: "import", libelle: "1. Import" },
  { id: "traitement", libelle: "2. Analyse" },
  { id: "resultats", libelle: "3. Résultats" },
  { id: "parametres", libelle: "Paramètres" },
];

const SOUS_TITRES: Record<Vue, string> = {
  accueil: "ORIS FINANCE",
  tresorerie: "Trésorerie journalière",
  etatsFinanciers: "États financiers",
};

export default function App() {
  const [vue, setVue] = useState<Vue>("accueil");

  // --- État du module Trésorerie (fonctionnalité B) : inchangé par rapport à avant. ---
  const [ecran, setEcran] = useState<Ecran>("import");
  const [fichiers, setFichiers] = useState<FichierImporte[]>([]);
  const [traitement, setTraitement] = useState<EtatTraitement>({ etat: "attente" });
  const [resultat, setResultat] = useState<ResultatClassement | null>(null);
  const [generation, setGeneration] = useState<EtatGeneration>({ etat: "attente" });
  // Fichiers décochés par l'utilisateur sur l'écran des résultats : reconnus par Orisflow
  // mais volontairement exclus de la génération (demande du 30/09/2026).
  const [fichiersExclus, setFichiersExclus] = useState<Set<string>>(new Set());

  const api = window.orisflow;

  const ajouterFichiers = useCallback((nouveaux: FichierImporte[]) => {
    setFichiers((existants) => {
      const connus = new Set(existants.map((f) => f.chemin.toLowerCase()));
      const ajouts = nouveaux.filter((f) => !connus.has(f.chemin.toLowerCase()));
      return [...existants, ...ajouts];
    });
  }, []);

  const retirerFichier = useCallback((chemin: string) => {
    setFichiers((existants) => existants.filter((f) => f.chemin !== chemin));
  }, []);

  const viderFichiers = useCallback(() => setFichiers([]), []);

  const basculerFichierExclu = useCallback((chemin: string) => {
    setFichiersExclus((existants) => {
      const suivant = new Set(existants);
      if (suivant.has(chemin)) {
        suivant.delete(chemin);
      } else {
        suivant.add(chemin);
      }
      return suivant;
    });
  }, []);

  // Avancement envoyé par le moteur pendant le traitement.
  useEffect(() => {
    if (!api) return;
    return api.surEvenementMoteur((evenement) => {
      setTraitement((precedent) =>
        precedent.etat === "encours"
          ? { ...precedent, courant: evenement.courant, total: evenement.total, fichier: evenement.fichier }
          : precedent,
      );
    });
  }, [api]);

  const lancerTraitement = useCallback(async () => {
    if (!api) {
      setTraitement({
        etat: "erreur",
        message: "Cette fonction n'est disponible que dans l'application Orisflow.",
      });
      setEcran("traitement");
      return;
    }
    setResultat(null);
    setGeneration({ etat: "attente" });
    setFichiersExclus(new Set());
    setTraitement({ etat: "encours", courant: 0, total: fichiers.length });
    setEcran("traitement");
    try {
      const reponse = await api.classer(fichiers.map((f) => f.chemin));
      setResultat(reponse);
      setTraitement({ etat: "termine" });
      setEcran("resultats");
    } catch (erreur) {
      setTraitement({ etat: "erreur", message: nettoyerErreur(erreur) });
    }
  }, [api, fichiers]);

  const genererClasseur = useCallback(async () => {
    if (!api) {
      setGeneration({ etat: "erreur", message: "Cette fonction n'est disponible que dans l'application Orisflow." });
      return;
    }
    // On régénère à partir des fichiers reconnus par la dernière analyse (pas de la liste
    // brute d'import), en retirant ceux que l'utilisateur a décochés sur l'écran résultats.
    const chemins = (resultat?.fichiers ?? fichiers)
      .filter((f) => !fichiersExclus.has(f.chemin))
      .map((f) => f.chemin);
    setGeneration({ etat: "encours" });
    try {
      const reponse = await api.generer(chemins);
      setGeneration({ etat: "succes", resultat: reponse });
    } catch (erreur) {
      setGeneration({ etat: "erreur", message: nettoyerErreur(erreur) });
    }
  }, [api, fichiers, resultat, fichiersExclus]);

  return (
    <div className="application">
      <header className="entete">
        <div className="entete__marque">
          <img src={logoOrisFinance} alt="Oris Finance" className="entete__logo" />
          <span className="entete__separateur" aria-hidden="true" />
          <div className="entete__titre">
            <span className="entete__nom">Orisflow</span>
            <span className="entete__sous-titre">{SOUS_TITRES[vue]}</span>
          </div>
          {vue !== "accueil" && (
            <button type="button" className="bouton-accueil" onClick={() => setVue("accueil")}>
              ← Accueil
            </button>
          )}
        </div>
        {vue === "tresorerie" && (
          <nav className="entete__nav" aria-label="Navigation du module Trésorerie">
            {ONGLETS.map((onglet) => (
              <button
                key={onglet.id}
                type="button"
                className={onglet.id === ecran ? "onglet onglet--actif" : "onglet"}
                aria-current={onglet.id === ecran ? "page" : undefined}
                onClick={() => setEcran(onglet.id)}
              >
                {onglet.libelle}
              </button>
            ))}
          </nav>
        )}
      </header>

      <main className="contenu">
        {vue === "accueil" && (
          <Home
            onChoisirTresorerie={() => setVue("tresorerie")}
            onChoisirEtatsFinanciers={() => setVue("etatsFinanciers")}
          />
        )}

        {vue === "etatsFinanciers" && (
          <WorkInProgress titre="États financiers" onRetourAccueil={() => setVue("accueil")} />
        )}

        {vue === "tresorerie" && (
          <>
            {ecran === "import" && (
              <EcranImport
                fichiers={fichiers}
                onAjouter={ajouterFichiers}
                onRetirer={retirerFichier}
                onVider={viderFichiers}
                onLancer={lancerTraitement}
              />
            )}
            {ecran === "traitement" && (
              <EcranTraitement
                traitement={traitement}
                onRetourImport={() => setEcran("import")}
                onRelancer={lancerTraitement}
              />
            )}
            {ecran === "resultats" && (
              <EcranResultats
                resultat={resultat}
                generation={generation}
                fichiersExclus={fichiersExclus}
                onBasculerFichier={basculerFichierExclu}
                onRetourImport={() => setEcran("import")}
                onGenerer={genererClasseur}
              />
            )}
            {ecran === "parametres" && <EcranParametres />}
          </>
        )}
      </main>
    </div>
  );
}
