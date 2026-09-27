# Wdrożenie API (Apps Script) i podpięcie frontu — jednym poleceniem:
#   powershell -ExecutionPolicy Bypass -File wdroz.ps1
# Co robi: (1) tworzy projekt Apps Script, jeśli go nie ma, (2) clasp push,
# (3) tworzy albo aktualizuje wdrożenie Web App (ten sam URL), (4) wpisuje URL do docs/config.js,
# (5) commit + git push (GitHub Pages opublikuje front).
# Plik zapisany jako UTF-8 z BOM (wymaga tego Windows PowerShell 5.1).
# Nie dotyka sekretów: KOD_RODZINNY i PIN_EDYCJI ustawiasz ręcznie w Script Properties.

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$as = Join-Path $root 'apps-script'
$cfg = Join-Path $root 'docs\config.js'
$claspJson = Join-Path $as '.clasp.json'

function Clasp { & clasp.cmd @args; if ($LASTEXITCODE -ne 0) { throw "clasp $($args -join ' ') zakończył się błędem ($LASTEXITCODE)" } }

if (-not (Test-Path (Join-Path $HOME '.clasprc.json'))) {
  Write-Host 'Brak logowania clasp. Otwieram przeglądarkę — zaloguj się kontem Google z arkuszem i kliknij Zezwól.' -ForegroundColor Yellow
  Clasp login
}

Push-Location $as
try {
  $sid = ''
  if (Test-Path $claspJson) { $sid = (Get-Content $claspJson -Raw | ConvertFrom-Json).scriptId }
  if (-not $sid) {
    Write-Host 'Tworzę projekt Apps Script (standalone)…'
    $manifest = [IO.File]::ReadAllText((Join-Path $as 'appsscript.json'))
    if (Test-Path $claspJson) { Remove-Item $claspJson }
    Clasp create-script --type standalone --title 'Pływalnia Skrodzkich — API' --rootDir .
    [IO.File]::WriteAllText((Join-Path $as 'appsscript.json'), $manifest)   # clasp nadpisuje manifest domyślnym
    $sid = (Get-Content $claspJson -Raw | ConvertFrom-Json).scriptId
  }
  Write-Host "scriptId: $sid"
  Clasp push --force

  $cur = [regex]::Match([IO.File]::ReadAllText($cfg), 'macros/s/([\w-]+)/exec').Groups[1].Value
  $desc = 'wdroz.ps1 ' + (Get-Date -Format 'yyyy-MM-dd HH:mm')
  if ($cur) {
    Write-Host "Aktualizuję wdrożenie $cur…"
    Clasp update-deployment $cur --description $desc
    $dep = $cur
  } else {
    Write-Host 'Tworzę wdrożenie Web App…'
    $out = (& clasp.cmd create-deployment --description $desc) -join "`n"
    Write-Host $out
    if ($LASTEXITCODE -ne 0) { throw 'clasp create-deployment zakończył się błędem' }
    $dep = [regex]::Match($out, 'AKfy[\w-]+').Value
    if (-not $dep) { throw 'Nie znalazłem identyfikatora wdrożenia w odpowiedzi clasp.' }
  }
} finally { Pop-Location }

$url = "https://script.google.com/macros/s/$dep/exec"
$js = [IO.File]::ReadAllText($cfg) -replace "apiUrl:\s*'[^']*'", "apiUrl: '$url'"
[IO.File]::WriteAllText($cfg, $js)
Write-Host "URL Web Appa: $url" -ForegroundColor Green

Push-Location $root
try {
  git add docs/config.js apps-script/.clasp.json apps-script/appsscript.json
  git diff --cached --quiet
  if ($LASTEXITCODE -ne 0) {
    git commit -m "Wdrożenie API: adres Web Appa w config.js" | Out-Null
    git push
  }
} finally { Pop-Location }

Write-Host ''
Write-Host 'Gotowe. Jeśli to pierwsze wdrożenie: otwórz edytor (clasp open-script w apps-script),' -ForegroundColor Cyan
Write-Host 'uruchom funkcję autoryzuj i zatwierdź uprawnienia, potem ustaw Script Properties.' -ForegroundColor Cyan
