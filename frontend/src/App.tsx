import { useEffect, useState } from "react";
import type { Data } from "plotly.js";

import { BentoCard } from "./components/BentoCard";
import { CandlestickChart } from "./components/CandlestickChart";
import { DepthChart } from "./components/DepthChart";
import { PlotCard } from "./components/PlotCard";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { DataTable } from "./components/DataTable";
import { fetchState } from "./lib/api";
import { cn } from "./lib/utils";
import type { ApiState, PublicTrade } from "./types";

type TabId =
  | "overview"
  | "price-action"
  | "market"
  | "strategy"
  | "quant-lab"
  | "backtest";

function fmt(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function money(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `$${fmt(value, digits)}`;
}

function percent(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${fmt(value, digits)}%`;
}

function intFmt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return value.toLocaleString();
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function toneClass(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "text-neutral-500";
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-red-400";
  return "text-cyan-400";
}

function KpiRow({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-white/[0.04] last:border-0 text-[11px]">
      <span className="text-neutral-500">{label}</span>
      <span className={cn("text-neutral-300 font-mono", cls)}>{value}</span>
    </div>
  );
}

function tradesFlowData(trades: PublicTrade[]): Data[] {
  const recent = trades.slice(0, 30).reverse();
  return [{
    x: recent.map(t => t.ts),
    y: recent.map(t => t.side === "buy" ? t.size : -t.size),
    type: "bar",
    marker: { color: recent.map(t => t.side === "buy" ? "rgba(0,255,136,0.7)" : "rgba(239,68,68,0.75)") },
    hovertemplate: "%{x}<br>%{y:.5f} BTC<extra>flow</extra>",
  }];
}

function statLines(items: Array<{ label: string; value: string; cls?: string }>): JSX.Element {
  return <>{items.map(item => <KpiRow key={item.label} label={item.label} value={item.value} cls={item.cls} />)}</>;
}

function OverviewBento({ state }: { state: ApiState }) {
  const totalPnl = (state.portfolio.realized_pnl || 0) + (state.portfolio.unrealized_pnl || 0);
  const recentTrades = state.recent_trades.slice(0, 40);
  const buyVol = sum(recentTrades.filter(t => t.side === "buy").map(t => t.size));
  const sellVol = sum(recentTrades.filter(t => t.side === "sell").map(t => t.size));
  const totalVol = buyVol + sellVol;
  const buySellSkew = totalVol > 0 ? ((buyVol - sellVol) / totalVol * 100) : 0;
  const topSpread = state.best_bid && state.best_ask ? state.best_ask.price - state.best_bid.price : null;
  const topSpreadBps = topSpread !== null && state.mid_price ? (topSpread / state.mid_price) * 10_000 : null;
  const quoteWidthBps = state.quote && state.mid_price
    ? ((state.quote.ask_price - state.quote.bid_price) / state.mid_price) * 10_000
    : null;
  const equityData: Data[] = [{
    x: state.mid_history.slice(-state.backtest_lite.equity_curve.length).map(p => p.ts),
    y: state.backtest_lite.equity_curve,
    type: "scatter", mode: "lines",
    line: { color: "#00FF88", width: 2 },
    fill: "tozeroy", fillcolor: "rgba(0,255,136,0.06)",
    hovertemplate: "%{x}<br>$%{y:,.2f}<extra>equity</extra>",
  }];
  const portfolioRows = [
    { label: "Cash", value: money(state.portfolio.cash) },
    { label: "Exposure", value: money(state.portfolio.exposure_usd), cls: toneClass(state.portfolio.exposure_usd) },
    { label: "Avg entry", value: money(state.portfolio.avg_entry_price) },
    { label: "Realized", value: money(state.portfolio.realized_pnl), cls: toneClass(state.portfolio.realized_pnl) },
    { label: "Unrealized", value: money(state.portfolio.unrealized_pnl), cls: toneClass(state.portfolio.unrealized_pnl) },
  ];
  const fillRows = state.fills.slice(0, 6).map(f => [
    <span className={f.side === "buy" ? "text-emerald-400" : "text-red-400"} key={`${f.ts}-${f.price}`}>{f.side}</span>,
    money(f.price),
    fmt(f.size, 4),
    f.reason,
  ]);

  return (
    <div className="bento-grid h-full">
      <BentoCard title="Equity" subtitle="paper portfolio" accent="green" compact className="bento-kpi-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-mono font-bold text-white">{money(state.portfolio.equity)}</span>
        </div>
      </BentoCard>

      <BentoCard title="P&L" subtitle="realized + unrealized" accent={totalPnl >= 0 ? "green" : "red"} compact className="bento-kpi-2">
        <div className="flex items-baseline gap-2">
          <span className={cn("text-xl font-mono font-bold", totalPnl >= 0 ? "text-emerald-400" : "text-red-400")}>{money(totalPnl)}</span>
        </div>
      </BentoCard>

      <BentoCard title="Inventory" subtitle="position" accent="cyan" compact className="bento-kpi-3">
        <div>
          <span className="text-xl font-mono font-bold text-white">{fmt(state.portfolio.position_btc, 4)}</span>
          <span className="text-xs text-neutral-500 ml-1">BTC</span>
        </div>
      </BentoCard>

      <BentoCard title="Return" subtitle="paper session" accent="cyan" compact className="bento-kpi-4">
        <div className="flex items-center gap-2">
          <span className="text-xl font-mono font-bold text-white">{percent(state.backtest_lite.paper_return_pct, 2)}</span>
        </div>
      </BentoCard>

      <BentoCard title="Equity Curve" subtitle="performance lane" accent="green" className="bento-overview-equity">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {[
            `feed ${state.runtime.feed_state}`,
            `risk ${state.risk_status}`,
            `fills ${intFmt(state.strategy.fill_count)}`,
          ].map((item) => (
            <span key={item} className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-neutral-400">
              {item}
            </span>
          ))}
        </div>
        <div className="h-full [&_.js-plotly-plot]:!h-full">
          <PlotCard
            title=""
            subtitle=""
            data={equityData}
            height={250}
            className="!border-0 !shadow-none !rounded-none [&>div:first-child]:hidden"
            legend={[{ label: 'Equity', color: '#00FF88' }]}
          />
        </div>
      </BentoCard>

      <BentoCard title="Desk Pulse" subtitle="runtime essentials" accent="cyan" compact className="bento-overview-runtime">
        <div className="space-y-0">
          <KpiRow label="Feed" value={state.runtime.feed_state} />
          <KpiRow label="Book" value={state.runtime.order_book_ready ? "ready" : "warming"} cls={state.runtime.order_book_ready ? "text-cyan-300" : "text-amber-400"} />
          <KpiRow label="Messages" value={intFmt(state.runtime.messages_seen)} />
          <KpiRow label="Trades" value={intFmt(state.runtime.trade_events)} />
          <KpiRow label="Risk" value={state.risk_status} cls={state.risk_status === "nominal" ? "text-cyan-300" : "text-amber-400"} />
        </div>
      </BentoCard>

      <BentoCard title="Strategy Pulse" subtitle="quote engine" accent="cyan" compact className="bento-overview-strategy">
        <div className="space-y-0">
          <KpiRow label="Quote" value={state.strategy.quote_active ? "active" : "paused"} cls={state.strategy.quote_active ? "text-cyan-300" : "text-amber-400"} />
          <KpiRow label="Base spread" value={`${fmt(state.strategy.config.base_quote_spread_bps, 2)} bps`} />
          <KpiRow label="Quote width" value={quoteWidthBps == null ? "-" : `${fmt(quoteWidthBps, 2)} bps`} />
          <KpiRow label="Fill count" value={intFmt(state.strategy.fill_count)} />
          <KpiRow label="Avg fill" value={money(state.strategy.avg_fill_notional)} />
        </div>
      </BentoCard>

      <BentoCard title="Market Summary" subtitle="microstructure" accent="cyan" compact className="bento-overview-market">
        <div className="space-y-0">
          <KpiRow label="Mid" value={state.mid_price == null ? "-" : money(state.mid_price)} />
          <KpiRow label="Top spread" value={topSpreadBps == null ? "-" : `${fmt(topSpreadBps, 1)} bps`} />
          <KpiRow label="Vol" value={`${fmt(state.quant_lab.realized_vol_bps, 1)} bps`} />
          <KpiRow label="Flow" value={`${fmt(buySellSkew, 1)}%`} cls={toneClass(buySellSkew)} />
          <KpiRow label="Momentum" value={`${fmt(state.quant_lab.momentum_bps, 1)} bps`} cls={toneClass(state.quant_lab.momentum_bps)} />
        </div>
      </BentoCard>

      <BentoCard title="Portfolio" subtitle="inventory + cash" accent="green" compact className="bento-overview-portfolio">
        <div>{statLines(portfolioRows)}</div>
      </BentoCard>

      <BentoCard title="Recent Fills" subtitle="execution events" accent="amber" className="bento-overview-fills">
        <div className="overflow-auto h-full">
          <DataTable headers={["Side", "Price", "Size", "Reason"]} rows={fillRows} />
        </div>
      </BentoCard>
    </div>
  );
}

function PriceActionBento({ state }: { state: ApiState }) {
  const recentTrades = state.recent_trades.slice(0, 20);
  const tradeRows = recentTrades.map(t => [
    <span className={t.side === "buy" ? "text-emerald-400" : "text-red-400"} key={`trade-${t.trade_id ?? t.ts}`}>{t.side}</span>,
    money(t.price),
    fmt(t.size, 5),
    new Date(t.ts).toLocaleTimeString(),
  ]);
  const bookRows = [
    ...state.book.asks.slice().reverse().map(level => [
      <span className="text-red-400" key={`ask-${level.price}`}>ASK</span>,
      money(level.price),
      fmt(level.size, 4),
    ]),
    ...state.book.bids.map(level => [
      <span className="text-emerald-400" key={`bid-${level.price}`}>BID</span>,
      money(level.price),
      fmt(level.size, 4),
    ]),
  ];
  const topSpread = state.best_bid && state.best_ask ? state.best_ask.price - state.best_bid.price : null;
  const topSpreadBps = topSpread !== null && state.mid_price ? (topSpread / state.mid_price) * 10_000 : null;

  return (
    <div className="bento-grid-price h-full">
      <BentoCard title="Price Action" subtitle="ohlc + simulated fills" accent="cyan" className="bento-p-chart">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {[
            state.mid_price == null ? "mid -" : `mid ${money(state.mid_price)}`,
            state.best_bid && state.best_ask ? `spread ${fmt(((state.best_ask.price - state.best_bid.price) / (state.mid_price || 1)) * 10000, 2)} bps` : "spread -",
            `trades ${intFmt(state.runtime.trade_events)}`,
          ].map((item) => (
            <span key={item} className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-neutral-400">
              {item}
            </span>
          ))}
        </div>
        <div className="h-full [&_.js-plotly-plot]:!h-full">
          <CandlestickChart
            midHistory={state.mid_history}
            fills={state.fills}
            recentTrades={state.recent_trades}
            midPrice={state.mid_price}
            bestBid={state.best_bid?.price}
            bestAsk={state.best_ask?.price}
            className="!border-0 !shadow-none !rounded-none [&>div:first-child]:hidden"
          />
        </div>
      </BentoCard>

      <BentoCard title="Depth" subtitle="cumulative liquidity" accent="green" className="bento-p-depth">
        <div className="h-full">
          <DepthChart
            bids={state.book.bids}
            asks={state.book.asks}
            midPrice={state.mid_price}
            className="!border-0 !shadow-none !rounded-none [&>div:first-child]:hidden"
          />
        </div>
      </BentoCard>

      <BentoCard title="Top Of Book" subtitle="best bid / ask" accent="cyan" compact className="bento-p-tob">
        <div className="space-y-0">
          <KpiRow label="Bid" value={state.best_bid ? money(state.best_bid.price) : "-"} cls="text-emerald-400" />
          <KpiRow label="Ask" value={state.best_ask ? money(state.best_ask.price) : "-"} cls="text-red-400" />
          <KpiRow label="Mid" value={state.mid_price == null ? "-" : money(state.mid_price)} />
          <KpiRow label="Spread" value={topSpreadBps == null ? "-" : `${fmt(topSpreadBps, 2)} bps`} />
        </div>
      </BentoCard>

      <BentoCard title="Trade Flow" subtitle="recent aggressor flow" accent="amber" className="bento-p-flow">
        <div className="h-full">
          <PlotCard
            title=""
            subtitle=""
            data={tradesFlowData(state.recent_trades)}
            height={220}
            className="!border-0 !shadow-none !rounded-none [&>div:first-child]:hidden"
          />
        </div>
      </BentoCard>

      <BentoCard title="Order Book" subtitle="l2 levels" accent="green" className="bento-p-book">
        <div className="overflow-auto h-full">
          <DataTable headers={["Side", "Price", "Size"]} rows={bookRows.slice(0, 12)} />
        </div>
      </BentoCard>

      <BentoCard title="Tape" subtitle="recent prints" accent="amber" className="bento-p-tape">
        <div className="overflow-auto h-full">
          <DataTable headers={["Side", "Price", "Size", "Time"]} rows={tradeRows} />
        </div>
      </BentoCard>
    </div>
  );
}

function MarketBento({ state }: { state: ApiState }) {
  const recentTrades = state.recent_trades.slice(0, 40);
  const buyVol = sum(recentTrades.filter(t => t.side === "buy").map(t => t.size));
  const sellVol = sum(recentTrades.filter(t => t.side === "sell").map(t => t.size));
  const topSpread = state.best_bid && state.best_ask ? state.best_ask.price - state.best_bid.price : null;
  const topSpreadBps = topSpread !== null && state.mid_price ? (topSpread / state.mid_price) * 10_000 : null;
  const spreadData: Data[] = Object.entries(state.spread_history).map(([depth, values], index) => ({
    x: values.map((_, i) => i + 1), y: values,
    type: "scatter", mode: "lines", name: depth,
    line: { width: 2, color: ["#00FF88", "#2CE3FF", "#eab308", "#ef4444"][index % 4] },
    hovertemplate: `${depth}<br>%{y:.2f}<extra></extra>`,
  }));

  const bookRows = [
    ...state.book.asks.slice().reverse().map(l => [
      <span className="text-red-400" key={`a-${l.price}`}>ASK</span>, money(l.price), fmt(l.size, 4),
    ]),
    ...state.book.bids.map(l => [
      <span className="text-emerald-400" key={`b-${l.price}`}>BID</span>, money(l.price), fmt(l.size, 4),
    ]),
  ];

  const tradeRows = state.recent_trades.slice(0, 12).map(t => [
    <span className={t.side === "buy" ? "text-emerald-400" : "text-red-400"} key={`t-${t.trade_id ?? t.ts}`}>{t.side}</span>,
    money(t.price), fmt(t.size, 5), new Date(t.ts).toLocaleTimeString(),
  ]);

  return (
    <div className="bento-grid-market h-full">
      <BentoCard title="Depth Chart" subtitle="L2 cumulative" accent="green" className="bento-m-depth"
        expandedContent={<DepthChart bids={state.book.bids} asks={state.book.asks} midPrice={state.mid_price} />}
      >
        <div className="h-full">
          <DepthChart bids={state.book.bids} asks={state.book.asks} midPrice={state.mid_price}
            className="!border-0 !shadow-none !rounded-none [&>div:first-child]:hidden" />
        </div>
      </BentoCard>

      <BentoCard title="Order Book" subtitle="L2 levels" accent="cyan" className="bento-m-book"
        expandedContent={<DataTable headers={["Side", "Price", "Size"]} rows={bookRows} />}
      >
        <div className="overflow-auto h-full">
          <DataTable headers={["Side", "Price", "Size"]} rows={bookRows.slice(0, 10)} />
        </div>
      </BentoCard>

      <BentoCard title="Trade Tape" subtitle="recent trades" accent="amber" className="bento-m-tape"
        expandedContent={<DataTable headers={["Side", "Price", "Size", "Time"]} rows={tradeRows} />}
      >
        <div className="overflow-auto h-full">
          <DataTable headers={["Side", "Price", "Size", "Time"]} rows={tradeRows.slice(0, 8)} />
        </div>
      </BentoCard>

      <BentoCard title="Spread History" subtitle="multi-depth" accent="green" className="bento-m-spread"
        expandedContent={<PlotCard title="Spread History" data={spreadData} height={500} legend={Object.keys(state.spread_history).map((k, i) => ({ label: k, color: ['#00FF88', '#2CE3FF', '#eab308', '#ef4444'][i % 4] }))} layout={{ showlegend: false }} />}
      >
        <div className="h-full">
          <PlotCard title="" data={spreadData} height={200}
            className="!border-0 !shadow-none !rounded-none [&>div:first-child]:hidden"
            layout={{ showlegend: false }} />
        </div>
      </BentoCard>

      <BentoCard title="Trade Flow" subtitle="buy/sell volume" accent="cyan" className="bento-m-flow"
        expandedContent={<PlotCard title="Trade Flow" data={tradesFlowData(state.recent_trades)} height={400} legend={[{ label: 'Buy', color: '#00FF88' }, { label: 'Sell', color: '#FF4D4D' }]} />}
      >
        <div className="h-full">
          <PlotCard title="" data={tradesFlowData(state.recent_trades)} height={200}
            className="!border-0 !shadow-none !rounded-none [&>div:first-child]:hidden" />
        </div>
      </BentoCard>

      <BentoCard title="Microstructure" subtitle="quant signals" accent="cyan" compact className="bento-m-micro">
        <div className="space-y-0">
          <KpiRow label="Vol" value={`${fmt(state.quant_lab.realized_vol_bps, 2)} bps`} />
          <KpiRow label="Momentum" value={`${fmt(state.quant_lab.momentum_bps, 2)} bps`} cls={toneClass(state.quant_lab.momentum_bps)} />
          <KpiRow label="Flow imb" value={`${fmt(state.quant_lab.trade_flow_imbalance_btc, 4)} BTC`} cls={toneClass(state.quant_lab.trade_flow_imbalance_btc)} />
          <KpiRow label="Depth imb" value={fmt(state.quant_lab.top5_depth_imbalance, 3)} />
          <KpiRow label="Micro bias" value={`${fmt(state.quant_lab.micro_bias_bps, 2)} bps`} cls={toneClass(state.quant_lab.micro_bias_bps)} />
        </div>
      </BentoCard>

      <BentoCard title="Top Of Book" accent="green" compact className="bento-m-tob">
        <div className="space-y-0">
          <KpiRow label="Bid" value={state.best_bid ? money(state.best_bid.price) : "-"} cls="text-emerald-400" />
          <KpiRow label="Ask" value={state.best_ask ? money(state.best_ask.price) : "-"} cls="text-red-400" />
          <KpiRow label="Spread" value={topSpreadBps == null ? "-" : `${fmt(topSpreadBps, 2)} bps`} />
          <KpiRow label="Buy vol" value={`${fmt(buyVol, 4)} BTC`} />
          <KpiRow label="Sell vol" value={`${fmt(sellVol, 4)} BTC`} />
        </div>
      </BentoCard>
    </div>
  );
}

function StrategyBento({ state }: { state: ApiState }) {
  const totalPnl = (state.portfolio.realized_pnl || 0) + (state.portfolio.unrealized_pnl || 0);
  const quoteWidthBps = state.quote ? ((state.quote.ask_price - state.quote.bid_price) / (state.mid_price || 1)) * 10_000 : null;
  const replayData: Data[] = [
    { x: state.backtest_lite.pnl_curve.map((_, i) => i + 1), y: state.backtest_lite.pnl_curve, type: "scatter", mode: "lines", name: "P&L", line: { color: "#00FF88", width: 2 }, hovertemplate: "point %{x}<br>$%{y:,.2f}<extra>P&L</extra>" },
    { x: state.backtest_lite.equity_curve.map((_, i) => i + 1), y: state.backtest_lite.equity_curve, type: "scatter", mode: "lines", name: "Equity", yaxis: "y2", line: { color: "#2CE3FF", width: 1.5, dash: "dot" }, hovertemplate: "point %{x}<br>$%{y:,.2f}<extra>equity</extra>" },
  ];

  const fillRows = state.fills.slice(0, 10).map(f => [
    <span className={f.side === "buy" ? "text-emerald-400" : "text-red-400"} key={`sf-${f.ts}`}>{f.side}</span>,
    money(f.price), fmt(f.size, 4), f.reason,
  ]);

  return (
    <div className="bento-grid-strategy h-full">
      <BentoCard title="Risk Guard" accent="red" compact className="bento-s-risk">
        <div className="text-lg font-mono font-bold text-white">{state.risk_status}</div>
        <div className="text-[9px] text-neutral-500 mt-1">max loss {money(state.strategy.config.max_loss, 0)}</div>
      </BentoCard>

      <BentoCard title="Quote Engine" accent="cyan" compact className="bento-s-quote">
        <div className={cn("text-lg font-mono font-bold", state.strategy.quote_active ? "text-emerald-400" : "text-amber-400")}>
          {state.strategy.quote_active ? "active" : "paused"}
        </div>
        <div className="text-[9px] text-neutral-500 mt-1">spread {fmt(state.strategy.config.base_quote_spread_bps, 1)} bps</div>
      </BentoCard>

      <BentoCard title="Fill Count" accent="green" compact className="bento-s-fills">
        <div className="text-lg font-mono font-bold text-white">{intFmt(state.strategy.fill_count)}</div>
        <div className="text-[9px] text-neutral-500 mt-1">avg {money(state.strategy.avg_fill_notional)}</div>
      </BentoCard>

      <BentoCard title="P&L Replay" subtitle="dual axis" accent="green" className="bento-s-replay"
        expandedContent={<PlotCard title="P&L & Equity Replay" data={replayData} height={500} legend={[{ label: 'P&L', color: '#00FF88' }, { label: 'Equity', color: '#2CE3FF' }]} layout={{ yaxis2: { overlaying: "y", side: "right", color: "#4a524a", showgrid: false }, showlegend: false }} />}
      >
        <div className="h-full">
          <PlotCard title="" data={replayData} height={240}
            className="!border-0 !shadow-none !rounded-none [&>div:first-child]:hidden"
            layout={{ yaxis2: { overlaying: "y", side: "right", color: "#4a524a", showgrid: false }, showlegend: false }} />
        </div>
      </BentoCard>

      <BentoCard title="Quote & Inventory" accent="cyan" compact className="bento-s-inv"
        expandedContent={
          <div>{statLines([
            { label: "Position", value: `${fmt(state.portfolio.position_btc, 4)} BTC` },
            { label: "Avg entry", value: money(state.portfolio.avg_entry_price) },
            { label: "Exposure", value: money(state.portfolio.exposure_usd), cls: toneClass(state.portfolio.exposure_usd) },
            { label: "Cash", value: money(state.portfolio.cash) },
            { label: "Equity", value: money(state.portfolio.equity) },
            { label: "Realized", value: money(state.portfolio.realized_pnl), cls: toneClass(state.portfolio.realized_pnl) },
            { label: "Unrealized", value: money(state.portfolio.unrealized_pnl), cls: toneClass(state.portfolio.unrealized_pnl) },
            { label: "Quote width", value: quoteWidthBps == null ? "-" : `${fmt(quoteWidthBps, 2)} bps` },
          ])}</div>
        }
      >
        <div className="space-y-0">
          <KpiRow label="Position" value={`${fmt(state.portfolio.position_btc, 4)} BTC`} />
          <KpiRow label="Exposure" value={money(state.portfolio.exposure_usd)} cls={toneClass(state.portfolio.exposure_usd)} />
          <KpiRow label="Cash" value={money(state.portfolio.cash)} />
          <KpiRow label="Realized" value={money(state.portfolio.realized_pnl)} cls={toneClass(state.portfolio.realized_pnl)} />
        </div>
      </BentoCard>

      <BentoCard title="Config" accent="green" compact className="bento-s-config">
        <div className="space-y-0">
          <KpiRow label="Spread" value={`${fmt(state.strategy.config.base_quote_spread_bps, 2)} bps`} />
          <KpiRow label="Size" value={`${fmt(state.strategy.config.order_size_btc, 4)} BTC`} />
          <KpiRow label="Skew" value={`${fmt(state.strategy.config.position_skew_bps_per_btc, 2)} bps`} />
          <KpiRow label="Max loss" value={money(state.strategy.config.max_loss, 0)} />
        </div>
      </BentoCard>

      <BentoCard title="Simulated Fills" accent="amber" className="bento-s-table"
        expandedContent={<DataTable headers={["Side", "Price", "Size", "Reason"]} rows={fillRows} />}
      >
        <div className="overflow-auto h-full">
          <DataTable headers={["Side", "Price", "Size", "Reason"]} rows={fillRows.slice(0, 5)} />
        </div>
      </BentoCard>
    </div>
  );
}

function QuantBento({ state }: { state: ApiState }) {
  const radarData: Data[] = [{
    type: "scatterpolar",
    r: [Math.abs(state.quant_lab.realized_vol_bps || 0), Math.abs(state.quant_lab.momentum_bps || 0), Math.abs((state.quant_lab.trade_flow_imbalance_btc || 0) * 100), Math.abs((state.quant_lab.top5_depth_imbalance || 0) * 100), Math.abs(state.quant_lab.micro_bias_bps || 0)],
    theta: ["Vol", "Momentum", "Flow", "Depth", "Micro Bias"],
    fill: "toself", fillcolor: "rgba(0,255,136,0.10)",
    line: { color: "#00FF88", width: 2 },
    hovertemplate: "%{theta}: %{r:.2f}<extra></extra>",
  }];

  const presetData: Data[] = [
    { x: state.quant_lab.research_presets.map(p => p.name), y: state.quant_lab.research_presets.map(p => p.spread_bps), type: "bar", name: "Spread", marker: { color: "rgba(44,227,255,0.7)" }, hovertemplate: "%{x}<br>%{y:.1f} bps<extra></extra>" },
    { x: state.quant_lab.research_presets.map(p => p.name), y: state.quant_lab.research_presets.map(p => p.skew_bps_per_btc), type: "bar", name: "Skew", marker: { color: "rgba(0,255,136,0.65)" }, hovertemplate: "%{x}<br>%{y:.1f} bps/BTC<extra></extra>" },
  ];

  const regimeRows = state.quant_lab.spread_regimes.map(r => [r.depth, r.state, fmt(r.last, 2), fmt(r.avg, 2)]);

  return (
    <div className="bento-grid-quant h-full">
      <BentoCard title="Realized Vol" accent="cyan" compact className="bento-q-vol">
        <div className="text-lg font-mono font-bold text-white">{fmt(state.quant_lab.realized_vol_bps, 2)} <span className="text-xs text-neutral-500">bps</span></div>
      </BentoCard>

      <BentoCard title="Momentum" accent="green" compact className="bento-q-mom">
        <div className={cn("text-lg font-mono font-bold", toneClass(state.quant_lab.momentum_bps))}>{fmt(state.quant_lab.momentum_bps, 2)} <span className="text-xs text-neutral-500">bps</span></div>
      </BentoCard>

      <BentoCard title="Flow" accent="amber" compact className="bento-q-flow">
        <div className="text-lg font-mono font-bold text-white">{fmt(state.quant_lab.trade_flow_imbalance_btc, 4)} <span className="text-xs text-neutral-500">BTC</span></div>
      </BentoCard>

      <BentoCard title="Micro Bias" accent="red" compact className="bento-q-bias">
        <div className={cn("text-lg font-mono font-bold", toneClass(state.quant_lab.micro_bias_bps))}>{fmt(state.quant_lab.micro_bias_bps, 2)} <span className="text-xs text-neutral-500">bps</span></div>
      </BentoCard>

      <BentoCard title="Signal Radar" subtitle="microstructure fingerprint" accent="green" className="bento-q-radar"
        expandedContent={<PlotCard title="Signal Radar" data={radarData} height={500} layout={{ polar: { bgcolor: "rgba(0,0,0,0)", radialaxis: { gridcolor: "rgba(148,163,184,0.08)", linecolor: "rgba(148,163,184,0.08)" }, angularaxis: { gridcolor: "rgba(148,163,184,0.08)", linecolor: "rgba(148,163,184,0.08)" } }, margin: { l: 40, r: 40, t: 20, b: 20 } }} />}
      >
        <div className="h-full">
          <PlotCard title="" data={radarData} height={220}
            className="!border-0 !shadow-none !rounded-none [&>div:first-child]:hidden"
            layout={{ polar: { bgcolor: "rgba(0,0,0,0)", radialaxis: { gridcolor: "rgba(148,163,184,0.08)", linecolor: "rgba(148,163,184,0.08)", tickfont: { color: "#4a524a", size: 9 } }, angularaxis: { gridcolor: "rgba(148,163,184,0.08)", linecolor: "rgba(148,163,184,0.08)", tickfont: { color: "#8a918a", size: 10 } } }, margin: { l: 30, r: 30, t: 10, b: 10 } }} />
        </div>
      </BentoCard>

      <BentoCard title="Presets" subtitle="spread/skew comparison" accent="cyan" className="bento-q-presets"
        expandedContent={<PlotCard title="Preset Comparison" data={presetData} height={400} legend={[{ label: 'Spread', color: '#2CE3FF' }, { label: 'Skew', color: '#00FF88' }]} layout={{ barmode: "group", showlegend: false }} />}
      >
        <div className="h-full">
          <PlotCard title="" data={presetData} height={220}
            className="!border-0 !shadow-none !rounded-none [&>div:first-child]:hidden"
            layout={{ barmode: "group", showlegend: false }} />
        </div>
      </BentoCard>

      <BentoCard title="Spread Regimes" accent="green" className="bento-q-regimes"
        expandedContent={<DataTable headers={["Depth", "State", "Last", "Avg"]} rows={regimeRows} />}
      >
        <div className="overflow-auto h-full">
          <DataTable headers={["Depth", "State", "Last", "Avg"]} rows={regimeRows.slice(0, 6)} />
        </div>
      </BentoCard>

      <BentoCard title="Research Presets" accent="cyan" compact className="bento-q-research">
        <div className="space-y-1">
          {state.quant_lab.research_presets.slice(0, 4).map(p => (
            <div key={p.name} className="flex justify-between text-[10px] py-1 border-b border-white/[0.04] last:border-0">
              <span className="text-neutral-300 font-medium">{p.name}</span>
              <span className="text-neutral-500">{fmt(p.spread_bps, 1)} bps / {p.stance}</span>
            </div>
          ))}
        </div>
      </BentoCard>
    </div>
  );
}

function BacktestBento({ state }: { state: ApiState }) {
  const equityCurve: Data[] = [{
    x: state.backtest_lite.equity_curve.map((_, i) => i + 1), y: state.backtest_lite.equity_curve,
    type: "scatter", mode: "lines", line: { color: "#00FF88", width: 2 },
    fill: "tozeroy", fillcolor: "rgba(0,255,136,0.06)",
    hovertemplate: "point %{x}<br>$%{y:,.2f}<extra>equity</extra>",
  }];
  const pnlCurve: Data[] = [{
    x: state.backtest_lite.pnl_curve.map((_, i) => i + 1), y: state.backtest_lite.pnl_curve,
    type: "scatter", mode: "lines+markers",
    marker: { color: "#2CE3FF", size: 3, line: { color: '#0b1220', width: 1 } },
    line: { color: "#2CE3FF", width: 2 },
    hovertemplate: "point %{x}<br>$%{y:,.2f}<extra>P&L</extra>",
  }];

  return (
    <div className="bento-grid-backtest h-full">
      <BentoCard title="Mode" accent="cyan" compact className="bento-b-mode">
        <div className="text-lg font-mono font-bold text-white">{state.backtest_lite.mode}</div>
        <div className="text-[9px] text-neutral-500 mt-1">{state.backtest_lite.status}</div>
      </BentoCard>

      <BentoCard title="Paper P&L" accent="green" compact className="bento-b-pnl">
        <div className={cn("text-lg font-mono font-bold", toneClass(state.backtest_lite.total_pnl_usd))}>{money(state.backtest_lite.total_pnl_usd)}</div>
        <div className="text-[9px] text-neutral-500 mt-1">return {percent(state.backtest_lite.paper_return_pct, 3)}</div>
      </BentoCard>

      <BentoCard title="Drawdown" accent="red" compact className="bento-b-dd">
        <div className="text-lg font-mono font-bold text-red-400">{money(state.backtest_lite.max_drawdown_usd)}</div>
        <div className="text-[9px] text-neutral-500 mt-1">peak {money(state.backtest_lite.peak_equity_usd)}</div>
      </BentoCard>

      <BentoCard title="Quote Uptime" accent="green" compact className="bento-b-uptime">
        <div className="text-lg font-mono font-bold text-white">{percent(state.backtest_lite.quote_uptime_pct, 1)}</div>
        <div className="text-[9px] text-neutral-500 mt-1">fills {intFmt(state.backtest_lite.fill_count)}</div>
      </BentoCard>

      <BentoCard title="Equity Replay" accent="green" className="bento-b-equity"
        expandedContent={<PlotCard title="Equity Replay" data={equityCurve} height={500} legend={[{ label: 'Equity', color: '#00FF88' }]} />}
      >
        <div className="h-full">
          <PlotCard title="" data={equityCurve} height={260}
            className="!border-0 !shadow-none !rounded-none [&>div:first-child]:hidden" />
        </div>
      </BentoCard>

      <BentoCard title="P&L Replay" accent="cyan" className="bento-b-pnl-chart"
        expandedContent={<PlotCard title="P&L Replay" data={pnlCurve} height={500} legend={[{ label: 'P&L', color: '#2CE3FF' }]} />}
      >
        <div className="h-full">
          <PlotCard title="" data={pnlCurve} height={260}
            className="!border-0 !shadow-none !rounded-none [&>div:first-child]:hidden" />
        </div>
      </BentoCard>

      <BentoCard title="Replay Metrics" accent="cyan" compact className="bento-b-metrics">
        <div className="space-y-0">
          <KpiRow label="Window" value={intFmt(state.backtest_lite.window_points)} />
          <KpiRow label="Fill vol" value={`${fmt(state.backtest_lite.fill_volume_btc, 4)} BTC`} />
          <KpiRow label="Fill notional" value={money(state.backtest_lite.fill_notional_usd)} />
          <KpiRow label="Base spread" value={`${fmt(state.strategy.config.base_quote_spread_bps, 2)} bps`} />
          <KpiRow label="Order size" value={`${fmt(state.strategy.config.order_size_btc, 4)} BTC`} />
        </div>
      </BentoCard>

      <BentoCard title="Runtime Parity" accent="green" compact className="bento-b-parity">
        <div className="space-y-0">
          <KpiRow label="Quote uptime" value={percent(state.backtest_lite.quote_uptime_pct, 1)} />
          <KpiRow label="Fill count" value={intFmt(state.backtest_lite.fill_count)} />
          <KpiRow label="Runtime trades" value={intFmt(state.runtime.trade_events)} />
          <KpiRow label="Strategy fills" value={intFmt(state.strategy.fill_count)} />
          <KpiRow label="Risk" value={state.risk_status} />
        </div>
      </BentoCard>
    </div>
  );
}

function AppContent({ activeTab, state }: { activeTab: TabId; state: ApiState }) {
  switch (activeTab) {
    case "overview": return <OverviewBento state={state} />;
    case "price-action": return <PriceActionBento state={state} />;
    case "market": return <MarketBento state={state} />;
    case "strategy": return <StrategyBento state={state} />;
    case "quant-lab": return <QuantBento state={state} />;
    case "backtest": return <BacktestBento state={state} />;
  }
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
        if (!mounted) return;
        setState(nextState);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "state fetch failed");
      }
    }

    void tick();
    const interval = window.setInterval(() => void tick(), 1800);
    return () => { mounted = false; controller.abort(); window.clearInterval(interval); };
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
      <main className="main-bento">
        <Topbar
          feed={`feed ${state?.runtime.feed_state ?? "warming"}`}
          risk={`risk ${state?.risk_status ?? "booting"}`}
          quant={`quant ${state?.quant_lab.readiness ?? "booting"}`}
          product={state?.product_id ?? "BTC-USD"}
          activeTab={activeTab}
          messagesSeen={intFmt(state?.runtime.messages_seen)}
        />
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">{error}</div>
        )}
        {state ? (
          <AppContent activeTab={activeTab} state={state} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-neutral-600 text-sm animate-pulse">Hydrating runtime...</div>
          </div>
        )}
      </main>
    </div>
  );
}
