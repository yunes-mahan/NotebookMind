#!/usr/bin/env bash
# One-command setup for NotebookMind (Runcell) — macOS / Linux.
# Creates a Python venv, installs JupyterLab, builds the extension, installs it
# in dev mode, and copies .env so the app runs in connected mode (real backend).
set -euo pipefail
cd "$(dirname "$0")"

command -v python3 >/dev/null || { echo "ERROR: python3 not found — install Python >= 3.10"; exit 1; }
command -v node    >/dev/null || { echo "ERROR: node not found — install Node.js >= 18"; exit 1; }

echo "==> [1/6] Creating virtual environment (venv/)"
[ -d venv ] || python3 -m venv venv
./venv/bin/python -m pip install --upgrade pip >/dev/null

echo "==> [2/6] Installing JupyterLab (may take a minute)"
./venv/bin/pip install -q jupyterlab

echo "==> [3/6] Installing JS dependencies"
./venv/bin/jlpm install

echo "==> [4/6] Building the extension (TypeScript -> bundle)"
./venv/bin/jlpm run build

echo "==> [5/6] Installing the Python package (registers the extension)"
./venv/bin/pip install -q -e .
# Best-effort live-reload link for older JupyterLab; harmless if it no-ops on
# newer versions (pip install -e . already registers the extension).
./venv/bin/jupyter labextension develop . --overwrite >/dev/null 2>&1 \
  || echo "    (dev-link step skipped — extension already installed via pip)"

echo "==> [6/6] Configuring the backend (.env)"
if [ -f .env ]; then
  echo "    .env already exists — keeping it."
else
  cp .env.example .env
  echo "    Copied .env.example -> .env (connected mode)."
fi

echo ""
echo "Setup complete."
echo "  Start the app:   ./run.sh        (or: ./venv/bin/jupyter lab)"
echo "  Then open the printed URL and sign in — see README section 3 for test accounts."
echo "  Optional: to enable real AI, put a Gemini/Anthropic key in .env (GEMINI_API_KEY=...)."
