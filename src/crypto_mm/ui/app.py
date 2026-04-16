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


app = FastAPI(title="Fractal Crypto Desk", lifespan=lifespan)


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
  <script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
  <style>
    :root {
      --bg-primary: #050510;
      --bg-secondary: #0A0E18;
      --bg-glass: rgba(255, 255, 255, 0.015);
      --bg-glass-hover: rgba(255, 255, 255, 0.03);
      --bg-glass-active: rgba(255, 255, 255, 0.05);
      --border-glass: rgba(0, 255, 136, 0.06);
      --border-glass-hover: rgba(0, 255, 136, 0.12);
      --text-primary: #e8ebe8;
      --text-secondary: #8a918a;
      --text-muted: #4a524a;
      --status-nominal: #00FF88;
      --status-warning: #eab308;
      --status-critical: #ef4444;
      --status-info: #2CE3FF;
      --accent-primary: #00FF88;
      --accent-secondary: #2CE3FF;
      --accent-glow: 0 0 20px rgba(0, 255, 136, 0.15);
      --shadow-soft: 0 18px 40px rgba(0, 0, 0, 0.35);
      --radius-md: 12px;
      --radius-lg: 16px;
      --radius-xl: 20px;
      --transition-base: 200ms ease-out;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: "IBM Plex Sans", "Inter", "Space Grotesk", system-ui, sans-serif;
      background-color: var(--bg-primary);
      background-image:
        radial-gradient(rgba(0, 255, 136, 0.03) 1px, transparent 1px),
        radial-gradient(circle at 14% 20%, rgba(44, 227, 255, 0.08), transparent 22%),
        radial-gradient(circle at 80% 10%, rgba(88, 110, 168, 0.08), transparent 20%),
        radial-gradient(circle at 60% 76%, rgba(44, 227, 255, 0.04), transparent 28%);
      background-size: 24px 24px, auto, auto, auto;
      color: var(--text-primary);
    }

    .app-shell {
      display: grid;
      grid-template-columns: 300px 1fr;
      min-height: 100vh;
    }

    .sidebar {
      position: relative;
      border-right: 1px solid rgba(255, 255, 255, 0.06);
      background: rgba(5, 5, 16, 0.88);
      backdrop-filter: blur(24px) saturate(1.4);
      padding: 26px 20px;
    }

    .sidebar::after {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background:
        linear-gradient(180deg, rgba(255,255,255,0.03), transparent 18%),
        radial-gradient(circle at 14% 10%, rgba(0,255,136,0.06), transparent 25%);
    }

    .brand {
      position: relative;
      z-index: 1;
      margin-bottom: 26px;
    }

    .brand .eyebrow {
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.16em;
      font-size: 11px;
      margin-bottom: 10px;
    }

    .brand h1 {
      margin: 0;
      font-size: 30px;
      letter-spacing: -0.05em;
    }

    .brand p {
      margin: 10px 0 0;
      color: var(--text-secondary);
      line-height: 1.55;
      font-size: 14px;
    }

    .nav {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .nav button {
      border: 1px solid transparent;
      background: rgba(255,255,255,0.02);
      color: var(--text-primary);
      text-align: left;
      padding: 14px 16px;
      border-radius: var(--radius-lg);
      cursor: pointer;
      transition: transform var(--transition-base), border-color var(--transition-base), background var(--transition-base);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
    }

    .nav button:hover,
    .nav button.active {
      transform: translate3d(2px, 0, 0);
      border-color: var(--border-glass-hover);
      background:
        linear-gradient(135deg, rgba(0,255,136,0.08), rgba(44,227,255,0.06)),
        rgba(255,255,255,0.03);
      box-shadow: var(--accent-glow);
    }

    .nav strong {
      display: block;
      font-size: 14px;
      margin-bottom: 5px;
    }

    .nav span {
      display: block;
      font-size: 12px;
      color: var(--text-secondary);
      line-height: 1.4;
    }

    .sidebar-card {
      position: relative;
      z-index: 1;
      margin-top: 22px;
      padding: 16px;
      border-radius: var(--radius-xl);
      border: 1px solid var(--border-glass);
      background: rgba(10, 14, 24, 0.88);
      box-shadow: var(--shadow-soft);
    }

    .main {
      padding: 26px;
    }

    .topbar {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      align-items: flex-start;
      margin-bottom: 18px;
    }

    .hero-shell {
      flex: 1;
      padding: 20px 22px;
      border-radius: 24px;
      border: 1px solid rgba(255,255,255,0.06);
      background:
        linear-gradient(120deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 35%, transparent 60%),
        radial-gradient(circle at 18% 16%, rgba(44, 227, 255, 0.12), transparent 32%),
        radial-gradient(circle at 84% 10%, rgba(124, 121, 255, 0.12), transparent 36%),
        rgba(10, 14, 24, 0.88);
      box-shadow: 0 18px 40px rgba(0,0,0,0.35);
      backdrop-filter: blur(18px);
    }

    .hero-shell .eyebrow {
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.14em;
      font-size: 11px;
      margin-bottom: 10px;
    }

    .hero-shell h2 {
      margin: 0;
      font-size: clamp(34px, 5vw, 56px);
      letter-spacing: -0.06em;
      line-height: 1;
    }

    .hero-shell p {
      margin: 12px 0 0;
      max-width: 900px;
      color: var(--text-secondary);
      line-height: 1.55;
    }

    .hero-right {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: flex-end;
      min-width: 260px;
    }

    .glass-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid var(--border-glass);
      background: rgba(255,255,255,0.03);
      color: var(--text-primary);
      font-size: 12px;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
    }

    .glass-badge::before {
      content: "";
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: var(--accent-primary);
      box-shadow: 0 0 10px rgba(0,255,136,0.65);
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      gap: 16px;
    }

    .span-3 { grid-column: span 3; }
    .span-4 { grid-column: span 4; }
    .span-5 { grid-column: span 5; }
    .span-6 { grid-column: span 6; }
    .span-7 { grid-column: span 7; }
    .span-8 { grid-column: span 8; }
    .span-12 { grid-column: span 12; }

    .glass-panel {
      position: relative;
      overflow: hidden;
      border-radius: var(--radius-xl);
      border: 1px solid var(--border-glass);
      background: rgba(10, 14, 24, 0.88);
      box-shadow:
        0 4px 6px -1px rgba(0, 0, 0, 0.1),
        0 18px 40px rgba(0,0,0,0.35),
        inset 0 1px 0 rgba(255,255,255,0.03);
      backdrop-filter: blur(18px);
      transition: transform var(--transition-base), border-color var(--transition-base), box-shadow var(--transition-base);
    }

    .glass-panel:hover {
      transform: translate3d(0, -2px, 0);
      border-color: var(--border-glass-hover);
      box-shadow:
        0 18px 40px rgba(0,0,0,0.40),
        0 0 0 1px rgba(0,255,136,0.06),
        0 0 24px rgba(0,255,136,0.05);
    }

    .glass-panel::before {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: 0.8;
      background:
        linear-gradient(120deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 35%, transparent 60%),
        radial-gradient(circle at 12% 0%, rgba(0,255,136,0.07), transparent 24%);
    }

    .panel-inner {
      position: relative;
      z-index: 1;
      padding: 18px;
    }

    .panel-title {
      font-size: 11px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--text-secondary);
      margin-bottom: 14px;
    }

    .panel-label {
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.45);
    }

    .metric-value {
      font-size: clamp(28px, 4vw, 40px);
      font-weight: 700;
      letter-spacing: -0.05em;
      margin-top: 6px;
    }

    .metric-sub {
      margin-top: 10px;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.45;
    }

    .metric-card {
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.06);
      background: rgba(255,255,255,0.02);
      padding: 14px;
    }

    .mini-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
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

    .stat-line:last-child { border-bottom: 0; }
    .stat-line .label { color: var(--text-secondary); }

    .table-wrap {
      overflow: auto;
      max-height: 420px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    th {
      font-size: 11px;
      letter-spacing: 0.10em;
      text-transform: uppercase;
      color: var(--text-secondary);
      padding: 0 0 10px;
      border-bottom: 1px solid var(--border-glass);
      text-align: right;
      position: sticky;
      top: 0;
      background: rgba(10,14,24,0.96);
      backdrop-filter: blur(14px);
    }

    td {
      padding: 10px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      text-align: right;
      vertical-align: top;
    }

    td:first-child, th:first-child { text-align: left; }
    tr:hover td { background: rgba(255,255,255,0.02); }

    .tab-panels { margin-top: 18px; }
    .tab-panel { display: none; }
    .tab-panel.active { display: block; animation: fadeUp 220ms ease-out both; }

    .tone-good { color: var(--status-nominal); }
    .tone-warn { color: var(--status-warning); }
    .tone-bad { color: var(--status-critical); }
    .tone-info { color: var(--accent-secondary); }
    .tone-muted { color: var(--text-secondary); }

    .badge-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 14px;
    }

    .badge {
      padding: 7px 10px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.06);
      background: rgba(255,255,255,0.03);
      color: var(--text-secondary);
      font-size: 12px;
    }

    .preset-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }

    .preset-card {
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.06);
      background:
        radial-gradient(circle at top left, rgba(44,227,255,0.08), transparent 30%),
        rgba(255,255,255,0.02);
      padding: 14px;
    }

    .preset-card strong {
      display: block;
      margin-bottom: 10px;
      font-size: 14px;
    }

    .plot-card {
      min-height: 340px;
    }

    .plot {
      width: 100%;
      height: 270px;
    }

    .empty {
      color: var(--text-secondary);
      font-size: 13px;
    }

    .foot {
      margin-top: 18px;
      color: var(--text-secondary);
      font-size: 12px;
    }

    @keyframes fadeUp {
      from {
        opacity: 0;
        transform: translate3d(0, 10px, 0);
      }
      to {
        opacity: 1;
        transform: translate3d(0, 0, 0);
      }
    }

    @media (max-width: 1180px) {
      .app-shell { grid-template-columns: 1fr; }
      .sidebar {
        border-right: 0;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      .topbar {
        flex-direction: column;
      }
      .hero-right { justify-content: flex-start; }
    }

    @media (max-width: 960px) {
      .span-3, .span-4, .span-5, .span-6, .span-7, .span-8 { grid-column: span 12; }
      .mini-grid, .preset-grid { grid-template-columns: 1fr; }
      .main { padding: 18px; }
      .hero-shell h2 { font-size: 34px; }
    }
  </style>
</head>
<body>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="eyebrow">Crypto Algo Trading Desk</div>
        <h1>Fractal Crypto</h1>
        <p>Mini cockpit crypto reprenant l’ADN visuel de FRACTAL: control room, glass panels, quant lab, backtest lane et telemetry live.</p>
      </div>

      <nav class="nav">
        <button class="tab-button active" data-tab="overview">
          <strong>Overview</strong>
          <span>Desk pulse, runtime lanes, equity, desk verdict</span>
        </button>
        <button class="tab-button" data-tab="market">
          <strong>Market</strong>
          <span>Order book, tape, spread lanes, microstructure</span>
        </button>
        <button class="tab-button" data-tab="strategy">
          <strong>Strategy</strong>
          <span>Quote engine, fills, inventory, risk guard</span>
        </button>
        <button class="tab-button" data-tab="quant-lab">
          <strong>Quant Lab</strong>
          <span>Research presets, regimes, micro-bias, flow</span>
        </button>
        <button class="tab-button" data-tab="backtest">
          <strong>Backtest</strong>
          <span>Paper replay lane, equity and P&L diagnostics</span>
        </button>
      </nav>

      <div class="sidebar-card">
        <div class="panel-title">Desk Context</div>
        <div id="sidebar-context" class="empty">warming</div>
      </div>

      <div class="sidebar-card">
        <div class="panel-title">Infra</div>
        <div class="stat-line"><span class="label">Site</span><span>stern-project</span></div>
        <div class="stat-line"><span class="label">Mode</span><span>paper / public feed</span></div>
        <div class="stat-line"><span class="label">Broker auth</span><span>not required</span></div>
      </div>
    </aside>

    <main class="main">
      <section class="topbar">
        <div class="hero-shell">
          <div class="eyebrow">Operator Grade Cockpit</div>
          <h2>BTC/USD Desk Terminal</h2>
          <p>Version entretien assumee: maximum d’ADN FRACTAL côté rendu, hiérarchie visuelle et cockpit feeling, mais avec une logique simplifiée, publique et autonome pour le market making crypto.</p>
        </div>
        <div class="hero-right">
          <div class="glass-badge" id="hero-feed">feed live</div>
          <div class="glass-badge" id="hero-risk">risk booting</div>
          <div class="glass-badge" id="hero-product">BTC-USD</div>
        </div>
      </section>

      <div class="tab-panels">
        <section id="overview" class="tab-panel active"></section>
        <section id="market" class="tab-panel"></section>
        <section id="strategy" class="tab-panel"></section>
        <section id="quant-lab" class="tab-panel"></section>
        <section id="backtest" class="tab-panel"></section>
      </div>

      <div class="foot">Live public Coinbase data, paper strategy runtime only. No Coinbase account, wallet or API key required.</div>
    </main>
  </div>

  <script>
    const el = (id) => document.getElementById(id);
    const fmt = (x, d = 2) => x == null ? "-" : Number(x).toLocaleString(undefined, {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });
    const fmtInt = (x) => x == null ? "-" : Number(x).toLocaleString();
    const fmtPct = (x, d = 2) => x == null ? "-" : `${fmt(x, d)}%`;
    const money = (x, d = 2) => x == null ? "-" : `$${fmt(x, d)}`;

    function toneClass(value) {
      if (value == null) return "tone-muted";
      if (value > 0) return "tone-good";
      if (value < 0) return "tone-bad";
      return "tone-info";
    }

    function table(headers, rows) {
      if (!rows.length) return '<div class="empty">No data yet</div>';
      const head = headers.map((h) => `<th>${h}</th>`).join("");
      const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("");
      return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    }

    function panel(title, inner, extraClass = "") {
      return `
        <article class="glass-panel ${extraClass}">
          <div class="panel-inner">
            <div class="panel-title">${title}</div>
            ${inner}
          </div>
        </article>
      `;
    }

    function metricPanel(title, value, sub) {
      return panel(title, `
        <div class="panel-label">${title}</div>
        <div class="metric-value">${value}</div>
        <div class="metric-sub">${sub}</div>
      `);
    }

    function statLines(items) {
      return items.map((item) => `
        <div class="stat-line">
          <span class="label">${item.label}</span>
          <span class="${item.cls || ""}">${item.value}</span>
        </div>
      `).join("");
    }

    function plotConfig() {
      return {
        responsive: true,
        displayModeBar: false,
      };
    }

    function plotLayout(title) {
      return {
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        margin: { l: 36, r: 12, t: 18, b: 28 },
        font: { family: "IBM Plex Sans, Inter, sans-serif", color: "#8a918a", size: 11 },
        title: { text: title || "", font: { size: 12, color: "#8a918a" } },
        xaxis: {
          color: "#4a524a",
          gridcolor: "rgba(255,255,255,0.04)",
          zerolinecolor: "rgba(255,255,255,0.04)",
        },
        yaxis: {
          color: "#4a524a",
          gridcolor: "rgba(255,255,255,0.04)",
          zerolinecolor: "rgba(255,255,255,0.04)",
        },
      };
    }

    function renderPlot(id, traces, layout) {
      const node = el(id);
      if (!node || !window.Plotly) return;
      window.Plotly.react(node, traces, layout, plotConfig());
    }

    function setActiveTab(tab) {
      document.querySelectorAll(".tab-button").forEach((button) => {
        button.classList.toggle("active", button.dataset.tab === tab);
      });
      document.querySelectorAll(".tab-panel").forEach((panelNode) => {
        panelNode.classList.toggle("active", panelNode.id === tab);
      });
    }

    document.querySelectorAll(".tab-button").forEach((button) => {
      button.addEventListener("click", () => setActiveTab(button.dataset.tab));
    });

    function renderOverview(data) {
      const runtime = data.runtime || {};
      const portfolio = data.portfolio || {};
      const strategy = data.strategy || {};
      const backtest = data.backtest_lite || {};
      const quant = data.quant_lab || {};
      const totalPnl = (portfolio.realized_pnl || 0) + (portfolio.unrealized_pnl || 0);

      el("overview").innerHTML = `
        <div class="grid">
          <div class="span-3">${metricPanel("Mid Price", data.mid_price == null ? "-" : money(data.mid_price), data.product_id || "BTC-USD")}</div>
          <div class="span-3">${metricPanel("Total P&L", money(totalPnl), `realized ${money(portfolio.realized_pnl || 0)} / unrealized ${money(portfolio.unrealized_pnl || 0)}`)}</div>
          <div class="span-3">${metricPanel("Inventory", `${fmt(portfolio.position_btc || 0, 4)} BTC`, `avg entry ${money(portfolio.avg_entry_price || 0)}`)}</div>
          <div class="span-3">${metricPanel("Desk Verdict", runtime.feed_state || "warming", `risk ${data.risk_status || "booting"} / quant ${quant.readiness || "warming"}`)}</div>

          <div class="span-8">${panel("Desk Pulse", `
            <div class="badge-row">
              <span class="badge">feed ${runtime.feed_state || "warming"}</span>
              <span class="badge">book ${runtime.order_book_ready ? "ready" : "warming"}</span>
              <span class="badge">fills ${fmtInt(strategy.fill_count || 0)}</span>
              <span class="badge">quote uptime ${fmtPct(backtest.quote_uptime_pct || 0, 1)}</span>
            </div>
            ${statLines([
              { label: "Uptime", value: `${fmtInt(runtime.uptime_s || 0)} s` },
              { label: "Messages seen", value: fmtInt(runtime.messages_seen || 0) },
              { label: "Exposure", value: money(Math.abs(portfolio.exposure_usd || 0)) },
              { label: "Paper return", value: fmtPct(backtest.paper_return_pct || 0, 3), cls: toneClass(backtest.paper_return_pct || 0) },
              { label: "Trade flow imbalance", value: `${fmt(quant.trade_flow_imbalance_btc || 0, 4)} BTC` },
            ])}
          `)}</div>

          <div class="span-4">${panel("Runtime Lanes", `
            ${statLines([
              { label: "Feed state", value: runtime.feed_state || "-" },
              { label: "Order book", value: runtime.order_book_ready ? "ready" : "warming" },
              { label: "Book levels", value: `${runtime.book_levels?.bids || 0} / ${runtime.book_levels?.asks || 0}` },
              { label: "Risk status", value: data.risk_status || "-" },
              { label: "Quant window", value: fmtInt(quant.window_points || 0) },
            ])}
          `)}</div>

          <div class="span-6">${panel("Mid Price Curve", '<div id="overview-mid" class="plot"></div>', 'plot-card')}</div>
          <div class="span-6">${panel("Equity Curve", '<div id="overview-equity" class="plot"></div>', 'plot-card')}</div>
        </div>
      `;

      renderPlot("overview-mid", [{
        x: (data.mid_history || []).map((point) => point.ts),
        y: (data.mid_history || []).map((point) => point.mid_price),
        type: "scatter",
        mode: "lines",
        line: { color: "#2CE3FF", width: 2.5 },
        fill: "tozeroy",
        fillcolor: "rgba(44,227,255,0.08)",
        hovertemplate: "%{x}<br>$%{y:,.2f}<extra>mid</extra>",
      }], plotLayout(""));

      renderPlot("overview-equity", [{
        x: (data.mid_history || []).slice(-(backtest.equity_curve || []).length).map((point) => point.ts),
        y: backtest.equity_curve || [],
        type: "scatter",
        mode: "lines",
        line: { color: "#00FF88", width: 2.5 },
        fill: "tozeroy",
        fillcolor: "rgba(0,255,136,0.08)",
        hovertemplate: "%{x}<br>$%{y:,.2f}<extra>equity</extra>",
      }], plotLayout(""));
    }

    function renderMarket(data) {
      const quant = data.quant_lab || {};
      const asks = (data.book?.asks || []).slice().reverse().map((level) => [
        '<span class="tone-bad">ASK</span>',
        money(level.price),
        fmt(level.size, 4),
      ]);
      const bids = (data.book?.bids || []).map((level) => [
        '<span class="tone-good">BID</span>',
        money(level.price),
        fmt(level.size, 4),
      ]);
      const trades = (data.recent_trades || []).slice(0, 16).map((trade) => [
        `<span class="${trade.side === "buy" ? "tone-good" : "tone-bad"}">${trade.side}</span>`,
        money(trade.price),
        fmt(trade.size, 5),
        new Date(trade.ts).toLocaleTimeString(),
      ]);
      const spreads = Object.entries(data.spread_metrics || {}).map(([depth, stats]) => [
        depth,
        fmt(stats.last, 2),
        fmt(stats.avg, 2),
        fmt(stats.median, 2),
        fmt(stats.max, 2),
      ]);

      el("market").innerHTML = `
        <div class="grid">
          <div class="span-6">${panel("Order Book", table(["Side", "Price", "Size"], [...asks, ...bids]))}</div>
          <div class="span-6">${panel("Trade Tape", table(["Side", "Price", "Size", "Time"], trades))}</div>
          <div class="span-7">${panel("Spread Lanes", table(["Depth", "Last", "Avg", "Median", "Max"], spreads))}</div>
          <div class="span-5">${panel("Microstructure State", `
            ${statLines([
              { label: "Realized vol", value: `${fmt(quant.realized_vol_bps || 0, 2)} bps` },
              { label: "Momentum", value: `${fmt(quant.momentum_bps || 0, 2)} bps`, cls: toneClass(quant.momentum_bps || 0) },
              { label: "Flow imbalance", value: `${fmt(quant.trade_flow_imbalance_btc || 0, 4)} BTC`, cls: toneClass(quant.trade_flow_imbalance_btc || 0) },
              { label: "Depth imbalance", value: fmt(quant.top5_depth_imbalance || 0, 3) },
              { label: "Micro bias", value: `${fmt(quant.micro_bias_bps || 0, 2)} bps`, cls: toneClass(quant.micro_bias_bps || 0) },
            ])}
          `)}</div>
          <div class="span-6">${panel("Depth Spread History", '<div id="market-spread" class="plot"></div>', 'plot-card')}</div>
          <div class="span-6">${panel("Trade Side Flow", '<div id="market-flow" class="plot"></div>', 'plot-card')}</div>
        </div>
      `;

      const spreadHistory = data.spread_history || {};
      renderPlot("market-spread", Object.entries(spreadHistory).map(([depth, values], index) => ({
        x: values.map((_, i) => i + 1),
        y: values,
        type: "scatter",
        mode: "lines",
        name: depth,
        line: {
          width: 2.2,
          color: ["#00FF88", "#2CE3FF", "#eab308", "#ef4444"][index % 4],
        },
        hovertemplate: `${depth}<br>%{y:.2f}<extra></extra>`,
      })), {
        ...plotLayout(""),
        legend: { orientation: "h", x: 0, y: 1.12, font: { color: "#8a918a", size: 11 } },
      });

      const flowTrades = (data.recent_trades || []).slice(0, 30).reverse();
      renderPlot("market-flow", [{
        x: flowTrades.map((trade) => trade.ts),
        y: flowTrades.map((trade) => trade.side === "buy" ? trade.size : -trade.size),
        type: "bar",
        marker: {
          color: flowTrades.map((trade) => trade.side === "buy" ? "rgba(0,255,136,0.7)" : "rgba(239,68,68,0.75)"),
        },
        hovertemplate: "%{x}<br>%{y:.5f} BTC<extra>flow</extra>",
      }], plotLayout(""));
    }

    function renderStrategy(data) {
      const strategy = data.strategy || {};
      const portfolio = data.portfolio || {};
      const quote = data.quote;
      const fills = (data.fills || []).slice(0, 14).map((fill) => [
        `<span class="${fill.side === "buy" ? "tone-good" : "tone-bad"}">${fill.side}</span>`,
        money(fill.price),
        fmt(fill.size, 4),
        fill.reason,
      ]);

      el("strategy").innerHTML = `
        <div class="grid">
          <div class="span-4">${metricPanel("Risk Guard", data.risk_status || "-", `max loss ${money(strategy.config?.max_loss || 0, 0)} / max notionnel ${money(strategy.config?.max_notional_exposure || 0, 0)}`)}</div>
          <div class="span-4">${metricPanel("Quote Engine", strategy.quote_active ? "active" : "paused", `base spread ${fmt(strategy.config?.base_quote_spread_bps || 0, 1)} bps`)}</div>
          <div class="span-4">${metricPanel("Fill Count", fmtInt(strategy.fill_count || 0), `avg fill notional ${money(strategy.avg_fill_notional || 0)}`)}</div>

          <div class="span-7">${panel("Quote & Inventory", `
            <div class="badge-row">
              ${quote ? `<span class="badge">bid ${money(quote.bid_price)} x ${fmt(quote.bid_size, 4)}</span>` : '<span class="badge">bid inactive</span>'}
              ${quote ? `<span class="badge">ask ${money(quote.ask_price)} x ${fmt(quote.ask_size, 4)}</span>` : '<span class="badge">ask inactive</span>'}
              <span class="badge">inventory ${fmt(portfolio.position_btc || 0, 4)} BTC</span>
            </div>
            ${statLines([
              { label: "Avg entry", value: money(portfolio.avg_entry_price || 0) },
              { label: "Exposure", value: money(portfolio.exposure_usd || 0), cls: toneClass(portfolio.exposure_usd || 0) },
              { label: "Cash", value: money(portfolio.cash || 0) },
              { label: "Equity", value: money(portfolio.equity || 0) },
              { label: "Realized P&L", value: money(portfolio.realized_pnl || 0), cls: toneClass(portfolio.realized_pnl || 0) },
            ])}
          `)}</div>

          <div class="span-5">${panel("Strategy Config", `
            ${statLines([
              { label: "Base spread", value: `${fmt(strategy.config?.base_quote_spread_bps || 0, 2)} bps` },
              { label: "Order size", value: `${fmt(strategy.config?.order_size_btc || 0, 4)} BTC` },
              { label: "Skew / BTC", value: `${fmt(strategy.config?.position_skew_bps_per_btc || 0, 2)} bps` },
              { label: "Inventory", value: `${fmt(strategy.inventory_btc || 0, 4)} BTC` },
              { label: "Quote active", value: strategy.quote_active ? "yes" : "no" },
            ])}
          `)}</div>

          <div class="span-6">${panel("Simulated Fills", table(["Side", "Price", "Size", "Reason"], fills))}</div>
          <div class="span-6">${panel("P&L & Inventory Replay", '<div id="strategy-pnl" class="plot"></div>', 'plot-card')}</div>
        </div>
      `;

      const history = data.backtest_lite?.pnl_curve || [];
      const inventory = (data.mid_history || []).slice(-history.length).map((_, idx) => {
        const snap = data.backtest_lite?.equity_curve?.[idx];
        return snap == null ? 0 : snap;
      });

      renderPlot("strategy-pnl", [
        {
          x: history.map((_, i) => i + 1),
          y: history,
          type: "scatter",
          mode: "lines",
          name: "P&L",
          line: { color: "#00FF88", width: 2.4 },
          hovertemplate: "point %{x}<br>$%{y:,.2f}<extra>P&L</extra>",
        },
        {
          x: inventory.map((_, i) => i + 1),
          y: inventory,
          type: "scatter",
          mode: "lines",
          name: "Equity",
          yaxis: "y2",
          line: { color: "#2CE3FF", width: 1.8, dash: "dot" },
          hovertemplate: "point %{x}<br>$%{y:,.2f}<extra>equity</extra>",
        }
      ], {
        ...plotLayout(""),
        yaxis2: {
          overlaying: "y",
          side: "right",
          color: "#4a524a",
          showgrid: false,
        },
        legend: { orientation: "h", x: 0, y: 1.12, font: { color: "#8a918a", size: 11 } },
      });
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
        <div class="preset-card">
          <strong>${preset.name}</strong>
          ${statLines([
            { label: "Spread", value: `${fmt(preset.spread_bps, 1)} bps` },
            { label: "Skew", value: `${fmt(preset.skew_bps_per_btc, 1)} bps/BTC` },
            { label: "Read", value: preset.stance },
          ])}
        </div>
      `).join("");

      el("quant-lab").innerHTML = `
        <div class="grid">
          <div class="span-3">${metricPanel("Realized Vol", `${fmt(quant.realized_vol_bps || 0, 2)} bps`, `window ${fmtInt(quant.window_points || 0)} points`)}</div>
          <div class="span-3">${metricPanel("Momentum", `${fmt(quant.momentum_bps || 0, 2)} bps`, quant.readiness || "warming")}</div>
          <div class="span-3">${metricPanel("Flow Imbalance", `${fmt(quant.trade_flow_imbalance_btc || 0, 4)} BTC`, "buy minus sell aggressor flow")}</div>
          <div class="span-3">${metricPanel("Micro Bias", `${fmt(quant.micro_bias_bps || 0, 2)} bps`, "micro-price vs mid-price")}</div>

          <div class="span-6">${panel("Spread Regimes", table(["Depth", "State", "Last", "Avg"], regimes))}</div>
          <div class="span-6">${panel("Research Presets", `<div class="preset-grid">${presets}</div>`)}</div>

          <div class="span-6">${panel("Signal Regime Radar", '<div id="quant-radar" class="plot"></div>', 'plot-card')}</div>
          <div class="span-6">${panel("Preset Comparison", '<div id="quant-presets" class="plot"></div>', 'plot-card')}</div>
        </div>
      `;

      renderPlot("quant-radar", [{
        type: "scatterpolar",
        r: [
          Math.abs(quant.realized_vol_bps || 0),
          Math.abs(quant.momentum_bps || 0),
          Math.abs((quant.trade_flow_imbalance_btc || 0) * 100),
          Math.abs((quant.top5_depth_imbalance || 0) * 100),
          Math.abs(quant.micro_bias_bps || 0),
        ],
        theta: ["Vol", "Momentum", "Flow", "Depth", "Micro Bias"],
        fill: "toself",
        fillcolor: "rgba(0,255,136,0.10)",
        line: { color: "#00FF88", width: 2 },
        hovertemplate: "%{theta}: %{r:.2f}<extra></extra>",
      }], {
        ...plotLayout(""),
        polar: {
          bgcolor: "rgba(0,0,0,0)",
          radialaxis: {
            gridcolor: "rgba(255,255,255,0.05)",
            linecolor: "rgba(255,255,255,0.05)",
            tickfont: { color: "#4a524a", size: 10 },
          },
          angularaxis: {
            gridcolor: "rgba(255,255,255,0.05)",
            linecolor: "rgba(255,255,255,0.05)",
            tickfont: { color: "#8a918a", size: 10 },
          },
        },
        margin: { l: 20, r: 20, t: 10, b: 10 },
      });

      const presetNames = (quant.research_presets || []).map((preset) => preset.name);
      renderPlot("quant-presets", [
        {
          x: presetNames,
          y: (quant.research_presets || []).map((preset) => preset.spread_bps),
          type: "bar",
          name: "Spread",
          marker: { color: "rgba(44,227,255,0.7)" },
          hovertemplate: "%{x}<br>%{y:.1f} bps<extra>spread</extra>",
        },
        {
          x: presetNames,
          y: (quant.research_presets || []).map((preset) => preset.skew_bps_per_btc),
          type: "bar",
          name: "Skew",
          marker: { color: "rgba(0,255,136,0.65)" },
          hovertemplate: "%{x}<br>%{y:.1f} bps/BTC<extra>skew</extra>",
        }
      ], {
        ...plotLayout(""),
        barmode: "group",
        legend: { orientation: "h", x: 0, y: 1.12, font: { color: "#8a918a", size: 11 } },
      });
    }

    function renderBacktest(data) {
      const backtest = data.backtest_lite || {};
      const strategy = data.strategy || {};
      el("backtest").innerHTML = `
        <div class="grid">
          <div class="span-3">${metricPanel("Mode", backtest.mode || "paper_session", backtest.status || "warming")}</div>
          <div class="span-3">${metricPanel("Paper P&L", money(backtest.total_pnl_usd || 0), `return ${fmtPct(backtest.paper_return_pct || 0, 3)}`)}</div>
          <div class="span-3">${metricPanel("Max Drawdown", money(backtest.max_drawdown_usd || 0), `peak ${money(backtest.peak_equity_usd || 0)}`)}</div>
          <div class="span-3">${metricPanel("Quote Uptime", fmtPct(backtest.quote_uptime_pct || 0, 1), `fills ${fmtInt(backtest.fill_count || 0)}`)}</div>

          <div class="span-6">${panel("Equity Replay", '<div id="backtest-equity" class="plot"></div>', 'plot-card')}</div>
          <div class="span-6">${panel("P&L Replay", '<div id="backtest-pnl" class="plot"></div>', 'plot-card')}</div>

          <div class="span-7">${panel("Replay Metrics", `
            ${statLines([
              { label: "Window points", value: fmtInt(backtest.window_points || 0) },
              { label: "Fill volume", value: `${fmt(backtest.fill_volume_btc || 0, 4)} BTC` },
              { label: "Fill notional", value: money(backtest.fill_notional_usd || 0) },
              { label: "Baseline spread", value: `${fmt(strategy.config?.base_quote_spread_bps || 0, 2)} bps` },
              { label: "Order size", value: `${fmt(strategy.config?.order_size_btc || 0, 4)} BTC` },
            ])}
          `)}</div>
          <div class="span-5">${panel("Backtest Lane", `
            <div class="badge-row">
              <span class="badge">paper runtime parity</span>
              <span class="badge">live feed replay</span>
              <span class="badge">lite research lane</span>
            </div>
            <div class="empty">Cette lane n’est pas un gros moteur offline complet. Elle assume un rôle desk: replay de session, monitoring paper, diagnostics de baseline.</div>
          `)}</div>
        </div>
      `;

      renderPlot("backtest-equity", [{
        x: (backtest.equity_curve || []).map((_, i) => i + 1),
        y: backtest.equity_curve || [],
        type: "scatter",
        mode: "lines",
        line: { color: "#00FF88", width: 2.4 },
        fill: "tozeroy",
        fillcolor: "rgba(0,255,136,0.08)",
        hovertemplate: "point %{x}<br>$%{y:,.2f}<extra>equity</extra>",
      }], plotLayout(""));

      renderPlot("backtest-pnl", [{
        x: (backtest.pnl_curve || []).map((_, i) => i + 1),
        y: backtest.pnl_curve || [],
        type: "scatter",
        mode: "lines+markers",
        marker: { color: "#2CE3FF", size: 5 },
        line: { color: "#2CE3FF", width: 2.2 },
        hovertemplate: "point %{x}<br>$%{y:,.2f}<extra>P&L</extra>",
      }], plotLayout(""));
    }

    function renderContext(data) {
      const runtime = data.runtime || {};
      const quant = data.quant_lab || {};
      el("sidebar-context").innerHTML = `
        <div class="stat-line"><span class="label">Feed</span><span>${runtime.feed_state || "-"}</span></div>
        <div class="stat-line"><span class="label">Runtime</span><span>${runtime.order_book_ready ? "book ready" : "warming"}</span></div>
        <div class="stat-line"><span class="label">Quant</span><span>${quant.readiness || "-"}</span></div>
        <div class="stat-line"><span class="label">Risk</span><span>${data.risk_status || "-"}</span></div>
      `;
      el("hero-feed").innerHTML = `feed ${runtime.feed_state || "warming"}`;
      el("hero-risk").innerHTML = `risk ${data.risk_status || "booting"}`;
      el("hero-product").innerHTML = `${data.product_id || "BTC-USD"}`;
    }

    async function tick() {
      const response = await fetch("/api/state");
      const data = await response.json();
      renderContext(data);
      renderOverview(data);
      renderMarket(data);
      renderStrategy(data);
      renderQuantLab(data);
      renderBacktest(data);
    }

    tick();
    setInterval(tick, 1800);
  </script>
</body>
</html>
"""
