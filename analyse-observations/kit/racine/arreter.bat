@echo off
rem Campus IAlès — Arrêt complet du kit : serveur local et IA intégrée (libère la mémoire).
rem N'arrête que les programmes lancés depuis CE dossier de kit (un Ollama installé sur le poste n'est pas touché).
chcp 65001 >nul
title Campus IAlès - Arrêt du kit
set "KIT=%~dp0"
powershell -NoProfile -Command "$k=[IO.Path]::GetFullPath('%KIT%'); Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($k, [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; Write-Host ('Arrêté : ' + $_.Name) }; Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.CommandLine -like ('*' + $k + 'application\kit\*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; Write-Host 'Arrêté : serveur du kit' }"
echo Le kit est arrêté.
timeout /t 4 >nul
