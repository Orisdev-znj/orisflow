import { useEffect, useState } from "react";
import EcranBordereauListe from "./EcranBordereauListe";
import EcranBordereauNouvelle from "./EcranBordereauNouvelle";

type EcranBordereau = "liste" | "nouvelle";

/** Module autonome : gère sa propre navigation interne (liste / nouvelle transmission),
 * comme le fait le module Trésorerie avec ses propres écrans. */
export default function ModuleBordereau() {
  const [ecran, setEcran] = useState<EcranBordereau>("liste");
  const [identite, setIdentite] = useState("");
  // Tant que l'utilisateur n'a pas choisi de dossier réseau partagé (demande du 30/09/2026 :
  // pouvoir tester quand même), Orisflow utilise un dossier local de repli — signalé à
  // l'utilisateur pour qu'il ne le confonde pas avec un vrai partage visible des collègues.
  const [dossierParDefaut, setDossierParDefaut] = useState(false);

  useEffect(() => {
    window.orisflow
      ?.lireParametres()
      .then((parametres) => {
        setIdentite(parametres.identite);
        setDossierParDefaut(parametres.dossierBordereauParDefaut);
      })
      .catch(() => {
        setIdentite("");
        setDossierParDefaut(false);
      });
  }, [ecran]);

  if (ecran === "nouvelle") {
    return <EcranBordereauNouvelle identite={identite} onCree={() => setEcran("liste")} />;
  }
  return (
    <EcranBordereauListe
      identite={identite}
      dossierParDefaut={dossierParDefaut}
      onNouvelle={() => setEcran("nouvelle")}
    />
  );
}
