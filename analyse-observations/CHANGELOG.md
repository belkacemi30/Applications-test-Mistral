# Journal des versions — Kit « Analyse des observations »

## 3.0.0 — 15/11/2026 — Kit autonome local

**Distribution**
- Kit autonome versionné (archive ZIP + somme SHA-256) : `application/` (code, remplacé à chaque mise à jour) et `donnees/` (données de l’utilisateur, conservées).
- Démarrage en double-clic : `demarrer.bat` (Windows), `demarrer.command` (macOS), `demarrer.sh` (Linux) ; diagnostic de l’ordinateur, démarrage d’Ollama, ouverture automatique du navigateur sur `http://localhost:3030`.
- Serveur local sans installation : PowerShell intégré (Windows), Node.js ou Python 3 (macOS/Linux) ; même API, mêmes tests de sécurité.
- Politique de sécurité (CSP) : aucune connexion hors du poste ; IA externe uniquement si autorisée explicitement.

**Nouveaux onglets**
- Accueil : état du poste (version, mode hors ligne, Ollama, modèle, configuration, IA externe).
- Anonymiser / Pseudonymiser : traitement local par Ollama en trois étapes (détection, remplacement, contrôle qualité), lots de 10 à 20, reprise, journal, rapport, relecture humaine, contrôle par sondage, tableau de correspondance chiffré (AES-GCM), purge.
- Export des contributions : CSV préconisé (UTF-8 BOM, « ; »), XLSX, JSON, TXT (fichier unique ou un par contribution) ; données nominatives exclues par défaut.
- Installation et Guide d’usage : guides intégrés, imprimables et en version autonome ; diagnostic ; emplacement de la vidéo de sensibilisation avec sous-titres et transcription.

**IA externe (nouveau, désactivée par défaut)**
- API Mistral, API compatible OpenAI, API Anthropic, abonnement par copier-coller assisté.
- Garde-fous : seulement le registre de démonstration ou les observations anonymisées **et validées** ; contrôle des identifiants directs pour un texte libre ; autorisation en deux étapes.

**Corrections**
- Le registre de démonstration est déplacé de `donnees/observations.js` vers `registre/observations.js` (le dossier `donnees/` est réservé aux données de l’utilisateur).
- Suppression du serveur `serveur/server.js` et de `lancer-local.bat`, remplacés par le kit.

## 2.1.0 — 15/11/2026
- Analyse avec un modèle local (Ollama, Open WebUI), détection automatique, réglages anti-répétition.

## 2.0.0 — 15/11/2026
- Analyse IA dans le navigateur (clé Mistral), analyse en lot, synthèse globale, exports.
- Correctif d’anonymisation : la suppression des civilités effaçait le « m » initial de tous les mots ; registre régénéré.

## 1.x — 11/2026
- Prototype : démonstration sans IA, registre anonymisé, serveur Node.js relais vers Mistral.
