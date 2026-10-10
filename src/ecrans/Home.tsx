import type { ReactNode } from "react";
import illustrationTresorerie from "../assets/illustration-tresorerie.png";
import illustrationEtatsFinanciers from "../assets/illustration-etats-financiers.png";
import { IconeCourrier, IconeTeleversement } from "../lib/Icones";

interface Props {
  onChoisirTresorerie: () => void;
  onChoisirEtatsFinanciers: () => void;
  onChoisirBordereau: () => void;
  onChoisirBudget: () => void;
  onChoisirCloudBank: () => void;
}

interface Carte {
  id: string;
  titre: string;
  description: string;
  illustration?: string;
  // Pas encore d'illustration dédiée pour le bordereau (aucune image fournie au 30/09/2026) :
  // un symbole de repli, à remplacer facilement plus tard sans changer la mise en page.
  symboleDeRepli?: string;
  icone?: ReactNode;
  // Module pas encore utilisable : la carte reste cliquable mais l'annonce clairement.
  bientot?: boolean;
  onClick: () => void;
}

const ICONE_BUDGET = (
  <svg viewBox="0 0 48 48" width="56" height="56" aria-hidden="true" focusable="false">
    <rect x="6" y="26" width="8" height="14" rx="1.5" fill="currentColor" opacity="0.55" />
    <rect x="20" y="16" width="8" height="24" rx="1.5" fill="currentColor" opacity="0.8" />
    <rect x="34" y="8" width="8" height="32" rx="1.5" fill="currentColor" />
    <path d="M4 42h40" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

export default function Home({ onChoisirTresorerie, onChoisirEtatsFinanciers, onChoisirBordereau, onChoisirBudget, onChoisirCloudBank }: Props) {
  const cartes: Carte[] = [
    {
      id: "tresorerie",
      titre: "Suivi de la trésorerie",
      description: "Importer les extractions du jour, contrôler les agences et générer le classeur journalier.",
      illustration: illustrationTresorerie,
      onClick: onChoisirTresorerie,
    },
    {
      id: "etats-financiers",
      titre: "États financiers",
      description: "Bilan actif, bilan passif et comptes de résultat à partir de la balance comptable.",
      illustration: illustrationEtatsFinanciers,
      bientot: true,
      onClick: onChoisirEtatsFinanciers,
    },
    {
      id: "bordereau",
      titre: "Suivi Courrier",
      description: "Tracer la transmission d'un document à un collègue, avec accusé de réception et suivi du statut.",
      icone: <IconeCourrier />,
      onClick: onChoisirBordereau,
    },
    {
      id: "cloudbank",
      titre: "Téléverser sur CloudBank",
      description: "Préparer les écritures (petite caisse, salaires, extournes) à téléverser dans CloudBank, avec confirmation des comptes.",
      icone: <IconeTeleversement />,
      onClick: onChoisirCloudBank,
    },
    {
      id: "budget",
      titre: "Évaluation budgétaire",
      description: "Comparer prévisions et réalisations par catégorie (module en préparation, données fictives pour l'instant).",
      icone: ICONE_BUDGET,
      bientot: true,
      onClick: onChoisirBudget,
    },
  ];

  return (
    <section aria-labelledby="titre-accueil" className="accueil">
      <header className="accueil__bandeau">
        <h1 id="titre-accueil" className="accueil__titre">
          Que voulez-vous faire aujourd'hui ?
        </h1>
        <p className="accueil__sous-titre">Choisissez un module pour commencer.</p>
      </header>

      <div className="accueil__grille">
        {cartes.map((carte) => (
          <button key={carte.id} type="button" className="carte-module" onClick={carte.onClick}>
            <span className="carte-module__image-cadre">
              {carte.illustration ? (
                <img src={carte.illustration} alt="" className="carte-module__image" />
              ) : carte.icone ? (
                <span className="carte-module__symbole carte-module__symbole--icone">{carte.icone}</span>
              ) : (
                <span className="carte-module__symbole" aria-hidden="true">
                  {carte.symboleDeRepli}
                </span>
              )}
            </span>
            <span className="carte-module__titre">
              {carte.titre}
              {carte.bientot && <span className="carte-module__badge">Bientôt</span>}
            </span>
            <span className="carte-module__description">{carte.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
