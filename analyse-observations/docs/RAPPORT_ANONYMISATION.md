# Rapport d’anonymisation

Ce document décrit (1) l’anonymisation du **registre de démonstration** livré avec le kit et (2) le **module d’anonymisation / pseudonymisation** du kit (version 3.0.0) utilisé par le commissaire enquêteur sur ses propres dossiers.

## 1. Registre de démonstration (`registre/observations.js`)

Traitement réalisé par `outils/anonymiser.py` (règles déterministes, sans IA), **irréversible**.

- Fichier produit : `registre/observations.js` — 204 entrées (O1 à O65 dont O64-bis, C1a à C4, E1 à E133).
- Règles appliquées : uniquement des balises neutres, aucune donnée ajoutée :
  - toute personne → `[PERSONNE]` (balise unique, aucun recoupement possible entre contributions) ;
  - noms → `[NOM]`, prénoms → `[PRENOM]`, civilités supprimées ;
  - fonctions identifiantes (maire de…, adjoint au maire, secrétaire de mairie…) → `[FONCTION]` ;
  - groupes / associations → `[COLLECTIF]`, sociétés → `[SOCIÉTÉ]` ;
  - adresses / lieux-dits → `[ADRESSE]`, courriels → `[EMAIL]`, téléphones → `[TÉLÉPHONE]`.
- Compteurs : personnes 246, noms / prénoms 8, fonctions 10, collectifs 5, sociétés 5, adresses 2, courriels 18, téléphones 0.
- Vérification automatique : aucune fuite détectée (noms connus, sociétés, civilités, courriels, téléphones) ; contrôle de non-régression du texte (voir 1.1).
- Aucune table de correspondance n’est écrite : le retour à l’identité est impossible.

### 1.1 Correctif de la version 2 (15/11/2026)

La version initiale de l’expression régulière des civilités (`M` sans point, insensible à la casse) supprimait le « m » initial de **tous** les mots (« mais » → « ais », « maire » → « aire », « Mirepoix » → « irepoix »). Conséquence secondaire : les fonctions du type « maire de … » n’étaient plus reconnues, et une mention identifiante n’était pas masquée. Le script a été corrigé (civilité `M` uniquement en majuscule suivie d’un point ou d’un nom), un contrôle automatique des mots tronqués a été ajouté, et le registre a été régénéré à partir de la version intacte de l’historique. Le texte est identique à l’original, hormis un masquage plus strict.

## 2. Module d’anonymisation du kit (onglet « Anonymiser / Pseudonymiser »)

Code : `js/anonymisation.js` (logique, sans accès réseau) et `js/kit.js` (interface). Traitement **exclusivement local** : le modèle est servi par Ollama sur le poste (`http://localhost:11434`) ; le kit refuse toute autre adresse pour ce module, et la politique de sécurité du navigateur bloque toute connexion sortante.

### 2.1 Pipeline
1. **Détection**
   - règles : courriels, téléphones français, numéros de sécurité sociale et IBAN, adresses (numéro + voie, lieu-dit, code postal + commune), parcelles cadastrales, dates précises, âges ;
   - modèle local : prompt strict, réponse JSON `{"entites":[{"type","valeur","categorie","generalisation"}]}` ; les valeurs non retrouvées **telles quelles** dans le texte sont rejetées (pas d’invention), ainsi que les pronoms et mots génériques ;
   - champ « auteur » du fichier importé.
   Les positions sont calculées par le programme (toutes les occurrences, tolérance aux espaces et apostrophes), puis les chevauchements sont résolus (le plus long d’abord).
2. **Remplacement**
   - pseudonymisation : identifiants directs → `[PSEUDO-01]`, `[PSEUDO-02]`… stables sur tout le dossier (variantes d’un même nom rapprochées : « M. Ferrand » et « Paul Ferrand ») ; quasi-identifiants conservés et comptés dans le rapport ;
   - anonymisation : identifiants directs → balises génériques ; dates → « courant mois année » ; âges → tranche de dix ans ; fonctions, parcelles, santé, organisations, autres → balises ; lieux → généralisation proposée par le modèle si elle ne reprend rien de l’original, sinon `[LIEU]` ; date de dépôt généralisée (option activée par défaut).
3. **Contrôle qualité** : relecture du texte traité par le modèle et par les règles ; tout résidu place l’observation « à vérifier » ; les généralisations produites par le kit ne sont pas signalées à tort.
4. **Relecture humaine** obligatoire, contrôle par sondage, validation explicite. Seules les observations **validées** d’un dossier anonymisé sont considérées comme anonymisées par le kit (export, IA externe).

### 2.2 Tableau de correspondance (pseudonymisation)
- Désactivé par défaut. S’il est activé : chiffrement AES-GCM 256 bits, clé dérivée de la phrase de passe (PBKDF2-SHA-256, 600 000 itérations, sel aléatoire), fichier `donnees/correspondance.enc`. La phrase de passe n’est jamais enregistrée.
- Outil de réidentification ; destruction en deux étapes.
- Sans tableau, une reprise après fermeture garantit des pseudonymes **uniques** (le compteur est conservé) mais pas leur **stabilité** pour une personne déjà rencontrée.

### 2.3 Traçabilité sans données personnelles
- Rapport de traitement (JSON / TXT) : mode, modèle, nombre d’observations, entités remplacées par type, observations à vérifier et validées, durées.
- Journal local horodaté (`donnees/journal.log`) : actions et compteurs, références d’observations, **jamais de valeur personnelle** ; purgeable.

### 2.4 Résultats de test (15/11/2026, `tests/e2e_ollama.js`, jeu fictif de 6 observations, `ministral-3` 8b)
- Pseudonymisation : 12 identifiants directs remplacés ; 0 identifiant direct restant ; 0 observation à vérifier ; variantes de noms correctement rapprochées.
- Anonymisation : 21 éléments remplacés ou généralisés (noms, adresse, téléphone, courriel, parcelles, fonctions, date, âge, information de santé, établissement) ; 1 observation signalée « à vérifier » à juste titre (surface et localisation d’une exploitation) ; **aucune fuite non signalée**.
- Limites constatées : un quasi-identifiant peu spécifique peut subsister (ex. « éleveur ») et doit être traité en relecture ; un modèle plus petit (3b) détectera vraisemblablement moins bien — la relecture humaine reste obligatoire.

### 2.5 Données manipulées et emplacement
- Le **dossier de travail** (`donnees/dossier.json`) contient les originaux importés (données personnelles), nécessaires à la reprise et à la relecture : il reste sur le poste et doit être **purgé à la clôture** (bouton dédié, deux étapes).
- Aucune donnée n’est écrite dans le stockage du navigateur, en dehors des préférences et des clés d’API éventuellement mémorisées. Sur la vitrine en ligne, l’import de fichiers est désactivé et rien n’est conservé.
