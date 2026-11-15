"use strict";
/*
 * Tests identiques pour les trois serveurs du kit (Node.js, Python, PowerShell).
 * Usage : node tests/test_serveurs.js [node|python|powershell ...]
 * Chaque serveur est lancé sur un port de test avec un dossier de données temporaire.
 */
const { spawn, spawnSync } = require("child_process");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const RACINE = path.resolve(__dirname, "..");
const VERSION = fs.readFileSync(path.join(RACINE, "VERSION"), "utf8").trim();

function existe(cmd) {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [cmd]);
  return r.status === 0;
}

const SERVEURS = {
  node: (port, donnees) => ["node", [path.join(RACINE, "kit", "serveur.js")], { KIT_PORT: String(port), KIT_DONNEES: donnees }],
  python: (port, donnees) => [process.platform === "win32" ? "python" : existe("python3") ? "python3" : "python", ["-I", path.join(RACINE, "kit", "serveur.py")], { KIT_PORT: String(port), KIT_DONNEES: donnees }],
  powershell: (port, donnees) => [
    existe("powershell") ? "powershell" : "pwsh",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(RACINE, "kit", "serveur.ps1"), "-Port", String(port), "-Donnees", donnees],
    {}
  ]
};

function requete(port, methode, chemin, options) {
  const o = options || {};
  return new Promise((resoudre, rejeter) => {
    const req = http.request(
      { host: "127.0.0.1", port, method: methode, path: chemin, headers: Object.assign({ Host: "localhost:" + port }, o.entetes || {}) },
      (res) => {
        const morceaux = [];
        res.on("data", (c) => morceaux.push(c));
        res.on("end", () => resoudre({ statut: res.statusCode, entetes: res.headers, corps: Buffer.concat(morceaux).toString("utf8") }));
      }
    );
    req.on("error", rejeter);
    if (o.corps != null) req.write(o.corps);
    req.end();
  });
}

/** GET avec en-tête Range ; corps renvoyé en Buffer. */
function requeteBrute(port, chemin, plage) {
  return new Promise((resoudre, rejeter) => {
    const req = http.request({ host: "127.0.0.1", port, method: "GET", path: chemin, headers: { Host: "localhost:" + port, Range: plage } }, (res) => {
      const morceaux = [];
      res.on("data", (c) => morceaux.push(c));
      res.on("end", () => resoudre({ statut: res.statusCode, entetes: res.headers, corps: Buffer.concat(morceaux) }));
    });
    req.on("error", rejeter);
    req.end();
  });
}

async function attendrePret(port) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await requete(port, "GET", "/api/etat");
      if (r.statut === 200) return;
    } catch (e) {
      /* pas encore prêt */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("le serveur ne démarre pas");
}

async function tester(nom, port) {
  const donnees = fs.mkdtempSync(path.join(os.tmpdir(), "kit-donnees-"));
  const [cmd, args, env] = SERVEURS[nom](port, donnees);
  const proc = spawn(cmd, args, { env: Object.assign({}, process.env, env, { KIT_OLLAMA_URL: "http://localhost:11435" }), stdio: "ignore" });
  const resultats = [];
  const verifier = async (libelle, fn) => {
    try {
      await fn();
      resultats.push("  ✓ " + libelle);
    } catch (e) {
      resultats.push("  ✗ " + libelle + " — " + e.message);
    }
  };
  try {
    await attendrePret(port);
    await verifier("page d’accueil servie avec politique de sécurité stricte", async () => {
      const r = await requete(port, "GET", "/");
      assert.strictEqual(r.statut, 200);
      assert.match(r.entetes["content-type"], /text\/html/);
      const csp = r.entetes["content-security-policy"];
      assert.match(csp, /connect-src 'self' http:\/\/localhost:\* http:\/\/127\.0\.0\.1:\*(;|$)/);
      assert.ok(!/https:/.test(csp), "aucun domaine externe par défaut");
      assert.strictEqual(r.entetes["x-content-type-options"], "nosniff");
    });
    await verifier("api/etat : kit, version " + VERSION + ", IA externe désactivée", async () => {
      const e = JSON.parse((await requete(port, "GET", "/api/etat")).corps);
      assert.strictEqual(e.kit, true);
      assert.strictEqual(e.version, VERSION);
      assert.strictEqual(e.ia_externe, false);
      assert.strictEqual(e.ollama_url, "http://localhost:11435", "adresse de l’IA intégrée transmise");
    });
    await verifier("en-tête Host étranger refusé (protection DNS rebinding)", async () => {
      const r = await requete(port, "GET", "/api/etat", { entetes: { Host: "attaquant.example:" + port } });
      assert.ok(r.statut === 403 || r.statut === 400, "statut " + r.statut);
    });
    await verifier("fichiers cachés et sortie du dossier refusés", async () => {
      assert.ok([403, 404].includes((await requete(port, "GET", "/.gitignore")).statut));
      assert.ok([400, 403, 404].includes((await requete(port, "GET", "/%2e%2e/%2e%2e/Windows/win.ini")).statut));
      assert.ok([400, 403, 404].includes((await requete(port, "GET", "/..%5c..%5cdonnees%5cconfig.json")).statut));
    });
    await verifier("écriture sans en-tête X-Kit refusée", async () => {
      assert.strictEqual((await requete(port, "PUT", "/api/donnees/essai.json", { corps: "{}" })).statut, 403);
    });
    await verifier("écriture depuis une origine étrangère refusée", async () => {
      const r = await requete(port, "PUT", "/api/donnees/essai.json", { corps: "{}", entetes: { "X-Kit": "1", Origin: "https://attaquant.example" } });
      assert.strictEqual(r.statut, 403);
    });
    await verifier("cycle écriture / lecture / suppression dans donnees/", async () => {
      const contenu = JSON.stringify({ a: "é€ observation", n: 1 });
      assert.strictEqual((await requete(port, "PUT", "/api/donnees/essai.json", { corps: contenu, entetes: { "X-Kit": "1", Origin: "http://localhost:" + port } })).statut, 200);
      assert.strictEqual(fs.readFileSync(path.join(donnees, "essai.json"), "utf8"), contenu);
      assert.strictEqual((await requete(port, "GET", "/api/donnees/essai.json")).corps, contenu);
      assert.strictEqual((await requete(port, "DELETE", "/api/donnees/essai.json", { entetes: { "X-Kit": "1" } })).statut, 200);
      assert.strictEqual((await requete(port, "GET", "/api/donnees/essai.json")).statut, 404);
    });
    await verifier("noms de fichiers hors liste blanche refusés", async () => {
      for (const nom of ["Essai.json", "essai.exe", "config.json", "..%2Fx.json"]) {
        const r = await requete(port, "PUT", "/api/donnees/" + nom, { corps: "{}", entetes: { "X-Kit": "1" } });
        assert.ok([400, 404].includes(r.statut), nom + " → " + r.statut);
      }
    });
    await verifier("autorisation de l’IA externe : seuls les domaines https valides entrent dans la CSP", async () => {
      const corps = JSON.stringify({ ia_externe: true, hotes_externes: ["https://api.mistral.ai", "http://non-securise.example", "https://x.example/chemin", "javascript:alert(1)"] });
      const r = await requete(port, "PUT", "/api/config", { corps, entetes: { "X-Kit": "1" } });
      assert.strictEqual(r.statut, 200);
      const csp = (await requete(port, "GET", "/")).entetes["content-security-policy"];
      assert.match(csp, /https:\/\/api\.mistral\.ai/);
      assert.ok(!/non-securise|x\.example|javascript/.test(csp), csp);
      const e = JSON.parse((await requete(port, "GET", "/api/etat")).corps);
      assert.strictEqual(e.ia_externe, true);
      await requete(port, "PUT", "/api/config", { corps: JSON.stringify({ ia_externe: false }), entetes: { "X-Kit": "1" } });
      assert.ok(!/https:/.test((await requete(port, "GET", "/")).entetes["content-security-policy"]));
    });
    await verifier("diagnostic absent → 404, présent → servi", async () => {
      assert.strictEqual((await requete(port, "GET", "/api/diagnostic")).statut, 404);
      fs.writeFileSync(path.join(donnees, "diagnostic.json"), '{"ram_go":16}');
      assert.strictEqual(JSON.parse((await requete(port, "GET", "/api/diagnostic")).corps).ram_go, 16);
    });
    await verifier("requêtes partielles (vidéo) : 206 par morceaux de 4 Mo, 416 si plage invalide", async () => {
      const video = "/docs/video/video-sensibilisation.mp4";
      const taille = fs.statSync(path.join(RACINE, "docs/video/video-sensibilisation.mp4")).size;
      const debut = await requeteBrute(port, video, "bytes=0-");
      assert.strictEqual(debut.statut, 206);
      assert.strictEqual(debut.corps.length, 4 * 1024 * 1024);
      assert.strictEqual(debut.entetes["content-range"], "bytes 0-4194303/" + taille);
      const milieu = await requeteBrute(port, video, "bytes=100-199");
      assert.strictEqual(milieu.statut, 206);
      assert.ok(milieu.corps.equals(fs.readFileSync(path.join(RACINE, "docs/video/video-sensibilisation.mp4")).subarray(100, 200)));
      const fin = await requeteBrute(port, video, "bytes=-10");
      assert.strictEqual(fin.corps.length, 10);
      assert.strictEqual((await requeteBrute(port, video, "bytes=" + (taille + 5) + "-")).statut, 416);
      const tete = await requete(port, "HEAD", video);
      assert.strictEqual(tete.statut, 200);
      assert.strictEqual(Number(tete.entetes["content-length"]), taille);
    });
    await verifier("ressources de l’application et guides servis", async () => {
      for (const f of ["/app.js", "/js/kit.js", "/styles-kit.css", "/docs/GUIDE_INSTALLATION.md", "/registre/observations.js", "/exemples/observations-fictives.csv"]) {
        const r = await requete(port, "GET", f);
        assert.strictEqual(r.statut, 200, f + " → " + r.statut);
      }
    });
  } catch (e) {
    resultats.push("  ✗ démarrage — " + e.message);
  } finally {
    proc.kill();
    fs.rmSync(donnees, { recursive: true, force: true });
  }
  return resultats;
}

(async () => {
  const choix = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SERVEURS);
  let echecs = 0;
  let port = 3141;
  for (const nom of choix) {
    const res = await tester(nom, port++);
    console.log("Serveur " + nom + " :");
    console.log(res.join("\n"));
    echecs += res.filter((l) => l.includes("✗")).length;
  }
  console.log(echecs ? "\n✗ " + echecs + " échec(s)" : "\n✓ Tous les tests serveurs réussis");
  process.exit(echecs ? 1 : 0);
})();
