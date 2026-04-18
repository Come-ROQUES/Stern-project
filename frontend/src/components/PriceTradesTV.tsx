import React, { useDeferredValue, useEffect, useRef, useState, useMemo } from "react";
import { api } from "../lib/api";
import { activeContext, defaultScope } from "../lib/activeContext";
import { useRunId, useRunMeta } from "../lib/useRunContext";
import { useDashboardTimeframe } from "../lib/timeframeContext";
import { prefetchCanonicalTrades, type Signal } from "../lib/canonicalApi";
import { useCommissionView } from "../lib/useCommissionView";
import { useBundleRuns } from "../lib/useBundleRuns";
import { SegmentedControl } from "./ui/glass";
import { ZeroStateDisplay } from "./ZeroStateDisplay";
import { useLightweightChartAutosize } from "../lib/charts/useLightweightChartAutosize";
import { ISeriesApi, Time, LineStyle, PriceLineOptions } from "lightweight-charts";
import { TimeframeSelector } from "./ui/TimeframeSelector";
import { Activity, RefreshCw } from "lucide-react";
import { formatDateTimeUTC, formatTime } from "../lib/dateUtils";
import { getExtremeState, getSignalModeLabel } from "../lib/signalMode";
import { useViewVisibility } from "../lib/viewActivity";
import {
  countPending,
  countPendingCandidates,
  countTrulyAccepted,
  getTopRejectionReasons,
  isPending,
  isTrulyAccepted,
  normalizeRejectionReason,
  usePriceTradesData,
  type ProcessedTrade,
  type SignalHoverAudit,
  type TradeHoverAudit,
  type TradeHoverEvent,
  type TradeSummary,
} from "./price-trades/usePriceTradesData";
import { usePriceTradesChartEngine } from "./price-trades/usePriceTradesChartEngine";
import {
  buildChartHotCacheKey,
  buildLiveWindow,
  CHART_COLORS as COLORS,
  FX_DECIMALS,
  findSignalsNearTime,
  isAbortLikeChartError,
  isValidBar,
  LIVE_BOOTSTRAP_FETCH_LIMIT,
  LIVE_BOOTSTRAP_LOOKBACK_SECONDS,
  readChartHotCache,
  selectClosedTradePathTrades,
  snapTimestampToLoadedBarTime,
  toUnixSeconds,
  tradeOverlapsRange,
  writeChartHotCache,
} from "./price-trades/chartShared";

export {
  buildFullRunWindow,
  buildLiveWindow,
  findSignalsNearTime,
  getChartRightOffsetBars,
  getSupportedChartTimeframes,
  getViewportEndCandidateMs,
  isAbortLikeChartError,
  mergeOhlcBars,
  resolveMinChartTimeframeSeconds,
  selectClosedTradePathTrades,
  snapTimestampToLoadedBarTime,
  toUnixSeconds,
} from "./price-trades/chartShared";
export {
  buildSignalQueryCacheKey,
  computeSignalQueryWindow,
  getChartTradesFetchLimit,
  getLatestTradeTimeSec,
  selectTradesForPanel,
  summarizeTradesForViewport,
} from "./price-trades/usePriceTradesData";

/**
 * PriceTradesTV - Desk-Grade Strategy Chart (V5 - ULTIMATE)
 * 
 * FUNDAMENTAL RULE: Trades = execution (real). Signals = context (internal).
 * They MUST NEVER share the same visual grammar.
 * 
 * Visual Hierarchy (strict order):
 * 1. Price (5 decimals - non-negotiable)
 * 2. Trades (entry/exit/path/TP/SL) - THE central event
 * 3. Signals ACCEPTED - context only (vertical lines, NOT markers)
 * 4. Signals REFUSED - debug mode (ultra-discreet, togglable)
 * 
 * What this chart must show in 2 seconds:
 * - Current price (5 decimals)
 * - Is there an OPEN trade? Where are TP/SL?
 * - Each trade as a visual sentence: Entry → path → Exit + reason
 */

// =============================================================================
// CONSTANTS & UTILS
// =============================================================================

const PIP_DIVISOR = 10000; // EURUSD: 1 pip = 0.0001
const MARKERS_V2 = true;
const MARKERS_MAX_VISIBLE = 400;
const MARKERS_PADDING_SEC = 120; // pad visible window to avoid edge pop-in
const LIVE_TRADES_FETCH_LIMIT = 300;

/** Format price to 5 decimals - THE reference */
const formatPrice = (price: number | null | undefined): string => {
  if (price == null || !Number.isFinite(price)) return '—';
  return price.toFixed(FX_DECIMALS);
};

/** Format pips with sign */
const formatPips = (pips: number | null | undefined): string => {
  if (pips == null || !Number.isFinite(pips)) return '—';
  return `${pips >= 0 ? '+' : ''}${pips.toFixed(1)}p`;
};

/** Format duration */
const formatDuration = (ms: number | null | undefined): string => {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
};

const exitFillSide = (side?: string | null): string => {
  if (!side) return "bid/ask";
  return side.toUpperCase() === "SELL" ? "ask" : "bid";
};

const findTradeEventsNearTime = (
  eventsByTime: Map<number, TradeHoverEvent[]>,
  targetTime: number,
  timeframeSec: number
): TradeHoverEvent[] | null => {
  const direct = eventsByTime.get(targetTime);
  if (direct && direct.length > 0) return direct;
  const threshold = Math.max(1, Math.floor(timeframeSec / 2));
  let best: { diff: number; events: TradeHoverEvent[] | null } = {
    diff: Infinity,
    events: null,
  };
  for (const [key, list] of eventsByTime.entries()) {
    const diff = Math.abs(key - targetTime);
    if (diff <= threshold && diff < best.diff && list.length > 0) {
      best = { diff, events: list };
    }
  }
  return best.events;
};

// =============================================================================
// TYPES
// =============================================================================

interface ChartToggles {
  showAcceptedSignals: boolean;
  showRefusedSignals: boolean;
  showTpSl: boolean;
  showSpread: boolean;
  showSessions: boolean;
  showTradePaths: boolean;
}

export async function prewarmPriceTradesPanel(
  runId: string | null | undefined,
  strategyId = "damping_wave"
): Promise<void> {
  if (!runId) return;

  await Promise.allSettled([
    prefetchCanonicalTrades(runId, LIVE_TRADES_FETCH_LIMIT, {
      strategyId,
    }),
    (async () => {
      const cacheKey = buildChartHotCacheKey(runId, strategyId, false);
      if (readChartHotCache(cacheKey)) return;

      const liveBootstrapFromTs = new Date(
        Date.now() - LIVE_BOOTSTRAP_LOOKBACK_SECONDS * 1000
      ).toISOString();
      const [latestPayload, systemStatus] = await Promise.all([
        api.getOhlcForRun(
          LIVE_BOOTSTRAP_FETCH_LIMIT,
          runId,
          undefined,
          undefined,
          {
            fromTs: liveBootstrapFromTs,
            order: "desc",
          }
        ),
        api
          .getSystemStatus(
            {
              ...activeContext,
              run_id: runId,
              strategy_id: strategyId,
            },
            defaultScope
          )
          .then((nextSys) => nextSys ?? null)
          .catch(() => null),
      ]);
      const rawBars = (latestPayload?.ohlc ?? []).filter((bar) => isValidBar(bar));
      if (!rawBars.length) return;
      const latestTs = rawBars.reduce((maxTs, bar) => {
        const ts = Date.parse(bar.timestamp);
        return Number.isFinite(ts) && ts > maxTs ? ts : maxTs;
      }, -Infinity);
      writeChartHotCache(cacheKey, {
        rawBars,
        systemStatus,
        window: buildLiveWindow(Number.isFinite(latestTs) ? latestTs : Date.now()),
        ohlcState: latestPayload.state ?? null,
        ohlcMeta: latestPayload.meta ?? null,
      });
    })(),
  ]);
}

// LocalStorage keys
const STORAGE_KEYS = {
  showAccepted: 'fractal_chart_showAccepted',
  showRefused: 'fractal_chart_showRefused',
  showTpSl: 'fractal_chart_showTpSl',
  showSpread: 'fractal_chart_showSpread',
  showSessions: 'fractal_chart_showSessions',
  showTradePaths: 'fractal_chart_showTradePaths',
};

const getStoredToggles = (): ChartToggles => {
  if (typeof window === 'undefined') return { showAcceptedSignals: true, showRefusedSignals: false, showTpSl: true, showSpread: true, showSessions: true, showTradePaths: true };
  return {
    showAcceptedSignals: localStorage.getItem(STORAGE_KEYS.showAccepted) !== 'false',
    showRefusedSignals: localStorage.getItem(STORAGE_KEYS.showRefused) === 'true',
    showTpSl: localStorage.getItem(STORAGE_KEYS.showTpSl) !== 'false',
    showSpread: localStorage.getItem(STORAGE_KEYS.showSpread) !== 'false',
    showSessions: localStorage.getItem(STORAGE_KEYS.showSessions) !== 'false',
    showTradePaths: localStorage.getItem(STORAGE_KEYS.showTradePaths) !== 'false',
  };
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function PriceTradesTV() {
  const runId = useRunId();
  const { run, isCanonical, loading: runLoading } = useRunMeta();
  const { timeframe, setTimeframe, allowedTimeframes } = useDashboardTimeframe();
  const strategyId = run?.strategy_id ?? null;
  const isViewVisible = useViewVisibility();

  // S3 strategy selector — override run + strategy when "s3" is selected
  const { tfRunId } = useBundleRuns();
  const [selectedStrat, setSelectedStrat] = useState<"dw" | "s3">("dw");
  const effectiveRunId = selectedStrat === "s3" ? tfRunId : runId;
  const effectiveStratId =
    selectedStrat === "s3" ? "tf_pullback_v1" : strategyId ?? undefined;

  const activeStrategy = effectiveStratId || "damping_wave";
  const strategyLabel =
    selectedStrat === "s3"
      ? "S3 / EURUSD"
      : activeStrategy === "damping_wave"
      ? "DW"
      : activeStrategy.replace(/_/g, " ").toUpperCase();

  const [toggles, setToggles] = useState<ChartToggles>(getStoredToggles);
  const [signalHover, setSignalHover] = useState<SignalHoverAudit | null>(null);
  const [signalPinned, setSignalPinned] = useState<SignalHoverAudit | null>(null);
  const [tradeHover, setTradeHover] = useState<TradeHoverAudit | null>(null);
  const [tradePinned, setTradePinned] = useState<TradeHoverAudit | null>(null);
  const [latestTradeTimeForChart, setLatestTradeTimeForChart] = useState<number | null>(
    null
  );
  const tpSlLinesRef = useRef<any[]>([]);
  const closedTradePathsRef = useRef<ISeriesApi<"Line">[]>([]);

  const updateToggle = (key: keyof ChartToggles, value: boolean) => {
    setToggles((prev) => ({ ...prev, [key]: value }));
    const storageKey =
      key === "showAcceptedSignals"
        ? STORAGE_KEYS.showAccepted
        : key === "showRefusedSignals"
          ? STORAGE_KEYS.showRefused
          : key === "showSpread"
            ? STORAGE_KEYS.showSpread
            : key === "showSessions"
              ? STORAGE_KEYS.showSessions
              : key === "showTradePaths"
                ? STORAGE_KEYS.showTradePaths
                : STORAGE_KEYS.showTpSl;
    localStorage.setItem(storageKey, String(value));
  };

  useEffect(() => {
    if (selectedStrat !== "s3") return;
    setToggles((prev) => {
      if (prev.showAcceptedSignals && prev.showRefusedSignals) {
        return prev;
      }
      return {
        ...prev,
        showAcceptedSignals: true,
        showRefusedSignals: true,
      };
    });
    localStorage.setItem(STORAGE_KEYS.showAccepted, "true");
    localStorage.setItem(STORAGE_KEYS.showRefused, "true");
  }, [selectedStrat]);

  const {
    containerRef,
    chartRef,
    candleSeriesRef,
    spreadSeriesRef,
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
    chartTimeframeOptions,
    chartFrozen,
    seriesReady,
    wsStatus,
    snapToLoadedBarTime,
    toggleChartLiveFrozen,
    activateLiveWindow,
    activateFullRun,
    handleTimeframeChange,
  } = usePriceTradesChartEngine({
    activeStrategy,
    allowedTimeframes,
    effectiveRunId,
    isCanonical,
    isViewVisible,
    latestTradeTimeSec: latestTradeTimeForChart,
    runDataOrigin: run?.data_origin ?? null,
    timeframe,
    setTimeframe,
  });

  const settledVisibleRangeActual = useDeferredValue(visibleRange);
  const { commissionView } = useCommissionView();
  const {
    chartMarkerTrades,
    closedTrades,
    hoverableSignals,
    hoverableSignalsByTime,
    hoverableTradeEventsByTime,
    latestTradeTimeSec,
    openOverlayTrades,
    openTrades,
    openTradesNoExit,
    processedTrades,
    signals,
    signalsLoading,
    tradesLoading,
    tradesNoRunId,
    visibleTrades,
    visibleTradesSummary,
    extremeSummary,
  } = usePriceTradesData({
    effectiveRunId,
    effectiveStratId,
    activeStrategy,
    runWindow,
    visibleRange,
    settledVisibleRange: settledVisibleRangeActual,
    timeframeSeconds: timeframe.seconds,
    latestPrice,
    commissionView,
    enabled: isViewVisible,
    fullRunRequested,
    toggles: {
      showAcceptedSignals: toggles.showAcceptedSignals,
      showRefusedSignals: toggles.showRefusedSignals,
    },
  });

  useEffect(() => {
    setLatestTradeTimeForChart((prev) =>
      prev === latestTradeTimeSec ? prev : latestTradeTimeSec
    );
  }, [latestTradeTimeSec]);

  const displaySpread = useMemo(() => {
    if (latestSpread != null && Number.isFinite(latestSpread)) return latestSpread;
    // Fallback: systemStatus.spread_pips (parsed from bot logs, already in pips)
    const sysSpread = systemStatus?.spread_pips ?? systemStatus?.price?.spread_pips;
    if (sysSpread != null && Number.isFinite(sysSpread)) return sysSpread;
    return null;
  }, [latestSpread, systemStatus]);

  useEffect(() => {
    const visibleSignalIds = new Set(
      hoverableSignals.map((signal) => signal.signal_id)
    );
    const hasVisibleSignals = visibleSignalIds.size > 0;
    const isAuditStillVisible = (audit: SignalHoverAudit | null) =>
      Boolean(
        audit &&
          audit.signals.some((signal) => visibleSignalIds.has(signal.signal_id))
      );

    if (!hasVisibleSignals) {
      setSignalHover(null);
      setSignalPinned(null);
      return;
    }
    if (!isAuditStillVisible(signalHover)) {
      setSignalHover(null);
    }
    if (!isAuditStillVisible(signalPinned)) {
      setSignalPinned(null);
    }
  }, [hoverableSignals, signalHover, signalPinned]);

  useEffect(() => {
    const visibleTradeIds = new Set(processedTrades.map((trade) => trade.canonical_id));
    const hasVisibleTrades = visibleTradeIds.size > 0;
    const isTradeAuditStillVisible = (audit: TradeHoverAudit | null) =>
      Boolean(
        audit &&
          audit.events.some((event) => visibleTradeIds.has(event.trade.canonical_id))
      );

    if (!hasVisibleTrades) {
      setTradeHover(null);
      setTradePinned(null);
      return;
    }
    if (!isTradeAuditStillVisible(tradeHover)) {
      setTradeHover(null);
    }
    if (!isTradeAuditStillVisible(tradePinned)) {
      setTradePinned(null);
    }
  }, [processedTrades, tradeHover, tradePinned]);

  // Safety: ensure TP/SL lines stay visible when an open trade exists.
  useEffect(() => {
    if (openTrades.length > 0 && !toggles.showTpSl) {
      updateToggle('showTpSl', true);
    }
  }, [openTrades.length, toggles.showTpSl]);

  // Spread overlay visibility toggle
  useEffect(() => {
    if (!spreadSeriesRef.current || !chartRef.current) return;
    const visible = toggles.showSpread;
    spreadSeriesRef.current.applyOptions({
      visible,
      priceLineVisible: false,
      lastValueVisible: visible,
    });
    chartRef.current.priceScale("spread").applyOptions({
      visible,
    });
  }, [toggles.showSpread]);

  const maxSpreadFromBotRaw = systemStatus?.max_spread_pips;
  const maxSpreadFromBot = Number.isFinite(maxSpreadFromBotRaw)
    ? Number(maxSpreadFromBotRaw)
    : null;

  const { waitingForSize: waitingForChartSize } = useLightweightChartAutosize({
    containerRef,
    fallbackHeight: 600,
    debugName: "PriceTradesTV",
  });

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const resolveTime = (t: Time | null | undefined): number | null => {
      if (t == null) return null;
      if (typeof t === "number") return t;
      return null;
    };

    const onCrosshairMove = (param: any) => {
      const t = resolveTime(param?.time);
      if (t == null) {
        setSignalHover(null);
        setTradeHover(null);
        return;
      }
      const foundSignals =
        hoverableSignalsByTime.size > 0
          ? findSignalsNearTime(hoverableSignalsByTime, t, timeframe.seconds)
          : null;
      const foundTradeEvents =
        hoverableTradeEventsByTime.size > 0
          ? findTradeEventsNearTime(hoverableTradeEventsByTime, t, timeframe.seconds)
          : null;
      if (!foundSignals) {
        setSignalHover(null);
      } else {
        setSignalHover({ time: t, signals: foundSignals });
      }
      if (!foundTradeEvents) {
        setTradeHover(null);
      } else {
        setTradeHover({ time: t, events: foundTradeEvents });
      }
    };

    const onClick = (param: any) => {
      const t = resolveTime(param?.time);
      if (t == null) {
        setSignalPinned(null);
        setTradePinned(null);
        return;
      }
      const foundSignals =
        hoverableSignalsByTime.size > 0
          ? findSignalsNearTime(hoverableSignalsByTime, t, timeframe.seconds)
          : null;
      const foundTradeEvents =
        hoverableTradeEventsByTime.size > 0
          ? findTradeEventsNearTime(hoverableTradeEventsByTime, t, timeframe.seconds)
          : null;
      if (!foundSignals) {
        setSignalPinned(null);
      } else {
        setSignalPinned({ time: t, signals: foundSignals });
      }
      if (!foundTradeEvents) {
        setTradePinned(null);
      } else {
        setTradePinned({ time: t, events: foundTradeEvents });
      }
    };

    chart.subscribeCrosshairMove(onCrosshairMove);
    chart.subscribeClick(onClick);
    return () => {
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      chart.unsubscribeClick(onClick);
    };
  }, [hoverableSignalsByTime, hoverableTradeEventsByTime, timeframe.seconds]);

  const staleAuditSummary = useMemo(() => {
    const meta = ohlcAudit?.meta;
    if (!meta) return null;
    if (!chartFrozen.active && ohlcAudit?.state !== "STALE" && !meta.reason) {
      return null;
    }

    const parts = [
      ohlcAudit?.state && ohlcAudit.state !== "LIVE" ? `API ${ohlcAudit.state}` : null,
      meta.reason ?? null,
      meta.data_origin ? `origin ${meta.data_origin}` : null,
      meta.source_bar_interval_s != null ? `source ${meta.source_bar_interval_s}s` : null,
      meta.bar_interval_s != null ? `strategy ${meta.bar_interval_s}s` : null,
      meta.max_bar_age_seconds != null ? `stale>${Math.round(meta.max_bar_age_seconds)}s` : null,
      meta.latest_source_bar_ts ? `last ${formatDateTimeUTC(meta.latest_source_bar_ts)} UTC` : null,
    ].filter(Boolean);

    return parts.length ? parts.join(" · ") : null;
  }, [chartFrozen.active, ohlcAudit]);

  // Markers: combine signals + canonical trades with desk-grade formatting
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    const markers: any[] = [];
    const paddedRange = visibleRange
      ? {
          from: visibleRange.from - MARKERS_PADDING_SEC,
          to: visibleRange.to + MARKERS_PADDING_SEC,
        }
      : null;
    const inRange = (t: number | null | undefined) => {
      if (!MARKERS_V2 || !paddedRange) return true;
      if (!Number.isFinite(t as number)) return false;
      const time = t as number;
      return time >= paddedRange.from && time <= paddedRange.to;
    };
    const signalCandidates = paddedRange
      ? signals.filter((sig) => {
          const ts = toUnixSeconds(sig.timestamp);
          return (
            ts != null && ts >= paddedRange.from && ts <= paddedRange.to
          );
        })
      : signals;
    const tradeCandidates = paddedRange
      ? chartMarkerTrades.filter((trade) =>
          tradeOverlapsRange(
            trade.entry_time,
            trade.isOpen ? null : trade.exit_time,
            paddedRange
          )
        )
      : chartMarkerTrades;

    // ==========================================================================
    // SIGNAL MARKERS (subtle) - Accepted vs Refused with reason tooltip
    // ==========================================================================
    const acceptedSignals = toggles.showAcceptedSignals
      ? signalCandidates.filter((s) => s.accepted)
      : [];
    const refusedSignals = toggles.showRefusedSignals
      ? signalCandidates.filter((s) => !s.accepted)
      : [];

    const pushSignalMarker = (sig: Signal, isAccepted: boolean) => {
      const time = snapToLoadedBarTime(sig.timestamp);
      if (!Number.isFinite(time as number) || !inRange(time as number)) return;
      const modeLabel = getSignalModeLabel(sig);
      const extremeState = getExtremeState(sig);
      const reasonText = sig.was_traded
        ? (sig.reason || 'accepted')
        : (sig.rejection_reason || sig.reason || 'not traded');
      // Show side (B/S) for rejected signals, A for accepted
      const sideLabel = sig.direction === 'BUY' ? 'B' : sig.direction === 'SELL' ? 'S' : '?';
      const markerText = isAccepted ? 'A' : sideLabel;
      markers.push({
        time,
        position: 'aboveBar',
        color: isAccepted ? 'rgba(56,189,248,0.45)' : (sig.direction === 'BUY' ? 'rgba(30,185,128,0.55)' : 'rgba(233,67,109,0.55)'),
        shape: MARKERS_V2 ? (isAccepted ? 'arrowDown' : 'arrowUp') : 'circle',
        size: MARKERS_V2 ? 0.9 : 0.6,
        text: markerText,
        id: `sig-${sig.signal_id}`,
        description: `${strategyLabel} ${isAccepted ? 'ACCEPTED' : 'REJECTED'} ${sig.direction || ''} | mode=${modeLabel}${extremeState ? `/${extremeState}` : ""} | ${reasonText}`,
      });
    };

    acceptedSignals.forEach((s) => pushSignalMarker(s, true));
    refusedSignals.forEach((s) => pushSignalMarker(s, false));

    // ==========================================================================
    // TRADE MARKERS ONLY - Signals are NOT markers (they're context lines)
    // ==========================================================================
    // RULE: Trades = execution markers. Signals = vertical context lines.
    // They MUST NOT share the same visual grammar.

    tradeCandidates.forEach((t) => {
      const entryTime = snapToLoadedBarTime(t.entry_time);
      const exitTime = snapToLoadedBarTime(t.exit_time);
      const isBuy = t.side === 'BUY';
      const baseColor = isBuy ? COLORS.tradeBuyEntry : COLORS.tradeSellEntry;
      const reasonUpper = (t.exit_reason || "").toUpperCase();
      const isScaleOutExit = reasonUpper.includes("SCALE_OUT");
      const scaleOutDone = Number(t.scale_out_done ?? 0) > 0;
      const scaleOutTime = t.scale_out_ts
        ? snapToLoadedBarTime(t.scale_out_ts)
        : null;

      // ENTRY marker - solid circle with OPEN label if applicable
      if (Number.isFinite(entryTime as number) && inRange(entryTime as number)) {
        if (MARKERS_V2) {
          markers.push({
            time: entryTime,
            position: isBuy ? 'belowBar' : 'aboveBar',
            color: t.isOpen ? COLORS.tradeOpenMarker : baseColor,
            shape: isBuy ? 'arrowUp' : 'arrowDown',
            text: isBuy ? 'B' : 'S',
            size: 2,
          });
        } else {
          const entryTooltip = t.isOpen
            ? `OPEN ${t.side} @ ${formatPrice(t.entry_price)}`
            : `ENTRY ${t.side} @ ${formatPrice(t.entry_price)}`;

          markers.push({
            time: entryTime,
            position: isBuy ? 'belowBar' : 'aboveBar',
            color: t.isOpen ? COLORS.tradeOpenMarker : baseColor,
            shape: 'circle',
            text: entryTooltip,
            size: 2,
          });
        }
      }

      // SCALE-OUT marker - explicit partial take-profit event.
      if (
        scaleOutDone &&
        Number.isFinite(scaleOutTime as number) &&
        inRange(scaleOutTime as number) &&
        scaleOutTime !== exitTime
      ) {
        markers.push({
          time: scaleOutTime,
          position: isBuy ? 'aboveBar' : 'belowBar',
          color: COLORS.tradeExitScaleOut,
          shape: MARKERS_V2 ? 'circle' : 'square',
          text: 'SO',
          size: MARKERS_V2 ? 1.4 : 1.2,
        });
      }

      // EXIT marker - square with reason (only if trade is closed)
      if (!t.isOpen && Number.isFinite(exitTime as number) && exitTime !== entryTime && inRange(exitTime as number)) {
        const exitReasonLabel = isScaleOutExit
          ? 'SO'
          : reasonUpper === 'TP'
            ? 'TP'
            : reasonUpper === 'SL'
              ? 'SL'
              : '';
        const pnlStr = formatPips(t.net_pips_display ?? t.pnl_pips);
        const exitColor = isScaleOutExit
          ? COLORS.tradeExitScaleOut
          : reasonUpper === 'TP'
            ? COLORS.tradeExitTP
            : reasonUpper === 'SL'
              ? COLORS.tradeExitSL
              : (t.pnl_usd_display ?? 0) >= 0
                ? COLORS.tradeExitTP
                : COLORS.tradeExitSL;

        if (MARKERS_V2) {
          markers.push({
            time: exitTime,
            position: isBuy ? 'aboveBar' : 'belowBar',
            color: exitColor,
            shape: 'circle',
            text: exitReasonLabel || (
              exitColor === COLORS.tradeExitTP
                ? 'TP'
                : exitColor === COLORS.tradeExitSL
                  ? 'SL'
                  : 'EX'
            ),
            size: 1.6,
          });
        } else {
          markers.push({
            time: exitTime,
            position: isBuy ? 'aboveBar' : 'belowBar',
            color: exitColor,
            shape: 'square',
            text: `EXIT ${exitReasonLabel} ${pnlStr}`.trim(),
            size: 1.5,
          });
        }
      }
    });

    // Sort and ensure ascending time order
    let sorted = markers
      .filter((m) => Number.isFinite(m.time as number))
      .sort((a, b) => (a.time as number) - (b.time as number));

    if (MARKERS_V2 && sorted.length > MARKERS_MAX_VISIBLE) {
      sorted = sorted.slice(sorted.length - MARKERS_MAX_VISIBLE);
    }

    candleSeriesRef.current.setMarkers(ensureAscending(sorted));
  }, [
    // P8 PERF: borne les markers aux trades utiles pour la fenetre actuelle.
    chartMarkerTrades,
    signals,
    toggles.showAcceptedSignals,
    toggles.showRefusedSignals,
    visibleRange,
    snapToLoadedBarTime,
    strategyLabel,
  ]);

  // ==========================================================================
  // TP/SL PRICE LINES - Horizontal dashed lines for open trades
  // ==========================================================================
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    // Remove old TP/SL lines
    tpSlLinesRef.current.forEach((line) => {
      try {
        candleSeriesRef.current?.removePriceLine(line);
      } catch {
        // Line may already be removed
      }
    });
    tpSlLinesRef.current = [];

    // Only add TP/SL lines if toggle is enabled
    if (!toggles.showTpSl) return;

    // Add TP/SL lines for open trades
    openOverlayTrades.forEach((t) => {
      const fillSide = exitFillSide(t.side);
      if (t.tp_price != null) {
        const targetPips = t.entry_price != null
          ? Math.abs(t.tp_price - t.entry_price) * PIP_DIVISOR
          : null;
        const tpLine = candleSeriesRef.current?.createPriceLine({
          price: t.tp_price,
          color: COLORS.tpLine,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `TP ${formatPrice(t.tp_price)}${targetPips ? ` (+${targetPips.toFixed(1)}p)` : ''} (${fillSide})`,
        } as PriceLineOptions);
        if (tpLine) tpSlLinesRef.current.push(tpLine);
      }

      if (t.sl_price != null) {
        const riskPips = t.entry_price != null
          ? Math.abs(t.sl_price - t.entry_price) * PIP_DIVISOR
          : null;
        const slLine = candleSeriesRef.current?.createPriceLine({
          price: t.sl_price,
          color: COLORS.slLine,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `SL ${formatPrice(t.sl_price)}${riskPips ? ` (-${riskPips.toFixed(1)}p)` : ''} (${fillSide})`,
        } as PriceLineOptions);
        if (slLine) tpSlLinesRef.current.push(slLine);
      }
    });

    return () => {
      tpSlLinesRef.current.forEach((line) => {
        try {
          candleSeriesRef.current?.removePriceLine(line);
        } catch {
          // Ignore
        }
      });
    };
  }, [openOverlayTrades, toggles.showTpSl]);

  // ==========================================================================
  // TRADE PATH LINES - Dotted line connecting entry → exit for closed trades
  // Shows trade trajectory at a glance with PnL color coding
  // ==========================================================================
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return;

    // Clean up previous path lines
    closedTradePathsRef.current.forEach((line) => {
      try { chartRef.current?.removeSeries(line); } catch { /* already removed */ }
    });
    closedTradePathsRef.current = [];

    if (!toggles.showTradePaths) return;

    const visibleClosedTrades = selectClosedTradePathTrades(
      closedTrades,
      settledVisibleRangeActual
    );

    visibleClosedTrades.forEach((t) => {
      if (!t.entry_time || !t.exit_time || t.entry_price == null || t.exit_price == null) return;
      if (!chartRef.current) return;

      // Critical: trade path series can extend the chart time scale.
      // Unlike markers, they must never fall back to a raw bucket outside the
      // loaded OHLC coverage, otherwise a single trade timestamp can create an
      // empty tail on the right and make the chart feel "magnetized" left.
      const entryTime = snapToLoadedBarTime(t.entry_time, false);
      const exitTime = snapToLoadedBarTime(t.exit_time, false);
      if (!Number.isFinite(entryTime as number) || !Number.isFinite(exitTime as number)) return;
      if ((entryTime as number) >= (exitTime as number)) return;

      const isWin = (t.pnl_usd_display ?? t.pnl_pips ?? 0) >= 0;
      const pathColor = isWin ? COLORS.tradePathWin : COLORS.tradePathLoss;

      try {
        const pathLine = chartRef.current.addLineSeries({
          color: pathColor,
          lineWidth: 1,
          lineStyle: LineStyle.SparseDotted,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceFormat: { type: 'price', precision: FX_DECIMALS, minMove: 0.00001 },
        });
        pathLine.setData([
          { time: entryTime as number, value: t.entry_price },
          { time: exitTime as number, value: t.exit_price },
        ] as any[]);
        closedTradePathsRef.current.push(pathLine);
      } catch { /* skip if chart removed */ }
    });

    return () => {
      closedTradePathsRef.current.forEach((line) => {
        try { chartRef.current?.removeSeries(line); } catch { /* ignore */ }
      });
      closedTradePathsRef.current = [];
    };
  }, [
    closedTrades,
    snapToLoadedBarTime,
    toggles.showTradePaths,
    settledVisibleRangeActual,
  ]);
  // P6 PERF: Removed barsVersion — trade paths are static (entry→exit) and only
  // need redraw when the trades themselves change, not on every new bar.

  // ==========================================================================
  // SESSION PnL WATERMARK - Cumulative PnL from closed trades this session
  // ==========================================================================
  const sessionPnl = useMemo(() => {
    if (!closedTrades.length) return null;
    let totalUsd = 0;
    let totalPips = 0;
    let wins = 0;
    let losses = 0;
    closedTrades.forEach((t) => {
      const usd = t.pnl_usd_display ?? 0;
      const pips = t.net_pips_display ?? t.pnl_pips ?? 0;
      totalUsd += usd;
      totalPips += pips;
      if (usd >= 0) wins++;
      else losses++;
    });
    return { totalUsd, totalPips, wins, losses, count: closedTrades.length };
  }, [closedTrades]);

  const showChartLoading = loading && !seriesReady;
  const showTradesLoading = tradesLoading && processedTrades.length === 0;
  const loadingLabel = useMemo(() => {
    if (showChartLoading && fullRunRequested) return "Chargement full run…";
    if (showChartLoading) return "Chargement chart live…";
    if (showTradesLoading) return "Chargement trades…";
    if (signalsLoading) return "Chargement signaux…";
    return null;
  }, [fullRunRequested, showChartLoading, showTradesLoading, signalsLoading]);

  // No run selected state
  if (!effectiveRunId && !runLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[3fr_1fr]">
        <div className="card">
          <div className="text-lg font-semibold mb-4">Price & Trades</div>
          <ZeroStateDisplay
            runId={effectiveRunId}
            error={null}
            isLoading={false}
            dataCount={0}
            dataType="chart"
          />
        </div>
        <div className="card glass">
          <div className="text-sm text-neutral-400">Trades</div>
          <ZeroStateDisplay
            runId={effectiveRunId}
            error={null}
            isLoading={false}
            dataCount={0}
            dataType="trades"
            compact
          />
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[7fr_3fr] h-[calc(100vh-160px)]">
      <div className="card min-h-0 flex flex-col" style={{ padding: '12px 16px' }}>
        {/* Header with price and toggles */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-neutral-400">EURUSD</span>
              <DataSourceBadge source={dataSource} />
              <span
                className="text-[10px] px-1.5 py-0.5 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-200"
                title={`Strategy ${activeStrategy}`}
              >
                {strategyLabel}
              </span>
              {/* Strategy selector — DW vs S3 */}
              <SegmentedControl
                options={[
                  { value: "dw", label: "DW" },
                  {
                    value: "s3",
                    label: tfRunId ? "S3" : "S3 (no run)",
                    icon: <Activity size={11} />,
                  },
                ]}
                value={selectedStrat}
                onChange={(v) => setSelectedStrat(v as "dw" | "s3")}
                size="sm"
              />
              {openTrades.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-900/30 border border-yellow-500/50 text-yellow-400 animate-pulse">
                  {openTrades.length} POSITION{openTrades.length > 1 ? 'S' : ''} OPEN
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-lg font-semibold">Price & Trades</span>
              {/* LIVE indicator - isolated component to avoid full re-renders (AXE 4) */}
              <LiveBadge lastLiveUpdate={lastLiveUpdate} frozen={chartFrozen.active} />
              {/* WebSocket status badge */}
              <span className={`text-[9px] px-1.5 py-0.5 rounded border ${wsStatus === 'connected'
                ? 'bg-emerald-900/30 border-emerald-500/40 text-emerald-400'
                : wsStatus === 'connecting'
                  ? 'bg-amber-900/20 border-amber-500/30 text-amber-300'
                  : 'bg-neutral-800/40 border-neutral-600/30 text-neutral-500'
                }`} title={wsStatus === 'connected' ? 'WebSocket push (~200ms)' : 'HTTP polling fallback (~2s)'}>
                {wsStatus === 'connected' ? 'WS' : 'HTTP'}
              </span>
              {backfillState.active && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800/60 border border-slate-500/60 text-slate-200">
                  {backfillState.mode === "full" ? "FULL RUN" : "LIVE"} {backfillState.bars.toLocaleString()}
                </span>
              )}
              {latestPrice != null && (
                <span className="text-2xl font-mono font-bold text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.3)]">
                  {formatPrice(latestPrice)}
                </span>
              )}
              {toggles.showSpread && displaySpread != null && (
                <span
                  className={`text-xs font-mono px-1.5 py-0.5 rounded ${displaySpread > 0.3
                    ? 'bg-rose-900/30 border border-rose-500/40 text-rose-300'
                    : displaySpread > 0.2
                      ? 'bg-amber-900/20 border border-amber-500/30 text-amber-300'
                      : 'bg-neutral-800/40 border border-neutral-600/30 text-neutral-300'
                    }`}
                  title={`Spread at last bar close: ${displaySpread.toFixed(2)} pips`}
                >
                  {displaySpread.toFixed(1)}p
                </span>
              )}
            </div>
            {runWindow && (
              <div className="text-xs text-neutral-500 mt-0.5">
                Window: {formatDateTimeUTC(runWindow.start)} → {formatDateTimeUTC(runWindow.end)} UTC
              </div>
            )}
          </div>

          {/* UI Toggles - Desk controls */}
          <div className="flex flex-col items-end gap-2 text-[10px]">
            <div className="flex items-center gap-2">
              <button
                onClick={toggleChartLiveFrozen}
                disabled={fullRunRequested}
                className={`px-2 py-1 rounded border text-xs ${
                  fullRunRequested
                    ? "border-neutral-800 bg-neutral-900/60 text-neutral-500 cursor-not-allowed"
                    : chartLiveFrozen
                    ? "border-amber-500/70 bg-amber-500/15 text-amber-200"
                    : "border-emerald-700 text-emerald-200 hover:border-emerald-500"
                }`}
                title={
                  fullRunRequested
                    ? "En RUN complet, le chart est deja decouple du flux live"
                    : chartLiveFrozen
                    ? "Graph figé: prix live oui, chandelles figées"
                    : "Graph live: chandelles mises à jour en direct"
                }
              >
                {fullRunRequested
                  ? "Graph snapshot"
                  : chartLiveFrozen
                    ? "Graph figé"
                    : "Graph live"}
              </button>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-neutral-200">
                TF {timeframe.label}
              </span>
              <TimeframeSelector
                options={chartTimeframeOptions}
                active={timeframe.label}
                onChange={handleTimeframeChange}
              />
              <button
                onClick={activateLiveWindow}
                className={`flex items-center gap-1 px-2 py-1 rounded border text-xs ${
                  fullRunRequested
                    ? "border-neutral-700 text-neutral-200 hover:border-neutral-500"
                    : "border-amber-500/70 bg-amber-500/15 text-amber-200"
                }`}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Live + 1h
              </button>
              <button
                onClick={activateFullRun}
                className={`flex items-center gap-1 px-2 py-1 rounded border text-xs ${
                  fullRunRequested
                    ? "border-emerald-500/80 bg-emerald-500/15 text-emerald-100"
                    : "border-emerald-700 text-emerald-200 hover:border-emerald-500"
                }`}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Charger tout le run
              </button>
            </div>
            <div className="flex items-center gap-3">
              {openTradesNoExit.length > 0 && (
                <span className="text-[10px] px-2 py-1 rounded border border-amber-500/60 bg-amber-500/10 text-amber-200 font-semibold">
                  NO TP/SL (bracket blocked) — {openTradesNoExit.length} trade
                  {openTradesNoExit.length > 1 ? "s" : ""} unprotected
                </span>
              )}
              <ChartToggle
                label="TP/SL"
                checked={toggles.showTpSl}
                onChange={(v) => updateToggle('showTpSl', v)}
              />
              <ChartToggle
                label={selectedStrat === "s3" ? "S3 Signals" : "DW Signals"}
                checked={toggles.showAcceptedSignals}
                onChange={(v) => updateToggle('showAcceptedSignals', v)}
              />
              <ChartToggle
                label={selectedStrat === "s3" ? "S3 Debug" : "DW Debug"}
                checked={toggles.showRefusedSignals}
                onChange={(v) => updateToggle('showRefusedSignals', v)}
                subtle
              />
              <ChartToggle
                label="Spread"
                checked={toggles.showSpread}
                onChange={(v) => updateToggle('showSpread', v)}
              />
              <ChartToggle
                label="Paths"
                checked={toggles.showTradePaths}
                onChange={(v) => updateToggle('showTradePaths', v)}
              />
              <ChartToggle
                label="Sessions"
                checked={toggles.showSessions}
                onChange={(v) => updateToggle('showSessions', v)}
              />
            </div>
            <div className="text-[10px] text-neutral-500">
              TP/SL fills use bid/ask, not mid
            </div>
          </div>
        </div>

        {loadingLabel && <span className="text-xs text-neutral-500">{loadingLabel}</span>}
        {error && <span className="text-xs text-danger">{error}</span>}

        {regimeInfo && (
          <div className="flex items-center gap-2 text-xs text-neutral-200 mb-1">
            <Chip label={`ATR ${regimeInfo.atr.toFixed(1)}p`} />
            <Chip label={regimeInfo.regime} accent />
            <Chip label={`H ${formatPrice(regimeInfo.sessionHigh)}`} />
            <Chip label={`L ${formatPrice(regimeInfo.sessionLow)}`} />
          </div>
        )}

        <div className="flex items-center gap-2 text-[10px] text-neutral-400 mb-1">
          {chartFrozen.badge && (
            <span className="rounded-full border border-amber-500/60 bg-amber-500/10 px-2 py-0.5 text-amber-200 font-semibold tracking-wide">
              {chartFrozen.badge} · updates frozen
            </span>
          )}
          {!chartFrozen.badge && chartFrozen.active && chartFrozen.reason && (
            <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-cyan-100 tracking-wide">
              {chartFrozen.reason} · updates frozen
            </span>
          )}
          {latestBarAgeSec != null && (
            <span className="text-neutral-500">Bar age {Math.round(latestBarAgeSec)}s</span>
          )}
          {systemStatus?.tick_age_seconds != null && (
            <span className={`text-neutral-500 ${systemStatus.tick_age_seconds > 5 ? "text-amber-300" : ""}`}>
              Tick age {Math.round(systemStatus.tick_age_seconds)}s
            </span>
          )}
        </div>
        {staleAuditSummary && (
          <div className="mb-2 text-[10px] text-neutral-500">
            Audit {staleAuditSummary}
          </div>
        )}
        {visibleTrades.length > 0 && (
          <TradeInsightStrip
            summary={visibleTradesSummary}
            fullRunRequested={fullRunRequested}
            timeframeLabel={timeframe.label}
          />
        )}
        {openTrades.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {openTrades.slice(0, 3).map((trade) => (
              <OpenTradeCard
                key={trade.canonical_id}
                trade={trade}
                pinned={Boolean(
                  tradePinned?.events.some(
                    (event) => event.trade.canonical_id === trade.canonical_id
                  )
                )}
                onHoverChange={(active) =>
                  setTradeHover(
                    active
                      ? {
                          time: Math.floor(Date.parse(trade.entry_time) / 1000),
                          events: [{ time: Math.floor(Date.parse(trade.entry_time) / 1000), eventType: "ENTRY", trade }],
                        }
                      : null
                  )
                }
                onPinToggle={() =>
                  setTradePinned((prev) =>
                    prev?.events.some(
                      (event) => event.trade.canonical_id === trade.canonical_id
                    )
                      ? null
                      : {
                          time: Math.floor(Date.parse(trade.entry_time) / 1000),
                          events: [{ time: Math.floor(Date.parse(trade.entry_time) / 1000), eventType: "ENTRY", trade }],
                        }
                  )
                }
              />
            ))}
          </div>
        )}

        <div className={`relative w-full flex-1 min-h-[300px] ${chartFrozen.degraded ? "opacity-60 grayscale" : ""}`}>
          <div ref={containerRef} className="absolute inset-0" />
          {waitingForChartSize && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200">
                Chart en attente de dimensions du conteneur...
              </span>
            </div>
          )}
          {/* Session PnL Watermark - Top right, always visible */}
          {sessionPnl && sessionPnl.count > 0 && (
            <div className="pointer-events-none absolute right-14 top-2 z-10">
              <div className="flex items-center gap-2 text-[10px]">
                <span className={`font-mono font-bold text-sm ${sessionPnl.totalUsd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {sessionPnl.totalUsd >= 0 ? '+' : ''}{sessionPnl.totalUsd.toFixed(2)} USD
                </span>
                <span className={`font-mono text-[10px] ${sessionPnl.totalPips >= 0 ? 'text-emerald-500/60' : 'text-rose-500/60'}`}>
                  {formatPips(sessionPnl.totalPips)}
                </span>
                <span className="text-neutral-500">
                  Run closés · {sessionPnl.wins}W {sessionPnl.losses}L
                </span>
              </div>
            </div>
          )}
          {/* FX Session Zone Indicator - Bottom left */}
          {toggles.showSessions && (
            <SessionZoneIndicator />
          )}
          {(signalPinned || signalHover) && (
            <SignalHoverOverlay
              data={signalPinned ?? signalHover}
              pinned={Boolean(signalPinned)}
            />
          )}
          {(tradePinned || tradeHover) && (
            <TradeHoverOverlay
              data={tradePinned ?? tradeHover}
              pinned={Boolean(tradePinned)}
            />
          )}
          {(chartFrozen.badge || chartFrozen.active) && (
            <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1 text-[10px]">
              {chartFrozen.badge && (
                <span className="inline-flex items-center gap-1 rounded border border-amber-500/70 bg-amber-900/60 px-2 py-1 text-amber-100 font-semibold uppercase tracking-[0.12em] shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
                  {chartFrozen.badge}
                </span>
              )}
              {chartFrozen.reason && !chartFrozen.badge && (
                <span className="inline-flex items-center gap-1 rounded border border-cyan-500/50 bg-cyan-900/40 px-2 py-1 text-cyan-100 uppercase tracking-[0.12em]">
                  {chartFrozen.reason}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Chart Legend - Compact visual grammar */}
        <div className="flex items-center justify-between mt-1.5 text-[9px] text-neutral-500 border-t border-white/5 pt-1.5">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> BUY Entry
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500" /> SELL Entry
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-yellow-500" /> OPEN
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-500" /> Exit TP
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-rose-500" /> Exit SL
            </span>
            {toggles.showSpread && (
              <span className="flex items-center gap-1">
                <span className="w-3 h-[2px] rounded" style={{ backgroundColor: COLORS.spreadLine }} /> Spread
                <span className="w-3 h-[1px] rounded" style={{ backgroundColor: COLORS.spreadThreshold, borderTop: '1px dashed' }} /> {maxSpreadFromBot ?? 0.4}p max
              </span>
            )}
            {toggles.showTradePaths && (
              <span className="flex items-center gap-1">
                <span className="w-3 h-[1px]" style={{ borderTop: '1px dotted rgba(30,185,128,0.5)' }} /> Win path
                <span className="w-3 h-[1px]" style={{ borderTop: '1px dotted rgba(233,67,109,0.5)' }} /> Loss path
              </span>
            )}
          </div>
          <span className="text-neutral-600">
            {strategyLabel} signals = context lines only
          </span>
        </div>
      </div>

      {/* Canonical Trades Panel - Enhanced with TP/SL/Status */}
      <div className="card glass min-h-0 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-1.5">
          <div>
            <div className="text-[10px] text-neutral-200 uppercase tracking-[0.18em]">Trades</div>
          </div>
          <div className="flex items-center gap-2">
            {openTrades.length > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-900/30 border border-yellow-500/50 text-yellow-400">
                {openTrades.length} OPEN
              </span>
            )}
            <span className="text-xs text-neutral-400">
              {visibleTrades.length}/{processedTrades.length} visibles
            </span>
          </div>
        </div>

        {tradesNoRunId && (
          <ZeroStateDisplay
            runId={effectiveRunId}
            error="NO_RUN_ID"
            isLoading={false}
            dataCount={0}
            dataType="trades"
            compact
            className="mb-2"
          />
        )}

        <div className="overflow-auto flex-1 min-h-0 pr-1">
          <table className="w-full min-w-[360px] text-xs text-neutral-200">
            <thead className="text-neutral-400 sticky top-0 bg-slate-900">
              <tr className="border-b border-white/5">
                <th className="py-1 pr-1 text-left text-[10px]">Status</th>
                <th className="py-1 pr-1 text-left text-[10px]">Side</th>
                <th className="py-1 pr-1 text-left text-[10px]">Entry</th>
                <th className="py-1 pr-1 text-left text-[10px]">Exit</th>
                <th className="py-1 pr-1 text-left text-[10px]">PnL</th>
              </tr>
            </thead>
            <tbody>
              {processedTrades.length === 0 && !tradesLoading && (
                <tr>
                  <td colSpan={5} className="py-2 text-neutral-400">
                    {tradesNoRunId ? 'Select a run' : 'No trades for this run'}
                  </td>
                </tr>
              )}
              {visibleTrades.map((t) => (
                <TradeRow
                  key={t.canonical_id}
                  trade={t}
                  pinned={Boolean(
                    tradePinned?.events.some(
                      (event) => event.trade.canonical_id === t.canonical_id
                    )
                  )}
                  onHoverChange={(active) =>
                    setTradeHover(
                      active
                        ? {
                            time: Math.floor(Date.parse(t.entry_time) / 1000),
                            events: [{ time: Math.floor(Date.parse(t.entry_time) / 1000), eventType: "ENTRY", trade: t }],
                          }
                        : null
                    )
                  }
                  onPinToggle={() =>
                    setTradePinned((prev) =>
                      prev?.events.some(
                        (event) => event.trade.canonical_id === t.canonical_id
                      )
                        ? null
                        : {
                            time: Math.floor(Date.parse(t.entry_time) / 1000),
                            events: [{ time: Math.floor(Date.parse(t.entry_time) / 1000), eventType: "ENTRY", trade: t }],
                          }
                    )
                  }
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Signals summary - Enhanced */}
        {signals.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/10">
              <div className="text-xs text-neutral-400 mb-2">
                {strategyLabel} signals fenetre graphe
              </div>
            {countPendingCandidates(signals) > 1 && (
              <div className="mb-2 text-[10px] text-rose-300">
                Invariant violation: {countPendingCandidates(signals)} pending reflex candidates (showing 1). Check canonical stages.
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <SignalStatBox
                label="ACCEPTED"
                count={countTrulyAccepted(signals)}
                total={signals.length}
                color="emerald"
              />
              <SignalStatBox
                label="REFUSED"
                count={signals.length - countTrulyAccepted(signals) - countPending(signals)}
                total={signals.length}
                color="neutral"
              />
            </div>
            {/* Pending reflex indicator */}
            {countPending(signals) > 0 && (
              <div className="mt-2 text-[10px] text-blue-400">
                {countPending(signals)} pending reflex evaluation
              </div>
            )}
            {extremeSummary.total > 0 && (
              <div className="mt-2 text-[10px] text-amber-300">
                EXTREME: {extremeSummary.total} signal(s) · wait {extremeSummary.waiting} · ttl_exp {extremeSummary.ttlExpired}
              </div>
            )}
            {/* Top rejection reasons */}
            {signals.filter(s => !isTrulyAccepted(s)).length > 0 && (
              <div className="mt-2 text-[10px] text-neutral-500">
                <span className="text-neutral-400">Top rejections: </span>
                {getTopRejectionReasons(signals).map((r, i) => (
                  <span key={r.reason}>
                    {i > 0 && ', '}
                    {r.reason} ({r.count})
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

function SignalStatBox({ label, count, total, color }: {
  label: string;
  count: number;
  total: number;
  color: 'emerald' | 'neutral';
}) {
  const pct = total > 0 ? ((count / total) * 100).toFixed(0) : '0';
  const colorClasses = color === 'emerald'
    ? 'bg-emerald-900/20 border-emerald-500/30 text-emerald-400'
    : 'bg-neutral-800/50 border-neutral-600/30 text-neutral-400';

  return (
    <div className={`px-2 py-1.5 rounded border ${colorClasses}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-sm font-semibold">{count} <span className="text-[10px] opacity-50">({pct}%)</span></div>
    </div>
  );
}

function TradeInsightStrip({
  summary,
  timeframeLabel,
  fullRunRequested,
}: {
  summary: TradeSummary;
  timeframeLabel: string;
  fullRunRequested: boolean;
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] text-neutral-300">
      <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-cyan-100">
        {fullRunRequested ? "RUN complet" : `Fenetre ${timeframeLabel}`}
      </span>
      <span className="rounded border border-white/10 bg-white/5 px-2 py-1">
        {summary.total} trade{summary.total > 1 ? "s" : ""}
      </span>
      {summary.openCount > 0 && (
        <span className="rounded border border-yellow-500/40 bg-yellow-500/10 px-2 py-1 text-yellow-300">
          {summary.openCount} open
        </span>
      )}
      {summary.closedCount > 0 && (
        <span className="rounded border border-white/10 bg-white/5 px-2 py-1">
          {summary.wins}W / {summary.losses}L
        </span>
      )}
      <span
        className={`rounded border px-2 py-1 ${
          summary.netPips >= 0
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            : "border-rose-500/30 bg-rose-500/10 text-rose-300"
        }`}
      >
        net {formatPips(summary.netPips)}
      </span>
      {summary.closedCount > 0 && (
        <span
          className={`rounded border px-2 py-1 ${
            summary.netUsd >= 0
              ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-200"
              : "border-rose-500/20 bg-rose-500/5 text-rose-200"
          }`}
        >
          {summary.netUsd >= 0 ? "+" : ""}
          {summary.netUsd.toFixed(2)} USD
        </span>
      )}
      {summary.bestPips != null && (
        <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-neutral-400">
          best {formatPips(summary.bestPips)}
        </span>
      )}
      {summary.worstPips != null && (
        <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-neutral-400">
          worst {formatPips(summary.worstPips)}
        </span>
      )}
    </div>
  );
}

function OpenTradeCard({
  trade,
  pinned,
  onHoverChange,
  onPinToggle,
}: {
  trade: ProcessedTrade;
  pinned?: boolean;
  onHoverChange?: (active: boolean) => void;
  onPinToggle?: () => void;
}) {
  const sideTone =
    trade.side === "BUY"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : "border-rose-500/30 bg-rose-500/10 text-rose-200";
  return (
    <button
      type="button"
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      onClick={onPinToggle}
      className={`min-w-[220px] rounded border px-2 py-1.5 text-[10px] text-left transition ${
        pinned ? "ring-1 ring-amber-400/70" : ""
      } ${sideTone}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold tracking-[0.12em]">{trade.side} OPEN</span>
        <span className="font-mono">{formatPips(trade.unrealized_pips)}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-neutral-200">
        <span>entry {formatPrice(trade.entry_price)}</span>
        {trade.tp_price != null && <span>tp {formatPrice(trade.tp_price)}</span>}
        {trade.sl_price != null && <span>sl {formatPrice(trade.sl_price)}</span>}
      </div>
    </button>
  );
}

const TradeRow = React.memo(function TradeRow({
  trade,
  pinned,
  onHoverChange,
  onPinToggle,
}: {
  trade: ProcessedTrade;
  pinned?: boolean;
  onHoverChange?: (active: boolean) => void;
  onPinToggle?: () => void;
}) {
  const pnlUsd = trade.pnl_usd_display ?? null;
  const pnlPips = trade.isOpen
    ? trade.unrealized_pips
    : (trade.net_pips_display ?? trade.pnl_pips);
  const pnlClass = trade.isOpen
    ? (trade.unrealized_pips ?? 0) >= 0
      ? "text-yellow-400"
      : "text-orange-400"
    : pnlUsd == null
      ? "text-neutral-400"
      : pnlUsd >= 0
        ? "text-emerald-400"
        : "text-rose-400";
  const statusBadge = trade.isOpen ? (
    <span className="px-1.5 py-0.5 rounded bg-yellow-900/40 border border-yellow-500/40 text-yellow-400 text-[10px] font-semibold">
      OPEN
    </span>
  ) : (
    <span className={`px-1.5 py-0.5 rounded text-[10px] ${trade.exit_reason === 'TP'
      ? 'bg-emerald-900/30 border border-emerald-500/30 text-emerald-400'
      : trade.exit_reason === 'SL'
        ? 'bg-rose-900/30 border border-rose-500/30 text-rose-400'
        : 'bg-neutral-800 border border-neutral-600 text-neutral-400'
      }`}>
      {trade.exit_reason || 'CLOSED'}
    </span>
  );
  const sideColor = trade.side === 'BUY' ? 'text-emerald-400' : 'text-rose-400';

  return (
    <tr
      className={`border-b border-white/5 cursor-pointer hover:bg-white/5 ${
        pinned ? "bg-amber-500/10" : ""
      }`}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      onClick={onPinToggle}
    >
      <td className="py-1 pr-1">{statusBadge}</td>
      <td className={`py-1 pr-1 font-semibold text-[11px] ${sideColor}`}>{trade.side}</td>
      <td className="py-1 pr-1 font-mono text-[11px]">
        {formatPrice(trade.entry_price)}
        <div className="text-[9px] text-neutral-500">
          {formatTime(trade.entry_time, "UTC")}
        </div>
      </td>
      <td className="py-1 pr-1 font-mono text-[11px]">
        {trade.isOpen ? (
          <span className="text-yellow-400">—</span>
        ) : (
          <>
            {formatPrice(trade.exit_price)}
            {trade.exit_time && (
              <div className="text-[9px] text-neutral-500">
                {formatTime(trade.exit_time, "UTC")}
              </div>
            )}
          </>
        )}
      </td>
      <td className={`py-1 pr-1 font-semibold font-mono text-[11px] ${pnlClass}`}>
        {trade.isOpen ? (
          <>
            <span className="text-[9px] text-neutral-500">unrl </span>
            {formatPips(trade.unrealized_pips)}
          </>
        ) : (
          <>
            {pnlUsd != null ? `${pnlUsd >= 0 ? '+' : ''}${pnlUsd.toFixed(2)}` : "—"}
            {pnlPips != null && (
              <div className="text-[9px] text-neutral-500">
                {formatPips(pnlPips)}
              </div>
            )}
          </>
        )}
      </td>
    </tr>
  );
});

TradeRow.displayName = "TradeRow";

// =============================================================================
// SIGNAL STATUS HELPERS
// A signal is "truly accepted" ONLY if:
// - accepted === true
// - rejection_reason is null/undefined/empty
// - decision_stage does NOT contain "TIMEOUT"
// =============================================================================

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function formatNullableNumber(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}

function formatSpreadPips(spread: number | null | undefined): string {
  if (spread == null || !Number.isFinite(spread)) return '—';
  const pips = spread > 1 ? spread : spread * PIP_DIVISOR;
  return formatPips(pips);
}

function formatTradeEventLabel(eventType: TradeHoverEvent["eventType"]): string {
  if (eventType === "ENTRY") return "Entrée";
  if (eventType === "EXIT") return "Sortie";
  return "Scale-out";
}

function SignalHoverOverlay({
  data,
  pinned,
}: {
  data: SignalHoverAudit | null;
  pinned: boolean;
}) {
  if (!data || data.signals.length === 0) return null;
  const primary = data.signals[0];
  const accepted = isTrulyAccepted(primary);
  const pending = isPending(primary);
  const reason = normalizeRejectionReason(primary.rejection_reason || primary.reason);
  const modeLabel = getSignalModeLabel(primary);
  const extremeState = getExtremeState(primary);
  const stage = primary.decision_stage || '—';
  const time = formatDateTimeUTC(primary.timestamp);
  const direction = primary.direction || '?';
  const shockPips = primary.shock_magnitude != null ? formatPips(primary.shock_magnitude) : '—';
  const zScore = formatNullableNumber(primary.z_score, 2);
  const spreadPips = formatSpreadPips(primary.spread);
  const regime = primary.regime || '—';
  const session = primary.session || '—';
  const price = formatPrice(primary.price_at_signal);
  const anchor = formatPrice(primary.anchor_price);
  const extraCount = data.signals.length - 1;
  const relatedSignals = data.signals.slice(0, 4);
  const statusLabel = accepted ? "Signal accepté" : pending ? "Signal pending" : "Signal refusé";
  const statusAccent = accepted
    ? "text-emerald-300"
    : pending
      ? "text-sky-300"
      : "text-amber-300";
  const decisionLabel = accepted ? "ACCEPTED" : pending ? "PENDING" : "REJECTED";

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-20 max-w-[260px] text-[10px] text-neutral-200">
      <div className="border border-white/10 bg-white/5 backdrop-blur-[2px] px-2 py-1.5">
        <div className="flex items-center justify-between gap-2 text-[9px] text-neutral-400">
          <span className={`uppercase tracking-[0.12em] ${statusAccent}`}>{statusLabel}</span>
          {pinned && <span className="text-[9px] text-amber-300">PIN</span>}
        </div>
        <div className="mt-1 text-[11px] font-semibold text-neutral-100">
          {direction} · {time}
        </div>
        <div className="mt-1 text-neutral-300">
          <span className="text-neutral-400">Decision:</span> {decisionLabel}
        </div>
        <div className="text-neutral-300">
          <span className="text-neutral-400">Mode:</span> {modeLabel}
          {extremeState ? ` (${extremeState})` : ""}
        </div>
        <div className="text-neutral-300">
          <span className="text-neutral-400">Stage:</span> {stage}
        </div>
        <div className="text-neutral-300">
          <span className="text-neutral-400">Raison:</span> {reason}
        </div>
        <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-neutral-300">
          <span><span className="text-neutral-500">Shock</span> {shockPips}</span>
          <span><span className="text-neutral-500">Z</span> {zScore}</span>
          <span><span className="text-neutral-500">Spread</span> {spreadPips}</span>
          <span><span className="text-neutral-500">Regime</span> {regime}</span>
          <span><span className="text-neutral-500">Session</span> {session}</span>
          <span><span className="text-neutral-500">Prix</span> {price}</span>
          <span><span className="text-neutral-500">Ancre</span> {anchor}</span>
        </div>
        {relatedSignals.length > 1 && (
          <div className="mt-2 border-t border-white/10 pt-1 text-[9px] text-neutral-300">
            {relatedSignals.map((signal) => {
              const itemAccepted = isTrulyAccepted(signal);
              const itemPending = isPending(signal);
              const itemLabel = itemAccepted
                ? "ACCEPTED"
                : itemPending
                  ? "PENDING"
                  : "REJECTED";
              const itemReason = normalizeRejectionReason(
                signal.rejection_reason || signal.reason
              );
              return (
                <div
                  key={signal.signal_id}
                  className="mb-1 rounded border border-white/5 bg-black/10 px-1.5 py-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-neutral-200">
                      {signal.direction || "?"} · {itemLabel}
                    </span>
                    <span className="text-neutral-500">{signal.decision_stage || "—"}</span>
                  </div>
                  <div className="text-neutral-400">{itemReason}</div>
                </div>
              );
            })}
          </div>
        )}
        {extraCount > 0 && (
          <div className="mt-1 text-[9px] text-neutral-400">
            +{extraCount} autre(s) signal(s) au même timestamp
          </div>
        )}
        <div className="mt-1 text-[9px] text-neutral-500">
          {pinned ? "Click chart to clear" : "Hover/click signal"}
        </div>
      </div>
    </div>
  );
}

function TradeHoverOverlay({
  data,
  pinned,
}: {
  data: TradeHoverAudit | null;
  pinned: boolean;
}) {
  if (!data || data.events.length === 0) return null;
  const primary = data.events[0];
  const trade = primary.trade;
  const eventLabel = formatTradeEventLabel(primary.eventType);
  const pnlUsd = trade.pnl_usd_display ?? null;
  const pnlPips = trade.isOpen
    ? trade.unrealized_pips
    : (trade.net_pips_display ?? trade.pnl_pips);
  const relatedEvents = data.events.slice(0, 4);

  return (
    <div className="pointer-events-none absolute right-3 top-3 z-20 max-w-[320px] text-[10px] text-neutral-200">
      <div className="border border-white/10 bg-black/35 backdrop-blur-[2px] px-2 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
        <div className="flex items-center justify-between gap-2 text-[9px] text-neutral-400">
          <span className="uppercase tracking-[0.12em] text-sky-300">Trade detail</span>
          {pinned && <span className="text-[9px] text-amber-300">PIN</span>}
        </div>
        <div className="mt-1 text-[11px] font-semibold text-neutral-100">
          {trade.side} · {trade.symbol || "—"} · {eventLabel}
        </div>
        <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-neutral-300">
          <span><span className="text-neutral-500">Trade</span> {trade.trade_id || "—"}</span>
          <span><span className="text-neutral-500">Signal</span> {trade.signal_id || "—"}</span>
          <span><span className="text-neutral-500">Status</span> {trade.status || "—"}</span>
          <span><span className="text-neutral-500">Exit</span> {trade.exit_reason || "OPEN"}</span>
          <span><span className="text-neutral-500">Qty</span> {trade.qty ?? "—"}</span>
          <span><span className="text-neutral-500">Durée</span> {formatDuration(trade.duration_ms)}</span>
          <span><span className="text-neutral-500">Entry</span> {formatPrice(trade.entry_price)}</span>
          <span><span className="text-neutral-500">Exit</span> {formatPrice(trade.exit_price)}</span>
          <span><span className="text-neutral-500">TP</span> {formatPrice(trade.tp_price)}</span>
          <span><span className="text-neutral-500">SL</span> {formatPrice(trade.sl_price)}</span>
          <span><span className="text-neutral-500">PnL USD</span> {pnlUsd != null ? `${pnlUsd >= 0 ? "+" : ""}${pnlUsd.toFixed(2)}` : "—"}</span>
          <span><span className="text-neutral-500">PnL pips</span> {formatPips(pnlPips)}</span>
        </div>
        {trade.scale_out_ts && (
          <div className="mt-1 text-neutral-400">
            <span className="text-neutral-500">Scale-out:</span>{" "}
            {formatTime(trade.scale_out_ts, "UTC")} @ {formatPrice(trade.scale_out_price)}
          </div>
        )}
        {relatedEvents.length > 1 && (
          <div className="mt-2 border-t border-white/10 pt-1 text-[9px] text-neutral-300">
            {relatedEvents.map((event, index) => (
              <div
                key={`${event.trade.canonical_id}-${event.eventType}-${index}`}
                className="mb-1 rounded border border-white/5 bg-black/10 px-1.5 py-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-neutral-200">
                    {event.trade.side} · {formatTradeEventLabel(event.eventType)}
                  </span>
                  <span className="text-neutral-500">
                    {event.eventType === "ENTRY"
                      ? formatTime(event.trade.entry_time, "UTC")
                      : event.eventType === "EXIT"
                        ? formatTime(event.trade.exit_time, "UTC")
                        : formatTime(event.trade.scale_out_ts, "UTC")}
                  </span>
                </div>
                <div className="text-neutral-400">
                  {event.trade.trade_id} · {event.trade.exit_reason || event.trade.status || "—"}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-1 text-[9px] text-neutral-500">
          {pinned ? "Click row/chart to clear" : "Hover/click trade"}
        </div>
      </div>
    </div>
  );
}

function toCandle(c: Ohlc) {
  const t = toTime(c.timestamp);
  if (t == null) {
    return { time: null, open: 0, high: 0, low: 0, close: 0 };
  }
  return {
    time: t,
    open: c.open ?? 0,
    high: c.high ?? 0,
    low: c.low ?? 0,
    close: c.close ?? 0,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toChartBar(c: Ohlc): {
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

function computeAtr(bars: Ohlc[], period: number): number[] {
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

function getSessionLevels(bars: Ohlc[]) {
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

function isValidBar(b: Ohlc) {
  return (
    b &&
    typeof b.timestamp === "string" &&
    Number.isFinite(Date.parse(b.timestamp)) &&
    [b.open, b.high, b.low, b.close].every((v) => isFiniteNumber(v))
  );
}

function ensureAscending<T extends { time: number }>(arr: T[]): T[] {
  let last = -Infinity;
  return arr.map((item) => {
    let t = item.time;
    if (!Number.isFinite(t)) t = last + 1;
    if (t <= last) t = last + 1;
    last = t;
    return { ...item, time: t };
  });
}

function sortByTime<T extends { time: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.time - b.time);
}

function Chip({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] ${accent ? "border-[rgba(0,198,255,0.4)] text-[var(--accent)]" : "border-white/10 text-neutral-300"
        }`}
    >
      {label}
    </span>
  );
}

function DataSourceBadge({ source }: { source: 'CANONICAL' | 'LEGACY' | 'NONE' }) {
  const config = {
    CANONICAL: { bg: 'bg-emerald-900/30', border: 'border-emerald-500/50', text: 'text-emerald-400', label: 'CANONICAL' },
    LEGACY: { bg: 'bg-amber-900/30', border: 'border-amber-500/50', text: 'text-amber-400', label: 'LEGACY' },
    NONE: { bg: 'bg-neutral-800', border: 'border-neutral-600', text: 'text-neutral-400', label: 'NO DATA' },
  }[source];

  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${config.bg} ${config.border} ${config.text}`}>
      {config.label}
    </span>
  );
}

/** Toggle control for chart options - persisted via localStorage */
function ChartToggle({ label, checked, onChange, subtle }: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  subtle?: boolean;
}) {
  return (
    <label className={`flex items-center gap-1.5 cursor-pointer select-none ${subtle ? 'opacity-60 hover:opacity-100' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <div className={`
        w-6 h-3.5 rounded-full transition-colors
        ${checked ? 'bg-cyan-600' : 'bg-neutral-700'}
        peer-focus:ring-1 peer-focus:ring-cyan-500/50
        relative
      `}>
        <div className={`
          absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-transform
          ${checked ? 'translate-x-3' : 'translate-x-0.5'}
        `} />
      </div>
      <span className="text-neutral-400">{label}</span>
    </label>
  );
}

/**
 * SessionZoneIndicator - Shows current FX session with color-coded pill.
 * 
 * FX Sessions (UTC):
 * - Asia/Sydney:  22:00 → 07:00
 * - London:       07:00 → 16:00
 * - New York:     13:00 → 22:00
 * - Overlap:      13:00 → 16:00 (London + NY)
 */
function SessionZoneIndicator() {
  const now = new Date();
  const h = now.getUTCHours();
  const day = now.getUTCDay();

  // Weekend
  if (day === 6 || (day === 0 && h < 22)) {
    return (
      <div className="pointer-events-none absolute left-3 bottom-3 z-10">
        <span className="text-[9px] px-2 py-1 rounded border border-neutral-600/40 bg-neutral-800/60 text-neutral-500 uppercase tracking-[0.12em]">
          Weekend
        </span>
      </div>
    );
  }

  type SessionInfo = { label: string; color: string; bg: string; border: string };
  let session: SessionInfo;

  if (h >= 13 && h < 16) {
    // London + NY overlap - best liquidity
    session = {
      label: "LDN + NY",
      color: "text-green-300",
      bg: "bg-green-900/30",
      border: "border-green-500/40",
    };
  } else if (h >= 7 && h < 16) {
    // London
    session = {
      label: "London",
      color: "text-sky-300",
      bg: "bg-sky-900/30",
      border: "border-sky-500/40",
    };
  } else if (h >= 13 && h < 22) {
    // New York (after London close)
    session = {
      label: "New York",
      color: "text-purple-300",
      bg: "bg-purple-900/30",
      border: "border-purple-500/40",
    };
  } else {
    // Asia/Sydney
    session = {
      label: "Asia",
      color: "text-amber-300",
      bg: "bg-amber-900/20",
      border: "border-amber-500/30",
    };
  }

  return (
    <div className="pointer-events-none absolute left-3 bottom-3 z-10">
      <span className={`text-[9px] px-2 py-1 rounded border ${session.bg} ${session.border} ${session.color} uppercase tracking-[0.12em] font-medium`}>
        {session.label}
      </span>
    </div>
  );
}

/**
 * AXE 4: Isolated LiveBadge — self-ticking every 2s.
 * This prevents the entire PriceTradesTV (2800+ lines) from re-rendering
 * just to update a tiny badge's visibility.
 */
function LiveBadge({ lastLiveUpdate, frozen }: { lastLiveUpdate: number | null; frozen: boolean }) {
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, []);
  const show = lastLiveUpdate && Date.now() - lastLiveUpdate < 10000 && !frozen;
  if (!show) return null;
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-900/40 border border-emerald-500/50 text-emerald-400 animate-pulse">
      LIVE
    </span>
  );
}
