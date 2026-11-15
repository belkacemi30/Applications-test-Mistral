<#
  Démarrage du kit « Analyse des observations » sous Windows (appelé par demarrer.bat).
  1. si le kit est déjà ouvert : ouvre simplement le navigateur ;
  2. diagnostic de l'ordinateur (donnees\diagnostic.json) ;
  3. vérifie Ollama et le démarre s'il est installé mais arrêté ;
  4. lance le serveur local (PowerShell intégré à Windows) et ouvre le navigateur.
  Aucune commande à saisir. Aucune connexion à Internet.
#>
$ErrorActionPreference = "Stop"
$Port = 3030
$Application = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$Donnees = [IO.Path]::GetFullPath((Join-Path $Application "..\donnees"))
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

$Host.UI.RawUI.WindowTitle = "Analyse des observations — kit local $Version"
Write-Host "Kit « Analyse des observations » — version $Version" -ForegroundColor Cyan

# 1. Kit déjà ouvert ?
$etat = Lire-Url "http://localhost:$Port/api/etat"
if ($etat -and $etat -match '"kit"\s*:\s*true') {
  Write-Host "Le kit est déjà ouvert : ouverture du navigateur."
  Start-Process "http://localhost:$Port/"
  exit 0
}

# 2. Diagnostic
try { & (Join-Path $PSScriptRoot "diagnostic.ps1") -Sortie (Join-Path $Donnees "diagnostic.json") } catch { Write-Host "Diagnostic impossible : $($_.Exception.Message)" -ForegroundColor Yellow }

# 3. Ollama
Write-Host ""
if (-not (Lire-Url "http://127.0.0.1:11434/api/version")) {
  $appli = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama app.exe"
  $cmd = Get-Command ollama -ErrorAction SilentlyContinue
  if (Test-Path $appli) {
    Write-Host "Démarrage d'Ollama…"
    Start-Process -FilePath $appli -WindowStyle Hidden
  } elseif ($cmd) {
    Write-Host "Démarrage d'Ollama…"
    Start-Process -FilePath $cmd.Source -ArgumentList "serve" -WindowStyle Hidden
  } else {
    Write-Host "Ollama n'est pas installé : l'application s'ouvre quand même (démonstration, export, guides)." -ForegroundColor Yellow
    Write-Host "Voir l'onglet « Installation » pour installer Ollama et un modèle."
  }
  if (Test-Path $appli -or $cmd) {
    for ($i = 0; $i -lt 20 -and -not (Lire-Url "http://127.0.0.1:11434/api/version"); $i++) { Start-Sleep -Milliseconds 750 }
    if (Lire-Url "http://127.0.0.1:11434/api/version") { Write-Host "Ollama est prêt." -ForegroundColor Green } else { Write-Host "Ollama ne répond pas encore : voir « Dépannage » dans l'onglet Installation." -ForegroundColor Yellow }
  }
} else {
  Write-Host "Ollama est prêt." -ForegroundColor Green
}

# 4. Serveur local + navigateur
Write-Host ""
& (Join-Path $PSScriptRoot "serveur.ps1") -Port $Port -Donnees $Donnees -OuvrirNavigateur
