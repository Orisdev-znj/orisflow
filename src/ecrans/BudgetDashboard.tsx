// Coquille UI du futur module « Évaluation Budgétaire » (Prévisions vs Réalisations).
//
// Demandé le 02/10/2026, en anticipation du besoin : aucune donnée réelle ni structure de
// fichier budgétaire n'est encore disponible. Ce composant n'affiche que des données
// FICTIVES, pour visualiser la forme de l'écran avant que les vrais fichiers sources
// n'arrivent. Isolation : ce fichier ne touche à aucun code du sprint 5 (classification,
// génération, lecture des PDF) et n'appelle aucune commande du moteur Python — il n'existe
// pas encore de `budget_evaluator` branché (voir engine/orisflow_engine/budget_evaluator.py,
// squelette non relié à `cli.py` pour l'instant).
//
// TODO (quand les fichiers réels seront disponibles) :
// - Remplacer `LIGNES_FICTIVES` par un appel à une future commande moteur (ex.
//   `window.orisflow.evaluerBudget()`), sur le modèle des écrans Trésorerie.
// - Définir les vraies catégories budgétaires (actuellement des exemples génériques).
// - Décider du seuil d'écart qui déclenche le rouge (actuellement : tout dépassement du
//   prévu est rouge, toute sous-consommation est verte — à valider avec la supervision).

interface LigneBudget {
  categorie: string;
  prevu: number;
  realise: number;
}

// Données D'EXEMPLE UNIQUEMENT — aucun chiffre réel d'ORIS FINANCE. À retirer dès que le
// moteur réel est branché.
const LIGNES_FICTIVES: LigneBudget[] = [
  { categorie: "Charges de personnel", prevu: 45_000_000, realise: 47_200_000 },
  { categorie: "Charges générales d'exploitation", prevu: 18_000_000, realise: 16_450_000 },
  { categorie: "Produits financiers", prevu: 62_000_000, realise: 59_800_000 },
  { categorie: "Dotations aux provisions", prevu: 9_500_000, realise: 9_500_000 },
];

function formaterMontant(valeur: number): string {
  return valeur.toLocaleString("fr-FR");
}

function ligneTableau(ligne: LigneBudget) {
  const ecart = ligne.realise - ligne.prevu;
  const defavorable = ecart > 0; // dépense réalisée au-delà du prévu : à affiner par catégorie
  return (
    <tr key={ligne.categorie}>
      <td>{ligne.categorie}</td>
      <td>{formaterMontant(ligne.prevu)}</td>
      <td>{formaterMontant(ligne.realise)}</td>
      <td>
        <span className={defavorable ? "badge badge--bloquant" : "badge badge--info"}>
          {ecart > 0 ? "+" : ""}
          {formaterMontant(ecart)}
        </span>
      </td>
    </tr>
  );
}

interface Props {
  onRetourAccueil: () => void;
}

export default function BudgetDashboard({ onRetourAccueil }: Props) {
  return (
    <section aria-labelledby="titre-budget">
      <h1 id="titre-budget">Évaluation budgétaire</h1>
      <p className="message message--avertissement" role="status">
        Données fictives — ce module n'est pas encore connecté à de vraies données. Il
        anticipe la forme de l'écran en attendant les fichiers budgétaires réels.
      </p>
      <p className="aide">
        Comparaison prévisions / réalisations par catégorie, avec un code couleur pour les
        écarts (vert : favorable ou neutre, rouge : dépassement du budget prévu).
      </p>

      <table className="tableau">
        <thead>
          <tr>
            <th>Catégorie</th>
            <th>Prévu</th>
            <th>Réalisé</th>
            <th>Écart</th>
          </tr>
        </thead>
        <tbody>{LIGNES_FICTIVES.map(ligneTableau)}</tbody>
      </table>

      <div className="actions">
        <button type="button" className="bouton" onClick={onRetourAccueil}>
          Retour à l'accueil
        </button>
      </div>
    </section>
  );
}
