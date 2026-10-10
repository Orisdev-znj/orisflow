import { useCallback, useEffect, useState } from "react";
import BudgetDashboard from "./ecrans/BudgetDashboard";
import EcranImport from "./ecrans/EcranImport";
import EcranParametres from "./ecrans/EcranParametres";
import EcranConnexion from "./ecrans/EcranConnexion";
import EcranHistorique from "./ecrans/EcranHistorique";
import EcranResultats from "./ecrans/EcranResultats";
import MenuUtilisateur from "./ecrans/MenuUtilisateur";
import FenetreJournal from "./ecrans/FenetreJournal";
import FenetreUtilisateurs from "./ecrans/FenetreUtilisateurs";
import EcranTraitement from "./ecrans/EcranTraitement";
import type { EtatTraitement } from "./ecrans/EcranTraitement";
import FenetreValeursManuelles from "./ecrans/FenetreValeursManuelles";
import FenetreAgencesAConfirmer from "./ecrans/FenetreAgencesAConfirmer";
import Home from "./ecrans/Home";
import ModuleBordereau from "./ecrans/ModuleBordereau";
import WorkInProgress from "./ecrans/WorkInProgress";
import type {
  EtatAuth,
  EtatGeneration,
  FichierImporte,
  RelevesSaisis,
  ResultatClassement,
  UtilisateurPublic,
  ValeursManuelles,
} from "./lib/types";
import logoOrisFinance from "./assets/logo-oris-finance.png";
import { nettoyerErreur } from "./lib/format";
import { aujourdhuiISO, dateValide, hierISO } from "./lib/dates";

// Vue de premier niveau : l'accueil (hub) donne accès aux modules. Chaque module garde
// son propre état interne (ex. `ecran` ci-dessous pour la trésorerie), inchangé.
type Vue = "accueil" | "tresorerie" | "etatsFinanciers" | "bordereau" | "budget" | "parametres";

type Ecran = "import" | "traitement" | "resultats" | "historique";

// Parcours quotidien, dans l'ordre ; l'historique est à part (pas une étape).
const ETAPES: { id: Exclude<Ecran, "historique">; numero: number; libelle: string }[] = [
  { id: "import", numero: 1, libelle: "Import" },
  { id: "traitement", numero: 2, libelle: "Analyse" },
  { id: "resultats", numero: 3, libelle: "Résultats et génération" },
];

const SOUS_TITRES: Record<Vue, string> = {
  accueil: "ORIS FINANCE",
  tresorerie: "Trésorerie journalière",
  etatsFinanciers: "États financiers",
  bordereau: "Suivi Courrier",
  budget: "Évaluation budgétaire",
  parametres: "Paramètres",
};

export default function App() {
  // Authentification (06/10/2026) : rien d'autre ne s'affiche tant qu'aucune session n'est
  // ouverte. `etatAuth` vaut `null` pendant la vérification initiale (évite un flash de
  // l'écran de connexion « normal » si un premier lancement est en réalité détecté juste après).
  const [etatAuth, setEtatAuth] = useState<EtatAuth | null>(null);
  const [session, setSession] = useState<UtilisateurPublic | null>(null);
  const [fenetreUtilisateursOuverte, setFenetreUtilisateursOuverte] = useState(false);
  const [fenetreJournalOuverte, setFenetreJournalOuverte] = useState(false);

  useEffect(() => {
    const api = window.orisflow;
    if (!api) {
      // Aucun pont Electron (ex. aperçu dans un simple navigateur) : rien n'est authentifiable,
      // donc rien à bloquer non plus. Chaque fonctionnalité continue de signaler elle-même
      // qu'elle n'est disponible que dans l'application Orisflow, comme avant.
      setSession({ identifiant: "", nomAffiche: "", role: "admin", creeLe: "" });
      return;
    }
    api.etatAuth().then((reponse) => {
      setEtatAuth(reponse);
      // Une session déjà ouverte côté processus principal (ex. après un rechargement de la
      // fenêtre en développement) est reprise directement, sans redemander la connexion.
      if (reponse.utilisateurConnecte) setSession(reponse.utilisateurConnecte);
    });
  }, []);

  const seDeconnecter = useCallback(() => {
    window.orisflow?.deconnecter();
    setSession(null);
    setFenetreUtilisateursOuverte(false);
    setFenetreJournalOuverte(false);
    window.orisflow?.etatAuth().then(setEtatAuth);
  }, []);

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
  // Jour couvert par le classeur (AAAA-MM-JJ) : « hier » par défaut, modifiable à l'import et
  // avant la génération (lundi, jour férié, rattrapage).
  const [dateClasseur, setDateClasseur] = useState<string>(hierISO);
  const dateUtilisable = dateValide(dateClasseur) && dateClasseur <= aujourdhuiISO();
  // Fenêtre unique de saisie manuelle (UV, UBA, Ecobank, Access Bank…) avant de générer
  // le classeur (demande du 02/10/2026) : ouverte quand l'analyse a signalé des champs
  // à compléter.
  const [fenetreValeursOuverte, setFenetreValeursOuverte] = useState(false);
  // Fenêtre « Agence à confirmer » (03/10/2026) : ouverte après l'analyse si une liste de
  // comptes n'a pu être rattachée à une agence automatiquement.
  const [fenetreAgencesOuverte, setFenetreAgencesOuverte] = useState(false);

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
      if (evenement.message) {
        setGeneration((precedent) =>
          precedent.etat === "encours" ? { etat: "encours", etape: evenement.message } : precedent,
        );
      }
      setTraitement((precedent) => {
        if (precedent.etat !== "encours") return precedent;
        // Journal : une ligne par fichier classé, plus les étapes résumées (comptage, numéros de compte…).
        const journal = evenement.message ? [...precedent.journal, evenement.message] : precedent.journal;
        return {
          ...precedent,
          courant: evenement.courant,
          total: evenement.total,
          pourcentage: evenement.pourcentage ?? precedent.pourcentage,
          fichier: evenement.fichier || precedent.fichier,
          journal,
        };
      });
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
    setTraitement({ etat: "encours", courant: 0, total: fichiers.length, pourcentage: 0, journal: [] });
    setEcran("traitement");
    try {
      const reponse = await api.classer(fichiers.map((f) => f.chemin), undefined, dateClasseur);
      setResultat(reponse);
      setTraitement({ etat: "termine" });
      setEcran("resultats");
      // Demande du 03/10/2026 : si une liste de comptes reste sans agence après les
      // mécanismes automatiques, l'utilisateur la choisit dans une fenêtre dédiée.
      setFenetreAgencesOuverte(reponse.fichiers.some((f) => f.type_detecte === "compte" && f.agence_detectee === null && f.niveau !== "bloquant"));
    } catch (erreur) {
      setTraitement({ etat: "erreur", message: nettoyerErreur(erreur) });
    }
  }, [api, fichiers, dateClasseur]);

  const confirmerAgences = useCallback(
    async (choix: Record<string, string>) => {
      if (!api) return;
      setFenetreAgencesOuverte(false);
      setTraitement({ etat: "encours", courant: 0, total: fichiers.length, pourcentage: 0, journal: [] });
      setEcran("traitement");
      try {
        const reponse = await api.classer(fichiers.map((f) => f.chemin), choix, dateClasseur);
        setResultat(reponse);
        setTraitement({ etat: "termine" });
        setEcran("resultats");
      } catch (erreur) {
        setTraitement({ etat: "erreur", message: nettoyerErreur(erreur) });
      }
    },
    [api, fichiers, dateClasseur],
  );

  const genererClasseur = useCallback(
    async (valeursManuelles: ValeursManuelles, relevesSaisis: RelevesSaisis = {}) => {
      if (!api) {
        setGeneration({ etat: "erreur", message: "Cette fonction n'est disponible que dans l'application Orisflow." });
        return;
      }
      // On régénère à partir des fichiers reconnus par la dernière analyse (pas de la liste
      // brute d'import), en retirant ceux que l'utilisateur a décochés sur l'écran résultats.
      const chemins = (resultat?.fichiers ?? fichiers)
        .filter((f) => !fichiersExclus.has(f.chemin))
        .map((f) => f.chemin);
      setFenetreValeursOuverte(false);
      setGeneration({ etat: "encours" });
      try {
        const reponse = await api.generer(chemins, valeursManuelles, relevesSaisis, dateClasseur);
        setGeneration({ etat: "succes", resultat: reponse });
      } catch (erreur) {
        setGeneration({ etat: "erreur", message: nettoyerErreur(erreur) });
      }
    },
    [api, fichiers, resultat, fichiersExclus, dateClasseur],
  );

  // Clic sur « Générer le classeur » : si des montants doivent être saisis à la main
  // (UV, UBA, Ecobank, Access Bank…) ou si des relevés manquent (avec ou sans valeur de la
  // veille à proposer), ouvre la fenêtre unique d'abord — sinon génère directement.
  const demarrerGeneration = useCallback(() => {
    const nbManuels = resultat?.champs_manuels_requis.length ?? 0;
    const nbReleves = resultat?.releves_manquants?.length ?? 0;
    if (nbManuels > 0 || nbReleves > 0) {
      setFenetreValeursOuverte(true);
    } else {
      genererClasseur({});
    }
  }, [resultat, genererClasseur]);

  if (!session) {
    if (!etatAuth) return null; // bref instant de vérification, avant de savoir quoi afficher
    return <EcranConnexion etat={etatAuth} onConnecte={setSession} />;
  }

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
          {vue === "bordereau" && (
            <button type="button" className="bouton-accueil" onClick={() => setVue("parametres")}>
              ⚙ Paramètres
            </button>
          )}
          <MenuUtilisateur
            session={session}
            onParametres={() => setVue("parametres")}
            onUtilisateurs={() => setFenetreUtilisateursOuverte(true)}
            onJournal={() => setFenetreJournalOuverte(true)}
            onDeconnecter={seDeconnecter}
          />
        </div>
        {vue === "tresorerie" && (
          <nav className="entete__nav" aria-label="Étapes du module Trésorerie">
            <ol className="etapes">
              {ETAPES.map((etape) => {
                const faite =
                  (etape.id === "import" && fichiers.length > 0) ||
                  (etape.id === "traitement" && resultat !== null) ||
                  (etape.id === "resultats" && generation.etat === "succes");
                const active = etape.id === ecran;
                return (
                  <li key={etape.id}>
                    <button
                      type="button"
                      className={["onglet", active ? "onglet--actif" : "", faite ? "onglet--fait" : ""].join(" ").trim()}
                      aria-current={active ? "step" : undefined}
                      onClick={() => setEcran(etape.id)}
                    >
                      <span className="onglet__numero" aria-hidden="true">
                        {faite ? "✓" : etape.numero}
                      </span>
                      {etape.libelle}
                      {faite && <span className="visuellement-cache"> (terminé)</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
            <button
              type="button"
              className={ecran === "historique" ? "onglet onglet--actif onglet--droite" : "onglet onglet--droite"}
              aria-current={ecran === "historique" ? "page" : undefined}
              onClick={() => setEcran("historique")}
            >
              Historique
            </button>
          </nav>
        )}
      </header>

      <main className="contenu">
        {vue === "accueil" && (
          <Home
            onChoisirTresorerie={() => setVue("tresorerie")}
            onChoisirEtatsFinanciers={() => setVue("etatsFinanciers")}
            onChoisirBordereau={() => setVue("bordereau")}
            onChoisirBudget={() => setVue("budget")}
          />
        )}

        {vue === "etatsFinanciers" && (
          <WorkInProgress titre="États financiers" onRetourAccueil={() => setVue("accueil")} />
        )}

        {vue === "bordereau" && <ModuleBordereau />}

        {vue === "budget" && <BudgetDashboard onRetourAccueil={() => setVue("accueil")} />}

        {vue === "parametres" && <EcranParametres />}

        {vue === "tresorerie" && (
          <>
            {ecran === "import" && (
              <EcranImport
                fichiers={fichiers}
                onAjouter={ajouterFichiers}
                onRetirer={retirerFichier}
                onVider={viderFichiers}
                onLancer={lancerTraitement}
                dateClasseur={dateClasseur}
                onDateChange={setDateClasseur}
                dateUtilisable={dateUtilisable}
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
                onGenerer={demarrerGeneration}
                dateClasseur={dateClasseur}
                onDateChange={setDateClasseur}
                dateUtilisable={dateUtilisable}
              />
            )}
            {ecran === "historique" && <EcranHistorique />}
            {fenetreAgencesOuverte && resultat && (
              <FenetreAgencesAConfirmer
                fichiers={resultat.fichiers.filter(
                  (f) => f.type_detecte === "compte" && f.agence_detectee === null && f.niveau !== "bloquant",
                )}
                onAnnuler={() => setFenetreAgencesOuverte(false)}
                onConfirmer={confirmerAgences}
              />
            )}
            {fenetreValeursOuverte && resultat && (
              <FenetreValeursManuelles
                champs={resultat.champs_manuels_requis}
                relevesManquants={resultat.releves_manquants ?? []}
                valeursVeille={resultat.valeurs_veille_manuelles}
                onAnnuler={() => setFenetreValeursOuverte(false)}
                onConfirmer={(valeurs, relevesSaisis) => genererClasseur(valeurs, relevesSaisis)}
              />
            )}
          </>
        )}
      </main>

      {fenetreUtilisateursOuverte && (
        <FenetreUtilisateurs onFermer={() => setFenetreUtilisateursOuverte(false)} />
      )}
      {fenetreJournalOuverte && <FenetreJournal onFermer={() => setFenetreJournalOuverte(false)} />}
    </div>
  );
}
