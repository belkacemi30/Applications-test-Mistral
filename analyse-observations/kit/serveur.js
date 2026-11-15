"use strict";
/*
 * Serveur local minimal du kit « Analyse des observations » — version Node.js.
 * (Même API que kit/serveur.ps1 et kit/serveur.py ; voir docs/GUIDE_INSTALLATION.md.)
 *
 *  - écoute uniquement sur 127.0.0.1 (port 3030 par défaut, variable KIT_PORT) ;
 *  - sert l’application (dossier parent de kit/) en lecture seule ;
 *  - lit / écrit les données de l’utilisateur dans le dossier « donnees » (variable KIT_DONNEES,
 *    par défaut ../../donnees à côté du dossier application/), noms de fichiers sur liste blanche ;
 *  - envoie une politique de sécurité (CSP) qui interdit toute connexion hors de ce poste,
 *    sauf IA externe explicitement autorisée par l’utilisateur (donnees/config.json) ;
 *  - aucune clé d’API, aucune télémétrie, aucune requête sortante.
 *
 * API :
 *   GET  /api/etat                     → { kit, version, serveur, ia_externe, hotes_externes }
 *   GET  /api/config  | PUT /api/config → autorisation de l’IA externe
 *   GET  /api/diagnostic               → donnees/diagnostic.json
 *   GET|PUT|DELETE /api/donnees/<nom>  → fichiers de données (PUT/DELETE : en-tête X-Kit: 1)
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.KIT_PORT || 3030);
const RACINE = path.resolve(__dirname, "..");
const DONNEES = path.resolve(process.env.KIT_DONNEES || path.join(RACINE, "..", "donnees"));
const VERSION = (() => {
  try {
    return fs.readFileSync(path.join(RACINE, "VERSION"), "utf8").trim();
  } catch (e) {
    return "inconnue";
  }
})();
// Adresse de l’Ollama intégré au kit (fournie par le script de démarrage), uniquement si locale.
const OLLAMA_URL = /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/.test(process.env.KIT_OLLAMA_URL || "") ? process.env.KIT_OLLAMA_URL : "";
const NOM_DONNEE = /^[a-z0-9][a-z0-9_-]{0,63}\.(json|log|enc)$/;
const HOTE_EXTERNE = /^https:\/\/[a-z0-9.-]+(:\d{1,5})?$/;
const TAILLE_MAX = 50 * 1024 * 1024;
const MORCEAU_MAX = 4 * 1024 * 1024; // taille maximale d’une réponse partielle (Range)
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".vtt": "text/vtt; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf"
};

fs.mkdirSync(DONNEES, { recursive: true });

function lireConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(DONNEES, "config.json"), "utf8"));
    const hotes = Array.isArray(c.hotes_externes) ? c.hotes_externes.filter((h) => HOTE_EXTERNE.test(h)).slice(0, 10) : [];
    return { ia_externe: Boolean(c.ia_externe) && hotes.length > 0, hotes_externes: hotes };
  } catch (e) {
    return { ia_externe: false, hotes_externes: [] };
  }
}

function politiqueSecurite() {
  const c = lireConfig();
  const connect = ["'self'", "http://localhost:*", "http://127.0.0.1:*"].concat(c.ia_externe ? c.hotes_externes : []);
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    "connect-src " + connect.join(" "),
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'"
  ].join("; ");
}

function entetes(type, extra) {
  return Object.assign(
    {
      "Content-Type": type,
      "Content-Security-Policy": politiqueSecurite(),
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Cache-Control": "no-cache"
    },
    extra || {}
  );
}

function json(res, code, obj) {
  res.writeHead(code, entetes("application/json; charset=utf-8", { "Cache-Control": "no-store" }));
  res.end(JSON.stringify(obj));
}

function hoteAutorise(req) {
  const h = String(req.headers.host || "").toLowerCase();
  return h === "localhost:" + PORT || h === "127.0.0.1:" + PORT;
}

function ecritureAutorisee(req) {
  if (req.headers["x-kit"] !== "1") return false; // impose une requête « pré-vérifiée » côté navigateur
  const o = req.headers.origin;
  return !o || o === "http://localhost:" + PORT || o === "http://127.0.0.1:" + PORT;
}

function lireCorps(req) {
  return new Promise((resoudre, rejeter) => {
    const morceaux = [];
    let taille = 0;
    req.on("data", (c) => {
      taille += c.length;
      if (taille > TAILLE_MAX) {
        rejeter(new Error("trop volumineux"));
        req.destroy();
        return;
      }
      morceaux.push(c);
    });
    req.on("end", () => resoudre(Buffer.concat(morceaux)));
    req.on("error", rejeter);
  });
}

function ecrireAtomique(fichier, contenu) {
  const tmp = fichier + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, contenu);
  fs.renameSync(tmp, fichier);
}

async function api(req, res, chemin) {
  if (chemin === "/api/etat" && req.method === "GET") {
    const c = lireConfig();
    return json(res, 200, { kit: true, version: VERSION, serveur: "Node.js " + process.version, ia_externe: c.ia_externe, hotes_externes: c.hotes_externes, ollama_url: OLLAMA_URL });
  }
  if (chemin === "/api/config") {
    if (req.method === "GET") return json(res, 200, lireConfig());
    if (req.method === "PUT") {
      if (!ecritureAutorisee(req)) return json(res, 403, { erreur: "écriture refusée" });
      let c;
      try {
        c = JSON.parse((await lireCorps(req)).toString("utf8"));
      } catch (e) {
        return json(res, 400, { erreur: "JSON invalide" });
      }
      const hotes = Array.isArray(c.hotes_externes) ? c.hotes_externes.filter((h) => typeof h === "string" && HOTE_EXTERNE.test(h)).slice(0, 10) : [];
      const config = { ia_externe: Boolean(c.ia_externe) && hotes.length > 0, hotes_externes: c.ia_externe ? hotes : [], modifie: new Date().toISOString() };
      ecrireAtomique(path.join(DONNEES, "config.json"), JSON.stringify(config, null, 2));
      return json(res, 200, config);
    }
    return json(res, 405, { erreur: "méthode non autorisée" });
  }
  if (chemin === "/api/diagnostic" && req.method === "GET") {
    return envoyerDonnee(res, "diagnostic.json");
  }
  const m = chemin.match(/^\/api\/donnees\/([^/]+)$/);
  if (m) {
    const nom = decodeURIComponent(m[1]);
    if (!NOM_DONNEE.test(nom) || nom === "config.json") return json(res, 400, { erreur: "nom de fichier refusé" });
    const fichier = path.join(DONNEES, nom);
    if (req.method === "GET") return envoyerDonnee(res, nom);
    if (!ecritureAutorisee(req)) return json(res, 403, { erreur: "écriture refusée" });
    if (req.method === "PUT") {
      let corps;
      try {
        corps = await lireCorps(req);
      } catch (e) {
        return json(res, 413, { erreur: "fichier trop volumineux" });
      }
      ecrireAtomique(fichier, corps);
      return json(res, 200, { ok: true, taille: corps.length });
    }
    if (req.method === "DELETE") {
      try {
        fs.unlinkSync(fichier);
      } catch (e) {
        return json(res, 404, { erreur: "absent" });
      }
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { erreur: "méthode non autorisée" });
  }
  return json(res, 404, { erreur: "inconnu" });
}

function envoyerDonnee(res, nom) {
  fs.readFile(path.join(DONNEES, nom), (err, contenu) => {
    if (err) return json(res, 404, { erreur: "absent" });
    res.writeHead(200, entetes(nom.endsWith(".log") ? "text/plain; charset=utf-8" : "application/json; charset=utf-8", { "Cache-Control": "no-store" }));
    res.end(contenu);
  });
}

function statique(req, res, chemin) {
  if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { erreur: "méthode non autorisée" });
  if (chemin === "/") chemin = "/index.html";
  if (chemin.split("/").some((s) => s.startsWith("."))) return json(res, 403, { erreur: "accès interdit" });
  const fichier = path.normalize(path.join(RACINE, chemin));
  if (!fichier.startsWith(RACINE + path.sep)) return json(res, 403, { erreur: "accès interdit" });
  fs.stat(fichier, (err, st) => {
    if (err || !st.isFile()) return json(res, 404, { erreur: "introuvable" });
    const type = TYPES[path.extname(fichier).toLowerCase()] || "application/octet-stream";
    // Requêtes partielles (lecture vidéo, avance rapide) : morceaux de 4 Mo au plus.
    const plage = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || "").trim());
    if (req.headers.range && plage && st.size > 0) {
      let debut = plage[1] === "" ? Math.max(0, st.size - Number(plage[2] || 0)) : Number(plage[1]);
      let fin = plage[1] !== "" && plage[2] !== "" ? Number(plage[2]) : st.size - 1;
      fin = Math.min(fin, st.size - 1, debut + MORCEAU_MAX - 1);
      if (!(debut <= fin) || debut >= st.size) {
        res.writeHead(416, entetes(type, { "Content-Range": "bytes */" + st.size }));
        return res.end();
      }
      res.writeHead(206, entetes(type, { "Content-Length": fin - debut + 1, "Content-Range": "bytes " + debut + "-" + fin + "/" + st.size, "Accept-Ranges": "bytes" }));
      if (req.method === "HEAD") return res.end();
      return fs.createReadStream(fichier, { start: debut, end: fin }).pipe(res);
    }
    res.writeHead(200, entetes(type, { "Content-Length": st.size, "Accept-Ranges": "bytes" }));
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(fichier).pipe(res);
  });
}

const serveur = http.createServer(async (req, res) => {
  try {
    if (!hoteAutorise(req)) return json(res, 403, { erreur: "hôte non autorisé" });
    let chemin;
    try {
      chemin = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch (e) {
      return json(res, 400, { erreur: "adresse invalide" });
    }
    if (chemin.startsWith("/api/")) return await api(req, res, chemin);
    return statique(req, res, chemin);
  } catch (e) {
    json(res, 500, { erreur: "erreur interne" });
  }
});

serveur.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error("Le port " + PORT + " est déjà utilisé. Le kit est peut-être déjà ouvert : http://localhost:" + PORT + "/");
    process.exit(2);
  }
  throw e;
});

serveur.listen(PORT, "127.0.0.1", () => {
  console.log("Kit « Analyse des observations » " + VERSION + " — http://localhost:" + PORT + "/");
  console.log("Données de l’utilisateur : " + DONNEES);
  console.log("Laissez cette fenêtre ouverte pendant l’utilisation (Ctrl+C pour arrêter).");
});
