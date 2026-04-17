/**
 * WalkForwardResults.tsx - Walk-forward validation results dashboard
 *
 * Shows aggregate KPIs, fold-by-fold IS/OOS comparison table,
 * trade details, and export functionality.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
    ArrowLeft,
    Download,
    ChevronDown,
    ChevronRight,
    TrendingUp,
    TrendingDown,
    Minus,
    BarChart3,
    Target,
    Activity,
    Clock,
    Layers,
} from 'lucide-react';
import { GlassCard, GlassKPI } from '../ui/glass';
import { cn } from '../../lib/utils';
import {
    getWalkForwardSummary,
    getWalkForwardFoldTrades,
    downloadWalkForwardExport,
    type WalkForwardSummary,
    type WalkForwardFold,
    type WalkForwardTrade,
} from '../../lib/quantApi';

interface WalkForwardResultsProps {
    wfId: string;
    onBack: () => void;
    /** When true, skip rendering the header (back button, title) */
    embedded?: boolean;
}

const STRATEGY_LABELS: Record<string, string> = {
    dw: 'Damping Wave',
    s2: 'S2 Pairs',
    tf_pullback: 'TF Pullback',
};

const STRATEGY_COLORS: Record<string, string> = {
    dw: 'text-blue-400',
    s2: 'text-purple-400',
    tf_pullback: 'text-amber-400',
};

function fmt(v: number | undefined | null, decimals = 2): string {
    if (v == null || isNaN(v)) return '--';
    return v.toFixed(decimals);
}

function fmtPct(v: number | undefined | null): string {
    if (v == null || isNaN(v)) return '--';
    return (v * 100).toFixed(1) + '%';
}

function pnlColor(v: number): string {
    if (v > 0) return 'text-emerald-400';
    if (v < 0) return 'text-rose-400';
    return 'text-neutral-400';
}

function degradationBadge(pct: number | undefined): React.ReactNode {
    if (pct == null) return null;
    const abs = Math.abs(pct);
    if (pct < -50) return <span className="text-rose-400 text-xs">-{abs.toFixed(0)}%</span>;
    if (pct > 50) return <span className="text-emerald-400 text-xs">+{abs.toFixed(0)}%</span>;
    return <span className="text-amber-400 text-xs">{pct > 0 ? '+' : ''}{pct.toFixed(0)}%</span>;
}

export function WalkForwardResults({ wfId, onBack, embedded = false }: WalkForwardResultsProps) {
    const [summary, setSummary] = useState<WalkForwardSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedFold, setExpandedFold] = useState<number | null>(null);
    const [foldTrades, setFoldTrades] = useState<Record<string, WalkForwardTrade[]>>({});
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        setLoading(true);
        setError(null);
        getWalkForwardSummary(wfId)
            .then(setSummary)
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [wfId]);

    const loadFoldTrades = useCallback(async (foldId: number, phase: 'is' | 'oos') => {
        const key = `${foldId}_${phase}`;
        if (foldTrades[key]) return;
        try {
            const resp = await getWalkForwardFoldTrades(wfId, foldId, phase);
            setFoldTrades((prev) => ({ ...prev, [key]: resp.trades }));
        } catch {
            // silently fail
        }
    }, [wfId, foldTrades]);

    const handleExpandFold = useCallback((foldId: number) => {
        if (expandedFold === foldId) {
            setExpandedFold(null);
        } else {
            setExpandedFold(foldId);
            loadFoldTrades(foldId, 'oos');
            loadFoldTrades(foldId, 'is');
        }
    }, [expandedFold, loadFoldTrades]);

    const handleExport = useCallback(async (format: 'csv' | 'json') => {
        setExporting(true);
        try {
            const { blob, filename } = await downloadWalkForwardExport(wfId, format);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            // silently fail
        } finally {
            setExporting(false);
        }
    }, [wfId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-pulse text-neutral-400">Chargement walk-forward {wfId}...</div>
            </div>
        );
    }

    if (error || !summary) {
        return (
            <GlassCard padding="md" className="col-span-12">
                <p className="text-rose-400">Erreur: {error || 'Donnees non disponibles'}</p>
                <button onClick={onBack} className="mt-2 text-sm text-blue-400 hover:underline">Retour</button>
            </GlassCard>
        );
    }

    const agg = summary.aggregate;
    const stratLabel = STRATEGY_LABELS[summary.strategy] || summary.strategy;
    const stratColor = STRATEGY_COLORS[summary.strategy] || 'text-neutral-300';

    return (
        <div className="space-y-4">
            {/* Header - hidden when embedded in the hub */}
            {!embedded && (
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onBack}
                            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4 text-neutral-400" />
                        </button>
                        <div>
                            <h2 className="text-lg font-semibold text-neutral-100">
                                Walk-Forward: <span className={stratColor}>{stratLabel}</span>
                            </h2>
                            <p className="text-xs text-neutral-500">
                                {summary.folds_count} folds -- {summary.folds_done} done -- {fmt(summary.total_wall_time_s / 60, 0)} min
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => handleExport('csv')}
                            disabled={exporting}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 transition-colors disabled:opacity-50"
                        >
                            <Download className="w-3.5 h-3.5" />
                            CSV
                        </button>
                        <button
                            onClick={() => handleExport('json')}
                            disabled={exporting}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 transition-colors disabled:opacity-50"
                        >
                            <Download className="w-3.5 h-3.5" />
                            JSON
                        </button>
                    </div>
                </div>
            )}

            {/* Aggregate KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
                <GlassKPI
                    label="PnL OOS"
                    value={`${fmt(agg.oos_total_pnl_pips)} pips`}
                    variant={agg.oos_total_pnl_pips >= 0 ? 'success' : 'danger'}
                />
                <GlassKPI
                    label="Trades OOS"
                    value={String(agg.oos_total_trades)}
                />
                <GlassKPI
                    label="Win Rate"
                    value={fmtPct(agg.oos_win_rate)}
                    variant={agg.oos_win_rate >= 0.5 ? 'success' : 'danger'}
                />
                <GlassKPI
                    label="Sharpe"
                    value={fmt(agg.oos_sharpe)}
                    variant={agg.oos_sharpe > 0 ? 'success' : 'danger'}
                />
                <GlassKPI
                    label="Profit Factor"
                    value={fmt(agg.oos_profit_factor)}
                    variant={agg.oos_profit_factor >= 1 ? 'success' : 'danger'}
                />
                <GlassKPI
                    label="Max DD"
                    value={`${fmt(agg.oos_max_dd_pips)} pips`}
                    variant="danger"
                />
                <GlassKPI
                    label="IS/OOS Degrad."
                    value={`${fmt(agg.is_vs_oos_degradation_pct, 0)}%`}
                />
                <GlassKPI
                    label="PnL IS"
                    value={`${fmt(agg.is_total_pnl_pips)} pips`}
                    variant={agg.is_total_pnl_pips >= 0 ? 'success' : 'danger'}
                />
            </div>

            {/* Fold-by-fold comparison table */}
            <GlassCard padding="none" className="col-span-12 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5">
                    <h3 className="text-sm font-medium text-neutral-200 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-blue-400" />
                        Folds IS vs OOS
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="text-neutral-500 border-b border-white/5">
                                <th className="text-left px-4 py-2 font-medium w-8"></th>
                                <th className="text-left px-3 py-2 font-medium">Fold</th>
                                <th className="text-center px-3 py-2 font-medium" colSpan={4}>IS (In-Sample)</th>
                                <th className="text-center px-3 py-2 font-medium" colSpan={4}>OOS (Out-of-Sample)</th>
                                <th className="text-center px-3 py-2 font-medium">Degrad.</th>
                            </tr>
                            <tr className="text-neutral-600 border-b border-white/5 text-[10px]">
                                <th></th>
                                <th></th>
                                <th className="px-3 py-1">Trades</th>
                                <th className="px-3 py-1">PnL</th>
                                <th className="px-3 py-1">WR</th>
                                <th className="px-3 py-1">PF</th>
                                <th className="px-3 py-1">Trades</th>
                                <th className="px-3 py-1">PnL</th>
                                <th className="px-3 py-1">WR</th>
                                <th className="px-3 py-1">PF</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {summary.per_fold.map((fold) => (
                                <React.Fragment key={fold.fold_id}>
                                    <tr
                                        className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer transition-colors"
                                        onClick={() => handleExpandFold(fold.fold_id)}
                                    >
                                        <td className="px-4 py-2.5">
                                            {expandedFold === fold.fold_id
                                                ? <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />
                                                : <ChevronRight className="w-3.5 h-3.5 text-neutral-500" />
                                            }
                                        </td>
                                        <td className="px-3 py-2.5 text-neutral-300 font-medium">
                                            F{fold.fold_id}
                                        </td>
                                        {/* IS */}
                                        <td className="px-3 py-2.5 text-center text-neutral-300">{fold.is?.n_trades ?? '--'}</td>
                                        <td className={cn('px-3 py-2.5 text-center font-mono', pnlColor(fold.is?.pnl_pips ?? 0))}>
                                            {fmt(fold.is?.pnl_pips)}
                                        </td>
                                        <td className="px-3 py-2.5 text-center text-neutral-400">{fmtPct(fold.is?.win_rate)}</td>
                                        <td className="px-3 py-2.5 text-center text-neutral-400">{fmt(fold.is?.profit_factor)}</td>
                                        {/* OOS */}
                                        <td className="px-3 py-2.5 text-center text-neutral-300">{fold.oos?.n_trades ?? '--'}</td>
                                        <td className={cn('px-3 py-2.5 text-center font-mono font-medium', pnlColor(fold.oos?.pnl_pips ?? 0))}>
                                            {fmt(fold.oos?.pnl_pips)}
                                        </td>
                                        <td className="px-3 py-2.5 text-center text-neutral-400">{fmtPct(fold.oos?.win_rate)}</td>
                                        <td className="px-3 py-2.5 text-center text-neutral-400">{fmt(fold.oos?.profit_factor)}</td>
                                        {/* Degradation */}
                                        <td className="px-3 py-2.5 text-center">{degradationBadge(fold.degradation_pct)}</td>
                                    </tr>
                                    {expandedFold === fold.fold_id && (
                                        <tr>
                                            <td colSpan={11} className="bg-white/[0.01]">
                                                <FoldDetail
                                                    fold={fold}
                                                    wfId={wfId}
                                                    isTrades={foldTrades[`${fold.fold_id}_is`] || []}
                                                    oosTrades={foldTrades[`${fold.fold_id}_oos`] || []}
                                                />
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </GlassCard>
        </div>
    );
}

// ---------------------------------------------------------------------------
// FoldDetail - expanded view with IS/OOS metrics + trades
// ---------------------------------------------------------------------------

interface FoldDetailProps {
    fold: WalkForwardFold;
    wfId: string;
    isTrades: WalkForwardTrade[];
    oosTrades: WalkForwardTrade[];
}

function FoldDetail({ fold, wfId, isTrades, oosTrades }: FoldDetailProps) {
    const [phase, setPhase] = useState<'oos' | 'is'>('oos');
    const trades = phase === 'oos' ? oosTrades : isTrades;
    const metrics = phase === 'oos' ? fold.oos : fold.is;

    return (
        <div className="px-6 py-4 space-y-3">
            {/* Phase toggle */}
            <div className="flex items-center gap-2">
                <button
                    onClick={() => setPhase('oos')}
                    className={cn(
                        'px-3 py-1 text-xs rounded-md transition-colors',
                        phase === 'oos' ? 'bg-blue-500/20 text-blue-300' : 'text-neutral-500 hover:text-neutral-300',
                    )}
                >
                    OOS
                </button>
                <button
                    onClick={() => setPhase('is')}
                    className={cn(
                        'px-3 py-1 text-xs rounded-md transition-colors',
                        phase === 'is' ? 'bg-white/10 text-neutral-200' : 'text-neutral-500 hover:text-neutral-300',
                    )}
                >
                    IS
                </button>
                <span className="text-[10px] text-neutral-600 ml-2">
                    {metrics?.bars?.toLocaleString()} bars -- {metrics?.avg_holding_s != null ? `${(metrics.avg_holding_s / 60).toFixed(0)} min avg hold` : ''}
                </span>
            </div>

            {/* Metrics row */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                <MetricCell label="PnL" value={`${fmt(metrics?.pnl_pips)} pips`} color={pnlColor(metrics?.pnl_pips ?? 0)} />
                <MetricCell label="Sharpe" value={fmt(metrics?.sharpe)} color={pnlColor(metrics?.sharpe ?? 0)} />
                <MetricCell label="Max DD" value={`${fmt(metrics?.max_dd_pips)} pips`} color="text-rose-400" />
                <MetricCell label="Calmar" value={fmt(metrics?.calmar)} color={pnlColor(metrics?.calmar ?? 0)} />
                <MetricCell label="Avg Trade" value={`${fmt(metrics?.avg_trade_pips)} pips`} color={pnlColor(metrics?.avg_trade_pips ?? 0)} />
                <MetricCell label="Costs" value={`${fmt(metrics?.total_cost_pips)} pips`} color="text-amber-400" />
            </div>

            {/* Trades table */}
            {trades.length > 0 ? (
                <div className="overflow-x-auto max-h-60 overflow-y-auto border border-white/5 rounded-lg">
                    <table className="w-full text-[11px]">
                        <thead className="sticky top-0 bg-neutral-900/95 border-b border-white/5">
                            <tr className="text-neutral-500">
                                <th className="text-left px-3 py-1.5">Direction</th>
                                <th className="text-left px-3 py-1.5">Entry</th>
                                <th className="text-left px-3 py-1.5">Exit</th>
                                <th className="text-right px-3 py-1.5">PnL Net</th>
                                <th className="text-right px-3 py-1.5">Cost</th>
                                <th className="text-left px-3 py-1.5">Reason</th>
                                <th className="text-right px-3 py-1.5">Hold</th>
                            </tr>
                        </thead>
                        <tbody>
                            {trades.map((t, i) => {
                                const pnl = Number(t.pnl_net_pips) || 0;
                                const cost = Number(t.cost_rt_pips) || 0;
                                const holdMin = ((Number(t.holding_seconds) || 0) / 60).toFixed(0);
                                return (
                                    <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                                        <td className="px-3 py-1.5">
                                            <span className={cn(
                                                'px-1.5 py-0.5 rounded text-[10px] font-medium',
                                                t.direction === 'LONG' || t.direction === 'BUY'
                                                    ? 'bg-emerald-500/15 text-emerald-300'
                                                    : 'bg-rose-500/15 text-rose-300',
                                            )}>
                                                {t.direction}
                                            </span>
                                        </td>
                                        <td className="px-3 py-1.5 text-neutral-400 font-mono">{formatTs(t.entry_ts)}</td>
                                        <td className="px-3 py-1.5 text-neutral-400 font-mono">{formatTs(t.exit_ts)}</td>
                                        <td className={cn('px-3 py-1.5 text-right font-mono', pnlColor(pnl))}>{fmt(pnl)}</td>
                                        <td className="px-3 py-1.5 text-right font-mono text-amber-400/70">{fmt(cost)}</td>
                                        <td className="px-3 py-1.5">
                                            <ExitBadge reason={String(t.exit_reason || '')} />
                                        </td>
                                        <td className="px-3 py-1.5 text-right text-neutral-500">{holdMin}m</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <p className="text-xs text-neutral-600 italic">Aucun trade dans ce fold.</p>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function MetricCell({ label, value, color }: { label: string; value: string; color?: string }) {
    return (
        <div className="bg-white/[0.03] rounded-lg px-3 py-2">
            <div className="text-[10px] text-neutral-500 mb-0.5">{label}</div>
            <div className={cn('text-sm font-mono font-medium', color || 'text-neutral-200')}>{value}</div>
        </div>
    );
}

function ExitBadge({ reason }: { reason: string }) {
    let category = 'Other';
    const r = reason.toUpperCase();
    if (r.includes('TP')) category = 'TP';
    else if (r.includes('SL')) category = 'SL';
    else if (r.includes('TIME') || r.includes('TIMEOUT')) category = 'Timeout';
    else if (r.includes('TRAIL')) category = 'Trail';

    const styles: Record<string, string> = {
        TP: 'bg-emerald-500/15 text-emerald-300',
        SL: 'bg-rose-500/15 text-rose-300',
        Timeout: 'bg-amber-500/15 text-amber-300',
        Trail: 'bg-violet-500/15 text-violet-300',
        Other: 'bg-neutral-500/15 text-neutral-400',
    };

    return (
        <span className={cn('px-1.5 py-0.5 rounded text-[10px]', styles[category])}>
            {reason.replace(/_/g, ' ')}
        </span>
    );
}

function formatTs(ts: string | undefined): string {
    if (!ts) return '--';
    try {
        const d = new Date(ts);
        if (isNaN(d.getTime())) return ts.slice(0, 19);
        return d.toISOString().slice(5, 16).replace('T', ' ');
    } catch {
        return ts.slice(0, 16);
    }
}
