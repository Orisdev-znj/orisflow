import { useState } from "react";
import { formaterMontant } from "../lib/montants";
import type { EtatGeneration, FichierClasse, NiveauFichier, ResultatClassement, ResultatGeneration } from "../lib/types";
import TableauCompletude from "./TableauCompletude";

interface Props {
  resultat: ResultatClassement | null;
  generation: EtatGeneration;
  fichiersExclus: Set<string>;
  onBasculerFichier: (chemin: string) => void;
  onRetourImport: () => void;
  onGenerer: () => void;
}

// Libellés choisis par l'utilisateur le 30/09/2026 ; les valeurs internes du moteur ne changent pas.
const NIVEAU_LIBELLES: Record<NiveauFichier, { texte: string; classe: string }> = {
  information: { texte: "Conforme", classe: "badge badge--info" },
  avertissement: { texte: "À vérifier", classe: "badge badge--avertissement" },
  bloquant: { texte: "Rejeté", classe: "badge badge--bloquant" },
};
const BADGE_DOUBLON = { texte: "Ignoré (doublon)", classe: "badge badge--doublon" };

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

function formaterDate(iso: string | null): string {
  if (!iso) return "?";
  const [annee, mois, jour] = iso.split("-");
  return jour && mois && annee ? `${jour}/${mois}/${annee}` : iso;
}

// Ordre d'affichage : ce qui demande une action d'abord.
const ORDRE_NIVEAU: Record<NiveauFichier, number> = { bloquant: 0, avertissement: 1, information: 2 };

function badge(fichier: FichierClasse) {
  return fichier.est_doublon ? BADGE_DOUBLON : NIVEAU_LIBELLES[fichier.niveau];
}

/** Rapport en texte brut de l'analyse, à copier-coller tel quel (débogage, transmission). */
function genererRapportTexte(resultat: ResultatClassement): string {
  const lignes: string[] = [];
  lignes.push(`Rapport d'analyse Orisflow — ${new Date().toLocaleString("fr-FR")}`);
  lignes.push(
    resultat.reference.chemin ? `Dossier de référence : ${resultat.reference.chemin}` : "Dossier de référence : aucun",
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
    const agence =
      f.confiance_agence === "sans_objet"
        ? "—"
        : `${f.agence_libelle ?? "Non reconnue"} (${CONFIANCE_LIBELLES[f.confiance_agence] ?? f.confiance_agence})`;
    lignes.push(`[${badge(f).texte}] ${f.nom} — ${f.type_libelle ?? "type inconnu"} — ${agence}`);
    for (const message of f.messages) lignes.push(`    - ${message}`);
  }
  return lignes.join(String.fromCharCode(10));
}

/** Un seul message reste en clair ; plusieurs sont repliés sous un résumé cliquable. */
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

function ligneFichier(fichier: FichierClasse, inclus: boolean, onBasculer: (chemin: string) => void) {
  const agence = fichier.confiance_agence === "sans_objet" ? "—" : fichier.agence_libelle ?? "Non reconnue";
  const { texte, classe } = badge(fichier);
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
        <span className={classe}>{texte}</span>
      </td>
      <td className="tableau__details">{detailsFichier(fichier.messages)}</td>
    </tr>
  );
}

function Resume({ fichiers }: { fichiers: FichierClasse[] }) {
  const doublons = fichiers.filter((f) => f.est_doublon).length;
  const autres = fichiers.filter((f) => !f.est_doublon);
  const compte = (niveau: NiveauFichier) => autres.filter((f) => f.niveau === niveau).length;
  const cases: { libelle: string; nombre: number; classe: string }[] = [
    { libelle: "Conformes", nombre: compte("information"), classe: "resume__case--info" },
    { libelle: "À vérifier", nombre: compte("avertissement"), classe: "resume__case--avertissement" },
    { libelle: "Rejetés", nombre: compte("bloquant"), classe: "resume__case--bloquant" },
    { libelle: "Doublons ignorés", nombre: doublons, classe: "resume__case--doublon" },
  ];
  return (
    <ul className="resume" aria-label="Résumé de l'analyse">
      {cases.map((c) => (
        <li key={c.libelle} className={`resume__case ${c.classe}`}>
          <span className="resume__nombre">{c.nombre}</span>
          <span className="resume__libelle">{c.libelle}</span>
        </li>
      ))}
    </ul>
  );
}

const ENTETES_TABLEAU = (
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
);

function Recapitulatif({ resultat }: { resultat: ResultatGeneration }) {
  const valeur = (v: number | undefined) => (v === undefined ? "—" : v.toLocaleString("fr-FR"));
  return (
    <details className="recapitulatif" open>
      <summary>Montants écrits dans le classeur (à contrôler avant envoi)</summary>
      {resultat.recapitulatif_agences.length > 0 && (
        <table className="tableau tableau--compact">
          <thead>
            <tr>
              <th>Agence</th>
              <th className="nombre">Comptes</th>
              <th className="nombre">Dépôts</th>
              <th className="nombre">Engagements</th>
              <th className="nombre">Caisse</th>
            </tr>
          </thead>
          <tbody>
            {resultat.recapitulatif_agences.map((ligne) => (
              <tr key={ligne.agence}>
                <td>{ligne.agence}</td>
                <td className="nombre">{valeur(ligne.comptes)}</td>
                <td className="nombre">{valeur(ligne.depots)}</td>
                <td className="nombre">{valeur(ligne.engagements)}</td>
                <td className="nombre">{valeur(ligne.caisse)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {resultat.recapitulatif_banques.length > 0 && (
        <table className="tableau tableau--compact">
          <thead>
            <tr>
              <th>Banque / ligne</th>
              <th>Agence</th>
              <th className="nombre">Montant</th>
            </tr>
          </thead>
          <tbody>
            {resultat.recapitulatif_banques.map((ligne) => (
              <tr key={`${ligne.ligne}-${ligne.agence}`}>
                <td>{ligne.ligne}</td>
                <td>{ligne.agence}</td>
                <td className="nombre">{formaterMontant(ligne.montant)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </details>
  );
}

function ResultatGenere({ resultat }: { resultat: ResultatGeneration }) {
  const [erreurOuverture, setErreurOuverture] = useState<string | null>(null);
  const ouvrir = async (mode: "fichier" | "dossier") => {
    setErreurOuverture(null);
    const reponse = await window.orisflow?.ouvrirResultat(resultat.chemin_genere, mode);
    if (reponse && !reponse.ok) setErreurOuverture(reponse.erreur ?? "Ouverture impossible.");
  };
  const lignesInchangees = resultat.avertissements_banques;
  const listes: { libelle: string; agences: string[] }[] = [
    { libelle: "Comptes", agences: resultat.agences_mises_a_jour },
    { libelle: "Dépôts et engagements", agences: resultat.agences_balance_mises_a_jour },
    { libelle: "Caisses", agences: resultat.agences_caisses_mises_a_jour ?? [] },
    { libelle: "Banques", agences: resultat.agences_banques_mises_a_jour },
  ];

  return (
    <div role="status" className="message message--succes resultat-genere">
      <p>
        Classeur généré : <strong>{resultat.chemin_genere.split("\\").pop()}</strong>
      </p>
      <div className="actions">
        <button type="button" className="bouton bouton--principal" onClick={() => ouvrir("fichier")}>
          Ouvrir le classeur
        </button>
        <button type="button" className="bouton" onClick={() => ouvrir("dossier")}>
          Ouvrir le dossier
        </button>
      </div>
      {erreurOuverture && (
        <p role="alert" className="message message--erreur">
          {erreurOuverture}
        </p>
      )}

      {resultat.avertissements_modele.length > 0 && (
        <div className="message message--avertissement" role="alert">
          {resultat.avertissements_modele.map((a, i) => (
            <p key={i}>{a}</p>
          ))}
        </div>
      )}

      <ul className="liste-mises-a-jour">
        {listes.map(({ libelle, agences }) => (
          <li key={libelle}>
            <strong>{libelle} :</strong> {agences.length > 0 ? agences.join(", ") : "aucune agence"}
          </li>
        ))}
      </ul>

      <Recapitulatif resultat={resultat} />

      {lignesInchangees.length > 0 && (
        <details className="avertissements">
          <summary>
            {lignesInchangees.length} ligne(s) gardent la valeur de la veille (aucun fichier ni montant saisi)
          </summary>
          <ul className="liste-messages">
            {lignesInchangees.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </details>
      )}
      {resultat.agences_non_mises_a_jour.length > 0 && (
        <p className="aide">Comptes non mis à jour (aucune liste reçue) : {resultat.agences_non_mises_a_jour.join(", ")}.</p>
      )}
      {resultat.fichiers_ignores.length > 0 && (
        <p className="message message--avertissement">
          Fichiers non utilisés (anomalie) : {resultat.fichiers_ignores.join(", ")}.
        </p>
      )}
      {(resultat.doublons_ignores ?? []).length > 0 && (
        <p className="aide">Doublons ignorés, sans conséquence : {resultat.doublons_ignores.length}.</p>
      )}
    </div>
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
        Un nouveau fichier est créé à partir du dernier classeur existant, qui n'est jamais modifié. Sont remplis
        automatiquement : comptes, dépôts, engagements, caisses et banques lues dans les relevés. Les montants non
        lus (UV, UBA, Ecobank, Access Bank) vous sont demandés juste avant. Décochez un fichier ci-dessus pour
        l'exclure.
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
        {generation.etat === "encours" && (
          <>
            <span className="aide-inline" role="status">
              {generation.etape ?? "Préparation…"}
            </span>
            <button type="button" className="bouton bouton--lien" onClick={() => window.orisflow?.annulerMoteur()}>
              Annuler
            </button>
          </>
        )}
      </div>

      {generation.etat === "erreur" && (
        <p role="alert" className="message message--erreur">
          {generation.message}
        </p>
      )}

      {generation.etat === "succes" && <ResultatGenere resultat={generation.resultat} />}
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
  // Au moins un fichier exploitable (comptes ou balance) reste coché.
  const peutGenerer =
    !!resultat &&
    !dossierReferenceManquant &&
    resultat.fichiers.some(
      (f) =>
        (f.type_detecte === "compte" || f.type_detecte === "balance_classe3" || f.type_detecte === "balance_classe5") &&
        f.niveau !== "bloquant" &&
        !fichiersExclus.has(f.chemin),
    );

  const [rapportCopie, setRapportCopie] = useState(false);
  const [rapportTexte, setRapportTexte] = useState<string | null>(null);
  const [exportEtat, setExportEtat] = useState<"inactif" | "encours" | "fait" | "erreur">("inactif");
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [problemesSeulement, setProblemesSeulement] = useState(false);

  const copierRapport = async () => {
    if (!resultat) return;
    const texte = genererRapportTexte(resultat);
    try {
      await navigator.clipboard.writeText(texte);
      setRapportCopie(true);
      setRapportTexte(null);
      setTimeout(() => setRapportCopie(false), 2500);
    } catch {
      // Presse-papiers indisponible : texte à sélectionner et copier à la main.
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
        setExportEtat("inactif"); // boîte de dialogue annulée
        return;
      }
      setExportEtat("fait");
      setExportMessage(reponse.chemin);
    } catch (erreur) {
      setExportEtat("erreur");
      setExportMessage(erreur instanceof Error ? erreur.message : String(erreur));
    }
  };

  const principaux = (resultat?.fichiers ?? [])
    .filter((f) => !f.est_doublon)
    .filter((f) => !problemesSeulement || f.niveau !== "information")
    .sort((a, b) => ORDRE_NIVEAU[a.niveau] - ORDRE_NIVEAU[b.niveau]);
  const doublons = (resultat?.fichiers ?? []).filter((f) => f.est_doublon);

  return (
    <section aria-labelledby="titre-resultats">
      <h1 id="titre-resultats">Résultats de l'analyse</h1>

      {!resultat && <p className="vide">Aucun résultat pour le moment. Lancez une analyse depuis l'import.</p>}

      {resultat && (
        <>
          <p className={resultat.ok ? "message message--succes" : "message message--avertissement"} role="status">
            {resultat.ok
              ? `Les ${resultat.total} fichier(s) ont été reconnus sans anomalie bloquante.`
              : "Certains fichiers demandent votre attention : ils apparaissent en tête du tableau."}
          </p>

          <Resume fichiers={resultat.fichiers} />

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
              Comparaison faite avec le classeur du {formaterDate(resultat.reference.date)} (
              {resultat.reference.chemin?.split("\\").pop()}).
            </p>
          )}
          {!resultat.reference.disponible && resultat.reference.chemin && (
            <p className="aide">
              Classeur de référence trouvé ({resultat.reference.chemin.split("\\").pop()}), mais ses totaux de comptes
              n'ont pas pu être lus : la comparaison avec la veille n'est pas disponible pour cette analyse (la
              génération du classeur reste possible).
            </p>
          )}
          {!resultat.reference.chemin && (
            <p className="aide">
              Aucun dossier de référence configuré : la comparaison avec la veille n'a pas pu être faite.
            </p>
          )}

          <TableauCompletude fichiers={resultat.fichiers} />

          <div className="liste-entete">
            <h2>Fichiers ({principaux.length})</h2>
            <label className="case-a-cocher">
              <input
                type="checkbox"
                checked={problemesSeulement}
                onChange={(e) => setProblemesSeulement(e.target.checked)}
              />
              Afficher seulement les fichiers à vérifier ou rejetés
            </label>
          </div>
          <table className="tableau">
            {ENTETES_TABLEAU}
            <tbody>
              {principaux.map((fichier) => ligneFichier(fichier, !fichiersExclus.has(fichier.chemin), onBasculerFichier))}
            </tbody>
          </table>
          {principaux.length === 0 && <p className="vide">Aucun fichier à vérifier ni rejeté.</p>}

          {doublons.length > 0 && (
            <details className="doublons">
              <summary>
                {doublons.length} doublon(s) ignoré(s) automatiquement — aucune action nécessaire
              </summary>
              <table className="tableau">
                {ENTETES_TABLEAU}
                <tbody>
                  {doublons.map((fichier) => ligneFichier(fichier, !fichiersExclus.has(fichier.chemin), onBasculerFichier))}
                </tbody>
              </table>
            </details>
          )}

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
