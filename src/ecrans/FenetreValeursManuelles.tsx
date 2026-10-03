import { useState } from "react";
import { LIBELLE_CHAMP_MANUEL } from "../lib/champsManuels";
import type { ReleveManquant, RelevesVeille, ValeursManuelles } from "../lib/types";

interface Props {
  champs: string[];
  relevesManquants: ReleveManquant[];
  onAnnuler: () => void;
  onConfirmer: (valeurs: ValeursManuelles, relevesVeille: RelevesVeille) => void;
}

const formater = (montant: number) => `${montant.toLocaleString("fr-FR")} FCFA`;

/** Fenêtre unique affichée avant de générer le classeur (demande du 02/10/2026) :
 * liste tous les montants qu'Orisflow ne peut pas remplir seul ce jour-là (UV, UBA,
 * Ecobank, Access Bank, et Western Union seulement si son relevé est absent). Une
 * ligne laissée vide reste simplement inchangée depuis la veille, avec un avertissement
 * visible dans le résultat — elle ne bloque jamais la génération. */
export default function FenetreValeursManuelles({ champs, relevesManquants, onAnnuler, onConfirmer }: Props) {
  const [saisies, setSaisies] = useState<Record<string, string>>({});
  // Relevés manquants pour lesquels l'utilisateur accepte la valeur de la veille. Décochée par
  // défaut : Orisflow ne reprend jamais une valeur ancienne sans que l'utilisateur le dise.
  const [veilleChoisie, setVeilleChoisie] = useState<Record<string, boolean>>({});
  const relevesAvecVeille = relevesManquants.filter((r) => r.veille !== null);
  const relevesSansVeille = relevesManquants.filter((r) => r.veille === null);

  const confirmer = () => {
    const valeurs: ValeursManuelles = {};
    for (const champ of champs) {
      const texte = saisies[champ]?.trim();
      if (texte) {
        const nombre = Number(texte.replace(/\s/g, ""));
        if (!Number.isNaN(nombre)) valeurs[champ] = nombre;
      }
    }
    const relevesVeille: RelevesVeille = {};
    for (const releve of relevesAvecVeille) {
      if (veilleChoisie[releve.cle] && releve.veille !== null) relevesVeille[releve.cle] = releve.veille;
    }
    onConfirmer(valeurs, relevesVeille);
  };

  return (
    <div className="superposition" role="presentation">
      <div className="fenetre-modale" role="dialog" aria-modal="true" aria-labelledby="titre-valeurs-manuelles">
        <h2 id="titre-valeurs-manuelles">Montants à renseigner avant de générer</h2>

        {relevesManquants.length > 0 && (
          <section className="releves-manquants" aria-labelledby="titre-releves-manquants">
            <h3 id="titre-releves-manquants">Relevés absents aujourd'hui</h3>
            <p className="aide">
              Ces relevés bancaires n'ont pas été reçus. Faut-il considérer ceux de la veille ? Cochez seulement
              ceux pour lesquels vous le confirmez.
            </p>
            {relevesAvecVeille.map((releve) => (
              <div className="champ champ--case" key={releve.cle}>
                <input
                  id={`veille-${releve.cle}`}
                  type="checkbox"
                  checked={!!veilleChoisie[releve.cle]}
                  onChange={(e) => setVeilleChoisie((precedent) => ({ ...precedent, [releve.cle]: e.target.checked }))}
                />
                <label htmlFor={`veille-${releve.cle}`}>
                  {releve.libelle} : utiliser la valeur de la veille ({formater(releve.veille ?? 0)})
                </label>
              </div>
            ))}
            {relevesSansVeille.map((releve) => (
              <p className="aide" key={releve.cle}>
                {releve.libelle} : aucune valeur de la veille connue. La ligne reste inchangée.
              </p>
            ))}
          </section>
        )}

        {champs.length > 0 && (
          <p className="aide">
            Ces lignes ne sont pas lues automatiquement aujourd'hui. Laissez un champ vide pour garder la valeur
            d'hier (signalé dans le rapport).
          </p>
        )}

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
