/**
 * useRunContext - Single Source of Truth for run resolution (V3 RUN TRUTH LOCK)
 * 
 * All tabs MUST use this hook to get the current run context.
 * No tab should resolve runs independently or use hardcoded DB paths.
 * 
 * V3: RUN TRUTH LOCK
 * - run_id is now mandatory for all run-scoped data
 * - localStorage persistence for selected run
 * - "Reset to active run" capability
 * - canonicalApi hooks require run_id
 * 
 * V2: Now uses canonical registry endpoints:
 * - /api/registry/runs/active for active run
 * - /api/registry/runs for run history
 * - /api/registry/signals/stats for signal metrics
 * - /api/registry/shocks/stats for shock metrics
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { activeContext, type ActiveContext } from './activeContext';
import { canonicalApi, type Run, type SignalStats, type ShockStats } from './canonicalApi';
import { getBundleState, syncBundleDwRunId } from './useBundleRuns';

// localStorage key for run persistence
const STORAGE_KEY = 'fractal.selectedRunId';

export type DataScope = 'TODAY' | 'YESTERDAY' | 'DATE';

export interface ResolvedRun {
  resolved: boolean;
  run_id: string | null;
  strategy_id: string;
  strategy_version: string | null;
  trade_date: string;
  root_dir: string | null;
  available_dbs: string[];
  data_origin: 'RUN' | 'LEGACY' | 'CANONICAL';
  scope: DataScope;
  target_date: string;
  // V2: Canonical registry data
  status?: 'running' | 'closed' | 'aborted';
  source?: 'paper' | 'live' | 'shadow';
  start_ts?: string;
  end_ts?: string | null;
}

export interface RunContextState {
  run: ResolvedRun | null;
  loading: boolean;
  error: string | null;
  scope: DataScope;
  customDate: string | null;
  // V2: Stats from canonical DBs
  signalStats: SignalStats | null;
  shockStats: ShockStats | null;
  // V3: Selected run (may differ from active run)
  selectedRunId: string | null;
  activeRunId: string | null;
  isOverridden: boolean; // true if user selected a different run than active
  // V4: Context validity (DESK-GRADE TRUTH)
  contextValid: boolean; // false if no run_id - blocks all data rendering
  invalidReason: InvalidContextReason | null;
}

// V4: Invalid context reasons for desk-grade truth
export type InvalidContextReason =
  | 'NO_RUN_SELECTED'
  | 'RUN_NOT_FOUND'
  | 'RUN_LOADING'
  | 'API_ERROR'
  | 'CONTEXT_STALE';

const STERN_COMPAT = true;
const STERN_RUN_ID = 'stern-paper';
const STERN_SYNTHETIC_RUN: ResolvedRun = {
  resolved: true,
  run_id: STERN_RUN_ID,
  strategy_id: 'damping_wave',
  strategy_version: 'crypto-mm',
  trade_date: new Date().toISOString().slice(0, 10),
  root_dir: null,
  available_dbs: [],
  data_origin: 'CANONICAL',
  scope: 'TODAY',
  target_date: new Date().toISOString().slice(0, 10),
  status: 'running',
  source: 'paper',
  start_ts: new Date().toISOString(),
  end_ts: null,
};

const API_BASE = (() => {
  return '';
})();

/**
 * Global run context - singleton pattern
 * Ensures all components see the same run state
 */
let globalRunState: RunContextState = {
  run: STERN_COMPAT ? STERN_SYNTHETIC_RUN : null,
  loading: false,
  error: null,
  scope: 'TODAY',
  customDate: null,
  signalStats: null,
  shockStats: null,
  selectedRunId: STERN_COMPAT ? STERN_RUN_ID : null,
  activeRunId: STERN_COMPAT ? STERN_RUN_ID : null,
  isOverridden: false,
  // V4: Start with invalid context - must select a run
  contextValid: STERN_COMPAT,
  invalidReason: STERN_COMPAT ? null : 'NO_RUN_SELECTED',
};

type SelectorEqualityFn<T> = (a: T, b: T) => boolean;

type SelectorListener<T> = {
  selector: (state: RunContextState) => T;
  isEqual: SelectorEqualityFn<T>;
  current: T;
  notify: () => void;
};

const selectorListeners = new Set<SelectorListener<unknown>>();

function shallowEqualObject<T extends Record<string, unknown>>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => Object.is(a[key], b[key]));
}

function notifyListeners() {
  selectorListeners.forEach((listener) => {
    const nextValue = listener.selector(globalRunState);
    if (!listener.isEqual(listener.current, nextValue)) {
      listener.current = nextValue;
      listener.notify();
    }
  });
}

function subscribeSelector<T>(
  selector: (state: RunContextState) => T,
  isEqual: SelectorEqualityFn<T>,
  notify: () => void
): () => void {
  const entry: SelectorListener<T> = {
    selector,
    isEqual,
    current: selector(globalRunState),
    notify,
  };
  selectorListeners.add(entry as SelectorListener<unknown>);
  return () => {
    selectorListeners.delete(entry as SelectorListener<unknown>);
  };
}

function useRunContextSelector<T>(
  selector: (state: RunContextState) => T,
  isEqual: SelectorEqualityFn<T> = Object.is
): T {
  const selectorRef = useRef(selector);
  const isEqualRef = useRef(isEqual);
  const cachedSnapshotRef = useRef<T>(selector(globalRunState));

  selectorRef.current = selector;
  isEqualRef.current = isEqual;

  const getSnapshot = useCallback(() => {
    const nextValue = selectorRef.current(globalRunState);
    if (!isEqualRef.current(cachedSnapshotRef.current, nextValue)) {
      cachedSnapshotRef.current = nextValue;
    }
    return cachedSnapshotRef.current;
  }, []);

  const subscribe = useCallback(
    (notify: () => void) =>
      subscribeSelector(
        (state) => selectorRef.current(state),
        (a, b) => isEqualRef.current(a, b),
        notify
      ),
    []
  );

  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot
  );
}

/**
 * Load persisted run_id from localStorage
 */
function loadPersistedRunId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Persist run_id to localStorage
 */
function persistRunId(runId: string | null) {
  try {
    if (runId) {
      localStorage.setItem(STORAGE_KEY, runId);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // localStorage not available
  }
}

/**
 * Resolve run using both legacy endpoint and canonical registry
 * PERFORMANCE: Combined into fewer API calls
 */
async function resolveRun(
  scope: DataScope,
  customDate?: string,
  strategyId?: string
): Promise<ResolvedRun> {
  const params = new URLSearchParams({ scope });
  if (scope === 'DATE' && customDate) {
    params.set('date', customDate);
  }
  if (strategyId) {
    params.set('strategy', strategyId);
  }

  // Single call to resolve endpoint (already cached server-side)
  const res = await fetch(`${API_BASE}/api/run/resolve?${params}`);
  if (!res.ok) {
    throw new Error(`Failed to resolve run: HTTP ${res.status}`);
  }
  const legacyRun = await res.json();

  // PERFORMANCE: Skip extra canonicalApi call - run/resolve already has what we need
  // The data_origin from server is authoritative
  return {
    ...legacyRun,
    resolved: legacyRun.resolved ?? Boolean(legacyRun.run_id),
    run_id: legacyRun.run_id ?? null,
    strategy_id: legacyRun.strategy_id ?? legacyRun.strategy ?? strategyId ?? "",
    strategy_version: legacyRun.strategy_version ?? legacyRun.version ?? null,
    trade_date:
      legacyRun.trade_date ??
      (legacyRun.start_ts ? legacyRun.start_ts.split("T")[0] : ""),
    scope,
    target_date: legacyRun.target_date ?? legacyRun.trade_date ?? "",
    available_dbs: legacyRun.available_dbs ?? [],
    data_origin: legacyRun.data_origin ?? "CANONICAL",
    root_dir: legacyRun.root_dir ?? null,
  } as ResolvedRun;
}

export function buildResolvedRunFromRegistryRun(
  run: Run,
  scope: DataScope,
  targetDate?: string
): ResolvedRun {
  const tradeDate = run.start_ts?.split('T')[0] || '';
  return {
    resolved: true,
    run_id: run.run_id,
    strategy_id: run.strategy,
    strategy_version: run.cfg_hash ?? null,
    trade_date: tradeDate,
    root_dir: null,
    available_dbs: [],
    data_origin: 'CANONICAL',
    scope,
    target_date: targetDate ?? tradeDate,
    status: run.status,
    source: run.source,
    start_ts: run.start_ts,
    end_ts: run.end_ts,
  };
}

export function withActiveRunFallback(
  run: ResolvedRun,
  scope: DataScope,
  activeRun: Run | null
): ResolvedRun {
  if (scope !== 'TODAY' || run.run_id || !activeRun) {
    return run;
  }
  return buildResolvedRunFromRegistryRun(
    activeRun,
    scope,
    run.target_date || run.trade_date
  );
}

/**
 * Fetch signal and shock stats from canonical registry
 * Now requires run_id (V3)
 * PERFORMANCE: Results are cached server-side for 10s
 */
async function fetchCanonicalStats(runId: string | null, strategyId?: string | null): Promise<{
  signalStats: SignalStats | null;
  shockStats: ShockStats | null;
}> {
  if (!runId) {
    return { signalStats: null, shockStats: null };
  }
  try {
    const [signalStats, shockStats] = await Promise.all([
      canonicalApi.getSignalStats(runId, strategyId ?? undefined),
      canonicalApi.getShockStats(runId, strategyId ?? undefined),
    ]);
    return { signalStats, shockStats };
  } catch {
    return { signalStats: null, shockStats: null };
  }
}

function syncActiveContextFromRun(run: ResolvedRun | null) {
  if (!run) return;
  activeContext.strategy_id = run.strategy_id || (run as any).strategy || "";
  activeContext.run_id = run.run_id ?? '';
  if (run.source) {
    activeContext.mode = run.source as ActiveContext['mode'];
  }
}

export function useRunContext() {
  const state = useRunContextSelector((snapshot) => snapshot);

  /**
   * Select a specific run (persisted to localStorage)
   */
  const selectRun = useCallback(async (runId: string) => {
    if (STERN_COMPAT) {
      const resolvedRun = {
        ...STERN_SYNTHETIC_RUN,
        run_id: runId || STERN_RUN_ID,
      };
      globalRunState = {
        ...globalRunState,
        run: resolvedRun,
        loading: false,
        error: null,
        selectedRunId: resolvedRun.run_id,
        activeRunId: STERN_RUN_ID,
        isOverridden: resolvedRun.run_id !== STERN_RUN_ID,
        contextValid: true,
        invalidReason: null,
      };
      syncActiveContextFromRun(resolvedRun);
      notifyListeners();
      return;
    }
    // Keep contextValid=true if we already have a valid run — avoids flash of blocking screen.
    const alreadyValid = globalRunState.contextValid && !!globalRunState.run;
    globalRunState = {
      ...globalRunState,
      loading: true,
      selectedRunId: runId,
      contextValid: alreadyValid ? true : false,
      invalidReason: alreadyValid ? null : 'RUN_LOADING',
    };
    persistRunId(runId);
    notifyListeners();

    try {
      const run = await canonicalApi.getRun(runId);
      const resolvedRun = buildResolvedRunFromRegistryRun(run, 'TODAY');

      // Debloquer le ContextGuard immediatement avec le run -- sans attendre stats/activeRun.
      globalRunState = {
        ...globalRunState,
        run: resolvedRun,
        loading: false,
        error: null,
        selectedRunId: runId,
        contextValid: true,
        invalidReason: null,
      };
      syncActiveContextFromRun(resolvedRun);
      const bundleState = getBundleState();
      if (bundleState.enabled && bundleState.dwRunId !== runId) {
        syncBundleDwRunId(runId);
      }
      notifyListeners();

      // Stats et activeRun en arriere-plan (non bloquants pour le rendu initial).
      const [stats, activeRes] = await Promise.all([
        fetchCanonicalStats(runId, run.strategy),
        canonicalApi.getActiveRun(run.strategy),
      ]);
      const activeRunId = activeRes.active?.run_id || null;
      globalRunState = {
        ...globalRunState,
        signalStats: stats.signalStats,
        shockStats: stats.shockStats,
        activeRunId,
        isOverridden: activeRunId !== runId,
      };
    } catch (e: any) {
      const isNotFound = e.message?.includes('404') || e.message?.includes('not found');

      globalRunState = {
        ...globalRunState,
        loading: false,
        error: isNotFound ? 'Run not found - please select a valid run' : (e.message || 'Failed to select run'),
        selectedRunId: isNotFound ? null : runId,
        // V4: Context invalid on error
        contextValid: false,
        invalidReason: isNotFound ? 'RUN_NOT_FOUND' : 'API_ERROR',
      };

      if (isNotFound) {
        persistRunId(null);
      }
    }
    notifyListeners();
  }, []);

  /**
   * Reset to active run
   */
  const resetToActiveRun = useCallback(async () => {
    if (STERN_COMPAT) {
      globalRunState = {
        ...globalRunState,
        run: STERN_SYNTHETIC_RUN,
        loading: false,
        error: null,
        selectedRunId: STERN_RUN_ID,
        activeRunId: STERN_RUN_ID,
        isOverridden: false,
        contextValid: true,
        invalidReason: null,
      };
      syncActiveContextFromRun(STERN_SYNTHETIC_RUN);
      notifyListeners();
      return;
    }
    const alreadyValidReset = globalRunState.contextValid && !!globalRunState.run;
    globalRunState = {
      ...globalRunState,
      loading: true,
      contextValid: alreadyValidReset ? true : false,
      invalidReason: alreadyValidReset ? null : 'RUN_LOADING',
    };
    notifyListeners();

    try {
      const strategyToUse = globalRunState.run?.strategy_id || activeContext.strategy_id || undefined;
      const activeRes = await canonicalApi.getActiveRun(strategyToUse);
      if (activeRes.active) {
        await selectRun(activeRes.active.run_id);
      } else {
        globalRunState = {
          ...globalRunState,
          loading: false,
          error: 'No active run found',
          selectedRunId: null,
          activeRunId: null,
          isOverridden: false,
          // V4: Context invalid - no active run
          contextValid: false,
          invalidReason: 'NO_RUN_SELECTED',
        };
        persistRunId(null);
      }
    } catch (e: any) {
      globalRunState = {
        ...globalRunState,
        loading: false,
        error: e.message || 'Failed to find active run',
        // V4: Context invalid on error
        contextValid: false,
        invalidReason: 'API_ERROR',
      };
    }
    notifyListeners();
  }, [selectRun]);

  const setScope = useCallback(async (newScope: DataScope, customDate?: string) => {
    if (STERN_COMPAT) {
      const targetDate =
        newScope === 'DATE' && customDate
          ? customDate
          : new Date().toISOString().slice(0, 10);
      const run = {
        ...STERN_SYNTHETIC_RUN,
        scope: newScope,
        trade_date: targetDate,
        target_date: targetDate,
      };
      globalRunState = {
        ...globalRunState,
        run,
        loading: false,
        error: null,
        scope: newScope,
        customDate: customDate || null,
        selectedRunId: STERN_RUN_ID,
        activeRunId: STERN_RUN_ID,
        isOverridden: false,
        contextValid: true,
        invalidReason: null,
      };
      syncActiveContextFromRun(run);
      notifyListeners();
      return;
    }
    globalRunState = {
      ...globalRunState,
      loading: true,
      error: null,
      scope: newScope,
      customDate: customDate || null,
      // V4: Mark loading
      contextValid: false,
      invalidReason: 'RUN_LOADING',
    };
    notifyListeners();

    try {
      const strategyToUse = globalRunState.run?.strategy_id || activeContext.strategy_id;
      // resolveRun + getActiveRun en parallele (etaient sequentiels).
      const [requestedRun, activeRes] = await Promise.all([
        resolveRun(newScope, customDate, strategyToUse),
        canonicalApi.getActiveRun(strategyToUse || undefined),
      ]);
      const activeRunId = activeRes.active?.run_id || null;
      const run = withActiveRunFallback(requestedRun, newScope, activeRes.active);
      const runIdToUse = run.run_id;

      // Debloquer le ContextGuard immediatement sans attendre les stats.
      globalRunState = {
        ...globalRunState,
        run,
        loading: false,
        error: null,
        selectedRunId: runIdToUse,
        activeRunId,
        isOverridden: runIdToUse !== activeRunId && !!runIdToUse && !!activeRunId,
        contextValid: !!runIdToUse,
        invalidReason: runIdToUse ? null : 'NO_RUN_SELECTED',
      };
      if (runIdToUse) {
        persistRunId(runIdToUse);
      } else {
        persistRunId(null);
      }
      syncActiveContextFromRun(run);
      const bundleState = getBundleState();
      if (bundleState.enabled && bundleState.dwRunId !== runIdToUse) {
        syncBundleDwRunId(runIdToUse);
      }
      notifyListeners();

      // Stats en arriere-plan (non bloquantes).
      if (runIdToUse) {
        const stats = await fetchCanonicalStats(runIdToUse, run.strategy_id);
        globalRunState = {
          ...globalRunState,
          signalStats: stats.signalStats,
          shockStats: stats.shockStats,
        };
      }
    } catch (e: any) {
      globalRunState = {
        ...globalRunState,
        loading: false,
        error: e.message || 'Failed to resolve run',
        // V4: Context invalid on error
        contextValid: false,
        invalidReason: 'API_ERROR',
      };
    }
    notifyListeners();
  }, []);

  const refresh = useCallback(async () => {
    if (globalRunState.selectedRunId) {
      await selectRun(globalRunState.selectedRunId);
    } else {
      await setScope(globalRunState.scope, globalRunState.customDate || undefined);
    }
  }, [selectRun, setScope]);

  // Auto-resolve on first mount if no run is set
  useEffect(() => {
    if (STERN_COMPAT) {
      syncActiveContextFromRun(STERN_SYNTHETIC_RUN);
      return;
    }
    if (!globalRunState.run && !globalRunState.loading) {
      // Check for persisted run_id first
      const persistedRunId = loadPersistedRunId();
      if (persistedRunId) {
        selectRun(persistedRunId);
      } else {
        setScope('TODAY');
      }
    }
  }, [setScope, selectRun]);

  return {
    run: state.run,
    loading: state.loading,
    error: state.error,
    scope: state.scope,
    customDate: state.customDate,
    setScope,
    refresh,
    // V3: Run selection
    selectRun,
    resetToActiveRun,
    selectedRunId: state.selectedRunId,
    activeRunId: state.activeRunId,
    isOverridden: state.isOverridden,
    // Convenience getters
    runId: state.selectedRunId || state.run?.run_id || null,
    dataOrigin: state.run?.data_origin || 'LEGACY',
    isRunAware: state.run?.data_origin === 'RUN',
    isCanonical: state.run?.data_origin === 'CANONICAL',
    // V2: Canonical stats
    signalStats: state.signalStats,
    shockStats: state.shockStats,
    // V4: Context validity (DESK-GRADE TRUTH)
    contextValid: state.contextValid,
    invalidReason: state.invalidReason,
  };
}

export function useRunId(): string | null {
  return useRunContextSelector(
    (state) => state.selectedRunId || state.run?.run_id || null
  );
}

export function useRunMeta(): {
  run: ResolvedRun | null;
  selectedRunId: string | null;
  activeRunId: string | null;
  dataOrigin: ResolvedRun["data_origin"] | "LEGACY";
  isRunAware: boolean;
  isCanonical: boolean;
  contextValid: boolean;
  invalidReason: InvalidContextReason | null;
  loading: boolean;
  error: string | null;
} {
  return useRunContextSelector(
    (state) => ({
      run: state.run,
      selectedRunId: state.selectedRunId,
      activeRunId: state.activeRunId,
      dataOrigin: state.run?.data_origin || 'LEGACY',
      isRunAware: state.run?.data_origin === 'RUN',
      isCanonical: state.run?.data_origin === 'CANONICAL',
      contextValid: state.contextValid,
      invalidReason: state.invalidReason,
      loading: state.loading,
      error: state.error,
    }),
    shallowEqualObject
  );
}

export function useRunStats(): {
  signalStats: SignalStats | null;
  shockStats: ShockStats | null;
} {
  return useRunContextSelector(
    (state) => ({
      signalStats: state.signalStats,
      shockStats: state.shockStats,
    }),
    shallowEqualObject
  );
}

export function useRunLoading(): boolean {
  return useRunContextSelector((state) => state.loading);
}

export function useRunContextValid(): {
  contextValid: boolean;
  invalidReason: InvalidContextReason | null;
} {
  return useRunContextSelector(
    (state) => ({
      contextValid: state.contextValid,
      invalidReason: state.invalidReason,
    }),
    shallowEqualObject
  );
}

/**
 * Build API URL with run context
 * All API calls should use this to ensure consistent run_id passing
 */
export function withRunId(url: string, runId: string | null): string {
  if (!runId) return url;
  const joiner = url.includes('?') ? '&' : '?';
  return `${url}${joiner}run_id=${encodeURIComponent(runId)}`;
}

/**
 * Debug banner component - shows current run context
 * NOTE: For production use RunBanner from components/RunBanner.tsx
 */
export function RunContextDebugBanner() {
  const {
    run, loading, error, scope, dataOrigin, isRunAware, isCanonical,
    signalStats, shockStats, selectedRunId, activeRunId, isOverridden,
    resetToActiveRun
  } = useRunContext();

  if (!run && !loading && !error) return null;

  const bgColor = isCanonical
    ? 'bg-emerald-900/50 border-emerald-400/30'
    : isRunAware
      ? 'bg-blue-900/50 border-blue-400/30'
      : 'bg-amber-900/50 border-amber-400/30';

  const textColor = isCanonical
    ? 'text-emerald-400'
    : isRunAware
      ? 'text-blue-400'
      : 'text-amber-400';

  return (
    <div className={`fixed bottom-4 right-4 z-50 rounded-lg border ${bgColor} p-3 text-xs font-mono shadow-lg`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`font-bold ${textColor}`}>
          {loading ? 'RESOLVING...' : dataOrigin}
        </span>
        <span className="text-neutral-400">|</span>
        <span className="text-white">{scope}</span>
        {isOverridden && (
          <>
            <span className="text-neutral-400">|</span>
            <button
              onClick={resetToActiveRun}
              className="text-yellow-400 hover:text-yellow-300 underline"
            >
              Reset to Active
            </button>
          </>
        )}
      </div>
      {run && (
        <div className="space-y-0.5 text-neutral-300">
          <div>selected: <span className="text-white">{selectedRunId?.slice(0, 12) || 'null'}</span></div>
          <div>active: <span className="text-white">{activeRunId?.slice(0, 12) || 'null'}</span></div>
          <div>date: <span className="text-white">{run.trade_date}</span></div>
          <div>dbs: <span className="text-white">{run.available_dbs.join(', ') || 'canonical'}</span></div>
          {signalStats && (
            <div>signals: <span className="text-blue-400">{signalStats.total_signals}</span> ({signalStats.traded_signals} traded)</div>
          )}
          {shockStats && (
            <div>shocks: <span className="text-purple-400">{shockStats.total_shocks}</span></div>
          )}
        </div>
      )}
      {error && <div className="text-red-400 mt-1">{error}</div>}
    </div>
  );
}
