import { useState } from "react";
import { LIBELLE_CHAMP_MANUEL } from "../lib/champsManuels";
import type { ValeursManuelles } from "../lib/types";

interface Props {
  champs: string[];
  onAnnuler: () => void;
  onConfirmer: (valeurs: ValeursManuelles) => void;
}

/** Fenêtre unique affichée avant de générer le classeur (demande du 02/10/2026) :
 * liste tous les montants qu'Orisflow ne peut pas remplir seul ce jour-là (UV, UBA,
 * Ecobank, Access Bank, et Western Union seulement si son relevé est absent). Une
 * ligne laissée vide reste simplement inchangée depuis la veille, avec un avertissement
 * visible dans le résultat — elle ne bloque jamais la génération. */
export default function FenetreValeursManuelles({ champs, onAnnuler, onConfirmer }: Props) {
  const [saisies, setSaisies] = useState<Record<string, string>>({});

  const confirmer = () => {
    const valeurs: ValeursManuelles = {};
    for (const champ of champs) {
      const texte = saisies[champ]?.trim();
      if (texte) {
        const nombre = Number(texte.replace(/\s/g, ""));
        if (!Number.isNaN(nombre)) valeurs[champ] = nombre;
      }
    }
    onConfirmer(valeurs);
  };

  return (
    <div className="superposition" role="presentation">
      <div className="fenetre-modale" role="dialog" aria-modal="true" aria-labelledby="titre-valeurs-manuelles">
        <h2 id="titre-valeurs-manuelles">Montants à renseigner avant de générer</h2>
        <p className="aide">
          Ces lignes ne sont pas lues automatiquement aujourd'hui. Laissez un champ vide pour garder la valeur
          d'hier (signalé dans le rapport).
        </p>

        {champs.map((champ) => (
          <div className="champ" key={champ}>
            <label htmlFor={`champ-manuel-${champ}`}>{LIBELLE_CHAMP_MANUEL[champ] ?? champ}</label>
            <input
              id={`champ-manuel-${champ}`}
              type="text"
              inputMode="numeric"
              value={saisies[champ] ?? ""}
              onChange={(e) => setSaisies((precedent) => ({ ...precedent, [champ]: e.target.value }))}
              placeholder="Montant en FCFA"
            />
          </div>
        ))}

        <div className="actions">
          <button type="button" className="bouton bouton--principal" onClick={confirmer}>
            Confirmer et générer
          </button>
          <button type="button" className="bouton" onClick={onAnnuler}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
