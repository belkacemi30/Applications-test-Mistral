#!/usr/bin/env python3
"""Extrait les observations d'une transcription OCR d'export de registre (PDF)
vers un fichier JavaScript local : registre/observations.js.

Usage :
    python3 outils/extraction_observations.py <transcript.md> [sortie.js]

Le fichier généré est purement local : aucune donnée n'est envoyée sur le réseau.
"""
import json
import re
import sys
from pathlib import Path

NOISE = [
    re.compile(r"^--- Page \d+ ---\s*$"),
    re.compile(r"^Page \d+ / \d+\.?\s*$"),
    re.compile(r"^Export généré le .*$"),
    re.compile(r"^PROJET AGRIVOLTAÏQUE DU PAS DE MIREPOIX"),
    re.compile(r"^\(SAINT-JULIEN-DE-BRIOLA\)\s*$"),
    re.compile(r"^by Publilégal\s*$"),
    re.compile(r"^Contributions du \d{2}/\d{2}/\d{4} au \d{2}/\d{2}/\d{4}\s*$"),
]

RE_SPLIT = re.compile(r"^#\s*REGISTRE NUMERIQUE\s*$")
RE_NB_AVIS = re.compile(r"Nombre d'avis déposés\s*:\s*(\d+)")
RE_PERMANENCE = re.compile(r"^(\d+)\)\s+(.*permanence.*)$")
RE_AUTEUR = re.compile(
    r"^(\[PERSONNE [A-Z]+\](?: et \[PERSONNE [A-Z]+\])?"
    r"|Mme \[PERSONNE [A-Z]+\] [A-Za-zÀ-ÿ'-]+"
    r"|M\. \[PERSONNE [A-Z]+\] [A-Za-zÀ-ÿ'-]+)"
)
RE_OBS = re.compile(r"^\*\*Observation\s+([A-Za-z0-9]+)\s*:?\s*\*\*\s*:?\s*(.*)$")
RE_DATE_OBS = re.compile(r"(\d{2}/\d{2}/\d{4})")
RE_HEADER_E = re.compile(r"^#*\s*\**\s*[@E](\d+)\s*-\s*(.*?)\s*$")
RE_DATE = re.compile(r"^#?\s*\**\s*Date de dépôt\s*:\s*\**\s*(.+?)\s*$")
RE_LIEU = re.compile(r"^#?\s*\**\s*Lieu de dépôt\s*:\s*\**\s*(.+?)\s*$")
RE_OBJET = re.compile(r"^#?\s*\**\s*Objet\s*:\s*\**\s*(.+?)\s*$")
RE_CONTRIB = re.compile(r"^#*\s*\**\s*Contribution\s*:\s*\**\s*$")
RE_PIECES = re.compile(r"^#?\s*\**\s*Pièce\(s\) jointes\(s\)\s*:\s*\**\s*(.+?)\s*$")


def nettoyer(lignes):
    sortie = []
    for ligne in lignes:
        if any(r.search(ligne) for r in NOISE):
            continue
        sortie.append(ligne.rstrip("\n"))
    return sortie


def paragraphe(lignes):
    return "\n".join(lignes).strip()


def extraire_partie_orale(lignes):
    observations = []
    ids_vus = set()
    permanence = ""
    date = ""
    auteur = ""
    contexte = []
    courant = None

    def fermer():
        nonlocal courant, contexte
        if courant is not None:
            courant["texte"] = paragraphe(courant["_lignes"])
            courant["contexte"] = paragraphe(contexte) if contexte else ""
            del courant["_lignes"]
            observations.append(courant)
        courant = None
        contexte = []

    for ligne in lignes:
        if ligne.startswith("#"):
            continue
        m = RE_PERMANENCE.match(ligne)
        if m:
            fermer()
            permanence = ligne.strip()
            dm = RE_DATE_OBS.search(ligne)
            date = dm.group(1) if dm else ""
            auteur = ""
            continue
        m = RE_OBS.match(ligne)
        if m:
            fermer()
            ident = m.group(1)
            if ident in ids_vus:
                ident = ident + "-bis"
            ids_vus.add(ident)
            courant = {
                "id": ident,
                "type": "orale",
                "auteur": auteur,
                "permanence": permanence,
                "date": date,
                "texte": "",
                "contexte": "",
                "_lignes": [m.group(2)],
            }
            continue
        m = RE_AUTEUR.match(ligne)
        if m and "[PERSONNE" in ligne[:60]:
            fermer()
            auteur = m.group(1)
            contexte = [ligne]
            continue
        if courant is not None:
            courant["_lignes"].append(ligne)
        else:
            contexte.append(ligne)
    fermer()
    return observations


def nouvelle_contribution(num, auteur):
    return {
        "id": "",
        "num": num,
        "type": "ecrite",
        "auteur": auteur,
        "date": "",
        "lieu": "",
        "objet": "",
        "texte": "",
        "pieces": "",
        "_lignes": [],
    }


def extraire_partie_ecrite(lignes, meta):
    contributions = []
    courant = None
    mode_texte = False
    precedente = ""

    def fermer():
        nonlocal courant, mode_texte
        if courant is not None:
            courant["texte"] = paragraphe(courant["_lignes"])
            del courant["_lignes"]
            contributions.append(courant)
        courant = None
        mode_texte = False

    for ligne in lignes:
        ligne_avant = precedente
        if ligne.strip():
            precedente = ligne
        m = RE_HEADER_E.match(ligne)
        if m:
            fermer()
            auteur = m.group(2).strip("*").strip() or "Non précisé"
            courant = nouvelle_contribution(int(m.group(1)), auteur)
            continue
        if courant is None:
            if RE_NB_AVIS.search(ligne):
                meta["nb_avis_declares"] = int(RE_NB_AVIS.search(ligne).group(1))
            continue
        if mode_texte:
            pm = RE_PIECES.match(ligne)
            if pm:
                courant["pieces"] = pm.group(1)
                mode_texte = False
            else:
                courant["_lignes"].append(ligne)
            continue
        dm = RE_DATE.match(ligne)
        if dm:
            if courant["date"]:
                fermer()
                auteur = ligne_avant.strip().strip("*").strip()
                if not auteur or any(
                    r.match(auteur) for r in (RE_DATE, RE_LIEU, RE_OBJET, RE_CONTRIB, RE_PIECES, RE_HEADER_E)
                ):
                    auteur = "Non précisé"
                courant = nouvelle_contribution(None, auteur)
            courant["date"] = dm.group(1)
            continue
        lm = RE_LIEU.match(ligne)
        if lm:
            courant["lieu"] = lm.group(1)
            continue
        om = RE_OBJET.match(ligne)
        if om:
            courant["objet"] = om.group(1)
            continue
        if RE_CONTRIB.match(ligne):
            mode_texte = True
            continue
    fermer()

    nums = [c["num"] for c in contributions if c["num"] is not None]
    if nums:
        manquants = sorted(set(range(1, max(nums) + 1)) - set(nums))
        for c in contributions:
            if c["num"] is None and manquants:
                c["num"] = manquants.pop(0)
    for c in contributions:
        c["id"] = "E" + str(c["num"]) if c["num"] is not None else "E-sans-numero"
        del c["num"]
    return contributions


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: extraction_observations.py <transcript.md> [sortie.js]")
    source = Path(sys.argv[1])
    sortie = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent / "registre" / "observations.js"

    lignes = nettoyer(source.read_text(encoding="utf-8").splitlines())

    coupe = next((i for i, l in enumerate(lignes) if RE_SPLIT.match(l)), len(lignes))
    partie_orale = extraire_partie_orale(lignes[:coupe])
    meta = {
        "projet": "Projet agrivoltaïque du Pas de Mirepoix (Saint-Julien-de-Briola)",
        "periode": "12/11/2024 - 11/12/2024",
        "export": "16/12/2024",
        "source": "Export anonymisé du registre d'enquête publique (fourni localement)",
    }
    contributions = extraire_partie_ecrite(lignes[coupe:], meta)

    donnees = {"meta": meta, "observations": partie_orale, "contributions": contributions}

    sortie.parent.mkdir(parents=True, exist_ok=True)
    json_brut = json.dumps(donnees, ensure_ascii=False, indent=1).replace("</", "<\\/")
    sortie.write_text(
        '"use strict";\nconst OBSERVATIONS_REGISTRE = ' + json_brut + ";\n"
        'if (typeof module !== "undefined" && module.exports) { module.exports = OBSERVATIONS_REGISTRE; }\n',
        encoding="utf-8",
    )

    vides_o = [o["id"] for o in partie_orale if not o["texte"]]
    vides_e = [c["id"] for c in contributions if not c["texte"]]
    print(f"observations orales : {len(partie_orale)} (textes vides: {vides_o})")
    print(f"contributions écrites : {len(contributions)} (textes vides: {vides_e})")
    print(f"total : {len(partie_orale) + len(contributions)}")
    print(f"fichier écrit : {sortie} ({sortie.stat().st_size} octets)")


if __name__ == "__main__":
    main()
