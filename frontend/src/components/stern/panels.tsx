import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  createChart,
  LineStyle,
  type AreaData,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  downloadCsv,
  useSternState,
  type BookLevel,
  type MidPoint,
  type PublicTrade,
  type SimFill,
  type SpreadMetric,
  type SternState,
} from "../../lib/sternApi";
import {
  formatBps,
  formatBtc,
  formatClockTime,
  formatNumber,
  formatPct,
  formatUsd,
} from "./format";

// ============================================================================
// Shared UI primitives (glass-styled, Fractal-consistent)
// ============================================================================

function Panel({
  title,
  subtitle,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`glass-panel p-4 ${className ?? ""}`}>
      {title && (
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-neutral-200 tracking-tight">
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "positive" | "negative" | "neutral";
}) {
  const color =
    accent === "positive"
      ? "text-emerald-300"
      : accent === "negative"
        ? "text-rose-300"
        : "text-neutral-100";
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-neutral-500">
        {label}
      </span>
      <span className={`text-xl font-mono font-semibold ${color}`}>{value}</span>
    </div>
  );
}

function PanelHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
  state?: SternState | null;
}) {
  return (
    <div className="flex items-end justify-between mb-4">
      <div>
        <h2 className="text-lg font-semibold text-neutral-100 tracking-tight">
          {title}
        </h2>
        <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

function sign(value: number): "positive" | "negative" | "neutral" {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

// ============================================================================
// Overview — hero equity curve + click-to-expand KPI cards
// ============================================================================

function DetailRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "positive" | "negative" | "neutral";
}) {
  const color =
    accent === "positive"
      ? "text-emerald-300"
      : accent === "negative"
        ? "text-rose-300"
        : "text-neutral-200";
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[10px] uppercase tracking-wider text-neutral-500">
        {label}
      </span>
      <span className={`font-mono tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      className={`transition-transform duration-200 text-neutral-500 ${expanded ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path
        d="M2 4l3 3 3-3"
        stroke="currentColor"
        strokeWidth="1.25"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExpandableKpiCard({
  id,
  label,
  value,
  accent,
  expanded,
  onToggle,
  details,
}: {
  id: string;
  label: string;
  value: string;
  accent?: "positive" | "negative" | "neutral";
  expanded: boolean;
  onToggle: (id: string) => void;
  details: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(id)}
      aria-expanded={expanded}
      className={`glass-panel p-4 text-left transition-[grid-column,border-color,background] duration-200 border border-transparent hover:border-neutral-400/30 hover:bg-white/[0.02] focus:outline-none focus:border-cyan-400/40 ${
        expanded ? "lg:col-span-2 border-neutral-400/25 bg-white/[0.015]" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <Kpi label={label} value={value} accent={accent} />
        <ChevronIcon expanded={expanded} />
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-neutral-500/20 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
          {details}
        </div>
      )}
    </button>
  );
}

function EquityCurveHero({
  equityCurve,
  peakEquity,
  currentEquity,
  returnPct,
  drawdownUsd,
}: {
  equityCurve: number[];
  peakEquity: number;
  currentEquity: number;
  returnPct: number;
  drawdownUsd: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const startLineRef = useRef<IPriceLine | null>(null);
  const peakLineRef = useRef<IPriceLine | null>(null);

  const startingEquity =
    equityCurve.length > 0 ? equityCurve[0] : currentEquity;
  const bullish = currentEquity >= startingEquity;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 220,
      layout: {
        background: { color: "transparent" },
        textColor: "#a1a1aa",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(82, 82, 91, 0.12)" },
        horzLines: { color: "rgba(82, 82, 91, 0.12)" },
      },
      timeScale: {
        visible: false,
        borderVisible: false,
      },
      rightPriceScale: {
        borderColor: "rgba(82, 82, 91, 0.3)",
        scaleMargins: { top: 0.12, bottom: 0.08 },
      },
      crosshair: {
        mode: 0,
        vertLine: { visible: false },
        horzLine: {
          color: "rgba(148, 163, 184, 0.35)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "rgba(30, 41, 59, 0.9)",
        },
      },
      handleScroll: false,
      handleScale: false,
    });
    const series = chart.addAreaSeries({
      lineColor: "#22c55e",
      topColor: "rgba(34, 197, 94, 0.35)",
      bottomColor: "rgba(34, 197, 94, 0.02)",
      lineWidth: 2,
      priceLineVisible: true,
      priceLineColor: "rgba(148, 163, 184, 0.5)",
      priceLineStyle: LineStyle.Dashed,
      priceLineWidth: 1,
      lastValueVisible: true,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: Math.max(1, Math.floor(entry.contentRect.width)) });
      }
    });
    ro.observe(container);
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      startLineRef.current = null;
      peakLineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    const data: AreaData<UTCTimestamp>[] = equityCurve.map((v, i) => ({
      time: (i + 1) as UTCTimestamp,
      value: v,
    }));
    series.setData(data);
    series.applyOptions({
      lineColor: bullish ? "#22c55e" : "#ef4444",
      topColor: bullish
        ? "rgba(34, 197, 94, 0.35)"
        : "rgba(239, 68, 68, 0.3)",
      bottomColor: bullish
        ? "rgba(34, 197, 94, 0.02)"
        : "rgba(239, 68, 68, 0.02)",
    });
    if (data.length > 1) chart.timeScale().fitContent();
  }, [equityCurve, bullish]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const sync = (
      ref: React.MutableRefObject<IPriceLine | null>,
      price: number | null,
      color: string,
      title: string,
    ) => {
      if (price == null || !Number.isFinite(price)) {
        if (ref.current) {
          series.removePriceLine(ref.current);
          ref.current = null;
        }
        return;
      }
      if (ref.current) {
        ref.current.applyOptions({ price });
      } else {
        ref.current = series.createPriceLine({
          price,
          color,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title,
        });
      }
    };
    sync(
      startLineRef,
      Number.isFinite(startingEquity) ? startingEquity : null,
      "rgba(148, 163, 184, 0.55)",
      "start",
    );
    sync(
      peakLineRef,
      peakEquity > 0 && peakEquity !== startingEquity ? peakEquity : null,
      "rgba(250, 204, 21, 0.5)",
      "peak",
    );
  }, [startingEquity, peakEquity]);

  const change = currentEquity - startingEquity;
  const hasData = equityCurve.length >= 2;

  return (
    <Panel
      title="Equity Curve"
      subtitle="Paper session · cash + mark-to-market portfolio value"
    >
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 mb-2 text-xs font-mono">
        <span className="text-neutral-500">
          Equity{" "}
          <span className="text-neutral-100">
            {formatUsd(currentEquity, 2)}
          </span>
        </span>
        <span className={change >= 0 ? "text-emerald-300" : "text-rose-300"}>
          {change >= 0 ? "+" : ""}
          {formatUsd(change, 2)} ({returnPct >= 0 ? "+" : ""}
          {returnPct.toFixed(3)}%)
        </span>
        <span className="text-neutral-500">
          Peak{" "}
          <span className="text-amber-300">{formatUsd(peakEquity, 2)}</span>
        </span>
        <span className="text-neutral-500">
          Drawdown{" "}
          <span className="text-rose-300">{formatUsd(drawdownUsd, 2)}</span>
        </span>
      </div>
      {hasData ? (
        <div ref={containerRef} className="w-full h-[220px]" />
      ) : (
        <div className="h-[220px] flex items-center justify-center text-sm text-neutral-500">
          Warming up equity samples…
        </div>
      )}
    </Panel>
  );
}

export function OverviewPanel() {
  const { data: state } = useSternState();
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (id: string) =>
    setExpanded((prev) => (prev === id ? null : id));

  const portfolio = state?.portfolio;
  const strategy = state?.strategy;
  const backtest = state?.backtest_lite;
  const quote = state?.quote;

  const totalPnl = portfolio
    ? portfolio.realized_pnl + portfolio.unrealized_pnl
    : 0;
  const spreadUsd =
    state?.best_bid && state?.best_ask
      ? state.best_ask.price - state.best_bid.price
      : null;
  const spreadBps =
    spreadUsd != null && state?.mid_price
      ? (spreadUsd / state.mid_price) * 10000
      : null;

  const startingEquity = backtest?.equity_curve?.[0] ?? portfolio?.equity ?? 0;
  const peakEquity = backtest?.peak_equity_usd ?? portfolio?.equity ?? 0;
  const returnPct = backtest?.paper_return_pct ?? 0;
  const maxDrawdown = backtest?.max_drawdown_usd ?? portfolio?.drawdown ?? 0;

  return (
    <div className="p-6 space-y-4">
      <PanelHeader
        title="Crypto MM Overview"
        subtitle="BTC-USD paper market making — click any card to expand"
        state={state}
      />

      <EquityCurveHero
        equityCurve={backtest?.equity_curve ?? []}
        peakEquity={peakEquity}
        currentEquity={portfolio?.equity ?? 0}
        returnPct={returnPct}
        drawdownUsd={portfolio?.drawdown ?? 0}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ExpandableKpiCard
          id="mid"
          label="Mid"
          value={formatUsd(state?.mid_price, 2)}
          expanded={expanded === "mid"}
          onToggle={toggle}
          details={
            <>
              <DetailRow
                label="Best bid"
                value={formatUsd(state?.best_bid?.price, 2)}
                accent="positive"
              />
              <DetailRow
                label="Best ask"
                value={formatUsd(state?.best_ask?.price, 2)}
                accent="negative"
              />
              <DetailRow
                label="Bid size"
                value={formatBtc(state?.best_bid?.size ?? 0, 4)}
              />
              <DetailRow
                label="Ask size"
                value={formatBtc(state?.best_ask?.size ?? 0, 4)}
              />
            </>
          }
        />
        <ExpandableKpiCard
          id="spread"
          label="Top Spread"
          value={spreadUsd != null ? formatUsd(spreadUsd, 2) : "—"}
          expanded={expanded === "spread"}
          onToggle={toggle}
          details={
            <>
              <DetailRow
                label="Spread bps"
                value={spreadBps != null ? `${spreadBps.toFixed(2)} bps` : "—"}
              />
              <DetailRow
                label="MM effective"
                value={formatBps(strategy?.effective_spread_bps)}
              />
              <DetailRow label="Skew" value={formatBps(strategy?.skew_bps)} />
              <DetailRow
                label="Vol input"
                value={formatBps(strategy?.vol_input_bps)}
              />
            </>
          }
        />
        <ExpandableKpiCard
          id="position"
          label="Position"
          value={formatBtc(portfolio?.position_btc ?? 0, 4)}
          accent={portfolio ? sign(portfolio.position_btc) : "neutral"}
          expanded={expanded === "position"}
          onToggle={toggle}
          details={
            <>
              <DetailRow
                label="Avg entry"
                value={formatUsd(portfolio?.avg_entry_price, 2)}
              />
              <DetailRow
                label="Exposure"
                value={formatUsd(portfolio?.exposure_usd, 2)}
              />
              <DetailRow
                label="Cash"
                value={formatUsd(portfolio?.cash, 2)}
              />
              <DetailRow
                label="Unrealized"
                value={formatUsd(portfolio?.unrealized_pnl, 2)}
                accent={portfolio ? sign(portfolio.unrealized_pnl) : "neutral"}
              />
            </>
          }
        />
        <ExpandableKpiCard
          id="pnl"
          label="Total PnL"
          value={formatUsd(totalPnl, 2)}
          accent={sign(totalPnl)}
          expanded={expanded === "pnl"}
          onToggle={toggle}
          details={
            <>
              <DetailRow
                label="Realized"
                value={formatUsd(portfolio?.realized_pnl, 2)}
                accent={portfolio ? sign(portfolio.realized_pnl) : "neutral"}
              />
              <DetailRow
                label="Unrealized"
                value={formatUsd(portfolio?.unrealized_pnl, 2)}
                accent={portfolio ? sign(portfolio.unrealized_pnl) : "neutral"}
              />
              <DetailRow
                label="Return"
                value={formatPct(returnPct / 100, 3)}
                accent={sign(returnPct)}
              />
              <DetailRow
                label="Max DD"
                value={formatUsd(maxDrawdown, 2)}
                accent="negative"
              />
            </>
          }
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ExpandableKpiCard
          id="equity"
          label="Equity"
          value={formatUsd(portfolio?.equity, 2)}
          expanded={expanded === "equity"}
          onToggle={toggle}
          details={
            <>
              <DetailRow
                label="Starting"
                value={formatUsd(startingEquity, 2)}
              />
              <DetailRow
                label="Peak"
                value={formatUsd(peakEquity, 2)}
              />
              <DetailRow
                label="Drawdown"
                value={formatUsd(portfolio?.drawdown, 2)}
                accent="negative"
              />
              <DetailRow
                label="Return"
                value={formatPct(returnPct / 100, 3)}
                accent={sign(returnPct)}
              />
            </>
          }
        />
        <ExpandableKpiCard
          id="fills"
          label="Fill Count"
          value={String(backtest?.fill_count ?? strategy?.fill_count ?? 0)}
          expanded={expanded === "fills"}
          onToggle={toggle}
          details={
            <>
              <DetailRow
                label="Volume"
                value={formatBtc(backtest?.fill_volume_btc ?? 0, 4)}
              />
              <DetailRow
                label="Notional"
                value={formatUsd(backtest?.fill_notional_usd ?? 0, 2)}
              />
              <DetailRow
                label="Avg fill"
                value={formatUsd(strategy?.avg_fill_notional ?? 0, 2)}
              />
              <DetailRow
                label="Uptime"
                value={
                  backtest
                    ? `${backtest.quote_uptime_pct.toFixed(1)}%`
                    : "—"
                }
              />
            </>
          }
        />
        <ExpandableKpiCard
          id="quote"
          label="MM Quote"
          value={
            quote
              ? `${formatNumber(quote.bid_price, 2)} / ${formatNumber(quote.ask_price, 2)}`
              : "inactive"
          }
          accent={quote ? "neutral" : "negative"}
          expanded={expanded === "quote"}
          onToggle={toggle}
          details={
            <>
              <DetailRow
                label="Bid size"
                value={quote ? formatBtc(quote.bid_size, 4) : "—"}
                accent="positive"
              />
              <DetailRow
                label="Ask size"
                value={quote ? formatBtc(quote.ask_size, 4) : "—"}
                accent="negative"
              />
              <DetailRow
                label="Eff. spread"
                value={formatBps(strategy?.effective_spread_bps)}
              />
              <DetailRow
                label="Mode"
                value={strategy?.mode ?? "—"}
              />
            </>
          }
        />
        <ExpandableKpiCard
          id="risk"
          label="Risk"
          value={state?.risk_status ?? "—"}
          accent={state?.risk_status === "ok" ? "positive" : "negative"}
          expanded={expanded === "risk"}
          onToggle={toggle}
          details={
            <>
              <DetailRow
                label="Max notional"
                value={formatUsd(strategy?.config.max_notional_exposure, 0)}
              />
              <DetailRow
                label="Max loss"
                value={formatUsd(strategy?.config.max_loss, 0)}
              />
              <DetailRow
                label="Drawdown"
                value={formatUsd(portfolio?.drawdown, 2)}
                accent="negative"
              />
              <DetailRow
                label="Max DD"
                value={formatUsd(maxDrawdown, 2)}
                accent="negative"
              />
            </>
          }
        />
      </div>
    </div>
  );
}

// ============================================================================
// Pro Terminal — L2 book, depth curve, tape, trade flow, spread analytics
// All visuals are SVG/CSS so the whole panel stays reactive at stream cadence
// (≈ 500 ms). A shared `selectedPrice` cross-highlights the ladder and the
// depth curve so clicking a rung pins that price across panels.
// ============================================================================

const LADDER_DEPTH = 10;
const IMBALANCE_TOP_N = 5;
const DEPTH_CURVE_LEVELS = 20;
const FLOW_WINDOW_MS = 60_000;
const FLOW_BUCKETS = 20;

type LadderRung = {
  price: number;
  size: number;
  cum: number;
};

function buildRungs(levels: BookLevel[]): LadderRung[] {
  const rungs: LadderRung[] = [];
  let cum = 0;
  for (let i = 0; i < Math.min(levels.length, LADDER_DEPTH); i++) {
    const lvl = levels[i];
    cum += lvl.size;
    rungs.push({ price: lvl.price, size: lvl.size, cum });
  }
  return rungs;
}

function Rung({
  rung,
  side,
  maxSize,
  maxCum,
  isBest,
  isSelected,
  onSelect,
}: {
  rung: LadderRung | null;
  side: "bid" | "ask";
  maxSize: number;
  maxCum: number;
  isBest: boolean;
  isSelected: boolean;
  onSelect: (price: number | null) => void;
}) {
  const sizePct = rung ? (rung.size / maxSize) * 100 : 0;
  const cumPct = rung ? (rung.cum / maxCum) * 100 : 0;
  const isBid = side === "bid";
  const priceColor = isBid ? "text-emerald-300" : "text-rose-300";
  const depthBg = isBid ? "bg-emerald-500/15" : "bg-rose-500/15";
  const cumBg = isBid ? "bg-emerald-400/40" : "bg-rose-400/40";
  const bestRing = isBest
    ? isBid
      ? "ring-1 ring-inset ring-emerald-400/50"
      : "ring-1 ring-inset ring-rose-400/50"
    : "";
  const selectedBg = isSelected
    ? "bg-cyan-400/10 ring-1 ring-inset ring-cyan-400/50"
    : rung
      ? "hover:bg-white/[0.03]"
      : "";

  return (
    <button
      type="button"
      disabled={!rung}
      onClick={() =>
        rung && onSelect(isSelected ? null : rung.price)
      }
      className={`relative grid grid-cols-[1fr_auto_1fr] items-center h-[22px] px-1 text-xs font-mono w-full text-left transition-colors ${bestRing} ${selectedBg}`}
    >
      {rung && (
        <div
          className={`absolute top-0 bottom-0 ${depthBg} pointer-events-none`}
          style={{
            width: `calc(${sizePct / 2}% )`,
            [isBid ? "right" : "left"]: "50%",
          }}
        />
      )}
      {rung && (
        <div
          className={`absolute top-0 bottom-0 ${cumBg} pointer-events-none`}
          style={{
            width: "2px",
            [isBid ? "left" : "right"]: `calc(50% - ${cumPct / 2}%)`,
          }}
        />
      )}
      <span className="relative text-left text-neutral-300 pl-1 tabular-nums">
        {isBid && rung ? rung.size.toFixed(4) : ""}
      </span>
      <span className={`relative px-2 ${priceColor} tabular-nums`}>
        {rung ? formatNumber(rung.price, 2) : "—"}
      </span>
      <span className="relative text-right text-neutral-300 pr-1 tabular-nums">
        {!isBid && rung ? rung.size.toFixed(4) : ""}
      </span>
    </button>
  );
}

function L2Ladder({
  state,
  selectedPrice,
  onSelectPrice,
}: {
  state: SternState | null;
  selectedPrice: number | null;
  onSelectPrice: (price: number | null) => void;
}) {
  const bids = state?.book.bids ?? [];
  const asks = state?.book.asks ?? [];

  const bidRungs = useMemo(() => buildRungs(bids), [bids]);
  const askRungs = useMemo(() => buildRungs(asks), [asks]);

  const { maxSize, maxCum } = useMemo(() => {
    let ms = 1e-9;
    let mc = 1e-9;
    for (const r of bidRungs) {
      if (r.size > ms) ms = r.size;
      if (r.cum > mc) mc = r.cum;
    }
    for (const r of askRungs) {
      if (r.size > ms) ms = r.size;
      if (r.cum > mc) mc = r.cum;
    }
    return { maxSize: ms, maxCum: mc };
  }, [bidRungs, askRungs]);

  const bestBid = state?.best_bid ?? null;
  const bestAsk = state?.best_ask ?? null;
  const mid =
    bestBid && bestAsk ? (bestBid.price + bestAsk.price) / 2 : null;
  const spread =
    bestBid && bestAsk ? bestAsk.price - bestBid.price : null;
  const spreadBps = mid && spread ? (spread / mid) * 10000 : null;

  const imbalance = useMemo(() => {
    let bidVol = 0;
    let askVol = 0;
    for (let i = 0; i < Math.min(IMBALANCE_TOP_N, bidRungs.length); i++) {
      bidVol += bidRungs[i].size;
    }
    for (let i = 0; i < Math.min(IMBALANCE_TOP_N, askRungs.length); i++) {
      askVol += askRungs[i].size;
    }
    const total = bidVol + askVol;
    const ratio = total > 0 ? (bidVol - askVol) / total : 0;
    return { bidVol, askVol, ratio };
  }, [bidRungs, askRungs]);

  const askRows = Array.from(
    { length: LADDER_DEPTH },
    (_, i) => askRungs[i] ?? null,
  ).reverse();
  const bidRows = Array.from(
    { length: LADDER_DEPTH },
    (_, i) => bidRungs[i] ?? null,
  );

  const selectedDeltaBps =
    selectedPrice != null && mid != null && mid > 0
      ? ((selectedPrice - mid) / mid) * 10000
      : null;

  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center px-1 pb-1 text-[10px] uppercase tracking-wider text-neutral-500">
        <span className="text-left pl-1">Bid Size</span>
        <span className="px-2">Price</span>
        <span className="text-right pr-1">Ask Size</span>
      </div>

      <div>
        {askRows.map((r, i) => (
          <Rung
            key={`a-${i}`}
            rung={r}
            side="ask"
            maxSize={maxSize}
            maxCum={maxCum}
            isBest={r != null && bestAsk != null && r.price === bestAsk.price}
            isSelected={
              r != null && selectedPrice != null && r.price === selectedPrice
            }
            onSelect={onSelectPrice}
          />
        ))}
      </div>

      <div className="my-1 grid grid-cols-3 items-center px-1 py-1.5 rounded bg-neutral-500/5 border-y border-neutral-500/15 text-xs font-mono">
        <span className="text-[10px] uppercase tracking-wider text-neutral-500">
          Mid
        </span>
        <span className="text-center text-neutral-100 tabular-nums">
          {mid != null ? formatUsd(mid, 2) : "—"}
        </span>
        <span className="text-right text-neutral-400 tabular-nums">
          {spread != null ? formatUsd(spread, 2) : "—"}
          {spreadBps != null && (
            <span className="ml-1.5 text-[10px] text-neutral-500">
              {spreadBps.toFixed(2)} bps
            </span>
          )}
        </span>
      </div>

      <div>
        {bidRows.map((r, i) => (
          <Rung
            key={`b-${i}`}
            rung={r}
            side="bid"
            maxSize={maxSize}
            maxCum={maxCum}
            isBest={r != null && bestBid != null && r.price === bestBid.price}
            isSelected={
              r != null && selectedPrice != null && r.price === selectedPrice
            }
            onSelect={onSelectPrice}
          />
        ))}
      </div>

      {selectedPrice != null && (
        <div className="mt-2 flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-cyan-500/5 border border-cyan-500/25 text-[11px] font-mono">
          <span className="text-cyan-300 tabular-nums">
            Pinned {formatUsd(selectedPrice, 2)}
          </span>
          <span className="text-neutral-400 tabular-nums">
            {selectedDeltaBps != null
              ? `${selectedDeltaBps >= 0 ? "+" : ""}${selectedDeltaBps.toFixed(1)} bps`
              : ""}
          </span>
          <button
            type="button"
            onClick={() => onSelectPrice(null)}
            className="text-neutral-500 hover:text-neutral-200 text-[10px] uppercase tracking-wider"
          >
            clear
          </button>
        </div>
      )}

      <ImbalanceBar
        bidVol={imbalance.bidVol}
        askVol={imbalance.askVol}
        ratio={imbalance.ratio}
      />
    </div>
  );
}

function ImbalanceBar({
  bidVol,
  askVol,
  ratio,
}: {
  bidVol: number;
  askVol: number;
  ratio: number;
}) {
  const total = bidVol + askVol;
  const bidPct = total > 0 ? (bidVol / total) * 100 : 50;
  const skewLabel =
    ratio > 0.05 ? "bid-heavy" : ratio < -0.05 ? "ask-heavy" : "balanced";
  const skewColor =
    ratio > 0.05
      ? "text-emerald-300"
      : ratio < -0.05
        ? "text-rose-300"
        : "text-neutral-400";
  return (
    <div className="mt-3 pt-3 border-t border-neutral-500/15">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-neutral-500 mb-1.5">
        <span>Imbalance · top {IMBALANCE_TOP_N}</span>
        <span className={`font-mono normal-case tracking-normal ${skewColor}`}>
          {(ratio * 100).toFixed(1)}% · {skewLabel}
        </span>
      </div>
      <div className="relative h-1.5 rounded-sm overflow-hidden bg-neutral-500/10">
        <div
          className="absolute inset-y-0 left-0 bg-emerald-500/60"
          style={{ width: `${bidPct}%` }}
        />
        <div
          className="absolute inset-y-0 right-0 bg-rose-500/60"
          style={{ width: `${100 - bidPct}%` }}
        />
        <div className="absolute inset-y-0 left-1/2 w-px bg-neutral-200/50" />
      </div>
      <div className="flex items-center justify-between mt-1 text-[11px] font-mono text-neutral-400 tabular-nums">
        <span>{bidVol.toFixed(4)} BTC</span>
        <span>{askVol.toFixed(4)} BTC</span>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Depth curve — cumulative BTC on each side, step-area, hover + pinned price
// ----------------------------------------------------------------------------

type DepthHover = {
  x: number;
  price: number;
  cum: number;
  side: "bid" | "ask";
};

function DepthChart({
  bids,
  asks,
  mid,
  selectedPrice,
}: {
  bids: BookLevel[];
  asks: BookLevel[];
  mid: number | null;
  selectedPrice: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<DepthHover | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setWidth(Math.max(1, Math.floor(e.contentRect.width)));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 240;
  const PAD = 16;

  const model = useMemo(() => {
    if (mid == null || (bids.length === 0 && asks.length === 0)) return null;
    const bidSlice = bids.slice(0, DEPTH_CURVE_LEVELS);
    const askSlice = asks.slice(0, DEPTH_CURVE_LEVELS);

    let bidCum = 0;
    const bidPts: Array<{ price: number; cum: number }> = [];
    for (const b of bidSlice) {
      bidCum += b.size;
      bidPts.push({ price: b.price, cum: bidCum });
    }
    let askCum = 0;
    const askPts: Array<{ price: number; cum: number }> = [];
    for (const a of askSlice) {
      askCum += a.size;
      askPts.push({ price: a.price, cum: askCum });
    }

    const bestBid = bidPts[0]?.price ?? mid;
    const bestAsk = askPts[0]?.price ?? mid;
    const worstBid = bidPts[bidPts.length - 1]?.price ?? bestBid;
    const worstAsk = askPts[askPts.length - 1]?.price ?? bestAsk;
    const half = Math.max(Math.abs(mid - worstBid), Math.abs(worstAsk - mid));
    const pad = Math.max(half * 0.05, 0.01);
    const lo = mid - half - pad;
    const hi = mid + half + pad;
    const maxC = Math.max(bidCum, askCum, 1e-9);

    return {
      bidPts,
      askPts,
      bestBid,
      bestAsk,
      worstBid,
      worstAsk,
      lo,
      hi,
      maxC,
      bidTotal: bidCum,
      askTotal: askCum,
    };
  }, [bids, asks, mid]);

  if (!model || mid == null) {
    return (
      <div
        ref={containerRef}
        className="h-[240px] flex items-center justify-center text-sm text-neutral-500"
      >
        Warming up book…
      </div>
    );
  }

  const W = width;
  const x = (p: number) =>
    PAD + ((p - model.lo) / (model.hi - model.lo)) * (W - 2 * PAD);
  const y = (c: number) => H - PAD - (c / model.maxC) * (H - 2 * PAD);

  let bidPath = "";
  if (model.bidPts.length > 0) {
    bidPath = `M ${x(model.bestBid)} ${H - PAD} L ${x(model.bestBid)} ${y(model.bidPts[0].cum)}`;
    let cum = model.bidPts[0].cum;
    for (let i = 1; i < model.bidPts.length; i++) {
      const px = x(model.bidPts[i].price);
      bidPath += ` L ${px} ${y(cum)} L ${px} ${y(model.bidPts[i].cum)}`;
      cum = model.bidPts[i].cum;
    }
    bidPath += ` L ${x(model.worstBid)} ${H - PAD} Z`;
  }

  let askPath = "";
  if (model.askPts.length > 0) {
    askPath = `M ${x(model.bestAsk)} ${H - PAD} L ${x(model.bestAsk)} ${y(model.askPts[0].cum)}`;
    let cum = model.askPts[0].cum;
    for (let i = 1; i < model.askPts.length; i++) {
      const px = x(model.askPts[i].price);
      askPath += ` L ${px} ${y(cum)} L ${px} ${y(model.askPts[i].cum)}`;
      cum = model.askPts[i].cum;
    }
    askPath += ` L ${x(model.worstAsk)} ${H - PAD} Z`;
  }

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const pxPos = ((e.clientX - rect.left) / rect.width) * W;
    const price =
      model.lo + ((pxPos - PAD) / (W - 2 * PAD)) * (model.hi - model.lo);
    if (price < model.lo || price > model.hi) return;
    const side: "bid" | "ask" = price < mid ? "bid" : "ask";
    let cum = 0;
    if (side === "bid") {
      for (const pt of model.bidPts) if (pt.price >= price) cum = pt.cum;
    } else {
      for (const pt of model.askPts) if (pt.price <= price) cum = pt.cum;
    }
    setHover({ x: pxPos, price, cum, side });
  };

  const selectedInRange =
    selectedPrice != null &&
    selectedPrice >= model.lo &&
    selectedPrice <= model.hi;

  return (
    <div ref={containerRef} className="relative">
      <svg
        ref={svgRef}
        width={W}
        height={H}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        className="select-none cursor-crosshair block"
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={PAD}
            x2={W - PAD}
            y1={PAD + f * (H - 2 * PAD)}
            y2={PAD + f * (H - 2 * PAD)}
            stroke="rgba(82, 82, 91, 0.18)"
            strokeDasharray="2 4"
          />
        ))}
        <path
          d={bidPath}
          fill="rgba(34, 197, 94, 0.2)"
          stroke="#22c55e"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
        <path
          d={askPath}
          fill="rgba(239, 68, 68, 0.2)"
          stroke="#ef4444"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
        <line
          x1={x(mid)}
          x2={x(mid)}
          y1={PAD}
          y2={H - PAD}
          stroke="rgba(148, 163, 184, 0.55)"
          strokeDasharray="3 3"
        />
        <text
          x={x(mid)}
          y={PAD - 4}
          textAnchor="middle"
          fontSize="10"
          fill="#a1a1aa"
          fontFamily="ui-monospace, monospace"
        >
          mid {formatUsd(mid, 2)}
        </text>
        {selectedInRange && (
          <>
            <line
              x1={x(selectedPrice!)}
              x2={x(selectedPrice!)}
              y1={PAD}
              y2={H - PAD}
              stroke="#2ce3ff"
              strokeWidth="1"
            />
            <rect
              x={x(selectedPrice!) - 28}
              y={H - PAD - 14}
              width="56"
              height="12"
              rx="2"
              fill="rgba(8, 145, 178, 0.85)"
            />
            <text
              x={x(selectedPrice!)}
              y={H - PAD - 5}
              textAnchor="middle"
              fontSize="9"
              fill="#ecfeff"
              fontFamily="ui-monospace, monospace"
            >
              pin {formatUsd(selectedPrice!, 2)}
            </text>
          </>
        )}
        {hover && (
          <line
            x1={hover.x}
            x2={hover.x}
            y1={PAD}
            y2={H - PAD}
            stroke="rgba(255,255,255,0.45)"
          />
        )}
      </svg>

      {hover && (
        <div
          className="absolute text-[10px] font-mono pointer-events-none px-2 py-1 rounded bg-neutral-900/95 border border-neutral-500/30 text-neutral-100 whitespace-nowrap shadow-lg"
          style={{
            left: Math.min(W - 150, Math.max(4, hover.x + 8)),
            top: 6,
          }}
        >
          <div
            className={
              hover.side === "bid" ? "text-emerald-300" : "text-rose-300"
            }
          >
            {hover.side === "bid" ? "BID" : "ASK"} {formatUsd(hover.price, 2)}
          </div>
          <div className="text-neutral-300 tabular-nums">
            cum {hover.cum.toFixed(4)} BTC
          </div>
          <div className="text-neutral-500 tabular-nums">
            {(((hover.price - mid) / mid) * 10000).toFixed(1)} bps from mid
          </div>
        </div>
      )}

      <div className="mt-1 grid grid-cols-2 text-[10px] font-mono">
        <span className="text-emerald-300 tabular-nums">
          Σ bids {model.bidTotal.toFixed(4)} BTC
        </span>
        <span className="text-right text-rose-300 tabular-nums">
          {model.askTotal.toFixed(4)} BTC asks Σ
        </span>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Compact tape — size-weighted heatmap rows
// ----------------------------------------------------------------------------

function CompactTape({ trades }: { trades: PublicTrade[] }) {
  const slice = trades.slice(0, 60);
  const maxSize = useMemo(() => {
    let m = 1e-9;
    for (const t of slice) if (t.size > m) m = t.size;
    return m;
  }, [slice]);

  return (
    <div className="glass-scroll max-h-[360px] overflow-auto">
      <table className="w-full text-[11px] font-mono">
        <tbody>
          {slice.map((t, i) => {
            const intensity = Math.min(1, t.size / maxSize);
            const alpha = 0.04 + intensity * 0.22;
            const bg =
              t.side === "buy"
                ? `rgba(34, 197, 94, ${alpha})`
                : `rgba(239, 68, 68, ${alpha})`;
            return (
              <tr
                key={`${t.trade_id ?? i}-${t.ts}`}
                style={{ background: bg }}
                className="border-b border-neutral-500/5 last:border-0"
              >
                <td className="text-neutral-500 px-2 py-[3px] tabular-nums">
                  {formatClockTime(t.ts)}
                </td>
                <td
                  className={`px-1 py-[3px] font-semibold ${
                    t.side === "buy" ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {t.side === "buy" ? "B" : "S"}
                </td>
                <td className="text-right px-1 py-[3px] tabular-nums text-neutral-100">
                  {formatNumber(t.price, 2)}
                </td>
                <td className="text-right px-2 py-[3px] tabular-nums text-neutral-300">
                  {t.size.toFixed(4)}
                </td>
              </tr>
            );
          })}
          {slice.length === 0 && (
            <tr>
              <td
                colSpan={4}
                className="text-center text-neutral-500 py-4"
              >
                No trades yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Trade flow — stacked volume histogram over a 60s rolling window
// ----------------------------------------------------------------------------

function TradeFlow({ trades }: { trades: PublicTrade[] }) {
  const flow = useMemo(() => {
    const now = Date.now();
    const bucketMs = FLOW_WINDOW_MS / FLOW_BUCKETS;
    const buckets = Array.from({ length: FLOW_BUCKETS }, () => ({
      buy: 0,
      sell: 0,
    }));
    let totalBuy = 0;
    let totalSell = 0;
    for (const t of trades) {
      const ts = Date.parse(t.ts);
      if (!Number.isFinite(ts)) continue;
      const age = now - ts;
      if (age < 0 || age >= FLOW_WINDOW_MS) continue;
      const idx = Math.min(
        FLOW_BUCKETS - 1,
        Math.max(0, FLOW_BUCKETS - 1 - Math.floor(age / bucketMs)),
      );
      if (t.side === "buy") {
        buckets[idx].buy += t.size;
        totalBuy += t.size;
      } else {
        buckets[idx].sell += t.size;
        totalSell += t.size;
      }
    }
    let maxVol = 1e-9;
    for (const b of buckets) {
      if (b.buy > maxVol) maxVol = b.buy;
      if (b.sell > maxVol) maxVol = b.sell;
    }
    return { buckets, totalBuy, totalSell, maxVol };
  }, [trades]);

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const total = flow.totalBuy + flow.totalSell;
  const buyPct = total > 0 ? (flow.totalBuy / total) * 100 : 50;
  const netPct = total > 0 ? ((flow.totalBuy - flow.totalSell) / total) * 100 : 0;
  const netLabel =
    netPct > 5 ? "buy pressure" : netPct < -5 ? "sell pressure" : "balanced";
  const netColor =
    netPct > 5
      ? "text-emerald-300"
      : netPct < -5
        ? "text-rose-300"
        : "text-neutral-400";

  const W = 600;
  const H = 140;
  const midY = H / 2;
  const barW = W / FLOW_BUCKETS;

  const hovered = hoverIdx != null ? flow.buckets[hoverIdx] : null;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2 text-xs font-mono">
        <span className="text-emerald-300 tabular-nums">
          Buy {flow.totalBuy.toFixed(4)}
        </span>
        <span className="text-neutral-500 text-[10px] uppercase tracking-wider">
          60s rolling
        </span>
        <span className="text-rose-300 tabular-nums">
          {flow.totalSell.toFixed(4)} Sell
        </span>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full h-[140px] block"
          onMouseLeave={() => setHoverIdx(null)}
        >
          <line
            x1="0"
            x2={W}
            y1={midY}
            y2={midY}
            stroke="rgba(148, 163, 184, 0.35)"
          />
          {flow.buckets.map((b, i) => {
            const buyH = (b.buy / flow.maxVol) * (midY - 2);
            const sellH = (b.sell / flow.maxVol) * (midY - 2);
            const bx = i * barW + 1;
            const bw = Math.max(1, barW - 2);
            const isHover = hoverIdx === i;
            return (
              <g
                key={i}
                onMouseEnter={() => setHoverIdx(i)}
                style={{ cursor: "default" }}
              >
                <rect
                  x={bx - 1}
                  y={0}
                  width={bw + 2}
                  height={H}
                  fill="transparent"
                />
                <rect
                  x={bx}
                  y={midY - buyH}
                  width={bw}
                  height={buyH}
                  fill={
                    isHover
                      ? "rgba(34, 197, 94, 0.95)"
                      : "rgba(34, 197, 94, 0.6)"
                  }
                />
                <rect
                  x={bx}
                  y={midY + 1}
                  width={bw}
                  height={sellH}
                  fill={
                    isHover
                      ? "rgba(239, 68, 68, 0.95)"
                      : "rgba(239, 68, 68, 0.6)"
                  }
                />
              </g>
            );
          })}
        </svg>
        {hovered && hoverIdx != null && (
          <div className="absolute top-1 right-2 text-[10px] font-mono px-2 py-1 rounded bg-neutral-900/95 border border-neutral-500/30 pointer-events-none">
            <div className="text-neutral-500 uppercase tracking-wider text-[9px]">
              t-{((FLOW_BUCKETS - 1 - hoverIdx) * (FLOW_WINDOW_MS / FLOW_BUCKETS / 1000)).toFixed(0)}s
            </div>
            <div className="text-emerald-300 tabular-nums">
              B {hovered.buy.toFixed(4)}
            </div>
            <div className="text-rose-300 tabular-nums">
              S {hovered.sell.toFixed(4)}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-neutral-500 mb-1.5">
          <span>Net flow</span>
          <span className={`font-mono normal-case tracking-normal ${netColor}`}>
            {netPct >= 0 ? "+" : ""}
            {netPct.toFixed(1)}% · {netLabel}
          </span>
        </div>
        <div className="relative h-1.5 rounded-sm overflow-hidden bg-neutral-500/10">
          <div
            className="absolute inset-y-0 left-0 bg-emerald-500/60"
            style={{ width: `${buyPct}%` }}
          />
          <div
            className="absolute inset-y-0 right-0 bg-rose-500/60"
            style={{ width: `${100 - buyPct}%` }}
          />
          <div className="absolute inset-y-0 left-1/2 w-px bg-neutral-200/50" />
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Interactive spread analytics — per-tier sparklines + expandable histogram
// ----------------------------------------------------------------------------

function Sparkline({
  values,
  width = 160,
  height = 28,
  stroke = "#2ce3ff",
  fill = "rgba(44, 227, 255, 0.12)",
}: {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
}) {
  if (values.length < 2) {
    return (
      <div
        className="text-neutral-600 text-[10px] flex items-center"
        style={{ height }}
      >
        —
      </div>
    );
  }
  let min = values[0];
  let max = values[0];
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = Math.max(1e-9, max - min);
  const n = values.length;
  let path = "";
  let area = "";
  for (let i = 0; i < n; i++) {
    const px = (i / (n - 1)) * width;
    const py = height - ((values[i] - min) / span) * (height - 4) - 2;
    path += `${i === 0 ? "M" : "L"} ${px.toFixed(1)} ${py.toFixed(1)} `;
    if (i === 0) area = `M ${px.toFixed(1)} ${height} L ${px.toFixed(1)} ${py.toFixed(1)} `;
    else area += `L ${px.toFixed(1)} ${py.toFixed(1)} `;
  }
  area += `L ${width} ${height} Z`;
  const lastY =
    height - ((values[n - 1] - min) / span) * (height - 4) - 2;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
    >
      <path d={area} fill={fill} />
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth="1.25"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={width} cy={lastY} r="1.75" fill={stroke} />
    </svg>
  );
}

function Histogram({
  values,
  width = 320,
  height = 80,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 4) {
    return (
      <div
        className="text-neutral-600 text-[10px] flex items-center"
        style={{ height }}
      >
        warming up…
      </div>
    );
  }
  let min = values[0];
  let max = values[0];
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = Math.max(1e-9, max - min);
  const bins = 18;
  const counts = new Array(bins).fill(0) as number[];
  for (const v of values) {
    const idx = Math.min(
      bins - 1,
      Math.max(0, Math.floor(((v - min) / span) * bins)),
    );
    counts[idx] += 1;
  }
  let maxC = 1;
  for (const c of counts) if (c > maxC) maxC = c;
  const barW = width / bins;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
    >
      {counts.map((c, i) => {
        const h = (c / maxC) * (height - 4);
        return (
          <rect
            key={i}
            x={i * barW + 1}
            y={height - h - 2}
            width={Math.max(1, barW - 2)}
            height={h}
            fill="rgba(44, 227, 255, 0.5)"
          />
        );
      })}
    </svg>
  );
}

function SpreadAnalytics({
  metrics,
  history,
}: {
  metrics: Record<string, SpreadMetric>;
  history: Record<string, number[]>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const depths = Object.keys(metrics);

  if (depths.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-neutral-500">
        Warming up spread samples…
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-[72px_1fr_80px_80px_72px_72px_16px] gap-2 items-center px-2 py-1.5 text-[10px] uppercase tracking-wider text-neutral-500 border-b border-neutral-500/15">
        <span>Depth</span>
        <span>Trend</span>
        <span className="text-right">Last</span>
        <span className="text-right">Avg</span>
        <span className="text-right">Min</span>
        <span className="text-right">Max</span>
        <span />
      </div>
      {depths.map((depth) => {
        const m = metrics[depth];
        const h = history[depth] ?? [];
        const exp = expanded === depth;
        const trend =
          h.length >= 2 ? h[h.length - 1] - h[h.length - Math.min(h.length, 20)] : 0;
        const trendColor =
          trend > 0
            ? "text-rose-300"
            : trend < 0
              ? "text-emerald-300"
              : "text-neutral-400";
        return (
          <div
            key={depth}
            className={`${exp ? "bg-white/[0.02]" : ""} border-b border-neutral-500/10 last:border-0`}
          >
            <button
              type="button"
              onClick={() =>
                setExpanded((prev) => (prev === depth ? null : depth))
              }
              className="w-full grid grid-cols-[72px_1fr_80px_80px_72px_72px_16px] gap-2 items-center px-2 py-2 text-xs font-mono text-left hover:bg-white/[0.015] transition-colors focus:outline-none focus:bg-white/[0.03]"
              aria-expanded={exp}
            >
              <span className="text-neutral-300">{depth}</span>
              <Sparkline values={h} />
              <span className="text-right text-neutral-100 tabular-nums">
                {formatUsd(m.last, 2)}
              </span>
              <span className="text-right text-neutral-400 tabular-nums">
                {formatUsd(m.avg, 2)}
              </span>
              <span className="text-right text-emerald-300/90 tabular-nums">
                {formatUsd(m.min, 2)}
              </span>
              <span className="text-right text-rose-300/90 tabular-nums">
                {formatUsd(m.max, 2)}
              </span>
              <ChevronIcon expanded={exp} />
            </button>
            {exp && (
              <div className="px-3 pb-4 pt-1 grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="md:col-span-3">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-neutral-500 mb-1.5">
                    <span>Session history</span>
                    <span
                      className={`font-mono normal-case tracking-normal ${trendColor}`}
                    >
                      {trend >= 0 ? "+" : ""}
                      {formatUsd(trend, 2)} recent
                    </span>
                  </div>
                  <Sparkline values={h} height={72} />
                  <div className="mt-1 flex justify-between text-[10px] font-mono text-neutral-500 tabular-nums">
                    <span>{h.length} samples</span>
                    <span>median {formatUsd(m.median, 2)}</span>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1.5">
                    Distribution
                  </div>
                  <Histogram values={h} />
                  <div className="mt-1 flex justify-between text-[10px] font-mono text-neutral-500 tabular-nums">
                    <span>min {formatUsd(m.min, 2)}</span>
                    <span>max {formatUsd(m.max, 2)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ProTerminalPanel() {
  const { data: state } = useSternState();
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null);

  return (
    <div className="p-6 space-y-4">
      <PanelHeader
        title="Pro Terminal"
        subtitle="L2 book · depth curve · tape · trade flow · interactive spread analytics"
        state={state}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <Panel
          title="L2 Order Book"
          subtitle={`Top ${LADDER_DEPTH} each side · click a rung to pin`}
          className="lg:col-span-4"
        >
          <L2Ladder
            state={state ?? null}
            selectedPrice={selectedPrice}
            onSelectPrice={setSelectedPrice}
          />
        </Panel>

        <Panel
          title="Depth Curve"
          subtitle="Cumulative BTC · hover for price/size/bps · mirrors ladder pin"
          className="lg:col-span-5"
        >
          <DepthChart
            bids={state?.book.bids ?? []}
            asks={state?.book.asks ?? []}
            mid={state?.mid_price ?? null}
            selectedPrice={selectedPrice}
          />
        </Panel>

        <Panel
          title="Tape"
          subtitle="Last 60 prints · tint ∝ size"
          className="lg:col-span-3"
        >
          <CompactTape trades={state?.recent_trades ?? []} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <Panel
          title="Trade Flow"
          subtitle="60s rolling buy / sell volume — hover bars"
          className="lg:col-span-4"
        >
          <TradeFlow trades={state?.recent_trades ?? []} />
        </Panel>

        <Panel
          title="Depth-weighted Spread"
          subtitle="Per-tier trend · click a row for distribution"
          className="lg:col-span-8"
        >
          <SpreadAnalytics
            metrics={state?.spread_metrics ?? {}}
            history={state?.spread_history ?? {}}
          />
        </Panel>
      </div>
    </div>
  );
}

// ============================================================================
// Price Chart — OHLC candles (lightweight-charts, WebGL-backed) with MM
// quote overlay and fill markers. Aggregates mid_history client-side into
// time buckets so no backend change is required.
// ============================================================================

const BUCKET_CHOICES = [1, 2, 5, 15] as const;
type BucketSec = (typeof BUCKET_CHOICES)[number];

function aggregateCandles(mids: MidPoint[], bucketSec: number): CandlestickData<UTCTimestamp>[] {
  if (mids.length === 0) return [];
  const buckets = new Map<number, CandlestickData<UTCTimestamp>>();
  const order: number[] = [];
  for (const point of mids) {
    const ms = Date.parse(point.ts);
    if (!Number.isFinite(ms)) continue;
    const t = Math.floor(ms / 1000);
    const bucket = Math.floor(t / bucketSec) * bucketSec;
    const existing = buckets.get(bucket);
    if (!existing) {
      buckets.set(bucket, {
        time: bucket as UTCTimestamp,
        open: point.mid_price,
        high: point.mid_price,
        low: point.mid_price,
        close: point.mid_price,
      });
      order.push(bucket);
    } else {
      if (point.mid_price > existing.high) existing.high = point.mid_price;
      if (point.mid_price < existing.low) existing.low = point.mid_price;
      existing.close = point.mid_price;
    }
  }
  return order.map((b) => buckets.get(b)!);
}

const MIN_MARKER_SIZE = 0.005;
const MAX_MARKERS = 20;

function buildFillMarkers(
  fills: SimFill[],
  bucketSec: number,
  firstBucket: number | null,
  lastBucket: number | null,
): SeriesMarker<Time>[] {
  if (firstBucket == null || lastBucket == null) return [];
  const out: SeriesMarker<Time>[] = [];
  for (const fill of fills) {
    if (Math.abs(fill.size) < MIN_MARKER_SIZE) continue;
    const ms = Date.parse(fill.ts);
    if (!Number.isFinite(ms)) continue;
    const t = Math.floor(ms / 1000);
    const bucket = Math.floor(t / bucketSec) * bucketSec;
    if (bucket < firstBucket || bucket > lastBucket) continue;
    out.push({
      time: bucket as UTCTimestamp,
      position: fill.side === "buy" ? "belowBar" : "aboveBar",
      color: fill.side === "buy" ? "#22c55e" : "#ef4444",
      shape: fill.side === "buy" ? "arrowUp" : "arrowDown",
      text: `${fill.side === "buy" ? "B" : "S"} ${fill.size.toFixed(3)}`,
    });
  }
  out.sort((a, b) => (a.time as number) - (b.time as number));
  return out.length > MAX_MARKERS ? out.slice(out.length - MAX_MARKERS) : out;
}

type CandleChartProps = {
  candles: CandlestickData<UTCTimestamp>[];
  bidPrice: number | null;
  askPrice: number | null;
  markers: SeriesMarker<Time>[];
};

function CandleChart({ candles, bidPrice, askPrice, markers }: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const bidLineRef = useRef<IPriceLine | null>(null);
  const askLineRef = useRef<IPriceLine | null>(null);
  const prevLastTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 320,
      layout: {
        background: { color: "transparent" },
        textColor: "#a1a1aa",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(82, 82, 91, 0.18)" },
        horzLines: { color: "rgba(82, 82, 91, 0.18)" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
        borderColor: "rgba(82, 82, 91, 0.4)",
        rightOffset: 4,
        barSpacing: 8,
      },
      rightPriceScale: {
        borderColor: "rgba(82, 82, 91, 0.4)",
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      crosshair: {
        mode: 0,
        vertLine: { color: "#2ce3ff", width: 1, style: 2, labelBackgroundColor: "#0891b2" },
        horzLine: { color: "#2ce3ff", width: 1, style: 2, labelBackgroundColor: "#0891b2" },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });
    const series = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "rgba(34, 197, 94, 0.7)",
      wickDownColor: "rgba(239, 68, 68, 0.7)",
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });
    series.priceScale().applyOptions({
      scaleMargins: { top: 0.08, bottom: 0.12 },
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: Math.max(1, Math.floor(entry.contentRect.width)) });
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      bidLineRef.current = null;
      askLineRef.current = null;
      prevLastTimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    series.setData(candles);
    const lastTime =
      candles.length > 0 ? (candles[candles.length - 1].time as number) : null;
    const prevLast = prevLastTimeRef.current;
    prevLastTimeRef.current = lastTime;
    // Only auto-scroll to the right edge if the user hasn't panned back —
    // i.e. the previous latest bar was still within the visible range.
    if (lastTime != null) {
      const visible = chart.timeScale().getVisibleRange();
      const following =
        prevLast == null ||
        !visible ||
        (visible.to as number) >= prevLast - 0.5;
      if (following) {
        chart.timeScale().scrollToRealTime();
      }
    }
  }, [candles]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const syncLine = (
      ref: React.MutableRefObject<IPriceLine | null>,
      price: number | null,
      color: string,
      title: string,
    ) => {
      if (price == null || !Number.isFinite(price)) {
        if (ref.current) {
          series.removePriceLine(ref.current);
          ref.current = null;
        }
        return;
      }
      if (ref.current) {
        ref.current.applyOptions({ price });
      } else {
        ref.current = series.createPriceLine({
          price,
          color,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title,
        });
      }
    };
    syncLine(bidLineRef, bidPrice, "#22c55e", "BID");
    syncLine(askLineRef, askPrice, "#ef4444", "ASK");
  }, [bidPrice, askPrice]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    series.setMarkers(markers);
  }, [markers]);

  return <div ref={containerRef} className="w-full h-80" />;
}

export function PriceChartPanel() {
  const { data: state } = useSternState();
  const [bucketSec, setBucketSec] = useState<BucketSec>(2);
  const mids = state?.mid_history ?? [];
  const fills = state?.fills ?? [];

  const candles = useMemo(() => aggregateCandles(mids, bucketSec), [mids, bucketSec]);
  const markers = useMemo(() => {
    if (candles.length === 0) return [];
    const firstBucket = candles[0].time as number;
    const lastBucket = candles[candles.length - 1].time as number;
    return buildFillMarkers(fills, bucketSec, firstBucket, lastBucket);
  }, [fills, bucketSec, candles]);

  const stats = useMemo(() => {
    if (candles.length === 0) return null;
    const last = candles[candles.length - 1];
    const first = candles[0];
    let high = candles[0].high;
    let low = candles[0].low;
    for (const c of candles) {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
    }
    const change = last.close - first.open;
    const changePct = first.open !== 0 ? (change / first.open) * 100 : 0;
    const bullish = last.close >= last.open;
    return { last, first, high, low, change, changePct, bullish };
  }, [candles]);

  const spreadUsd =
    state?.best_bid && state?.best_ask
      ? state.best_ask.price - state.best_bid.price
      : null;

  return (
    <div className="p-6 space-y-4">
      <PanelHeader
        title="Price Action"
        subtitle="OHLC candles · MM quote overlay · fill markers"
        state={state}
      />
      <Panel>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <div className="flex gap-4 text-xs font-mono items-baseline flex-wrap">
            {stats ? (
              <>
                <span className="text-neutral-500">
                  O{" "}
                  <span className="text-neutral-200">
                    {formatUsd(stats.last.open, 2)}
                  </span>
                </span>
                <span className="text-neutral-500">
                  H{" "}
                  <span className="text-emerald-300">
                    {formatUsd(stats.last.high, 2)}
                  </span>
                </span>
                <span className="text-neutral-500">
                  L{" "}
                  <span className="text-rose-300">
                    {formatUsd(stats.last.low, 2)}
                  </span>
                </span>
                <span className="text-neutral-500">
                  C{" "}
                  <span
                    className={
                      stats.bullish ? "text-emerald-300" : "text-rose-300"
                    }
                  >
                    {formatUsd(stats.last.close, 2)}
                  </span>
                </span>
                <span
                  className={
                    stats.change >= 0 ? "text-emerald-300" : "text-rose-300"
                  }
                >
                  {stats.change >= 0 ? "+" : ""}
                  {formatUsd(stats.change, 2)} ({stats.changePct >= 0 ? "+" : ""}
                  {stats.changePct.toFixed(3)}%)
                </span>
              </>
            ) : (
              <span className="text-neutral-500">—</span>
            )}
          </div>
          <div className="flex gap-1 text-[11px]">
            {BUCKET_CHOICES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setBucketSec(s)}
                className={`px-2 py-0.5 font-mono rounded transition-colors ${
                  bucketSec === s
                    ? "bg-cyan-500/20 text-cyan-200 border border-cyan-500/40"
                    : "text-neutral-500 hover:text-neutral-200 border border-transparent"
                }`}
              >
                {s}s
              </button>
            ))}
          </div>
        </div>
        {candles.length < 2 ? (
          <div className="h-80 flex items-center justify-center text-sm text-neutral-500">
            Warming up mid history…
          </div>
        ) : (
          <CandleChart
            candles={candles}
            bidPrice={state?.quote?.bid_price ?? null}
            askPrice={state?.quote?.ask_price ?? null}
            markers={markers}
          />
        )}
        <div className="mt-3 flex items-center gap-x-6 gap-y-1 text-[11px] font-mono text-neutral-400 flex-wrap">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 bg-emerald-400 inline-block rounded-sm" />
            Bullish
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 bg-rose-400 inline-block rounded-sm" />
            Bearish
          </span>
          <span className="flex items-center gap-2">
            <span className="h-px w-5 border-t border-dashed border-emerald-300 inline-block" />
            MM bid
          </span>
          <span className="flex items-center gap-2">
            <span className="h-px w-5 border-t border-dashed border-rose-300 inline-block" />
            MM ask
          </span>
          <span className="flex items-center gap-2">
            <span className="text-emerald-300">▲</span>
            <span className="text-rose-300">▼</span>
            Fill
          </span>
          {stats && (
            <span className="ml-auto text-neutral-500">
              Window {formatUsd(stats.low, 2)} – {formatUsd(stats.high, 2)} ·{" "}
              {candles.length} candles · {bucketSec}s
              {spreadUsd != null && (
                <>
                  {" "}
                  · top spread{" "}
                  <span className="text-neutral-300">
                    {formatUsd(spreadUsd, 2)}
                  </span>
                </>
              )}
            </span>
          )}
        </div>
      </Panel>
    </div>
  );
}

// ============================================================================
// Portfolio — position / PnL / fills
// ============================================================================

function FillsTable({ fills }: { fills: SimFill[] }) {
  return (
    <table className="glass-table w-full text-xs font-mono">
      <thead>
        <tr>
          <th className="text-left">Time</th>
          <th className="text-left">Side</th>
          <th className="text-right">Price</th>
          <th className="text-right">Size</th>
          <th className="text-right">Notional</th>
          <th className="text-left">Reason</th>
        </tr>
      </thead>
      <tbody>
        {fills.slice(0, 50).map((fill, idx) => (
          <tr key={`${fill.ts}-${idx}`}>
            <td className="text-neutral-500">{formatClockTime(fill.ts)}</td>
            <td
              className={
                fill.side === "buy" ? "text-emerald-300" : "text-rose-300"
              }
            >
              {fill.side}
            </td>
            <td className="text-right">{formatNumber(fill.price, 2)}</td>
            <td className="text-right">{fill.size.toFixed(4)}</td>
            <td className="text-right">
              {formatUsd(fill.price * fill.size, 2)}
            </td>
            <td className="text-neutral-400">{fill.reason}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PortfolioPanel() {
  const { data: state } = useSternState();
  const portfolio = state?.portfolio;
  const totalPnl = portfolio
    ? portfolio.realized_pnl + portfolio.unrealized_pnl
    : 0;

  return (
    <div className="p-6 space-y-4">
      <PanelHeader
        title="Portfolio"
        subtitle="Paper MM session — position, PnL and simulated fills"
        state={state}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Panel>
          <Kpi
            label="Position"
            value={formatBtc(portfolio?.position_btc ?? 0, 4)}
            accent={portfolio ? sign(portfolio.position_btc) : "neutral"}
          />
        </Panel>
        <Panel>
          <Kpi
            label="Avg Entry"
            value={formatUsd(portfolio?.avg_entry_price, 2)}
          />
        </Panel>
        <Panel>
          <Kpi
            label="Exposure"
            value={formatUsd(portfolio?.exposure_usd, 2)}
          />
        </Panel>
        <Panel>
          <Kpi
            label="Cash"
            value={formatUsd(portfolio?.cash, 2)}
          />
        </Panel>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Panel>
          <Kpi
            label="Realized PnL"
            value={formatUsd(portfolio?.realized_pnl, 2)}
            accent={portfolio ? sign(portfolio.realized_pnl) : "neutral"}
          />
        </Panel>
        <Panel>
          <Kpi
            label="Unrealized PnL"
            value={formatUsd(portfolio?.unrealized_pnl, 2)}
            accent={portfolio ? sign(portfolio.unrealized_pnl) : "neutral"}
          />
        </Panel>
        <Panel>
          <Kpi
            label="Total PnL"
            value={formatUsd(totalPnl, 2)}
            accent={sign(totalPnl)}
          />
        </Panel>
        <Panel>
          <Kpi
            label="Equity"
            value={formatUsd(portfolio?.equity, 2)}
          />
        </Panel>
      </div>
      <Panel
        title="Simulated fills"
        subtitle="Most recent MM paper executions"
      >
        <div className="glass-scroll max-h-[420px] overflow-auto">
          <FillsTable fills={state?.fills ?? []} />
        </div>
      </Panel>
    </div>
  );
}

// ============================================================================
// Microstructure — realized vol / momentum / imbalance / micro-bias
// ============================================================================

export function MicrostructurePanel() {
  const { data: state } = useSternState();
  const q = state?.quant_lab;
  return (
    <div className="p-6 space-y-4">
      <PanelHeader
        title="Microstructure"
        subtitle="Real-time vol, momentum, depth imbalance and micro-bias"
        state={state}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Panel>
          <Kpi label="Realized vol" value={formatBps(q?.realized_vol_bps)} />
        </Panel>
        <Panel>
          <Kpi
            label="Momentum"
            value={formatBps(q?.momentum_bps)}
            accent={q ? sign(q.momentum_bps) : "neutral"}
          />
        </Panel>
        <Panel>
          <Kpi
            label="Micro bias"
            value={formatBps(q?.micro_bias_bps)}
            accent={q ? sign(q.micro_bias_bps) : "neutral"}
          />
        </Panel>
        <Panel>
          <Kpi
            label="Top5 depth imbalance"
            value={formatPct((q?.top5_depth_imbalance ?? 0) * 100, 2)}
            accent={q ? sign(q.top5_depth_imbalance) : "neutral"}
          />
        </Panel>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Panel title="Spread regimes" subtitle="Per-depth state vs session avg">
          <table className="glass-table w-full text-xs font-mono">
            <thead>
              <tr>
                <th className="text-left">Depth</th>
                <th className="text-left">State</th>
                <th className="text-right">Last</th>
                <th className="text-right">Avg</th>
              </tr>
            </thead>
            <tbody>
              {(q?.spread_regimes ?? []).map((regime) => (
                <tr key={regime.depth}>
                  <td className="text-neutral-400">{regime.depth}</td>
                  <td
                    className={
                      regime.state === "tight"
                        ? "text-emerald-300"
                        : regime.state === "wide"
                          ? "text-rose-300"
                          : regime.state === "balanced"
                            ? "text-neutral-200"
                            : "text-amber-300"
                    }
                  >
                    {regime.state}
                  </td>
                  <td className="text-right">{formatUsd(regime.last, 2)}</td>
                  <td className="text-right">{formatUsd(regime.avg, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel
          title="Research presets"
          subtitle="Tight / baseline / defensive MM stances"
        >
          <div className="space-y-3 text-sm">
            {(q?.research_presets ?? []).map((preset) => (
              <div
                key={preset.name}
                className="border-l-2 border-cyan-500/30 pl-3"
              >
                <div className="flex justify-between items-baseline">
                  <span className="font-semibold text-neutral-100">
                    {preset.name}
                  </span>
                  <span className="text-xs font-mono text-neutral-400">
                    {preset.spread_bps.toFixed(1)} bps ·{" "}
                    {preset.skew_bps_per_btc.toFixed(1)} bps/BTC
                  </span>
                </div>
                <div className="text-xs text-neutral-500">{preset.stance}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <Panel>
        <div className="flex justify-between text-xs font-mono text-neutral-500">
          <span>
            Readiness:{" "}
            <span className="text-neutral-300">{q?.readiness ?? "—"}</span>
          </span>
          <span>
            Window: {q?.window_points ?? 0} points · Trade flow imbalance:{" "}
            {formatBtc(q?.trade_flow_imbalance_btc ?? 0, 4)}
          </span>
        </div>
      </Panel>
    </div>
  );
}

// ============================================================================
// Risk (ib-account tab) and System (vm-status tab)
// ============================================================================

export function RiskPanel() {
  const { data: state } = useSternState();
  const cfg = state?.strategy.config;
  const portfolio = state?.portfolio;
  return (
    <div className="p-6 space-y-4">
      <PanelHeader
        title="Risk"
        subtitle="Hard limits guarding the MM session"
        state={state}
      />
      <Panel>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm font-mono">
          <div>
            <div className="text-neutral-500 text-xs mb-1">Status</div>
            <div
              className={
                state?.risk_status === "ok"
                  ? "text-emerald-300"
                  : "text-amber-300"
              }
            >
              {state?.risk_status ?? "—"}
            </div>
          </div>
          <div>
            <div className="text-neutral-500 text-xs mb-1">Max notional</div>
            <div>{formatUsd(cfg?.max_notional_exposure, 0)}</div>
          </div>
          <div>
            <div className="text-neutral-500 text-xs mb-1">Max loss</div>
            <div>{formatUsd(cfg?.max_loss, 0)}</div>
          </div>
          <div>
            <div className="text-neutral-500 text-xs mb-1">Base spread</div>
            <div>{formatBps(cfg?.base_quote_spread_bps)}</div>
          </div>
          <div>
            <div className="text-neutral-500 text-xs mb-1">Order size</div>
            <div>{formatBtc(cfg?.order_size_btc, 4)}</div>
          </div>
          <div>
            <div className="text-neutral-500 text-xs mb-1">Skew/BTC</div>
            <div>{formatBps(cfg?.position_skew_bps_per_btc)}</div>
          </div>
          <div>
            <div className="text-neutral-500 text-xs mb-1">Drawdown</div>
            <div>{formatUsd(portfolio?.drawdown, 2)}</div>
          </div>
          <div>
            <div className="text-neutral-500 text-xs mb-1">Exposure</div>
            <div>{formatUsd(portfolio?.exposure_usd, 2)}</div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

export function SystemPanel() {
  const { data: state, error, lastUpdatedAt } = useSternState();
  const runtime = state?.runtime;
  return (
    <div className="p-6 space-y-4">
      <PanelHeader
        title="System"
        subtitle="Coinbase feed state, message throughput, session uptime"
        state={state}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Panel>
          <Kpi
            label="Feed"
            value={runtime?.feed_state ?? "—"}
            accent={runtime?.feed_state === "live" ? "positive" : "neutral"}
          />
        </Panel>
        <Panel>
          <Kpi
            label="Uptime"
            value={runtime ? `${runtime.uptime_s.toLocaleString()} s` : "—"}
          />
        </Panel>
        <Panel>
          <Kpi
            label="Messages"
            value={runtime?.messages_seen.toLocaleString() ?? "—"}
          />
        </Panel>
        <Panel>
          <Kpi label="Trades seen" value={runtime?.trade_events.toString() ?? "—"} />
        </Panel>
      </div>
      <Panel title="Details">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm font-mono">
          <div>
            <div className="text-neutral-500 text-xs mb-1">Mid ready</div>
            <div>{runtime?.mid_ready ? "yes" : "no"}</div>
          </div>
          <div>
            <div className="text-neutral-500 text-xs mb-1">Book bids</div>
            <div>{runtime?.book_levels.bids ?? 0}</div>
          </div>
          <div>
            <div className="text-neutral-500 text-xs mb-1">Book asks</div>
            <div>{runtime?.book_levels.asks ?? 0}</div>
          </div>
          <div>
            <div className="text-neutral-500 text-xs mb-1">Last trade</div>
            <div className="text-neutral-400">
              {formatClockTime(runtime?.last_trade_ts)}
            </div>
          </div>
          <div>
            <div className="text-neutral-500 text-xs mb-1">Client poll</div>
            <div className="text-neutral-400">
              {lastUpdatedAt
                ? formatClockTime(new Date(lastUpdatedAt).toISOString())
                : "—"}
            </div>
          </div>
          <div className="col-span-3">
            <div className="text-neutral-500 text-xs mb-1">Error</div>
            <div className={error ? "text-rose-300" : "text-neutral-400"}>
              {error ?? "none"}
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

// ============================================================================
// Export — three CSV download buttons
// ============================================================================

export function ExportPanel() {
  const { data: state } = useSternState();
  return (
    <div className="p-6 space-y-4">
      <PanelHeader
        title="Export"
        subtitle="Download session data as CSV for offline analysis"
        state={state}
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Panel
          title="Fills"
          subtitle="All simulated MM executions with side, price, size, notional and reason"
        >
          <div className="text-xs text-neutral-500 mb-3 font-mono">
            {state?.fills.length ?? 0} rows available
          </div>
          <button
            type="button"
            className="glass-panel w-full py-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200 transition-colors"
            onClick={() => downloadCsv("fills")}
          >
            Download fills.csv
          </button>
        </Panel>
        <Panel
          title="PnL curve"
          subtitle="Equity, position and total PnL sampled at book-tick cadence"
        >
          <div className="text-xs text-neutral-500 mb-3 font-mono">
            window — streaming history
          </div>
          <button
            type="button"
            className="glass-panel w-full py-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200 transition-colors"
            onClick={() => downloadCsv("pnl")}
          >
            Download pnl.csv
          </button>
        </Panel>
        <Panel
          title="Spread history"
          subtitle="Depth-weighted spread samples for 0.1 / 1 / 5 / 10 BTC"
        >
          <div className="text-xs text-neutral-500 mb-3 font-mono">
            4 depth series
          </div>
          <button
            type="button"
            className="glass-panel w-full py-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200 transition-colors"
            onClick={() => downloadCsv("spreads")}
          >
            Download spreads.csv
          </button>
        </Panel>
      </div>
    </div>
  );
}

// ============================================================================
// Backtest Cockpit — paper session replay summary
// ============================================================================

export function BacktestCockpitPanel() {
  const { data: state } = useSternState();
  const bt = state?.backtest_lite;
  return (
    <div className="p-6 space-y-4">
      <PanelHeader
        title="Paper Session Replay"
        subtitle="Lite backtest over the live MM paper session"
        state={state}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Panel>
          <Kpi
            label="Return"
            value={formatPct(bt?.paper_return_pct ?? 0, 3)}
            accent={bt ? sign(bt.paper_return_pct) : "neutral"}
          />
        </Panel>
        <Panel>
          <Kpi
            label="Total PnL"
            value={formatUsd(bt?.total_pnl_usd, 2)}
            accent={bt ? sign(bt.total_pnl_usd) : "neutral"}
          />
        </Panel>
        <Panel>
          <Kpi
            label="Peak equity"
            value={formatUsd(bt?.peak_equity_usd, 2)}
          />
        </Panel>
        <Panel>
          <Kpi
            label="Max drawdown"
            value={formatUsd(bt?.max_drawdown_usd, 2)}
            accent={bt && bt.max_drawdown_usd > 0 ? "negative" : "neutral"}
          />
        </Panel>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Panel>
          <Kpi
            label="Fills"
            value={bt?.fill_count.toString() ?? "—"}
          />
        </Panel>
        <Panel>
          <Kpi
            label="Fill volume"
            value={formatBtc(bt?.fill_volume_btc ?? 0, 4)}
          />
        </Panel>
        <Panel>
          <Kpi
            label="Fill notional"
            value={formatUsd(bt?.fill_notional_usd, 2)}
          />
        </Panel>
        <Panel>
          <Kpi
            label="Quote uptime"
            value={formatPct(bt?.quote_uptime_pct ?? 0, 1)}
          />
        </Panel>
      </div>
      <Panel title="Equity curve" subtitle="Last 60 samples of paper equity">
        <MiniCurve values={bt?.equity_curve ?? []} stroke="#2ce3ff" />
      </Panel>
      <Panel title="PnL curve" subtitle="Cumulative realized + unrealized PnL">
        <MiniCurve values={bt?.pnl_curve ?? []} stroke="#34d399" />
      </Panel>
    </div>
  );
}

function MiniCurve({
  values,
  stroke,
}: {
  values: number[];
  stroke: string;
}) {
  if (values.length < 2) {
    return (
      <div className="h-32 flex items-center justify-center text-sm text-neutral-500">
        Warming up…
      </div>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1e-9, max - min);
  const w = 800;
  const h = 120;
  const path = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 16) - 8;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32">
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
