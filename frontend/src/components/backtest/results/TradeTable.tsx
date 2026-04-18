/**
 * TradeTable.tsx - Glass-styled sortable trade table
 */

import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { GlassCard } from '../../ui/glass';
import { cn } from '../../../lib/utils';
import {
    extractTradePnl,
    classifyExitReason,
    computeHoldTime,
    fmt,
    fmtTimestamp,
} from '../../../lib/backtestUtils';

type TradeRow = Record<string, unknown>;

interface TradeTableProps {
    isTrades: TradeRow[];
    oosTrades: TradeRow[];
    hasDualView: boolean;
    pageSize?: number;
}

const EXIT_BADGE_STYLES: Record<string, string> = {
    TP: 'bg-emerald-500/15 text-emerald-300',
    SL: 'bg-rose-500/15 text-rose-300',
    Timeout: 'bg-amber-500/15 text-amber-300',
    Trail: 'bg-violet-500/15 text-violet-300',
    Unknown: 'bg-neutral-500/15 text-neutral-400',
    Other: 'bg-neutral-500/15 text-neutral-400',
};

export function TradeTable({ isTrades, oosTrades, hasDualView, pageSize = 100 }: TradeTableProps) {
    const [page, setPage] = useState(0);

    const allTrades = useMemo(() => {
        const tag = (trades: TradeRow[], phase: string) =>
            trades.map((t) => ({ ...t, _phase: phase }));
        if (hasDualView) return [...tag(isTrades, 'IS'), ...tag(oosTrades, 'OOS')];
        return tag(isTrades, 'IS');
    }, [isTrades, oosTrades, hasDualView]);

    const totalPages = Math.ceil(allTrades.length / pageSize);
    const pagedTrades = allTrades.slice(page * pageSize, (page + 1) * pageSize);

    if (allTrades.length === 0) {
        return (
            <GlassCard padding="sm" className="col-span-12">
                <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-2">
                    Trades
                </div>
                <div className="py-8 text-center text-neutral-600 text-sm">
                    Aucun trade charge.
                </div>
            </GlassCard>
        );
    }

    return (
        <GlassCard padding="sm" className="col-span-12">
            <div className="flex items-center justify-between mb-2">
                <div className="text-xs uppercase tracking-[0.16em] text-neutral-400">
                    Trades ({allTrades.length})
                </div>
                {totalPages > 1 && (
                    <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                        <button
                            onClick={() => setPage(Math.max(0, page - 1))}
                            disabled={page === 0}
                            className="p-1 rounded border border-white/10 hover:bg-white/10 disabled:opacity-30 transition-colors"
                        >
                            <ChevronLeft size={12} />
                        </button>
                        <span className="font-mono text-[11px] min-w-[4ch] text-center">{page + 1}/{totalPages}</span>
                        <button
                            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                            disabled={page >= totalPages - 1}
                            className="p-1 rounded border border-white/10 hover:bg-white/10 disabled:opacity-30 transition-colors"
                        >
                            <ChevronRight size={12} />
                        </button>
                    </div>
                )}
            </div>
            <div className="max-h-[420px] overflow-auto rounded-lg border border-white/[0.06]">
                <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-[#080c18] text-neutral-500 text-[10px] uppercase tracking-wider">
                        <tr>
                            {hasDualView && <th className="px-2 py-2.5 text-center w-12">Phase</th>}
                            <th className="px-2 py-2.5 text-left">Entry</th>
                            <th className="px-2 py-2.5 text-center w-12">Side</th>
                            <th className="px-2 py-2.5 text-right">Entry Px</th>
                            <th className="px-2 py-2.5 text-right">Exit Px</th>
                            <th className="px-2 py-2.5 text-right">PnL</th>
                            <th className="px-2 py-2.5 text-right">Hold</th>
                            <th className="px-2 py-2.5 text-right">MFE</th>
                            <th className="px-2 py-2.5 text-right">MAE</th>
                            <th className="px-2 py-2.5 text-center w-16">Exit</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pagedTrades.map((row, idx) => {
                            const pnl = extractTradePnl(row);
                            const exit = classifyExitReason(row);
                            const hold = computeHoldTime(row);
                            const phase = (row as any)._phase as string;
                            const side = String((row as any).side ?? (row as any).direction ?? '').toUpperCase();
                            return (
                                <tr
                                    key={`${(row as any).signal_id ?? idx}-${(row as any).entry_ts ?? idx}`}
                                    className={cn(
                                        'border-t border-white/[0.04] transition-colors hover:bg-white/[0.03]',
                                        pnl > 0 ? 'bg-emerald-500/[0.02]' : pnl < 0 ? 'bg-rose-500/[0.02]' : ''
                                    )}
                                >
                                    {hasDualView && (
                                        <td className="px-2 py-1.5 text-center">
                                            <span className={cn(
                                                'text-[9px] uppercase px-1.5 py-0.5 rounded font-medium',
                                                phase === 'IS' ? 'bg-cyan-500/15 text-cyan-300' : 'bg-emerald-500/15 text-emerald-300'
                                            )}>
                                                {phase}
                                            </span>
                                        </td>
                                    )}
                                    <td className="px-2 py-1.5 text-neutral-300 font-mono text-[11px]">
                                        {fmtTimestamp((row as any).entry_ts)}
                                    </td>
                                    <td className="px-2 py-1.5 text-center">
                                        <span className={cn(
                                            'text-[10px] font-medium',
                                            side === 'BUY' || side === 'LONG' ? 'text-emerald-400' : 'text-rose-400'
                                        )}>
                                            {side === 'BUY' || side === 'LONG' ? 'BUY' : side === 'SELL' || side === 'SHORT' ? 'SELL' : side || '--'}
                                        </span>
                                    </td>
                                    <td className="px-2 py-1.5 text-right text-neutral-300 font-mono">{fmt((row as any).entry_price, 5)}</td>
                                    <td className="px-2 py-1.5 text-right text-neutral-300 font-mono">{fmt((row as any).exit_price, 5)}</td>
                                    <td className={cn('px-2 py-1.5 text-right font-mono font-medium', pnl > 0 ? 'text-emerald-300' : pnl < 0 ? 'text-rose-300' : 'text-neutral-400')}>
                                        {pnl > 0 ? '+' : ''}{fmt(pnl)}
                                    </td>
                                    <td className="px-2 py-1.5 text-right text-neutral-400 font-mono text-[11px]">{hold}</td>
                                    <td className="px-2 py-1.5 text-right text-neutral-400 font-mono">{fmt((row as any).mfe_pips)}</td>
                                    <td className="px-2 py-1.5 text-right text-neutral-400 font-mono">{fmt((row as any).mae_pips)}</td>
                                    <td className="px-2 py-1.5 text-center">
                                        <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-medium', EXIT_BADGE_STYLES[exit] ?? EXIT_BADGE_STYLES.Other)}>
                                            {exit}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </GlassCard>
    );
}
