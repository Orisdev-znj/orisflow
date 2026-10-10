"""Logo clair pour l'écran de connexion (fond bleu marine).

Usage : python -I scripts/preparer_logo_clair.py <logo_source.png> <logo_sortie.png>

Les FORMES ne changent pas, seules les couleurs : le texte marine devient blanc, le texte
magenta devient un magenta plus clair, le pictogramme garde ses couleurs avec un fin contour
clair (le carré marine se confondrait sinon avec le fond). La signature (« Votre partenaire de
croissance »), trop fine une fois réduite, est retirée : elle est affichée en vrai texte.
La source n'est jamais modifiée.

Constat du 10/10/2026 sur le logo réel : « ORIS » est MAGENTA et « FINANCE S.A » est MARINE
(l'inverse du tableau de la charte). Les couleurs sont donc traitées d'après la teinte lue,
jamais d'après le mot.
"""

import colorsys
import sys

import numpy as np
from PIL import Image, ImageFilter

FACTEUR = 2
LIMITE_PICTO = 0.37     # le pictogramme occupe la partie gauche (x < 37 % de la largeur)
DEBUT_SIGNATURE = 124   # ligne (pixels d'origine) où commence la signature, à droite du pictogramme
BLANC = np.array([255, 255, 255], dtype=np.float64)
MAGENTA_CLAIR = np.array([0xFF, 0x4F, 0xA0], dtype=np.float64)
CONTOUR_PX = 3          # 2 px d'origine environ, après agrandissement


def main(source: str, sortie: str) -> None:
    logo = Image.open(source).convert("RGBA")
    logo = logo.resize((logo.width * FACTEUR, logo.height * FACTEUR), Image.LANCZOS)
    a = np.asarray(logo).astype(np.float64)
    h, l, _ = a.shape
    limite = int(l * LIMITE_PICTO)

    # Signature retirée (hors pictogramme).
    a[DEBUT_SIGNATURE * FACTEUR:, limite:, 3] = 0

    # Recoloration du texte d'après la teinte, alpha conservé.
    rgb = a[:, limite:, :3] / 255.0
    alpha = a[:, limite:, 3]
    nouveau = a[:, limite:, :3].copy()
    for y in range(h):
        for x in range(rgb.shape[1]):
            if alpha[y, x] < 2:
                continue
            teinte, saturation, valeur = colorsys.rgb_to_hsv(*rgb[y, x])
            if saturation < 0.15:
                continue
            if 0.55 <= teinte <= 0.75:        # bleu marine -> blanc
                nouveau[y, x] = BLANC
            elif teinte >= 0.85 or teinte <= 0.02:  # magenta -> magenta clair
                nouveau[y, x] = MAGENTA_CLAIR
    a[:, limite:, :3] = nouveau

    # Contour clair autour du pictogramme (blanc à 70 %), placé SOUS le logo.
    picto_alpha = Image.fromarray(a[:, :limite, 3].astype(np.uint8))
    elargi = picto_alpha.filter(ImageFilter.MaxFilter(2 * CONTOUR_PX + 1))
    halo = np.zeros((h, l, 4), dtype=np.float64)
    halo[:, :limite, :3] = 255
    halo[:, :limite, 3] = np.asarray(elargi).astype(np.float64) * 0.70

    dessus = a / 255.0
    dessous = halo / 255.0
    alpha_sortie = dessus[..., 3] + dessous[..., 3] * (1 - dessus[..., 3])
    with np.errstate(invalid="ignore", divide="ignore"):
        couleur = (dessus[..., :3] * dessus[..., 3:4] + dessous[..., :3] * dessous[..., 3:4] * (1 - dessus[..., 3:4])) / alpha_sortie[..., None]
    couleur = np.nan_to_num(couleur)
    resultat = np.dstack([couleur * 255, alpha_sortie * 255]).round().clip(0, 255).astype(np.uint8)

    image = Image.fromarray(resultat, "RGBA")
    image = image.crop(image.getbbox())
    image.save(sortie, optimize=True)
    print("écrit :", sortie, image.size)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
