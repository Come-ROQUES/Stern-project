#!/bin/bash

set -euo pipefail

cd "$(dirname "$0")/.."

if [ -x ".venv/bin/ruff" ]; then
  RUFF=".venv/bin/ruff"
  MYPY=".venv/bin/mypy"
  PYTEST=".venv/bin/pytest"
else
  RUFF="ruff"
  MYPY="mypy"
  PYTEST="pytest"
fi

echo "1/3 ruff"
$RUFF check src tests

echo "2/3 mypy"
$MYPY src

echo "3/3 pytest"
$PYTEST -q

if [ -f "frontend/package.json" ]; then
  echo "4/4 frontend build"
  npm --prefix frontend run build
fi
