<#
  Serveur local minimal du kit « Analyse des observations » — version PowerShell (Windows 10/11).
  Aucune installation ni droit administrateur : utilise HttpListener, intégré à Windows (PowerShell 5.1 ou 7).
  Même API et mêmes règles de sécurité que kit/serveur.js et kit/serveur.py :
    - écoute sur http://localhost:<port>/ et n'accepte que les requêtes provenant de ce poste ;
    - écritures limitées au dossier « donnees » (liste blanche de noms, en-tête X-Kit: 1) ;
    - politique de sécurité (CSP) interdisant toute connexion hors du poste, sauf IA externe autorisée ;
    - aucune requête sortante, aucune clé d'API.
#>
param(
  [int]$Port = 3030,
  [string]$Donnees = "",
  [switch]$OuvrirNavigateur
)

$ErrorActionPreference = "Stop"
$Racine = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
if (-not $Donnees) { $Donnees = if ($env:KIT_DONNEES) { $env:KIT_DONNEES } else { Join-Path $Racine "..\donnees" } }
$Donnees = [IO.Path]::GetFullPath($Donnees)
New-Item -ItemType Directory -Force -Path $Donnees | Out-Null
$Version = "inconnue"
try { $Version = (Get-Content -Raw -Encoding UTF8 (Join-Path $Racine "VERSION")).Trim() } catch { }

$NomDonnee = '^[a-z0-9][a-z0-9_-]{0,63}\.(json|log|enc)$'
$HoteExterne = '^https://[a-z0-9.-]+(:\d{1,5})?$'
$TailleMax = 50MB
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$Types = @{
  ".html" = "text/html; charset=utf-8"; ".css" = "text/css; charset=utf-8"; ".js" = "text/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"; ".md" = "text/markdown; charset=utf-8"; ".txt" = "text/plain; charset=utf-8"
  ".csv" = "text/csv; charset=utf-8"; ".vtt" = "text/vtt; charset=utf-8"; ".svg" = "image/svg+xml"; ".png" = "image/png"
  ".ico" = "image/x-icon"; ".mp4" = "video/mp4"; ".woff2" = "font/woff2"; ".pdf" = "application/pdf"
}

function Lire-Config {
  $f = Join-Path $Donnees "config.json"
  try {
    $c = Get-Content -Raw -Encoding UTF8 $f | ConvertFrom-Json
    $hotes = @(@($c.hotes_externes) | Where-Object { $_ -is [string] -and $_ -cmatch $HoteExterne } | Select-Object -First 10)
    return @{ ia_externe = ([bool]$c.ia_externe -and $hotes.Count -gt 0); hotes_externes = $hotes }
  } catch {
    return @{ ia_externe = $false; hotes_externes = @() }
  }
}

function Politique {
  $c = Lire-Config
  $connect = @("'self'", "http://localhost:*", "http://127.0.0.1:*")
  if ($c.ia_externe) { $connect += $c.hotes_externes }
  return (@(
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
    "media-src 'self' blob:", "font-src 'self'", ("connect-src " + ($connect -join " ")), "object-src 'none'",
    "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'"
  ) -join "; ")
}

function Envoyer($ctx, [int]$code, [byte[]]$corps, [string]$type, [string]$cache = "no-cache") {
  $r = $ctx.Response
  $r.StatusCode = $code
  $r.ContentType = $type
  $r.Headers["Content-Security-Policy"] = Politique
  $r.Headers["X-Content-Type-Options"] = "nosniff"
  $r.Headers["Referrer-Policy"] = "no-referrer"
  $r.Headers["X-Frame-Options"] = "DENY"
  $r.Headers["Cache-Control"] = $cache
  $r.ContentLength64 = $corps.Length
  if ($ctx.Request.HttpMethod -ne "HEAD" -and $corps.Length -gt 0) { $r.OutputStream.Write($corps, 0, $corps.Length) }
}

function Json($ctx, [int]$code, $obj) {
  $texte = ConvertTo-Json -InputObject $obj -Compress -Depth 5
  Envoyer $ctx $code ($Utf8.GetBytes($texte)) "application/json; charset=utf-8" "no-store"
}

function Ecriture-Autorisee($req) {
  if ($req.Headers["X-Kit"] -ne "1") { return $false }
  $o = $req.Headers["Origin"]
  return (-not $o) -or $o -eq "http://localhost:$Port" -or $o -eq "http://127.0.0.1:$Port"
}

function Lire-Corps($req) {
  if ($req.ContentLength64 -gt $TailleMax) { throw "trop volumineux" }
  $ms = New-Object System.IO.MemoryStream
  $req.InputStream.CopyTo($ms)
  if ($ms.Length -gt $TailleMax) { throw "trop volumineux" }
  return $ms.ToArray()
}

function Ecrire-Atomique([string]$fichier, [byte[]]$contenu) {
  $tmp = "$fichier.tmp-$PID"
  [IO.File]::WriteAllBytes($tmp, $contenu)
  Move-Item -LiteralPath $tmp -Destination $fichier -Force
}

function Envoyer-Donnee($ctx, [string]$nom) {
  $f = Join-Path $Donnees $nom
  if (-not (Test-Path -LiteralPath $f -PathType Leaf)) { return Json $ctx 404 @{ erreur = "absent" } }
  $type = if ($nom.EndsWith(".log")) { "text/plain; charset=utf-8" } else { "application/json; charset=utf-8" }
  Envoyer $ctx 200 ([IO.File]::ReadAllBytes($f)) $type "no-store"
}

function Traiter-Api($ctx, [string]$chemin) {
  $req = $ctx.Request
  $m = $req.HttpMethod
  if ($chemin -eq "/api/etat" -and $m -eq "GET") {
    $c = Lire-Config
    return Json $ctx 200 @{ kit = $true; version = $Version; serveur = "PowerShell " + $PSVersionTable.PSVersion.ToString(); ia_externe = $c.ia_externe; hotes_externes = @($c.hotes_externes) }
  }
  if ($chemin -eq "/api/config") {
    if ($m -eq "GET") { $c = Lire-Config; return Json $ctx 200 @{ ia_externe = $c.ia_externe; hotes_externes = @($c.hotes_externes) } }
    if ($m -eq "PUT") {
      if (-not (Ecriture-Autorisee $req)) { return Json $ctx 403 @{ erreur = "écriture refusée" } }
      try { $c = $Utf8.GetString((Lire-Corps $req)) | ConvertFrom-Json } catch { return Json $ctx 400 @{ erreur = "JSON invalide" } }
      $hotes = @(@($c.hotes_externes) | Where-Object { $_ -is [string] -and $_ -cmatch $HoteExterne } | Select-Object -First 10)
      $actif = [bool]$c.ia_externe -and $hotes.Count -gt 0
      if (-not $c.ia_externe) { $hotes = @() }
      $config = @{ ia_externe = $actif; hotes_externes = $hotes; modifie = (Get-Date).ToUniversalTime().ToString("o") }
      Ecrire-Atomique (Join-Path $Donnees "config.json") ($Utf8.GetBytes((ConvertTo-Json -InputObject $config -Depth 5)))
      return Json $ctx 200 $config
    }
    return Json $ctx 405 @{ erreur = "méthode non autorisée" }
  }
  if ($chemin -eq "/api/diagnostic" -and $m -eq "GET") { return Envoyer-Donnee $ctx "diagnostic.json" }
  if ($chemin -match '^/api/donnees/([^/]+)$') {
    $nom = $Matches[1]
    if ($nom -cnotmatch $NomDonnee -or $nom -eq "config.json") { return Json $ctx 400 @{ erreur = "nom de fichier refusé" } }
    if ($m -eq "GET" -or $m -eq "HEAD") { return Envoyer-Donnee $ctx $nom }
    if (-not (Ecriture-Autorisee $req)) { return Json $ctx 403 @{ erreur = "écriture refusée" } }
    $f = Join-Path $Donnees $nom
    if ($m -eq "PUT") {
      try { $contenu = Lire-Corps $req } catch { return Json $ctx 413 @{ erreur = "fichier trop volumineux" } }
      Ecrire-Atomique $f $contenu
      return Json $ctx 200 @{ ok = $true; taille = $contenu.Length }
    }
    if ($m -eq "DELETE") {
      if (-not (Test-Path -LiteralPath $f)) { return Json $ctx 404 @{ erreur = "absent" } }
      Remove-Item -LiteralPath $f -Force
      return Json $ctx 200 @{ ok = $true }
    }
    return Json $ctx 405 @{ erreur = "méthode non autorisée" }
  }
  return Json $ctx 404 @{ erreur = "inconnu" }
}

function Traiter-Statique($ctx, [string]$chemin) {
  $m = $ctx.Request.HttpMethod
  if ($m -ne "GET" -and $m -ne "HEAD") { return Json $ctx 405 @{ erreur = "méthode non autorisée" } }
  if ($chemin -eq "/") { $chemin = "/index.html" }
  foreach ($s in $chemin.Split("/")) { if ($s.StartsWith(".")) { return Json $ctx 403 @{ erreur = "accès interdit" } } }
  $f = [IO.Path]::GetFullPath((Join-Path $Racine ($chemin.TrimStart("/").Replace("/", "\"))))
  if (-not $f.StartsWith($Racine.TrimEnd("\") + "\", [StringComparison]::OrdinalIgnoreCase)) { return Json $ctx 403 @{ erreur = "accès interdit" } }
  if (-not (Test-Path -LiteralPath $f -PathType Leaf)) { return Json $ctx 404 @{ erreur = "introuvable" } }
  $ext = [IO.Path]::GetExtension($f).ToLowerInvariant()
  $type = if ($Types.ContainsKey($ext)) { $Types[$ext] } else { "application/octet-stream" }
  Envoyer $ctx 200 ([IO.File]::ReadAllBytes($f)) $type
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try {
  $listener.Start()
} catch {
  Write-Host "Le port $Port est déjà utilisé ou indisponible. Le kit est peut-être déjà ouvert : http://localhost:$Port/" -ForegroundColor Yellow
  exit 2
}
Write-Host "Kit « Analyse des observations » $Version — http://localhost:$Port/" -ForegroundColor Green
Write-Host "Données de l'utilisateur : $Donnees"
Write-Host "Laissez cette fenêtre ouverte pendant l'utilisation (fermez-la pour arrêter le kit)."
if ($OuvrirNavigateur) { Start-Process "http://localhost:$Port/" }

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      $req = $ctx.Request
      $hote = ("" + $req.Headers["Host"]).ToLowerInvariant()
      if (-not $req.IsLocal -or ($hote -ne "localhost:$Port" -and $hote -ne "127.0.0.1:$Port")) {
        Json $ctx 403 @{ erreur = "hôte non autorisé" }
      } else {
        $chemin = [Uri]::UnescapeDataString($req.Url.AbsolutePath)
        if ($chemin.StartsWith("/api/")) { Traiter-Api $ctx $chemin } else { Traiter-Statique $ctx $chemin }
      }
    } catch {
      try { Json $ctx 500 @{ erreur = "erreur interne" } } catch { }
    } finally {
      try { $ctx.Response.OutputStream.Close() } catch { }
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
