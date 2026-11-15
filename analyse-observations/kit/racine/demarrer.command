#!/bin/sh
# Démarrage du kit « Analyse des observations » (macOS) — double-cliquez sur ce fichier.
# Premier lancement : clic droit > Ouvrir (macOS demande de confirmer un script téléchargé).
cd "$(dirname "$0")" || exit 1
exec sh "./application/kit/demarrer-unix.sh"
