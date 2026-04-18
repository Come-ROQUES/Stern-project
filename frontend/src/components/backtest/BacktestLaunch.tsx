/**
 * BacktestLaunch.tsx - Full-width bento launcher (Simple campaign + Walk-Forward)
 *
 * Professional hedge fund style. Fixes:
 * - Full-width layout (removed max-w-4xl)
 * - WF 404 graceful handling
 */

import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
    Play, Activity, Link2, TrendingUp, Check, X, ChevronDown, ChevronRight,
    Loader2, ArrowRight, RotateCcw, RefreshCw, Skull, GitBranch, BarChart3,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    api,
    type BacktestStrategy,
    type BacktestProgress,
    type BacktestMode,
    type BacktestRunRow,
    type CampaignCreatePayload,
    type CampaignJob,
    type BacktestJobStatus,
} from '../../lib/api';
import {
    getQueueStatus,
    listQueueJobs,
    killQueueJob,
    listWalkForwards,
    getWalkForwardSummary,
    getWalkForwardProgress,
    launchWalkForward,
    type QueueStatus,
    type QueueJob,
    type WalkForwardRunEntry,
    type WalkForwardSummary,
    type WalkForwardFold,
    type WalkForwardProgress,
} from '../../lib/quantApi';
import { useBacktestContext } from '../../lib/useBacktestContext';
import { cn } from '../../lib/utils';
import { GlassCard, GlassPanel, GlassBadge, SegmentedControl } from '../ui/glass';
import { BacktestPipeline } from './BacktestPipeline';

type LaunchMode = 'simple' | 'walkforward';

// ---------------------------------------------------------------------------
// Constants & Helpers
// ---------------------------------------------------------------------------

const STRATEGIES: {
    key: BacktestStrategy;
    label: string;
    subtitle: string;
    accent: string;
    accentBg: string;
    accentBorder: string;
    icon: React.ReactNode;
}[] = [
    {
        key: 'dw',
        label: 'S1 Damping Wave',
        subtitle: 'Contrarian shock reversal -- EUR/USD 5s',
        accent: 'text-cyan-400',
        accentBg: 'bg-cyan-500/10',
        accentBorder: 'border-cyan-500/30',
        icon: <Activity size={20} />,
    },
    {
        key: 's2',
        label: 'S2 Pairs Trading',
        subtitle: 'Statistical arbitrage -- AUD/NZD 15m',
        accent: 'text-violet-400',
        accentBg: 'bg-violet-500/10',
        accentBorder: 'border-violet-500/30',
        icon: <Link2 size={20} />,
    },
    {
        key: 'tf_pullback',
        label: 'S3 TF Pullback',
        subtitle: 'Trend-following pullback -- EUR/USD 5s',
        accent: 'text-emerald-400',
        accentBg: 'bg-emerald-500/10',
        accentBorder: 'border-emerald-500/30',
        icon: <TrendingUp size={20} />,
    },
];

const inputClass =
    'w-full rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-cyan-500/40 focus:outline-none transition-colors';

function adaptivePollDelay(visibleMs: number, hiddenMs: number): number {
    if (typeof document === 'undefined') return visibleMs;
    return document.visibilityState === 'visible' ? visibleMs : hiddenMs;
}

function formatDateRange(endTs: string, days: number): { start: string; end: string; label: string } {
    const end = new Date(endTs);
    const start = new Date(end);
    start.setDate(start.getDate() - days);
    const fmt = (d: Date) =>
        d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
    return { start: start.toISOString(), end: end.toISOString(), label: `${fmt(start)} -- ${fmt(end)}` };
}

function parsePhaseFromLogs(logs: string[]): string {
    const joined = logs.slice(-20).join('\n').toLowerCase();
    if (joined.includes('done') || joined.includes('complete') || joined.includes('finished'))
        return 'Termine';
    if (joined.includes('computing') || joined.includes('metrics') || joined.includes('summary'))
        return 'Calcul metriques';
    if (joined.includes('simulat') || joined.includes('replay') || joined.includes('bar '))
        return 'Simulation en cours';
    if (joined.includes('loading') || joined.includes('reading') || joined.includes('parquet'))
        return 'Chargement donnees';
    return 'Initialisation';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StrategyCard({
    strat,
    selected,
    onToggle,
}: {
    strat: (typeof STRATEGIES)[number];
    selected: boolean;
    onToggle: () => void;
}) {
    return (
        <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
            <GlassCard
                hover
                onClick={onToggle}
                className={cn(
                    'relative overflow-hidden',
                    selected
                        ? `${strat.accentBorder} ${strat.accentBg}`
                        : 'border-white/[0.08] opacity-60 hover:opacity-100'
                )}
            >
                <div className="flex items-center gap-3">
                    <div className={cn('flex items-center justify-center w-9 h-9 rounded-lg', selected ? strat.accentBg : 'bg-white/[0.05]', strat.accent)}>
                        {strat.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className={cn('text-sm font-medium', selected ? 'text-white' : 'text-neutral-300')}>{strat.label}</div>
                        <div className="text-[10px] text-neutral-500 mt-0.5">{strat.subtitle}</div>
                    </div>
                    <div className={cn('w-5 h-5 rounded-full border-2 flex items-center justify-center', selected ? `${strat.accentBorder} ${strat.accentBg}` : 'border-white/20')}>
                        {selected && <Check size={11} className={strat.accent} />}
                    </div>
                </div>
            </GlassCard>
        </motion.div>
    );
}

function JobStatusIndicator({ job, logs }: { job: CampaignJob; logs: string[] | null }) {
    const strat = STRATEGIES.find((s) => s.key === job.strategy);
    const phaseLabel = job.phase === 'is' ? 'IS' : 'OOS';
    const currentPhase = job.status === 'running' && logs ? parsePhaseFromLogs(logs) : null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                'rounded-xl border p-3',
                job.status === 'success' ? 'border-emerald-500/30 bg-emerald-500/[0.04]' :
                job.status === 'error' ? 'border-red-500/30 bg-red-500/[0.04]' :
                job.status === 'running' ? 'border-cyan-500/30 bg-cyan-500/[0.04]' :
                'border-white/[0.08] bg-white/[0.02]'
            )}
        >
            <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                    {job.status === 'queued' && <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />}
                    {job.status === 'running' && <Loader2 size={14} className="text-cyan-400 animate-spin" />}
                    {job.status === 'success' && <Check size={14} className="text-emerald-400" />}
                    {job.status === 'error' && <X size={14} className="text-red-400" />}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className={cn('text-xs font-medium', strat?.accent ?? 'text-neutral-300')}>{strat?.label ?? job.strategy}</span>
                        <span className="text-[9px] uppercase tracking-wider text-neutral-500 bg-white/[0.05] px-1.5 py-0.5 rounded">{phaseLabel}</span>
                    </div>
                    {currentPhase && <div className="text-[10px] text-neutral-500 mt-0.5">{currentPhase}</div>}
                </div>
                {job.status === 'success' && job.n_trades != null && (
                    <div className="flex items-center gap-2 text-[10px]">
                        <span className="text-neutral-400">{job.n_trades}t</span>
                        {job.total_pnl_pips != null && (
                            <span className={job.total_pnl_pips >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                                {job.total_pnl_pips >= 0 ? '+' : ''}{job.total_pnl_pips.toFixed(1)}p
                            </span>
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    );
}

function LiveProgressCounters({ runId }: { runId: string }) {
    const [prog, setProg] = useState<BacktestProgress | null>(null);
    const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        let cancelled = false;
        const poll = async () => {
            try {
                const resp = await api.getBacktestProgress(runId);
                if (!cancelled && resp.available && resp.progress) setProg(resp.progress);
            } catch { /* ignore */ }
            finally {
                if (!cancelled) {
                    pollRef.current = setTimeout(
                        poll,
                        adaptivePollDelay(3000, 9000)
                    );
                }
            }
        };
        poll();
        return () => {
            cancelled = true;
            if (pollRef.current) clearTimeout(pollRef.current);
        };
    }, [runId]);

    if (!prog) return null;

    if (prog.pipeline) {
        return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <BacktestPipeline progress={prog} />
            </motion.div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] p-3 space-y-2">
            <div className="flex items-center justify-between text-[10px] text-neutral-400">
                <span>Simulation {prog.phase}</span>
                <span className="font-mono">{prog.pct.toFixed(1)}%</span>
            </div>
            <div className="relative h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <motion.div className="absolute inset-y-0 left-0 rounded-full bg-cyan-400" animate={{ width: `${prog.pct}%` }} transition={{ duration: 0.5 }} />
            </div>
            <div className="flex flex-wrap gap-3 text-[10px]">
                <span className="text-neutral-500">Bars: <span className="text-neutral-200 font-mono">{(prog.bars_processed / 1000).toFixed(0)}k/{(prog.bars_total / 1000).toFixed(0)}k</span></span>
                <span className="text-neutral-500">Trades: <span className="text-neutral-200 font-mono">{prog.trades_simulated}</span></span>
                <span className="text-neutral-500">PnL: <span className={cn('font-mono', prog.current_pnl_pips >= 0 ? 'text-emerald-300' : 'text-rose-300')}>{prog.current_pnl_pips >= 0 ? '+' : ''}{prog.current_pnl_pips.toFixed(1)}p</span></span>
                <span className="text-neutral-500">Speed: <span className="text-neutral-200 font-mono">{prog.bars_per_second.toFixed(0)} b/s</span></span>
                {prog.eta_seconds > 0 && <span className="text-neutral-500">ETA: <span className="text-neutral-200 font-mono">{Math.ceil(prog.eta_seconds / 60)}min</span></span>}
            </div>
        </motion.div>
    );
}

// ---------------------------------------------------------------------------
// Job Queue
// ---------------------------------------------------------------------------

function JobQueueSection() {
    const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
    const [jobs, setJobs] = useState<QueueJob[]>([]);
    const [loading, setLoading] = useState(true);
    const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const loadQueue = React.useCallback(async () => {
        try {
            const [status, jobList] = await Promise.all([getQueueStatus(), listQueueJobs(undefined, 10)]);
            setQueueStatus(status);
            setJobs(jobList.jobs || []);
        } catch { /* queue might not be initialized */ } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadQueue(); }, [loadQueue]);
    useEffect(() => {
        let cancelled = false;
        const poll = async () => {
            try {
                await loadQueue();
            } finally {
                if (!cancelled) {
                    pollRef.current = setTimeout(
                        poll,
                        adaptivePollDelay(15_000, 45_000)
                    );
                }
            }
        };
        pollRef.current = setTimeout(
            poll,
            adaptivePollDelay(15_000, 45_000)
        );
        return () => {
            cancelled = true;
            if (pollRef.current) clearTimeout(pollRef.current);
        };
    }, [loadQueue]);

    const handleKill = async (jobId: string) => {
        try { await killQueueJob(jobId); loadQueue(); } catch { /* ignore */ }
    };

    if (loading) return <div className="text-neutral-600 text-xs py-2">Chargement queue...</div>;
    if (!queueStatus?.available) return <div className="text-neutral-600 text-xs py-2">Queue non disponible.</div>;

    const counts = queueStatus.counts || {};
    return (
        <div className="space-y-3">
            <div className="flex gap-4">
                {(['PENDING', 'RUNNING', 'DONE', 'FAILED'] as const).map((s) => {
                    const colors: Record<string, string> = { PENDING: 'text-amber-400', RUNNING: 'text-cyan-400', DONE: 'text-emerald-400', FAILED: 'text-red-400' };
                    return (
                        <div key={s} className="text-center">
                            <div className={cn('text-lg font-mono font-medium', colors[s])}>{counts[s] || 0}</div>
                            <div className="text-[9px] uppercase tracking-wider text-neutral-600">{s}</div>
                        </div>
                    );
                })}
            </div>
            {jobs.length > 0 && (
                <div className="rounded-lg border border-white/[0.06] overflow-hidden max-h-[200px] overflow-auto">
                    <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-[#080c18] text-neutral-500 text-[10px] uppercase tracking-wider">
                            <tr>
                                <th className="text-left py-1.5 px-2">Job</th>
                                <th className="text-left py-1.5 px-2">Strategy</th>
                                <th className="text-center py-1.5 px-2">Status</th>
                                <th className="text-right py-1.5 px-2">Queued</th>
                                <th className="text-right py-1.5 px-2 w-8"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {jobs.map((j) => (
                                <tr key={j.job_id} className="border-t border-white/[0.04]">
                                    <td className="text-neutral-400 py-1 px-2 font-mono">{j.job_id.slice(0, 8)}</td>
                                    <td className="text-neutral-400 py-1 px-2 uppercase">{j.strategy || '--'}</td>
                                    <td className="text-center py-1 px-2">
                                        <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-medium',
                                            j.status === 'RUNNING' ? 'bg-cyan-500/20 text-cyan-400' :
                                            j.status === 'DONE' ? 'bg-emerald-500/20 text-emerald-400' :
                                            j.status === 'FAILED' ? 'bg-red-500/20 text-red-400' :
                                            'bg-neutral-500/20 text-neutral-400'
                                        )}>{j.status}</span>
                                    </td>
                                    <td className="text-right text-neutral-600 py-1 px-2 font-mono">{j.queued_at ? new Date(j.queued_at).toLocaleTimeString() : '--'}</td>
                                    <td className="text-right py-1 px-2">
                                        {j.status === 'RUNNING' && (
                                            <button onClick={() => handleKill(j.job_id)} className="text-red-400 hover:text-red-300"><Skull size={11} /></button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Recent Runs
// ---------------------------------------------------------------------------

function parseStrategy(runId: string): string | null {
    if (runId.includes('_tf_pullback_')) return 'S3 TF';
    if (runId.includes('_dw_')) return 'S1 DW';
    if (runId.includes('_s2_')) return 'S2 Pairs';
    return null;
}

const strategyAccent: Record<string, string> = {
    'S1 DW': 'text-cyan-300 bg-cyan-500/15',
    'S2 Pairs': 'text-violet-300 bg-violet-500/15',
    'S3 TF': 'text-emerald-300 bg-emerald-500/15',
};

function RecentRunsSection() {
    const { setSelectedRunId, navigateToTab } = useBacktestContext();
    const [runs, setRuns] = useState<BacktestRunRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [modeFilter, setModeFilter] = useState<BacktestMode | 'all'>('all');

    const refresh = React.useCallback(async () => {
        setLoading(true);
        try {
            const mode = modeFilter === 'all' ? undefined : modeFilter;
            const res = await api.listBacktestRuns(30, mode);
            setRuns(res.runs ?? []);
        } catch { setRuns([]); } finally { setLoading(false); }
    }, [modeFilter]);

    useEffect(() => { refresh(); }, [refresh]);

    const selectAndNavigate = (runId: string) => {
        setSelectedRunId(runId);
        navigateToTab?.('bt-results');
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-3">
                <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value as BacktestMode | 'all')}
                    className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-xs text-neutral-100">
                    <option value="all">All modes</option>
                    <option value="end_to_end">end_to_end</option>
                    <option value="production_faithful">production_faithful</option>
                    <option value="signal">signal</option>
                </select>
                <button onClick={refresh} disabled={loading} className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white">
                    <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
                <span className="text-[10px] text-neutral-600">{runs.length} runs</span>
            </div>
            <div className="rounded-lg border border-white/[0.06] overflow-hidden max-h-[320px] overflow-auto">
                <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-[#080c18] text-neutral-500 text-[10px] uppercase tracking-wider border-b border-white/[0.06]">
                        <tr>
                            <th className="px-2 py-2 text-left">Run ID</th>
                            <th className="px-2 py-2 text-center">Strategy</th>
                            <th className="px-2 py-2 text-left">Date</th>
                            <th className="px-2 py-2 text-right">Trades</th>
                            <th className="px-2 py-2 text-right">PnL</th>
                            <th className="px-2 py-2 text-right">WR</th>
                        </tr>
                    </thead>
                    <tbody>
                        {runs.map((run) => {
                            const strategy = parseStrategy(run.run_id);
                            const pnl = run.total_pnl_pips;
                            return (
                                <tr key={run.run_id} onClick={() => selectAndNavigate(run.run_id)}
                                    className="border-t border-white/[0.04] cursor-pointer hover:bg-white/[0.03] transition-colors">
                                    <td className="px-2 py-1.5 font-mono text-neutral-300 truncate max-w-[180px]">
                                        {run.run_id.length > 24 ? run.run_id.slice(0, 24) + '...' : run.run_id}
                                    </td>
                                    <td className="px-2 py-1.5 text-center">
                                        {strategy ? (
                                            <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-medium', strategyAccent[strategy] ?? 'text-neutral-400 bg-white/5')}>{strategy}</span>
                                        ) : <span className="text-neutral-600">--</span>}
                                    </td>
                                    <td className="px-2 py-1.5 text-neutral-500 font-mono">{run.created_at ? run.created_at.replace('T', ' ').slice(0, 16) : '--'}</td>
                                    <td className="px-2 py-1.5 text-right text-neutral-300 font-mono">{run.n_trades ?? '--'}</td>
                                    <td className={cn('px-2 py-1.5 text-right font-mono font-medium', pnl != null && pnl >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
                                        {pnl != null ? `${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}` : '--'}
                                    </td>
                                    <td className="px-2 py-1.5 text-right text-neutral-300 font-mono">{run.win_rate != null ? `${(run.win_rate * 100).toFixed(0)}%` : '--'}</td>
                                </tr>
                            );
                        })}
                        {runs.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-neutral-600">Aucun run.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Walk-Forward Section
// ---------------------------------------------------------------------------

const WF_STATUS_COLORS: Record<string, string> = {
    done: 'text-emerald-400', running: 'text-amber-400', pending: 'text-neutral-500', failed: 'text-red-400', partial: 'text-amber-400',
};
const WF_STATUS_BG: Record<string, string> = {
    done: 'bg-emerald-400/20', running: 'bg-amber-400/20', pending: 'bg-neutral-500/20', failed: 'bg-red-400/20', partial: 'bg-amber-400/20',
};

function fmtDuration(s: number): string {
    if (s < 60) return `${s.toFixed(0)}s`;
    if (s < 3600) return `${(s / 60).toFixed(1)}min`;
    return `${(s / 3600).toFixed(1)}h`;
}

function fmtPips(v: number | undefined | null): string { return v == null ? '--' : v.toFixed(2); }
function fmtPctLocal(v: number | undefined | null): string { return v == null ? '--' : `${(v * 100).toFixed(1)}%`; }
function fmtNum(v: number | undefined | null, d = 2): string { return v == null ? '--' : v.toFixed(d); }

function WalkForwardSection() {
    const { setSelectedWfId: setGlobalWfId, navigateToTab } = useBacktestContext();
    const [wfRuns, setWfRuns] = useState<WalkForwardRunEntry[]>([]);
    const [selectedWfId, setSelectedWfId] = useState<string | null>(null);
    const [wfSummary, setWfSummary] = useState<WalkForwardSummary | null>(null);
    const [wfProgress, setWfProgress] = useState<WalkForwardProgress | null>(null);
    const [wfLoading, setWfLoading] = useState(true);
    const [wfError, setWfError] = useState<string | null>(null);
    const [wfDetailError, setWfDetailError] = useState<string | null>(null);
    const wfPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [wfStrategy, setWfStrategy] = useState('dw');
    const [trainMonths, setTrainMonths] = useState(2);
    const [testMonths, setTestMonths] = useState(1);
    const [stepMonths, setStepMonths] = useState(1);
    const [wfStartDate, setWfStartDate] = useState('2025-07-01');
    const [wfEndDate, setWfEndDate] = useState('2026-01-01');
    const [maxWorkers, setMaxWorkers] = useState(3);
    const [wfBarInterval, setWfBarInterval] = useState(5);
    const [wfLaunching, setWfLaunching] = useState(false);
    const [wfLaunchError, setWfLaunchError] = useState<string | null>(null);

    const loadWfRuns = useCallback(async () => {
        try { const data = await listWalkForwards(20); setWfRuns(data.runs || []); }
        catch (e: any) { setWfError(e.message); }
        finally { setWfLoading(false); }
    }, []);

    useEffect(() => { loadWfRuns(); }, [loadWfRuns]);

    useEffect(() => {
        if (!selectedWfId) { setWfSummary(null); setWfProgress(null); setWfDetailError(null); return; }
        let cancelled = false;
        setWfDetailError(null);
        const load = async () => {
            try {
                const s = await getWalkForwardSummary(selectedWfId);
                if (!cancelled) {
                    setWfSummary(s);
                    if ((s as any).status === 'running' || !s.aggregate) {
                        try {
                            const p = await getWalkForwardProgress(selectedWfId);
                            if (!cancelled) setWfProgress(p);
                        } catch { /* 404 graceful: WF initializing */ }
                    } else { setWfProgress(null); }
                }
            } catch {
                if (!cancelled) {
                    setWfSummary(null);
                    try {
                        const p = await getWalkForwardProgress(selectedWfId);
                        if (!cancelled) setWfProgress(p);
                    } catch {
                        // 404 graceful: show initializing state instead of error
                        if (!cancelled) {
                            setWfProgress(null);
                            setWfDetailError('Walk-forward en cours d\'initialisation...');
                        }
                    }
                }
            }
        };
        load();
        return () => { cancelled = true; };
    }, [selectedWfId]);

    useEffect(() => {
        if (wfPollRef.current) clearTimeout(wfPollRef.current);
        const isRunning = wfProgress?.status === 'running' || (wfSummary && !wfSummary.aggregate && (wfSummary as any).status !== 'done' && (wfSummary as any).status !== 'failed');
        if (!selectedWfId || !isRunning) return;
        let cancelled = false;
        const poll = async () => {
            try {
                const p = await getWalkForwardProgress(selectedWfId);
                if (cancelled) return;
                setWfProgress(p);
                if (p.status === 'done' || p.status === 'failed' || p.status === 'partial') {
                    if (wfPollRef.current) clearTimeout(wfPollRef.current);
                    try { const s = await getWalkForwardSummary(selectedWfId); setWfSummary(s); } catch { /* summary may not be ready */ }
                    loadWfRuns();
                    return;
                }
            } catch { /* 404 during init is normal, keep polling */ }
            if (!cancelled) {
                wfPollRef.current = setTimeout(
                    poll,
                    adaptivePollDelay(5000, 15000)
                );
            }
        };
        wfPollRef.current = setTimeout(poll, adaptivePollDelay(5000, 15000));
        return () => {
            cancelled = true;
            if (wfPollRef.current) clearTimeout(wfPollRef.current);
        };
    }, [selectedWfId, wfProgress?.status, wfSummary, loadWfRuns]);

    const handleWfLaunch = async () => {
        setWfLaunching(true); setWfLaunchError(null);
        try {
            await launchWalkForward({ strategy: wfStrategy, train_months: trainMonths, test_months: testMonths, step_months: stepMonths, start: wfStartDate, end: wfEndDate, max_workers: maxWorkers, ...(wfStrategy === 'tf_pullback' && wfBarInterval !== 5 ? { bar_interval_s: wfBarInterval } : {}) });
            await new Promise((r) => setTimeout(r, 2000));
            await loadWfRuns();
            const data = await listWalkForwards(1);
            if (data.runs?.[0]) setSelectedWfId(data.runs[0].wf_id);
        } catch (e: any) { setWfLaunchError(e.message || 'Launch failed'); }
        finally { setWfLaunching(false); }
    };

    const isWfRunning = wfProgress?.status === 'running';

    return (
        <div className="space-y-4">
            <GlassCard>
                <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">Walk-Forward Config</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    <label className="block"><span className="text-[10px] text-neutral-500">Strategy</span>
                        <select value={wfStrategy} onChange={(e) => setWfStrategy(e.target.value)} className={cn(inputClass, 'mt-1')}>
                            <option value="dw">DW (Damping Wave)</option>
                            <option value="tf_pullback">TF Pullback</option>
                            <option value="s2">S2 Pairs</option>
                        </select>
                    </label>
                    <label className="block"><span className="text-[10px] text-neutral-500">Train (mois)</span>
                        <input type="number" value={trainMonths} onChange={(e) => setTrainMonths(+e.target.value)} min={1} max={12} className={cn(inputClass, 'mt-1')} />
                    </label>
                    <label className="block"><span className="text-[10px] text-neutral-500">Test (mois)</span>
                        <input type="number" value={testMonths} onChange={(e) => setTestMonths(+e.target.value)} min={1} max={6} className={cn(inputClass, 'mt-1')} />
                    </label>
                    <label className="block"><span className="text-[10px] text-neutral-500">Step (mois)</span>
                        <input type="number" value={stepMonths} onChange={(e) => setStepMonths(+e.target.value)} min={1} max={6} className={cn(inputClass, 'mt-1')} />
                    </label>
                    <label className="block"><span className="text-[10px] text-neutral-500">Start</span>
                        <input type="date" value={wfStartDate} onChange={(e) => setWfStartDate(e.target.value)} className={cn(inputClass, 'mt-1')} />
                    </label>
                    <label className="block"><span className="text-[10px] text-neutral-500">End</span>
                        <input type="date" value={wfEndDate} onChange={(e) => setWfEndDate(e.target.value)} className={cn(inputClass, 'mt-1')} />
                    </label>
                    <label className="block"><span className="text-[10px] text-neutral-500">Workers</span>
                        <input type="number" value={maxWorkers} onChange={(e) => setMaxWorkers(+e.target.value)} min={1} max={4} className={cn(inputClass, 'mt-1')} />
                    </label>
                    {wfStrategy === 'tf_pullback' && (
                        <label className="block"><span className="text-[10px] text-neutral-500">Bar interval</span>
                            <select value={wfBarInterval} onChange={(e) => setWfBarInterval(+e.target.value)} className={cn(inputClass, 'mt-1')}>
                                <option value={5}>5s (prod)</option>
                                <option value={60}>1min (rapide)</option>
                            </select>
                        </label>
                    )}
                    <div className="flex items-end">
                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={handleWfLaunch} disabled={wfLaunching}
                            className={cn('w-full rounded-lg text-sm font-medium py-2 px-4 flex items-center justify-center gap-2 transition-colors',
                                wfLaunching ? 'bg-neutral-700 text-neutral-400 cursor-wait' : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                            )}>
                            {wfLaunching ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                            {wfLaunching ? 'Lancement...' : 'Lancer WF'}
                        </motion.button>
                    </div>
                </div>
                {wfLaunchError && <p className="text-red-400 text-xs mt-1">{wfLaunchError}</p>}
            </GlassCard>

            {wfLoading && <p className="text-neutral-500 text-sm text-center py-4">Chargement...</p>}
            {wfError && <p className="text-red-400 text-sm text-center py-2">{wfError}</p>}

            {!wfLoading && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div>
                        <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-2">Walk-Forwards</div>
                        {wfRuns.length === 0 ? (
                            <p className="text-neutral-500 text-sm py-4 text-center">Aucun walk-forward.</p>
                        ) : (
                            <div className="space-y-1 max-h-[320px] overflow-auto">
                                {wfRuns.map((r) => {
                                    const status = (r.summary as any)?.status || 'unknown';
                                    return (
                                        <button key={r.wf_id} onClick={() => setSelectedWfId(r.wf_id)}
                                            className={cn('w-full text-left rounded-lg border px-3 py-2 transition-colors',
                                                r.wf_id === selectedWfId ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                                            )}>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-neutral-200 font-mono truncate">{r.wf_id}</span>
                                                <span className={cn('text-[9px] px-2 py-0.5 rounded-full', WF_STATUS_BG[status], WF_STATUS_COLORS[status])}>{status}</span>
                                            </div>
                                            <div className="flex gap-3 mt-1 text-[10px] text-neutral-500">
                                                <span>{(r.summary as any)?.strategy?.toUpperCase()}</span>
                                                <span>{(r.summary as any)?.folds_count ?? '?'} folds</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    <div className="lg:col-span-2">
                        {isWfRunning && wfProgress && (
                            <div className="mb-4">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-sm font-medium text-amber-400">En cours - {wfProgress.folds_done}/{wfProgress.folds_total} folds</div>
                                    <span className="text-xs text-neutral-500 font-mono">{wfProgress.pct}%</span>
                                </div>
                                <div className="w-full bg-neutral-800 rounded-full h-1.5 mb-3">
                                    <div className="bg-cyan-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${wfProgress.pct}%` }} />
                                </div>
                                <div className="flex gap-1 mb-3">
                                    {(wfProgress.folds as any[]).map((f: any) => (
                                        <div key={f.fold_id} className={cn('flex-1 rounded-md p-1.5 text-center', WF_STATUS_BG[f.status] || 'bg-neutral-800')}>
                                            <div className={cn('text-[10px] font-mono', WF_STATUS_COLORS[f.status] || 'text-neutral-400')}>F{f.fold_id}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {wfSummary?.aggregate ? (
                            <>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="text-sm font-medium text-neutral-300">{wfSummary.strategy?.toUpperCase()} - {wfSummary.folds_count} folds</div>
                                    <span className="text-xs text-neutral-500">{fmtDuration(wfSummary.total_wall_time_s)}</span>
                                </div>
                                <div className="grid grid-cols-4 md:grid-cols-8 gap-2 mb-4">
                                    {[
                                        { label: 'OOS PnL', value: `${fmtPips(wfSummary.aggregate.oos_total_pnl_pips)}p`, color: wfSummary.aggregate.oos_total_pnl_pips >= 0 ? 'text-emerald-400' : 'text-red-400' },
                                        { label: 'OOS Trades', value: String(wfSummary.aggregate.oos_total_trades), color: 'text-neutral-200' },
                                        { label: 'OOS WR', value: fmtPctLocal(wfSummary.aggregate.oos_win_rate), color: 'text-neutral-200' },
                                        { label: 'OOS Sharpe', value: fmtNum(wfSummary.aggregate.oos_sharpe), color: wfSummary.aggregate.oos_sharpe > 1 ? 'text-emerald-400' : 'text-neutral-200' },
                                        { label: 'OOS PF', value: fmtNum(wfSummary.aggregate.oos_profit_factor), color: wfSummary.aggregate.oos_profit_factor > 1 ? 'text-emerald-400' : 'text-red-400' },
                                        { label: 'OOS MaxDD', value: `${fmtPips(wfSummary.aggregate.oos_max_dd_pips)}p`, color: 'text-amber-400' },
                                        { label: 'Degrad.', value: `${fmtNum(wfSummary.aggregate.is_vs_oos_degradation_pct, 1)}%`, color: wfSummary.aggregate.is_vs_oos_degradation_pct > -20 ? 'text-emerald-400' : 'text-red-400' },
                                        { label: 'Stability', value: fmtNum(wfSummary.aggregate.stability_score), color: wfSummary.aggregate.stability_score > 0.6 ? 'text-emerald-400' : 'text-amber-400' },
                                    ].map((k) => (
                                        <div key={k.label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2 text-center">
                                            <div className="text-[9px] text-neutral-500 mb-0.5">{k.label}</div>
                                            <div className={cn('text-sm font-mono font-medium', k.color)}>{k.value}</div>
                                        </div>
                                    ))}
                                </div>
                                {/* IS vs OOS fold table */}
                                {(() => {
                                    const doneFolds = wfSummary.per_fold.filter((f) => f.status === 'done');
                                    if (doneFolds.length === 0) return <p className="text-neutral-500 text-sm py-4 text-center">Aucun fold termine.</p>;
                                    const metrics = [
                                        { label: 'PnL', key: 'pnl_pips', fmt: fmtPips },
                                        { label: 'Trades', key: 'n_trades', fmt: (v: number) => String(v || 0) },
                                        { label: 'WR', key: 'win_rate', fmt: fmtPctLocal },
                                        { label: 'PF', key: 'profit_factor', fmt: fmtNum },
                                        { label: 'Sharpe', key: 'sharpe', fmt: fmtNum },
                                    ];
                                    return (
                                        <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
                                            <table className="w-full text-xs">
                                                <thead><tr className="bg-[#080c18] text-neutral-500 text-[10px] uppercase tracking-wider">
                                                    <th className="text-left py-2 px-2">Fold</th>
                                                    <th className="text-center py-2 px-1">Phase</th>
                                                    {metrics.map((m) => <th key={m.key} className="text-right py-2 px-2">{m.label}</th>)}
                                                    <th className="text-right py-2 px-2">Degrad.</th>
                                                </tr></thead>
                                                <tbody>
                                                    {doneFolds.map((f) => (
                                                        <React.Fragment key={f.fold_id}>
                                                            <tr className="border-b border-white/[0.04]">
                                                                <td rowSpan={2} className="text-neutral-300 py-1.5 px-2 font-mono">F{f.fold_id}</td>
                                                                <td className="text-center text-cyan-400 py-1.5 px-1 text-[10px]">IS</td>
                                                                {metrics.map((m) => <td key={m.key} className="text-right text-neutral-300 py-1.5 px-2 font-mono">{m.fmt((f.is as any)?.[m.key])}</td>)}
                                                                <td rowSpan={2} className={cn('text-right py-1.5 px-2 font-mono',
                                                                    (f.degradation_pct ?? 0) < -30 ? 'text-red-400' : (f.degradation_pct ?? 0) < -10 ? 'text-amber-400' : 'text-emerald-400'
                                                                )}>{f.degradation_pct != null ? `${f.degradation_pct.toFixed(1)}%` : '--'}</td>
                                                            </tr>
                                                            <tr className="border-b border-white/[0.06]">
                                                                <td className="text-center text-emerald-400 py-1.5 px-1 text-[10px]">OOS</td>
                                                                {metrics.map((m) => <td key={m.key} className="text-right text-neutral-400 py-1.5 px-2 font-mono">{m.fmt((f.oos as any)?.[m.key])}</td>)}
                                                            </tr>
                                                        </React.Fragment>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    );
                                })()}
                                {/* Navigate to full results view */}
                                <div className="mt-3 flex justify-end">
                                    <button
                                        onClick={() => {
                                            if (selectedWfId) {
                                                setGlobalWfId(selectedWfId);
                                                navigateToTab?.('bt-results');
                                            }
                                        }}
                                        className="flex items-center gap-1.5 px-4 py-2 text-xs rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/20 transition-colors"
                                    >
                                        <BarChart3 size={13} />
                                        Voir resultats complets
                                    </button>
                                </div>
                            </>
                        ) : selectedWfId && wfDetailError ? (
                            <div className="text-amber-400 text-sm text-center py-8 animate-pulse">{wfDetailError}</div>
                        ) : selectedWfId && !isWfRunning ? (
                            <p className="text-neutral-500 text-sm text-center py-8">Chargement du summary...</p>
                        ) : !selectedWfId ? (
                            <p className="text-neutral-500 text-sm text-center py-8">Selectionner un walk-forward pour voir les resultats.</p>
                        ) : null}
                    </div>
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Collapsible Section
// ---------------------------------------------------------------------------

function Section({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <GlassCard padding="none">
            <button type="button" onClick={() => setOpen(!open)}
                className="w-full flex items-center gap-2 px-4 py-3 text-left text-xs uppercase tracking-[0.16em] text-neutral-400 hover:text-white transition-colors">
                {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                {title}
            </button>
            {open && <div className="px-4 py-3 border-t border-white/[0.06]">{children}</div>}
        </GlassCard>
    );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function BacktestLaunch() {
    const {
        setSelectedRunId, setActiveCampaignId, setCampaignStatus,
        activeCampaignId, campaignStatus, setSelectedStrategy, navigateToTab,
    } = useBacktestContext();

    const [launchMode, setLaunchMode] = useState<LaunchMode>('simple');
    const [selected, setSelected] = useState<Set<BacktestStrategy>>(new Set(['dw']));
    const [isDays, setIsDays] = useState(60);
    const [oosDays, setOosDays] = useState(30);
    const [oosEndTs, setOosEndTs] = useState(() => new Date().toISOString().slice(0, 10));
    const [priceLakeRoot, setPriceLakeRoot] = useState('');
    const [symbol, setSymbol] = useState('EURUSD');
    const [s2Csv, setS2Csv] = useState('');
    const [launching, setLaunching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [runningJobLogs, setRunningJobLogs] = useState<Record<string, string[]>>({});

    const isRange = useMemo(() => formatDateRange(new Date(new Date(oosEndTs).getTime() - oosDays * 86400000).toISOString(), isDays), [oosEndTs, isDays, oosDays]);
    const oosRange = useMemo(() => formatDateRange(oosEndTs, oosDays), [oosEndTs, oosDays]);

    const toggleStrategy = (key: BacktestStrategy) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(key)) { if (next.size > 1) next.delete(key); } else { next.add(key); }
            return next;
        });
    };

    const onLaunch = async () => {
        setLaunching(true); setError(null);
        try {
            const payload: CampaignCreatePayload = {
                strategies: Array.from(selected), is_days: isDays, oos_days: oosDays, oos_end_ts: new Date(oosEndTs).toISOString(),
            };
            if (priceLakeRoot) payload.price_lake_root = priceLakeRoot;
            if (symbol !== 'EURUSD') payload.symbol = symbol;
            if (selected.has('s2') && s2Csv) payload.s2_csv = s2Csv;
            const result = await api.createCampaign(payload);
            setActiveCampaignId(result.campaign_id);
            setCampaignStatus(result);
        } catch (err) { setError(err instanceof Error ? err.message : 'Erreur lors du lancement'); }
        finally { setLaunching(false); }
    };

    // Auto-detect active campaign
    useEffect(() => {
        if (activeCampaignId) return;
        let cancelled = false;
        (async () => {
            try {
                const list = await api.listCampaigns(5);
                if (cancelled || !list.campaigns?.length) return;
                for (const item of list.campaigns) {
                    try {
                        const full = await api.getCampaignStatus(item.campaign_id);
                        if (cancelled) return;
                        if (full.jobs.some((j) => j.status === 'running' || j.status === 'queued')) {
                            setActiveCampaignId(full.campaign_id); setCampaignStatus(full); return;
                        }
                    } catch { /* skip */ }
                }
            } catch { /* ignore */ }
        })();
        return () => { cancelled = true; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Campaign polling
    const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (!activeCampaignId) return;
        let cancelled = false;
        const poll = async () => {
            try {
                const status = await api.getCampaignStatus(activeCampaignId);
                if (cancelled) return;
                setCampaignStatus(status);
                const running = status.jobs.filter((j) => j.status === 'running');
                for (const job of running) {
                    if (job.job_id) {
                        try {
                            const jobStatus: BacktestJobStatus = await api.getBacktestJobStatus(job.job_id, 30);
                            if (cancelled) return;
                            setRunningJobLogs((prev) => ({ ...prev, [job.job_id]: jobStatus.logs ?? [] }));
                        } catch { /* ignore */ }
                    }
                }
                if (status.jobs.every((j) => j.status === 'success' || j.status === 'error') && pollingRef.current) {
                    clearTimeout(pollingRef.current); pollingRef.current = null;
                    return;
                }
            } catch { /* ignore */ }
            if (!cancelled) {
                pollingRef.current = setTimeout(
                    poll,
                    adaptivePollDelay(2000, 6000)
                );
            }
        };
        poll();
        return () => {
            cancelled = true;
            if (pollingRef.current) clearTimeout(pollingRef.current);
        };
    }, [activeCampaignId, setCampaignStatus]);

    const progress = useMemo(() => {
        if (!campaignStatus) return { completed: 0, total: 0, pct: 0, allDone: false, hasError: false };
        const jobs = campaignStatus.jobs;
        const completed = jobs.filter((j) => j.status === 'success' || j.status === 'error').length;
        return { completed, total: jobs.length, pct: jobs.length > 0 ? (completed / jobs.length) * 100 : 0, allDone: completed === jobs.length, hasError: jobs.some((j) => j.status === 'error') };
    }, [campaignStatus]);

    const goToResults = () => {
        if (!campaignStatus) return;
        const firstSuccess = campaignStatus.jobs.find((j) => j.status === 'success');
        if (firstSuccess) { setSelectedStrategy(firstSuccess.strategy); setSelectedRunId(firstSuccess.run_id); }
        navigateToTab?.('bt-results');
    };

    const resetCampaign = () => {
        setActiveCampaignId(null); setCampaignStatus(null); setRunningJobLogs({}); setError(null);
    };

    // ---------------------------------------------------------------------------
    // Campaign active: show progress
    // ---------------------------------------------------------------------------
    if (activeCampaignId && campaignStatus) {
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h1 className="text-lg font-semibold text-white">Campaign</h1>
                    <GlassBadge variant={progress.allDone ? (progress.hasError ? 'warning' : 'success') : 'info'}>
                        {progress.completed}/{progress.total} jobs
                    </GlassBadge>
                </div>

                <GlassCard>
                    <div className="space-y-4">
                        <div className="flex items-center gap-4 flex-wrap text-xs text-neutral-400">
                            <span className="font-mono text-neutral-500">{campaignStatus.campaign_id}</span>
                            <span>IS: {campaignStatus.windows.is_start_ts.slice(0, 10)} -- {campaignStatus.windows.is_end_ts.slice(0, 10)}</span>
                            <span>OOS: {campaignStatus.windows.oos_start_ts.slice(0, 10)} -- {campaignStatus.windows.oos_end_ts.slice(0, 10)}</span>
                        </div>

                        <div className="relative h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                            <motion.div className={cn('absolute inset-y-0 left-0 rounded-full', progress.hasError ? 'bg-rose-500' : 'bg-cyan-500')}
                                initial={{ width: 0 }} animate={{ width: `${progress.pct}%` }} transition={{ duration: 0.5 }} />
                            {!progress.allDone && <motion.div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" animate={{ x: ['-100%', '100%'] }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} />}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            <AnimatePresence mode="popLayout">
                                {campaignStatus.jobs.map((job) => (
                                    <JobStatusIndicator key={`${job.strategy}-${job.phase}`} job={job} logs={runningJobLogs[job.job_id] ?? null} />
                                ))}
                            </AnimatePresence>
                        </div>

                        {(() => {
                            const runningJob = campaignStatus.jobs.find((j) => j.status === 'running');
                            if (!runningJob?.run_id) return null;
                            return <LiveProgressCounters runId={runningJob.run_id} />;
                        })()}

                        {(() => {
                            const runningJob = campaignStatus.jobs.find((j) => j.status === 'running');
                            const logs = runningJob ? runningJobLogs[runningJob.job_id] : null;
                            if (!logs || logs.length === 0) return null;
                            return (
                                <div className="rounded-lg border border-white/[0.06] bg-black/30 p-3 max-h-[140px] overflow-auto">
                                    <div className="text-[9px] uppercase tracking-wider text-neutral-500 mb-1.5">Live logs</div>
                                    <pre className="text-[10px] text-neutral-500 leading-relaxed font-mono whitespace-pre-wrap">{logs.slice(-12).join('\n')}</pre>
                                </div>
                            );
                        })()}

                        <AnimatePresence>
                            {progress.allDone && (
                                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                                    className={cn('rounded-xl border p-4 text-center', progress.hasError ? 'border-amber-500/30 bg-amber-500/[0.04]' : 'border-emerald-500/30 bg-emerald-500/[0.04]')}>
                                    <div className={cn('text-sm font-medium mb-3', progress.hasError ? 'text-amber-200' : 'text-emerald-200')}>
                                        {progress.hasError ? 'Campaign terminee avec erreurs' : 'Campaign terminee avec succes'}
                                    </div>
                                    <div className="flex items-center justify-center gap-3">
                                        <button onClick={goToResults} className="inline-flex items-center gap-2 rounded-lg bg-cyan-500/20 border border-cyan-500/30 px-4 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-500/30 transition-colors">
                                            Voir les resultats <ArrowRight size={14} />
                                        </button>
                                        <button onClick={resetCampaign} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-neutral-300 hover:bg-white/10 transition-colors">
                                            <RotateCcw size={14} /> Nouveau
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </GlassCard>
            </div>
        );
    }

    // ---------------------------------------------------------------------------
    // Launch form
    // ---------------------------------------------------------------------------
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-lg font-semibold text-white">Launch Backtest</h1>
                <SegmentedControl
                    options={[
                        { value: 'simple' as const, label: 'Simple' },
                        { value: 'walkforward' as const, label: 'Walk-Forward' },
                    ]}
                    value={launchMode}
                    onChange={(v) => setLaunchMode(v as LaunchMode)}
                />
            </div>

            {launchMode === 'walkforward' && <WalkForwardSection />}

            {launchMode === 'simple' && (
                <div className="grid grid-cols-12 gap-3">
                    {/* Strategy Cards */}
                    <div className="col-span-12 lg:col-span-8">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {STRATEGIES.map((strat) => (
                                <StrategyCard key={strat.key} strat={strat} selected={selected.has(strat.key)} onToggle={() => toggleStrategy(strat.key)} />
                            ))}
                        </div>
                    </div>

                    {/* Period Config */}
                    <div className="col-span-12 lg:col-span-4 space-y-3">
                        <GlassCard className="border-cyan-500/20 bg-cyan-500/[0.02]">
                            <div className="text-[10px] uppercase tracking-wider text-cyan-400 mb-2">In-Sample</div>
                            <div className="flex items-center gap-2 mb-1">
                                <input type="number" value={isDays} onChange={(e) => setIsDays(Math.max(7, Number(e.target.value)))} className={cn(inputClass, 'w-20')} min={7} max={365} />
                                <span className="text-xs text-neutral-500">jours</span>
                            </div>
                            <div className="text-[10px] text-neutral-500">{isRange.label}</div>
                        </GlassCard>
                        <GlassCard className="border-emerald-500/20 bg-emerald-500/[0.02]">
                            <div className="text-[10px] uppercase tracking-wider text-emerald-400 mb-2">Out-of-Sample</div>
                            <div className="flex items-center gap-2 mb-1">
                                <input type="number" value={oosDays} onChange={(e) => setOosDays(Math.max(7, Number(e.target.value)))} className={cn(inputClass, 'w-20')} min={7} max={180} />
                                <span className="text-xs text-neutral-500">jours</span>
                            </div>
                            <div className="text-[10px] text-neutral-500">{oosRange.label}</div>
                        </GlassCard>
                        <GlassCard>
                            <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-2">Date de fin</div>
                            <input type="date" value={oosEndTs} onChange={(e) => setOosEndTs(e.target.value)} className={inputClass} />
                            <div className="text-[10px] text-neutral-500 mt-1.5">Total: {isDays + oosDays} jours</div>
                        </GlassCard>
                    </div>

                    {/* Advanced Config */}
                    <div className="col-span-12">
                        <Section title="Configuration avancee">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] uppercase tracking-[0.16em] text-neutral-400 block mb-1">Price Lake Root</label>
                                    <input value={priceLakeRoot} onChange={(e) => setPriceLakeRoot(e.target.value)} className={inputClass} placeholder="Defaut serveur" />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase tracking-[0.16em] text-neutral-400 block mb-1">Symbol</label>
                                    <input value={symbol} onChange={(e) => setSymbol(e.target.value)} className={inputClass} />
                                </div>
                                {selected.has('s2') && (
                                    <div className="sm:col-span-2">
                                        <label className="text-[10px] uppercase tracking-[0.16em] text-neutral-400 block mb-1">S2 CSV Path</label>
                                        <input value={s2Csv} onChange={(e) => setS2Csv(e.target.value)} className={inputClass} placeholder="/home/ubuntu-a1/bot/data/bars_15m.csv" />
                                    </div>
                                )}
                            </div>
                        </Section>
                    </div>

                    {/* Launch Button */}
                    <div className="col-span-12">
                        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200 mb-3">{error}</div>}
                        {selected.has('s2') && !s2Csv.trim() && (
                            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200 mb-3">Le path CSV est requis pour S2.</div>
                        )}
                        <motion.button whileHover={{ scale: 1.005 }} whileTap={{ scale: 0.995 }} onClick={onLaunch}
                            disabled={launching || (selected.has('s2') && !s2Csv.trim())}
                            className={cn('w-full flex items-center justify-center gap-3 rounded-xl border px-6 py-3.5 text-sm font-medium transition-all',
                                launching ? 'border-white/10 bg-white/[0.03] text-neutral-500 cursor-wait' : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20'
                            )}>
                            {launching ? <><Loader2 size={16} className="animate-spin" /> Lancement...</> :
                                <><Play size={16} /> Lancer Campaign ({selected.size} strat, {isDays + oosDays}j)</>}
                        </motion.button>
                    </div>
                </div>
            )}

            {/* Shared sections */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <Section title="Runs recents" defaultOpen>
                    <RecentRunsSection />
                </Section>
                <Section title="Queue & Jobs" defaultOpen>
                    <JobQueueSection />
                </Section>
            </div>
        </div>
    );
}
