import { useState } from "react";
import type { EtatAuth, UtilisateurPublic } from "../lib/types";
import logoOrisFinance from "../assets/logo-oris-finance.png";

interface Props {
  etat: EtatAuth;
  onConnecte: (utilisateur: UtilisateurPublic) => void;
}

const LONGUEUR_MOT_DE_PASSE_MIN = 8;

/** Écran de connexion (version 1.1.0) : affiché avant tout le reste de l'application.
 * Deux cas, selon `etat.premierLancement` :
 * - aucun compte n'existe encore sur ce poste : on crée le compte administrateur ;
 * - sinon, un identifiant et un mot de passe sont demandés à chaque ouverture d'Orisflow.
 * La session reste ouverte tant qu'Orisflow n'est pas fermé (décision du 06/10/2026) : pas
 * d'expiration, mais un bouton « Se déconnecter » (dans l'en-tête, une fois connecté)
 * permet à un autre utilisateur de reprendre la main sans fermer l'application. */
export default function EcranConnexion({ etat, onConnecte }: Props) {
  const api = window.orisflow;
  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [nomAffiche, setNomAffiche] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const valider = async (evenement: React.FormEvent) => {
    evenement.preventDefault();
    setErreur(null);

    if (!api) {
      setErreur("Cette fonction n'est disponible que dans l'application Orisflow.");
      return;
    }
    if (etat.premierLancement && motDePasse !== confirmation) {
      setErreur("Les deux mots de passe ne correspondent pas.");
      return;
    }
    if (etat.premierLancement && motDePasse.length < LONGUEUR_MOT_DE_PASSE_MIN) {
      setErreur(`Le mot de passe doit contenir au moins ${LONGUEUR_MOT_DE_PASSE_MIN} caractères.`);
      return;
    }

    setEnCours(true);
    try {
      const resultat = etat.premierLancement
        ? await api.creerCompteInitial({ identifiant, motDePasse, nomAffiche: nomAffiche || identifiant })
        : await api.connecter(identifiant, motDePasse);
      if (resultat.ok && resultat.utilisateur) {
        onConnecte(resultat.utilisateur);
      } else {
        setErreur(resultat.erreur || "La connexion a échoué.");
      }
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="ecran-connexion">
      <div className="carte-connexion">
        <img src={logoOrisFinance} alt="Oris Finance" className="carte-connexion__logo" />

        {etat.premierLancement ? (
          <>
            <h1>Créer le compte administrateur</h1>
            <p className="aide">
              Aucun compte n'existe encore sur ce poste. Créez le compte administrateur : vous pourrez ensuite
              créer un compte pour chaque autre utilisateur depuis Paramètres.
            </p>
          </>
        ) : (
          <h1>Connexion à Orisflow</h1>
        )}

        <form onSubmit={valider}>
          <div className="champ">
            <label htmlFor="connexion-identifiant">Identifiant</label>
            <input
              id="connexion-identifiant"
              type="text"
              autoComplete="username"
              value={identifiant}
              onChange={(e) => setIdentifiant(e.target.value)}
              required
              autoFocus
            />
          </div>

          {etat.premierLancement && (
            <div className="champ">
              <label htmlFor="connexion-nom">Votre nom (affiché dans Suivi Courrier)</label>
              <input
                id="connexion-nom"
                type="text"
                value={nomAffiche}
                onChange={(e) => setNomAffiche(e.target.value)}
                placeholder={identifiant || "Nom affiché"}
              />
            </div>
          )}

          <div className="champ">
            <label htmlFor="connexion-mot-de-passe">Mot de passe</label>
            <input
              id="connexion-mot-de-passe"
              type="password"
              autoComplete={etat.premierLancement ? "new-password" : "current-password"}
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              required
            />
          </div>

          {etat.premierLancement && (
            <div className="champ">
              <label htmlFor="connexion-confirmation">Confirmer le mot de passe</label>
              <input
                id="connexion-confirmation"
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                required
              />
            </div>
          )}

          {erreur && (
            <p role="alert" className="message message--erreur">
              {erreur}
            </p>
          )}

          <div className="actions">
            <button type="submit" className="bouton bouton--principal" disabled={enCours}>
              {enCours ? "Veuillez patienter…" : etat.premierLancement ? "Créer le compte" : "Se connecter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
