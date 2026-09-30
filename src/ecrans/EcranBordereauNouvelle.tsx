import { useState } from "react";
import type { FichierImporte } from "../lib/types";
import { formaterTaille, nettoyerErreur } from "../lib/format";

interface Props {
  identite: string;
  onCree: () => void;
}

// Reprend la liste indicative du moteur (voir engine/orisflow_engine/bordereau.py,
// TYPES_DOCUMENT) : une aide au remplissage, pas une contrainte imposée par le moteur.
const TYPES_DOCUMENT = ["Facture", "Courrier", "Contrat", "Rapport", "Pièce comptable", "Autre"];

type EtatEnvoi = { etat: "repos" } | { etat: "encours" } | { etat: "erreur"; message: string };

export default function EcranBordereauNouvelle({ identite, onCree }: Props) {
  const api = window.orisflow;
  const [destinataire, setDestinataire] = useState("");
  const [document, setDocument] = useState("");
  const [typeDocument, setTypeDocument] = useState(TYPES_DOCUMENT[0]);
  const [urgence, setUrgence] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [pieceJointe, setPieceJointe] = useState<FichierImporte | null>(null);
  const [envoi, setEnvoi] = useState<EtatEnvoi>({ etat: "repos" });

  const joindre = async () => {
    if (!api) return;
    const fichier = await api.bordereauChoisirPieceJointe();
    if (fichier) setPieceJointe(fichier);
  };

  const envoyer = async () => {
    if (!api) return;
    setEnvoi({ etat: "encours" });
    try {
      await api.bordereauCreer({
        destinataire: destinataire.trim(),
        document: document.trim(),
        typeDocument,
        pieceJointeSource: pieceJointe?.chemin ?? null,
        urgence: urgence || null,
        commentaire: commentaire.trim() || null,
      });
      onCree();
    } catch (erreur) {
      setEnvoi({ etat: "erreur", message: nettoyerErreur(erreur) });
    }
  };

  const peutEnvoyer = !!identite && destinataire.trim() !== "" && document.trim() !== "" && envoi.etat !== "encours";

  return (
    <section aria-labelledby="titre-bordereau-nouvelle">
      <h1 id="titre-bordereau-nouvelle">Nouvelle transmission</h1>

      {!identite && (
        <p className="message message--avertissement" role="status">
          Indiquez votre nom dans « Paramètres → Votre identité » avant de créer une transmission (il identifie
          l'expéditeur).
        </p>
      )}

      <div className="champ">
        <label htmlFor="champ-destinataire">Destinataire</label>
        <input
          id="champ-destinataire"
          type="text"
          value={destinataire}
          onChange={(e) => setDestinataire(e.target.value)}
          placeholder="Nom de la personne qui reçoit le document"
        />
      </div>

      <div className="champ">
        <label htmlFor="champ-document">Document</label>
        <input
          id="champ-document"
          type="text"
          value={document}
          onChange={(e) => setDocument(e.target.value)}
          placeholder="Ex. Facture EDF septembre 2026"
        />
      </div>

      <div className="champ">
        <label htmlFor="champ-type">Type de document</label>
        <select id="champ-type" value={typeDocument} onChange={(e) => setTypeDocument(e.target.value)}>
          {TYPES_DOCUMENT.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      <div className="champ">
        <label htmlFor="champ-urgence">Urgence (optionnel)</label>
        <select id="champ-urgence" value={urgence} onChange={(e) => setUrgence(e.target.value)}>
          <option value="">Normale</option>
          <option value="urgent">Urgent</option>
        </select>
      </div>

      <div className="champ">
        <span>Pièce jointe (optionnel)</span>
        {pieceJointe ? (
          <p className="aide">
            {pieceJointe.nom} ({formaterTaille(pieceJointe.taille)}){" "}
            <button type="button" className="bouton bouton--lien" onClick={() => setPieceJointe(null)}>
              Retirer
            </button>
          </p>
        ) : (
          <div className="actions actions--ligne">
            <button type="button" className="bouton" onClick={joindre} disabled={!api}>
              Joindre un fichier…
            </button>
          </div>
        )}
        <p className="aide">
          Une copie du fichier est déposée dans le dossier partagé du bordereau : le fichier d'origine n'est jamais
          modifié ni déplacé.
        </p>
      </div>

      <div className="champ">
        <label htmlFor="champ-commentaire">Commentaire (optionnel)</label>
        <textarea
          id="champ-commentaire"
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
          rows={3}
        />
      </div>

      {envoi.etat === "erreur" && (
        <p role="alert" className="message message--erreur">
          {envoi.message}
        </p>
      )}

      <div className="actions">
        <button type="button" className="bouton bouton--principal" onClick={envoyer} disabled={!peutEnvoyer}>
          {envoi.etat === "encours" ? "Envoi en cours…" : "Transmettre"}
        </button>
      </div>
    </section>
  );
}
