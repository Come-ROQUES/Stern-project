# Stern - Technical Handoff

## 1. Project summary

Stern is a full-stack crypto market-making simulator built around the public
Coinbase feed for `BTC-USD`. The application ingests level 2 order book data
and public trades in real time, reconstructs an in-memory book, derives live
microstructure analytics, runs a paper market-making engine, and exposes the
result through a full-screen trading cockpit.

This repository is intentionally designed as a standalone personal project:

- no proprietary broker connectivity
- no private production pipelines
- no confidential strategy assets
- no secrets committed to the repository

The result is a technically serious but self-contained delivery that can be
reviewed, run locally, and deployed publicly.

## 2. Product scope

### Included

- real-time Coinbase market data ingestion
- order book reconstruction from `level2`
- trade tape ingestion from `market_trades`
- live spread analytics at multiple depth tiers
- paper market maker with:
  spread configuration,
  inventory skew,
  volatility-adaptive widening,
  simulated fills
- portfolio accounting:
  cash,
  inventory,
  realized PnL,
  unrealized PnL,
  equity,
  drawdown
- risk controls:
  max notional exposure,
  max loss,
  quote shutdown on breach
- React terminal-style dashboard
- CSV export endpoints
- VM deployment with `systemd`, `nginx`, TLS and GitHub Actions

### Excluded

- real order routing
- private broker APIs
- persistent production database
- proprietary alpha models
- confidential infrastructure or internal schemas

## 3. High-level architecture

```text
Coinbase WebSocket
  -> MarketDataService
  -> OrderBook + Trade Tape
  -> Spread / vol / microstructure analytics
  -> Paper MarketMaker
  -> Portfolio + Risk evaluation
  -> FastAPI state snapshot + SSE stream
  -> React cockpit
```

### Backend modules

```text
src/crypto_mm/
  common/settings.py        typed runtime configuration
  marketdata/orderbook.py   level 2 in-memory order book
  marketdata/coinbase_ws.py live feed orchestration and state publication
  analytics/spread.py       depth-based spread analytics
  strategy/market_maker.py  paper quoting and fill simulation
  portfolio/ledger.py       position, cash and PnL accounting
  risk/limits.py            exposure / loss guardrails
  notify/telegram.py        optional alerting on risk state transitions
  ui/app.py                 FastAPI API, SSE and CSV exports
```

### Frontend modules

```text
frontend/src/
  lib/sternApi.ts                 shared live-state store
  components/stern/panels.tsx     main cockpit panels
  styles/glass.css                visual tokens and glass styling
```

## 4. Runtime data flow

## 4.1 Feed ingestion

The backend opens a WebSocket connection to Coinbase and subscribes to:

- `level2`
- `market_trades`

The service processes each incoming message inside
`src/crypto_mm/marketdata/coinbase_ws.py`.

Important implementation details:

- level 2 snapshots are replayed into an in-memory order book
- incremental updates mutate only impacted levels
- the event loop yields regularly with `await asyncio.sleep(0)` to avoid
  starving `uvicorn` during bursts
- the dashboard can expose a provisional top of book before snapshot hydration
  fully completes

This last point matters because it keeps the UI responsive even while the
initial order book dump is still being applied.

## 4.2 State derivation

For each market message, the service updates fast-path state first:

- order book
- recent trades
- quote preview
- publish trigger

Heavier analytics are throttled on a separate cadence:

- realized volatility
- spread-by-depth statistics
- backtest-lite snapshots
- portfolio history
- risk transition notifications

This decoupling prevents expensive analytics from degrading perceived UI
freshness.

## 4.3 Frontend delivery

The frontend consumes application state through:

- `GET /api/state`
- `GET /api/state/stream`

The primary mechanism is `Server-Sent Events`. A polling fallback remains
available if the stream disconnects or is unsupported.

The shared store in `frontend/src/lib/sternApi.ts` is implemented as a
singleton so that:

- one stream or poll loop serves all subscribers
- several panels do not multiply network traffic
- the first successful snapshot unblocks all mounted consumers at once

## 5. Market data and analytics

## 5.1 Order book

`OrderBook` stores bids and asks in memory and exposes:

- best bid / ask
- mid-price
- top `n` levels for rendering
- sweep cost / proceeds for depth analytics

This enables both UI rendering and liquidity-aware calculations without a
database dependency.

## 5.2 Spread analytics

The project computes liquidity-aware spread estimates for multiple synthetic
trade sizes:

- `0.1 BTC`
- `1 BTC`
- `5 BTC`
- `10 BTC`

For each depth tier, the app tracks:

- average
- median
- minimum
- maximum
- latest observed value

This gives a richer view than top-of-book spread alone.

## 5.3 Realized volatility

Volatility is estimated from recent mid-price returns in basis points. The
result feeds the quoting engine so that spreads can widen when market noise
increases.

## 6. Paper market maker

`src/crypto_mm/strategy/market_maker.py` implements the quoting logic.

### Inputs

- current mid-price
- realized volatility estimate
- current inventory
- risk limits

### Quote construction

The engine builds a symmetric quote around mid-price and then adjusts it with
two effects:

1. base spread:
   the nominal quoting width configured in bps
2. inventory skew:
   shifts the quote to lean against existing inventory
3. volatility premium:
   widens the spread when realized volatility rises above the base regime

### Fill simulation

The engine does not send orders. Instead, it simulates fills from the public
trade tape:

- a sell trade at or through the quoted bid is treated as a buy fill
- a buy trade at or through the quoted ask is treated as a sell fill

This preserves the pedagogical value of a market-making engine while staying
fully detached from private execution systems.

## 7. Portfolio and risk

## 7.1 Portfolio accounting

`PortfolioState` tracks:

- cash balance
- BTC inventory
- average entry price
- realized PnL
- unrealized PnL
- current equity

The ledger correctly handles:

- increasing an existing position
- partially reducing a position
- fully flattening a position
- flipping from long to short or short to long

## 7.2 Risk controls

`RiskLimits` enforces two simple but effective guardrails:

- maximum notional exposure
- maximum cumulative loss

If a limit is breached, the engine disables quoting and surfaces the reason to
the UI. Optional Telegram notifications can be triggered on state transitions.

## 8. Frontend cockpit

The UI is designed as a terminal-style full-screen dashboard with no outer page
scroll. The main implementation lives in
`frontend/src/components/stern/panels.tsx`.

### Main views

- `Overview`
- `Pro Terminal`
- `Microstructure`
- `Strategy`
- `Price Chart`
- `Portfolio`
- `Risk`
- `System`
- `Export`
- `Backtest lite`

### UI principles

- dense but readable information layout
- immediate rendering on partial state
- full-screen, no-scroll shell
- chart-heavy interface optimized for fast inspection
- responsive behavior with internal scroll only where strictly necessary

## 9. API surface

### State

- `GET /api/state`
- `GET /api/state/stream`

### Exports

- `GET /api/export/fills.csv`
- `GET /api/export/pnl.csv`
- `GET /api/export/spreads.csv`

## 10. Deployment architecture

The target deployment uses:

- a Linux VM
- `systemd` for process supervision
- `nginx` as reverse proxy
- DuckDNS public domain
- Let's Encrypt TLS certificates
- GitHub Actions for automatic deployment after push to `main`

### Live endpoint

https://stern-project.duckdns.org

### Deployment flow

```text
git push main
  -> GitHub Actions build frontend
  -> sync files to VM over SSH
  -> refresh Python environment
  -> restart systemd service
  -> nginx serves updated build
```

The detailed operational procedure is documented in
`docs/DEPLOY_DUCKDNS.md`.

## 11. Quality controls

### Backend

- `pytest`
- `mypy --strict`
- `ruff`

### Frontend

- `tsc --noEmit`
- project tests under `frontend/src/**/*.test.*`

### Unified check

`./scripts/check_before_push.sh`

## 12. Design choices and rationale

### Why SSE plus polling fallback

SSE is simpler than a custom frontend WebSocket client for one-way state
delivery and works well for dashboard refresh. Polling stays available as a
resilience fallback.

### Why sample the mid-price separately

The chart wants dense price continuity, while the analytics stack can tolerate
lower frequency updates. Splitting these cadences improves perceived smoothness
without overloading the analytics path.

### Why a singleton frontend store

The dashboard mounts many panels at once. A per-panel fetch loop would multiply
HTTP traffic and create uneven loading states. A shared store keeps transport
costs predictable and UI startup consistent.

### Why a paper execution model

The project is intended for demonstration, review and discussion. Simulated
fills provide realistic downstream behavior while keeping the repository safe
and reviewable.

## 13. Known limitations

- fills are inferred from the public tape, not matched from private execution
- no persistent database or historical replay service
- current market scope is centered on `BTC-USD`
- backtest-lite is a session replay aid, not a full research platform
- deployment targets a single VM rather than a multi-node architecture

## 14. Reviewer quick-start

### Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
npm --prefix frontend install
npm --prefix frontend run build
python -m crypto_mm.main
```

Open:

`http://127.0.0.1:8015`

### Useful files to inspect first

- `README.md`
- `src/crypto_mm/marketdata/coinbase_ws.py`
- `src/crypto_mm/strategy/market_maker.py`
- `src/crypto_mm/portfolio/ledger.py`
- `src/crypto_mm/ui/app.py`
- `frontend/src/lib/sternApi.ts`
- `frontend/src/components/stern/panels.tsx`

## 15. Delivery links

- Site: https://stern-project.duckdns.org
- Repo: https://github.com/Come-ROQUES/Stern-project
- Video: https://youtu.be/0U57Jqk5TsA?si=MAavSLcZWzhSgUKH
