import { useEffect, useState } from "react";
import EcranBordereauListe from "./EcranBordereauListe";
import EcranBordereauNouvelle from "./EcranBordereauNouvelle";

type EcranBordereau = "liste" | "nouvelle";

/** Module autonome : gère sa propre navigation interne (liste / nouvelle transmission),
 * comme le fait le module Trésorerie avec ses propres écrans. */
export default function ModuleBordereau() {
  const [ecran, setEcran] = useState<EcranBordereau>("liste");
  const [identite, setIdentite] = useState("");

  useEffect(() => {
    window.orisflow
      ?.lireParametres()
      .then((parametres) => setIdentite(parametres.identite))
      .catch(() => setIdentite(""));
  }, [ecran]);

  if (ecran === "nouvelle") {
    return <EcranBordereauNouvelle identite={identite} onCree={() => setEcran("liste")} />;
  }
  return <EcranBordereauListe identite={identite} onNouvelle={() => setEcran("nouvelle")} />;
}
