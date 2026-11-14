"use strict";

/*
 * Petit serveur local pour le prototype « Analyse des observations ».
 *
 * - Sert les fichiers statiques du dossier parent (l’app) ;
 * - expose POST /api/analyse qui appelle l’API Mistral (modèle mistral-small-latest)
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

const PORT = Number(process.env.PORT || 3000);
const RACINE = path.join(__dirname, "..");
const MISTRAL_API_URL = process.env.MISTRAL_API_URL || "https://api.mistral.ai/v1/chat/completions";
const MODELE = process.env.MISTRAL_MODELE || "mistral-small-latest";
const TITRE_ENQUETE = "Projet agrivoltaïque du Pas de Mirepoix — Saint-Julien-de-Briola (Aude)";
const LIMITE_CORPS = 120000;
const LIMITE_TEXTE = 20000;

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
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
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

const SYSTEME = [
  "Tu es l’assistant d’un commissaire enquêteur dans le cadre de l’enquête publique",
  "« " + TITRE_ENQUETE + " » (registre du 12/11/2024 au 11/12/2024).",
  "Analyse l’observation fournie (déjà anonymisée) et réponds UNIQUEMENT avec un objet JSON valide,",
  "sans aucun texte autour, contenant exactement ces champs :",
  '"reference" (string), "themes" (tableau de chaînes), "synthese" (string au ton neutre et factuel),',
  '"demandes" (tableau de chaînes : demandes explicites de l’auteur),',
  '"questions" (tableau de chaînes : questions à adresser au maître d’ouvrage),',
  '"points" (tableau de chaînes : points à vérifier dans le dossier).',
  "Aucun avis personnel, aucune recommandation : constats et questions uniquement."
].join(" ");

function nettoyerTableau(v) {
  if (!Array.isArray(v)) {
    return [];
  }
  return v.filter((x) => typeof x === "string" && x.trim() !== "").map((x) => x.trim());
}

async function analyser(req, res) {
  let corps;
  try {
    corps = await lireCorps(req);
  } catch (e) {
    return envoyerJSON(res, 413, { erreur: "Corps trop volumineux" });
  }
  let donnees;
  try {
    donnees = JSON.parse(corps || "{}");
  } catch (e) {
    return envoyerJSON(res, 400, { erreur: "JSON invalide" });
  }
  const texte = typeof donnees.texte === "string" ? donnees.texte : "";
  const reference = typeof donnees.reference === "string" ? donnees.reference.slice(0, 200) : "";
  if (texte.trim() === "" || texte.length > LIMITE_TEXTE) {
    return envoyerJSON(res, 400, { erreur: "Champ « texte » requis (20 000 caractères max)" });
  }
  const cle = process.env.MISTRAL_API_KEY;
  if (!cle) {
    return envoyerJSON(res, 401, { erreur: "MISTRAL_API_KEY non définie côté serveur" });
  }

  const appel = await fetch(MISTRAL_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + cle
    },
    body: JSON.stringify({
      model: MODELE,
      temperature: 0.2,
      max_tokens: 1500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEME },
        { role: "user", content: "Référence : " + (reference || "non précisée") + "\n\nTexte de l’observation :\n" + texte }
      ]
    })
  }).catch(() => null);

  if (!appel) {
    return envoyerJSON(res, 502, { erreur: "API Mistral injoignable" });
  }
  if (!appel.ok) {
    return envoyerJSON(res, 502, { erreur: "Erreur API Mistral (HTTP " + appel.status + ")" });
  }
  let data;
  try {
    data = await appel.json();
  } catch (e) {
    return envoyerJSON(res, 502, { erreur: "Réponse API illisible" });
  }
  const contenu = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  let parse;
  try {
    parse = JSON.parse(contenu);
  } catch (e) {
    return envoyerJSON(res, 502, { erreur: "La réponse du modèle n’est pas un JSON valide" });
  }
  envoyerJSON(res, 200, {
    reference: reference || (typeof parse.reference === "string" ? parse.reference : ""),
    themes: nettoyerTableau(parse.themes),
    synthese: typeof parse.synthese === "string" ? parse.synthese : "",
    demandes: nettoyerTableau(parse.demandes),
    questions: nettoyerTableau(parse.questions),
    points: nettoyerTableau(parse.points)
  });
}

const serveur = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/api/etat") {
    return envoyerJSON(res, 200, { ia_disponible: Boolean(process.env.MISTRAL_API_KEY), modele: MODELE });
  }
  if (req.method === "POST" && req.url === "/api/analyse") {
    return analyser(req, res);
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
