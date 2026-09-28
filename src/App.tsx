import { useCallback, useEffect, useState } from "react";
import EcranImport from "./ecrans/EcranImport";
import EcranParametres from "./ecrans/EcranParametres";
import EcranResultats from "./ecrans/EcranResultats";
import EcranTraitement from "./ecrans/EcranTraitement";
import type { EtatTraitement } from "./ecrans/EcranTraitement";
import type { EtatGeneration, FichierImporte, ResultatClassement } from "./lib/types";
import logoOrisFinance from "./assets/logo-oris-finance.png";

type Ecran = "import" | "traitement" | "resultats" | "parametres";

const ONGLETS: { id: Ecran; libelle: string }[] = [
  { id: "import", libelle: "1. Import" },
  { id: "traitement", libelle: "2. Analyse" },
  { id: "resultats", libelle: "3. Résultats" },
  { id: "parametres", libelle: "Paramètres" },
];

export default function App() {
  const [ecran, setEcran] = useState<Ecran>("import");
  const [fichiers, setFichiers] = useState<FichierImporte[]>([]);
  const [traitement, setTraitement] = useState<EtatTraitement>({ etat: "attente" });
  const [resultat, setResultat] = useState<ResultatClassement | null>(null);
  const [generation, setGeneration] = useState<EtatGeneration>({ etat: "attente" });

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
    setTraitement({ etat: "encours", courant: 0, total: fichiers.length });
    setEcran("traitement");
    try {
      const reponse = await api.classer(fichiers.map((f) => f.chemin));
      setResultat(reponse);
      setTraitement({ etat: "termine" });
      setEcran("resultats");
    } catch (erreur) {
      setTraitement({
        etat: "erreur",
        message: erreur instanceof Error ? erreur.message : "Une erreur inattendue est survenue.",
      });
    }
  }, [api, fichiers]);

  const genererClasseur = useCallback(async () => {
    if (!api) {
      setGeneration({ etat: "erreur", message: "Cette fonction n'est disponible que dans l'application Orisflow." });
      return;
    }
    setGeneration({ etat: "encours" });
    try {
      const reponse = await api.generer(fichiers.map((f) => f.chemin));
      setGeneration({ etat: "succes", resultat: reponse });
    } catch (erreur) {
      setGeneration({
        etat: "erreur",
        message: erreur instanceof Error ? erreur.message : "Une erreur inattendue est survenue.",
      });
    }
  }, [api, fichiers]);

  return (
    <div className="application">
      <header className="entete">
        <div className="entete__marque">
          <img src={logoOrisFinance} alt="Oris Finance" className="entete__logo" />
          <span className="entete__separateur" aria-hidden="true" />
          <div className="entete__titre">
            <span className="entete__nom">Orisflow</span>
            <span className="entete__sous-titre">Trésorerie journalière</span>
          </div>
        </div>
        <nav className="entete__nav" aria-label="Navigation principale">
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
      </header>

      <main className="contenu">
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
            onRetourImport={() => setEcran("import")}
            onGenerer={genererClasseur}
          />
        )}
        {ecran === "parametres" && <EcranParametres />}
      </main>
    </div>
  );
}
