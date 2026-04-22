# Stern — Crypto Trading Desk

<img width="2850" height="1610" alt="image" src="https://github.com/user-attachments/assets/a68e1166-b2dc-4ee6-a60b-8cef87b9615e" />


Un desk de market making crypto complet, du flux Coinbase en temps reel
jusqu'au cockpit type terminal de trading. Python asynchrone en backend,
React avec design liquid-glass en frontend, deploye 24h/24 sur VM.

**Dashboard live : [stern-project.duckdns.org](https://stern-project.duckdns.org)**

## Livraison

- Documentation technique de handoff :
  [TECHNICAL_HANDOFF.md](docs/TECHNICAL_HANDOFF.md)

Le service tourne en continu sur une VM sous `systemd` derriere nginx, avec
deploiement automatique a chaque push sur `main` via GitHub Actions.

---

## Ce que fait l'application

### Temps reel Coinbase

- connexion WebSocket publique a `advanced-trade-ws.coinbase.com`
- souscription aux canaux `level2` et `market_trades` sur `BTC-USD`
- reconstruction incrementale du carnet d'ordres avec rafraichissement
  provisoire pendant le dump initial pour qu'une UI s'ouvre immediatement
- reconnexion automatique sur coupure, sans perdre l'etat applicatif

### Analyse de liquidite

- spread realise sur `0.1`, `1`, `5`, `10 BTC` de profondeur
- moyennes, medianes, min et max par profondeur, rafraichis en continu
- historique de spread roulant pour trace graphique
- regime du marche par profondeur (tight / balanced / wide) derive des
  moyennes glissantes

### Market making

- cotation symetrique autour du mid-price avec un spread de base parametrable
- skew des quotes en fonction de la position pour flatten l'inventaire
- adaptation du spread a la volatilite realisee (vol-adaptive quoting)
- simulation de fills a partir du trade feed public
- presets de recherche (Tight Maker, Baseline, Defensive) exposes dans le
  panneau Microstructure pour comparer des regimes de cotation

### Risque et suivi

- exposition notionnelle maximum : `1 000 000 USD`
- perte maximum : `100 000 USD` (10 % du capital initial)
- coupure automatique des quotes quand une limite est atteinte
- affichage live de la position BTC, du prix moyen d'entree, de l'exposition,
  du PnL realise et latent, de l'equity et du drawdown courants

### Export

- `/api/export/fills.csv` : journal complet des fills simules
- `/api/export/pnl.csv` : serie temporelle equity + PnL total
- `/api/export/spreads.csv` : historique de spread par profondeur

---

## Au-dela du scope

### Cockpit React type terminal

Interface organisee en onglets type salle de marches, conçue pour rester
lisible en un coup d'oeil et strictement contrainte a `100vw x 100vh` sans
scroll. Design **liquid-glass** sombre, typographie mono, accent neon vert.

- **Overview** : hero equity curve + KPI tiles avec popover liquid-glass
  (clic pour deployer sans decaler la grille, fermeture click-outside / Esc)
- **Pro Terminal** : L2 ladder 10 niveaux avec cross-highlight, courbe de
  profondeur interactive, trade tape, histogramme de trade flow, analytics
  de spread
- **Microstructure** : pression du carnet, CVD (cumulative volume delta),
  regimes de spread, desequilibre de flux, presets MM
- **Price Chart** : bougies OHLC derivees du mid-history, buckets 1 / 2 / 5 /
  15 / 30 secondes, overlays bid / ask et marqueurs de fills
- **Portfolio** : equity hero, position card, session flow, table des fills
- **Risk** : banner de statut pulse, jauges de limite (SVG), config active
- **System** : etat du flux Coinbase, throughput de messages, uptime de session
- **Export** : telechargement CSV des fills, de la serie PnL et des spreads
- **Paper Session Replay** (mode Backtest) : replay lite de la session MM en
  cours — return paper, PnL total, drawdown max, uptime des quotes, courbes
  equity et PnL sur les 60 derniers echantillons

### Architecture temps reel

- sampling du mid **a 10 Hz** decouple de la passe d'analytics plus lourde
  (4 Hz), pour un rendu de bougies fluide sans faire ramer les calculs de
  volatilite et de regime
- deque borne (`maxlen=1800`) pour conserver ~3 min d'historique mid sans
  fuite memoire
- diffusion de l'etat au frontend via **Server-Sent Events** avec fallback
  polling 500 ms automatique
- store singleton cote React : un seul poller / SSE pour N abonnes, premier
  snapshot reçu debloque tous les consommateurs en meme temps

### Alertes Telegram (opt-in)

Module `crypto_mm.notify.telegram` qui poste un message formate a chaque
transition de statut de risque (`ok` -> `breach`, ou inverse) avec mid,
position, exposition et PnL courants.

Activation via deux variables d'environnement :

```bash
CRYPTO_MM_TELEGRAM_BOT_TOKEN=123456:ABC-...   # @BotFather
CRYPTO_MM_TELEGRAM_CHAT_ID=987654321          # @userinfobot
```

Les deux champs vides -> notifier desactive silencieusement, aucune latence
ajoutee au hot path. Toute erreur reseau est log-and-swallow : une panne
cote Telegram ne bloque jamais la boucle de marche.

### Deploiement continu

- push sur `main` -> GitHub Actions build le frontend Vite
- archive le projet, SSH sur la VM, sync des fichiers, `pip install -e .`,
  restart du service `systemd`
- nginx reverse proxy + TLS Let's Encrypt en front
- healthcheck `curl /api/state` avant de valider le deploiement

### Qualite

- tests `pytest` sur le moteur market data, la construction du carnet, les
  limites de risque et le calcul de PnL
- typage `mypy --strict` sur le cote Python
- `eslint` + `tsc --noEmit` cote frontend
- `./scripts/check_before_push.sh` enchaine lint + type-check + tests avant
  chaque push

---

## Architecture

```text
src/crypto_mm/
  common/      configuration (pydantic-settings, env + .env)
  marketdata/  order book, trades, flux Coinbase WebSocket
  analytics/   metriques de spread par profondeur
  portfolio/   ledger, position moyenne, PnL realise / latent
  risk/        limites d'exposition et de perte
  strategy/    market maker avec skew et vol-adaptive
  notify/      notifier Telegram opt-in
  ui/          API FastAPI + SSE + export CSV
frontend/
  src/
    components/stern/  onglets du cockpit (panels.tsx, etc.)
    lib/sternApi.ts    store singleton + hook useSternState
    styles/glass.css   design tokens liquid-glass
  dist/                build Vite servi par FastAPI
deploy/
  crypto-mm.service    unit systemd
  nginx.conf           reverse proxy
.github/workflows/
  deploy.yml           build + SSH deploy sur push main
```

---

## Demarrage local

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env

npm --prefix frontend install
npm --prefix frontend run build

python -m crypto_mm.main
```

Puis ouvrir `http://127.0.0.1:8015`.

Pour travailler sur le frontend en hot-reload :

```bash
npm --prefix frontend run dev
```

---

## Stack

- **Python 3.11**, `asyncio`, `websockets`, `httpx`, `pydantic-settings`,
  `FastAPI`, `uvicorn`
- **React 18**, `TypeScript`, `Vite`, `Tailwind`, `lightweight-charts`
- **nginx**, `systemd`, GitHub Actions, DuckDNS, Let's Encrypt

---

## Configuration

Variables d'environnement prefixees `CRYPTO_MM_` (voir `.env.example`).

| variable                                | defaut                                 | role                                         |
| --------------------------------------- | -------------------------------------- | -------------------------------------------- |
| `PRODUCT_ID`                            | `BTC-USD`                              | paire tracke                                 |
| `WS_URL`                                | `wss://advanced-trade-ws.coinbase.com` | endpoint WebSocket                           |
| `INITIAL_CASH`                          | `1 000 000`                            | capital de depart                            |
| `MAX_NOTIONAL_EXPOSURE`                 | `1 000 000`                            | plafond d'exposition                         |
| `MAX_LOSS`                              | `100 000`                              | cut-off sur perte cumulee                    |
| `BASE_QUOTE_SPREAD_BPS`                 | `1.5`                                  | spread de cotation de base                   |
| `ORDER_SIZE_BTC`                        | `0.1`                                  | taille de chaque cote                        |
| `POSITION_SKEW_BPS_PER_BTC`             | `2.0`                                  | skew lineaire selon l'inventaire             |
| `VOL_ADAPTIVE_GAIN`                     | `0.15`                                 | gain du spread adaptatif en volatilite       |
| `VOL_ADAPTIVE_CAP_BPS`                  | `3.0`                                  | plafond de l'elargissement par volatilite    |
| `TELEGRAM_BOT_TOKEN` / `CHAT_ID`        | vide                                   | alertes Telegram (opt-in, vide = desactive)  |

---

## Licence

Usage educatif et demonstration. Pas de connexion broker reelle, uniquement
des fills simules sur trade feed public.
