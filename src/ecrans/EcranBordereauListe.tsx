import { useEffect, useState } from "react";
import type { Transmission } from "../lib/types";
import { nettoyerErreur } from "../lib/format";

interface Props {
  identite: string;
  onNouvelle: () => void;
}

type Filtre = "recues" | "envoyees" | "toutes";

type EtatListe =
  | { etat: "chargement" }
  | { etat: "prete"; disponible: boolean; transmissions: Transmission[]; erreursLecture: string[] }
  | { etat: "erreur"; message: string };

type EtatAction = { transmissionId: string; type: string } | null;

function formaterDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

const CLASSE_STATUT: Record<string, string> = {
  Transmis: "badge badge--info",
  Reçu: "badge badge--avertissement",
  "Pris en charge": "badge badge--avertissement",
  Traité: "badge badge--info",
  Rejeté: "badge badge--bloquant",
};

export default function EcranBordereauListe({ identite, onNouvelle }: Props) {
  const api = window.orisflow;
  const [filtre, setFiltre] = useState<Filtre>("recues");
  const [liste, setListe] = useState<EtatListe>({ etat: "chargement" });
  const [action, setAction] = useState<EtatAction>(null);

  const charger = async () => {
    if (!api) {
      setListe({ etat: "erreur", message: "Cette fonction n'est disponible que dans l'application Orisflow." });
      return;
    }
    setListe({ etat: "chargement" });
    try {
      const reponse = await api.bordereauLister();
      setListe({
        etat: "prete",
        disponible: reponse.disponible,
        transmissions: reponse.transmissions,
        erreursLecture: reponse.erreurs_lecture,
      });
    } catch (erreur) {
      setListe({ etat: "erreur", message: nettoyerErreur(erreur) });
    }
  };

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const declencherEvenement = async (transmissionId: string, typeEvenement: "accuse_reception" | "traite" | "rejete") => {
    if (!api) return;
    setAction({ transmissionId, type: typeEvenement });
    try {
      await api.bordereauEvenement({ transmissionId, typeEvenement });
      await charger();
    } catch (erreur) {
      setListe({ etat: "erreur", message: nettoyerErreur(erreur) });
    } finally {
      setAction(null);
    }
  };

  const transmissions = liste.etat === "prete" ? liste.transmissions : [];
  const visibles = transmissions.filter((t) => {
    if (filtre === "recues") return t.destinataire === identite;
    if (filtre === "envoyees") return t.expediteur === identite;
    return true;
  });

  return (
    <section aria-labelledby="titre-bordereau-liste">
      <div className="liste-entete">
        <h1 id="titre-bordereau-liste">Bordereau de transmission</h1>
        <button type="button" className="bouton bouton--principal" onClick={onNouvelle}>
          Nouvelle transmission
        </button>
      </div>

      {!identite && (
        <p className="message message--avertissement" role="status">
          Indiquez votre nom dans « Paramètres → Votre identité » pour voir vos transmissions reçues et envoyées.
        </p>
      )}

      <nav className="filtres" aria-label="Filtrer les transmissions">
        <button
          type="button"
          className={filtre === "recues" ? "filtre filtre--actif" : "filtre"}
          onClick={() => setFiltre("recues")}
        >
          Reçues par moi
        </button>
        <button
          type="button"
          className={filtre === "envoyees" ? "filtre filtre--actif" : "filtre"}
          onClick={() => setFiltre("envoyees")}
        >
          Envoyées par moi
        </button>
        <button
          type="button"
          className={filtre === "toutes" ? "filtre filtre--actif" : "filtre"}
          onClick={() => setFiltre("toutes")}
        >
          Toutes
        </button>
      </nav>

      {liste.etat === "chargement" && <p className="vide">Chargement…</p>}
      {liste.etat === "erreur" && (
        <p role="alert" className="message message--erreur">
          {liste.message}
        </p>
      )}

      {liste.etat === "prete" && !liste.disponible && (
        <p className="message message--avertissement" role="status">
          Aucun dossier partagé n'est configuré pour le bordereau de transmission (voir Paramètres). Tant qu'il n'est
          pas indiqué, aucune transmission ne peut être créée ni affichée.
        </p>
      )}

      {liste.etat === "prete" && liste.disponible && liste.erreursLecture.length > 0 && (
        <p className="message message--avertissement" role="status">
          {liste.erreursLecture.length} fichier(s) du dossier partagé n'ont pas pu être lus (ignorés, sans bloquer
          l'affichage des autres).
        </p>
      )}

      {liste.etat === "prete" && liste.disponible && (
        <>
          {visibles.length === 0 ? (
            <p className="vide">Aucune transmission pour le moment.</p>
          ) : (
            <table className="tableau">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Type</th>
                  <th>De</th>
                  <th>À</th>
                  <th>Date</th>
                  <th>Statut</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {visibles.map((t) => (
                  <tr key={t.id}>
                    <td>
                      {t.document}
                      {t.piece_jointe && <span className="aide-inline"> (pièce jointe)</span>}
                    </td>
                    <td>{t.type_document}</td>
                    <td>{t.expediteur}</td>
                    <td>{t.destinataire}</td>
                    <td>{formaterDate(t.date_transmission)}</td>
                    <td>
                      <span className={CLASSE_STATUT[t.statut] ?? "badge"}>{t.statut}</span>
                    </td>
                    <td className="tableau__action">
                      {t.destinataire === identite && t.statut === "Transmis" && (
                        <button
                          type="button"
                          className="bouton bouton--lien"
                          disabled={action?.transmissionId === t.id}
                          onClick={() => declencherEvenement(t.id, "accuse_reception")}
                        >
                          Accuser réception
                        </button>
                      )}
                      {t.destinataire === identite && (t.statut === "Reçu" || t.statut === "Pris en charge") && (
                        <>
                          <button
                            type="button"
                            className="bouton bouton--lien"
                            disabled={action?.transmissionId === t.id}
                            onClick={() => declencherEvenement(t.id, "traite")}
                          >
                            Marquer traité
                          </button>{" "}
                          <button
                            type="button"
                            className="bouton bouton--lien"
                            disabled={action?.transmissionId === t.id}
                            onClick={() => declencherEvenement(t.id, "rejete")}
                          >
                            Rejeter
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
