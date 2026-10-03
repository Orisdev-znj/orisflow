export type EtatTraitement =
  | { etat: "attente" }
  | { etat: "encours"; courant: number; total: number; pourcentage: number; fichier?: string; journal: string[] }
  | { etat: "termine" }
  | { etat: "erreur"; message: string };

interface Props {
  traitement: EtatTraitement;
  onRetourImport: () => void;
  onRelancer: () => void;
}

export default function EcranTraitement({ traitement, onRetourImport, onRelancer }: Props) {
  return (
    <section aria-labelledby="titre-traitement">
      <h1 id="titre-traitement">Analyse</h1>

      {traitement.etat === "attente" && (
        <p className="vide">Aucune analyse en cours. Importez des fichiers pour commencer.</p>
      )}

      {traitement.etat === "encours" && (
        <div role="status" aria-live="polite">
          <p>
            Analyse en cours… <strong>{traitement.pourcentage} %</strong> ({traitement.courant} sur{" "}
            {traitement.total} fichier(s))
          </p>
          <progress
            className="progression"
            value={traitement.pourcentage}
            max={100}
            aria-label="Avancement de l'analyse"
          />
          {traitement.fichier && <p className="aide">Fichier en cours : {traitement.fichier}</p>}
          {traitement.journal.length > 0 && (
            <ol className="journal-etapes" aria-label="Journal de l'analyse">
              {traitement.journal.map((ligne, index) => (
                <li key={index}>{ligne}</li>
              ))}
            </ol>
          )}
        </div>
      )}

      {traitement.etat === "termine" && (
        <p role="status" className="message message--succes">
          L'analyse est terminée. Consultez l'onglet « Résultats ».
        </p>
      )}

      {traitement.etat === "erreur" && (
        <div>
          <p role="alert" className="message message--erreur">
            L'analyse n'a pas pu aboutir. {traitement.message}
          </p>
          <div className="actions">
            <button type="button" className="bouton" onClick={onRetourImport}>
              Revenir à l'import
            </button>
            <button type="button" className="bouton bouton--principal" onClick={onRelancer}>
              Réessayer
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
