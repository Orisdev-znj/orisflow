import { useState } from "react";
import { CAS_USAGE, type IdCas } from "../lib/cloudbankCas";

interface Props {
  casId: IdCas | null;
  valeurs: Record<string, string>;
  onChoisir: (id: IdCas) => void;
  onValeurs: (valeurs: Record<string, string>) => void;
  // Appelé quand le prompt a été copié, ou quand l'utilisateur a déjà son fichier.
  onDebloquerImport: () => void;
}

/** Écran 1 : choisir le cas d'usage et copier son prompt. Orisflow n'envoie rien à Claude :
 * l'utilisateur colle lui-même le prompt avec son document dans Claude Code ou claude.ai. */
export default function EcranCloudBankCasUsage({ casId, valeurs, onChoisir, onValeurs, onDebloquerImport }: Props) {
  const [copie, setCopie] = useState(false);
  const [erreurCopie, setErreurCopie] = useState(false);
  const cas = CAS_USAGE.find((c) => c.id === casId) ?? null;

  const copier = async () => {
    if (!cas) return;
    setErreurCopie(false);
    try {
      await navigator.clipboard.writeText(cas.construire(valeurs));
      setCopie(true);
      window.setTimeout(() => setCopie(false), 2000);
      onDebloquerImport();
    } catch {
      setErreurCopie(true);
    }
  };

  return (
    <section aria-labelledby="titre-cloudbank-cas" className="cloudbank-cas-usage">
      <h1 id="titre-cloudbank-cas">Téléverser sur CloudBank</h1>
      <p className="aide">
        Choisissez le type de document. Orisflow vous donne le texte à coller dans Claude avec votre document ; Claude
        prépare un fichier, que vous importez ensuite ici pour le confirmer.
      </p>

      <div className="cloudbank-cas-grille">
        {CAS_USAGE.map((c) => (
          <article
            key={c.id}
            className={c.id === casId ? "carte-module carte-module--compacte cloudbank-cas cloudbank-cas--actif" : "carte-module carte-module--compacte cloudbank-cas"}
          >
            <h2 className="cloudbank-cas__titre">
              <span aria-hidden="true">{c.symbole} </span>
              {c.titre}
            </h2>
            <p className="aide">{c.description}</p>
            <button
              type="button"
              className="bouton"
              aria-pressed={c.id === casId}
              onClick={() => {
                onChoisir(c.id);
                setCopie(false);
              }}
            >
              {c.id === casId ? "Choisi" : "Choisir"}
            </button>
          </article>
        ))}
      </div>

      {cas && (
        <div className="cloudbank-prompt" aria-live="polite">
          <h2>{cas.titre} : texte à copier</h2>

          {cas.champs.map((champ) => (
            <div className="champ" key={champ.cle}>
              <label htmlFor={`cloudbank-champ-${champ.cle}`}>{champ.libelle}</label>
              <input
                id={`cloudbank-champ-${champ.cle}`}
                type="text"
                value={valeurs[champ.cle] ?? ""}
                placeholder={champ.placeholder}
                onChange={(e) => onValeurs({ ...valeurs, [champ.cle]: e.target.value })}
              />
            </div>
          ))}

          <pre className="cloudbank-prompt__texte" aria-label="Texte à copier dans Claude">
            {cas.construire(valeurs)}
          </pre>

          <div className="actions">
            <button type="button" className="bouton bouton--action" onClick={copier}>
              {copie ? "Copié !" : "Copier le texte"}
            </button>
            <button type="button" className="bouton bouton--lien" onClick={onDebloquerImport}>
              J'ai déjà le fichier : passer à l'import
            </button>
          </div>
          {erreurCopie && (
            <p role="alert" className="message message--erreur">
              La copie n'a pas fonctionné : sélectionnez le texte ci-dessus et copiez-le avec Ctrl+C.
            </p>
          )}
          <p className="aide">Collez ce texte avec votre document dans Claude Code ou claude.ai, puis revenez ici importer le résultat.</p>
        </div>
      )}
    </section>
  );
}
