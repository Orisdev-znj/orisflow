import type { EtatGeneration, FichierClasse, NiveauFichier, ResultatClassement } from "../lib/types";

interface Props {
  resultat: ResultatClassement | null;
  generation: EtatGeneration;
  onRetourImport: () => void;
  onGenerer: () => void;
}

// Libellés choisis par l'utilisateur le 30/09/2026 (à la place d'Information/Avertissement/Bloquant).
// Les valeurs internes ("information"/"avertissement"/"bloquant", côté moteur) ne changent pas :
// seul l'affichage change.
const NIVEAU_LIBELLES: Record<NiveauFichier, { texte: string; classe: string }> = {
  information: { texte: "Conforme", classe: "badge badge--info" },
  avertissement: { texte: "À vérifier", classe: "badge badge--avertissement" },
  bloquant: { texte: "Rejeté", classe: "badge badge--bloquant" },
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

function SectionGeneration({ generation, onGenerer, peutGenerer, dossierReferenceManquant }: {
  generation: EtatGeneration;
  onGenerer: () => void;
  peutGenerer: boolean;
  dossierReferenceManquant: boolean;
}) {
  return (
    <>
      <h2>Générer le classeur de trésorerie</h2>
      <p className="aide">
        Un nouveau fichier est créé à partir du dernier classeur existant (jamais modifié). Seules les lignes de
        comptes (7 à 13) sont remplies automatiquement pour le moment ; le reste garde les valeurs du classeur
        précédent, à compléter comme aujourd'hui.
      </p>

      {dossierReferenceManquant && (
        <p className="message message--avertissement" role="status">
          Aucun classeur de référence trouvé : indiquez le dossier des classeurs de trésorerie dans « Paramètres »
          avant de générer (Orisflow doit savoir de quel classeur partir).
        </p>
      )}

      <div className="actions">
        <button
          type="button"
          className="bouton bouton--principal"
          onClick={onGenerer}
          disabled={!peutGenerer || generation.etat === "encours"}
        >
          {generation.etat === "encours" ? "Génération en cours…" : "Générer le classeur"}
        </button>
      </div>

      {generation.etat === "erreur" && (
        <p role="alert" className="message message--erreur">
          {generation.message}
        </p>
      )}

      {generation.etat === "succes" && (
        <div role="status" className="message message--succes">
          <p>
            Fichier généré : <strong>{generation.resultat.chemin_genere.split("\\").pop()}</strong>
          </p>
          <p className="aide">Dossier : {generation.resultat.chemin_genere}</p>
          <p>
            Agences mises à jour :{" "}
            {generation.resultat.agences_mises_a_jour.length > 0
              ? generation.resultat.agences_mises_a_jour.join(", ")
              : "aucune"}
            .
          </p>
          {generation.resultat.agences_non_mises_a_jour.length > 0 && (
            <p>
              Non mises à jour aujourd'hui (aucun fichier reçu — à compléter comme avant) :{" "}
              {generation.resultat.agences_non_mises_a_jour.join(", ")}.
            </p>
          )}
          {generation.resultat.fichiers_ignores.length > 0 && (
            <p>Fichiers ignorés (anomalie bloquante) : {generation.resultat.fichiers_ignores.join(", ")}.</p>
          )}
        </div>
      )}
    </>
  );
}

export default function EcranResultats({ resultat, generation, onRetourImport, onGenerer }: Props) {
  const dossierReferenceManquant = !!resultat && !resultat.reference.chemin;
  const peutGenerer =
    !!resultat &&
    !dossierReferenceManquant &&
    resultat.fichiers.some((f) => f.type_detecte === "compte" && f.niveau !== "bloquant");

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

          {resultat.reference.disponible && (
            <p className="aide">
              Comparaison faite avec le classeur du {resultat.reference.date ?? "?"} (
              {resultat.reference.chemin?.split("\\").pop()}).
            </p>
          )}
          {!resultat.reference.disponible && resultat.reference.chemin && (
            <p className="aide">
              Classeur de référence trouvé ({resultat.reference.chemin.split("\\").pop()}), mais ses totaux de
              comptes n'ont pas pu être lus : la comparaison avec la veille n'est pas disponible pour cette
              analyse (la génération du classeur reste possible).
            </p>
          )}
          {!resultat.reference.chemin && (
            <p className="aide">
              Aucun dossier de référence configuré : la comparaison avec la veille n'a pas pu être faite (voir
              plus bas pour générer le classeur).
            </p>
          )}

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

          <SectionGeneration
            generation={generation}
            onGenerer={onGenerer}
            peutGenerer={peutGenerer}
            dossierReferenceManquant={dossierReferenceManquant}
          />
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
