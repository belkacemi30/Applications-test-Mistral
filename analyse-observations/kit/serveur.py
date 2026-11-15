#!/usr/bin/env python3
"""Serveur local minimal du kit « Analyse des observations » — version Python 3 (bibliothèque standard).

Même API et mêmes règles de sécurité que kit/serveur.js et kit/serveur.ps1 :
écoute sur 127.0.0.1 uniquement, contrôle de l'en-tête Host, écritures limitées au dossier
« donnees » (liste blanche de noms), politique de sécurité (CSP) interdisant toute connexion
hors du poste sauf IA externe explicitement autorisée, aucune requête sortante.
"""
import json
import os
import re
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

PORT = int(os.environ.get("KIT_PORT", "3030"))
RACINE = Path(__file__).resolve().parent.parent
DONNEES = Path(os.environ.get("KIT_DONNEES", RACINE.parent / "donnees")).resolve()
try:
    VERSION = (RACINE / "VERSION").read_text(encoding="utf-8").strip()
except OSError:
    VERSION = "inconnue"
NOM_DONNEE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}\.(json|log|enc)$")
HOTE_EXTERNE = re.compile(r"^https://[a-z0-9.-]+(:\d{1,5})?$")
TAILLE_MAX = 50 * 1024 * 1024
TYPES = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8",
    ".csv": "text/csv; charset=utf-8", ".vtt": "text/vtt; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
    ".ico": "image/x-icon", ".mp4": "video/mp4", ".woff2": "font/woff2", ".pdf": "application/pdf",
}

DONNEES.mkdir(parents=True, exist_ok=True)


def lire_config():
    try:
        c = json.loads((DONNEES / "config.json").read_text(encoding="utf-8"))
        hotes = [h for h in c.get("hotes_externes", []) if isinstance(h, str) and HOTE_EXTERNE.match(h)][:10]
        return {"ia_externe": bool(c.get("ia_externe")) and bool(hotes), "hotes_externes": hotes}
    except (OSError, ValueError, AttributeError):
        return {"ia_externe": False, "hotes_externes": []}


def politique():
    c = lire_config()
    connect = ["'self'", "http://localhost:*", "http://127.0.0.1:*"] + (c["hotes_externes"] if c["ia_externe"] else [])
    return "; ".join([
        "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
        "media-src 'self' blob:", "font-src 'self'", "connect-src " + " ".join(connect), "object-src 'none'",
        "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
    ])


def ecrire_atomique(fichier, contenu):
    tmp = fichier.with_name(fichier.name + ".tmp-" + str(os.getpid()))
    tmp.write_bytes(contenu)
    os.replace(tmp, fichier)


class Gestionnaire(BaseHTTPRequestHandler):
    server_version = "KitAnalyse"
    sys_version = ""

    def log_message(self, fmt, *args):  # journal console minimal, sans contenu
        pass

    def envoyer(self, code, corps, type_, extra=None):
        self.send_response(code)
        self.send_header("Content-Type", type_)
        self.send_header("Content-Security-Policy", politique())
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Cache-Control", "no-cache")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(corps)

    def json(self, code, obj):
        self.envoyer(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8", {"Cache-Control": "no-store"})

    def hote_ok(self):
        h = (self.headers.get("Host") or "").lower()
        return h in ("localhost:%d" % PORT, "127.0.0.1:%d" % PORT)

    def ecriture_ok(self):
        if self.headers.get("X-Kit") != "1":
            return False
        o = self.headers.get("Origin")
        return o in (None, "http://localhost:%d" % PORT, "http://127.0.0.1:%d" % PORT)

    def corps(self):
        if "chunked" in (self.headers.get("Transfer-Encoding") or "").lower():
            morceaux, total = [], 0
            while True:
                taille = int(self.rfile.readline().split(b";")[0].strip() or b"0", 16)
                if taille == 0:
                    self.rfile.readline()
                    break
                total += taille
                if total > TAILLE_MAX:
                    raise ValueError("trop volumineux")
                morceaux.append(self.rfile.read(taille))
                self.rfile.readline()
            return b"".join(morceaux)
        n = int(self.headers.get("Content-Length") or 0)
        if n > TAILLE_MAX:
            raise ValueError("trop volumineux")
        return self.rfile.read(n) if n else b""

    def chemin(self):
        try:
            return unquote(urlsplit(self.path).path)
        except ValueError:
            return None

    def traiter(self):
        if not self.hote_ok():
            return self.json(403, {"erreur": "hôte non autorisé"})
        chemin = self.chemin()
        if chemin is None:
            return self.json(400, {"erreur": "adresse invalide"})
        if chemin.startswith("/api/"):
            return self.api(chemin)
        if self.command not in ("GET", "HEAD"):
            return self.json(405, {"erreur": "méthode non autorisée"})
        return self.statique(chemin)

    do_GET = do_HEAD = do_PUT = do_DELETE = do_POST = lambda self: self.traiter()

    def api(self, chemin):
        if chemin == "/api/etat" and self.command == "GET":
            c = lire_config()
            return self.json(200, {"kit": True, "version": VERSION, "serveur": "Python " + sys.version.split()[0], **c})
        if chemin == "/api/config":
            if self.command == "GET":
                return self.json(200, lire_config())
            if self.command == "PUT":
                if not self.ecriture_ok():
                    return self.json(403, {"erreur": "écriture refusée"})
                try:
                    c = json.loads(self.corps().decode("utf-8"))
                except (ValueError, UnicodeDecodeError):
                    return self.json(400, {"erreur": "JSON invalide"})
                hotes = [h for h in (c.get("hotes_externes") or []) if isinstance(h, str) and HOTE_EXTERNE.match(h)][:10]
                config = {"ia_externe": bool(c.get("ia_externe")) and bool(hotes), "hotes_externes": hotes if c.get("ia_externe") else [],
                          "modifie": datetime.now(timezone.utc).isoformat()}
                ecrire_atomique(DONNEES / "config.json", json.dumps(config, indent=2).encode("utf-8"))
                return self.json(200, config)
            return self.json(405, {"erreur": "méthode non autorisée"})
        if chemin == "/api/diagnostic" and self.command == "GET":
            return self.donnee("diagnostic.json")
        m = re.match(r"^/api/donnees/([^/]+)$", chemin)
        if m:
            nom = m.group(1)
            if not NOM_DONNEE.match(nom) or nom == "config.json":
                return self.json(400, {"erreur": "nom de fichier refusé"})
            if self.command == "GET":
                return self.donnee(nom)
            if not self.ecriture_ok():
                return self.json(403, {"erreur": "écriture refusée"})
            fichier = DONNEES / nom
            if self.command == "PUT":
                try:
                    contenu = self.corps()
                except ValueError:
                    return self.json(413, {"erreur": "fichier trop volumineux"})
                ecrire_atomique(fichier, contenu)
                return self.json(200, {"ok": True, "taille": len(contenu)})
            if self.command == "DELETE":
                try:
                    fichier.unlink()
                except OSError:
                    return self.json(404, {"erreur": "absent"})
                return self.json(200, {"ok": True})
            return self.json(405, {"erreur": "méthode non autorisée"})
        return self.json(404, {"erreur": "inconnu"})

    def donnee(self, nom):
        try:
            contenu = (DONNEES / nom).read_bytes()
        except OSError:
            return self.json(404, {"erreur": "absent"})
        type_ = "text/plain; charset=utf-8" if nom.endswith(".log") else "application/json; charset=utf-8"
        return self.envoyer(200, contenu, type_, {"Cache-Control": "no-store"})

    def statique(self, chemin):
        if chemin == "/":
            chemin = "/index.html"
        if any(p.startswith(".") for p in chemin.split("/")):
            return self.json(403, {"erreur": "accès interdit"})
        fichier = (RACINE / chemin.lstrip("/")).resolve()
        if RACINE not in fichier.parents:
            return self.json(403, {"erreur": "accès interdit"})
        if not fichier.is_file():
            return self.json(404, {"erreur": "introuvable"})
        return self.envoyer(200, fichier.read_bytes(), TYPES.get(fichier.suffix.lower(), "application/octet-stream"))


def main():
    try:
        serveur = ThreadingHTTPServer(("127.0.0.1", PORT), Gestionnaire)
    except OSError:
        print("Le port %d est déjà utilisé. Le kit est peut-être déjà ouvert : http://localhost:%d/" % (PORT, PORT))
        sys.exit(2)
    print("Kit « Analyse des observations » %s — http://localhost:%d/" % (VERSION, PORT))
    print("Données de l'utilisateur : %s" % DONNEES)
    print("Laissez cette fenêtre ouverte pendant l'utilisation (Ctrl+C pour arrêter).")
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
