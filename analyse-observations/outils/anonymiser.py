#!/usr/bin/env python3
"""Anonymise de façon IRRÉVERSIBLE un export d'observations (JSON ou JS).

Principes :
- chaque identifiant-lettre [PERSONNE X] est remplacé par un jeton aléatoire
  (secrets.token_hex), généré à chaque exécution ; la table de correspondance
  n'est JAMAIS écrite ni conservée -> retour arrière impossible ;
- les noms/prénoms réels détectés à l'audit sont remplacés par [NOM] ;
- emails et téléphones éventuels sont masqués ;
- un rapport d'audit est généré à côté du fichier de sortie.

Usage :
    python3 outils/anonymiser.py <entree.js|entree.json> <sortie.js|sortie.json> [--rapport RAPPORT.md]
"""
import json
import re
import secrets
import sys
from pathlib import Path

RE_PERSONNE = re.compile(r"\[PERSONNE ([A-Z]+)\]")
RE_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
RE_TEL = re.compile(r"(?:\+33|0)\s?[0-9](?:[ .-]?[0-9]{2}){4}")
RE_NOM_APRES_CIVILITE = re.compile(r"\b(Mme|Monsieur|M\.)\s+([A-ZÀ-Þ][a-zà-ÿ-]{2,})")
RE_PLACEHOLDER_COURRIEL = re.compile(r"\[ADRESSE COURRIEL[^\]]*\]", re.IGNORECASE)
RE_APRES_TOKEN = re.compile(r"(\[PERSONNE-[0-9a-f]{8}\])\s+([A-ZÀ-Þ][A-Za-zÀ-Þ-]{2,})")
RE_RESIDU_APRES_TOKEN = re.compile(r"\[PERSONNE-[0-9a-f]{8}\]\s+([A-ZÀ-Þ][A-Za-zÀ-Þ-]{2,})")
STOPLIST_TITRES = {"Le", "La", "L", "Chef", "Commissaire", "Maire", "Président", "Directeur", "Secrétaire", "Trésorier", "Habitant", "Habitante", "Dépose", "Est", "Et", "Son", "Sa", "Ses", "Monsieur", "Mme"}

STOPLIST_CIVILITE = {"le", "la", "l", "je", "nous", "en", "un", "une", "votre", "notre", "tout", "tous", "ce", "cet", "cette"}

NOMS_A_BORDRES = ["Evelyne", "Quentin", "SEYER", "Simone", "VEILLE", "Christian", "MOLINS", "Proglio", "Gallois", "Barnier", "Merlin", "Rousseau", "Moréno", "Machenaud", "Accoyer"]
NOMS_SANS_BORDRES = ["LUCATOM"]

STATS = {"personnes": 0, "noms": 0, "emails": 0, "tels": 0, "placeholders": 0}


def anonymiser_texte(texte, table):
    def remplacer_personne(m):
        lettre = m.group(1)
        if lettre not in table:
            table[lettre] = secrets.token_hex(4)
            STATS["personnes"] += 1
        return "[PERSONNE-" + table[lettre] + "]"

    texte = RE_PERSONNE.sub(remplacer_personne, texte)
    texte, n = RE_PLACEHOLDER_COURRIEL.subn("[ADRESSE]", texte)
    STATS["placeholders"] += n
    for nom in NOMS_A_BORDRES:
        texte, k = re.subn(r"\b" + re.escape(nom) + r"\b", "[NOM]", texte)
        STATS["noms"] += k
    for nom in NOMS_SANS_BORDRES:
        texte, k = re.subn(re.escape(nom), "[NOM]", texte)
        STATS["noms"] += k

    def nom_civilite(m):
        mot = m.group(2)
        if mot.lower() in STOPLIST_CIVILITE:
            return m.group(0)
        STATS["noms"] += 1
        return m.group(1) + " [NOM]"

    texte = RE_NOM_APRES_CIVILITE.sub(nom_civilite, texte)

    def apres_token(m):
        mot = m.group(2)
        if mot in STOPLIST_TITRES:
            return m.group(0)
        STATS["noms"] += 1
        return m.group(1) + " [NOM]"

    texte = RE_APRES_TOKEN.sub(apres_token, texte)
    texte, n3 = RE_EMAIL.subn("[EMAIL]", texte)
    STATS["emails"] += n3
    texte, n4 = RE_TEL.subn("[TÉLÉPHONE]", texte)
    STATS["tels"] += n4
    return texte


def anonymiser_donnees(donnees):
    table = {}
    for section in ("observations", "contributions"):
        for entree in donnees.get(section, []):
            for champ in ("auteur", "texte", "contexte", "objet", "lieu", "pieces", "permanence"):
                if entree.get(champ):
                    entree[champ] = anonymiser_texte(entree[champ], table)
    return donnees, table


def charger_entree(chemin):
    brut = Path(chemin).read_text(encoding="utf-8")
    if chemin.endswith(".json"):
        return json.loads(brut)
    m = re.search(r"const OBSERVATIONS_REGISTRE = (\{.*\});", brut, re.DOTALL)
    if not m:
        sys.exit("format non reconnu (attendu: .json ou .js avec OBSERVATIONS_REGISTRE)")
    return json.loads(m.group(1))


def ecrire_sortie(donnees, chemin, format_sortie):
    if format_sortie == "json":
        Path(chemin).write_text(json.dumps(donnees, ensure_ascii=False, indent=1), encoding="utf-8")
    else:
        json_brut = json.dumps(donnees, ensure_ascii=False, indent=1).replace("</", "<\\/")
        Path(chemin).write_text(
            '"use strict";\nconst OBSERVATIONS_REGISTRE = ' + json_brut + ";\n"
            'if (typeof module !== "undefined" && module.exports) { module.exports = OBSERVATIONS_REGISTRE; }\n',
            encoding="utf-8",
        )


def verifier(donnees):
    problemes = []
    residus = []
    tout = json.dumps(donnees, ensure_ascii=False)
    if re.search(r"\[PERSONNE [A-Z]\]", tout):
        problemes.append("identifiant-lettre [PERSONNE X] restant")
    for nom in NOMS_A_BORDRES + NOMS_SANS_BORDRES:
        if nom in tout:
            problemes.append("nom connu restant: " + nom)
    if RE_EMAIL.search(tout):
        problemes.append("email restant")
    if RE_TEL.search(tout):
        problemes.append("téléphone restant")
    for m in RE_RESIDU_APRES_TOKEN.finditer(tout):
        residus.append(m.group(1))
    return problemes, sorted(set(residus))


def main():
    if len(sys.argv) < 3:
        sys.exit("usage: anonymiser.py <entree> <sortie> [--rapport RAPPORT.md]")
    entree, sortie = sys.argv[1], sys.argv[2]
    rapport = None
    if "--rapport" in sys.argv:
        rapport = sys.argv[sys.argv.index("--rapport") + 1]

    donnees = charger_entree(entree)
    format_sortie = "json" if sortie.endswith(".json") else "js"
    donnees, table = anonymiser_donnees(donnees)
    ecrire_sortie(donnees, sortie, format_sortie)

    problemes, residus = verifier(donnees)
    n = len(donnees.get("observations", [])) + len(donnees.get("contributions", []))
    lignes = [
        "# Rapport d’anonymisation",
        "",
        f"- Fichier traité : `{entree}` -> `{sortie}`",
        f"- Entrées traitées : {n}",
        f"- Identifiants-lettres remplacés par des jetons aléatoires : {STATS['personnes']}"
        " (table de correspondance générée en mémoire puis détruite : anonymisation irréversible)",
        f"- Noms/prénoms remplacés par [NOM] : {STATS['noms']}",
        f"- Emails masqués : {STATS['emails']} ; téléphones masqués : {STATS['tels']}",
        f"- Placeholders normalisés : {STATS['placeholders']}",
        f"- Vérification automatique : {'OK, aucune fuite connue détectée' if not problemes else 'PROBLÈMES: ' + '; '.join(problemes)}",
    ]
    if residus:
        lignes.append(f"- Mots capitalisés suivant un jeton personne (à revue manuelle) : {', '.join(residus[:20])}")
    lignes += [
        "",
        "Méthode : jetons `secrets.token_hex(4)` par identifiant-lettre, générés à chaque exécution ;",
        "aucune table de correspondance n'est écrite sur disque. Noms remplacés par [NOM],",
        "emails/téléphones masqués. Le retour à l'identité est impossible après exécution.",
    ]
    texte_rapport = "\n".join(lignes) + "\n"
    if rapport:
        Path(rapport).parent.mkdir(parents=True, exist_ok=True)
        Path(rapport).write_text(texte_rapport, encoding="utf-8")
    print(texte_rapport)
    if problemes:
        sys.exit(1)


if __name__ == "__main__":
    main()
