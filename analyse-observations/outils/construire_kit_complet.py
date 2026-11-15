#!/usr/bin/env python3
"""Construit le kit COMPLET pour Windows : application + Ollama + modèles + Node.js + Python, sans installation.

Usage :
  python outils/construire_kit_complet.py [--destination DOSSIER] [--cache DOSSIER] [--modeles a,b,c]

Par défaut : destination « Documents/Kit Campus IAles », cache des téléchargements dans « _telechargements ».

Produit un DOSSIER prêt à copier (clé USB, disque externe) :
  kit-campus-iales-v<VERSION>/
    demarrer.bat, arreter.bat, verifier-integrite.bat, LISEZMOI.txt, CHANGELOG.md, VERSION, SOMMES-SHA256.txt
    application/        le logiciel (identique au kit léger)
    outils-integres/    ollama/ (portable), modeles/ (format Ollama), node/, python/, LICENCES/
    donnees/            vos données (vide à la livraison)

Les logiciels sont vérifiés par leur somme SHA-256 officielle. Les fichiers de modèles sont reliés par
liens physiques au dossier Ollama local (aucune copie sur le même disque) ; copier le dossier du kit
ailleurs copie les données réelles.
"""
import hashlib
import json
import os
import shutil
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import construire_kit as base  # noqa: E402  (vérifications, guides, liste des fichiers de l'application)

RACINE = base.RACINE
VERSION = base.VERSION


def argument(nom, defaut):
    return sys.argv[sys.argv.index(nom) + 1] if nom in sys.argv else defaut


DESTINATION = Path(argument("--destination", Path.home() / "Documents" / "Kit Campus IAles"))
CACHE = Path(argument("--cache", DESTINATION / "_telechargements"))
MODELES = argument("--modeles", "ministral-3:3b,ministral-3:latest,qwen3.5:9b,qwen2.5:7b-instruct-q4_K_M").split(",")
ALIAS = {"ministral-3:latest": ["ministral-3:8b"]}  # même modèle, nom explicite pour la grille de recommandation
SOURCE_MODELES = Path(os.environ.get("OLLAMA_MODELS", Path.home() / ".ollama" / "models"))
NOM = f"kit-campus-iales-v{VERSION}"

# Logiciels embarqués : fichiers officiels et sommes SHA-256 publiées par les éditeurs (vérifiées le 15/11/2026).
LOGICIELS = {
    "ollama": {
        "fichier": "ollama-windows-amd64.zip",
        "url": "https://github.com/ollama/ollama/releases/download/v0.40.16/ollama-windows-amd64.zip",
        "sha256": "50fcf5ad54277f2fa5d173ebfc93bcb017adbc0c9ef2314daabc96ca9e6aa64e",
        "version": "Ollama 0.40.16 (Windows x64, portable, avec bibliothèques CUDA pour cartes NVIDIA)",
        "licence": "MIT — https://github.com/ollama/ollama/blob/main/LICENSE",
    },
    "node": {
        "fichier": "node-v26.13.1-win-x64.zip",
        "url": "https://nodejs.org/dist/v26.13.1/node-v26.13.1-win-x64.zip",
        "sha256": "e2edda75bfb089654705cf65a13b58933bfd5f57148e8ebda916f58a2474f1f7",
        "version": "Node.js 26.13.1 LTS (Windows x64, portable)",
        "licence": "MIT et licences tierces — fichier LICENSE",
    },
    "python": {
        "fichier": "python-3.14.10-embed-amd64.zip",
        "url": "https://www.python.org/ftp/python/3.14.10/python-3.14.10-embed-amd64.zip",
        "sha256": "90905e64a840557d8c1bc4f5b74db3d7ee85e3ffb217611cac1c7813acea4159",
        "version": "Python 3.14.10 (distribution « embarquable » Windows x64)",
        "licence": "PSF License — fichier LICENSE.txt",
    },
}


def sha256(chemin, taille_bloc=8 * 1024 * 1024):
    h = hashlib.sha256()
    with open(chemin, "rb") as f:
        while bloc := f.read(taille_bloc):
            h.update(bloc)
    return h.hexdigest()


def verifier_logiciels():
    for nom, l in LOGICIELS.items():
        f = CACHE / l["fichier"]
        if not f.exists():
            sys.exit(f"✗ {l['fichier']} absent de {CACHE} (à télécharger depuis {l['url']})")
        if sha256(f) != l["sha256"]:
            sys.exit(f"✗ Somme SHA-256 incorrecte pour {l['fichier']} : fichier corrompu ou modifié")
        print(f"✓ {l['fichier']} : somme SHA-256 conforme")


def lier_ou_copier(source, cible):
    cible.parent.mkdir(parents=True, exist_ok=True)
    if cible.exists():
        cible.unlink()
    try:
        os.link(source, cible)
        return "lien"
    except OSError:
        shutil.copy2(source, cible)
        return "copie"


def embarquer_modeles(dossier_modeles, dossier_licences):
    total = 0
    blobs_vus = set()
    for etiquette in MODELES:
        nom, tag = etiquette.split(":")
        manifeste = SOURCE_MODELES / "manifests" / "registry.ollama.ai" / "library" / nom / tag
        if not manifeste.exists():
            sys.exit(f"✗ Modèle {etiquette} absent du dossier Ollama local ({manifeste}) : « ollama pull {etiquette} »")
        m = json.loads(manifeste.read_text(encoding="utf-8"))
        couches = [m["config"]] + m.get("layers", [])
        for c in couches:
            blob = "sha256-" + c["digest"].split(":")[1]
            if blob in blobs_vus:
                continue
            blobs_vus.add(blob)
            src = SOURCE_MODELES / "blobs" / blob
            lier_ou_copier(src, dossier_modeles / "blobs" / blob)
            total += src.stat().st_size
            if c.get("mediaType") == "application/vnd.ollama.image.license":
                (dossier_licences / f"modele-{nom}-{tag}.txt").write_bytes(src.read_bytes())
        for t in [tag] + [a.split(":")[1] for a in ALIAS.get(etiquette, [])]:
            cible = dossier_modeles / "manifests" / "registry.ollama.ai" / "library" / nom / t
            cible.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(manifeste, cible)
        print(f"✓ Modèle {etiquette}" + (f" (+ alias {', '.join(ALIAS[etiquette])})" if etiquette in ALIAS else ""))
    return total


def extraire(zip_chemin, cible, filtre=None, retirer_prefixe=""):
    with zipfile.ZipFile(zip_chemin) as z:
        for info in z.infolist():
            nom = info.filename
            if retirer_prefixe and nom.startswith(retirer_prefixe):
                nom = nom[len(retirer_prefixe):]
            if not nom or nom.endswith("/") or (filtre and not filtre(nom)):
                continue
            dest = (cible / nom).resolve()
            if cible.resolve() not in dest.parents:
                sys.exit(f"✗ Chemin suspect dans {zip_chemin.name} : {info.filename}")
            dest.parent.mkdir(parents=True, exist_ok=True)
            with z.open(info) as src, open(dest, "wb") as out:
                shutil.copyfileobj(src, out)


def ecrire_sommes(kit):
    lignes = []
    for f in sorted(p for p in kit.rglob("*") if p.is_file()):
        rel = f.relative_to(kit).as_posix()
        if rel.startswith("donnees/") or rel == "SOMMES-SHA256.txt":
            continue
        lignes.append(f"{sha256(f)}  {rel}")
    (kit / "SOMMES-SHA256.txt").write_text(
        "# Sommes SHA-256 de tous les fichiers du kit (hors dossier « donnees »).\n"
        "# Vérification : double-cliquez sur verifier-integrite.bat\n" + "\n".join(lignes) + "\n",
        encoding="utf-8",
    )
    return len(lignes)


def taille_go(dossier):
    return sum(p.stat().st_size for p in dossier.rglob("*") if p.is_file()) / 1024 ** 3


def construire():
    base.verifier_version()
    base.generer_guides()
    fichiers = list(base.fichiers_application())
    racine = [(RACINE / "kit/racine" / n, n) for n in ("demarrer.bat", "arreter.bat", "verifier-integrite.bat", "LISEZMOI.txt")]
    racine += [(RACINE / "CHANGELOG.md", "CHANGELOG.md"), (RACINE / "VERSION", "VERSION")]
    base.controler(racine + fichiers)
    if base.erreurs:
        print("✗ Construction refusée :\n  - " + "\n  - ".join(base.erreurs))
        sys.exit(1)
    verifier_logiciels()

    kit = DESTINATION / NOM
    if kit.exists():
        # Sécurité : on ne supprime qu'un dossier de kit produit par ce script.
        if not (kit / "VERSION").exists() or not kit.name.startswith("kit-campus-iales-v"):
            sys.exit(f"✗ {kit} existe et n'est pas un kit : suppression refusée")
        shutil.rmtree(kit)
    kit.mkdir(parents=True)
    for source, cible in racine + fichiers:
        dest = kit / cible
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, dest)
    print(f"✓ Application copiée ({len(fichiers)} fichiers)")

    outils = kit / "outils-integres"
    licences = outils / "LICENCES"
    licences.mkdir(parents=True)
    extraire(CACHE / LOGICIELS["ollama"]["fichier"], outils / "ollama")
    print("✓ Ollama portable extrait")
    extraire(CACHE / LOGICIELS["node"]["fichier"], outils / "node",
             filtre=lambda n: n in ("node.exe", "LICENSE", "README.md"), retirer_prefixe="node-v26.13.1-win-x64/")
    shutil.copy2(outils / "node" / "LICENSE", licences / "node-LICENSE.txt")
    print("✓ Node.js portable extrait")
    extraire(CACHE / LOGICIELS["python"]["fichier"], outils / "python")
    if (outils / "python" / "LICENSE.txt").exists():
        shutil.copy2(outils / "python" / "LICENSE.txt", licences / "python-LICENSE.txt")
    print("✓ Python embarquable extrait")
    octets = embarquer_modeles(outils / "modeles", licences)

    (licences / "A_LIRE.txt").write_text(
        "Licences des composants inclus dans le kit Campus IAlès\n\n"
        + "\n".join(f"- {l['version']} : {l['licence']}\n  Source : {l['url']}" for l in LOGICIELS.values())
        + "\n- Modèles d'IA : voir les fichiers modele-*.txt (licence publiée avec chaque modèle).\n"
        "- Photo du bandeau : « Panoramic view of Ales 02 », Krzysztof Golik, CC BY-SA 4.0, Wikimedia Commons.\n"
        "- Logo IAlès : association Campus IAlès.\n",
        encoding="utf-8",
    )
    (outils / "LISEZMOI.txt").write_text(
        "Outils intégrés au kit (ne pas modifier) :\n"
        f"- ollama/  : {LOGICIELS['ollama']['version']}\n"
        f"- modeles/ : {', '.join(MODELES)} (format Ollama)\n"
        f"- node/    : {LOGICIELS['node']['version']} — démarrage de secours\n"
        f"- python/  : {LOGICIELS['python']['version']} — démarrage de secours\n"
        "Ces programmes ne s'installent pas : ils sont lancés par demarrer.bat et arrêtés par arreter.bat.\n",
        encoding="utf-8",
    )
    (kit / "donnees").mkdir()
    (kit / "donnees" / "A_PROPOS.txt").write_text(
        "Ce dossier contient VOS données (dossier de travail, journal, analyses, tableau de correspondance chiffré, "
        "diagnostic). Il est conservé lors des mises à jour. Il peut contenir des données personnelles : "
        "ne le partagez pas et purgez-le à la clôture du dossier.\n",
        encoding="utf-8",
    )
    print("… calcul des sommes SHA-256 de tous les fichiers (quelques minutes)")
    n = ecrire_sommes(kit)
    print(f"✓ {n} fichiers listés dans SOMMES-SHA256.txt")
    print(f"✓ Kit complet : {kit}")
    print(f"  Taille : {taille_go(kit):.1f} Go (dont modèles {octets / 1024 ** 3:.1f} Go) — support conseillé : 32 Go minimum")


if __name__ == "__main__":
    construire()
