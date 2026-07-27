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

Write-Host "==> [1/7] Creating virtual environment (venv\)"
if (-not (Test-Path venv)) { python -m venv venv }
& .\venv\Scripts\python.exe -m pip install --upgrade pip | Out-Null

Write-Host "==> [2/7] Installing Python deps: JupyterLab + kernel + numpy/pandas/matplotlib (may take a minute)"
& .\venv\Scripts\pip.exe install -r requirements.txt

Write-Host "==> [3/7] Registering the venv Python as the notebook kernel"
# CRITICAL: bind the 'python3' kernel to THIS venv's interpreter (absolute path)
# so notebook cells run against the venv where numpy/pandas/matplotlib live -
# not some other 'python' on PATH. Without this, every run is a ModuleNotFoundError.
& .\venv\Scripts\python.exe -m ipykernel install --sys-prefix --name python3 --display-name "Python 3 (NotebookMind)" | Out-Null

Write-Host "==> [4/7] Installing JS dependencies"
& .\venv\Scripts\jlpm.exe install

Write-Host "==> [5/7] Building the extension (TypeScript -> bundle)"
& .\venv\Scripts\jlpm.exe run build

Write-Host "==> [6/7] Installing the Python package (registers the extension)"
& .\venv\Scripts\pip.exe install -e .
# Best-effort live-reload link for older JupyterLab; harmless if it no-ops on
# newer versions (pip install -e . already registers the extension).
try { & .\venv\Scripts\jupyter.exe labextension develop . --overwrite 2>$null | Out-Null }
catch { Write-Host "    (dev-link step skipped - extension already installed via pip)" }

Write-Host "==> [7/7] Configuring the backend (.env)"
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
