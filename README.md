# Crypto Trading Desk Intern Exercise

Projet Python pour un exercice d'entretien en algo trading crypto.

Le socle reprend des principes d'architecture inspires de FRACTAL, mais sans
embarquer de logique de strategie proprietaire, d'integration IBKR, de
workflows internes, ni de donnees confidentielles.

## Fonctionnalites

- connexion WebSocket publique Coinbase sur `BTC-USD`
- reconstruction d'un carnet `level2`
- ingestion du flux de trades
- calcul du spread moyen, median, min, max pour `0.1`, `1`, `5`, `10 BTC`
- market making simule autour du mid-price
- skew des quotes en fonction de la position
- controles de risque:
  - exposition notionnelle max `1_000_000 USD`
  - perte max `100_000 USD`
- dashboard web leger via FastAPI
- dashboard multi-onglets type desk:
  - `Overview`
  - `Market`
  - `Strategy`
  - `Quant Lab`
  - `Backtest`
- CI GitHub et deploiement GitHub-first pour VM
- kit de publication web avec DuckDNS + nginx + systemd

## Architecture

```text
src/crypto_mm/
  common/      configuration
  marketdata/  order book, trades, Coinbase WebSocket
  analytics/   spread depth metrics
  portfolio/   position, fills, PnL
  risk/        limites de risque
  strategy/    market maker simule
  ui/          API FastAPI + dashboard HTML
```

## Demarrage local

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
python -m crypto_mm.main
```

Puis ouvrir `http://127.0.0.1:8015`.

## Qualite

```bash
./scripts/check_before_push.sh
```

## Publication Internet

Le repo contient un kit pour exposition publique sur une VM:

- workflow GitHub Actions de deploiement apres push sur `main`
- service `systemd` dans `deploy/crypto-mm.service`
- reverse proxy nginx dans `deploy/nginx.conf`
- runbook DuckDNS + TLS dans [docs/DEPLOY_DUCKDNS.md](docs/DEPLOY_DUCKDNS.md)

## Frontiere de confidentialite

Voir `docs/CONFIDENTIALITY_BOUNDARY.md`.

## Workflow recommande

```bash
git checkout -b feat/website-rollout
# modifications
./scripts/check_before_push.sh
git add -A
git commit -m "feat: prepare duckdns deployment"
git push -u origin feat/website-rollout
```

Puis merge de la PR vers `main` pour laisser GitHub Actions deployer.
