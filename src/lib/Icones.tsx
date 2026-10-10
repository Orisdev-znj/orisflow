/** Icônes en ligne (aucune dépendance), au trait, en `currentColor` : elles prennent la couleur du
 * conteneur (marine sur les cartes de l'accueil). Tracés d'après la bibliothèque Lucide (licence
 * libre). Remplacent les emojis, dont le rendu dépend de la police de Windows. */
interface Props {
  taille?: number;
}

const base = (taille: number) => ({
  viewBox: "0 0 24 24",
  width: taille,
  height: taille,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
});

export function IconeCourrier({ taille = 56 }: Props) {
  return (
    <svg {...base(taille)}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

export function IconeTeleversement({ taille = 56 }: Props) {
  return (
    <svg {...base(taille)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" x2="12" y1="3" y2="15" />
    </svg>
  );
}
