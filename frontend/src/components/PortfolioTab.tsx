/**
 * PortfolioTab -- Bento dashboard for the selected portfolio epoch.
 *
 * Layout:
 *   [Epoch Header: selector + badge + advance + inline KPIs]
 *   [KPI Row: 6 metric cards]
 *   [Equity Curve (2/3)  |  Period Breakdown (1/3)]
 *   [Trades Table (full width, scrollable)]
 *   [Export Bar (shocks / signals / trades / all)]
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { usePortfolioEpochContext } from '../lib/PortfolioEpochContext';
import { GlassCard, GlassKPI, GlassBadge, SegmentedControl } from './ui/glass';
import { BentoGrid, BentoCell, KPIRow } from './ui/BentoLayout';
import { EquityCurveChart } from './EquityCurveChart';
import {
    canonicalApi,
    type CanonicalTrade,
} from '../lib/canonicalApi';
import {
    computePaperPortfolioFromClosedTrades,
    sanitizeTradesForPortfolio,
    type PortfolioView,
} from './PNLPanel';
import { type EquityCurvePoint } from '../lib/api';
import { useCommissionView } from '../lib/useCommissionView';
import {
    Download,
    FileJson,
    TrendingUp,
    TrendingDown,
    Activity,
    ChevronDown,
    ChevronUp,
    Plus,
    ArrowUpRight,
    ArrowDownRight,
    BarChart3,
} from 'lucide-react';
import { strategyShortLabel } from '../lib/strategies';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STARTING_EQUITY = 5_000;
const TRADE_PAGE_SIZE = 15;
const EXPORT_LIMIT = 2000;
type PortfolioStrategyFilter =
    | 'ALL'
    | 'damping_wave'
    | 's2_pairs_trading'
    | 'tf_pullback_v1';

const STRATEGY_FILTERS: Array<{
    value: PortfolioStrategyFilter;
    label: string;
}> = [
    { value: 'ALL', label: 'ALL' },
    { value: 'damping_wave', label: 'DW' },
    { value: 's2_pairs_trading', label: 'S2' },
    { value: 'tf_pullback_v1', label: 'S3' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtUsd(v: number | null | undefined): string {
    if (v == null || Number.isNaN(v)) return '--';
    const sign = v >= 0 ? '+' : '';
    return `${sign}$${v.toFixed(2)}`;
}

function fmtPct(v: number | null | undefined): string {
    if (v == null || Number.isNaN(v)) return '--';
    return `${v.toFixed(1)}%`;
}

function fmtPips(v: number | null | undefined): string {
    if (v == null || Number.isNaN(v)) return '--';
    return `${v.toFixed(1)}p`;
}

function fmtDate(v: string | null | undefined): string {
    if (!v) return '--';
    const d = new Date(v);
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function fmtDateShort(v: string | null | undefined): string {
    if (!v) return '--';
    return new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function downloadBlob(content: BlobPart, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function tradeNetUsd(t: CanonicalTrade): number {
    return (
        t.pnl_net_usd_used ??
        t.pnl_net_usd ??
        (t.pnl_net_eur_used != null && t.fx_rate_used != null
            ? t.pnl_net_eur_used * t.fx_rate_used
            : null) ??
        (() => {
            const pips = t.net_pips_used ?? t.pnl_net_pips ?? t.pnl_pips ?? 0;
            const qty = t.qty ?? 0;
            return pips * qty * 0.0001;
        })()
    );
}

function tradeNetPips(t: CanonicalTrade): number {
    return t.net_pips_used ?? t.pnl_net_pips ?? t.pnl_pips ?? 0;
}

function strategyLabel(strategyId: string | null | undefined): string {
    return strategyShortLabel(strategyId);
}

// ---------------------------------------------------------------------------
// Advance Epoch Dialog
// ---------------------------------------------------------------------------

function AdvanceEpochDialog({
    currentEpoch,
    onConfirm,
    onCancel,
    loading,
}: {
    currentEpoch: number;
    onConfirm: () => void;
    onCancel: () => void;
    loading: boolean;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md">
            <GlassCard variant="elevated" padding="lg" className="max-w-md w-full mx-4">
                <h2 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">
                    Nouvel Epoch
                </h2>
                <div className="space-y-3 mb-6">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-neutral-500">Actuel</span>
                        <span className="font-mono text-white">{currentEpoch}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-neutral-500">Nouveau</span>
                        <span className="font-mono text-[#00FF88]">{currentEpoch + 1}</span>
                    </div>
                    <div className="border-t border-white/[0.06] pt-3">
                        <p className="text-xs text-neutral-500 leading-relaxed">
                            Les futurs trades seront tagges epoch {currentEpoch + 1}.
                            Les trades existants restent en epoch {currentEpoch}.
                            Cette action est irreversible.
                        </p>
                    </div>
                </div>
                <div className="flex items-center justify-end gap-3">
                    <button
                        onClick={onCancel}
                        disabled={loading}
                        className="btn btn--ghost btn--sm"
                    >
                        Annuler
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={loading}
                        className="btn btn--primary btn--sm"
                    >
                        {loading ? 'En cours...' : 'Confirmer'}
                    </button>
                </div>
            </GlassCard>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Epoch Header
// ---------------------------------------------------------------------------

function EpochHeader() {
    const {
        currentEpoch,
        selectedEpoch,
        setSelectedEpoch,
        epochs,
        isViewingCurrent,
        advanceEpoch,
        loading,
    } = usePortfolioEpochContext();

    const [showDialog, setShowDialog] = useState(false);
    const [advancing, setAdvancing] = useState(false);

    const selectedSummary = epochs.find((e) => e.epoch === selectedEpoch);

    const handleAdvance = async () => {
        setAdvancing(true);
        const ok = await advanceEpoch();
        setAdvancing(false);
        if (ok) setShowDialog(false);
    };

    if (loading || currentEpoch == null) {
        return (
            <GlassCard padding="md">
                <div className="animate-pulse flex items-center gap-4">
                    <div className="h-5 w-32 bg-white/10 rounded" />
                    <div className="h-5 w-20 bg-white/10 rounded" />
                </div>
            </GlassCard>
        );
    }

    return (
        <>
            <GlassCard padding="md">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    {/* Left: Selector + Badge */}
                    <div className="flex items-center gap-3">
                        <label className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">
                            Portfolio
                        </label>
                        <select
                            value={selectedEpoch ?? ''}
                            onChange={(e) => setSelectedEpoch(Number(e.target.value))}
                            className="bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-[#00FF88]/30 transition-colors"
                        >
                            {epochs.map((ep) => (
                                <option key={ep.epoch} value={ep.epoch}>
                                    Epoch {ep.epoch}
                                    {ep.is_current ? ' (actuel)' : ''}
                                </option>
                            ))}
                            {currentEpoch != null && !epochs.find((e) => e.epoch === currentEpoch) && (
                                <option value={currentEpoch}>
                                    Epoch {currentEpoch} (actuel)
                                </option>
                            )}
                        </select>
                        {isViewingCurrent ? (
                            <GlassBadge variant="success" size="sm" pulse>LIVE</GlassBadge>
                        ) : (
                            <GlassBadge variant="muted" size="sm">ARCHIVE</GlassBadge>
                        )}
                    </div>

                    {/* Right: Quick stats + button */}
                    <div className="flex items-center gap-4">
                        {selectedSummary && (
                            <div className="flex items-center gap-5">
                                <div className="text-right">
                                    <div className="text-[9px] uppercase tracking-wider text-neutral-500">Trades</div>
                                    <div className="text-sm font-mono text-white">{selectedSummary.closed_count}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[9px] uppercase tracking-wider text-neutral-500">PnL</div>
                                    <div className={`text-sm font-mono ${selectedSummary.pnl_usd >= 0 ? 'text-[#00FF88]' : 'text-red-400'}`}>
                                        {fmtUsd(selectedSummary.pnl_usd)}
                                    </div>
                                </div>
                                {selectedSummary.first_trade && (
                                    <div className="text-right">
                                        <div className="text-[9px] uppercase tracking-wider text-neutral-500">Debut</div>
                                        <div className="text-sm font-mono text-neutral-300">{fmtDateShort(selectedSummary.first_trade)}</div>
                                    </div>
                                )}
                            </div>
                        )}
                        <button
                            onClick={() => setShowDialog(true)}
                            className="btn btn--ghost btn--sm whitespace-nowrap flex items-center gap-1.5"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Nouvel Epoch
                        </button>
                    </div>
                </div>
            </GlassCard>

            {showDialog && currentEpoch != null && (
                <AdvanceEpochDialog
                    currentEpoch={currentEpoch}
                    onConfirm={handleAdvance}
                    onCancel={() => setShowDialog(false)}
                    loading={advancing}
                />
            )}
        </>
    );
}

function StrategyScopeSelector({
    selected,
    onChange,
    stats,
}: {
    selected: PortfolioStrategyFilter;
    onChange: (next: PortfolioStrategyFilter) => void;
    stats: {
        all: { count: number; pnlUsd: number };
        dw: { count: number; pnlUsd: number };
        s2: { count: number; pnlUsd: number };
        s3: { count: number; pnlUsd: number };
    };
}) {
    const summaryByFilter: Record<
        PortfolioStrategyFilter,
        { count: number; pnlUsd: number }
    > = {
        ALL: stats.all,
        damping_wave: stats.dw,
        s2_pairs_trading: stats.s2,
        tf_pullback_v1: stats.s3,
    };

    return (
        <GlassCard padding="sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">
                    Scope Strategie
                </div>
                <div className="flex flex-col md:items-end gap-1.5">
                    <SegmentedControl
                        options={STRATEGY_FILTERS.map((opt) => ({
                            value: opt.value,
                            label: opt.label,
                        }))}
                        value={selected}
                        onChange={onChange}
                        size="sm"
                    />
                    <div className="text-[10px] font-mono text-neutral-500">
                        {summaryByFilter[selected].count} trades ·{" "}
                        {fmtUsd(summaryByFilter[selected].pnlUsd)}
                    </div>
                </div>
            </div>
        </GlassCard>
    );
}

// ---------------------------------------------------------------------------
// KPI Bento Row
// ---------------------------------------------------------------------------

function KPIBentoRow({ portfolio }: { portfolio: PortfolioView | null }) {
    if (!portfolio) {
        return (
            <KPIRow columns={6}>
                {Array.from({ length: 6 }).map((_, i) => (
                    <GlassKPI key={i} label="--" value="--" loading />
                ))}
            </KPIRow>
        );
    }

    const m = portfolio.metrics;
    const profitFactor = (() => {
        const series = portfolio.equitySeries;
        let gains = 0;
        let losses = 0;
        for (let i = 1; i < series.length; i++) {
            const diff = series[i].y - series[i - 1].y;
            if (diff > 0) gains += diff;
            else losses += Math.abs(diff);
        }
        return losses > 0 ? gains / losses : gains > 0 ? Infinity : 0;
    })();

    return (
        <KPIRow columns={6}>
            <GlassKPI
                label="PnL Net"
                value={fmtUsd(m.totalPnlNetUsd)}
                variant={m.totalPnlNetUsd >= 0 ? 'success' : 'danger'}
                size="md"
            />
            <GlassKPI
                label="Win Rate"
                value={fmtPct(m.winRate)}
                variant={m.winRate >= 50 ? 'success' : m.winRate >= 40 ? 'warning' : 'danger'}
                size="md"
            />
            <GlassKPI
                label="Trades"
                value={m.trades}
                size="md"
            />
            <GlassKPI
                label="Max Drawdown"
                value={fmtUsd(-m.maxDrawdownUsd)}
                variant="danger"
                size="md"
            />
            <GlassKPI
                label="Return"
                value={fmtPct(m.returnPct)}
                variant={m.returnPct >= 0 ? 'success' : 'danger'}
                size="md"
            />
            <GlassKPI
                label="Profit Factor"
                value={profitFactor === Infinity ? 'INF' : profitFactor.toFixed(2)}
                variant={profitFactor >= 1.5 ? 'success' : profitFactor >= 1 ? 'warning' : 'danger'}
                size="md"
            />
        </KPIRow>
    );
}

// ---------------------------------------------------------------------------
// Period Breakdown Card
// ---------------------------------------------------------------------------

function PeriodBreakdown({
    portfolio,
    closedTrades,
}: {
    portfolio: PortfolioView | null;
    closedTrades: CanonicalTrade[];
}) {
    const m = portfolio?.metrics;
    const closed = closedTrades;

    // Last 7 trades stats
    const last7 = useMemo(() => {
        const recent = closed.slice(-7);
        if (!recent.length) return null;
        const pnl = recent.reduce((acc, t) => acc + tradeNetUsd(t), 0);
        const wins = recent.filter(t => tradeNetUsd(t) > 0).length;
        return { pnl, wins, total: recent.length };
    }, [closed]);

    // Streak
    const streak = useMemo(() => {
        if (!closed.length) return { type: 'none' as const, count: 0 };
        let count = 0;
        const lastPnl = tradeNetUsd(closed[closed.length - 1]);
        const isWin = lastPnl > 0;
        for (let i = closed.length - 1; i >= 0; i--) {
            const pnl = tradeNetUsd(closed[i]);
            if ((pnl > 0) === isWin) count++;
            else break;
        }
        return { type: isWin ? 'win' as const : 'loss' as const, count };
    }, [closed]);

    // Best / worst trade
    const bestWorst = useMemo(() => {
        if (!closed.length) return null;
        let best = closed[0];
        let worst = closed[0];
        for (const t of closed) {
            if (tradeNetUsd(t) > tradeNetUsd(best)) best = t;
            if (tradeNetUsd(t) < tradeNetUsd(worst)) worst = t;
        }
        return { best, worst };
    }, [closed]);

    // Avg trade pips
    const avgPips = useMemo(() => {
        if (!closed.length) return 0;
        return closed.reduce((acc, t) => acc + tradeNetPips(t), 0) / closed.length;
    }, [closed]);

    return (
        <GlassCard padding="md" className="h-full">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-4 font-medium">Breakdown</div>
            <div className="text-[10px] text-neutral-500 mb-3">
                Scope: trades canoniques fermes (run/session), pas fills IB bruts.
            </div>
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-400">Equity</span>
                    <span className="text-sm font-mono text-white">${m ? m.equity.toFixed(0) : '--'}</span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-400">PnL Pips</span>
                    <span className="text-sm font-mono text-neutral-300">{m ? fmtPips(m.totalPnlPips) : '--'}</span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-400">Commissions</span>
                    <span className="text-sm font-mono text-red-400">{m ? `-$${m.commissionUsd.toFixed(2)}` : '--'}</span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-400">Avg Trade</span>
                    <span className="text-sm font-mono text-neutral-300">{fmtPips(avgPips)}</span>
                </div>

                <div className="border-t border-white/[0.06] pt-3">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-neutral-400">Streak</span>
                        <span className={`text-sm font-mono ${streak.type === 'win' ? 'text-[#00FF88]' : streak.type === 'loss' ? 'text-red-400' : 'text-neutral-500'}`}>
                            {streak.count > 0 ? `${streak.count} ${streak.type === 'win' ? 'W' : 'L'}` : '--'}
                        </span>
                    </div>
                    {last7 && (
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-neutral-400">Last 7</span>
                            <span className={`text-sm font-mono ${last7.pnl >= 0 ? 'text-[#00FF88]' : 'text-red-400'}`}>
                                {fmtUsd(last7.pnl)} ({last7.wins}W)
                            </span>
                        </div>
                    )}
                </div>

                {bestWorst && (
                    <div className="border-t border-white/[0.06] pt-3">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-neutral-400 flex items-center gap-1">
                                <ArrowUpRight className="w-3 h-3 text-[#00FF88]" /> Best
                            </span>
                            <span className="text-sm font-mono text-[#00FF88]">{fmtUsd(tradeNetUsd(bestWorst.best))}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-neutral-400 flex items-center gap-1">
                                <ArrowDownRight className="w-3 h-3 text-red-400" /> Worst
                            </span>
                            <span className="text-sm font-mono text-red-400">{fmtUsd(tradeNetUsd(bestWorst.worst))}</span>
                        </div>
                    </div>
                )}
            </div>
        </GlassCard>
    );
}

// ---------------------------------------------------------------------------
// Trades Table
// ---------------------------------------------------------------------------

function TradesTable({
    closedTrades,
    showStrategy,
}: {
    closedTrades: CanonicalTrade[];
    showStrategy: boolean;
}) {
    const [page, setPage] = useState(0);
    const [sortCol, setSortCol] = useState<'exit_time' | 'pnl'>('exit_time');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    const closed = closedTrades;

    const sorted = useMemo(() => {
        const arr = [...closed];
        arr.sort((a, b) => {
            let va: number, vb: number;
            if (sortCol === 'pnl') {
                va = tradeNetUsd(a);
                vb = tradeNetUsd(b);
            } else {
                va = new Date(a.exit_time || a.entry_time).getTime();
                vb = new Date(b.exit_time || b.entry_time).getTime();
            }
            return sortDir === 'desc' ? vb - va : va - vb;
        });
        return arr;
    }, [closed, sortCol, sortDir]);

    const totalPages = Math.ceil(sorted.length / TRADE_PAGE_SIZE);
    const paged = sorted.slice(page * TRADE_PAGE_SIZE, (page + 1) * TRADE_PAGE_SIZE);

    const handleSort = (col: 'exit_time' | 'pnl') => {
        if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
        else { setSortCol(col); setSortDir('desc'); }
    };

    const SortIcon = ({ col }: { col: string }) => {
        if (sortCol !== col) return null;
        return sortDir === 'desc' ? <ChevronDown className="w-3 h-3 inline ml-0.5" /> : <ChevronUp className="w-3 h-3 inline ml-0.5" />;
    };

    if (!closed.length) {
        return (
            <GlassCard padding="md">
                <div className="text-center py-8">
                    <Activity className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
                    <div className="text-sm text-neutral-400">Aucun trade dans cet epoch</div>
                </div>
            </GlassCard>
        );
    }

    return (
        <GlassCard padding="none">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">
                    Trades ({closed.length})
                </div>
                <div className="text-[10px] text-neutral-500">
                    Page {page + 1}/{totalPages || 1}
                </div>
            </div>
            <div className="px-4 py-2 text-[10px] text-neutral-500 border-b border-white/[0.04]">
                Vue trade-level: un trade peut contenir plusieurs executions IB.
            </div>
            <div className="overflow-x-auto glass-scroll">
                <table className="glass-table w-full">
                    <thead>
                        <tr>
                            <th className="w-8">#</th>
                            {showStrategy && <th>Strat</th>}
                            <th>Side</th>
                            <th className="cursor-pointer select-none" onClick={() => handleSort('exit_time')}>
                                Exit <SortIcon col="exit_time" />
                            </th>
                            <th>Entry</th>
                            <th>Exit Px</th>
                            <th className="cursor-pointer select-none" onClick={() => handleSort('pnl')}>
                                PnL USD <SortIcon col="pnl" />
                            </th>
                            <th>PnL Pips</th>
                            <th>Reason</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paged.map((t, i) => {
                            const pnl = tradeNetUsd(t);
                            const pips = tradeNetPips(t);
                            const isWin = pnl > 0;
                            return (
                                <tr key={`${t.trade_id || t.canonical_id || i}:${t.strategy_id || ''}`}>
                                    <td className="text-neutral-500 font-mono text-[11px]">
                                        {page * TRADE_PAGE_SIZE + i + 1}
                                    </td>
                                    {showStrategy && (
                                        <td className="text-[10px] font-semibold text-cyan-300">
                                            {strategyLabel(t.strategy_id)}
                                        </td>
                                    )}
                                    <td>
                                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${t.side === 'BUY' ? 'text-[#00FF88]' : 'text-red-400'}`}>
                                            {t.side === 'BUY' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                            {t.side}
                                        </span>
                                    </td>
                                    <td className="font-mono text-[11px] text-neutral-300">{fmtDate(t.exit_time)}</td>
                                    <td className="font-mono text-[11px] text-neutral-400">{t.entry_price?.toFixed(5) ?? '--'}</td>
                                    <td className="font-mono text-[11px] text-neutral-400">{t.exit_price?.toFixed(5) ?? '--'}</td>
                                    <td className={`font-mono text-[11px] font-medium ${isWin ? 'text-[#00FF88]' : 'text-red-400'}`}>
                                        {fmtUsd(pnl)}
                                    </td>
                                    <td className={`font-mono text-[11px] ${isWin ? 'text-[#00FF88]/70' : 'text-red-400/70'}`}>
                                        {fmtPips(pips)}
                                    </td>
                                    <td>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                                            t.exit_reason === 'TP' ? 'bg-[#00FF88]/10 text-[#00FF88]' :
                                            t.exit_reason === 'SL' ? 'bg-red-500/10 text-red-400' :
                                            'bg-white/5 text-neutral-400'
                                        }`}>
                                            {t.exit_reason || '--'}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 px-4 py-3 border-t border-white/[0.06]">
                    <button
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="btn btn--ghost btn--sm text-[10px] disabled:opacity-30"
                    >
                        Prec
                    </button>
                    {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
                        const pageNum = totalPages <= 7 ? i : (
                            page <= 3 ? i :
                            page >= totalPages - 4 ? totalPages - 7 + i :
                            page - 3 + i
                        );
                        return (
                            <button
                                key={pageNum}
                                onClick={() => setPage(pageNum)}
                                className={`w-7 h-7 rounded-md text-[10px] font-mono transition-colors ${
                                    page === pageNum
                                        ? 'bg-[#00FF88]/15 text-[#00FF88] border border-[#00FF88]/30'
                                        : 'text-neutral-400 hover:text-white hover:bg-white/5'
                                }`}
                            >
                                {pageNum + 1}
                            </button>
                        );
                    })}
                    <button
                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={page >= totalPages - 1}
                        className="btn btn--ghost btn--sm text-[10px] disabled:opacity-30"
                    >
                        Suiv
                    </button>
                </div>
            )}
        </GlassCard>
    );
}

// ---------------------------------------------------------------------------
// Export Bar
// ---------------------------------------------------------------------------

function ExportBar({
    trades,
    closedTrades,
    selectedEpoch,
    strategyFilter,
}: {
    trades: CanonicalTrade[];
    closedTrades: CanonicalTrade[];
    selectedEpoch: number | null;
    strategyFilter: PortfolioStrategyFilter;
}) {
    const [exporting, setExporting] = useState<string | null>(null);

    const exportTrades = useCallback(async (format: 'json' | 'csv') => {
        setExporting('trades');
        try {
            if (format === 'json') {
                const payload = {
                    portfolio_epoch: selectedEpoch,
                    strategy_filter: strategyFilter,
                    exported_at: new Date().toISOString(),
                    trade_count: closed.length,
                    trades: closed.map(t => ({
                        trade_id: t.trade_id,
                        signal_id: t.signal_id,
                        run_id: t.run_id,
                        strategy_id: t.strategy_id,
                        symbol: t.symbol,
                        side: t.side,
                        qty: t.qty,
                        entry_price: t.entry_price,
                        exit_price: t.exit_price,
                        entry_time: t.entry_time,
                        exit_time: t.exit_time,
                        exit_reason: t.exit_reason,
                        pnl_net_usd: tradeNetUsd(t),
                        pnl_net_pips: tradeNetPips(t),
                        status: t.status,
                    })),
                };
                downloadBlob(
                    JSON.stringify(payload, null, 2),
                    `trades_epoch${selectedEpoch ?? 'all'}.json`,
                    'application/json'
                );
            } else {
                const header = 'trade_id,signal_id,run_id,strategy_id,symbol,side,qty,entry_price,exit_price,entry_time,exit_time,exit_reason,pnl_net_usd,pnl_net_pips,status';
                const rows = closed.map(t =>
                    [
                        t.trade_id, t.signal_id, t.run_id, t.strategy_id, t.symbol, t.side, t.qty,
                        t.entry_price, t.exit_price, t.entry_time, t.exit_time,
                        t.exit_reason ?? '', tradeNetUsd(t).toFixed(4), tradeNetPips(t).toFixed(2), t.status,
                    ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
                );
                downloadBlob(
                    [header, ...rows].join('\n'),
                    `trades_epoch${selectedEpoch ?? 'all'}.csv`,
                    'text/csv'
                );
            }
        } finally {
            setExporting(null);
        }
    }, [trades, selectedEpoch]);

    const exportAll = useCallback(async () => {
        setExporting('all');
        try {
            const portfolio = computePaperPortfolioFromClosedTrades(
                closedTrades,
                STARTING_EQUITY,
                'economic'
            );
            const payload = {
                portfolio_epoch: selectedEpoch,
                strategy_filter: strategyFilter,
                exported_at: new Date().toISOString(),
                summary: portfolio ? {
                    pnl_net_usd: portfolio.metrics.totalPnlNetUsd,
                    win_rate: portfolio.metrics.winRate,
                    trades: portfolio.metrics.trades,
                    max_drawdown_usd: portfolio.metrics.maxDrawdownUsd,
                    return_pct: portfolio.metrics.returnPct,
                    commission_usd: portfolio.metrics.commissionUsd,
                    equity: portfolio.metrics.equity,
                } : null,
                trade_count: closed.length,
                trades: closed.map(t => ({
                    trade_id: t.trade_id,
                    signal_id: t.signal_id,
                    run_id: t.run_id,
                    strategy_id: t.strategy_id,
                    symbol: t.symbol,
                    side: t.side,
                    qty: t.qty,
                    entry_price: t.entry_price,
                    exit_price: t.exit_price,
                    entry_time: t.entry_time,
                    exit_time: t.exit_time,
                    exit_reason: t.exit_reason,
                    pnl_net_usd: tradeNetUsd(t),
                    pnl_net_pips: tradeNetPips(t),
                    status: t.status,
                    commission_usd: t.commission_rt_usd_used ?? t.commission_total_usd ?? 0,
                    entry_slippage_pips: t.entry_slippage_pips,
                    exit_slippage_pips: t.exit_slippage_pips,
                })),
            };
            downloadBlob(
                JSON.stringify(payload, null, 2),
                `portfolio_epoch${selectedEpoch ?? 'all'}_export.json`,
                'application/json'
            );
        } finally {
            setExporting(null);
        }
    }, [closedTrades, selectedEpoch, strategyFilter]);

    const btnBase = "flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-medium transition-all duration-200";
    const btnIdle = "border-white/[0.08] bg-white/[0.03] text-neutral-400 hover:text-white hover:bg-white/[0.06] hover:border-white/[0.12]";
    const btnActive = "border-[#00FF88]/30 bg-[#00FF88]/10 text-[#00FF88]";

    return (
        <GlassCard padding="md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">
                    Export Epoch {selectedEpoch ?? '--'} · {strategyFilter}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={() => exportTrades('json')}
                        disabled={exporting !== null}
                        className={`${btnBase} ${exporting === 'trades' ? btnActive : btnIdle}`}
                    >
                        <FileJson className="w-3.5 h-3.5" />
                        Trades JSON
                    </button>
                    <button
                        onClick={() => exportTrades('csv')}
                        disabled={exporting !== null}
                        className={`${btnBase} ${exporting === 'trades' ? btnActive : btnIdle}`}
                    >
                        <BarChart3 className="w-3.5 h-3.5" />
                        Trades CSV
                    </button>
                    <div className="w-px h-5 bg-white/[0.08]" />
                    <button
                        onClick={exportAll}
                        disabled={exporting !== null}
                        className={`${btnBase} ${exporting === 'all' ? btnActive : 'border-[#00FF88]/20 bg-[#00FF88]/[0.04] text-[#00FF88]/80 hover:text-[#00FF88] hover:bg-[#00FF88]/10 hover:border-[#00FF88]/30'}`}
                    >
                        <Download className="w-3.5 h-3.5" />
                        Export complet
                    </button>
                </div>
            </div>
        </GlassCard>
    );
}

// ---------------------------------------------------------------------------
// Equity Curve Section
// ---------------------------------------------------------------------------

function EquitySection({
    equityCurve,
    loading,
}: {
    equityCurve: EquityCurvePoint[];
    loading: boolean;
}) {
    if (loading) {
        return (
            <GlassCard padding="md" className="h-full">
                <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-3 font-medium">Equity Curve</div>
                <div className="animate-pulse h-[280px] bg-white/[0.03] rounded-lg" />
            </GlassCard>
        );
    }

    if (!equityCurve.length) {
        return (
            <GlassCard padding="md" className="h-full">
                <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-3 font-medium">Equity Curve</div>
                <div className="flex items-center justify-center h-[280px]">
                    <div className="text-center">
                        <BarChart3 className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
                        <div className="text-xs text-neutral-500">Pas de trades</div>
                    </div>
                </div>
            </GlassCard>
        );
    }

    return (
        <GlassCard padding="md" className="h-full">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1 font-medium">Equity Curve</div>
            <EquityCurveChart
                equityCurve={equityCurve}
                startingEquity={STARTING_EQUITY}
                height={280}
            />
        </GlassCard>
    );
}

// ---------------------------------------------------------------------------
// PortfolioTab (main export)
// ---------------------------------------------------------------------------

export function PortfolioTab() {
    const { selectedEpoch } = usePortfolioEpochContext();
    const { commissionView } = useCommissionView();
    const [strategyFilter, setStrategyFilter] =
        useState<PortfolioStrategyFilter>('ALL');

    // ------ Data State ------
    const [trades, setTrades] = useState<CanonicalTrade[]>([]);
    const [tradesLoading, setTradesLoading] = useState(true);
    const [tradesError, setTradesError] = useState<string | null>(null);

    // ------ Fetch trades ------
    useEffect(() => {
        let cancelled = false;
        async function load() {
            setTradesLoading(true);
            setTradesError(null);
            try {
                const payload = await canonicalApi.getPortfolioTrades({
                    limit: 500,
                    portfolioEpoch: selectedEpoch ?? undefined,
                    commissionView,
                    responseMode: 'compact',
                });
                if (!cancelled) {
                    setTrades(payload.trades ?? []);
                    setTradesError(null);
                }
            } catch (e: unknown) {
                if (!cancelled) {
                    setTradesError(e instanceof Error ? e.message : 'Erreur chargement trades');
                }
            } finally {
                if (!cancelled) setTradesLoading(false);
            }
        }
        load();
        return () => { cancelled = true; };
    }, [selectedEpoch, commissionView]);

    const filteredTrades = useMemo(() => {
        if (strategyFilter === 'ALL') return trades;
        return trades.filter((trade) => trade.strategy_id === strategyFilter);
    }, [trades, strategyFilter]);

    const closedTrades = useMemo(
        () => sanitizeTradesForPortfolio(trades, STARTING_EQUITY),
        [trades]
    );

    const filteredClosedTrades = useMemo(() => {
        if (strategyFilter === 'ALL') return closedTrades;
        return closedTrades.filter((trade) => trade.strategy_id === strategyFilter);
    }, [closedTrades, strategyFilter]);

    const strategyStats = useMemo(() => {
        const sumBy = (strategyId?: string) => {
            const scoped = strategyId
                ? closedTrades.filter((t) => t.strategy_id === strategyId)
                : closedTrades;
            return {
                count: scoped.length,
                pnlUsd: scoped.reduce((acc, t) => acc + tradeNetUsd(t), 0),
            };
        };
        return {
            all: sumBy(undefined),
            dw: sumBy('damping_wave'),
            s2: sumBy('s2_pairs_trading'),
            s3: sumBy('tf_pullback_v1'),
        };
    }, [closedTrades]);

    // ------ Compute portfolio ------
    const portfolio = useMemo(
        () =>
            computePaperPortfolioFromClosedTrades(
                filteredClosedTrades,
                STARTING_EQUITY,
                commissionView
            ),
        [filteredClosedTrades, commissionView],
    );
    const equityCurve = useMemo<EquityCurvePoint[]>(() => {
        if (!portfolio) return [];
        const closed = [...filteredClosedTrades].sort((a, b) => {
            const ta = new Date(a.exit_time || a.entry_time).getTime();
            const tb = new Date(b.exit_time || b.entry_time).getTime();
            return ta - tb;
        });
        return portfolio.equitySeries.map((point, index) => {
            const trade = closed[index];
            return {
                timestamp: new Date(point.x).toISOString(),
                equity: point.y,
                trade_id: trade?.trade_id ?? `trade_${index}`,
                pnl: trade ? tradeNetUsd(trade) : 0,
            };
        });
    }, [filteredClosedTrades, portfolio]);
    const equityLoading = tradesLoading && equityCurve.length === 0;

    return (
        <div className="space-y-4">
            {/* Row 0: Epoch Header */}
            <EpochHeader />

            {/* Row 1: Strategy Scope */}
            <StrategyScopeSelector
                selected={strategyFilter}
                onChange={setStrategyFilter}
                stats={strategyStats}
            />

            {/* Row 2: KPI Row */}
            <KPIBentoRow portfolio={portfolio} />

            {/* Row 3: Equity Curve + Breakdown */}
            <BentoGrid columns={3} gap="md">
                <BentoCell colSpan={2}>
                    <EquitySection equityCurve={equityCurve} loading={equityLoading} />
                </BentoCell>
                <BentoCell colSpan={1}>
                    <PeriodBreakdown
                        portfolio={portfolio}
                        closedTrades={filteredClosedTrades}
                    />
                </BentoCell>
            </BentoGrid>

            {/* Row 4: Trades Table */}
            {tradesLoading ? (
                <GlassCard padding="md">
                    <div className="animate-pulse space-y-2">
                        <div className="h-4 w-24 bg-white/10 rounded" />
                        <div className="h-40 bg-white/[0.03] rounded-lg" />
                    </div>
                </GlassCard>
            ) : tradesError ? (
                <GlassCard padding="md" variant="danger">
                    <div className="text-sm text-red-400">{tradesError}</div>
                </GlassCard>
            ) : (
                <TradesTable
                    closedTrades={filteredClosedTrades}
                    showStrategy={strategyFilter === 'ALL'}
                />
            )}

            {/* Row 5: Export Bar */}
            <ExportBar
                trades={filteredTrades}
                closedTrades={filteredClosedTrades}
                selectedEpoch={selectedEpoch}
                strategyFilter={strategyFilter}
            />
        </div>
    );
}
