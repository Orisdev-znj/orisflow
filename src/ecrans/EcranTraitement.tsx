export type EtatTraitement =
  | { etat: "attente" }
  | { etat: "encours"; courant: number; total: number; fichier?: string }
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
            Analyse en cours… {traitement.courant} fichier(s) sur {traitement.total}
          </p>
          <progress
            className="progression"
            value={traitement.courant}
            max={Math.max(traitement.total, 1)}
            aria-label="Avancement de l'analyse"
          />
          {traitement.fichier && <p className="aide">Fichier en cours : {traitement.fichier}</p>}
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
