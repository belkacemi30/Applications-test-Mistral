<#
  Diagnostic de l'ordinateur (Windows) pour le kit « Analyse des observations ».
  Détecte : système, processeur, mémoire vive, carte(s) graphique(s) et mémoire vidéo, espace disque,
  présence et état d'Ollama, modèles installés ; affiche la recommandation de modèle et écrit
  le résultat dans donnees\diagnostic.json (lu par l'application). Aucune donnée n'est envoyée.

  Mémoire vidéo : Win32_VideoController.AdapterRAM est plafonné à 4 Go (entier 32 bits) ;
  on lit donc en priorité nvidia-smi, puis la clé de registre HardwareInformation.qwMemorySize.
#>
param([string]$Sortie = "", [string]$OllamaUrl = "http://127.0.0.1:11434", [switch]$Integre)

$ErrorActionPreference = "SilentlyContinue"
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$Racine = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
if (-not $Sortie) { $Sortie = Join-Path $Racine "..\donnees\diagnostic.json" }
$Sortie = [IO.Path]::GetFullPath($Sortie)
New-Item -ItemType Directory -Force -Path (Split-Path $Sortie) | Out-Null

function Go([double]$octets) { [math]::Round($octets / 1GB, 1) }

$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$ram = Go $cs.TotalPhysicalMemory

# Cartes graphiques (hors adaptateurs virtuels / d'affichage de base)
$gpus = @(Get-CimInstance Win32_VideoController | Where-Object { $_.Name -and $_.Name -notmatch "Basic Display|Remote|Virtual|Hyper-V|Parsec|Citrix|Mirage" })
$vram = 0.0
$vramSource = ""
$gpuNom = ($gpus | Select-Object -ExpandProperty Name) -join " + "

$nvsmi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
if ($nvsmi) {
  $lignes = & $nvsmi.Source --query-gpu=name,memory.total --format=csv,noheader,nounits 2>$null
  foreach ($l in @($lignes)) {
    $p = $l -split ","
    if ($p.Count -ge 2) {
      $v = [math]::Round([double]($p[1].Trim()) / 1024, 1)
      if ($v -gt $vram) { $vram = $v; $vramSource = "nvidia-smi" }
    }
  }
}
if ($vram -eq 0) {
  $cle = "HKLM:\SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}"
  Get-ChildItem $cle | Where-Object { $_.PSChildName -match '^\d{4}$' } | ForEach-Object {
    $q = (Get-ItemProperty $_.PSPath)."HardwareInformation.qwMemorySize"
    if ($q) { $v = Go ([double]$q); if ($v -gt $vram) { $vram = $v; $vramSource = "registre" } }
  }
}
if ($vram -eq 0 -and $gpus.Count) {
  $v = Go ([double](($gpus | Measure-Object AdapterRAM -Maximum).Maximum))
  if ($v -gt 0) { $vram = $v; $vramSource = "WMI (plafonné à 4 Go)" }
}
# Les GPU intégrés (Intel UHD/Iris, AMD Radeon Graphics intégrés) n'apportent pas de mémoire dédiée utile.
if ($gpuNom -match "Intel\(R\) (UHD|HD|Iris)" -and $gpuNom -notmatch "Arc" -and $gpus.Count -eq 1) { $vram = 0; $vramSource = "GPU intégré" }

$lecteur = (Split-Path -Qualifier $Racine).TrimEnd(":")
$disque = Go ((Get-PSDrive -Name $lecteur).Free)

# Ollama
$ollamaCmd = Get-Command ollama -ErrorAction SilentlyContinue
$ollamaExe = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
$installe = [bool]$ollamaCmd -or (Test-Path $ollamaExe) -or [bool]$Integre
$version = ""
$actif = $false
$modeles = @()
try {
  $wc = New-Object Net.WebClient
  $wc.Proxy = $null
  $wc.Encoding = [Text.Encoding]::UTF8
  $version = ($wc.DownloadString("$OllamaUrl/api/version") | ConvertFrom-Json).version
  $actif = $true
  $modeles = @(($wc.DownloadString("$OllamaUrl/api/tags") | ConvertFrom-Json).models | ForEach-Object { $_.name })
} catch { }
if (-not $version -and $installe) {
  $exe = if ($ollamaCmd) { $ollamaCmd.Source } else { $ollamaExe }
  $version = ((& $exe --version 2>$null) -join " ") -replace '.*version is\s*', ''
}

# Seuils tolérants : 32 Go physiques apparaissent souvent comme ~31,7 Go utilisables.
# Recommandation (même grille que l'application : js/kit.js et docs/GRILLE_MODELES.md)
if ($ram -ge 30 -and $vram -ge 12) { $palier = "confortable"; $modele = "ministral-3:8b" }
elseif ($ram -ge 15 -and $vram -ge 6) { $palier = "intermediaire"; $modele = "ministral-3:8b" }
else { $palier = "minimal"; $modele = "ministral-3:3b" }

$diag = [ordered]@{
  date = (Get-Date).ToString("dd/MM/yyyy HH:mm")
  systeme = "$($os.Caption) $($os.Version)".Trim()
  processeur = ("$($cpu.Name)".Trim() -replace "\s+", " ") + " ($($cpu.NumberOfLogicalProcessors) cœurs logiques)"
  ram_go = $ram
  gpu = $gpuNom
  vram_go = $vram
  vram_source = $vramSource
  apple_silicon = $false
  disque_libre_go = $disque
  ollama_installe = $installe
  ollama_integre = [bool]$Integre
  ollama_version = "$version".Trim()
  ollama_actif = $actif
  modeles = $modeles
  palier = $palier
  modele_recommande = $modele
}
[IO.File]::WriteAllText($Sortie, (ConvertTo-Json -InputObject $diag -Depth 4), $Utf8)

Write-Host ""
Write-Host "=== Diagnostic de votre ordinateur ===" -ForegroundColor Cyan
Write-Host ("Système          : " + $diag.systeme)
Write-Host ("Mémoire vive     : " + $ram + " Go")
Write-Host ("Carte graphique  : " + $(if ($gpuNom) { $gpuNom } else { "aucune détectée" }) + $(if ($vram) { " ($vram Go, source : $vramSource)" } else { "" }))
Write-Host ("Disque libre     : " + $disque + " Go")
Write-Host ("Ollama           : " + $(if ($actif -and $Integre) { "intégré au kit, en fonctionnement (version $version)" } elseif ($actif) { "en fonctionnement (version $version)" } elseif ($installe) { "installé mais arrêté" } else { "non installé" }))
Write-Host ("Modèles installés: " + $(if ($modeles.Count) { $modeles -join ", " } else { "aucun" }))
Write-Host ("Recommandation   : $modele (configuration $palier)") -ForegroundColor Green
if (-not ($modeles -contains $modele) -and -not ($modele -eq "ministral-3:8b" -and $modeles -contains "ministral-3:latest")) {
  Write-Host "  Pour l'installer (Internet nécessaire une seule fois) : ollama pull $modele" -ForegroundColor Yellow
}
Write-Host ("Résultat enregistré : " + $Sortie)
