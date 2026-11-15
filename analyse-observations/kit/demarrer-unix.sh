#!/bin/sh
# Démarrage du kit « Analyse des observations » sous macOS et Linux
# (appelé par demarrer.command / demarrer.sh à la racine du kit).
#  1. si le kit est déjà ouvert : ouvre le navigateur ;
#  2. diagnostic de l'ordinateur (donnees/diagnostic.json) ;
#  3. vérifie Ollama et le démarre s'il est installé mais arrêté ;
#  4. lance le serveur local (Node.js s'il est présent, sinon Python 3) et ouvre le navigateur.
PORT=3030
KIT="$(cd "$(dirname "$0")" && pwd)"
APPLICATION="$(cd "$KIT/.." && pwd)"
DONNEES="$APPLICATION/../donnees"
mkdir -p "$DONNEES"
DONNEES="$(cd "$DONNEES" && pwd)"
VERSION="$(cat "$APPLICATION/VERSION" 2>/dev/null)"
URL="http://localhost:$PORT/"

ouvrir() {
  if [ "$(uname -s)" = "Darwin" ]; then open "$1"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1; else echo "Ouvrez votre navigateur à l'adresse : $1"; fi
}
lire() { command -v curl >/dev/null 2>&1 && curl -s -m 2 --noproxy '*' "$1" 2>/dev/null; }

echo "Kit « Analyse des observations » — version $VERSION"

# 1. Kit déjà ouvert ?
if lire "${URL}api/etat" | grep -q '"kit": *true'; then
  echo "Le kit est déjà ouvert : ouverture du navigateur."
  ouvrir "$URL"
  exit 0
fi

# 2. Diagnostic
sh "$KIT/diagnostic.sh" "$DONNEES/diagnostic.json" || echo "Diagnostic impossible."

# 3. Ollama
echo ""
if ! lire http://127.0.0.1:11434/api/version | grep -q version; then
  if [ "$(uname -s)" = "Darwin" ] && [ -d /Applications/Ollama.app ]; then
    echo "Démarrage d'Ollama…"; open -a Ollama
  elif command -v ollama >/dev/null 2>&1; then
    echo "Démarrage d'Ollama…"; (ollama serve >/dev/null 2>&1 &)
  else
    echo "Ollama n'est pas installé : l'application s'ouvre quand même (démonstration, export, guides)."
    echo "Voir l'onglet « Installation » pour installer Ollama et un modèle."
  fi
  i=0
  while [ $i -lt 20 ] && ! lire http://127.0.0.1:11434/api/version | grep -q version; do sleep 1; i=$((i + 1)); done
  lire http://127.0.0.1:11434/api/version | grep -q version && echo "Ollama est prêt."
else
  echo "Ollama est prêt."
fi

# 4. Serveur local + navigateur
echo ""
(sleep 2; ouvrir "$URL") &
export KIT_PORT="$PORT" KIT_DONNEES="$DONNEES"
if command -v node >/dev/null 2>&1; then
  exec node "$KIT/serveur.js"
elif command -v python3 >/dev/null 2>&1 && python3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 7) else 1)" 2>/dev/null; then
  exec python3 -I "$KIT/serveur.py"
else
  echo "Aucun moteur pour le serveur local : installez Python 3 (macOS : la commande « python3 » propose son installation)"
  echo "ou Node.js (https://nodejs.org), puis relancez ce script."
  exit 1
fi
