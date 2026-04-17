/**
 * VerdictBanner - V4 DESK-GRADE TRUTH
 * 
 * 3-part verdict system showing run health at a glance:
 * 1. STRATEGY: Quality of signal generation (HEALTHY/DEGRADED/CRITICAL)
 * 2. FUNNEL: Conversion efficiency (shock -> signal -> trade)
 * 3. EXECUTION: Trade execution state (NOMINAL/GAP/PAUSED)
 * 
 * Rules:
 * - All metrics require run_id context
 * - No metrics displayed without statistical significance
 * - Loud warnings when data inconsistent
 */

import { useMemo } from 'react';
import { useRunId, useRunMeta, useRunStats } from '../lib/useRunContext';
import { useCanonicalKPIs } from '../lib/canonicalApi';
import { Activity, GitBranch, Zap, AlertTriangle, CheckCircle, XCircle, Minus } from 'lucide-react';

type VerdictLevel = 'HEALTHY' | 'NOMINAL' | 'DEGRADED' | 'WARNING' | 'CRITICAL' | 'GAP' | 'PAUSED' | 'N/A';

interface Verdict {
    label: string;
    level: VerdictLevel;
    value?: string;
    tooltip?: string;
}

interface VerdictBannerProps {
    /** Compact mode - single line badges */
    compact?: boolean;
    /** Show detailed tooltips on hover */
    showTooltips?: boolean;
}

const LEVEL_STYLES: Record<VerdictLevel, { bg: string; text: string; border: string }> = {
    HEALTHY: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
    NOMINAL: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
    DEGRADED: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
    WARNING: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
    CRITICAL: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
    GAP: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
    PAUSED: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
    'N/A': { bg: 'bg-neutral-500/10', text: 'text-neutral-400', border: 'border-neutral-500/30' },
};

function VerdictIcon({ level }: { level: VerdictLevel }) {
    switch (level) {
        case 'HEALTHY':
        case 'NOMINAL':
            return <CheckCircle className="w-3.5 h-3.5" />;
        case 'DEGRADED':
        case 'WARNING':
            return <AlertTriangle className="w-3.5 h-3.5" />;
        case 'CRITICAL':
        case 'GAP':
            return <XCircle className="w-3.5 h-3.5" />;
        case 'PAUSED':
            return <Minus className="w-3.5 h-3.5" />;
        default:
            return <Minus className="w-3.5 h-3.5" />;
    }
}

export function VerdictBanner({ compact = false, showTooltips = true }: VerdictBannerProps) {
    const runId = useRunId();
    const { run, contextValid } = useRunMeta();
    const { signalStats, shockStats } = useRunStats();
    const { kpis, loading: kpisLoading } = useCanonicalKPIs(runId, run?.strategy_id, { disablePolling: true });

    const verdicts = useMemo<Verdict[]>(() => {
        // No context - all N/A
        if (!contextValid || !runId) {
            return [
                { label: 'STRATEGY', level: 'N/A', tooltip: 'Select a run to view strategy health' },
                { label: 'FUNNEL', level: 'N/A', tooltip: 'Select a run to view funnel metrics' },
                { label: 'EXEC', level: 'N/A', tooltip: 'Select a run to view execution state' },
            ];
        }

        // Strategy Quality
        const strategyVerdict = ((): Verdict => {
            if (!signalStats) {
                return { label: 'STRATEGY', level: 'N/A', tooltip: 'Loading signal stats...' };
            }

            const total = signalStats.total_signals || 0;
            const accepted = signalStats.accepted_signals || 0;
            const rejectionRate = total > 0 ? ((total - accepted) / total) * 100 : 0;

            if (total < 5) {
                return {
                    label: 'STRATEGY',
                    level: 'N/A',
                    value: `${total} sig`,
                    tooltip: 'Insufficient data (need 5+ signals)'
                };
            }

            if (rejectionRate > 90) {
                return {
                    label: 'STRATEGY',
                    level: 'CRITICAL',
                    value: `${rejectionRate.toFixed(0)}% rej`,
                    tooltip: `Critical: ${rejectionRate.toFixed(1)}% rejection rate`
                };
            }
            if (rejectionRate > 70) {
                return {
                    label: 'STRATEGY',
                    level: 'DEGRADED',
                    value: `${rejectionRate.toFixed(0)}% rej`,
                    tooltip: `Degraded: ${rejectionRate.toFixed(1)}% rejection rate`
                };
            }
            return {
                label: 'STRATEGY',
                level: 'HEALTHY',
                value: `${accepted}/${total}`,
                tooltip: `Healthy: ${accepted} accepted of ${total} signals`
            };
        })();

        // Funnel Health (Shock -> Signal -> Trade conversion)
        const funnelVerdict = ((): Verdict => {
            const totalShocks = shockStats?.total_shocks || 0;
            const totalSignals = signalStats?.total_signals || 0;
            const tradedSignals = signalStats?.traded_signals || 0;

            if (totalShocks < 5) {
                return {
                    label: 'FUNNEL',
                    level: 'N/A',
                    value: `${totalShocks} shk`,
                    tooltip: 'Insufficient shocks for funnel analysis'
                };
            }

            // Conversion rate: traded / shocks
            const conversion = totalShocks > 0 ? (tradedSignals / totalShocks) * 100 : 0;

            if (conversion < 5) {
                return {
                    label: 'FUNNEL',
                    level: 'WARNING',
                    value: `${conversion.toFixed(1)}%`,
                    tooltip: `Low conversion: ${tradedSignals} trades from ${totalShocks} shocks`
                };
            }
            if (conversion > 60) {
                return {
                    label: 'FUNNEL',
                    level: 'WARNING',
                    value: `${conversion.toFixed(1)}%`,
                    tooltip: `High conversion may indicate insufficient filtering`
                };
            }
            return {
                label: 'FUNNEL',
                level: 'NOMINAL',
                value: `${conversion.toFixed(1)}%`,
                tooltip: `Nominal: ${tradedSignals} trades from ${totalShocks} shocks (${conversion.toFixed(1)}%)`
            };
        })();

        // Execution State
        const execVerdict = ((): Verdict => {
            const tradedSignals = signalStats?.traded_signals || 0;
            const tradesCount = kpis?.trades_count || 0;

            // Check if bot is in shadow mode or paused
            const status = run?.status;
            const source = run?.source;

            if (source === 'shadow') {
                return {
                    label: 'EXEC',
                    level: 'PAUSED',
                    value: 'SHADOW',
                    tooltip: 'Bot running in shadow mode (no real trades)'
                };
            }

            if (status === 'closed' || status === 'aborted') {
                return {
                    label: 'EXEC',
                    level: 'PAUSED',
                    value: status.toUpperCase(),
                    tooltip: `Run ${status}`
                };
            }

            // Check for execution gap
            const gap = Math.abs(tradedSignals - tradesCount);
            if (tradedSignals > 0 && gap > 2) {
                return {
                    label: 'EXEC',
                    level: 'GAP',
                    value: `${gap} gap`,
                    tooltip: `Execution gap: ${tradedSignals} signals marked traded but ${tradesCount} trades found`
                };
            }

            return {
                label: 'EXEC',
                level: 'NOMINAL',
                value: `${tradesCount} trd`,
                tooltip: `Nominal: ${tradesCount} trades executed`
            };
        })();

        return [strategyVerdict, funnelVerdict, execVerdict];
    }, [contextValid, runId, signalStats, shockStats, kpis, run]);

    if (compact) {
        return (
            <div className="flex items-center gap-2">
                {verdicts.map((verdict, i) => {
                    const styles = LEVEL_STYLES[verdict.level];
                    return (
                        <div
                            key={i}
                            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border ${styles.bg} ${styles.border}`}
                            title={showTooltips ? verdict.tooltip : undefined}
                        >
                            <VerdictIcon level={verdict.level} />
                            <span className={`text-[10px] font-medium uppercase tracking-wide ${styles.text}`}>
                                {verdict.label}
                            </span>
                            {verdict.value && (
                                <>
                                    <span className="text-neutral-600">:</span>
                                    <span className={`text-[10px] font-mono ${styles.text}`}>
                                        {verdict.value}
                                    </span>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    }

    return (
        <div className="flex items-center gap-3">
            {verdicts.map((verdict, i) => {
                const styles = LEVEL_STYLES[verdict.level];
                return (
                    <div
                        key={i}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${styles.bg} ${styles.border}`}
                        title={showTooltips ? verdict.tooltip : undefined}
                    >
                        <div className={styles.text}>
                            <VerdictIcon level={verdict.level} />
                        </div>
                        <div className="flex flex-col">
                            <span className={`text-[10px] font-medium uppercase tracking-wide ${styles.text}`}>
                                {verdict.label}
                            </span>
                            {verdict.value && (
                                <span className={`text-xs font-mono ${styles.text}`}>
                                    {verdict.value}
                                </span>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/**
 * Single verdict badge for inline use
 */
export function VerdictBadge({
    label,
    level,
    value
}: {
    label: string;
    level: VerdictLevel;
    value?: string;
}) {
    const styles = LEVEL_STYLES[level];
    return (
        <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border ${styles.bg} ${styles.border}`}>
            <VerdictIcon level={level} />
            <span className={`text-[10px] font-medium uppercase tracking-wide ${styles.text}`}>
                {label}
            </span>
            {value && (
                <>
                    <span className="text-neutral-600">:</span>
                    <span className={`text-[10px] font-mono ${styles.text}`}>
                        {value}
                    </span>
                </>
            )}
        </div>
    );
}
