import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  onAccueil: () => void;
}

interface Etat {
  erreur: Error | null;
  copie: boolean;
}

/** Filet de sécurité : si un écran plante pendant son affichage (donnée inattendue renvoyée par
 * le moteur, par exemple), l'utilisateur voit un message et un moyen de repartir, au lieu d'une
 * fenêtre blanche. Limites : n'attrape pas les erreurs des gestionnaires de clic ni du code
 * asynchrone (déjà traitées par des try/catch et `nettoyerErreur`). */
export default class FiltreErreurs extends Component<Props, Etat> {
  state: Etat = { erreur: null, copie: false };

  static getDerivedStateFromError(erreur: Error): Partial<Etat> {
    return { erreur };
  }

  componentDidCatch(erreur: Error, info: ErrorInfo) {
    console.error("Erreur d'affichage Orisflow :", erreur, info.componentStack);
  }

  private revenirAccueil = () => {
    this.setState({ erreur: null, copie: false });
    this.props.onAccueil();
  };

  private copierDetail = async () => {
    const detail = `${this.state.erreur?.name}: ${this.state.erreur?.message}\n${this.state.erreur?.stack ?? ""}`;
    try {
      await navigator.clipboard.writeText(detail);
      this.setState({ copie: true });
    } catch {
      // Presse-papiers indisponible : le détail reste consultable dans la console.
    }
  };

  render() {
    if (!this.state.erreur) return this.props.children;
    return (
      <section role="alert" className="message message--erreur">
        <h1>Un écran d'Orisflow a rencontré une erreur</h1>
        <p>Vos fichiers n'ont pas été modifiés. Vous pouvez revenir à l'accueil et recommencer.</p>
        <div className="actions">
          <button type="button" className="bouton bouton--principal" onClick={this.revenirAccueil}>
            Revenir à l'accueil
          </button>
          <button type="button" className="bouton" onClick={this.copierDetail}>
            Copier le détail de l'erreur
          </button>
          {this.state.copie && (
            <span role="status" className="aide-inline">
              Détail copié.
            </span>
          )}
        </div>
      </section>
    );
  }
}
