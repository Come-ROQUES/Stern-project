import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  canonicalApi,
  useCanonicalTrades,
  type CanonicalTrade,
  type Signal,
} from "../../lib/canonicalApi";
import { summarizeExtremeSignals } from "../../lib/signalMode";
import {
  getChartTradesFetchLimit,
  getVisibleCandlesForTimeframe,
} from "./chartShared";

export interface ProcessedTrade extends CanonicalTrade {
  isOpen: boolean;
  pnl_pips: number | null;
  net_pips_display?: number | null;
  pnl_usd_display?: number | null;
  duration_ms: number | null;
  unrealized_pips?: number | null;
}

export interface SignalHoverAudit {
  time: number;
  signals: Signal[];
}

export interface TradeHoverEvent {
  time: number;
  eventType: "ENTRY" | "EXIT" | "SCALE_OUT";
  trade: ProcessedTrade;
}

export interface TradeHoverAudit {
  time: number;
  events: TradeHoverEvent[];
}

export interface TradeSummary {
  total: number;
  openCount: number;
  closedCount: number;
  wins: number;
  losses: number;
  netUsd: number;
  netPips: number;
  bestPips: number | null;
  worstPips: number | null;
}

interface UsePriceTradesDataParams {
  effectiveRunId: string | null | undefined;
  effectiveStratId?: string;
  activeStrategy: string;
  runWindow: { start: string; end: string } | null;
  visibleRange: { from: number; to: number } | null;
  settledVisibleRange: { from: number; to: number } | null;
  timeframeSeconds: number;
  latestPrice: number | null;
  commissionView: "reported" | "economic";
  enabled: boolean;
  fullRunRequested: boolean;
  toggles: {
    showAcceptedSignals: boolean;
    showRefusedSignals: boolean;
  };
}

const PIP_DIVISOR = 10000;
const SIGNALS_FETCH_LIMIT = 500;
const SIGNAL_QUERY_CACHE_TTL_MS = 20_000;
const SIGNAL_FETCH_PADDING_SEC = 15 * 60;
const TRADES_PANEL_MAX_VISIBLE = 250;
const TRADE_MARKERS_MAX_TRADES = 160;

const signalQueryCache = new Map<
  string,
  {
    signals: Signal[];
    cachedAt: number;
  }
>();

export { getChartTradesFetchLimit };

function toSignalQueryBucketMs(
  isoTs: string,
  bucketSec: number
): number | null {
  const ts = Date.parse(isoTs);
  if (!Number.isFinite(ts)) return null;
  return Math.round(ts / (bucketSec * 1000)) * bucketSec * 1000;
}

export function buildSignalQueryCacheKey(
  runId: string | null | undefined,
  strategyId: string,
  queryWindow: { start: string; end: string } | null,
  timeframeSec: number
): string | null {
  if (!runId || !queryWindow) return null;
  const bucketSec = Math.max(60, timeframeSec * 12);
  const startMs = toSignalQueryBucketMs(queryWindow.start, bucketSec);
  const endMs = toSignalQueryBucketMs(queryWindow.end, bucketSec);
  if (!Number.isFinite(startMs as number) || !Number.isFinite(endMs as number)) {
    return null;
  }
  return `${runId}::${strategyId}::${timeframeSec}::${startMs}::${endMs}`;
}

export function computeSignalQueryWindow(
  runWindow: { start: string; end: string } | null,
  visibleRange: { from: number; to: number } | null,
  timeframeSec: number
): { start: string; end: string } | null {
  const runStartMs = runWindow ? Date.parse(runWindow.start) : NaN;
  const runEndMs = runWindow ? Date.parse(runWindow.end) : NaN;

  if (visibleRange) {
    const fromMs = (visibleRange.from - SIGNAL_FETCH_PADDING_SEC) * 1000;
    const toMs = (visibleRange.to + SIGNAL_FETCH_PADDING_SEC) * 1000;
    const clampedFrom = Number.isFinite(runStartMs)
      ? Math.max(runStartMs, fromMs)
      : fromMs;
    const clampedTo = Number.isFinite(runEndMs) ? Math.min(runEndMs, toMs) : toMs;
    if (!Number.isFinite(clampedFrom) || !Number.isFinite(clampedTo)) return null;
    if (clampedTo <= clampedFrom) return null;
    return {
      start: new Date(clampedFrom).toISOString(),
      end: new Date(clampedTo).toISOString(),
    };
  }

  if (!Number.isFinite(runStartMs) || !Number.isFinite(runEndMs)) {
    return null;
  }

  const defaultSpanSec = Math.max(
    SIGNAL_FETCH_PADDING_SEC * 2,
    getVisibleCandlesForTimeframe(timeframeSec) * timeframeSec * 3
  );
  const startMs = Math.max(runStartMs, runEndMs - defaultSpanSec * 1000);
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(runEndMs).toISOString(),
  };
}

function readSignalQueryCache(cacheKey: string | null): Signal[] | null {
  if (!cacheKey) return null;
  const cached = signalQueryCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > SIGNAL_QUERY_CACHE_TTL_MS) {
    signalQueryCache.delete(cacheKey);
    return null;
  }
  return [...cached.signals];
}

function writeSignalQueryCache(cacheKey: string | null, signals: Signal[]): void {
  if (!cacheKey) return;
  signalQueryCache.set(cacheKey, {
    signals: [...signals],
    cachedAt: Date.now(),
  });
  if (signalQueryCache.size > 64) {
    const oldestKey = signalQueryCache.keys().next().value;
    if (oldestKey) signalQueryCache.delete(oldestKey);
  }
}

function tradeHasExits(trade: ProcessedTrade): boolean {
  const hasFlag = trade.has_exit_orders === 1 || trade.has_exit_orders === true;
  const hasIds = Boolean(trade.tp_order_id) && Boolean(trade.sl_order_id);
  const hasPrices = trade.tp_price != null && trade.sl_price != null;
  return hasFlag || hasIds || hasPrices;
}

export function normalizeRejectionReason(reason: string | null | undefined): string {
  const normalized = reason?.trim();
  return normalized && normalized.length > 0 ? normalized : "UNSPECIFIED";
}

export function isTrulyAccepted(signal: Signal): boolean {
  const stage = signal.decision_stage?.toUpperCase() ?? "";
  const waitReason = signal.wait_reason?.toUpperCase() ?? "";
  const rejection = normalizeRejectionReason(signal.rejection_reason);
  return signal.accepted && rejection === "UNSPECIFIED" && !stage.includes("TIMEOUT") && !waitReason.includes("TIMEOUT");
}

export function isPending(signal: Signal): boolean {
  const stage = signal.decision_stage?.toUpperCase() ?? "";
  const waitState = signal.wait_state?.toUpperCase() ?? "";
  const waitReason = signal.wait_reason?.toUpperCase() ?? "";
  const hasPendingStage =
    stage.includes("WAIT") ||
    stage.includes("PENDING") ||
    waitState.includes("WAIT") ||
    waitState.includes("PENDING") ||
    waitReason.includes("WAIT") ||
    waitReason.includes("PENDING");

  if (!hasPendingStage) return false;
  if (!signal.accepted) return false;

  const rejection = normalizeRejectionReason(signal.rejection_reason);
  if (rejection !== "UNSPECIFIED") return false;
  if (stage.includes("TIMEOUT") || waitReason.includes("TIMEOUT")) return false;
  if (signal.was_traded) return false;
  if (signal.trade_id && signal.trade_id.trim() !== "") return false;

  return true;
}

function alignToBucket(ts: string, timeframeSec: number): number {
  const ms = Date.parse(ts);
  return Math.floor(ms / 1000 / timeframeSec) * timeframeSec;
}

function tradeOverlapsRange(
  entryTime: string | null | undefined,
  exitTime: string | null | undefined,
  range: { from: number; to: number }
): boolean {
  const startSec = entryTime ? Math.floor(Date.parse(entryTime) / 1000) : null;
  const endSec = exitTime ? Math.floor(Date.parse(exitTime) / 1000) : startSec;
  if (startSec == null || !Number.isFinite(startSec)) return false;
  const safeEnd = endSec != null && Number.isFinite(endSec) ? endSec : startSec;
  return safeEnd >= range.from && startSec <= range.to;
}

export function selectTradesForPanel(
  trades: ProcessedTrade[],
  visibleRange: { from: number; to: number } | null,
  limit = TRADES_PANEL_MAX_VISIBLE
): ProcessedTrade[] {
  const openTrades = trades
    .filter((trade) => trade.isOpen)
    .sort((a, b) => Date.parse(b.entry_time ?? "") - Date.parse(a.entry_time ?? ""));
  const closedTrades = trades.filter((trade) => !trade.isOpen);
  const viewportClosedTrades = visibleRange
    ? closedTrades.filter((trade) =>
        tradeOverlapsRange(trade.entry_time, trade.exit_time, visibleRange)
      )
    : closedTrades;
  const closedSelection =
    viewportClosedTrades.length > 0 ? viewportClosedTrades : closedTrades;
  const orderedClosedTrades = [...closedSelection].sort((a, b) => {
    const aTs = Date.parse(a.exit_time ?? a.entry_time ?? "");
    const bTs = Date.parse(b.exit_time ?? b.entry_time ?? "");
    return bTs - aTs;
  });
  return [...openTrades, ...orderedClosedTrades].slice(0, limit);
}

export function summarizeTradesForViewport(
  trades: ProcessedTrade[]
): TradeSummary {
  let openCount = 0;
  let closedCount = 0;
  let wins = 0;
  let losses = 0;
  let netUsd = 0;
  let netPips = 0;
  let bestPips: number | null = null;
  let worstPips: number | null = null;

  trades.forEach((trade) => {
    if (trade.isOpen) {
      openCount += 1;
      netPips += trade.unrealized_pips ?? 0;
      return;
    }

    closedCount += 1;
    const usd = trade.pnl_usd_display ?? 0;
    const pips = trade.net_pips_display ?? trade.pnl_pips ?? 0;
    netUsd += usd;
    netPips += pips;
    if (usd >= 0) wins += 1;
    else losses += 1;
    bestPips = bestPips == null ? pips : Math.max(bestPips, pips);
    worstPips = worstPips == null ? pips : Math.min(worstPips, pips);
  });

  return {
    total: trades.length,
    openCount,
    closedCount,
    wins,
    losses,
    netUsd,
    netPips,
    bestPips,
    worstPips,
  };
}

export function getLatestTradeTimeSec(
  trades: Array<Pick<ProcessedTrade, "entry_time" | "exit_time" | "scale_out_ts">>
): number | null {
  let latest: number | null = null;

  trades.forEach((trade) => {
    [trade.entry_time, trade.exit_time, trade.scale_out_ts].forEach((ts) => {
      if (!ts) return;
      const ms = Date.parse(ts);
      if (!Number.isFinite(ms)) return;
      const sec = Math.floor(ms / 1000);
      latest = latest == null ? sec : Math.max(latest, sec);
    });
  });

  return latest;
}

export function countPendingCandidates(signals: Signal[]): number {
  return signals.filter(isPending).length;
}

export function countTrulyAccepted(signals: Signal[]): number {
  return signals.filter(isTrulyAccepted).length;
}

export function countPending(signals: Signal[]): number {
  return Math.min(1, countPendingCandidates(signals));
}

export function getTopRejectionReasons(
  signals: Signal[]
): { reason: string; count: number }[] {
  const rejected = signals.filter((signal) => !isTrulyAccepted(signal) && !isPending(signal));
  const counts: Record<string, number> = {};
  rejected.forEach((signal) => {
    const reason = normalizeRejectionReason(signal.rejection_reason);
    counts[reason] = (counts[reason] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
}

export function usePriceTradesData({
  effectiveRunId,
  effectiveStratId,
  activeStrategy,
  runWindow,
  visibleRange,
  settledVisibleRange,
  timeframeSeconds,
  latestPrice,
  commissionView,
  enabled,
  fullRunRequested,
  toggles,
}: UsePriceTradesDataParams) {
  const signalsFetchRef = useRef<{ runId: string | null; inFlight: boolean }>({
    runId: null,
    inFlight: false,
  });
  const lastSignalsQueryKeyRef = useRef<string | null>(null);

  useEffect(() => {
    signalsFetchRef.current = {
      runId: effectiveRunId ?? null,
      inFlight: false,
    };
    lastSignalsQueryKeyRef.current = null;
  }, [effectiveRunId]);

  const tradesFetchLimit = useMemo(
    () => getChartTradesFetchLimit(fullRunRequested),
    [fullRunRequested]
  );
  const {
    trades: canonicalTrades,
    loading: tradesLoading,
    noRunId: tradesNoRunId,
  } = useCanonicalTrades(effectiveRunId, tradesFetchLimit, {
    strategyId: effectiveStratId,
    commissionView,
    enabled,
  });

  const filteredTrades = useMemo(() => {
    if (!activeStrategy) return canonicalTrades;
    return canonicalTrades.filter((trade) => trade.strategy_id === activeStrategy);
  }, [canonicalTrades, activeStrategy]);

  const [signals, setSignals] = useState<Signal[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const filterSignalsByStrategy = useCallback(
    (items: Signal[]) => {
      if (!activeStrategy) return items;
      return items.filter((signal) => signal.strategy === activeStrategy);
    },
    [activeStrategy]
  );

  useEffect(() => {
    let cancelled = false;

    const loadSignals = async () => {
      if (!effectiveRunId) {
        setSignals([]);
        setSignalsLoading(false);
        return;
      }
      if (
        signalsFetchRef.current.inFlight &&
        signalsFetchRef.current.runId === effectiveRunId
      ) {
        return;
      }
      signalsFetchRef.current.inFlight = true;
      signalsFetchRef.current.runId = effectiveRunId;

      const queryWindow = computeSignalQueryWindow(
        runWindow,
        settledVisibleRange ?? visibleRange,
        timeframeSeconds
      );
      if (!queryWindow) {
        if (!cancelled) setSignals([]);
        signalsFetchRef.current.inFlight = false;
        lastSignalsQueryKeyRef.current = null;
        return;
      }

      const queryCacheKey = buildSignalQueryCacheKey(
        effectiveRunId,
        activeStrategy,
        queryWindow,
        timeframeSeconds
      );
      const cachedSignals = readSignalQueryCache(queryCacheKey);
      if (cachedSignals) {
        lastSignalsQueryKeyRef.current = queryCacheKey;
        if (!cancelled) {
          setSignals(cachedSignals);
          setSignalsLoading(false);
        }
        signalsFetchRef.current.inFlight = false;
        return;
      }

      lastSignalsQueryKeyRef.current = queryCacheKey;
      setSignalsLoading(true);

      try {
        const data = await canonicalApi.listSignals(effectiveRunId, {
          limit: SIGNALS_FETCH_LIMIT,
          order: "desc",
          from_ts: queryWindow.start,
          to_ts: queryWindow.end,
          strategyId: activeStrategy,
          lite: true,
        });
        const sorted = [...(data.signals ?? [])].sort(
          (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
        );
        const nextSignals = filterSignalsByStrategy(sorted);
        writeSignalQueryCache(queryCacheKey, nextSignals);
        if (!cancelled) {
          setSignals(nextSignals);
        }
      } catch {
        if (!cancelled) setSignals([]);
      } finally {
        if (!cancelled) setSignalsLoading(false);
        signalsFetchRef.current.inFlight = false;
      }
    };

    const timeoutId = window.setTimeout(loadSignals, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    activeStrategy,
    effectiveRunId,
    filterSignalsByStrategy,
    runWindow,
    settledVisibleRange,
    timeframeSeconds,
    visibleRange,
  ]);

  const computeNetPnlUsd = useCallback((trade: CanonicalTrade): number | null => {
    if (trade.pnl_net_usd_used != null) return trade.pnl_net_usd_used;
    if (trade.pnl_net_usd != null) return trade.pnl_net_usd;
    if (trade.pnl_net_eur_used != null && trade.fx_rate_used != null) {
      return trade.pnl_net_eur_used * trade.fx_rate_used;
    }
    const pips = trade.net_pips_used ?? trade.pnl_net_pips ?? trade.pnl_pips ?? null;
    if (pips == null) return null;
    const qty = trade.qty ?? 0;
    return pips * qty * 0.0001;
  }, []);

  const computeNetPips = useCallback(
    (trade: CanonicalTrade, fallbackGross: number | null) => {
      if (trade.net_pips_used != null) return trade.net_pips_used;
      if (trade.pnl_net_pips != null) return trade.pnl_net_pips;
      if (trade.pnl_pips != null) return trade.pnl_pips;
      return fallbackGross;
    },
    []
  );

  const processOneTrade = useCallback(
    (trade: CanonicalTrade, currentPrice: number | null): ProcessedTrade => {
      const isOpen = trade.exit_price == null || trade.status === "OPEN";
      const pnl_pips =
        trade.entry_price != null && trade.exit_price != null
          ? (trade.side === "BUY"
              ? trade.exit_price - trade.entry_price
              : trade.entry_price - trade.exit_price) * PIP_DIVISOR
          : null;
      const duration_ms =
        trade.entry_time && trade.exit_time && !isOpen
          ? Date.parse(trade.exit_time) - Date.parse(trade.entry_time)
          : trade.entry_time
            ? Date.now() - Date.parse(trade.entry_time)
            : null;
      const unrealized_pips =
        isOpen && trade.entry_price != null && currentPrice != null
          ? (trade.side === "BUY"
              ? currentPrice - trade.entry_price
              : trade.entry_price - currentPrice) * PIP_DIVISOR
          : null;
      const net_pips_display = computeNetPips(trade, pnl_pips);
      const pnl_usd_display = computeNetPnlUsd(trade);

      return {
        ...trade,
        isOpen,
        pnl_pips,
        net_pips_display,
        pnl_usd_display,
        duration_ms,
        unrealized_pips,
      };
    },
    [computeNetPips, computeNetPnlUsd]
  );

  const closedProcessedTrades = useMemo<ProcessedTrade[]>(
    () =>
      filteredTrades
        .filter((trade) => trade.exit_price != null && trade.status !== "OPEN")
        .map((trade) => processOneTrade(trade, null)),
    [filteredTrades, processOneTrade]
  );

  const openProcessedTrades = useMemo<ProcessedTrade[]>(
    () =>
      filteredTrades
        .filter((trade) => trade.exit_price == null || trade.status === "OPEN")
        .map((trade) => processOneTrade(trade, latestPrice)),
    [filteredTrades, latestPrice, processOneTrade]
  );

  const openOverlayTrades = useMemo<ProcessedTrade[]>(
    () =>
      filteredTrades
        .filter((trade) => trade.exit_price == null || trade.status === "OPEN")
        .map((trade) => processOneTrade(trade, null)),
    [filteredTrades, processOneTrade]
  );

  const processedTrades = useMemo<ProcessedTrade[]>(
    () => [...closedProcessedTrades, ...openProcessedTrades],
    [closedProcessedTrades, openProcessedTrades]
  );
  const latestTradeTimeSec = useMemo(
    () => getLatestTradeTimeSec(processedTrades),
    [processedTrades]
  );

  const openTrades = openProcessedTrades;
  const chartMarkerTrades = useMemo(
    () =>
      selectTradesForPanel(
        processedTrades,
        settledVisibleRange,
        TRADE_MARKERS_MAX_TRADES
      ),
    [processedTrades, settledVisibleRange]
  );
  const visibleTrades = useMemo(
    () => selectTradesForPanel(processedTrades, settledVisibleRange),
    [processedTrades, settledVisibleRange]
  );
  const visibleTradesSummary = useMemo(
    () => summarizeTradesForViewport(visibleTrades),
    [visibleTrades]
  );

  const openTradesNoExit = useMemo(
    () =>
      openOverlayTrades.filter((trade) => {
        const status = trade.status || "";
        if (status === "OPEN_NO_EXIT") return true;
        if (!status.startsWith("OPEN")) return false;
        return !tradeHasExits(trade);
      }),
    [openOverlayTrades]
  );

  const closedTrades = closedProcessedTrades;
  const refusedSignals = useMemo(
    () => signals.filter((signal) => !isTrulyAccepted(signal) && !isPending(signal)),
    [signals]
  );
  const extremeSummary = useMemo(() => summarizeExtremeSignals(signals), [signals]);
  const hoverableSignals = useMemo(
    () =>
      signals.filter((signal) => {
        if (isTrulyAccepted(signal)) return toggles.showAcceptedSignals;
        return toggles.showRefusedSignals;
      }),
    [signals, toggles.showAcceptedSignals, toggles.showRefusedSignals]
  );

  const hoverableSignalsByTime = useMemo(() => {
    const map = new Map<number, Signal[]>();
    hoverableSignals.forEach((signal) => {
      const bucket = alignToBucket(signal.timestamp, timeframeSeconds);
      if (!Number.isFinite(bucket)) return;
      const list = map.get(bucket);
      if (list) {
        list.push(signal);
      } else {
        map.set(bucket, [signal]);
      }
    });
    return map;
  }, [hoverableSignals, timeframeSeconds]);

  const hoverableTradeEventsByTime = useMemo(() => {
    const map = new Map<number, TradeHoverEvent[]>();
    const pushEvent = (
      ts: string | null | undefined,
      eventType: TradeHoverEvent["eventType"],
      trade: ProcessedTrade
    ) => {
      if (!ts) return;
      const bucket = alignToBucket(ts, timeframeSeconds);
      if (!Number.isFinite(bucket)) return;
      const nextEvent: TradeHoverEvent = {
        time: bucket,
        eventType,
        trade,
      };
      const list = map.get(bucket);
      if (list) {
        list.push(nextEvent);
      } else {
        map.set(bucket, [nextEvent]);
      }
    };

    chartMarkerTrades.forEach((trade) => {
      pushEvent(trade.entry_time, "ENTRY", trade);
      if (!trade.isOpen) {
        pushEvent(trade.exit_time, "EXIT", trade);
      }
      if (trade.scale_out_ts) {
        pushEvent(trade.scale_out_ts, "SCALE_OUT", trade);
      }
    });

    return map;
  }, [chartMarkerTrades, timeframeSeconds]);

  return {
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
    refusedSignals,
    signals,
    signalsLoading,
    tradesLoading,
    tradesNoRunId,
    visibleTrades,
    visibleTradesSummary,
    extremeSummary,
  };
}
