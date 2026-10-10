import { useState } from "react";
import type { ResultatControleModele } from "../lib/types";
import { nettoyerErreur } from "../lib/format";

type Etat =
  | { etat: "inactif" }
  | { etat: "encours" }
  | { etat: "resultat"; resultat: ResultatControleModele }
  | { etat: "erreur"; message: string };

/** Contrôle d'un classeur « modèle standard » avant de s'en servir : lecture seule, rien n'est modifié. */
export default function ControleModele() {
  const [etat, setEtat] = useState<Etat>({ etat: "inactif" });

  const controler = async () => {
    const api = window.orisflow;
    if (!api) {
      setEtat({ etat: "erreur", message: "Cette fonction n'est disponible que dans l'application Orisflow." });
      return;
    }
    setEtat({ etat: "encours" });
    try {
      const reponse = await api.controlerModele();
      setEtat(reponse ? { etat: "resultat", resultat: reponse } : { etat: "inactif" });
    } catch (erreur) {
      setEtat({ etat: "erreur", message: nettoyerErreur(erreur) });
    }
  };

  return (
    <>
      <h2>Modèle de classeur standard</h2>
      <p className="aide">
        Avant d'utiliser votre classeur standard (logo, protections, volets figés), faites-le contrôler : Orisflow vérifie
        qu'il peut y écrire, simule son enregistrement pour dire ce qui serait perdu, et liste ce qu'il reste à
        standardiser. Le classeur choisi n'est jamais modifié.
      </p>
      <div className="actions">
        <button type="button" className="bouton" onClick={controler} disabled={etat.etat === "encours"}>
          {etat.etat === "encours" ? "Contrôle en cours…" : "Contrôler un classeur modèle…"}
        </button>
      </div>

      {etat.etat === "erreur" && (
        <p role="alert" className="message message--erreur">
          {etat.message}
        </p>
      )}

      {etat.etat === "resultat" && (
        <div role="status">
          <p className={etat.resultat.ok ? "message message--succes" : "message message--erreur"}>
            {etat.resultat.ok
              ? etat.resultat.a_corriger === 0
                ? "Ce classeur est conforme : Orisflow peut s'en servir tel quel."
                : `Orisflow peut s'en servir, mais ${etat.resultat.a_corriger} point(s) de standardisation restent à corriger.`
              : `Ce classeur ne peut pas être utilisé tel quel : ${etat.resultat.bloquants} point(s) bloquant(s).`}
          </p>
          <ul className="liste-controles">
            {etat.resultat.controles.map((controle) => (
              <li key={controle.libelle} className={controle.ok ? "controle--ok" : `controle--${controle.gravite}`}>
                <span className="controle__marque" aria-hidden="true">
                  {controle.ok ? "✓" : controle.gravite === "bloquant" ? "✗" : "!"}
                </span>
                <span>
                  <strong>{controle.libelle}</strong>
                  <span className="aide-inline"> — {controle.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
