# Start NotebookMind (Runcell) — Windows PowerShell. Run .\setup.ps1 once first.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path .\venv\Scripts\jupyter.exe)) {
  Write-Error "venv not found - run .\setup.ps1 first."; exit 1
}
& .\venv\Scripts\jupyter.exe lab
