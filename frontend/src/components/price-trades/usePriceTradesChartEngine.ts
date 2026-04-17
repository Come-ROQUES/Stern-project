import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";

import {
  createChart,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type PriceLineOptions,
  type Time,
} from "lightweight-charts";

import {
  api,
  type LiveTick,
  type Ohlc,
  type OhlcPayload,
  type SystemStatus,
} from "../../lib/api";
import { activeContext, defaultScope } from "../../lib/activeContext";
import { aggregateCandles, TIMEFRAMES } from "../../lib/aggregateCandles";
import { canonicalApi } from "../../lib/canonicalApi";
import { useLiveStream } from "../../lib/useLiveStream";
import {
  buildChartHotCacheKey,
  buildFullRunWindow,
  buildLiveWindow,
  CHART_COLORS,
  computeAtr,
  computeBarSpacing,
  computeFreezeState,
  ensureAscending,
  FALLBACK_MIN_BARS,
  FX_DECIMALS,
  getChartRightOffsetBars,
  getMaxCandlesForWindow,
  getSessionLevels,
  getSupportedChartTimeframes,
  getViewportEndCandidateMs,
  getVisibleCandlesForTimeframe,
  isAbortLikeChartError,
  isValidBar,
  LIVE_BOOTSTRAP_FETCH_LIMIT,
  LIVE_BOOTSTRAP_LOOKBACK_SECONDS,
  LIVE_FETCH_LIMIT,
  LIVE_REFRESH_MS,
  LIVE_TICK_MS,
  LIVE_UI_UPDATE_MS,
  LIVE_WINDOW_STATE_UPDATE_MS,
  mergeOhlcBars,
  OHLC_BACKFILL_LIMIT,
  OHLC_BACKFILL_MAX_BARS,
  OHLC_LIVE_WINDOW_SECONDS,
  RANGE_SHIFT_EPSILON_SEC,
  readChartHotCache,
  resolveMinChartTimeframeSeconds,
  sortByTime,
  snapTimestampToLoadedBarTime,
  toChartBar,
  toTime,
  USER_VIEWPORT_INTERACTION_MS,
  writeChartHotCache,
  type ChartFrozenState,
  type OhlcAuditState,
} from "./chartShared";

interface RegimeInfo {
  atr: number;
  regime: string;
  sessionHigh: number;
  sessionLow: number;
}

interface UsePriceTradesChartEngineParams {
  activeStrategy: string;
  allowedTimeframes: (typeof TIMEFRAMES)[number][];
  effectiveRunId: string | null | undefined;
  isCanonical: boolean;
  isViewVisible: boolean;
  latestTradeTimeSec: number | null;
  runDataOrigin?: string | null;
  timeframe: (typeof TIMEFRAMES)[number];
  setTimeframe: (timeframe: (typeof TIMEFRAMES)[number]) => void;
}

interface UsePriceTradesChartEngineResult {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  chartRef: MutableRefObject<IChartApi | null>;
  candleSeriesRef: MutableRefObject<ISeriesApi<"Candlestick"> | null>;
  spreadSeriesRef: MutableRefObject<ISeriesApi<"Line"> | null>;
  spreadThresholdLineRef: MutableRefObject<any>;
  error: string | null;
  loading: boolean;
  regimeInfo: RegimeInfo | null;
  runWindow: { start: string; end: string } | null;
  dataSource: "CANONICAL" | "LEGACY" | "NONE";
  systemStatus: SystemStatus | null;
  latestPrice: number | null;
  latestSpread: number | null;
  visibleRange: { from: number; to: number } | null;
  latestBarAgeSec: number | null;
  lastLiveUpdate: number | null;
  chartLiveFrozen: boolean;
  ohlcAudit: OhlcAuditState | null;
  backfillState: {
    active: boolean;
    bars: number;
    mode: "live" | "full";
  };
  fullRunRequested: boolean;
  minChartTimeframeSeconds: number;
  chartTimeframeOptions: ((typeof TIMEFRAMES)[number] & { disabled: boolean })[];
  chartFrozen: ChartFrozenState;
  seriesReady: boolean;
  wsStatus: string;
  snapToLoadedBarTime: (
    ts: string | null | undefined,
    allowBucketFallback?: boolean
  ) => number | null;
  toggleChartLiveFrozen: () => void;
  activateLiveWindow: () => void;
  activateFullRun: () => void;
  handleTimeframeChange: (timeframe: (typeof TIMEFRAMES)[number]) => void;
}

export function usePriceTradesChartEngine({
  activeStrategy,
  allowedTimeframes,
  effectiveRunId,
  isCanonical,
  isViewVisible,
  latestTradeTimeSec,
  runDataOrigin,
  timeframe,
  setTimeframe,
}: UsePriceTradesChartEngineParams): UsePriceTradesChartEngineResult {
  const bootTimeframeAppliedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const atrUpperRef = useRef<ISeriesApi<"Line"> | null>(null);
  const atrLowerRef = useRef<ISeriesApi<"Line"> | null>(null);
  const sessionHighRef = useRef<ISeriesApi<"Line"> | null>(null);
  const sessionLowRef = useRef<ISeriesApi<"Line"> | null>(null);
  const reflexLinesRef = useRef<any[]>([]);
  const lastReflexKeyRef = useRef<string | null>(null);
  const spreadSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const spreadThresholdLineRef = useRef<any>(null);
  const lastAppliedRightOffsetRef = useRef<number | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [regimeInfo, setRegimeInfo] = useState<RegimeInfo | null>(null);
  const [runWindow, setRunWindow] = useState<{ start: string; end: string } | null>(null);
  const [dataSource, setDataSource] = useState<"CANONICAL" | "LEGACY" | "NONE">(
    "NONE"
  );
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [latestPrice, setLatestPrice] = useState<number | null>(null);
  const [latestSpread, setLatestSpread] = useState<number | null>(null);
  const [visibleRange, setVisibleRange] = useState<{ from: number; to: number } | null>(
    null
  );
  const [latestBarAgeSec, setLatestBarAgeSec] = useState<number | null>(null);
  const [lastLiveUpdate, setLastLiveUpdate] = useState<number | null>(null);
  const [chartLiveFrozen, setChartLiveFrozen] = useState(false);
  const [ohlcAudit, setOhlcAudit] = useState<OhlcAuditState | null>(null);
  const [barsVersion, setBarsVersion] = useState(0);
  const [backfillState, setBackfillState] = useState<{
    active: boolean;
    bars: number;
    mode: "live" | "full";
  }>({
    active: false,
    bars: 0,
    mode: "live",
  });
  const [fullRunRequested, setFullRunRequested] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const chartHotCacheKey = useMemo(
    () => buildChartHotCacheKey(effectiveRunId, activeStrategy, fullRunRequested),
    [effectiveRunId, activeStrategy, fullRunRequested]
  );
  const minChartTimeframeSeconds = useMemo(
    () => resolveMinChartTimeframeSeconds(ohlcAudit?.meta ?? null),
    [ohlcAudit?.meta]
  );
  const chartTimeframeOptions = useMemo(
    () => getSupportedChartTimeframes(allowedTimeframes, minChartTimeframeSeconds),
    [allowedTimeframes, minChartTimeframeSeconds]
  );
  const supportsNativeLiveBars = timeframe.seconds === minChartTimeframeSeconds;
  const [chartFrozen, setChartFrozen] = useState<ChartFrozenState>({
    active: false,
    reason: "",
    badge: null,
    degraded: false,
  });
  const loadingRef = useRef(false);
  const initialRangeSetRef = useRef(false);
  const lastUserRangeRef = useRef<{ from: number; to: number } | null>(null);
  const lastUserInteractionRef = useRef<number | null>(null);
  const autoFollowEnabledRef = useRef(false);
  const barsRef = useRef<Ohlc[]>([]);
  const rawBarsRef = useRef<Ohlc[]>([]);
  const lastAggTsRef = useRef<number | null>(null);
  const seriesInitializedRef = useRef(false);
  const [seriesReady, setSeriesReady] = useState(false);
  const tfChangeInProgressRef = useRef(false);
  const runWindowRef = useRef<{ start: string; end: string } | null>(null);
  const liveWindowRef = useRef<{ start: string; end: string } | null>(null);
  const lastWindowUpdateRef = useRef<number>(0);
  const liveFetchInFlightRef = useRef(false);
  const isVisibleRef = useRef(isViewVisible);
  const initialFetchAbortRef = useRef<AbortController | null>(null);
  const liveOhlcAbortRef = useRef<AbortController | null>(null);
  const fullRunRequestedRef = useRef(false);
  const chartModeEpochRef = useRef(0);
  const chartLiveFrozenRef = useRef(false);
  const systemStatusRef = useRef<SystemStatus | null>(null);
  const ohlcAuditRef = useRef<OhlcAuditState | null>(null);
  const liveUiFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queuedLiveUiRef = useRef<{
    price: number | null;
    spread: number | null;
    lastLiveUpdate: number | null;
  }>({
    price: null,
    spread: null,
    lastLiveUpdate: null,
  });
  const wsConnectedRef = useRef(false);
  const wsLastLiveUpdateRef = useRef<number>(0);
  const chartDisposedRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const lockedVisibleRangeRef = useRef<{ from: number; to: number } | null>(null);
  const userViewportInteractionUntilRef = useRef<number>(0);
  const devCandleRef = useRef<{
    barTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
  } | null>(null);

  const syncOhlcAudit = useCallback((payload?: OhlcPayload | null) => {
    if (!payload) {
      ohlcAuditRef.current = null;
      setOhlcAudit(null);
      return;
    }
    const nextAudit = {
      state: payload.state ?? null,
      meta: payload.meta ?? null,
    };
    ohlcAuditRef.current = nextAudit;
    setOhlcAudit(nextAudit);
  }, []);

  const setLatestPriceIfChanged = (price: number | null | undefined) => {
    const normalized = Number.isFinite(price as number) ? (price as number) : null;
    setLatestPrice((prev) => (prev === normalized ? prev : normalized));
  };

  const flushQueuedLiveUi = useCallback((immediate = false) => {
    const apply = () => {
      liveUiFlushTimerRef.current = null;
      const next = queuedLiveUiRef.current;
      startTransition(() => {
        setLatestPrice((prev) => (prev === next.price ? prev : next.price));
        setLatestSpread((prev) => (prev === next.spread ? prev : next.spread));
        if (next.lastLiveUpdate != null) {
          setLastLiveUpdate((prev) =>
            prev === next.lastLiveUpdate ? prev : next.lastLiveUpdate
          );
        }
      });
    };

    if (immediate) {
      if (liveUiFlushTimerRef.current) {
        clearTimeout(liveUiFlushTimerRef.current);
        liveUiFlushTimerRef.current = null;
      }
      apply();
      return;
    }

    if (liveUiFlushTimerRef.current) return;
    liveUiFlushTimerRef.current = window.setTimeout(apply, LIVE_UI_UPDATE_MS);
  }, []);

  const queueLiveUiUpdate = useCallback(
    (
      price: number | null | undefined,
      spread: number | null | undefined,
      options?: { touchLive?: boolean; immediate?: boolean }
    ) => {
      queuedLiveUiRef.current = {
        price:
          price === undefined
            ? queuedLiveUiRef.current.price
            : Number.isFinite(price as number)
              ? (price as number)
              : null,
        spread:
          spread === undefined
            ? queuedLiveUiRef.current.spread
            : Number.isFinite(spread as number)
              ? (spread as number)
              : null,
        lastLiveUpdate: options?.touchLive
          ? Date.now()
          : queuedLiveUiRef.current.lastLiveUpdate,
      };
      flushQueuedLiveUi(options?.immediate ?? false);
    },
    [flushQueuedLiveUi]
  );

  const bumpBarsVersion = () => setBarsVersion((value) => value + 1);

  useEffect(() => {
    return () => {
      if (liveUiFlushTimerRef.current) {
        clearTimeout(liveUiFlushTimerRef.current);
        liveUiFlushTimerRef.current = null;
      }
    };
  }, []);

  const normalizeVisibleRange = useCallback(
    (range: { from: Time; to: Time } | null): { from: number; to: number } | null => {
      if (!range) return null;
      if (typeof range.from !== "number" || typeof range.to !== "number") return null;
      if (!Number.isFinite(range.from) || !Number.isFinite(range.to)) return null;
      return { from: range.from, to: range.to };
    },
    []
  );

  const readVisibleRange = useCallback(
    (): { from: number; to: number } | null =>
      normalizeVisibleRange(chartRef.current?.timeScale().getVisibleRange() ?? null),
    [normalizeVisibleRange]
  );

  const markUserViewportInteraction = useCallback(() => {
    userViewportInteractionUntilRef.current = Date.now() + USER_VIEWPORT_INTERACTION_MS;
  }, []);

  const setVisibleRangeIfChanged = useCallback(
    (range: { from: number; to: number } | null) => {
      startTransition(() => {
        setVisibleRange((prev) => {
          if (prev && range && prev.from === range.from && prev.to === range.to) {
            return prev;
          }
          if (!prev && !range) return prev;
          return range;
        });
      });
    },
    []
  );

  const enforceLockedVisibleRange = useCallback((): void => {
    const chart = chartRef.current;
    const locked = lockedVisibleRangeRef.current;
    if (!chart || !locked || !chartLiveFrozenRef.current || fullRunRequested) return;
    const after = readVisibleRange();
    if (!after) return;
    if (
      Math.abs(after.from - locked.from) <= RANGE_SHIFT_EPSILON_SEC &&
      Math.abs(after.to - locked.to) <= RANGE_SHIFT_EPSILON_SEC
    ) {
      return;
    }
    programmaticScrollRef.current = true;
    chart.timeScale().setVisibleRange(locked as any);
    Promise.resolve().then(() => {
      programmaticScrollRef.current = false;
    });
  }, [fullRunRequested, readVisibleRange]);

  const clearReflexLines = useCallback(() => {
    if (!candleSeriesRef.current) return;
    reflexLinesRef.current.forEach((line) => {
      try {
        candleSeriesRef.current?.removePriceLine(line);
      } catch {
        // ignore
      }
    });
    reflexLinesRef.current = [];
    lastReflexKeyRef.current = null;
  }, []);

  const syncReflexLines = useCallback(
    (reflex: LiveTick["reflex"] | null | undefined) => {
      if (!candleSeriesRef.current) return;

      const active = Boolean(reflex && reflex.active);
      const target = reflex?.target_price;
      if (!active || target == null || !Number.isFinite(target)) {
        if (lastReflexKeyRef.current != null) clearReflexLines();
        return;
      }

      const anchor = reflex?.anchor_price;
      const peak = reflex?.peak_price;
      const dir = (reflex?.direction || "").toUpperCase();
      const threshold = reflex?.retrace_threshold;
      const retrace = reflex?.retrace_ratio;
      const remaining = reflex?.remaining_s;
      const park = Boolean(reflex?.park_spread_active);
      const exhaustion = Boolean(reflex?.exhaustion_wait_active);
      const okTicks = reflex?.exhaustion_ok_ticks;
      const needTicks = reflex?.exhaustion_need_ticks;

      const r5 = (value: number | null | undefined) =>
        value != null && Number.isFinite(value) ? Number(value.toFixed(FX_DECIMALS)) : null;
      const remainingS =
        remaining != null && Number.isFinite(remaining)
          ? Math.max(0, Math.round(remaining))
          : null;
      const thresholdPct =
        threshold != null && Number.isFinite(threshold)
          ? Math.round(threshold * 100)
          : null;
      const progressPct =
        threshold != null &&
        retrace != null &&
        Number.isFinite(threshold) &&
        Number.isFinite(retrace) &&
        threshold > 0
          ? Math.max(0, Math.min(999, Math.round((retrace / threshold) * 100)))
          : null;

      const key = [
        dir,
        r5(target),
        r5(anchor),
        r5(peak),
        thresholdPct,
        remainingS,
        park ? "park" : "",
        exhaustion ? `exh:${okTicks ?? "?"}/${needTicks ?? "?"}` : "",
      ].join("|");
      if (key === lastReflexKeyRef.current) return;

      clearReflexLines();

      if (anchor != null && Number.isFinite(anchor)) {
        const line = candleSeriesRef.current.createPriceLine({
          price: anchor,
          color: CHART_COLORS.reflexAnchor,
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: false,
          title: "Anchor",
        } as PriceLineOptions);
        if (line) reflexLinesRef.current.push(line);
      }
      if (peak != null && Number.isFinite(peak)) {
        const line = candleSeriesRef.current.createPriceLine({
          price: peak,
          color: CHART_COLORS.reflexPeak,
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: false,
          title: "Peak",
        } as PriceLineOptions);
        if (line) reflexLinesRef.current.push(line);
      }

      const ttlLabel = remainingS != null ? ` ttl=${remainingS}s` : "";
      const thrLabel = thresholdPct != null ? ` r=${thresholdPct}%` : "";
      const progLabel = progressPct != null ? ` prog=${progressPct}%` : "";
      const flags = park ? " PARK" : exhaustion ? " EXH" : "";

      const title = `REFLEX ${dir} @${target.toFixed(FX_DECIMALS)}${thrLabel}${progLabel}${ttlLabel}${flags}`;
      const targetLine = candleSeriesRef.current.createPriceLine({
        price: target,
        color: CHART_COLORS.reflexTarget,
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title,
      } as PriceLineOptions);
      if (targetLine) reflexLinesRef.current.push(targetLine);

      lastReflexKeyRef.current = key;
    },
    [clearReflexLines]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = () => markUserViewportInteraction();
    const onPointer = () => markUserViewportInteraction();
    const onMove = () => markUserViewportInteraction();
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("mousedown", onPointer);
    el.addEventListener("mousemove", onMove, { passive: true });
    el.addEventListener("touchstart", onPointer, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("mousedown", onPointer);
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("touchstart", onPointer);
      el.removeEventListener("touchmove", onMove);
    };
  }, [markUserViewportInteraction]);

  const wsOnTick = useCallback(
    (tick: LiveTick) => {
      if (chartDisposedRef.current) return;
      if (fullRunRequestedRef.current) return;
      if (!candleSeriesRef.current || !seriesInitializedRef.current || !barsRef.current.length) {
        return;
      }
      if (!isVisibleRef.current) return;
      const mid = tick.mid;
      if (mid == null || !Number.isFinite(mid)) return;
      if (chartLiveFrozenRef.current) {
        const now = Date.now();
        queueLiveUiUpdate(mid, tick.spread_pips, {
          touchLive:
            !wsLastLiveUpdateRef.current || now - wsLastLiveUpdateRef.current >= 1000,
        });
        if (!wsLastLiveUpdateRef.current || now - wsLastLiveUpdateRef.current >= 1000) {
          wsLastLiveUpdateRef.current = now;
        }
        return;
      }

      const tfSec = timeframe.seconds;
      const nowSec = Math.floor(Date.now() / 1000);
      const barTime = nowSec - (nowSec % tfSec);

      const dev = devCandleRef.current;
      if (dev && dev.barTime < barTime) {
        const promotedBar: Ohlc = {
          timestamp: new Date(dev.barTime * 1000).toISOString(),
          open: dev.open,
          high: dev.high,
          low: dev.low,
          close: dev.close,
          volume: 0,
          tick_count: 0,
          spread_close_pips: tick.spread_pips ?? null,
        } as Ohlc;
        const lastConfirmedMs = lastAggTsRef.current;
        const promotedMs = dev.barTime * 1000;
        if (!lastConfirmedMs || promotedMs > lastConfirmedMs) {
          barsRef.current.push(promotedBar);
          rawBarsRef.current = [...rawBarsRef.current, promotedBar];
          lastAggTsRef.current = promotedMs;
          candleSeriesRef.current.update({
            time: dev.barTime as any,
            open: dev.open,
            high: dev.high,
            low: dev.low,
            close: dev.close,
          } as any);
        }
        devCandleRef.current = { barTime, open: mid, high: mid, low: mid, close: mid };
      } else if (dev && dev.barTime === barTime) {
        dev.high = Math.max(dev.high, mid);
        dev.low = Math.min(dev.low, mid);
        dev.close = mid;
      } else {
        devCandleRef.current = { barTime, open: mid, high: mid, low: mid, close: mid };
      }

      const lastConfirmedMs = lastAggTsRef.current;
      const lastConfirmedSec = lastConfirmedMs ? Math.floor(lastConfirmedMs / 1000) : null;
      if (lastConfirmedSec && barTime > lastConfirmedSec + tfSec) {
        const lastClose = barsRef.current[barsRef.current.length - 1].close;
        for (let fillTime = lastConfirmedSec + tfSec; fillTime < barTime; fillTime += tfSec) {
          candleSeriesRef.current.update({
            time: fillTime as any,
            open: lastClose,
            high: lastClose,
            low: lastClose,
            close: lastClose,
          } as any);
          if (spreadSeriesRef.current && Number.isFinite(tick.spread_pips)) {
            spreadSeriesRef.current.update({
              time: fillTime as any,
              value: tick.spread_pips,
            } as any);
          }
        }
      }

      const developing = devCandleRef.current!;
      candleSeriesRef.current.update({
        time: developing.barTime as any,
        open: developing.open,
        high: developing.high,
        low: developing.low,
        close: developing.close,
      } as any);

      if (spreadSeriesRef.current && Number.isFinite(tick.spread_pips)) {
        spreadSeriesRef.current.update({
          time: developing.barTime as any,
          value: tick.spread_pips,
        } as any);
      }

      const now = Date.now();
      const touchLive =
        !wsLastLiveUpdateRef.current || now - wsLastLiveUpdateRef.current >= 1000;
      queueLiveUiUpdate(mid, tick.spread_pips, { touchLive });
      if (touchLive) {
        wsLastLiveUpdateRef.current = now;
        syncReflexLines(tick.reflex);
      }
      enforceLockedVisibleRange();
    },
    [
      enforceLockedVisibleRange,
      queueLiveUiUpdate,
      syncReflexLines,
      timeframe.seconds,
    ]
  );

  const wsOnNewBar = useCallback(
    (bar: Ohlc) => {
      if (chartDisposedRef.current) return;
      if (fullRunRequestedRef.current) return;
      if (!candleSeriesRef.current || !seriesInitializedRef.current) return;
      if (!isValidBar(bar)) return;
      if (!supportsNativeLiveBars || chartLiveFrozenRef.current) {
        queueLiveUiUpdate(bar?.close ?? null, bar?.spread_close_pips ?? null, {
          touchLive: true,
        });
        return;
      }

      const barTs = Date.parse(bar.timestamp);
      const lastKnown = lastAggTsRef.current;

      if (lastKnown && barTs <= lastKnown) {
        barsRef.current[barsRef.current.length - 1] = bar;
        const point = toChartBar(bar);
        if (point && Number.isFinite(point.time as number)) {
          candleSeriesRef.current.update(point as any);
          if (spreadSeriesRef.current && Number.isFinite(bar.spread_close_pips)) {
            spreadSeriesRef.current.update({
              time: point.time,
              value: bar.spread_close_pips,
            } as any);
          }
        }
      } else {
        rawBarsRef.current.push(bar);
        barsRef.current.push(bar);
        const point = toChartBar(bar);
        if (point && Number.isFinite(point.time as number)) {
          candleSeriesRef.current.update(point as any);
          if (spreadSeriesRef.current && Number.isFinite(bar.spread_close_pips)) {
            spreadSeriesRef.current.update({
              time: point.time,
              value: bar.spread_close_pips,
            } as any);
          }
        }
        lastAggTsRef.current = barTs;
        bumpBarsVersion();
      }
      queueLiveUiUpdate(bar?.close ?? null, bar?.spread_close_pips ?? null, {
        touchLive: true,
      });

      const devTs = devCandleRef.current?.barTime;
      if (devTs != null && devTs <= Math.floor(barTs / 1000)) {
        devCandleRef.current = null;
      }
      enforceLockedVisibleRange();
    },
    [
      enforceLockedVisibleRange,
      queueLiveUiUpdate,
      supportsNativeLiveBars,
    ]
  );

  const wsOnBarUpdate = useCallback(
    (bar: Ohlc) => {
      if (chartDisposedRef.current) return;
      if (fullRunRequestedRef.current) return;
      if (!candleSeriesRef.current || !seriesInitializedRef.current || !barsRef.current.length) {
        return;
      }
      if (!isValidBar(bar)) return;
      if (!supportsNativeLiveBars || chartLiveFrozenRef.current) {
        queueLiveUiUpdate(bar?.close ?? null, bar?.spread_close_pips ?? null);
        return;
      }
      const barTs = Date.parse(bar.timestamp);
      const lastTs = lastAggTsRef.current;
      if (lastTs && barTs === lastTs) {
        barsRef.current[barsRef.current.length - 1] = bar;
        const point = toChartBar(bar);
        if (point && Number.isFinite(point.time as number)) {
          candleSeriesRef.current.update(point as any);
          if (spreadSeriesRef.current && Number.isFinite(bar.spread_close_pips)) {
            spreadSeriesRef.current.update({
              time: point.time,
              value: bar.spread_close_pips,
            } as any);
          }
        }
        queueLiveUiUpdate(bar.close ?? null, bar.spread_close_pips ?? null);
        enforceLockedVisibleRange();
      }
    },
    [
      enforceLockedVisibleRange,
      queueLiveUiUpdate,
      supportsNativeLiveBars,
    ]
  );

  const { status: wsStatus } = useLiveStream(
    !!effectiveRunId && seriesReady && isViewVisible && !fullRunRequested,
    { onTick: wsOnTick, onNewBar: wsOnNewBar, onBarUpdate: wsOnBarUpdate },
    {
      runId: effectiveRunId,
      strategyId: activeStrategy,
      disableHttpFallback: true,
    }
  );
  wsConnectedRef.current = wsStatus === "connected";

  const getLatestChartTimeSec = useCallback((): number | null => {
    const devSec = devCandleRef.current?.barTime;
    if (devSec != null && Number.isFinite(devSec)) return devSec;
    const lastMs = lastAggTsRef.current;
    if (lastMs == null || !Number.isFinite(lastMs)) return null;
    return Math.floor(lastMs / 1000);
  }, []);

  const snapToLoadedBarTime = useCallback(
    (ts: string | null | undefined, allowBucketFallback = true): number | null =>
      snapTimestampToLoadedBarTime(
        ts,
        barsRef.current ?? [],
        timeframe.seconds,
        allowBucketFallback
      ),
    [timeframe.seconds]
  );

  const setRunWindowSafe = useCallback((window: { start: string; end: string } | null) => {
    runWindowRef.current = window;
    setRunWindow(window);
  }, []);

  const updateLiveWindowState = useCallback(
    (window: { start: string; end: string }) => {
      liveWindowRef.current = window;
      const now = Date.now();
      if (!runWindowRef.current || now - lastWindowUpdateRef.current >= LIVE_WINDOW_STATE_UPDATE_MS) {
        lastWindowUpdateRef.current = now;
        setRunWindowSafe(window);
      }
    },
    [setRunWindowSafe]
  );

  useEffect(() => {
    chartLiveFrozenRef.current = chartLiveFrozen;
  }, [chartLiveFrozen]);

  useEffect(() => {
    fullRunRequestedRef.current = fullRunRequested;
  }, [fullRunRequested]);

  useEffect(() => {
    systemStatusRef.current = systemStatus;
  }, [systemStatus]);

  const applyBarsToChart = useCallback(
    (
      rawBars: Ohlc[],
      sys: SystemStatus | null,
      window: { start: string; end: string } | null,
      meta?: { reason?: string | null; data_origin?: string | null } | null,
      options?: { forceViewportReset?: boolean }
    ) => {
      const sanitizedRaw = rawBars.filter((bar) => isValidBar(bar));
      rawBarsRef.current = sanitizedRaw;

      let sanitizedBars = sanitizedRaw;
      if (window) {
        const startMs = Date.parse(window.start);
        const endMs = Date.parse(window.end);
        const filtered = sanitizedBars.filter((bar) => {
          const ts = Date.parse(bar.timestamp);
          return ts >= startMs && ts <= endMs;
        });
        if (filtered.length > 0) {
          sanitizedBars = filtered;
        }
      }

      if ((!sanitizedBars || sanitizedBars.length === 0) && sanitizedRaw.length) {
        sanitizedBars = sanitizedRaw.slice(-FALLBACK_MIN_BARS);
      }

      if (!sanitizedBars || sanitizedBars.length === 0) {
        const details = [
          meta?.reason ? `reason ${meta.reason}` : null,
          meta?.data_origin ? `origin ${meta.data_origin}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        setError(details ? `No OHLC data (${details})` : "No OHLC data available");
        setLatestPriceIfChanged(null);
        setDataSource("NONE");
        return false;
      }

      const maxCandles = getMaxCandlesForWindow(timeframe.seconds, window);
      const aggregated = aggregateCandles(sanitizedBars, timeframe.seconds, maxCandles);

      barsRef.current = aggregated;
      lastAggTsRef.current = aggregated.length
        ? Date.parse(aggregated[aggregated.length - 1].timestamp)
        : null;
      const latest = aggregated.length ? aggregated[aggregated.length - 1] : null;
      setLatestPriceIfChanged(latest?.close ?? null);
      setLatestSpread(latest?.spread_close_pips ?? null);

      const resolvedOrigin = (meta?.data_origin as string | null) ?? runDataOrigin ?? null;
      if (resolvedOrigin === "CANONICAL") {
        setDataSource("CANONICAL");
      } else if (resolvedOrigin === "LEGACY" || resolvedOrigin === "RUN") {
        setDataSource("LEGACY");
      } else if (isCanonical) {
        setDataSource("CANONICAL");
      } else {
        setDataSource("NONE");
      }

      const withTime = aggregated
        .map((bar) => {
          const time = toTime(bar.timestamp);
          return { bar, time };
        })
        .filter(({ time }) => time != null) as { bar: Ohlc; time: number }[];
      const sorted = sortByTime(withTime);

      const candleData = ensureAscending(
        sorted
          .map(({ bar, time }) => ({
            time,
            open: Number(bar.open),
            high: Number(bar.high),
            low: Number(bar.low),
            close: Number(bar.close),
          }))
          .filter(
            (point) =>
              Number.isFinite(point.time) &&
              Number.isFinite(point.open) &&
              Number.isFinite(point.high) &&
              Number.isFinite(point.low) &&
              Number.isFinite(point.close)
          )
      ) as any[];

      const latestBar = aggregated.length ? aggregated[aggregated.length - 1] : null;
      const barAgeSeconds = latestBar
        ? Math.max(0, (Date.now() - Date.parse(latestBar.timestamp)) / 1000)
        : null;
      setLatestBarAgeSec(barAgeSeconds);

      const freezeState = computeFreezeState(sys ?? null, timeframe.seconds, barAgeSeconds);
      setChartFrozen(freezeState);

      if (candleSeriesRef.current && candleData.length) {
        try {
          candleSeriesRef.current.setData(candleData);
          candleSeriesRef.current.priceScale().applyOptions({
            autoScale: true,
            scaleMargins: { top: 0.1, bottom: 0.1 },
          });
          seriesInitializedRef.current = true;
          setSeriesReady(true);
        } catch (chartError: any) {
          setError(chartError?.message || "Set data error");
          return false;
        }
      }

      if (chartRef.current) {
        const spacing = computeBarSpacing(timeframe.seconds, candleData.length);
        chartRef.current.timeScale().applyOptions({
          barSpacing: spacing,
          minBarSpacing: Math.max(1.4, spacing * 0.6),
          rightOffset: getChartRightOffsetBars(
            timeframe.seconds,
            latestTradeTimeSec,
            getLatestChartTimeSec()
          ),
        });
      }

      const atrSeries = computeAtr(sorted.map(({ bar }) => bar), 14);
      if (
        atrUpperRef.current &&
        atrLowerRef.current &&
        candleData.length === atrSeries.length
      ) {
        const upper = atrSeries.map((atr, index) => ({
          time: candleData[index].time,
          value: sorted[index].bar.close + atr,
        }));
        const lower = atrSeries.map((atr, index) => ({
          time: candleData[index].time,
          value: sorted[index].bar.close - atr,
        }));
        atrUpperRef.current.setData(upper as any);
        atrLowerRef.current.setData(lower as any);
      }

      const { high: sessionHigh, low: sessionLow } = getSessionLevels(
        sorted.map(({ bar }) => bar)
      );
      if (sessionHighRef.current && sessionLowRef.current && candleData.length) {
        const first = candleData[0].time;
        const last = candleData[candleData.length - 1].time;
        sessionHighRef.current.setData([
          { time: first, value: sessionHigh },
          { time: last, value: sessionHigh },
        ] as any);
        sessionLowRef.current.setData([
          { time: first, value: sessionLow },
          { time: last, value: sessionLow },
        ] as any);
      }

      if (volumeSeriesRef.current) {
        const volumes = candleData.map((candle, index) => ({
          time: candle.time,
          value: sorted[index].bar.volume ?? sorted[index].bar.tick_count ?? 0,
          color: "rgba(255,255,255,0.15)",
        })) as any[];
        if (timeframe.seconds <= 5) {
          volumeSeriesRef.current.setData([]);
        } else if (volumes.length) {
          volumeSeriesRef.current.setData(volumes);
        }
      }

      if (spreadSeriesRef.current) {
        const spreadData = candleData
          .map((candle, index) => {
            const spread = sorted[index].bar.spread_close_pips;
            if (spread == null || !Number.isFinite(spread)) return null;
            return { time: candle.time, value: spread };
          })
          .filter(Boolean) as any[];
        spreadSeriesRef.current.setData(spreadData);
      }

      bumpBarsVersion();

      if (chartRef.current && candleData.length) {
        const shouldResetViewport =
          !lastUserRangeRef.current &&
          (!initialRangeSetRef.current || options?.forceViewportReset);
        if (shouldResetViewport) {
          programmaticScrollRef.current = true;
          if (fullRunRequested) {
            chartRef.current.timeScale().fitContent();
            const fromT = candleData[0].time;
            const toT = candleData[candleData.length - 1].time;
            if (typeof fromT === "number" && typeof toT === "number") {
              const fullRange = { from: fromT, to: toT };
              initialRangeSetRef.current = true;
              setVisibleRangeIfChanged(fullRange);
            }
          } else {
            const targetWindow = getVisibleCandlesForTimeframe(timeframe.seconds);
            const fromIdx = Math.max(0, candleData.length - targetWindow);
            const range = {
              from: candleData[fromIdx].time,
              to: candleData[candleData.length - 1].time,
            };
            chartRef.current.timeScale().setVisibleRange(range);
            if (typeof range.from === "number" && typeof range.to === "number") {
              initialRangeSetRef.current = true;
              lastUserRangeRef.current = range as { from: number; to: number };
              lockedVisibleRangeRef.current = range as { from: number; to: number };
              setVisibleRangeIfChanged(range as { from: number; to: number });
            }
          }
          Promise.resolve().then(() => {
            programmaticScrollRef.current = false;
          });
        }
      }

      const latestAtr = atrSeries.length ? atrSeries[atrSeries.length - 1] : 0;
      const regime = latestAtr > 0.0015 ? "HIGH" : latestAtr > 0.0008 ? "MED" : "LOW";
      setRegimeInfo({ atr: latestAtr * 10000, regime, sessionHigh, sessionLow });
      setError(null);
      return true;
    },
    [
      fullRunRequested,
      getLatestChartTimeSec,
      isCanonical,
      latestTradeTimeSec,
      runDataOrigin,
      setVisibleRangeIfChanged,
      timeframe.seconds,
    ]
  );

  useEffect(() => {
    if (bootTimeframeAppliedRef.current) return;
    const tf5s = TIMEFRAMES.find((candidate) => candidate.label === "5s");
    if (tf5s && timeframe.seconds !== tf5s.seconds) {
      setTimeframe(tf5s);
    }
    bootTimeframeAppliedRef.current = true;
  }, [timeframe.seconds, setTimeframe]);

  useEffect(() => {
    if (timeframe.seconds >= minChartTimeframeSeconds) return;
    const fallback =
      chartTimeframeOptions.find((candidate) => !candidate.disabled) ??
      TIMEFRAMES.find((candidate) => candidate.seconds >= minChartTimeframeSeconds);
    if (fallback && fallback.seconds !== timeframe.seconds) {
      setTimeframe(fallback);
    }
  }, [
    chartTimeframeOptions,
    minChartTimeframeSeconds,
    setTimeframe,
    timeframe.seconds,
  ]);

  useEffect(() => {
    rawBarsRef.current = [];
    lockedVisibleRangeRef.current = null;
    userViewportInteractionUntilRef.current = 0;
    devCandleRef.current = null;
  }, [effectiveRunId]);

  useEffect(() => {
    chartLiveFrozenRef.current = chartLiveFrozen;
  }, [chartLiveFrozen]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const nextOffset = getChartRightOffsetBars(
      timeframe.seconds,
      latestTradeTimeSec,
      getLatestChartTimeSec()
    );
    // In full-run mode, live writes are already disabled. Keeping the dynamic
    // rightOffset here lets the user reach a legitimate trade marker that sits
    // slightly to the right of the last loaded OHLC bar without reintroducing
    // the live drift bug.
    if (lastAppliedRightOffsetRef.current === nextOffset) return;
    lastAppliedRightOffsetRef.current = nextOffset;
    chart.timeScale().applyOptions({ rightOffset: nextOffset });
  }, [barsVersion, fullRunRequested, getLatestChartTimeSec, latestTradeTimeSec, timeframe.seconds]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    chartDisposedRef.current = false;

    try {
      const chart = createChart(el, {
        autoSize: true,
        layout: {
          background: { color: "rgba(8, 10, 18, 0.95)" },
          textColor: "#94a3b8",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: "rgba(255,255,255,0.025)" },
          horzLines: { color: "rgba(255,255,255,0.025)" },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          horzLine: {
            labelVisible: true,
            color: "rgba(148, 163, 184, 0.3)",
            width: 1,
            style: LineStyle.Dashed,
            labelBackgroundColor: "rgba(30, 41, 59, 0.9)",
          },
          vertLine: {
            color: "rgba(148, 163, 184, 0.3)",
            width: 1,
            style: LineStyle.Dashed,
            labelBackgroundColor: "rgba(30, 41, 59, 0.9)",
          },
        },
        rightPriceScale: {
          borderColor: "rgba(255,255,255,0.08)",
          autoScale: true,
          scaleMargins: { top: 0.08, bottom: 0.15 },
        },
        timeScale: {
          borderColor: "rgba(255,255,255,0.08)",
          timeVisible: true,
          secondsVisible: true,
          rightOffset: getChartRightOffsetBars(timeframe.seconds),
          rightBarStaysOnScroll: false,
          shiftVisibleRangeOnNewBar: false,
          lockVisibleTimeRangeOnResize: true,
        },
        handleScale: {
          axisPressedMouseMove: true,
          mouseWheel: true,
          pinch: true,
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
        },
        localization: {
          priceFormatter: (price: number) => price.toFixed(FX_DECIMALS),
        },
      });

      const candleSeries = chart.addCandlestickSeries({
        upColor: CHART_COLORS.candleUp,
        downColor: CHART_COLORS.candleDown,
        borderVisible: false,
        wickUpColor: "rgba(34, 197, 94, 0.7)",
        wickDownColor: "rgba(239, 68, 68, 0.7)",
        priceFormat: {
          type: "price",
          precision: FX_DECIMALS,
          minMove: 0.00001,
        },
      });

      const volumeSeries = chart.addHistogramSeries({
        priceScaleId: "volume",
        priceFormat: { type: "volume" },
        priceLineVisible: false,
        color: "rgba(255,255,255,0.08)",
        base: 0,
      });

      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.88, bottom: 0 },
      });
      candleSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.05, bottom: 0.15 },
      });

      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;
      volumeSeriesRef.current = volumeSeries;
      atrUpperRef.current = chart.addLineSeries({
        color: CHART_COLORS.atrUpper,
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        priceFormat: { type: "price", precision: FX_DECIMALS, minMove: 0.00001 },
      });
      atrLowerRef.current = chart.addLineSeries({
        color: CHART_COLORS.atrLower,
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        priceFormat: { type: "price", precision: FX_DECIMALS, minMove: 0.00001 },
      });
      sessionHighRef.current = chart.addLineSeries({
        color: CHART_COLORS.sessionHigh,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        priceFormat: { type: "price", precision: FX_DECIMALS, minMove: 0.00001 },
      });
      sessionLowRef.current = chart.addLineSeries({
        color: CHART_COLORS.sessionLow,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        priceFormat: { type: "price", precision: FX_DECIMALS, minMove: 0.00001 },
      });

      const spreadSeries = chart.addLineSeries({
        priceScaleId: "spread",
        color: CHART_COLORS.spreadLine,
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        priceLineVisible: false,
        crosshairMarkerVisible: true,
        lastValueVisible: true,
        priceFormat: {
          type: "custom",
          formatter: (price: number) => `${price.toFixed(1)}p`,
          minMove: 0.01,
        },
      });
      chart.priceScale("spread").applyOptions({
        scaleMargins: { top: 0.9, bottom: 0.01 },
        borderVisible: false,
      });
      const spreadThreshold = spreadSeries.createPriceLine({
        price: 0.4,
        color: CHART_COLORS.spreadThreshold,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "max",
      });
      spreadSeriesRef.current = spreadSeries;
      spreadThresholdLineRef.current = spreadThreshold;

      return () => {
        chartDisposedRef.current = true;
        candleSeriesRef.current = null;
        spreadSeriesRef.current = null;
        spreadThresholdLineRef.current = null;
        volumeSeriesRef.current = null;
        atrUpperRef.current = null;
        atrLowerRef.current = null;
        sessionHighRef.current = null;
        sessionLowRef.current = null;
        seriesInitializedRef.current = false;
        devCandleRef.current = null;
        reflexLinesRef.current = [];
        lastReflexKeyRef.current = null;
        lastAppliedRightOffsetRef.current = null;
        chart.remove();
        chartRef.current = null;
      };
    } catch (chartError: any) {
      setError(chartError?.message || "Chart init error");
    }
  }, [timeframe.seconds]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const markUserInteraction = () => {
      lastUserInteractionRef.current = Date.now();
    };
    el.addEventListener("mousedown", markUserInteraction, { passive: true });
    el.addEventListener("wheel", markUserInteraction, { passive: true });
    el.addEventListener("touchstart", markUserInteraction, { passive: true });
    return () => {
      el.removeEventListener("mousedown", markUserInteraction);
      el.removeEventListener("wheel", markUserInteraction);
      el.removeEventListener("touchstart", markUserInteraction);
    };
  }, []);

  useEffect(() => {
    const line = spreadThresholdLineRef.current;
    const maxSpreadFromBotRaw = systemStatus?.max_spread_pips;
    const maxSpreadFromBot = Number.isFinite(maxSpreadFromBotRaw)
      ? Number(maxSpreadFromBotRaw)
      : null;
    if (!line || maxSpreadFromBot == null || maxSpreadFromBot <= 0) return;
    line.applyOptions({ price: maxSpreadFromBot });
  }, [systemStatus]);

  const fetchFullOhlcForWindow = useCallback(
    async (
      window: { start: string; end: string },
      signal?: AbortSignal
    ): Promise<Ohlc[]> => {
      if (!effectiveRunId) return [];
      const startMs = Date.parse(window.start);
      let cursor = window.end;
      const chunks: Ohlc[][] = [];
      let fetched = 0;

      setBackfillState({
        active: true,
        bars: 0,
        mode: fullRunRequestedRef.current ? "full" : "live",
      });
      while (cursor && Date.parse(cursor) > startMs && fetched < OHLC_BACKFILL_MAX_BARS) {
        const payload = await api.getOhlcForRun(
          OHLC_BACKFILL_LIMIT,
          effectiveRunId,
          undefined,
          undefined,
          { fromTs: window.start, toTs: cursor, order: "desc", signal }
        );
        const batch = (payload.ohlc ?? []).filter((bar) => isValidBar(bar));
        if (!batch.length) break;

        const sorted = batch.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
        chunks.push(sorted);
        fetched += sorted.length;
        setBackfillState({
          active: true,
          bars: fetched,
          mode: fullRunRequestedRef.current ? "full" : "live",
        });

        const oldest = sorted[0]?.timestamp;
        if (!oldest) break;
        const nextCursorMs = Date.parse(oldest) - 1;
        if (!Number.isFinite(nextCursorMs)) break;
        cursor = new Date(nextCursorMs).toISOString();
        if (Date.parse(cursor) <= startMs) break;
      }

      const collected = chunks.reverse().flat();
      setBackfillState({
        active: false,
        bars: collected.length,
        mode: fullRunRequestedRef.current ? "full" : "live",
      });
      return collected.slice(-OHLC_BACKFILL_MAX_BARS);
    },
    [effectiveRunId]
  );

  const computeEffectiveWindow = useCallback(
    (
      base: { start: string; end: string } | null,
      latestPayload: { ohlc?: Ohlc[] } | null
    ): { start: string; end: string } | null => {
      const latestTs = latestPayload?.ohlc?.length
        ? latestPayload.ohlc.reduce((maxTs, bar) => {
            const ts = Date.parse(bar.timestamp);
            return Number.isFinite(ts) && ts > maxTs ? ts : maxTs;
          }, -Infinity)
        : null;

      if (!fullRunRequested) {
        const endCandidate = getViewportEndCandidateMs(latestTs, latestTradeTimeSec);
        return buildLiveWindow(endCandidate);
      }

      return buildFullRunWindow(base, latestPayload?.ohlc ?? null, latestTradeTimeSec);
    },
    [fullRunRequested, latestTradeTimeSec]
  );

  const computeLiveWindow = useCallback(
    (latestPayload: { ohlc?: Ohlc[] } | null) => {
      const latestTs = latestPayload?.ohlc?.length
        ? latestPayload.ohlc.reduce((maxTs, bar) => {
            const ts = Date.parse(bar.timestamp);
            return Number.isFinite(ts) && ts > maxTs ? ts : maxTs;
          }, -Infinity)
        : null;
      const endCandidate = getViewportEndCandidateMs(latestTs, latestTradeTimeSec);
      return buildLiveWindow(endCandidate);
    },
    [latestTradeTimeSec]
  );

  useEffect(() => {
    isVisibleRef.current = isViewVisible;
    if (!isViewVisible) {
      initialFetchAbortRef.current?.abort();
      liveOhlcAbortRef.current?.abort();
    }
  }, [isViewVisible]);

  useEffect(() => {
    return () => {
      initialFetchAbortRef.current?.abort();
      liveOhlcAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const modeEpoch = chartModeEpochRef.current;
    loadingRef.current = false;
    tfChangeInProgressRef.current = false;
    seriesInitializedRef.current = false;
    setSeriesReady(false);
    lastAggTsRef.current = null;
    initialRangeSetRef.current = false;
    devCandleRef.current = null;

    async function loadInitial() {
      if (loadingRef.current) return;
      if (!effectiveRunId) {
        setDataSource("NONE");
        setSystemStatus(null);
        syncOhlcAudit(null);
        setChartFrozen({ active: false, reason: "", badge: null, degraded: false });
        setLatestBarAgeSec(null);
        setLatestPriceIfChanged(null);
        setLoading(false);
        return;
      }

      initialFetchAbortRef.current?.abort();
      const controller = new AbortController();
      initialFetchAbortRef.current = controller;
      loadingRef.current = true;
      try {
        if (chartModeEpochRef.current !== modeEpoch) return;
        tfChangeInProgressRef.current = true;
        seriesInitializedRef.current = false;
        setSeriesReady(false);
        setBackfillState({
          active: false,
          bars: 0,
          mode: fullRunRequested ? "full" : "live",
        });

        const cached = readChartHotCache(chartHotCacheKey);
        const liveFallbackCache =
          fullRunRequested && !cached
            ? readChartHotCache(
                buildChartHotCacheKey(effectiveRunId, activeStrategy, false)
              )
            : null;
        const warmEntry =
          cached ??
          (liveFallbackCache?.rawBars?.length
            ? liveFallbackCache
            : rawBarsRef.current.length
              ? {
                  rawBars: [...rawBarsRef.current],
                  systemStatus: systemStatusRef.current,
                  window:
                    liveWindowRef.current ??
                    computeLiveWindow({ ohlc: rawBarsRef.current }),
                  ohlcState: ohlcAuditRef.current?.state ?? null,
                  ohlcMeta: ohlcAuditRef.current?.meta ?? null,
                }
              : null);

        setLoading(!warmEntry);

        if (warmEntry) {
          if (controller.signal.aborted || chartModeEpochRef.current !== modeEpoch) return;
          setSystemStatus(warmEntry.systemStatus);
          syncOhlcAudit({
            state: warmEntry.ohlcState,
            ohlc: warmEntry.rawBars,
            meta: warmEntry.ohlcMeta,
          });
          setRunWindowSafe(warmEntry.window);
          applyBarsToChart(
            warmEntry.rawBars,
            warmEntry.systemStatus,
            warmEntry.window,
            warmEntry.ohlcMeta
              ? {
                  reason: warmEntry.ohlcMeta.reason ?? null,
                  data_origin: warmEntry.ohlcMeta.data_origin ?? null,
                }
              : null
          );
          setLoading(false);
        }

        let window: { start: string; end: string } | null = null;
        let sys: SystemStatus | null = systemStatusRef.current;
        let latestPayload: OhlcPayload;

        if (fullRunRequested) {
          const runWindowPromise = canonicalApi
            .getRunWindow(effectiveRunId, activeStrategy)
            .catch(() => null);
          const snapshotPromise = api.getTerminalSnapshot(
            { ...activeContext, run_id: effectiveRunId, strategy_id: activeStrategy },
            defaultScope,
            { sections: ["system", "ohlc"], signal: controller.signal }
          );
          const snapshot = await snapshotPromise;
          if (controller.signal.aborted || chartModeEpochRef.current !== modeEpoch) return;
          sys = snapshot.system ?? null;
          latestPayload = snapshot.ohlc ?? { state: "EMPTY", ohlc: [] };
          setSystemStatus(sys);
          const snapshotBars = (latestPayload?.ohlc ?? []).filter((bar) => isValidBar(bar));
          const optimisticFullWindow = buildFullRunWindow(
            warmEntry?.window ?? null,
            snapshotBars,
            latestTradeTimeSec
          );
          if (snapshotBars.length) {
            setRunWindowSafe(optimisticFullWindow ?? warmEntry?.window ?? null);
            applyBarsToChart(
              snapshotBars,
              sys,
              optimisticFullWindow ?? warmEntry?.window ?? null,
              (latestPayload as any)?.meta ?? null
            );
            setLoading(false);
          }
          window = await runWindowPromise;
          if (controller.signal.aborted || chartModeEpochRef.current !== modeEpoch) return;
        } else {
          const liveBootstrapFromTs = new Date(
            Date.now() - LIVE_BOOTSTRAP_LOOKBACK_SECONDS * 1000
          ).toISOString();
          const systemPromise = api
            .getSystemStatus(
              {
                ...activeContext,
                run_id: effectiveRunId,
                strategy_id: activeStrategy,
              },
              defaultScope
            )
            .then((nextSystem) => nextSystem ?? null)
            .catch(() => null);

          latestPayload = await api.getOhlcForRun(
            LIVE_BOOTSTRAP_FETCH_LIMIT,
            effectiveRunId,
            undefined,
            undefined,
            {
              fromTs: liveBootstrapFromTs,
              order: "desc",
              signal: controller.signal,
            }
          );

          void systemPromise.then((nextSystem) => {
            if (controller.signal.aborted || chartModeEpochRef.current !== modeEpoch) return;
            setSystemStatus(nextSystem);
          });
        }

        if (controller.signal.aborted || chartModeEpochRef.current !== modeEpoch) return;

        syncOhlcAudit(latestPayload);

        if (fullRunRequested && latestPayload?.state === "OFF_MARKET") {
          setChartFrozen({
            active: true,
            reason: "OFF MARKET",
            badge: "OFF",
            degraded: false,
          });
          setLatestBarAgeSec((latestPayload as any)?.meta?.bar_age ?? null);
          const offMarketFromTs = buildLiveWindow(Date.now()).start;
          try {
            const fallbackPayload = await api.getOhlcForRun(
              800,
              effectiveRunId ?? undefined,
              undefined,
              undefined,
              { fromTs: offMarketFromTs, order: "asc", signal: controller.signal }
            );
            const fallbackBars = (
              Array.isArray(fallbackPayload)
                ? fallbackPayload
                : (fallbackPayload as any).ohlc ?? []
            ).filter((bar: Ohlc) => isValidBar(bar));
            if (controller.signal.aborted || chartModeEpochRef.current !== modeEpoch) return;
            if (fallbackBars.length) {
              const liveWindow = computeLiveWindow({ ohlc: fallbackBars });
              setRunWindowSafe(liveWindow);
              applyBarsToChart(fallbackBars, sys, liveWindow, null);
              writeChartHotCache(chartHotCacheKey, {
                rawBars: fallbackBars,
                systemStatus: sys,
                window: liveWindow,
                ohlcState: latestPayload.state ?? "OFF_MARKET",
                ohlcMeta: (latestPayload as any)?.meta ?? null,
              });
              setLoading(false);
              return;
            }
          } catch {
            // ignore
          }
          setLatestPriceIfChanged(null);
          setDataSource("NONE");
          setLoading(false);
          return;
        }

        let effectiveWindow: { start: string; end: string } | null = null;
        if (fullRunRequested) {
          effectiveWindow = computeEffectiveWindow(window, latestPayload);
          if (effectiveWindow) {
            setRunWindowSafe(effectiveWindow);
          } else {
            setRunWindowSafe(window);
          }
        } else {
          const liveWindow = computeLiveWindow(latestPayload);
          effectiveWindow = liveWindow;
          setRunWindowSafe(liveWindow);
          updateLiveWindowState(liveWindow);
        }

        const needsBackfill =
          fullRunRequested &&
          effectiveWindow &&
          effectiveWindow.start &&
          effectiveWindow.end;
        const snapshotBars = (latestPayload?.ohlc ?? []).filter((bar) => isValidBar(bar));

        const applied = applyBarsToChart(
          snapshotBars,
          sys ?? null,
          effectiveWindow || window,
          (latestPayload as any)?.meta ?? null
        );
        if (applied) {
          writeChartHotCache(chartHotCacheKey, {
            rawBars: snapshotBars,
            systemStatus: sys ?? null,
            window: effectiveWindow || window,
            ohlcState: latestPayload.state ?? null,
            ohlcMeta: latestPayload.meta ?? null,
          });
        }

        if (needsBackfill && effectiveWindow) {
          void fetchFullOhlcForWindow(effectiveWindow, controller.signal)
            .then((backfillBars) => {
              if (
                controller.signal.aborted ||
                chartModeEpochRef.current !== modeEpoch ||
                !backfillBars.length
              ) {
                return;
              }
              const mergedBars = mergeOhlcBars(snapshotBars, backfillBars);
              const appliedBackfill = applyBarsToChart(
                mergedBars,
                sys ?? null,
                effectiveWindow || window,
                (latestPayload as any)?.meta ?? null,
                { forceViewportReset: true }
              );
              if (!appliedBackfill) {
                return;
              }
              writeChartHotCache(chartHotCacheKey, {
                rawBars: mergedBars,
                systemStatus: sys ?? null,
                window: effectiveWindow || window,
                ohlcState: latestPayload.state ?? null,
                ohlcMeta: latestPayload.meta ?? null,
              });
            })
            .catch((backfillError) => {
              if (
                controller.signal.aborted ||
                chartModeEpochRef.current !== modeEpoch ||
                isAbortLikeChartError(backfillError)
              ) {
                return;
              }
              setError(
                backfillError instanceof Error
                  ? backfillError.message
                  : "Failed to backfill full run"
              );
            });
        }
      } catch (loadError: any) {
        if (
          controller.signal.aborted ||
          chartModeEpochRef.current !== modeEpoch ||
          isAbortLikeChartError(loadError)
        ) {
          return;
        }
        setError(loadError?.message || "Failed to load chart");
      } finally {
        if (initialFetchAbortRef.current === controller) {
          initialFetchAbortRef.current = null;
          loadingRef.current = false;
          setLoading(false);
          tfChangeInProgressRef.current = false;
        }
      }
    }

    const applyLiveUpdate = async () => {
      if (
        !effectiveRunId ||
        loadingRef.current ||
        tfChangeInProgressRef.current ||
        !seriesInitializedRef.current ||
        !barsRef.current.length
      ) {
        return;
      }
      if (chartLiveFrozenRef.current || !isVisibleRef.current || liveFetchInFlightRef.current) {
        return;
      }
      liveFetchInFlightRef.current = true;
      liveOhlcAbortRef.current?.abort();
      const controller = new AbortController();
      liveOhlcAbortRef.current = controller;
      const modeEpoch = chartModeEpochRef.current;
      try {
        const lastRawTs = rawBarsRef.current.length
          ? Date.parse(rawBarsRef.current[rawBarsRef.current.length - 1].timestamp)
          : null;
        const fromTs =
          lastRawTs && Number.isFinite(lastRawTs)
            ? new Date(lastRawTs + 1).toISOString()
            : undefined;
        const latest = await api.getOhlcForRun(
          LIVE_FETCH_LIMIT,
          effectiveRunId,
          undefined,
          undefined,
          fromTs ? { fromTs, order: "asc", signal: controller.signal } : { signal: controller.signal }
        );
        const payload = Array.isArray(latest) ? { ohlc: latest } : latest;
        if (controller.signal.aborted || chartModeEpochRef.current !== modeEpoch) {
          return;
        }
        syncOhlcAudit(payload);
        const payloadBars = (payload.ohlc ?? []).filter((bar) => isValidBar(bar));
        const rawBatch = payloadBars;
        if (rawBatch.length) {
          const previousLastRawTs = rawBarsRef.current.length
            ? Date.parse(rawBarsRef.current[rawBarsRef.current.length - 1].timestamp)
            : null;
          const rawUpdates = rawBatch.filter((bar) => {
            const ts = Date.parse(bar.timestamp);
            return !previousLastRawTs || ts > previousLastRawTs;
          });
          if (rawUpdates.length) {
            rawBarsRef.current = [...rawBarsRef.current, ...rawUpdates];
          }
        }
        const endCandidate = getViewportEndCandidateMs(lastRawTs, latestTradeTimeSec);
        const liveWindow = {
          start: new Date(endCandidate - OHLC_LIVE_WINDOW_SECONDS * 1000).toISOString(),
          end: new Date(endCandidate).toISOString(),
        };
        const currentWindow = fullRunRequestedRef.current ? runWindowRef.current : liveWindow;
        if (!fullRunRequestedRef.current) {
          updateLiveWindowState(liveWindow);
        }
        writeChartHotCache(chartHotCacheKey, {
          rawBars: rawBarsRef.current.length ? rawBarsRef.current : payloadBars,
          systemStatus: systemStatusRef.current,
          window: currentWindow,
          ohlcState: payload.state ?? null,
          ohlcMeta: payload.meta ?? null,
        });
        const windowed = currentWindow
          ? payloadBars.filter((bar) => {
              const ts = Date.parse(bar.timestamp);
              const startMs = Date.parse(currentWindow.start);
              const endMs = Date.parse(currentWindow.end);
              return ts >= startMs && ts <= endMs;
            })
          : payloadBars;
        const maxCandles = getMaxCandlesForWindow(
          timeframe.seconds,
          currentWindow || runWindowRef.current
        );
        const aggregationSource = (windowed.length ? windowed : payloadBars).slice(
          -maxCandles * 2
        );
        const aggregated = aggregateCandles(
          aggregationSource,
          timeframe.seconds,
          maxCandles
        );
        if (!aggregated.length) {
          return;
        }
        const lastKnownTs = lastAggTsRef.current;
        const newBars = aggregated.filter((bar) => {
          const ts = Date.parse(bar.timestamp);
          return !lastKnownTs || ts > lastKnownTs;
        });
        const lastAggregated = aggregated[aggregated.length - 1];
        const lastAggregatedTs = Date.parse(lastAggregated.timestamp);
        const barAgeSeconds = Math.max(0, (Date.now() - lastAggregatedTs) / 1000);
        setLatestBarAgeSec(barAgeSeconds);

        if (lastKnownTs && lastAggregatedTs === lastKnownTs) {
          barsRef.current[barsRef.current.length - 1] = lastAggregated;
          const barUpdate = toChartBar(lastAggregated);
          if (barUpdate && Number.isFinite(barUpdate.time as number)) {
            candleSeriesRef.current?.update(barUpdate as any);
            if (
              spreadSeriesRef.current &&
              Number.isFinite(lastAggregated.spread_close_pips)
            ) {
              spreadSeriesRef.current.update({
                time: barUpdate.time,
                value: lastAggregated.spread_close_pips,
              } as any);
            }
          }
        } else {
          const existingLast = barsRef.current[barsRef.current.length - 1];
          const existingTs = existingLast ? Date.parse(existingLast.timestamp) : null;
          const ordered = newBars
            .filter((bar) => {
              const ts = Date.parse(bar.timestamp);
              return existingTs ? ts >= existingTs : true;
            })
            .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
          ordered.forEach((bar) => {
            barsRef.current.push(bar);
            const point = toChartBar(bar);
            if (point && Number.isFinite(point.time as number)) {
              candleSeriesRef.current?.update(point as any);
              if (spreadSeriesRef.current && Number.isFinite(bar.spread_close_pips)) {
                spreadSeriesRef.current.update({
                  time: point.time,
                  value: bar.spread_close_pips,
                } as any);
              }
            }
          });
          lastAggTsRef.current = lastAggregatedTs;
          bumpBarsVersion();
        }

        setLatestPriceIfChanged(lastAggregated?.close ?? null);
        setLatestSpread(lastAggregated?.spread_close_pips ?? null);
        setLastLiveUpdate(Date.now());
      } catch {
        // keep silent
      } finally {
        enforceLockedVisibleRange();
        if (liveOhlcAbortRef.current === controller) {
          liveOhlcAbortRef.current = null;
        }
        liveFetchInFlightRef.current = false;
      }
    };

    loadInitial();
    const onRangeChange = (range: { from: Time; to: Time } | null) => {
      if (!range) return;
      if (typeof range.from === "number" && typeof range.to === "number") {
        const nextRange = { from: range.from, to: range.to };
        const isProgrammatic = programmaticScrollRef.current;
        const isUserInteraction = Date.now() <= userViewportInteractionUntilRef.current;
        if (!isProgrammatic) {
          setVisibleRangeIfChanged(nextRange);
        }
        if (fullRunRequestedRef.current) {
          lastUserInteractionRef.current = Date.now();
          return;
        }
        if (!isProgrammatic && isUserInteraction) {
          lastUserRangeRef.current = nextRange;
          lockedVisibleRangeRef.current = nextRange;
          if (getLatestChartTimeSec() != null) {
            autoFollowEnabledRef.current = false;
          }
          lastUserInteractionRef.current = Date.now();
          return;
        }
        if (!lockedVisibleRangeRef.current) {
          lockedVisibleRangeRef.current = nextRange;
        }
      }
    };
    chartRef.current?.timeScale().subscribeVisibleTimeRangeChange(onRangeChange);

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const scheduleLiveUpdate = () => {
      if (cancelled) return;
      const delay =
        typeof document !== "undefined" && document.visibilityState !== "visible"
          ? Math.max(LIVE_REFRESH_MS * 3, 5000)
          : LIVE_REFRESH_MS;
      timeoutId = setTimeout(async () => {
        if (!fullRunRequestedRef.current && !wsConnectedRef.current && !chartLiveFrozenRef.current) {
          await applyLiveUpdate();
        }
        scheduleLiveUpdate();
      }, delay);
    };
    scheduleLiveUpdate();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      chartRef.current?.timeScale().unsubscribeVisibleTimeRangeChange(onRangeChange);
    };
  }, [
    activeStrategy,
    applyBarsToChart,
    chartHotCacheKey,
    computeEffectiveWindow,
    computeLiveWindow,
    effectiveRunId,
    enforceLockedVisibleRange,
    fetchFullOhlcForWindow,
    fullRunRequested,
    getLatestChartTimeSec,
    reloadToken,
    setRunWindowSafe,
    setVisibleRangeIfChanged,
    syncOhlcAudit,
    timeframe.seconds,
    updateLiveWindowState,
  ]);

  useEffect(() => {
    if (!effectiveRunId) {
      setChartFrozen({ active: false, reason: "", badge: null, degraded: false });
      return;
    }
    if (ohlcAudit?.state === "OFF_MARKET") {
      setChartFrozen({ active: true, reason: "OFF MARKET", badge: "OFF", degraded: false });
      return;
    }
    setChartFrozen(
      computeFreezeState(systemStatus ?? null, timeframe.seconds, latestBarAgeSec, {
        marketOpen: ohlcAudit?.meta?.market_open ?? null,
        maxTickAgeSeconds: ohlcAudit?.meta?.max_tick_age_seconds ?? null,
        maxBarAgeSeconds: ohlcAudit?.meta?.max_bar_age_seconds ?? null,
      })
    );
  }, [
    effectiveRunId,
    latestBarAgeSec,
    ohlcAudit?.meta?.market_open,
    ohlcAudit?.meta?.max_bar_age_seconds,
    ohlcAudit?.meta?.max_tick_age_seconds,
    ohlcAudit?.state,
    systemStatus,
    timeframe.seconds,
  ]);

  useEffect(() => {
    if (!effectiveRunId) return;
    if (fullRunRequested) return;
    let cancelled = false;

    const nextTickDelay = () =>
      typeof document !== "undefined" && document.visibilityState !== "visible"
        ? Math.max(LIVE_TICK_MS * 4, 3000)
        : LIVE_TICK_MS;

    const applyTick = async () => {
      if (cancelled) return;
      if (wsConnectedRef.current) return;
      if (chartLiveFrozenRef.current) {
        try {
          const tick = await api.getLiveTick();
          if (tick?.mid != null && Number.isFinite(tick.mid)) {
            queueLiveUiUpdate(tick.mid, tick.spread_pips, { touchLive: true });
          }
        } catch {
          // best effort
        } finally {
          if (!cancelled) setTimeout(applyTick, nextTickDelay());
        }
        return;
      }

      if (
        !candleSeriesRef.current ||
        !seriesInitializedRef.current ||
        !barsRef.current.length ||
        !isVisibleRef.current
      ) {
        if (!cancelled) setTimeout(applyTick, nextTickDelay());
        return;
      }

      try {
        const tick = await api.getLiveTick();
        if (!tick || tick.mid == null) {
          if (!cancelled) setTimeout(applyTick, nextTickDelay());
          return;
        }

        const mid = tick.mid;
        const tfSec = timeframe.seconds;
        const nowSec = Math.floor(Date.now() / 1000);
        const barTime = nowSec - (nowSec % tfSec);
        const lastConfirmedTs = lastAggTsRef.current;
        const lastConfirmedSec = lastConfirmedTs ? Math.floor(lastConfirmedTs / 1000) : null;
        const dev = devCandleRef.current;

        if (lastConfirmedSec && barTime > lastConfirmedSec + tfSec) {
          const lastClose = barsRef.current.length
            ? barsRef.current[barsRef.current.length - 1].close
            : mid;
          for (let fillTime = lastConfirmedSec + tfSec; fillTime < barTime; fillTime += tfSec) {
            candleSeriesRef.current.update({
              time: fillTime as Time,
              open: lastClose,
              high: lastClose,
              low: lastClose,
              close: lastClose,
            } as any);
            if (spreadSeriesRef.current && Number.isFinite(tick.spread_pips)) {
              spreadSeriesRef.current.update({
                time: fillTime as Time,
                value: tick.spread_pips,
              } as any);
            }
          }
        }

        if (dev && dev.barTime === barTime) {
          dev.high = Math.max(dev.high, mid);
          dev.low = Math.min(dev.low, mid);
          dev.close = mid;
        } else {
          devCandleRef.current = {
            barTime,
            open: mid,
            high: mid,
            low: mid,
            close: mid,
          };
        }

        const developing = devCandleRef.current!;
        candleSeriesRef.current.update({
          time: developing.barTime as Time,
          open: developing.open,
          high: developing.high,
          low: developing.low,
          close: developing.close,
        } as any);

        if (spreadSeriesRef.current && Number.isFinite(tick.spread_pips)) {
          spreadSeriesRef.current.update({
            time: developing.barTime as Time,
            value: tick.spread_pips,
          } as any);
        }

        queueLiveUiUpdate(mid, tick.spread_pips, { touchLive: true });
      } catch {
        // silent retry
      } finally {
        enforceLockedVisibleRange();
        if (!cancelled) setTimeout(applyTick, nextTickDelay());
      }
    };

    setTimeout(applyTick, 100);
    return () => {
      cancelled = true;
    };
  }, [
    effectiveRunId,
    enforceLockedVisibleRange,
    fullRunRequested,
    queueLiveUiUpdate,
    timeframe.seconds,
    wsStatus,
  ]);

  useEffect(() => {
    const lastMs = lastAggTsRef.current;
    if (!lastMs) return;
    const lastSec = Math.floor(lastMs / 1000);
    const dev = devCandleRef.current;
    if (dev && dev.barTime <= lastSec) {
      devCandleRef.current = null;
    }
  }, [barsVersion]);

  const resetChartWindowState = useCallback((nextMode: "live" | "full") => {
    chartModeEpochRef.current += 1;
    initialFetchAbortRef.current?.abort();
    liveOhlcAbortRef.current?.abort();
    initialFetchAbortRef.current = null;
    liveOhlcAbortRef.current = null;
    loadingRef.current = false;
    liveFetchInFlightRef.current = false;
    autoFollowEnabledRef.current = false;
    userViewportInteractionUntilRef.current = 0;
    lastUserInteractionRef.current = null;
    setChartFrozen({ active: false, reason: "", badge: null, degraded: false });
    setError(null);
    setLoading(true);
    setVisibleRange(null);
    setRunWindowSafe(null);
    liveWindowRef.current = null;
    lastWindowUpdateRef.current = 0;
    initialRangeSetRef.current = false;
    lastUserRangeRef.current = null;
    lockedVisibleRangeRef.current = null;
    barsRef.current = [];
    rawBarsRef.current = [];
    lastAggTsRef.current = null;
    devCandleRef.current = null;
    setBackfillState({
      active: false,
      bars: 0,
      mode: nextMode,
    });
    setReloadToken((value) => value + 1);
  }, [setRunWindowSafe]);

  const toggleChartLiveFrozen = useCallback(() => {
    const next = !chartLiveFrozenRef.current;
    chartLiveFrozenRef.current = next;
    setChartLiveFrozen(next);
    if (!next) {
      initialRangeSetRef.current = false;
      lastUserRangeRef.current = null;
      lockedVisibleRangeRef.current = null;
      setChartFrozen({ active: false, reason: "", badge: null, degraded: false });
      setReloadToken((value) => value + 1);
    }
  }, []);

  const activateLiveWindow = useCallback(() => {
    fullRunRequestedRef.current = false;
    setFullRunRequested(false);
    resetChartWindowState("live");
  }, [resetChartWindowState]);

  const activateFullRun = useCallback(() => {
    fullRunRequestedRef.current = true;
    setFullRunRequested(true);
    resetChartWindowState("full");
  }, [resetChartWindowState]);

  const handleTimeframeChange = useCallback(
    (nextTimeframe: (typeof TIMEFRAMES)[number]) => {
      autoFollowEnabledRef.current = false;
      initialRangeSetRef.current = false;
      lastUserRangeRef.current = null;
      lockedVisibleRangeRef.current = null;
      barsRef.current = [];
      lastAggTsRef.current = null;
      setTimeframe(nextTimeframe);
    },
    [setTimeframe]
  );

  return {
    containerRef,
    chartRef,
    candleSeriesRef,
    spreadSeriesRef,
    spreadThresholdLineRef,
    error,
    loading,
    regimeInfo,
    runWindow,
    dataSource,
    systemStatus,
    latestPrice,
    latestSpread,
    visibleRange,
    latestBarAgeSec,
    lastLiveUpdate,
    chartLiveFrozen,
    ohlcAudit,
    backfillState,
    fullRunRequested,
    minChartTimeframeSeconds,
    chartTimeframeOptions,
    chartFrozen,
    seriesReady,
    wsStatus,
    snapToLoadedBarTime,
    toggleChartLiveFrozen,
    activateLiveWindow,
    activateFullRun,
    handleTimeframeChange,
  };
}
