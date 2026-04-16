#!/usr/bin/env bash

set -euo pipefail

APP_DIR="${1:-/opt/crypto-trading-desk-intern}"
BRANCH="${2:-main}"

echo "Bootstrapping ${APP_DIR} from branch ${BRANCH}"

if [ ! -d "${APP_DIR}/.git" ]; then
  git clone https://github.com/Come-ROQUES/crypto-trading-desk-intern.git "${APP_DIR}"
fi

cd "${APP_DIR}"
git fetch origin
git checkout "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

python3.11 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -e .

if [ ! -f .env ]; then
  cp .env.example .env
fi

sudo cp deploy/crypto-mm.service /etc/systemd/system/crypto-mm.service
sudo systemctl daemon-reload
sudo systemctl enable crypto-mm
sudo systemctl restart crypto-mm

echo "Bootstrap complete"

