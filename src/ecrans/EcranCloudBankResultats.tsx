import { useState } from "react";
import { traduireAvertissement } from "../lib/cloudbankCas";
import { nettoyerErreur } from "../lib/format";
import { formaterMontant } from "../lib/montants";
import type { ResultatEcritureCloudBank } from "../lib/types";

interface Props {
  resultat: ResultatEcritureCloudBank;
  onNouveau: () => void;
}

/** Écran 4 : totaux, avertissements en français simple (jamais le texte technique du moteur),
 * et accès au fichier. Un fichier existant n'est jamais écrasé. */
export default function EcranCloudBankResultats({ resultat, onNouveau }: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const phrases = Array.from(
    new Set(resultat.avertissements.map(traduireAvertissement).filter((p): p is string => p !== null)),
  );

  const ouvrir = async (mode: "fichier" | "dossier") => {
    setErreur(null);
    try {
      const reponse = await window.orisflow?.ouvrirResultat(resultat.fichier, mode);
      if (reponse && !reponse.ok) setErreur(reponse.erreur ?? "Ouverture impossible.");
    } catch (e) {
      setErreur(nettoyerErreur(e));
    }
  };

  return (
    <section aria-labelledby="titre-cloudbank-resultats" className="cloudbank-resultats">
      <h1 id="titre-cloudbank-resultats">Résultats</h1>

      <p role="status" className="message message--succes">Le fichier a été généré. Aucun fichier existant n'a été remplacé.</p>
      <p className="cloudbank-chemin" title={resultat.fichier}>{resultat.fichier}</p>

      <table className="tableau">
        <thead>
          <tr><th>Feuille</th><th>Lignes</th><th>Total débit</th><th>Total crédit</th><th>Écart</th></tr>
        </thead>
        <tbody>
          {resultat.feuilles.map((f) => (
            <tr key={f.feuille}>
              <td>{f.feuille}</td>
              <td>{f.lignes_ecriture ?? f.lignes}</td>
              <td>{formaterMontant(f.total_debit)}</td>
              <td>{formaterMontant(f.total_credit)}</td>
              <td className={f.ecart === 0 ? "controle--ok" : "controle--bloquant"}>
                {f.ecart === 0 ? "✓ équilibré" : `✗ ${formaterMontant(f.ecart)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {phrases.map((phrase) => (
        <p key={phrase} role="status" className="message message--avertissement">{phrase}</p>
      ))}

      {erreur && <p role="alert" className="message message--erreur">{erreur}</p>}

      <div className="actions">
        <button type="button" className="bouton bouton--principal" onClick={() => ouvrir("dossier")}>Ouvrir le dossier</button>
        <button type="button" className="bouton" onClick={() => ouvrir("fichier")}>Ouvrir le fichier</button>
        <button type="button" className="bouton bouton--lien" onClick={onNouveau}>Nouveau document</button>
      </div>
    </section>
  );
}
