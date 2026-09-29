import illustrationTresorerie from "../assets/illustration-tresorerie.png";
import illustrationEtatsFinanciers from "../assets/illustration-etats-financiers.png";

interface Props {
  onChoisirTresorerie: () => void;
  onChoisirEtatsFinanciers: () => void;
}

interface Carte {
  id: string;
  titre: string;
  description: string;
  illustration: string;
  onClick: () => void;
}

export default function Home({ onChoisirTresorerie, onChoisirEtatsFinanciers }: Props) {
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
      onClick: onChoisirEtatsFinanciers,
    },
  ];

  return (
    <section aria-labelledby="titre-accueil" className="accueil">
      <h1 id="titre-accueil" className="accueil__titre">
        Que voulez-vous faire aujourd'hui ?
      </h1>
      <p className="aide accueil__sous-titre">Choisissez un module pour commencer.</p>

      <div className="accueil__grille">
        {cartes.map((carte) => (
          <button key={carte.id} type="button" className="carte-module" onClick={carte.onClick}>
            <span className="carte-module__image-cadre">
              <img src={carte.illustration} alt="" className="carte-module__image" />
            </span>
            <span className="carte-module__titre">{carte.titre}</span>
            <span className="carte-module__description">{carte.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
