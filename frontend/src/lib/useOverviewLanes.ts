import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";

import { useDashboardPoll } from "./dashboardPollingBus";
import {
  api,
  type DashboardPortfolioStrategyStats,
  type DashboardSnapshot,
  type DwSummary,
  type EquityCurveResponse,
  type OverviewPortfolioLaneResponse,
  type OverviewRuntimeLaneResponse,
  type OverviewSummariesLaneResponse,
  type PortfolioSummaryResponse,
  type S2Summary,
  type StrategyRuntimeStatus,
} from "./api";
import { type ExecutionStats } from "./canonicalApi";
import {
  activeContext,
  defaultScope,
  deriveContextForScope,
} from "./activeContext";
import {
  buildOverviewStateCacheKey,
  readOverviewStateCache,
  writeOverviewStateCache,
} from "./overviewStateCache";
import {
  consumeOverviewPrefetch,
  type OverviewPrefetchPayload,
} from "./overviewPrefetch";

type PortfolioSummaryView = {
  equity: number | null;
  pnl_epoch: number | null;
  pnl_7d: number | null;
  pnl_30d: number | null;
  trades_7d: number | null;
  trades_30d: number | null;
  last_exit_ts: string | null;
  commission_view: string | null;
  missing_exit_pct: number | null;
  anomaly_count: number | null;
  epoch: number | null;
  epoch_started_at: string | null;
  run_pnl_usd: number | null;
  run_pnl_today_usd: number | null;
};

export type OverviewLaneDebugMeta = {
  lane: "runtime" | "portfolio" | "summaries";
  cacheHit: boolean | null;
  queryMs: number | null;
  generatedAtUtc: string | null;
};

const EMPTY_OVERVIEW_LANE_META: Record<
  OverviewLaneDebugMeta["lane"],
  OverviewLaneDebugMeta
> = {
  runtime: {
    lane: "runtime",
    cacheHit: null,
    queryMs: null,
    generatedAtUtc: null,
  },
  portfolio: {
    lane: "portfolio",
    cacheHit: null,
    queryMs: null,
    generatedAtUtc: null,
  },
  summaries: {
    lane: "summaries",
    cacheHit: null,
    queryMs: null,
    generatedAtUtc: null,
  },
};

let latestOverviewLaneMeta: Record<
  OverviewLaneDebugMeta["lane"],
  OverviewLaneDebugMeta
> = EMPTY_OVERVIEW_LANE_META;

export type OverviewState = {
  systemStatus: any | null;
  strategyStatuses: StrategyRuntimeStatus[];
  s2Summary: S2Summary | null;
  tfSummary: DwSummary | null;
  dwEpochStats: ExecutionStats | null;
  s2EpochStats: ExecutionStats | null;
  tfEpochStats: ExecutionStats | null;
  portfolioRun: PortfolioSummaryView | null;
  equityCurveData: EquityCurveResponse | null;
  loading: boolean;
  s2Loading: boolean;
  tfLoading: boolean;
  portfolioLoading: boolean;
  equityCurveLoading: boolean;
  error: string | null;
  s2Error: string | null;
  tfError: string | null;
  portfolioError: string | null;
  hydratedAt: number | null;
  laneMeta: Record<OverviewLaneDebugMeta["lane"], OverviewLaneDebugMeta>;
};

export function getOverviewLaneDebugSnapshot(): Record<
  OverviewLaneDebugMeta["lane"],
  OverviewLaneDebugMeta
> {
  return latestOverviewLaneMeta;
}

type OverviewAction =
  | { type: "START_LOAD"; showS2: boolean; showTf: boolean; hasRun: boolean }
  | { type: "EQUITY_START"; preserveData?: boolean }
  | { type: "SNAPSHOT_DATA"; payload: Partial<OverviewState> }
  | { type: "LOAD_DONE" }
  | { type: "EQUITY_LOADED"; data: EquityCurveResponse | null }
  | { type: "LOAD_ERROR"; message: string }
  | { type: "RESET_ERRORS" };

const INITIAL_OVERVIEW_STATE: OverviewState = {
  systemStatus: null,
  strategyStatuses: [],
  s2Summary: null,
  tfSummary: null,
  dwEpochStats: null,
  s2EpochStats: null,
  tfEpochStats: null,
  portfolioRun: null,
  equityCurveData: null,
  loading: true,
  s2Loading: false,
  tfLoading: false,
  portfolioLoading: false,
  equityCurveLoading: false,
  error: null,
  s2Error: null,
  tfError: null,
  portfolioError: null,
  hydratedAt: null,
  laneMeta: EMPTY_OVERVIEW_LANE_META,
};

const OVERVIEW_IMMEDIATE_REVALIDATE_TTL_MS = 45_000;

function overviewReducer(state: OverviewState, action: OverviewAction): OverviewState {
  switch (action.type) {
    case "START_LOAD":
      return {
        ...state,
        loading: true,
        s2Loading: action.showS2,
        tfLoading: action.showTf,
        portfolioLoading: action.hasRun,
        error: null,
        s2Error: null,
        tfError: null,
      };
    case "EQUITY_START":
      return {
        ...state,
        equityCurveData: action.preserveData ? state.equityCurveData : null,
        equityCurveLoading: true,
      };
    case "SNAPSHOT_DATA":
      return { ...state, ...action.payload };
    case "LOAD_DONE":
      return {
        ...state,
        loading: false,
        s2Loading: false,
        tfLoading: false,
        portfolioLoading: false,
      };
    case "EQUITY_LOADED":
      return {
        ...state,
        equityCurveData: action.data,
        equityCurveLoading: false,
      };
    case "LOAD_ERROR":
      return {
        ...state,
        error: action.message,
        systemStatus: null,
        strategyStatuses: [],
        s2Summary: null,
        tfSummary: null,
        dwEpochStats: null,
        s2EpochStats: null,
        tfEpochStats: null,
        portfolioRun: null,
      };
    case "RESET_ERRORS":
      return { ...state, error: null, s2Error: null, tfError: null };
    default:
      return state;
  }
}

function toExecutionStats(
  src: DashboardPortfolioStrategyStats | null
): ExecutionStats | null {
  if (!src) return null;
  return {
    winRate: src.winRate,
    profitFactor: src.profitFactor,
    sharpe: src.sharpe,
    dailyPnL: src.dailyPnL,
    cumulativePnL: src.cumulativePnL,
    tradeCount: src.tradeCount,
    dataSource:
      src.dataSource === "canonical" ||
      src.dataSource === "shadow" ||
      src.dataSource === "none"
        ? src.dataSource
        : "none",
  };
}

function normalizeLaneMeta(
  lane: OverviewLaneDebugMeta["lane"],
  meta: Record<string, unknown> | undefined | null
): OverviewLaneDebugMeta {
  return {
    lane,
    cacheHit: typeof meta?.cache_hit === "boolean" ? meta.cache_hit : null,
    queryMs: typeof meta?.query_ms === "number" ? meta.query_ms : null,
    generatedAtUtc:
      typeof meta?.generated_at_utc === "string" ? meta.generated_at_utc : null,
  };
}

function publishLaneMeta(
  laneMeta: Record<OverviewLaneDebugMeta["lane"], OverviewLaneDebugMeta>
): void {
  latestOverviewLaneMeta = laneMeta;
}

export function buildPortfolioSummaryView(
  portfolioSummary: PortfolioSummaryResponse | null,
  dwStats: DashboardPortfolioStrategyStats | null,
  commissionView: string,
  selectedEpoch: number | null
): PortfolioSummaryView | null {
  if (!portfolioSummary && !dwStats) {
    return null;
  }

  return {
    equity: portfolioSummary?.equity_usd ?? null,
    pnl_epoch: portfolioSummary?.pnl_epoch_usd ?? dwStats?.cumulativePnL ?? null,
    pnl_7d: portfolioSummary?.pnl_7d_usd ?? null,
    pnl_30d: portfolioSummary?.pnl_30d_usd ?? null,
    trades_7d: portfolioSummary?.trades_7d ?? null,
    trades_30d: portfolioSummary?.trades_30d ?? dwStats?.tradeCount ?? null,
    last_exit_ts: dwStats?.last_exit_ts ?? null,
    commission_view: dwStats?.commission_view ?? commissionView,
    missing_exit_pct: dwStats?.missing_exit_pct ?? null,
    anomaly_count: dwStats?.anomaly_count ?? null,
    epoch: selectedEpoch ?? portfolioSummary?.current_epoch ?? null,
    epoch_started_at: portfolioSummary?.epoch_started_at ?? null,
    run_pnl_usd: dwStats?.cumulativePnL ?? null,
    run_pnl_today_usd: dwStats?.dailyPnL ?? null,
  };
}

function hasPrefetchedOverviewCoreData(
  payload: OverviewPrefetchPayload
): boolean {
  const portfolioStrategies = payload.portfolio?.portfolio?.strategies;
  const hasPortfolioStrategyStats =
    !!portfolioStrategies &&
    Object.values(portfolioStrategies).some((stats) => stats != null);
  return Boolean(
    payload.runtime?.system ||
      payload.portfolio?.portfolio?.summary ||
      hasPortfolioStrategyStats ||
      (payload.runtime?.strategies_status?.strategies?.length ?? 0) > 0 ||
      Object.values(payload.summaries?.strategy_summaries ?? {}).some(Boolean)
  );
}

function resolveSummaryAvailability(
  strategySummaryMeta: NonNullable<DashboardSnapshot["strategy_summary_meta"]> | undefined,
  strategyId: "s2_pairs_trading" | "tf_pullback_v1"
): {
  status: string | null;
  error: string | null;
} {
  const meta = strategySummaryMeta?.[strategyId];
  return {
    status: meta?.status ?? null,
    error: meta?.error ?? null,
  };
}

function overviewStateHasData(state: OverviewState): boolean {
  return Boolean(
    state.systemStatus ||
      state.strategyStatuses.length > 0 ||
      state.s2Summary ||
      state.tfSummary ||
      state.dwEpochStats ||
      state.s2EpochStats ||
      state.tfEpochStats ||
      state.portfolioRun ||
      state.equityCurveData
  );
}

export function buildPrefetchedOverviewState(
  payload: OverviewPrefetchPayload | null,
  options: {
    showS2: boolean;
    showTf: boolean;
    commissionView: string;
    selectedEpoch: number | null;
  }
): OverviewState | null {
  if (!payload) {
    return null;
  }
  const runtime = payload.runtime;
  const portfolio = payload.portfolio?.portfolio ?? null;
  const summaries = payload.summaries;
  const strategyStatuses = runtime?.strategies_status?.strategies ?? [];
  const strategyPortfolio = portfolio?.strategies ?? {};
  const dwStats =
    (strategyPortfolio.damping_wave as DashboardPortfolioStrategyStats | null) ?? null;
  const s2Stats =
    (strategyPortfolio.s2_pairs_trading as DashboardPortfolioStrategyStats | null) ?? null;
  const tfStats =
    (strategyPortfolio.tf_pullback_v1 as DashboardPortfolioStrategyStats | null) ?? null;
  const portfolioRun = buildPortfolioSummaryView(
    portfolio?.summary ?? null,
    dwStats,
    options.commissionView,
    options.selectedEpoch
  );
  const s2Summary = options.showS2
    ? ((summaries?.strategy_summaries?.s2_pairs_trading as
        | S2Summary
        | null
        | undefined) ?? null)
    : null;
  const tfSummary = options.showTf
    ? ((summaries?.strategy_summaries?.tf_pullback_v1 as
        | DwSummary
        | null
        | undefined) ?? null)
    : null;

  return {
    ...INITIAL_OVERVIEW_STATE,
    systemStatus: runtime?.system ?? null,
    strategyStatuses,
    s2Summary,
    tfSummary,
    dwEpochStats: toExecutionStats(dwStats),
    s2EpochStats: options.showS2 ? toExecutionStats(s2Stats) : null,
    tfEpochStats: options.showTf ? toExecutionStats(tfStats) : null,
    portfolioRun,
    equityCurveData:
      payload.equityCurve &&
      (payload.equityCurve.equity_curve?.length ?? 0) > 0
        ? payload.equityCurve
        : null,
    loading: false,
    s2Loading: false,
    tfLoading: false,
    portfolioLoading: false,
    equityCurveLoading: false,
    error: hasPrefetchedOverviewCoreData(payload)
      ? null
      : INITIAL_OVERVIEW_STATE.error,
    s2Error: null,
    tfError: null,
    portfolioError: null,
    hydratedAt: payload.prefetchedAt,
    laneMeta: {
      runtime: normalizeLaneMeta("runtime", payload.runtime?._meta),
      portfolio: normalizeLaneMeta("portfolio", payload.portfolio?._meta),
      summaries: normalizeLaneMeta("summaries", payload.summaries?._meta),
    },
  };
}

export function useOverviewLanes(params: {
  overviewSeedRunId: string | null;
  commissionView: string;
  selectedEpoch: number | null;
  hasAnyRun: boolean;
  showS2: boolean;
  showTf: boolean;
}): OverviewState {
  const {
    overviewSeedRunId,
    commissionView,
    selectedEpoch,
    hasAnyRun,
    showS2,
    showTf,
  } = params;

  const overviewStateCacheKey = buildOverviewStateCacheKey(
    overviewSeedRunId,
    commissionView,
    selectedEpoch
  );
  const initialEquityCurveKey = hasAnyRun
    ? ["desk", commissionView, selectedEpoch ?? "current"].join(":")
    : null;
  const restoredCachedState =
    readOverviewStateCache<OverviewState>(overviewStateCacheKey);
  const prefetchedInit = restoredCachedState
    ? null
    : buildPrefetchedOverviewState(
        consumeOverviewPrefetch({
          runId: overviewSeedRunId,
          commissionView,
          portfolioEpoch: selectedEpoch,
        }),
        {
          showS2,
          showTf,
          commissionView,
          selectedEpoch,
        }
      );

  const cachedInit = restoredCachedState
    ? { ...restoredCachedState, loading: false, equityCurveLoading: false }
    : prefetchedInit ?? INITIAL_OVERVIEW_STATE;
  const [state, dispatch] = useReducer(overviewReducer, cachedInit);
  const hasDataRef = useRef(overviewStateHasData(cachedInit));
  const runtimeRequestSeqRef = useRef(0);
  const portfolioRequestSeqRef = useRef(0);
  const summariesRequestSeqRef = useRef(0);
  const equityRequestSeqRef = useRef(0);
  const prevEquityCurveKeyRef = useRef<string | null>(
    cachedInit.equityCurveData ? initialEquityCurveKey : null
  );
  const equityKeyRef = useRef<string | null>(
    cachedInit.equityCurveData ? initialEquityCurveKey : null
  );
  const runtimeAbortRef = useRef<AbortController | null>(null);
  const portfolioAbortRef = useRef<AbortController | null>(null);
  const summariesAbortRef = useRef<AbortController | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    publishLaneMeta(state.laneMeta);
  }, [state.laneMeta]);

  const scopedContext = useMemo(() => {
    const ctx = deriveContextForScope(activeContext, defaultScope);
    if (overviewSeedRunId) {
      return { ...ctx, run_id: overviewSeedRunId };
    }
    return ctx;
  }, [overviewSeedRunId]);

  const laneOptions = useMemo(
    () => ({
      commissionView,
      portfolioEpoch: selectedEpoch,
    }),
    [commissionView, selectedEpoch]
  );

  useEffect(() => {
    if (!hasDataRef.current) {
      const prefetched = consumeOverviewPrefetch({
        runId: overviewSeedRunId,
        commissionView,
        portfolioEpoch: selectedEpoch,
      });
      if (prefetched) {
        const prefetchedState = buildPrefetchedOverviewState(prefetched, {
          showS2,
          showTf,
          commissionView,
          selectedEpoch,
        });
        if (prefetchedState && overviewStateHasData(prefetchedState)) {
          hasDataRef.current = true;
          if (prefetchedState.equityCurveData && initialEquityCurveKey) {
            equityKeyRef.current = initialEquityCurveKey;
          }
          startTransition(() => {
            dispatch({ type: "SNAPSHOT_DATA", payload: prefetchedState });
            dispatch({ type: "LOAD_DONE" });
          });
        }
      }
    }
    return () => {
      runtimeAbortRef.current?.abort();
      portfolioAbortRef.current?.abort();
      summariesAbortRef.current?.abort();
      if (overviewStateHasData(stateRef.current)) {
        writeOverviewStateCache(overviewStateCacheKey, stateRef.current);
      }
    };
  }, [
    commissionView,
    initialEquityCurveKey,
    overviewSeedRunId,
    overviewStateCacheKey,
    selectedEpoch,
    showS2,
    showTf,
  ]);

  const loadRuntimeLane = useCallback(async () => {
    const requestId = runtimeRequestSeqRef.current + 1;
    runtimeRequestSeqRef.current = requestId;
    runtimeAbortRef.current?.abort();
    const controller = new AbortController();
    runtimeAbortRef.current = controller;

    try {
      const runtimeRes = (await api.getOverviewLane(
        "runtime",
        overviewSeedRunId,
        scopedContext,
        { ...laneOptions, signal: controller.signal }
      )) as OverviewRuntimeLaneResponse;
      if (runtimeRequestSeqRef.current !== requestId) {
        return;
      }
      const nextStatuses = runtimeRes.strategies_status?.strategies ?? [];
      const hasRuntimeData = Boolean(runtimeRes.system || nextStatuses.length > 0);
      if (hasRuntimeData) {
        hasDataRef.current = true;
      }
      startTransition(() => {
        dispatch({
          type: "SNAPSHOT_DATA",
          payload: {
            systemStatus: runtimeRes.system ?? null,
            strategyStatuses: nextStatuses,
            loading: false,
            error: null,
            hydratedAt: hasRuntimeData ? Date.now() : stateRef.current.hydratedAt,
            laneMeta: {
              ...stateRef.current.laneMeta,
              runtime: normalizeLaneMeta("runtime", runtimeRes._meta),
            },
          },
        });
      });
    } catch (e) {
      if (
        runtimeRequestSeqRef.current !== requestId ||
        controller.signal.aborted ||
        (e instanceof Error &&
          (e.name === "AbortError" || e.message.toLowerCase().includes("abort")))
      ) {
        return;
      }
      if (!hasDataRef.current) {
        startTransition(() => {
          dispatch({
            type: "LOAD_ERROR",
            message: e instanceof Error ? e.message : "Erreur de chargement",
          });
        });
      }
    }
  }, [laneOptions, overviewSeedRunId, scopedContext]);

  const loadPortfolioLane = useCallback(async () => {
    const requestId = portfolioRequestSeqRef.current + 1;
    portfolioRequestSeqRef.current = requestId;
    portfolioAbortRef.current?.abort();
    const controller = new AbortController();
    portfolioAbortRef.current = controller;

    try {
      const portfolioRes = (await api.getOverviewLane(
        "portfolio",
        overviewSeedRunId,
        scopedContext,
        { ...laneOptions, signal: controller.signal }
      )) as OverviewPortfolioLaneResponse;
      if (portfolioRequestSeqRef.current !== requestId) {
        return;
      }
      const strategyPortfolio = portfolioRes.portfolio?.strategies ?? {};
      const dwStats =
        (strategyPortfolio.damping_wave as DashboardPortfolioStrategyStats | null) ??
        null;
      const s2Stats =
        (strategyPortfolio.s2_pairs_trading as DashboardPortfolioStrategyStats | null) ??
        null;
      const tfStats =
        (strategyPortfolio.tf_pullback_v1 as DashboardPortfolioStrategyStats | null) ??
        null;
      const portfolioSummary = portfolioRes.portfolio?.summary ?? null;
      const nextPortfolioRun = buildPortfolioSummaryView(
        portfolioSummary,
        dwStats,
        commissionView,
        selectedEpoch
      );
      const hasPortfolioData = Boolean(nextPortfolioRun || dwStats || s2Stats || tfStats);
      if (hasPortfolioData) {
        hasDataRef.current = true;
      }
      startTransition(() => {
        dispatch({
          type: "SNAPSHOT_DATA",
          payload: {
            dwEpochStats: toExecutionStats(dwStats),
            s2EpochStats: showS2 ? toExecutionStats(s2Stats) : null,
            tfEpochStats: showTf ? toExecutionStats(tfStats) : null,
            portfolioRun: nextPortfolioRun,
            portfolioError:
              nextPortfolioRun || !hasAnyRun ? null : "Portfolio indisponible",
            portfolioLoading: false,
            hydratedAt: hasPortfolioData ? Date.now() : stateRef.current.hydratedAt,
            laneMeta: {
              ...stateRef.current.laneMeta,
              portfolio: normalizeLaneMeta("portfolio", portfolioRes._meta),
            },
          },
        });
      });
    } catch (e) {
      if (
        portfolioRequestSeqRef.current !== requestId ||
        controller.signal.aborted ||
        (e instanceof Error &&
          (e.name === "AbortError" || e.message.toLowerCase().includes("abort")))
      ) {
        return;
      }
      startTransition(() => {
        dispatch({
          type: "SNAPSHOT_DATA",
          payload: {
            portfolioLoading: false,
            portfolioError: hasAnyRun
              ? e instanceof Error
                ? e.message
                : "Portfolio indisponible"
              : null,
          },
        });
      });
    }
  }, [
    commissionView,
    hasAnyRun,
    laneOptions,
    overviewSeedRunId,
    scopedContext,
    selectedEpoch,
    showS2,
    showTf,
  ]);

  const loadSummariesLane = useCallback(async () => {
    const requestId = summariesRequestSeqRef.current + 1;
    summariesRequestSeqRef.current = requestId;
    summariesAbortRef.current?.abort();
    const controller = new AbortController();
    summariesAbortRef.current = controller;

    try {
      const summariesRes = (await api.getOverviewLane(
        "summaries",
        overviewSeedRunId,
        scopedContext,
        { ...laneOptions, signal: controller.signal }
      )) as OverviewSummariesLaneResponse;
      if (summariesRequestSeqRef.current !== requestId) {
        return;
      }
      const nextS2 =
        (summariesRes.strategy_summaries?.s2_pairs_trading as S2Summary | null | undefined) ??
        null;
      const nextTf =
        (summariesRes.strategy_summaries?.tf_pullback_v1 as DwSummary | null | undefined) ??
        null;
      const s2SummaryAvailability = resolveSummaryAvailability(
        summariesRes.strategy_summary_meta,
        "s2_pairs_trading"
      );
      const tfSummaryAvailability = resolveSummaryAvailability(
        summariesRes.strategy_summary_meta,
        "tf_pullback_v1"
      );
      const hasSummaryData = Boolean(nextS2 || nextTf);
      if (hasSummaryData) {
        hasDataRef.current = true;
      }
      startTransition(() => {
        dispatch({
          type: "SNAPSHOT_DATA",
          payload: {
            s2Summary: showS2 ? nextS2 : null,
            tfSummary: showTf ? nextTf : null,
            s2Error:
              showS2 && !nextS2
                ? s2SummaryAvailability.status === "missing_run"
                  ? "S2 run unavailable"
                  : s2SummaryAvailability.error || "S2 data unavailable"
                : null,
            tfError:
              showTf && !nextTf
                ? tfSummaryAvailability.status === "missing_run"
                  ? "S3 run unavailable"
                  : tfSummaryAvailability.error || "S3 data unavailable"
                : null,
            s2Loading: false,
            tfLoading: false,
            hydratedAt: hasSummaryData ? Date.now() : stateRef.current.hydratedAt,
            laneMeta: {
              ...stateRef.current.laneMeta,
              summaries: normalizeLaneMeta("summaries", summariesRes._meta),
            },
          },
        });
      });
    } catch (e) {
      if (
        summariesRequestSeqRef.current !== requestId ||
        controller.signal.aborted ||
        (e instanceof Error &&
          (e.name === "AbortError" || e.message.toLowerCase().includes("abort")))
      ) {
        return;
      }
      startTransition(() => {
        dispatch({
          type: "SNAPSHOT_DATA",
          payload: {
            s2Loading: false,
            tfLoading: false,
            s2Error: showS2 ? "S2 data unavailable" : null,
            tfError: showTf ? "S3 data unavailable" : null,
          },
        });
      });
    }
  }, [laneOptions, overviewSeedRunId, scopedContext, showS2, showTf]);

  const loadEquityCurve = useCallback(async () => {
    if (!hasAnyRun) {
      equityKeyRef.current = null;
      startTransition(() => {
        dispatch({ type: "EQUITY_LOADED", data: null });
      });
      return;
    }

    const equityKey = ["desk", commissionView, selectedEpoch ?? "current"].join(":");
    const preserveExistingCurve =
      equityKey === prevEquityCurveKeyRef.current && !!stateRef.current.equityCurveData;
    const requestId = equityRequestSeqRef.current + 1;
    equityRequestSeqRef.current = requestId;
    equityKeyRef.current = equityKey;

    startTransition(() => {
      dispatch({
        type: "EQUITY_START",
        preserveData: preserveExistingCurve,
      });
    });

    try {
      const equityCurveRes = await api.getPortfolioEquityCurve(
        null,
        commissionView,
        selectedEpoch
      );
      if (
        equityRequestSeqRef.current !== requestId ||
        equityKeyRef.current !== equityKey
      ) {
        return;
      }
      startTransition(() => {
        dispatch({
          type: "EQUITY_LOADED",
          data:
            equityCurveRes && (equityCurveRes.equity_curve?.length ?? 0) > 0
              ? equityCurveRes
              : null,
        });
      });
    } catch {
      if (
        equityRequestSeqRef.current !== requestId ||
        equityKeyRef.current !== equityKey
      ) {
        return;
      }
      startTransition(() => {
        dispatch({ type: "EQUITY_LOADED", data: null });
      });
    }
  }, [commissionView, hasAnyRun, selectedEpoch]);

  const equityCurveKey = hasAnyRun
    ? ["desk", commissionView, selectedEpoch ?? "current"].join(":")
    : null;
  const shouldRevalidateImmediately =
    !state.hydratedAt ||
    Date.now() - state.hydratedAt > OVERVIEW_IMMEDIATE_REVALIDATE_TTL_MS;

  useDashboardPoll("status", loadRuntimeLane, {
    enabled: true,
    intervalMs: 10_000,
    immediate: shouldRevalidateImmediately,
  });
  useDashboardPoll("summary", loadPortfolioLane, {
    enabled: true,
    intervalMs: 20_000,
    immediate: shouldRevalidateImmediately,
  });
  useDashboardPoll("summary", loadSummariesLane, {
    enabled: true,
    intervalMs: 45_000,
    immediate: shouldRevalidateImmediately,
  });

  const prevSnapshotKeyRef = useRef(
    `${overviewSeedRunId}:${selectedEpoch}:${commissionView}`
  );
  useEffect(() => {
    const key = `${overviewSeedRunId}:${selectedEpoch}:${commissionView}`;
    if (key !== prevSnapshotKeyRef.current) {
      prevSnapshotKeyRef.current = key;
      if (!hasDataRef.current) {
        dispatch({ type: "START_LOAD", showS2, showTf, hasRun: hasAnyRun });
      } else {
        dispatch({ type: "RESET_ERRORS" });
        startTransition(() => {
          dispatch({
            type: "SNAPSHOT_DATA",
            payload: {
              s2Loading: showS2,
              tfLoading: showTf,
              portfolioLoading: hasAnyRun,
            },
          });
        });
      }
      void loadRuntimeLane();
      void loadPortfolioLane();
      void loadSummariesLane();
    }
  }, [
    commissionView,
    hasAnyRun,
    loadPortfolioLane,
    loadRuntimeLane,
    loadSummariesLane,
    overviewSeedRunId,
    selectedEpoch,
    showS2,
    showTf,
  ]);

  useEffect(() => {
    if (!equityCurveKey) {
      prevEquityCurveKeyRef.current = null;
      void loadEquityCurve();
      return;
    }
    if (equityCurveKey !== prevEquityCurveKeyRef.current) {
      prevEquityCurveKeyRef.current = equityCurveKey;
      void loadEquityCurve();
    }
  }, [equityCurveKey, loadEquityCurve]);

  return state;
}
