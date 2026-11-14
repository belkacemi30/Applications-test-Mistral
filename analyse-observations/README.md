# Analyse des observations — Enquête publique (prototype de démonstration)

Prototype d’application web en français, **100 % local et statique** : aucun appel API, aucune clé, aucune connexion externe, aucun stockage persistant. Rien n’est déployé ni publié.

## Structure du projet

Le projet était vide au départ ; aucun outil existant n’a été réutilisé. Le prototype repose uniquement sur des fichiers statiques, sans aucune dépendance à installer :

- `index.html` — structure de la page (en-tête, formulaire, démonstration, registre réel, aperçu des thèmes)
- `styles.css` — mise en page lisible, pensée pour des utilisateurs non informaticiens
- `app.js` — logique interactive (exemple fictif, tableau préparé à l’avance, registre, comptage de thèmes)
- `donnees/observations.js` — données locales : 71 observations orales (O1–O65, C1a–C1e, C4) et 133 contributions écrites (E1–E133), extraites de l’export **anonymisé** du registre
- `outils/extraction_observations.py` — script qui régénère `donnees/observations.js` à partir de la transcription du PDF :
  ```bash
  python3 outils/extraction_observations.py <transcript.md> donnees/observations.js
  ```

## Lancer le prototype

Au choix :

1. **Ouvrir directement le fichier** : double-cliquer sur `index.html` (ou clic droit → « Ouvrir avec » → navigateur).
2. **Via un serveur local** (recommandé) :
   ```bash
   cd analyse-observations
   python3 -m http.server 8000
   ```
   puis ouvrir <http://localhost:8000> dans un navigateur.

## Tester le prototype

1. Cliquer sur **« Charger un exemple fictif »** : la référence et le texte (inquiétudes d’un riverain sur le trafic de poids lourds pendant les travaux) se remplissent automatiquement.
2. Cliquer sur **« Afficher la démonstration »** : le tableau préparé s’affiche (référence, thèmes, synthèse neutre, demandes explicites, questions au maître d’ouvrage, points à vérifier), avec le bandeau **« Démonstration — aucune analyse par IA effectuée »**.
3. **Modifier le texte** de l’exemple : un avertissement apparaît et le tableau préparé disparaît — il n’est jamais présenté comme une analyse du nouveau texte.
4. Cliquer sur **« Effacer »** : tous les champs et résultats sont vidés.
5. **Registre réel anonymisé** : choisir une observation dans la liste (204 au total), lire son texte, puis **« Charger cette observation dans le formulaire »** — le tableau préparé ne s’affiche pas pour ce texte (aucune analyse IA).
6. **Aperçu des thèmes** : comptage local de mots-clés sur l’ensemble des 204 observations, trié par nombre d’observations concernées.

## Comportement attendu

- Si le texte correspond exactement à l’exemple fictif non modifié → le tableau préparé s’affiche.
- Si le texte est modifié ou si aucun exemple n’est chargé → aucun tableau préparé n’est présenté, avec un message explicite.
- Aucune donnée n’est envoyée sur le réseau ni enregistrée (pas de cookie, pas de stockage local, pas d’appel API). Les données du registre sont lues uniquement depuis le fichier local `donnees/observations.js`.
