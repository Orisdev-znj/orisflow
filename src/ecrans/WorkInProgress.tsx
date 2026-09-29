interface Props {
  titre: string;
  onRetourAccueil: () => void;
}

export default function WorkInProgress({ titre, onRetourAccueil }: Props) {
  return (
    <section aria-labelledby="titre-wip" className="en-construction">
      <div className="en-construction__pastille" aria-hidden="true">
        🚧
      </div>
      <h1 id="titre-wip">{titre}</h1>
      <p className="message message--avertissement" role="status">
        Module {titre} : en cours de développement.
      </p>
      <p className="aide">Revenez plus tard, ou choisissez un autre module.</p>
      <div className="actions">
        <button type="button" className="bouton bouton--principal" onClick={onRetourAccueil}>
          Retour à l'accueil
        </button>
      </div>
    </section>
  );
}
