# Analyse des observations — poste de travail local du commissaire enquêteur (kit v3.1)

**Campus IAlès en Occitanie — « IAlès » – Université populaire de l’intelligence artificielle** : première application de l’association.

Application de traitement des observations du public d’une enquête publique — démonstration sur le
**projet agrivoltaïque du Pas de Mirepoix (Saint-Julien-de-Briola, Aude)**, registre du 12/11/2024 au 11/12/2024.

Depuis la version 3, l’application est distribuée comme un **kit autonome** (archive ZIP versionnée)
exécuté **entièrement en local** dans le navigateur du commissaire enquêteur, sans Internet en usage courant.
Le site GitHub Pages n’est qu’une **vitrine de démonstration**.

## Utilisation (commissaire enquêteur) — rien à installer

Le **kit complet Windows** (`kit-campus-iales-v<version>`, ~23 Go, à copier sur clé USB ou disque ≥ 32 Go) embarque
l’IA locale **Ollama** (portable), les modèles `ministral-3:3b`, `ministral-3:8b`, `qwen3.5:9b`, `qwen2.5:7b-instruct`,
ainsi que **Node.js** et **Python** portables (démarrage de secours).

1. Copier le dossier ; double-cliquer sur `verifier-integrite.bat` (sommes SHA-256).
2. Double-cliquer sur `demarrer.bat` : l’IA intégrée démarre (port 11435), puis le navigateur s’ouvre sur `http://localhost:3030`.
3. Pour arrêter : fermer la fenêtre, puis `arreter.bat`.

Le paquet léger `kit-campus-iales-v<version>-application.zip` (application seule) sert aux mises à jour et aux postes
macOS / Linux où Ollama est installé séparément.

Guides : [docs/GUIDE_INSTALLATION.md](docs/GUIDE_INSTALLATION.md), [docs/GUIDE_USAGE_ANONYMISATION.md](docs/GUIDE_USAGE_ANONYMISATION.md),
[docs/GRILLE_MODELES.md](docs/GRILLE_MODELES.md) ; historique : [CHANGELOG.md](CHANGELOG.md) ;
cahier des charges complété : [docs/PROMPT_KIT_COMPLETE.md](docs/PROMPT_KIT_COMPLETE.md).

## Onglets

| Onglet | Rôle |
|---|---|
| Accueil | état du poste : version, hors ligne garanti, Ollama, modèle, diagnostic, IA externe |
| Anonymiser / Pseudonymiser | traitement local (Ollama) : détection, remplacement, contrôle qualité, relecture humaine, tableau de correspondance chiffré |
| Analyse des observations | thèmes, position, synthèse, questions au maître d’ouvrage ; moteur local ou IA externe (API ou abonnement) sur données anonymisées et validées |
| Export des contributions | CSV préconisé, XLSX, JSON, TXT ; données nominatives exclues par défaut |
| Installation | diagnostic de l’ordinateur, guide d’installation, dépannage |
| Guide d’usage | définitions RGPD / CNIL, pièges à éviter, liste de contrôle, vidéo (emplacement, sous-titres, transcription) |

## Structure du code

```
index.html, styles.css, styles-kit.css   interface en onglets
app.js                                   onglet Analyse (moteurs d’IA, garde-fous IA externe)
js/anonymisation.js                      pipeline d’anonymisation / pseudonymisation (sans réseau, testable)
js/formats.js                            CSV, XLSX, ZIP, JSON, TXT ; import CSV/JSON/TXT
js/chiffrement.js                        AES-GCM + PBKDF2 (tableau de correspondance)
js/markdown.js                           rendu sûr des guides
js/kit.js                                onglets, stockage dans donnees/, dialogues, export, guides
js/version.js, VERSION, CHANGELOG.md     version du kit
registre/observations.js                 registre de démonstration anonymisé (204 entrées)
exemples/observations-fictives.csv       jeu fictif pour les tests
kit/serveur.{ps1,js,py}                  serveur local (même API) : PowerShell, Node.js, Python 3
kit/diagnostic.{ps1,sh}                  diagnostic matériel → donnees/diagnostic.json
kit/demarrer.ps1, kit/demarrer-unix.sh   démarrage (appelés par kit/racine/demarrer.*)
kit/racine/                              fichiers placés à la racine du kit (demarrer, arreter, verifier-integrite)
kit/verifier.ps1                         contrôle d’intégrité (SOMMES-SHA256.txt)
assets/                                  logo IAlès, photo d’Alès (Krzysztof Golik, CC BY-SA 4.0)
outils/construire_kit.py                 construction de l’archive + contrôles + SHA-256
outils/anonymiser.py                     anonymisation du registre de démonstration (règles)
tests/                                   tests automatisés
```

## Développement

```bash
node --test tests/test_logique.js        # logique (19 tests)
node tests/test_serveurs.js              # les 3 serveurs : mêmes 11 tests de sécurité / API
node tests/e2e_ollama.js ministral-3:latest   # pipeline réel avec Ollama sur le jeu fictif
python3 outils/construire_kit.py         # paquet léger → ../dist/kit-campus-iales-v<version>-application.zip (+ .sha256)
python3 outils/construire_kit_complet.py # kit complet Windows → Documents/Kit Campus IAles/kit-campus-iales-v<version>/
python3 outils/assembler_page_unique.py  # page unique de démonstration (mode vitrine)
```

Lancement en développement : `node kit/serveur.js` (données dans `../donnees`, ou `KIT_DONNEES=<dossier>`).

Régénérer le registre de démonstration (données brutes jamais versionnées) :

```bash
python3 outils/extraction_observations.py transcript.md /tmp/brut.js
python3 outils/anonymiser.py /tmp/brut.js registre/observations.js --rapport /tmp/rapport-registre.md
```

## Sécurité et RGPD (résumé)

- Serveur local sur `127.0.0.1` uniquement, contrôle de l’en-tête `Host`, écritures limitées à `donnees/` (liste blanche).
- Politique de sécurité (CSP) : aucune connexion hors du poste ; l’IA externe ajoute **uniquement** les domaines des fournisseurs, après autorisation en deux étapes.
- Anonymisation exclusivement via Ollama local ; aucune valeur personnelle dans le journal ni dans le rapport.
- IA externe : uniquement le registre de démonstration et les contributions anonymisées irréversiblement **et validées** ; un texte saisi librement n’est jamais envoyé.
- Aucune télémétrie, aucun cookie ; clés d’API dans le navigateur uniquement (jamais dans `donnees/`).

## Vitrine GitHub Pages

Settings → Pages → branche publiée, dossier `/analyse-observations`. La vitrine affiche un bandeau rappelant que la
version de référence est le kit local ; l’import de fichiers y est désactivé.
