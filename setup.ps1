# One-command setup for NotebookMind (Runcell) — Windows PowerShell.
# Creates a Python venv, installs JupyterLab, builds the extension, installs it
# in dev mode, and copies .env so the app runs in connected mode (real backend).
#
# If you get an execution-policy error, run once:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command python -ErrorAction SilentlyContinue)) { Write-Error "python not found - install Python >= 3.10"; exit 1 }
if (-not (Get-Command node   -ErrorAction SilentlyContinue)) { Write-Error "node not found - install Node.js >= 18"; exit 1 }

Write-Host "==> [1/6] Creating virtual environment (venv\)"
if (-not (Test-Path venv)) { python -m venv venv }
& .\venv\Scripts\python.exe -m pip install --upgrade pip | Out-Null

Write-Host "==> [2/6] Installing JupyterLab (may take a minute)"
& .\venv\Scripts\pip.exe install jupyterlab

Write-Host "==> [3/6] Installing JS dependencies"
& .\venv\Scripts\jlpm.exe install

Write-Host "==> [4/6] Building the extension (TypeScript -> bundle)"
& .\venv\Scripts\jlpm.exe run build

Write-Host "==> [5/6] Installing the Python package + linking the extension"
& .\venv\Scripts\pip.exe install -e .
& .\venv\Scripts\jupyter.exe labextension develop . --overwrite | Out-Null

Write-Host "==> [6/6] Configuring the backend (.env)"
if (Test-Path .env) {
  Write-Host "    .env already exists - keeping it."
} else {
  Copy-Item .env.example .env
  Write-Host "    Copied .env.example -> .env (connected mode)."
}

Write-Host ""
Write-Host "Setup complete."
Write-Host "  Start the app:   .\run.ps1        (or: .\venv\Scripts\jupyter.exe lab)"
Write-Host "  Then open the printed URL and sign in - see README section 3 for test accounts."
Write-Host "  Optional: to enable real AI, put a Gemini/Anthropic key in .env (GEMINI_API_KEY=...)."
