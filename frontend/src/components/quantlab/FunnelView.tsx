/**
 * FunnelView.tsx
 *
 * QUANT LAB V3 - Phase 3: Funnel Analysis Tab
 *
 * Displays the complete Shock -> Signal -> Trade -> PnL funnel
 * with conversion rates, rejection reasons, and edge by feature.
 *
 * This is the most important view for understanding strategy behavior:
 * - Where does my edge appear?
 * - Where does it disappear?
 * - Which filters destroy edge?
 *
 * Reference: QUANT_LAB_V3_RESEARCH_ENGINE_SPEC.md Section C
 */

import React, { useEffect, useRef, useState } from 'react';
import {
    AlertTriangle,
    ArrowDown,
    CheckCircle2,
    Filter,
    TrendingDown,
    TrendingUp,
    Zap,
} from 'lucide-react';
import { usePortfolioEpoch } from '../../lib/usePortfolioEpoch';
import { useQuantLabScope } from '../../lib/SelectionContext';
import {
    Scope,
    QuantMetaStandard,
    getQuantFunnelFull,
} from '../../lib/quantApi';

interface ShockGate {
    total_shocks: number;
    passed_threshold: number;
    pass_rate: number;
    z_score_distribution: { mean: number; min: number; max: number; count: number };
    amplitude_distribution: { mean: number; min: number; max: number; count: number };
    spread_distribution: { mean: number; min: number; max: number; count: number };
    by_session: Record<string, number>;
}

interface SignalGate {
    total_signals: number;
    accepted_signals: number;
    acceptance_rate: number;
    rejection_reasons: Record<string, number>;
    edge_by_z_decile: Array<{ decile: number; mean_outcome: number; count: number }>;
    edge_by_amplitude_bin: Array<{ bin: string; mean_outcome: number; count: number }>;
    edge_by_spread_bin: Array<{ bin: string; mean_outcome: number; count: number }>;
    edge_by_session: Record<string, number>;
}

interface TradeGate {
    total_trades: number;
    fill_quality: {
        mean_slippage_pips: number;
        mean_submit_to_fill_ms: number;
        mean_bar_age_sec: number;
    };
    time_to_exit: { mean_seconds: number; min_seconds: number; max_seconds: number };
    exit_breakdown: Record<string, { count: number; mean_time_seconds: number }>;
    adverse_excursion: { mean_mae_pips: number; max_mae_pips: number };
}

interface PnLGate {
    total_outcomes: number;
    mean_outcome: number;
    median_outcome: number;
    ci_95: [number, number];
    win_rate: number;
    payoff_ratio: number;
    var_95: number;
    cvar_95: number;
    by_spread_regime: Record<string, { mean: number; count: number }>;
    by_vol_regime: Record<string, { mean: number; count: number }>;
    by_session: Record<string, { mean: number; count: number }>;
    worst_10: Array<{ trade_id: string; outcome: number }>;
}

interface FunnelData {
    run_ids: string[];
    date_range: [string, string];
    shock_gate: ShockGate;
    signal_gate: SignalGate;
    trade_gate: TradeGate;
    pnl_gate: PnLGate;
    conversion_rates: {
        shock_to_signal: number;
        signal_to_accepted: number;
        accepted_to_trade: number;
        trade_to_win: number;
        overall: number;
    };
    meta?: QuantMetaStandard;
}

export const FunnelView: React.FC = () => {
    const [funnel, setFunnel] = useState<FunnelData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const quantScope = useQuantLabScope();
    const { scope, runId, strategyId, scopeLabel, missingRunId } = quantScope;
    const {
        epoch: portfolioEpoch,
        startedAt,
        loading: epochLoading,
        refresh: refreshEpoch,
    } = usePortfolioEpoch();
    const requestSeq = useRef(0);

    useEffect(() => {
        fetchFunnel();
    }, [scope, runId, strategyId, portfolioEpoch, missingRunId]);

    const fetchFunnel = async () => {
        const requestId = ++requestSeq.current;
        if (missingRunId) {
            setError("Selectionne un run pour afficher le funnel RUN.");
            setFunnel(null);
            setLoading(false);
            return;
        }
        try {
            setLoading(true);
            setError(null);

            const data = await getQuantFunnelFull({
                scope,
                runId,
                strategyId: strategyId ?? undefined,
                portfolioEpoch: portfolioEpoch ?? undefined,
            });
            if (requestId !== requestSeq.current) return;
            setFunnel(data as unknown as FunnelData);
        } catch (err) {
            if (requestId !== requestSeq.current) return;
            setError(err instanceof Error ? err.message : 'Failed to load funnel data');
        } finally {
            if (requestId !== requestSeq.current) return;
            setLoading(false);
        }
    };

    const formatPct = (value: number): string => `${(value * 100).toFixed(1)}%`;
    const formatPips = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(2)} pips`;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-neutral-400">Loading funnel analysis...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <div className="flex items-center gap-2 text-red-400">
                    <AlertTriangle className="w-5 h-5" />
                    <span>{error}</span>
                </div>
            </div>
        );
    }

    if (!funnel) {
        return (
            <div className="p-4 text-neutral-400 text-center">
                No funnel data available
            </div>
        );
    }

    // Validate required nested structures exist
    const hasValidData = funnel.conversion_rates && funnel.shock_gate && funnel.signal_gate;
    if (!hasValidData) {
        return (
            <div className="p-4 text-neutral-400 text-center">
                Incomplete funnel data - some fields are missing
            </div>
        );
    }

    return (
        <div className="space-y-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                        <h2 className="text-2xl font-bold text-neutral-100">Funnel Analysis</h2>
                        <p className="text-sm text-neutral-400 mt-1">
                            Shock → Signal → Trade → PnL: Where does my edge appear and disappear?
                        </p>
                        <p className="text-xs text-neutral-500 mt-1">
                            Scope: {scopeLabel}
                        </p>
                    </div>
                <div className="flex items-center gap-4">
                    <div className="text-xs text-neutral-500 space-y-1 text-right">
                        <div>{funnel.date_range?.[0] ?? '?'} to {funnel.date_range?.[1] ?? '?'} | {funnel.run_ids?.length ?? 0} runs</div>
                        <div>
                            Epoch portefeuille : {portfolioEpoch !== null ? portfolioEpoch : epochLoading ? "…" : "inconnu"}
                            {startedAt ? ` (depuis ${startedAt})` : ""}
                        </div>
                    </div>
                    {funnel.meta?.data_source && (
                        <span className={`px-2 py-1 rounded text-xs ${funnel.meta.data_source === "LEGACY" ? "bg-amber-600/30 text-amber-100" : "bg-emerald-600/30 text-emerald-100"}`}>
                            {funnel.meta.data_source}
                        </span>
                    )}
                    <button
                        onClick={() => {
                            refreshEpoch();
                            fetchFunnel();
                        }}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                        Refresh
                    </button>
                </div>
            </div>

            {/* Conversion Overview */}
            <div className="grid grid-cols-5 gap-4">
                <ConversionCard
                    label="Shock → Signal"
                    value={funnel.conversion_rates.shock_to_signal}
                    icon={<Zap className="w-4 h-4" />}
                />
                <ConversionCard
                    label="Signal → Accepted"
                    value={funnel.conversion_rates.signal_to_accepted}
                    icon={<Filter className="w-4 h-4" />}
                />
                <ConversionCard
                    label="Accepted → Trade"
                    value={funnel.conversion_rates.accepted_to_trade}
                    icon={<CheckCircle2 className="w-4 h-4" />}
                />
                <ConversionCard
                    label="Trade → Win"
                    value={funnel.conversion_rates.trade_to_win}
                    icon={<TrendingUp className="w-4 h-4" />}
                />
                <ConversionCard
                    label="Overall"
                    value={funnel.conversion_rates.overall}
                    icon={<ArrowDown className="w-4 h-4" />}
                    highlight
                />
            </div>

            {/* Four Gates */}
            <div className="space-y-4">
                {/* SHOCK GATE */}
                <FunnelStage
                    stage="SHOCK"
                    color="blue"
                    icon={<Zap className="w-5 h-5" />}
                    count={funnel.shock_gate.total_shocks}
                    passRate={funnel.shock_gate.pass_rate}
                    passCount={funnel.shock_gate.passed_threshold}
                >
                    <div className="grid grid-cols-4 gap-4 mt-4">
                        <MetricCard
                            label="Z-Score Mean"
                            value={funnel.shock_gate.z_score_distribution.mean.toFixed(2)}
                        />
                        <MetricCard
                            label="Amplitude Mean"
                            value={`${funnel.shock_gate.amplitude_distribution.mean.toFixed(2)} pips`}
                        />
                        <MetricCard
                            label="Spread Mean"
                            value={`${funnel.shock_gate.spread_distribution.mean.toFixed(3)} pips`}
                        />
                        <MetricCard
                            label="By Session"
                            value={
                                <div className="text-xs space-y-0.5">
                                    {Object.entries(funnel.shock_gate.by_session).map(([sess, cnt]) => (
                                        <div key={sess}>{sess}: {cnt}</div>
                                    ))}
                                </div>
                            }
                        />
                    </div>
                </FunnelStage>

                <FunnelArrow passCount={funnel.shock_gate.passed_threshold} />

                {/* SIGNAL GATE */}
                <FunnelStage
                    stage="SIGNAL"
                    color="purple"
                    icon={<Filter className="w-5 h-5" />}
                    count={funnel.signal_gate.total_signals}
                    passRate={funnel.signal_gate.acceptance_rate}
                    passCount={funnel.signal_gate.accepted_signals}
                >
                    <div className="grid grid-cols-2 gap-4 mt-4">
                        {/* Rejection Reasons */}
                        <div className="bg-neutral-800/30 rounded-lg p-3">
                            <div className="text-xs text-neutral-400 uppercase mb-2">Rejection Reasons</div>
                            <div className="space-y-1">
                                {Object.entries(funnel.signal_gate.rejection_reasons)
                                    .sort(([, a], [, b]) => b - a)
                                    .slice(0, 5)
                                    .map(([reason, count]) => (
                                        <div key={reason} className="flex items-center justify-between text-sm">
                                            <span className="text-neutral-300">{reason}</span>
                                            <span className="text-neutral-500">
                                                {count} ({formatPct(count / (funnel.signal_gate.total_signals - funnel.signal_gate.accepted_signals))})
                                            </span>
                                        </div>
                                    ))}
                            </div>
                        </div>

                        {/* Edge by Session */}
                        <div className="bg-neutral-800/30 rounded-lg p-3">
                            <div className="text-xs text-neutral-400 uppercase mb-2">Edge by Session</div>
                            <div className="space-y-1">
                                {Object.entries(funnel.signal_gate.edge_by_session)
                                    .sort(([, a], [, b]) => b - a)
                                    .map(([sess, edge]) => (
                                        <div key={sess} className="flex items-center justify-between text-sm">
                                            <span className="text-neutral-300">{sess}</span>
                                            <span className={edge > 0 ? 'text-emerald-400' : 'text-red-400'}>
                                                {formatPips(edge)}
                                            </span>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    </div>
                </FunnelStage>

                <FunnelArrow
                    passCount={funnel.signal_gate.accepted_signals}
                    filterReasons={funnel.signal_gate.rejection_reasons}
                />

                {/* TRADE GATE */}
                <FunnelStage
                    stage="TRADE"
                    color="amber"
                    icon={<CheckCircle2 className="w-5 h-5" />}
                    count={funnel.trade_gate.total_trades}
                    passRate={1.0}
                    passCount={funnel.trade_gate.total_trades}
                >
                    <div className="grid grid-cols-4 gap-4 mt-4">
                        <MetricCard
                            label="Slippage"
                            value={`${funnel.trade_gate.fill_quality.mean_slippage_pips.toFixed(2)} pips`}
                        />
                        <MetricCard
                            label="Submit-to-Fill"
                            value={`${funnel.trade_gate.fill_quality.mean_submit_to_fill_ms.toFixed(0)} ms`}
                        />
                        <MetricCard
                            label="Bar Age"
                            value={`${funnel.trade_gate.fill_quality.mean_bar_age_sec.toFixed(1)} s`}
                        />
                        <MetricCard
                            label="Time to Exit"
                            value={`${funnel.trade_gate.time_to_exit.mean_seconds.toFixed(0)} s`}
                        />
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-4">
                        {Object.entries(funnel.trade_gate.exit_breakdown).map(([reason, data]) => (
                            <div key={reason} className="bg-neutral-800/30 rounded-lg p-2 text-center">
                                <div className="text-xs text-neutral-400 uppercase">{reason}</div>
                                <div className="text-lg font-bold text-neutral-100">{data.count}</div>
                                <div className="text-xs text-neutral-500">
                                    avg {data.mean_time_seconds.toFixed(0)}s
                                </div>
                            </div>
                        ))}
                    </div>
                </FunnelStage>

                <FunnelArrow passCount={funnel.trade_gate.total_trades} />

                {/* PNL GATE */}
                <FunnelStage
                    stage="PNL"
                    color="emerald"
                    icon={<TrendingUp className="w-5 h-5" />}
                    count={funnel.pnl_gate.total_outcomes}
                    passRate={funnel.pnl_gate.win_rate}
                    passCount={Math.round(funnel.pnl_gate.total_outcomes * funnel.pnl_gate.win_rate)}
                >
                    <div className="grid grid-cols-4 gap-4 mt-4">
                        <MetricCard
                            label="Mean Outcome"
                            value={formatPips(funnel.pnl_gate.mean_outcome)}
                            tone={funnel.pnl_gate.mean_outcome > 0 ? 'success' : 'danger'}
                        />
                        <MetricCard
                            label="95% CI"
                            value={`[${formatPips(funnel.pnl_gate.ci_95[0])}, ${formatPips(funnel.pnl_gate.ci_95[1])}]`}
                        />
                        <MetricCard
                            label="Win Rate"
                            value={formatPct(funnel.pnl_gate.win_rate)}
                            tone={funnel.pnl_gate.win_rate > 0.5 ? 'success' : 'danger'}
                        />
                        <MetricCard
                            label="Payoff Ratio"
                            value={funnel.pnl_gate.payoff_ratio.toFixed(2)}
                            tone={funnel.pnl_gate.payoff_ratio > 1 ? 'success' : 'danger'}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-4">
                        {/* By Spread Regime */}
                        <div className="bg-neutral-800/30 rounded-lg p-3">
                            <div className="text-xs text-neutral-400 uppercase mb-2">By Spread Regime</div>
                            <div className="space-y-1">
                                {Object.entries(funnel.pnl_gate.by_spread_regime).map(([regime, data]) => (
                                    <div key={regime} className="flex items-center justify-between text-sm">
                                        <span className="text-neutral-300">{regime}</span>
                                        <span className={data.mean > 0 ? 'text-emerald-400' : 'text-red-400'}>
                                            {formatPips(data.mean)} (n={data.count})
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* By Vol Regime */}
                        <div className="bg-neutral-800/30 rounded-lg p-3">
                            <div className="text-xs text-neutral-400 uppercase mb-2">By Vol Regime</div>
                            <div className="space-y-1">
                                {Object.entries(funnel.pnl_gate.by_vol_regime).map(([regime, data]) => (
                                    <div key={regime} className="flex items-center justify-between text-sm">
                                        <span className="text-neutral-300">{regime}</span>
                                        <span className={data.mean > 0 ? 'text-emerald-400' : 'text-red-400'}>
                                            {formatPips(data.mean)} (n={data.count})
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Tail Risk */}
                    <div className="mt-4 grid grid-cols-2 gap-4">
                        <MetricCard
                            label="VaR (95%)"
                            value={formatPips(funnel.pnl_gate.var_95)}
                            tone="danger"
                        />
                        <MetricCard
                            label="CVaR (Expected Shortfall)"
                            value={formatPips(funnel.pnl_gate.cvar_95)}
                            tone="danger"
                        />
                    </div>
                </FunnelStage>
            </div>
        </div>
    );
};

// -----------------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------------

const ConversionCard: React.FC<{
    label: string;
    value: number;
    icon: React.ReactNode;
    highlight?: boolean;
}> = ({ label, value, icon, highlight }) => (
    <div
        className={`rounded-lg p-4 ${highlight
            ? 'bg-blue-600/20 border border-blue-500/50'
            : 'bg-neutral-800/50 border border-neutral-700/50'
            }`}
    >
        <div className="flex items-center gap-2 text-xs text-neutral-400 mb-1">
            {icon}
            <span>{label}</span>
        </div>
        <div className={`text-2xl font-bold ${highlight ? 'text-blue-400' : 'text-neutral-100'}`}>
            {(value * 100).toFixed(1)}%
        </div>
    </div>
);

const FunnelStage: React.FC<{
    stage: string;
    color: 'blue' | 'purple' | 'amber' | 'emerald';
    icon: React.ReactNode;
    count: number;
    passRate: number;
    passCount: number;
    children?: React.ReactNode;
}> = ({ stage, color, icon, count, passRate, passCount, children }) => {
    const colorClasses = {
        blue: 'border-blue-500/30 bg-blue-500/5',
        purple: 'border-purple-500/30 bg-purple-500/5',
        amber: 'border-amber-500/30 bg-amber-500/5',
        emerald: 'border-emerald-500/30 bg-emerald-500/5',
    };

    const iconColors = {
        blue: 'text-blue-400',
        purple: 'text-purple-400',
        amber: 'text-amber-400',
        emerald: 'text-emerald-400',
    };

    return (
        <div className={`rounded-lg border p-4 ${colorClasses[color]}`}>
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <span className={iconColors[color]}>{icon}</span>
                    <span className="text-lg font-bold text-neutral-100">{stage} GATE</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                    <span className="text-neutral-400">Total: {count.toLocaleString()}</span>
                    <span className="text-neutral-400">Pass: {passCount.toLocaleString()}</span>
                    <span className={passRate > 0.5 ? 'text-emerald-400' : 'text-yellow-400'}>
                        {(passRate * 100).toFixed(1)}%
                    </span>
                </div>
            </div>
            {children}
        </div>
    );
};

const FunnelArrow: React.FC<{
    passCount: number;
    filterReasons?: Record<string, number>;
}> = ({ passCount, filterReasons }) => (
    <div className="flex items-center justify-center py-2">
        <div className="flex flex-col items-center">
            <ArrowDown className="w-6 h-6 text-neutral-500" />
            <span className="text-xs text-neutral-500">{passCount.toLocaleString()} passed</span>
            {filterReasons && Object.keys(filterReasons).length > 0 && (
                <span className="text-xs text-red-400/60">
                    {Object.values(filterReasons).reduce((a, b) => a + b, 0).toLocaleString()} filtered
                </span>
            )}
        </div>
    </div>
);

const MetricCard: React.FC<{
    label: string;
    value: React.ReactNode;
    tone?: 'default' | 'success' | 'danger';
}> = ({ label, value, tone = 'default' }) => {
    const toneClasses = {
        default: 'text-neutral-100',
        success: 'text-emerald-400',
        danger: 'text-red-400',
    };

    return (
        <div className="bg-neutral-800/30 rounded-lg p-2">
            <div className="text-xs text-neutral-400 uppercase mb-1">{label}</div>
            <div className={`text-sm font-semibold ${toneClasses[tone]}`}>{value}</div>
        </div>
    );
};

export default FunnelView;
