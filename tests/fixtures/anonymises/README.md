# Fixtures anonymisées

Ces fichiers sont **entièrement fictifs** (générés par `tests/fixtures/generer_fixtures.py`) :
aucune donnée réelle d'ORIS FINANCE, aucun nom de client réel, aucun montant réel. Ils
reproduisent uniquement la **structure** des exports réels (en-têtes, colonnes, formats),
pour permettre de versionner des exemples dans Git et de tester le moteur sans exposer de
données sensibles.

| Fichier | Reproduit |
|---|---|
| `Akwa_Compte.xlsx` | Extraction de comptes normale (aucune anomalie) |
| `Bafoussam_Compte.xlsx`, `Balessing_Compte.xlsx` | L'échange réel du 10/09/2026 (voir CLAUDE.md, T19) : chaque fichier a un total qui correspond en réalité à l'AUTRE agence, pour vérifier que le contrôle de cohérence du sprint 2 le détecte et suggère la bonne agence |
| `Akwa_EtBalance_Exemple_Chapitre3.xlsx` | Format « EtBalance » d'engagement, reconnu par son contenu (« Chapitre : 3 »), pas par son nom — **aucun exemple réel de ce format n'est disponible au 28/09/2026** (voir CLAUDE.md, T23) ; ceci n'illustre que la structure attendue |
| `Akwa_EtBalance_Exemple_Chapitre5.xlsx` | Idem pour la caisse (« Chapitre : 5 », ligne « Total : 57100 ») — même réserve |
| `TRESORERIE JOURNALIÈRE et TDB DU  10 09 2026 (EXEMPLE ANONYMISÉ).xlsx` | Classeur de référence minimal (feuille Synthèse, colonnes Q/R), utilisé comme « dossier de référence » du contrôle de cohérence |

Pour régénérer ces fichiers à l'identique : `python tests/fixtures/generer_fixtures.py`.

Ne jamais ajouter ici de fichier contenant une donnée réelle (voir `.gitignore` à la racine : ce dossier est la seule exception autorisée aux données Excel/PDF).
