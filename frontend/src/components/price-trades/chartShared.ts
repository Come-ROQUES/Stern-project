import type { Time } from "lightweight-charts";

import { type Ohlc, type OhlcPayload, type SystemStatus } from "../../lib/api";
import { TIMEFRAMES } from "../../lib/aggregateCandles";
import type { Signal } from "../../lib/canonicalApi";

import type { ProcessedTrade } from "./usePriceTradesData";

export const FX_DECIMALS = 5;
export const FALLBACK_MIN_BARS = 20;
export const LIVE_REFRESH_MS = 5000;
export const LIVE_TICK_MS = 2000;
export const LIVE_FETCH_LIMIT = 200;
export const OHLC_BACKFILL_LIMIT = 1000;
export const OHLC_BACKFILL_MAX_BARS = 4000;
export const OHLC_LIVE_WINDOW_SECONDS = 60 * 60;
export const LIVE_BOOTSTRAP_FETCH_LIMIT = 900;
export const LIVE_BOOTSTRAP_LOOKBACK_SECONDS = 72 * 60 * 60;
export const LIVE_WINDOW_STATE_UPDATE_MS = 30_000;
export const LIVE_UI_UPDATE_MS = 400;
export const LIVE_TRADES_FETCH_LIMIT = 300;
export const FULL_RUN_TRADES_FETCH_LIMIT = 2000;
export const CHART_HOT_CACHE_TTL_MS = 90_000;
export const USER_VIEWPORT_INTERACTION_MS = 1200;
export const TRADE_PATHS_MAX_VISIBLE = 120;
export const TRADE_PATHS_PADDING_SEC = 10 * 60;
export const DEFAULT_SOURCE_TIMEFRAME_SECONDS = 5;
export const CHART_RIGHT_OFFSET_MIN_BARS = 6;
export const CHART_RIGHT_OFFSET_MAX_BARS = 12;
export const CHART_RIGHT_OFFSET_HARD_CAP_BARS = 30;
export const RANGE_SHIFT_EPSILON_SEC = 0.001;

export const CHART_COLORS = {
  candleUp: "#22c55e",
  candleDown: "#ef4444",
  tradeBuyEntry: "#1EB980",
  tradeSellEntry: "#E9436D",
  tradeOpenMarker: "#FFD700",
  tradeExitTP: "#1EB980",
  tradeExitSL: "#E9436D",
  tradeExitScaleOut: "#F59E0B",
  tradePath: "rgba(255, 255, 255, 0.3)",
  tpLine: "rgba(30, 185, 128, 0.5)",
  slLine: "rgba(233, 67, 109, 0.5)",
  reflexTarget: "rgba(56, 189, 248, 0.65)",
  reflexAnchor: "rgba(148, 163, 184, 0.35)",
  reflexPeak: "rgba(251, 191, 36, 0.28)",
  signalAcceptedLine: "rgba(100, 149, 237, 0.25)",
  signalRefusedLine: "rgba(128, 128, 128, 0.15)",
  atrUpper: "rgba(0,198,255,0.3)",
  atrLower: "rgba(255,84,97,0.2)",
  sessionHigh: "rgba(0,198,255,0.2)",
  sessionLow: "rgba(123,97,255,0.2)",
  spreadLine: "rgba(255, 191, 0, 0.6)",
  spreadArea: "rgba(255, 191, 0, 0.08)",
  spreadThreshold: "rgba(233, 67, 109, 0.35)",
  tradePathWin: "rgba(30, 185, 128, 0.35)",
  tradePathLoss: "rgba(233, 67, 109, 0.35)",
  sessionLondon: "rgba(56, 189, 248, 0.03)",
  sessionNY: "rgba(168, 85, 247, 0.03)",
  sessionAsia: "rgba(251, 191, 36, 0.02)",
  sessionOverlap: "rgba(74, 222, 128, 0.04)",
} as const;

export interface OhlcAuditState {
  state: string | null;
  meta: OhlcPayload["meta"] | null;
}

export interface ChartFrozenState {
  active: boolean;
  reason: string;
  badge: string | null;
  degraded: boolean;
}

interface ChartHotCacheEntry {
  rawBars: Ohlc[];
  systemStatus: SystemStatus | null;
  window: { start: string; end: string } | null;
  ohlcState: string | null;
  ohlcMeta: OhlcPayload["meta"] | null;
  cachedAt: number;
}

const chartHotCache = new Map<string, ChartHotCacheEntry>();

function isFxMarketOpen(now: Date): boolean {
  const day = now.getUTCDay();
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (day === 6) return false;
  if (day === 0) return minutes >= 22 * 60;
  if (day === 5) return minutes < 22 * 60;
  return true;
}

export function buildLiveWindow(endCandidateMs: number): {
  start: string;
  end: string;
} {
  const safeEndMs = Number.isFinite(endCandidateMs) ? endCandidateMs : Date.now();
  return {
    start: new Date(
      safeEndMs - OHLC_LIVE_WINDOW_SECONDS * 1000
    ).toISOString(),
    end: new Date(safeEndMs).toISOString(),
  };
}

export function buildFullRunWindow(
  base: { start: string; end: string } | null,
  latestBars?: Ohlc[] | null,
  latestTradeTimeSec?: number | null
): { start: string; end: string } | null {
  let firstBarMs = Infinity;
  let lastBarMs = -Infinity;
  for (const bar of latestBars ?? []) {
    const ts = Date.parse(bar.timestamp);
    if (!Number.isFinite(ts)) continue;
    if (ts < firstBarMs) firstBarMs = ts;
    if (ts > lastBarMs) lastBarMs = ts;
  }

  const baseStartMs = base?.start ? Date.parse(base.start) : NaN;
  const baseEndMs = base?.end ? Date.parse(base.end) : NaN;
  const latestTradeMs =
    latestTradeTimeSec != null && Number.isFinite(latestTradeTimeSec)
      ? latestTradeTimeSec * 1000
      : -Infinity;

  const startCandidates = [baseStartMs, firstBarMs].filter((value) =>
    Number.isFinite(value)
  ) as number[];
  const endCandidates = [baseEndMs, lastBarMs, latestTradeMs].filter((value) =>
    Number.isFinite(value)
  ) as number[];

  if (!startCandidates.length || !endCandidates.length) return null;

  const startMs = Math.min(...startCandidates);
  const endMs = Math.max(startMs, ...endCandidates);
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
  };
}

export function getChartRightOffsetBars(
  tfSeconds: number,
  latestTradeTimeSec?: number | null,
  latestChartTimeSec?: number | null
): number {
  const baseOffset =
    tfSeconds <= 1
      ? CHART_RIGHT_OFFSET_MAX_BARS
      : tfSeconds <= 5
        ? 10
        : tfSeconds <= 15
          ? 9
          : tfSeconds <= 60
            ? 8
            : CHART_RIGHT_OFFSET_MIN_BARS;

  if (
    latestTradeTimeSec == null ||
    latestChartTimeSec == null ||
    !Number.isFinite(latestTradeTimeSec) ||
    !Number.isFinite(latestChartTimeSec) ||
    latestTradeTimeSec <= latestChartTimeSec
  ) {
    return baseOffset;
  }

  const gapSeconds = latestTradeTimeSec - latestChartTimeSec;
  const gapBars = Math.ceil(gapSeconds / Math.max(tfSeconds, 1));
  if (gapBars <= 0) {
    return baseOffset;
  }
  if (gapBars > CHART_RIGHT_OFFSET_HARD_CAP_BARS) {
    return baseOffset;
  }
  return baseOffset + gapBars + 2;
}

export function getViewportEndCandidateMs(
  latestBarMs?: number | null,
  latestTradeTimeSec?: number | null,
  nowMs = Date.now()
): number {
  return Math.max(
    latestBarMs != null && Number.isFinite(latestBarMs) ? latestBarMs : -Infinity,
    latestTradeTimeSec != null && Number.isFinite(latestTradeTimeSec)
      ? latestTradeTimeSec * 1000
      : -Infinity,
    nowMs
  );
}

export function buildChartHotCacheKey(
  runId: string | null | undefined,
  strategyId: string,
  fullRunRequested: boolean
): string | null {
  if (!runId) return null;
  return `${runId}::${strategyId}::${fullRunRequested ? "full" : "live"}`;
}

export function readChartHotCache(cacheKey: string | null): ChartHotCacheEntry | null {
  if (!cacheKey) return null;
  const cached = chartHotCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > CHART_HOT_CACHE_TTL_MS) {
    chartHotCache.delete(cacheKey);
    return null;
  }
  return {
    ...cached,
    rawBars: [...cached.rawBars],
    window: cached.window ? { ...cached.window } : null,
    ohlcMeta: cached.ohlcMeta ? { ...cached.ohlcMeta } : null,
  };
}

export function writeChartHotCache(
  cacheKey: string | null,
  entry: Omit<ChartHotCacheEntry, "cachedAt">
): void {
  if (!cacheKey || !entry.rawBars.length) return;
  chartHotCache.set(cacheKey, {
    rawBars: [...entry.rawBars].slice(-OHLC_BACKFILL_MAX_BARS),
    systemStatus: entry.systemStatus,
    window: entry.window ? { ...entry.window } : null,
    ohlcState: entry.ohlcState,
    ohlcMeta: entry.ohlcMeta ? { ...entry.ohlcMeta } : null,
    cachedAt: Date.now(),
  });
}

export function mergeOhlcBars(
  primary: Ohlc[] | null | undefined,
  secondary: Ohlc[] | null | undefined
): Ohlc[] {
  const mergedByTs = new Map<string, Ohlc>();
  [...(secondary ?? []), ...(primary ?? [])]
    .filter((bar) => isValidBar(bar))
    .forEach((bar) => {
      mergedByTs.set(bar.timestamp, bar);
    });
  return Array.from(mergedByTs.values())
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .slice(-OHLC_BACKFILL_MAX_BARS);
}

export function getChartTradesFetchLimit(fullRunRequested: boolean): number {
  return fullRunRequested
    ? FULL_RUN_TRADES_FETCH_LIMIT
    : LIVE_TRADES_FETCH_LIMIT;
}

export function resolveMinChartTimeframeSeconds(
  meta: OhlcPayload["meta"] | null | undefined
): number {
  const sourceInterval = Number(meta?.source_bar_interval_s);
  if (Number.isFinite(sourceInterval) && sourceInterval > 0) {
    return sourceInterval;
  }
  return DEFAULT_SOURCE_TIMEFRAME_SECONDS;
}

export function getSupportedChartTimeframes(
  options: (typeof TIMEFRAMES)[number][],
  minSeconds: number
): ((typeof TIMEFRAMES)[number] & { disabled: boolean })[] {
  return options.map((tf) => ({
    ...tf,
    disabled: tf.seconds < minSeconds,
  }));
}

export function findSignalsNearTime(
  signalsByTime: Map<number, Signal[]>,
  targetTime: number,
  timeframeSec: number
): Signal[] | null {
  const direct = signalsByTime.get(targetTime);
  if (direct && direct.length > 0) return direct;
  const threshold = Math.max(1, Math.floor(timeframeSec / 2));
  let best: { diff: number; signals: Signal[] | null } = {
    diff: Infinity,
    signals: null,
  };
  for (const [key, list] of signalsByTime.entries()) {
    const diff = Math.abs(key - targetTime);
    if (diff <= threshold && diff < best.diff && list.length > 0) {
      best = { diff, signals: list };
    }
  }
  return best.signals;
}

export function isAbortLikeChartError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    error.name === "AbortError" ||
    message.includes("abort") ||
    message.includes("signal is aborted")
  );
}

export function toUnixSeconds(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const ms = Date.parse(ts);
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 1000);
}

export function tradeOverlapsRange(
  entryTs: string | null | undefined,
  exitTs: string | null | undefined,
  range: { from: number; to: number }
): boolean {
  const entrySec = toUnixSeconds(entryTs);
  if (entrySec == null) return false;
  const exitSec = toUnixSeconds(exitTs) ?? entrySec;
  return entrySec <= range.to && exitSec >= range.from;
}

export function selectClosedTradePathTrades(
  trades: ProcessedTrade[],
  visibleRange: { from: number; to: number } | null
): ProcessedTrade[] {
  const range = visibleRange
    ? {
        from: visibleRange.from - TRADE_PATHS_PADDING_SEC,
        to: visibleRange.to + TRADE_PATHS_PADDING_SEC,
      }
    : null;

  const candidates = range
    ? trades.filter((trade) =>
        tradeOverlapsRange(trade.entry_time, trade.exit_time, range)
      )
    : trades;

  if (candidates.length <= TRADE_PATHS_MAX_VISIBLE) {
    return candidates;
  }

  return [...candidates]
    .sort((a, b) => {
      const aTs = Date.parse(a.exit_time ?? a.entry_time ?? "");
      const bTs = Date.parse(b.exit_time ?? b.entry_time ?? "");
      return aTs - bTs;
    })
    .slice(-TRADE_PATHS_MAX_VISIBLE);
}

function alignToBucket(ts: string, timeframeSec: number): Time {
  const ms = Date.parse(ts);
  if (!Number.isFinite(ms)) return null as Time;
  if (timeframeSec <= 0) return toTime(ts);
  const bucketMs = Math.floor(ms / (timeframeSec * 1000)) * timeframeSec * 1000;
  return Math.floor(bucketMs / 1000) as Time;
}

export function toTime(ts: string): Time {
  const ms = Date.parse(ts);
  if (!Number.isFinite(ms)) return null as Time;
  return Math.floor(ms / 1000) as Time;
}

export function snapTimestampToLoadedBarTime(
  ts: string | null | undefined,
  bars: Array<Pick<Ohlc, "timestamp">>,
  timeframeSec: number,
  allowBucketFallback = true
): number | null {
  if (!ts) return null;
  const targetMs = Date.parse(ts);
  if (!Number.isFinite(targetMs)) return null;
  if (!bars.length) {
    return allowBucketFallback ? (alignToBucket(ts, timeframeSec) as number) : null;
  }

  let lo = 0;
  let hi = bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const midMs = Date.parse(bars[mid].timestamp);
    if (midMs < targetMs) lo = mid + 1;
    else hi = mid;
  }

  let bestIdx = lo;
  let bestDiff = Math.abs(Date.parse(bars[lo].timestamp) - targetMs);
  if (lo > 0) {
    const prevDiff = Math.abs(Date.parse(bars[lo - 1].timestamp) - targetMs);
    if (prevDiff < bestDiff) {
      bestIdx = lo - 1;
      bestDiff = prevDiff;
    }
  }
  if (lo < bars.length - 1) {
    const nextDiff = Math.abs(Date.parse(bars[lo + 1].timestamp) - targetMs);
    if (nextDiff < bestDiff) {
      bestIdx = lo + 1;
      bestDiff = nextDiff;
    }
  }

  if (bestDiff <= timeframeSec * 1000) {
    return Math.floor(Date.parse(bars[bestIdx].timestamp) / 1000);
  }
  return allowBucketFallback ? (alignToBucket(ts, timeframeSec) as number) : null;
}

export function getVisibleCandlesForTimeframe(tfSeconds: number): number {
  if (tfSeconds <= 1) return 240;
  if (tfSeconds <= 5) return 180;
  if (tfSeconds <= 15) return 150;
  if (tfSeconds <= 30) return 140;
  if (tfSeconds <= 60) return 180;
  if (tfSeconds <= 300) return 180;
  return 220;
}

function getMaxCandlesForTimeframe(tfSeconds: number): number {
  if (tfSeconds <= 1) return 900;
  if (tfSeconds <= 5) return 720;
  if (tfSeconds <= 15) return 480;
  if (tfSeconds <= 30) return 360;
  if (tfSeconds <= 60) return 320;
  if (tfSeconds <= 300) return 280;
  return 260;
}

export function getMaxCandlesForWindow(
  tfSeconds: number,
  window: { start: string; end: string } | null
): number {
  const base = getMaxCandlesForTimeframe(tfSeconds);
  if (!window) return base;
  const startMs = Date.parse(window.start);
  const endMs = Date.parse(window.end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return base;
  }
  const durationSeconds = Math.max(0, (endMs - startMs) / 1000);
  const required = Math.ceil(durationSeconds / Math.max(tfSeconds, 1));
  const expanded = Math.max(base, required);
  return Math.min(OHLC_BACKFILL_MAX_BARS, expanded);
}

export function computeBarSpacing(tfSeconds: number, count: number): number {
  if (count === 0) return 8;
  if (tfSeconds <= 1) return Math.max(2.2, Math.min(6, 140 / Math.sqrt(count)));
  if (tfSeconds <= 5) return Math.max(2.6, Math.min(7, 120 / Math.sqrt(count)));
  if (tfSeconds <= 15) return 7;
  if (tfSeconds <= 30) return 8;
  if (tfSeconds <= 60) return 9;
  return 10;
}

export function computeFreezeState(
  sys: SystemStatus | null,
  tfSeconds: number,
  barAgeSeconds: number | null,
  options?: {
    marketOpen?: boolean | null;
    maxTickAgeSeconds?: number | null;
    maxBarAgeSeconds?: number | null;
  }
): ChartFrozenState {
  const tickAge = sys?.tick_age_seconds ?? null;
  const bid = sys?.bid ?? sys?.price?.bid ?? null;
  const ask = sys?.ask ?? sys?.price?.ask ?? null;
  const marketOpenFlag = options?.marketOpen ?? sys?.market_open ?? isFxMarketOpen(new Date());
  const badQuote = bid === -1 || ask === -1;
  const freezeBecauseMarket = marketOpenFlag === false || badQuote;
  const tickStaleThreshold = Math.max(1, options?.maxTickAgeSeconds ?? 15);
  const freezeBecauseTick = tickAge != null && tickAge > tickStaleThreshold;
  const barStaleThreshold = Math.max(
    options?.maxBarAgeSeconds ?? 0,
    Math.max(tfSeconds * 2, 120)
  );
  const freezeBecauseBar =
    barAgeSeconds != null && Number.isFinite(barAgeSeconds) && barAgeSeconds > barStaleThreshold;

  const badge = freezeBecauseMarket ? (badQuote ? "NO LIVE DATA" : "MARKET CLOSED") : null;

  let reason = "";
  if (badge) {
    reason = badge;
  } else if (freezeBecauseTick) {
    reason = `DATA STALE (${Math.round(tickAge ?? 0)}s)`;
  } else if (freezeBecauseBar) {
    reason = `BAR STALE (${Math.round(barAgeSeconds ?? 0)}s)`;
  }

  return {
    active: freezeBecauseMarket || freezeBecauseTick || freezeBecauseBar,
    reason,
    badge,
    degraded: freezeBecauseMarket,
  };
}

export function toChartBar(c: Ohlc): {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
} | null {
  const t = toTime(c.timestamp);
  const open = Number(c.open);
  const high = Number(c.high);
  const low = Number(c.low);
  const close = Number(c.close);
  if (
    t == null ||
    !Number.isFinite(t as number) ||
    !Number.isFinite(open) ||
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(close)
  ) {
    return null;
  }
  return {
    time: Number(t),
    open,
    high,
    low,
    close,
  };
}

export function computeAtr(bars: Ohlc[], period: number): number[] {
  if (bars.length === 0) return [];
  const trs: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) {
      trs.push(bars[i].high - bars[i].low);
    } else {
      const prevClose = bars[i - 1].close;
      const highLow = bars[i].high - bars[i].low;
      const highClose = Math.abs(bars[i].high - prevClose);
      const lowClose = Math.abs(bars[i].low - prevClose);
      trs.push(Math.max(highLow, highClose, lowClose));
    }
  }
  const atr: number[] = [];
  let sum = 0;
  for (let i = 0; i < trs.length; i++) {
    sum += trs[i];
    if (i < period) {
      atr.push(sum / (i + 1));
    } else {
      const prev = atr[i - 1];
      const val = (prev * (period - 1) + trs[i]) / period;
      atr.push(val);
    }
  }
  return atr;
}

export function getSessionLevels(bars: Ohlc[]) {
  if (!bars.length) return { high: 0, low: 0 };
  const today = new Date(bars[bars.length - 1].timestamp).getUTCDate();
  const todays = bars.filter((b) => {
    const d = new Date(b.timestamp);
    return Number.isFinite(d.getTime()) && d.getUTCDate() === today;
  });
  if (!todays.length) return { high: 0, low: 0 };
  const highs = todays.map((b) => b.high);
  const lows = todays.map((b) => b.low);
  return { high: Math.max(...highs), low: Math.min(...lows) };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isValidBar(b: Ohlc) {
  return (
    b &&
    typeof b.timestamp === "string" &&
    Number.isFinite(Date.parse(b.timestamp)) &&
    [b.open, b.high, b.low, b.close].every((v) => isFiniteNumber(v))
  );
}

export function ensureAscending<T extends { time: number }>(arr: T[]): T[] {
  let last = -Infinity;
  return arr.map((item) => {
    let t = item.time;
    if (!Number.isFinite(t)) t = last + 1;
    if (t <= last) t = last + 1;
    last = t;
    return { ...item, time: t };
  });
}

export function sortByTime<T extends { time: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.time - b.time);
}
