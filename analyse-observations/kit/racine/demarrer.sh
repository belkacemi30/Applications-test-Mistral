#!/bin/sh
# Démarrage du kit « Analyse des observations » (Linux) — double-cliquez (« Exécuter ») ou lancez ./demarrer.sh
cd "$(dirname "$0")" || exit 1
exec sh "./application/kit/demarrer-unix.sh"
