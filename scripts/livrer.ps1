# Livraison d'Orisflow : tests, moteur, exécutable portable, autotest, copie dans Livrables\Dev.
# Utilisation : powershell -ExecutionPolicy Bypass -File scripts\livrer.ps1
$ErrorActionPreference = "Stop"
$racine = Split-Path $PSScriptRoot -Parent
Set-Location $racine
$destination = "E:\ORIS FINANCE SAVE DATA\SAVE DATA STAGIAIRE\TIOMELA DIFFO RICK\Documents\Julien NGUETSA\TechStack\Orisflow\Livrables\Dev"

# VS Code définit ELECTRON_RUN_AS_NODE=1 : Electron se comporterait alors comme un simple Node.js.
Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

function Etape($texte) { Write-Host "`n=== $texte ===" -ForegroundColor Cyan }
function Verifier($texte) { if ($LASTEXITCODE -ne 0) { throw "Échec : $texte" } }

Etape "Vérification des types"
npx tsc --noEmit; Verifier "types TypeScript"

Etape "Tests de l'interface (Vitest)"
npx vitest run; Verifier "tests de l'interface"

Etape "Tests du moteur (pytest)"
python -m pytest engine/tests -q; Verifier "tests du moteur"

Etape "Construction du moteur Python"
powershell -ExecutionPolicy Bypass -File engine/build_engine.ps1; Verifier "moteur Python"

Etape "Construction de l'exécutable portable"
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
# L'assemblage NSIS échoue parfois à rouvrir l'archive .7z qu'il vient d'écrire (verrou
# passager, antivirus — constaté le 09/10/2026) : une seconde tentative, archive supprimée.
npm run package
if ($LASTEXITCODE -ne 0) {
  Write-Host "Premier essai d'empaquetage en échec : nouvelle tentative dans 10 secondes." -ForegroundColor Yellow
  Start-Sleep -Seconds 10
  Remove-Item "$racine\release\*.7z" -ErrorAction SilentlyContinue
  npm run package
}
Verifier "exécutable portable"

Etape "Autotest de l'exécutable"
$rapport = Join-Path $env:TEMP "orisflow-autotest.json"
Remove-Item $rapport -ErrorAction SilentlyContinue
$env:ORISFLOW_AUTOTEST = $rapport
$processus = Start-Process -FilePath "$racine\release\Orisflow.exe" -PassThru -Wait
Remove-Item Env:\ORISFLOW_AUTOTEST
if (-not (Test-Path $rapport)) { throw "L'autotest n'a écrit aucun rapport (code $($processus.ExitCode))." }
$contenu = Get-Content $rapport -Raw -Encoding UTF8
Write-Host $contenu
$donnees = $contenu | ConvertFrom-Json
if ($donnees.erreur) { throw "Autotest en erreur : $($donnees.erreur)" }

Etape "Copie dans Livrables\Dev"
Copy-Item "$racine\release\Orisflow.exe" (Join-Path $destination "Orisflow.exe") -Force
$copie = Get-Item (Join-Path $destination "Orisflow.exe")
Write-Host ("Orisflow.exe copié : {0} ({1:N1} Mo)" -f $copie.FullName, ($copie.Length / 1MB))
