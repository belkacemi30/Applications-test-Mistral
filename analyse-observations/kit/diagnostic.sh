#!/bin/sh
# Diagnostic de l'ordinateur (macOS et Linux) pour le kit « Analyse des observations ».
# Détecte système, processeur, mémoire vive, carte graphique / mémoire vidéo, espace disque,
# présence et état d'Ollama, modèles installés ; affiche la recommandation de modèle et écrit
# le résultat dans donnees/diagnostic.json (lu par l'application). Aucune donnée n'est envoyée.
# Usage : sh diagnostic.sh [fichier_de_sortie]

KIT="$(cd "$(dirname "$0")" && pwd)"
APPLICATION="$(cd "$KIT/.." && pwd)"
SORTIE="${1:-$APPLICATION/../donnees/diagnostic.json}"
mkdir -p "$(dirname "$SORTIE")"

json_texte() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr -d '\n\r'; }
arrondi() { awk -v v="$1" -v d="$2" 'BEGIN { if (v == "" || d == 0) print 0; else printf "%.1f", v / d }'; }

SYSTEME_TYPE="$(uname -s)"
APPLE=false
GPU=""
VRAM=0
VRAM_SOURCE=""
if [ "$SYSTEME_TYPE" = "Darwin" ]; then
  SYSTEME="$(sw_vers -productName 2>/dev/null) $(sw_vers -productVersion 2>/dev/null)"
  PROCESSEUR="$(sysctl -n machdep.cpu.brand_string 2>/dev/null)"
  RAM=$(arrondi "$(sysctl -n hw.memsize 2>/dev/null)" 1073741824)
  if [ "$(uname -m)" = "arm64" ]; then
    APPLE=true
    GPU="puce Apple (mémoire unifiée)"
  else
    GPU="$(system_profiler SPDisplaysDataType 2>/dev/null | awk -F': ' '/Chipset Model/ {print $2; exit}')"
    V="$(system_profiler SPDisplaysDataType 2>/dev/null | awk -F': ' '/VRAM/ {print $2; exit}' | grep -o '[0-9]*' | head -1)"
    [ -n "$V" ] && { VRAM=$(arrondi "$V" 1024); [ "$V" -lt 64 ] && VRAM="$V"; VRAM_SOURCE="system_profiler"; }
  fi
  DISQUE=$(arrondi "$(df -Pk "$APPLICATION" | awk 'NR==2 {print $4}')" 1048576)
else
  if [ -r /etc/os-release ]; then . /etc/os-release; SYSTEME="${PRETTY_NAME:-Linux}"; else SYSTEME="Linux $(uname -r)"; fi
  PROCESSEUR="$(awk -F': ' '/model name/ {print $2; exit}' /proc/cpuinfo 2>/dev/null)"
  RAM=$(arrondi "$(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null)" 1048576)
  if command -v nvidia-smi >/dev/null 2>&1; then
    GPU="$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)"
    VRAM=$(arrondi "$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | sort -n | tail -1)" 1024)
    VRAM_SOURCE="nvidia-smi"
  else
    for f in /sys/class/drm/card*/device/mem_info_vram_total; do
      [ -r "$f" ] && { VRAM=$(arrondi "$(cat "$f")" 1073741824); VRAM_SOURCE="amdgpu"; break; }
    done
    command -v lspci >/dev/null 2>&1 && GPU="$(lspci 2>/dev/null | grep -iE 'vga|3d controller' | head -1 | sed 's/^[^:]*: //')"
  fi
  DISQUE=$(arrondi "$(df -Pk "$APPLICATION" | awk 'NR==2 {print $4}')" 1048576)
fi

# Ollama
OLLAMA_INSTALLE=false
OLLAMA_ACTIF=false
OLLAMA_VERSION=""
MODELES=""
if command -v ollama >/dev/null 2>&1 || [ -d /Applications/Ollama.app ]; then OLLAMA_INSTALLE=true; fi
if command -v curl >/dev/null 2>&1; then
  V="$(curl -s -m 2 --noproxy '*' http://127.0.0.1:11434/api/version 2>/dev/null)"
  if [ -n "$V" ]; then
    OLLAMA_ACTIF=true
    OLLAMA_INSTALLE=true
    OLLAMA_VERSION="$(printf '%s' "$V" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')"
    MODELES="$(curl -s -m 3 --noproxy '*' http://127.0.0.1:11434/api/tags 2>/dev/null | grep -o '"name":"[^"]*"' | sed 's/"name":"//; s/"$//')"
  fi
fi
if [ -z "$OLLAMA_VERSION" ] && command -v ollama >/dev/null 2>&1; then
  OLLAMA_VERSION="$(ollama --version 2>/dev/null | sed 's/.*version is *//' | head -1)"
fi

# Recommandation (même grille que l'application ; seuils tolérants : 32 Go ≈ 31,7 Go utilisables)
recommande() {
  if [ "$APPLE" = true ]; then
    awk -v r="$RAM" 'BEGIN { if (r >= 30) print "confortable ministral-3:8b"; else if (r >= 15) print "intermediaire ministral-3:8b"; else print "minimal ministral-3:3b" }'
  else
    awk -v r="$RAM" -v v="$VRAM" 'BEGIN { if (r >= 30 && v >= 12) print "confortable ministral-3:8b"; else if (r >= 15 && v >= 6) print "intermediaire ministral-3:8b"; else print "minimal ministral-3:3b" }'
  fi
}
PALIER="$(recommande | cut -d' ' -f1)"
MODELE="$(recommande | cut -d' ' -f2)"

LISTE=""
for m in $MODELES; do LISTE="$LISTE${LISTE:+, }\"$(json_texte "$m")\""; done

cat > "$SORTIE" <<FIN
{
  "date": "$(date '+%d/%m/%Y %H:%M')",
  "systeme": "$(json_texte "$SYSTEME")",
  "processeur": "$(json_texte "$PROCESSEUR")",
  "ram_go": ${RAM:-0},
  "gpu": "$(json_texte "$GPU")",
  "vram_go": ${VRAM:-0},
  "vram_source": "$VRAM_SOURCE",
  "apple_silicon": $APPLE,
  "disque_libre_go": ${DISQUE:-0},
  "ollama_installe": $OLLAMA_INSTALLE,
  "ollama_version": "$(json_texte "$OLLAMA_VERSION")",
  "ollama_actif": $OLLAMA_ACTIF,
  "modeles": [$LISTE],
  "palier": "$PALIER",
  "modele_recommande": "$MODELE"
}
FIN

echo ""
echo "=== Diagnostic de votre ordinateur ==="
echo "Système          : $SYSTEME"
echo "Mémoire vive     : $RAM Go"
echo "Carte graphique  : ${GPU:-aucune détectée}$( [ "$VRAM" != "0" ] && echo " ($VRAM Go, source : $VRAM_SOURCE)")"
echo "Disque libre     : $DISQUE Go"
if [ "$OLLAMA_ACTIF" = true ]; then echo "Ollama           : en fonctionnement (version $OLLAMA_VERSION)"; elif [ "$OLLAMA_INSTALLE" = true ]; then echo "Ollama           : installé mais arrêté"; else echo "Ollama           : non installé"; fi
echo "Modèles installés: $(echo $MODELES | sed 's/ /, /g')"
echo "Recommandation   : $MODELE (configuration $PALIER)"
echo "Résultat enregistré : $SORTIE"
