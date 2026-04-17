import { useEffect, useState } from "react";
import type { Data } from "plotly.js";

import { CandlestickChart } from "./components/CandlestickChart";
import { DataTable } from "./components/DataTable";
import { DepthChart } from "./components/DepthChart";
import { GlassPanel } from "./components/GlassPanel";
import { MetricCard } from "./components/MetricCard";
import { PlotCard } from "./components/PlotCard";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { fetchState } from "./lib/api";
import type { ApiState, PublicTrade } from "./types";

type TabId = "overview" | "market" | "strategy" | "quant-lab" | "backtest";

function fmt(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function money(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return `$${fmt(value, digits)}`;
}

function percent(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return `${fmt(value, digits)}%`;
}

function intFmt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return value.toLocaleString();
}

function toneClass(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "tone-muted";
  }
  if (value > 0) {
    return "tone-good";
  }
  if (value < 0) {
    return "tone-bad";
  }
  return "tone-info";
}

function statLines(
  items: Array<{ label: string; value: string; cls?: string }>
): JSX.Element {
  return (
    <>
      {items.map((item) => (
        <div className="stat-line" key={item.label}>
          <span className="label">{item.label}</span>
          <span className={item.cls}>{item.value}</span>
        </div>
      ))}
    </>
  );
}


function tradesFlowData(trades: PublicTrade[]): Data[] {
  const recent = trades.slice(0, 30).reverse();
  return [
    {
      x: recent.map((trade) => trade.ts),
      y: recent.map((trade) =>
        trade.side === "buy" ? trade.size : -trade.size
      ),
      type: "bar",
      marker: {
        color: recent.map((trade) =>
          trade.side === "buy"
            ? "rgba(0,255,136,0.7)"
            : "rgba(239,68,68,0.75)"
        ),
      },
      hovertemplate: "%{x}<br>%{y:.5f} BTC<extra>flow</extra>",
    },
  ];
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function AppContent({
  activeTab,
  state,
}: {
  activeTab: TabId;
  state: ApiState;
}): JSX.Element {
  const totalPnl =
    (state.portfolio.realized_pnl || 0) +
    (state.portfolio.unrealized_pnl || 0);
  const recentTrades = state.recent_trades.slice(0, 40);
  const buyTrades = recentTrades.filter((trade) => trade.side === "buy");
  const sellTrades = recentTrades.filter((trade) => trade.side === "sell");
  const buyVolume = sum(buyTrades.map((trade) => trade.size));
  const sellVolume = sum(sellTrades.map((trade) => trade.size));
  const totalVolume = buyVolume + sellVolume;
  const weightedNotional = sum(
    recentTrades.map((trade) => trade.price * trade.size)
  );
  const tapeVwap = totalVolume > 0 ? weightedNotional / totalVolume : null;
  const lastTradePrice = recentTrades[0]?.price ?? null;
  const tradeSizes = recentTrades.map((trade) => trade.size);
  const avgTradeSize =
    tradeSizes.length > 0 ? sum(tradeSizes) / tradeSizes.length : null;
  const tradePrices = recentTrades.map((trade) => trade.price);
  const tapeHigh =
    tradePrices.length > 0 ? Math.max(...tradePrices) : null;
  const tapeLow =
    tradePrices.length > 0 ? Math.min(...tradePrices) : null;
  const tapeRange =
    tapeHigh !== null && tapeLow !== null ? tapeHigh - tapeLow : null;
  const topSpread =
    state.best_bid && state.best_ask
      ? state.best_ask.price - state.best_bid.price
      : null;
  const topSpreadBps =
    topSpread !== null && state.mid_price
      ? (topSpread / state.mid_price) * 10_000
      : null;
  const quoteWidth =
    state.quote != null ? state.quote.ask_price - state.quote.bid_price : null;
  const quoteWidthBps =
    quoteWidth !== null && state.mid_price
      ? (quoteWidth / state.mid_price) * 10_000
      : null;
  const inventoryUtilPct =
    state.strategy.config.max_notional_exposure > 0
      ? (Math.abs(state.portfolio.exposure_usd) /
          state.strategy.config.max_notional_exposure) *
        100
      : 0;
  const fillCadence =
    state.runtime.trade_events > 0
      ? (state.strategy.fill_count / state.runtime.trade_events) * 100
      : 0;
  const buySellSkew =
    totalVolume > 0 ? ((buyVolume - sellVolume) / totalVolume) * 100 : 0;
  const bestBidSize = state.best_bid?.size ?? null;
  const bestAskSize = state.best_ask?.size ?? null;
  const topDepthTotal =
    (bestBidSize ?? 0) + (bestAskSize ?? 0);

  const overviewMidData: Data[] = [
    {
      x: state.mid_history.map((point) => point.ts),
      y: state.mid_history.map((point) => point.mid_price),
      type: "scatter",
      mode: "lines",
      line: { color: "#2CE3FF", width: 2.5 },
      fill: "tozeroy",
      fillcolor: "rgba(44,227,255,0.08)",
      hovertemplate: "%{x}<br>$%{y:,.2f}<extra>mid</extra>",
    },
  ];

  const overviewEquityData: Data[] = [
    {
      x: state.mid_history
        .slice(-state.backtest_lite.equity_curve.length)
        .map((point) => point.ts),
      y: state.backtest_lite.equity_curve,
      type: "scatter",
      mode: "lines",
      line: { color: "#00FF88", width: 2.5 },
      fill: "tozeroy",
      fillcolor: "rgba(0,255,136,0.08)",
      hovertemplate: "%{x}<br>$%{y:,.2f}<extra>equity</extra>",
    },
  ];

  const spreadData: Data[] = Object.entries(state.spread_history).map(
    ([depth, values], index) => ({
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
    })
  );

  const strategyReplayData: Data[] = [
    {
      x: state.backtest_lite.pnl_curve.map((_, i) => i + 1),
      y: state.backtest_lite.pnl_curve,
      type: "scatter",
      mode: "lines",
      name: "P&L",
      line: { color: "#00FF88", width: 2.4 },
      hovertemplate: "point %{x}<br>$%{y:,.2f}<extra>P&L</extra>",
    },
    {
      x: state.backtest_lite.equity_curve.map((_, i) => i + 1),
      y: state.backtest_lite.equity_curve,
      type: "scatter",
      mode: "lines",
      name: "Equity",
      yaxis: "y2",
      line: { color: "#2CE3FF", width: 1.8, dash: "dot" },
      hovertemplate: "point %{x}<br>$%{y:,.2f}<extra>equity</extra>",
    },
  ];

  const radarData: Data[] = [
    {
      type: "scatterpolar",
      r: [
        Math.abs(state.quant_lab.realized_vol_bps || 0),
        Math.abs(state.quant_lab.momentum_bps || 0),
        Math.abs((state.quant_lab.trade_flow_imbalance_btc || 0) * 100),
        Math.abs((state.quant_lab.top5_depth_imbalance || 0) * 100),
        Math.abs(state.quant_lab.micro_bias_bps || 0),
      ],
      theta: ["Vol", "Momentum", "Flow", "Depth", "Micro Bias"],
      fill: "toself",
      fillcolor: "rgba(0,255,136,0.10)",
      line: { color: "#00FF88", width: 2 },
      hovertemplate: "%{theta}: %{r:.2f}<extra></extra>",
    },
  ];

  const presetData: Data[] = [
    {
      x: state.quant_lab.research_presets.map((preset) => preset.name),
      y: state.quant_lab.research_presets.map((preset) => preset.spread_bps),
      type: "bar",
      name: "Spread",
      marker: { color: "rgba(44,227,255,0.7)" },
      hovertemplate: "%{x}<br>%{y:.1f} bps<extra>spread</extra>",
    },
    {
      x: state.quant_lab.research_presets.map((preset) => preset.name),
      y: state.quant_lab.research_presets.map(
        (preset) => preset.skew_bps_per_btc
      ),
      type: "bar",
      name: "Skew",
      marker: { color: "rgba(0,255,136,0.65)" },
      hovertemplate: "%{x}<br>%{y:.1f} bps/BTC<extra>skew</extra>",
    },
  ];

  const bookRows = [
    ...state.book.asks
      .slice()
      .reverse()
      .map((level) => [
        <span className="tone-bad" key={`ask-side-${level.price}`}>
          ASK
        </span>,
        money(level.price),
        fmt(level.size, 4),
      ]),
    ...state.book.bids.map((level) => [
      <span className="tone-good" key={`bid-side-${level.price}`}>
        BID
      </span>,
      money(level.price),
      fmt(level.size, 4),
    ]),
  ];

  const tradeRows = state.recent_trades.slice(0, 16).map((trade) => [
    <span
      className={trade.side === "buy" ? "tone-good" : "tone-bad"}
      key={`trade-side-${trade.trade_id ?? trade.ts}`}
    >
      {trade.side}
    </span>,
    money(trade.price),
    fmt(trade.size, 5),
    new Date(trade.ts).toLocaleTimeString(),
  ]);

  const spreadRows = Object.entries(state.spread_metrics).map(
    ([depth, metric]) => [
      depth,
      fmt(metric.last, 2),
      fmt(metric.avg, 2),
      fmt(metric.median, 2),
      fmt(metric.max, 2),
    ]
  );

  const fillRows = state.fills.slice(0, 14).map((fill) => [
    <span
      className={fill.side === "buy" ? "tone-good" : "tone-bad"}
      key={`fill-side-${fill.ts}-${fill.price}`}
    >
      {fill.side}
    </span>,
    money(fill.price),
    fmt(fill.size, 4),
    fill.reason,
  ]);

  const regimeRows = state.quant_lab.spread_regimes.map((regime) => [
    regime.depth,
    regime.state,
    fmt(regime.last, 2),
    fmt(regime.avg, 2),
  ]);
  const pulseRows = [
    ["Feed", state.runtime.feed_state],
    ["Trades", intFmt(state.runtime.trade_events)],
    ["Mid", state.mid_price == null ? "-" : money(state.mid_price)],
    ["Top spread", topSpreadBps == null ? "-" : `${fmt(topSpreadBps, 2)} bps`],
    ["VWAP", tapeVwap == null ? "-" : money(tapeVwap)],
    ["Tape range", tapeRange == null ? "-" : money(tapeRange)],
  ];
  const tapeRows = [
    ["Buy volume", `${fmt(buyVolume, 4)} BTC`],
    ["Sell volume", `${fmt(sellVolume, 4)} BTC`],
    ["Buy/sell skew", `${fmt(buySellSkew, 2)}%`],
    ["Avg trade", avgTradeSize == null ? "-" : `${fmt(avgTradeSize, 5)} BTC`],
    ["Last trade", lastTradePrice == null ? "-" : money(lastTradePrice)],
    ["Trades shown", intFmt(recentTrades.length)],
  ];
  const quoteRows = [
    ["Quote state", state.strategy.quote_active ? "active" : "paused"],
    ["Quote width", quoteWidthBps == null ? "-" : `${fmt(quoteWidthBps, 2)} bps`],
    ["Inventory util", `${fmt(inventoryUtilPct, 2)}%`],
    ["Fill cadence", `${fmt(fillCadence, 2)}%`],
    ["Top depth", topDepthTotal > 0 ? `${fmt(topDepthTotal, 4)} BTC` : "-"],
    ["Risk", state.risk_status],
  ];
  const replayRows = [
    ["P&L", money(state.backtest_lite.total_pnl_usd)],
    ["Return", percent(state.backtest_lite.paper_return_pct, 3)],
    ["Peak", money(state.backtest_lite.peak_equity_usd)],
    ["Drawdown", money(state.backtest_lite.max_drawdown_usd)],
    ["Fill volume", `${fmt(state.backtest_lite.fill_volume_btc, 4)} BTC`],
    ["Fill notional", money(state.backtest_lite.fill_notional_usd)],
  ];

  return (
    <div className="tab-panels">
      <section className="desk-strip">
        <div className="strip-card">
          <strong>Runtime Control</strong>
          <span>
            Feed {state.runtime.feed_state}, carnet{" "}
            {state.runtime.order_book_ready ? "hydrate" : "en chauffe"} et
            uptime {intFmt(state.runtime.uptime_s)} s.
          </span>
        </div>
        <div className="strip-card">
          <strong>Inventory Lane</strong>
          <span>
            Position {fmt(state.portfolio.position_btc, 4)} BTC, exposition{" "}
            {money(state.portfolio.exposure_usd)} et skew dynamique actif.
          </span>
        </div>
        <div className="strip-card">
          <strong>Quant Research</strong>
          <span>
            Regimes spreads, flow imbalance et micro-bias pour une lecture type
            lab simplifiee.
          </span>
        </div>
        <div className="strip-card">
          <strong>Paper Replay</strong>
          <span>
            Equity, P&amp;L et diagnostics de session pour une lane backtest
            orientee entretien.
          </span>
        </div>
      </section>

      <section className={`tab-panel ${activeTab === "overview" ? "active" : ""}`}>
        <div className="grid">
          <div className="span-3">
            <MetricCard
              title="Mid Price"
              value={state.mid_price == null ? "-" : money(state.mid_price)}
              sub={state.product_id}
            />
          </div>
          <div className="span-3">
            <MetricCard
              title="Total P&L"
              value={money(totalPnl)}
              sub={`realized ${money(state.portfolio.realized_pnl)} / unrealized ${money(state.portfolio.unrealized_pnl)}`}
            />
          </div>
          <div className="span-3">
            <MetricCard
              title="Inventory"
              value={`${fmt(state.portfolio.position_btc, 4)} BTC`}
              sub={`avg entry ${money(state.portfolio.avg_entry_price)}`}
            />
          </div>
          <div className="span-3">
            <MetricCard
              title="Desk Verdict"
              value={state.runtime.feed_state}
              sub={`risk ${state.risk_status} / quant ${state.quant_lab.readiness}`}
            />
          </div>

          <div className="span-8">
            <GlassPanel title="Desk Pulse">
              <div className="badge-row">
                <span className="badge">feed {state.runtime.feed_state}</span>
                <span className="badge">
                  book {state.runtime.order_book_ready ? "ready" : "warming"}
                </span>
                <span className="badge">
                  fills {intFmt(state.strategy.fill_count)}
                </span>
                <span className="badge">
                  quote uptime {percent(state.backtest_lite.quote_uptime_pct, 1)}
                </span>
              </div>
              {statLines([
                {
                  label: "Uptime",
                  value: `${intFmt(state.runtime.uptime_s)} s`,
                },
                {
                  label: "Messages seen",
                  value: intFmt(state.runtime.messages_seen),
                },
                {
                  label: "Exposure",
                  value: money(Math.abs(state.portfolio.exposure_usd)),
                },
                {
                  label: "Paper return",
                  value: percent(state.backtest_lite.paper_return_pct, 3),
                  cls: toneClass(state.backtest_lite.paper_return_pct),
                },
                {
                  label: "Trade flow imbalance",
                  value: `${fmt(state.quant_lab.trade_flow_imbalance_btc, 4)} BTC`,
                },
              ])}
            </GlassPanel>
          </div>

          <div className="span-4">
            <GlassPanel title="Runtime Lanes">
              {statLines([
                {
                  label: "Feed state",
                  value: state.runtime.feed_state,
                },
                {
                  label: "Order book",
                  value: state.runtime.order_book_ready ? "ready" : "warming",
                },
                {
                  label: "Book levels",
                  value: `${state.runtime.book_levels.bids} / ${state.runtime.book_levels.asks}`,
                },
                { label: "Risk status", value: state.risk_status },
                {
                  label: "Quant window",
                  value: intFmt(state.quant_lab.window_points),
                },
              ])}
            </GlassPanel>
          </div>

          <div className="span-12">
            <CandlestickChart
              midHistory={state.mid_history}
              fills={state.fills}
              recentTrades={state.recent_trades}
              midPrice={state.mid_price}
              bestBid={state.best_bid?.price}
              bestAsk={state.best_ask?.price}
            />
          </div>
          <div className="span-6">
            <PlotCard
              title="Equity Curve"
              subtitle="Paper portfolio equity"
              data={overviewEquityData}
              legend={[{ label: 'Equity', color: '#00FF88' }]}
            />
          </div>
          <div className="span-6">
            <PlotCard
              title="Mid Price"
              subtitle="Real-time mid price"
              data={overviewMidData}
              legend={[{ label: 'Mid', color: '#2CE3FF' }]}
            />
          </div>
          <div className="span-4">
            <GlassPanel title="Market Snapshot">
              <div className="mini-grid">
                {pulseRows.map(([label, value]) => (
                  <div className="mini-kpi" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </GlassPanel>
          </div>
          <div className="span-4">
            <GlassPanel title="Tape Summary">
              <div className="mini-grid">
                {tapeRows.map(([label, value]) => (
                  <div className="mini-kpi" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </GlassPanel>
          </div>
          <div className="span-4">
            <GlassPanel title="Replay Snapshot">
              <div className="mini-grid">
                {replayRows.map(([label, value]) => (
                  <div className="mini-kpi" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </GlassPanel>
          </div>
        </div>
      </section>

      <section className={`tab-panel ${activeTab === "market" ? "active" : ""}`}>
        <div className="grid">
          <div className="span-7">
            <DepthChart
              bids={state.book.bids}
              asks={state.book.asks}
              midPrice={state.mid_price}
            />
          </div>
          <div className="span-5">
            <GlassPanel title="Order Book">
              {bookRows.length > 0 ? (
                <DataTable headers={["Side", "Price", "Size"]} rows={bookRows} />
              ) : (
                <div className="panel-fallback">
                  <strong>Book warming</strong>
                  <span>Level2 depth hydrating...</span>
                </div>
              )}
            </GlassPanel>
          </div>
          <div className="span-6">
            <GlassPanel title="Trade Tape">
              <DataTable
                headers={["Side", "Price", "Size", "Time"]}
                rows={tradeRows}
              />
            </GlassPanel>
          </div>
          <div className="span-7">
            <GlassPanel title="Spread Lanes">
              <DataTable
                headers={["Depth", "Last", "Avg", "Median", "Max"]}
                rows={spreadRows}
              />
            </GlassPanel>
          </div>
          <div className="span-5">
            <GlassPanel title="Microstructure State">
              {statLines([
                {
                  label: "Realized vol",
                  value: `${fmt(state.quant_lab.realized_vol_bps, 2)} bps`,
                },
                {
                  label: "Momentum",
                  value: `${fmt(state.quant_lab.momentum_bps, 2)} bps`,
                  cls: toneClass(state.quant_lab.momentum_bps),
                },
                {
                  label: "Flow imbalance",
                  value: `${fmt(state.quant_lab.trade_flow_imbalance_btc, 4)} BTC`,
                  cls: toneClass(state.quant_lab.trade_flow_imbalance_btc),
                },
                {
                  label: "Depth imbalance",
                  value: fmt(state.quant_lab.top5_depth_imbalance, 3),
                },
                {
                  label: "Micro bias",
                  value: `${fmt(state.quant_lab.micro_bias_bps, 2)} bps`,
                  cls: toneClass(state.quant_lab.micro_bias_bps),
                },
              ])}
            </GlassPanel>
          </div>
          <div className="span-6">
            <PlotCard
              title="Depth Spread History"
              subtitle="Multi-depth spread evolution"
              data={spreadData}
              legend={Object.keys(state.spread_history).map((k, i) => ({
                label: k,
                color: ['#00FF88', '#2CE3FF', '#eab308', '#ef4444'][i % 4],
              }))}
              layout={{
                showlegend: false,
              }}
            />
          </div>
          <div className="span-6">
            <PlotCard
              title="Trade Side Flow"
              subtitle="Buy/sell aggressor volume"
              data={tradesFlowData(state.recent_trades)}
              legend={[
                { label: 'Buy', color: '#00FF88' },
                { label: 'Sell', color: '#FF4D4D' },
              ]}
            />
          </div>
          <div className="span-4">
            <GlassPanel title="Tape Diagnostics">
              <div className="mini-grid">
                {tapeRows.map(([label, value]) => (
                  <div className="mini-kpi" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </GlassPanel>
          </div>
          <div className="span-4">
            <GlassPanel title="Top Of Book">
              <div className="mini-grid">
                {[
                  ["Best bid", state.best_bid ? money(state.best_bid.price) : "-"],
                  ["Bid size", bestBidSize == null ? "-" : `${fmt(bestBidSize, 4)} BTC`],
                  ["Best ask", state.best_ask ? money(state.best_ask.price) : "-"],
                  ["Ask size", bestAskSize == null ? "-" : `${fmt(bestAskSize, 4)} BTC`],
                  ["Spread", topSpread == null ? "-" : money(topSpread, 2)],
                  ["Spread bps", topSpreadBps == null ? "-" : `${fmt(topSpreadBps, 2)} bps`],
                ].map(([label, value]) => (
                  <div className="mini-kpi" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </GlassPanel>
          </div>
          <div className="span-4">
            <GlassPanel title="Trade Distribution">
              <div className="mini-grid">
                {[
                  ["Last trade", lastTradePrice == null ? "-" : money(lastTradePrice)],
                  ["VWAP", tapeVwap == null ? "-" : money(tapeVwap)],
                  ["High", tapeHigh == null ? "-" : money(tapeHigh)],
                  ["Low", tapeLow == null ? "-" : money(tapeLow)],
                  ["Range", tapeRange == null ? "-" : money(tapeRange)],
                  ["Messages", intFmt(state.runtime.messages_seen)],
                ].map(([label, value]) => (
                  <div className="mini-kpi" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </GlassPanel>
          </div>
        </div>
      </section>

      <section className={`tab-panel ${activeTab === "strategy" ? "active" : ""}`}>
        <div className="grid">
          <div className="span-4">
            <MetricCard
              title="Risk Guard"
              value={state.risk_status}
              sub={`max loss ${money(state.strategy.config.max_loss, 0)} / max notionnel ${money(state.strategy.config.max_notional_exposure, 0)}`}
            />
          </div>
          <div className="span-4">
            <MetricCard
              title="Quote Engine"
              value={state.strategy.quote_active ? "active" : "paused"}
              sub={`base spread ${fmt(state.strategy.config.base_quote_spread_bps, 1)} bps`}
            />
          </div>
          <div className="span-4">
            <MetricCard
              title="Fill Count"
              value={intFmt(state.strategy.fill_count)}
              sub={`avg fill notional ${money(state.strategy.avg_fill_notional)}`}
            />
          </div>

          <div className="span-7">
            <GlassPanel title="Quote & Inventory">
              <div className="badge-row">
                {state.quote ? (
                  <>
                    <span className="badge">
                      bid {money(state.quote.bid_price)} x {fmt(state.quote.bid_size, 4)}
                    </span>
                    <span className="badge">
                      ask {money(state.quote.ask_price)} x {fmt(state.quote.ask_size, 4)}
                    </span>
                  </>
                ) : (
                  <span className="badge">quote inactive</span>
                )}
                <span className="badge">
                  inventory {fmt(state.portfolio.position_btc, 4)} BTC
                </span>
              </div>
              {statLines([
                {
                  label: "Avg entry",
                  value: money(state.portfolio.avg_entry_price),
                },
                {
                  label: "Exposure",
                  value: money(state.portfolio.exposure_usd),
                  cls: toneClass(state.portfolio.exposure_usd),
                },
                { label: "Cash", value: money(state.portfolio.cash) },
                { label: "Equity", value: money(state.portfolio.equity) },
                {
                  label: "Realized P&L",
                  value: money(state.portfolio.realized_pnl),
                  cls: toneClass(state.portfolio.realized_pnl),
                },
              ])}
            </GlassPanel>
          </div>

          <div className="span-5">
            <GlassPanel title="Strategy Config">
              {statLines([
                {
                  label: "Base spread",
                  value: `${fmt(state.strategy.config.base_quote_spread_bps, 2)} bps`,
                },
                {
                  label: "Order size",
                  value: `${fmt(state.strategy.config.order_size_btc, 4)} BTC`,
                },
                {
                  label: "Skew / BTC",
                  value: `${fmt(state.strategy.config.position_skew_bps_per_btc, 2)} bps`,
                },
                {
                  label: "Inventory",
                  value: `${fmt(state.strategy.inventory_btc, 4)} BTC`,
                },
                {
                  label: "Quote active",
                  value: state.strategy.quote_active ? "yes" : "no",
                },
              ])}
            </GlassPanel>
          </div>

          <div className="span-6">
            <GlassPanel title="Simulated Fills">
              <DataTable
                headers={["Side", "Price", "Size", "Reason"]}
                rows={fillRows}
              />
            </GlassPanel>
          </div>

          <div className="span-6">
            <PlotCard
              title="P&L & Inventory Replay"
              subtitle="Dual-axis strategy performance"
              data={strategyReplayData}
              legend={[
                { label: 'P&L', color: '#00FF88' },
                { label: 'Equity', color: '#2CE3FF' },
              ]}
              layout={{
                yaxis2: {
                  overlaying: "y",
                  side: "right",
                  color: "#4a524a",
                  showgrid: false,
                  gridcolor: 'rgba(148,163,184,0.04)',
                },
                showlegend: false,
              }}
            />
          </div>
          <div className="span-4">
            <GlassPanel title="Quote Diagnostics">
              <div className="mini-grid">
                {quoteRows.map(([label, value]) => (
                  <div className="mini-kpi" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </GlassPanel>
          </div>
          <div className="span-4">
            <GlassPanel title="Portfolio Diagnostics">
              <div className="mini-grid">
                {[
                  ["Cash", money(state.portfolio.cash)],
                  ["Equity", money(state.portfolio.equity)],
                  ["Exposure", money(state.portfolio.exposure_usd)],
                  ["Avg entry", money(state.portfolio.avg_entry_price)],
                  ["Realized", money(state.portfolio.realized_pnl)],
                  ["Unrealized", money(state.portfolio.unrealized_pnl)],
                ].map(([label, value]) => (
                  <div className="mini-kpi" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </GlassPanel>
          </div>
          <div className="span-4">
            <GlassPanel title="Execution Pulse">
              <div className="mini-grid">
                {[
                  ["Fill count", intFmt(state.strategy.fill_count)],
                  ["Avg fill", money(state.strategy.avg_fill_notional)],
                  ["Order size", `${fmt(state.strategy.config.order_size_btc, 4)} BTC`],
                  ["Base spread", `${fmt(state.strategy.config.base_quote_spread_bps, 2)} bps`],
                  ["Skew", `${fmt(state.strategy.config.position_skew_bps_per_btc, 2)} bps`],
                  ["Quote width", quoteWidthBps == null ? "-" : `${fmt(quoteWidthBps, 2)} bps`],
                ].map(([label, value]) => (
                  <div className="mini-kpi" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </GlassPanel>
          </div>
        </div>
      </section>

      <section
        className={`tab-panel ${activeTab === "quant-lab" ? "active" : ""}`}
      >
        <div className="grid">
          <div className="span-3">
            <MetricCard
              title="Realized Vol"
              value={`${fmt(state.quant_lab.realized_vol_bps, 2)} bps`}
              sub={`window ${intFmt(state.quant_lab.window_points)} points`}
            />
          </div>
          <div className="span-3">
            <MetricCard
              title="Momentum"
              value={`${fmt(state.quant_lab.momentum_bps, 2)} bps`}
              sub={state.quant_lab.readiness}
            />
          </div>
          <div className="span-3">
            <MetricCard
              title="Flow Imbalance"
              value={`${fmt(state.quant_lab.trade_flow_imbalance_btc, 4)} BTC`}
              sub="aggressor flow"
            />
          </div>
          <div className="span-3">
            <MetricCard
              title="Micro Bias"
              value={`${fmt(state.quant_lab.micro_bias_bps, 2)} bps`}
              sub="microstructure"
            />
          </div>

          <div className="span-6">
            <GlassPanel title="Spread Regimes">
              <DataTable
                headers={["Depth", "State", "Last", "Avg"]}
                rows={regimeRows}
              />
            </GlassPanel>
          </div>

          <div className="span-6">
            <GlassPanel title="Research Presets">
              <div className="preset-grid">
                {state.quant_lab.research_presets.map((preset) => (
                  <div className="preset-card" key={preset.name}>
                    <strong>{preset.name}</strong>
                    {statLines([
                      {
                        label: "Spread",
                        value: `${fmt(preset.spread_bps, 1)} bps`,
                      },
                      {
                        label: "Skew",
                        value: `${fmt(preset.skew_bps_per_btc, 1)} bps/BTC`,
                      },
                      { label: "Read", value: preset.stance },
                    ])}
                  </div>
                ))}
              </div>
            </GlassPanel>
          </div>

          <div className="span-6">
            <PlotCard
              title="Signal Regime Radar"
              subtitle="Microstructure signal fingerprint"
              data={radarData}
              height={340}
              layout={{
                polar: {
                  bgcolor: "rgba(0,0,0,0)",
                  radialaxis: {
                    gridcolor: "rgba(148,163,184,0.08)",
                    linecolor: "rgba(148,163,184,0.08)",
                    tickfont: { color: "#4a524a", size: 10 },
                  },
                  angularaxis: {
                    gridcolor: "rgba(148,163,184,0.08)",
                    linecolor: "rgba(148,163,184,0.08)",
                    tickfont: { color: "#8a918a", size: 11 },
                  },
                },
                margin: { l: 30, r: 30, t: 16, b: 16 },
              }}
            />
          </div>

          <div className="span-6">
            <PlotCard
              title="Preset Comparison"
              subtitle="Research preset spread/skew"
              data={presetData}
              legend={[
                { label: 'Spread', color: '#2CE3FF' },
                { label: 'Skew', color: '#00FF88' },
              ]}
              layout={{
                barmode: "group",
                showlegend: false,
              }}
            />
          </div>
          <div className="span-4">
            <GlassPanel title="Flow Metrics">
              <div className="mini-grid">
                {[
                  ["Readiness", state.quant_lab.readiness],
                  ["Window", intFmt(state.quant_lab.window_points)],
                  ["Realized vol", `${fmt(state.quant_lab.realized_vol_bps, 2)} bps`],
                  ["Momentum", `${fmt(state.quant_lab.momentum_bps, 2)} bps`],
                  ["Flow", `${fmt(state.quant_lab.trade_flow_imbalance_btc, 4)} BTC`],
                  ["Micro bias", `${fmt(state.quant_lab.micro_bias_bps, 2)} bps`],
                ].map(([label, value]) => (
                  <div className="mini-kpi" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </GlassPanel>
          </div>
          <div className="span-4">
            <GlassPanel title="Depth Metrics">
              <div className="mini-grid">
                {[
                  ["Top5 imbalance", fmt(state.quant_lab.top5_depth_imbalance, 3)],
                  ["Buy volume", `${fmt(buyVolume, 4)} BTC`],
                  ["Sell volume", `${fmt(sellVolume, 4)} BTC`],
                  ["VWAP", tapeVwap == null ? "-" : money(tapeVwap)],
                  ["Spread state", state.quant_lab.spread_regimes[0]?.state ?? "-"],
                  ["Top spread", topSpreadBps == null ? "-" : `${fmt(topSpreadBps, 2)} bps`],
                ].map(([label, value]) => (
                  <div className="mini-kpi" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </GlassPanel>
          </div>
          <div className="span-4">
            <GlassPanel title="Research Monitor">
              <div className="mini-grid">
                {state.quant_lab.research_presets.map((preset) => (
                  <div className="mini-kpi" key={preset.name}>
                    <span>{preset.name}</span>
                    <strong>{fmt(preset.spread_bps, 1)} bps</strong>
                  </div>
                ))}
              </div>
            </GlassPanel>
          </div>
        </div>
      </section>

      <section className={`tab-panel ${activeTab === "backtest" ? "active" : ""}`}>
        <div className="grid">
          <div className="span-3">
            <MetricCard
              title="Mode"
              value={state.backtest_lite.mode}
              sub={state.backtest_lite.status}
            />
          </div>
          <div className="span-3">
            <MetricCard
              title="Paper P&L"
              value={money(state.backtest_lite.total_pnl_usd)}
              sub={`return ${percent(state.backtest_lite.paper_return_pct, 3)}`}
            />
          </div>
          <div className="span-3">
            <MetricCard
              title="Max Drawdown"
              value={money(state.backtest_lite.max_drawdown_usd)}
              sub={`peak ${money(state.backtest_lite.peak_equity_usd)}`}
            />
          </div>
          <div className="span-3">
            <MetricCard
              title="Quote Uptime"
              value={percent(state.backtest_lite.quote_uptime_pct, 1)}
              sub={`fills ${intFmt(state.backtest_lite.fill_count)}`}
            />
          </div>

          <div className="span-6">
            <PlotCard
              title="Equity Replay"
              subtitle="Cumulative paper equity"
              data={[
                {
                  x: state.backtest_lite.equity_curve.map((_, i) => i + 1),
                  y: state.backtest_lite.equity_curve,
                  type: "scatter",
                  mode: "lines",
                  line: { color: "#00FF88", width: 2.4 },
                  fill: "tozeroy",
                  fillcolor: "rgba(0,255,136,0.06)",
                  hovertemplate: "point %{x}<br>$%{y:,.2f}<extra>equity</extra>",
                },
              ]}
              legend={[{ label: 'Equity', color: '#00FF88' }]}
            />
          </div>
          <div className="span-6">
            <PlotCard
              title="P&L Replay"
              subtitle="Per-period P&L attribution"
              data={[
                {
                  x: state.backtest_lite.pnl_curve.map((_, i) => i + 1),
                  y: state.backtest_lite.pnl_curve,
                  type: "scatter",
                  mode: "lines+markers",
                  marker: { color: "#2CE3FF", size: 4, line: { color: '#0b1220', width: 1 } },
                  line: { color: "#2CE3FF", width: 2.2 },
                  hovertemplate: "point %{x}<br>$%{y:,.2f}<extra>P&L</extra>",
                },
              ]}
              legend={[{ label: 'P&L', color: '#2CE3FF' }]}
            />
          </div>

          <div className="span-7">
            <GlassPanel title="Replay Metrics">
              {statLines([
                {
                  label: "Window points",
                  value: intFmt(state.backtest_lite.window_points),
                },
                {
                  label: "Fill volume",
                  value: `${fmt(state.backtest_lite.fill_volume_btc, 4)} BTC`,
                },
                {
                  label: "Fill notional",
                  value: money(state.backtest_lite.fill_notional_usd),
                },
                {
                  label: "Baseline spread",
                  value: `${fmt(state.strategy.config.base_quote_spread_bps, 2)} bps`,
                },
                {
                  label: "Order size",
                  value: `${fmt(state.strategy.config.order_size_btc, 4)} BTC`,
                },
              ])}
            </GlassPanel>
          </div>
          <div className="span-5">
            <GlassPanel title="Backtest Lane">
              <div className="badge-row">
                <span className="badge">paper</span>
                <span className="badge">replay</span>
                <span className="badge">diagnostics</span>
              </div>
              <div className="empty">session diagnostics</div>
            </GlassPanel>
          </div>
          <div className="span-4">
            <GlassPanel title="Replay KPIs">
              <div className="mini-grid">
                {replayRows.map(([label, value]) => (
                  <div className="mini-kpi" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </GlassPanel>
          </div>
          <div className="span-4">
            <GlassPanel title="Runtime Parity">
              <div className="mini-grid">
                {[
                  ["Quote uptime", percent(state.backtest_lite.quote_uptime_pct, 1)],
                  ["Fill count", intFmt(state.backtest_lite.fill_count)],
                  ["Window", intFmt(state.backtest_lite.window_points)],
                  ["Runtime trades", intFmt(state.runtime.trade_events)],
                  ["Strategy fills", intFmt(state.strategy.fill_count)],
                  ["Risk state", state.risk_status],
                ].map(([label, value]) => (
                  <div className="mini-kpi" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </GlassPanel>
          </div>
          <div className="span-4">
            <GlassPanel title="Session State">
              <div className="mini-grid">
                {[
                  ["Status", state.backtest_lite.status],
                  ["Mode", state.backtest_lite.mode],
                  ["Peak equity", money(state.backtest_lite.peak_equity_usd)],
                  ["Drawdown", money(state.backtest_lite.max_drawdown_usd)],
                  ["Volume", `${fmt(state.backtest_lite.fill_volume_btc, 4)} BTC`],
                  ["Notional", money(state.backtest_lite.fill_notional_usd)],
                ].map(([label, value]) => (
                  <div className="mini-kpi" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </GlassPanel>
          </div>
        </div>
      </section>
    </div>
  );
}

export function App(): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [state, setState] = useState<ApiState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    async function tick(): Promise<void> {
      try {
        const nextState = await fetchState(controller.signal);
        if (!mounted) {
          return;
        }
        setState(nextState);
        setError(null);
      } catch (err) {
        if (!mounted) {
          return;
        }
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        setError(err instanceof Error ? err.message : "state fetch failed");
      }
    }

    void tick();
    const interval = window.setInterval(() => {
      void tick();
    }, 1800);

    return () => {
      mounted = false;
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="app-shell">
      <Sidebar
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as TabId)}
        feedState={state?.runtime.feed_state ?? 'warming'}
        bookReady={state?.runtime.order_book_ready ?? false}
        quantReadiness={state?.quant_lab.readiness ?? 'booting'}
        riskStatus={state?.risk_status ?? 'booting'}
      />
      <main className="main">
        <Topbar
          feed={`feed ${state?.runtime.feed_state ?? "warming"}`}
          risk={`risk ${state?.risk_status ?? "booting"}`}
          product={state?.product_id ?? "BTC-USD"}
          activeTab={activeTab}
        />
        {error ? (
          <GlassPanel title="Runtime Error">
            <div className="empty">{error}</div>
          </GlassPanel>
        ) : null}
        {state ? (
          <AppContent activeTab={activeTab} state={state} />
        ) : (
          <GlassPanel title="Boot Sequence">
            <div className="empty">Hydrating runtime...</div>
          </GlassPanel>
        )}
      </main>
    </div>
  );
}
