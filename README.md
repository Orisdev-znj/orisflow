# Orisflow

Application de bureau Windows pour **ORIS FINANCE** (microfinance, plan comptable PCEMF), destinée à la Direction Administrative et Financière (DAF). Elle automatise la production des états de suivi de l'entreprise à partir des extractions du système comptable **CloudBank**.

Deux fonctionnalités, développées dans cet ordre :
- **B — Suivi de trésorerie journalière** (priorité actuelle, en version 1.1.0) : production du classeur `TRESORERIE JOURNALIÈRE et TDB DU jj mm aaaa.xlsx`.
- **A — Bilan consolidé** : balance comptable vers bilan et compte de résultat (script existant, non encore intégré à l'application).

Ce document décrit la fonctionnalité B telle qu'elle existe en version 1.1.0.

---

## 1. Ce que fait Orisflow (présentation pour la DAF)

Chaque matin, l'utilisateur télécharge les extractions du jour (listes de comptes par agence, balances comptables, relevés bancaires) et les dépose dans Orisflow. L'application :

1. **Identifie** chaque fichier : de quel type il s'agit (liste de comptes, relevé bancaire, balance…) et à quelle agence il appartient. Une liste de comptes est reconnue même sans renommage, grâce à une table de numéros de compte propres à chaque agence, à la table des gestionnaires (optionnelle) et, en dernier recours, au total de comptes de la veille.
2. **Lit** les montants : nombre de comptes par catégorie, encours des dépôts et des engagements, soldes des caisses, soldes bancaires (CCA-Bank, Afriland, BGFI, Western Union).
3. **Demande à l'utilisateur** les quelques montants qu'elle ne peut pas lire seule (UBA, Ecobank, Access Bank, unités virtuelles), ainsi que le solde du jour pour un relevé bancaire absent — en proposant de garder celui de la veille si on « passe ».
4. **Produit un nouveau classeur**, daté du jour, copié du dernier classeur existant (jamais écrasé), avec les lignes automatisées remplies et les lignes « J-1 » avancées.
5. **Signale** ce qu'elle n'a pas pu faire : fichier non reconnu, agence incertaine, relevé manquant, montant resté celui de la veille.

Orisflow ne remplace pas le contrôle humain : chaque classeur généré reste à vérifier avant d'être considéré comme définitif.

---

## 2. Fonctionnement technique (vue d'ensemble)

```
Interface (Electron + React/TypeScript)
        │  IPC (process principal Electron)
        ▼
Moteur Python (orisflow_engine), lancé en sous-processus
        │  JSON sur l'entrée/la sortie standard (un objet par échange)
        ▼
Fichiers sur disque : extractions (lecture seule), classeur de référence (lecture
seule), classeur généré (nouveau fichier), carnet des soldes, table des comptes
```

- **Aucune règle comptable dans l'interface.** Tout le calcul vit dans le moteur Python (`engine/orisflow_engine/`). L'interface importe, lance, suit et affiche.
- **Les fichiers sources ne sont jamais modifiés.** Le classeur de référence est copié avant d'être édité ; les extractions, relevés et balances sont ouverts en lecture seule.
- **Le moteur ne contient aucun chemin en dur.** Les dossiers (travail, référence, carnet, table) sont transmis par Electron, lui-même configuré depuis l'écran Paramètres.
- **Protocole** : chaque commande moteur (`classer`, `generer`, `table_comptes_construire`, `carnet_importer_classeur`, `diagnostic`, `bordereau_*`) reçoit un objet JSON de paramètres sur son entrée standard, et répond par une suite d'objets JSON sur sa sortie standard — des événements de progression, puis un résultat final. Electron relit ce flux ligne par ligne et le transmet à l'interface.

### Modules principaux du moteur

| Module | Rôle |
|---|---|
| `classification.py` | Type de chaque fichier, agence (nom, gestionnaire, numéros de compte, comptage), doublons, cohérence avec la veille. |
| `comptes_agences.py` | Table de 15 numéros de compte par agence : identification d'une liste sans dépendre de son nom. |
| `comptes.py` | Comptage des comptes par catégorie, numéros mal formés ou en double. |
| `balance_pdf.py` | Lecture positionnelle des balances CloudBank (classes 3 et 5) : dépôts, engagements, caisses. |
| `pdf_releves.py` | Lecture des relevés bancaires PDF (CCA-Bank, Afriland, BGFI). |
| `regles_banques.py` | Table des comptes bancaires connus, bons de caisse fixes, champs toujours saisis à la main. |
| `regles_agences.py` | Alias de noms, codes agence, colonnes du classeur. |
| `generation.py` | Seul module qui écrit un classeur : copie du modèle, remplissage des lignes automatisées, J-1, caisses, banques. |
| `carnet.py` | Carnet interne des soldes bancaires, par date de clôture : sert à proposer la veille pour un relevé absent. |
| `reference_treso.py` | Recherche du dernier classeur disponible dans le dossier de référence. |
| `bordereau.py` | Suivi Courrier (transmission de documents), journal d'évènements par fichiers. |
| `cli.py` | Point d'entrée du protocole JSON ; fait le lien entre Electron et les modules ci-dessus. |

---

## 3. Prérequis (poste de développement)

Testé sur Windows 11, avec :

| Outil | Version utilisée |
|---|---|
| Node.js | 24.19.0 |
| npm | 11.17.0 |
| Python | 3.14.4 (ajouté au `PATH`) |

Aucune autre dépendance système n'est nécessaire : les extractions `.xls` sont lues directement par `xlrd`, sans LibreOffice.

Un poste qui se contente d'**utiliser** `Orisflow.exe` n'a besoin de rien de tout cela : l'exécutable est autonome (voir §5).

---

## 4. Installation et lancement (poste de développement)

```powershell
# 1. Cloner le dépôt
git clone https://github.com/Orisdev-znj/orisflow.git
cd orisflow

# 2. Dépendances de l'interface (Electron, React, outils de build)
npm install

# 3. Dépendances du moteur Python
python -m pip install -r engine/requirements.txt

# 4. Tests, pour vérifier que tout fonctionne
npx vitest run                     # interface (Vitest)
python -m pytest engine/tests -q   # moteur (pytest)

# 5. Lancer Orisflow depuis les sources
npm run start
```

`npm run start` compile l'interface puis ouvre la fenêtre Electron, qui appelle directement `python` (pas besoin de construire le moteur pour développer).

**Piège connu** : si vous lancez ces commandes depuis un terminal VS Code, celui-ci définit `ELECTRON_RUN_AS_NODE=1`, ce qui empêche Electron d'ouvrir une fenêtre. `scripts/lancer.cjs` le retire automatiquement ; si vous appelez `electron` directement, pensez à `Remove-Item Env:\ELECTRON_RUN_AS_NODE` avant.

---

## 5. Construction de l'exécutable (encapsulation)

Orisflow est livré comme un **seul fichier portable**, `Orisflow.exe`, sans installateur et sans Python à installer sur le poste cible.

### Principe

1. **PyInstaller** empaquette tout le moteur Python (`engine/orisflow_engine/`) en un exécutable autonome, `engine/dist/orisflow-engine.exe` — y compris pandas, openpyxl et PyMuPDF.
2. **electron-builder** construit l'application Electron (`npm run package`) et embarque cet exécutable comme ressource (`extraResources`, voir `package.json`) : il est copié dans le dossier de l'application, à côté du reste.
3. À l'exécution, le process principal Electron lance `orisflow-engine.exe` en sous-processus et lui parle en JSON (voir §2) — l'utilisateur final ne voit jamais Python, ni une fenêtre de terminal.

### Commande unique

```powershell
powershell -ExecutionPolicy Bypass -File scripts\livrer.ps1
```

Cette chaîne fait, dans l'ordre, et s'arrête à la première erreur :
1. Vérification des types TypeScript.
2. Tests de l'interface (Vitest).
3. Tests du moteur (pytest).
4. Construction de `orisflow-engine.exe` (PyInstaller).
5. Construction de `Orisflow.exe` (electron-builder, cible `portable`).
6. **Autotest** : lance `Orisflow.exe` avec la variable `ORISFLOW_AUTOTEST=<rapport.json>`, qui exécute un diagnostic sans ouvrir d'interface et écrit un rapport — la chaîne échoue si ce rapport signale une erreur.
7. Copie du résultat dans `Orisflow/Livrables/Dev/Orisflow.exe` (hors du dépôt).

**Avant de relancer cette commande, fermez `Orisflow.exe`** s'il est ouvert : electron-builder ne peut pas reconstruire un exécutable en cours d'exécution.

### Limites connues de l'exécutable actuel

- **Non signé** (`signExecutable: false`) : Windows SmartScreen peut avertir au premier lancement (« Informations complémentaires » → « Exécuter quand même »). Une signature de code (certificat OV ou EV) est nécessaire avant un déploiement à plusieurs postes.
- **~11 secondes** avant le premier affichage : le mode portable décompresse l'application à chaque lancement.
- **Icône par défaut d'Electron** au niveau de l'exécutable (le logo Oris Finance est bien utilisé dans l'interface elle-même).

---

## 6. Structure du dépôt

```
orisflow/
├── electron/              main.cjs (process principal, IPC, chemins), preload.cjs (pont sécurisé)
├── src/                   Interface React/TypeScript (écrans, composants, types)
├── engine/
│   ├── orisflow_engine/   Moteur Python (voir §2)
│   ├── tests/             Tests pytest
│   ├── requirements.txt
│   └── build_engine.ps1   Construction de orisflow-engine.exe
├── scripts/                livrer.ps1 (chaîne complète), lancer.cjs (dev)
├── build/                  Icône de l'application
└── tests/fixtures/anonymises/   Jeux de test anonymisés (aucune donnée réelle)
```

---

## 7. Tests

```powershell
npx vitest run                      # Interface
python -m pytest engine/tests -q    # Moteur
npx tsc --noEmit                    # Types TypeScript
```

Les tests du moteur travaillent uniquement sur des fichiers synthétiques (`openpyxl`/`pymupdf` fabriqués dans les tests) ou sur `tests/fixtures/anonymises/` : **aucune donnée réelle n'est nécessaire pour faire tourner la suite**, et aucune n'est jamais versionnée (voir `.gitignore`).

---

## 8. Sécurité, confidentialité et données locales

- **Jamais dans le dépôt** : balances et classeurs réels, relevés bancaires, table des comptes par agence (contient de vrais numéros de compte), carnet des soldes, `parametres.json`, identifiants et mots de passe.
- **Emplacements locaux, hors dépôt**, tous configurables depuis l'écran Paramètres :
  - `%APPDATA%\Orisflow\parametres.json` — configuration de l'application.
  - `Documents\Orisflow\Config\comptes_par_agence.json` — table des comptes.
  - `Documents\Orisflow\Carnet\soldes_bancaires.json` — carnet des soldes.
  - `Documents\Orisflow\{Imports, Resultats, Sauvegardes, SuiviCourrier}` — dossiers de travail.
- **Aucun appel réseau externe** (OCR en ligne, API) sans configuration et autorisation explicites — aucun n'est actif à ce jour.
- **Authentification** (version 1.1.0) : un identifiant et un mot de passe par utilisateur, demandés à l'ouverture d'Orisflow. Les mots de passe sont hachés (scrypt, salé, via le module `crypto` de Node — aucune dépendance ajoutée) avant d'être écrits dans `comptes.json`, au même endroit que `parametres.json`, jamais dans le dépôt. Le tout premier lancement crée le compte administrateur ; c'est ensuite l'administrateur qui crée un compte pour chaque autre utilisateur (écran « Utilisateurs »). La session reste ouverte tant qu'Orisflow n'est pas fermé ; un bouton « Se déconnecter » permet à un autre utilisateur de reprendre la main sans fermer l'application. Logique testée indépendamment de l'interface dans `electron/auth.cjs` / `electron/auth.test.cjs`.

---

## 9. État et limites connues (version 1.1.0 en cours)

Automatisé et vérifié sur des données réelles : comptes, dépôts, engagements, caisses, relevés CCA-Bank/Afriland/BGFI/Western Union, génération du classeur avec J-1 avancés.

Toujours saisi à la main, chaque jour : UBA, Ecobank, Access Bank, UV Orange Money/MTN MoMo/Maviance, Western Union en secours si son relevé est absent.

Le détail complet (décisions, zones d'ombre, historique des sessions) est tenu à jour dans `Orisflow/Contexte/` (`CLAUDE.md`, `Follow-up.md`, `Matrice-Tresorerie.md`), hors de ce dépôt technique.
