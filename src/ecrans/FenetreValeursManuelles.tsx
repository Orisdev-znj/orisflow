import { useState } from "react";
import { LIBELLE_CHAMP_MANUEL } from "../lib/champsManuels";
import type { ReleveManquant, RelevesSaisis, ValeursManuelles } from "../lib/types";

interface Props {
  champs: string[];
  relevesManquants: ReleveManquant[];
  onAnnuler: () => void;
  onConfirmer: (valeurs: ValeursManuelles, relevesSaisis: RelevesSaisis) => void;
}

const formater = (montant: number) => `${montant.toLocaleString("fr-FR")} FCFA`;

/** Fenêtre unique affichée avant de générer le classeur.
 * - Relevés absents aujourd'hui (règle du 05/10/2026) : la valeur de la veille est conservée. L'utilisateur
 *   peut saisir le solde du jour ; s'il laisse le champ vide ou clique sur « Passer », la veille est maintenue.
 * - Montants non lisibles automatiquement (UV, UBA, Ecobank, Access Bank…) : un champ vide garde la
 *   valeur de la veille, avec un avertissement dans le résultat. Aucun champ ne bloque la génération. */
export default function FenetreValeursManuelles({ champs, relevesManquants, onAnnuler, onConfirmer }: Props) {
  const [saisies, setSaisies] = useState<Record<string, string>>({});
  const [releves, setReleves] = useState<Record<string, string>>({});

  const lireNombre = (texte: string | undefined): number | null => {
    const propre = texte?.trim();
    if (!propre) return null;
    const nombre = Number(propre.replace(/\s/g, ""));
    return Number.isNaN(nombre) ? null : nombre;
  };

  const confirmer = (passer = false) => {
    const valeurs: ValeursManuelles = {};
    const relevesSaisis: RelevesSaisis = {};
    if (!passer) {
      for (const champ of champs) {
        const nombre = lireNombre(saisies[champ]);
        if (nombre !== null) valeurs[champ] = nombre;
      }
      for (const releve of relevesManquants) {
        const nombre = lireNombre(releves[releve.cle]);
        if (nombre !== null) relevesSaisis[releve.cle] = nombre;
      }
    }
    onConfirmer(valeurs, relevesSaisis);
  };

  return (
    <div className="superposition" role="presentation">
      <div className="fenetre-modale" role="dialog" aria-modal="true" aria-labelledby="titre-valeurs-manuelles">
        <h2 id="titre-valeurs-manuelles">Montants à renseigner avant de générer</h2>

        {relevesManquants.length > 0 && (
          <section className="releves-manquants" aria-labelledby="titre-releves-manquants">
            <h3 id="titre-releves-manquants">Relevés absents aujourd'hui</h3>
            <p className="aide">
              Ces relevés n'ont pas été reçus. Saisissez leur solde du jour. Si vous laissez le champ vide ou si
              vous cliquez sur « Passer », la valeur de la veille est conservée.
            </p>
            {relevesManquants.map((releve) => (
              <div className="champ" key={releve.cle}>
                <label htmlFor={`releve-${releve.cle}`}>
                  {releve.libelle}
                  {releve.veille !== null ? ` (veille : ${formater(releve.veille)})` : " (aucune valeur de la veille connue)"}
                </label>
                <input
                  id={`releve-${releve.cle}`}
                  type="text"
                  inputMode="numeric"
                  value={releves[releve.cle] ?? ""}
                  onChange={(e) => setReleves((precedent) => ({ ...precedent, [releve.cle]: e.target.value }))}
                  placeholder="Solde du jour en FCFA"
                />
              </div>
            ))}
          </section>
        )}

        {champs.length > 0 && (
          <>
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
          </>
        )}

        <div className="actions">
          <button type="button" className="bouton bouton--principal" onClick={() => confirmer(false)}>
            Confirmer et générer
          </button>
          {relevesManquants.length > 0 && (
            <button type="button" className="bouton" onClick={() => confirmer(true)}>
              Passer
            </button>
          )}
          <button type="button" className="bouton" onClick={onAnnuler}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
