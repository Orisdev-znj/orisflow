import { useEffect, useRef, useState } from "react";
import type { UtilisateurPublic } from "../lib/types";

interface Props {
  session: UtilisateurPublic;
  onParametres: () => void;
  onUtilisateurs: () => void;
  onJournal: () => void;
  onDeconnecter: () => void;
}

/** Menu de l'en-tête : un seul bouton (le nom de la personne connectée) au lieu de quatre. */
export default function MenuUtilisateur({ session, onParametres, onUtilisateurs, onJournal, onDeconnecter }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const conteneur = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const clic = (evenement: MouseEvent) => {
      if (conteneur.current && !conteneur.current.contains(evenement.target as Node)) setOuvert(false);
    };
    const clavier = (evenement: KeyboardEvent) => {
      if (evenement.key === "Escape") {
        setOuvert(false);
        bouton.current?.focus();
      }
    };
    document.addEventListener("mousedown", clic);
    document.addEventListener("keydown", clavier);
    return () => {
      document.removeEventListener("mousedown", clic);
      document.removeEventListener("keydown", clavier);
    };
  }, [ouvert]);

  const choisir = (action: () => void) => () => {
    setOuvert(false);
    action();
  };

  const estAdmin = session.role === "admin";
  return (
    <div className="menu-utilisateur" ref={conteneur}>
      <button
        ref={bouton}
        type="button"
        className="bouton-accueil menu-utilisateur__bouton"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        onClick={() => setOuvert((o) => !o)}
      >
        {session.nomAffiche || session.identifiant} ▾
      </button>
      {ouvert && (
        <ul className="menu-utilisateur__liste" role="menu">
          <li role="none">
            <button type="button" role="menuitem" onClick={choisir(onParametres)}>
              Paramètres
            </button>
          </li>
          {estAdmin && (
            <li role="none">
              <button type="button" role="menuitem" onClick={choisir(onUtilisateurs)}>
                Utilisateurs
              </button>
            </li>
          )}
          {estAdmin && (
            <li role="none">
              <button type="button" role="menuitem" onClick={choisir(onJournal)}>
                Journal des actions
              </button>
            </li>
          )}
          <li role="none">
            <button type="button" role="menuitem" onClick={choisir(onDeconnecter)}>
              Se déconnecter
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
