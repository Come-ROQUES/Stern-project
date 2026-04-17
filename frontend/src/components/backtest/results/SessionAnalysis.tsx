/**
 * SessionAnalysis - Trade performance breakdown by trading session.
 * Groups trades by session field or infers from entry timestamp.
 */

import React, { useMemo } from 'react';
import { extractTradePnl } from '../../../lib/backtestUtils';
import { cn } from '../../../lib/utils';
import { GlassCard } from '../../ui/glass';

interface SessionAnalysisProps {
    trades: Record<string, unknown>[];
    className?: string;
}

const SESSION_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
    Asia:    { bg: 'bg-violet-500/15', text: 'text-violet-400' },
    London:  { bg: 'bg-cyan-500/15',   text: 'text-cyan-400' },
    NY:      { bg: 'bg-amber-500/15',  text: 'text-amber-400' },
    Other:   { bg: 'bg-neutral-500/15', text: 'text-neutral-400' },
};

function inferSession(row: Record<string, unknown>): string {
    // Try explicit session field
    const session = row.session as string | undefined;
    if (session && typeof session === 'string' && session.trim() !== '') {
        const s = session.trim().toUpperCase();
        if (s.includes('ASIA') || s === 'TOKYO') return 'Asia';
        if (s.includes('LONDON') || s.includes('OVERLAP') || s === 'EU') return 'London';
        if (s.includes('NY') || s.includes('NEW_YORK') || s.includes('US')) return 'NY';
        return session.trim();
    }

    // Infer from entry timestamp
    const ts = (row.entry_ts ?? row.entry_time ?? row.timestamp) as string | undefined;
    if (ts) {
        const date = new Date(ts);
        const hour = date.getUTCHours();
        if (hour >= 0 && hour < 8) return 'Asia';
        if (hour >= 8 && hour < 13) return 'London';
        if (hour >= 13 && hour < 21) return 'NY';
        return 'Other';
    }

    return 'Other';
}

interface SessionStats {
    session: string;
    count: number;
    totalPnl: number;
    winRate: number;
    avgPnl: number;
}

function SessionAnalysisInner({ trades, className }: SessionAnalysisProps) {
    const sessions = useMemo(() => {
        const groups: Record<string, { pnls: number[] }> = {};

        for (const trade of trades) {
            const session = inferSession(trade);
            if (!groups[session]) groups[session] = { pnls: [] };
            groups[session].pnls.push(extractTradePnl(trade));
        }

        const result: SessionStats[] = Object.entries(groups)
            .map(([session, { pnls }]) => {
                const count = pnls.length;
                const totalPnl = pnls.reduce((s, v) => s + v, 0);
                const wins = pnls.filter((p) => p > 0).length;
                return {
                    session,
                    count,
                    totalPnl,
                    winRate: count > 0 ? wins / count : 0,
                    avgPnl: count > 0 ? totalPnl / count : 0,
                };
            })
            .sort((a, b) => b.count - a.count);

        return result;
    }, [trades]);

    if (sessions.length === 0) {
        return (
            <GlassCard className={className}>
                <p className="text-xs text-neutral-500">No session data</p>
            </GlassCard>
        );
    }

    return (
        <GlassCard className={className}>
            <h4 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-3">
                Session Breakdown
            </h4>
            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="border-b border-white/[0.06]">
                            <th className="text-left py-2 pr-3 text-neutral-500 font-medium">Session</th>
                            <th className="text-right py-2 px-3 text-neutral-500 font-medium">Trades</th>
                            <th className="text-right py-2 px-3 text-neutral-500 font-medium">Total PnL</th>
                            <th className="text-right py-2 px-3 text-neutral-500 font-medium">Win Rate</th>
                            <th className="text-right py-2 pl-3 text-neutral-500 font-medium">Avg PnL</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sessions.map((s) => {
                            const badge = SESSION_BADGE_COLORS[s.session] ?? SESSION_BADGE_COLORS.Other;
                            const pnlColor = s.totalPnl > 0
                                ? 'text-emerald-400'
                                : s.totalPnl < 0
                                    ? 'text-rose-400'
                                    : 'text-neutral-400';
                            const avgColor = s.avgPnl > 0
                                ? 'text-emerald-400'
                                : s.avgPnl < 0
                                    ? 'text-rose-400'
                                    : 'text-neutral-400';

                            return (
                                <tr key={s.session} className="border-b border-white/[0.04]">
                                    <td className="py-2 pr-3">
                                        <span
                                            className={cn(
                                                'inline-block px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider',
                                                badge.bg,
                                                badge.text
                                            )}
                                        >
                                            {s.session}
                                        </span>
                                    </td>
                                    <td className="text-right py-2 px-3 font-mono text-neutral-300">
                                        {s.count}
                                    </td>
                                    <td className={cn('text-right py-2 px-3 font-mono', pnlColor)}>
                                        {s.totalPnl >= 0 ? '+' : ''}{s.totalPnl.toFixed(1)}
                                    </td>
                                    <td className="text-right py-2 px-3 font-mono text-neutral-300">
                                        {(s.winRate * 100).toFixed(1)}%
                                    </td>
                                    <td className={cn('text-right py-2 pl-3 font-mono', avgColor)}>
                                        {s.avgPnl >= 0 ? '+' : ''}{s.avgPnl.toFixed(2)}
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

export const SessionAnalysis = React.memo(SessionAnalysisInner);
