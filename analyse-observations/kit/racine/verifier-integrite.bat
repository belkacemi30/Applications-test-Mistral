@echo off
rem Campus IAlès — Vérifie que le kit est complet et non modifié (sommes SHA-256 de SOMMES-SHA256.txt).
rem À faire après chaque copie du kit (clé USB, disque externe). Peut prendre plusieurs minutes (modèles d'IA).
chcp 65001 >nul
title Campus IAlès - Vérification du kit
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0application\kit\verifier.ps1"
pause
