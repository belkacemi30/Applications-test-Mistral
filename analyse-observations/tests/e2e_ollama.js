"use strict";
/*
 * Test de bout en bout du pipeline d'anonymisation avec un VRAI modèle local (Ollama).
 * Usage : node tests/e2e_ollama.js [modele] [pseudonymisation|anonymisation]
 * Données : exemples/observations-fictives.csv (entièrement fictives).
 * Vérifie qu'aucun identifiant direct connu du jeu fictif ne subsiste après traitement.
 */
const fs = require("fs");
const path = require("path");
const A = require("../js/anonymisation.js");
const F = require("../js/formats.js");

const MODELE = process.argv[2] || "ministral-3:latest";
const MODES = process.argv[3] ? [process.argv[3]] : ["pseudonymisation", "anonymisation"];
const OLLAMA = process.env.OLLAMA_URL || "http://localhost:11434";

async function appelModele(messages, options) {
  for (const reglage of [{ temperature: 0.1, repeat_penalty: 1.1 }, { temperature: 0.4, repeat_penalty: 1.2 }]) {
    const r = await fetch(OLLAMA + "/api/chat", {
      method: "POST",
      body: JSON.stringify({ model: MODELE, messages, stream: false, format: "json", think: false, keep_alive: "15m",
        options: Object.assign({ num_ctx: 8192, num_predict: (options && options.maxTokens) || 1500, repeat_last_n: 256 }, reglage) })
    });
    const j = await r.json();
    if (!r.ok) { if (/repeat/i.test(j.error || "")) continue; throw new Error(j.error); }
    try { return JSON.parse(j.message.content); } catch (e) { /* nouvel essai */ }
  }
  throw new Error("réponse illisible");
}

// Identifiants directs du jeu fictif qui DOIVENT disparaître dans les deux modes.
const DIRECTS = ["Jeanne Martinet", "Martinet", "jeanne.martinet@example.org", "01 99 00 12 34", "14 chemin des Aulnes", "Paul Ferrand", "Ferrand",
  "Lucie", "Marc Delorme", "Camille Delorme", "Delorme", "06 39 98 45 67", "Thierry Vasseur", "Vasseur"];
// Quasi-identifiants qui doivent disparaître en anonymisation.
const QUASI = ["ZB 117", "ZB 118", "adjoint au maire", "Les Crozes", "3 octobre 2024", "12/05/2024", "insuffisance respiratoire", "72 ans", "infirmière", "GAEC du Grand Pré"];

(async () => {
  const obs = F.importerObservations("f.csv", fs.readFileSync(path.join(__dirname, "../exemples/observations-fictives.csv"), "utf8"));
  let echecs = 0;
  for (const mode of MODES) {
    const table = new A.Correspondance();
    const resultats = [];
    const t0 = Date.now();
    for (const o of obs) {
      const r = await A.traiterObservation(o, { mode, appelModele, table });
      resultats.push(r);
      const sortie = [r.auteur, r.objet, r.texte].join(" ");
      const fuitesDirectes = DIRECTS.filter((v) => sortie.toLowerCase().includes(v.toLowerCase()));
      const fuitesQuasi = mode === "anonymisation" ? QUASI.filter((v) => sortie.toLowerCase().includes(v.toLowerCase())) : [];
      const signalees = new Set(r.residus.map((x) => A.normaliser(x.valeur)));
      const nonSignalees = fuitesDirectes.concat(fuitesQuasi).filter((v) => ![...signalees].some((s) => s.includes(A.normaliser(v)) || A.normaliser(v).includes(s)));
      console.log(`\n[${mode}] ${r.reference} ${(r.dureeMs / 1000).toFixed(0)} s — statut ${r.statut} — ${JSON.stringify(r.compteurs)}`);
      console.log("  →", (r.auteur ? "(" + r.auteur + ") " : "") + r.texte);
      if (r.residus.length) console.log("  résidus signalés :", r.residus.map((x) => x.valeur + " [" + x.type + "]").join(" | "));
      if (fuitesDirectes.length) console.log("  identifiants directs restants :", fuitesDirectes.join(", "));
      if (fuitesQuasi.length) console.log("  quasi-identifiants restants :", fuitesQuasi.join(", "));
      if (nonSignalees.length) { echecs++; console.log("  ✗ FUITE NON SIGNALÉE :", nonSignalees.join(", ")); }
    }
    const rap = A.rapport(resultats, { mode, modele: MODELE, nbImportees: obs.length });
    console.log(`\n== ${mode} : ${((Date.now() - t0) / 1000).toFixed(0)} s, ${rap.entitesRemplacees} remplacements, à vérifier : ${rap.aVerifier}`);
    if (mode === "pseudonymisation") console.log("   pseudonymes :", Object.entries(table.entrees).map(([p, e]) => p + "=" + e.type).join(" "));
  }
  console.log(echecs ? `\n✗ ${echecs} observation(s) avec fuite non signalée` : "\n✓ Aucune fuite non signalée");
  process.exit(echecs ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
