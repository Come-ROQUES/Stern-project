/**
 * BacktestTradesTable.tsx - Complete trades table with all TradeRecord fields.
 *
 * Supports: backtest single-run OR walk-forward aggregate trades.
 * Features: filters (direction, exit_reason, fold, phase), sort, export, column toggle.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Filter, ChevronUp, ChevronDown, Columns3 } from 'lucide-react';
import { GlassCard, GlassBadge } from '../ui/glass';
import {
    extractTradePnl,
    classifyExitReason,
    fmtTimestamp,
    fmtDuration,
    fmt,
    EXIT_COLORS,
} from '../../lib/backtestUtils';
import {
    getWalkForwardAllTrades,
    type WalkForwardTrade,
} from '../../lib/quantApi';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

interface ColDef {
    key: string;
    label: string;
    defaultVisible: boolean;
    sortable: boolean;
    width?: string;
    format: (row: Record<string, unknown>) => React.ReactNode;
}

function pnlColor(v: number): string {
    if (v > 0) return 'text-emerald-400';
    if (v < 0) return 'text-rose-400';
    return 'text-neutral-500';
}

function ExitBadge({ reason }: { reason: string }) {
    const cls = classifyExitReason({ exit_reason: reason });
    const colorMap: Record<string, string> = {
        TP: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        SL: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
        Timeout: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        Trail: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    };
    return (
        <span className={cn(
            'inline-block px-1.5 py-0.5 text-[10px] font-medium rounded border',
            colorMap[cls] ?? 'bg-neutral-500/20 text-neutral-300 border-neutral-500/30',
        )}>
            {reason}
        </span>
    );
}

function DirBadge({ dir }: { dir: string }) {
    const isBuy = dir === 'BUY';
    return (
        <span className={cn(
            'inline-block px-1.5 py-0.5 text-[10px] font-bold rounded',
            isBuy ? 'bg-cyan-500/20 text-cyan-300' : 'bg-orange-500/20 text-orange-300',
        )}>
            {dir}
        </span>
    );
}

const ALL_COLUMNS: ColDef[] = [
    { key: 'fold', label: 'Fold', defaultVisible: false, sortable: true, width: 'w-12',
      format: (r) => <span className="font-mono text-neutral-400">{String(r.fold ?? '--')}</span> },
    { key: 'direction', label: 'Dir', defaultVisible: true, sortable: true, width: 'w-14',
      format: (r) => <DirBadge dir={String(r.direction ?? '')} /> },
    { key: 'entry_ts', label: 'Entry', defaultVisible: true, sortable: true, width: 'w-32',
      format: (r) => <span className="font-mono text-[10px]">{fmtTimestamp(String(r.entry_ts ?? ''))}</span> },
    { key: 'exit_ts', label: 'Exit', defaultVisible: true, sortable: true, width: 'w-32',
      format: (r) => <span className="font-mono text-[10px]">{fmtTimestamp(String(r.exit_ts ?? ''))}</span> },
    { key: 'entry_price', label: 'Entry Px', defaultVisible: true, sortable: true, width: 'w-20',
      format: (r) => <span className="font-mono">{fmt(Number(r.entry_price) || 0, 5)}</span> },
    { key: 'exit_price', label: 'Exit Px', defaultVisible: true, sortable: true, width: 'w-20',
      format: (r) => <span className="font-mono">{fmt(Number(r.exit_price) || 0, 5)}</span> },
    { key: 'pnl_net_pips', label: 'PnL Net', defaultVisible: true, sortable: true, width: 'w-16',
      format: (r) => {
          const v = extractTradePnl(r);
          return <span className={cn('font-mono font-semibold', pnlColor(v))}>{fmt(v)}</span>;
      } },
    { key: 'pnl_gross_pips', label: 'PnL Gross', defaultVisible: false, sortable: true, width: 'w-16',
      format: (r) => <span className="font-mono">{fmt(Number(r.pnl_gross_pips) || 0)}</span> },
    { key: 'pnl_net_usd', label: 'PnL $', defaultVisible: false, sortable: true, width: 'w-16',
      format: (r) => {
          const v = Number(r.pnl_net_usd) || 0;
          return <span className={cn('font-mono', pnlColor(v))}>{fmt(v)}</span>;
      } },
    { key: 'cost_rt_pips', label: 'Cost', defaultVisible: true, sortable: true, width: 'w-14',
      format: (r) => <span className="font-mono text-amber-300/70">{fmt(Number(r.cost_rt_pips) || 0)}</span> },
    { key: 'exit_reason', label: 'Exit', defaultVisible: true, sortable: true, width: 'w-24',
      format: (r) => <ExitBadge reason={String(r.exit_reason ?? '')} /> },
    { key: 'holding_seconds', label: 'Hold', defaultVisible: true, sortable: true, width: 'w-16',
      format: (r) => <span className="font-mono text-[10px]">{fmtDuration(Number(r.holding_seconds) || 0)}</span> },
    { key: 'holding_bars', label: 'Bars', defaultVisible: false, sortable: true, width: 'w-12',
      format: (r) => <span className="font-mono">{String(r.holding_bars ?? '--')}</span> },
    { key: 'tp_price', label: 'TP Px', defaultVisible: false, sortable: true, width: 'w-20',
      format: (r) => <span className="font-mono">{fmt(Number(r.tp_price) || 0, 5)}</span> },
    { key: 'sl_price', label: 'SL Px', defaultVisible: false, sortable: true, width: 'w-20',
      format: (r) => <span className="font-mono">{fmt(Number(r.sl_price) || 0, 5)}</span> },
    { key: 'tp_pips', label: 'TP pips', defaultVisible: false, sortable: true, width: 'w-14',
      format: (r) => <span className="font-mono">{fmt(Number(r.tp_pips) || 0)}</span> },
    { key: 'sl_pips', label: 'SL pips', defaultVisible: false, sortable: true, width: 'w-14',
      format: (r) => <span className="font-mono">{fmt(Number(r.sl_pips) || 0)}</span> },
    { key: 'mfe_pips', label: 'MFE', defaultVisible: true, sortable: true, width: 'w-14',
      format: (r) => <span className="font-mono text-emerald-400/70">{fmt(Number(r.mfe_pips) || 0)}</span> },
    { key: 'mae_pips', label: 'MAE', defaultVisible: true, sortable: true, width: 'w-14',
      format: (r) => <span className="font-mono text-rose-400/70">{fmt(Number(r.mae_pips) || 0)}</span> },
    { key: 'entry_spread_pips', label: 'Spread', defaultVisible: false, sortable: true, width: 'w-14',
      format: (r) => <span className="font-mono">{fmt(Number(r.entry_spread_pips) || 0)}</span> },
    { key: 'entry_z_score', label: 'Z-Score', defaultVisible: false, sortable: true, width: 'w-14',
      format: (r) => <span className="font-mono">{r.entry_z_score != null ? fmt(Number(r.entry_z_score), 2) : '--'}</span> },
    { key: 'volatility_regime', label: 'Regime', defaultVisible: false, sortable: true, width: 'w-20',
      format: (r) => <span className="text-[10px] text-neutral-400">{String(r.volatility_regime ?? '--')}</span> },
    { key: 'signal_id', label: 'Signal ID', defaultVisible: false, sortable: false, width: 'w-24',
      format: (r) => <span className="font-mono text-[9px] text-neutral-500 truncate block max-w-[120px]">{String(r.signal_id ?? '--')}</span> },
    { key: 'trade_id', label: 'Trade ID', defaultVisible: false, sortable: false, width: 'w-24',
      format: (r) => <span className="font-mono text-[9px] text-neutral-500 truncate block max-w-[120px]">{String(r.trade_id ?? '--')}</span> },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BacktestTradesTableProps {
    /** Single backtest run mode */
    runId?: string | null;
    /** Walk-forward mode */
    wfId?: string | null;
    /** WF phase */
    phase?: 'is' | 'oos';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BacktestTradesTable({ runId, wfId, phase = 'oos' }: BacktestTradesTableProps) {
    const [trades, setTrades] = useState<Record<string, unknown>[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);

    // Filters
    const [dirFilter, setDirFilter] = useState<string>('ALL');
    const [exitFilter, setExitFilter] = useState<string>('ALL');
    const [foldFilter, setFoldFilter] = useState<string>('ALL');
    const [showFilters, setShowFilters] = useState(false);

    // Sort
    const [sortKey, setSortKey] = useState<string>('entry_ts');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    // Column visibility
    const [visibleCols, setVisibleCols] = useState<Set<string>>(
        () => new Set(ALL_COLUMNS.filter((c) => c.defaultVisible || (wfId && c.key === 'fold')).map((c) => c.key))
    );
    const [showColPicker, setShowColPicker] = useState(false);

    // Load trades
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                if (wfId) {
                    const filters: Record<string, unknown> = { limit: 10000, offset: 0 };
                    if (dirFilter !== 'ALL') filters.direction = dirFilter;
                    if (exitFilter !== 'ALL') filters.exit_reason = exitFilter;
                    if (foldFilter !== 'ALL') filters.fold = Number(foldFilter);
                    const resp = await getWalkForwardAllTrades(wfId, phase, filters as any);
                    if (!cancelled) {
                        setTrades(resp.trades as Record<string, unknown>[]);
                        setTotal(resp.total);
                    }
                } else if (runId) {
                    const direction = dirFilter !== 'ALL' ? dirFilter : undefined;
                    const exitReason = exitFilter !== 'ALL' ? exitFilter : undefined;
                    const resp = await api.getBacktestTrades(runId, 10000, 0, direction, exitReason);
                    if (!cancelled) {
                        setTrades(resp.data ?? []);
                        setTotal(resp.pagination?.total ?? 0);
                    }
                }
            } catch (err) {
                console.error('Load trades failed:', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [runId, wfId, phase, dirFilter, exitFilter, foldFilter]);

    // Sort
    const sortedTrades = useMemo(() => {
        const sorted = [...trades];
        sorted.sort((a, b) => {
            const av = a[sortKey];
            const bv = b[sortKey];
            const an = Number(av);
            const bn = Number(bv);
            if (!isNaN(an) && !isNaN(bn)) {
                return sortDir === 'asc' ? an - bn : bn - an;
            }
            const as = String(av ?? '');
            const bs = String(bv ?? '');
            return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
        });
        return sorted;
    }, [trades, sortKey, sortDir]);

    // Available folds for filter
    const availableFolds = useMemo(() => {
        const folds = new Set<string>();
        for (const t of trades) {
            const f = String(t.fold ?? '');
            if (f && f !== 'undefined') folds.add(f);
        }
        return Array.from(folds).sort((a, b) => Number(a) - Number(b));
    }, [trades]);

    // Available exit reasons
    const availableExitReasons = useMemo(() => {
        const reasons = new Set<string>();
        for (const t of trades) {
            const r = String(t.exit_reason ?? '');
            if (r) reasons.add(r);
        }
        return Array.from(reasons).sort();
    }, [trades]);

    const columns = useMemo(() => ALL_COLUMNS.filter((c) => visibleCols.has(c.key)), [visibleCols]);

    // Export
    const handleExport = useCallback(() => {
        if (sortedTrades.length === 0) return;
        const headers = ALL_COLUMNS.map((c) => c.key);
        const csvRows = [headers.join(',')];
        for (const t of sortedTrades) {
            csvRows.push(headers.map((h) => {
                const v = t[h];
                if (v == null) return '';
                const s = String(v);
                return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
            }).join(','));
        }
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `trades_${wfId ?? runId ?? 'export'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }, [sortedTrades, wfId, runId]);

    const handleSort = (key: string) => {
        if (sortKey === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    };

    return (
        <GlassCard className="p-0 overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
                <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-white">
                        Trades
                    </h3>
                    <GlassBadge variant="default">
                        {loading ? '...' : `${sortedTrades.length} / ${total}`}
                    </GlassBadge>
                    {wfId && (
                        <GlassBadge variant="info">{phase.toUpperCase()}</GlassBadge>
                    )}
                </div>
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={() => setShowFilters((v) => !v)}
                        className={cn(
                            'flex items-center gap-1 px-2 py-1 text-[10px] rounded border transition-colors',
                            showFilters
                                ? 'border-cyan-500/40 text-cyan-300 bg-cyan-500/10'
                                : 'border-white/10 text-neutral-400 hover:bg-white/5',
                        )}
                    >
                        <Filter size={10} /> Filtres
                    </button>
                    <button
                        onClick={() => setShowColPicker((v) => !v)}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] rounded border border-white/10 text-neutral-400 hover:bg-white/5 transition-colors"
                    >
                        <Columns3 size={10} /> Colonnes
                    </button>
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] rounded border border-white/10 text-neutral-400 hover:bg-white/5 transition-colors"
                    >
                        <Download size={10} /> CSV
                    </button>
                </div>
            </div>

            {/* Filters bar */}
            {showFilters && (
                <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5 bg-white/[0.02]">
                    <label className="text-[10px] text-neutral-500">Direction</label>
                    <select
                        value={dirFilter}
                        onChange={(e) => setDirFilter(e.target.value)}
                        className="bg-neutral-800 border border-white/10 rounded px-2 py-0.5 text-[10px] text-white"
                    >
                        <option value="ALL">Tous</option>
                        <option value="BUY">BUY</option>
                        <option value="SELL">SELL</option>
                    </select>

                    <label className="text-[10px] text-neutral-500">Exit</label>
                    <select
                        value={exitFilter}
                        onChange={(e) => setExitFilter(e.target.value)}
                        className="bg-neutral-800 border border-white/10 rounded px-2 py-0.5 text-[10px] text-white"
                    >
                        <option value="ALL">Tous</option>
                        {availableExitReasons.map((r) => (
                            <option key={r} value={r}>{r}</option>
                        ))}
                    </select>

                    {wfId && availableFolds.length > 0 && (
                        <>
                            <label className="text-[10px] text-neutral-500">Fold</label>
                            <select
                                value={foldFilter}
                                onChange={(e) => setFoldFilter(e.target.value)}
                                className="bg-neutral-800 border border-white/10 rounded px-2 py-0.5 text-[10px] text-white"
                            >
                                <option value="ALL">Tous</option>
                                {availableFolds.map((f) => (
                                    <option key={f} value={f}>Fold {f}</option>
                                ))}
                            </select>
                        </>
                    )}
                </div>
            )}

            {/* Column picker */}
            {showColPicker && (
                <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-white/5 bg-white/[0.02]">
                    {ALL_COLUMNS.map((col) => (
                        <button
                            key={col.key}
                            onClick={() => {
                                const next = new Set(visibleCols);
                                if (next.has(col.key)) next.delete(col.key);
                                else next.add(col.key);
                                setVisibleCols(next);
                            }}
                            className={cn(
                                'px-1.5 py-0.5 text-[9px] rounded border transition-colors',
                                visibleCols.has(col.key)
                                    ? 'border-cyan-500/40 text-cyan-300 bg-cyan-500/10'
                                    : 'border-white/10 text-neutral-500 hover:bg-white/5',
                            )}
                        >
                            {col.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-[11px]">
                    <thead className="sticky top-0 z-10 bg-neutral-900/95 backdrop-blur">
                        <tr>
                            {columns.map((col) => (
                                <th
                                    key={col.key}
                                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                                    className={cn(
                                        'px-2 py-1.5 text-left text-[10px] uppercase tracking-wider text-neutral-500 border-b border-white/5 whitespace-nowrap',
                                        col.sortable && 'cursor-pointer hover:text-neutral-300',
                                        col.width,
                                    )}
                                >
                                    <span className="inline-flex items-center gap-0.5">
                                        {col.label}
                                        {sortKey === col.key && (
                                            sortDir === 'asc'
                                                ? <ChevronUp size={8} className="text-cyan-400" />
                                                : <ChevronDown size={8} className="text-cyan-400" />
                                        )}
                                    </span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {sortedTrades.map((trade, i) => (
                            <tr
                                key={String(trade.trade_id ?? i)}
                                className="border-b border-white/[0.03] hover:bg-white/[0.03] transition-colors"
                            >
                                {columns.map((col) => (
                                    <td key={col.key} className={cn('px-2 py-1 whitespace-nowrap', col.width)}>
                                        {col.format(trade)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                        {!loading && sortedTrades.length === 0 && (
                            <tr>
                                <td colSpan={columns.length} className="text-center py-8 text-neutral-500">
                                    Aucun trade
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </GlassCard>
    );
}
