# Rapport d’anonymisation STRICTE (irréversible)

- Fichier traité : `/tmp/observations.brut.js` -> `donnees/observations.js`
- Entrées traitées : 204
- Règles appliquées : uniquement des balises neutres, aucune donnée ajoutée :
  - toute personne -> `[PERSONNE]` (balise unique, aucun recoupement possible) ;
  - noms -> `[NOM]`, prénoms -> `[PRENOM]`, civilités supprimées ;
  - fonctions identifiantes -> `[FONCTION]` ;
  - groupes/associations -> `[COLLECTIF]`, sociétés -> `[SOCIÉTÉ]` ;
  - adresses/lieux-dits -> `[ADRESSE]`, courriels -> `[EMAIL]`, téléphones -> `[TÉLÉPHONE]`.
- Compteurs : personnes 246, noms/prénoms 39, fonctions 6,
  collectifs 5, sociétés 5, adresses 2, emails 19, téléphones 0
- Vérification automatique : OK, aucune fuite détectée

Aucune table de correspondance n’est écrite : le retour à l’identité est impossible après exécution.
