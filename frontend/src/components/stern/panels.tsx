import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  createChart,
  LineStyle,
  type AreaData,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LineData,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  downloadCsv,
  useSternState,
  type BookLevel,
  type MidPoint,
  type PortfolioSnapshot,
  type PublicTrade,
  type QuantLabSnapshot,
  type SimFill,
  type SpreadMetric,
  type SpreadRegime,
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
// Shared UI primitives (glass-styled, Stern-consistent)
// ============================================================================

function Panel({
  title,
  subtitle,
  children,
  className,
  bodyClassName,
  headerRight,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  headerRight?: ReactNode;
}) {
  return (
    <div className={`glass-panel p-3 min-h-0 flex flex-col ${className ?? ""}`}>
      {title && (
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-neutral-200 tracking-tight truncate">
              {title}
            </h3>
            {subtitle && (
              <p className="text-[10px] text-neutral-500 mt-0.5 truncate">{subtitle}</p>
            )}
          </div>
          {headerRight && <div className="flex-shrink-0">{headerRight}</div>}
        </div>
      )}
      <div className={`flex-1 min-h-0 ${bodyClassName ?? ""}`}>{children}</div>
    </div>
  );
}

// TabShell — full-viewport, no-scroll tab container. All tabs must fit in
// 100vw × 100vh with responsive flex/grid layout. Only inner scrollable
// regions (tables, tape) may overflow-auto — never the tab itself.
function TabShell({
  title,
  subtitle,
  children,
  toolbar,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  toolbar?: ReactNode;
}) {
  return (
    <div className="h-full min-h-0 flex flex-col gap-2 p-3 overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 flex-shrink-0">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-neutral-100 tracking-tight truncate">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[11px] text-neutral-500 mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
        {toolbar && <div className="flex-shrink-0">{toolbar}</div>}
      </div>
      <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
        {children}
      </div>
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
  // The popover is absolute-positioned over the base card so neighbors never
  // reflow when a card is expanded. -inset-2 fills the grid gap exactly so
  // the popover visibly grows past the card footprint without pushing siblings.
  return (
    <div className="relative" data-kpi-card>
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={expanded}
        className={`glass-panel w-full p-2.5 text-left transition-colors duration-200 border ${
          expanded
            ? "border-cyan-400/30 bg-white/[0.015]"
            : "border-transparent hover:border-neutral-400/30 hover:bg-white/[0.02]"
        } focus:outline-none focus:border-cyan-400/40`}
      >
        <div className="flex items-start justify-between gap-2">
          <Kpi label={label} value={value} accent={accent} />
          <ChevronIcon expanded={expanded} />
        </div>
      </button>
      {expanded && (
        <button
          type="button"
          onClick={() => onToggle(id)}
          aria-label="Close details"
          className="fade-in absolute -top-2 -left-2 -right-2 z-30 text-left rounded-2xl p-3.5
                     border border-cyan-400/30
                     bg-[linear-gradient(145deg,rgba(20,28,44,0.94),rgba(10,14,24,0.92))]
                     backdrop-blur-2xl
                     shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85),0_0_0_1px_rgba(0,255,136,0.06),inset_0_1px_0_rgba(255,255,255,0.06)]"
        >
          <div className="flex items-start justify-between gap-2">
            <Kpi label={label} value={value} accent={accent} />
            <ChevronIcon expanded={expanded} />
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-white/10 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            {details}
          </div>
        </button>
      )}
    </div>
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
  const chartEquityCurve = useMemo(() => {
    const normalized: number[] = [];
    let prev: number | null = null;
    for (const point of equityCurve) {
      const value = Number(point);
      if (Number.isFinite(value)) {
        normalized.push(value);
        prev = value;
      } else if (prev != null) {
        // Preserve continuity if a transient bad sample sneaks into the feed.
        normalized.push(prev);
      }
    }

    const latest = normalized.length > 0 ? normalized[normalized.length - 1] : null;
    if (Number.isFinite(currentEquity)) {
      if (latest == null) {
        normalized.push(currentEquity);
      } else if (Math.abs(latest - currentEquity) >= 0.005) {
        normalized.push(currentEquity);
      }
    }

    if (normalized.length === 1) {
      normalized.unshift(normalized[0]);
    }
    return normalized;
  }, [equityCurve, currentEquity]);

  const startingEquity =
    chartEquityCurve.length > 0 ? chartEquityCurve[0] : currentEquity;
  const bullish = currentEquity >= startingEquity;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight || 160,
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
        chart.applyOptions({
          width: Math.max(1, Math.floor(entry.contentRect.width)),
          height: Math.max(80, Math.floor(entry.contentRect.height)),
        });
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
    const data: AreaData<UTCTimestamp>[] = chartEquityCurve.map((v, i) => ({
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
  }, [chartEquityCurve, bullish]);

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
  const hasData = chartEquityCurve.length >= 2;

  return (
    <Panel
      title="Equity Curve"
      subtitle="Paper session · cash + mark-to-market portfolio value"
      bodyClassName="flex flex-col"
    >
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 mb-2 text-xs font-mono flex-shrink-0">
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
      <div className="relative w-full flex-1 min-h-[140px]">
        {/* Container must always mount so the chart effect (runs once) can find it. */}
        <div ref={containerRef} className="w-full h-full" />
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-neutral-500 pointer-events-none">
            Warming up equity samples…
          </div>
        )}
      </div>
    </Panel>
  );
}

export function OverviewPanel() {
  const { data: state } = useSternState();
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (id: string) =>
    setExpanded((prev) => (prev === id ? null : id));

  useEffect(() => {
    if (expanded == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(null);
    };
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest("[data-kpi-card]")) setExpanded(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [expanded]);

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
    <TabShell
      title="Crypto MM Overview"
      subtitle="BTC-USD paper market making — click any card to expand"
    >
      <div className="flex-shrink-0 min-h-0">
        <EquityCurveHero
          equityCurve={backtest?.equity_curve ?? []}
          peakEquity={peakEquity}
          currentEquity={portfolio?.equity ?? 0}
          returnPct={returnPct}
          drawdownUsd={portfolio?.drawdown ?? 0}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 flex-shrink-0">
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 flex-shrink-0">
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
    </TabShell>
  );
}

// ============================================================================
// Pro Terminal — L2 book, depth curve, tape, trade flow, spread analytics
// All visuals are SVG/CSS so the whole panel stays reactive at stream cadence
// (≈ 500 ms). A shared `selectedPrice` cross-highlights the ladder and the
// depth curve so clicking a rung pins that price across panels.
// ============================================================================

const LADDER_DEPTH = 5;
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
  const [size, setSize] = useState({ w: 600, h: 240 });
  const [hover, setHover] = useState<DepthHover | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setSize({
          w: Math.max(1, Math.floor(e.contentRect.width)),
          h: Math.max(100, Math.floor(e.contentRect.height)),
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = size.h;
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
        className="h-full flex items-center justify-center text-sm text-neutral-500"
      >
        Warming up book…
      </div>
    );
  }

  const W = size.w;
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
    <div ref={containerRef} className="relative h-full">
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
    <div className="glass-scroll h-full overflow-auto">
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
    <div className="h-full flex flex-col min-h-0">
      <div className="grid grid-cols-[72px_1fr_80px_80px_72px_72px_16px] gap-2 items-center px-2 py-1 text-[10px] uppercase tracking-wider text-neutral-500 border-b border-neutral-500/15 flex-shrink-0">
        <span>Depth</span>
        <span>Trend</span>
        <span className="text-right">Last</span>
        <span className="text-right">Avg</span>
        <span className="text-right">Min</span>
        <span className="text-right">Max</span>
        <span />
      </div>
      <div className="flex-1 min-h-0 overflow-auto glass-scroll">
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
              <div className="px-3 pb-3 pt-1 grid grid-cols-1 md:grid-cols-5 gap-3">
                <div className="md:col-span-3">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
                    <span>Session history</span>
                    <span
                      className={`font-mono normal-case tracking-normal ${trendColor}`}
                    >
                      {trend >= 0 ? "+" : ""}
                      {formatUsd(trend, 2)} recent
                    </span>
                  </div>
                  <Sparkline values={h} height={56} />
                  <div className="mt-1 flex justify-between text-[10px] font-mono text-neutral-500 tabular-nums">
                    <span>{h.length} samples</span>
                    <span>median {formatUsd(m.median, 2)}</span>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
                    Distribution
                  </div>
                  <Histogram values={h} height={56} />
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
    </div>
  );
}

export function ProTerminalPanel() {
  const { data: state } = useSternState();
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null);

  return (
    <TabShell
      title="Pro Terminal"
      subtitle="L2 book · depth curve · tape · trade flow · interactive spread analytics"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 flex-[3] min-h-0">
        <Panel
          title="L2 Order Book"
          subtitle={`Top ${LADDER_DEPTH} each side · click a rung to pin`}
          className="lg:col-span-4"
          bodyClassName="overflow-hidden"
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
          bodyClassName="overflow-hidden"
        >
          <CompactTape trades={state?.recent_trades ?? []} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 flex-[2] min-h-0">
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
          bodyClassName="overflow-hidden"
        >
          <SpreadAnalytics
            metrics={state?.spread_metrics ?? {}}
            history={state?.spread_history ?? {}}
          />
        </Panel>
      </div>
    </TabShell>
  );
}

// ============================================================================
// Price Chart — OHLC candles (lightweight-charts, WebGL-backed) with MM
// quote overlay and fill markers. Aggregates mid_history client-side into
// time buckets so no backend change is required.
// ============================================================================

const BUCKET_CHOICES = [1, 2, 5, 15, 30] as const;
type BucketSec = (typeof BUCKET_CHOICES)[number];

function aggregateCandles(mids: MidPoint[], bucketSec: number): CandlestickData<UTCTimestamp>[] {
  if (mids.length === 0) return [];
  const sortedMids = mids
    .map((point) => ({
      ...point,
      epochMs: Date.parse(point.ts),
    }))
    .filter(
      (point): point is MidPoint & { epochMs: number } =>
        Number.isFinite(point.epochMs) && Number.isFinite(point.mid_price),
    )
    .sort((a, b) => a.epochMs - b.epochMs);
  if (sortedMids.length === 0) return [];
  const buckets = new Map<number, CandlestickData<UTCTimestamp>>();
  let first: number | null = null;
  let last: number | null = null;
  for (const point of sortedMids) {
    const t = Math.floor(point.epochMs / 1000);
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
      if (first == null || bucket < first) first = bucket;
      if (last == null || bucket > last) last = bucket;
    } else {
      if (point.mid_price > existing.high) existing.high = point.mid_price;
      if (point.mid_price < existing.low) existing.low = point.mid_price;
      existing.close = point.mid_price;
    }
  }
  if (first == null || last == null) return [];
  // Forward-fill empty buckets so quiet-market gaps render as flat candles
  // instead of visual holes. Backend samples mid at 10 Hz but only when the
  // book updates, so seconds without order-book changes produce no ticks.
  // Cap contiguous fill to 5 min worth of buckets — anything larger likely
  // signals a feed disconnect and should stay visible as a break.
  const out: CandlestickData<UTCTimestamp>[] = [];
  const maxContiguousFill = Math.max(1, Math.ceil(300 / bucketSec));
  let prevClose: number | null = null;
  let gapRun = 0;
  for (let t = first; t <= last; t += bucketSec) {
    const real = buckets.get(t);
    if (real) {
      out.push(real);
      prevClose = real.close;
      gapRun = 0;
    } else if (prevClose != null && gapRun < maxContiguousFill) {
      out.push({
        time: t as UTCTimestamp,
        open: prevClose,
        high: prevClose,
        low: prevClose,
        close: prevClose,
      });
      gapRun += 1;
    }
  }
  return out;
}

const MIN_MARKER_SIZE = 0.005;
const MIN_BUCKET_AGG_SIZE = 0.02;
const MAX_MARKERS = 20;

function buildFillMarkers(
  fills: SimFill[],
  bucketSec: number,
  firstBucket: number | null,
  lastBucket: number | null,
): SeriesMarker<Time>[] {
  if (firstBucket == null || lastBucket == null) return [];
  type Agg = { size: number; count: number };
  const buckets = new Map<string, Agg>();
  for (const fill of fills) {
    if (Math.abs(fill.size) < MIN_MARKER_SIZE) continue;
    const ms = Date.parse(fill.ts);
    if (!Number.isFinite(ms)) continue;
    const t = Math.floor(ms / 1000);
    const bucket = Math.floor(t / bucketSec) * bucketSec;
    if (bucket < firstBucket || bucket > lastBucket) continue;
    const key = `${bucket}|${fill.side}`;
    const prev = buckets.get(key);
    if (prev) {
      prev.size += Math.abs(fill.size);
      prev.count += 1;
    } else {
      buckets.set(key, { size: Math.abs(fill.size), count: 1 });
    }
  }
  const out: SeriesMarker<Time>[] = [];
  for (const [key, agg] of buckets) {
    if (agg.size < MIN_BUCKET_AGG_SIZE) continue;
    const [bucketStr, side] = key.split("|");
    const bucket = Number(bucketStr);
    const isBuy = side === "buy";
    const label = agg.count > 1
      ? `${isBuy ? "B" : "S"} ${agg.size.toFixed(3)} ×${agg.count}`
      : `${isBuy ? "B" : "S"} ${agg.size.toFixed(3)}`;
    out.push({
      time: bucket as UTCTimestamp,
      position: isBuy ? "belowBar" : "aboveBar",
      color: isBuy ? "#22c55e" : "#ef4444",
      shape: isBuy ? "arrowUp" : "arrowDown",
      text: label,
    });
  }
  out.sort((a, b) => (a.time as number) - (b.time as number));
  return out.length > MAX_MARKERS ? out.slice(out.length - MAX_MARKERS) : out;
}

type CandleChartProps = {
  candles: CandlestickData<UTCTimestamp>[];
  continuityLine: LineData<UTCTimestamp>[];
  bucketSec: BucketSec;
  bidPrice: number | null;
  askPrice: number | null;
  markers: SeriesMarker<Time>[];
};

function CandleChart({
  candles,
  continuityLine,
  bucketSec,
  bidPrice,
  askPrice,
  markers,
}: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const continuitySeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bidLineRef = useRef<IPriceLine | null>(null);
  const askLineRef = useRef<IPriceLine | null>(null);
  const prevLastTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight || 320,
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
        barSpacing: bucketSec <= 1 ? 7 : bucketSec <= 5 ? 9 : 12,
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
    const continuitySeries = chart.addLineSeries({
      color: bucketSec <= 1 ? "rgba(34, 211, 238, 0.72)" : "rgba(34, 211, 238, 0.42)",
      lineWidth: bucketSec <= 2 ? 2 : 1,
      lineStyle: LineStyle.Solid,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    series.priceScale().applyOptions({
      scaleMargins: { top: 0.08, bottom: 0.12 },
    });
    chartRef.current = chart;
    seriesRef.current = series;
    continuitySeriesRef.current = continuitySeries;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({
          width: Math.max(1, Math.floor(entry.contentRect.width)),
          height: Math.max(120, Math.floor(entry.contentRect.height)),
        });
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      continuitySeriesRef.current = null;
      bidLineRef.current = null;
      askLineRef.current = null;
      prevLastTimeRef.current = null;
    };
  }, [bucketSec]);

  useEffect(() => {
    const series = seriesRef.current;
    const continuitySeries = continuitySeriesRef.current;
    const chart = chartRef.current;
    if (!series || !continuitySeries || !chart) return;
    chart.applyOptions({
      timeScale: {
        barSpacing: bucketSec <= 1 ? 7 : bucketSec <= 5 ? 9 : 12,
      },
    });
    continuitySeries.applyOptions({
      color: bucketSec <= 1 ? "rgba(34, 211, 238, 0.72)" : "rgba(34, 211, 238, 0.42)",
      lineWidth: bucketSec <= 2 ? 2 : 1,
    });
    series.setData(candles);
    continuitySeries.setData(continuityLine);
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
  }, [candles, continuityLine, bucketSec]);

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

  return <div ref={containerRef} className="w-full h-full" />;
}

export function PriceChartPanel() {
  const { data: state } = useSternState();
  const [bucketSec, setBucketSec] = useState<BucketSec>(1);
  const mids = state?.mid_history ?? [];
  const fills = state?.fills ?? [];

  const candles = useMemo(() => aggregateCandles(mids, bucketSec), [mids, bucketSec]);
  const continuityLine = useMemo<LineData<UTCTimestamp>[]>(
    () =>
      candles.map((candle) => ({
        time: candle.time,
        value: candle.close,
      })),
    [candles],
  );
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
    <TabShell
      title="Price Action"
      subtitle="OHLC candles · MM quote overlay · fill markers"
    >
      <Panel className="flex-1" bodyClassName="flex flex-col">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-3 flex-shrink-0">
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
        <div className="flex-1 min-h-0">
          {candles.length < 2 ? (
            <div className="h-full flex items-center justify-center text-sm text-neutral-500">
              Warming up mid history…
            </div>
          ) : (
            <CandleChart
              candles={candles}
              continuityLine={continuityLine}
              bucketSec={bucketSec}
              bidPrice={state?.quote?.bid_price ?? null}
              askPrice={state?.quote?.ask_price ?? null}
              markers={markers}
            />
          )}
        </div>
        <div className="mt-2 flex items-center gap-x-6 gap-y-1 text-[11px] font-mono text-neutral-400 flex-wrap flex-shrink-0">
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
    </TabShell>
  );
}

// ============================================================================
// Portfolio — position / PnL / fills
// ============================================================================

function FillsTable({ fills }: { fills: SimFill[] }) {
  const slice = fills.slice(0, 80);
  const maxSize = useMemo(() => {
    let m = 1e-9;
    for (const f of slice) if (f.size > m) m = f.size;
    return m;
  }, [slice]);

  return (
    <table className="w-full text-[11px] font-mono">
      <thead className="sticky top-0 bg-[#050510]/95 backdrop-blur-sm z-10">
        <tr className="text-[9px] uppercase tracking-wider text-neutral-500 border-b border-white/[0.06]">
          <th className="text-left font-normal px-2 py-1.5">Time</th>
          <th className="text-left font-normal">Side</th>
          <th className="text-right font-normal">Price</th>
          <th className="text-right font-normal">Size</th>
          <th className="text-right font-normal px-2">Notional</th>
          <th className="text-left font-normal pr-2">Reason</th>
        </tr>
      </thead>
      <tbody>
        {slice.map((fill, idx) => {
          const sizeRatio = Math.min(1, fill.size / maxSize);
          const isBuy = fill.side === "buy";
          const notional = fill.price * fill.size;
          return (
            <tr
              key={`${fill.ts}-${idx}`}
              className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
            >
              <td className="text-neutral-500 px-2 py-1 tabular-nums">
                {formatClockTime(fill.ts)}
              </td>
              <td>
                <span
                  className={`inline-flex items-center px-1.5 py-[1px] rounded-sm text-[9px] font-semibold border ${
                    isBuy
                      ? "text-emerald-300 border-emerald-400/25 bg-emerald-500/5"
                      : "text-rose-300 border-rose-400/25 bg-rose-500/5"
                  }`}
                >
                  {isBuy ? "BUY" : "SELL"}
                </span>
              </td>
              <td className="text-right tabular-nums text-neutral-200">
                {formatNumber(fill.price, 2)}
              </td>
              <td className="text-right tabular-nums text-neutral-200 relative">
                <div
                  className="absolute inset-y-[3px] right-1 rounded-sm opacity-25 pointer-events-none"
                  style={{
                    width: `${sizeRatio * 42}%`,
                    background: isBuy
                      ? "rgba(34, 197, 94, 0.6)"
                      : "rgba(239, 68, 68, 0.6)",
                  }}
                />
                <span className="relative">{fill.size.toFixed(4)}</span>
              </td>
              <td className="text-right px-2 tabular-nums text-neutral-200">
                {formatUsd(notional, 2)}
              </td>
              <td className="text-neutral-500 pr-2 truncate max-w-[140px]">
                {fill.reason}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PortfolioKpiTile({
  label,
  value,
  accent,
  hint,
  gauge,
}: {
  label: string;
  value: string;
  accent?: "positive" | "negative" | "neutral";
  hint?: string;
  gauge?: { pct: number; tone: "good" | "warn" | "bad" };
}) {
  const color =
    accent === "positive"
      ? "text-emerald-300"
      : accent === "negative"
        ? "text-rose-300"
        : "text-neutral-100";
  return (
    <div className="glass-panel p-2 flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] uppercase tracking-wider text-neutral-500 truncate">
        {label}
      </span>
      <span
        className={`text-base font-mono font-semibold tabular-nums ${color} truncate`}
      >
        {value}
      </span>
      {hint && (
        <span className="text-[10px] text-neutral-500 truncate">{hint}</span>
      )}
      {gauge && (
        <div className="h-1 rounded-sm overflow-hidden bg-white/[0.04] mt-0.5">
          <div
            className={`h-full ${
              gauge.tone === "bad"
                ? "bg-rose-500/70"
                : gauge.tone === "warn"
                  ? "bg-amber-500/70"
                  : "bg-emerald-500/60"
            }`}
            style={{
              width: `${Math.min(100, Math.max(0, gauge.pct * 100))}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}

function PositionCard({
  portfolio,
  mid,
}: {
  portfolio: PortfolioSnapshot | undefined;
  mid: number | null;
}) {
  const pos = portfolio?.position_btc ?? 0;
  const side: "long" | "short" | "flat" =
    pos > 1e-8 ? "long" : pos < -1e-8 ? "short" : "flat";
  const sideColor =
    side === "long"
      ? "text-emerald-300"
      : side === "short"
        ? "text-rose-300"
        : "text-neutral-400";
  const sideBg =
    side === "long"
      ? "bg-emerald-500/10 border-emerald-400/25"
      : side === "short"
        ? "bg-rose-500/10 border-rose-400/25"
        : "bg-white/[0.02] border-white/[0.04]";

  const hasPosition = portfolio != null && side !== "flat";
  const markToMarket =
    hasPosition && mid != null
      ? (mid - portfolio.avg_entry_price) * portfolio.position_btc
      : null;
  const distPct =
    hasPosition && mid != null && portfolio.avg_entry_price > 0
      ? ((mid - portfolio.avg_entry_price) / portfolio.avg_entry_price) * 100
      : null;

  return (
    <div className="h-full grid grid-cols-3 gap-3 items-center">
      <div
        className={`h-full rounded-md border ${sideBg} px-2.5 py-1.5 flex flex-col justify-center min-w-0`}
      >
        <span
          className={`text-[10px] font-semibold tracking-[0.14em] uppercase ${sideColor}`}
        >
          {side}
        </span>
        <span className="text-lg font-mono font-semibold tabular-nums text-neutral-100 truncate">
          {formatBtc(Math.abs(pos), 4)}
        </span>
        <span className="text-[10px] text-neutral-500 truncate">
          {formatUsd(portfolio?.exposure_usd, 0)} exposure
        </span>
      </div>
      <div className="flex flex-col gap-1 text-[11px] font-mono min-w-0">
        <div className="flex justify-between items-baseline gap-2">
          <span className="text-neutral-500 text-[10px] uppercase tracking-wider">
            Avg entry
          </span>
          <span className="tabular-nums text-neutral-200 truncate">
            {formatUsd(portfolio?.avg_entry_price, 2)}
          </span>
        </div>
        <div className="flex justify-between items-baseline gap-2">
          <span className="text-neutral-500 text-[10px] uppercase tracking-wider">
            Mid
          </span>
          <span className="tabular-nums text-neutral-200 truncate">
            {formatUsd(mid, 2)}
          </span>
        </div>
        <div className="flex justify-between items-baseline gap-2">
          <span className="text-neutral-500 text-[10px] uppercase tracking-wider">
            Drift
          </span>
          <span
            className={`tabular-nums truncate ${
              distPct == null
                ? "text-neutral-600"
                : distPct >= 0
                  ? "text-emerald-300"
                  : "text-rose-300"
            }`}
          >
            {distPct == null
              ? "—"
              : `${distPct >= 0 ? "+" : ""}${distPct.toFixed(2)}%`}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1 text-[11px] font-mono min-w-0">
        <div className="flex justify-between items-baseline gap-2">
          <span className="text-neutral-500 text-[10px] uppercase tracking-wider">
            Cash
          </span>
          <span className="tabular-nums text-neutral-200 truncate">
            {formatUsd(portfolio?.cash, 0)}
          </span>
        </div>
        <div className="flex justify-between items-baseline gap-2">
          <span className="text-neutral-500 text-[10px] uppercase tracking-wider">
            MTM
          </span>
          <span
            className={`tabular-nums truncate ${
              markToMarket == null
                ? "text-neutral-600"
                : markToMarket >= 0
                  ? "text-emerald-300"
                  : "text-rose-300"
            }`}
          >
            {markToMarket == null ? "—" : formatUsd(markToMarket, 2)}
          </span>
        </div>
        <div className="flex justify-between items-baseline gap-2">
          <span className="text-neutral-500 text-[10px] uppercase tracking-wider">
            Unrealized
          </span>
          <span
            className={`tabular-nums truncate ${
              !portfolio
                ? "text-neutral-600"
                : portfolio.unrealized_pnl >= 0
                  ? "text-emerald-300"
                  : "text-rose-300"
            }`}
          >
            {formatUsd(portfolio?.unrealized_pnl ?? 0, 2)}
          </span>
        </div>
      </div>
    </div>
  );
}

function FillFlowStats({ fills }: { fills: SimFill[] }) {
  const stats = useMemo(() => {
    let buyCount = 0;
    let sellCount = 0;
    let buyVol = 0;
    let sellVol = 0;
    let buyNotional = 0;
    let sellNotional = 0;
    for (const f of fills) {
      const notional = f.price * f.size;
      if (f.side === "buy") {
        buyCount += 1;
        buyVol += f.size;
        buyNotional += notional;
      } else {
        sellCount += 1;
        sellVol += f.size;
        sellNotional += notional;
      }
    }
    const totalVol = buyVol + sellVol;
    const buyPct = totalVol > 0 ? buyVol / totalVol : 0.5;
    const avgSize = fills.length > 0 ? totalVol / fills.length : 0;
    const vwapBuy = buyVol > 0 ? buyNotional / buyVol : null;
    const vwapSell = sellVol > 0 ? sellNotional / sellVol : null;
    return {
      buyCount,
      sellCount,
      buyVol,
      sellVol,
      buyNotional,
      sellNotional,
      totalVol,
      buyPct,
      avgSize,
      count: fills.length,
      vwapBuy,
      vwapSell,
    };
  }, [fills]);

  return (
    <div className="h-full grid grid-cols-2 gap-3 min-h-0 overflow-hidden">
      <div className="flex flex-col justify-center gap-1.5 min-w-0 min-h-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-neutral-500">
            Fills
          </span>
          <span className="text-sm font-mono font-semibold tabular-nums text-neutral-100">
            {stats.count}
          </span>
        </div>
        <div className="flex items-center justify-between text-[10px] font-mono">
          <span className="text-emerald-300 tabular-nums">
            BUY {stats.buyCount}
          </span>
          <span className="text-rose-300 tabular-nums">
            SELL {stats.sellCount}
          </span>
        </div>
        <div className="relative h-2 rounded-sm overflow-hidden bg-white/[0.02] border border-white/[0.04]">
          <div
            className="absolute inset-y-0 left-0 bg-emerald-500/60"
            style={{ width: `${stats.buyPct * 100}%` }}
          />
          <div
            className="absolute inset-y-0 right-0 bg-rose-500/60"
            style={{ width: `${(1 - stats.buyPct) * 100}%` }}
          />
        </div>
      </div>
      <div className="flex flex-col gap-0.5 text-[11px] font-mono justify-center min-w-0 min-h-0">
        <div className="flex justify-between items-baseline gap-2">
          <span className="text-neutral-500 text-[10px] uppercase tracking-wider">
            Volume
          </span>
          <span className="tabular-nums text-neutral-200 truncate">
            {formatBtc(stats.totalVol, 4)}
          </span>
        </div>
        <div className="flex justify-between items-baseline gap-2">
          <span className="text-neutral-500 text-[10px] uppercase tracking-wider">
            Avg size
          </span>
          <span className="tabular-nums text-neutral-200 truncate">
            {formatBtc(stats.avgSize, 4)}
          </span>
        </div>
        <div className="flex justify-between items-baseline gap-2">
          <span className="text-neutral-500 text-[10px] uppercase tracking-wider">
            VWAP buy
          </span>
          <span className="tabular-nums text-emerald-300/90 truncate">
            {stats.vwapBuy != null ? formatUsd(stats.vwapBuy, 2) : "—"}
          </span>
        </div>
        <div className="flex justify-between items-baseline gap-2">
          <span className="text-neutral-500 text-[10px] uppercase tracking-wider">
            VWAP sell
          </span>
          <span className="tabular-nums text-rose-300/90 truncate">
            {stats.vwapSell != null ? formatUsd(stats.vwapSell, 2) : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

export function PortfolioPanel() {
  const { data: state } = useSternState();
  const portfolio = state?.portfolio;
  const bt = state?.backtest_lite;
  const cfg = state?.strategy.config;
  const totalPnl = portfolio
    ? portfolio.realized_pnl + portfolio.unrealized_pnl
    : 0;

  const startingEquity =
    bt && bt.equity_curve.length > 0 ? bt.equity_curve[0] : portfolio?.cash ?? 0;
  const currentEquity = portfolio?.equity ?? startingEquity;
  const returnPct =
    startingEquity > 0
      ? ((currentEquity - startingEquity) / startingEquity) * 100
      : 0;

  const exposurePct = cfg?.max_notional_exposure
    ? Math.min(1, (portfolio?.exposure_usd ?? 0) / cfg.max_notional_exposure)
    : 0;
  const drawdownPct = cfg?.max_loss
    ? Math.min(1, (portfolio?.drawdown ?? 0) / cfg.max_loss)
    : 0;

  const exposureTone: "good" | "warn" | "bad" =
    exposurePct > 0.8 ? "bad" : exposurePct > 0.5 ? "warn" : "good";
  const drawdownTone: "good" | "warn" | "bad" =
    drawdownPct > 0.8 ? "bad" : drawdownPct > 0.5 ? "warn" : "good";

  return (
    <TabShell
      title="Portfolio"
      subtitle="Paper MM session — position, PnL, equity curve and fills"
    >
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 flex-shrink-0">
        <PortfolioKpiTile
          label="Total PnL"
          value={formatUsd(totalPnl, 2)}
          accent={sign(totalPnl)}
          hint={`r ${formatUsd(portfolio?.realized_pnl ?? 0, 0)} · u ${formatUsd(portfolio?.unrealized_pnl ?? 0, 0)}`}
        />
        <PortfolioKpiTile
          label="Return"
          value={formatPct(returnPct, 3)}
          accent={sign(returnPct)}
          hint={bt?.status === "ready" ? "live paper" : "warming up"}
        />
        <PortfolioKpiTile
          label="Equity"
          value={formatUsd(currentEquity, 0)}
          hint={`peak ${formatUsd(bt?.peak_equity_usd ?? currentEquity, 0)}`}
        />
        <PortfolioKpiTile
          label="Position"
          value={formatBtc(portfolio?.position_btc ?? 0, 4)}
          accent={portfolio ? sign(portfolio.position_btc) : "neutral"}
          hint={
            !portfolio || portfolio.position_btc === 0
              ? "flat"
              : portfolio.position_btc > 0
                ? "long"
                : "short"
          }
        />
        <PortfolioKpiTile
          label="Exposure"
          value={formatUsd(portfolio?.exposure_usd, 0)}
          hint={cfg ? `cap ${formatUsd(cfg.max_notional_exposure, 0)}` : undefined}
          gauge={{ pct: exposurePct, tone: exposureTone }}
        />
        <PortfolioKpiTile
          label="Drawdown"
          value={formatUsd(portfolio?.drawdown, 0)}
          accent={
            portfolio && portfolio.drawdown > 0 ? "negative" : "neutral"
          }
          hint={cfg ? `cap ${formatUsd(cfg.max_loss, 0)}` : undefined}
          gauge={{ pct: drawdownPct, tone: drawdownTone }}
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 flex-1 min-h-0">
        <div className="lg:col-span-9 flex flex-col gap-2 min-h-0">
          <div className="flex-1 min-h-0 flex">
            <EquityCurveHero
              equityCurve={bt?.equity_curve ?? []}
              peakEquity={bt?.peak_equity_usd ?? currentEquity}
              currentEquity={currentEquity}
              returnPct={returnPct}
              drawdownUsd={portfolio?.drawdown ?? 0}
            />
          </div>
          <Panel
            title="Position"
            subtitle="Inventory, avg entry and mark-to-market drift"
            className="flex-shrink-0 h-[148px] overflow-hidden"
            bodyClassName="overflow-hidden"
          >
            <PositionCard
              portfolio={portfolio}
              mid={state?.mid_price ?? null}
            />
          </Panel>
        </div>
        <div className="lg:col-span-3 flex flex-col gap-2 min-h-0">
          <Panel
            title="Session flow"
            subtitle="Buy / sell split, avg fill size, VWAP"
            className="flex-shrink-0 h-[148px] overflow-hidden"
            bodyClassName="overflow-hidden"
          >
            <FillFlowStats fills={state?.fills ?? []} />
          </Panel>
          <Panel
            title="Simulated fills"
            subtitle={`${state?.fills.length ?? 0} paper executions · newest first`}
            className="flex-1 min-h-0"
          >
            <div className="glass-scroll h-full overflow-auto">
              <FillsTable fills={state?.fills ?? []} />
            </div>
          </Panel>
        </div>
      </div>
    </TabShell>
  );
}

// ============================================================================
// Microstructure — realized vol / momentum / imbalance / micro-bias
// ============================================================================

type MicroKpiKind = "vol" | "momentum" | "bias" | "depth" | "flow";

function classifyVol(bps: number | undefined): string {
  if (bps == null) return "—";
  if (bps < 5) return "calm";
  if (bps < 15) return "normal";
  if (bps < 30) return "active";
  return "stressed";
}

function classifyMagnitude(
  value: number | undefined,
  thresholds: [number, number],
  labels: [string, string, string],
): string {
  if (value == null) return "—";
  const abs = Math.abs(value);
  if (abs < thresholds[0]) return labels[0];
  if (abs < thresholds[1]) return labels[1];
  return labels[2];
}

function MicroKpiTile({
  id,
  label,
  value,
  accent,
  hint,
  selected,
  onSelect,
}: {
  id: MicroKpiKind;
  label: string;
  value: string;
  accent?: "positive" | "negative" | "neutral";
  hint: string;
  selected: boolean;
  onSelect: (id: MicroKpiKind) => void;
}) {
  const color =
    accent === "positive"
      ? "text-emerald-300"
      : accent === "negative"
        ? "text-rose-300"
        : "text-neutral-100";
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={selected}
      className={`glass-panel p-2 text-left transition-colors border ${
        selected
          ? "border-cyan-400/40 bg-white/[0.02]"
          : "border-transparent hover:border-neutral-400/25"
      } focus:outline-none focus:border-cyan-400/40 flex flex-col gap-0.5 min-w-0`}
    >
      <span className="text-[10px] uppercase tracking-wider text-neutral-500 truncate">
        {label}
      </span>
      <span className={`text-base font-mono font-semibold tabular-nums ${color} truncate`}>
        {value}
      </span>
      <span className="text-[10px] text-neutral-500 truncate">{hint}</span>
    </button>
  );
}

function RegimePill({ state }: { state: SpreadRegime["state"] }) {
  const styles: Record<SpreadRegime["state"], string> = {
    tight: "bg-emerald-500/10 text-emerald-300 border-emerald-400/30",
    wide: "bg-rose-500/10 text-rose-300 border-rose-400/30",
    balanced: "bg-neutral-500/10 text-neutral-200 border-neutral-400/25",
    warming: "bg-amber-500/10 text-amber-300 border-amber-400/30",
  };
  return (
    <span
      className={`inline-flex items-center px-1.5 py-[1px] rounded-sm border text-[10px] font-mono ${styles[state]}`}
    >
      {state}
    </span>
  );
}

function BookPressureWidget({
  bids,
  asks,
  imbalance,
}: {
  bids: BookLevel[];
  asks: BookLevel[];
  imbalance: number;
}) {
  const bidSlice = bids.slice(0, 5);
  const askSlice = asks.slice(0, 5);
  const bidTotal = bidSlice.reduce((s, l) => s + l.size, 0);
  const askTotal = askSlice.reduce((s, l) => s + l.size, 0);
  const denom = Math.max(bidTotal + askTotal, 1e-9);
  const bidPct = (bidTotal / denom) * 100;
  const askPct = (askTotal / denom) * 100;
  const pressure = imbalance > 0.05 ? "bid pressure" : imbalance < -0.05 ? "ask pressure" : "balanced";
  const pressureColor =
    imbalance > 0.05 ? "text-emerald-300" : imbalance < -0.05 ? "text-rose-300" : "text-neutral-300";

  return (
    <div className="h-full flex flex-col justify-between gap-2 min-h-0">
      <div className="flex items-baseline justify-between gap-2 flex-shrink-0">
        <span className={`text-xs font-mono ${pressureColor}`}>{pressure}</span>
        <span className="text-[10px] font-mono text-neutral-500 tabular-nums">
          imb {formatPct(imbalance * 100, 2)}
        </span>
      </div>
      <div className="flex-1 min-h-0 flex flex-col justify-center gap-3">
        <div>
          <div className="flex items-center justify-between text-[10px] font-mono text-neutral-500 mb-1">
            <span className="text-emerald-300">bids</span>
            <span className="tabular-nums">{bidTotal.toFixed(4)} BTC</span>
          </div>
          <div className="relative h-3 rounded-sm overflow-hidden bg-white/[0.02] border border-white/[0.04]">
            <div
              className="absolute inset-y-0 left-0 bg-emerald-500/60"
              style={{ width: `${bidPct}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-[10px] font-mono text-neutral-500 mb-1">
            <span className="text-rose-300">asks</span>
            <span className="tabular-nums">{askTotal.toFixed(4)} BTC</span>
          </div>
          <div className="relative h-3 rounded-sm overflow-hidden bg-white/[0.02] border border-white/[0.04]">
            <div
              className="absolute inset-y-0 left-0 bg-rose-500/60"
              style={{ width: `${askPct}%` }}
            />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-5 gap-1 flex-shrink-0 text-[9px] font-mono text-neutral-500">
        {Array.from({ length: 5 }).map((_, i) => {
          const bid = bidSlice[i];
          const ask = askSlice[i];
          return (
            <div key={i} className="flex flex-col items-center gap-0.5">
              <span className="text-emerald-300/80 tabular-nums">
                {bid ? bid.size.toFixed(2) : "—"}
              </span>
              <span className="text-neutral-600">L{i + 1}</span>
              <span className="text-rose-300/80 tabular-nums">
                {ask ? ask.size.toFixed(2) : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function useCvdSeries(trades: PublicTrade[], maxPoints = 90): number[] {
  const [series, setSeries] = useState<number[]>([]);
  const lastKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (trades.length === 0) return;
    const keyOf = (t: PublicTrade) => `${t.trade_id ?? ""}-${t.ts}-${t.price}`;
    const newestKey = keyOf(trades[0]);
    if (newestKey === lastKeyRef.current) return;
    let cutoff = trades.length;
    if (lastKeyRef.current) {
      const idx = trades.findIndex((t) => keyOf(t) === lastKeyRef.current);
      if (idx >= 0) cutoff = idx;
    }
    const deltas = trades
      .slice(0, cutoff)
      .reverse()
      .map((t) => (t.side === "buy" ? t.size : -t.size));
    if (deltas.length === 0) {
      lastKeyRef.current = newestKey;
      return;
    }
    setSeries((prev) => {
      let last = prev.length > 0 ? prev[prev.length - 1] : 0;
      const next = prev.slice();
      for (const d of deltas) {
        last += d;
        next.push(last);
      }
      return next.slice(-maxPoints);
    });
    lastKeyRef.current = newestKey;
  }, [trades, maxPoints]);
  return series;
}

function CvdChart({ series }: { series: number[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 300, h: 120 });
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setSize({
          w: Math.max(40, Math.floor(e.contentRect.width)),
          h: Math.max(40, Math.floor(e.contentRect.height)),
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (series.length < 2) {
    return (
      <div
        ref={containerRef}
        className="h-full flex items-center justify-center text-[11px] text-neutral-600"
      >
        warming up flow…
      </div>
    );
  }

  const W = size.w;
  const H = size.h;
  const PAD = 4;
  let min = series[0];
  let max = series[0];
  for (const v of series) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const absMax = Math.max(Math.abs(min), Math.abs(max), 1e-9);
  const lo = -absMax;
  const hi = absMax;
  const span = hi - lo;
  const n = series.length;
  const x = (i: number) => PAD + (i / Math.max(1, n - 1)) * (W - 2 * PAD);
  const y = (v: number) => PAD + (1 - (v - lo) / span) * (H - 2 * PAD);
  const yZero = y(0);

  let linePath = "";
  let areaPath = "";
  for (let i = 0; i < n; i++) {
    const px = x(i);
    const py = y(series[i]);
    linePath += `${i === 0 ? "M" : "L"} ${px.toFixed(1)} ${py.toFixed(1)} `;
    if (i === 0) areaPath = `M ${px.toFixed(1)} ${yZero.toFixed(1)} L ${px.toFixed(1)} ${py.toFixed(1)} `;
    else areaPath += `L ${px.toFixed(1)} ${py.toFixed(1)} `;
  }
  areaPath += `L ${x(n - 1).toFixed(1)} ${yZero.toFixed(1)} Z`;

  const last = series[n - 1];
  const positive = last >= 0;
  const stroke = positive ? "#22c55e" : "#ef4444";
  const fill = positive ? "rgba(34, 197, 94, 0.14)" : "rgba(239, 68, 68, 0.14)";

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.max(0, Math.min(n - 1, Math.round(((rel - PAD) / (W - 2 * PAD)) * (n - 1))));
    setHoverIdx(idx);
  };

  return (
    <div ref={containerRef} className="relative h-full min-h-0">
      <svg
        width={W}
        height={H}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
        className="select-none cursor-crosshair block"
      >
        <line
          x1={PAD}
          x2={W - PAD}
          y1={yZero}
          y2={yZero}
          stroke="rgba(148, 163, 184, 0.35)"
          strokeDasharray="2 3"
        />
        <path d={areaPath} fill={fill} />
        <path
          d={linePath}
          fill="none"
          stroke={stroke}
          strokeWidth="1.25"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={x(n - 1)} cy={y(last)} r="2" fill={stroke} />
        {hoverIdx != null && (
          <>
            <line
              x1={x(hoverIdx)}
              x2={x(hoverIdx)}
              y1={PAD}
              y2={H - PAD}
              stroke="rgba(255,255,255,0.35)"
            />
            <circle cx={x(hoverIdx)} cy={y(series[hoverIdx])} r="2.25" fill="#f8fafc" />
          </>
        )}
      </svg>
      {hoverIdx != null && (
        <div
          className="absolute text-[10px] font-mono pointer-events-none px-1.5 py-0.5 rounded bg-neutral-900/95 border border-neutral-500/30 text-neutral-100"
          style={{ left: Math.min(W - 90, Math.max(2, x(hoverIdx) + 6)), top: 2 }}
        >
          <span className="tabular-nums">Σ {series[hoverIdx].toFixed(4)} BTC</span>
        </div>
      )}
    </div>
  );
}

function SpreadRegimesGrid({
  regimes,
  history,
}: {
  regimes: SpreadRegime[];
  history: Record<string, number[]>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  if (regimes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[11px] text-neutral-600">
        warming up regimes…
      </div>
    );
  }
  return (
    <div className="h-full min-h-0 flex flex-col gap-1">
      {regimes.map((regime) => {
        const active = selected === regime.depth;
        const series = history[regime.depth] ?? [];
        const delta =
          regime.last != null && regime.avg != null ? regime.last - regime.avg : null;
        return (
          <button
            type="button"
            key={regime.depth}
            onClick={() => setSelected(active ? null : regime.depth)}
            aria-expanded={active}
            className={`glass-panel p-1.5 text-left transition-colors border ${
              active
                ? "border-cyan-400/40 bg-white/[0.02]"
                : "border-transparent hover:border-neutral-400/25"
            } focus:outline-none focus:border-cyan-400/40 ${active ? "flex-1 min-h-0" : "flex-shrink-0"}`}
          >
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <span className="text-neutral-400 w-10">{regime.depth}</span>
              <RegimePill state={regime.state} />
              <span className="ml-auto text-neutral-300 tabular-nums">
                {formatUsd(regime.last, 2)}
              </span>
              <span
                className={`tabular-nums w-14 text-right ${
                  delta == null
                    ? "text-neutral-600"
                    : delta > 0
                      ? "text-rose-300"
                      : "text-emerald-300"
                }`}
              >
                {delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(2)}`}
              </span>
              <ChevronIcon expanded={active} />
            </div>
            {active && (
              <div className="mt-1.5 h-full min-h-0 flex flex-col gap-1">
                <div className="flex-1 min-h-0">
                  <Sparkline
                    values={series}
                    width={320}
                    height={Math.max(40, Math.min(96, series.length > 8 ? 72 : 48))}
                    stroke="#2ce3ff"
                    fill="rgba(44, 227, 255, 0.12)"
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono text-neutral-500 flex-shrink-0">
                  <span>avg {formatUsd(regime.avg, 2)}</span>
                  <span>{series.length} samples</span>
                </div>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function PresetCards({
  presets,
  currentSpread,
  currentSkew,
}: {
  presets: QuantLabSnapshot["research_presets"];
  currentSpread: number;
  currentSkew: number;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  if (presets.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[11px] text-neutral-600">
        no presets
      </div>
    );
  }
  return (
    <div className="h-full min-h-0 grid gap-1.5" style={{ gridTemplateRows: `repeat(${presets.length}, minmax(0, 1fr))` }}>
      {presets.map((preset) => {
        const active = selected === preset.name;
        const dSpread = preset.spread_bps - currentSpread;
        const dSkew = preset.skew_bps_per_btc - currentSkew;
        return (
          <button
            key={preset.name}
            type="button"
            onClick={() => setSelected(active ? null : preset.name)}
            aria-pressed={active}
            className={`glass-panel p-2 text-left border transition-colors ${
              active
                ? "border-cyan-400/40 bg-white/[0.02]"
                : "border-transparent hover:border-neutral-400/25"
            } focus:outline-none focus:border-cyan-400/40 flex flex-col justify-center min-h-0`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-neutral-100 truncate">
                {preset.name}
              </span>
              <span className="text-[10px] font-mono text-neutral-400 tabular-nums flex-shrink-0">
                {preset.spread_bps.toFixed(1)} · {preset.skew_bps_per_btc.toFixed(1)}
              </span>
            </div>
            <div className="text-[10px] text-neutral-500 truncate">{preset.stance}</div>
            <div className="mt-0.5 flex gap-2 text-[10px] font-mono">
              <span
                className={`tabular-nums ${
                  dSpread > 0 ? "text-rose-300" : dSpread < 0 ? "text-emerald-300" : "text-neutral-500"
                }`}
              >
                Δspread {dSpread > 0 ? "+" : ""}{dSpread.toFixed(1)}
              </span>
              <span
                className={`tabular-nums ${
                  Math.abs(dSkew) < 1e-6 ? "text-neutral-500" : "text-neutral-300"
                }`}
              >
                Δskew {dSkew > 0 ? "+" : ""}{dSkew.toFixed(1)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function MicrostructurePanel() {
  const { data: state } = useSternState();
  const q = state?.quant_lab;
  const cfg = state?.strategy.config;
  const [focus, setFocus] = useState<MicroKpiKind | null>(null);
  const cvd = useCvdSeries(state?.recent_trades ?? []);

  const volHint = classifyVol(q?.realized_vol_bps);
  const momentumHint = classifyMagnitude(
    q?.momentum_bps,
    [5, 15],
    ["drift", "trending", "breakout"],
  );
  const biasHint = classifyMagnitude(
    q?.micro_bias_bps,
    [1, 3],
    ["neutral", "leaning", "skewed"],
  );
  const depthHint = classifyMagnitude(
    q ? q.top5_depth_imbalance * 100 : undefined,
    [5, 15],
    ["balanced", "tilted", "one-sided"],
  );
  const flowHint = classifyMagnitude(
    q?.trade_flow_imbalance_btc,
    [0.05, 0.2],
    ["even", "active", "aggressive"],
  );

  const focusCopy: Record<MicroKpiKind, string> = {
    vol: "Realized vol annualized in bps — higher means wider effective spreads help absorb tape noise.",
    momentum: "Rolling mid return in bps — positive suggests buy-side pressure; negative, sell-side.",
    bias: "Micro-price bias in bps vs mid — leans toward the heavier side of top-of-book.",
    depth: "Top-5 depth imbalance — positive means more size on bids than asks.",
    flow: "Buyer minus seller volume over the window — captures aggressive lift/hit intent.",
  };

  return (
    <TabShell
      title="Microstructure"
      subtitle="Real-time vol, momentum, depth imbalance and micro-bias"
      toolbar={
        <div className="flex items-center gap-2 text-[10px] font-mono text-neutral-500">
          <span>
            readiness{" "}
            <span
              className={
                q?.readiness === "ready" ? "text-emerald-300" : "text-amber-300"
              }
            >
              {q?.readiness ?? "—"}
            </span>
          </span>
          <span className="text-neutral-600">·</span>
          <span>window {q?.window_points ?? 0}</span>
        </div>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 flex-shrink-0">
        <MicroKpiTile
          id="vol"
          label="Realized vol"
          value={formatBps(q?.realized_vol_bps)}
          hint={volHint}
          selected={focus === "vol"}
          onSelect={(id) => setFocus(focus === id ? null : id)}
        />
        <MicroKpiTile
          id="momentum"
          label="Momentum"
          value={formatBps(q?.momentum_bps)}
          accent={q ? sign(q.momentum_bps) : "neutral"}
          hint={momentumHint}
          selected={focus === "momentum"}
          onSelect={(id) => setFocus(focus === id ? null : id)}
        />
        <MicroKpiTile
          id="bias"
          label="Micro bias"
          value={formatBps(q?.micro_bias_bps)}
          accent={q ? sign(q.micro_bias_bps) : "neutral"}
          hint={biasHint}
          selected={focus === "bias"}
          onSelect={(id) => setFocus(focus === id ? null : id)}
        />
        <MicroKpiTile
          id="depth"
          label="Depth imb."
          value={formatPct((q?.top5_depth_imbalance ?? 0) * 100, 2)}
          accent={q ? sign(q.top5_depth_imbalance) : "neutral"}
          hint={depthHint}
          selected={focus === "depth"}
          onSelect={(id) => setFocus(focus === id ? null : id)}
        />
        <MicroKpiTile
          id="flow"
          label="Flow imb."
          value={formatBtc(q?.trade_flow_imbalance_btc ?? 0, 3)}
          accent={q ? sign(q.trade_flow_imbalance_btc) : "neutral"}
          hint={flowHint}
          selected={focus === "flow"}
          onSelect={(id) => setFocus(focus === id ? null : id)}
        />
      </div>
      {focus && (
        <div className="glass-panel px-2 py-1 text-[11px] text-neutral-300 flex items-center gap-2 flex-shrink-0">
          <span className="text-cyan-300 uppercase tracking-wider text-[9px]">
            {focus}
          </span>
          <span className="truncate">{focusCopy[focus]}</span>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 grid-rows-2 gap-2 flex-1 min-h-0">
        <Panel title="Book pressure" subtitle="Top-5 cumulative depth">
          <BookPressureWidget
            bids={state?.book.bids ?? []}
            asks={state?.book.asks ?? []}
            imbalance={q?.top5_depth_imbalance ?? 0}
          />
        </Panel>
        <Panel
          title="Spread regimes"
          subtitle="Click a depth to see its history vs session avg"
        >
          <SpreadRegimesGrid
            regimes={q?.spread_regimes ?? []}
            history={state?.spread_history ?? {}}
          />
        </Panel>
        <Panel title="Order flow CVD" subtitle="Cumulative buyer − seller volume">
          <CvdChart series={cvd} />
        </Panel>
        <Panel title="Research presets" subtitle="Δ vs current MM config">
          <PresetCards
            presets={q?.research_presets ?? []}
            currentSpread={cfg?.base_quote_spread_bps ?? 0}
            currentSkew={cfg?.position_skew_bps_per_btc ?? 0}
          />
        </Panel>
      </div>
    </TabShell>
  );
}

// ============================================================================
// Risk (ib-account tab) and System (vm-status tab)
// ============================================================================

type RiskTone = "good" | "warn" | "bad" | "neutral";

function toneClasses(tone: RiskTone): { text: string; stroke: string; bg: string; border: string; ring: string } {
  switch (tone) {
    case "bad":
      return {
        text: "text-rose-300",
        stroke: "#f43f5e",
        bg: "bg-rose-500/10",
        border: "border-rose-400/30",
        ring: "ring-rose-400/30",
      };
    case "warn":
      return {
        text: "text-amber-300",
        stroke: "#f59e0b",
        bg: "bg-amber-500/10",
        border: "border-amber-400/30",
        ring: "ring-amber-400/30",
      };
    case "good":
      return {
        text: "text-emerald-300",
        stroke: "#22c55e",
        bg: "bg-emerald-500/10",
        border: "border-emerald-400/30",
        ring: "ring-emerald-400/30",
      };
    default:
      return {
        text: "text-neutral-200",
        stroke: "#64748b",
        bg: "bg-white/[0.02]",
        border: "border-white/[0.05]",
        ring: "ring-white/5",
      };
  }
}

function consumptionTone(pct: number): RiskTone {
  if (pct > 0.8) return "bad";
  if (pct > 0.5) return "warn";
  return "good";
}

function RadialGauge({
  pct,
  tone,
  centerValue,
  centerSub,
}: {
  pct: number;
  tone: RiskTone;
  centerValue: string;
  centerSub: string;
}) {
  const clamped = Math.min(1, Math.max(0, pct));
  const cx = 100;
  const cy = 100;
  const r = 74;
  const endX = cx - r * Math.cos(clamped * Math.PI);
  const endY = cy - r * Math.sin(clamped * Math.PI);
  const bgPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const valPath =
    clamped <= 1e-4
      ? ""
      : `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${endX.toFixed(2)} ${endY.toFixed(2)}`;
  const { stroke, text } = toneClasses(tone);

  return (
    <div className="h-full w-full flex flex-col items-center justify-center min-h-0 min-w-0">
      <svg
        viewBox="0 0 200 118"
        preserveAspectRatio="xMidYMid meet"
        className="w-full max-w-[220px]"
        style={{ maxHeight: "100%" }}
      >
        <path
          d={bgPath}
          fill="none"
          stroke="rgba(148, 163, 184, 0.14)"
          strokeWidth={14}
          strokeLinecap="round"
        />
        {valPath && (
          <path
            d={valPath}
            fill="none"
            stroke={stroke}
            strokeWidth={14}
            strokeLinecap="round"
          />
        )}
        <text
          x={cx}
          y={cy - 14}
          textAnchor="middle"
          fontSize="22"
          fontFamily="ui-monospace, monospace"
          fontWeight="600"
          className={text}
          fill="currentColor"
        >
          {centerValue}
        </text>
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          fontSize="9"
          fontFamily="ui-monospace, monospace"
          fill="#71717a"
          style={{ letterSpacing: "0.14em" }}
        >
          {centerSub}
        </text>
      </svg>
    </div>
  );
}

function LimitGaugeCard({
  title,
  pct,
  currentLabel,
  currentValue,
  capLabel,
  capValue,
  headroomLabel,
}: {
  title: string;
  pct: number;
  currentLabel: string;
  currentValue: string;
  capLabel: string;
  capValue: string;
  headroomLabel: string;
}) {
  const tone = consumptionTone(pct);
  const { text } = toneClasses(tone);
  const pctStr = `${(pct * 100).toFixed(pct >= 0.995 ? 0 : 1)}%`;
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-baseline justify-between gap-2 flex-shrink-0">
        <span className="text-[10px] uppercase tracking-wider text-neutral-500">
          {title}
        </span>
        <span className={`text-[10px] font-mono tabular-nums ${text}`}>
          {headroomLabel}
        </span>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <RadialGauge pct={pct} tone={tone} centerValue={pctStr} centerSub="CONSUMED" />
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono flex-shrink-0 border-t border-white/[0.05] pt-1.5">
        <div className="flex flex-col min-w-0">
          <span className="text-[9px] uppercase tracking-wider text-neutral-500">
            {currentLabel}
          </span>
          <span className="tabular-nums text-neutral-100 truncate">
            {currentValue}
          </span>
        </div>
        <div className="flex flex-col min-w-0 text-right">
          <span className="text-[9px] uppercase tracking-wider text-neutral-500">
            {capLabel}
          </span>
          <span className="tabular-nums text-neutral-400 truncate">
            {capValue}
          </span>
        </div>
      </div>
    </div>
  );
}

function RiskStatusBanner({
  status,
  quoteActive,
  notionalPct,
  lossPct,
}: {
  status: string;
  quoteActive: boolean;
  notionalPct: number;
  lossPct: number;
}) {
  const worstPct = Math.max(notionalPct, lossPct);
  const tone: RiskTone =
    status !== "ok"
      ? "bad"
      : !quoteActive
        ? "warn"
        : worstPct > 0.8
          ? "bad"
          : worstPct > 0.5
            ? "warn"
            : "good";
  const { text, bg, border } = toneClasses(tone);
  const headline =
    status !== "ok"
      ? "Risk tripped"
      : !quoteActive
        ? "Quotes paused"
        : tone === "bad"
          ? "Limits under pressure"
          : tone === "warn"
            ? "Approaching caps"
            : "All limits nominal";
  const detail =
    status !== "ok"
      ? `Risk status: ${status}`
      : !quoteActive
        ? "Strategy is not currently quoting"
        : `Notional ${(notionalPct * 100).toFixed(1)}% · Loss ${(lossPct * 100).toFixed(1)}%`;

  return (
    <div
      className={`glass-panel flex items-center gap-3 px-3 py-2 border ${border} ${bg} flex-shrink-0`}
    >
      <span className="relative flex h-2.5 w-2.5 flex-shrink-0" aria-hidden>
        <span
          className={`absolute inset-0 rounded-full animate-ping ${
            tone === "good"
              ? "bg-emerald-400/60"
              : tone === "warn"
                ? "bg-amber-400/60"
                : tone === "bad"
                  ? "bg-rose-400/60"
                  : "bg-neutral-400/40"
          }`}
        />
        <span
          className={`relative rounded-full h-2.5 w-2.5 ${
            tone === "good"
              ? "bg-emerald-400"
              : tone === "warn"
                ? "bg-amber-400"
                : tone === "bad"
                  ? "bg-rose-400"
                  : "bg-neutral-400"
          }`}
        />
      </span>
      <div className="flex flex-col min-w-0">
        <span className={`text-sm font-semibold tracking-tight ${text} truncate`}>
          {headline}
        </span>
        <span className="text-[11px] font-mono text-neutral-400 truncate">
          {detail}
        </span>
      </div>
      <div className="ml-auto flex items-center gap-2 flex-shrink-0">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-sm border text-[10px] font-mono uppercase tracking-wider ${
            status === "ok"
              ? "text-emerald-300 border-emerald-400/30 bg-emerald-500/5"
              : "text-rose-300 border-rose-400/30 bg-rose-500/5"
          }`}
        >
          {status}
        </span>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-sm border text-[10px] font-mono uppercase tracking-wider ${
            quoteActive
              ? "text-cyan-300 border-cyan-400/30 bg-cyan-500/5"
              : "text-neutral-400 border-white/10 bg-white/[0.02]"
          }`}
        >
          {quoteActive ? "quoting" : "paused"}
        </span>
      </div>
    </div>
  );
}

function QuoteConfigCard({
  strategy,
}: {
  strategy: SternState["strategy"] | undefined;
}) {
  const cfg = strategy?.config;
  const base = cfg?.base_quote_spread_bps ?? 0;
  const effective = strategy?.effective_spread_bps ?? 0;
  const widenDelta = effective - base;
  const widenTone: RiskTone =
    widenDelta > 4 ? "warn" : widenDelta > 10 ? "bad" : "good";
  const { text: widenText } = toneClasses(widenTone);

  const rows: Array<{
    label: string;
    value: string;
    accentClass?: string;
  }> = [
    {
      label: "Base spread",
      value: formatBps(base),
    },
    {
      label: "Effective",
      value: formatBps(effective),
      accentClass: widenText,
    },
    {
      label: "Skew",
      value: formatBps(strategy?.skew_bps ?? 0),
    },
    {
      label: "Vol input",
      value: formatBps(strategy?.vol_input_bps ?? 0),
    },
    {
      label: "Order size",
      value: formatBtc(cfg?.order_size_btc ?? 0, 4),
    },
    {
      label: "Skew/BTC",
      value: formatBps(cfg?.position_skew_bps_per_btc ?? 0),
    },
  ];

  return (
    <div className="h-full grid grid-cols-2 gap-x-4 gap-y-1.5 content-center min-h-0">
      {rows.map((r) => (
        <div
          key={r.label}
          className="flex items-baseline justify-between gap-2 min-w-0"
        >
          <span className="text-[10px] uppercase tracking-wider text-neutral-500 truncate">
            {r.label}
          </span>
          <span
            className={`text-[11px] font-mono tabular-nums truncate ${
              r.accentClass ?? "text-neutral-100"
            }`}
          >
            {r.value}
          </span>
        </div>
      ))}
      {Math.abs(widenDelta) > 1e-6 && (
        <div className="col-span-2 mt-1 pt-1.5 border-t border-white/[0.05] flex items-baseline justify-between gap-2 text-[10px] font-mono">
          <span className="text-neutral-500 uppercase tracking-wider">
            Spread widen
          </span>
          <span className={`tabular-nums ${widenText}`}>
            {widenDelta > 0 ? "+" : ""}
            {widenDelta.toFixed(2)} bps vs base
          </span>
        </div>
      )}
    </div>
  );
}

function InventoryCard({
  strategy,
  portfolio,
  mid,
}: {
  strategy: SternState["strategy"] | undefined;
  portfolio: PortfolioSnapshot | undefined;
  mid: number | null;
}) {
  const cfg = strategy?.config;
  const pos = portfolio?.position_btc ?? 0;
  const orderSize = cfg?.order_size_btc ?? 0;
  const inventoryUnits = orderSize > 1e-9 ? Math.abs(pos) / orderSize : 0;
  const unitTone: RiskTone =
    inventoryUnits > 10 ? "bad" : inventoryUnits > 5 ? "warn" : "good";
  const { text: unitText } = toneClasses(unitTone);

  const implicitSkew =
    (cfg?.position_skew_bps_per_btc ?? 0) * pos;
  const skewTone: RiskTone =
    Math.abs(implicitSkew) > 10 ? "warn" : "good";
  const { text: skewText } = toneClasses(skewTone);

  const side: "long" | "short" | "flat" =
    pos > 1e-8 ? "long" : pos < -1e-8 ? "short" : "flat";
  const sideColor =
    side === "long"
      ? "text-emerald-300"
      : side === "short"
        ? "text-rose-300"
        : "text-neutral-400";

  return (
    <div className="h-full grid grid-cols-2 gap-x-4 gap-y-1.5 content-center min-h-0">
      <div className="flex items-baseline justify-between gap-2 min-w-0">
        <span className="text-[10px] uppercase tracking-wider text-neutral-500 truncate">
          Side
        </span>
        <span className={`text-[11px] font-mono tracking-wider uppercase ${sideColor}`}>
          {side}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2 min-w-0">
        <span className="text-[10px] uppercase tracking-wider text-neutral-500 truncate">
          Position
        </span>
        <span className="text-[11px] font-mono tabular-nums text-neutral-100 truncate">
          {formatBtc(pos, 4)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2 min-w-0">
        <span className="text-[10px] uppercase tracking-wider text-neutral-500 truncate">
          Units
        </span>
        <span className={`text-[11px] font-mono tabular-nums truncate ${unitText}`}>
          {inventoryUnits.toFixed(2)}×
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2 min-w-0">
        <span className="text-[10px] uppercase tracking-wider text-neutral-500 truncate">
          Avg entry
        </span>
        <span className="text-[11px] font-mono tabular-nums text-neutral-100 truncate">
          {formatUsd(portfolio?.avg_entry_price, 2)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2 min-w-0">
        <span className="text-[10px] uppercase tracking-wider text-neutral-500 truncate">
          Mid
        </span>
        <span className="text-[11px] font-mono tabular-nums text-neutral-100 truncate">
          {formatUsd(mid, 2)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2 min-w-0">
        <span className="text-[10px] uppercase tracking-wider text-neutral-500 truncate">
          Implied skew
        </span>
        <span className={`text-[11px] font-mono tabular-nums truncate ${skewText}`}>
          {implicitSkew >= 0 ? "+" : ""}
          {implicitSkew.toFixed(1)} bps
        </span>
      </div>
    </div>
  );
}

export function RiskPanel() {
  const { data: state } = useSternState();
  const cfg = state?.strategy.config;
  const portfolio = state?.portfolio;
  const notionalPct = cfg?.max_notional_exposure
    ? Math.min(1, (portfolio?.exposure_usd ?? 0) / cfg.max_notional_exposure)
    : 0;
  const lossPct = cfg?.max_loss
    ? Math.min(1, (portfolio?.drawdown ?? 0) / cfg.max_loss)
    : 0;
  const notionalHeadroom = Math.max(
    0,
    (cfg?.max_notional_exposure ?? 0) - (portfolio?.exposure_usd ?? 0),
  );
  const lossHeadroom = Math.max(
    0,
    (cfg?.max_loss ?? 0) - (portfolio?.drawdown ?? 0),
  );

  return (
    <TabShell
      title="Risk"
      subtitle="Hard limits guarding the MM session"
    >
      <RiskStatusBanner
        status={state?.risk_status ?? "—"}
        quoteActive={state?.strategy.quote_active ?? false}
        notionalPct={notionalPct}
        lossPct={lossPct}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 grid-rows-2 gap-2 flex-1 min-h-0">
        <Panel>
          <LimitGaugeCard
            title="Notional consumption"
            pct={notionalPct}
            currentLabel="Exposure"
            currentValue={formatUsd(portfolio?.exposure_usd, 0)}
            capLabel="Max notional"
            capValue={formatUsd(cfg?.max_notional_exposure, 0)}
            headroomLabel={`${formatUsd(notionalHeadroom, 0)} free`}
          />
        </Panel>
        <Panel>
          <LimitGaugeCard
            title="Loss consumption"
            pct={lossPct}
            currentLabel="Drawdown"
            currentValue={formatUsd(portfolio?.drawdown, 0)}
            capLabel="Max loss"
            capValue={formatUsd(cfg?.max_loss, 0)}
            headroomLabel={`${formatUsd(lossHeadroom, 0)} buffer`}
          />
        </Panel>
        <Panel title="Quote configuration" subtitle="Live spread / skew vs base">
          <QuoteConfigCard strategy={state?.strategy} />
        </Panel>
        <Panel title="Inventory" subtitle="Position sized in order-units">
          <InventoryCard
            strategy={state?.strategy}
            portfolio={portfolio}
            mid={state?.mid_price ?? null}
          />
        </Panel>
      </div>
    </TabShell>
  );
}

export function SystemPanel() {
  const { data: state, error, lastUpdatedAt } = useSternState();
  const runtime = state?.runtime;
  return (
    <TabShell
      title="System"
      subtitle="Coinbase feed state, message throughput, session uptime"
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 flex-shrink-0">
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
          <Kpi
            label="Trades seen"
            value={runtime?.trade_events.toString() ?? "—"}
          />
        </Panel>
      </div>
      <Panel title="Details" className="flex-1">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm font-mono content-start">
          <DetailRow label="Mid ready" value={runtime?.mid_ready ? "yes" : "no"} />
          <DetailRow
            label="Book bids"
            value={String(runtime?.book_levels.bids ?? 0)}
          />
          <DetailRow
            label="Book asks"
            value={String(runtime?.book_levels.asks ?? 0)}
          />
          <DetailRow
            label="Last trade"
            value={formatClockTime(runtime?.last_trade_ts)}
          />
          <DetailRow
            label="Client poll"
            value={
              lastUpdatedAt
                ? formatClockTime(new Date(lastUpdatedAt).toISOString())
                : "—"
            }
          />
          <div className="col-span-2 lg:col-span-3">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-0.5">
              Error
            </div>
            <div
              className={`text-xs font-mono truncate ${
                error ? "text-rose-300" : "text-neutral-400"
              }`}
              title={error ?? "none"}
            >
              {error ?? "none"}
            </div>
          </div>
        </div>
      </Panel>
    </TabShell>
  );
}

// ============================================================================
// Export — three CSV download buttons
// ============================================================================

export function ExportPanel() {
  const { data: state } = useSternState();
  const cards: Array<{
    title: string;
    subtitle: string;
    info: string;
    kind: "fills" | "pnl" | "spreads";
  }> = [
    {
      title: "Fills",
      subtitle: "All simulated MM executions (side, price, size, notional, reason)",
      info: `${state?.fills.length ?? 0} rows available`,
      kind: "fills",
    },
    {
      title: "PnL curve",
      subtitle: "Equity, position and total PnL sampled at book-tick cadence",
      info: "streaming history",
      kind: "pnl",
    },
    {
      title: "Spread history",
      subtitle: "Depth-weighted spread samples for 0.1 / 1 / 5 / 10 BTC",
      info: "4 depth series",
      kind: "spreads",
    },
  ];
  return (
    <TabShell
      title="Export"
      subtitle="Download session data as CSV for offline analysis"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 flex-1 min-h-0">
        {cards.map((c) => (
          <Panel key={c.kind} title={c.title} subtitle={c.subtitle}>
            <div className="h-full flex flex-col justify-between">
              <div className="text-[11px] text-neutral-500 font-mono">{c.info}</div>
              <button
                type="button"
                className="glass-panel w-full py-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200 transition-colors"
                onClick={() => downloadCsv(c.kind)}
              >
                Download {c.kind}.csv
              </button>
            </div>
          </Panel>
        ))}
      </div>
    </TabShell>
  );
}

// ============================================================================
// Backtest Cockpit — paper session replay summary
// ============================================================================

export function BacktestCockpitPanel() {
  const { data: state } = useSternState();
  const bt = state?.backtest_lite;
  return (
    <TabShell
      title="Paper Session Replay"
      subtitle="Lite backtest over the live MM paper session"
    >
      <div className="grid grid-cols-4 lg:grid-cols-8 gap-2 flex-shrink-0">
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
          <Kpi label="Peak equity" value={formatUsd(bt?.peak_equity_usd, 2)} />
        </Panel>
        <Panel>
          <Kpi
            label="Max drawdown"
            value={formatUsd(bt?.max_drawdown_usd, 2)}
            accent={bt && bt.max_drawdown_usd > 0 ? "negative" : "neutral"}
          />
        </Panel>
        <Panel>
          <Kpi label="Fills" value={bt?.fill_count.toString() ?? "—"} />
        </Panel>
        <Panel>
          <Kpi
            label="Fill volume"
            value={formatBtc(bt?.fill_volume_btc ?? 0, 4)}
          />
        </Panel>
        <Panel>
          <Kpi label="Fill notional" value={formatUsd(bt?.fill_notional_usd, 2)} />
        </Panel>
        <Panel>
          <Kpi
            label="Quote uptime"
            value={formatPct(bt?.quote_uptime_pct ?? 0, 1)}
          />
        </Panel>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-0">
        <Panel title="Equity curve" subtitle="Last 60 samples of paper equity">
          <MiniCurve values={bt?.equity_curve ?? []} stroke="#2ce3ff" />
        </Panel>
        <Panel title="PnL curve" subtitle="Cumulative realized + unrealized PnL">
          <MiniCurve values={bt?.pnl_curve ?? []} stroke="#34d399" />
        </Panel>
      </div>
    </TabShell>
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
      <div className="h-full flex items-center justify-center text-sm text-neutral-500">
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
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="w-full h-full"
    >
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
