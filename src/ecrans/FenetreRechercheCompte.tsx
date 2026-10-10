import { useState } from "react";
import { nettoyerErreur } from "../lib/format";
import type { ResultatRechercheCompte } from "../lib/types";
import { useFenetreModale } from "../lib/useFenetreModale";

interface Props {
  libelle: string;
  // Compte proposé, quand on corrige une ligne « à confirmer » (la recherche part alors du libellé).
  comptePropose?: string | null;
  onChoisir: (compte: string, intitule: string, memoriser: boolean) => void;
  onExclure: () => void;
  onFermer: () => void;
}

/** Recherche d'un compte : on choisit dans une liste, jamais de saisie d'un numéro à 13 chiffres. */
export default function FenetreRechercheCompte({ libelle, comptePropose, onChoisir, onExclure, onFermer }: Props) {
  const fenetre = useFenetreModale<HTMLDivElement>(onFermer);
  const [texte, setTexte] = useState(libelle);
  const [resultat, setResultat] = useState<ResultatRechercheCompte | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [memoriser, setMemoriser] = useState(false);

  const chercher = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!window.orisflow || !texte.trim()) return;
    setEnCours(true);
    setErreur(null);
    try {
      setResultat(await window.orisflow.cloudbankRechercher(texte));
    } catch (erreurIpc) {
      setErreur(nettoyerErreur(erreurIpc));
    } finally {
      setEnCours(false);
    }
  };

  const aucun = resultat && resultat.cloudbank.length === 0 && resultat.pcemf.length === 0;

  return (
    <div className="superposition" role="presentation">
      <div ref={fenetre} className="fenetre-modale" role="dialog" aria-modal="true" aria-labelledby="titre-recherche-compte">
        <h2 id="titre-recherche-compte">Rechercher un compte</h2>
        <p className="aide">
          Ligne : « {libelle} »{comptePropose ? ` — compte proposé : ${comptePropose}` : ""}
        </p>

        <form onSubmit={chercher} className="champ">
          <label htmlFor="recherche-compte-texte">Mots à chercher</label>
          <div className="champ__ligne">
            <input id="recherche-compte-texte" type="text" value={texte} onChange={(e) => setTexte(e.target.value)} />
            <button type="submit" className="bouton bouton--principal" disabled={enCours || !texte.trim()}>
              {enCours ? "Recherche…" : "Rechercher"}
            </button>
          </div>
        </form>

        {erreur && (
          <p role="alert" className="message message--erreur">
            {erreur}
          </p>
        )}

        {resultat && !aucun && (
          <ul className="cloudbank-resultats-recherche" aria-label="Comptes trouvés">
            {resultat.cloudbank.map((c) => (
              <li key={c.code}>
                <button type="button" className="bouton bouton--lien" onClick={() => onChoisir(c.code, c.intitule, memoriser)}>
                  {c.code} — {c.intitule}
                </button>
              </li>
            ))}
            {resultat.pcemf.flatMap((p) =>
              p.comptes_cloudbank.map((c) => (
                <li key={`${p.code_pcemf}-${c.code}`}>
                  <button type="button" className="bouton bouton--lien" onClick={() => onChoisir(c.code, c.intitule, memoriser)}>
                    {c.code} — {c.intitule}
                  </button>
                  <span className="aide-inline"> (plan comptable : {p.libelle_pcemf})</span>
                </li>
              )),
            )}
          </ul>
        )}
        {aucun && <p className="vide">Aucun compte trouvé. Essayez d'autres mots, ou signalez la ligne pour plus tard.</p>}

        <label className="cloudbank-memoriser">
          <input type="checkbox" checked={memoriser} onChange={(e) => setMemoriser(e.target.checked)} /> Retenir ce choix
          pour les prochains documents (le même libellé sera alors reconnu)
        </label>

        <div className="actions">
          <button type="button" className="bouton bouton--lien" onClick={onExclure}>
            Signaler cette ligne pour traitement manuel plus tard
          </button>
          <button type="button" className="bouton" onClick={onFermer}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
