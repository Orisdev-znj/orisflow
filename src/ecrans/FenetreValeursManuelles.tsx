import { useState } from "react";
import { LIBELLE_CHAMP_MANUEL } from "../lib/champsManuels";
import { formaterMontant, lireMontant } from "../lib/montants";
import type { ReleveManquant, RelevesSaisis, ValeursManuelles } from "../lib/types";
import { useFenetreModale } from "../lib/useFenetreModale";

interface Props {
  champs: string[];
  relevesManquants: ReleveManquant[];
  // Valeurs de la veille des champs manuels, lues dans le classeur de référence.
  valeursVeille?: Record<string, number>;
  onAnnuler: () => void;
  onConfirmer: (valeurs: ValeursManuelles, relevesSaisis: RelevesSaisis) => void;
}

function ChampMontant({
  id,
  libelle,
  veille,
  texte,
  onChange,
  placeholder,
}: {
  id: string;
  libelle: string;
  veille: number | null | undefined;
  texte: string;
  onChange: (texte: string) => void;
  placeholder: string;
}) {
  const { valeur, erreur } = lireMontant(texte);
  const idAide = `${id}-aide`;
  return (
    <div className="champ">
      <label htmlFor={id}>{libelle}</label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={texte}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={idAide}
      />
      <span id={idAide} className={erreur ? "champ__erreur" : "aide-inline"}>
        {erreur
          ? erreur
          : valeur !== null
            ? `Sera écrit : ${formaterMontant(valeur)}`
            : veille !== null && veille !== undefined
              ? `Vide : la valeur de la veille (${formaterMontant(veille)}) est conservée.`
              : "Vide : la valeur de la veille est conservée."}
      </span>
    </div>
  );
}

/** Fenêtre unique affichée avant de générer le classeur.
 * - Relevés absents aujourd'hui : la valeur de la veille est conservée si le champ reste vide
 *   ou si l'utilisateur clique sur « Passer ».
 * - Montants non lus automatiquement (UV, UBA, Ecobank, Access Bank…) : un champ vide garde la
 *   valeur de la veille. Une saisie illisible est signalée et empêche de générer, au lieu
 *   d'être ignorée en silence. */
export default function FenetreValeursManuelles({ champs, relevesManquants, valeursVeille = {}, onAnnuler, onConfirmer }: Props) {
  const [saisies, setSaisies] = useState<Record<string, string>>({});
  const [releves, setReleves] = useState<Record<string, string>>({});
  const fenetre = useFenetreModale<HTMLDivElement>(onAnnuler);

  const nbErreurs =
    champs.filter((c) => lireMontant(saisies[c]).erreur).length +
    relevesManquants.filter((r) => lireMontant(releves[r.cle]).erreur).length;

  const confirmer = (passer = false) => {
    const valeurs: ValeursManuelles = {};
    const relevesSaisis: RelevesSaisis = {};
    if (!passer) {
      for (const champ of champs) {
        const { valeur } = lireMontant(saisies[champ]);
        if (valeur !== null) valeurs[champ] = valeur;
      }
      for (const releve of relevesManquants) {
        const { valeur } = lireMontant(releves[releve.cle]);
        if (valeur !== null) relevesSaisis[releve.cle] = valeur;
      }
    }
    onConfirmer(valeurs, relevesSaisis);
  };

  return (
    <div className="superposition" role="presentation">
      <div
        ref={fenetre}
        className="fenetre-modale"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titre-valeurs-manuelles"
      >
        <h2 id="titre-valeurs-manuelles">Montants à renseigner avant de générer</h2>

        {relevesManquants.length > 0 && (
          <section className="releves-manquants" aria-labelledby="titre-releves-manquants">
            <h3 id="titre-releves-manquants">Relevés absents aujourd'hui</h3>
            <p className="aide">
              Ces relevés n'ont pas été reçus. Saisissez leur solde du jour, ou laissez vide pour conserver la valeur
              de la veille.
            </p>
            {relevesManquants.map((releve) => (
              <ChampMontant
                key={releve.cle}
                id={`releve-${releve.cle}`}
                libelle={releve.libelle}
                veille={releve.veille}
                texte={releves[releve.cle] ?? ""}
                onChange={(texte) => setReleves((precedent) => ({ ...precedent, [releve.cle]: texte }))}
                placeholder="Solde du jour en FCFA"
              />
            ))}
          </section>
        )}

        {champs.length > 0 && (
          <>
            <p className="aide">Ces lignes ne sont pas lues automatiquement. Laissez vide pour garder la valeur d'hier.</p>
            {champs.map((champ) => (
              <ChampMontant
                key={champ}
                id={`champ-manuel-${champ}`}
                libelle={LIBELLE_CHAMP_MANUEL[champ] ?? champ}
                veille={valeursVeille[champ]}
                texte={saisies[champ] ?? ""}
                onChange={(texte) => setSaisies((precedent) => ({ ...precedent, [champ]: texte }))}
                placeholder="Montant en FCFA"
              />
            ))}
          </>
        )}

        {nbErreurs > 0 && (
          <p role="alert" className="message message--erreur">
            {nbErreurs === 1 ? "Un montant n'est pas reconnu" : `${nbErreurs} montants ne sont pas reconnus`} : corrigez-le
            {nbErreurs > 1 ? "s" : ""} avant de générer.
          </p>
        )}

        <div className="actions">
          <button
            type="button"
            className="bouton bouton--principal"
            onClick={() => confirmer(false)}
            disabled={nbErreurs > 0}
          >
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
