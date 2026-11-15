"use strict";
/* Tests unitaires de la logique du kit (sans réseau). Usage : node --test tests/ */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const F = require("../js/formats.js");
const A = require("../js/anonymisation.js");
const C = require("../js/chiffrement.js");
const M = require("../js/markdown.js");
const L = require("../app.js");
const VERSION = require("../js/version.js");

/* ------------------------------ Formats ------------------------------ */
test("CSV : BOM UTF-8, séparateur ;, échappement des guillemets, ; et retours à la ligne", () => {
  const csv = F.versCSV([{ cle: "a", titre: "Réf." }, { cle: "b", titre: "Texte" }], [{ a: "O1", b: 'Il a dit "non" ; puis\nrevenu' }]);
  assert.ok(csv.startsWith("﻿"));
  assert.ok(csv.includes('"Il a dit ""non"" ; puis\nrevenu"'));
  const relu = F.lireCSV(csv);
  assert.strictEqual(relu.separateur, ";");
  assert.strictEqual(relu.lignes[0].Texte, 'Il a dit "non" ; puis\nrevenu');
});

test("CSV : lecture avec virgule et détection des colonnes françaises", () => {
  const obs = F.importerObservations("x.csv", "N°,Date de dépôt,Nom,Sujet,Observation\n1,01/12/2024,A B,Objet,\"Texte, avec virgule\"\n");
  assert.strictEqual(obs.length, 1);
  assert.deepStrictEqual([obs[0].reference, obs[0].date, obs[0].auteur, obs[0].objet, obs[0].texte], ["1", "01/12/2024", "A B", "Objet", "Texte, avec virgule"]);
});

test("Import : jeu fictif, JSON et TXT", () => {
  const csv = fs.readFileSync(path.join(__dirname, "../exemples/observations-fictives.csv"), "utf8");
  const obs = F.importerObservations("f.csv", csv);
  assert.strictEqual(obs.length, 6);
  assert.strictEqual(obs[0].reference, "FIC-001");
  const json = F.importerObservations("f.json", JSON.stringify({ observations: [{ id: "X1", texte: "a" }, { id: "X1", texte: "b" }] }));
  assert.deepStrictEqual(json.map((o) => o.reference), ["X1", "X1-bis"]);
  const txt = F.importerObservations("f.txt", "Référence : T1\nPremier texte.\n\nSecond texte sans référence.");
  assert.deepStrictEqual(txt.map((o) => o.reference), ["T1", "OBS-002"]);
});

/** Lit une archive ZIP « stockée » (et vérifie les CRC). */
function lireZip(octets) {
  const b = Buffer.from(octets);
  const fichiers = {};
  let p = 0;
  while (b.readUInt32LE(p) === 0x04034b50) {
    const crc = b.readUInt32LE(p + 14);
    const taille = b.readUInt32LE(p + 18);
    const lnom = b.readUInt16LE(p + 26);
    const nom = b.slice(p + 30, p + 30 + lnom).toString("utf8");
    const donnees = b.slice(p + 30 + lnom, p + 30 + lnom + taille);
    assert.strictEqual(zlib.crc32 ? zlib.crc32(donnees) : F.crc32(donnees), crc, "CRC " + nom);
    fichiers[nom] = donnees.toString("utf8");
    p += 30 + lnom + taille;
  }
  assert.strictEqual(b.readUInt32LE(b.length - 22), 0x06054b50, "fin de répertoire central");
  return fichiers;
}

test("XLSX : archive valide, XML bien formé, texte échappé", () => {
  const x = F.versXLSX([{ cle: "reference", titre: "Réf." }, { cle: "texte", titre: "Texte" }], [{ reference: "O1", texte: "a < b & c > d \"e\"" }], "Contributions");
  const f = lireZip(x);
  assert.ok(f["[Content_Types].xml"] && f["xl/workbook.xml"] && f["xl/worksheets/sheet1.xml"] && f["xl/styles.xml"]);
  assert.ok(f["xl/worksheets/sheet1.xml"].includes("a &lt; b &amp; c &gt; d &quot;e&quot;"));
  assert.ok(f["xl/worksheets/sheet1.xml"].includes('<c r="B2" t="inlineStr"'));
});

test("TXT : fichier unique numéroté et ZIP un fichier par contribution", () => {
  const col = [{ cle: "reference", titre: "Référence" }, { cle: "date", titre: "Date" }, { cle: "texte", titre: "Texte" }];
  const lignes = [{ reference: "O1", date: "d1", texte: "t1" }, { reference: "O/2", date: "d2", texte: "t2" }];
  const unique = F.versTXTUnique(col, lignes, "Titre");
  assert.ok(unique.includes("1. O1") && unique.includes("2. O/2"));
  const z = lireZip(F.versTXTMultiples(col, lignes));
  assert.deepStrictEqual(Object.keys(z), ["001_O1.txt", "002_O_2.txt"]);
});

test("JSON : structure d’export", () => {
  const j = JSON.parse(F.versJSON([{ cle: "reference", titre: "R" }], [{ reference: "O1", autre: "x" }], { source: "s" }));
  assert.strictEqual(j.contributions[0].reference, "O1");
  assert.strictEqual(j.contributions[0].autre, undefined);
  assert.strictEqual(j.source, "s");
});

/* ------------------------------ Anonymisation ------------------------------ */
test("Détection par règles : courriel, téléphones, adresse, parcelle, date, âge, NIR", () => {
  const t =
    "Écrire à jean.dupont@example.org ou au 01 99 00 12 34 / +33 6 39 98 45 67. J’habite 14 chemin des Aulnes, 11999 Saint-Exemple-sur-Aude, près de la parcelle ZB 117. " +
    "Le 3 octobre 2024 ; né le 12/05/1950 ; âgée de 72 ans ; NIR 1 85 05 78 006 084 36.";
  const types = A.detecterParRegles(t).map((e) => e.type);
  for (const attendu of ["COURRIEL", "TELEPHONE", "ADRESSE", "PARCELLE", "DATE", "AGE", "IDENTIFIANT"]) assert.ok(types.includes(attendu), attendu);
  assert.ok(A.contientIdentifiantsDirects("Contact : 06 39 98 45 67").length);
  assert.strictEqual(A.contientIdentifiantsDirects("Le paysage sera défiguré par les panneaux.").length, 0);
});

test("Validation des entités du modèle : rejette inventions, balises et pronoms", () => {
  const e = A.validerEntitesModele(
    { entites: [{ type: "NOM", valeur: "Durand" }, { type: "PERSONNE", valeur: "Inventé" }, { type: "PERSONNE", valeur: "[PERSONNE]" }, { type: "PERSONNE", valeur: "Je" }, { type: "XYZ", valeur: "lieu-dit" }] },
    "Je suis Durand, au lieu-dit, et [PERSONNE] aussi."
  );
  assert.deepStrictEqual(e.map((x) => x.valeur + ":" + x.type), ["Durand:PERSONNE", "lieu-dit:AUTRE"]);
});

test("Pseudonymes stables et rapprochement des variantes de noms", () => {
  const t = new A.Correspondance();
  const p1 = t.obtenir("PERSONNE", "M. Ferrand");
  assert.strictEqual(t.obtenir("PERSONNE", "Paul Ferrand"), p1);
  assert.notStrictEqual(t.obtenir("PERSONNE", "Camille Delorme"), t.obtenir("PERSONNE", "Marc Delorme"));
  assert.strictEqual(t.obtenir("COURRIEL", "a@example.org"), t.obtenir("COURRIEL", "A@example.org"));
  const reprise = new A.Correspondance(JSON.parse(JSON.stringify(t.toJSON())));
  assert.strictEqual(reprise.obtenir("PERSONNE", "Paul Ferrand"), p1);
  assert.strictEqual(A.reidentifier("Signé " + p1, t.toJSON()), "Signé M. Ferrand");
});

test("Généralisations : dates, âges", () => {
  assert.strictEqual(A.generaliserDate("12/05/2024"), "mai 2024");
  assert.strictEqual(A.generaliserDate("le 3 octobre 2024"), "courant octobre 2024");
  assert.strictEqual(A.generaliserDate("hier"), "[DATE]");
  assert.strictEqual(A.generaliserAge("âgés de 72 ans"), "âgés de [70-79 ANS]");
  assert.strictEqual(A.generaliserAge("j'ai 15 ans"), "j'ai [MINEUR]");
});

test("Application : remplacements, balises existantes protégées, mode pseudo conserve les quasi-identifiants", () => {
  const entites = [
    { type: "PERSONNE", valeur: "Jean Dupont", categorie: "direct", source: "test" },
    { type: "FONCTION", valeur: "adjoint au maire", categorie: "quasi", source: "test" }
  ];
  const texte = "Jean Dupont, adjoint au maire, et [PERSONNE]. JEAN  DUPONT confirme.";
  const pseudo = A.appliquer(texte, entites, "pseudonymisation", new A.Correspondance());
  assert.strictEqual(pseudo.texte, "[PSEUDO-01], adjoint au maire, et [PERSONNE]. [PSEUDO-01] confirme.");
  const anon = A.appliquer(texte, entites, "anonymisation", new A.Correspondance());
  assert.strictEqual(anon.texte, "[PERSONNE], [FONCTION], et [PERSONNE]. [PERSONNE] confirme.");
});

test("Pipeline complet avec un faux modèle : 3 étapes, rapport sans valeur personnelle", async () => {
  const appels = [];
  const fauxModele = async (messages) => {
    appels.push(messages[0].content.slice(0, 30));
    if (/contrôleur qualité/.test(messages[0].content)) return { residus: [{ valeur: "Crozes", type: "LIEU", raison: "lieu-dit" }] };
    return { entites: [{ type: "PERSONNE", valeur: "Paul Ferrand", categorie: "direct" }, { type: "FONCTION", valeur: "adjoint au maire", categorie: "quasi" }] };
  };
  const obs = { reference: "T1", auteur: "Paul Ferrand", date: "13/11/2024", objet: "", texte: "Je suis Paul Ferrand, adjoint au maire, éleveur aux Crozes. Tél. 01 99 00 11 22." };
  const r = await A.traiterObservation(obs, { mode: "anonymisation", appelModele: fauxModele, table: new A.Correspondance() });
  assert.strictEqual(appels.length, 2);
  assert.strictEqual(r.texte, "Je suis [PERSONNE], [FONCTION], éleveur aux Crozes. Tél. [TÉLÉPHONE].");
  assert.strictEqual(r.auteur, "[PERSONNE]");
  assert.strictEqual(r.date, "novembre 2024");
  assert.strictEqual(r.statut, "a_verifier");
  assert.strictEqual(r.residus[0].valeur, "Crozes");
  A.masquerTerme(r, "Crozes", "LIEU", new A.Correspondance());
  assert.ok(r.texte.includes("aux [LIEU]"));
  assert.strictEqual(r.statut, "traitee");
  const rap = A.rapport([r], { mode: "anonymisation", nbImportees: 1 });
  const texteRapport = JSON.stringify(rap);
  for (const interdit of ["Ferrand", "Crozes", "01 99"]) assert.ok(!texteRapport.includes(interdit), interdit);
  assert.strictEqual(rap.entitesRemplacees, 4);
});

test("Pseudonymisation : quasi-identifiants conservés et comptés, auteur pseudonymisé", async () => {
  const faux = async (m) => (/contrôleur/.test(m[0].content) ? { residus: [] } : { entites: [{ type: "FONCTION", valeur: "infirmière", categorie: "quasi" }] });
  const r = await A.traiterObservation({ reference: "T2", auteur: "Lucie Martin", texte: "Lucie Martin, infirmière." }, { mode: "pseudonymisation", appelModele: faux, table: new A.Correspondance() });
  assert.strictEqual(r.texte, "[PSEUDO-01], infirmière.");
  assert.strictEqual(r.auteur, "[PSEUDO-01]");
  assert.strictEqual(r.nbQuasiConserves, 1);
  assert.strictEqual(r.statut, "traitee");
});

/* ------------------------------ Chiffrement ------------------------------ */
test("Chiffrement du tableau de correspondance : aller-retour, mauvaise phrase, phrase trop courte", async () => {
  const donnees = { compteur: 1, entrees: { "[PSEUDO-01]": { type: "PERSONNE", valeurs: ["Jeanne Martinet"] } } };
  const env = await C.chiffrer(donnees, "une phrase de passe solide");
  assert.ok(!JSON.stringify(env).includes("Martinet"));
  assert.strictEqual(env.iterations, 600000);
  assert.deepStrictEqual(await C.dechiffrer(env, "une phrase de passe solide"), donnees);
  await assert.rejects(C.dechiffrer(env, "mauvaise phrase de passe"), /incorrecte/);
  await assert.rejects(C.chiffrer(donnees, "court"), /12 caractères/);
});

/* ------------------------------ Markdown ------------------------------ */
test("Markdown : structure et absence d’interprétation HTML", () => {
  const blocs = M.analyser("# Titre\n\nTexte **gras** et [lien](https://ollama.com).\n\n- a\n- b\n\n| x | y |\n|---|---|\n| 1 | 2 |\n\n<script>alert(1)</script>");
  assert.deepStrictEqual(blocs.map((b) => b.type), ["titre", "paragraphe", "liste", "tableau", "paragraphe"]);
  assert.strictEqual(blocs[4].texte, "<script>alert(1)</script>"); // rendu en texte (textContent), jamais en HTML
  const seg = M.segments("voir [ici](javascript:alert(1)) et `code`");
  assert.ok(seg.some((s) => s.t === "lien" && s.href.startsWith("javascript")));
});

/* ------------------------------ Analyse (logique existante) ------------------------------ */
test("Analyse : lot pour abonnement et texte à coller", () => {
  const m = L.construireMessagesAnalyseLot([{ reference: "O1", texte: "t1" }, { reference: "O2", texte: "t2" }]);
  assert.match(m[0].content, /CHACUNE/);
  assert.match(m[0].content, /"analyses"/);
  assert.match(m[1].content, /### Référence : O2/);
  const t = L.texteAbonnement(m);
  assert.ok(t.startsWith("CONSIGNES") && t.includes("DONNÉES (déjà anonymisées)"));
  assert.deepStrictEqual(L.extraireJSON('Voici :\n```json\n{"analyses":[{"reference":"O1"}]}\n```'), { analyses: [{ reference: "O1" }] });
});

test("Analyse : normalisation tolérante (gras Markdown, objets, positions)", () => {
  const a = L.normaliserAnalyse({ position: "plutôt contre", synthese: { a: "Texte **important**." }, themes: "a; b" }, "O1");
  assert.strictEqual(a.position, "défavorable");
  assert.strictEqual(a.synthese, "Texte important.");
  assert.deepStrictEqual(a.themes, ["a", "b"]);
});

/* ------------------------------ Cohérence ------------------------------ */
test("Version cohérente : VERSION, js/version.js, CHANGELOG.md", () => {
  const v = fs.readFileSync(path.join(__dirname, "../VERSION"), "utf8").trim();
  assert.strictEqual(VERSION.numero, v);
  assert.match(fs.readFileSync(path.join(__dirname, "../CHANGELOG.md"), "utf8"), new RegExp("## " + v.replace(/\./g, "\\.") + " "));
});

test("Registre de démonstration : 204 entrées, aucun courriel ni téléphone en clair", () => {
  const R = require("../registre/observations.js");
  const tout = JSON.stringify(R);
  assert.strictEqual(R.observations.length + R.contributions.length, 204);
  assert.strictEqual((tout.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).length, 0);
  assert.strictEqual(A.detecterParRegles(tout).filter((e) => e.type === "TELEPHONE" || e.type === "COURRIEL").length, 0);
});
