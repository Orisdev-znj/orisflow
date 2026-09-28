# Fabrique engine\dist\orisflow-engine.exe (moteur Python autonome, sans Python à installer).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
python -m PyInstaller --noconfirm --onefile --name orisflow-engine `
    --distpath dist --workpath build --specpath build run_engine.py
if (-not (Test-Path "dist\orisflow-engine.exe")) { throw "Le moteur n'a pas été construit." }
Write-Host "Moteur construit : $PSScriptRoot\dist\orisflow-engine.exe"
