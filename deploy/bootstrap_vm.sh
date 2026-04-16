#!/usr/bin/env bash

set -euo pipefail

APP_DIR="${1:-/opt/crypto-trading-desk-intern}"

echo "Bootstrapping ${APP_DIR}"

mkdir -p "${APP_DIR}"
cd "${APP_DIR}"

python3.11 -m venv .venv

if [ ! -f .env ]; then
  cp .env.example .env
fi

sudo cp deploy/crypto-mm.service /etc/systemd/system/crypto-mm.service
sudo systemctl daemon-reload
sudo systemctl enable crypto-mm
sudo systemctl restart crypto-mm

echo "Bootstrap complete"
