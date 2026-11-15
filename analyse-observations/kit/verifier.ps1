<#
  Vérification d'intégrité du kit : compare chaque fichier à la liste SOMMES-SHA256.txt (racine du kit).
  Signale les fichiers manquants ou modifiés. Le dossier « donnees » (vos données) n'est pas vérifié.
#>
$ErrorActionPreference = "Stop"
$Racine = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$Liste = Join-Path $Racine "SOMMES-SHA256.txt"
if (-not (Test-Path -LiteralPath $Liste)) {
  Write-Host "Fichier SOMMES-SHA256.txt introuvable : vérification impossible." -ForegroundColor Yellow
  exit 1
}
$lignes = Get-Content -LiteralPath $Liste -Encoding UTF8 | Where-Object { $_ -match '^[0-9a-f]{64}  ' }
$total = $lignes.Count
$erreurs = 0
$n = 0
foreach ($l in $lignes) {
  $n++
  $attendu = $l.Substring(0, 64)
  $relatif = $l.Substring(66)
  $f = Join-Path $Racine ($relatif.Replace("/", "\"))
  Write-Progress -Activity "Vérification du kit" -Status $relatif -PercentComplete ([int](100 * $n / [math]::Max(1, $total)))
  if (-not (Test-Path -LiteralPath $f -PathType Leaf)) {
    Write-Host "MANQUANT : $relatif" -ForegroundColor Red
    $erreurs++
    continue
  }
  $h = (Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($h -ne $attendu) {
    Write-Host "MODIFIÉ  : $relatif" -ForegroundColor Red
    $erreurs++
  }
}
Write-Progress -Activity "Vérification du kit" -Completed
if ($erreurs) {
  Write-Host "$erreurs fichier(s) manquant(s) ou modifié(s) sur $total : recopiez le kit depuis l'original." -ForegroundColor Red
  exit 1
}
Write-Host "Kit intègre : $total fichiers vérifiés." -ForegroundColor Green
