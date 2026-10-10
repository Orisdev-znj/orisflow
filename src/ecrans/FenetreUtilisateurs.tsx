import { useEffect, useState } from "react";
import type { RoleUtilisateur, UtilisateurPublic } from "../lib/types";
import { useFenetreModale } from "../lib/useFenetreModale";

interface Props {
  onFermer: () => void;
}

const LONGUEUR_MOT_DE_PASSE_MIN = 8;

/** Fenêtre d'administration des comptes (version 1.1.0), réservée à l'administrateur
 * (vérifié côté moteur Electron, pas seulement ici). C'est l'administrateur qui crée le
 * compte de chaque autre utilisateur (décision du 06/10/2026) — il n'y a pas d'auto-inscription. */
export default function FenetreUtilisateurs({ onFermer }: Props) {
  const fenetre = useFenetreModale<HTMLDivElement>(onFermer);
  const api = window.orisflow;
  const [utilisateurs, setUtilisateurs] = useState<UtilisateurPublic[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [nomAffiche, setNomAffiche] = useState("");
  const [role, setRole] = useState<RoleUtilisateur>("utilisateur");

  const [identifiantAReinitialiser, setIdentifiantAReinitialiser] = useState<string | null>(null);
  const [nouveauMotDePasse, setNouveauMotDePasse] = useState("");

  const charger = async () => {
    if (!api) return;
    const reponse = await api.listerUtilisateurs();
    if (reponse.ok && reponse.utilisateurs) {
      setUtilisateurs(reponse.utilisateurs);
    } else {
      setErreur(reponse.erreur || "Impossible de lire la liste des utilisateurs.");
    }
  };

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const creer = async (evenement: React.FormEvent) => {
    evenement.preventDefault();
    setErreur(null);
    if (!api) return;
    const reponse = await api.creerUtilisateur({ identifiant, motDePasse, nomAffiche: nomAffiche || identifiant, role });
    if (reponse.ok) {
      setIdentifiant("");
      setMotDePasse("");
      setNomAffiche("");
      setRole("utilisateur");
      await charger();
    } else {
      setErreur(reponse.erreur || "La création a échoué.");
    }
  };

  const supprimer = async (cible: string) => {
    if (!api) return;
    setErreur(null);
    const reponse = await api.supprimerUtilisateur(cible);
    if (reponse.ok) {
      await charger();
    } else {
      setErreur(reponse.erreur || "La suppression a échoué.");
    }
  };

  const reinitialiser = async (evenement: React.FormEvent) => {
    evenement.preventDefault();
    if (!api || !identifiantAReinitialiser) return;
    setErreur(null);
    const reponse = await api.reinitialiserMotDePasse(identifiantAReinitialiser, nouveauMotDePasse);
    if (reponse.ok) {
      setIdentifiantAReinitialiser(null);
      setNouveauMotDePasse("");
    } else {
      setErreur(reponse.erreur || "La réinitialisation a échoué.");
    }
  };

  return (
    <div className="superposition" role="presentation">
      <div ref={fenetre} className="fenetre-modale" role="dialog" aria-modal="true" aria-labelledby="titre-utilisateurs">
        <h2 id="titre-utilisateurs">Utilisateurs</h2>
        <p className="aide">
          Chaque utilisateur se connecte avec son propre identifiant et son propre mot de passe. C'est vous,
          administrateur, qui créez les comptes des autres utilisateurs.
        </p>

        {erreur && (
          <p role="alert" className="message message--erreur">
            {erreur}
          </p>
        )}

        {utilisateurs === null ? (
          <p className="aide">Chargement…</p>
        ) : (
          <table className="tableau">
            <thead>
              <tr>
                <th>Identifiant</th>
                <th>Nom affiché</th>
                <th>Rôle</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {utilisateurs.map((u) => (
                <tr key={u.identifiant}>
                  <td>{u.identifiant}</td>
                  <td>{u.nomAffiche}</td>
                  <td>{u.role === "admin" ? "Administrateur" : "Utilisateur"}</td>
                  <td>
                    <button
                      type="button"
                      className="bouton"
                      onClick={() => {
                        setIdentifiantAReinitialiser(u.identifiant);
                        setNouveauMotDePasse("");
                      }}
                    >
                      Réinitialiser le mot de passe
                    </button>{" "}
                    <button type="button" className="bouton" onClick={() => supprimer(u.identifiant)}>
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {identifiantAReinitialiser && (
          <form onSubmit={reinitialiser} className="champ">
            <label htmlFor="nouveau-mot-de-passe">
              Nouveau mot de passe pour « {identifiantAReinitialiser} »
            </label>
            <input
              id="nouveau-mot-de-passe"
              type="password"
              value={nouveauMotDePasse}
              onChange={(e) => setNouveauMotDePasse(e.target.value)}
              autoComplete="new-password"
              required
            />
            <div className="actions">
              <button type="submit" className="bouton bouton--principal">
                Enregistrer
              </button>
              <button type="button" className="bouton" onClick={() => setIdentifiantAReinitialiser(null)}>
                Annuler
              </button>
            </div>
          </form>
        )}

        <h3>Créer un utilisateur</h3>
        <form onSubmit={creer}>
          <div className="champ">
            <label htmlFor="nouvel-identifiant">Identifiant</label>
            <input
              id="nouvel-identifiant"
              type="text"
              value={identifiant}
              onChange={(e) => setIdentifiant(e.target.value)}
              required
            />
          </div>
          <div className="champ">
            <label htmlFor="nouveau-nom-affiche">Nom affiché</label>
            <input
              id="nouveau-nom-affiche"
              type="text"
              value={nomAffiche}
              onChange={(e) => setNomAffiche(e.target.value)}
              placeholder={identifiant || "Nom affiché"}
            />
          </div>
          <div className="champ">
            <label htmlFor="nouveau-mot-de-passe-creation">
              Mot de passe (au moins {LONGUEUR_MOT_DE_PASSE_MIN} caractères)
            </label>
            <input
              id="nouveau-mot-de-passe-creation"
              type="password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div className="champ">
            <label htmlFor="nouveau-role">Rôle</label>
            <select id="nouveau-role" value={role} onChange={(e) => setRole(e.target.value as RoleUtilisateur)}>
              <option value="utilisateur">Utilisateur</option>
              <option value="admin">Administrateur</option>
            </select>
          </div>
          <div className="actions">
            <button type="submit" className="bouton bouton--principal">
              Créer l'utilisateur
            </button>
          </div>
        </form>

        <div className="actions">
          <button type="button" className="bouton" onClick={onFermer}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
