import { useState } from "react";
import { AGENCES_RESEAU } from "../lib/agences";
import type { FichierClasse } from "../lib/types";

interface Props {
  fichiers: FichierClasse[];
  onAnnuler: () => void;
  onConfirmer: (choix: Record<string, string>) => void;
}

/** Fenêtre « Agence à confirmer » (demande du 03/10/2026) : une liste de comptes n'a pu être
 * rattachée à une agence ni par le nom, ni par comparaison avec la veille, ni par la table des
 * les numéros de compte. Orisflow vous la demande ici plutôt que de la classer au hasard. */
export default function FenetreAgencesAConfirmer({ fichiers, onAnnuler, onConfirmer }: Props) {
  const [choix, setChoix] = useState<Record<string, string>>({});

  const confirmer = () => {
    const resultat: Record<string, string> = {};
    for (const [chemin, agence] of Object.entries(choix)) {
      if (agence) resultat[chemin] = agence;
    }
    onConfirmer(resultat);
  };

  return (
    <div className="superposition" role="presentation">
      <div className="fenetre-modale" role="dialog" aria-modal="true" aria-labelledby="titre-agences-confirmer">
        <h2 id="titre-agences-confirmer">Agence à confirmer</h2>
        <p className="aide">
          Ces listes de comptes n'ont pas pu être rattachées à une agence automatiquement. Choisissez l'agence
          de chacune ; laissez vide celles que vous ne connaissez pas encore.
        </p>

        {fichiers.map((fichier) => (
          <div className="champ" key={fichier.chemin}>
            <label htmlFor={`agence-${fichier.chemin}`}>
              {fichier.nom}
              {fichier.total_comptes !== null && <span className="aide-inline"> ({fichier.total_comptes} comptes)</span>}
            </label>
            <select
              id={`agence-${fichier.chemin}`}
              value={choix[fichier.chemin] ?? ""}
              onChange={(e) => setChoix((precedent) => ({ ...precedent, [fichier.chemin]: e.target.value }))}
            >
              <option value="">— à choisir —</option>
              {AGENCES_RESEAU.map((agence) => (
                <option key={agence.cle} value={agence.cle}>
                  {agence.libelle}
                </option>
              ))}
            </select>
          </div>
        ))}

        <div className="actions">
          <button type="button" className="bouton bouton--principal" onClick={confirmer}>
            Confirmer
          </button>
          <button type="button" className="bouton" onClick={onAnnuler}>
            Plus tard
          </button>
        </div>
      </div>
    </div>
  );
}
