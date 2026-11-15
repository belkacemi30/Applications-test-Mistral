# Grille de recommandation des modèles locaux

> **Date de vérification : 15/11/2026.** Sources : pages officielles `ollama.com/library/ministral-3`, `ollama.com/library/qwen3.5`, `ollama.com/library/gemma3` (onglet *Tags*), et `ollama show` sur le poste de test.
> Les noms, tailles et quantifications ci-dessous ont été relevés à cette date ; ils peuvent évoluer. Revérifier avant chaque nouvelle version du kit.

## Modèles inclus dans le kit complet (version 3.1)

| Modèle | Éditeur | Taille | Rôle dans le kit |
|---|---|---|---|
| `ministral-3:3b` | Mistral AI | 3,0 Go | palier minimal (petits ordinateurs, processeur seul) |
| `ministral-3:8b` (= `ministral-3:latest`) | Mistral AI | 6,0 Go | paliers intermédiaire et confortable (modèle par défaut) |
| `qwen3.5:9b` | Alibaba (Qwen) | 6,6 Go | alternative, résultats comparables lors des essais |
| `qwen2.5:7b-instruct-q4_K_M` | Alibaba (Qwen) | 4,7 Go | alternative plus légère |

Les licences publiées avec chaque modèle sont copiées dans `outils-integres/LICENCES/`.

## Grille retenue (famille Ministral 3, éditeur Mistral AI)

| Palier | Configuration de référence | Seuils appliqués par le diagnostic | Modèle | Taille téléchargée | Quantification | Disque libre conseillé | Durée par observation (anonymisation, 2 passes) |
|---|---|---|---|---|---|---|---|
| Minimal | 8 Go de RAM, pas de GPU dédié | sinon | `ministral-3:3b` | 3,0 Go | Q4_K_M | 6 Go | **estimation** : 30 s à 2 min (processeur seul) |
| Intermédiaire | 16 Go de RAM, GPU grand public | RAM ≥ 15 Go et VRAM ≥ 6 Go | `ministral-3:8b` (= `ministral-3:latest`) | 6,0 Go | Q4_K_M | 10 Go | **mesuré** : 10 à 20 s |
| Confortable | 32 Go de RAM ou plus, GPU ≥ 12 Go de VRAM | RAM ≥ 30 Go et VRAM ≥ 12 Go | `ministral-3:8b` (kit) — `ministral-3:14b` (9,1 Go) possible si installé à part | 6,0 Go | Q4_K_M | 10 Go | **estimation** : 10 à 20 s |

- Mac à puce Apple : mémoire unifiée ; seuils appliqués à la RAM seule (≥ 15 Go → 8b ; sinon 3b).
- `ministral-3:14b` n’est pas inclus dans le kit complet (choix de taille de distribution) : il reste utilisable sur un poste où il est installé séparément.
- Les seuils sont tolérants (30 et 15 Go) car 32 Go physiques apparaissent souvent comme 31,7 Go utilisables.
- Le prompt initial plaçait le palier confortable à « GPU 8 Go ou plus » : `ministral-3:14b` (9,1 Go, plus le contexte) **ne tient pas entièrement** dans 8 Go de VRAM. Il fonctionne alors en déchargement partiel sur le processeur, plus lentement. Il n’est donc conseillé qu’à partir de 12 Go de VRAM, en installation séparée ; le kit complet s’en tient à `ministral-3:8b` pour ce palier.
- Prévoir 1 à 2 Go de mémoire supplémentaires pour le contexte (8 192 à 16 384 jetons utilisés par le kit).

**Mesures effectuées** (15/11/2026) : Windows 11, AMD Ryzen 7 5800X, 32 Go de RAM, NVIDIA RTX 3070 8 Go, Ollama 0.40.16, `ministral-3:latest` (8b, Q4_K_M) :
- anonymisation du jeu fictif (6 observations, détection + contrôle qualité) : 53 à 57 s au total, soit 2 à 17 s par observation selon la longueur ;
- analyse d’une observation du registre : 13 à 70 s selon la longueur (premier appel plus long : chargement du modèle).

Les durées « estimation » n’ont pas été mesurées faute de machine correspondante : **à confirmer** sur un poste réel.

## Alternatives vérifiées

| Modèle | Taille (Q4_K_M) | Remarque |
|---|---|---|
| `gemma3:4b` | 3,4 Go | alternative au palier minimal (Google) |
| `qwen3.5:9b` | 6,6 Go (taille relevée sur le poste de test) | alternative au palier intermédiaire ; résultats d’analyse comparables à ministral-3 lors des essais |
| `gemma3:12b` | 8,2 Go | alternative au palier confortable |

Le kit fonctionne avec n’importe quel modèle de texte installé dans Ollama (liste dans *Paramètres IA*). Les modèles d’embedding (`bge-m3`, `nomic-embed-text`…) sont automatiquement exclus.

## Procédure de mise à jour de la grille

1. Pour chaque modèle candidat, consulter `https://ollama.com/library/<modèle>/tags` et relever le nom exact, la taille et la quantification.
2. Mesurer la durée sur au moins un poste par palier avec `node tests/e2e_ollama.js <modèle>` (jeu fictif ; le test vérifie aussi l’absence de fuite d’identifiants).
3. Mettre à jour : `js/kit.js` (constante `GRILLE`), `kit/diagnostic.ps1`, `kit/diagnostic.sh`, ce fichier, `GUIDE_INSTALLATION.md` (section 3) et la date de vérification.
