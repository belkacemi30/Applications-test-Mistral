"use strict";

/*
 * Petit serveur local pour le prototype « Analyse des observations ».
 *
 * - Sert les fichiers statiques du dossier parent (l’app) ;
 * - expose POST /api/analyse (et POST /api/synthese) qui appellent l’API Mistral (modèle mistral-small-latest)
 *   avec la clé MISTRAL_API_KEY lue UNIQUEMENT côté serveur (env ou fichier .env,
 *   jamais envoyée au navigateur) ;
 * - GET /api/etat indique si l’analyse IA est disponible.
 *
 * Lancement :  MISTRAL_API_KEY=... node serveur/server.js   puis http://localhost:3000
 * Variables optionnelles : PORT, MISTRAL_MODELE, MISTRAL_API_URL (tests).
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const logique = require("../app.js");

const PORT = Number(process.env.PORT || 3000);
const RACINE = path.join(__dirname, "..");
const MISTRAL_API_URL = process.env.MISTRAL_API_URL || "https://api.mistral.ai/v1/chat/completions";
const MODELE = process.env.MISTRAL_MODELE || logique.MODELE_DEFAUT;
const LIMITE_CORPS = 2000000;
const LIMITE_TEXTE = logique.LIMITE_TEXTE;

try {
  const env = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
  for (const ligne of env.split("\n")) {
    const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch (e) {
  /* pas de .env : la clé devra venir de l'environnement */
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function envoyerJSON(res, code, obj) {
  const corps = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(corps);
}

function servirStatique(req, res) {
  let chemin;
  try {
    chemin = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch (e) {
    return envoyerJSON(res, 400, { erreur: "URL invalide" });
  }
  if (chemin === "/") {
    chemin = "/index.html";
  }
  const fichier = path.normalize(path.join(RACINE, chemin));
  if (!fichier.startsWith(RACINE + path.sep) && fichier !== path.join(RACINE, "index.html")) {
    return envoyerJSON(res, 403, { erreur: "Accès interdit" });
  }
  fs.readFile(fichier, (err, contenu) => {
    if (err) {
      return envoyerJSON(res, 404, { erreur: "Introuvable" });
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(fichier)] || "application/octet-stream" });
    res.end(contenu);
  });
}

function lireCorps(req) {
  return new Promise((resolve, reject) => {
    let taille = 0;
    const morceaux = [];
    req.on("data", (c) => {
      taille += c.length;
      if (taille > LIMITE_CORPS) {
        reject(new Error("Corps trop volumineux"));
        req.destroy();
        return;
      }
      morceaux.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(morceaux).toString("utf8")));
    req.on("error", reject);
  });
}

async function appelerMistral(messages, maxTokens) {
  const cle = process.env.MISTRAL_API_KEY;
  if (!cle) {
    const e = new Error("MISTRAL_API_KEY non définie côté serveur");
    e.code = 401;
    throw e;
  }
  for (let tentative = 0; ; tentative++) {
    const appel = await fetch(MISTRAL_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + cle },
      body: JSON.stringify({
        model: MODELE,
        temperature: 0.2,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages
      })
    }).catch(() => null);
    if (!appel) {
      const e = new Error("API Mistral injoignable");
      e.code = 502;
      throw e;
    }
    if ((appel.status === 429 || appel.status >= 500) && tentative < 3) {
      await new Promise((r) => setTimeout(r, 1500 * Math.pow(2, tentative + 1)));
      continue;
    }
    if (!appel.ok) {
      const e = new Error("Erreur API Mistral : " + logique.messageErreurHTTP(appel.status));
      e.code = appel.status === 429 ? 429 : 502;
      throw e;
    }
    const data = await appel.json().catch(() => null);
    const contenu = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    try {
      return logique.extraireJSON(contenu);
    } catch (err) {
      const e = new Error("La réponse du modèle n’est pas un JSON valide");
      e.code = 502;
      throw e;
    }
  }
}

async function lireJSON(req, res) {
  let corps;
  try {
    corps = await lireCorps(req);
  } catch (e) {
    envoyerJSON(res, 413, { erreur: "Corps trop volumineux" });
    return null;
  }
  try {
    return JSON.parse(corps || "{}");
  } catch (e) {
    envoyerJSON(res, 400, { erreur: "JSON invalide" });
    return null;
  }
}

async function analyser(req, res) {
  const donnees = await lireJSON(req, res);
  if (!donnees) {
    return;
  }
  const texte = typeof donnees.texte === "string" ? donnees.texte : "";
  const reference = typeof donnees.reference === "string" ? donnees.reference.slice(0, 200) : "";
  if (texte.trim() === "" || texte.length > LIMITE_TEXTE) {
    return envoyerJSON(res, 400, { erreur: "Champ « texte » requis (20 000 caractères max)" });
  }
  try {
    const parse = await appelerMistral(logique.construireMessagesAnalyse(reference, texte), 1500);
    envoyerJSON(res, 200, logique.normaliserAnalyse(parse, reference));
  } catch (e) {
    envoyerJSON(res, e.code || 500, { erreur: e.message });
  }
}

async function synthetiser(req, res) {
  const donnees = await lireJSON(req, res);
  if (!donnees) {
    return;
  }
  const analyses = Array.isArray(donnees.analyses) ? donnees.analyses.slice(0, 500).map((a) => logique.normaliserAnalyse(a, a && a.reference)) : [];
  if (analyses.length === 0) {
    return envoyerJSON(res, 400, { erreur: "Champ « analyses » requis" });
  }
  try {
    const parse = await appelerMistral(logique.construireMessagesSynthese(analyses), 3000);
    envoyerJSON(res, 200, logique.normaliserSynthese(parse));
  } catch (e) {
    envoyerJSON(res, e.code || 500, { erreur: e.message });
  }
}

const serveur = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/api/etat") {
    return envoyerJSON(res, 200, { ia_disponible: Boolean(process.env.MISTRAL_API_KEY), modele: MODELE });
  }
  if (req.method === "POST" && req.url === "/api/analyse") {
    return analyser(req, res);
  }
  if (req.method === "POST" && req.url === "/api/synthese") {
    return synthetiser(req, res);
  }
  if (req.method === "GET") {
    return servirStatique(req, res);
  }
  envoyerJSON(res, 405, { erreur: "Méthode non autorisée" });
});

serveur.listen(PORT, "127.0.0.1", () => {
  console.log("Application : http://localhost:" + PORT + "/");
  console.log("Analyse IA : " + (process.env.MISTRAL_API_KEY ? "disponible (modèle " + MODELE + ")" : "NON configurée (définir MISTRAL_API_KEY)"));
});
