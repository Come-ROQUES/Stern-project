/**
 * BacktestResults.tsx - Unified Backtest Hub with 4 tabs
 *
 * Supports both single backtest (campaign IS/OOS) and walk-forward modes.
 * Tabs: Overview | Diagnostics | Trades | Data Health
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Download, BarChart3, ArrowLeft } from 'lucide-react';
import { motion, type Variants } from 'framer-motion';
import {
    api,
    type AudnzdMultimethodReportResponse,
    type BacktestStrategy,
    type BacktestSummary,
    type BacktestTradesResponse,
} from '../../lib/api';
import { useBacktestContext } from '../../lib/useBacktestContext';
import { cn } from '../../lib/utils';
import {
    GlassCard,
    GlassBadge,
    SegmentedControl,
    EmptyState,
} from '../ui/glass';
import {
    computeExtendedMetrics,
    extractTradePnl,
    classifyExitReason,
    STRATEGY_LABELS,
    EXIT_COLORS,
    type BacktestStrategy as BtStrat,
} from '../../lib/backtestUtils';
import {
    getWalkForwardSummary,
    getWalkForwardAllTrades,
    type WalkForwardSummary,
} from '../../lib/quantApi';
import { BacktestDiagnostics } from './BacktestDiagnostics';
import { WalkForwardResults } from './WalkForwardResults';
import { BacktestTradesTable } from './BacktestTradesTable';
import { BacktestDataHealth } from './BacktestDataHealth';
import { ResultsKPIBar } from './results/ResultsKPIBar';
import { EquityCurve } from './results/EquityCurve';
import EquityCurveLW from './results/EquityCurveLW';
import { ExitReasonChart } from './results/ExitReasonChart';
import { PnLDistribution } from './results/PnLDistribution';
import { SessionAnalysis } from './results/SessionAnalysis';
import { TradeTable } from './results/TradeTable';
import { VirtualTradeTable } from './results/VirtualTradeTable';
import { BacktestCockpit } from './BacktestCockpit';
import { ResearchArtifactInspector } from './ResearchArtifactInspector';
import { StrategyResearchDesk } from './StrategyResearchDesk';

export function getCampaignStrategies(
    campaignStatus: { settings?: { strategies?: BacktestStrategy[] | null } | null } | null
): BacktestStrategy[] {
    const strategies = campaignStatus?.settings?.strategies ?? [];
    const strats = new Set(strategies);
    return (['dw', 's2', 'tf_pullback'] as BacktestStrategy[]).filter((s) => strats.has(s));
}

function formatWindowDate(value: string | null | undefined): string {
    return typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : 'n/a';
}

const RESEARCH_STRATEGY_META: Record<string, { title: string; badgeLabel?: string | null }> = {
    damping_wave: { title: 'S1 Research Desk', badgeLabel: 'EURUSD' },
    s2_pairs_trading: { title: 'S2 Research Desk', badgeLabel: 'AUDNZD' },
    tf_pullback_v1: { title: 'S3 Research Desk', badgeLabel: 'EURUSD' },
};

function AudnzdChampionCard({ report }: { report: AudnzdMultimethodReportResponse["latest_report"] }) {
    const champion = report?.recommended_champion;
    if (!report?.available || !champion) return null;

    return (
        <GlassCard className="border-cyan-400/20 bg-cyan-500/[0.05]">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-xs uppercase tracking-[0.16em] text-cyan-300">
                            AUDNZD Champion
                        </div>
                        <GlassBadge variant="info">{champion.variant_id}</GlassBadge>
                        <GlassBadge variant="default">{champion.method}</GlassBadge>
                        {report.profile && <GlassBadge variant="default">{report.profile}</GlassBadge>}
                    </div>
                    <div className="text-sm text-neutral-300 max-w-3xl">
                        Champion multi-methodes offline `AUDUSD/NZDUSD` relu depuis les artefacts backtest de reference.
                    </div>
                    <div className="text-[11px] text-neutral-500">
                        Genere: {report.generated_at ?? 'n/a'} · {report.report_path}
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Median OOS</div>
                    <div className="text-lg font-mono text-emerald-300">
                        {champion.walk_forward.median_oos_pnl_bps.toFixed(1)} bps
                    </div>
                </div>
            </div>
            <div className="mt-4 grid grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
                <div>
                    <div className="text-neutral-500 mb-0.5">Trades FS</div>
                    <div className="text-white font-mono">{champion.full_sample.total_trades}</div>
                </div>
                <div>
                    <div className="text-neutral-500 mb-0.5">PnL FS</div>
                    <div className="text-emerald-300 font-mono">{champion.full_sample.gross_pnl_bps.toFixed(1)} bps</div>
                </div>
                <div>
                    <div className="text-neutral-500 mb-0.5">PF FS</div>
                    <div className="text-white font-mono">{champion.full_sample.profit_factor.toFixed(2)}</div>
                </div>
                <div>
                    <div className="text-neutral-500 mb-0.5">Max DD FS</div>
                    <div className="text-white font-mono">{champion.full_sample.max_drawdown_bps.toFixed(1)} bps</div>
                </div>
                <div>
                    <div className="text-neutral-500 mb-0.5">Folds profitables</div>
                    <div className="text-white font-mono">{(champion.walk_forward.profitable_share * 100).toFixed(0)}%</div>
                </div>
                <div>
                    <div className="text-neutral-500 mb-0.5">Trades OOS</div>
                    <div className="text-white font-mono">{champion.walk_forward.aggregate_trades}</div>
                </div>
            </div>
        </GlassCard>
    );
}

// ---------------------------------------------------------------------------
// Exit Reasons Donut (inline SVG)
// ---------------------------------------------------------------------------

function ExitReasonsDonut({ trades }: { trades: Record<string, unknown>[] }) {
    const data = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const t of trades) {
            const reason = classifyExitReason(t);
            counts[reason] = (counts[reason] ?? 0) + 1;
        }
        const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        const total = entries.reduce((s, [, v]) => s + v, 0);
        return { entries, total };
    }, [trades]);

    if (data.total === 0) {
        return <div className="h-full flex items-center justify-center text-neutral-600 text-sm">Aucune donnee</div>;
    }

    const R = 70;
    const r = 45;
    const cx = 100;
    const cy = 90;
    let startAngle = -Math.PI / 2;

    const arcs = data.entries.map(([label, count]) => {
        const frac = count / data.total;
        const endAngle = startAngle + frac * 2 * Math.PI;
        const largeArc = frac > 0.5 ? 1 : 0;
        const x1 = cx + R * Math.cos(startAngle);
        const y1 = cy + R * Math.sin(startAngle);
        const x2 = cx + R * Math.cos(endAngle);
        const y2 = cy + R * Math.sin(endAngle);
        const x3 = cx + r * Math.cos(endAngle);
        const y3 = cy + r * Math.sin(endAngle);
        const x4 = cx + r * Math.cos(startAngle);
        const y4 = cy + r * Math.sin(startAngle);
        const d = `M${x1},${y1} A${R},${R} 0 ${largeArc},1 ${x2},${y2} L${x3},${y3} A${r},${r} 0 ${largeArc},0 ${x4},${y4} Z`;
        startAngle = endAngle;
        return { label, count, frac, d, color: EXIT_COLORS[label] ?? '#737373' };
    });

    return (
        <div className="flex items-center gap-4">
            <svg viewBox="0 0 200 180" className="w-[140px] h-[130px] flex-shrink-0">
                {arcs.map((arc) => (
                    <path key={arc.label} d={arc.d} fill={arc.color} opacity="0.8" />
                ))}
                <text x={cx} y={cy - 4} textAnchor="middle" fill="white" fontSize="16" fontWeight="600">
                    {data.total}
                </text>
                <text x={cx} y={cy + 12} textAnchor="middle" fill="#737373" fontSize="9">trades</text>
            </svg>
            <div className="flex flex-col gap-1.5 text-[11px]">
                {arcs.map((arc) => (
                    <div key={arc.label} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: arc.color }} />
                        <span className="text-neutral-400 min-w-[5ch]">{arc.label}</span>
                        <span className="text-neutral-300 font-mono">{arc.count}</span>
                        <span className="text-neutral-600 font-mono">({(arc.frac * 100).toFixed(0)}%)</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Funnel Visualization
// ---------------------------------------------------------------------------

function FunnelViz({ summary }: { summary: BacktestSummary | null }) {
    if (!summary) return <div className="h-full flex items-center justify-center text-neutral-600 text-sm">Aucune donnee</div>;

    const steps = [
        { label: 'Bars', value: summary.bars ?? 0, color: '#60a5fa' },
        { label: 'Raw Shocks', value: summary.n_raw_shocks ?? 0, color: '#818cf8' },
        { label: 'Dedup', value: summary.n_dedup_shocks ?? 0, color: '#a78bfa' },
        { label: 'Signals', value: summary.n_signals ?? 0, color: '#c084fc' },
        { label: 'Trades', value: summary.n_trades ?? 0, color: '#22d3ee' },
    ];

    const maxVal = Math.max(...steps.map((s) => s.value), 1);

    return (
        <div className="flex flex-col gap-2">
            {steps.map((step, i) => {
                const widthPct = Math.max(8, (step.value / maxVal) * 100);
                const convRate = i > 0 && steps[i - 1].value > 0
                    ? ((step.value / steps[i - 1].value) * 100).toFixed(1) + '%'
                    : null;
                return (
                    <div key={step.label} className="flex items-center gap-2">
                        <span className="text-[10px] text-neutral-500 min-w-[5.5ch] text-right font-mono">
                            {step.value.toLocaleString()}
                        </span>
                        <div className="flex-1 h-5 bg-white/[0.02] rounded overflow-hidden relative">
                            <div
                                className="h-full rounded transition-all duration-500"
                                style={{ width: `${widthPct}%`, backgroundColor: step.color, opacity: 0.6 }}
                            />
                            <span className="absolute inset-y-0 left-2 flex items-center text-[10px] text-white/70 font-medium">
                                {step.label}
                            </span>
                        </div>
                        {convRate && (
                            <span className="text-[9px] text-neutral-600 font-mono min-w-[4ch] text-right">
                                {convRate}
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Tab type
// ---------------------------------------------------------------------------

type TabId = 'overview' | 'diagnostics' | 'trades' | 'data_health';

const TAB_OPTIONS: { value: TabId; label: string }[] = [
    { value: 'overview', label: 'Overview' },
    { value: 'diagnostics', label: 'Diagnostics' },
    { value: 'trades', label: 'Trades' },
    { value: 'data_health', label: 'Data Health' },
];

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

const CARD_EASE = [0.16, 1, 0.3, 1] as const;

const cardMotion: Variants = {
    hidden: { opacity: 0, y: 12 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { delay: i * 0.04, duration: 0.3, ease: CARD_EASE },
    }),
};

// ---------------------------------------------------------------------------
// Main Hub Component
// ---------------------------------------------------------------------------

export function BacktestResults() {
    const {
        campaignStatus, selectedStrategy, setSelectedStrategy,
        isRunId, oosRunId, selectedRunId,
        selectedWalkForwardId, setSelectedWalkForwardId,
        selectedStrategyId, setSelectedStrategyId,
        selectedResearchArtifactId,
    } = useBacktestContext();

    const [isSummary, setIsSummary] = useState<BacktestSummary | null>(null);
    const [oosSummary, setOosSummary] = useState<BacktestSummary | null>(null);
    const [isTrades, setIsTrades] = useState<Record<string, unknown>[]>([]);
    const [oosTrades, setOosTrades] = useState<Record<string, unknown>[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabId>('overview');
    const [audnzdReport, setAudnzdReport] = useState<AudnzdMultimethodReportResponse | null>(null);
    // WF summary for WF mode
    const [wfSummary, setWfSummary] = useState<WalkForwardSummary | null>(null);
    const [wfTrades, setWfTrades] = useState<Record<string, unknown>[]>([]);

    const isWfMode = !!selectedWalkForwardId;
    const researchStrategyId = selectedStrategyId ?? 's2_pairs_trading';
    const researchMeta = RESEARCH_STRATEGY_META[researchStrategyId] ?? {
        title: 'Research Desk',
        badgeLabel: null,
    };

    // Available strategies from campaign
    const availableStrategies = useMemo(() => {
        return getCampaignStrategies(campaignStatus);
    }, [campaignStatus]);

    // Auto-select first strategy if none selected
    useEffect(() => {
        if (!selectedStrategy && availableStrategies.length > 0) {
            setSelectedStrategy(availableStrategies[0]);
        }
    }, [selectedStrategy, availableStrategies, setSelectedStrategy]);

    // Load WF data
    useEffect(() => {
        if (!selectedWalkForwardId) {
            setWfSummary(null);
            setWfTrades([]);
            return;
        }
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const [summary, trades] = await Promise.all([
                    getWalkForwardSummary(selectedWalkForwardId),
                    getWalkForwardAllTrades(selectedWalkForwardId, 'oos', { limit: 5000 }),
                ]);
                if (cancelled) return;
                setWfSummary(summary);
                setWfTrades(trades.trades as Record<string, unknown>[]);
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur WF');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [selectedWalkForwardId]);

    // Load BT data when IS/OOS run IDs change
    useEffect(() => {
        if (selectedWalkForwardId) return; // WF mode handles its own loading
        if (!isRunId && !oosRunId) return;
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const promises: Promise<any>[] = [];
                if (isRunId) {
                    promises.push(api.getBacktestSummary(isRunId));
                    promises.push(api.getBacktestTrades(isRunId, 500, 0));
                } else {
                    promises.push(Promise.resolve(null));
                    promises.push(Promise.resolve(null));
                }
                if (oosRunId) {
                    promises.push(api.getBacktestSummary(oosRunId));
                    promises.push(api.getBacktestTrades(oosRunId, 500, 0));
                } else {
                    promises.push(Promise.resolve(null));
                    promises.push(Promise.resolve(null));
                }

                const [isS, isT, oosS, oosT] = await Promise.all(promises);
                if (cancelled) return;
                setIsSummary(isS);
                setIsTrades((isT as BacktestTradesResponse | null)?.data ?? []);
                setOosSummary(oosS);
                setOosTrades((oosT as BacktestTradesResponse | null)?.data ?? []);
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur chargement');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => { cancelled = true; };
    }, [isRunId, oosRunId, selectedWalkForwardId]);

    // Legacy single-run view
    useEffect(() => {
        if (selectedWalkForwardId) return;
        if (campaignStatus || !selectedRunId) return;
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                const [s, t] = await Promise.all([
                    api.getBacktestSummary(selectedRunId),
                    api.getBacktestTrades(selectedRunId, 500, 0),
                ]);
                if (cancelled) return;
                setIsSummary(s);
                setIsTrades(t.data ?? []);
                setOosSummary(null);
                setOosTrades([]);
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur chargement');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [selectedRunId, campaignStatus, selectedWalkForwardId]);

    useEffect(() => {
        let cancelled = false;
        api.getAudnzdMultimethodReport(5)
            .then((payload) => {
                if (!cancelled) setAudnzdReport(payload);
            })
            .catch(() => {
                if (!cancelled) setAudnzdReport(null);
            });
        return () => { cancelled = true; };
    }, []);

    // Compute metrics
    const displayTrades = isWfMode ? wfTrades : isTrades;
    const isMetrics = useMemo(() => computeExtendedMetrics(displayTrades), [displayTrades]);
    const oosMetrics = useMemo(() => computeExtendedMetrics(oosTrades), [oosTrades]);
    const hasDualView = !isWfMode && oosRunId != null && oosTrades.length > 0;

    // Export handler
    const [exporting, setExporting] = useState(false);
    const handleExport = async (targetRunId: string | null) => {
        if (!targetRunId) return;
        setExporting(true);
        try {
            const { blob, filename } = await api.downloadBacktestExport(targetRunId);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Export failed:', err);
        } finally {
            setExporting(false);
        }
    };

    // No data state
    if (!campaignStatus && !selectedRunId && !selectedWalkForwardId) {
        return (
            <div className="p-6 flex items-center justify-center min-h-[60vh]">
                <EmptyState
                    icon={<BarChart3 size={32} />}
                    title="No Results"
                    message="Lancer une campagne ou un walk-forward depuis l'onglet Launch pour voir les resultats."
                />
            </div>
        );
    }

    // ---------------------------------------------------------------------------
    // Header
    // ---------------------------------------------------------------------------

    const strategyLabel = isWfMode
        ? STRATEGY_LABELS[(wfSummary?.strategy ?? '') as BtStrat] ?? wfSummary?.strategy ?? ''
        : selectedStrategy
            ? STRATEGY_LABELS[selectedStrategy as BtStrat] ?? selectedStrategy
            : '';

    const header = (
        <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 flex-wrap">
                {isWfMode && (
                    <button
                        onClick={() => setSelectedWalkForwardId(null)}
                        className="p-1 rounded hover:bg-white/10 transition-colors text-neutral-400 hover:text-white"
                    >
                        <ArrowLeft size={16} />
                    </button>
                )}
                <h1 className="text-lg font-semibold text-white">
                    {isWfMode ? 'Walk-Forward Results' : 'Results'}
                </h1>
                {strategyLabel && <GlassBadge variant="info">{strategyLabel}</GlassBadge>}
                {isWfMode && wfSummary && (
                    <>
                        <GlassBadge variant="default">
                            {wfSummary.folds_count} folds
                        </GlassBadge>
                        <GlassBadge variant={wfSummary.folds_done === wfSummary.folds_count ? 'success' : 'warning'}>
                            {wfSummary.folds_done}/{wfSummary.folds_count} done
                        </GlassBadge>
                    </>
                )}
                {!isWfMode && availableStrategies.length > 1 && (
                    <SegmentedControl
                        options={availableStrategies.map((s) => ({
                            value: s,
                            label: STRATEGY_LABELS[s as BtStrat] ?? s,
                        }))}
                        value={selectedStrategy ?? availableStrategies[0]}
                        onChange={setSelectedStrategy}
                    />
                )}
                {!isWfMode && campaignStatus && (
                    <>
                        <GlassBadge variant="default">
                            IS: {formatWindowDate(campaignStatus.windows?.is_start_ts)} -- {formatWindowDate(campaignStatus.windows?.is_end_ts)}
                        </GlassBadge>
                        <GlassBadge variant="default">
                            OOS: {formatWindowDate(campaignStatus.windows?.oos_start_ts)} -- {formatWindowDate(campaignStatus.windows?.oos_end_ts)}
                        </GlassBadge>
                    </>
                )}
                {loading && <span className="text-xs text-neutral-500 animate-pulse">Chargement...</span>}
            </div>

            <div className="flex items-center gap-2">
                {!isWfMode && isRunId && (
                    <button
                        onClick={() => handleExport(isRunId)}
                        disabled={exporting}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-white/10 text-neutral-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40"
                    >
                        <Download size={12} />
                        {hasDualView ? 'IS' : 'Export'}
                    </button>
                )}
                {!isWfMode && hasDualView && oosRunId && (
                    <button
                        onClick={() => handleExport(oosRunId)}
                        disabled={exporting}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-white/10 text-neutral-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40"
                    >
                        <Download size={12} />
                        OOS
                    </button>
                )}
                <SegmentedControl
                    options={TAB_OPTIONS}
                    value={activeTab}
                    onChange={(v) => setActiveTab(v as TabId)}
                />
            </div>
        </div>
    );

    // ---------------------------------------------------------------------------
    // Tab: Diagnostics
    // ---------------------------------------------------------------------------

    if (activeTab === 'diagnostics') {
        return (
            <div className="space-y-4">
                {header}
                {isWfMode ? (
                    <BacktestDiagnostics
                        wfId={selectedWalkForwardId}
                        isRunId={null}
                        oosRunId={null}
                        isTrades={wfTrades}
                        oosTrades={[]}
                    />
                ) : (
                    <BacktestDiagnostics
                        isRunId={isRunId ?? selectedRunId ?? null}
                        oosRunId={oosRunId ?? null}
                        isTrades={isTrades}
                        oosTrades={oosTrades}
                    />
                )}
            </div>
        );
    }

    // ---------------------------------------------------------------------------
    // Tab: Trades
    // ---------------------------------------------------------------------------

    if (activeTab === 'trades') {
        return (
            <div className="space-y-4">
                {header}
                {isWfMode ? (
                    <BacktestTradesTable wfId={selectedWalkForwardId} phase="oos" />
                ) : (
                    <BacktestTradesTable runId={isRunId ?? selectedRunId ?? null} />
                )}
            </div>
        );
    }

    // ---------------------------------------------------------------------------
    // Tab: Data Health
    // ---------------------------------------------------------------------------

    if (activeTab === 'data_health') {
        return (
            <div className="space-y-4">
                {header}
                <BacktestDataHealth />
            </div>
        );
    }

    // ---------------------------------------------------------------------------
    // Tab: Overview (default)
    // ---------------------------------------------------------------------------

    // In WF mode, show the WalkForwardResults component as the overview
    if (isWfMode && selectedWalkForwardId) {
        return (
            <div className="space-y-4">
                {header}
                <WalkForwardResults
                    wfId={selectedWalkForwardId}
                    onBack={() => setSelectedWalkForwardId(null)}
                    embedded
                />
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {header}

            {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-200">
                    {error}
                </div>
            )}

            <motion.div custom={0} initial="hidden" animate="visible" variants={cardMotion}>
                <AudnzdChampionCard report={audnzdReport?.latest_report ?? null} />
            </motion.div>

            <motion.div custom={0} initial="hidden" animate="visible" variants={cardMotion}>
                <BacktestCockpit
                    selectedStrategyId={researchStrategyId}
                    onSelectStrategy={setSelectedStrategyId}
                />
            </motion.div>

            <motion.div custom={0} initial="hidden" animate="visible" variants={cardMotion}>
                <StrategyResearchDesk
                    strategyId={researchStrategyId}
                    title={researchMeta.title}
                    badgeLabel={researchMeta.badgeLabel}
                    showArtifactInspector={false}
                />
            </motion.div>

            {selectedResearchArtifactId && (
                <motion.div custom={1} initial="hidden" animate="visible" variants={cardMotion}>
                    <ResearchArtifactInspector artifactId={selectedResearchArtifactId} />
                </motion.div>
            )}

            {/* KPI Row */}
            {isMetrics.tradeCount > 0 && (
                <motion.div custom={1} initial="hidden" animate="visible" variants={cardMotion}>
                    <ResultsKPIBar isMetrics={isMetrics} oosMetrics={oosMetrics} hasDualView={hasDualView} />
                </motion.div>
            )}

            {/* Charts Row 1: Equity Curve (LW) + PnL Distribution */}
            <div className="grid grid-cols-12 gap-3">
                <motion.div custom={1} initial="hidden" animate="visible" variants={cardMotion} className="col-span-12 lg:col-span-8">
                    <GlassCard>
                        <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
                            Equity Curve
                        </div>
                        <EquityCurveLW
                            data={isMetrics.cumPnl.map((v, i) => ({
                                time: isMetrics.labels[i] ?? `${i}`,
                                value: v,
                            }))}
                            height={280}
                        />
                    </GlassCard>
                </motion.div>
                <motion.div custom={2} initial="hidden" animate="visible" variants={cardMotion} className="col-span-12 lg:col-span-4">
                    <PnLDistribution isTrades={isTrades} oosTrades={oosTrades} hasDualView={hasDualView} />
                </motion.div>
            </div>

            {/* Charts Row 2: Exit Reasons + Session Analysis + Summary */}
            <div className="grid grid-cols-12 gap-3">
                <motion.div custom={3} initial="hidden" animate="visible" variants={cardMotion} className="col-span-12 sm:col-span-6 lg:col-span-4">
                    <GlassCard>
                        <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
                            Exit Reasons
                        </div>
                        <ExitReasonChart trades={hasDualView ? [...isTrades, ...oosTrades] : isTrades} />
                    </GlassCard>
                </motion.div>
                <motion.div custom={4} initial="hidden" animate="visible" variants={cardMotion} className="col-span-12 sm:col-span-6 lg:col-span-4">
                    <GlassCard>
                        <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
                            Pipeline Funnel
                        </div>
                        <FunnelViz summary={isSummary} />
                    </GlassCard>
                </motion.div>
                <motion.div custom={5} initial="hidden" animate="visible" variants={cardMotion} className="col-span-12 lg:col-span-4">
                    <GlassCard>
                        <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
                            Performance Summary
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                            <div>
                                <div className="text-neutral-500 mb-0.5">TP Hit Rate</div>
                                <div className="text-white font-mono">{(isMetrics.tpHitRate * 100).toFixed(1)}%</div>
                            </div>
                            <div>
                                <div className="text-neutral-500 mb-0.5">SL Hit Rate</div>
                                <div className="text-white font-mono">{(isMetrics.slHitRate * 100).toFixed(1)}%</div>
                            </div>
                            <div>
                                <div className="text-neutral-500 mb-0.5">Gross Profit</div>
                                <div className="text-emerald-400 font-mono">
                                    {isTrades.map(extractTradePnl).filter((p) => p > 0).reduce((s, v) => s + v, 0).toFixed(1)}p
                                </div>
                            </div>
                            <div>
                                <div className="text-neutral-500 mb-0.5">Gross Loss</div>
                                <div className="text-rose-400 font-mono">
                                    {isTrades.map(extractTradePnl).filter((p) => p < 0).reduce((s, v) => s + v, 0).toFixed(1)}p
                                </div>
                            </div>
                            {isSummary && (
                                <>
                                    <div>
                                        <div className="text-neutral-500 mb-0.5">Bars Scanned</div>
                                        <div className="text-white font-mono">{(isSummary.bars ?? 0).toLocaleString()}</div>
                                    </div>
                                    <div>
                                        <div className="text-neutral-500 mb-0.5">Signals</div>
                                        <div className="text-white font-mono">{(isSummary.n_signals ?? 0).toLocaleString()}</div>
                                    </div>
                                </>
                            )}
                        </div>
                    </GlassCard>
                </motion.div>
            </div>

            {/* Session Analysis */}
            <motion.div custom={6} initial="hidden" animate="visible" variants={cardMotion}>
                <GlassCard>
                    <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
                        Session Breakdown
                    </div>
                    <SessionAnalysis trades={hasDualView ? [...isTrades, ...oosTrades] : isTrades} />
                </GlassCard>
            </motion.div>

            {/* Virtualized Trade Table */}
            <motion.div custom={7} initial="hidden" animate="visible" variants={cardMotion}>
                <VirtualTradeTable
                    trades={hasDualView ? [...isTrades, ...oosTrades] : isTrades}
                    phase={hasDualView ? null : 'IS'}
                />
            </motion.div>
        </div>
    );
}
