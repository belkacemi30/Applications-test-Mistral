<#
  Démarrage du kit « Analyse des observations » — Campus IAlès (appelé par demarrer.bat).
  Le kit complet embarque Ollama et les modèles (dossier outils-integres\) : rien à installer.
  1. si le kit est déjà ouvert : ouvre simplement le navigateur ;
  2. démarre l'Ollama INTÉGRÉ au kit sur le port dédié 11435 (n'interfère pas avec un Ollama déjà
     installé sur le poste), avec les modèles du kit ; à défaut, utilise un Ollama installé (port 11434) ;
  3. diagnostic de l'ordinateur (donnees\diagnostic.json) ;
  4. lance le serveur local (PowerShell intégré à Windows) et ouvre le navigateur.
  Aucune commande à saisir. Aucune connexion à Internet.
#>
param([switch]$SansNavigateur)  # -SansNavigateur : pour les tests automatisés
$ErrorActionPreference = "Stop"
$Port = 3030
$PortOllamaKit = 11435
$Application = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$Racine = [IO.Path]::GetFullPath((Join-Path $Application ".."))
$Donnees = Join-Path $Racine "donnees"
$Outils = Join-Path $Racine "outils-integres"
New-Item -ItemType Directory -Force -Path $Donnees | Out-Null
$Version = (Get-Content -Raw -Encoding UTF8 (Join-Path $Application "VERSION")).Trim()

function Lire-Url([string]$url) {
  try {
    $wc = New-Object Net.WebClient
    $wc.Proxy = $null
    $wc.Encoding = [Text.Encoding]::UTF8
    return $wc.DownloadString($url)
  } catch { return $null }
}

$Host.UI.RawUI.WindowTitle = "Campus IAlès — Analyse des observations $Version"
Write-Host "Campus IAlès — kit « Analyse des observations », version $Version" -ForegroundColor Cyan

# 1. Kit déjà ouvert ?
$etat = Lire-Url "http://localhost:$Port/api/etat"
if ($etat -and $etat -match '"kit"\s*:\s*true') {
  Write-Host "Le kit est déjà ouvert : ouverture du navigateur."
  Start-Process "http://localhost:$Port/"
  exit 0
}

# 2. Ollama
Write-Host ""
$OllamaKit = Join-Path $Outils "ollama\ollama.exe"
$ModelesKit = Join-Path $Outils "modeles"
$OllamaUrl = ""
$Integre = $false
if (Test-Path -LiteralPath $OllamaKit) {
  $Integre = $true
  $OllamaUrl = "http://localhost:$PortOllamaKit"
  if (Lire-Url "http://127.0.0.1:$PortOllamaKit/api/version") {
    Write-Host "L'IA locale du kit (Ollama intégré) est déjà démarrée." -ForegroundColor Green
  } else {
    Write-Host "Démarrage de l'IA locale intégrée au kit (Ollama)…"
    # Variables propres au processus : aucun réglage du poste n'est modifié.
    $env:OLLAMA_HOST = "127.0.0.1:$PortOllamaKit"
    $env:OLLAMA_MODELS = $ModelesKit
    $env:OLLAMA_NOPRUNE = "1"
    $env:OLLAMA_KEEP_ALIVE = "15m"
    $env:OLLAMA_NOHISTORY = "1"
    Start-Process -FilePath $OllamaKit -ArgumentList "serve" -WindowStyle Hidden -WorkingDirectory (Split-Path $OllamaKit)
    for ($i = 0; $i -lt 40 -and -not (Lire-Url "http://127.0.0.1:$PortOllamaKit/api/version"); $i++) { Start-Sleep -Milliseconds 500 }
    if (Lire-Url "http://127.0.0.1:$PortOllamaKit/api/version") {
      Write-Host "IA locale prête." -ForegroundColor Green
    } else {
      Write-Host "L'IA locale ne répond pas : voir « Dépannage » dans l'onglet Installation." -ForegroundColor Yellow
    }
  }
} elseif (Lire-Url "http://127.0.0.1:11434/api/version") {
  $OllamaUrl = "http://localhost:11434"
  Write-Host "Ollama (installé sur le poste) est prêt." -ForegroundColor Green
} else {
  $appli = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama app.exe"
  if (Test-Path $appli) {
    Write-Host "Démarrage d'Ollama (installé sur le poste)…"
    Start-Process -FilePath $appli -WindowStyle Hidden
    for ($i = 0; $i -lt 20 -and -not (Lire-Url "http://127.0.0.1:11434/api/version"); $i++) { Start-Sleep -Milliseconds 750 }
    $OllamaUrl = "http://localhost:11434"
  } else {
    Write-Host "Aucune IA locale disponible : l'application s'ouvre quand même (démonstration, export, guides)." -ForegroundColor Yellow
  }
}

# 3. Diagnostic
$UrlDiag = if ($OllamaUrl) { $OllamaUrl -replace "localhost", "127.0.0.1" } else { "http://127.0.0.1:11434" }
try {
  & (Join-Path $PSScriptRoot "diagnostic.ps1") -Sortie (Join-Path $Donnees "diagnostic.json") -OllamaUrl $UrlDiag -Integre:$Integre
} catch { Write-Host "Diagnostic impossible : $($_.Exception.Message)" -ForegroundColor Yellow }

# 4. Serveur local + navigateur
Write-Host ""
Write-Host "Pour arrêter le kit : fermez cette fenêtre, puis double-cliquez sur « arreter.bat » pour libérer la mémoire de l'IA."
$NodeKit = Join-Path (Join-Path $Outils "node") "node.exe"
if (Test-Path -LiteralPath $NodeKit) {
  # Kit complet : serveur Node.js embarqué (traite plusieurs requêtes à la fois, lecture vidéo fluide).
  $env:KIT_PORT = "$Port"
  $env:KIT_DONNEES = $Donnees
  $env:KIT_OLLAMA_URL = $OllamaUrl
  if (-not $SansNavigateur) {
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "timeout /t 3 /nobreak >nul & start http://localhost:$Port/" -WindowStyle Hidden
  }
  & $NodeKit (Join-Path $PSScriptRoot "serveur.js")
  exit $LASTEXITCODE
}
# Paquet léger : serveur PowerShell intégré à Windows.
& (Join-Path $PSScriptRoot "serveur.ps1") -Port $Port -Donnees $Donnees -OllamaUrl $OllamaUrl -OuvrirNavigateur:(-not $SansNavigateur)
