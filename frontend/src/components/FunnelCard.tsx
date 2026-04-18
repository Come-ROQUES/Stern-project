/**
 * FunnelCard - V4 DESK-GRADE TRUTH
 * 
 * Visual funnel showing the 3-layer architecture flow:
 * SHOCKS (Layer 1) -> SIGNALS (Layer 2) -> TRADES (Layer 3)
 * 
 * Each stage shows:
 * - Count
 * - Conversion rate to next stage
 * - Visual bar proportional to count
 * 
 * Rules:
 * - All data requires run_id context
 * - Shows explicit zero state when no data
 * - Highlights bottlenecks and gaps
 */

import { useMemo } from 'react';
import { useRunId, useRunMeta, useRunStats } from '../lib/useRunContext';
import { useCanonicalKPIs } from '../lib/canonicalApi';
import { Zap, Signal, ArrowRight, TrendingDown, AlertTriangle } from 'lucide-react';

interface FunnelStage {
    label: string;
    count: number;
    icon: React.ReactNode;
    color: string;
    bgColor: string;
}

interface FunnelCardProps {
    /** Compact horizontal layout */
    compact?: boolean;
    /** Show detailed breakdown */
    showBreakdown?: boolean;
}

export function FunnelCard({ compact = false, showBreakdown = true }: FunnelCardProps) {
    const runId = useRunId();
    const { run, contextValid } = useRunMeta();
    const { signalStats, shockStats } = useRunStats();
    const { kpis } = useCanonicalKPIs(runId, run?.strategy_id, { disablePolling: true });

    const stageCounts = useMemo(() => {
        const byStage = signalStats?.by_stage || {};
        return {
            waiting: byStage['WAITING_REFLEX'] || 0,
            accepted: byStage['ACCEPTED'] || signalStats?.accepted_signals || 0,
            entry: byStage['ENTRY'] || 0,
            executed: byStage['EXECUTED'] || kpis?.trades_count || 0,
            blocked: byStage['BLOCKED_OBSERVATION'] || 0,
            reflexTimeout: byStage['REFLEX_TIMEOUT'] || 0,
            reaperExpired: byStage['REAPER_EXPIRED'] || 0,
        };
    }, [signalStats, kpis]);

    const stages = useMemo<FunnelStage[]>(() => {
        const shocks = shockStats?.total_shocks || 0;
        const signals = signalStats?.total_signals || 0;
        const accepted = stageCounts.accepted || 0;
        const trades = stageCounts.executed || kpis?.trades_count || 0;

        return [
            {
                label: 'SHOCKS',
                count: shocks,
                icon: <Zap className="w-4 h-4" />,
                color: 'text-purple-400',
                bgColor: 'bg-purple-500/20',
            },
            {
                label: 'SIGNALS',
                count: signals,
                icon: <Signal className="w-4 h-4" />,
                color: 'text-blue-400',
                bgColor: 'bg-blue-500/20',
            },
            {
                label: 'ACCEPTED',
                count: accepted,
                icon: <Signal className="w-4 h-4" />,
                color: 'text-emerald-400',
                bgColor: 'bg-emerald-500/20',
            },
            {
                label: 'TRADES',
                count: trades,
                icon: <TrendingDown className="w-4 h-4" />,
                color: 'text-amber-400',
                bgColor: 'bg-amber-500/20',
            },
        ];
    }, [shockStats, signalStats, kpis, stageCounts]);

    const maxCount = useMemo(() => Math.max(...stages.map(s => s.count), 1), [stages]);

    const conversions = useMemo(() => {
        const shocks = stages[0].count;
        const signals = stages[1].count;
        const accepted = stages[2].count;
        const trades = stages[3].count;

        return {
            shockToSignal: shocks > 0 ? ((signals / shocks) * 100).toFixed(1) : '0',
            signalToAccepted: signals > 0 ? ((accepted / signals) * 100).toFixed(1) : '0',
            acceptedToTrade: accepted > 0 ? ((trades / accepted) * 100).toFixed(1) : '0',
            overall: shocks > 0 ? ((trades / shocks) * 100).toFixed(1) : '0',
        };
    }, [stages]);

    // Check for anomalies
    const hasGap = signalStats && kpis &&
        Math.abs(
            (kpis.linked_signals_count ?? (signalStats.traded_signals || 0)) -
            (kpis.trades_count || 0)
        ) > 2;

    // No context - show placeholder
    if (!contextValid || !runId) {
        return (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="text-xs uppercase tracking-wide text-neutral-500 mb-3">
                    Funnel
                </div>
                <div className="text-sm text-neutral-500 text-center py-8">
                    Select a run to view funnel metrics
                </div>
            </div>
        );
    }

    if (compact) {
        return (
            <div className="flex items-center gap-2">
                {stages.map((stage, i) => (
                    <div key={stage.label} className="flex items-center gap-2">
                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded ${stage.bgColor}`}>
                            <span className={`${stage.color}`}>{stage.icon}</span>
                            <span className={`text-xs font-mono ${stage.color}`}>{stage.count}</span>
                        </div>
                        {i < stages.length - 1 && (
                            <ArrowRight className="w-3 h-3 text-neutral-600" />
                        )}
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="text-xs uppercase tracking-wide text-neutral-500">
                    Funnel
                </div>
                <div className="text-xs font-mono text-neutral-400">
                    Overall: <span className="text-white">{conversions.overall}%</span>
                </div>
            </div>

            {/* Warning banner */}
            {hasGap && (
                <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <span className="text-xs text-red-400">
                        Execution gap detected: linked_signals != trades.count
                    </span>
                </div>
            )}

            {/* Funnel bars */}
            <div className="space-y-3">
                {stages.map((stage, i) => {
                    const barWidth = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
                    const conversionToNext = i === 0 ? conversions.shockToSignal :
                        i === 1 ? conversions.signalToAccepted :
                            i === 2 ? conversions.acceptedToTrade : null;

                    return (
                        <div key={stage.label}>
                            {/* Stage row */}
                            <div className="flex items-center gap-3">
                                {/* Icon and label */}
                                <div className={`w-20 flex items-center gap-2 ${stage.color}`}>
                                    {stage.icon}
                                    <span className="text-[10px] uppercase tracking-wide">
                                        {stage.label}
                                    </span>
                                </div>

                                {/* Bar */}
                                <div className="flex-1 h-6 bg-white/[0.03] rounded overflow-hidden">
                                    <div
                                        className={`h-full ${stage.bgColor} transition-all duration-500 flex items-center justify-end pr-2`}
                                        style={{ width: `${Math.max(barWidth, 2)}%` }}
                                    >
                                        <span className={`text-xs font-mono ${stage.color}`}>
                                            {stage.count}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Conversion arrow */}
                            {conversionToNext && showBreakdown && (
                                <div className="ml-20 pl-3 flex items-center gap-2 text-neutral-500 my-1">
                                    <div className="w-px h-3 bg-neutral-700" />
                                    <span className="text-[10px]">
                                        {conversionToNext}%
                                    </span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {showBreakdown && (
                <div className="mt-4">
                    <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-2">
                        Decision stages
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
                        {[
                            { label: 'WAITING_REFLEX', count: stageCounts.waiting, color: 'text-blue-300', bg: 'bg-blue-500/15' },
                            { label: 'ACCEPTED', count: stageCounts.accepted, color: 'text-emerald-300', bg: 'bg-emerald-500/15' },
                            { label: 'ENTRY', count: stageCounts.entry, color: 'text-sky-300', bg: 'bg-sky-500/15' },
                            { label: 'EXECUTED', count: stageCounts.executed, color: 'text-amber-300', bg: 'bg-amber-500/15' },
                            { label: 'REFLEX_TIMEOUT', count: stageCounts.reflexTimeout, color: 'text-red-300', bg: 'bg-red-500/10' },
                            { label: 'REAPER_EXPIRED', count: stageCounts.reaperExpired, color: 'text-orange-300', bg: 'bg-orange-500/10' },
                            { label: 'BLOCKED_OBSERVATION', count: stageCounts.blocked, color: 'text-neutral-200', bg: 'bg-neutral-600/30' },
                        ].map((stage) => (
                            <div key={stage.label} className={`flex items-center justify-between px-3 py-2 rounded-lg border border-white/5 ${stage.bg}`}>
                                <span className={`text-[10px] uppercase tracking-wide ${stage.color}`}>{stage.label}</span>
                                <span className={`text-xs font-mono ${stage.color}`}>{stage.count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Breakdown details */}
            {showBreakdown && (
                <div className="mt-4 pt-4 border-t border-white/5">
                    <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">
                                Detection
                            </div>
                            <div className="text-sm font-mono text-purple-400">
                                {conversions.shockToSignal}%
                            </div>
                            <div className="text-[10px] text-neutral-600">
                                shock to signal
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">
                                Acceptance
                            </div>
                            <div className="text-sm font-mono text-emerald-400">
                                {conversions.signalToAccepted}%
                            </div>
                            <div className="text-[10px] text-neutral-600">
                                signal to accepted
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">
                                Execution
                            </div>
                            <div className="text-sm font-mono text-amber-400">
                                {conversions.acceptedToTrade}%
                            </div>
                            <div className="text-[10px] text-neutral-600">
                                accepted to trade
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * Mini funnel for compact displays
 */
export function MiniFunnel() {
    const runId = useRunId();
    const { run, contextValid } = useRunMeta();
    const { signalStats, shockStats } = useRunStats();
    const { kpis } = useCanonicalKPIs(runId, run?.strategy_id, { disablePolling: true });

    if (!contextValid) {
        return <span className="text-neutral-500 text-xs">--</span>;
    }

    const shocks = shockStats?.total_shocks || 0;
    const accepted = signalStats?.accepted_signals || 0;
    const trades = kpis?.trades_count || 0;

    return (
        <div className="inline-flex items-center gap-1 text-xs font-mono">
            <span className="text-purple-400">{shocks}</span>
            <ArrowRight className="w-3 h-3 text-neutral-600" />
            <span className="text-emerald-400">{accepted}</span>
            <ArrowRight className="w-3 h-3 text-neutral-600" />
            <span className="text-amber-400">{trades}</span>
        </div>
    );
}
