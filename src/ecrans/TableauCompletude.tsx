import { AGENCES_RESEAU } from "../lib/agences";
import type { FichierClasse } from "../lib/types";

interface Props {
  fichiers: FichierClasse[];
}

/** Un fichier « présent » pour une agence et un type donnés : reconnu, pas en anomalie
 * bloquante (un fichier rejeté ne compte pas comme reçu). */
function present(fichiers: FichierClasse[], cle: string, type: string): boolean {
  return fichiers.some((f) => f.agence_detectee === cle && f.type_detecte === type && f.niveau !== "bloquant");
}

/** Récapitulatif de complétude des documents attendus, avant génération (demande du
 * 30/09/2026 : « un moyen de voir d'un coup d'œil ce qui a été reconnu »). Purement
 * informatif — ne bloque pas la génération, qui reste possible même incomplète (comme
 * aujourd'hui à la main). Calculé côté écran, à partir du classement déjà reçu du moteur :
 * aucun nouvel échange n'est nécessaire avec le moteur Python. */
export default function TableauCompletude({ fichiers }: Props) {
  const lignes = AGENCES_RESEAU.map(({ cle, libelle }) => ({
    cle,
    libelle,
    compte: present(fichiers, cle, "compte"),
    classe3: present(fichiers, cle, "balance_classe3"),
    classe5: present(fichiers, cle, "balance_classe5"),
  }));

  const complet = (l: (typeof lignes)[number]) => l.compte && l.classe3 && l.classe5;
  const nbCompletes = lignes.filter(complet).length;

  const banques = ["releve_cca", "releve_bgfi"] as const;
  const libellesBanques: Record<(typeof banques)[number], string> = {
    releve_cca: "CCA-Bank",
    releve_bgfi: "BGFI",
  };
  const nbRelevesBanques = banques.reduce(
    (total, type) => total + fichiers.filter((f) => f.type_detecte === type && f.niveau !== "bloquant").length,
    0,
  );

  return (
    <details className="completude" open>
      <summary>
        Complétude des documents reçus — {nbCompletes}/{AGENCES_RESEAU.length} agences au complet (comptes +
        classe 3 + classe 5)
      </summary>

      <table className="tableau tableau--compact">
        <thead>
          <tr>
            <th>Agence</th>
            <th>Comptes</th>
            <th>Classe 3 (dépôts/engagements)</th>
            <th>Classe 5 (caisse)</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.cle}>
              <td>{l.libelle}</td>
              <td>{l.compte ? "✓" : "—"}</td>
              <td>{l.classe3 ? "✓" : "—"}</td>
              <td>{l.classe5 ? "✓" : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="aide">
        Relevés bancaires reçus : {nbRelevesBanques} ({Object.values(libellesBanques).join(", ")} uniquement pour
        le moment — Afriland, UBA, Access Bank et Western Union n'ont pas encore d'exemple). Unités virtuelles
        (Orange Money, MTN MoMo, Maviance) : non disponibles pour l'instant.
      </p>
    </details>
  );
}
