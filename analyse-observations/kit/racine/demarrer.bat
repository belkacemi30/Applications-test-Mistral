@echo off
rem Campus IAlès — Démarrage du kit « Analyse des observations » (Windows 10/11).
rem Double-cliquez sur ce fichier. Rien à installer : l'IA (Ollama), ses modèles, Node.js et Python sont inclus.
chcp 65001 >nul
title Campus IAlès - Analyse des observations
cd /d "%~dp0"
set "KIT=%~dp0"

rem Retire la marque « fichier téléchargé d'Internet » des fichiers du kit (sinon Windows peut bloquer les scripts).
powershell -NoProfile -Command "Get-ChildItem -LiteralPath '%KIT%application' -Recurse -File | Unblock-File" >nul 2>&1

rem Démarrage normal (PowerShell, intégré à Windows).
powershell -NoProfile -ExecutionPolicy Bypass -File "%KIT%application\kit\demarrer.ps1"
if not errorlevel 1 goto :fin
if errorlevel 2 goto :fin

rem ------------------------------------------------------------------
rem Démarrage de secours : PowerShell indisponible ou bloqué par une
rem stratégie du poste. On utilise Node.js ou Python inclus dans le kit.
rem ------------------------------------------------------------------
echo.
echo PowerShell n'a pas pu démarrer le kit : démarrage de secours.
set "OLLAMA_HOST=127.0.0.1:11435"
set "OLLAMA_MODELS=%KIT%outils-integres\modeles"
set "OLLAMA_NOPRUNE=1"
set "OLLAMA_KEEP_ALIVE=15m"
set "KIT_PORT=3030"
set "KIT_DONNEES=%KIT%donnees"
if not exist "%KIT_DONNEES%" mkdir "%KIT_DONNEES%"
if exist "%KIT%outils-integres\ollama\ollama.exe" (
  set "KIT_OLLAMA_URL=http://localhost:11435"
  start "IA locale du kit (ne pas fermer)" /min "%KIT%outils-integres\ollama\ollama.exe" serve
)
start "" cmd /c "timeout /t 5 /nobreak >nul & start http://localhost:3030/"
if exist "%KIT%outils-integres\node\node.exe" (
  "%KIT%outils-integres\node\node.exe" "%KIT%application\kit\serveur.js"
) else if exist "%KIT%outils-integres\python\python.exe" (
  "%KIT%outils-integres\python\python.exe" -I "%KIT%application\kit\serveur.py"
) else (
  echo Aucun moteur de secours dans outils-integres\ : contactez la personne qui vous a remis le kit.
)

:fin
echo.
echo Le kit est arrêté. Pour libérer la mémoire de l'IA, double-cliquez sur arreter.bat.
pause
