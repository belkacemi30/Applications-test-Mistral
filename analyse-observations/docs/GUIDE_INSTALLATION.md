# Guide d’installation du kit « Analyse des observations »

> Pour qui ? Le commissaire enquêteur, sans compétence technique particulière.
> Version du kit : 3.0.0 — informations techniques vérifiées le **15/11/2026**.

## 1. Ce que contient le kit

Le kit est une **archive ZIP** (par exemple `kit-analyse-observations-v3.0.0.zip`) qui contient :

- `demarrer.bat` (Windows), `demarrer.command` (macOS), `demarrer.sh` (Linux) : les scripts de démarrage ;
- `application/` : le logiciel, les guides et le registre de démonstration ;
- `donnees/` : **vos** données (créé au premier lancement) ;
- `LISEZMOI.txt`, `CHANGELOG.md`, `VERSION`.

L’application s’ouvre dans votre navigateur, mais **rien n’est en ligne** : tout se passe sur votre ordinateur. **Aucun logiciel n’est à installer pour l’application elle-même**, en dehors d’un navigateur récent (Firefox, Chrome ou Edge à jour).

Pour l’intelligence artificielle locale (anonymisation et analyse), il faut en plus **Ollama** et un **modèle** : c’est l’objet des sections 4 et 5.

## 2. Installer le kit

1. **Vérifier l’archive** (recommandé) : comparez sa somme de contrôle avec celle publiée avec le kit (fichier `.sha256`).
   - Windows : ouvrez « Windows PowerShell » et tapez `Get-FileHash .\kit-analyse-observations-v3.0.0.zip -Algorithm SHA256`
   - macOS : `shasum -a 256 kit-analyse-observations-v3.0.0.zip`
   - Linux : `sha256sum kit-analyse-observations-v3.0.0.zip`
   Les deux suites de caractères doivent être identiques. Sinon, ne l’utilisez pas : l’archive est incomplète ou modifiée.
2. **Windows uniquement** : clic droit sur l’archive → *Propriétés* → cochez **« Débloquer »** si la case existe → *OK*.
3. **Décompressez** l’archive à un emplacement que vous retrouverez, par exemple `Documents\Kit-enquetes\`. Évitez les dossiers synchronisés avec un service en ligne (OneDrive, Dropbox…) : le dossier `donnees/` contiendra des données personnelles.
4. **Premier lancement** : double-cliquez sur le script de démarrage de votre système.
   - Windows : `demarrer.bat`. Si Windows affiche « Windows a protégé votre ordinateur », cliquez sur *Informations complémentaires* → *Exécuter quand même*.
   - macOS : la première fois, **clic droit** sur `demarrer.command` → *Ouvrir* → *Ouvrir* (macOS protège les scripts téléchargés).
   - Linux : double-cliquez sur `demarrer.sh` et choisissez *Exécuter*, ou lancez `./demarrer.sh` dans un terminal.
5. Une fenêtre noire s’ouvre (le serveur local du kit), le diagnostic de votre ordinateur s’affiche, puis **le navigateur s’ouvre tout seul** sur `http://localhost:3030`.
6. **Laissez la fenêtre noire ouverte** pendant que vous travaillez. Pour arrêter le kit, fermez-la.

> Pourquoi un script de démarrage ? Si vous ouvrez directement le fichier `index.html`, le navigateur applique des restrictions de sécurité (protocole `file://`) qui **bloquent l’accès à l’IA locale** et l’enregistrement de vos données. **Double-cliquez sur le script de démarrage, puis laissez le navigateur s’ouvrir.**

Le kit n’a besoin d’**aucun droit d’administrateur**. Sous Windows, il utilise PowerShell, déjà présent sur Windows 10 et 11. Sous macOS et Linux, il utilise Node.js s’il est installé, sinon Python 3. Sur macOS récent, si Python 3 manque, la commande `python3` propose de l’installer (une seule fois, avec Internet).

## 3. Matériel nécessaire et choix du modèle

Le script de démarrage lance un **diagnostic** : système, mémoire vive (RAM), carte graphique (GPU) et sa mémoire (VRAM), espace disque, présence d’Ollama. Le résultat apparaît dans l’onglet **Installation**, avec le modèle conseillé.

Grille indicative (modèles vérifiés sur ollama.com le 15/11/2026, détails dans `GRILLE_MODELES.md`) :

| Palier | Configuration | Modèle conseillé | Taille (quantification) | Disque libre | Durée par observation |
|---|---|---|---|---|---|
| Minimal | 8 Go de RAM, sans carte graphique dédiée | `ministral-3:3b` (petit modèle quantifié) | 3,0 Go (Q4_K_M) | 6 Go | estimation : 30 s à 2 min |
| Intermédiaire | 16 Go de RAM, carte graphique grand public 6 à 8 Go | `ministral-3:8b` (modèle moyen quantifié Q4) | 6,0 Go (Q4_K_M) | 10 Go | **mesuré** : 10 à 20 s (RTX 3070 8 Go) |
| Confortable | 32 Go de RAM ou plus, carte graphique 12 Go ou plus | `ministral-3:14b` (modèle supérieur) | 9,1 Go (Q4_K_M) | 15 Go | estimation : 10 à 30 s |

- Les durées concernent l’anonymisation (détection + contrôle qualité). L’analyse d’une observation longue peut prendre jusqu’à une minute.
- Sur Mac avec puce Apple (M1 à M4), la mémoire est partagée avec la carte graphique : on retient la mémoire vive totale.
- Une carte graphique de 8 Go fait fonctionner `ministral-3:14b`, mais plus lentement (le modèle ne tient pas entièrement en mémoire vidéo).
- Ces modèles sont publiés par Mistral AI (français) et sont bons en français. Des alternatives figurent dans `GRILLE_MODELES.md`.

## 4. Installer Ollama (Internet nécessaire une seule fois)

Ollama est le logiciel gratuit qui fait fonctionner le modèle d’IA sur votre ordinateur. Site officiel : [ollama.com/download](https://ollama.com/download).

### Windows 10 / 11
1. Sur [ollama.com/download/windows](https://ollama.com/download/windows), téléchargez l’installateur et lancez-le (pas besoin de droits administrateur : il s’installe dans votre profil).
2. Ollama démarre automatiquement : une icône (un lama) apparaît près de l’horloge.

### macOS
1. Sur [ollama.com/download/mac](https://ollama.com/download/mac), téléchargez l’application, ouvrez le fichier et glissez **Ollama** dans *Applications*.
2. Lancez Ollama une première fois depuis *Applications*.

### Linux
1. Dans un terminal : `curl -fsSL https://ollama.com/install.sh | sh` (commande officielle, voir [ollama.com/download/linux](https://ollama.com/download/linux)). Elle demande le mot de passe administrateur.
2. Ollama est installé comme service et démarre automatiquement.

## 5. Télécharger le modèle (Internet nécessaire une seule fois)

Ouvrez un terminal (Windows : menu Démarrer → « Terminal » ou « Windows PowerShell » ; macOS : *Terminal* ; Linux : terminal) et tapez la commande correspondant au modèle conseillé par le diagnostic, par exemple :

```
ollama pull ministral-3:8b
```

Le téléchargement (3 à 9 Go) prend de quelques minutes à une heure selon votre connexion. Vérifiez ensuite :

```
ollama list
```

Le modèle doit apparaître dans la liste. **À partir de là, tout fonctionne sans Internet.**

## 6. Vérifier que tout fonctionne

1. Relancez le kit (script de démarrage).
2. Onglet **Accueil** : « Ollama (IA locale) » doit indiquer **Détecté**, et l’en-tête **« 100 % local / hors ligne »**.
3. Onglet **Installation** → bouton **Tester Ollama** : un message confirme la version d’Ollama et le nombre de modèles.
4. Test de santé manuel (facultatif) : dans le navigateur, ouvrez `http://localhost:11434/api/version` ; une réponse du type `{"version":"…"}` doit s’afficher.
5. Onglet **Anonymiser / Pseudonymiser** → **Charger le jeu d’exemple fictif** → **Lancer le traitement** : les six observations fictives sont traitées en une à deux minutes.

## 7. Interface web Open WebUI (facultative)

Le kit n’a **pas besoin** d’Open WebUI : il dialogue directement avec Ollama. Open WebUI est utile si vous souhaitez aussi converser avec le modèle local dans une interface de type « chat ».

- Documentation officielle : [docs.openwebui.com](https://docs.openwebui.com/getting-started/quick-start/).
- Installation avec Python 3.11 ou 3.12 : `pip install open-webui`, puis `open-webui serve` ; adresse : `http://localhost:8080`.
- Installation avec Docker : l’interface est généralement publiée sur `http://localhost:3000`.
- Dans le kit : *Paramètres IA* → « Open WebUI », indiquez l’adresse et une clé API (Open WebUI → *Paramètres* → *Compte* → *Clés API*).
- Attention : Open WebUI peut aussi être relié à des services en ligne. Pour des données personnelles, n’utilisez que des modèles **Ollama locaux**. L’anonymisation du kit, elle, utilise toujours Ollama directement.

C’est pour éviter le port 8080 d’Open WebUI que le kit utilise le port **3030**.

## 8. IA externe (facultatif, désactivée par défaut)

Le kit peut, si vous l’autorisez, utiliser une IA en ligne pour **analyser** des observations **déjà anonymisées et validées** : API Mistral, API compatible OpenAI, API Anthropic, ou un abonnement (Le Chat, ChatGPT, Claude…) par copier-coller. Voir *Paramètres IA* et le guide d’usage. **Les observations nominatives ou pseudonymisées ne sont jamais envoyées.** Tant que l’IA externe n’est pas autorisée, le navigateur bloque techniquement toute connexion vers Internet.

## 9. Dépannage

**Ollama ne démarre pas**
- Windows : lancez *Ollama* depuis le menu Démarrer ; vérifiez l’icône près de l’horloge. macOS : ouvrez *Applications → Ollama*. Linux : `systemctl status ollama`, puis `sudo systemctl start ollama`.
- Relancez ensuite le script de démarrage du kit.

**Le modèle est trop lent**
- Choisissez le modèle du palier inférieur (*Paramètres IA* → *Modèle local*), par exemple `ministral-3:3b`.
- Fermez les logiciels gourmands (navigateur avec de nombreux onglets, visioconférence).
- Réduisez la taille des lots (10 observations) : cela ne change pas la vitesse, mais permet d’interrompre plus souvent.

**Mémoire insuffisante (message « out of memory » ou ordinateur qui rame)**
- Utilisez un modèle plus petit ; fermez les autres applications ; redémarrez l’ordinateur.
- Vérifiez qu’un seul modèle est chargé : `ollama ps` ; déchargez les autres avec `ollama stop <modèle>`.

**Port 11434 occupé**
- Une autre instance d’Ollama tourne déjà : c’est normal, le kit l’utilise. Si un autre logiciel occupe ce port, fermez-le ou redémarrez l’ordinateur.

**Le navigateur n’accède pas à Open WebUI**
- Vérifiez l’adresse (`http://localhost:8080` pour pip, `http://localhost:3000` pour Docker) et que la fenêtre d’Open WebUI (ou Docker) est bien ouverte.

**L’application locale ne se lance pas**
- Message « port 3030 déjà utilisé » : le kit est sans doute déjà ouvert ; allez sur `http://localhost:3030`.
- Windows, message sur les scripts désactivés : votre poste applique une stratégie de sécurité qui interdit les scripts PowerShell. Contactez votre service informatique (le kit n’essaie pas de contourner cette stratégie). Alternative : si Node.js est installé, `node application\kit\serveur.js` depuis le dossier du kit.
- macOS « impossible d’ouvrir, développeur non identifié » : clic droit → *Ouvrir*. Si besoin, dans le Terminal : `xattr -dr com.apple.quarantine <dossier du kit>`.
- Linux « permission refusée » : `chmod +x demarrer.sh application/kit/*.sh`.
- La page s’ouvre mais « Vitrine » s’affiche : vous êtes sur le site de démonstration en ligne, pas sur le kit. Utilisez le script de démarrage.

## 10. Mettre à jour le kit

1. Arrêtez le kit (fermez la fenêtre noire).
2. Vérifiez la somme de contrôle de la nouvelle archive (section 2).
3. Remplacez **uniquement** le dossier `application/` par celui de la nouvelle archive, ainsi que les scripts `demarrer.*`, `LISEZMOI.txt`, `CHANGELOG.md` et `VERSION`.
4. **Ne touchez pas au dossier `donnees/`** : il contient votre dossier de travail, vos journaux, vos analyses et l’éventuel tableau de correspondance chiffré.
5. Relancez : la nouvelle version s’affiche dans l’en-tête et dans l’onglet Accueil.

## 11. Désinstallation propre

1. **Le kit** : avant de supprimer, utilisez dans l’onglet *Anonymiser / Pseudonymiser* les boutons **Purger le dossier de travail** et **Détruire le tableau de correspondance**, puis supprimez le dossier du kit (y compris `donnees/`) et videz la corbeille.
2. **Les modèles** : `ollama list`, puis `ollama rm <modèle>` pour chacun.
3. **Ollama** : Windows → *Paramètres → Applications* → Ollama → *Désinstaller* ; macOS → supprimer *Applications/Ollama* et le dossier `~/.ollama` ; Linux → arrêter le service puis supprimer le binaire et `/usr/share/ollama` (voir la documentation d’Ollama).
4. **Open WebUI** (si installé) : `pip uninstall open-webui`, ou supprimer le conteneur et le volume Docker ; son historique de conversations est stocké dans son propre dossier de données.
5. **Navigateur** : effacez les données du site `localhost:3030` (préférences, clés d’API éventuellement mémorisées) : Firefox → *Paramètres → Vie privée → Cookies et données de sites → Gérer les données* ; Chrome/Edge → *Paramètres → Confidentialité → Données de sites* ; supprimez aussi l’historique et les fichiers exportés du dossier *Téléchargements*.

## 12. Rappels de protection des données

- Avant tout partage des fichiers de l’enquête, **supprimez ou masquez les données personnelles non nécessaires** ; anonymisez ce qui doit être diffusé.
- **Ne chargez jamais d’observations nominatives dans un service en ligne** (IA, traduction, stockage, messagerie grand public).
- Conservez l’original nominatif dans un espace sécurisé, et purgez le dossier `donnees/` à la clôture du dossier.
- Pour en savoir plus : onglet **Guide d’usage** ([GUIDE_USAGE_ANONYMISATION.md](GUIDE_USAGE_ANONYMISATION.md)).
