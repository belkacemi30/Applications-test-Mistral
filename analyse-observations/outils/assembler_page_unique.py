#!/usr/bin/env python3
"""Assemble l'application en UN seul fichier HTML (CSS + JS + registre en ligne), pour une démonstration.

Usage : python3 outils/assembler_page_unique.py
Produit : analyse-observations.html (à la racine du dossier de l'application)

Ce fichier s'ouvre directement (double-clic), en mode « vitrine » : registre de démonstration, guides
intégrés, export. Il n'est PAS le support de production : le kit local (outils/construire_kit.py)
est requis pour l'IA locale (Ollama) et le traitement de données personnelles, car un fichier
ouvert depuis le disque (file://) ne peut ni joindre Ollama ni enregistrer de données.
"""
import re
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
html = (RACINE / "index.html").read_text(encoding="utf-8")


def feuille(m):
    css = (RACINE / m.group(1)).read_text(encoding="utf-8")
    assert "</style" not in css
    return "<style>\n" + css + "\n</style>"


def script(m):
    js = (RACINE / m.group(1)).read_text(encoding="utf-8")
    assert "</script>" not in js, m.group(1) + " contient </script>"
    return "<script>\n" + js + "\n</script>"


html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', feuille, html)
html = re.sub(r'<script src="([^"]+)"></script>', script, html)
assert not re.search(r'<script src=|<link rel="stylesheet" href=', html), "référence externe restante"

sortie = RACINE / "analyse-observations.html"
sortie.write_text(html, encoding="utf-8")
print(f"OK: {sortie} ({sortie.stat().st_size} octets, aucune référence externe)")
