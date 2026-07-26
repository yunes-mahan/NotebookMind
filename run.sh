#!/usr/bin/env bash
# Start NotebookMind (Runcell) — macOS / Linux. Run ./setup.sh once first.
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -x venv/bin/jupyter ]; then
  echo "venv not found — run ./setup.sh first."; exit 1
fi
exec ./venv/bin/jupyter lab
