## Presentation

Application de simulation pour un desk crypto, construite autour d'un flux
temps reel Coinbase, d'un moteur simple de tenue de marche et d'un tableau de
bord web pour suivre l'etat du carnet, des trades et du PnL.

## Fonctionnalites

- connexion WebSocket publique Coinbase sur `BTC-USD`
- reconstruction d'un carnet `level2`
- ingestion du flux de trades
- calcul du spread moyen, median, minimum et maximum pour `0.1`, `1`, `5`, `10 BTC`
- quoting simule autour du mid-price avec ajustement par position et volatilite
- contraintes de risque:
  - exposition notionnelle max `1_000_000 USD`
  - perte max `100_000 USD`
- backend FastAPI + frontend React/Vite
- cockpit web organise en vues `Overview`, `Market`, `Strategy`, `Quant Lab`
  et `Backtest`
- CI GitHub et kit de deploiement VM avec DuckDNS + nginx + systemd

## Architecture

```text
src/crypto_mm/
  common/      configuration
  marketdata/  order book, trades, Coinbase WebSocket
  analytics/   spread depth metrics
  portfolio/   position, fills, PnL
  risk/        limites de risque
  strategy/    market maker simule
  ui/          API FastAPI + serveur SPA React
frontend/
  src/         cockpit React
  dist/        build Vite servi par FastAPI
```

## Couverture du besoin

- donnees de marche en temps reel: carnet `level2` et flux de trades Coinbase
- visualisation live: top of book, trades recents, spread par profondeur
- logique de market making: quotes bid/ask autour du mid-price
- gestion d'inventaire: skew des quotes selon la position
- contraintes de risque: controle d'exposition et coupure sur perte max
- suivi PnL: executions, position ouverte, prix moyen, exposition, PnL realise
  et latent
- export: fichiers CSV pour spreads, fills et historique de portefeuille

## Demarrage local

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
npm --prefix frontend install
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

## Qualite du code

Le coeur Python est structure par domaine (`marketdata`, `analytics`,
`strategy`, `portfolio`, `risk`, `ui`) et documente par des docstrings courtes
sur les composants principaux pour faciliter la lecture et la revue.

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
