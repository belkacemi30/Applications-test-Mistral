#!/usr/bin/env python3
"""Assemble l'application en UN seul fichier HTML autonome (CSS + JS + données en ligne).

Usage : python3 outils/assembler_page_unique.py
Produit : analyse-observations.html (à la racine du dossier de l'app)
Aucune référence externe : le fichier s'ouvre directement (double-clic), sans serveur.
"""
import re
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent

html = (RACINE / "index.html").read_text(encoding="utf-8")
css = (RACINE / "styles.css").read_text(encoding="utf-8")
app = (RACINE / "app.js").read_text(encoding="utf-8")
donnees = (RACINE / "donnees" / "observations.js").read_text(encoding="utf-8")

assert "</style" not in css
assert "</script>" not in app
assert "</script>" not in donnees, "les données doivent avoir </ échappé"

html = html.replace(
    '<link rel="stylesheet" href="styles.css">',
    "<style>\n" + css + "\n</style>"
)
html = html.replace(
    '<script src="donnees/observations.js"></script>',
    "<script>\n" + donnees + "\n</script>"
)
html = html.replace(
    '<script src="app.js"></script>',
    "<script>\n" + app + "\n</script>"
)

assert 'src="' not in html and "href=\"styles" not in html, "référence externe restante"

sortie = RACINE / "analyse-observations.html"
sortie.write_text(html, encoding="utf-8")
print(f"OK: {sortie} ({sortie.stat().st_size} octets, aucune référence externe)")
