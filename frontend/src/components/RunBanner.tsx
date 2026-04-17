/**
 * RunBanner - V4 DESK-GRADE TRUTH
 * 
 * Shows current run status with run selection capability:
 * - Selected run ID (from context)
 * - Active run indicator if different
 * - "Reset to Active" button when overridden
 * - Strategy name
 * - Session duration
 * - Quick stats (signals, shocks)
 * - V4: VerdictBanner integration
 * 
 * Uses useRunContext for single source of truth
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDateTimeUTC, formatTime } from '../lib/dateUtils';
import { Activity, Clock, AlertTriangle, Zap, Signal, RefreshCw, ChevronDown, RotateCcw, Database } from 'lucide-react';
import { api, type UiStatus } from '../lib/api';
import { activeContext } from '../lib/activeContext';
import { useRunContext } from '../lib/useRunContext';
import {
    autoSyncBundleS2RunId,
    autoSyncBundleTfRunId,
    useBundleRuns,
} from '../lib/useBundleRuns';
import { useDashboardPoll } from '../lib/dashboardPollingBus';
import { canonicalApi, type Run } from '../lib/canonicalApi';
import { VerdictBanner } from './VerdictBanner';
import { MiniFunnel } from './FunnelCard';

interface RunBannerProps {
    /** Strategy to filter by (optional) */
    strategy?: string;
    /** Whether to show compact version */
    compact?: boolean;
    /** Show refresh button */
    showRefresh?: boolean;
    /** Show run selector dropdown */
    showSelector?: boolean;
}

function resolveRelayTone(lastIngest: string | null): {
    label: string;
    className: string;
} {
    if (!lastIngest) {
        return { label: "UNKNOWN", className: "bg-neutral-800 text-neutral-400" };
    }
    const ts = new Date(lastIngest).getTime();
    if (!Number.isFinite(ts)) {
        return { label: "UNKNOWN", className: "bg-neutral-800 text-neutral-400" };
    }
    const ageSec = (Date.now() - ts) / 1000;
    if (ageSec <= 90) {
        return {
            label: "OK",
            className: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
        };
    }
    if (ageSec <= 300) {
        return {
            label: "STALE",
            className: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
        };
    }
    return {
        label: "DOWN",
        className: "bg-red-500/20 text-red-300 border border-red-500/30",
    };
}

export function RunBanner({ strategy, compact = false, showRefresh = true, showSelector = true }: RunBannerProps) {
    const {
        runId,
        run,
        loading,
        error,
        signalStats,
        shockStats,
        refresh,
        selectRun,
        resetToActiveRun,
        activeRunId,
        isOverridden,
        isCanonical,
    } = useRunContext();
    const { enabled: bundleEnabled, dwRunId, s2RunId, tfRunId, setS2RunId, setTfRunId } = useBundleRuns();

    const [refreshing, setRefreshing] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [availableRuns, setAvailableRuns] = useState<Run[]>([]);
    const [loadingRuns, setLoadingRuns] = useState(false);
    const [uiStatus, setUiStatus] = useState<UiStatus | null>(null);
    const [s2Resetting, setS2Resetting] = useState(false);
    const [tfResetting, setTfResetting] = useState(false);
    const [s2ActiveRunId, setS2ActiveRunId] = useState<string | null>(null);
    const [s2ActiveStatus, setS2ActiveStatus] = useState<string | null>(null);
    const [tfActiveRunId, setTfActiveRunId] = useState<string | null>(null);
    const [tfActiveStatus, setTfActiveStatus] = useState<string | null>(null);
    const scopedContext = useMemo(
        () => (runId ? { ...activeContext, run_id: runId } : activeContext),
        [runId]
    );

    const dwRunIdEffective = bundleEnabled ? (dwRunId ?? runId) : runId;
    const s2RunIdEffective = bundleEnabled ? (s2RunId ?? null) : s2RunId ?? null;
    const tfRunIdEffective = bundleEnabled ? (tfRunId ?? null) : tfRunId ?? null;
    const shortId = (value: string | null | undefined) =>
        value ? value.slice(0, 8) : 'NO_RUN';
    const isS2Overridden =
        Boolean(bundleEnabled) &&
        Boolean(s2RunIdEffective) &&
        Boolean(s2ActiveRunId) &&
        s2RunIdEffective !== s2ActiveRunId &&
        s2ActiveStatus === 'running';
    const isTfOverridden =
        Boolean(bundleEnabled) &&
        Boolean(tfRunIdEffective) &&
        Boolean(tfActiveRunId) &&
        tfRunIdEffective !== tfActiveRunId;
    // Note: pas de filtre sur tfActiveStatus — getActiveRun ne retourne que des runs 'running'

    // Fetch available runs for selector
    const fetchRuns = async () => {
        setLoadingRuns(true);
        try {
            const data = await canonicalApi.listRuns({ limit: 10 });
            const sorted = [...data.runs].sort(
                (a, b) => (b.trades_count ?? 0) - (a.trades_count ?? 0)
            );
            const withTrades = sorted.filter((r) => (r.trades_count ?? 0) > 0);

            // Always include currently selected or active run even if zero trades.
            // Use actual status from the full API response if available — never hardcode 'running'.
            const ensureRun = (arr: typeof sorted, id?: string | null) => {
                if (!id) return arr;
                if (arr.some((r) => r.run_id === id)) return arr;
                // Run absent from filtered list (e.g. 0 trades) but present in full sorted list
                const existing = sorted.find((r) => r.run_id === id);
                if (existing) return [...arr, existing];
                // Truly not in API response — synthesize (rare: brand-new run not yet visible)
                return [
                    ...arr,
                    {
                        run_id: id,
                        strategy: strategy || 'damping_wave',
                        cfg_hash: null,
                        start_ts: new Date().toISOString(),
                        end_ts: null,
                        status: 'running' as const,
                        source: 'paper' as const,
                        pnl_total: null,
                        trades_count: 0,
                        notes: null,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    },
                ];
            };

            let finalList = withTrades.length ? withTrades : sorted;
            finalList = ensureRun(finalList, runId);
            finalList = ensureRun(finalList, activeRunId);

            setAvailableRuns(finalList);
        } catch {
            // Ignore errors
        } finally {
            setLoadingRuns(false);
        }
    };

    useEffect(() => {
        if (showDropdown) {
            fetchRuns();
        }
    }, [showDropdown]);

    const loadStrategyActives = useCallback(async () => {
        try {
            const [s2Payload, tfPayload] = await Promise.all([
                api.getS2ActiveRun(),
                canonicalApi.getActiveRun("tf_pullback_v1"),
            ]);
            const activeId =
                s2Payload?.run && typeof s2Payload.run.run_id === 'string'
                    ? s2Payload.run.run_id
                    : null;
            const activeStatus =
                s2Payload?.run && typeof s2Payload.run.status === 'string'
                    ? s2Payload.run.status
                    : null;
            const tfId =
                tfPayload?.active && typeof tfPayload.active.run_id === 'string'
                    ? tfPayload.active.run_id
                    : null;
            const tfStatus =
                tfPayload?.active && typeof tfPayload.active.status === 'string'
                    ? tfPayload.active.status
                    : null;
            setS2ActiveRunId(activeId);
            setS2ActiveStatus(activeStatus);
            setTfActiveRunId(tfId);
            setTfActiveStatus(tfStatus);
            autoSyncBundleS2RunId(activeId);
            autoSyncBundleTfRunId(tfId);
        } catch {
            setS2ActiveRunId(null);
            setS2ActiveStatus(null);
            setTfActiveRunId(null);
            setTfActiveStatus(null);
        }
    }, []);

    useEffect(() => {
        if (!bundleEnabled) {
            setS2ActiveRunId(null);
            setS2ActiveStatus(null);
            setTfActiveRunId(null);
            setTfActiveStatus(null);
            return;
        }
    }, [bundleEnabled]);

    useDashboardPoll("summary", loadStrategyActives, {
        enabled: bundleEnabled,
        immediate: true,
    });

    const loadCompactStatus = useCallback(async () => {
        try {
            const payload = await api.getUiStatus(scopedContext);
            setUiStatus(payload ?? null);
        } catch {
            setUiStatus(null);
        }
    }, [scopedContext]);

    useDashboardPoll("status", loadCompactStatus, {
        enabled: compact,
        immediate: compact,
    });

    const handleRefresh = async () => {
        setRefreshing(true);
        await refresh();
        setRefreshing(false);
    };

    const handleSelectRun = async (selectedRunId: string) => {
        setShowDropdown(false);
        await selectRun(selectedRunId);
    };

    const handleResetToActive = async () => {
        await resetToActiveRun();
    };

    const handleResetS2 = async () => {
        if (!bundleEnabled) {
            return;
        }
        setS2Resetting(true);
        try {
            const activeRes = await api.getS2ActiveRun();
            let targetRunId =
                activeRes?.run && typeof activeRes.run.run_id === 'string'
                    ? activeRes.run.run_id
                    : null;
            if (!targetRunId) {
                const resetRes = await api.resetS2Run('banner_reset_latest');
                targetRunId =
                    resetRes && typeof resetRes.run_id === 'string'
                        ? resetRes.run_id
                        : null;
            }
            if (!targetRunId) {
                const signals = await api.getS2Signals(1, {
                    ...activeContext,
                    run_id: "",
                });
                const latest = signals?.[0];
                targetRunId =
                    latest && typeof latest.run_id === 'string' ? latest.run_id : null;
            }
            if (!targetRunId) {
                return;
            }
            if (dwRunIdEffective && targetRunId === dwRunIdEffective) {
                return;
            }
            setS2RunId(targetRunId);
        } catch {
            // noop
        } finally {
            setS2Resetting(false);
        }
    };

    const handleResetTf = async () => {
        if (!bundleEnabled) return;
        setTfResetting(true);
        try {
            const res = await canonicalApi.getActiveRun('tf_pullback_v1');
            const activeId = res?.active?.run_id ?? null;
            if (activeId) {
                setTfRunId(activeId);
            } else if (dwRunIdEffective) {
                // shared-run fallback: use DW run_id if no dedicated TF run found
                setTfRunId(dwRunIdEffective);
            }
        } catch {
            // noop
        } finally {
            setTfResetting(false);
        }
    };

    // Calculate session duration
    const getSessionDuration = (startTs: string | undefined): string => {
        if (!startTs) return '—';
        const start = new Date(startTs);
        const now = new Date();
        const diffMs = now.getTime() - start.getTime();
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    };

    // Loading state
    if (loading) {
        return (
            <div className="bg-neutral-800/50 border border-neutral-700 rounded-lg px-4 py-2 animate-pulse">
                <div className="h-5 bg-neutral-700 rounded w-48"></div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <span className="text-sm text-red-400">{error}</span>
                <button onClick={handleRefresh} className="ml-auto p-1 hover:bg-white/10 rounded">
                    <RefreshCw className="h-4 w-4 text-neutral-400" />
                </button>
            </div>
        );
    }

    // No run selected
    if (!runId) {
        return (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></div>
                    <span className="text-sm text-amber-400 font-medium">No run selected</span>
                    <span className="text-xs text-neutral-500">
                        Select a run to view data
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {showSelector && (
                        <RunSelectorButton
                            onClick={() => setShowDropdown(!showDropdown)}
                            open={showDropdown}
                        />
                    )}
                    {showRefresh && (
                        <button
                            onClick={handleRefresh}
                            className="p-1 hover:bg-white/10 rounded transition-colors"
                            disabled={refreshing}
                        >
                            <RefreshCw className={`h-4 w-4 text-neutral-400 ${refreshing ? 'animate-spin' : ''}`} />
                        </button>
                    )}
                </div>

                {/* Dropdown */}
                {showDropdown && (
                    <RunDropdown
                        runs={availableRuns}
                        loading={loadingRuns}
                        currentRunId={runId}
                        onSelect={handleSelectRun}
                        onClose={() => setShowDropdown(false)}
                    />
                )}
            </div>
        );
    }

    // Compact version
    if (compact) {
        const modeLabel = (run?.source || 'paper').toUpperCase();
        const relayTone = resolveRelayTone(uiStatus?.relay?.last_ingest_ts ?? null);
        const ingestLabel = formatTime(uiStatus?.relay?.last_ingest_ts ?? null, 'UTC');
        return (
            <div className={`rounded-lg px-3 py-2 flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center justify-between gap-2 sm:gap-3 ${isCanonical
                ? 'bg-emerald-500/10 border border-emerald-500/30'
                : 'bg-amber-500/10 border border-amber-500/30'
                }`}>
                <div className="w-full sm:w-auto flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className={`h-2 w-2 rounded-full animate-pulse ${isCanonical ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] font-mono text-neutral-200">
                                    DW:{shortId(dwRunIdEffective)}
                                </span>
                                {isOverridden && (
                                    <span className="text-[10px] text-yellow-300 px-1.5 py-0.5 border border-yellow-400/30 rounded-lg">
                                        OVERRIDE
                                    </span>
                                )}
                                <span className="rounded px-1.5 py-0.5 text-[10px] bg-white/10 text-neutral-100">
                                    {modeLabel}
                                </span>
                                <span className={`rounded px-1.5 py-0.5 text-[10px] ${relayTone.className}`}>
                                    RELAY {relayTone.label}
                                </span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-3 text-[10px] text-neutral-400">
                                <span className="truncate">{run?.strategy_id}</span>
                                <span className="text-neutral-500">{getSessionDuration(run?.start_ts)}</span>
                                <span className="text-neutral-200">INGEST {ingestLabel}</span>
                            </div>
                        </div>
                    </div>
                    {isOverridden && (
                        <button
                            onClick={handleResetToActive}
                            className="shrink-0 rounded-lg border border-yellow-400/30 bg-yellow-500/10 px-2.5 py-1 text-[10px] uppercase tracking-wide text-yellow-300 hover:bg-yellow-500/15"
                        >
                            Reset
                        </button>
                    )}
                </div>

                <div className="w-full sm:w-auto flex items-center justify-between sm:justify-end gap-3 text-[10px] text-neutral-400">
                    <span className="font-mono text-neutral-300">
                        S2:{shortId(s2RunIdEffective)}
                    </span>
                    <span className="font-mono text-neutral-300">
                        S3:{shortId(tfRunIdEffective)}
                    </span>
                    {isTfOverridden && (
                        <button
                            onClick={handleResetTf}
                            disabled={tfResetting}
                            className="rounded-lg border border-yellow-500/30 px-2.5 py-1 text-[10px] uppercase tracking-wide text-yellow-300 transition hover:border-yellow-400 hover:text-yellow-200 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Reset S3 vers le run actif"
                        >
                            {tfResetting ? 'Reset…' : 'Reset S3'}
                        </button>
                    )}
                    {isS2Overridden && (
                        <button
                            onClick={handleResetS2}
                            disabled={s2Resetting}
                            className="rounded-lg border border-yellow-500/30 px-2.5 py-1 text-[10px] uppercase tracking-wide text-yellow-300 transition hover:border-yellow-400 hover:text-yellow-200 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Reset S2 vers le run actif"
                        >
                            {s2Resetting ? 'Reset…' : 'Reset S2'}
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // Full version
    return (
        <div className={`rounded-xl px-4 py-3 relative ${isCanonical
            ? 'bg-emerald-500/5 border border-emerald-500/20'
            : 'bg-amber-500/5 border border-amber-500/20'
            }`}>
            <div className="flex items-center justify-between">
                {/* Left: Run info */}
                <div className="flex items-center gap-4">
                    {/* Status indicator */}
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <div className={`h-3 w-3 rounded-full ${isCanonical ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                            <div className={`absolute inset-0 h-3 w-3 rounded-full animate-ping ${isCanonical ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                        </div>
                        <span className={`text-sm font-semibold uppercase ${isCanonical ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {run?.status || 'SELECTED'}
                        </span>
                        {isOverridden && (
                            <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded border border-yellow-500/30">
                                NOT ACTIVE
                            </span>
                        )}
                    </div>

                    {/* Divider */}
                    <div className="h-6 w-px bg-white/10"></div>

                    {/* Run details */}
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className="text-xs text-neutral-400">DW Run</div>
                            <button
                                onClick={() => setShowDropdown(!showDropdown)}
                                className="font-mono text-sm text-white flex items-center gap-1 hover:text-blue-400 transition-colors"
                            >
                                {runId.slice(0, 12)}...
                                {showSelector && <ChevronDown className="h-3 w-3" />}
                            </button>
                        </div>
                        <div className="relative">
                            <div className="text-xs text-neutral-400">S2 Run</div>
                            <div className="flex items-center gap-2 font-mono text-sm text-neutral-200">
                                <span>{shortId(s2RunIdEffective)}</span>
                                {isS2Overridden && (
                                    <button
                                        onClick={handleResetS2}
                                        disabled={s2Resetting}
                                        className="rounded border border-yellow-500/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-yellow-300 transition hover:border-yellow-400 hover:text-yellow-200 disabled:cursor-not-allowed disabled:opacity-50"
                                        title="Reset S2 vers le run actif"
                                    >
                                        {s2Resetting ? 'Reset...' : 'Reset S2'}
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="relative">
                            <div className="text-xs text-neutral-400">S3 Run</div>
                            <div className="flex items-center gap-2 font-mono text-sm text-neutral-200">
                                <span>{shortId(tfRunIdEffective)}</span>
                                {isTfOverridden && (
                                    <span className="text-[10px] text-yellow-300 px-1.5 py-0.5 border border-yellow-400/30 rounded-lg">
                                        OVERRIDE
                                    </span>
                                )}
                            </div>
                        </div>
                        <div>
                            <div className="text-xs text-neutral-400">Strategy</div>
                            <div className="text-sm text-white font-medium">
                                {run?.strategy_id || '—'}
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-neutral-400" />
                            <span className="text-sm text-neutral-300">
                                {getSessionDuration(run?.start_ts)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Right: Quick stats + actions */}
                <div className="flex items-center gap-4">
                    {/* Signal stats */}
                    {signalStats && (
                        <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-1">
                            <Signal className="h-4 w-4 text-blue-400" />
                            <span className="text-sm text-white font-medium">
                                {signalStats.total_signals}
                            </span>
                            <span className="text-xs text-neutral-400">signals</span>
                            <span className="text-xs text-blue-400">
                                ({signalStats.traded_signals} traded)
                            </span>
                        </div>
                    )}

                    {/* Shock stats */}
                    {shockStats && (
                        <div className="flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-1">
                            <Zap className="h-4 w-4 text-purple-400" />
                            <span className="text-sm text-white font-medium">
                                {shockStats.total_shocks}
                            </span>
                            <span className="text-xs text-neutral-400">shocks</span>
                        </div>
                    )}

                    {/* Reset to Active button */}
                    {isOverridden && (
                        <button
                            onClick={handleResetToActive}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/20 border border-yellow-500/30 rounded-lg text-yellow-400 hover:bg-yellow-500/30 transition-colors text-xs"
                            title="Reset to active run"
                        >
                            <RotateCcw className="h-3.5 w-3.5" />
                            <span>Reset to Active</span>
                        </button>
                    )}

                    {/* Refresh button */}
                    {showRefresh && (
                        <button
                            onClick={handleRefresh}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                            disabled={refreshing}
                            title="Refresh run status"
                        >
                            <RefreshCw className={`h-4 w-4 text-neutral-400 ${refreshing ? 'animate-spin' : ''}`} />
                        </button>
                    )}
                </div>
            </div>

            {/* Source badge */}
            <div className="mt-3 flex items-center justify-between">
                {/* Left: Source info */}
                <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-500">Source:</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${run?.source === 'live'
                        ? 'bg-red-500/20 text-red-400'
                        : run?.source === 'paper'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-blue-500/20 text-blue-400'
                        }`}>
                        {(run?.source || 'UNKNOWN').toUpperCase()}
                    </span>
                    <span className="text-xs text-neutral-500">Started:</span>
                    <span className="text-xs text-neutral-300">
                        {run?.start_ts
                            ? `${formatDateTimeUTC(run.start_ts)} UTC`
                            : '—'
                        }
                    </span>
                    {isCanonical && (
                        <>
                            <span className="text-xs text-neutral-500">|</span>
                            <Database className="w-3 h-3 text-emerald-400" />
                            <span className="text-xs text-emerald-400">CANONICAL</span>
                        </>
                    )}
                </div>

                {/* Right: Verdict badges */}
                <VerdictBanner compact />
            </div>

            {/* Dropdown */}
            {showDropdown && showSelector && (
                <RunDropdown
                    runs={availableRuns}
                    loading={loadingRuns}
                    currentRunId={runId}
                    activeRunId={activeRunId || undefined}
                    onSelect={handleSelectRun}
                    onClose={() => setShowDropdown(false)}
                />
            )}
        </div>
    );
}

function RunSelectorButton({ onClick, open }: { onClick: () => void; open: boolean }) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-xs text-neutral-300 transition-colors"
        >
            <span>Select Run</span>
            <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
    );
}

function RunDropdown({
    runs,
    loading,
    currentRunId,
    activeRunId,
    onSelect,
    onClose
}: {
    runs: Run[];
    loading: boolean;
    currentRunId: string | null;
    activeRunId?: string;
    onSelect: (runId: string) => void;
    onClose: () => void;
}) {
    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40" onClick={onClose} />

            {/* Dropdown */}
            <div className="absolute top-full left-0 mt-2 w-80 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-50 overflow-hidden">
                <div className="p-2 border-b border-neutral-700">
                    <span className="text-xs text-neutral-400 uppercase tracking-wide">Recent Runs</span>
                </div>

                {loading ? (
                    <div className="p-4 text-center text-neutral-500 text-sm">Loading...</div>
                ) : runs.length === 0 ? (
                    <div className="p-4 text-center text-neutral-500 text-sm">No runs found</div>
                ) : (
                    <div className="max-h-64 overflow-y-auto">
                        {runs.map((run) => {
                            const trades = run.trades_count ?? 0;
                            const hasTrades = trades > 0;
                            return (
                                <button
                                    key={run.run_id}
                                    onClick={() => onSelect(run.run_id)}
                                    className={`w-full px-3 py-2 text-left hover:bg-white/5 transition-colors flex items-center gap-2 ${run.run_id === currentRunId ? 'bg-blue-500/10' : ''
                                        }`}
                                >
                                    <div className={`h-2 w-2 rounded-full ${run.status === 'running' ? 'bg-emerald-500' : 'bg-neutral-500'
                                        }`} />
                                    <div className={`flex-1 min-w-0 ${hasTrades ? '' : 'opacity-60'}`}>
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-xs text-white truncate">
                                                {run.run_id.slice(0, 12)}
                                            </span>
                                            {run.run_id === activeRunId && (
                                                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1 rounded">
                                                    ACTIVE
                                                </span>
                                            )}
                                            {run.run_id === currentRunId && (
                                                <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1 rounded">
                                                    SELECTED
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-[10px] text-neutral-500">
                                            {run.strategy} • {new Date(run.start_ts).toLocaleDateString()}
                                        </div>
                                    </div>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${hasTrades ? 'bg-emerald-500/15 text-emerald-300' : 'bg-neutral-700 text-neutral-400'
                                        }`}>
                                        {trades} trade{trades === 1 ? '' : 's'}
                                    </span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${run.status === 'running'
                                        ? 'bg-emerald-500/20 text-emerald-400'
                                        : run.status === 'closed'
                                            ? 'bg-neutral-500/20 text-neutral-400'
                                            : 'bg-red-500/20 text-red-400'
                                        }`}>
                                        {run.status}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </>
    );
}

export default RunBanner;
