/**
 * Database Panel V5 - RUN TRUTH LOCK with Global Context Binding
 * 
 * V5 Changes (RUN SPLIT FIX):
 * - Uses global useRunContext() instead of local state
 * - No independent run resolution - always follows the global run_id
 * - Run selector allows override but syncs back to global context
 * 
 * V4 Features:
 * - Enhanced integrity checks (5 strict rules)
 * - JSON/CSV export functionality
 * - Data validation against run window
 * - ZeroStateDisplay when no run selected
 * 
 * This panel reads ONLY from canonical databases:
 * - runs.sqlite (via /api/registry/runs)
 * - signals.sqlite (via /api/registry/signals)
 * - shocks.sqlite (via /api/registry/shocks)
 * - canonical_trades.sqlite (via /api/canonical/trades)
 * 
 * No legacy DB access.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatTime } from "../lib/dateUtils";
import {
    AlertTriangle,
    CheckCircle,
    RefreshCw,
    Zap,
    Signal as SignalIcon,
    Activity,
    Database,
    Filter,
    Download,
    FileJson,
    FileSpreadsheet,
    XCircle,
    LinkIcon,
    ChevronDown,
    ChevronUp,
} from 'lucide-react';
import { api, type S2Run, type S2Summary, type Signal as ApiSignal } from '../lib/api';
import {
    canonicalApi,
    type Run,
    type Signal,
    type Shock,
    type CanonicalTrade,
    type ScopedSignal,
    type ScopedShock,
    type SignalStats,
    type ShockStats,
    type SignalScope
} from '../lib/canonicalApi';
import { ZeroStateDisplay } from './ZeroStateDisplay';
import { activeContext } from '../lib/activeContext';
import { useRunContext } from '../lib/useRunContext';
import { useBundleRuns } from '../lib/useBundleRuns';
import { useCommissionView } from '../lib/useCommissionView';
import { usePortfolioEpochContext } from '../lib/PortfolioEpochContext';
import { fetchStatusV2, type StatusV2 } from '../services/researchDeskApi';
import { getExtremeState, isExtremeSignal } from '../lib/signalMode';

type ExportScopeOption = 'RUN' | 'TODAY' | 'YESTERDAY' | 'LAST_7D' | 'DATE' | 'RANGE';

interface ExportScopeParams {
    scope: SignalScope;
    fromDate?: string;
    toDate?: string;
}

interface ResolvedExportScope extends ExportScopeParams {
    runIds: string[];
    restrictedToRun: boolean;
}

const EXPORT_LIMIT = 2000;

const formatDateInput = (date: Date): string => date.toISOString().slice(0, 10);

const dateNDaysAgo = (days: number): string => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    return formatDateInput(d);
};

const resolveSignalReason = (signal: Signal): string =>
    signal.was_traded
        ? (signal.reason || '-')
        : (signal.rejection_reason || signal.reason || '-');

const parseTimestamp = (value?: string | null): number | null => {
    if (!value) return null;
    let normalized = value.trim().replace(" ", "T");
    if (normalized.endsWith("+00:00")) {
        normalized = normalized.replace("+00:00", "Z");
    }
    if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)) {
        normalized = `${normalized}Z`;
    }
    const ts = Date.parse(normalized);
    return Number.isNaN(ts) ? null : ts;
};

const sortByTimestampDesc = (
    left?: string | null,
    right?: string | null
): number => {
    const leftTs = parseTimestamp(left) ?? 0;
    const rightTs = parseTimestamp(right) ?? 0;
    return rightTs - leftTs;
};

const uniqueByKey = <T,>(items: T[], keyFn: (item: T) => string): T[] => {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const item of items) {
        const key = keyFn(item);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(item);
    }
    return out;
};

const uniqueRunIds = (values: Array<string | null | undefined>): string[] =>
    Array.from(
        new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))
    );

const netUsdFromTrade = (trade: CanonicalTrade): number | null => {
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

const netPipsFromTrade = (trade: CanonicalTrade): number | null =>
    trade.net_pips_used ?? trade.pnl_net_pips ?? trade.pnl_pips ?? null;

const PROTECTION_ACK_TIMEOUT_MS_DEFAULT = 5000;
const DATABASE_RUNS_CACHE_TTL_MS = 90_000;
const DATABASE_SNAPSHOT_CACHE_TTL_MS = 45_000;
const DATABASE_PANEL_PREVIEW_LIMIT = 100;

interface DatabaseRunsCacheEntry {
    runs: Run[];
    tfRuns: Run[];
    cachedAt: number;
}

interface DatabaseRunSnapshot {
    signals: Signal[];
    shocks: Shock[];
    trades: CanonicalTrade[];
    signalStats: SignalStats | null;
    shockStats: ShockStats | null;
    cachedAt: number;
}

const databaseRunListsCache = {
    entry: null as DatabaseRunsCacheEntry | null,
    inflight: null as Promise<DatabaseRunsCacheEntry> | null,
};

const databaseRunSnapshotCache = new Map<string, DatabaseRunSnapshot>();
const databaseRunSnapshotInflight = new Map<string, Promise<DatabaseRunSnapshot>>();
const databaseRunStrategyCache = new Map<string, string>();

const sortRunsByTrades = (items: Run[]): Run[] =>
    [...items].sort((a, b) => (b.trades_count ?? 0) - (a.trades_count ?? 0));

const isHotCacheFresh = (cachedAt: number, ttlMs: number): boolean =>
    Date.now() - cachedAt <= ttlMs;

function buildDatabaseSnapshotKey(
    runId: string | null | undefined,
    strategyId: string | null | undefined,
    commissionView: 'reported' | 'economic',
): string | null {
    if (!runId) return null;
    return `${runId}::${strategyId ?? 'all'}::${commissionView}`;
}

function readDatabaseRunsCache(): DatabaseRunsCacheEntry | null {
    return databaseRunListsCache.entry;
}

function readDatabaseRunSnapshot(
    cacheKey: string | null
): DatabaseRunSnapshot | null {
    if (!cacheKey) return null;
    return databaseRunSnapshotCache.get(cacheKey) ?? null;
}

async function fetchDatabaseRunsLists(
    force = false
): Promise<DatabaseRunsCacheEntry> {
    const cached = databaseRunListsCache.entry;
    if (
        !force &&
        cached &&
        isHotCacheFresh(cached.cachedAt, DATABASE_RUNS_CACHE_TTL_MS)
    ) {
        return cached;
    }
    if (!force && databaseRunListsCache.inflight) {
        return databaseRunListsCache.inflight;
    }

    const request = Promise.all([
        canonicalApi.listRuns({
            strategy: 'damping_wave',
            limit: 50,
        }),
        canonicalApi.listRuns({
            strategy: 'tf_pullback_v1',
            limit: 50,
        }),
    ])
        .then(([dwRunsRes, tfRunsRes]) => {
            const nextEntry: DatabaseRunsCacheEntry = {
                runs: sortRunsByTrades(dwRunsRes.runs),
                tfRuns: sortRunsByTrades(tfRunsRes.runs),
                cachedAt: Date.now(),
            };
            databaseRunListsCache.entry = nextEntry;
            return nextEntry;
        })
        .finally(() => {
            databaseRunListsCache.inflight = null;
        });

    databaseRunListsCache.inflight = request;
    return request;
}

async function fetchDatabaseRunSnapshot(
    runId: string,
    strategyId: string | null | undefined,
    commissionView: 'reported' | 'economic',
    force = false
): Promise<DatabaseRunSnapshot> {
    let resolvedStrategyId = strategyId ?? null;
    if (!resolvedStrategyId) {
        const cachedStrategy = databaseRunStrategyCache.get(runId);
        if (cachedStrategy) {
            resolvedStrategyId = cachedStrategy;
        } else {
            const run = await canonicalApi.getRun(runId);
            resolvedStrategyId = run.strategy ?? null;
            if (resolvedStrategyId) {
                databaseRunStrategyCache.set(runId, resolvedStrategyId);
            }
        }
    }
    if (!resolvedStrategyId) {
        return {
            signals: [],
            shocks: [],
            trades: [],
            signalStats: null,
            shockStats: null,
            cachedAt: Date.now(),
        };
    }

    const cacheKey = buildDatabaseSnapshotKey(runId, resolvedStrategyId, commissionView);
    if (!cacheKey) {
        throw new Error('Missing database snapshot cache key');
    }
    const cached = readDatabaseRunSnapshot(cacheKey);
    if (
        !force &&
        cached &&
        isHotCacheFresh(cached.cachedAt, DATABASE_SNAPSHOT_CACHE_TTL_MS)
    ) {
        return cached;
    }
    const inflight = databaseRunSnapshotInflight.get(cacheKey);
    if (!force && inflight) {
        return inflight;
    }

    const request = Promise.all([
        canonicalApi.listSignals(runId, {
            limit: DATABASE_PANEL_PREVIEW_LIMIT,
            strategyId: resolvedStrategyId,
        }),
        canonicalApi.listShocks(runId, {
            limit: DATABASE_PANEL_PREVIEW_LIMIT,
            strategyId: resolvedStrategyId,
        }),
        canonicalApi.getTrades(runId, DATABASE_PANEL_PREVIEW_LIMIT, {
            strategyId: resolvedStrategyId,
            commissionView,
        }),
        canonicalApi.getSignalStats(runId, resolvedStrategyId),
        canonicalApi.getShockStats(runId, resolvedStrategyId),
    ])
        .then(([signalsRes, shocksRes, tradesRes, signalStats, shockStats]) => {
            const nextEntry: DatabaseRunSnapshot = {
                signals: signalsRes.signals,
                shocks: shocksRes.shocks,
                trades: tradesRes.trades,
                signalStats,
                shockStats,
                cachedAt: Date.now(),
            };
            databaseRunSnapshotCache.set(cacheKey, nextEntry);
            return nextEntry;
        })
        .finally(() => {
            databaseRunSnapshotInflight.delete(cacheKey);
        });

    databaseRunSnapshotInflight.set(cacheKey, request);
    return request;
}

export async function prewarmDatabasePanel(options?: {
    runId?: string | null;
    strategyId?: string | null;
    commissionView?: 'reported' | 'economic';
}): Promise<void> {
    const tasks: Promise<unknown>[] = [fetchDatabaseRunsLists()];
    if (options?.runId) {
        tasks.push(
            fetchDatabaseRunSnapshot(
                options.runId,
                options.strategyId ?? null,
                options.commissionView ?? 'reported'
            )
        );
    }
    await Promise.allSettled(tasks);
}

// =============================================================================
// Run Verdict Panel
// =============================================================================

function RunVerdictPanel({
    run,
    signalStats,
    shockStats
}: {
    run: Run;
    signalStats: SignalStats | null;
    shockStats: ShockStats | null;
}) {
    const formatDuration = (startTs: string, endTs: string | null) => {
        const start = new Date(startTs);
        const end = endTs ? new Date(endTs) : new Date();
        const diffMs = end.getTime() - start.getTime();
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${minutes}min`;
    };

    const statusColor = run.status === 'running'
        ? 'text-emerald-400'
        : run.status === 'closed'
            ? 'text-blue-400'
            : 'text-red-400';

    const rejectionPct = signalStats && signalStats.total_signals > 0
        ? ((signalStats.total_signals - signalStats.traded_signals) / signalStats.total_signals * 100)
        : 0;

    return (
        <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4">
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-xs uppercase tracking-wider text-neutral-400">RUN STATUS</div>
                        <div className="mt-1 flex items-center gap-2">
                            <span className={`text-2xl font-bold uppercase ${statusColor}`}>
                                {run.status}
                            </span>
                            {run.status === 'running' && (
                                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
                            )}
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-neutral-400">Source</div>
                        <div className="text-sm font-semibold uppercase text-white">{run.source}</div>
                    </div>
                </div>

                <div className="h-px bg-white/10" />

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4">
                    <div>
                        <div className="text-xs text-neutral-400">Signals</div>
                        <div className="text-xl font-bold text-blue-400">
                            {signalStats?.total_signals ?? 0}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs text-neutral-400">Traded</div>
                        <div className="text-xl font-bold text-emerald-400">
                            {signalStats?.traded_signals ?? 0}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs text-neutral-400">Rejected</div>
                        <div className="text-xl font-bold text-amber-400">
                            {rejectionPct.toFixed(1)}%
                        </div>
                    </div>
                </div>

                <div className="h-px bg-white/10" />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-xs">
                    <div>
                        <span className="text-neutral-400">Duration:</span>{' '}
                        <span className="font-semibold text-white">
                            {formatDuration(run.start_ts, run.end_ts)}
                        </span>
                    </div>
                    <div>
                        <span className="text-neutral-400">Shocks:</span>{' '}
                        <span className="font-semibold text-white">
                            {shockStats?.total_shocks ?? 0}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// Integrity Check Panel - V4 Enhanced with 5 Strict Rules
// =============================================================================

interface IntegrityCheck {
    id: string;
    label: string;
    status: 'pass' | 'warn' | 'fail';
    value: string;
    detail?: string;
}

function IntegrityCheckPanel({
    runId,
    run,
    signalStats,
    shockStats,
    signals,
    shocks,
    trades,
}: {
    runId: string | null;
    run: Run | null;
    signalStats: SignalStats | null;
    shockStats: ShockStats | null;
    signals: Signal[];
    shocks: Shock[];
    trades: CanonicalTrade[];
}) {
    // Build 5 strict checks
    const checks: IntegrityCheck[] = [];

    // 1. Run ID Present
    checks.push({
        id: 'run_id',
        label: 'Run ID Present',
        status: runId ? 'pass' : 'fail',
        value: runId ? `${runId.slice(0, 8)}...` : 'MISSING',
        detail: runId ? undefined : 'No run selected - select a run to view data',
    });

    // 2. All signals belong to this run (no phantom signals)
    const signalsMatch = signals.every(s => s.run_id === runId);
    const signalMismatchCount = signals.filter(s => s.run_id !== runId).length;
    checks.push({
        id: 'signals_run_match',
        label: 'Signals Run Match',
        status: signalsMatch ? 'pass' : 'fail',
        value: signalsMatch ? `${signals.length} signals` : `${signalMismatchCount} mismatch`,
        detail: signalsMatch ? undefined : `${signalMismatchCount} signals have different run_id`,
    });

    // 3. All shocks belong to this run
    const shocksMatch = shocks.every(s => s.run_id === runId);
    const shockMismatchCount = shocks.filter(s => s.run_id !== runId).length;
    checks.push({
        id: 'shocks_run_match',
        label: 'Shocks Run Match',
        status: shocksMatch ? 'pass' : 'fail',
        value: shocksMatch ? `${shocks.length} shocks` : `${shockMismatchCount} mismatch`,
        detail: shocksMatch ? undefined : `${shockMismatchCount} shocks have different run_id`,
    });

    // 4. Stats loaded (data may be paginated so we can't compare counts directly)
    // When data is paginated (limit applied), loaded count will be < total_stats
    // This is expected behavior, not a drift
    const DISPLAY_LIMIT = 100; // Must match the limit used in fetchRunData
    const signalsLoaded = signals.length;
    const shocksLoaded = shocks.length;
    const signalsTruncated = signalStats !== null && signalStats.total_signals > DISPLAY_LIMIT;
    const shocksTruncated = shockStats !== null && shockStats.total_shocks > DISPLAY_LIMIT;

    // Stats are consistent if:
    // - Stats are loaded AND
    // - Either counts match OR data is truncated (loaded == limit && total > limit)
    const signalsOk = signalStats !== null && (
        Math.abs(signalStats.total_signals - signalsLoaded) < 5 ||
        (signalsTruncated && signalsLoaded === DISPLAY_LIMIT)
    );
    const shocksOk = shockStats !== null && (
        Math.abs(shockStats.total_shocks - shocksLoaded) < 5 ||
        (shocksTruncated && shocksLoaded === DISPLAY_LIMIT)
    );
    const statsConsistent = signalsOk && shocksOk;

    // Build detail message
    let statsDetail: string | undefined;
    if (!statsConsistent) {
        statsDetail = `Stats: ${signalStats?.total_signals ?? 0} signals, ${shockStats?.total_shocks ?? 0} shocks. Loaded: ${signalsLoaded} signals, ${shocksLoaded} shocks`;
    } else if (signalsTruncated || shocksTruncated) {
        statsDetail = `Showing ${signalsLoaded}/${signalStats?.total_signals ?? 0} signals, ${shocksLoaded}/${shockStats?.total_shocks ?? 0} shocks (paginated)`;
    }

    checks.push({
        id: 'stats_consistent',
        label: 'Stats Loaded',
        status: statsConsistent ? 'pass' : 'warn',
        value: statsConsistent ? (signalsTruncated || shocksTruncated ? 'PAGINATED' : 'OK') : 'DRIFT',
        detail: statsDetail,
    });

    // 5. Data within run window (if run has end_ts)
    let dataInWindow = true;
    let outOfWindowDetail = '';
    if (run?.start_ts) {
        let runStart = parseTimestamp(run.start_ts);
        let runEnd = run.end_ts ? parseTimestamp(run.end_ts) : Date.now();

        const signalsOutOfWindow = signals.filter(s => {
            const ts = parseTimestamp(s.timestamp);
            if (ts == null || runStart == null || runEnd == null) return false;
            return ts < runStart || ts > runEnd;
        });
        const shocksOutOfWindow = shocks.filter(s => {
            const ts = parseTimestamp(s.timestamp);
            if (ts == null || runStart == null || runEnd == null) return false;
            return ts < runStart || ts > runEnd;
        });

        if (signalsOutOfWindow.length > 0 || shocksOutOfWindow.length > 0) {
            dataInWindow = false;
            outOfWindowDetail = `${signalsOutOfWindow.length} signals, ${shocksOutOfWindow.length} shocks outside run window`;
        }
    }
    checks.push({
        id: 'data_in_window',
        label: 'Data in Run Window',
        status: dataInWindow ? 'pass' : 'warn',
        value: dataInWindow ? 'OK' : 'OUT OF RANGE',
        detail: outOfWindowDetail || undefined,
    });

    const passCount = checks.filter(c => c.status === 'pass').length;
    const failCount = checks.filter(c => c.status === 'fail').length;
    const overallStatus = failCount > 0 ? 'fail' : passCount === checks.length ? 'pass' : 'warn';

    const statusStyles = {
        pass: 'border-emerald-500/30 bg-emerald-500/5',
        warn: 'border-amber-500/30 bg-amber-500/5',
        fail: 'border-red-500/30 bg-red-500/5',
    };

    const statusIcon = {
        pass: <CheckCircle className="h-4 w-4 text-emerald-500" />,
        warn: <AlertTriangle className="h-4 w-4 text-amber-500" />,
        fail: <XCircle className="h-4 w-4 text-red-500" />,
    };

    const statusText = {
        pass: { color: 'text-emerald-400', label: 'ALL PASS' },
        warn: { color: 'text-amber-400', label: 'WARNINGS' },
        fail: { color: 'text-red-400', label: 'FAILURES' },
    };

    return (
        <div className={`rounded-lg border p-4 ${statusStyles[overallStatus]}`}>
            <div className="flex items-center gap-2 mb-3">
                {statusIcon[overallStatus]}
                <span className={`text-sm font-medium ${statusText[overallStatus].color}`}>
                    Integrity Check: {statusText[overallStatus].label} ({passCount}/{checks.length})
                </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {checks.map((check) => (
                    <div
                        key={check.id}
                        className={`rounded p-2 ${check.status === 'pass' ? 'bg-emerald-500/10' :
                            check.status === 'warn' ? 'bg-amber-500/10' : 'bg-red-500/10'
                            }`}
                    >
                        <div className="flex items-center gap-1.5 mb-1">
                            <div className={`h-2 w-2 rounded-full ${check.status === 'pass' ? 'bg-emerald-500' :
                                check.status === 'warn' ? 'bg-amber-500' : 'bg-red-500'
                                }`}></div>
                            <span className="text-xs text-neutral-400">{check.label}</span>
                        </div>
                        <div className="text-xs font-medium text-white">{check.value}</div>
                        {check.detail && (
                            <div className="text-[10px] text-neutral-500 mt-1">{check.detail}</div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

// =============================================================================
// Signals Table
// =============================================================================

function SignalsTable({
    signals,
    loading,
    expanded,
    capped,
    onToggle,
}: {
    signals: Signal[];
    loading: boolean;
    expanded: boolean;
    capped: boolean;
    onToggle: () => void;
}) {
    const [filter, setFilter] = useState<'all' | 'accepted' | 'rejected'>('all');

    const filteredSignals = signals.filter(s => {
        if (filter === 'accepted') return s.accepted;
        if (filter === 'rejected') return !s.accepted;
        return true;
    });

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <button
                    type="button"
                    onClick={onToggle}
                    className="text-sm font-medium text-white flex items-center gap-2 hover:text-blue-200"
                >
                    <SignalIcon className="h-4 w-4 text-blue-400" />
                    Signals ({signals.length})
                </button>
                <div className="flex gap-1 items-center">
                    {(['all', 'accepted', 'rejected'] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-2 py-1 text-xs rounded ${filter === f
                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                : 'bg-neutral-800 text-neutral-400 border border-transparent hover:border-neutral-600'
                                }`}
                        >
                            {f}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={onToggle}
                        className="ml-1 px-2 py-1 text-xs rounded border border-neutral-600 text-neutral-300 hover:text-white"
                    >
                        {expanded ? "Réduire" : "Tout le run"}
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-4 text-neutral-400">Loading...</div>
            ) : filteredSignals.length === 0 ? (
                <div className="text-center py-4 text-neutral-500">No signals found</div>
            ) : (
                <div className={`overflow-x-auto overflow-y-auto ${expanded ? "max-h-[70vh]" : "max-h-64"}`}>
                    <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-neutral-900">
                            <tr className="border-b border-neutral-700">
                                <th className="text-left py-2 px-2 text-neutral-400">Time</th>
                                <th className="text-left py-2 px-2 text-neutral-400">Strategy</th>
                                <th className="text-left py-2 px-2 text-neutral-400">Direction</th>
                                <th className="text-left py-2 px-2 text-neutral-400">Type</th>
                                <th className="text-right py-2 px-2 text-neutral-400">Z-Score</th>
                                <th className="text-left py-2 px-2 text-neutral-400">Traded</th>
                                <th className="text-left py-2 px-2 text-neutral-400">Reason</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredSignals.map((sig) => (
                                <tr key={sig.signal_id} className="border-b border-neutral-800 hover:bg-neutral-800/50">
                                    <td className="py-1.5 px-2 text-neutral-300 font-mono">
                                        {formatTime(sig.timestamp, "UTC")} UTC
                                    </td>
                                    <td className="py-1.5 px-2">
                                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                                            {sig.strategy || 'unknown'}
                                        </span>
                                    </td>
                                    <td className="py-1.5 px-2">
                                        <span className={`px-1.5 py-0.5 rounded text-xs ${sig.direction === 'BUY' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                            }`}>
                                            {sig.direction}
                                        </span>
                                    </td>
                                    <td className="py-1.5 px-2 text-neutral-400">{sig.signal_type}</td>
                                    <td className="py-1.5 px-2 text-right font-mono text-white">
                                        {sig.z_score?.toFixed(2) ?? '-'}
                                    </td>
                                    <td className="py-1.5 px-2">
                                        {sig.was_traded ? (
                                            <span className="text-emerald-400">Yes</span>
                                        ) : (
                                            <span className="text-amber-400">No</span>
                                        )}
                                    </td>
                                    <td className="py-1.5 px-2 text-neutral-500 truncate max-w-32">
                                        <div className="flex items-center gap-1.5">
                                            {isExtremeSignal(sig) && (
                                                <span className="px-1 py-0.5 rounded text-[9px] border border-amber-500/40 bg-amber-500/10 text-amber-200">
                                                    EXT
                                                </span>
                                            )}
                                            <span className="truncate">
                                                {resolveSignalReason(sig)}
                                            </span>
                                        </div>
                                        {isExtremeSignal(sig) && getExtremeState(sig) && (
                                            <div className="text-[10px] text-amber-300 mt-0.5">
                                                {getExtremeState(sig)}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {expanded && capped && (
                <div className="text-[10px] text-neutral-500">
                    Limite d&apos;affichage atteinte (capped).
                </div>
            )}
        </div>
    );
}

// =============================================================================
// S2 Signals Table (signals_s2.sqlite)
// =============================================================================

function resolveS2Reason(signal: ApiSignal): string {
    return signal.reason || signal.rejection_reason || signal.signal_type || '-';
}

function resolveS2Status(signal: ApiSignal): {
    label: string;
    className: string;
} {
    const reason = resolveS2Reason(signal).toUpperCase();
    if (signal.accepted) {
        return { label: 'ACCEPT', className: 'bg-emerald-500/20 text-emerald-300' };
    }
    if (reason.includes('WARMUP')) {
        return { label: 'WARMUP', className: 'bg-slate-500/20 text-slate-300' };
    }
    return { label: 'REJECT', className: 'bg-amber-500/20 text-amber-300' };
}

function S2SignalsTable({
    signals,
    loading,
    onRefresh,
}: {
    signals: ApiSignal[];
    loading: boolean;
    onRefresh: () => void;
}) {
    const [filter, setFilter] = useState<'all' | 'accepted' | 'rejected'>('all');

    const filteredSignals = signals.filter(s => {
        if (filter === 'accepted') return s.accepted;
        if (filter === 'rejected') return !s.accepted;
        return true;
    });

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <SignalIcon className="h-4 w-4 text-cyan-400" />
                    <span className="text-sm font-medium text-white">
                        S2 Signals ({signals.length})
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {(['all', 'accepted', 'rejected'] as const).map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-2 py-1 text-xs rounded ${filter === f
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                : 'bg-neutral-800 text-neutral-400 border border-transparent hover:border-neutral-600'
                                }`}
                        >
                            {f}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={onRefresh}
                        className="px-2 py-1 text-xs rounded border border-neutral-600 text-neutral-300 hover:text-white"
                    >
                        Refresh
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-4 text-neutral-400">Loading...</div>
            ) : filteredSignals.length === 0 ? (
                <div className="text-center py-4 text-neutral-500">No S2 signals found</div>
            ) : (
                <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
                    <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-neutral-900">
                            <tr className="border-b border-neutral-700">
                                <th className="text-left py-2 px-2 text-neutral-400">Time</th>
                                <th className="text-left py-2 px-2 text-neutral-400">Pair</th>
                                <th className="text-left py-2 px-2 text-neutral-400">Status</th>
                                <th className="text-left py-2 px-2 text-neutral-400">Direction</th>
                                <th className="text-left py-2 px-2 text-neutral-400">Type</th>
                                <th className="text-right py-2 px-2 text-neutral-400">Z-Score</th>
                                <th className="text-left py-2 px-2 text-neutral-400">Reason</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredSignals.map((sig, idx) => {
                                const status = resolveS2Status(sig);
                                return (
                                    <tr key={`${sig.signal_id ?? sig.timestamp}-${idx}`} className="border-b border-neutral-800 hover:bg-neutral-800/50">
                                        <td className="py-1.5 px-2 text-neutral-300 font-mono">
                                            {formatTime(sig.timestamp, "UTC")} UTC
                                        </td>
                                        <td className="py-1.5 px-2 text-neutral-400">
                                            {sig.symbol || '—'}
                                        </td>
                                        <td className="py-1.5 px-2">
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${status.className}`}>
                                                {status.label}
                                            </span>
                                        </td>
                                        <td className="py-1.5 px-2">
                                            <span className={`px-1.5 py-0.5 rounded text-xs ${sig.direction === 'BUY' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                                }`}>
                                                {sig.direction || '—'}
                                            </span>
                                        </td>
                                        <td className="py-1.5 px-2 text-neutral-400">
                                            {sig.signal_type || '-'}
                                        </td>
                                        <td className="py-1.5 px-2 text-right font-mono text-white">
                                            {sig.z_score?.toFixed(2) ?? '-'}
                                        </td>
                                        <td className="py-1.5 px-2 text-neutral-500 truncate max-w-40">
                                            {resolveS2Reason(sig)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// =============================================================================
// Shocks Table
// =============================================================================

function ShocksTable({
    shocks,
    loading,
    expanded,
    capped,
    onToggle,
}: {
    shocks: Shock[];
    loading: boolean;
    expanded: boolean;
    capped: boolean;
    onToggle: () => void;
}) {
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <button
                    type="button"
                    onClick={onToggle}
                    className="text-sm font-medium text-white flex items-center gap-2 hover:text-purple-200"
                >
                    <Zap className="h-4 w-4 text-purple-400" />
                    Shocks ({shocks.length})
                </button>
                <button
                    type="button"
                    onClick={onToggle}
                    className="px-2 py-1 text-xs rounded border border-neutral-600 text-neutral-300 hover:text-white"
                >
                    {expanded ? "Réduire" : "Tout le run"}
                </button>
            </div>
            <div className="text-[10px] text-neutral-500">
                Shocks are observation-only (not strategy-specific).
            </div>

            {loading ? (
                <div className="text-center py-4 text-neutral-400">Loading...</div>
            ) : shocks.length === 0 ? (
                <div className="text-center py-4 text-neutral-500">No shocks found</div>
            ) : (
                <div className={`overflow-x-auto overflow-y-auto ${expanded ? "max-h-[70vh]" : "max-h-64"}`}>
                    <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-neutral-900">
                            <tr className="border-b border-neutral-700">
                                <th className="text-left py-2 px-2 text-neutral-400">Time</th>
                                <th className="text-left py-2 px-2 text-neutral-400">Direction</th>
                                <th className="text-right py-2 px-2 text-neutral-400">Magnitude</th>
                                <th className="text-left py-2 px-2 text-neutral-400">Traded</th>
                                <th className="text-left py-2 px-2 text-neutral-400">Regime</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shocks.map((shock) => (
                                <tr key={shock.shock_id} className="border-b border-neutral-800 hover:bg-neutral-800/50">
                                    <td className="py-1.5 px-2 text-neutral-300 font-mono">
                                        {formatTime(shock.timestamp, "UTC")} UTC
                                    </td>
                                    <td className="py-1.5 px-2">
                                        <span className={`px-1.5 py-0.5 rounded text-xs ${shock.direction === 'UP' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                            }`}>
                                            {shock.direction}
                                        </span>
                                    </td>
                                    <td className="py-1.5 px-2 text-right font-mono text-white">
                                        {shock.magnitude_pips?.toFixed(1)} pips
                                    </td>
                                    <td className="py-1.5 px-2">
                                        {shock.was_traded ? (
                                            <span className="text-emerald-400">Yes</span>
                                        ) : (
                                            <span className="text-neutral-500">No</span>
                                        )}
                                    </td>
                                    <td className="py-1.5 px-2 text-neutral-400">
                                        {shock.volatility_regime || '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {expanded && capped && (
                <div className="text-[10px] text-neutral-500">
                    Limite d&apos;affichage atteinte (capped).
                </div>
            )}
        </div>
    );
}

// =============================================================================
// Trades Table
// =============================================================================

function CanonicalTradesTable({
    trades,
    loading,
    expanded,
    capped,
    onToggle,
}: {
    trades: CanonicalTrade[];
    loading: boolean;
    expanded: boolean;
    capped: boolean;
    onToggle: () => void;
}) {
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <button
                    type="button"
                    onClick={onToggle}
                    className="text-sm font-medium text-white flex items-center gap-2 hover:text-emerald-200"
                >
                    <Activity className="h-4 w-4 text-emerald-400" />
                    Trades ({trades.length})
                </button>
                <button
                    type="button"
                    onClick={onToggle}
                    className="px-2 py-1 text-xs rounded border border-neutral-600 text-neutral-300 hover:text-white"
                >
                    {expanded ? "Réduire" : "Tout le run"}
                </button>
            </div>

            {loading ? (
                <div className="text-center py-4 text-neutral-400">Loading...</div>
            ) : trades.length === 0 ? (
                <div className="text-center py-4 text-neutral-500">No trades found</div>
            ) : (
                <div className={`overflow-x-auto overflow-y-auto ${expanded ? "max-h-[70vh]" : "max-h-64"}`}>
                    <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-neutral-900">
                            <tr className="border-b border-neutral-700">
                                <th className="text-left py-2 px-2 text-neutral-400">Entry</th>
                                <th className="text-left py-2 px-2 text-neutral-400">Strategy</th>
                                <th className="text-left py-2 px-2 text-neutral-400">Side</th>
                                <th className="text-right py-2 px-2 text-neutral-400">Qty</th>
                                <th className="text-right py-2 px-2 text-neutral-400">PnL</th>
                                <th className="text-left py-2 px-2 text-neutral-400">Exit</th>
                                <th className="text-left py-2 px-2 text-neutral-400">Protection</th>
                                <th className="text-left py-2 px-2 text-neutral-400">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {trades.map((trade) => {
                                const pnlValue = netUsdFromTrade(trade);
                                const pnlPips = netPipsFromTrade(trade);
                                const pnlClass =
                                    pnlValue == null ? 'text-neutral-500' : pnlValue >= 0 ? 'text-green-400' : 'text-red-400';
                                const pnlLabel =
                                    pnlValue == null ? 'n/a' : `${pnlValue >= 0 ? '+' : ''}${pnlValue.toFixed(2)} USD`;
                                const exitReason = (trade.exit_reason || 'n/a').toUpperCase();
                                const isProtectionTimeoutExit = exitReason === 'PROTECTION_ACK_TIMEOUT';
                                const scaleOutDone = Number(trade.scale_out_done ?? 0) > 0;
                                const replaceCount = Number(trade.protection_replace_count ?? 0);
                                const protectionLastTs = parseTimestamp(trade.protection_last_ts);
                                const protectionAckTs = parseTimestamp(trade.protection_last_ack_ts);
                                const ackLatencyMs =
                                    protectionLastTs != null && protectionAckTs != null
                                        ? Math.max(0, protectionAckTs - protectionLastTs)
                                        : null;
                                const ackPending =
                                    replaceCount > 0 &&
                                    protectionLastTs != null &&
                                    protectionAckTs == null;
                                const ackPendingAgeMs =
                                    ackPending && protectionLastTs != null
                                        ? Math.max(0, Date.now() - protectionLastTs)
                                        : null;
                                const ackTimeoutRisk =
                                    ackPendingAgeMs != null &&
                                    ackPendingAgeMs > PROTECTION_ACK_TIMEOUT_MS_DEFAULT;
                                return (
                                    <tr key={trade.canonical_id} className="border-b border-neutral-800 hover:bg-neutral-800/50">
                                        <td className="py-1.5 px-2 text-neutral-300 font-mono">
                                            {formatTime(trade.entry_time, "UTC")} UTC
                                        </td>
                                        <td className="py-1.5 px-2">
                                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                                                {trade.strategy_id || 'unknown'}
                                            </span>
                                        </td>
                                        <td className="py-1.5 px-2">
                                            <span className={`px-1.5 py-0.5 rounded text-xs ${trade.side === 'BUY' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                                }`}>
                                                {trade.side}
                                            </span>
                                        </td>
                                        <td className="py-1.5 px-2 text-right font-mono text-white">
                                            {trade.qty ?? '—'}
                                        </td>
                                        <td className={`py-1.5 px-2 text-right font-mono ${pnlClass}`}>
                                            <div>{pnlLabel}</div>
                                            <div className="text-[10px] text-neutral-500">
                                                {pnlPips == null ? 'n/a' : `${pnlPips >= 0 ? '+' : ''}${pnlPips.toFixed(2)}p`}
                                            </div>
                                        </td>
                                        <td className="py-1.5 px-2">
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] border ${isProtectionTimeoutExit
                                                ? 'bg-red-500/20 text-red-300 border-red-500/30'
                                                : 'bg-neutral-700/40 text-neutral-200 border-neutral-600/60'
                                                }`}>
                                                {exitReason}
                                            </span>
                                        </td>
                                        <td className="py-1.5 px-2 text-[10px] space-y-1">
                                            <div className="flex flex-wrap gap-1">
                                                {scaleOutDone && (
                                                    <span className="px-1.5 py-0.5 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
                                                        SCALE-OUT
                                                    </span>
                                                )}
                                                {replaceCount > 0 && (
                                                    <span className="px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-300">
                                                        REARM x{replaceCount}
                                                    </span>
                                                )}
                                                {!scaleOutDone && replaceCount === 0 && (
                                                    <span className="text-neutral-500">-</span>
                                                )}
                                            </div>
                                            {replaceCount > 0 && (
                                                <div className="text-neutral-400">
                                                    {trade.protection_last_reason || 'n/a'}
                                                </div>
                                            )}
                                            {replaceCount > 0 && (
                                                <div>
                                                    {ackLatencyMs != null ? (
                                                        <span className="text-emerald-400">
                                                            ACK {Math.round(ackLatencyMs)}ms
                                                        </span>
                                                    ) : ackPending ? (
                                                        <span className={ackTimeoutRisk ? 'text-red-400' : 'text-amber-400'}>
                                                            {ackTimeoutRisk ? 'ACK TIMEOUT RISK' : 'ACK PENDING'}
                                                        </span>
                                                    ) : (
                                                        <span className="text-neutral-500">ACK n/a</span>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-1.5 px-2">
                                            <span className={`px-1.5 py-0.5 rounded text-xs ${trade.status === 'CLOSED' ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'
                                                }`}>
                                                {trade.status}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            {expanded && capped && (
                <div className="text-[10px] text-neutral-500">
                    Limite d&apos;affichage atteinte (capped).
                </div>
            )}
        </div>
    );
}

// =============================================================================
// Main Database Panel - V5: Global Context Binding
// =============================================================================

export function DatabasePanelCanonical() {
    // V5: Use global run context instead of local state
    const {
        run: globalRun,
        loading: globalLoading,
        selectedRunId: globalSelectedRunId,
        activeRunId,
        isOverridden,
        selectRun,
        resetToActiveRun,
    } = useRunContext();
    const {
        enabled: bundleEnabled,
        dwRunId,
        s2RunId,
        tfRunId,
        setDwRunId,
        setS2RunId,
        setTfRunId,
    } = useBundleRuns();
    const { commissionView } = useCommissionView();
    const {
        currentEpoch,
        selectedEpoch: selectedPortfolioEpoch,
        epochStartedAt,
    } = usePortfolioEpochContext();
    const selectedRunIdHint = bundleEnabled ? dwRunId : globalSelectedRunId;
    const selectedStrategyHint = bundleEnabled
        ? 'damping_wave'
        : globalRun?.strategy_id ?? null;
    const selectedS3RunIdHint = bundleEnabled
        ? tfRunId && tfRunId !== selectedRunIdHint && tfRunId !== s2RunId
            ? tfRunId
            : null
        : tfRunId ?? (
            globalRun?.strategy_id === 'tf_pullback_v1' ? globalSelectedRunId : null
        );
    const selectedS3StrategyHint =
        selectedS3RunIdHint != null
            ? 'tf_pullback_v1'
            : bundleEnabled
                ? 'tf_pullback_v1'
                : globalRun?.strategy_id === 'tf_pullback_v1'
                    ? 'tf_pullback_v1'
                    : null;
    const cachedRuns = readDatabaseRunsCache();
    const cachedS1Snapshot = readDatabaseRunSnapshot(
        buildDatabaseSnapshotKey(
            selectedRunIdHint,
            selectedStrategyHint,
            commissionView,
        )
    );
    const cachedS3Snapshot = readDatabaseRunSnapshot(
        buildDatabaseSnapshotKey(
            selectedS3RunIdHint,
            selectedS3StrategyHint,
            commissionView,
        )
    );

    // Local state for data (signals, shocks, trades) - loaded based on global run_id
    const [runs, setRuns] = useState<Run[]>(() => cachedRuns?.runs ?? []);
    const [tfRuns, setTfRuns] = useState<Run[]>(() => cachedRuns?.tfRuns ?? []);
    const [s2Runs, setS2Runs] = useState<S2Run[]>([]);
    const [s2RunIdsFallback, setS2RunIdsFallback] = useState<string[]>([]);
    const [signals, setSignals] = useState<Signal[]>(() => cachedS1Snapshot?.signals ?? []);
    const [shocks, setShocks] = useState<Shock[]>(() => cachedS1Snapshot?.shocks ?? []);
    const [trades, setTrades] = useState<CanonicalTrade[]>(() => cachedS1Snapshot?.trades ?? []);
    const [signalsFull, setSignalsFull] = useState<Signal[]>([]);
    const [shocksFull, setShocksFull] = useState<Shock[]>([]);
    const [tradesFull, setTradesFull] = useState<CanonicalTrade[]>([]);
    const [fullLoading, setFullLoading] = useState<{
        signals: boolean;
        shocks: boolean;
        trades: boolean;
    }>({ signals: false, shocks: false, trades: false });
    const [fullCapped, setFullCapped] = useState<{
        signals: boolean;
        shocks: boolean;
        trades: boolean;
    }>({ signals: false, shocks: false, trades: false });
    const [loading, setLoading] = useState(() => !cachedRuns);
    const [refreshing, setRefreshing] = useState(false);
    const [activeSection, setActiveSection] = useState<'s1' | 's2' | 's3'>('s1');
    const [showResearchStatus, setShowResearchStatus] = useState(false);
    const [sweepStatus, setSweepStatus] = useState<StatusV2 | null>(null);
    const [sweepError, setSweepError] = useState<string | null>(null);
    const [exportScope, setExportScope] = useState<ExportScopeOption>('RUN');
    const [exportDate, setExportDate] = useState<string>(() => formatDateInput(new Date()));
    const [exportFromDate, setExportFromDate] = useState<string>(() => dateNDaysAgo(-6));
    const [exportToDate, setExportToDate] = useState<string>(() => formatDateInput(new Date()));
    const [exporting, setExporting] = useState(false);
    const [expanded, setExpanded] = useState<{
        signals: boolean;
        shocks: boolean;
        trades: boolean;
    }>({ signals: false, shocks: false, trades: false });

    const [s2Signals, setS2Signals] = useState<ApiSignal[]>([]);
    const [s2Summary, setS2Summary] = useState<S2Summary | null>(null);
    const [s2Loading, setS2Loading] = useState(false);
    const [s2Error, setS2Error] = useState<string | null>(null);
    const [s2Exporting, setS2Exporting] = useState(false);
    const [s2ExportLimit, setS2ExportLimit] = useState(1000);

    const MAX_FULL_SIGNALS = 10000;
    const MAX_FULL_SHOCKS = 10000;
    const MAX_FULL_TRADES = 5000;
    const FULL_PAGE_LIMIT = 1000;
    const [runSignalStats, setRunSignalStats] = useState<SignalStats | null>(() => cachedS1Snapshot?.signalStats ?? null);
    const [runShockStats, setRunShockStats] = useState<ShockStats | null>(() => cachedS1Snapshot?.shockStats ?? null);
    const [tfSignals, setTfSignals] = useState<Signal[]>(() => cachedS3Snapshot?.signals ?? []);
    const [tfShocks, setTfShocks] = useState<Shock[]>(() => cachedS3Snapshot?.shocks ?? []);
    const [tfTrades, setTfTrades] = useState<CanonicalTrade[]>(() => cachedS3Snapshot?.trades ?? []);
    const [tfRefreshing, setTfRefreshing] = useState(false);
    const [tfRunSignalStats, setTfRunSignalStats] = useState<SignalStats | null>(() => cachedS3Snapshot?.signalStats ?? null);
    const [tfRunShockStats, setTfRunShockStats] = useState<ShockStats | null>(() => cachedS3Snapshot?.shockStats ?? null);
    const s1LoadRequestRef = useRef(0);
    const s3LoadRequestRef = useRef(0);

    // Use global run_id - this is THE source of truth
    const selectedRunId = bundleEnabled ? dwRunId : globalSelectedRunId;
    const selectedRun = runs.find(r => r.run_id === selectedRunId) || null;
    const selectedStrategy =
        selectedRun?.strategy ??
        (bundleEnabled ? "damping_wave" : globalRun?.strategy_id ?? null);
    const selectedRunInList =
        !!selectedRunId && runs.some((r) => r.run_id === selectedRunId);
    const selectedS3RunId = bundleEnabled
        ? tfRunId && tfRunId !== selectedRunId && tfRunId !== s2RunId
            ? tfRunId
            : null
        : tfRunId ?? (globalRun?.strategy_id === "tf_pullback_v1" ? globalSelectedRunId : null);
    const selectedS3Run = tfRuns.find((r) => r.run_id === selectedS3RunId) || null;
    const selectedS3Strategy =
        selectedS3Run?.strategy ??
        (selectedS3RunId ? "tf_pullback_v1" : bundleEnabled ? "tf_pullback_v1" : globalRun?.strategy_id === "tf_pullback_v1" ? "tf_pullback_v1" : null);
    const selectedS3RunInList =
        !!selectedS3RunId && tfRuns.some((r) => r.run_id === selectedS3RunId);
    const canonicalActiveStrategy =
        activeSection === "s3" ? selectedS3Strategy : selectedStrategy;
    const canonicalActiveRunId =
        activeSection === "s3" ? selectedS3RunId : selectedRunId;
    const canonicalRunsForSection = activeSection === "s3" ? tfRuns : runs;
    const canonicalSignalStats =
        activeSection === "s3" ? tfRunSignalStats : runSignalStats;
    const canonicalShockStats =
        activeSection === "s3" ? tfRunShockStats : runShockStats;
    const s2RunIdEffective = bundleEnabled
        ? s2RunId && s2RunId !== selectedRunId
            ? s2RunId
            : null
        : s2RunId ?? (globalRun?.strategy_id === "s2_pairs_trading" ? globalSelectedRunId : null);
    const s2RunIds =
        s2Runs.length > 0
            ? s2Runs.map((r) => r.run_id)
            : s2RunIdsFallback;
    const normalizeStrategy = (value: string | null | undefined): string => {
        if (!value) return '';
        return value.toLowerCase().replace(/[^a-z0-9]/g, '');
    };
    const isStrategyMatch = (
        value: string | null | undefined,
        expected: string | null | undefined
    ): boolean => {
        if (!expected) return true;
        if (!value) return true;
        const normValue = normalizeStrategy(value);
        const normExpected = normalizeStrategy(expected);
        return (
            normValue === normExpected ||
            normValue.startsWith(normExpected) ||
            normExpected.startsWith(normValue)
        );
    };
    const filterSignalsByStrategy = (items: Signal[]) => {
        if (!selectedStrategy) return items;
        return items.filter((s) => isStrategyMatch(s.strategy, selectedStrategy));
    };
    const filterTradesByStrategy = (items: CanonicalTrade[]) => {
        if (!selectedStrategy) return items;
        return items.filter((t) => isStrategyMatch(t.strategy_id, selectedStrategy));
    };
    const signalsSource = expanded.signals
        ? (signalsFull.length ? signalsFull : signals)
        : signals;
    const shocksView = expanded.shocks
        ? (shocksFull.length ? shocksFull : shocks)
        : shocks;
    const tradesSource = expanded.trades
        ? (tradesFull.length ? tradesFull : trades)
        : trades;
    const filteredSignals = filterSignalsByStrategy(signalsSource);
    const filteredTrades = filterTradesByStrategy(tradesSource);
    const signalMismatchCount = selectedStrategy
        ? signalsSource.filter(s => !isStrategyMatch(s.strategy, selectedStrategy)).length
        : 0;
    const tradeMismatchCount = selectedStrategy
        ? tradesSource.filter(t => !isStrategyMatch(t.strategy_id, selectedStrategy)).length
        : 0;
    const fallbackSignals =
        filteredSignals.length === 0 && signalsSource.length > 0
            ? signalsSource
            : filteredSignals;
    const fallbackTrades =
        filteredTrades.length === 0 && tradesSource.length > 0
            ? tradesSource
            : filteredTrades;
    const strategyFilterBypassed =
        (filteredSignals.length === 0 && signalsSource.length > 0) ||
        (filteredTrades.length === 0 && tradesSource.length > 0);
    const filterSignalsByExpectedStrategy = (
        items: Signal[],
        expectedStrategy: string | null
    ): Signal[] => {
        if (!expectedStrategy) return items;
        return items.filter((s) => isStrategyMatch(s.strategy, expectedStrategy));
    };
    const filterTradesByExpectedStrategy = (
        items: CanonicalTrade[],
        expectedStrategy: string | null
    ): CanonicalTrade[] => {
        if (!expectedStrategy) return items;
        return items.filter((t) => isStrategyMatch(t.strategy_id, expectedStrategy));
    };
    const s3FilteredSignals = filterSignalsByExpectedStrategy(tfSignals, selectedS3Strategy);
    const s3FilteredTrades = filterTradesByExpectedStrategy(tfTrades, selectedS3Strategy);

    // Initial load - just fetch runs list
    useEffect(() => {
        void loadRunsList();
    }, [activeRunId]);

    // Load data when global run_id changes
    useEffect(() => {
        if (selectedRunId && selectedStrategy) {
            void loadRunData(selectedRunId, selectedStrategy);
        } else if (!selectedRunId) {
            // Clear data when no run selected
            setSignals([]);
            setShocks([]);
            setTrades([]);
            setRunSignalStats(null);
            setRunShockStats(null);
            setSignalsFull([]);
            setShocksFull([]);
            setTradesFull([]);
            setFullCapped({ signals: false, shocks: false, trades: false });
            setExpanded({ signals: false, shocks: false, trades: false });
        }
    }, [selectedRunId, selectedStrategy, commissionView]);

    const resolveRunWindow = (
        run: { start_ts?: string; end_ts?: string | null } | null
    ): { start: string; end: string } | null => {
        if (!run?.start_ts) return null;
        return {
            start: run.start_ts,
            end: run.end_ts ?? new Date().toISOString(),
        };
    };

    const fetchAllSignals = async (
        runId: string,
        window: { start: string; end: string },
        strategyId: string
    ) => {
        let cursor = window.end;
        const collected: Signal[] = [];
        let capped = false;
        while (cursor && collected.length < MAX_FULL_SIGNALS) {
            const res = await canonicalApi.listSignals(runId, {
                limit: FULL_PAGE_LIMIT,
                from_ts: window.start,
                to_ts: cursor,
                order: "desc",
                strategyId,
            });
            const batch = res.signals ?? [];
            if (!batch.length) break;
            collected.push(...batch);
            if (batch.length < FULL_PAGE_LIMIT) break;
            const oldest = batch[batch.length - 1]?.timestamp;
            if (!oldest) break;
            const nextCursor = new Date(Date.parse(oldest) - 1).toISOString();
            cursor = nextCursor;
        }
        if (collected.length >= MAX_FULL_SIGNALS) capped = true;
        return { items: collected.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)), capped };
    };

    const fetchAllShocks = async (
        runId: string,
        window: { start: string; end: string },
        strategyId: string
    ) => {
        let cursor = window.end;
        const collected: Shock[] = [];
        let capped = false;
        while (cursor && collected.length < MAX_FULL_SHOCKS) {
            const res = await canonicalApi.listShocks(runId, {
                limit: FULL_PAGE_LIMIT,
                from_ts: window.start,
                to_ts: cursor,
                order: "desc",
                strategyId,
            });
            const batch = res.shocks ?? [];
            if (!batch.length) break;
            collected.push(...batch);
            if (batch.length < FULL_PAGE_LIMIT) break;
            const oldest = batch[batch.length - 1]?.timestamp;
            if (!oldest) break;
            const nextCursor = new Date(Date.parse(oldest) - 1).toISOString();
            cursor = nextCursor;
        }
        if (collected.length >= MAX_FULL_SHOCKS) capped = true;
        return { items: collected.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)), capped };
    };

    const fetchAllTrades = async (
        runId: string,
        window: { start: string; end: string },
        strategyId: string
    ) => {
        const toDate = (ts: string) => ts.slice(0, 10);
        const res = await canonicalApi.getTradesByDate({
            runId,
            scope: "RANGE",
            fromDate: toDate(window.start),
            toDate: toDate(window.end),
            limit: MAX_FULL_TRADES,
            commissionView,
            strategyId,
        });
        const items = res.trades ?? [];
        const capped = items.length >= MAX_FULL_TRADES;
        return { items, capped };
    };

    const loadFullSection = async (section: "signals" | "shocks" | "trades") => {
        if (!selectedRunId || !selectedStrategy) return;
        const window = resolveRunWindow(selectedRun ?? globalRun);
        if (!window) return;
        setFullLoading((prev) => ({ ...prev, [section]: true }));
        try {
            if (section === "signals") {
                const res = await fetchAllSignals(selectedRunId, window, selectedStrategy);
                setSignalsFull(res.items);
                setFullCapped((prev) => ({ ...prev, signals: res.capped }));
            } else if (section === "shocks") {
                const res = await fetchAllShocks(selectedRunId, window, selectedStrategy);
                setShocksFull(res.items);
                setFullCapped((prev) => ({ ...prev, shocks: res.capped }));
            } else {
                const res = await fetchAllTrades(selectedRunId, window, selectedStrategy);
                setTradesFull(res.items);
                setFullCapped((prev) => ({ ...prev, trades: res.capped }));
            }
        } finally {
            setFullLoading((prev) => ({ ...prev, [section]: false }));
        }
    };

    const loadRunsList = async (force = false) => {
        const cached = readDatabaseRunsCache();
        setLoading(!cached);
        try {
            const nextEntry = await fetchDatabaseRunsLists(force);
            setRuns(nextEntry.runs);
            setTfRuns(nextEntry.tfRuns);
        } catch (e) {
            console.error('Failed to load runs:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let cancelled = false;
        api
            .getS2Runs(50)
            .then((res) => {
                if (!cancelled) setS2Runs(res.runs || []);
            })
            .catch(() => {
                if (!cancelled) setS2Runs([]);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        if (s2Runs.length) return;
        api
            .getS2Signals(200, { ...activeContext, run_id: "" })
            .then((signals) => {
                if (cancelled) return;
                const runs = Array.from(
                    new Set(
                        signals
                            .map((s) => (typeof s.run_id === "string" ? s.run_id : null))
                            .filter((id): id is string => !!id)
                    )
                );
                setS2RunIdsFallback(runs);
            })
            .catch(() => {
                if (!cancelled) setS2RunIdsFallback([]);
            });
        return () => {
            cancelled = true;
        };
    }, [s2Runs.length]);

    const loadSweepStatus = useCallback(async () => {
        try {
            const status = await fetchStatusV2('DAY');
            setSweepStatus(status);
            setSweepError(null);
        } catch (e: any) {
            setSweepError(e?.message || 'Failed to load sweep db status');
            setSweepStatus(null);
        }
    }, []);

    useEffect(() => {
        loadSweepStatus();
    }, [loadSweepStatus]);

    const applyS1Snapshot = (snapshot: DatabaseRunSnapshot) => {
        setSignals(snapshot.signals);
        setShocks(snapshot.shocks);
        setTrades(snapshot.trades);
        setRunSignalStats(snapshot.signalStats);
        setRunShockStats(snapshot.shockStats);
    };

    const applyS3Snapshot = (snapshot: DatabaseRunSnapshot) => {
        setTfSignals(snapshot.signals);
        setTfShocks(snapshot.shocks);
        setTfTrades(snapshot.trades);
        setTfRunSignalStats(snapshot.signalStats);
        setTfRunShockStats(snapshot.shockStats);
    };

    const loadRunData = async (
        runId: string,
        strategyId: string | null,
        options?: { force?: boolean }
    ) => {
        const requestId = ++s1LoadRequestRef.current;
        const cacheKey = buildDatabaseSnapshotKey(runId, strategyId, commissionView);
        const cached = readDatabaseRunSnapshot(cacheKey);
        if (cached) {
            applyS1Snapshot(cached);
        } else {
            setSignals([]);
            setShocks([]);
            setTrades([]);
            setRunSignalStats(null);
            setRunShockStats(null);
        }
        setRefreshing(Boolean(options?.force) || !cached);
        setSignalsFull([]);
        setShocksFull([]);
        setTradesFull([]);
        setFullCapped({ signals: false, shocks: false, trades: false });
        setExpanded({ signals: false, shocks: false, trades: false });
        try {
            if (!strategyId) {
                console.error("Missing strategy for selected run");
                return;
            }
            const snapshot = await fetchDatabaseRunSnapshot(
                runId,
                strategyId,
                commissionView,
                Boolean(options?.force)
            );
            if (requestId !== s1LoadRequestRef.current) {
                return;
            }
            applyS1Snapshot(snapshot);
        } catch (e) {
            console.error('Failed to load run data:', e);
        } finally {
            if (requestId === s1LoadRequestRef.current) {
                setRefreshing(false);
            }
        }
    };

    const handleRefresh = () => {
        if (selectedRunId && selectedStrategy) {
            void loadRunData(selectedRunId, selectedStrategy, { force: true });
        }
    };

    useEffect(() => {
        if (selectedS3RunId && selectedS3Strategy) {
            void loadS3RunData(selectedS3RunId, selectedS3Strategy);
        } else if (!selectedS3RunId) {
            setTfSignals([]);
            setTfShocks([]);
            setTfTrades([]);
            setTfRunSignalStats(null);
            setTfRunShockStats(null);
        }
    }, [selectedS3RunId, selectedS3Strategy, commissionView]);

    const loadS3RunData = async (
        runId: string,
        strategyId: string | null,
        options?: { force?: boolean }
    ) => {
        const requestId = ++s3LoadRequestRef.current;
        const cacheKey = buildDatabaseSnapshotKey(runId, strategyId, commissionView);
        const cached = readDatabaseRunSnapshot(cacheKey);
        if (cached) {
            applyS3Snapshot(cached);
        } else {
            setTfSignals([]);
            setTfShocks([]);
            setTfTrades([]);
            setTfRunSignalStats(null);
            setTfRunShockStats(null);
        }
        setTfRefreshing(Boolean(options?.force) || !cached);
        try {
            if (!strategyId) {
                return;
            }
            const snapshot = await fetchDatabaseRunSnapshot(
                runId,
                strategyId,
                commissionView,
                Boolean(options?.force)
            );
            if (requestId !== s3LoadRequestRef.current) {
                return;
            }
            applyS3Snapshot(snapshot);
        } catch (e) {
            console.error('Failed to load S3 run data:', e);
        } finally {
            if (requestId === s3LoadRequestRef.current) {
                setTfRefreshing(false);
            }
        }
    };

    const handleS3Refresh = () => {
        if (selectedS3RunId && selectedS3Strategy) {
            void loadS3RunData(selectedS3RunId, selectedS3Strategy, { force: true });
        }
    };

    const loadS2Data = useCallback(async () => {
        const effectiveS2RunId = s2RunIdEffective;
        if (bundleEnabled && !s2RunIdEffective) {
            setS2Signals([]);
            setS2Summary(null);
            setS2Loading(false);
            setS2Error("Bundle S2 : sélectionnez un run S2.");
            return;
        }
        if (!effectiveS2RunId) {
            setS2Signals([]);
            setS2Summary(null);
            setS2Loading(false);
            setS2Error("S2 observe-only: sélectionnez un run S2.");
            return;
        }
        setS2Loading(true);
        setS2Error(null);
        try {
            const ctx = {
                ...activeContext,
                run_id: effectiveS2RunId,
                strategy_id: "s2_pairs_trading",
            };
            const results = await Promise.allSettled([
                api.getS2Summary(ctx),
                api.getS2Signals(300, ctx),
            ]);
            const [summaryRes, signalsRes] = results;
            setS2Summary(summaryRes.status === 'fulfilled' ? summaryRes.value : null);
            setS2Signals(signalsRes.status === 'fulfilled' ? signalsRes.value : []);
            if (results.every(r => r.status === 'rejected')) {
                setS2Error('S2 data unavailable');
            }
        } catch (e: any) {
            setS2Error(e?.message || 'S2 load failed');
        } finally {
            setS2Loading(false);
        }
    }, [bundleEnabled, s2RunIdEffective]);

    useEffect(() => {
        if (!bundleEnabled && activeSection !== 's2') return;
        loadS2Data();
    }, [activeSection, bundleEnabled, loadS2Data]);

    const toggleSection = async (section: "signals" | "shocks" | "trades") => {
        const next = !expanded[section];
        setExpanded((prev) => ({ ...prev, [section]: next }));
        if (next) {
            if (section === "signals" && signalsFull.length === 0) {
                await loadFullSection("signals");
            } else if (section === "shocks" && shocksFull.length === 0) {
                await loadFullSection("shocks");
            } else if (section === "trades" && tradesFull.length === 0) {
                await loadFullSection("trades");
            }
        }
    };

    // V5: Handle run selection - updates GLOBAL context
    const handleRunSelect = async (runId: string | null) => {
        if (runId) {
            if (bundleEnabled) {
                setDwRunId(runId);
            }
            await selectRun(runId);
        }
    };

    const handleS2RunSelect = (runId: string | null) => {
        setS2RunId(runId);
        if (bundleEnabled && runId && runId === selectedRunId) {
            setS2Error("DW et S2 doivent être distincts. Sélectionnez un run S2.");
        } else {
            setS2Error(null);
        }
    };

    const handleS3RunSelect = (runId: string | null) => {
        setTfRunId(runId);
    };

    // =============================================================================
    // Export Functions
    // =============================================================================

    const resolveScopeParams = (): ExportScopeParams | null => {
        switch (exportScope) {
            case 'RUN':
                return canonicalActiveRunId ? { scope: 'RUN' } : null;
            case 'TODAY':
                return { scope: 'TODAY' };
            case 'YESTERDAY':
                return { scope: 'YESTERDAY' };
            case 'LAST_7D':
                return {
                    scope: 'RANGE',
                    fromDate: dateNDaysAgo(-6),
                    toDate: formatDateInput(new Date()),
                };
            case 'DATE':
                if (!exportDate) return null;
                return { scope: 'DATE', fromDate: exportDate, toDate: exportDate };
            case 'RANGE':
                if (!(exportFromDate && exportToDate)) return null;
                return {
                    scope: 'RANGE',
                    fromDate: exportFromDate,
                    toDate: exportToDate,
                };
            default:
                return null;
        }
    };

    const buildScopeSuffix = (params: ExportScopeParams): string => {
        if (params.scope === 'RUN' && canonicalActiveRunId) {
            return canonicalActiveRunId.slice(0, 8);
        }
        const from = params.fromDate || params.scope.toLowerCase();
        const to = params.toDate;
        return to && to !== from ? `${from}_${to}` : from;
    };

    const resolveEpochSource = (
        apiEpoch: number | null | undefined,
        apiEpochStartedAt: string | null | undefined
    ): "portfolio_context" | "api_meta" | "none" => {
        if (selectedPortfolioEpoch != null || currentEpoch != null || epochStartedAt) {
            return "portfolio_context";
        }
        if (apiEpoch != null || apiEpochStartedAt) {
            return "api_meta";
        }
        return "none";
    };

    const buildExportMeta = (
        params: ResolvedExportScope,
        options?: {
            apiPortfolioEpoch?: number | null;
            apiEpochStartedAt?: string | null;
        }
    ) => ({
        run_id: params.restrictedToRun ? params.runIds[0] ?? null : null,
        run_ids: params.runIds,
        export_scope: params.scope,
        from_date: params.fromDate,
        to_date: params.toDate,
        restricted_to_run: params.restrictedToRun,
        exported_at: new Date().toISOString(),
        portfolio_epoch_selected: selectedPortfolioEpoch ?? null,
        portfolio_epoch_current: currentEpoch ?? null,
        epoch_started_at:
            epochStartedAt ??
            options?.apiEpochStartedAt ??
            null,
        epoch_source: resolveEpochSource(
            options?.apiPortfolioEpoch,
            options?.apiEpochStartedAt
        ),
    });

    const isNotFoundError = (error: unknown): boolean =>
        error instanceof Error && error.message.includes('HTTP 404');

    const toUtcDate = (value?: string | null): string | null => {
        const ts = parseTimestamp(value);
        if (ts == null) return null;
        return new Date(ts).toISOString().slice(0, 10);
    };

    const withEffectiveRunIds = (
        meta: ReturnType<typeof buildExportMeta>,
        runIds: Array<string | null | undefined>
    ) => {
        const effectiveRunIds = uniqueRunIds(runIds);
        if (!effectiveRunIds.length) return meta;
        return {
            ...meta,
            run_ids: effectiveRunIds,
        };
    };

    const resolveRunIdsForScope = async (
        params: ExportScopeParams
    ): Promise<ResolvedExportScope> => {
        if (!canonicalActiveStrategy) {
            throw new Error("strategy_id required for export");
        }

        if (params.scope === 'RUN') {
            if (!canonicalActiveRunId) {
                throw new Error("run_id required for scope=RUN");
            }
            return { ...params, runIds: [canonicalActiveRunId], restrictedToRun: true };
        }

        if (params.scope === 'TODAY' || params.scope === 'YESTERDAY' || params.scope === 'DATE') {
            try {
                const resolved = await canonicalApi.resolveRunScope({
                    strategyId: canonicalActiveStrategy,
                    scope: params.scope,
                    date: params.scope === 'DATE' ? params.fromDate : undefined,
                });
                const targetDate =
                    resolved.target_date ||
                    resolved.trade_date ||
                    params.fromDate ||
                    formatDateInput(new Date());
                const runsRes = await canonicalApi.listRuns({
                    strategy: canonicalActiveStrategy,
                    limit: 1000,
                });
                const todayUtc = formatDateInput(new Date());
                const runIds = Array.from(
                    new Set(
                        runsRes.runs
                            .filter((run) => {
                                const runStart = toUtcDate(run.start_ts);
                                if (!runStart) return false;
                                const runEnd = toUtcDate(run.end_ts);
                                if (runStart === targetDate) return true;
                                if (runEnd) {
                                    return runStart <= targetDate && runEnd >= targetDate;
                                }
                                // Open-ended runs are considered active only for today's scope.
                                return run.status === 'running' && targetDate === todayUtc;
                            })
                            .map((run) => run.run_id)
                    )
                );
                if (!runIds.length && resolved.run_id) {
                    runIds.push(resolved.run_id);
                }
                return { ...params, runIds, restrictedToRun: false };
            } catch (error) {
                if (isNotFoundError(error)) {
                    return { ...params, runIds: [], restrictedToRun: false };
                }
                throw error;
            }
        }

        const rangeFrom = params.fromDate;
        const rangeTo = params.toDate;
        if (!(rangeFrom && rangeTo)) {
            throw new Error("from_date/to_date required for scope=RANGE");
        }

        const runsRes = await canonicalApi.listRuns({
            strategy: canonicalActiveStrategy,
            limit: 1000,
        });
        const todayUtc = formatDateInput(new Date());
        const runIds = Array.from(
            new Set(
                runsRes.runs
                    .filter((run) => {
                        const runStart = toUtcDate(run.start_ts);
                        if (!runStart) return false;
                        const runEnd = toUtcDate(run.end_ts);
                        if (!runEnd) {
                            if (run.status === 'running') {
                                return runStart <= rangeTo && todayUtc >= rangeFrom;
                            }
                            return runStart >= rangeFrom && runStart <= rangeTo;
                        }
                        return runStart <= rangeTo && runEnd >= rangeFrom;
                    })
                    .map((run) => run.run_id)
            )
        );
        return { ...params, runIds, restrictedToRun: false };
    };

    const downloadBlob = (content: BlobPart, filename: string, mime: string) => {
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const fetchSignalsForExport = async (
        params: ResolvedExportScope
    ): Promise<{ signals: ScopedSignal[]; epoch: number | null; epochStartedAt: string | null }> => {
        if (!canonicalActiveStrategy) {
            throw new Error("strategy_id required for export");
        }
        if (!params.runIds.length) {
            return { signals: [], epoch: selectedPortfolioEpoch ?? null, epochStartedAt: epochStartedAt ?? null };
        }

        const responses = await Promise.all(
            params.runIds.map((runId) =>
                canonicalApi.listSignalsScoped({
                    scope: params.scope,
                    runId,
                    strategyId: canonicalActiveStrategy,
                    fromDate: params.fromDate,
                    toDate: params.toDate,
                    limit: EXPORT_LIMIT,
                })
            )
        );
        const merged = responses.flatMap((response) => response.signals ?? []);
        const deduped = uniqueByKey(
            merged,
            (signal) =>
                signal.signal_id ||
                `${signal.run_id}:${signal.timestamp}:${signal.symbol}:${signal.signal_type}`
        );
        const signals = deduped
            .sort((a, b) => sortByTimestampDesc(a.timestamp, b.timestamp))
            .slice(0, EXPORT_LIMIT);
        return {
            signals,
            epoch:
                responses.find((response) => response._meta?.portfolio_epoch != null)?._meta
                    ?.portfolio_epoch ??
                selectedPortfolioEpoch ??
                null,
            epochStartedAt:
                responses.find((response) => !!response._meta?.epoch_started_at)?._meta
                    ?.epoch_started_at ??
                epochStartedAt ??
                null,
        };
    };

    const fetchShocksForExport = async (
        params: ResolvedExportScope
    ): Promise<{ shocks: ScopedShock[]; epoch: number | null; epochStartedAt: string | null }> => {
        if (!canonicalActiveStrategy) {
            throw new Error("strategy_id required for export");
        }
        if (!params.runIds.length) {
            return { shocks: [], epoch: selectedPortfolioEpoch ?? null, epochStartedAt: epochStartedAt ?? null };
        }

        const responses = await Promise.all(
            params.runIds.map((runId) =>
                canonicalApi.listShocksScoped({
                    scope: params.scope,
                    runId,
                    strategyId: canonicalActiveStrategy,
                    fromDate: params.fromDate,
                    toDate: params.toDate,
                    limit: EXPORT_LIMIT,
                })
            )
        );
        const merged = responses.flatMap((response) => response.shocks ?? []);
        const deduped = uniqueByKey(
            merged,
            (shock) => shock.shock_id || `${shock.run_id}:${shock.timestamp}:${shock.symbol}`
        );
        const shocks = deduped
            .sort((a, b) => sortByTimestampDesc(a.timestamp, b.timestamp))
            .slice(0, EXPORT_LIMIT);
        return {
            shocks,
            epoch:
                responses.find((response) => response._meta?.portfolio_epoch != null)?._meta
                    ?.portfolio_epoch ??
                selectedPortfolioEpoch ??
                null,
            epochStartedAt:
                responses.find((response) => !!response._meta?.epoch_started_at)?._meta
                    ?.epoch_started_at ??
                epochStartedAt ??
                null,
        };
    };

    const fetchTradesForExport = async (
        params: ResolvedExportScope
    ): Promise<{ trades: CanonicalTrade[]; epoch: number | null; epochStartedAt: string | null }> => {
        if (!canonicalActiveStrategy) {
            throw new Error("strategy_id required for export");
        }
        if (!params.runIds.length) {
            return { trades: [], epoch: selectedPortfolioEpoch ?? null, epochStartedAt: epochStartedAt ?? null };
        }

        const responses = await Promise.all(
            params.runIds.map((runId) =>
                canonicalApi.getTradesByDate({
                    runId,
                    strategyId: canonicalActiveStrategy,
                    scope: params.scope,
                    fromDate: params.fromDate,
                    toDate: params.toDate,
                    limit: EXPORT_LIMIT,
                    commissionView,
                })
            )
        );
        const merged = responses.flatMap((response) => response.trades ?? []);
        const deduped = uniqueByKey(
            merged,
            (trade) =>
                (trade.trade_id ? `${trade.run_id || 'na'}:${trade.trade_id}` : "") ||
                `${trade.canonical_id}:${trade.run_id || 'na'}:${trade.entry_time}`
        );
        const trades = deduped
            .sort((a, b) => sortByTimestampDesc(a.exit_time || a.entry_time, b.exit_time || b.entry_time))
            .slice(0, EXPORT_LIMIT);
        return {
            trades,
            epoch:
                responses.find((response) => response._meta?.portfolio_epoch != null)?._meta
                    ?.portfolio_epoch ??
                selectedPortfolioEpoch ??
                null,
            epochStartedAt:
                responses.find((response) => !!response._meta?.epoch_started_at)?._meta
                    ?.epoch_started_at ??
                epochStartedAt ??
                null,
        };
    };

    const exportToJSON = async (dataType: 'signals' | 'shocks' | 'trades' | 'all') => {
        const scopeParams = resolveScopeParams();
        if (!scopeParams) return;
        setExporting(true);

        try {
            const resolvedScope = await resolveRunIdsForScope(scopeParams);
            const scopeSuffix = buildScopeSuffix(scopeParams);
            const runsMeta = resolvedScope.runIds
                .map((runId) => canonicalRunsForSection.find((run) => run.run_id === runId) || null)
                .filter((run): run is Run => run !== null);
            const runMeta = resolvedScope.restrictedToRun ? runsMeta[0] ?? null : null;

            if (dataType === 'signals') {
                const res = await fetchSignalsForExport(resolvedScope);
                const meta = buildExportMeta(resolvedScope, {
                    apiPortfolioEpoch: res.epoch,
                    apiEpochStartedAt: res.epochStartedAt,
                });
                const metaWithRuns = withEffectiveRunIds(
                    meta,
                    res.signals.map((signal) => signal.run_id)
                );
                downloadBlob(
                    JSON.stringify({ ...metaWithRuns, signals: res.signals }, null, 2),
                    `signals_${scopeSuffix}.json`,
                    'application/json'
                );
                return;
            }

            if (dataType === 'shocks') {
                const res = await fetchShocksForExport(resolvedScope);
                const meta = buildExportMeta(resolvedScope, {
                    apiPortfolioEpoch: res.epoch,
                    apiEpochStartedAt: res.epochStartedAt,
                });
                const metaWithRuns = withEffectiveRunIds(
                    meta,
                    res.shocks.map((shock) => shock.run_id)
                );
                downloadBlob(
                    JSON.stringify({ ...metaWithRuns, shocks: res.shocks }, null, 2),
                    `shocks_${scopeSuffix}.json`,
                    'application/json'
                );
                return;
            }

            if (dataType === 'trades') {
                const res = await fetchTradesForExport(resolvedScope);
                const meta = buildExportMeta(resolvedScope, {
                    apiPortfolioEpoch: res.epoch,
                    apiEpochStartedAt: res.epochStartedAt,
                });
                const metaWithRuns = withEffectiveRunIds(
                    meta,
                    res.trades.map((trade) => trade.run_id)
                );
                downloadBlob(
                    JSON.stringify({ ...metaWithRuns, trades: res.trades }, null, 2),
                    `trades_${scopeSuffix}.json`,
                    'application/json'
                );
                return;
            }

            const [sigRes, shkRes, tradeRes] = await Promise.all([
                fetchSignalsForExport(resolvedScope),
                fetchShocksForExport(resolvedScope),
                fetchTradesForExport(resolvedScope),
            ]);
            const meta = buildExportMeta(resolvedScope, {
                apiPortfolioEpoch:
                    sigRes.epoch ??
                    shkRes.epoch ??
                    tradeRes.epoch ??
                    null,
                apiEpochStartedAt:
                    sigRes.epochStartedAt ??
                    shkRes.epochStartedAt ??
                    tradeRes.epochStartedAt ??
                    null,
            });
            const metaWithRuns = withEffectiveRunIds(meta, [
                ...sigRes.signals.map((signal) => signal.run_id),
                ...shkRes.shocks.map((shock) => shock.run_id),
                ...tradeRes.trades.map((trade) => trade.run_id),
            ]);

            downloadBlob(
                JSON.stringify(
                    {
                        ...metaWithRuns,
                        run: runMeta,
                        runs: runsMeta,
                        signal_stats: resolvedScope.restrictedToRun ? canonicalSignalStats : null,
                        shock_stats: resolvedScope.restrictedToRun ? canonicalShockStats : null,
                        signals: sigRes.signals,
                        shocks: shkRes.shocks,
                        trades: tradeRes.trades,
                    },
                    null,
                    2
                ),
                `canonical_export_${scopeSuffix}.json`,
                'application/json'
            );
        } catch (e) {
            console.error('Export JSON failed', e);
        } finally {
            setExporting(false);
        }
    };

    const exportToCSV = async (dataType: 'signals' | 'shocks' | 'trades') => {
        const scopeParams = resolveScopeParams();
        if (!scopeParams) return;
        setExporting(true);

        const esc = (val: unknown) => {
            if (val === null || val === undefined) return '';
            return `"${String(val).replace(/"/g, '""')}"`;
        };

        try {
            const resolvedScope = await resolveRunIdsForScope(scopeParams);
            const scopeSuffix = buildScopeSuffix(scopeParams);

            if (dataType === 'signals') {
                const res = await fetchSignalsForExport(resolvedScope);
                const csv = [
                    'signal_id,run_id,timestamp,direction,signal_type,z_score,accepted,was_traded,trade_id,final_pnl_pips,rejection_reason,portfolio_epoch',
                    ...res.signals.map(s =>
                        [
                            esc(s.signal_id),
                            esc(s.run_id),
                            esc(s.timestamp),
                            esc(s.direction),
                            esc(s.signal_type),
                            s.z_score ?? '',
                            s.accepted,
                            s.was_traded,
                            esc(s.trade_id),
                            s.final_pnl_pips ?? '',
                            esc(s.rejection_reason),
                            s.portfolio_epoch ?? selectedPortfolioEpoch ?? '',
                        ].join(',')
                    ),
                ].join('\n');
                downloadBlob(csv, `signals_${scopeSuffix}.csv`, 'text/csv;charset=utf-8;');
                return;
            }

            if (dataType === 'shocks') {
                const res = await fetchShocksForExport(resolvedScope);
                const csv = [
                    'shock_id,run_id,timestamp,direction,magnitude_pips,magnitude_pct,was_traded,volatility_regime,signal_id,trade_outcome,portfolio_epoch',
                    ...res.shocks.map(s =>
                        [
                            esc(s.shock_id),
                            esc(s.run_id),
                            esc(s.timestamp),
                            esc(s.direction),
                            s.magnitude_pips ?? '',
                            s.magnitude_pct ?? '',
                            s.was_traded,
                            esc(s.volatility_regime),
                            esc(s.signal_id),
                            esc(s.trade_outcome),
                            '',
                        ].join(',')
                    ),
                ].join('\n');
                downloadBlob(csv, `shocks_${scopeSuffix}.csv`, 'text/csv;charset=utf-8;');
                return;
            }

            const res = await fetchTradesForExport(resolvedScope);
            const csv = [
                'canonical_id,trade_id,run_id,symbol,side,qty,entry_price,exit_price,pnl,pnl_net_usd,pnl_net_eur,pnl_net_pips,status,entry_time,exit_time,exit_reason,scale_out_done,scale_out_qty,scale_out_price,scale_out_ts,scale_out_reason,protection_replace_count,protection_last_reason,protection_last_ts,protection_last_ack_ts,protection_last_old_tp_id,protection_last_old_sl_id,protection_last_new_tp_id,protection_last_new_sl_id,portfolio_epoch',
                ...res.trades.map(t =>
                    [
                        t.canonical_id,
                        esc(t.trade_id),
                        esc(t.run_id || ''),
                        esc(t.symbol),
                        esc(t.side),
                        t.qty ?? '',
                        t.entry_price ?? '',
                        t.exit_price ?? '',
                        t.pnl ?? '',
                        t.pnl_net_usd ?? '',
                        t.pnl_net_eur ?? '',
                        t.net_pips_used ?? t.pnl_net_pips ?? t.pnl_pips ?? '',
                        esc(t.status),
                        esc(t.entry_time),
                        esc(t.exit_time),
                        esc(t.exit_reason),
                        t.scale_out_done == null ? '' : Number(t.scale_out_done ? 1 : 0),
                        t.scale_out_qty ?? '',
                        t.scale_out_price ?? '',
                        esc(t.scale_out_ts),
                        esc(t.scale_out_reason),
                        t.protection_replace_count ?? '',
                        esc(t.protection_last_reason),
                        esc(t.protection_last_ts),
                        esc(t.protection_last_ack_ts),
                        esc(t.protection_last_old_tp_id),
                        esc(t.protection_last_old_sl_id),
                        esc(t.protection_last_new_tp_id),
                        esc(t.protection_last_new_sl_id),
                        t.portfolio_epoch ?? selectedPortfolioEpoch ?? '',
                    ].join(',')
                ),
            ].join('\n');
            downloadBlob(csv, `trades_${scopeSuffix}.csv`, 'text/csv;charset=utf-8;');
        } catch (e) {
            console.error('Export CSV failed', e);
        } finally {
            setExporting(false);
        }
    };

    const buildS2ExportMeta = (runId: string, limit: number) => ({
        run_id: runId,
        strategy: "s2_pairs_trading",
        pair_key: s2Summary?.pair_key ?? null,
        exported_at: new Date().toISOString(),
        limit,
        portfolio_epoch_selected: selectedPortfolioEpoch ?? null,
        portfolio_epoch_current: currentEpoch ?? null,
        epoch_started_at: epochStartedAt ?? null,
        epoch_source: resolveEpochSource(undefined, undefined),
        note: "S2 exports expose signals only; shocks/trades are empty.",
    });

    const filterS2Signals = (
        signals: ApiSignal[],
        runId: string
    ): { filtered: ApiSignal[]; filteredOut: number } => {
        const expectedPair = s2Summary?.pair_key ?? null;
        const filtered = signals.filter((s) => {
            const signalRunId =
                typeof (s as { run_id?: unknown }).run_id === "string"
                    ? (s as { run_id: string }).run_id
                    : null;
            if (signalRunId && signalRunId !== runId) return false;
            if (expectedPair && s.symbol && s.symbol !== expectedPair) return false;
            return true;
        });
        return { filtered, filteredOut: signals.length - filtered.length };
    };

    const exportS2ToJSON = async (
        dataType: 'signals' | 'shocks' | 'trades' | 'all'
    ) => {
        const effectiveS2RunId = s2RunIdEffective;
        if (!effectiveS2RunId) {
            setS2Error("S2 observe-only: sélectionnez un run S2.");
            return;
        }
        setS2Exporting(true);
        const limit = Math.min(Math.max(s2ExportLimit, 50), 2000);
        const ctx = {
            ...activeContext,
            run_id: effectiveS2RunId,
            strategy_id: "s2_pairs_trading",
        };
        try {
            const scopeSuffix = effectiveS2RunId.slice(0, 8);
            const metaBase = buildS2ExportMeta(effectiveS2RunId, limit);
            const rawSignals =
                dataType === "signals" || dataType === "all"
                    ? await api.getS2Signals(limit, ctx)
                    : [];
            const { filtered: signals, filteredOut } = filterS2Signals(
                rawSignals,
                effectiveS2RunId
            );
            const meta = {
                ...metaBase,
                raw_count: rawSignals.length,
                filtered_out: filteredOut,
            };

            if (dataType === "signals") {
                downloadBlob(
                    JSON.stringify({ ...meta, signals }, null, 2),
                    `s2_signals_${scopeSuffix}.json`,
                    "application/json"
                );
                return;
            }

            if (dataType === "shocks") {
                downloadBlob(
                    JSON.stringify({ ...meta, shocks: [] }, null, 2),
                    `s2_shocks_${scopeSuffix}.json`,
                    "application/json"
                );
                return;
            }

            if (dataType === "trades") {
                downloadBlob(
                    JSON.stringify({ ...meta, trades: [] }, null, 2),
                    `s2_trades_${scopeSuffix}.json`,
                    "application/json"
                );
                return;
            }

            downloadBlob(
                JSON.stringify(
                    { ...meta, signals, shocks: [], trades: [] },
                    null,
                    2
                ),
                `s2_export_${scopeSuffix}.json`,
                "application/json"
            );
        } catch (e) {
            console.error("Export S2 failed", e);
        } finally {
            setS2Exporting(false);
        }
    };

    const exportS2ToCSV = async (dataType: 'signals' | 'shocks' | 'trades') => {
        const effectiveS2RunId = s2RunIdEffective;
        if (!effectiveS2RunId) {
            setS2Error("S2 observe-only: sélectionnez un run S2.");
            return;
        }
        setS2Exporting(true);
        const limit = Math.min(Math.max(s2ExportLimit, 50), 2000);
        const ctx = {
            ...activeContext,
            run_id: effectiveS2RunId,
            strategy_id: "s2_pairs_trading",
        };
        try {
            const scopeSuffix = effectiveS2RunId.slice(0, 8);
            const esc = (val: unknown) => {
                if (val === null || val === undefined) return '';
                return `"${String(val).replace(/"/g, '""')}"`;
            };
            if (dataType === "signals") {
                const rawSignals = await api.getS2Signals(limit, ctx);
                const { filtered: signals } = filterS2Signals(
                    rawSignals,
                    effectiveS2RunId
                );
                const csv = [
                    'timestamp,run_id,pair_key,direction,signal_type,accepted,reason,why_rejected,z_score,mu,sigma,corr,beta,spread_log,spread_raw,spread_pips,gate_values,portfolio_epoch',
                    ...signals.map(s =>
                        [
                            esc(s.timestamp),
                            esc(effectiveS2RunId),
                            esc(s.symbol),
                            esc(s.direction),
                            esc(s.signal_type),
                            s.accepted ? 1 : 0,
                            esc(resolveS2Reason(s)),
                            esc(s.why_rejected ?? s.rejection_reason ?? ''),
                            s.z_score ?? '',
                            (s as { mu?: number | null }).mu ?? '',
                            (s as { sigma?: number | null }).sigma ?? '',
                            (s as { corr?: number | null }).corr ?? '',
                            (s as { beta?: number | null }).beta ?? '',
                            (s as { spread_log?: number | null }).spread_log ??
                            s.spread ??
                            '',
                            (s as { spread_raw?: number | null }).spread_raw ?? '',
                            s.spread_pips ?? '',
                            esc(
                                (s as { gate_values?: unknown }).gate_values
                                    ? JSON.stringify(
                                        (s as { gate_values?: unknown })
                                            .gate_values
                                    )
                                    : ''
                            ),
                            (s as { portfolio_epoch?: number | null }).portfolio_epoch ??
                                selectedPortfolioEpoch ??
                                '',
                        ].join(',')
                    ),
                ].join('\n');
                downloadBlob(
                    csv,
                    `s2_signals_${scopeSuffix}.csv`,
                    'text/csv;charset=utf-8;'
                );
                return;
            }

            if (dataType === "shocks") {
                const csv = [
                    'shock_id,run_id,timestamp,direction,magnitude_pips,magnitude_pct,was_traded,volatility_regime,signal_id,trade_outcome,portfolio_epoch',
                ].join('\n');
                downloadBlob(
                    csv,
                    `s2_shocks_${scopeSuffix}.csv`,
                    'text/csv;charset=utf-8;'
                );
                return;
            }

            const csv = [
                'canonical_id,trade_id,run_id,symbol,side,qty,entry_price,exit_price,pnl,pnl_net_usd,pnl_net_eur,status,entry_time,exit_time,exit_reason,portfolio_epoch',
            ].join('\n');
            downloadBlob(
                csv,
                `s2_trades_${scopeSuffix}.csv`,
                'text/csv;charset=utf-8;'
            );
        } catch (e) {
            console.error("Export S2 failed", e);
        } finally {
            setS2Exporting(false);
        }
    };

    const scopeParams = resolveScopeParams();
    const exportDisabled = exporting || !scopeParams || !canonicalActiveStrategy;
    const s2ExportDisabled = s2Exporting || !s2RunIdEffective;
    const scopeSummary = scopeParams
        ? scopeParams.scope === 'RUN'
            ? `Run ${canonicalActiveRunId?.slice(0, 8) ?? "n/a"}`
            : `${scopeParams.fromDate ?? scopeParams.scope} → ${scopeParams.toDate ?? scopeParams.scope}`
        : 'Select scope';
    const showS1 = activeSection === 's1';
    const showS2 = activeSection === 's2';
    const showS3 = activeSection === 's3';

    return (
        <div className="space-y-4">
            {/* Header with Global Context Indicator */}
            <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-xs uppercase tracking-wider text-neutral-400">DATABASE</div>
                        <div className="text-lg font-semibold text-white flex items-center gap-2">
                            Canonical Data Explorer
                            <LinkIcon className="h-4 w-4 text-emerald-400" />
                        </div>
                        <div className="text-xs text-neutral-500 mt-1">
                            Source: runs.sqlite, signals.sqlite, shocks.sqlite, canonical_trades.sqlite
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* V5: Show if overriding active run */}
                        {isOverridden && activeRunId && (
                            <button
                                onClick={() => resetToActiveRun()}
                                className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/20 flex items-center gap-2"
                                title={`Return to active run: ${activeRunId.slice(0, 8)}...`}
                            >
                                Reset to Active
                            </button>
                        )}
                        <button
                            onClick={
                                activeSection === "s2"
                                    ? loadS2Data
                                    : activeSection === "s3"
                                        ? handleS3Refresh
                                        : handleRefresh
                            }
                            disabled={
                                activeSection === "s2"
                                    ? s2Loading
                                    : activeSection === "s3"
                                        ? tfRefreshing
                                        : refreshing
                            }
                            className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-white hover:bg-white/10 flex items-center gap-2"
                        >
                            <RefreshCw
                                className={`h-3 w-3 ${
                                    activeSection === "s2"
                                        ? (s2Loading ? "animate-spin" : "")
                                        : activeSection === "s3"
                                            ? (tfRefreshing ? "animate-spin" : "")
                                            : (refreshing ? "animate-spin" : "")
                                }`}
                            />
                            Refresh
                        </button>
                    </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                    <button
                        onClick={() => setActiveSection('s1')}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${activeSection === 's1'
                            ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                            : 'bg-white/5 text-white border border-white/10 hover:border-white/20'
                            }`}
                    >
                        S1 · Damping Wave
                    </button>
                    <button
                        onClick={() => setActiveSection('s2')}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${activeSection === 's2'
                            ? 'bg-purple-500/20 text-purple-100 border border-purple-400/40'
                            : 'bg-white/5 text-white border border-white/10 hover:border-white/20'
                            }`}
                    >
                        S2 · Pairs
                    </button>
                    <button
                        onClick={() => setActiveSection('s3')}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${activeSection === 's3'
                            ? 'bg-cyan-500/20 text-cyan-100 border border-cyan-400/40'
                            : 'bg-white/5 text-white border border-white/10 hover:border-white/20'
                            }`}
                    >
                        S3 · Trend Following
                    </button>
                </div>
                <div className="mt-3">
                    <button
                        onClick={() => setShowResearchStatus((prev) => !prev)}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-neutral-300 hover:text-white"
                    >
                        {showResearchStatus ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        Research status
                    </button>
                </div>
            </div>

            {showResearchStatus && (
                <ResearchDbSection
                    sweepStatus={sweepStatus}
                    sweepError={sweepError}
                    onRefresh={loadSweepStatus}
                />
            )}

            {showS1 && (
                <>
                    {/* Run Selector - V5: Updates GLOBAL context */}
                    <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-xs text-neutral-400">SELECT RUN (DW)</div>
                            {isOverridden && (
                                <span className="text-[10px] text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                                    OVERRIDDEN
                                </span>
                            )}
                        </div>
                        {bundleEnabled && (
                            <div className="mb-2 grid gap-2 text-[11px] text-neutral-400 md:grid-cols-3">
                                <div className="rounded-md border border-white/10 bg-white/5 px-2 py-1">
                                    DW run: {selectedRunId ? selectedRunId.slice(0, 8) : "n/a"}
                                </div>
                                <div className="rounded-md border border-white/10 bg-white/5 px-2 py-1">
                                    S2 run: {s2RunIdEffective ? s2RunIdEffective.slice(0, 8) : "n/a"}
                                </div>
                                <div className="rounded-md border border-white/10 bg-white/5 px-2 py-1">
                                    S3 run: {selectedS3RunId ? selectedS3RunId.slice(0, 8) : "n/a"}
                                </div>
                            </div>
                        )}
                        {bundleEnabled && s2RunId && s2RunId === selectedRunId && (
                            <div className="text-[11px] text-amber-300">
                                DW et S2 partagent le même run_id. Sélectionnez un run S2 distinct.
                            </div>
                        )}
                        <select
                            value={selectedRunId || ''}
                            onChange={(e) => handleRunSelect(e.target.value || null)}
                            className="w-full rounded-lg border border-white/20 bg-slate-900 px-3 py-2 text-sm text-white [&>option]:bg-slate-900 [&>option]:text-white"
                            disabled={loading || globalLoading}
                        >
                            {runs.length === 0 && (
                                <option value="">No runs available</option>
                            )}
                            {!selectedRunInList && selectedRunId && (
                                <option value={selectedRunId}>
                                    {selectedRunId.slice(0, 8)} · selected
                                </option>
                            )}
                            {runs.map((r) => {
                                const trades = r.trades_count ?? 0;
                                const label = `${r.strategy} / ${r.run_id.slice(0, 8)} / ${new Date(r.start_ts).toLocaleDateString('fr-FR')} (${r.status})`;
                                return (
                                    <option key={r.run_id} value={r.run_id}>
                                        {label} · {trades} trade{trades === 1 ? '' : 's'}
                                        {r.run_id === activeRunId ? ' [ACTIVE]' : ''}
                                    </option>
                                );
                            })}
                        </select>
                    </div>

                    {/* Zero State when no run selected */}
                    {!selectedRunId && !loading && (
                        <ZeroStateDisplay
                            runId={null}
                            error={null}
                            isLoading={false}
                            dataCount={0}
                            dataType="signals"
                        />
                    )}

                    {/* Integrity Check */}
                    {selectedRunId && (
                        <IntegrityCheckPanel
                            runId={selectedRunId}
                            run={selectedRun}
                            signalStats={runSignalStats}
                            shockStats={runShockStats}
                            signals={signals}
                            shocks={shocks}
                            trades={trades}
                        />
                    )}

                    {/* Run Verdict */}
                    {selectedRun && (
                        <RunVerdictPanel
                            run={selectedRun}
                            signalStats={runSignalStats}
                            shockStats={runShockStats}
                        />
                    )}

                    {selectedRun && (
                        <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4 text-xs text-neutral-300">
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="text-neutral-400">Strategy scope</span>
                                <span className="px-2 py-0.5 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-200">
                                    {selectedStrategy || 'unknown'}
                                </span>
                                <span className="text-neutral-500">
                                    Signals and trades filtered to this strategy. Shocks are observation only.
                                </span>
                            </div>
                            {(signalMismatchCount > 0 || tradeMismatchCount > 0) && (
                                <div className="mt-2 text-[10px] text-amber-300">
                                    Hidden: {signalMismatchCount} signals, {tradeMismatchCount} trades with other strategy.
                                </div>
                            )}
                            {strategyFilterBypassed && (
                                <div className="mt-2 text-[10px] text-amber-300">
                                    Strategy mismatch detected — displaying unfiltered signals/trades.
                                </div>
                            )}
                        </div>
                    )}

                    {/* Data Tables */}
                    <div className="grid gap-4 lg:grid-cols-3">
                        {/* Signals */}
                        <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4">
                            <SignalsTable
                                signals={fallbackSignals}
                                loading={expanded.signals ? fullLoading.signals : refreshing}
                                expanded={expanded.signals}
                                capped={fullCapped.signals}
                                onToggle={() => toggleSection("signals")}
                            />
                        </div>

                        {/* Shocks */}
                        <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4">
                            <ShocksTable
                                shocks={shocksView}
                                loading={expanded.shocks ? fullLoading.shocks : refreshing}
                                expanded={expanded.shocks}
                                capped={fullCapped.shocks}
                                onToggle={() => toggleSection("shocks")}
                            />
                        </div>

                        {/* Trades */}
                        <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4">
                            <CanonicalTradesTable
                                trades={fallbackTrades}
                                loading={expanded.trades ? fullLoading.trades : refreshing}
                                expanded={expanded.trades}
                                capped={fullCapped.trades}
                                onToggle={() => toggleSection("trades")}
                            />
                        </div>
                    </div>

                    {/* Export Panel */}
                    <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Download className="h-4 w-4 text-blue-400" />
                                <span className="text-sm font-medium text-white">Export Data</span>
                                {exporting && <RefreshCw className="h-3.5 w-3.5 text-blue-300 animate-spin" />}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-300">
                                <label className="flex items-center gap-2">
                                    <span className="text-neutral-400">Scope</span>
                                    <select
                                        value={exportScope}
                                        onChange={e => setExportScope(e.target.value as ExportScopeOption)}
                                        className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-neutral-100 text-xs"
                                    >
                                        <option value="RUN">Current run</option>
                                        <option value="TODAY">Today (UTC)</option>
                                        <option value="YESTERDAY">Yesterday</option>
                                        <option value="LAST_7D">Last 7 days</option>
                                        <option value="DATE">Specific day</option>
                                        <option value="RANGE">Custom range</option>
                                    </select>
                                </label>
                                {exportScope === 'DATE' && (
                                    <input
                                        type="date"
                                        value={exportDate}
                                        onChange={e => setExportDate(e.target.value)}
                                        className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-neutral-100 text-xs"
                                    />
                                )}
                                {exportScope === 'RANGE' && (
                                    <>
                                        <input
                                            type="date"
                                            value={exportFromDate}
                                            onChange={e => setExportFromDate(e.target.value)}
                                            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-neutral-100 text-xs"
                                        />
                                        <input
                                            type="date"
                                            value={exportToDate}
                                            onChange={e => setExportToDate(e.target.value)}
                                            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-neutral-100 text-xs"
                                        />
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="text-xs text-neutral-500 mb-3">
                            {scopeSummary} · strategy {canonicalActiveStrategy || 'unknown'} · limit {EXPORT_LIMIT} rows per dataset
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {/* JSON Exports */}
                            <button
                                disabled={exportDisabled}
                                onClick={() => exportToJSON('all')}
                                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs transition-colors ${exportDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-500/20'}`}
                            >
                                <FileJson className="h-3.5 w-3.5" />
                                All (JSON)
                            </button>
                            <button
                                disabled={exportDisabled}
                                onClick={() => exportToJSON('signals')}
                                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-neutral-600 bg-neutral-800 text-neutral-300 text-xs transition-colors ${exportDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-neutral-700'}`}
                            >
                                <FileJson className="h-3.5 w-3.5" />
                                Signals JSON
                            </button>
                            <button
                                disabled={exportDisabled}
                                onClick={() => exportToJSON('shocks')}
                                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-neutral-600 bg-neutral-800 text-neutral-300 text-xs transition-colors ${exportDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-neutral-700'}`}
                            >
                                <FileJson className="h-3.5 w-3.5" />
                                Shocks JSON
                            </button>
                            <button
                                disabled={exportDisabled}
                                onClick={() => exportToJSON('trades')}
                                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-neutral-600 bg-neutral-800 text-neutral-300 text-xs transition-colors ${exportDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-neutral-700'}`}
                            >
                                <FileJson className="h-3.5 w-3.5" />
                                Trades JSON
                            </button>
                            {/* CSV Exports */}
                            <button
                                disabled={exportDisabled}
                                onClick={() => exportToCSV('signals')}
                                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs transition-colors ${exportDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-emerald-500/20'}`}
                            >
                                <FileSpreadsheet className="h-3.5 w-3.5" />
                                Signals CSV
                            </button>
                            <button
                                disabled={exportDisabled}
                                onClick={() => exportToCSV('shocks')}
                                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs transition-colors ${exportDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-emerald-500/20'}`}
                            >
                                <FileSpreadsheet className="h-3.5 w-3.5" />
                                Shocks CSV
                            </button>
                            <button
                                disabled={exportDisabled}
                                onClick={() => exportToCSV('trades')}
                                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs transition-colors ${exportDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-emerald-500/20'}`}
                            >
                                <FileSpreadsheet className="h-3.5 w-3.5" />
                                Trades CSV
                            </button>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="text-center text-xs text-neutral-500">
                        <p>
                            All data from canonical databases. Run ID: <code className="text-neutral-400">{canonicalActiveRunId?.slice(0, 12) || 'none'}</code>
                        </p>
                    </div>
                </>
            )}

            {showS3 && (
                <>
                    <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-xs text-neutral-400">SELECT RUN (S3)</div>
                        </div>
                        {bundleEnabled && (
                            <div className="mb-2 grid gap-2 text-[11px] text-neutral-400 md:grid-cols-3">
                                <div className="rounded-md border border-white/10 bg-white/5 px-2 py-1">
                                    S1 run: {selectedRunId ? selectedRunId.slice(0, 8) : "n/a"}
                                </div>
                                <div className="rounded-md border border-white/10 bg-white/5 px-2 py-1">
                                    S2 run: {s2RunIdEffective ? s2RunIdEffective.slice(0, 8) : "n/a"}
                                </div>
                                <div className="rounded-md border border-white/10 bg-white/5 px-2 py-1">
                                    S3 run: {selectedS3RunId ? selectedS3RunId.slice(0, 8) : "n/a"}
                                </div>
                            </div>
                        )}
                        <select
                            value={selectedS3RunId || ''}
                            onChange={(e) => handleS3RunSelect(e.target.value || null)}
                            className="w-full rounded-lg border border-white/20 bg-slate-900 px-3 py-2 text-sm text-white [&>option]:bg-slate-900 [&>option]:text-white"
                            disabled={loading || globalLoading}
                        >
                            {tfRuns.length === 0 && (
                                <option value="">No S3 runs available</option>
                            )}
                            {!selectedS3RunInList && selectedS3RunId && (
                                <option value={selectedS3RunId}>
                                    {selectedS3RunId.slice(0, 8)} · selected
                                </option>
                            )}
                            {tfRuns.map((r) => {
                                const tradesCount = r.trades_count ?? 0;
                                const label = `${r.strategy} / ${r.run_id.slice(0, 8)} / ${new Date(r.start_ts).toLocaleDateString('fr-FR')} (${r.status})`;
                                return (
                                    <option key={r.run_id} value={r.run_id}>
                                        {label} · {tradesCount} trade{tradesCount === 1 ? '' : 's'}
                                    </option>
                                );
                            })}
                        </select>
                    </div>

                    {!selectedS3RunId && !loading && (
                        <ZeroStateDisplay
                            runId={null}
                            error={null}
                            isLoading={false}
                            dataCount={0}
                            dataType="signals"
                        />
                    )}

                    {selectedS3RunId && selectedS3Run && (
                        <IntegrityCheckPanel
                            runId={selectedS3RunId}
                            run={selectedS3Run}
                            signalStats={tfRunSignalStats}
                            shockStats={tfRunShockStats}
                            signals={s3FilteredSignals}
                            shocks={tfShocks}
                            trades={s3FilteredTrades}
                        />
                    )}

                    {selectedS3Run && (
                        <RunVerdictPanel
                            run={selectedS3Run}
                            signalStats={tfRunSignalStats}
                            shockStats={tfRunShockStats}
                        />
                    )}

                    <div className="grid gap-4 lg:grid-cols-3">
                        <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4">
                            <SignalsTable
                                signals={s3FilteredSignals}
                                loading={tfRefreshing}
                                expanded={false}
                                capped={false}
                                onToggle={() => undefined}
                            />
                        </div>
                        <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4">
                            <ShocksTable
                                shocks={tfShocks}
                                loading={tfRefreshing}
                                expanded={false}
                                capped={false}
                                onToggle={() => undefined}
                            />
                        </div>
                        <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4">
                            <CanonicalTradesTable
                                trades={s3FilteredTrades}
                                loading={tfRefreshing}
                                expanded={false}
                                capped={false}
                                onToggle={() => undefined}
                            />
                        </div>
                    </div>

                    <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Download className="h-4 w-4 text-cyan-400" />
                                <span className="text-sm font-medium text-white">Export Data (S3)</span>
                                {exporting && <RefreshCw className="h-3.5 w-3.5 text-cyan-300 animate-spin" />}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-300">
                                <label className="flex items-center gap-2">
                                    <span className="text-neutral-400">Scope</span>
                                    <select
                                        value={exportScope}
                                        onChange={e => setExportScope(e.target.value as ExportScopeOption)}
                                        className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-neutral-100 text-xs"
                                    >
                                        <option value="RUN">Current run</option>
                                        <option value="TODAY">Today (UTC)</option>
                                        <option value="YESTERDAY">Yesterday</option>
                                        <option value="LAST_7D">Last 7 days</option>
                                        <option value="DATE">Specific day</option>
                                        <option value="RANGE">Custom range</option>
                                    </select>
                                </label>
                                {exportScope === 'DATE' && (
                                    <input
                                        type="date"
                                        value={exportDate}
                                        onChange={e => setExportDate(e.target.value)}
                                        className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-neutral-100 text-xs"
                                    />
                                )}
                                {exportScope === 'RANGE' && (
                                    <>
                                        <input
                                            type="date"
                                            value={exportFromDate}
                                            onChange={e => setExportFromDate(e.target.value)}
                                            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-neutral-100 text-xs"
                                        />
                                        <input
                                            type="date"
                                            value={exportToDate}
                                            onChange={e => setExportToDate(e.target.value)}
                                            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-neutral-100 text-xs"
                                        />
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="text-xs text-neutral-500 mb-3">
                            {scopeSummary} · strategy {canonicalActiveStrategy || 'unknown'} · limit {EXPORT_LIMIT} rows per dataset
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <button
                                disabled={exportDisabled}
                                onClick={() => exportToJSON('all')}
                                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 text-xs transition-colors ${exportDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-cyan-500/20'}`}
                            >
                                <FileJson className="h-3.5 w-3.5" />
                                All (JSON)
                            </button>
                            <button
                                disabled={exportDisabled}
                                onClick={() => exportToJSON('signals')}
                                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-neutral-600 bg-neutral-800 text-neutral-300 text-xs transition-colors ${exportDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-neutral-700'}`}
                            >
                                <FileJson className="h-3.5 w-3.5" />
                                Signals JSON
                            </button>
                            <button
                                disabled={exportDisabled}
                                onClick={() => exportToJSON('shocks')}
                                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-neutral-600 bg-neutral-800 text-neutral-300 text-xs transition-colors ${exportDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-neutral-700'}`}
                            >
                                <FileJson className="h-3.5 w-3.5" />
                                Shocks JSON
                            </button>
                            <button
                                disabled={exportDisabled}
                                onClick={() => exportToJSON('trades')}
                                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-neutral-600 bg-neutral-800 text-neutral-300 text-xs transition-colors ${exportDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-neutral-700'}`}
                            >
                                <FileJson className="h-3.5 w-3.5" />
                                Trades JSON
                            </button>
                            <button
                                disabled={exportDisabled}
                                onClick={() => exportToCSV('signals')}
                                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs transition-colors ${exportDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-emerald-500/20'}`}
                            >
                                <FileSpreadsheet className="h-3.5 w-3.5" />
                                Signals CSV
                            </button>
                            <button
                                disabled={exportDisabled}
                                onClick={() => exportToCSV('shocks')}
                                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs transition-colors ${exportDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-emerald-500/20'}`}
                            >
                                <FileSpreadsheet className="h-3.5 w-3.5" />
                                Shocks CSV
                            </button>
                            <button
                                disabled={exportDisabled}
                                onClick={() => exportToCSV('trades')}
                                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs transition-colors ${exportDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-emerald-500/20'}`}
                            >
                                <FileSpreadsheet className="h-3.5 w-3.5" />
                                Trades CSV
                            </button>
                        </div>
                    </div>

                    <div className="text-center text-xs text-neutral-500">
                        <p>
                            All data from canonical databases. Run ID: <code className="text-neutral-400">{canonicalActiveRunId?.slice(0, 12) || 'none'}</code>
                        </p>
                    </div>
                </>
            )}

            {showS2 && (
                <div className="space-y-4">
                    <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <div className="text-xs text-neutral-400">S2 PAIRS DB</div>
                                <div className="text-sm font-semibold text-white">
                                    signals_s2.sqlite (A1)
                                </div>
                            </div>
                            <button
                                onClick={loadS2Data}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-neutral-600 text-neutral-300 hover:text-white"
                                disabled={s2Loading}
                            >
                                <RefreshCw className={`h-3 w-3 ${s2Loading ? 'animate-spin' : ''}`} />
                                Refresh
                            </button>
                        </div>
                        <div className="mb-3">
                            <div className="text-[11px] text-neutral-400 mb-1">SELECT RUN (S2)</div>
                            <select
                                value={s2RunIdEffective || ''}
                                onChange={(e) => handleS2RunSelect(e.target.value || null)}
                                className="w-full rounded-lg border border-white/20 bg-slate-900 px-3 py-2 text-sm text-white [&>option]:bg-slate-900 [&>option]:text-white"
                                disabled={s2Loading}
                            >
                                {s2Runs.length === 0 && s2RunIds.length === 0 && (
                                    <option value="">No S2 runs available</option>
                                )}
                                {s2RunIdEffective && !s2RunIds.includes(s2RunIdEffective) && (
                                    <option value={s2RunIdEffective}>
                                        {s2RunIdEffective.slice(0, 8)} · selected
                                    </option>
                                )}
                                {s2Runs.length > 0
                                    ? s2Runs.map((r) => (
                                        <option key={r.run_id} value={r.run_id}>
                                            {`${r.run_id.slice(0, 8)} / ${r.start_ts ? new Date(r.start_ts).toLocaleDateString('fr-FR') : "n/a"} (${r.status ?? "n/a"})`}
                                        </option>
                                    ))
                                    : s2RunIds.map((id) => (
                                        <option key={id} value={id}>
                                            {id.slice(0, 8)}
                                        </option>
                                    ))}
                            </select>
                            {bundleEnabled && s2RunId && s2RunId === selectedRunId && (
                                <div className="mt-2 text-[11px] text-amber-300">
                                    DW et S2 partagent le même run_id. Sélectionnez un run S2 distinct.
                                </div>
                            )}
                        </div>
                        {!s2RunIdEffective && (
                            <ZeroStateDisplay
                                runId={null}
                                error="NO_RUN_ID"
                                isLoading={false}
                                dataCount={0}
                                dataType="signals"
                                compact
                            />
                        )}
                        {s2RunIdEffective && (
                            <div className="grid gap-3 md:grid-cols-3 text-xs text-neutral-300">
                                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                                    <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                                        Pair
                                    </div>
                                    <div className="mt-1 text-sm text-white">
                                        {s2Summary?.pair_key ?? '—'}
                                    </div>
                                    <div className="text-[11px] text-neutral-400">
                                        Run {s2RunIdEffective.slice(0, 8)}
                                    </div>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                                    <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                                        Warmup
                                    </div>
                                    <div className="mt-1 text-sm text-white">
                                        {s2Summary?.warmup_state ?? 'NO_DATA'}
                                    </div>
                                    <div className="text-[11px] text-neutral-400">
                                        Last {formatTime(s2Summary?.last_signal_ts, 'UTC')}
                                    </div>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                                    <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                                        Counts
                                    </div>
                                    <div className="mt-1 text-sm text-white">
                                        {s2Summary?.counts?.total ?? 0} total
                                    </div>
                                    <div className="text-[11px] text-neutral-400">
                                        {s2Summary?.counts?.accepted ?? 0} accepted ·{' '}
                                        {s2Summary?.counts?.rejected ?? 0} rejected ·{' '}
                                        {s2Summary?.counts?.warmup ?? 0} warmup
                                    </div>
                                </div>
                            </div>
                        )}
                        {s2Error && (
                            <div className="mt-2 text-[11px] text-red-300">{s2Error}</div>
                        )}
                    </div>

                    {s2RunIdEffective && (
                        <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4">
                            <S2SignalsTable
                                signals={s2Signals}
                                loading={s2Loading}
                                onRefresh={loadS2Data}
                            />
                        </div>
                    )}

                    {s2RunIdEffective && (
                        <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4">
                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Download className="h-4 w-4 text-purple-400" />
                                    <span className="text-sm font-medium text-white">Export S2</span>
                                    {s2Exporting && <RefreshCw className="h-3.5 w-3.5 text-purple-300 animate-spin" />}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-neutral-300">
                                    <label className="flex items-center gap-2">
                                        <span className="text-neutral-400">Limit</span>
                                        <input
                                            type="number"
                                            min={50}
                                            max={2000}
                                            value={s2ExportLimit}
                                            onChange={(e) => {
                                                const next = Number(e.target.value);
                                                setS2ExportLimit(Number.isFinite(next) ? next : 1000);
                                            }}
                                            className="w-24 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-neutral-100 text-xs"
                                        />
                                    </label>
                                    <span className="text-neutral-500">
                                        run {s2RunIdEffective.slice(0, 8)}
                                    </span>
                                </div>
                            </div>
                            <div className="text-xs text-neutral-500 mb-3">
                                Export S2 scoped to selected run · limit {Math.min(Math.max(s2ExportLimit, 50), 2000)}
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                <button
                                    disabled={s2ExportDisabled}
                                    onClick={() => exportS2ToJSON('all')}
                                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-300 text-xs transition-colors ${s2ExportDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-purple-500/20'}`}
                                >
                                    <FileJson className="h-3.5 w-3.5" />
                                    All (JSON)
                                </button>
                                <button
                                    disabled={s2ExportDisabled}
                                    onClick={() => exportS2ToJSON('signals')}
                                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-neutral-600 bg-neutral-800 text-neutral-300 text-xs transition-colors ${s2ExportDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-neutral-700'}`}
                                >
                                    <FileJson className="h-3.5 w-3.5" />
                                    Signals JSON
                                </button>
                                <button
                                    disabled={s2ExportDisabled}
                                    onClick={() => exportS2ToJSON('shocks')}
                                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-neutral-600 bg-neutral-800 text-neutral-300 text-xs transition-colors ${s2ExportDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-neutral-700'}`}
                                >
                                    <FileJson className="h-3.5 w-3.5" />
                                    Shocks JSON
                                </button>
                                <button
                                    disabled={s2ExportDisabled}
                                    onClick={() => exportS2ToJSON('trades')}
                                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-neutral-600 bg-neutral-800 text-neutral-300 text-xs transition-colors ${s2ExportDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-neutral-700'}`}
                                >
                                    <FileJson className="h-3.5 w-3.5" />
                                    Trades JSON
                                </button>
                                <button
                                    disabled={s2ExportDisabled}
                                    onClick={() => exportS2ToCSV('signals')}
                                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs transition-colors ${s2ExportDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-emerald-500/20'}`}
                                >
                                    <FileSpreadsheet className="h-3.5 w-3.5" />
                                    Signals CSV
                                </button>
                                <button
                                    disabled={s2ExportDisabled}
                                    onClick={() => exportS2ToCSV('shocks')}
                                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs transition-colors ${s2ExportDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-emerald-500/20'}`}
                                >
                                    <FileSpreadsheet className="h-3.5 w-3.5" />
                                    Shocks CSV
                                </button>
                                <button
                                    disabled={s2ExportDisabled}
                                    onClick={() => exportS2ToCSV('trades')}
                                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs transition-colors ${s2ExportDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-emerald-500/20'}`}
                                >
                                    <FileSpreadsheet className="h-3.5 w-3.5" />
                                    Trades CSV
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

        </div>
    );
}

// Also export as default for backward compat
export default DatabasePanelCanonical;

interface ResearchDbInfo {
    name: string;
    path: string;
    role: string;
    status: 'available' | 'missing' | 'unknown';
    notes?: string;
}

function ResearchDbSection({
    sweepStatus,
    sweepError,
    onRefresh,
}: {
    sweepStatus: StatusV2 | null;
    sweepError: string | null;
    onRefresh: () => void;
}) {
    const researchDbs: ResearchDbInfo[] = [
        {
            name: 'sweep_history.sqlite',
            path: '~/bot/data/db/sweep_history.sqlite',
            role: 'Research sweeps (campaign results, append-only)',
            status: sweepStatus
                ? sweepStatus.available
                    ? 'available'
                    : 'missing'
                : 'unknown',
            notes: sweepStatus?.has_data
                ? `Latest scope ${sweepStatus.latest?.scope_type ?? ''} ${sweepStatus.latest?.scope_key ?? ''}`
                : sweepError ?? 'status unknown',
        },
        {
            name: 'campaigns.sqlite',
            path: '~/bot/data/db/campaigns.sqlite',
            role: 'Campaign definitions and campaign_runs',
            status: 'available',
            notes: 'Source of truth for sweep campaigns',
        },
        {
            name: 'calibration.sqlite',
            path: '~/bot/data/db/calibration.sqlite',
            role: 'Shock trajectories and calibration analytics',
            status: 'available',
        },
        {
            name: 'shadow_trading.sqlite',
            path: '~/bot/data/db/shadow_trading.sqlite',
            role: 'Shadow execution (archived / analytical)',
            status: 'available',
            notes: 'Shadow layer is currently disabled',
        },
        {
            name: 'signal_analytics.sqlite',
            path: '~/bot/data/db/signal_analytics.sqlite',
            role: 'Legacy signal analytics',
            status: 'available',
        },
    ];

    return (
        <div className="space-y-4">
            <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4 flex items-center justify-between">
                <div>
                    <div className="text-xs uppercase tracking-wider text-neutral-400">
                        Research & Sweep Databases
                    </div>
                    <div className="text-sm text-neutral-300">
                        Sources hors couche canonique (no run lock)
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {sweepError && (
                        <span className="text-[11px] text-amber-300">
                            {sweepError}
                        </span>
                    )}
                    <button
                        onClick={onRefresh}
                        className="rounded-lg border border-white/20 bg-white/5 px-3 py-1 text-xs text-white hover:bg-white/10"
                    >
                        Refresh sweep status
                    </button>
                </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
                {researchDbs.map((db) => (
                    <ResearchDbCard key={db.name} db={db} />
                ))}
            </div>
        </div>
    );
}

function ResearchDbCard({ db }: { db: ResearchDbInfo }) {
    const tone =
        db.status === 'available'
            ? 'text-emerald-300 border-emerald-400/30 bg-emerald-500/5'
            : db.status === 'missing'
                ? 'text-red-300 border-red-400/30 bg-red-500/5'
                : 'text-neutral-300 border-white/20 bg-white/5';
    return (
        <div className={`rounded-xl border p-4 ${tone}`}>
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-sm font-semibold text-white">{db.name}</div>
                    <div className="text-[11px] text-neutral-400">{db.role}</div>
                </div>
                <div className="text-[11px] uppercase tracking-wide">
                    {db.status}
                </div>
            </div>
            <div className="mt-2 text-xs font-mono text-neutral-300 break-all">
                {db.path}
            </div>
            {db.notes && (
                <div className="mt-2 text-xs text-neutral-200">{db.notes}</div>
            )}
        </div>
    );
}
