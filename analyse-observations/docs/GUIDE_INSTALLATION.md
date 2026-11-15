# Guide d’installation du kit « Analyse des observations »

> Campus IAlès — Université populaire de l’intelligence artificielle.
> Pour qui ? Le commissaire enquêteur, sans compétence technique particulière.
> Version du kit : 3.1.0 — informations techniques vérifiées le **15/11/2026**.

## 1. Ce qu’il faut savoir

**Il n’y a rien à installer.** Le kit complet contient déjà tout ce qui est nécessaire :

- l’application (dans votre navigateur, mais **rien n’est en ligne**) ;
- l’intelligence artificielle locale **Ollama** et ses **modèles** (dossier `outils-integres`) ;
- les programmes de secours **Node.js** et **Python**.

Rien n’est modifié sur votre ordinateur : aucun programme n’est installé, aucun réglage n’est changé, **aucun droit d’administrateur** n’est nécessaire. Le kit fonctionne **sans Internet**.

Il vous faut seulement :
- Windows 10 ou 11 (64 bits) et un navigateur à jour (Edge, Chrome ou Firefox) ;
- environ **25 Go d’espace libre** si vous copiez le kit sur l’ordinateur (ou une clé USB / un disque d’au moins **32 Go**).

## 2. Contenu du kit

| Élément | Rôle |
|---|---|
| `demarrer.bat` | **Double-cliquez ici pour démarrer.** |
| `arreter.bat` | Arrête complètement le kit et libère la mémoire. |
| `verifier-integrite.bat` | Vérifie que le kit est complet et non modifié. |
| `application/` | Le logiciel, les guides, le registre de démonstration, la vidéo. |
| `outils-integres/` | L’IA locale (Ollama), les modèles, Node.js et Python. Ne pas modifier. |
| `donnees/` | **Vos** données (dossier de travail, journal, analyses…). Conservé lors des mises à jour. |
| `LISEZMOI.txt`, `CHANGELOG.md`, `VERSION`, `SOMMES-SHA256.txt` | Informations et contrôle d’intégrité. |

## 3. Mettre le kit en place

1. Copiez le dossier `kit-campus-iales-v3.1.0` reçu (clé USB ou disque externe) vers un emplacement de votre ordinateur, par exemple `Documents\Kit Campus IAles\`. Il est aussi possible de l’utiliser directement depuis la clé, mais plus lentement.
   - Évitez les dossiers synchronisés avec un service en ligne (OneDrive, Dropbox…) : le dossier `donnees/` contiendra des données personnelles.
2. **Vérifiez la copie** (recommandé, 5 à 10 minutes) : double-cliquez sur `verifier-integrite.bat`. Le message « Kit intègre » doit s’afficher.
3. **Démarrez** : double-cliquez sur `demarrer.bat`.
   - Si Windows affiche « Windows a protégé votre ordinateur » : *Informations complémentaires* → *Exécuter quand même*.
   - Si le pare-feu Windows pose une question pour « ollama » ou « node » : vous pouvez **refuser** ; le kit ne communique qu’avec votre propre ordinateur.
4. Une fenêtre noire s’ouvre : l’IA locale démarre (10 à 20 secondes), le diagnostic de votre ordinateur s’affiche, puis **le navigateur s’ouvre tout seul** sur l’application (`http://localhost:3030`).
5. **Laissez la fenêtre noire ouverte** pendant votre travail. Pour arrêter : fermez-la, puis double-cliquez sur `arreter.bat` (libère la mémoire utilisée par l’IA).

> N’ouvrez pas directement le fichier `index.html` : le navigateur bloquerait l’accès à l’IA locale et l’enregistrement de vos données. **Double-cliquez sur `demarrer.bat`, puis laissez le navigateur s’ouvrir.**

**Démarrage de secours.** Si votre poste interdit les scripts PowerShell (stratégie de votre service informatique), `demarrer.bat` bascule automatiquement sur un démarrage de secours avec Node.js ou Python inclus dans le kit. Le diagnostic de l’ordinateur n’est alors pas disponible ; tout le reste fonctionne.

## 4. Le modèle d’IA adapté à votre ordinateur

Au démarrage, le diagnostic détecte la mémoire vive, la carte graphique et sa mémoire, puis l’application **choisit automatiquement** le modèle adapté parmi ceux inclus dans le kit (vous pouvez en changer dans *Paramètres IA*). Résultat visible dans l’onglet **Installation**.

| Palier | Configuration | Modèle choisi | Taille | Durée par observation |
|---|---|---|---|---|
| Minimal | 8 Go de RAM, sans carte graphique dédiée | `ministral-3:3b` | 3,0 Go | estimation : 30 s à 2 min |
| Intermédiaire | 16 Go de RAM, carte graphique grand public 6 à 8 Go | `ministral-3:8b` | 6,0 Go | **mesuré** : 10 à 20 s (RTX 3070 8 Go) |
| Confortable | 32 Go de RAM ou plus, carte graphique 12 Go ou plus | `ministral-3:8b` ou `qwen3.5:9b` | 6,0 à 6,6 Go | estimation : 10 à 20 s |

Modèles inclus : `ministral-3:3b`, `ministral-3:8b` (éditeur Mistral AI, très bons en français), `qwen3.5:9b` et `qwen2.5:7b-instruct` (éditeur Alibaba Qwen, alternatives). Détails et sources : [GRILLE_MODELES.md](GRILLE_MODELES.md).

- L’IA intégrée exploite automatiquement les cartes graphiques **NVIDIA**. Avec une autre carte graphique, elle fonctionne sur le processeur (plus lentement).
- Le premier traitement après le démarrage est plus long : le modèle se charge en mémoire.

## 5. Vérifier que tout fonctionne

1. Onglet **Accueil** : « Ollama (IA locale) » indique **Détecté**, et l’en-tête **« 100 % local / hors ligne »**.
2. Onglet **Installation** → bouton **Tester Ollama** : un message confirme la version et le nombre de modèles.
3. Onglet **Anonymiser / Pseudonymiser** → **Charger le jeu d’exemple fictif** → **Lancer le traitement** : six observations fictives traitées en une à deux minutes.

## 6. IA externe (facultatif, désactivée par défaut)

Le kit peut, si vous l’autorisez, utiliser une IA en ligne (API Mistral, API compatible OpenAI, API Anthropic, ou votre abonnement Le Chat / ChatGPT / Claude par copier-coller) pour **analyser** uniquement des contributions **anonymisées de façon irréversible et validées**. Tout autre texte (original, pseudonymisé, ou saisi à la main) est refusé. Voir *Paramètres IA* et le guide d’usage. Tant que l’IA externe n’est pas autorisée, le navigateur bloque techniquement toute connexion vers Internet.

## 7. Dépannage

**L’IA locale ne démarre pas / « Ollama non détecté »**
- Fermez la fenêtre noire, double-cliquez sur `arreter.bat`, puis relancez `demarrer.bat`.
- Vérifiez que le dossier `outils-integres\ollama` existe et contient `ollama.exe` (sinon le kit a été mal copié : lancez `verifier-integrite.bat`).
- Un antivirus peut bloquer `ollama.exe` lors du premier lancement : autorisez-le ou demandez à votre service informatique.

**Le traitement est trop lent**
- Choisissez un modèle plus petit (*Paramètres IA* → *Modèle local* → `ministral-3:3b`).
- Fermez les logiciels gourmands ; travaillez depuis une copie du kit sur l’ordinateur plutôt que depuis la clé USB.

**Mémoire insuffisante (ordinateur qui rame, message d’erreur de l’IA)**
- Modèle plus petit ; fermez les autres applications ; `arreter.bat` puis redémarrage.

**Port déjà utilisé**
- « port 3030 déjà utilisé » : le kit est sans doute déjà ouvert ; allez sur `http://localhost:3030`.
- L’IA intégrée utilise le port 11435 ; un Ollama déjà installé sur le poste (port 11434) n’est pas gêné et n’est pas utilisé.

**L’application ne s’ouvre pas dans le navigateur**
- Ouvrez vous-même votre navigateur à l’adresse `http://localhost:3030`.
- La page affiche « Vitrine » : vous êtes sur le site de démonstration en ligne, pas sur le kit ; utilisez `demarrer.bat`.

**Message sur les scripts désactivés**
- Le démarrage de secours prend le relais automatiquement. Si rien ne démarre, contactez votre service informatique : le kit n’essaie pas de contourner ses stratégies de sécurité.

## 8. Mettre à jour le kit

1. Arrêtez le kit (fermez la fenêtre noire, puis `arreter.bat`).
2. Remplacez le dossier `application/` et les fichiers à la racine (`demarrer.bat`, `arreter.bat`, `LISEZMOI.txt`, `CHANGELOG.md`, `VERSION`) par ceux de la nouvelle version (paquet « application »).
3. **Ne touchez pas au dossier `donnees/`** (vos données) ni à `outils-integres/` (sauf si la nouvelle version fournit de nouveaux outils).
4. Relancez : la nouvelle version s’affiche dans l’en-tête et dans l’onglet Accueil.

## 9. Désinstallation propre

1. Dans l’onglet *Anonymiser / Pseudonymiser* : **Purger le dossier de travail** et **Détruire le tableau de correspondance**.
2. Fermez la fenêtre noire, double-cliquez sur `arreter.bat`.
3. Supprimez le dossier du kit (y compris `donnees/` et `outils-integres/`, qui contient les modèles) et videz la corbeille. Rien d’autre n’a été installé sur l’ordinateur.
4. **Navigateur** : effacez les données du site `localhost:3030` (préférences, clés d’API éventuellement mémorisées) — Edge/Chrome : *Paramètres → Confidentialité → Données de sites* ; Firefox : *Paramètres → Vie privée → Cookies et données de sites → Gérer les données* ; supprimez les fichiers exportés de votre dossier *Téléchargements*.

## 10. Rappels de protection des données

- Avant tout partage des fichiers de l’enquête, **supprimez ou masquez les données personnelles non nécessaires** ; anonymisez ce qui doit être diffusé.
- **Ne chargez jamais d’observations nominatives dans un service en ligne** (IA, traduction, stockage, messagerie grand public).
- Conservez l’original nominatif dans un espace sécurisé, et purgez le dossier `donnees/` à la clôture du dossier.
- Pour en savoir plus : onglet **Guide d’usage** ([GUIDE_USAGE_ANONYMISATION.md](GUIDE_USAGE_ANONYMISATION.md)).

## Annexe — Installer Ollama soi-même (paquet léger, macOS, Linux)

Le kit complet n’existe que pour Windows. Avec le paquet léger (« application » seule), sous macOS ou sous Linux, installez Ollama et un modèle (Internet nécessaire une seule fois) :

- **Windows** : [ollama.com/download/windows](https://ollama.com/download/windows) (installation dans votre profil, sans droits d’administrateur).
- **macOS** : [ollama.com/download/mac](https://ollama.com/download/mac) ; glissez Ollama dans *Applications* et lancez-le. Premier lancement du kit : clic droit sur `demarrer.command` → *Ouvrir*.
- **Linux** : `curl -fsSL https://ollama.com/install.sh | sh` (commande officielle, [ollama.com/download/linux](https://ollama.com/download/linux)).
- Puis, dans un terminal : `ollama pull ministral-3:8b` (ou `ministral-3:3b` pour un petit ordinateur), et démarrez le kit avec `demarrer.bat`, `demarrer.command` ou `demarrer.sh`.
- Sous macOS et Linux, le kit utilise Node.js s’il est installé, sinon Python 3 (sur macOS récent, la commande `python3` propose son installation).
- **Open WebUI** (facultatif) : interface de conversation pour Ollama, [docs.openwebui.com](https://docs.openwebui.com/getting-started/quick-start/) (`pip install open-webui` puis `open-webui serve`, adresse `http://localhost:8080`, Python 3.11 ou 3.12). Le kit n’en a pas besoin ; s’il est utilisé, n’y relier que des modèles locaux.
