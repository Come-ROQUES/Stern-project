import React, {
  startTransition,
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
  Suspense,
} from "react";
import {
  api,
  DwSummary,
  MarketMetrics,
  MarketProfileRow,
  Ohlc,
  OhlcPayload,
  S2Summary,
  Signal,
  SystemStatus,
} from "../lib/api";
import { ActiveContext, DataScope, activeContext, defaultScope, deriveContextForScope } from "../lib/activeContext";
import { ScopeSelector } from "./ui/ScopeSelector";
import { useRunId, useRunMeta } from "../lib/useRunContext";
import { DeferredRender } from "./ui/DeferredRender";
import { RunMetadataBanner } from "./ui/RunMetadataBanner";
import {
  CanonicalTrade,
  computeCanonicalStats,
  type ExecutionStats,
  useCanonicalTrades,
} from "../lib/canonicalApi";
import { ProTerminalMarketStateChart } from "./ProTerminalMarketStateChart";
import { StrategySwitchTabs } from "./StrategySwitchTabs";
import { autoSyncBundleS2RunId, useBundleRuns } from "../lib/useBundleRuns";
import { useCommissionView } from "../lib/useCommissionView";
import {
  useDashboardCandles,
  useDashboardTimeframe,
} from "../lib/timeframeContext";
import {
  TIMEFRAMES,
} from "../lib/aggregateCandles";
import { useLiveStream } from "../lib/useLiveStream";
import {
  getExtremeState,
  getSignalModeLabel,
  isExtremeSignal,
  summarizeExtremeSignals,
} from "../lib/signalMode";
import { ApexChart } from "../lib/ApexChart";
import { useViewVisibility } from "../lib/viewActivity";

const palette = {
  deep: "#0A0F17",
  petrol: "#0D1F2D",
  cyan: "#2CE3FF",
  red: "#FF4D4D",
  gray: "#A8B2BD",
  green: "#00E586",
};

const SYSTEM_TICK_UI_UPDATE_MS = 400;

type Tone = "success" | "warn" | "danger" | "neutral";
type TimelineStep = { title: string; status: "idle" | "active" | "done" | "blocked"; detail: string };

function shallowEqualByKey<T>(
  current: T[],
  next: T[],
  getKey: (row: T) => string
): boolean {
  if (current === next) return true;
  if (current.length !== next.length) return false;
  for (let index = 0; index < current.length; index += 1) {
    if (getKey(current[index]) !== getKey(next[index])) {
      return false;
    }
  }
  return true;
}

function sameLogLines(current: string[], next: string[]): boolean {
  if (current === next) return true;
  if (current.length !== next.length) return false;
  return current.every((line, index) => line === next[index]);
}

function isFxMarketOpen(now: Date): boolean {
  const day = now.getUTCDay(); // Sunday=0 ... Saturday=6
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (day === 6) return false; // Saturday
  if (day === 0) return minutes >= 22 * 60; // Sunday after 22:00 UTC
  if (day === 5) return minutes < 22 * 60; // Friday before 22:00 UTC
  return true; // Monday-Thursday
}

/**
 * Pro terminal view: price+signals overlay, canonical execution, microstructure, alerts.
 */
export function ProTerminalPanel() {
  // Run context - single source of truth
  const runId = useRunId();
  const { run } = useRunMeta();
  const {
    enabled: bundleEnabled,
    dwRunId,
    s2RunId,
    tfRunId,
    setS2RunId,
  } = useBundleRuns();
  const { commissionView } = useCommissionView();
  const strategyId = run?.strategy_id ?? null;
  const dwStrategyId = bundleEnabled
    ? "damping_wave"
    : run?.strategy_id ?? "damping_wave";
  const dwRunIdEffective = bundleEnabled ? (dwRunId ?? runId) : runId;
  const s2RunIdEffective = bundleEnabled
    ? s2RunId ?? null
    : strategyId === "s2_pairs_trading"
      ? runId
      : null;
  const tfRunIdEffective = bundleEnabled
    ? tfRunId ?? null
    : strategyId === "tf_pullback_v1"
      ? runId
      : null;
  const tfSummaryRunId = tfRunIdEffective ?? null;

  // Canonical data hooks - one fetch per dependency change, no internal polling
  const { trades: canonicalTrades } = useCanonicalTrades(dwRunIdEffective, 500, {
    disablePolling: true,
    strategyId: dwStrategyId,
    commissionView,
  });
  const executionStats = useMemo(
    () => computeCanonicalStats(canonicalTrades),
    [canonicalTrades]
  );

  const [metrics, setMetrics] = useState<MarketMetrics | null>(null);
  const [profiles, setProfiles] = useState<MarketProfileRow[]>([]);
  const [ohlc, setOhlc] = useState<Ohlc[]>([]);
  const [ohlcState, setOhlcState] = useState<string | null>(null);
  const [ohlcMeta, setOhlcMeta] = useState<Record<string, any> | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [dwSummary, setDwSummary] = useState<DwSummary | null>(null);
  const [s2Summary, setS2Summary] = useState<S2Summary | null>(null);
  const [tfSummary, setTfSummary] = useState<DwSummary | null>(null);
  const [s2Resetting, setS2Resetting] = useState(false);
  const [showShocks, setShowShocks] = useState(true);
  const [showPass, setShowPass] = useState(true);
  const [showFail, setShowFail] = useState(true);
  const [showRegime, setShowRegime] = useState(true);
  const [showCanonicalTrades, setShowCanonicalTrades] = useState(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [dataScope, setDataScope] = useState<DataScope>(defaultScope);
  const { timeframe, setTimeframe } = useDashboardTimeframe();
  const scopedContext: ActiveContext = useMemo(() => {
    // Inject run_id from useRunContext into the context
    const ctx = deriveContextForScope(activeContext, dataScope);
    if (dwRunIdEffective) {
      return { ...ctx, run_id: dwRunIdEffective };
    }
    return ctx;
  }, [dataScope, dwRunIdEffective]);
  const s2ScopedContext: ActiveContext = useMemo(() => {
    const ctx = deriveContextForScope(activeContext, dataScope);
    if (s2RunIdEffective) {
      return { ...ctx, run_id: s2RunIdEffective, strategy_id: "s2_pairs_trading" };
    }
    return ctx;
  }, [dataScope, s2RunIdEffective]);
  const tfScopedContext: ActiveContext = useMemo(() => {
    const ctx = deriveContextForScope(activeContext, dataScope);
    if (tfSummaryRunId) {
      return { ...ctx, run_id: tfSummaryRunId, strategy_id: "tf_pullback_v1" };
    }
    return { ...ctx, strategy_id: "tf_pullback_v1" };
  }, [dataScope, tfSummaryRunId]);

  const handleResetS2 = useCallback(async () => {
    if (!bundleEnabled) {
      setError("Activez le bundle pour sélectionner le run S2.");
      return;
    }
    setS2Resetting(true);
    try {
      const activeRes = await api.getS2ActiveRun();
      let targetRunId =
        activeRes?.run && typeof activeRes.run.run_id === "string"
          ? activeRes.run.run_id
          : null;
      if (!targetRunId) {
        const resetRes = await api.resetS2Run("banner_reset_latest");
        targetRunId =
          resetRes && typeof resetRes.run_id === "string" ? resetRes.run_id : null;
      }
      if (!targetRunId) {
        const signals = await api.getS2Signals(1, {
          ...activeContext,
          run_id: "",
        });
        const latest = signals?.[0];
        targetRunId =
          latest && typeof latest.run_id === "string" ? latest.run_id : null;
      }
      if (!targetRunId) {
        setError("Aucun run S2 disponible pour reset.");
        return;
      }
      if (dwRunIdEffective && targetRunId === dwRunIdEffective) {
        setError("DW et S2 doivent être distincts. Sélectionnez un run S2.");
        return;
      }
      if (tfRunIdEffective && targetRunId === tfRunIdEffective) {
        setError("S2 et S3 doivent être distincts. Sélectionnez un run S2.");
        return;
      }
      setS2RunId(targetRunId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset S2 impossible");
    } finally {
      setS2Resetting(false);
    }
  }, [bundleEnabled, dwRunIdEffective, tfRunIdEffective, setS2RunId, setError]);

  const handleStrategySwitch = useCallback((target: string) => {
    if (typeof window !== "undefined") {
      window.location.hash =
        target === "dw"
          ? "#terminal"
          : target === "s2"
            ? "#pairs"
            : "#s3";
    }
  }, []);

  const s2AutoResolvedRef = useRef(false);
  useEffect(() => {
    if (!bundleEnabled || s2RunId || s2AutoResolvedRef.current) return;
    let cancelled = false;
    api
      .getS2ActiveRun()
      .then((res) => {
        if (cancelled) return;
        const activeRunId =
          res?.run && typeof res.run.run_id === "string" ? res.run.run_id : null;
        if (activeRunId) {
          autoSyncBundleS2RunId(activeRunId);
        }
        s2AutoResolvedRef.current = true;
      })
      .catch(() => {
        s2AutoResolvedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [bundleEnabled, s2RunId]);

  // PERFORMANCE: Track tab visibility to pause live stream when hidden
  const isVisible = useViewVisibility();
  const isVisibleRef = useRef(isVisible);
  useEffect(() => {
    isVisibleRef.current = isVisible;
  }, [isVisible]);

  const loadedSnapshotRef = useRef(false);
  const lastSystemTickUiRef = useRef(0);
  const fastSnapshotAbortRef = useRef<AbortController | null>(null);
  const slowSnapshotAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isVisible) {
      return;
    }
    fastSnapshotAbortRef.current?.abort();
    slowSnapshotAbortRef.current?.abort();
  }, [isVisible]);

  useEffect(() => {
    return () => {
      fastSnapshotAbortRef.current?.abort();
      slowSnapshotAbortRef.current?.abort();
    };
  }, []);

  const loadTerminalSnapshotFast = useCallback(async () => {
    if (!isVisibleRef.current) return; // Skip if tab hidden
    fastSnapshotAbortRef.current?.abort();
    const controller = new AbortController();
    fastSnapshotAbortRef.current = controller;
    try {
      if (!loadedSnapshotRef.current) {
        setLoading(true);
      }
      const snapshot = await api.getTerminalSnapshot(scopedContext, dataScope, {
        sections: ["system", "ohlc", "signals"],
        signalsMode: "lite",
        signal: controller.signal,
      });
      const ohlcPayload: OhlcPayload = snapshot.ohlc ?? {
        state: "DEGRADED",
        ohlc: [],
      };
      setOhlc((prev) =>
        shallowEqualByKey(
          prev,
          ohlcPayload.ohlc ?? [],
          (row) => `${row.timestamp}:${row.close}:${row.tick_count ?? ""}`
        )
          ? prev
          : (ohlcPayload.ohlc ?? [])
      );
      setOhlcState(ohlcPayload.state ?? null);
      setOhlcMeta(ohlcPayload.meta ?? null);
      setSignals((prev) =>
        shallowEqualByKey(
          prev,
          snapshot.signals ?? [],
          (row) => `${row.timestamp}:${row.signal_id ?? ""}:${row.trade_id ?? ""}:${row.accepted ?? ""}`
        )
          ? prev
          : (snapshot.signals ?? [])
      );
      setSystem(snapshot.system ?? null);

      if (snapshot.system) {
        setError(null);
      } else {
        const firstError = snapshot._meta?.errors?.[0] ?? null;
        if (firstError) {
          setError(firstError);
        }
      }
    } catch (e: any) {
      if (controller.signal.aborted) {
        return;
      }
      setError(e.message || "Failed to load market intelligence");
    } finally {
      if (fastSnapshotAbortRef.current === controller) {
        fastSnapshotAbortRef.current = null;
        loadedSnapshotRef.current = true;
        setLoading(false);
      }
    }
  }, [scopedContext, dataScope]);

  const loadTerminalSnapshotSlow = useCallback(async () => {
    if (!isVisibleRef.current) return;
    slowSnapshotAbortRef.current?.abort();
    const controller = new AbortController();
    slowSnapshotAbortRef.current = controller;
    try {
      const snapshot = await api.getTerminalSnapshot(scopedContext, dataScope, {
        sections: ["market_metrics", "market_profile", "logs"],
        signal: controller.signal,
      });
      setMetrics(snapshot.market_metrics ?? null);
      setProfiles((prev) =>
        shallowEqualByKey(
          prev,
          snapshot.market_profile ?? [],
          (row) => `${row.timestamp}:${row.spread_pips ?? ""}:${row.volatility_regime ?? ""}`
        )
          ? prev
          : (snapshot.market_profile ?? [])
      );
      setLogs((prev) => (sameLogLines(prev, snapshot.logs?.lines ?? []) ? prev : (snapshot.logs?.lines ?? [])));
    } catch {
      if (controller.signal.aborted) {
        return;
      }
      // No-op: keep last good slow snapshot.
    } finally {
      if (slowSnapshotAbortRef.current === controller) {
        slowSnapshotAbortRef.current = null;
      }
    }
  }, [scopedContext, dataScope]);

  useEffect(() => {
    loadedSnapshotRef.current = false;
    void loadTerminalSnapshotFast();
  }, [loadTerminalSnapshotFast]);

  useEffect(() => {
    void loadTerminalSnapshotSlow();
  }, [loadTerminalSnapshotSlow]);

  const loadSummaries = useCallback(async () => {
    if (!dwRunIdEffective || !isVisibleRef.current) {
      if (!dwRunIdEffective) {
        setDwSummary(null);
        setS2Summary(null);
        setTfSummary(null);
      }
      return;
    }
    const results = await Promise.allSettled([
      api.getStrategySummary(scopedContext, "damping_wave"),
      s2RunIdEffective ? api.getS2Summary(s2ScopedContext) : Promise.resolve(null),
      tfSummaryRunId
        ? api.getStrategySummary(tfScopedContext, "tf_pullback_v1")
        : Promise.resolve(null),
    ]);
    const [dwRes, s2Res, tfRes] = results;
    setDwSummary(dwRes.status === "fulfilled" ? dwRes.value : null);
    setS2Summary(s2RunIdEffective && s2Res.status === "fulfilled" ? s2Res.value : null);
    setTfSummary(tfSummaryRunId && tfRes.status === "fulfilled" ? tfRes.value : null);
  }, [
    dwRunIdEffective,
    scopedContext,
    s2RunIdEffective,
    s2ScopedContext,
    tfSummaryRunId,
    tfScopedContext,
  ]);

  useEffect(() => {
    void loadSummaries();
  }, [loadSummaries]);

  const upsertLiveBar = useCallback((bar: Ohlc, replace = false) => {
    setOhlc((prev) => {
      // Fast path: find existing bar from the end (live bars are almost always recent)
      let idx = -1;
      for (let i = prev.length - 1; i >= Math.max(0, prev.length - 5); i--) {
        if (prev[i].timestamp === bar.timestamp) { idx = i; break; }
      }
      if (idx === -1) {
        // Full scan fallback
        idx = prev.findIndex((row) => row.timestamp === bar.timestamp);
      }
      if (idx >= 0) {
        const updated = replace ? bar : { ...prev[idx], ...bar };
        // Same data? Skip re-render
        if (prev[idx].close === updated.close && prev[idx].high === updated.high && prev[idx].low === updated.low) {
          return prev;
        }
        const next = prev.slice(); // shallow copy only when needed
        next[idx] = updated;
        return next;
      }
      // New bar: append (already sorted since live bars arrive in order)
      const next = prev.length >= 300 ? prev.slice(1) : prev.slice();
      next.push(bar);
      return next;
    });
  }, []);

  useLiveStream(
    isVisible,
    {
      onTick: (tick) => {
        const now = Date.now();
        if (
          lastSystemTickUiRef.current &&
          now - lastSystemTickUiRef.current < SYSTEM_TICK_UI_UPDATE_MS
        ) {
          return;
        }
        lastSystemTickUiRef.current = now;
        const tickIso = Number.isFinite(tick.ts)
          ? new Date(tick.ts * 1000).toISOString()
          : new Date().toISOString();
        startTransition(() => {
          setSystem((prev) => {
            const next = { ...(prev ?? {}) } as SystemStatus;
            next.last_tick_time = tickIso;
            next.tick_age_seconds = 0;
            next.data_fresh = true;
            next.bid = tick.bid ?? null;
            next.ask = tick.ask ?? null;
            next.mid = tick.mid ?? null;
            next.spread_pips = tick.spread_pips ?? null;
            next.price = {
              bid: tick.bid ?? null,
              ask: tick.ask ?? null,
              mid: tick.mid ?? null,
              spread_pips: tick.spread_pips ?? null,
            };
            if (next.gateway_connected == null) {
              next.gateway_connected = true;
            }
            const same =
              prev &&
              prev.bid === next.bid &&
              prev.ask === next.ask &&
              prev.mid === next.mid &&
              prev.spread_pips === next.spread_pips &&
              prev.last_tick_time === next.last_tick_time &&
              prev.tick_age_seconds === next.tick_age_seconds;
            return same ? prev : next;
          });
        });
      },
      onNewBar: (bar) => upsertLiveBar(bar, true),
      onBarUpdate: (bar) => upsertLiveBar(bar, false),
    },
    {
      runId: dwRunIdEffective,
      strategyId: "damping_wave",
    }
  );

  const latestProfile = safeLast(profiles) || null;
  const chartOhlc = useDashboardCandles(ohlc, 300);
  const priceSeries = useMemo(() => buildPriceSeries(chartOhlc), [chartOhlc]);
  const atrBands = useMemo(() => buildAtrEnvelope(chartOhlc, profiles), [chartOhlc, profiles]);
  const regimeZones = useMemo(() => buildRegimeZones(profiles), [profiles]);
  const sessionZones = useMemo(() => buildSessionZones(chartOhlc), [chartOhlc]);
  const signalMarkers = useMemo(() => buildSignalMarkers(signals, chartOhlc), [signals, chartOhlc]);
  const shockMarkers = useMemo(() => buildShockMarkers(signals, chartOhlc), [signals, chartOhlc]);
  const canonicalTradeMarkers = useMemo(() => buildCanonicalTradeMarkers(canonicalTrades, chartOhlc), [canonicalTrades, chartOhlc]);
  const shockDensity = useMemo(() => buildShockDensity(signals), [signals]);
  const amplitudeDistribution = useMemo(() => buildAmplitudeDistribution(signals), [signals]);
  const reversionByRegime = useMemo(() => buildReversionByRegime(signals), [signals]);
  const spreadSpark = useMemo(() => buildSpreadSpark(profiles), [profiles]);
  const latencySpark = useMemo(() => buildLatencySpark(metrics), [metrics]);
  const activeStats: ExecutionStats = executionStats;
  const pnlSeries = useMemo(
    () => buildCanonicalPnlSeries(canonicalTrades),
    [canonicalTrades]
  );
  const alertList = useMemo(
    () => buildAlerts({ signals, metrics, latestProfile, activeStats, spreadSpark, latencySpark }),
    [signals, metrics, latestProfile, activeStats, spreadSpark, latencySpark]
  );

  const warmupTarget = 55; // Strategy requires 55 bars (vol_window + window)
  const warmupBars = useMemo(() => {
    if (system?.warmup_bars != null) return Math.min(system.warmup_bars, warmupTarget);
    if (!chartOhlc.length) return 0;
    return Math.min(chartOhlc.length, warmupTarget);
  }, [chartOhlc, system?.warmup_bars]);
  const warmupProgress = Math.min(warmupBars / warmupTarget, 1);
  const warmupActive = (system?.bot_running ?? false) && warmupProgress < 1;
  const s2WarmupState =
    s2Summary?.warmup_state ?? (s2RunIdEffective ? "NO_DATA" : "NO RUN");
  const s2WarmupTarget = s2Summary?.config?.min_warmup ?? null;
  const s2WarmupBars = s2WarmupState.toUpperCase().includes("READY")
    ? s2WarmupTarget
    : s2Summary?.counts?.warmup ?? null;
  const s2WarmupProgress =
    s2WarmupTarget && s2WarmupBars != null && s2WarmupTarget > 0
      ? Math.min(s2WarmupBars / s2WarmupTarget, 1)
      : s2WarmupState.toUpperCase().includes("READY")
        ? 1
        : 0;
  const s2WarmupLabel =
    s2WarmupTarget && s2WarmupBars != null
      ? `${Math.min(s2WarmupBars, s2WarmupTarget)}/${s2WarmupTarget}`
      : s2WarmupState;
  const tfWarmupState =
    tfSummary?.warmup_state ?? (tfSummaryRunId ? "NO_DATA" : "NO RUN");
  const tfLastSignal = tfSummary?.last_signal ?? null;
  const lastSignal = useMemo(() => safeLast(signals) || null, [signals]);
  const extremeSummary = useMemo(() => summarizeExtremeSignals(signals), [signals]);
  const lastSignalModeLabel = useMemo(
    () => (lastSignal ? getSignalModeLabel(lastSignal) : "NORMAL"),
    [lastSignal]
  );
  const lastSignalExtremeState = useMemo(
    () => (lastSignal ? getExtremeState(lastSignal) : null),
    [lastSignal]
  );
  const lastS2Signal = s2Summary?.last_signal ?? null;
  const dwLastSignalLabel = lastSignal
    ? `${lastSignal.direction?.toUpperCase()} · ${lastSignalModeLabel} · z ${fmt(lastSignal.z_score)} · Δ ${fmt(lastSignal.delta_pips, "pips")}`
    : "Aucun";
  const s2LastSignalLabel = lastS2Signal
    ? `${lastS2Signal.direction?.toUpperCase()} · z ${fmt(lastS2Signal.z_score)} · ${lastS2Signal.reason ?? "n/a"}`
    : "Aucun";
  const currentLatency = useMemo(
    () => safeLast(latencySpark)?.y ?? safeNum(system?.latency_ms),
    [latencySpark, system?.latency_ms]
  );
  const currentSpread = latestProfile?.spread_pips ?? null;
  const regimeLabel = latestProfile?.volatility_regime || "UNKNOWN";
  const gatewayConnected =
    system?.health?.gateway_connected ??
    system?.gateway_connected ??
    system?.bot_running ??
    null;
  const botRunning = system?.bot_running ?? null;
  const tradingBlocked =
    system?.health?.trading_blocked ?? system?.trading_blocked ?? false;
  const blockReason =
    system?.health?.block_reason ?? system?.block_reason ?? null;
  const dataFresh =
    system?.health?.data_fresh ??
    system?.data_fresh ??
    (system?.tick_age_seconds != null ? system.tick_age_seconds < 15 : null);
  const tradingTone: Tone =
    system?.kill_switch || tradingBlocked
      ? "danger"
      : system?.trading_paused
        ? "warn"
        : gatewayConnected
          ? "success"
          : "neutral";
  const strategyStateLabel = system?.kill_switch
    ? "Bloquée"
    : system?.trading_paused
      ? "Bridée"
      : gatewayConnected
        ? "Active"
        : botRunning === false
          ? "Offline"
          : "Unknown";
  const riskTone: Tone =
    system?.kill_switch || system?.close_all || tradingBlocked
      ? "danger"
      : system?.trading_paused
        ? "warn"
        : "success";
  const infraTone: Tone =
    currentLatency != null && currentLatency > 1000 ? "danger" : currentLatency != null && currentLatency > 400 ? "warn" : "success";

  const tradingStateValue =
    system?.kill_switch || tradingBlocked
      ? "BLOCKED"
      : system?.trading_paused
        ? "BRIDÉE"
        : gatewayConnected
          ? "ACTIVE"
          : botRunning === false
            ? "OFFLINE"
            : "UNKNOWN";
  const tradingHint =
    system?.kill_switch
      ? "Kill switch armé"
      : tradingBlocked
        ? blockReason
          ? `Bloqué: ${blockReason}`
          : "Bloqué (guardrails)"
        : warmupActive
          ? `DW warmup ${Math.round(warmupProgress * 100)}%`
          : gatewayConnected
            ? "Gateway OK"
            : "Gateway inconnue";

  const timelineSteps: TimelineStep[] = [
    {
      title: "Shock détecté",
      status: lastSignal ? "done" : "idle",
      detail: lastSignal ? `z ${fmt(lastSignal.z_score)} · ${fmt(lastSignal.delta_pips, "pips")}` : "En attente",
    },
    {
      title: "Analyse",
      status: lastSignal ? "done" : "idle",
      detail: lastSignal ? `Regime ${lastSignal.volatility_regime || "?"}` : "Reflex en écoute",
    },
    {
      title: "Décision",
      status:
        system?.trading_paused || system?.kill_switch || tradingBlocked
          ? "blocked"
          : lastSignal
            ? "active"
            : "idle",
      detail: system?.trading_paused
        ? "Risk lock"
        : system?.kill_switch
          ? "Kill switch"
          : tradingBlocked
            ? "Guardrails"
            : lastSignal
              ? "Signal prêt"
              : "n/a",
    },
    {
      title: "Exécution / rejet",
      status: system?.kill_switch || tradingBlocked
        ? "blocked"
        : gatewayConnected
          ? "done"
          : "idle",
      detail: gatewayConnected ? "Gateway OK" : "En attente gateway",
    },
  ];

  const structuredLogs = useMemo(() => {
    return logs
      .slice(-40)
      .reverse()
      .map((line, idx) => {
        const time = line.match(/\d{2}:\d{2}:\d{2}/)?.[0] ?? "—";
        const tag = /\breject|fail|error|kill/i.test(line) ? "REJECT" : /\bwarn|latency|spread|pause/i.test(line) ? "WARNING" : "INFO";
        const clean = line.replace(/^\[?\d{4}-\d{2}-\d{2}[^\]]*\]\s*/i, "").replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, "");
        return { id: `${idx}-${time}`, time, tag, text: clean.slice(0, 160) };
      });
  }, [logs]);
  const marketClosed = !isFxMarketOpen(new Date());

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#050910]/90 p-4 sm:p-6 text-neutral-100 shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(44,227,255,0.10),transparent_22%),radial-gradient(circle_at_80%_0%,rgba(255,77,77,0.06),transparent_24%),linear-gradient(120deg,rgba(44,227,255,0.05),rgba(12,18,32,0.65))]" />
      <div className="relative space-y-4">
        {/* Run Metadata Banner - shows data source */}
        <RunMetadataBanner
          tradeCount={activeStats.tradeCount}
          signalCount={signals.length}
          dataSourceType={activeStats.dataSource === 'none' ? undefined : activeStats.dataSource}
          bundleEnabled={bundleEnabled}
          dwRunId={dwRunIdEffective}
          s2RunId={s2RunIdEffective}
          tfRunId={tfSummaryRunId}
          onResetS2={handleResetS2}
          s2Resetting={s2Resetting}
        />

        <StrategySwitchTabs
          active="dw"
          dwSummary={dwSummary}
          s2Summary={s2Summary}
          tfSummary={tfSummary}
          onChange={handleStrategySwitch}
        />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-cyan-200/80">Pro Terminal</div>
            <div className="text-2xl font-semibold text-white">Desk view · liquid glass</div>
            {error && <div className="mt-1 text-xs text-danger"> {error}</div>}
            {loading && <div className="mt-1 text-xs text-slate-400">Chargement initial…</div>}
            {!loading && (
              <div className="mt-1 text-xs text-neutral-500">
                Snapshot figé hors stream live. Rafraîchir la page pour recharger les panneaux.
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ScopeSelector scope={dataScope} onChange={setDataScope} />
          </div>
        </div>

        <GlobalStateBar
          items={[
            {
              label: "Trading state",
              value: tradingStateValue,
              tone: tradingTone,
              hint: tradingHint,
            },
            {
              label: "Market regime",
              value: regimeLabel,
              tone: regimeLabel === "HIGH" ? "danger" : regimeLabel === "MEDIUM" ? "warn" : "success",
              hint: `Vol5 ${fmt(latestProfile?.vol_5min, "pips")}`,
            },
            {
              label: "Risk status",
              value:
                system?.close_all || tradingBlocked
                  ? "CLOSE ALL"
                  : system?.trading_paused
                    ? "RISK LOCK"
                    : "NORMAL",
              tone: riskTone,
              hint: blockReason ?? (system?.last_log ? system.last_log.slice(0, 60) : "Surveillance active"),
            },
            {
              label: "Latency / Spread",
              value: `${fmt(currentLatency, "ms")} · ${fmt(currentSpread, "pips")}`,
              tone: infraTone,
              hint: dataFresh === false ? "Data stale" : `p95 ${fmt(p95(spreadSpark.map((p) => p.y)), "pips")}`,
            },
            {
              label: "DW mode",
              value: extremeSummary.total > 0 ? `EXT ${extremeSummary.total}` : "NORMAL",
              tone: extremeSummary.total > 0 ? "warn" : "neutral",
              hint:
                extremeSummary.total > 0
                  ? `wait ${extremeSummary.waiting} · ttl_exp ${extremeSummary.ttlExpired}`
                  : "Aucun shock extrême actif",
            },
          ]}
        />

        {marketClosed && (
          <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/5 px-4 py-3 text-sm text-cyan-100 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200/80">Marché FX fermé</div>
            <div className="text-[12px] text-neutral-100">
              EURUSD hors séance (ven 22:00 UTC → dim 22:00 UTC). Le bot conserve le run courant,
              ignore les alertes de data stale attendues et redémarre le cycle normal à la réouverture.
            </div>
          </div>
        )}
        {ohlcState === "OFF_MARKET" && (
          <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-50 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200/80">OHLC coupé OFF-MARKET</div>
            <div className="text-[12px] text-neutral-100">
              Le backend court-circuite /api/ohlc (marché fermé / données stales). Aucun accès DB ni calcul.
              {ohlcMeta?.reason ? ` Raison: ${ohlcMeta.reason}.` : ""} Tick_age={ohlcMeta?.tick_age ?? "n/a"}s · bar_end_age={ohlcMeta?.bar_end_age ?? "n/a"}s · bar_age={ohlcMeta?.bar_age ?? "n/a"}s.
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:gap-4 lg:grid-cols-12 lg:items-start">
          <div className="col-span-12 lg:col-span-6 rounded-2xl border border-white/10 bg-[#0b1422]/80 p-3 sm:p-4 lg:p-5 shadow-[0_18px_60px_rgba(0,0,0,0.45)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-[220px]">
                <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-200/70">Market State</div>
                <div className="text-xl font-semibold text-white">Régime · Spread · Liquidité</div>
                <div className="mt-1 text-[11px] text-neutral-400">
                  Regime overlay + shocks → lecture microstructure instantanée.
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">Overlays</div>
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <TogglePill label="Shocks" active={showShocks} onClick={() => setShowShocks((v) => !v)} />
                  <TogglePill label="Pass" active={showPass} onClick={() => setShowPass((v) => !v)} color="emerald" />
                  <TogglePill label="Fails" active={showFail} onClick={() => setShowFail((v) => !v)} color="rose" />
                  <TogglePill label="Vol regime" active={showRegime} onClick={() => setShowRegime((v) => !v)} color="amber" />
                  <TogglePill label="Trades" active={showCanonicalTrades} onClick={() => setShowCanonicalTrades((v) => !v)} color="cyan" />
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="grid gap-2 sm:grid-cols-3 text-[12px]">
                <MiniMetric label="Regime" value={regimeLabel} tone="cyan" />
                <MiniMetric label="Spread" value={fmt(currentSpread, "pips")} tone="neutral" />
                <MiniMetric label="Vol 5m" value={fmt(latestProfile?.vol_5min, "pips")} tone="neutral" />
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-[10px] uppercase tracking-[0.14em] text-neutral-400">Timeframe</span>
                <div className="inline-flex rounded-lg border border-white/10 bg-black/40 p-0.5">
                  {TIMEFRAMES.map((tf) => (
                    <button
                      key={tf.label}
                      onClick={() => setTimeframe(tf)}
                      className={`px-2.5 py-1 text-[11px] font-semibold transition ${tf.label === timeframe.label
                        ? "rounded-md bg-white/20 text-white shadow-[0_0_12px_rgba(255,255,255,0.08)]"
                        : "text-neutral-400 hover:text-white"
                        }`}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-gradient-to-br from-[#0f172a]/80 via-[#0a0f1b]/90 to-[#05070d]/90 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
              <ProTerminalMarketStateChart
                priceSeries={priceSeries}
                atrBands={atrBands}
                regimeZones={regimeZones}
                sessionZones={sessionZones}
                signals={signals}
                canonicalTrades={canonicalTrades}
                showShocks={showShocks}
                showPass={showPass}
                showFail={showFail}
                showRegime={showRegime}
                showCanonicalTrades={showCanonicalTrades}
                timeframeSeconds={timeframe.seconds}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-neutral-300">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Hover pour amplitudes / z-score / reflex.</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Sessions & news intégrées.</span>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-3 flex flex-col gap-4 self-start">
            <div className="rounded-2xl border border-white/10 bg-[#0c1320]/95 p-4 shadow-[0_12px_50px_rgba(0,0,0,0.4)]">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.14em] text-cyan-100/70">Strategies</div>
                  <div className="text-lg font-semibold text-white">DW + S2 + S3</div>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className={`rounded px-2 py-0.5 border ${system?.kill_switch ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"}`}>
                    DW {system?.kill_switch || tradingBlocked ? "BLOCKED" : gatewayConnected ? "ACTIVE" : "UNKNOWN"}
                  </span>
                  <span className={`rounded px-2 py-0.5 border ${s2WarmupState.toUpperCase().includes("READY") ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300"}`}>
                    S2 {s2WarmupState.toUpperCase()}
                  </span>
                  <span className={`rounded px-2 py-0.5 border ${tfWarmupState.toUpperCase().includes("READY") ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300"}`}>
                    S3 {tfWarmupState.toUpperCase()}
                  </span>
                </div>
              </div>
              <div className="mt-3 grid gap-3 text-[12px]">
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between text-[11px] text-neutral-400">
                    <span className="uppercase tracking-[0.14em] text-neutral-500">DW</span>
                    <span>{strategyStateLabel}</span>
                  </div>
                  <div className="mt-2 text-[11px] text-neutral-300">
                    Dernier signal: {dwLastSignalLabel}
                  </div>
                  {lastSignal && (
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                      <span
                        className={`rounded px-1.5 py-0.5 border ${
                          isExtremeSignal(lastSignal)
                            ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
                            : "border-cyan-500/30 bg-cyan-500/10 text-cyan-200"
                        }`}
                      >
                        Mode {lastSignalModeLabel}
                      </span>
                      {lastSignalExtremeState && (
                        <span className="rounded px-1.5 py-0.5 border border-white/15 bg-white/5 text-neutral-200">
                          {lastSignalExtremeState}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] text-neutral-400">
                      <span>Warmup</span>
                      <span className="text-neutral-100">
                        {Math.round(warmupProgress * 100)}% ({Math.min(warmupBars, warmupTarget)}/{warmupTarget} bars)
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-500"
                        style={{ width: `${warmupProgress * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between text-[11px] text-neutral-400">
                    <span className="uppercase tracking-[0.14em] text-neutral-500">S2</span>
                    <span>{s2WarmupState.toUpperCase()}</span>
                  </div>
                  <div className="mt-2 text-[11px] text-neutral-300">
                    Dernier signal: {s2LastSignalLabel}
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] text-neutral-400">
                      <span>Warmup</span>
                      <span className="text-neutral-100">{s2WarmupLabel}</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-500"
                        style={{ width: `${s2WarmupProgress * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between text-[11px] text-neutral-400">
                    <span className="uppercase tracking-[0.14em] text-neutral-500">S3</span>
                    <span>{tfWarmupState.toUpperCase()}</span>
                  </div>
                  <div className="mt-2 text-[11px] text-neutral-300">
                    Dernier signal: {tfLastSignal ? `${tfLastSignal.direction?.toUpperCase()} · z ${fmt(tfLastSignal.z_score)}` : "Aucun"}
                  </div>
                  <div className="mt-3 text-[11px] text-neutral-400">
                    Run: {tfSummaryRunId ? tfSummaryRunId.slice(0, 8) : "NO RUN"} · Signals: {tfSummary?.counts?.total ?? 0}
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#0c1320]/95 p-4 shadow-[0_12px_50px_rgba(0,0,0,0.35)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-neutral-400">
                    Execution PnL
                  </span>
                  <DataSourceBadge source={activeStats.dataSource} />
                </div>
                <div className="flex gap-2">
                  <StatChip label="WR" value={fmtPct(activeStats.winRate)} />
                  <StatChip label="PF" value={fmt(activeStats.profitFactor)} />
                  <StatChip label="Sharpe" value={fmt(activeStats.sharpe)} />
                </div>
              </div>
              <div className="mt-2 h-24">
                {pnlSeries.length === 0 && activeStats.tradeCount === 0 ? (
                  <div className="text-[11px] text-neutral-500">En attente de trades.</div>
                ) : (
                  <DeferredRender minHeight={96}>
                    <SafeChart>
                      <ApexChart
                        type="area"
                        height="100%"
                        options={{
                          chart: { sparkline: { enabled: true }, animations: { enabled: false }, background: "transparent" },
                          stroke: { width: 2, curve: "smooth" },
                          fill: { gradient: { opacityFrom: 0.4, opacityTo: 0.05 } },
                          colors: [palette.cyan],
                          tooltip: { enabled: true, x: { show: false } },
                        }}
                        series={[{ name: "PnL intraday", data: pnlSeries }]}
                      />
                    </SafeChart>
                  </DeferredRender>
                )}
              </div>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-3 rounded-2xl border border-white/10 bg-[#0c1320]/95 p-4 shadow-[0_12px_50px_rgba(0,0,0,0.4)]">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.14em] text-cyan-100/70">Risk & Infra</div>
                <div className="text-lg font-semibold text-white">Latency · Gateway · Kill</div>
              </div>
              <div className="flex gap-2 text-[11px]">
                <StatePill label="Gateway" active={gatewayConnected === true} color={palette.green} />
                <StatePill label="Risk" active={!!system?.trading_paused || !!system?.kill_switch || tradingBlocked} color={palette.red} />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
              <MiniMetric label="Latency" value={fmt(currentLatency, "ms")} tone={infraTone} />
              <MiniMetric label="Spread (p95)" value={fmt(p95(spreadSpark.map((p) => p.y)), "pips")} tone="neutral" />
              <MiniMetric
                label="Gateway"
                value={gatewayConnected === true ? "Online" : gatewayConnected === false ? "Offline" : "Unknown"}
                tone={gatewayConnected === true ? "success" : gatewayConnected === false ? "danger" : "neutral"}
              />
              <MiniMetric label="Kill-switch" value={system?.kill_switch ? "Armed" : "Safe"} tone={system?.kill_switch ? "danger" : "success"} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <SparkBlock title="Spread spark (1h)" color={palette.cyan} series={spreadSpark} />
              <SparkBlock title="Latency spark (1h)" color={palette.red} series={latencySpark} />
            </div>
            <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3 text-[12px] text-neutral-300">
              <div className="text-[11px] uppercase tracking-[0.12em] text-neutral-500">Alertes rapides</div>
              <div className="mt-2 space-y-1">
                {alertList.slice(0, 3).map((a, idx) => (
                  <div key={idx} className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/5 px-2 py-1 text-[11px]">
                    <span className="h-2 w-2 rounded-full" style={{ background: a.color || palette.cyan }} />
                    <span className="text-white">{a.title}</span>
                  </div>
                ))}
                {alertList.length === 0 && <div className="text-[11px] text-neutral-500">Rien à signaler.</div>}
              </div>
            </div>
          </div>
        </div>

        <DecisionTimeline steps={timelineSteps} />
        <StructuredLogsPanel logs={structuredLogs} />

        <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
          <MiniPanel title="Densité des shocks / minute">
            {shockDensity.length === 0 ? (
              <Empty />
            ) : (
              <DeferredRender minHeight={200}>
                <SafeChart>
                  <ApexChart
                    type="bar"
                    height={200}
                    options={{
                      chart: { animations: { enabled: false }, toolbar: { show: false }, background: "transparent" },
                      grid: { borderColor: "rgba(255,255,255,0.05)" },
                      theme: { mode: "dark" },
                      dataLabels: { enabled: false },
                      xaxis: { labels: { style: { colors: palette.gray, fontSize: "10px" } } },
                      yaxis: { labels: { style: { colors: palette.gray } } },
                    }}
                    series={[{ name: "Shocks", data: shockDensity }]}
                  />
                </SafeChart>
              </DeferredRender>
            )}
          </MiniPanel>

          <MiniPanel title="Distribution des amplitudes">
            {amplitudeDistribution.length === 0 ? (
              <Empty />
            ) : (
              <DeferredRender minHeight={200}>
                <SafeChart>
                  <ApexChart
                    type="bar"
                    height={200}
                    options={{
                      chart: { animations: { enabled: false }, toolbar: { show: false }, background: "transparent" },
                      plotOptions: { bar: { columnWidth: "70%" } },
                      grid: { borderColor: "rgba(255,255,255,0.05)" },
                      theme: { mode: "dark" },
                      dataLabels: { enabled: false },
                      xaxis: { labels: { style: { colors: palette.gray, fontSize: "10px" } } },
                      yaxis: { labels: { style: { colors: palette.gray } } },
                    }}
                    series={[{ name: "Δ pips", data: amplitudeDistribution }]}
                  />
                </SafeChart>
              </DeferredRender>
            )}
          </MiniPanel>

          <MiniPanel title="Taux de reversion / regime vol">
            {reversionByRegime.length === 0 ? (
              <Empty />
            ) : (
              <DeferredRender minHeight={200}>
                <SafeChart>
                  <ApexChart
                    type="bar"
                    height={200}
                    options={{
                      chart: { animations: { enabled: false }, toolbar: { show: false }, background: "transparent" },
                      plotOptions: { bar: { horizontal: true, barHeight: "60%" } },
                      grid: { borderColor: "rgba(255,255,255,0.05)" },
                      theme: { mode: "dark" },
                      dataLabels: { enabled: false },
                      xaxis: { labels: { style: { colors: palette.gray } } },
                      yaxis: { labels: { style: { colors: palette.gray } } },
                      colors: [palette.cyan],
                    }}
                    series={[{ name: "Reversion", data: reversionByRegime }]}
                  />
                </SafeChart>
              </DeferredRender>
            )}
          </MiniPanel>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-[#0C1320]/80 p-4 shadow-inner">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-neutral-400">Alertes</div>
                <div className="text-lg font-semibold text-white">Ce qui clignote</div>
              </div>
              <div className="text-[11px] text-neutral-400">Latency / spread / regime</div>
            </div>
            <ul className="mt-3 space-y-2 text-sm text-neutral-100">
              {alertList.length === 0 && <li className="text-neutral-500 text-xs">Rien à signaler.</li>}
              {alertList.map((a, idx) => (
                <li key={idx} className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <span className="mt-1 h-2 w-2 rounded-full" style={{ background: a.color || palette.cyan }} />
                  <div>
                    <div className="font-semibold">{a.title}</div>
                    <div className="text-xs text-neutral-400">{a.body}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0C1320]/80 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-neutral-400">Market Narrative</div>
                <div className="text-lg font-semibold text-white">Résumé automatique</div>
              </div>
              <div className="text-[11px] text-neutral-400">Terminal vivant</div>
            </div>
            <div className="mt-3 text-sm text-neutral-100">
              {buildNarrative({ profiles, signals, activeStats })}
            </div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-neutral-300">
              <MiniKPI label="Shocks (30m)" value={shockDensity.slice(-6).reduce((a, b) => a + (Number(b.y) || 0), 0)} />
              <MiniKPI label="Spread (last)" value={fmt(latestProfile?.spread_pips, "pips")} />
              <MiniKPI label="Regime" value={regimeLabel} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildPriceSeries(ohlc: Ohlc[]): [number, number][] {
  return ohlc.map((c) => [new Date(c.timestamp).getTime(), c.close] as [number, number]);
}

function buildAtrEnvelope(ohlc: Ohlc[], profiles: MarketProfileRow[]) {
  if (!ohlc.length) return { upper: [], lower: [] };
  const pipFactor = 0.0001; // EURUSD
  const profileByTs = profiles.map((p) => ({
    t: new Date(p.timestamp).getTime(),
    atr: safeNum(p.atr_14) ?? safeNum(p.atr_50) ?? safeNum(p.atr_200) ?? 0,
  }));
  const upper: [number, number][] = [];
  const lower: [number, number][] = [];
  ohlc.forEach((c) => {
    const t = new Date(c.timestamp).getTime();
    const closest = nearest(profileByTs, t);
    const atrPips = closest?.atr ?? 0;
    const atrPx = atrPips * pipFactor;
    upper.push([t, c.close + atrPx]);
    lower.push([t, c.close - atrPx]);
  });
  return { upper, lower };
}

function buildRegimeZones(profiles: MarketProfileRow[]) {
  if (!profiles.length) return [];
  const res: any[] = [];
  let start = new Date(profiles[0].timestamp).getTime();
  let regime = profiles[0].volatility_regime || "UNKNOWN";
  profiles.forEach((p, idx) => {
    const t = new Date(p.timestamp).getTime();
    if (p.volatility_regime !== regime) {
      res.push(zone(start, t, regime));
      start = t;
      regime = p.volatility_regime || "UNKNOWN";
    }
    if (idx === profiles.length - 1) {
      res.push(zone(start, t, regime));
    }
  });
  return res;
}

function zone(start: number, end: number, regime: string) {
  const color =
    regime === "HIGH" ? "rgba(255,77,77,0.08)" : regime === "MEDIUM" ? "rgba(44,227,255,0.06)" : "rgba(12,18,32,0.7)";
  return { x: start, x2: end, fillColor: color, label: { text: regime, style: { color: "#9ca3af", fontSize: "10px" } } };
}

function buildSessionZones(ohlc: Ohlc[]) {
  if (!ohlc.length) return [];
  const first = new Date(ohlc[0].timestamp);
  const day = new Date(first);
  day.setUTCHours(0, 0, 0, 0);
  const toTs = (h: number) => new Date(day.getTime() + h * 3600 * 1000).getTime();
  const sessions = [
    { name: "Tokyo", start: toTs(0), end: toTs(7), color: "rgba(44,227,255,0.04)" },
    { name: "London", start: toTs(7), end: toTs(13), color: "rgba(13,31,45,0.6)" },
    { name: "NY", start: toTs(13), end: toTs(20), color: "rgba(255,77,77,0.05)" },
  ];
  return sessions.map((s) => ({
    x: s.start,
    x2: s.end,
    fillColor: s.color,
    label: { text: s.name, style: { color: "#64748b", fontSize: "10px" } },
    borderColor: "rgba(255,255,255,0.03)",
  }));
}

function buildSignalMarkers(signals: Signal[], ohlc: Ohlc[]) {
  if (!signals.length || !ohlc.length) return [];
  const prices = ohlc.map((c) => ({ t: new Date(c.timestamp).getTime(), price: c.close }));
  return signals.map((s) => {
    const t = new Date(s.timestamp).getTime();
    const close = nearest(prices, t)?.price ?? prices[0].price;
    const modeLabel = getSignalModeLabel(s);
    const extremeState = getExtremeState(s);
    const pass = (s.reversion_ratio ?? 0) >= 0.8 || (s.final_pnl_pips ?? 0) > 0;
    const color = modeLabel === "EXTREME" ? "#fbbf24" : pass ? palette.green : palette.red;
    // Support both legacy 'side' and canonical 'direction'
    const direction = (s as any).side ?? (s as any).direction ?? 'BUY';
    const text = `${modeLabel === "EXTREME" ? "DW EXT" : "DW"} ${pass ? "PASS" : "FAIL"} ${direction?.toUpperCase() === "BUY" ? "↑" : "↓"}`;
    return {
      x: t,
      y: close,
      marker: { size: 5, fillColor: color, strokeColor: "rgba(255,255,255,0.5)", strokeWidth: 1.4, shape: "circle" },
      label: {
        text: `${text} · z ${fmt(s.z_score)} · Δ${fmt(s.delta_pips, "pips")} · ${modeLabel}${extremeState ? `/${extremeState}` : ""}`,
        offsetY: -8,
        style: { background: "rgba(12,18,32,0.85)", color: "#e5e7eb", fontSize: "10px", padding: { left: 6, right: 6, top: 4, bottom: 4 } },
      },
      meta: { type: pass ? "PASS" : "FAIL" },
    };
  });
}

function buildShockMarkers(signals: Signal[], ohlc: Ohlc[]) {
  if (!signals.length || !ohlc.length) return [];
  const prices = ohlc.map((c) => ({ t: new Date(c.timestamp).getTime(), price: c.close }));
  return signals
    .filter((s) => Math.abs(s.z_score ?? 0) >= 2)
    .map((s) => {
      const t = new Date(s.timestamp).getTime();
      const close = nearest(prices, t)?.price ?? prices[0].price;
      const modeLabel = getSignalModeLabel(s);
      return {
        x: t,
        y: close,
        marker: { size: 7, shape: "square", fillColor: palette.cyan, strokeColor: "rgba(255,255,255,0.6)", strokeWidth: 1.2 },
        label: {
          text: `DW Shock ${modeLabel} z ${fmt(s.z_score)} Δ${fmt(s.delta_pips, "pips")}`,
          offsetY: -10,
          style: { background: "rgba(10,15,23,0.9)", color: "#e0f2fe", fontSize: "10px", padding: { left: 6, right: 6, top: 4, bottom: 4 } },
        },
        meta: { type: "SHOCK" },
      };
    });
}

// CanonicalTrade type already imported at top

const resolveNetPnlUsd = (trade: CanonicalTrade): number | null => {
  if (trade.pnl_net_usd_used != null) return trade.pnl_net_usd_used;
  if (trade.pnl_net_usd != null) return trade.pnl_net_usd;
  if (trade.pnl_net_eur_used != null && trade.fx_rate_used != null) {
    return trade.pnl_net_eur_used * trade.fx_rate_used;
  }
  const pips = trade.net_pips_used ?? trade.pnl_net_pips ?? trade.pnl_pips ?? null;
  if (pips == null) return null;
  const qty = trade.qty ?? 0;
  return pips * qty * 0.0001;
};

function buildCanonicalTradeMarkers(canonicalTrades: CanonicalTrade[], ohlc: Ohlc[]) {
  if (!canonicalTrades.length || !ohlc.length) return [];
  const prices = ohlc.map((c) => ({ t: new Date(c.timestamp).getTime(), price: c.close }));
  return canonicalTrades.map((trade) => {
    const t = new Date(trade.entry_time).getTime();
    const fallbackPrice = trade.entry_price ?? prices[0].price;
    const close = nearest(prices, t)?.price ?? fallbackPrice;
    const pnlValue = resolveNetPnlUsd(trade);
    const isProfitable = (pnlValue ?? 0) >= 0;
    const color = pnlValue == null ? "#94a3b8" : isProfitable ? "#00FF88" : "#FF6B6B";
    const pnlLabel = pnlValue == null ? "n/a" : `${isProfitable ? "+" : ""}${pnlValue.toFixed(2)} USD`;
    return {
      x: t,
      y: close,
      marker: { size: 8, shape: "diamond" as const, fillColor: color, strokeColor: "#ffffff", strokeWidth: 2 },
      label: {
        text: `TRADE ${trade.side} · ${pnlLabel}`,
        offsetY: -12,
        style: { background: "rgba(10,15,23,0.95)", color, fontSize: "11px", fontWeight: "600", padding: { left: 8, right: 8, top: 5, bottom: 5 } },
      },
      meta: { type: "CANONICAL_TRADE" },
    };
  });
}

function buildShockDensity(signals: Signal[]) {
  if (!signals.length) return [];
  const buckets: Record<string, number> = {};
  signals.forEach((s) => {
    const z = Math.abs(s.z_score ?? 0);
    if (z < 1.5) return;
    const minute = Math.floor(new Date(s.timestamp).getTime() / 60000);
    buckets[String(minute)] = (buckets[String(minute)] || 0) + 1;
  });
  return Object.keys(buckets)
    .sort()
    .map((k) => ({ x: Number(k) * 60000, y: buckets[k] }));
}

function buildAmplitudeDistribution(signals: Signal[]) {
  if (!signals.length) return [];
  const amplitudes = signals.map((s) => Math.abs(s.delta_pips ?? 0));
  const bins = 10;
  const max = Math.max(...amplitudes, 1);
  const width = max / bins;
  const counts = Array.from({ length: bins }, () => 0);
  amplitudes.forEach((a) => {
    const idx = Math.min(bins - 1, Math.floor(a / width));
    counts[idx] += 1;
  });
  return counts.map((c, idx) => ({ x: (idx * width).toFixed(2), y: c }));
}

function buildReversionByRegime(signals: Signal[]) {
  if (!signals.length) return [];
  const buckets: Record<string, { sum: number; n: number }> = {};
  signals.forEach((s) => {
    if (s.reversion_ratio == null) return;
    const k = s.volatility_regime || "UNKNOWN";
    buckets[k] = buckets[k] || { sum: 0, n: 0 };
    buckets[k].sum += s.reversion_ratio;
    buckets[k].n += 1;
  });
  return Object.entries(buckets).map(([k, v]) => ({ x: k, y: v.sum / Math.max(1, v.n) }));
}

function buildSpreadSpark(profiles: MarketProfileRow[]) {
  return profiles
    .filter((p) => p.timestamp && p.spread_pips != null)
    .slice(-60)
    .map((p) => ({ x: new Date(p.timestamp).getTime(), y: Number(p.spread_pips) }));
}

function buildLatencySpark(metrics: MarketMetrics | null) {
  const raw = ((metrics?.latency_series as any[]) || (metrics?.time_heatmap as any[]) || []) as any[];
  const arr = raw
    .map((b) => {
      const ts = b.timestamp || b.t || b.timestamp_utc || Date.now();
      const y = Number(b.latency_ms ?? b.latency ?? b.avg_latency_ms ?? 0);
      return { x: new Date(ts).getTime(), y };
    })
    .filter((p) => Number.isFinite(p.y));
  return arr.slice(-60);
}

function buildCanonicalPnlSeries(trades: CanonicalTrade[]) {
  if (!trades.length) return [];
  let cumulative = 0;
  return [...trades]
    .filter((trade) => trade.status === "CLOSED")
    .sort((a, b) => {
      const left = new Date(a.exit_time || a.entry_time).getTime();
      const right = new Date(b.exit_time || b.entry_time).getTime();
      return left - right;
    })
    .map((trade) => {
      cumulative += resolveNetPnlUsd(trade) ?? 0;
      return [
        new Date(trade.exit_time || trade.entry_time).getTime(),
        cumulative,
      ] as [number, number];
    });
}

function buildAlerts({
  signals,
  metrics,
  latestProfile,
  activeStats,
  spreadSpark,
  latencySpark,
}: {
  signals: Signal[];
  metrics: MarketMetrics | null;
  latestProfile: MarketProfileRow | null;
  activeStats: ExecutionStats;
  spreadSpark: { x: number; y: number }[];
  latencySpark: { x: number; y: number }[];
}) {
  const alerts: { title: string; body: string; color?: string }[] = [];
  const lastSignal = safeLast(signals);
  const extreme = summarizeExtremeSignals(signals);
  if (lastSignal && (lastSignal.reversion_ratio ?? 0) < 0.8) {
    alerts.push({
      title: "Shock détecté mais reflex faible",
      body: `z=${fmt(lastSignal.z_score)} reversion=${fmt(lastSignal.reversion_ratio)}`,
      color: palette.red,
    });
  }
  const maxSpread = Math.max(...spreadSpark.map((s) => s.y || 0), 0);
  if (maxSpread > 1.5) {
    alerts.push({
      title: "Spread anomaly",
      body: `p95 spread ${fmt(maxSpread, "pips")}`,
      color: palette.red,
    });
  }
  const lastLatency = safeLast(latencySpark)?.y;
  if (lastLatency && lastLatency > 200) {
    alerts.push({
      title: "Gateway lag > 200ms",
      body: `Latency spark last=${fmt(lastLatency, "ms")}`,
      color: "#fbbf24",
    });
  }
  if (latestProfile?.volatility_regime === "HIGH") {
    alerts.push({
      title: "Regime HIGH",
      body: "Volatilité élevée → risk scaling / kill trigger ready",
      color: palette.cyan,
    });
  }
  if ((activeStats.dailyPnL ?? 0) === 0 && signals.length === 0) {
    alerts.push({
      title: "Bot silencieux",
      body: "Pas de signaux ni de PnL visibles.",
      color: palette.gray,
    });
  }
  if ((metrics?.vol_regimes || []).length > 0) {
    alerts.push({
      title: "Vol regime updated",
      body: "Regime map rafraîchi (overlay sur le chart central).",
      color: palette.cyan,
    });
  }
  if (extreme.waiting > 0) {
    alerts.push({
      title: "Extreme recovery en attente",
      body: `${extreme.waiting} signal(s) en EXTREME_WAIT_*`,
      color: "#fbbf24",
    });
  }
  if (extreme.ttlExpired > 0) {
    alerts.push({
      title: "Extreme TTL expiré",
      body: `${extreme.ttlExpired} rejet(s) EXTREME_EVENT_TTL_EXPIRED`,
      color: palette.red,
    });
  }
  return alerts.slice(0, 6);
}

function buildNarrative({
  profiles,
  signals,
  activeStats,
}: {
  profiles: MarketProfileRow[];
  signals: Signal[];
  activeStats: ExecutionStats;
}) {
  const last = safeLast(profiles);
  const shocks = signals.filter((s) => Math.abs(s.z_score ?? 0) > 1.5).slice(-5);
  const reversionPass = shocks.filter((s) => (s.reversion_ratio ?? 0) > 1).length;
  const extreme = summarizeExtremeSignals(signals);
  return (
    `EURUSD en ${last?.volatility_regime || "mode inconnu"} : vol5=${fmt(last?.vol_5min)} pips, ` +
    `${shocks.length} shocks récents, ${reversionPass} reflex confirmés, ` +
    `extreme=${extreme.total} (wait ${extreme.waiting}, ttl_exp ${extreme.ttlExpired}). ` +
    `Exec day ${fmt(activeStats.dailyPnL, "USD")} · PF ${fmt(activeStats.profitFactor)} · WR ${fmtPct(activeStats.winRate)}.`
  );
}

const GlobalStateBar = React.memo(function GlobalStateBar({ items }: { items: { label: string; value: string; tone: Tone; hint?: string }[] }) {
  return (
    <div className="grid gap-2 rounded-2xl border border-white/10 bg-[#0c1320]/95 p-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item, idx) => (
        <CompactStateChip key={idx} {...item} />
      ))}
    </div>
  );
});

function CompactStateChip({ label, value, tone, hint }: { label: string; value: string; tone: Tone; hint?: string }) {
  const toneClass =
    tone === "success"
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
      : tone === "warn"
        ? "border-amber-400/30 bg-amber-500/10 text-amber-100"
        : tone === "danger"
          ? "border-rose-400/30 bg-rose-500/10 text-rose-100"
          : "border-white/15 bg-white/5 text-neutral-200";
  return (
    <div className={`flex flex-col gap-1 rounded-xl border px-3 py-2 shadow-[0_6px_18px_rgba(0,0,0,0.35)] ${toneClass}`}>
      <div className="text-[10px] uppercase tracking-[0.14em] text-neutral-400">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
      {hint && <div className="text-[11px] text-neutral-300/80">{hint}</div>}
    </div>
  );
}

const TogglePill = React.memo(function TogglePill({ label, active, onClick, color = "cyan" }: { label: string; active: boolean; onClick: () => void; color?: "cyan" | "emerald" | "rose" | "amber" }) {
  const paletteMap: Record<string, string> = {
    cyan: "border-cyan-400/70 text-cyan-100 shadow-[0_0_12px_rgba(44,227,255,0.35)]",
    emerald: "border-emerald-400/70 text-emerald-100 shadow-[0_0_12px_rgba(16,185,129,0.35)]",
    rose: "border-rose-400/70 text-rose-100 shadow-[0_0_12px_rgba(244,63,94,0.35)]",
    amber: "border-amber-400/70 text-amber-100 shadow-[0_0_12px_rgba(251,191,36,0.35)]",
  };
  return (
    <button
      className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${active ? paletteMap[color] : "border-white/15 bg-white/5 text-neutral-300 hover:border-cyan-300/40 hover:text-white"
        }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
});

const MiniMetric = React.memo(function MiniMetric({ label, value, tone }: { label: string; value: any; tone: Tone | "cyan" | "neutral" }) {
  const toneColor =
    tone === "success"
      ? palette.green
      : tone === "warn"
        ? "#fbbf24"
        : tone === "danger"
          ? palette.red
          : tone === "cyan"
            ? palette.cyan
            : "#e5e7eb";
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">{label}</div>
      <div className="text-sm font-semibold" style={{ color: toneColor }}>
        {typeof value === "number" ? fmt(value) : value}
      </div>
    </div>
  );
});

function DecisionTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0c1320]/95 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.14em] text-neutral-400">Decision Timeline</div>
          <div className="text-lg font-semibold text-white">Shock → Analyse → Décision → Exec</div>
        </div>
        <div className="text-[11px] text-neutral-400">Ultra lisible en 3s</div>
      </div>
      <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {steps.map((step, idx) => (
          <DecisionStep key={idx} step={step} isLast={idx === steps.length - 1} />
        ))}
      </div>
    </div>
  );
}

function DecisionStep({ step, isLast }: { step: TimelineStep; isLast: boolean }) {
  const tone =
    step.status === "blocked" ? "border-rose-400/40 bg-rose-500/10 text-rose-100" : step.status === "done" ? "border-emerald-400/30 bg-emerald-500/10" : step.status === "active" ? "border-cyan-400/30 bg-cyan-500/10" : "border-white/15 bg-white/5";
  const dot =
    step.status === "blocked" ? "bg-rose-400" : step.status === "done" ? "bg-emerald-400" : step.status === "active" ? "bg-cyan-300" : "bg-neutral-500";
  return (
    <div className="relative flex h-full flex-col">
      <div className={`flex flex-1 flex-col gap-2 rounded-2xl border px-3 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.35)] ${tone}`}>
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
          <div className="text-[11px] uppercase tracking-[0.14em] text-neutral-300">{step.title}</div>
        </div>
        <div className="text-sm text-white">{step.detail}</div>
      </div>
      {!isLast && <div className="absolute right-[-12px] top-1/2 hidden h-px w-6 translate-y-[-50%] bg-gradient-to-r from-white/30 to-white/5 lg:block" />}
    </div>
  );
}

const StructuredLogsPanel = React.memo(function StructuredLogsPanel({ logs }: { logs: { id: string; time: string; tag: string; text: string }[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0c1320]/95 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.14em] text-neutral-400">Structured Logs</div>
          <div className="text-lg font-semibold text-white">INFO / WARNING / REJECT</div>
        </div>
        <div className="text-[11px] text-neutral-400">Scroll fluide</div>
      </div>
      <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1 no-scrollbar">
        {logs.length === 0 && <div className="text-xs text-neutral-500">Pas de log récent.</div>}
        {logs.map((log) => (
          <div key={log.id} className="flex items-start gap-3 rounded-xl border border-white/10 bg-[#0A111E]/80 px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
            <TagBadge tag={log.tag} />
            <div className="flex-1">
              <div className="text-[11px] text-neutral-400">{log.time}</div>
              <div className="text-sm text-neutral-50">{log.text}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

function TagBadge({ tag }: { tag: string }) {
  const tone =
    tag === "REJECT"
      ? "border-rose-400/40 bg-rose-500/10 text-rose-100"
      : tag === "WARNING"
        ? "border-amber-400/40 bg-amber-500/10 text-amber-100"
        : "border-cyan-400/40 bg-cyan-500/10 text-cyan-100";
  return (
    <span className={`mt-1 inline-flex items-center gap-2 rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${tone}`}>
      <span className="h-2 w-2 rounded-full" />
      {tag}
    </span>
  );
}

/**
 * DataSourceBadge - Visual indicator of data source
 * Shows whether stats come from canonical (paper/live) or shadow (research)
 */
function DataSourceBadge({ source }: { source: 'canonical' | 'shadow' | 'none' }) {
  if (source === 'none') return null;

  const isCanonical = source === 'canonical';
  const label = isCanonical ? 'CANONICAL' : 'SHADOW';
  const tone = isCanonical
    ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-300'
    : 'border-amber-400/50 bg-amber-500/20 text-amber-300';

  return (
    <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase ${tone}`} title={isCanonical ? 'Data from canonical_trades.sqlite (Paper/Live)' : 'Data from shadow_trading.sqlite (Research)'}>
      {label}
    </span>
  );
}

function fmt(v: any, suffix?: string) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "n/a";
  const value = Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2);
  return `${value}${suffix ? ` ${suffix}` : ""}`;
}

function fmtPct(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "n/a";
  return `${(n * 100).toFixed(1)}%`;
}

function safeNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function safeLast<T>(arr: T[]): T | undefined {
  return arr.length ? arr[arr.length - 1] : undefined;
}

function nearest(list: { t: number; atr?: number; price?: number }[], target: number) {
  if (!list.length) return undefined;
  let lo = 0;
  let hi = list.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (list[mid].t < target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  const right = list[lo];
  const left = lo > 0 ? list[lo - 1] : right;
  return Math.abs(left.t - target) <= Math.abs(right.t - target) ? left : right;
}

function p95(arr: number[]) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.95);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function MiniPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0B121D]/90 p-3">
      <div className="text-xs text-neutral-400 mb-2">{title}</div>
      {children}
    </div>
  );
}

function Empty() {
  return <div className="text-xs text-neutral-500">En attente de données.</div>;
}

function StatChip({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-neutral-200">
      <div className="text-[9px] uppercase tracking-[0.15em] text-neutral-500">{label}</div>
      <div className="font-semibold">{typeof value === "number" ? fmt(value) : value}</div>
    </div>
  );
}

function SparkBlock({ title, color, series }: { title: string; color: string; series: { x: number; y: number }[] }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-2">
      <div className="text-[10px] text-neutral-400 mb-1">{title}</div>
      {series.length === 0 ? (
        <div className="text-[10px] text-neutral-500">n/a</div>
      ) : (
        <DeferredRender minHeight={70}>
          <SafeChart>
            <ApexChart
              type="line"
              height={70}
              options={{
                chart: { sparkline: { enabled: true }, animations: { enabled: false }, background: "transparent" },
                stroke: { width: 2, curve: "smooth" },
                colors: [color],
                tooltip: { enabled: true },
              }}
              series={[{ name: title, data: series }]}
            />
          </SafeChart>
        </DeferredRender>
      )}
    </div>
  );
}

function MiniKPI({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">{label}</div>
      <div className="text-sm font-semibold text-white">{typeof value === "number" ? fmt(value) : value}</div>
    </div>
  );
}

function StatePill({ label, active, color }: { label: string; active: boolean; color: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold ${active ? "bg-white/10 text-white" : "bg-white/5 text-neutral-500"
        }`}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: active ? color : "rgba(255,255,255,0.2)" }} />
      {label}
    </span>
  );
}

class SafeChart extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    // swallow chart errors
  }

  render() {
    if (this.state.hasError) {
      return <div className="text-xs text-danger">Chart error</div>;
    }
    return <Suspense fallback={<div className="h-full" />}>{this.props.children}</Suspense>;
  }
}
