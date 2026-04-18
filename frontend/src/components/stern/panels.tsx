import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
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
// Overview — top KPIs for the crypto MM desk
// ============================================================================

export function OverviewPanel() {
  const { data: state } = useSternState();
  const portfolio = state?.portfolio;
  const strategy = state?.strategy;
  const totalPnl = portfolio
    ? portfolio.realized_pnl + portfolio.unrealized_pnl
    : 0;

  return (
    <div className="p-6 space-y-4">
      <PanelHeader
        title="Crypto MM Overview"
        subtitle="BTC-USD paper market making — top-of-book, quote state, PnL"
        state={state}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Panel>
          <Kpi
            label="Mid"
            value={formatUsd(state?.mid_price, 2)}
          />
        </Panel>
        <Panel>
          <Kpi
            label="Best Bid / Ask"
            value={
              state?.best_bid && state?.best_ask
                ? `${formatNumber(state.best_bid.price, 2)} / ${formatNumber(state.best_ask.price, 2)}`
                : "—"
            }
          />
        </Panel>
        <Panel>
          <Kpi
            label="Spread"
            value={
              state?.best_bid && state?.best_ask
                ? formatUsd(state.best_ask.price - state.best_bid.price, 2)
                : "—"
            }
          />
        </Panel>
        <Panel>
          <Kpi
            label="Position"
            value={formatBtc(portfolio?.position_btc ?? 0, 4)}
            accent={portfolio ? sign(portfolio.position_btc) : "neutral"}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Panel>
          <Kpi
            label="Equity"
            value={formatUsd(portfolio?.equity, 2)}
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
            label="Realized PnL"
            value={formatUsd(portfolio?.realized_pnl, 2)}
            accent={portfolio ? sign(portfolio.realized_pnl) : "neutral"}
          />
        </Panel>
        <Panel>
          <Kpi
            label="Total PnL"
            value={formatUsd(totalPnl, 2)}
            accent={sign(totalPnl)}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Panel title="Current quote" subtitle="Post-risk market maker output">
          {state?.quote ? (
            <div className="grid grid-cols-2 gap-3 text-sm font-mono">
              <div>
                <div className="text-neutral-500 text-xs mb-1">Bid</div>
                <div className="text-emerald-300">
                  {formatUsd(state.quote.bid_price, 2)} ·{" "}
                  {state.quote.bid_size.toFixed(4)} BTC
                </div>
              </div>
              <div>
                <div className="text-neutral-500 text-xs mb-1">Ask</div>
                <div className="text-rose-300">
                  {formatUsd(state.quote.ask_price, 2)} ·{" "}
                  {state.quote.ask_size.toFixed(4)} BTC
                </div>
              </div>
              <div>
                <div className="text-neutral-500 text-xs mb-1">Effective spread</div>
                <div>{formatBps(strategy?.effective_spread_bps)}</div>
              </div>
              <div>
                <div className="text-neutral-500 text-xs mb-1">Skew</div>
                <div>{formatBps(strategy?.skew_bps)}</div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-neutral-500 py-6 text-center">
              Quote inactive — risk: {state?.risk_status ?? "warming"}
            </div>
          )}
        </Panel>

        <Panel title="Risk" subtitle="Limits & session status">
          <div className="space-y-2 text-sm font-mono">
            <div className="flex justify-between">
              <span className="text-neutral-500">Status</span>
              <span
                className={
                  state?.risk_status === "ok"
                    ? "text-emerald-300"
                    : "text-amber-300"
                }
              >
                {state?.risk_status ?? "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Max notional</span>
              <span>{formatUsd(strategy?.config.max_notional_exposure, 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Max loss</span>
              <span>{formatUsd(strategy?.config.max_loss, 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Drawdown</span>
              <span>{formatUsd(portfolio?.drawdown, 2)}</span>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ============================================================================
// Pro Terminal — orderbook + tape + spread metrics
// ============================================================================

function BookSide({
  levels,
  side,
}: {
  levels: BookLevel[];
  side: "bid" | "ask";
}) {
  const maxSize = useMemo(
    () => Math.max(1e-9, ...levels.map((l) => l.size)),
    [levels],
  );
  const color = side === "bid" ? "bg-emerald-500/15" : "bg-rose-500/15";
  const priceColor = side === "bid" ? "text-emerald-300" : "text-rose-300";
  return (
    <table className="glass-table w-full text-xs font-mono">
      <thead>
        <tr>
          <th className="text-left">Price</th>
          <th className="text-right">Size</th>
        </tr>
      </thead>
      <tbody>
        {levels.map((level, idx) => {
          const pct = (level.size / maxSize) * 100;
          return (
            <tr key={`${side}-${idx}`} className="relative">
              <td className={priceColor}>
                <div className="relative">
                  <div
                    className={`absolute inset-0 ${color}`}
                    style={{
                      width: `${pct}%`,
                      [side === "bid" ? "right" : "left"]: 0,
                      left: side === "bid" ? "auto" : 0,
                    }}
                  />
                  <span className="relative">{formatNumber(level.price, 2)}</span>
                </div>
              </td>
              <td className="text-right">{level.size.toFixed(4)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TradeTape({ trades }: { trades: PublicTrade[] }) {
  return (
    <table className="glass-table w-full text-xs font-mono">
      <thead>
        <tr>
          <th className="text-left">Time</th>
          <th className="text-left">Side</th>
          <th className="text-right">Price</th>
          <th className="text-right">Size</th>
        </tr>
      </thead>
      <tbody>
        {trades.slice(0, 40).map((trade, idx) => (
          <tr key={`${trade.trade_id ?? idx}-${trade.ts}`}>
            <td className="text-neutral-500">{formatClockTime(trade.ts)}</td>
            <td
              className={
                trade.side === "buy" ? "text-emerald-300" : "text-rose-300"
              }
            >
              {trade.side}
            </td>
            <td className="text-right">{formatNumber(trade.price, 2)}</td>
            <td className="text-right">{trade.size.toFixed(4)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SpreadMetricsTable({
  metrics,
}: {
  metrics: Record<string, SpreadMetric>;
}) {
  const depths = Object.keys(metrics);
  return (
    <table className="glass-table w-full text-xs font-mono">
      <thead>
        <tr>
          <th className="text-left">Depth</th>
          <th className="text-right">Last</th>
          <th className="text-right">Avg</th>
          <th className="text-right">Median</th>
          <th className="text-right">Min</th>
          <th className="text-right">Max</th>
        </tr>
      </thead>
      <tbody>
        {depths.map((depth) => {
          const m = metrics[depth];
          return (
            <tr key={depth}>
              <td className="text-neutral-400">{depth}</td>
              <td className="text-right">{formatUsd(m.last, 2)}</td>
              <td className="text-right">{formatUsd(m.avg, 2)}</td>
              <td className="text-right">{formatUsd(m.median, 2)}</td>
              <td className="text-right">{formatUsd(m.min, 2)}</td>
              <td className="text-right">{formatUsd(m.max, 2)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function ProTerminalPanel() {
  const { data: state } = useSternState();
  return (
    <div className="p-6 space-y-4">
      <PanelHeader
        title="Pro Terminal"
        subtitle="Live L2 orderbook, tape and depth-weighted spread analytics"
        state={state}
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Panel title="Bids (top 10)">
          <BookSide levels={state?.book.bids ?? []} side="bid" />
        </Panel>
        <Panel title="Asks (top 10)">
          <BookSide levels={state?.book.asks ?? []} side="ask" />
        </Panel>
        <Panel title="Tape" subtitle="Latest 40 public trades">
          <div className="glass-scroll max-h-[420px] overflow-auto">
            <TradeTape trades={state?.recent_trades ?? []} />
          </div>
        </Panel>
      </div>
      <Panel
        title="Depth-weighted spread metrics"
        subtitle="Avg / median / min / max over session, by depth in BTC"
      >
        <SpreadMetricsTable metrics={state?.spread_metrics ?? {}} />
      </Panel>
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

function buildFillMarkers(fills: SimFill[], bucketSec: number): SeriesMarker<Time>[] {
  const out: SeriesMarker<Time>[] = [];
  for (const fill of fills.slice(0, 60)) {
    const ms = Date.parse(fill.ts);
    if (!Number.isFinite(ms)) continue;
    const t = Math.floor(ms / 1000);
    const bucket = Math.floor(t / bucketSec) * bucketSec;
    out.push({
      time: bucket as UTCTimestamp,
      position: fill.side === "buy" ? "belowBar" : "aboveBar",
      color: fill.side === "buy" ? "#34d399" : "#fb7185",
      shape: fill.side === "buy" ? "arrowUp" : "arrowDown",
      text: `${fill.side === "buy" ? "B" : "S"} ${fill.size.toFixed(3)}`,
    });
  }
  out.sort((a, b) => (a.time as number) - (b.time as number));
  return out;
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
      upColor: "#34d399",
      downColor: "#fb7185",
      borderUpColor: "#34d399",
      borderDownColor: "#fb7185",
      wickUpColor: "#34d399",
      wickDownColor: "#fb7185",
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
    syncLine(bidLineRef, bidPrice, "#34d399", "BID");
    syncLine(askLineRef, askPrice, "#fb7185", "ASK");
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
  const markers = useMemo(() => buildFillMarkers(fills, bucketSec), [fills, bucketSec]);

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
