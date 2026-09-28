import { useState } from "react";
import type { DragEvent } from "react";
import { extensionDe, formaterTaille } from "../lib/format";
import type { FichierImporte } from "../lib/types";

interface Props {
  fichiers: FichierImporte[];
  onAjouter: (fichiers: FichierImporte[]) => void;
  onRetirer: (chemin: string) => void;
  onVider: () => void;
  onLancer: () => void;
}

export default function EcranImport({ fichiers, onAjouter, onRetirer, onVider, onLancer }: Props) {
  const [survol, setSurvol] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const api = window.orisflow;

  const choisir = async () => {
    if (!api) {
      setMessage("La sélection de fichiers n'est disponible que dans l'application Orisflow.");
      return;
    }
    setMessage(null);
    const choisis = await api.choisirFichiers();
    if (choisis.length > 0) onAjouter(choisis);
  };

  const deposer = async (evenement: DragEvent<HTMLDivElement>) => {
    evenement.preventDefault();
    setSurvol(false);
    if (!api) {
      setMessage("Le dépôt de fichiers n'est disponible que dans l'application Orisflow.");
      return;
    }
    setMessage(null);
    const deposes = await api.decrireFichiersDeposes(evenement.dataTransfer.files);
    if (deposes.length > 0) onAjouter(deposes);
  };

  return (
    <section aria-labelledby="titre-import">
      <h1 id="titre-import">Importer les fichiers du jour</h1>
      <p className="aide">
        Sélectionnez les extractions et les relevés téléchargés ce matin. Orisflow ne modifie jamais vos fichiers :
        il travaille sur des copies.
      </p>

      <div
        className={survol ? "zone-depot zone-depot--survol" : "zone-depot"}
        onDragOver={(e) => {
          e.preventDefault();
          setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={deposer}
      >
        <p>Glissez vos fichiers ici</p>
        <p className="aide">ou</p>
        <button type="button" className="bouton bouton--principal" onClick={choisir}>
          Choisir des fichiers…
        </button>
        <p className="aide">Formats acceptés : Excel (.xls, .xlsx) et PDF</p>
      </div>

      {message && (
        <p role="alert" className="message message--erreur">
          {message}
        </p>
      )}

      <div className="liste-entete">
        <h2>Fichiers importés ({fichiers.length})</h2>
        {fichiers.length > 0 && (
          <button type="button" className="bouton bouton--lien" onClick={onVider}>
            Tout retirer
          </button>
        )}
      </div>

      {fichiers.length === 0 ? (
        <p className="vide">Aucun fichier importé pour le moment.</p>
      ) : (
        <table className="tableau">
          <thead>
            <tr>
              <th>Fichier</th>
              <th>Type</th>
              <th>Taille</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {fichiers.map((fichier) => (
              <tr key={fichier.chemin}>
                <td title={fichier.chemin}>{fichier.nom}</td>
                <td>{extensionDe(fichier.nom) || "—"}</td>
                <td>{formaterTaille(fichier.taille)}</td>
                <td className="tableau__action">
                  <button
                    type="button"
                    className="bouton bouton--lien"
                    onClick={() => onRetirer(fichier.chemin)}
                    aria-label={`Retirer ${fichier.nom}`}
                  >
                    Retirer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="actions">
        <button type="button" className="bouton bouton--principal" disabled={fichiers.length === 0} onClick={onLancer}>
          Analyser les fichiers
        </button>
      </div>
      <p className="aide">
        Cette étape reconnaît le type et l'agence de chaque fichier et signale les anomalies. Elle ne modifie
        aucun fichier et ne produit pas encore le classeur de trésorerie.
      </p>
    </section>
  );
}
