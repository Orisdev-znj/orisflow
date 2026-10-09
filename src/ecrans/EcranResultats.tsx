import { useState } from "react";
import type { EtatGeneration, FichierClasse, NiveauFichier, ResultatClassement } from "../lib/types";
import TableauCompletude from "./TableauCompletude";

interface Props {
  resultat: ResultatClassement | null;
  generation: EtatGeneration;
  fichiersExclus: Set<string>;
  onBasculerFichier: (chemin: string) => void;
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
  contenu_document: "contenu du document",
  regle_banque: "règle bancaire",
  comptage: "proximité du total — à vérifier absolument",
  comptes: "numéros de compte",
  manuelle: "confirmée manuellement",
};

/** Rapport en texte brut de l'analyse (09/10/2026) : pour que l'utilisateur puisse le copier
 * et le coller directement dans une conversation de débogage, sans retaper ce qu'il voit
 * à l'écran. Reprend les mêmes informations que le tableau, rien de plus. */
function genererRapportTexte(resultat: ResultatClassement): string {
  const lignes: string[] = [];
  lignes.push(`Rapport d'analyse Orisflow — ${new Date().toLocaleString("fr-FR")}`);
  lignes.push(
    resultat.reference.chemin
      ? `Dossier de référence : ${resultat.reference.chemin}`
      : "Dossier de référence : aucun",
  );
  lignes.push(`Fichiers analysés : ${resultat.total}`);
  lignes.push("");

  if (resultat.journal_etapes && resultat.journal_etapes.length > 0) {
    lignes.push("Étapes :");
    for (const etape of resultat.journal_etapes) lignes.push(`- ${etape}`);
    lignes.push("");
  }

  lignes.push("Détail par fichier :");
  for (const f of resultat.fichiers) {
    const niveau = NIVEAU_LIBELLES[f.niveau]?.texte ?? f.niveau;
    const agence =
      f.confiance_agence === "sans_objet"
        ? "—"
        : `${f.agence_libelle ?? "Non reconnue"} (${CONFIANCE_LIBELLES[f.confiance_agence] ?? f.confiance_agence})`;
    lignes.push(`[${niveau}] ${f.nom} — ${f.type_libelle ?? "type inconnu"} — ${agence}`);
    for (const message of f.messages) lignes.push(`    - ${message}`);
  }
  return lignes.join(String.fromCharCode(10));
}

function ligneFichier(fichier: FichierClasse, inclus: boolean, onBasculer: (chemin: string) => void) {
  const agence =
    fichier.confiance_agence === "sans_objet"
      ? "—"
      : fichier.agence_libelle ?? "Non reconnue";
  return (
    <tr key={fichier.chemin} className={inclus ? undefined : "ligne--exclue"}>
      <td>
        <input
          type="checkbox"
          checked={inclus}
          onChange={() => onBasculer(fichier.chemin)}
          aria-label={`Utiliser ${fichier.nom} pour la génération`}
        />
      </td>
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
      <td>{detailsFichier(fichier.messages)}</td>
    </tr>
  );
}

/** Affichage simplifié des messages (10/10/2026, demande de l'utilisateur) : un seul
 * message reste en clair, plusieurs sont repliés sous un résumé — le détail complet reste
 * disponible en un clic, sans noyer le tableau. */
function detailsFichier(messages: string[]) {
  if (messages.length === 0) return "—";
  if (messages.length === 1) return messages[0];
  return (
    <details>
      <summary>{messages.length} remarques</summary>
      <ul className="liste-messages">
        {messages.map((message, index) => (
          <li key={index}>{message}</li>
        ))}
      </ul>
    </details>
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
        précédent, à compléter comme aujourd'hui. Décochez un fichier ci-dessus pour l'exclure de la génération.
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
            Comptes mis à jour :{" "}
            {generation.resultat.agences_mises_a_jour.length > 0
              ? generation.resultat.agences_mises_a_jour.join(", ")
              : "aucune"}
            .
          </p>
          <p>
            Dépôts/engagements mis à jour :{" "}
            {generation.resultat.agences_balance_mises_a_jour.length > 0
              ? generation.resultat.agences_balance_mises_a_jour.join(", ")
              : "aucune"}
            .
          </p>
          <p>
            Banques mises à jour :{" "}
            {generation.resultat.agences_banques_mises_a_jour.length > 0
              ? generation.resultat.agences_banques_mises_a_jour.join(", ")
              : "aucune"}
            .
          </p>
          {generation.resultat.avertissements_banques.length > 0 && (
            <p role="alert" className="message message--avertissement">
              {generation.resultat.avertissements_banques.map((avertissement, index) => (
                <span key={index}>
                  {avertissement}
                  <br />
                </span>
              ))}
            </p>
          )}
          {generation.resultat.avertissements_modele.length > 0 && (
            <p role="alert" className="message message--avertissement">
              {generation.resultat.avertissements_modele.map((avertissement, index) => (
                <span key={index}>
                  {avertissement}
                  <br />
                </span>
              ))}
            </p>
          )}
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

export default function EcranResultats({
  resultat,
  generation,
  fichiersExclus,
  onBasculerFichier,
  onRetourImport,
  onGenerer,
}: Props) {
  const dossierReferenceManquant = !!resultat && !resultat.reference.chemin;
  const peutGenerer =
    !!resultat &&
    !dossierReferenceManquant &&
    resultat.fichiers.some(
      (f) => f.type_detecte === "compte" && f.niveau !== "bloquant" && !fichiersExclus.has(f.chemin),
    );

  const [rapportCopie, setRapportCopie] = useState(false);
  const [rapportTexte, setRapportTexte] = useState<string | null>(null);
  const [exportEtat, setExportEtat] = useState<"inactif" | "encours" | "fait" | "erreur">("inactif");
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const copierRapport = async () => {
    if (!resultat) return;
    const texte = genererRapportTexte(resultat);
    try {
      await navigator.clipboard.writeText(texte);
      setRapportCopie(true);
      setRapportTexte(null);
      setTimeout(() => setRapportCopie(false), 2500);
    } catch {
      // Presse-papiers indisponible (ex. politique de sécurité) : on affiche le texte à
      // sélectionner et copier à la main, plutôt que de ne rien proposer du tout.
      setRapportTexte(texte);
    }
  };

  const telechargerRapportExcel = async () => {
    if (!resultat) return;
    setExportEtat("encours");
    setExportMessage(null);
    try {
      const reponse = await window.orisflow?.exporterRapport(resultat.fichiers, resultat.journal_etapes ?? null);
      if (!reponse) {
        setExportEtat("inactif"); // boîte de dialogue annulée par l'utilisateur
        return;
      }
      setExportEtat("fait");
      setExportMessage(reponse.chemin);
    } catch (erreur) {
      setExportEtat("erreur");
      setExportMessage(erreur instanceof Error ? erreur.message : String(erreur));
    }
  };

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

          <div className="actions">
            <button type="button" className="bouton" onClick={copierRapport}>
              Copier le rapport d'analyse
            </button>
            {rapportCopie && <span className="aide-inline">Copié dans le presse-papiers.</span>}
            <button type="button" className="bouton" onClick={telechargerRapportExcel} disabled={exportEtat === "encours"}>
              {exportEtat === "encours" ? "Enregistrement…" : "Télécharger le rapport (Excel)"}
            </button>
            {exportEtat === "fait" && <span className="aide-inline">Enregistré : {exportMessage}</span>}
            {exportEtat === "erreur" && (
              <span className="aide-inline" role="alert">
                {exportMessage}
              </span>
            )}
          </div>
          {rapportTexte && (
            <div className="champ">
              <label htmlFor="rapport-texte-secours">
                Le presse-papiers n'a pas pu être utilisé : sélectionnez et copiez ce texte à la main.
              </label>
              <textarea id="rapport-texte-secours" readOnly rows={10} value={rapportTexte} />
            </div>
          )}

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

          <TableauCompletude fichiers={resultat.fichiers} />

          <table className="tableau">
            <thead>
              <tr>
                <th aria-label="Utiliser pour la génération" />
                <th>Fichier</th>
                <th>Type détecté</th>
                <th>Agence</th>
                <th>Comptes</th>
                <th>Niveau</th>
                <th>Détails</th>
              </tr>
            </thead>
            <tbody>
              {resultat.fichiers.map((fichier) =>
                ligneFichier(fichier, !fichiersExclus.has(fichier.chemin), onBasculerFichier),
              )}
            </tbody>
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
