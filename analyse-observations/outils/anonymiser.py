#!/usr/bin/env python3
"""Anonymisation STRICTE et IRRÉVERSIBLE d'un export d'observations.

Règles (aucune donnée ajoutée, uniquement des balises neutres) :
- toute personne -> [PERSONNE] (même balise pour tous : aucun recoupement possible) ;
- noms -> [NOM], prénoms -> [PRENOM] ; civilités (Mme/Monsieur/M.) supprimées ;
- fonctions identifiantes (maire de…, adjoint au maire, secrétaire de mairie) -> [FONCTION] ;
- groupes/associations -> [COLLECTIF], sociétés -> [SOCIÉTÉ] ;
- adresses/lieux-dits -> [ADRESSE], courriels -> [EMAIL], téléphones -> [TÉLÉPHONE] ;
- emails/téléphones résiduels masqués par motifs.

Aucune table de correspondance n'est conservée : le retour arrière est impossible.

Usage :
    python3 outils/anonymiser.py <entree.js|json> <sortie.js|json> [--rapport RAPPORT.md]
"""
import json
import re
import sys
from pathlib import Path

RE_TOKEN_PERSONNE = re.compile(r"\[PERSONNE[^\]]*\]")
RE_CIVILITE_PRENOM = re.compile(r"(?i)\b(?:Mme|Madame|Monsieur|Mr|M)\.\s+\[PERSONNE\]\s+([A-ZÀ-Þ][A-Za-zÀ-Þ-]{2,})")
# Civilités. ATTENTION : « M » seul n'est une civilité que s'il est en MAJUSCULE et suivi
# d'un point (« M. ») ou d'un espace puis d'une majuscule/balise (« M [PERSONNE] »).
# L'ancienne version (insensible à la casse, « M » sans point) supprimait le « m »
# initial de TOUS les mots (« mais » -> « ais », « maire » -> « aire »…).
RE_CIVILITE = re.compile(
    r"(?:\b(?i:madame|mesdames|monsieur|messieurs|mademoiselle)\b"
    r"|\b(?:Mmes|Mme|Mlle|MM|Mr)\b\.?"
    r"|\bM\.(?=\s)"
    r"|\bM\b(?=\s+[\[A-ZÀ-Þ]))[\s,;:!?]*"
)
# Mots tronqués typiques d'une suppression abusive du « m » initial (contrôle de non-régression).
TRONCATURES_M = ("ais", "oins", "ieux", "ettre", "ême", "aisons", "esures", "onde")
RE_APRES_PERSONNE = re.compile(r"(\[PERSONNE\])\s+([A-ZÀ-Þ][A-Za-zÀ-Þ-]{2,})")
RE_FONCTION = re.compile(
    r"(?i)\b(?:le\s+)?maire de [A-ZÀ-Þ][A-Za-zÀ-Þ-]+(?:\s+de\s+[A-ZÀ-Þ][A-Za-zÀ-Þ-]+)*"
    r"|adjoint au maire|secrétaire de mairie|chef de projet|directeur exécutif"
)
RE_LIEU_DIT = re.compile(r"\[LIEU-DIT\]", re.IGNORECASE)
RE_COURRIEL = re.compile(r"\[(?:ADRESSE\s+)?COURRIEL[^\]]*\]", re.IGNORECASE)
RE_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
RE_TEL = re.compile(r"(?:\+33|0)\s?[0-9](?:[ .-]?[0-9]{2}){4}")

STOPLIST_APRES_PERSONNE = {"Le", "La", "L", "Chef", "Commissaire", "Habitant", "Habitante", "Dépose", "Est", "Et", "Son", "Sa", "Ses", "A", "Au", "En", "Sur", "Dans", "Qui", "Que"}

NOMS = ["Evelyne", "Quentin", "SEYER", "MOLINS", "Simone", "VEILLE", "Christian",
        "Proglio", "Gallois", "Barnier", "Merlin", "Rousseau", "Moréno", "Machenaud", "Accoyer", "Henri", "Louis", "Michel", "Bernard", "André", "Xavier"]
NOMS_SUBSTR = ["LUCATOM"]

COLLECTIFS = [
    "Collectif Citoyen Occitanie Aude",
    "FEDERATION DES PAYS D'AUDE",
    "Fédération des Pays d'Aude",
    "Nature Comminges",
    "La Maison du Rollier",
    "QUELS PAYSAGES POUR LA PIEGE",
    "ASA de Caux et Saulzens",
]
SOCIETES = ["SASU Centrale Solaire Pas de Mirepoix", "Centrale Solaire Pas de Mirepoix"]
RE_SOCIETE_GENERIQUE = re.compile(r"(?i)\bSASU\b[^.\n]{0,60}")

STATS = {"personnes": 0, "noms": 0, "collectifs": 0, "societes": 0, "fonctions": 0, "emails": 0, "tels": 0, "adresses": 0}


def anonymiser_texte(texte):
    texte, n = RE_TOKEN_PERSONNE.subn("[PERSONNE]", texte)
    STATS["personnes"] += n
    for nom in NOMS:
        texte, k = re.subn(r"\b" + re.escape(nom) + r"\b", "[NOM]", texte, flags=re.IGNORECASE)
        STATS["noms"] += k
    for nom in NOMS_SUBSTR:
        texte, k = re.subn(re.escape(nom), "[NOM]", texte)
        STATS["noms"] += k
    texte, k = RE_CIVILITE_PRENOM.subn(r"[PERSONNE] [PRENOM]", texte)
    STATS["noms"] += k
    texte = RE_CIVILITE.sub("", texte)
    texte, k = RE_FONCTION.subn("[FONCTION]", texte)
    STATS["fonctions"] += k

    def apres_personne(m):
        if m.group(2) in STOPLIST_APRES_PERSONNE:
            return m.group(0)
        STATS["noms"] += 1
        return m.group(1) + " [NOM]"

    texte = RE_APRES_PERSONNE.sub(apres_personne, texte)
    for org in COLLECTIFS:
        texte, k = re.subn(re.escape(org), "[COLLECTIF]", texte, flags=re.IGNORECASE)
        STATS["collectifs"] += k
    for soc in SOCIETES:
        texte, k = re.subn(re.escape(soc), "[SOCIÉTÉ]", texte, flags=re.IGNORECASE)
        STATS["societes"] += k
    texte, k = RE_SOCIETE_GENERIQUE.subn("[SOCIÉTÉ]", texte)
    STATS["societes"] += k
    texte, k = RE_LIEU_DIT.subn("[ADRESSE]", texte)
    STATS["adresses"] += k
    texte, k = RE_COURRIEL.subn("[EMAIL]", texte)
    STATS["emails"] += k
    texte, k = RE_EMAIL.subn("[EMAIL]", texte)
    STATS["emails"] += k
    texte, k = RE_TEL.subn("[TÉLÉPHONE]", texte)
    STATS["tels"] += k
    return texte


def anonymiser_auteur(auteur):
    if re.search(r"(?i)collectif|association|fédération|federation", auteur):
        return "[COLLECTIF]"
    if re.search(r"(?i)sasu|société|societe|entreprise", auteur):
        return "[SOCIÉTÉ]"
    return anonymiser_texte(auteur)


def anonymiser_donnees(donnees):
    for section in ("observations", "contributions"):
        for entree in donnees.get(section, []):
            entree["auteur"] = anonymiser_auteur(entree.get("auteur", ""))
            for champ in ("texte", "contexte", "objet", "lieu", "pieces", "permanence"):
                if entree.get(champ):
                    entree[champ] = anonymiser_texte(entree[champ])
    return donnees


def charger_entree(chemin):
    brut = Path(chemin).read_text(encoding="utf-8")
    if chemin.endswith(".json"):
        return json.loads(brut)
    m = re.search(r"const OBSERVATIONS_REGISTRE = (\{.*\});", brut, re.DOTALL)
    if not m:
        sys.exit("format non reconnu (attendu .json ou .js avec OBSERVATIONS_REGISTRE)")
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
    for m in re.finditer(r"\[PERSONNE[^\]]*\]", tout):
        if m.group(0) != "[PERSONNE]":
            problemes.append("jeton personne non strict: " + m.group(0))
    for nom in NOMS:
        if re.search(r"\b" + re.escape(nom) + r"\b", tout, flags=re.IGNORECASE):
            problemes.append("nom restant: " + nom)
    for nom in NOMS_SUBSTR:
        if nom in tout:
            problemes.append("nom restant: " + nom)
    for org in COLLECTIFS + SOCIETES:
        if org.lower() in tout.lower():
            problemes.append("groupe/société restant: " + org)
    if re.search(r"(?i)\bSASU\b", tout):
        problemes.append("société (SASU) restante")
    if re.search(r"(?i)\b(?:Mme|Madame|Monsieur|Mr)\b|\bM\.(?=\s)", tout):
        problemes.append("civilité restante")
    tronques = [mot for mot in TRONCATURES_M if re.search(r"(?<![\w'])" + mot + r"\b", tout)]
    if len(tronques) >= 3:
        problemes.append("texte altéré (m initial supprimé ?) : " + ", ".join(tronques))
    if re.search(r"(?i)\[lieu-dit\]|\[courriel", tout):
        problemes.append("placeholder adresse/courriel non normalisé")
    if RE_EMAIL.search(tout):
        problemes.append("email restant")
    if RE_TEL.search(tout):
        problemes.append("téléphone restant")
    for m in re.finditer(r"\[PERSONNE\]\s+([A-ZÀ-Þ][A-Za-zÀ-Þ-]{2,})", tout):
        if m.group(1) not in STOPLIST_APRES_PERSONNE:
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
    donnees = anonymiser_donnees(donnees)
    ecrire_sortie(donnees, sortie, format_sortie)

    problemes, residus = verifier(donnees)
    n = len(donnees.get("observations", [])) + len(donnees.get("contributions", []))
    lignes = [
        "# Rapport d’anonymisation STRICTE (irréversible)",
        "",
        f"- Fichier traité : `{entree}` -> `{sortie}`",
        f"- Entrées traitées : {n}",
        "- Règles appliquées : uniquement des balises neutres, aucune donnée ajoutée :",
        "  - toute personne -> `[PERSONNE]` (balise unique, aucun recoupement possible) ;",
        "  - noms -> `[NOM]`, prénoms -> `[PRENOM]`, civilités supprimées ;",
        "  - fonctions identifiantes -> `[FONCTION]` ;",
        "  - groupes/associations -> `[COLLECTIF]`, sociétés -> `[SOCIÉTÉ]` ;",
        "  - adresses/lieux-dits -> `[ADRESSE]`, courriels -> `[EMAIL]`, téléphones -> `[TÉLÉPHONE]`.",
        f"- Compteurs : personnes {STATS['personnes']}, noms/prénoms {STATS['noms']}, fonctions {STATS['fonctions']},",
        f"  collectifs {STATS['collectifs']}, sociétés {STATS['societes']}, adresses {STATS['adresses']}, emails {STATS['emails']}, téléphones {STATS['tels']}",
        f"- Vérification automatique : {'OK, aucune fuite détectée' if not problemes else 'PROBLÈMES: ' + '; '.join(problemes)}",
    ]
    if residus:
        lignes.append(f"- Mots capitalisés après `[PERSONNE]` (à revue manuelle) : {', '.join(residus[:25])}")
    lignes += [
        "",
        "Aucune table de correspondance n’est écrite : le retour à l’identité est impossible après exécution.",
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
