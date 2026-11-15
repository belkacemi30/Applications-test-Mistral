@echo off
chcp 65001 >nul
title Analyse des observations - serveur local
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js est introuvable. Installez-le depuis https://nodejs.org puis relancez ce fichier.
  pause
  exit /b 1
)
echo Démarrage de l'application sur http://localhost:3030/ ...
echo Ollama doit être lancé (icône dans la barre des tâches).
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3030/"
node serveur\server.js
pause
