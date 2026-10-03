import { useState } from "react";
import { AGENCES_RESEAU } from "../lib/agences";

interface Props {
  gestionnairesInitiaux: Record<string, string>;
  onAnnuler: () => void;
  onEnregistrer: (mapping: Record<string, string>) => void;
}

interface Ligne {
  id: number;
  nom: string;
  agence: string;
}

function versLignes(mapping: Record<string, string>): Ligne[] {
  const lignes = Object.entries(mapping).map(([nom, agence], index) => ({ id: index, nom, agence }));
  return lignes.length > 0 ? lignes : [{ id: 0, nom: "", agence: AGENCES_RESEAU[0].cle }];
}

/** Fenêtre de configuration de la table gestionnaire → agence (03/10/2026) : le nom lu
 * dans le champ « Gestionnaire » d'une liste de comptes identifie l'agence quand le nom
 * du fichier ne le permet pas (fichier pas encore renommé). Table entièrement fournie par
 * l'utilisateur — Orisflow ne devine jamais une correspondance. */
export default function FenetreGestionnaires({ gestionnairesInitiaux, onAnnuler, onEnregistrer }: Props) {
  const [lignes, setLignes] = useState<Ligne[]>(versLignes(gestionnairesInitiaux));
  const prochainId = Math.max(0, ...lignes.map((l) => l.id)) + 1;

  const modifierLigne = (id: number, champ: "nom" | "agence", valeur: string) => {
    setLignes((precedent) => precedent.map((l) => (l.id === id ? { ...l, [champ]: valeur } : l)));
  };

  const ajouterLigne = () => {
    setLignes((precedent) => [...precedent, { id: prochainId, nom: "", agence: AGENCES_RESEAU[0].cle }]);
  };

  const retirerLigne = (id: number) => {
    setLignes((precedent) => precedent.filter((l) => l.id !== id));
  };

  const enregistrer = () => {
    const mapping: Record<string, string> = {};
    for (const ligne of lignes) {
      const nom = ligne.nom.trim();
      if (nom) mapping[nom] = ligne.agence;
    }
    onEnregistrer(mapping);
  };

  return (
    <div className="superposition" role="presentation">
      <div className="fenetre-modale" role="dialog" aria-modal="true" aria-labelledby="titre-gestionnaires">
        <h2 id="titre-gestionnaires">Gestionnaires</h2>
        <p className="aide">
          Associez chaque gestionnaire à son agence. Quand le nom du fichier ne suffit pas pour reconnaître
          l'agence d'une liste de comptes, Orisflow regarde le gestionnaire indiqué dans le fichier.
        </p>

        {lignes.map((ligne) => (
          <div key={ligne.id} className="ligne-gestionnaire">
            <input
              type="text"
              value={ligne.nom}
              onChange={(e) => modifierLigne(ligne.id, "nom", e.target.value)}
              placeholder="Nom du gestionnaire"
              aria-label="Nom du gestionnaire"
            />
            <select
              value={ligne.agence}
              onChange={(e) => modifierLigne(ligne.id, "agence", e.target.value)}
              aria-label="Agence"
            >
              {AGENCES_RESEAU.map((agence) => (
                <option key={agence.cle} value={agence.cle}>
                  {agence.libelle}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="bouton bouton--lien"
              onClick={() => retirerLigne(ligne.id)}
              aria-label={`Retirer ${ligne.nom || "cette ligne"}`}
            >
              Retirer
            </button>
          </div>
        ))}

        <div className="actions actions--ligne">
          <button type="button" className="bouton" onClick={ajouterLigne}>
            Ajouter un gestionnaire
          </button>
        </div>

        <div className="actions">
          <button type="button" className="bouton bouton--principal" onClick={enregistrer}>
            Enregistrer
          </button>
          <button type="button" className="bouton" onClick={onAnnuler}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
