"""Fond de l'écran de connexion : efface le slogan écrit dans l'image d'origine.

Usage : python -I scripts/preparer_fond_connexion.py <image_source.png> <image_sortie.png>

La source n'est jamais modifiée. La zone du slogan est reconstruite avec une bande propre
prise plus à droite, à la même hauteur et décalée d'un multiple EXACT de la période de la trame
de points (26 px) : la trame reste donc alignée. Le dégradé est raccordé en corrigeant
l'écart de teinte entre la bande source et les bords de la zone, puis les bords sont fondus.
"""

import sys

import numpy as np
from PIL import Image, ImageFilter

ZONE = (60, 58, 790, 119)       # x0, y0, x1, y1 (pixels de l'image d'origine)
PERIODE_X = 26                  # période horizontale de la trame de points (mesurée)
DECALAGE = PERIODE_X * 28       # 728 px : bande propre à droite du slogan
BORD = 8                        # largeur de raccord
FONDU = 2                       # adoucissement du masque (court : ne pas toucher les points voisins)


def _lisser(vecteur: np.ndarray, sigma: float = 25.0) -> np.ndarray:
    noyau = np.exp(-0.5 * (np.arange(-3 * int(sigma), 3 * int(sigma) + 1) / sigma) ** 2)
    noyau /= noyau.sum()
    complet = np.pad(vecteur, ((3 * int(sigma), 3 * int(sigma)), (0, 0)), mode="edge")
    return np.stack([np.convolve(complet[:, c], noyau, mode="valid") for c in range(vecteur.shape[1])], axis=1)


def main(source: str, sortie: str) -> None:
    image = Image.open(source).convert("RGB")
    a = np.asarray(image).astype(np.float64)
    x0, y0, x1, y1 = ZONE
    cible = a[y0:y1, x0:x1].copy()
    propre = a[y0:y1, x0 + DECALAGE:x1 + DECALAGE].copy()
    h, l, _ = cible.shape

    # Raccord du dégradé : le fond propre est décalé de 728 px, donc plus ou moins clair.
    # Écart mesuré sur les bandes au-dessus et en dessous de la zone (sans texte), interpolé en y.
    haut_c = a[y0 - BORD:y0, x0:x1].mean(axis=0)
    bas_c = a[y1:y1 + BORD, x0:x1].mean(axis=0)
    haut_s = a[y0 - BORD:y0, x0 + DECALAGE:x1 + DECALAGE].mean(axis=0)
    bas_s = a[y1:y1 + BORD, x0 + DECALAGE:x1 + DECALAGE].mean(axis=0)
    ecart_haut = _lisser(haut_c - haut_s)
    ecart_bas = _lisser(bas_c - bas_s)
    t = np.linspace(0, 1, h)[:, None, None]
    correction = ecart_haut[None] * (1 - t) + ecart_bas[None] * t
    reconstruit = np.clip(propre + correction, 0, 255)

    masque = Image.new("L", (l, h), 0)
    masque.paste(255, (FONDU, FONDU, l - FONDU, h - FONDU))
    masque = np.asarray(masque.filter(ImageFilter.GaussianBlur(FONDU / 2))).astype(np.float64)[..., None] / 255.0
    a[y0:y1, x0:x1] = cible * (1 - masque) + reconstruit * masque

    Image.fromarray(np.clip(a.round(), 0, 255).astype(np.uint8)).save(sortie, optimize=True)
    print("écrit :", sortie)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
