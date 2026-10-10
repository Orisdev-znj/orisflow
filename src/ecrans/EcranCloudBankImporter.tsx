import { useState } from "react";
import { formaterTaille } from "../lib/format";
import { nomConforme, type CasUsage } from "../lib/cloudbankCas";
import type { FichierImporte } from "../lib/types";

interface Props {
  cas: CasUsage;
  fichier: FichierImporte | null;
  enCours: boolean;
  erreur: string | null;
  onChoisirFichier: () => void;
  onValider: () => void;
}

/** Écran 2 : importer le fichier produit par Claude. Il n'est jamais modifié : Orisflow le lit. */
export default function EcranCloudBankImporter({ cas, fichier, enCours, erreur, onChoisirFichier, onValider }: Props) {
  // « J'ai collé le texte, j'attends » : simple pense-bête, aucun traitement n'a lieu dans Orisflow.
  const [attente, setAttente] = useState(false);
  const attendu = cas.sortie === "mapping" ? "MAPPING A VALIDER - …" : "EXT … (fichier final)";

  return (
    <section aria-labelledby="titre-cloudbank-importer" className="cloudbank-importer">
      <h1 id="titre-cloudbank-importer">Importer le résultat</h1>
      <p className="aide">
        {cas.titre} : choisissez le fichier produit par Claude ({attendu}).
      </p>

      {attente && !fichier && (
        <div className="zone-flux cloudbank-attente" role="status">
          <p>Le traitement se fait dans Claude, hors d'Orisflow — revenez ici dès que le fichier est prêt.</p>
        </div>
      )}

      <div className="zone-depot">
        <p>Fichier Excel produit par Claude</p>
        <div className="actions">
          <button type="button" className="bouton bouton--principal" onClick={onChoisirFichier}>
            Choisir le fichier…
          </button>
          {!fichier && (
            <button type="button" className="bouton bouton--lien" onClick={() => setAttente((a) => !a)}>
              {attente ? "Masquer le rappel" : "J'ai collé le texte, j'attends"}
            </button>
          )}
        </div>
      </div>

      {fichier && (
        <div className="cloudbank-fichier">
          <p>
            <strong>{fichier.nom}</strong> ({formaterTaille(fichier.taille)})
          </p>
          {!nomConforme(cas, fichier.nom) && (
            <p role="status" className="message message--avertissement">
              Le nom de ce fichier ne ressemble pas à « {attendu} ». Vous pouvez continuer : Orisflow vérifie le contenu,
              pas le nom.
            </p>
          )}
          <div className="actions">
            <button type="button" className="bouton bouton--principal" onClick={onValider} disabled={enCours}>
              {enCours ? "Lecture en cours…" : "Valider l'import"}
            </button>
          </div>
        </div>
      )}

      {erreur && (
        <p role="alert" className="message message--erreur">
          {erreur}
        </p>
      )}
    </section>
  );
}
