import { aujourdhuiISO, dateValide, estWeekEnd, formaterDateLongue, hierISO } from "../lib/dates";

interface Props {
  id: string;
  valeur: string;
  onChange: (valeur: string) => void;
}

/** Choix du jour couvert par le classeur. Proposé sur « hier » ; modifiable pour un lundi, un
 * jour férié ou un rattrapage. Le jour de la semaine est écrit en toutes lettres. */
export default function ChampDateClasseur({ id, valeur, onChange }: Props) {
  const valide = dateValide(valeur);
  const futur = valide && valeur > aujourdhuiISO();
  const idAide = `${id}-aide`;
  return (
    <div className="champ champ--date">
      <label htmlFor={id}>Date du classeur</label>
      <div className="champ__ligne">
        <input
          id={id}
          type="date"
          value={valeur}
          max={aujourdhuiISO()}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!valide || futur ? true : undefined}
          aria-describedby={idAide}
        />
        {valeur !== hierISO() && (
          <button type="button" className="bouton bouton--lien" onClick={() => onChange(hierISO())}>
            Revenir à hier
          </button>
        )}
      </div>
      <span id={idAide} className={!valide || futur ? "champ__erreur" : "aide-inline"}>
        {!valide
          ? "Choisissez une date."
          : futur
            ? "Cette date est dans le futur : choisissez un jour déjà écoulé."
            : `${formaterDateLongue(valeur)}${estWeekEnd(valeur) ? " — week-end : vérifiez que c'est bien le jour à traiter." : ""}`}
      </span>
    </div>
  );
}
