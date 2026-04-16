from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.responses import HTMLResponse

from crypto_mm.common.settings import settings
from crypto_mm.marketdata.coinbase_ws import MarketDataService

service = MarketDataService(settings=settings)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    task = asyncio.create_task(service.run_forever())
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


app = FastAPI(title="Crypto Trading Desk Intern", lifespan=lifespan)


@app.get("/api/state")
async def api_state() -> dict[str, object]:
    return await service.state_snapshot()


@app.get("/", response_class=HTMLResponse)
async def home() -> str:
    return """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Crypto Trading Desk Intern</title>
  <style>
    :root {
      --bg: #08111d;
      --panel: rgba(18, 32, 51, 0.82);
      --border: rgba(141, 191, 255, 0.18);
      --text: #ecf3ff;
      --muted: #9fb5d1;
      --buy: #76e39c;
      --sell: #ff8f8f;
      --accent: #7cc5ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(55, 130, 255, 0.18), transparent 28%),
        radial-gradient(circle at top right, rgba(21, 201, 167, 0.14), transparent 26%),
        linear-gradient(180deg, #071019, #0c1624 46%, #101d2d);
      min-height: 100vh;
    }
    .wrap {
      max-width: 1360px;
      margin: 0 auto;
      padding: 24px;
    }
    .hero {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: end;
      margin-bottom: 18px;
    }
    .title {
      font-size: clamp(28px, 4vw, 52px);
      font-weight: 700;
      letter-spacing: -0.04em;
      margin: 0;
    }
    .sub { color: var(--muted); margin-top: 8px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 16px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 20px;
      backdrop-filter: blur(14px);
      padding: 18px;
      box-shadow: 0 16px 50px rgba(0,0,0,0.24);
    }
    .span-3 { grid-column: span 3; }
    .span-4 { grid-column: span 4; }
    .span-6 { grid-column: span 6; }
    .span-8 { grid-column: span 8; }
    .span-12 { grid-column: span 12; }
    h2 { margin: 0 0 14px; font-size: 15px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.12em; }
    .metric { font-size: 30px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,0.08); text-align: right; }
    th:first-child, td:first-child { text-align: left; }
    .buy { color: var(--buy); }
    .sell { color: var(--sell); }
    .pill {
      display: inline-block;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(124, 197, 255, 0.14);
      color: var(--accent);
      font-size: 12px;
    }
    @media (max-width: 980px) {
      .span-3, .span-4, .span-6, .span-8 { grid-column: span 12; }
      .hero { flex-direction: column; align-items: start; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <div>
        <h1 class="title">BTC/USD Market Making Lab</h1>
        <div class="sub">Live Coinbase feed, spread analytics, simulated fills, risk-aware quoting.</div>
      </div>
      <div class="pill" id="status">booting</div>
    </div>
    <div class="grid">
      <section class="card span-3"><h2>Mid Price</h2><div class="metric" id="mid">-</div></section>
      <section class="card span-3"><h2>Position</h2><div class="metric" id="pos">-</div></section>
      <section class="card span-3"><h2>Exposure</h2><div class="metric" id="exp">-</div></section>
      <section class="card span-3"><h2>Total P&L</h2><div class="metric" id="pnl">-</div></section>

      <section class="card span-6"><h2>Order Book</h2><div id="book"></div></section>
      <section class="card span-6"><h2>Spread Metrics</h2><div id="spreads"></div></section>

      <section class="card span-6"><h2>Recent Trades</h2><div id="trades"></div></section>
      <section class="card span-6"><h2>Simulated Fills & Quote</h2><div id="fills"></div></section>
    </div>
  </div>
  <script>
    const fmt = (x, d = 2) => x == null ? "-" : Number(x).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
    const el = (id) => document.getElementById(id);

    function renderTable(headers, rows) {
      const head = headers.map(h => `<th>${h}</th>`).join("");
      const body = rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("");
      return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    }

    async function tick() {
      const res = await fetch("/api/state");
      const data = await res.json();
      const portfolio = data.portfolio || {};

      el("status").textContent = data.risk_status || "unknown";
      el("mid").textContent = fmt(data.mid_price, 2);
      el("pos").textContent = `${fmt(portfolio.position_btc, 4)} BTC`;
      el("exp").textContent = `$${fmt(Math.abs(portfolio.exposure_usd || 0), 2)}`;
      el("pnl").textContent = `$${fmt((portfolio.realized_pnl || 0) + (portfolio.unrealized_pnl || 0), 2)}`;

      const bookRows = [];
      (data.book?.asks || []).slice().reverse().forEach(level => {
        bookRows.push([`<span class="sell">ASK</span>`, fmt(level.price, 2), fmt(level.size, 4)]);
      });
      (data.book?.bids || []).forEach(level => {
        bookRows.push([`<span class="buy">BID</span>`, fmt(level.price, 2), fmt(level.size, 4)]);
      });
      el("book").innerHTML = renderTable(["Side", "Price", "Size"], bookRows);

      const spreadRows = Object.entries(data.spread_metrics || {}).map(([size, stats]) => [
        size,
        fmt(stats.last, 2),
        fmt(stats.avg, 2),
        fmt(stats.median, 2),
        fmt(stats.min, 2),
        fmt(stats.max, 2),
        stats.samples ?? 0,
      ]);
      el("spreads").innerHTML = renderTable(["Depth", "Last", "Avg", "Median", "Min", "Max", "N"], spreadRows);

      const tradeRows = (data.recent_trades || []).slice(0, 12).map(trade => [
        `<span class="${trade.side === "buy" ? "buy" : "sell"}">${trade.side}</span>`,
        fmt(trade.price, 2),
        fmt(trade.size, 4),
        new Date(trade.ts).toLocaleTimeString(),
      ]);
      el("trades").innerHTML = renderTable(["Side", "Price", "Size", "Time"], tradeRows);

      const fills = data.fills || [];
      const quote = data.quote;
      const fillRows = fills.slice(0, 10).map(fill => [
        `<span class="${fill.side === "buy" ? "buy" : "sell"}">${fill.side}</span>`,
        fmt(fill.price, 2),
        fmt(fill.size, 4),
        fill.reason,
      ]);
      let quoteHtml = "<p>No active quote</p>";
      if (quote) {
        quoteHtml = `<p>Bid ${fmt(quote.bid_price, 2)} x ${fmt(quote.bid_size, 4)} | Ask ${fmt(quote.ask_price, 2)} x ${fmt(quote.ask_size, 4)}</p>`;
      }
      el("fills").innerHTML = quoteHtml + renderTable(["Side", "Price", "Size", "Reason"], fillRows);
    }

    tick();
    setInterval(tick, 1200);
  </script>
</body>
</html>
"""
