/**
 * VirtualTradeTable.tsx - Virtualized glass-styled trade table
 *
 * Uses @tanstack/react-virtual for efficient rendering of large trade lists.
 * Only visible rows (~20 + 5 overscan) are mounted in the DOM.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { GlassCard } from '../../ui/glass';
import { cn } from '../../../lib/utils';
import {
    extractTradePnl,
    classifyExitReason,
    computeHoldTime,
    fmt,
    fmtTimestamp,
} from '../../../lib/backtestUtils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TradeRow = Record<string, unknown>;

interface VirtualTradeTableProps {
    trades: TradeRow[];
    phase?: 'IS' | 'OOS' | null;
    pageSize?: number;
    className?: string;
}

type SortDir = 'asc' | 'desc';
type DirectionFilter = 'all' | 'BUY' | 'SELL';

const EXIT_REASONS = ['TP', 'SL', 'Timeout', 'Trail', 'Other'] as const;
type ExitReason = (typeof EXIT_REASONS)[number];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROW_HEIGHT = 32;
const OVERSCAN = 5;

const EXIT_BADGE_STYLES: Record<string, string> = {
    TP: 'bg-emerald-500/15 text-emerald-300',
    SL: 'bg-rose-500/15 text-rose-300',
    Timeout: 'bg-amber-500/15 text-amber-300',
    Trail: 'bg-violet-500/15 text-violet-300',
    Unknown: 'bg-neutral-500/15 text-neutral-400',
    Other: 'bg-neutral-500/15 text-neutral-400',
};

interface ColumnDef {
    key: string;
    label: string;
    align: 'left' | 'center' | 'right';
    width?: string;
    sortable: boolean;
    phaseOnly?: boolean;
}

const COLUMNS: ColumnDef[] = [
    { key: 'phase', label: 'Phase', align: 'center', width: 'w-14', sortable: true, phaseOnly: true },
    { key: 'entry_ts', label: 'Entry', align: 'left', sortable: true },
    { key: 'exit_ts', label: 'Exit', align: 'left', sortable: true },
    { key: 'direction', label: 'Side', align: 'center', width: 'w-14', sortable: true },
    { key: 'entry_price', label: 'Entry Px', align: 'right', sortable: true },
    { key: 'exit_price', label: 'Exit Px', align: 'right', sortable: true },
    { key: 'pnl', label: 'PnL', align: 'right', sortable: true },
    { key: 'exit_reason', label: 'Exit', align: 'center', width: 'w-16', sortable: true },
    { key: 'hold_time', label: 'Hold', align: 'right', sortable: true },
    { key: 'mfe_pips', label: 'MFE', align: 'right', sortable: true },
    { key: 'mae_pips', label: 'MAE', align: 'right', sortable: true },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDirection(row: TradeRow): string {
    const raw = String(row.side ?? row.direction ?? '').toUpperCase();
    if (raw === 'BUY' || raw === 'LONG') return 'BUY';
    if (raw === 'SELL' || raw === 'SHORT') return 'SELL';
    return raw || '--';
}

function numericVal(row: TradeRow, field: string): number {
    const v = row[field];
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
        const n = Number(v);
        return Number.isNaN(n) ? 0 : n;
    }
    return 0;
}

/** Build a comparable sort value for a given column key. */
function sortValue(row: TradeRow, key: string): string | number {
    switch (key) {
        case 'pnl':
            return extractTradePnl(row);
        case 'exit_reason':
            return classifyExitReason(row);
        case 'hold_time':
            return computeHoldTime(row);
        case 'direction':
            return getDirection(row);
        case 'entry_price':
        case 'exit_price':
        case 'mfe_pips':
        case 'mae_pips':
            return numericVal(row, key);
        case 'phase':
            return String(row._phase ?? '');
        case 'entry_ts':
        case 'exit_ts':
            return String(row[key] ?? '');
        default:
            return String(row[key] ?? '');
    }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
    if (!active) return null;
    return (
        <span className="ml-0.5 text-[9px] text-neutral-400">
            {dir === 'asc' ? '\u25B2' : '\u25BC'}
        </span>
    );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function VirtualTradeTableInner({
    trades,
    phase,
    className,
}: VirtualTradeTableProps) {
    // -- State ---------------------------------------------------------------
    const [sortKey, setSortKey] = useState<string>('entry_ts');
    const [sortDir, setSortDir] = useState<SortDir>('asc');
    const [dirFilter, setDirFilter] = useState<DirectionFilter>('all');
    const [exitFilters, setExitFilters] = useState<Set<ExitReason>>(
        () => new Set(EXIT_REASONS),
    );

    const parentRef = useRef<HTMLDivElement>(null);

    const showPhase = phase == null;

    // -- Filter chips toggle -------------------------------------------------
    const toggleExit = useCallback((reason: ExitReason) => {
        setExitFilters((prev) => {
            const next = new Set(prev);
            if (next.has(reason)) {
                // Don't allow deselecting all
                if (next.size > 1) next.delete(reason);
            } else {
                next.add(reason);
            }
            return next;
        });
    }, []);

    // -- Filtered + sorted data ----------------------------------------------
    const processed = useMemo(() => {
        let data = trades;

        // Direction filter
        if (dirFilter !== 'all') {
            data = data.filter((row) => getDirection(row) === dirFilter);
        }

        // Exit reason filter (map Unknown -> Other bucket for filtering)
        data = data.filter((row) => {
            const reason = classifyExitReason(row);
            const bucket = reason === 'Unknown' ? 'Other' : reason;
            return exitFilters.has(bucket as ExitReason);
        });

        // Sort
        const dir = sortDir === 'asc' ? 1 : -1;
        const sorted = [...data].sort((a, b) => {
            const va = sortValue(a, sortKey);
            const vb = sortValue(b, sortKey);
            if (typeof va === 'number' && typeof vb === 'number') {
                return (va - vb) * dir;
            }
            return String(va).localeCompare(String(vb)) * dir;
        });

        return sorted;
    }, [trades, dirFilter, exitFilters, sortKey, sortDir]);

    // -- Virtualizer ---------------------------------------------------------
    const virtualizer = useVirtualizer({
        count: processed.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => ROW_HEIGHT,
        overscan: OVERSCAN,
    });

    // -- Sort handler --------------------------------------------------------
    const handleSort = useCallback(
        (key: string) => {
            if (sortKey === key) {
                setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
            } else {
                setSortKey(key);
                setSortDir('asc');
            }
        },
        [sortKey],
    );

    // -- CSV export ----------------------------------------------------------
    const exportCsv = useCallback(() => {
        const headers = [
            ...(showPhase ? ['phase'] : []),
            'entry_ts',
            'exit_ts',
            'direction',
            'entry_price',
            'exit_price',
            'pnl',
            'exit_reason',
            'hold_time',
            'mfe_pips',
            'mae_pips',
        ];

        const rows = processed.map((row) => {
            const pnl = extractTradePnl(row);
            const exit = classifyExitReason(row);
            const hold = computeHoldTime(row);
            const dir = getDirection(row);
            return [
                ...(showPhase ? [String(row._phase ?? '')] : []),
                String(row.entry_ts ?? ''),
                String(row.exit_ts ?? ''),
                dir,
                fmt(numericVal(row, 'entry_price'), 5),
                fmt(numericVal(row, 'exit_price'), 5),
                fmt(pnl),
                exit,
                hold,
                fmt(numericVal(row, 'mfe_pips')),
                fmt(numericVal(row, 'mae_pips')),
            ].join(',');
        });

        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `trades_export_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }, [processed, showPhase]);

    // -- Visible columns -----------------------------------------------------
    const visibleColumns = useMemo(
        () => COLUMNS.filter((c) => !c.phaseOnly || showPhase),
        [showPhase],
    );

    // -- Render --------------------------------------------------------------
    return (
        <GlassCard padding="sm" className={cn('col-span-12', className)}>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-3">
                    {/* Title + count */}
                    <div className="text-xs uppercase tracking-[0.16em] text-neutral-400">
                        Trades ({processed.length})
                    </div>

                    {/* Direction filter */}
                    <div className="flex rounded-md border border-white/[0.08] bg-white/[0.03] overflow-hidden">
                        {(['all', 'BUY', 'SELL'] as DirectionFilter[]).map((v) => (
                            <button
                                key={v}
                                onClick={() => setDirFilter(v)}
                                className={cn(
                                    'px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider transition-colors',
                                    dirFilter === v
                                        ? 'bg-white/[0.10] text-white'
                                        : 'text-neutral-500 hover:text-neutral-300',
                                )}
                            >
                                {v === 'all' ? 'All' : v}
                            </button>
                        ))}
                    </div>

                    {/* Exit reason chips */}
                    <div className="flex items-center gap-1">
                        {EXIT_REASONS.map((reason) => {
                            const active = exitFilters.has(reason);
                            return (
                                <button
                                    key={reason}
                                    onClick={() => toggleExit(reason)}
                                    className={cn(
                                        'px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wider border transition-colors',
                                        active
                                            ? EXIT_BADGE_STYLES[reason]
                                            : 'bg-transparent text-neutral-600 border-white/[0.06]',
                                        active
                                            ? 'border-transparent'
                                            : '',
                                    )}
                                >
                                    {reason}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* CSV export */}
                <button
                    onClick={exportCsv}
                    className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-neutral-400 border border-white/[0.08] rounded-md bg-white/[0.03] hover:bg-white/[0.08] hover:text-neutral-200 transition-colors"
                >
                    Export CSV
                </button>
            </div>

            {/* Empty state */}
            {processed.length === 0 ? (
                <div className="py-10 text-center text-neutral-600 text-sm">
                    No trades matching current filters.
                </div>
            ) : (
                /* Table container */
                <div className="rounded-lg border border-white/[0.06] overflow-hidden">
                    {/* Sticky header */}
                    <div className="sticky top-0 z-10 bg-[#0a0e1a]/90 backdrop-blur-sm">
                        <div className="flex text-[10px] uppercase tracking-wider text-neutral-500">
                            {visibleColumns.map((col) => (
                                <div
                                    key={col.key}
                                    role={col.sortable ? 'button' : undefined}
                                    tabIndex={col.sortable ? 0 : undefined}
                                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                                    onKeyDown={
                                        col.sortable
                                            ? (e) => {
                                                  if (e.key === 'Enter' || e.key === ' ') handleSort(col.key);
                                              }
                                            : undefined
                                    }
                                    className={cn(
                                        'px-2 py-2.5 flex-1 select-none',
                                        col.width,
                                        col.align === 'center' && 'text-center',
                                        col.align === 'right' && 'text-right',
                                        col.align === 'left' && 'text-left',
                                        col.sortable && 'cursor-pointer hover:text-neutral-300 transition-colors',
                                    )}
                                >
                                    {col.label}
                                    <SortArrow active={sortKey === col.key} dir={sortDir} />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Virtualized body */}
                    <div
                        ref={parentRef}
                        className="max-h-[600px] overflow-y-auto"
                    >
                        <div
                            className="relative w-full"
                            style={{ height: virtualizer.getTotalSize() }}
                        >
                            {virtualizer.getVirtualItems().map((virtualRow) => {
                                const row = processed[virtualRow.index];
                                const pnl = extractTradePnl(row);
                                const exit = classifyExitReason(row);
                                const hold = computeHoldTime(row);
                                const dir = getDirection(row);
                                const rowPhase = String(row._phase ?? '');

                                return (
                                    <div
                                        key={virtualRow.index}
                                        className={cn(
                                            'absolute left-0 w-full flex items-center text-xs',
                                            'border-t border-white/[0.04] transition-colors hover:bg-white/[0.04]',
                                        )}
                                        style={{
                                            height: ROW_HEIGHT,
                                            transform: `translateY(${virtualRow.start}px)`,
                                        }}
                                    >
                                        {/* Phase */}
                                        {showPhase && (
                                            <div className="px-2 flex-1 w-14 text-center">
                                                <span
                                                    className={cn(
                                                        'text-[9px] uppercase px-1.5 py-0.5 rounded font-medium',
                                                        rowPhase === 'IS'
                                                            ? 'bg-cyan-500/15 text-cyan-300'
                                                            : 'bg-emerald-500/15 text-emerald-300',
                                                    )}
                                                >
                                                    {rowPhase}
                                                </span>
                                            </div>
                                        )}

                                        {/* Entry TS */}
                                        <div className="px-2 flex-1 text-neutral-300 font-mono text-[11px] truncate">
                                            {fmtTimestamp(row.entry_ts as string | undefined)}
                                        </div>

                                        {/* Exit TS */}
                                        <div className="px-2 flex-1 text-neutral-300 font-mono text-[11px] truncate">
                                            {fmtTimestamp(row.exit_ts as string | undefined)}
                                        </div>

                                        {/* Direction */}
                                        <div className="px-2 flex-1 w-14 text-center">
                                            <span
                                                className={cn(
                                                    'text-[10px] font-medium',
                                                    dir === 'BUY' ? 'text-cyan-400' : dir === 'SELL' ? 'text-amber-400' : 'text-neutral-500',
                                                )}
                                            >
                                                {dir}
                                            </span>
                                        </div>

                                        {/* Entry Price */}
                                        <div className="px-2 flex-1 text-right text-neutral-300 font-mono">
                                            {fmt(numericVal(row, 'entry_price'), 5)}
                                        </div>

                                        {/* Exit Price */}
                                        <div className="px-2 flex-1 text-right text-neutral-300 font-mono">
                                            {fmt(numericVal(row, 'exit_price'), 5)}
                                        </div>

                                        {/* PnL */}
                                        <div
                                            className={cn(
                                                'px-2 flex-1 text-right font-mono font-medium',
                                                pnl > 0 ? 'text-emerald-400' : pnl < 0 ? 'text-rose-300' : 'text-neutral-500',
                                            )}
                                        >
                                            {pnl > 0 ? '+' : ''}
                                            {fmt(pnl)}
                                        </div>

                                        {/* Exit Reason */}
                                        <div className="px-2 flex-1 w-16 text-center">
                                            <span
                                                className={cn(
                                                    'text-[9px] px-1.5 py-0.5 rounded font-medium',
                                                    EXIT_BADGE_STYLES[exit] ?? EXIT_BADGE_STYLES.Other,
                                                )}
                                            >
                                                {exit}
                                            </span>
                                        </div>

                                        {/* Hold Time */}
                                        <div className="px-2 flex-1 text-right text-neutral-400 font-mono text-[11px]">
                                            {hold}
                                        </div>

                                        {/* MFE */}
                                        <div className="px-2 flex-1 text-right text-neutral-400 font-mono">
                                            {fmt(numericVal(row, 'mfe_pips'))}
                                        </div>

                                        {/* MAE */}
                                        <div className="px-2 flex-1 text-right text-neutral-400 font-mono">
                                            {fmt(numericVal(row, 'mae_pips'))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </GlassCard>
    );
}

export const VirtualTradeTable = React.memo(VirtualTradeTableInner);
