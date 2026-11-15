@echo off
rem Démarrage du kit « Analyse des observations » (Windows 10/11) — double-cliquez sur ce fichier.
chcp 65001 >nul
title Analyse des observations - kit local
cd /d "%~dp0"
rem Retire la marque « fichier téléchargé d'Internet » des fichiers du kit (sinon Windows peut bloquer les scripts).
powershell -NoProfile -Command "Get-ChildItem -LiteralPath '%~dp0application' -Recurse -File | Unblock-File" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0application\kit\demarrer.ps1"
if errorlevel 1 (
  echo.
  echo Le kit n'a pas pu demarrer. Consultez « Depannage » dans application\docs\GUIDE_INSTALLATION.html
  pause
)
