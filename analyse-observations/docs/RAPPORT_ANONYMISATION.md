# Rapport d’anonymisation STRICTE (irréversible)

- Fichier traité : `C:/Users/kbelk/AppData/Local/Temp/claude/298909c9b7a0f220/338f436f-be9e-490b-b9b9-6e9f04e9b9a9/scratchpad/obs_a45.js` -> `donnees/observations.js`
- Entrées traitées : 204
- Règles appliquées : uniquement des balises neutres, aucune donnée ajoutée :
  - toute personne -> `[PERSONNE]` (balise unique, aucun recoupement possible) ;
  - noms -> `[NOM]`, prénoms -> `[PRENOM]`, civilités supprimées ;
  - fonctions identifiantes -> `[FONCTION]` ;
  - groupes/associations -> `[COLLECTIF]`, sociétés -> `[SOCIÉTÉ]` ;
  - adresses/lieux-dits -> `[ADRESSE]`, courriels -> `[EMAIL]`, téléphones -> `[TÉLÉPHONE]`.
- Compteurs : personnes 246, noms/prénoms 8, fonctions 10,
  collectifs 5, sociétés 5, adresses 2, emails 18, téléphones 0
- Vérification automatique : OK, aucune fuite détectée

Aucune table de correspondance n’est écrite : le retour à l’identité est impossible après exécution.
