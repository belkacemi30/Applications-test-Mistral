# Analyse des observations — Enquête publique « Pas de Mirepoix »

Application web en français pour préparer l’analyse des observations d’une enquête publique :
**Projet agrivoltaïque du Pas de Mirepoix — Saint-Julien-de-Briola (Aude)**, registre du 12/11/2024 au 11/12/2024.

## Contenu

- `index.html`, `styles.css`, `app.js` — interface (saisie, démonstration, registre, thèmes, analyse IA)
- `donnees/observations.js` — registre **anonymisé de façon irréversible** (204 observations : 71 orales + 133 écrites)
- `serveur/server.js` — serveur local optionnel : sert l’app et proxy l’API Mistral (clé côté serveur uniquement)
- `outils/extraction_observations.py` — extraction depuis la transcription du PDF (données **brutes**, à ne pas versionner)
- `outils/anonymiser.py` — anonymisation irréversible (jetons aléatoires, noms masqués)
- `docs/RAPPORT_ANONYMISATION.md` — rapport d’audit d’anonymisation

## Lancer sans IA (100 % local, aucune clé, aucune connexion)

1. Ouvrir `index.html` directement dans un navigateur, ou
2. `python3 -m http.server 8000` dans ce dossier, puis <http://localhost:8000>.

Fonctionnalités disponibles : exemple fictif + tableau préparé (« Démonstration — aucune analyse par IA effectuée »), registre anonymisé consultable (204 observations), aperçu des thèmes (comptage local de mots-clés). Le bouton « Analyser avec l’IA » est alors désactivé avec une explication.

## Lancer avec l’analyse IA (clé côté serveur)

```bash
MISTRAL_API_KEY=<votre clé> node serveur/server.js
# puis ouvrir http://localhost:3000
```

- Le serveur sert l’app sur `127.0.0.1:3000` et expose `POST /api/analyse`.
- La clé `MISTRAL_API_KEY` n’est lue que côté serveur (variable d’environnement ou fichier `serveur/.env`, ignoré par git) et **n’est jamais envoyée au navigateur**.
- Modèle : `mistral-small-latest` (modifiable via `MISTRAL_MODELE`).
- Le prompt demande un JSON strict avec les mêmes rubriques que le tableau de démonstration : référence, thèmes, synthèse neutre, demandes explicites, questions au maître d’ouvrage, points à vérifier. Le bandeau « à vérifier par le commissaire enquêteur » s’affiche avec chaque résultat IA.
- Seul le texte chargé/saisi est envoyé à l’API, au clic sur « Analyser avec l’IA ». La page elle-même n’effectue aucun appel réseau.

## Coût et conditions de traitement (API Mistral, La Plateforme)

- **Coût** (tarifs publics, à vérifier sur mistral.ai/pricing) : `mistral-small-latest` ≈ 0,15–0,17 $ par million de tokens en entrée et 0,60–0,66 $ par million en sortie. Les 204 observations représentent environ 0,3–0,5 M de tokens : **l’analyse complète du registre coûte environ quelques centimes à ~1 $**.
- **Données** : sur l’API payante, Mistral n’utilise pas les entrées/sorties pour entraîner ses modèles par défaut (opt-out possible dans la console) ; rétention d’environ 30 jours pour le monitoring d’abus sur les appels stateless, sauf option « zero data retention » (sur demande) ; hébergement UE par défaut (point d’API régional UE à 1,1× le tarif) ; DPA conforme RGPD disponible. Vérifier les conditions à jour sur legal.mistral.ai avant usage.
- **Recommandation** : les données du registre étant déjà anonymisées de façon irréversible (voir le rapport), l’envoi à l’API ne porte plus de données personnelles identifiables.

## Anonymisation STRICTE (irréversible)

Pipeline reproductible (ne jamais versionner les données brutes) :

```bash
python3 outils/extraction_observations.py transcript.md /tmp/brut.js
python3 outils/anonymiser.py /tmp/brut.js donnees/observations.js --rapport docs/RAPPORT_ANONYMISATION.md
```

Règles strictes — **aucune donnée ajoutée, uniquement des balises neutres**, aucun moyen de relier une observation à une personne ou un groupe :

- toute personne → `[PERSONNE]` (balise **unique** pour tous : aucun recoupement possible entre contributions) ;
- noms → `[NOM]`, prénoms → `[PRENOM]` ; civilités (Mme/Monsieur/…) supprimées ; fonctions identifiantes (maire de…, secrétaire de mairie…) → `[FONCTION]` ;
- associations/collectifs → `[COLLECTIF]`, sociétés (SASU…) → `[SOCIÉTÉ]` ;
- adresses/lieux-dits → `[ADRESSE]`, courriels → `[EMAIL]`, téléphones → `[TÉLÉPHONE]`.

Aucune table de correspondance n’est écrite : le retour à l’identité est **impossible**. Vérifications automatiques en sortie (0 fuite détectée sur les 204 entrées) + `docs/RAPPORT_ANONYMISATION.md`.

Fichier autonome pour test sans serveur : `python3 outils/assembler_page_unique.py` génère `analyse-observations.html` (CSS+JS+données en ligne, aucune référence externe).

## Déploiement GitHub Pages (hébergement statique)

Settings → Pages → « Deploy from a branch » → branche `main`, dossier `/analyse-observations`.
URL : https://<owner>.github.io/<repo>/analyse-observations/ — l’app y fonctionne **sans IA** (bouton désactivé proprement), car une page statique ne peut pas détenir de clé API.

## Tests effectués

- `node --check` sur `app.js`, `serveur/server.js`, `donnees/observations.js`
- Anonymisation : 204 entrées, 125 jetons, 0 fuite détectée (voir rapport)
- Serveur : test de bout en bout de `/api/analyse` contre un stub Mistral local, 401 sans clé, 404/403 sur chemins interdits, service statique OK
- Logique front : démonstration (exemple fictif seul éligible), rendu IA, comptage des thèmes
