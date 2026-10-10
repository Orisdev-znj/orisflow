import { useEffect, useState } from "react";
import { formaterTaille } from "../lib/format";
import type { ClasseurHistorique } from "../lib/types";

/** Classeurs déjà générés par Orisflow (dossier Résultats), du plus récent au plus ancien. */
export default function EcranHistorique() {
  const api = window.orisflow;
  const [classeurs, setClasseurs] = useState<ClasseurHistorique[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = () => {
    if (!api) {
      setClasseurs([]);
      return;
    }
    api
      .listerHistorique()
      .then(setClasseurs)
      .catch((e) => setErreur(e instanceof Error ? e.message : String(e)));
  };
  useEffect(() => {
    charger();
  }, []);

  const ouvrir = async (chemin: string, mode: "fichier" | "dossier") => {
    setErreur(null);
    const reponse = await api?.ouvrirResultat(chemin, mode);
    if (reponse && !reponse.ok) setErreur(reponse.erreur ?? "Ouverture impossible.");
  };

  return (
    <section aria-labelledby="titre-historique">
      <div className="liste-entete">
        <h1 id="titre-historique">Classeurs générés</h1>
        <button type="button" className="bouton bouton--lien" onClick={charger}>
          Actualiser
        </button>
      </div>
      {erreur && (
        <p role="alert" className="message message--erreur">
          {erreur}
        </p>
      )}
      {classeurs === null && <p className="aide">Chargement…</p>}
      {classeurs !== null && classeurs.length === 0 && (
        <p className="vide">Aucun classeur généré pour le moment.</p>
      )}
      {classeurs !== null && classeurs.length > 0 && (
        <table className="tableau">
          <thead>
            <tr>
              <th>Classeur</th>
              <th>Généré le</th>
              <th>Taille</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {classeurs.map((c) => (
              <tr key={c.chemin}>
                <td title={c.chemin}>{c.nom}</td>
                <td>{new Date(c.modifieLe).toLocaleString("fr-FR")}</td>
                <td>{formaterTaille(c.taille)}</td>
                <td className="tableau__action">
                  <button type="button" className="bouton bouton--lien" onClick={() => ouvrir(c.chemin, "fichier")}>
                    Ouvrir
                  </button>
                  <button type="button" className="bouton bouton--lien" onClick={() => ouvrir(c.chemin, "dossier")}>
                    Dossier
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
