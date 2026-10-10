import { useEffect, useState } from "react";
import type { EvenementJournal } from "../lib/types";
import { useFenetreModale } from "../lib/useFenetreModale";

interface Props {
  onFermer: () => void;
}

const LIBELLE_ACTION: Record<string, string> = {
  connexion: "Connexion",
  deconnexion: "Déconnexion",
  creation_compte_admin: "Compte administrateur créé",
  creation_utilisateur: "Compte créé",
  suppression_utilisateur: "Compte supprimé",
  reinitialisation_mot_de_passe: "Mot de passe réinitialisé",
  generation_classeur: "Classeur généré",
};

function formaterDate(horodatage: string): string {
  try {
    return new Date(horodatage).toLocaleString("fr-FR");
  } catch {
    return horodatage;
  }
}

function resumerDetails(evenement: EvenementJournal): string {
  const d = evenement.details;
  if (evenement.action === "generation_classeur" && typeof d.cheminGenere === "string") {
    return String(d.cheminGenere).split("\\").pop() || String(d.cheminGenere);
  }
  if (evenement.action === "creation_utilisateur" && d.identifiantCree) {
    return `Nouvel identifiant : ${d.identifiantCree}`;
  }
  if (evenement.action === "suppression_utilisateur" && d.identifiantSupprime) {
    return `Identifiant supprimé : ${d.identifiantSupprime}`;
  }
  if (evenement.action === "reinitialisation_mot_de_passe" && d.identifiantCible) {
    return `Pour : ${d.identifiantCible}`;
  }
  return "";
}

/** Journal des actions (version 1.1.0), réservé à l'administrateur : qui s'est connecté,
 * qui a généré quel classeur et quand, qui a créé ou supprimé un compte. Chaque ligne vient
 * d'un fichier distinct (voir electron/journal.cjs) — Orisflow ne réécrit jamais le journal
 * lui-même, il ne fait qu'en ajouter. */
export default function FenetreJournal({ onFermer }: Props) {
  const fenetre = useFenetreModale<HTMLDivElement>(onFermer);
  const api = window.orisflow;
  const [evenements, setEvenements] = useState<EvenementJournal[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtreAction, setFiltreAction] = useState("");

  useEffect(() => {
    if (!api) return;
    api.listerJournal({ action: filtreAction || undefined, limite: 200 }).then((reponse) => {
      if (reponse.ok && reponse.evenements) {
        setEvenements(reponse.evenements);
      } else {
        setErreur(reponse.erreur || "Impossible de lire le journal.");
      }
    });
  }, [api, filtreAction]);

  return (
    <div className="superposition" role="presentation">
      <div ref={fenetre} className="fenetre-modale" role="dialog" aria-modal="true" aria-labelledby="titre-journal">
        <h2 id="titre-journal">Journal des actions</h2>
        <p className="aide">
          Qui s'est connecté, qui a généré quel classeur, qui a créé ou supprimé un compte. Les 200 dernières
          actions, les plus récentes en premier.
        </p>

        <div className="champ">
          <label htmlFor="filtre-action">Filtrer par type d'action</label>
          <select id="filtre-action" value={filtreAction} onChange={(e) => setFiltreAction(e.target.value)}>
            <option value="">Toutes les actions</option>
            {Object.entries(LIBELLE_ACTION).map(([cle, libelle]) => (
              <option key={cle} value={cle}>
                {libelle}
              </option>
            ))}
          </select>
        </div>

        {erreur && (
          <p role="alert" className="message message--erreur">
            {erreur}
          </p>
        )}

        {evenements === null ? (
          <p className="aide">Chargement…</p>
        ) : evenements.length === 0 ? (
          <p className="aide">Aucune action enregistrée pour l'instant.</p>
        ) : (
          <table className="tableau">
            <thead>
              <tr>
                <th>Date et heure</th>
                <th>Utilisateur</th>
                <th>Action</th>
                <th>Détail</th>
              </tr>
            </thead>
            <tbody>
              {evenements.map((evenement, index) => (
                <tr key={index}>
                  <td>{formaterDate(evenement.horodatage)}</td>
                  <td>{evenement.nomAffiche || evenement.utilisateur || "—"}</td>
                  <td>{LIBELLE_ACTION[evenement.action] || evenement.action}</td>
                  <td>{resumerDetails(evenement)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="actions">
          <button type="button" className="bouton" onClick={onFermer}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
