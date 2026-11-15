#!/usr/bin/env python3
"""Construit le kit distribuable « Analyse des observations ».

Usage : python3 outils/construire_kit.py [--sortie DOSSIER]
Produit : dist/kit-analyse-observations-v<VERSION>.zip et son fichier .sha256

Étapes :
  1. vérifie la cohérence de version (VERSION, js/version.js, CHANGELOG.md) ;
  2. génère les guides HTML autonomes et imprimables (docs/*.html, HTML statique sans script) ;
  3. assemble l'arborescence : demarrer.*, LISEZMOI.txt, CHANGELOG.md, VERSION, application/, donnees/ ;
  4. contrôles bloquants : aucune ressource distante chargée par l'application, aucune donnée
     nominative (courriels / téléphones hors plages fictives), scripts PowerShell en UTF-8 avec BOM ;
  5. crée l'archive ZIP (droits d'exécution pour les scripts Unix) et sa somme SHA-256.
"""
import hashlib
import html
import json
import re
import sys
import zipfile
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
VERSION = (RACINE / "VERSION").read_text(encoding="utf-8").strip()
SORTIE = Path(sys.argv[sys.argv.index("--sortie") + 1]) if "--sortie" in sys.argv else RACINE.parent / "dist"
NOM = f"kit-analyse-observations-v{VERSION}"

# Fichiers et dossiers de l'application livrés dans application/
APPLICATION = ["index.html", "styles.css", "styles-kit.css", "app.js", "VERSION", "CHANGELOG.md", "js", "registre", "exemples", "kit", "docs"]
EXCLUS = {"kit/racine", "docs/PROMPT_KIT_COMPLETE.md"}
GUIDES = ["GUIDE_INSTALLATION", "GUIDE_USAGE_ANONYMISATION", "GRILLE_MODELES", "RAPPORT_ANONYMISATION"]
# Domaines d'IA externe : n'apparaissent que dans le code d'appel optionnel (Exigence G), jamais chargés au démarrage.
DOMAINES_IA_EXTERNE = {"api.mistral.ai", "api.openai.com", "api.anthropic.com"}

erreurs = []


# ------------------------------------------------------------------ 1. version
def verifier_version():
    v_js = re.search(r'numero:\s*"([^"]+)"', (RACINE / "js/version.js").read_text(encoding="utf-8")).group(1)
    if v_js != VERSION:
        erreurs.append(f"js/version.js ({v_js}) ≠ VERSION ({VERSION})")
    if f"## {VERSION} " not in (RACINE / "CHANGELOG.md").read_text(encoding="utf-8"):
        erreurs.append(f"CHANGELOG.md ne décrit pas la version {VERSION}")


# ------------------------------------------------------------------ 2. guides HTML statiques
def en_ligne(texte):
    """Gras, italique, code, liens — tout est échappé ; seuls http(s) et liens relatifs sont conservés."""
    sortie, pos = [], 0
    motif = re.compile(r"(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)\s]+\))")
    for m in motif.finditer(texte):
        sortie.append(html.escape(texte[pos:m.start()]))
        s = m.group(0)
        if m.group(1):
            sortie.append("<code>" + html.escape(s[1:-1]) + "</code>")
        elif m.group(2):
            sortie.append("<strong>" + en_ligne(s[2:-2]) + "</strong>")
        elif m.group(3):
            sortie.append("<em>" + en_ligne(s[1:-1]) + "</em>")
        else:
            lib, href = re.match(r"^\[([^\]]+)\]\(([^)\s]+)\)$", s).groups()
            if re.match(r"^https?://", href):
                sortie.append(f'<a href="{html.escape(href)}" rel="noopener noreferrer">{html.escape(lib)}</a> <span class="url">({html.escape(href)})</span>')
            elif re.match(r"^[\w./-]+$", href):
                sortie.append(f'<a href="{html.escape(re.sub(r"\.md$", ".html", href))}">{html.escape(lib)}</a>')
            else:
                sortie.append(html.escape(lib))
        pos = m.end()
    sortie.append(html.escape(texte[pos:]))
    return "".join(sortie)


def md_vers_html(md):
    lignes = md.replace("\r\n", "\n").split("\n")
    h, i, sommaire = [], 0, []
    est_liste = lambda l: re.match(r"^(\s*)([-*+]|\d+[.)])\s+", l)
    est_tableau = lambda l: re.match(r"^\s*\|.*\|\s*$", l)
    while i < len(lignes):
        l = lignes[i]
        if not l.strip():
            i += 1
            continue
        if l.startswith("```"):
            bloc = []
            i += 1
            while i < len(lignes) and not lignes[i].startswith("```"):
                bloc.append(lignes[i])
                i += 1
            i += 1
            h.append("<pre><code>" + html.escape("\n".join(bloc)) + "</code></pre>")
            continue
        m = re.match(r"^(#{1,6})\s+(.*)$", l)
        if m:
            n, t = len(m.group(1)), m.group(2)
            ident = "sec-" + re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")[:60]
            if n == 2:
                sommaire.append((ident, t))
            h.append(f'<h{n} id="{ident}">{en_ligne(t)}</h{n}>')
            i += 1
            continue
        if re.match(r"^\s*(---|\*\*\*)\s*$", l):
            h.append("<hr>")
            i += 1
            continue
        if l.lstrip().startswith(">"):
            bloc = []
            while i < len(lignes) and lignes[i].lstrip().startswith(">"):
                bloc.append(re.sub(r"^\s*>\s?", "", lignes[i]))
                i += 1
            h.append("<blockquote>" + md_vers_html("\n".join(bloc))[0] + "</blockquote>")
            continue
        if est_tableau(l) and i + 1 < len(lignes) and re.match(r"^\s*\|?\s*:?-{2,}", lignes[i + 1]):
            cel = lambda x: [c.strip() for c in x.strip().strip("|").split("|")]
            entete = cel(l)
            i += 2
            corps = []
            while i < len(lignes) and est_tableau(lignes[i]):
                corps.append(cel(lignes[i]))
                i += 1
            h.append("<table><thead><tr>" + "".join(f'<th scope="col">{en_ligne(c)}</th>' for c in entete) + "</tr></thead><tbody>"
                     + "".join("<tr>" + "".join(f"<td>{en_ligne(c)}</td>" for c in r) + "</tr>" for r in corps) + "</tbody></table>")
            continue
        if est_liste(l):
            ordonnee = bool(re.match(r"^\s*\d+[.)]", l))
            base = len(l) - len(l.lstrip())
            items = []
            while i < len(lignes) and (est_liste(lignes[i]) or (lignes[i].startswith(" ") and lignes[i].strip() and items)):
                x = lignes[i]
                r = len(x) - len(x.lstrip())
                mm = re.match(r"^(\s*)([-*+]|\d+[.)])\s+(.*)$", x)
                if mm and r <= base + 1:
                    items.append([mm.group(3), []])
                elif mm:
                    items[-1][1].append(mm.group(3))
                else:
                    items[-1][0] += " " + x.strip()
                i += 1
            balise = "ol" if ordonnee else "ul"
            h.append(f"<{balise}>" + "".join(
                "<li>" + en_ligne(t) + ("<ul>" + "".join(f"<li>{en_ligne(s)}</li>" for s in sous) + "</ul>" if sous else "") + "</li>"
                for t, sous in items) + f"</{balise}>")
            continue
        para = []
        while i < len(lignes) and lignes[i].strip() and not re.match(r"^(#{1,6})\s|^```", lignes[i]) and not est_liste(lignes[i]) \
                and not lignes[i].lstrip().startswith(">") and not est_tableau(lignes[i]):
            para.append(lignes[i].strip())
            i += 1
        h.append("<p>" + en_ligne(" ".join(para)) + "</p>")
    return "\n".join(h), sommaire


GABARIT = """<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="referrer" content="no-referrer">
<title>{titre} — kit Analyse des observations {version}</title>
<style>
:root {{ color-scheme: light; }}
body {{ font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; max-width: 860px; margin: 0 auto; padding: 24px 18px 48px; line-height: 1.6; color: #1b2432; background: #ffffff; }}
h1 {{ color: #1e3a8a; font-size: 1.6rem; }} h2 {{ color: #1e3a8a; margin-top: 2em; border-bottom: 1px solid #e2e7f0; padding-bottom: 4px; }} h3 {{ margin-top: 1.4em; }}
table {{ border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 0.93rem; }} th, td {{ border: 1px solid #cfd6e3; padding: 6px 9px; text-align: left; vertical-align: top; }} thead th {{ background: #eff4ff; }}
code {{ background: #f1f4f9; padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }} pre {{ background: #f1f4f9; padding: 12px; border-radius: 6px; overflow-x: auto; }}
blockquote {{ border-left: 4px solid #1d4ed8; background: #eff4ff; margin: 12px 0; padding: 4px 16px; }}
nav {{ background: #f8fafd; border: 1px solid #e2e7f0; border-radius: 8px; padding: 8px 16px; }} nav ul {{ columns: 2; }}
.url {{ display: none; color: #55617a; font-size: 0.85em; }} .pied {{ margin-top: 3em; color: #55617a; font-size: 0.85rem; border-top: 1px solid #e2e7f0; padding-top: 8px; }}
@media print {{ nav {{ display: none; }} .url {{ display: inline; }} a {{ color: inherit; text-decoration: none; }} h2 {{ page-break-after: avoid; }} table, pre {{ page-break-inside: avoid; }} }}
</style>
</head>
<body>
<nav aria-label="Sommaire"><strong>Sommaire</strong><ul>{sommaire}</ul></nav>
<main>
{contenu}
</main>
<p class="pied">Kit « Analyse des observations » — version {version}. Document autonome, imprimable (Fichier → Imprimer → Enregistrer au format PDF).</p>
</body>
</html>
"""


def generer_guides():
    for nom in GUIDES:
        md = (RACINE / "docs" / f"{nom}.md").read_text(encoding="utf-8")
        contenu, sommaire = md_vers_html(md)
        titre = re.search(r"^#\s+(.+)$", md, re.M).group(1)
        page = GABARIT.format(
            titre=html.escape(titre), version=VERSION, contenu=contenu,
            sommaire="".join(f'<li><a href="#{i}">{html.escape(re.sub(r"[`*]", "", t))}</a></li>' for i, t in sommaire))
        (RACINE / "docs" / f"{nom}.html").write_text(page, encoding="utf-8")
    print(f"✓ Guides HTML autonomes générés : {', '.join(g + '.html' for g in GUIDES)}")


# ------------------------------------------------------------------ 3. assemblage
def fichiers_application():
    for element in APPLICATION:
        p = RACINE / element
        candidats = [p] if p.is_file() else sorted(x for x in p.rglob("*") if x.is_file())
        for f in candidats:
            rel = f.relative_to(RACINE).as_posix()
            if any(rel == e or rel.startswith(e + "/") for e in EXCLUS) or "/." in "/" + rel or rel.endswith((".tmp", ".pyc")):
                continue
            yield f, "application/" + rel


# ------------------------------------------------------------------ 4. contrôles
RE_RESSOURCE_DISTANTE = [
    re.compile(r"""<(?:script|link|img|iframe|source|track|video|audio)[^>]+(?:src|href)\s*=\s*["']\s*(?:https?:)?//""", re.I),
    re.compile(r"""@import\s+(?:url\()?["']?\s*(?:https?:)?//""", re.I),
    re.compile(r"""url\(\s*["']?\s*(?:https?:)?//""", re.I),
]
RE_URL = re.compile(r"""["'`](https?://[^"'`\s]+)""")
RE_COURRIEL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
RE_TEL = re.compile(r"(?<!\d)(?:(?:\+|00)33[\s.-]?[1-9]|0[1-9])(?:[\s.-]?\d{2}){4}(?!\d)")


def controler(fichiers):
    for source, cible in fichiers:
        if source.suffix not in (".html", ".css", ".js", ".csv", ".json", ".md", ".txt", ".vtt"):
            continue
        texte = source.read_text(encoding="utf-8", errors="replace")
        rel = source.relative_to(RACINE).as_posix()
        if source.suffix in (".html", ".css", ".js") and not rel.startswith("docs/"):
            for motif in RE_RESSOURCE_DISTANTE:
                if motif.search(texte):
                    erreurs.append(f"ressource distante chargée dans {rel}")
        if source.suffix == ".js" and rel != "kit/serveur.js":
            for url in RE_URL.findall(texte):
                hote = re.sub(r"^https?://([^/:]+).*$", r"\1", url)
                if hote in ("localhost", "127.0.0.1") or hote in DOMAINES_IA_EXTERNE or hote.endswith(("openxmlformats.org", "w3.org")):
                    continue
                if "/library/" in url or rel == "js/markdown.js":
                    continue
                erreurs.append(f"URL externe inattendue dans {rel} : {url}")
        # Données nominatives : seuls les domaines réservés (RFC 2606) et numéros de fiction ARCEP sont admis.
        for c in RE_COURRIEL.findall(texte):
            if not re.search(r"@(example\.(org|com|net)|exemple\.invalid)$", c, re.I) and not c.startswith("noreply@"):
                erreurs.append(f"adresse courriel réelle possible dans {rel} : {c[:3]}…")
        for t in RE_TEL.findall(texte):
            chiffres = re.sub(r"\D", "", t)
            if not re.match(r"^(33)?0?(19900|63998)", chiffres):
                erreurs.append(f"numéro de téléphone possible dans {rel} : {t[:4]}…")
        if source.suffix == ".ps1" or rel.endswith(".ps1"):
            pass
    for source, _ in fichiers:
        if source.suffix == ".ps1" and not source.read_bytes().startswith(b"\xef\xbb\xbf"):
            erreurs.append(f"{source.name} doit être en UTF-8 avec BOM (PowerShell 5.1)")


# ------------------------------------------------------------------ 5. archive
def construire():
    verifier_version()
    generer_guides()
    fichiers = list(fichiers_application())
    racine_kit = [(RACINE / "kit/racine" / n, n) for n in ("demarrer.bat", "demarrer.command", "demarrer.sh", "LISEZMOI.txt")]
    racine_kit += [(RACINE / "CHANGELOG.md", "CHANGELOG.md"), (RACINE / "VERSION", "VERSION")]
    tout = racine_kit + fichiers
    controler(tout)
    if erreurs:
        print("✗ Construction refusée :")
        for e in erreurs:
            print("  - " + e)
        sys.exit(1)
    SORTIE.mkdir(parents=True, exist_ok=True)
    archive = SORTIE / f"{NOM}.zip"
    executables = (".sh", ".command")
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for source, cible in sorted(tout, key=lambda x: x[1]):
            info = zipfile.ZipInfo(f"{NOM}/{cible}", date_time=(2026, 11, 15, 12, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = ((0o100755 if cible.endswith(executables) else 0o100644) << 16)
            z.writestr(info, source.read_bytes())
        dossier = zipfile.ZipInfo(f"{NOM}/donnees/", date_time=(2026, 11, 15, 12, 0, 0))
        dossier.external_attr = (0o40755 << 16) | 0x10
        z.writestr(dossier, b"")
        info = zipfile.ZipInfo(f"{NOM}/donnees/A_PROPOS.txt", date_time=(2026, 11, 15, 12, 0, 0))
        info.external_attr = 0o100644 << 16
        z.writestr(info, ("Ce dossier contient VOS données (dossier de travail, journal, analyses, tableau de correspondance chiffré, "
                          "diagnostic). Il est conservé lors des mises à jour. Il peut contenir des données personnelles : "
                          "ne le partagez pas et purgez-le à la clôture du dossier.\r\n").encode("utf-8"))
    empreinte = hashlib.sha256(archive.read_bytes()).hexdigest()
    (SORTIE / f"{NOM}.zip.sha256").write_text(f"{empreinte}  {archive.name}\n", encoding="utf-8")
    taille = archive.stat().st_size / 1024 / 1024
    print(f"✓ {archive} ({taille:.1f} Mo, {len(tout) + 2} entrées)")
    print(f"✓ SHA-256 : {empreinte}")
    print("✓ Contrôles : aucune ressource distante, aucune donnée nominative, scripts PowerShell en UTF-8 avec BOM")


if __name__ == "__main__":
    construire()
