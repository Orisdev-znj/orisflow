import { useState } from "react";
import type { DragEvent } from "react";
import { extensionDe, formaterTaille } from "../lib/format";
import ChampDateClasseur from "./ChampDateClasseur";
import FenetreConfirmation from "./FenetreConfirmation";
import type { FichierImporte } from "../lib/types";

interface Props {
  fichiers: FichierImporte[];
  onAjouter: (fichiers: FichierImporte[]) => void;
  onRetirer: (chemin: string) => void;
  onVider: () => void;
  onLancer: () => void;
  dateClasseur: string;
  onDateChange: (valeur: string) => void;
  dateUtilisable: boolean;
}

export default function EcranImport({
  fichiers,
  onAjouter,
  onRetirer,
  onVider,
  onLancer,
  dateClasseur,
  onDateChange,
  dateUtilisable,
}: Props) {
  const [survol, setSurvol] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // « Tout retirer » vide la liste d'un clic : confirmation dès 2 fichiers (avec un seul, le
  // bouton « Retirer » de la ligne fait déjà la même chose, une fenêtre serait pénible).
  const [confirmerVider, setConfirmerVider] = useState(false);
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

  // Tout le dossier du jour d'un coup (Classe 3, Classe 5, listes de comptes, relevés…).
  const choisirDossier = async () => {
    if (!api) {
      setMessage("L'import d'un dossier n'est disponible que dans l'application Orisflow.");
      return;
    }
    setMessage(null);
    const trouves = await api.choisirDossierImport();
    if (trouves.length > 0) onAjouter(trouves);
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
        <div className="actions actions--centre">
          <button type="button" className="bouton bouton--principal" onClick={choisirDossier}>
            Importer le dossier du jour…
          </button>
          <button type="button" className="bouton" onClick={choisir}>
            Choisir des fichiers…
          </button>
        </div>
        <p className="aide">
          Le dossier choisi est parcouru avec ses sous-dossiers. Formats acceptés : Excel (.xls, .xlsx) et PDF.
        </p>
      </div>

      {message && (
        <p role="alert" className="message message--erreur">
          {message}
        </p>
      )}

      <div className="liste-entete">
        <h2>Fichiers importés ({fichiers.length})</h2>
        {fichiers.length > 0 && (
          <button
            type="button"
            className="bouton bouton--lien"
            onClick={() => (fichiers.length > 1 ? setConfirmerVider(true) : onVider())}
          >
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

      <ChampDateClasseur id="date-classeur-import" valeur={dateClasseur} onChange={onDateChange} />

      <div className="actions">
        <button
          type="button"
          className="bouton bouton--principal"
          disabled={fichiers.length === 0 || !dateUtilisable}
          onClick={onLancer}
        >
          Analyser les fichiers
        </button>
      </div>
      <p className="aide">
        Cette étape reconnaît le type et l'agence de chaque fichier et signale les anomalies. Elle ne modifie
        aucun fichier et ne produit pas encore le classeur de trésorerie.
      </p>

      {confirmerVider && (
        <FenetreConfirmation
          titre="Retirer tous les fichiers ?"
          message={`${fichiers.length} fichiers seront retirés de la liste d'import. Vos fichiers ne sont pas supprimés : ils restent à leur place sur le disque.`}
          libelleConfirmer="Tout retirer"
          onConfirmer={() => {
            onVider();
            setConfirmerVider(false);
          }}
          onAnnuler={() => setConfirmerVider(false)}
        />
      )}
    </section>
  );
}
