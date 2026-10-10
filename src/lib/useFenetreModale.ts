import { useEffect, useRef } from "react";

const SELECTEUR_FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Comportement clavier standard d'une fenêtre modale : Échap ferme, Tab reste dans la
 * fenêtre, le focus va au premier champ à l'ouverture et revient à l'élément d'origine à la
 * fermeture. À poser sur l'élément `role="dialog"`. */
export function useFenetreModale<T extends HTMLElement>(onFermer: () => void) {
  const reference = useRef<T>(null);
  const fermer = useRef(onFermer);
  fermer.current = onFermer;

  useEffect(() => {
    const precedent = document.activeElement as HTMLElement | null;
    const fenetre = reference.current;
    const focusables = () =>
      fenetre ? Array.from(fenetre.querySelectorAll<HTMLElement>(SELECTEUR_FOCUSABLE)) : [];
    if (fenetre && !fenetre.contains(document.activeElement)) focusables()[0]?.focus();

    const auClavier = (evenement: KeyboardEvent) => {
      if (evenement.key === "Escape") {
        evenement.stopPropagation();
        fermer.current();
        return;
      }
      if (evenement.key !== "Tab") return;
      const elements = focusables();
      if (elements.length === 0) return;
      const premier = elements[0];
      const dernier = elements[elements.length - 1];
      if (evenement.shiftKey && document.activeElement === premier) {
        evenement.preventDefault();
        dernier.focus();
      } else if (!evenement.shiftKey && document.activeElement === dernier) {
        evenement.preventDefault();
        premier.focus();
      }
    };
    document.addEventListener("keydown", auClavier);
    return () => {
      document.removeEventListener("keydown", auClavier);
      precedent?.focus?.();
    };
  }, []);

  return reference;
}
