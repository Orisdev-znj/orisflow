import type { FichierClasse, NiveauFichier, ResultatClassement } from "../lib/types";

interface Props {
  resultat: ResultatClassement | null;
  onRetourImport: () => void;
}

const NIVEAU_LIBELLES: Record<NiveauFichier, { texte: string; classe: string }> = {
  information: { texte: "Information", classe: "badge badge--info" },
  avertissement: { texte: "Avertissement", classe: "badge badge--avertissement" },
  bloquant: { texte: "Bloquant", classe: "badge badge--bloquant" },
};

const CONFIANCE_LIBELLES: Record<string, string> = {
  nom: "nom du fichier",
  code: "code agence — à vérifier",
  aucune: "non reconnue",
  sans_objet: "sans objet",
};

function ligneFichier(fichier: FichierClasse) {
  const agence =
    fichier.confiance_agence === "sans_objet"
      ? "—"
      : fichier.agence_libelle ?? "Non reconnue";
  return (
    <tr key={fichier.chemin}>
      <td title={fichier.chemin}>{fichier.nom}</td>
      <td>{fichier.type_libelle ?? "—"}</td>
      <td>
        {agence}
        {fichier.confiance_agence !== "sans_objet" && (
          <span className="aide-inline"> ({CONFIANCE_LIBELLES[fichier.confiance_agence]})</span>
        )}
      </td>
      <td>{fichier.total_comptes ?? "—"}</td>
      <td>
        <span className={NIVEAU_LIBELLES[fichier.niveau].classe}>{NIVEAU_LIBELLES[fichier.niveau].texte}</span>
      </td>
      <td>
        {fichier.messages.length === 0 ? (
          "—"
        ) : (
          <ul className="liste-messages">
            {fichier.messages.map((message, index) => (
              <li key={index}>{message}</li>
            ))}
          </ul>
        )}
      </td>
    </tr>
  );
}

export default function EcranResultats({ resultat, onRetourImport }: Props) {
  return (
    <section aria-labelledby="titre-resultats">
      <h1 id="titre-resultats">Résultats de l'analyse</h1>

      {!resultat && <p className="vide">Aucun résultat pour le moment. Lancez une analyse depuis l'import.</p>}

      {resultat && (
        <>
          <p className={resultat.ok ? "message message--succes" : "message message--avertissement"} role="status">
            {resultat.ok
              ? `Les ${resultat.total} fichier(s) ont été reconnus sans anomalie bloquante.`
              : "Certains fichiers demandent votre attention avant d'aller plus loin."}
          </p>

          {resultat.reference.disponible ? (
            <p className="aide">
              Comparaison faite avec le classeur du {resultat.reference.date ?? "?"} (
              {resultat.reference.chemin?.split("\\").pop()}).
            </p>
          ) : (
            <p className="aide">
              Aucune comparaison avec la veille : indiquez le dossier des classeurs de trésorerie dans
              « Paramètres » pour activer le contrôle de cohérence.
            </p>
          )}

          <p className="aide">
            Cette version reconnaît les fichiers et signale les anomalies. Elle ne remplit pas encore le classeur
            de trésorerie (étape à venir).
          </p>

          <table className="tableau">
            <thead>
              <tr>
                <th>Fichier</th>
                <th>Type détecté</th>
                <th>Agence</th>
                <th>Comptes</th>
                <th>Niveau</th>
                <th>Détails</th>
              </tr>
            </thead>
            <tbody>{resultat.fichiers.map(ligneFichier)}</tbody>
          </table>
        </>
      )}

      <div className="actions">
        <button type="button" className="bouton" onClick={onRetourImport}>
          Revenir à l'import
        </button>
      </div>
    </section>
  );
}
