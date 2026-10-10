import { useMemo, useState } from "react";
import { AGENCES_CLOUDBANK, MOIS_FR } from "../lib/cloudbankAgences";
import type { CasUsage } from "../lib/cloudbankCas";
import { nettoyerErreur } from "../lib/format";
import { formaterMontant, lireMontant } from "../lib/montants";
import type { DonneesEcritureCloudBank, LigneMapping, ResultatEcritureCloudBank, ResultatImportMapping } from "../lib/types";
import FenetreRechercheCompte from "./FenetreRechercheCompte";

interface Props {
  cas: CasUsage;
  donnees: ResultatImportMapping;
  onGenere: (resultat: ResultatEcritureCloudBank) => void;
}

// Décision de l'utilisateur sur une ligne. Rien n'est jamais confirmé en silence : une ligne
// « à confirmer » reste en attente tant qu'on ne l'a pas validée ou corrigée.
interface Decision {
  compte: string | null;
  intitule: string | null;
  confirmee: boolean;
  exclue: boolean;
}

function decisionInitiale(ligne: LigneMapping): Decision {
  return { compte: ligne.compte, intitule: ligne.intitule, confirmee: ligne.statut === "valide", exclue: false };
}

const ETIQUETTE_STATUT = { valide: "Validé", a_confirmer: "À confirmer", non_trouve: "Non trouvé" } as const;
const CLASSE_STATUT = { valide: "info", a_confirmer: "avertissement", non_trouve: "bloquant" } as const;

/** Écran 3 : une ligne par dépense. Vert = rien à faire ; orange = à valider ou corriger (la source
 * du compte proposé est toujours affichée) ; rouge = compte à chercher dans la liste. */
export default function EcranCloudBankMapping({ cas, donnees, onGenere }: Props) {
  const [decisions, setDecisions] = useState<Record<number, Decision>>(() =>
    Object.fromEntries(donnees.lignes.map((l) => [l.id, decisionInitiale(l)])),
  );
  const [recherche, setRecherche] = useState<LigneMapping | null>(null);
  const [agence, setAgence] = useState(donnees.contexte.agence ?? "");
  const [mois, setMois] = useState(donnees.contexte.mois ?? "");
  const [annee, setAnnee] = useState(donnees.contexte.annee ?? "");
  const [retourOui, setRetourOui] = useState(false);
  const [retourTexte, setRetourTexte] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const petiteCaisse = cas.modele === "petite_caisse";
  const retour = lireMontant(retourTexte);

  const etat = (ligne: LigneMapping): "valide" | "a_confirmer" | "non_trouve" | "exclue" => {
    const d = decisions[ligne.id];
    if (d.exclue) return "exclue";
    if (!d.compte) return "non_trouve";
    return d.confirmee ? "valide" : "a_confirmer";
  };

  const compteurs = useMemo(() => {
    const c = { valide: 0, a_confirmer: 0, non_trouve: 0, exclue: 0 };
    for (const l of donnees.lignes) c[etat(l)] += 1;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisions, donnees.lignes]);

  const modifier = (id: number, changement: Partial<Decision>) =>
    setDecisions((precedent) => ({ ...precedent, [id]: { ...precedent[id], ...changement } }));

  const toutConfirmer = () =>
    setDecisions((precedent) =>
      Object.fromEntries(
        donnees.lignes.map((l) => [l.id, precedent[l.id].compte && !precedent[l.id].exclue ? { ...precedent[l.id], confirmee: true } : precedent[l.id]]),
      ),
    );

  const choisirCompte = async (ligne: LigneMapping, compte: string, intitule: string, memoriser: boolean) => {
    setRecherche(null);
    setErreur(null);
    try {
      // Le moteur contrôle le compte ; l'enregistrement dans les référentiels n'a lieu que si l'utilisateur l'a coché.
      await window.orisflow?.cloudbankConfirmerLigne({ compte, libelle: ligne.libelle, intitule, enregistrer: memoriser });
      modifier(ligne.id, { compte, intitule, confirmee: true, exclue: false });
    } catch (e) {
      setErreur(nettoyerErreur(e));
    }
  };

  const lignesActives = donnees.lignes.filter((l) => etat(l) !== "exclue");
  const montantsManquants = lignesActives.filter((l) => l.montant === null || l.montant <= 0).length;
  const peutGenerer =
    compteurs.non_trouve === 0 && compteurs.a_confirmer === 0 && lignesActives.length > 0 && montantsManquants === 0 &&
    agence !== "" && mois !== "" && /^\d{4}$/.test(annee) && !(petiteCaisse && retourOui && (retour.valeur === null || retour.valeur <= 0));

  const generer = async () => {
    if (!window.orisflow) return;
    setEnCours(true);
    setErreur(null);
    const lignes: DonneesEcritureCloudBank["lignes"] = lignesActives.map((l) => {
      const d = decisions[l.id];
      const base = { compte: d.compte as string, intitule: d.intitule, libelle: l.libelle };
      if (petiteCaisse) return { ...base, montant: l.montant };
      return l.sens === "credit" ? { ...base, credit: l.montant, agence: Number(agence) } : { ...base, debit: l.montant, agence: Number(agence) };
    });
    try {
      const resultat = await window.orisflow.cloudbankEcrire({
        modele: cas.modele ?? "petite_caisse", lignes, agence: Number(agence), mois, annee,
        retour: petiteCaisse && retourOui ? (retour.valeur ?? 0) : 0,
      });
      onGenere(resultat);
    } catch (e) {
      setErreur(nettoyerErreur(e));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <section aria-labelledby="titre-cloudbank-mapping" className="cloudbank-mapping">
      <h1 id="titre-cloudbank-mapping">Confirmer le mapping</h1>

      <ul className="resume" aria-label="Résumé du mapping">
        <li className="resume__case resume__case--info"><span className="resume__nombre">{compteurs.valide}</span><span className="resume__libelle">✓ validées</span></li>
        <li className="resume__case resume__case--avertissement"><span className="resume__nombre">{compteurs.a_confirmer}</span><span className="resume__libelle">⚠ à confirmer</span></li>
        <li className="resume__case resume__case--bloquant"><span className="resume__nombre">{compteurs.non_trouve}</span><span className="resume__libelle">✕ non trouvées</span></li>
        {compteurs.exclue > 0 && (
          <li className="resume__case"><span className="resume__nombre">{compteurs.exclue}</span><span className="resume__libelle">à traiter plus tard</span></li>
        )}
      </ul>

      <div className="actions">
        <button type="button" className="bouton" onClick={toutConfirmer} disabled={compteurs.valide + compteurs.a_confirmer === 0}>
          Tout confirmer (sauf les lignes non trouvées)
        </button>
      </div>

      <table className="tableau">
        <thead>
          <tr><th>Libellé</th><th>Montant</th><th>Compte proposé</th><th>Statut</th><th aria-label="Actions" /></tr>
        </thead>
        <tbody>
          {donnees.lignes.map((l) => {
            const e = etat(l);
            const d = decisions[l.id];
            return (
              <tr key={l.id} className={e === "exclue" ? "cloudbank-ligne--exclue" : undefined}>
                <td>{l.libelle}</td>
                <td>{l.montant === null ? "—" : formaterMontant(l.montant)}</td>
                <td>
                  {d.compte ? (
                    <>
                      {d.compte} — {d.intitule ?? "intitulé inconnu"}
                      {l.source && <span className="aide-inline"> ({l.source})</span>}
                      {l.avertissement_agence && <span className="aide-inline"> — compte à vérifier pour cette agence</span>}
                    </>
                  ) : (
                    "—"
                  )}
                  {l.avertissement && <div className="champ__erreur">{l.avertissement}</div>}
                </td>
                <td>
                  <span className={`badge badge--${e === "exclue" ? "info" : CLASSE_STATUT[e]}`}>
                    {e === "exclue" ? "Plus tard" : ETIQUETTE_STATUT[e]}
                  </span>
                </td>
                <td className="tableau__action">
                  {e === "a_confirmer" && (
                    <>
                      <button type="button" className="bouton bouton--lien" onClick={() => modifier(l.id, { confirmee: true })}>Confirmer</button>
                      <button type="button" className="bouton bouton--lien" onClick={() => setRecherche(l)}>Corriger</button>
                    </>
                  )}
                  {e === "non_trouve" && (
                    <button type="button" className="bouton bouton--lien" onClick={() => setRecherche(l)}>Rechercher un compte</button>
                  )}
                  {e === "exclue" && (
                    <button type="button" className="bouton bouton--lien" onClick={() => modifier(l.id, { exclue: false })}>Reprendre</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>Informations du fichier</h2>
      <div className="cloudbank-contexte">
        <div className="champ">
          <label htmlFor="cloudbank-agence">Agence</label>
          <select id="cloudbank-agence" value={agence} onChange={(ev) => setAgence(ev.target.value)}>
            <option value="">— choisir —</option>
            {AGENCES_CLOUDBANK.map((a) => <option key={a.code} value={a.code}>{a.libelle}</option>)}
          </select>
        </div>
        <div className="champ">
          <label htmlFor="cloudbank-mois">Mois</label>
          <select id="cloudbank-mois" value={mois} onChange={(ev) => setMois(ev.target.value)}>
            <option value="">— choisir —</option>
            {MOIS_FR.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="champ">
          <label htmlFor="cloudbank-annee">Année</label>
          <input id="cloudbank-annee" type="text" inputMode="numeric" maxLength={4} value={annee} onChange={(ev) => setAnnee(ev.target.value)} />
        </div>
      </div>

      {petiteCaisse && (
        <fieldset className="cloudbank-retour">
          <legend>Y a-t-il un retour de caisse à effectuer ?</legend>
          <label><input type="radio" name="retour" checked={!retourOui} onChange={() => setRetourOui(false)} /> Non</label>{" "}
          <label><input type="radio" name="retour" checked={retourOui} onChange={() => setRetourOui(true)} /> Oui</label>
          {retourOui && (
            <div className="champ">
              <label htmlFor="cloudbank-retour-montant">Montant du retour de caisse (FCFA)</label>
              <input id="cloudbank-retour-montant" type="text" inputMode="decimal" value={retourTexte} onChange={(ev) => setRetourTexte(ev.target.value)} />
              {retour.erreur && <span className="champ__erreur">{retour.erreur}</span>}
            </div>
          )}
        </fieldset>
      )}

      {erreur && <p role="alert" className="message message--erreur">{erreur}</p>}

      <div className="actions">
        <button type="button" className="bouton bouton--principal" onClick={generer} disabled={!peutGenerer || enCours}>
          {enCours ? "Génération…" : "Générer le fichier"}
        </button>
      </div>
      {!peutGenerer && (
        <p className="aide">
          {compteurs.non_trouve > 0 || compteurs.a_confirmer > 0
            ? "Le fichier peut être généré quand toutes les lignes sont validées ou signalées pour plus tard."
            : montantsManquants > 0
              ? "Une ligne n'a pas de montant lisible : corrigez le fichier d'origine."
              : "Complétez l'agence, le mois et l'année (et le montant du retour de caisse s'il y en a un)."}
        </p>
      )}

      {recherche && (
        <FenetreRechercheCompte
          libelle={recherche.libelle}
          comptePropose={decisions[recherche.id].compte}
          onChoisir={(compte, intitule, memoriser) => choisirCompte(recherche, compte, intitule, memoriser)}
          onExclure={() => {
            modifier(recherche.id, { exclue: true });
            setRecherche(null);
          }}
          onFermer={() => setRecherche(null)}
        />
      )}
    </section>
  );
}
