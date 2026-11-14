# Rapport d’anonymisation

- Fichier traité : `/tmp/observations.brut.js` -> `donnees/observations.js`
- Entrées traitées : 204
- Identifiants-lettres remplacés par des jetons aléatoires : 125 (table de correspondance générée en mémoire puis détruite : anonymisation irréversible)
- Noms/prénoms remplacés par [NOM] : 32
- Emails masqués : 0 ; téléphones masqués : 0
- Placeholders normalisés : 1
- Vérification automatique : OK, aucune fuite connue détectée
- Mots capitalisés suivant un jeton personne (à revue manuelle) : Chef, Commissaire

Méthode : jetons `secrets.token_hex(4)` par identifiant-lettre, générés à chaque exécution ;
aucune table de correspondance n'est écrite sur disque. Noms remplacés par [NOM],
emails/téléphones masqués. Le retour à l'identité est impossible après exécution.
