import { useFenetreModale } from "../lib/useFenetreModale";

interface Props {
  titre: string;
  message: string;
  libelleConfirmer: string;
  onConfirmer: () => void;
  onAnnuler: () => void;
}

/** Confirmation d'une action qu'on ne peut pas annuler d'un clic. Réutilisable : le titre, le
 * message et le libellé du bouton viennent de l'appelant. « Annuler » est le premier bouton :
 * le hook donne le focus au premier élément, donc le choix SÛR est celui sélectionné par défaut. */
export default function FenetreConfirmation({ titre, message, libelleConfirmer, onConfirmer, onAnnuler }: Props) {
  const fenetre = useFenetreModale<HTMLDivElement>(onAnnuler);
  return (
    <div className="superposition" role="presentation">
      <div
        ref={fenetre}
        className="fenetre-modale"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="titre-confirmation"
        aria-describedby="message-confirmation"
      >
        <h2 id="titre-confirmation">{titre}</h2>
        <p id="message-confirmation">{message}</p>
        <div className="actions">
          <button type="button" className="bouton" onClick={onAnnuler}>
            Annuler
          </button>
          <button type="button" className="bouton bouton--principal" onClick={onConfirmer}>
            {libelleConfirmer}
          </button>
        </div>
      </div>
    </div>
  );
}
