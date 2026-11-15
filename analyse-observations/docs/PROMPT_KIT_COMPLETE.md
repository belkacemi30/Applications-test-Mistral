# Prompt complété — Kit autonome « Analyse des observations »

> Version 2 du prompt de développement, établie le 15/11/2026 à partir du prompt initial.
> Ce document **remplace** le prompt initial : il en conserve toutes les exigences, corrige l’état des lieux,
> lève les contradictions relevées et ajoute l’**Exigence G (IA externe par API ou par abonnement)**.
> Les ajouts et corrections sont signalés par « ✚ » (ajout) et « ✎ » (correction).

---

## 0. Analyse du prompt initial (synthèse)

| # | Constat dans le prompt initial | Nature | Résolution retenue |
|---|---|---|---|
| 1 | « Aucune donnée nominative ne doit jamais transiter vers un service en ligne » **et** demande d’utiliser une IA externe (API ou abonnement) | Contradiction | ✚ Exigence G : l’IA externe n’est autorisée que pour des textes **anonymisés de façon irréversible et validés par un humain** (ou le registre de démonstration déjà anonymisé). Les textes pseudonymisés restent des données personnelles : envoi externe **interdit**. Activation explicite, désactivée par défaut, verrouillée techniquement par une politique de sécurité (CSP). |
| 2 | État actuel : « l’analyse IA passe par un serveur Node.js avec `MISTRAL_API_KEY` » ; « aucune donnée n’est envoyée par la page » | Inexact (obsolète) | ✎ Depuis la v2 : analyse via Ollama / Open WebUI en local, ou Mistral avec la clé saisie dans le navigateur ; le serveur Node est optionnel. |
| 3 | Registre « O1 à O64-bis, C1a à C4, E1 à E27 » | Inexact | ✎ 204 entrées : **O1 à O65 (dont O64-bis), C1a à C4, E1 à E133** (71 orales + 133 écrites). |
| 4 | Le dossier `donnees/` doit contenir les données de l’utilisateur, séparé du code | Conflit avec l’existant | ✎ Le registre de démonstration (code livré) est déplacé de `donnees/observations.js` vers `registre/observations.js` ; `donnees/` devient exclusivement le dossier des données de l’utilisateur, **hors** du dossier `application/` remplacé lors des mises à jour. |
| 5 | Adresse locale « de type `http://localhost:8080` » | Conflit de port | ✎ 8080 est le port par défaut d’Open WebUI (installation pip) ; le kit utilise **`http://localhost:3030`**. |
| 6 | « Aucune installation de logiciel tierce n’est requise pour l’application » **et** « le serveur Node.js existant » | Contradiction (Node.js absent des postes administratifs) | ✎ Windows : serveur intégré en **PowerShell** (présent sur Windows 10/11, rien à installer). macOS/Linux : Node.js s’il est présent, sinon **Python 3** (bibliothèque standard). Les trois serveurs exposent la même API, testée à l’identique. |
| 7 | Détection RAM / VRAM / OS par l’application | Impossible depuis un navigateur | Le script de diagnostic du kit écrit `donnees/diagnostic.json`, lu par l’application. Limite connue : sous Windows, `Win32_VideoController.AdapterRAM` plafonne à 4 Go → lecture du registre (`HardwareInformation.qwMemorySize`) et de `nvidia-smi` si présent. |
| 8 | Étape 1 du pipeline : le modèle renvoie la « position » des entités | Peu fiable avec un LLM | ✎ Le modèle renvoie le **texte exact** de chaque entité ; les positions sont calculées par le programme (recherche de toutes les occurrences). ✚ Une détection par expressions régulières (courriels, téléphones, adresses, parcelles, dates) complète le modèle. |
| 9 | Grille de modèles par paliers « GPU 8 Go de VRAM ou plus » pour le palier supérieur | Imprécision | ✎ `ministral-3:14b` pèse 9,1 Go : il tient entièrement en mémoire vidéo à partir d’environ 12 Go de VRAM ; avec 8 Go, il fonctionne en déchargement partiel (plus lent). Indiqué dans la grille. |
| 10 | Vidéo de sensibilisation | Contenu non fourni | ✚ Le kit fournit l’emplacement, le lecteur accessible, le **script / transcription** et les **sous-titres WebVTT** ; le fichier MP4 reste à produire (à signaler). |
| 11 | Tests « sur les trois systèmes d’exploitation » | Non réalisable sur un seul poste | ✚ Tests réels sous Windows ; scripts macOS/Linux vérifiés syntaxiquement et serveur Python testé ; **essai réel sur macOS et Linux à faire** et à signaler. |
| 12 | « Mode hors ligne confirmé » | À définir techniquement | ✚ Confirmé par une **politique de sécurité de contenu (CSP)** envoyée par le serveur du kit : le navigateur refuse toute connexion autre que `localhost`. L’indicateur « 100 % local / hors ligne » repose sur cette politique et sur l’adresse locale du moteur d’IA. |
| 13 | Gestion de l’abonnement (ChatGPT, Le Chat, Claude…) | Pas d’API dans un abonnement | ✚ Mode « abonnement » par **copier-coller assisté** : le kit prépare le texte à coller dans le service et réimporte la réponse JSON ; aucune connexion directe. |

Références vérifiées le 15/11/2026 : pages ollama.com/library (`ministral-3`, `qwen3.5`, `gemma3`), ollama.com/download, docs.openwebui.com (démarrage rapide : port 8080, Python 3.11–3.12), RGPD (EUR-Lex, CELEX 32016R0679), CNIL « L’anonymisation de données personnelles », avis 05/2014 du G29 (WP216), lignes directrices 01/2025 du CEPD sur la pseudonymisation.

---

## 1. Rôle

Tu es un agent de développement logiciel senior, spécialisé dans les applications web de traitement de données sensibles et dans l’ingénierie de systèmes d’IA exécutés localement (edge AI). Tu maîtrises HTML/CSS/JavaScript vanilla, Node.js, PowerShell, Python, Ollama, Open WebUI, les API d’IA en ligne (Mistral, API compatibles OpenAI, Anthropic), la distribution d’applications web autonomes exécutées hors ligne dans un navigateur, et le RGPD appliqué aux contributions d’une enquête publique.

## 2. Contexte et état actuel (✎ corrigé)

- Application « Analyse des observations » : page web de traitement des observations d’une enquête publique (projet agrivoltaïque du Pas de Mirepoix — Saint-Julien-de-Briola, Aude).
- Vitrine statique sur GitHub Pages : https://belkacemi30.github.io/Applications-test-Mistral/analyse-observations/ (démonstration ; **pas** le support de production).
- Analyse IA actuelle (v2) : Ollama ou Open WebUI en local (détection automatique, `ministral-3` par défaut), ou API Mistral avec la clé saisie dans le navigateur ; lancement local par `lancer-local.bat` (serveur Node.js, port 3030).
- Registre anonymisé de 204 observations (O1–O65 dont O64-bis, C1a–C4, E1–E133), jetons `[PERSONNE]`, `[NOM]`, `[PRENOM]`, `[COLLECTIF]`, `[SOCIÉTÉ]`, `[FONCTION]`, `[ADRESSE]`, `[EMAIL]`, `[TÉLÉPHONE]`.
- `docs/RAPPORT_ANONYMISATION.md` décrit l’anonymisation réalisée (et le correctif de la v2 : suppression erronée du « m » initial des mots).
- Public cible : commissaire enquêteur (CE), non développeur, poste administratif aux performances variables, souvent **sans droits d’administrateur** et sans Node.js.
- Distribution : kit autonome (archive ZIP versionnée) exécuté en local dans le navigateur, sans Internet en usage courant.
- Contrainte fondamentale : RGPD, protection des données dès la conception et par défaut. **Aucune donnée nominative ou pseudonymisée ne transite vers un service en ligne.**

## 3. Objectif général

Poste de travail local complet du CE, distribué en kit autonome, organisé en onglets, permettant :
1. de pseudonymiser ou d’anonymiser irréversiblement les observations en local (Ollama / Open WebUI) ;
2. de disposer d’un guide d’installation adapté à la configuration de l’ordinateur ;
3. de disposer d’un guide d’usage de la pseudonymisation / anonymisation, pièges à éviter, vidéo de sensibilisation ;
4. de choisir l’usage par onglets et de lancer les outils nécessaires ;
5. d’exporter les contributions dans plusieurs formats, le CSV étant préconisé ;
6. ✚ d’**analyser les observations avec une IA locale ou, à défaut, avec une IA externe (API ou abonnement)**, uniquement sur des données anonymisées.

## 4. Exigences fonctionnelles

### Exigence A — Pseudonymisation et anonymisation irréversible en local
Conservée intégralement (deux modes, avertissements textuels imposés, traitement exclusivement local via `http://localhost:11434`, indicateur « 100 % local / hors ligne », pipeline en trois étapes, lots de 10 à 20 avec progression, reprise et journal horodaté, choix du modèle selon la configuration). Compléments :
- ✎ Étape 1 : le modèle renvoie, en JSON strict, le **type**, le **texte exact** et la **catégorie** (identifiant direct / quasi-identifiant) de chaque entité, ainsi qu’une généralisation proposée ; les **positions sont calculées par le programme**. ✚ Détection complémentaire par expressions régulières (courriels, téléphones, adresses postales, parcelles cadastrales, dates, codes postaux) et prise en compte du champ « auteur ».
- ✚ Pseudonymes stables `[PSEUDO-01]`, `[PSEUDO-02]`… pour tout identifiant direct, même valeur → même pseudonyme sur tout le dossier.
- ✚ Tableau de correspondance **désactivé par défaut** ; s’il est activé : chiffrement AES-GCM 256 bits, clé dérivée d’une phrase de passe (PBKDF2-SHA-256, 600 000 itérations), fichier `donnees/correspondance.enc`, outil de réidentification, destruction en deux étapes. Sans tableau, la reprise après fermeture garantit des pseudonymes uniques mais pas leur stabilité (signalé dans le rapport).
- ✚ Anonymisation : identifiants directs → balises génériques ; quasi-identifiants → généralisation (date → mois et année, fonction → `[FONCTION]`, parcelle → `[PARCELLE]`, âge → tranche, lieu précis → `[LIEU]`, information de santé → `[INFORMATION DE SANTÉ]`) ; date de dépôt généralisée par défaut.
- ✚ Statut par observation : à traiter / à vérifier / validée. Seules les observations **validées** d’un dossier anonymisé sont considérées comme anonymisées (Exigences E et G).
- ✚ Le rapport et le journal ne contiennent **aucune valeur personnelle** (compteurs, références, horodatages uniquement).

### Exigence B — Guide d’installation
Conservée intégralement. ✎ Adresse locale `http://localhost:3030`. ✚ Pas de droits administrateur nécessaires pour le kit ; Windows : PowerShell intégré ; macOS : déblocage Gatekeeper du fichier `.command` ; Open WebUI (Python 3.11–3.12 ou Docker) présenté comme **facultatif**. ✚ La grille de modèles indique la date de vérification et distingue les durées **mesurées** des durées **estimées**.

### Exigence C — Guide d’usage
Conservée intégralement. ✚ Ajout d’un piège (8) : envoi de données pseudonymisées à une IA en ligne (elles restent personnelles). ✚ Références : RGPD art. 4 (1) et 4 (5), considérant 26, art. 9 ; CNIL ; avis 05/2014 du G29 (WP216, trois critères : individualisation, corrélation, inférence) ; lignes directrices 01/2025 du CEPD. ✚ Vidéo : lecteur avec sous-titres WebVTT et transcription ; le MP4 est à produire.

### Exigence D — Onglets
Conservée intégralement (Accueil, Anonymiser / Pseudonymiser, Analyse des observations, Export, Installation, Guide d’usage ; confirmation en deux étapes des actions sensibles). ✚ Un panneau « Paramètres IA » commun choisit le moteur (local ou externe) ; l’onglet Accueil indique en permanence si une IA externe est autorisée.

### Exigence E — Export
Conservée intégralement (CSV préconisé UTF-8 + BOM, `;`, échappement ; XLSX, JSON, TXT ; message imposé ; exclusion par défaut des données nominatives). ✚ XLSX et ZIP produits sans bibliothèque externe. ✚ Sources d’export : registre de démonstration, dossier traité, dossier original (nominatif : confirmation en deux étapes), analyses IA.

### Exigence F — Distribution et exécution locale
Conservée, avec corrections :
- ✎ Arborescence : `demarrer.bat`, `demarrer.command`, `demarrer.sh`, `LISEZMOI.txt`, `CHANGELOG.md`, `VERSION` à la racine ; `application/` (code, remplacé à chaque mise à jour) ; `donnees/` (données de l’utilisateur, conservées).
- ✎ Serveur local : PowerShell (Windows), Node.js ou Python 3 (macOS/Linux) ; écoute sur `127.0.0.1:3030` uniquement ; contrôle de l’en-tête `Host` ; écritures limitées à `donnees/` (noms de fichiers sur liste blanche) ; aucune clé d’API côté serveur.
- ✚ Politique de sécurité (CSP) servie par le kit : connexions limitées à `localhost` ; l’autorisation d’IA externe (Exigence G) ajoute **uniquement** les domaines des fournisseurs choisis.
- ✚ Vérification à la construction : absence de ressource distante dans le code, absence de données nominatives dans l’archive, somme SHA-256.

### ✚ Exigence G — IA externe (API ou abonnement), sous garde-fous RGPD
1. **Fournisseurs** : API Mistral ; API compatible OpenAI (OpenAI, ou toute API au même format — URL de base configurable, par ex. une API publique d’administration) ; API Anthropic ; **abonnement** (Le Chat, ChatGPT, Claude…) par copier-coller assisté.
2. **Désactivée par défaut**. Activation dans « Paramètres IA » avec confirmation en deux étapes ; le serveur du kit élargit alors la CSP aux seuls domaines concernés ; désactivation à tout moment.
3. **Données autorisées** : registre de démonstration (déjà anonymisé) et observations d’un dossier **anonymisé irréversiblement et validé**. Refus explicite pour les textes originaux ou pseudonymisés. Texte saisi librement : contrôle automatique des identifiants directs et déclaration explicite de l’utilisateur.
4. **Clés d’API** : saisies dans le navigateur, jamais écrites dans `donnees/` ni envoyées au serveur du kit ; mémorisation facultative.
5. **Abonnement** : le kit génère le texte à coller (consignes + observations anonymisées, par lots), l’utilisateur colle la réponse JSON, le kit la valide et l’importe. Aucune connexion directe.
6. **Traçabilité** : chaque analyse indique le moteur et le modèle ; le journal consigne l’activation de l’IA externe (sans contenu).
7. **Information** : rappel des conditions de traitement des fournisseurs (conservation, entraînement, localisation) à vérifier par le CE avant usage.

## 5. Contraintes transversales
Conservées (RGPD, accessibilité, portabilité, documentation, compatibilité, aucune référence technique inventée). ✚ Aucune télémétrie ; stockage du navigateur limité aux préférences et aux clés (facultatif) ; purge documentée.

## 6. Méthode
Phases 1 à 6 conservées. ✚ Livrer en fin d’exécution : code commenté, documentation, tests automatisés (logique, trois serveurs, pipeline réel avec Ollama sur un jeu fictif), archive versionnée et sa somme SHA-256, liste des points non vérifiés.

---

## 7. Évolutions de la version 3.1 (demande du 15/11/2026)

- **Exigence F modifiée — aucune installation pour le CE** : le kit complet Windows embarque Ollama (portable, version identique à celle de référence), les modèles retenus (`ministral-3:3b`, `ministral-3:8b`, `qwen3.5:9b`, `qwen2.5:7b-instruct`), Node.js et Python portables. Distribution sous forme de **dossier** (clé USB / disque ≥ 32 Go) : au-delà de 20 Go, une archive ZIP n’apporte rien (les modèles ne se compressent pas). Intégrité par `SOMMES-SHA256.txt` et `verifier-integrite.bat`. Un paquet léger « application » sert aux mises à jour.
- **Exigence G durcie** : l’IA externe (API ou abonnement) ne reçoit **que des contributions anonymisées de façon irréversible et validées** (et le registre de démonstration anonymisé) ; tout texte saisi librement est refusé, sans exception.
- **Identité** : bandeau « Campus IAlès en Occitanie — « IAlès » – Université populaire de l’intelligence artificielle », logo de l’association, photo réelle d’Alès sous licence libre (crédit affiché).
- **Vidéo** : vidéo de l’atelier CCE-LR intégrée ; sous-titres et transcription intégrale du commentaire à produire (aucun outil de transcription local disponible lors de la construction).
- **Limites** : kit complet Windows x64 uniquement (choix de l’association) ; accélération GPU NVIDIA incluse, autres cartes graphiques en mode processeur.
