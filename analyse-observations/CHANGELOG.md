# Journal des versions — Kit « Analyse des observations » (Campus IAlès)

## 3.1.0 — 15/11/2026 — Kit complet sans installation (Campus IAlès)

**Aucune installation pour le commissaire enquêteur**
- Kit complet Windows : Ollama 0.40.16 portable, modèles `ministral-3:3b`, `ministral-3:8b`, `qwen3.5:9b`, `qwen2.5:7b-instruct`, Node.js 26.13.1 et Python 3.14.10 portables, dans `outils-integres/`.
- L’IA intégrée démarre sur un port dédié (11435) avec ses propres modèles, sans toucher à un Ollama déjà installé.
- Modèle choisi automatiquement selon le diagnostic de l’ordinateur (sauf choix manuel).
- Démarrage de secours sans PowerShell (Node.js ou Python inclus) ; `arreter.bat` libère la mémoire ; `verifier-integrite.bat` contrôle les sommes SHA-256 de tous les fichiers.
- Distribution sous forme de dossier prêt à copier (clé USB ou disque d’au moins 32 Go) ; paquet léger « application » pour les mises à jour.

**IA externe**
- Réservée aux contributions anonymisées de façon irréversible et validées (et au registre de démonstration anonymisé) : un texte saisi librement n’est plus jamais envoyé à une IA externe.

**Identité Campus IAlès**
- Bandeau « Campus IAlès en Occitanie — « IAlès » – Université populaire de l’intelligence artificielle », logo de l’association et photo d’Alès (le Gardon et son vieux pont, Krzysztof Golik, CC BY-SA 4.0).

**Vidéo de sensibilisation**
- Vidéo de l’atelier CCE-LR (3 min 50) intégrée ; plan détaillé des séquences. Sous-titres et transcription intégrale du commentaire à produire.

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
