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
- CI GitHub et base de deploiement GitHub-first pour VM

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

## Frontiere de confidentialite

Voir `docs/CONFIDENTIALITY_BOUNDARY.md`.

