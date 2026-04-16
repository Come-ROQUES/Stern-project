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
  <title>Fractal Crypto Desk</title>
  <style>
    :root {
      --bg: #06111b;
      --bg-2: #0b1725;
      --panel: rgba(12, 24, 38, 0.92);
      --panel-soft: rgba(18, 33, 50, 0.82);
      --border: rgba(123, 176, 224, 0.18);
      --text: #ecf4ff;
      --muted: #89a2bf;
      --accent: #71c4ff;
      --accent-2: #7ef0cb;
      --buy: #74e3a2;
      --sell: #ff8c8c;
      --warn: #ffd479;
      --shadow: 0 18px 60px rgba(0, 0, 0, 0.34);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(43, 114, 255, 0.18), transparent 24%),
        radial-gradient(circle at top right, rgba(0, 211, 173, 0.12), transparent 28%),
        linear-gradient(180deg, #06111b, #0b1321 45%, #0d1827);
    }
    .app {
      display: grid;
      grid-template-columns: 280px 1fr;
      min-height: 100vh;
    }
    .sidebar {
      border-right: 1px solid var(--border);
      background: rgba(5, 12, 19, 0.7);
      backdrop-filter: blur(20px);
      padding: 28px 20px;
    }
    .brand {
      margin-bottom: 28px;
    }
    .brand h1 {
      margin: 0;
      font-size: 28px;
      letter-spacing: -0.04em;
    }
    .brand p {
      margin: 8px 0 0;
      color: var(--muted);
      line-height: 1.5;
      font-size: 14px;
    }
    .nav {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .nav button {
      border: 1px solid transparent;
      background: rgba(255, 255, 255, 0.02);
      color: var(--text);
      text-align: left;
      padding: 14px 16px;
      border-radius: 16px;
      cursor: pointer;
      transition: 180ms ease;
    }
    .nav button:hover,
    .nav button.active {
      background: linear-gradient(135deg, rgba(35, 81, 140, 0.42), rgba(14, 42, 67, 0.95));
      border-color: var(--border);
      transform: translateX(2px);
    }
    .nav strong {
      display: block;
      font-size: 14px;
      margin-bottom: 4px;
    }
    .nav span {
      display: block;
      font-size: 12px;
      color: var(--muted);
    }
    .sidebar-footer {
      margin-top: 26px;
      padding: 16px;
      border: 1px solid var(--border);
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.03);
    }
    .sidebar-footer .kicker,
    .kicker {
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.14em;
      font-size: 11px;
      margin-bottom: 8px;
    }
    .main {
      padding: 26px;
    }
    .hero {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: end;
      margin-bottom: 20px;
    }
    .hero h2 {
      margin: 0;
      font-size: clamp(30px, 4vw, 52px);
      letter-spacing: -0.05em;
    }
    .hero p {
      margin: 10px 0 0;
      color: var(--muted);
      max-width: 860px;
      line-height: 1.5;
    }
    .hero-meta {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: end;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border-radius: 999px;
      padding: 8px 12px;
      background: rgba(113, 196, 255, 0.1);
      border: 1px solid var(--border);
      color: var(--accent);
      font-size: 12px;
    }
    .tab-panel {
      display: none;
      animation: fade 180ms ease;
    }
    .tab-panel.active {
      display: block;
    }
    @keyframes fade {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 16px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 22px;
      padding: 18px;
      box-shadow: var(--shadow);
    }
    .card.soft {
      background: var(--panel-soft);
    }
    .span-3 { grid-column: span 3; }
    .span-4 { grid-column: span 4; }
    .span-5 { grid-column: span 5; }
    .span-6 { grid-column: span 6; }
    .span-7 { grid-column: span 7; }
    .span-8 { grid-column: span 8; }
    .span-12 { grid-column: span 12; }
    .section-title {
      margin: 0 0 16px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.14em;
      font-size: 12px;
    }
    .metric-label {
      color: var(--muted);
      font-size: 13px;
      margin-bottom: 10px;
    }
    .metric-value {
      font-size: clamp(26px, 3vw, 38px);
      font-weight: 700;
      letter-spacing: -0.04em;
    }
    .metric-sub {
      margin-top: 8px;
      color: var(--muted);
      font-size: 12px;
    }
    .mini-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }
    .stat-line {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      font-size: 13px;
    }
    .stat-line:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }
    .stat-line .label {
      color: var(--muted);
    }
    .buy { color: var(--buy); }
    .sell { color: var(--sell); }
    .warn { color: var(--warn); }
    .accent { color: var(--accent); }
    .accent-2 { color: var(--accent-2); }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th, td {
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.07);
      text-align: right;
      vertical-align: top;
    }
    th:first-child, td:first-child {
      text-align: left;
    }
    .table-wrap {
      overflow: auto;
    }
    .sparkline {
      width: 100%;
      height: 74px;
      display: block;
      margin-top: 10px;
      background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.00));
      border-radius: 14px;
    }
    .badge-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }
    .badge {
      padding: 7px 10px;
      border-radius: 999px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.05);
      color: var(--muted);
      font-size: 12px;
    }
    .preset {
      padding: 14px;
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 16px;
      background: rgba(255,255,255,0.02);
    }
    .preset strong {
      display: block;
      margin-bottom: 6px;
    }
    .empty {
      color: var(--muted);
      font-size: 13px;
    }
    .foot {
      margin-top: 18px;
      color: var(--muted);
      font-size: 12px;
    }
    @media (max-width: 1120px) {
      .app { grid-template-columns: 1fr; }
      .sidebar { border-right: 0; border-bottom: 1px solid var(--border); }
      .hero { flex-direction: column; align-items: start; }
      .hero-meta { justify-content: start; }
    }
    @media (max-width: 900px) {
      .span-3, .span-4, .span-5, .span-6, .span-7, .span-8 { grid-column: span 12; }
      .mini-grid { grid-template-columns: 1fr; }
      .main { padding: 18px; }
    }
  </style>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <h1>Fractal Crypto</h1>
        <p>Desk simplifie inspire de FRACTAL: market data live, strategy lane, quant lab et backtest lite en paper runtime.</p>
      </div>
      <nav class="nav">
        <button class="tab-button active" data-tab="overview">
          <strong>Overview</strong>
          <span>Desk pulse, runtime, equity, readiness</span>
        </button>
        <button class="tab-button" data-tab="market">
          <strong>Market</strong>
          <span>Order book, tape, spread lanes, microstructure</span>
        </button>
        <button class="tab-button" data-tab="strategy">
          <strong>Strategy</strong>
          <span>Quotes, fills, inventory, risk guard</span>
        </button>
        <button class="tab-button" data-tab="quant-lab">
          <strong>Quant Lab</strong>
          <span>Regimes, flow imbalance, research presets</span>
        </button>
        <button class="tab-button" data-tab="backtest">
          <strong>Backtest</strong>
          <span>Paper session replay and lite performance view</span>
        </button>
      </nav>
      <div class="sidebar-footer">
        <div class="kicker">Scope</div>
        <div id="sidebar-summary" class="empty">warming up</div>
      </div>
    </aside>

    <main class="main">
      <header class="hero">
        <div>
          <div class="kicker">Crypto Algo Trading Desk</div>
          <h2>BTC/USD Mini Fractal</h2>
          <p>Version entretien: architecture de desk, lanes de lecture, quant lab et backtest lite, tout en restant autonome, public-data only et sans infra proprietaire.</p>
        </div>
        <div class="hero-meta">
          <div class="pill" id="hero-feed">feed: warming</div>
          <div class="pill" id="hero-risk">risk: booting</div>
          <div class="pill" id="hero-product">product: BTC-USD</div>
        </div>
      </header>

      <section id="overview" class="tab-panel active"></section>
      <section id="market" class="tab-panel"></section>
      <section id="strategy" class="tab-panel"></section>
      <section id="quant-lab" class="tab-panel"></section>
      <section id="backtest" class="tab-panel"></section>
      <div class="foot">Live public Coinbase data, market making logic in paper mode, no authenticated exchange account required.</div>
    </main>
  </div>

  <script>
    const el = (id) => document.getElementById(id);
    const fmt = (x, d = 2) => x == null ? "-" : Number(x).toLocaleString(undefined, {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });
    const fmtPct = (x, d = 2) => x == null ? "-" : `${fmt(x, d)}%`;
    const fmtInt = (x) => x == null ? "-" : Number(x).toLocaleString();

    let activeTab = "overview";

    function setActiveTab(tab) {
      activeTab = tab;
      document.querySelectorAll(".tab-button").forEach((button) => {
        button.classList.toggle("active", button.dataset.tab === tab);
      });
      document.querySelectorAll(".tab-panel").forEach((panel) => {
        panel.classList.toggle("active", panel.id === tab);
      });
    }

    document.querySelectorAll(".tab-button").forEach((button) => {
      button.addEventListener("click", () => setActiveTab(button.dataset.tab));
    });

    function renderTable(headers, rows) {
      if (!rows.length) {
        return '<div class="empty">No data yet</div>';
      }
      const head = headers.map((header) => `<th>${header}</th>`).join("");
      const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("");
      return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    }

    function card(title, inner, cls = "card") {
      return `<article class="${cls}"><h3 class="section-title">${title}</h3>${inner}</article>`;
    }

    function metricCard(title, value, sub = "") {
      return card(title, `
        <div class="metric-label">${title}</div>
        <div class="metric-value">${value}</div>
        <div class="metric-sub">${sub}</div>
      `);
    }

    function statLines(items) {
      return items.map((item) => `
        <div class="stat-line">
          <span class="label">${item.label}</span>
          <span>${item.value}</span>
        </div>
      `).join("");
    }

    function sparkline(values, color = "#71c4ff") {
      if (!values || values.length < 2) {
        return '<div class="empty">collecting live history</div>';
      }
      const width = 480;
      const height = 74;
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min || 1;
      const step = width / Math.max(values.length - 1, 1);
      const points = values.map((value, index) => {
        const x = index * step;
        const y = height - ((value - min) / range) * (height - 12) - 6;
        return `${x},${y}`;
      }).join(" ");
      return `
        <svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
          <polyline fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${points}"></polyline>
        </svg>
      `;
    }

    function renderOverview(data) {
      const runtime = data.runtime || {};
      const portfolio = data.portfolio || {};
      const backtest = data.backtest_lite || {};
      const quant = data.quant_lab || {};
      const midCurve = (data.mid_history || []).map((point) => point.mid_price);
      const equityCurve = backtest.equity_curve || [];
      const layout = `
        <div class="grid">
          <div class="span-3">${metricCard("Mid Price", data.mid_price == null ? "-" : `$${fmt(data.mid_price, 2)}`, data.product_id || "BTC-USD")}</div>
          <div class="span-3">${metricCard("Total P&L", `$${fmt((portfolio.realized_pnl || 0) + (portfolio.unrealized_pnl || 0), 2)}`, `realized $${fmt(portfolio.realized_pnl || 0, 2)} / unrealized $${fmt(portfolio.unrealized_pnl || 0, 2)}`)}</div>
          <div class="span-3">${metricCard("Inventory", `${fmt(portfolio.position_btc || 0, 4)} BTC`, `avg entry $${fmt(portfolio.avg_entry_price || 0, 2)}`)}</div>
          <div class="span-3">${metricCard("Research State", quant.readiness || "warming", `feed ${runtime.feed_state || "warming"} / backtest ${backtest.status || "warming"}`)}</div>

          <div class="span-7">${card("Desk Pulse", `
            <div class="badge-row">
              <span class="badge">feed ${runtime.feed_state || "warming"}</span>
              <span class="badge">book ${runtime.order_book_ready ? "ready" : "warming"}</span>
              <span class="badge">messages ${fmtInt(runtime.messages_seen || 0)}</span>
              <span class="badge">fills ${fmtInt((data.strategy || {}).fill_count || 0)}</span>
            </div>
            ${statLines([
              { label: "Uptime", value: `${fmtInt(runtime.uptime_s || 0)} s` },
              { label: "Trade events cached", value: fmtInt(runtime.trade_events || 0) },
              { label: "Exposure", value: `$${fmt(Math.abs(portfolio.exposure_usd || 0), 2)}` },
              { label: "Quote uptime", value: fmtPct(backtest.quote_uptime_pct || 0, 1) },
            ])}
          `)}</div>
          <div class="span-5">${card("Runtime Lanes", statLines([
            { label: "Feed", value: runtime.feed_state || "-" },
            { label: "Order book", value: runtime.order_book_ready ? "ready" : "warming" },
            { label: "Book levels", value: `${runtime.book_levels?.bids || 0} bid / ${runtime.book_levels?.asks || 0} ask` },
            { label: "Risk", value: data.risk_status || "-" },
            { label: "Window points", value: fmtInt(quant.window_points || 0) },
          ]), "card soft")}</div>

          <div class="span-6">${card("Mid Price Curve", sparkline(midCurve, "#71c4ff"))}</div>
          <div class="span-6">${card("Equity Curve", sparkline(equityCurve, "#7ef0cb"))}</div>
        </div>
      `;
      el("overview").innerHTML = layout;
    }

    function renderMarket(data) {
      const topAsks = (data.book?.asks || []).slice().reverse().map((level) => [
        '<span class="sell">ASK</span>',
        fmt(level.price, 2),
        fmt(level.size, 4),
      ]);
      const topBids = (data.book?.bids || []).map((level) => [
        '<span class="buy">BID</span>',
        fmt(level.price, 2),
        fmt(level.size, 4),
      ]);
      const trades = (data.recent_trades || []).slice(0, 16).map((trade) => [
        `<span class="${trade.side === "buy" ? "buy" : "sell"}">${trade.side}</span>`,
        fmt(trade.price, 2),
        fmt(trade.size, 5),
        new Date(trade.ts).toLocaleTimeString(),
      ]);
      const spreads = Object.entries(data.spread_metrics || {}).map(([depth, stats]) => [
        depth,
        fmt(stats.last, 2),
        fmt(stats.avg, 2),
        fmt(stats.median, 2),
        fmt(stats.min, 2),
        fmt(stats.max, 2),
      ]);
      const quant = data.quant_lab || {};
      const spreadCurve = data.spread_history?.["0.1 BTC"] || [];
      el("market").innerHTML = `
        <div class="grid">
          <div class="span-6">${card("Order Book", renderTable(["Side", "Price", "Size"], [...topAsks, ...topBids]))}</div>
          <div class="span-6">${card("Recent Trades", renderTable(["Side", "Price", "Size", "Time"], trades))}</div>
          <div class="span-7">${card("Spread Lanes", renderTable(["Depth", "Last", "Avg", "Median", "Min", "Max"], spreads))}</div>
          <div class="span-5">${card("Microstructure", statLines([
            { label: "Realized vol", value: `${fmt(quant.realized_vol_bps || 0, 2)} bps` },
            { label: "Momentum", value: `${fmt(quant.momentum_bps || 0, 2)} bps` },
            { label: "Trade flow imbalance", value: `${fmt(quant.trade_flow_imbalance_btc || 0, 4)} BTC` },
            { label: "Top5 depth imbalance", value: fmt(quant.top5_depth_imbalance || 0, 3) },
            { label: "Micro bias", value: `${fmt(quant.micro_bias_bps || 0, 2)} bps` },
          ]), "card soft")}</div>
          <div class="span-12">${card("Spread 0.1 BTC Sparkline", sparkline(spreadCurve, "#ffd479"))}</div>
        </div>
      `;
    }

    function renderStrategy(data) {
      const strategy = data.strategy || {};
      const portfolio = data.portfolio || {};
      const quote = data.quote;
      const fills = (data.fills || []).slice(0, 14).map((fill) => [
        `<span class="${fill.side === "buy" ? "buy" : "sell"}">${fill.side}</span>`,
        fmt(fill.price, 2),
        fmt(fill.size, 4),
        fill.reason,
      ]);
      const quoteBlock = quote ? `
        <div class="badge-row">
          <span class="badge">bid ${fmt(quote.bid_price, 2)} x ${fmt(quote.bid_size, 4)}</span>
          <span class="badge">ask ${fmt(quote.ask_price, 2)} x ${fmt(quote.ask_size, 4)}</span>
        </div>
      ` : '<div class="empty">No active quote right now</div>';
      el("strategy").innerHTML = `
        <div class="grid">
          <div class="span-4">${metricCard("Risk Guard", data.risk_status || "-", `max loss $${fmt(strategy.config?.max_loss || 0, 0)} / max notionnel $${fmt(strategy.config?.max_notional_exposure || 0, 0)}`)}</div>
          <div class="span-4">${metricCard("Quote Engine", strategy.quote_active ? "active" : "paused", `base spread ${fmt(strategy.config?.base_quote_spread_bps || 0, 1)} bps`)}</div>
          <div class="span-4">${metricCard("Fill Count", fmtInt(strategy.fill_count || 0), `avg fill notional $${fmt(strategy.avg_fill_notional || 0, 2)}`)}</div>

          <div class="span-6">${card("Active Quote", quoteBlock)}</div>
          <div class="span-6">${card("Portfolio", statLines([
            { label: "Position", value: `${fmt(portfolio.position_btc || 0, 4)} BTC` },
            { label: "Avg entry", value: `$${fmt(portfolio.avg_entry_price || 0, 2)}` },
            { label: "Exposure", value: `$${fmt(portfolio.exposure_usd || 0, 2)}` },
            { label: "Cash", value: `$${fmt(portfolio.cash || 0, 2)}` },
            { label: "Equity", value: `$${fmt(portfolio.equity || 0, 2)}` },
          ]), "card soft")}</div>

          <div class="span-7">${card("Simulated Fills", renderTable(["Side", "Price", "Size", "Reason"], fills))}</div>
          <div class="span-5">${card("Strategy Config", statLines([
            { label: "Base spread", value: `${fmt(strategy.config?.base_quote_spread_bps || 0, 2)} bps` },
            { label: "Order size", value: `${fmt(strategy.config?.order_size_btc || 0, 4)} BTC` },
            { label: "Skew / BTC", value: `${fmt(strategy.config?.position_skew_bps_per_btc || 0, 2)} bps` },
            { label: "Inventory", value: `${fmt(strategy.inventory_btc || 0, 4)} BTC` },
          ]))}</div>
        </div>
      `;
    }

    function renderQuantLab(data) {
      const quant = data.quant_lab || {};
      const regimes = (quant.spread_regimes || []).map((row) => [
        row.depth,
        row.state,
        fmt(row.last, 2),
        fmt(row.avg, 2),
      ]);
      const presets = (quant.research_presets || []).map((preset) => `
        <div class="preset">
          <strong>${preset.name}</strong>
          <div class="stat-line"><span class="label">Spread</span><span>${fmt(preset.spread_bps, 1)} bps</span></div>
          <div class="stat-line"><span class="label">Skew</span><span>${fmt(preset.skew_bps_per_btc, 1)} bps/BTC</span></div>
          <div class="stat-line"><span class="label">Desk read</span><span>${preset.stance}</span></div>
        </div>
      `).join("");
      el("quant-lab").innerHTML = `
        <div class="grid">
          <div class="span-3">${metricCard("Realized Vol", `${fmt(quant.realized_vol_bps || 0, 2)} bps`, `window ${fmtInt(quant.window_points || 0)} points`)}</div>
          <div class="span-3">${metricCard("Momentum", `${fmt(quant.momentum_bps || 0, 2)} bps`, quant.readiness || "warming")}</div>
          <div class="span-3">${metricCard("Flow Imbalance", `${fmt(quant.trade_flow_imbalance_btc || 0, 4)} BTC`, "buy minus sell aggressor flow")}</div>
          <div class="span-3">${metricCard("Depth Imbalance", fmt(quant.top5_depth_imbalance || 0, 3), "top 5 levels")}</div>
          <div class="span-6">${card("Spread Regimes", renderTable(["Depth", "State", "Last", "Avg"], regimes))}</div>
          <div class="span-6">${card("Research Presets", `<div class="mini-grid">${presets}</div>`)}</div>
        </div>
      `;
    }

    function renderBacktest(data) {
      const backtest = data.backtest_lite || {};
      const strategy = data.strategy || {};
      el("backtest").innerHTML = `
        <div class="grid">
          <div class="span-3">${metricCard("Mode", backtest.mode || "paper_session", backtest.status || "warming")}</div>
          <div class="span-3">${metricCard("Paper P&L", `$${fmt(backtest.total_pnl_usd || 0, 2)}`, `return ${fmtPct(backtest.paper_return_pct || 0, 3)}`)}</div>
          <div class="span-3">${metricCard("Max Drawdown", `$${fmt(backtest.max_drawdown_usd || 0, 2)}`, `peak $${fmt(backtest.peak_equity_usd || 0, 2)}`)}</div>
          <div class="span-3">${metricCard("Quote Uptime", fmtPct(backtest.quote_uptime_pct || 0, 1), `fills ${fmtInt(backtest.fill_count || 0)}`)}</div>

          <div class="span-6">${card("Equity Replay", sparkline(backtest.equity_curve || [], "#7ef0cb"))}</div>
          <div class="span-6">${card("P&L Replay", sparkline(backtest.pnl_curve || [], "#71c4ff"))}</div>

          <div class="span-7">${card("Paper Session Metrics", statLines([
            { label: "Window points", value: fmtInt(backtest.window_points || 0) },
            { label: "Fill volume", value: `${fmt(backtest.fill_volume_btc || 0, 4)} BTC` },
            { label: "Fill notional", value: `$${fmt(backtest.fill_notional_usd || 0, 2)}` },
            { label: "Current baseline spread", value: `${fmt(strategy.config?.base_quote_spread_bps || 0, 2)} bps` },
            { label: "Current order size", value: `${fmt(strategy.config?.order_size_btc || 0, 4)} BTC` },
          ]))}</div>
          <div class="span-5">${card("Backtest Lane", `
            <div class="badge-row">
              <span class="badge">paper runtime parity</span>
              <span class="badge">live feed replay</span>
              <span class="badge">not offline historical research</span>
            </div>
            <div class="empty">This lane is intentionally lightweight: it behaves like a desk replay/paper monitor, not a full offline research engine.</div>
          `, "card soft")}</div>
        </div>
      `;
    }

    function renderSidebar(data) {
      const runtime = data.runtime || {};
      const quant = data.quant_lab || {};
      el("sidebar-summary").innerHTML = `
        <div class="stat-line"><span class="label">Feed</span><span>${runtime.feed_state || "-"}</span></div>
        <div class="stat-line"><span class="label">Quant</span><span>${quant.readiness || "-"}</span></div>
        <div class="stat-line"><span class="label">Risk</span><span>${data.risk_status || "-"}</span></div>
      `;
      el("hero-feed").textContent = `feed: ${runtime.feed_state || "warming"}`;
      el("hero-risk").textContent = `risk: ${data.risk_status || "booting"}`;
      el("hero-product").textContent = `product: ${data.product_id || "BTC-USD"}`;
    }

    async function tick() {
      const response = await fetch("/api/state");
      const data = await response.json();
      renderSidebar(data);
      renderOverview(data);
      renderMarket(data);
      renderStrategy(data);
      renderQuantLab(data);
      renderBacktest(data);
    }

    tick();
    setInterval(tick, 1500);
  </script>
</body>
</html>
"""
