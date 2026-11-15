# Guide d’usage : pseudonymisation et anonymisation des observations

> Campus IAlès — pour le commissaire enquêteur. Version du kit : 3.1.0 — références vérifiées le 15/11/2026.
> Ce guide est un outil pédagogique ; il ne remplace ni les textes ni l’avis du délégué à la protection des données de l’autorité organisatrice.

## 1. Pourquoi c’est important

Les observations du public sont des **données personnelles** : nom, adresse, courriel, téléphone, mais aussi profession, parcelle, situation familiale, parfois **santé**. Le RGPD s’applique dès qu’une personne est **identifiée ou identifiable**, directement ou par recoupement.

Deux principes guident le kit :
- **minimisation** (RGPD, art. 5.1.c) : ne traiter et ne diffuser que ce qui est nécessaire ;
- **protection des données dès la conception et par défaut** (RGPD, art. 25) : tout se fait en local, l’IA externe est désactivée, l’export exclut les noms par défaut.

## 2. Définitions

| Opération | Ce que c’est | Réversible ? | Encore une donnée personnelle ? |
|---|---|---|---|
| **Suppression** | On retire l’information (le nom disparaît du texte). | Non, sauf si l’original est conservé | Le reste du texte peut encore identifier |
| **Masquage** | On remplace l’information par une balise neutre (`[PERSONNE]`) sans table de correspondance. | Non | Oui si des recoupements restent possibles |
| **Pseudonymisation** | On remplace les identifiants par des pseudonymes stables (`[PSEUDO-01]`) ; une table permet, si elle est conservée, de retrouver les personnes. | **Oui** (avec la table, ou par recoupement) | **Oui** |
| **Anonymisation irréversible** | On supprime les identifiants directs **et** on généralise les quasi-identifiants, de sorte qu’aucune ré-identification ne soit raisonnablement possible. | **Non** | **Non** (si elle est réussie) |

**Textes de référence**
- **Donnée à caractère personnel** — RGPD, article 4, point 1 : toute information se rapportant à une personne physique identifiée ou identifiable, directement ou indirectement (nom, numéro d’identification, données de localisation, identifiant en ligne, éléments propres à son identité physique, économique, culturelle ou sociale…).
- **Pseudonymisation** — RGPD, article 4, point 5 : un traitement tel que les données ne peuvent plus être attribuées à une personne précise **sans informations supplémentaires**, à condition que ces informations soient **conservées séparément** et protégées.
- **Données anonymes** — RGPD, considérant 26 : le règlement ne s’applique pas aux informations anonymes, c’est-à-dire ne concernant pas une personne identifiée ou identifiable, compte tenu de **l’ensemble des moyens raisonnablement susceptibles d’être utilisés** pour identifier la personne.
- **Données de santé** — RGPD, article 9 : catégorie particulière de données, protection renforcée.
- **Critères de l’anonymisation** — avis 05/2014 du groupe de l’article 29 (WP216), repris par la CNIL : une anonymisation est robuste si elle empêche **l’individualisation** (isoler une personne), **la corrélation** (relier des ensembles de données concernant une même personne) et **l’inférence** (déduire une information sur une personne).
- **Pseudonymisation** — lignes directrices 01/2025 du Comité européen de la protection des données (version soumise à consultation publique en janvier 2025).

**Pour aller plus loin** (Internet nécessaire)
- RGPD (texte officiel) : [eur-lex.europa.eu](https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32016R0679)
- CNIL, « L’anonymisation de données personnelles » : [cnil.fr](https://www.cnil.fr/fr/technologies/lanonymisation-de-donnees-personnelles)
- CNIL, « Enjeux et avantages de l’anonymisation et de la pseudonymisation » : [cnil.fr](https://www.cnil.fr/fr/recherche-scientifique-hors-sante/enjeux-avantages-anonymisation-pseudonymisation)
- Avis 05/2014 du G29 sur les techniques d’anonymisation (WP216) : [ec.europa.eu](https://ec.europa.eu/justice/article-29/documentation/opinion-recommendation/files/2014/wp216_fr.pdf)
- Lignes directrices 01/2025 du CEPD sur la pseudonymisation : [edpb.europa.eu](https://www.edpb.europa.eu/our-work-tools/documents/public-consultations/2025/guidelines-012025-pseudonymisation_en)

## 3. Quand pseudonymiser, quand anonymiser ?

**Pseudonymiser** (les données restent personnelles, à usage interne) :
- analyse interne des observations et aide à la rédaction du rapport ;
- utilisation d’outils d’IA **locaux** (Ollama) sur un texte débarrassé des noms ;
- travail en équipe restreinte, quand il faut pouvoir retrouver l’auteur (pour lui répondre, vérifier un doublon, relier plusieurs contributions d’une même personne).

**Anonymiser irréversiblement** (les données ne sont plus personnelles) :
- diffusion (annexe du rapport, publication) ;
- archivage de long terme ;
- partage avec des tiers (bureau d’études, services de l’État, maître d’ouvrage) ;
- transmission pour des travaux externes, **y compris l’usage d’une IA en ligne** (Exigence G du kit).

En cas de doute, **anonymisez** : c’est la protection maximale.

## 4. Mode d’emploi dans le kit

1. Onglet **Anonymiser / Pseudonymiser** : choisissez le mode. Lisez l’avertissement affiché.
2. **Pseudonymisation** : cochez « Conserver un tableau de correspondance chiffré » **seulement** si vous aurez besoin de réidentifier ; choisissez alors une phrase de passe d’au moins 12 caractères, que vous conservez à part (elle n’est enregistrée nulle part).
3. **Anonymisation** : une confirmation en deux étapes vous demande d’attester que l’original est sauvegardé dans un espace sécurisé.
4. **Importez** le fichier (CSV avec les colonnes référence ; date ; auteur ; objet ; texte, ou JSON, ou TXT).
5. **Lancez le traitement** : par lots de 10 à 20, avec barre de progression ; vous pouvez interrompre et reprendre plus tard (le dossier est enregistré dans `donnees/`).
6. Pour chaque observation, le kit :
   1. repère les identifiants avec des règles (courriels, téléphones, adresses, parcelles, dates…) **et** le modèle local ;
   2. les remplace (`[PSEUDO-03]` ou `[PERSONNE]`, `[FONCTION]`, `courant mars 2024`, `[70-79 ANS]`…) ;
   3. fait **relire** le résultat par le modèle et par les règles pour repérer les oublis.
7. **Relecture humaine** : les observations « À vérifier » affichent les éléments douteux surlignés. Pour chacun : *Masquer*, ou *Ce n’est pas identifiant*. Vous pouvez aussi masquer un autre terme, modifier le texte, comparer avec l’original, puis **valider**.
8. **Contrôle par sondage** : tirez 5 observations au hasard et relisez-les entièrement, même si aucun doute n’a été signalé.
9. **Rapport de traitement** : téléchargeable en JSON ou en TXT. Il ne contient aucune donnée personnelle (comptes par type, mode, modèle, durées).
10. **Export** (onglet *Export des contributions*) : préférez le **CSV**. La colonne « auteur » est exclue par défaut.

## 5. Pièges à éviter

### Piège 1 — La ré-identification par recoupement
Une **combinaison** d’informations anodines suffit souvent à reconnaître quelqu’un : « *l’adjoint au maire, éleveur au lieu-dit des Crozes* », « *agricultrice de 72 ans, parcelle ZB 117* ». Dans une petite commune, profession + lieu + date désignent une seule personne. **Anonymiser, ce n’est pas seulement retirer les noms** : il faut aussi généraliser les quasi-identifiants (fonction, lieu précis, parcelle, date exacte, âge, nom d’exploitation, situation familiale rare).

### Piège 2 — La fausse sécurité du simple remplacement des noms
Remplacer « Jeanne Martinet » par `[PERSONNE]` ne suffit pas si le texte dit encore « *j’habite en face de la parcelle ZB 117, mon mari est malade* ». Un texte pseudonymisé **reste une donnée personnelle** ; ne le traitez jamais comme anonyme.

### Piège 3 — Le modèle de langage peut se tromper
Un modèle d’IA peut **oublier** un identifiant (nom mal orthographié, surnom, nom dans une signature), **en inventer** ou remplacer de façon **incohérente** (deux pseudonymes pour une même personne). Le kit limite ces risques (règles complémentaires, contrôle qualité, rapprochement des variantes de noms), mais **la relecture humaine reste obligatoire** avant toute diffusion. Le contrôle par sondage est indispensable même quand rien n’est signalé.

### Piège 4 — La conservation inconsidérée du tableau de correspondance
Le tableau de correspondance permet de **tout réidentifier**. Ne le conservez que si c’est nécessaire, protégez-le (il est chiffré par le kit, mais la phrase de passe doit être gardée à part), ne l’envoyez jamais avec les données pseudonymisées, et **détruisez-le à la clôture du dossier** (bouton *Détruire le tableau de correspondance*, confirmation en deux étapes).

### Piège 5 — Les traces résiduelles
Des données peuvent subsister : dossier `donnees/` du kit (dossier de travail avec les originaux, journal), dossier *Téléchargements* (exports), historique et cache du navigateur, corbeille, copies sur clé USB, synchronisations en ligne (OneDrive, Dropbox), historique d’Open WebUI si vous l’utilisez. À la clôture : **purgez le dossier de travail**, videz les téléchargements et la corbeille, effacez les données du site `localhost:3030` dans le navigateur. Le journal du kit ne contient pas de données personnelles, mais il est purgeable.

### Piège 6 — L’anonymisation appliquée par erreur sans sauvegarde de l’original
L’anonymisation est **définitive**. Si la version nominative n’a pas été sauvegardée ailleurs, vous ne pourrez plus répondre à un contributeur, vérifier un doublon ou justifier un décompte. **Sauvegardez l’original dans un espace sécurisé avant de lancer l’anonymisation** (le kit vous le fait confirmer).

### Piège 7 — Confondre anonymisation et chiffrement
Un fichier **chiffré** (protégé par mot de passe) contient toujours toutes les données personnelles : quiconque a la clé y accède. Le chiffrement protège la **confidentialité** ; il ne rend **pas** les données anonymes. Inversement, un fichier anonymisé n’a pas besoin d’être chiffré pour être diffusé.

### Piège 8 — Envoyer des données pseudonymisées à une IA en ligne
Les données pseudonymisées **restent personnelles** : les envoyer à un service d’IA en ligne (API ou abonnement) est un transfert de données personnelles vers un tiers. Le kit le **refuse** : seules les contributions **anonymisées de façon irréversible et validées** (ou le registre de démonstration) peuvent être confiées à une IA externe, et seulement si vous avez autorisé l’IA externe sur le poste.

## 6. Liste de contrôle avant diffusion d’un fichier anonymisé

- [ ] Toutes les observations sont au statut **« validée »**.
- [ ] Les cas douteux ont été relus **un par un**.
- [ ] Un **contrôle par sondage** a porté sur au moins 5 observations (davantage pour un gros dossier).
- [ ] Aucun **recoupement** possible : fonction + commune + date, nom d’exploitation, parcelle, âge, situation familiale rare, information de santé.
- [ ] Les **pièces jointes** et métadonnées (auteur du fichier, propriétés) ne contiennent pas de nom.
- [ ] La colonne **« auteur »** nominative est absente du fichier.
- [ ] Le fichier est au format **CSV** (préconisé) ou dans le format demandé par le destinataire.
- [ ] L’original nominatif est conservé dans un **espace sécurisé**, hors du fichier diffusé.
- [ ] Si possible, une **seconde personne** a relu le fichier.
- [ ] Le **rapport de traitement** est joint au dossier (il ne contient pas de données personnelles).

## 7. Utiliser une IA externe (API ou abonnement)

Règle de l’association Campus IAlès : **une IA externe ne reçoit que des contributions anonymisées de façon irréversible et validées** (ou le registre de démonstration, déjà anonymisé). Les textes originaux, pseudonymisés ou saisis à la main sont **toujours refusés**, même sans identifiant apparent. L’IA locale intégrée au kit, elle, accepte tous les textes : elle ne quitte pas votre ordinateur.

Désactivée par défaut. Pour l’utiliser :
1. Anonymisez irréversiblement vos contributions (onglet *Anonymiser / Pseudonymiser*, mode « anonymisation irréversible »), relisez-les et **validez-les**.
2. *Paramètres IA* → choisissez l’API Mistral, une API compatible OpenAI, l’API Anthropic, ou « Abonnement » (Le Chat, ChatGPT, Claude… sans API).
3. **Autorisez l’IA externe sur ce poste** (confirmation en deux étapes). Le kit élargit alors sa politique de sécurité **aux seuls domaines** de ces services.
4. Onglet *Analyse des observations* → « Observations à analyser » → **Mon dossier** : seules les contributions anonymisées et validées sont acceptées.
5. **Abonnement** : le kit prépare le texte à coller dans votre service (8 contributions par envoi en lot), vous collez la réponse ; aucune connexion directe n’est établie par le kit.

Avant usage, vérifiez les **conditions du fournisseur** : durée de conservation, réutilisation pour l’entraînement, localisation des serveurs, accord de traitement des données. Désactivez l’IA externe dès que vous n’en avez plus besoin.

## 8. Vidéo de sensibilisation

La vidéo de l’atelier pratique CCE-LR « Anonymiser & pseudonymiser avec l’IA locale (Ollama) » (3 min 50) est affichée dans l’onglet *Guide d’usage*. Le plan détaillé de ses séquences est disponible sous le lecteur et dans `docs/video/transcription.md` ; les sous-titres du commentaire sont en préparation.
