/**
 * Trade Performance Page - Quant Lab V2
 * 
 * Question: "Ma strategie est-elle rentable ?"
 * 
 * Charts:
 * 1. Equity Curve (cumulative PnL + drawdown)
 * 2. PnL Distribution (histogram)
 * 3. MAE/MFE Scatter (risk profile)
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, TrendingUp, BarChart3, Filter, Shield, Activity } from "lucide-react";
import { useQuantLabScope } from "../../../lib/SelectionContext";
import { usePortfolioEpoch } from "../../../lib/usePortfolioEpoch";
import {
    getTradePerformanceV3First,
    getRobustEdgeMetrics,
    TradePerformanceResponse,
    RobustEdge,
} from "../../../lib/quantApi";
import {
    BentoCard,
    BentoGrid,
    ChartCard,
    KpiStat,
    KpiRow,
    Badge,
    EmptyState,
} from "../ui";

const Plot = React.lazy(() => import("../../../lib/PlotlyBasic"));

const SCOPE_OPTIONS = [
    { value: "TODAY", label: "Today (all runs)" },
    { value: "7D", label: "Last 7 days (all runs)" },
    { value: "30D", label: "Last 30 days (all runs)" },
    { value: "RUN", label: "This Run only" },
];

export function TradePerformance() {
    const quantScope = useQuantLabScope();
    const { scope, runId, strategyId, scopeLabel, missingRunId } = quantScope;
    const { epoch: portfolioEpoch } = usePortfolioEpoch();
    const [data, setData] = useState<TradePerformanceResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [robustEdge, setRobustEdge] = useState<RobustEdge | null>(null);
    const [robustLoading, setRobustLoading] = useState(false);
    const requestSeq = useRef(0);

    const loadData = async () => {
        const requestId = ++requestSeq.current;
        if (missingRunId) {
            setData(null);
            setError("Selectionne un run pour utiliser le scope RUN.");
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const result = await getTradePerformanceV3First(
                runId ?? undefined,
                strategyId ?? undefined,
                scope
            );
            if (requestId !== requestSeq.current) return;
            setData(result);
        } catch (e: any) {
            if (requestId !== requestSeq.current) return;
            setError(e.message || "Failed to load trade data");
        } finally {
            if (requestId !== requestSeq.current) return;
            setLoading(false);
        }
    };

    const loadRobust = async () => {
        setRobustLoading(true);
        try {
            const res = await getRobustEdgeMetrics({
                scope,
                runId: runId ?? undefined,
                strategyId: strategyId ?? undefined,
                portfolioEpoch,
            });
            setRobustEdge(res.robust_edge);
        } catch {
            // Silently fail -- robust metrics are supplementary
            setRobustEdge(null);
        } finally {
            setRobustLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [runId, scope, strategyId, missingRunId]);

    useEffect(() => {
        if (!missingRunId && scope !== "RUN" && scope !== "BACKTEST") loadRobust();
    }, [scope, portfolioEpoch, runId, strategyId, missingRunId]);

    // Equity curve chart — trade-indexed (1 point = 1 trade exit)
    const equityChartData = useMemo(() => {
        if (!data?.equity_curve.length) return null;

        // Data arrives chronologically sorted from quantApi
        const ec = data.equity_curve;
        const tradeIdx = ec.map((_, i) => i + 1);
        const yPnl = ec.map((p) => p.cumulative_pnl);
        const yDd = ec.map((p) => p.drawdown);
        const hoverTs = ec.map((p) => {
            const d = new Date(p.ts);
            return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
        });

        return {
            data: [
                // Drawdown fill (negative area)
                {
                    type: "scatter" as const,
                    mode: "lines" as const,
                    x: tradeIdx,
                    y: yDd,
                    fill: "tozeroy" as const,
                    fillcolor: "rgba(239, 68, 68, 0.2)",
                    line: { color: "transparent", shape: "linear" as const },
                    name: "Drawdown",
                    text: hoverTs,
                    hovertemplate: "Trade #%{x}<br>DD: %{y:.2f}p<br>%{text}<extra></extra>",
                },
                // Equity line with markers
                {
                    type: "scatter" as const,
                    mode: "lines+markers" as const,
                    x: tradeIdx,
                    y: yPnl,
                    line: { color: "#22c55e", width: 2, shape: "linear" as const },
                    marker: { size: 5, color: "#22c55e", line: { width: 1, color: "rgba(255,255,255,0.3)" } },
                    name: "Equity",
                    text: hoverTs,
                    hovertemplate: "Trade #%{x}<br>PnL: %{y:.2f}p<br>%{text}<extra></extra>",
                },
            ],
            layout: {
                height: 280,
                margin: { l: 50, r: 20, t: 10, b: 40 },
                paper_bgcolor: "transparent",
                plot_bgcolor: "transparent",
                xaxis: {
                    title: { text: "Trade #", font: { size: 11, color: "#8b95a9" } },
                    showgrid: false,
                    tickfont: { size: 10, color: "#8b95a9" },
                    linecolor: "rgba(255,255,255,0.1)",
                    dtick: ec.length > 50 ? Math.ceil(ec.length / 20) : 1,
                },
                yaxis: {
                    title: { text: "PnL (pips)", font: { size: 11, color: "#8b95a9" } },
                    showgrid: true,
                    gridcolor: "rgba(255,255,255,0.05)",
                    tickfont: { size: 10, color: "#8b95a9" },
                    zeroline: true,
                    zerolinecolor: "rgba(255,255,255,0.2)",
                },
                showlegend: true,
                legend: {
                    x: 0,
                    y: 1.1,
                    orientation: "h" as const,
                    font: { size: 10, color: "#8b95a9" },
                },
                hovermode: "closest" as const,
            },
        };
    }, [data]);

    // PnL distribution histogram
    const distributionData = useMemo(() => {
        if (!data?.trades.length) return null;

        const pnlValues = data.trades.map((t) => t.pnl_pips);
        const wins = pnlValues.filter((v) => v > 0);
        const losses = pnlValues.filter((v) => v <= 0);

        return {
            data: [
                {
                    type: "histogram" as const,
                    x: losses,
                    name: "Losses",
                    marker: { color: "rgba(239, 68, 68, 0.7)" },
                    opacity: 0.8,
                    nbinsx: 15,
                    hovertemplate: "PnL: %{x:.2f}p<br>Count: %{y}<extra></extra>",
                },
                {
                    type: "histogram" as const,
                    x: wins,
                    name: "Wins",
                    marker: { color: "rgba(34, 197, 94, 0.7)" },
                    opacity: 0.8,
                    nbinsx: 15,
                    hovertemplate: "PnL: %{x:.2f}p<br>Count: %{y}<extra></extra>",
                },
                // Zero line
                {
                    type: "scatter" as const,
                    mode: "lines" as const,
                    x: [0, 0],
                    y: [0, Math.max(wins.length, losses.length) * 0.5],
                    line: { color: "rgba(255,255,255,0.4)", width: 2, dash: "dash" as const },
                    showlegend: false,
                    hoverinfo: "skip" as const,
                },
            ],
            layout: {
                height: 240,
                margin: { l: 50, r: 20, t: 10, b: 40 },
                paper_bgcolor: "transparent",
                plot_bgcolor: "transparent",
                barmode: "overlay" as const,
                xaxis: {
                    title: { text: "PnL (pips)", font: { size: 11, color: "#8b95a9" } },
                    showgrid: true,
                    gridcolor: "rgba(255,255,255,0.05)",
                    tickfont: { size: 10, color: "#8b95a9" },
                },
                yaxis: {
                    title: { text: "Count", font: { size: 11, color: "#8b95a9" } },
                    showgrid: true,
                    gridcolor: "rgba(255,255,255,0.05)",
                    tickfont: { size: 10, color: "#8b95a9" },
                },
                showlegend: true,
                legend: {
                    x: 1,
                    y: 1,
                    xanchor: "right" as const,
                    font: { size: 10, color: "#8b95a9" },
                },
            },
        };
    }, [data]);

    // MAE/MFE scatter
    const maeMfeData = useMemo(() => {
        if (!data?.trades.length) return null;

        const tradesWithExcursions = data.trades.filter(
            (t) => t.mae_pips != null && t.mfe_pips != null
        );
        if (!tradesWithExcursions.length) return null;

        const mae = tradesWithExcursions.map((t) => Math.abs(t.mae_pips as number));
        const mfe = tradesWithExcursions.map((t) => t.mfe_pips as number);
        const colors = tradesWithExcursions.map((t) => (t.pnl_pips > 0 ? "#22c55e" : "#ef4444"));
        const text = tradesWithExcursions.map((t) => {
            const maeTxt = t.mae_pips != null ? t.mae_pips.toFixed(2) : "n/a";
            const mfeTxt = t.mfe_pips != null ? t.mfe_pips.toFixed(2) : "n/a";
            return `PnL: ${t.pnl_pips.toFixed(2)}p<br>MAE: ${maeTxt}p<br>MFE: ${mfeTxt}p<br>Hold: ${t.hold_seconds}s`;
        });

        const missingExcursions = data.trades.length - tradesWithExcursions.length;
        return {
            data: [
                {
                    type: "scattergl" as const,
                    mode: "markers" as const,
                    x: mae,
                    y: mfe,
                    marker: {
                        color: colors,
                        size: 8,
                        opacity: 0.7,
                        line: { width: 1, color: "rgba(255,255,255,0.2)" },
                    },
                    text,
                    hovertemplate: "MAE: %{x:.2f}p<br>MFE: %{y:.2f}p<br>%{text}<extra></extra>",
                },
                // Diagonal line (MAE = MFE reference)
                {
                    type: "scatter" as const,
                    mode: "lines" as const,
                    x: [0, Math.max(...mae)],
                    y: [0, Math.max(...mfe)],
                    line: { color: "rgba(255,255,255,0.2)", width: 1, dash: "dot" as const },
                    showlegend: false,
                    hoverinfo: "skip" as const,
                },
            ],
            layout: {
                height: 240,
                margin: { l: 50, r: 20, t: 10, b: 40 },
                paper_bgcolor: "transparent",
                plot_bgcolor: "transparent",
                xaxis: {
                    title: { text: "MAE (pips)", font: { size: 11, color: "#8b95a9" } },
                    showgrid: true,
                    gridcolor: "rgba(255,255,255,0.05)",
                    tickfont: { size: 10, color: "#8b95a9" },
                },
                yaxis: {
                    title: { text: "MFE (pips)", font: { size: 11, color: "#8b95a9" } },
                    showgrid: true,
                    gridcolor: "rgba(255,255,255,0.05)",
                    tickfont: { size: 10, color: "#8b95a9" },
                },
                showlegend: false,
                hovermode: "closest" as const,
                annotations: missingExcursions
                    ? [
                        {
                            xref: "paper",
                            yref: "paper",
                            x: 1,
                            y: 1.05,
                            xanchor: "right",
                            yanchor: "bottom",
                            text: `MAE/MFE missing: ${missingExcursions}/${data.trades.length}`,
                            showarrow: false,
                            font: { size: 11, color: "#fbbf24" },
                        },
                    ]
                    : [],
            },
        };
    }, [data]);

    const plotConfig = {
        displayModeBar: false,
        responsive: true,
    };

    const pnlUsd = data?.kpis.total_pnl_usd ?? null;
    const pnlPips = data?.kpis.total_pnl ?? null;
    const winRate = data?.kpis.win_rate ?? null;
    const profitFactor = data?.kpis.profit_factor ?? null;
    const tradesCount = data?.kpis.trade_count ?? 0;
    const maeMissingCount = data?.trades.filter((t) => t.mae_pips == null || t.mfe_pips == null).length ?? 0;
    const maeMissingBadge =
        maeMissingCount > 0
            ? `MAE/MFE missing ${maeMissingCount}/${data?.trades.length ?? 0}`
            : null;
    const maeMedian =
        data && data.trades.length
            ? (() => {
                const vals = data.trades
                    .map((t) => t.mae_pips)
                    .filter((v): v is number => v != null)
                    .sort((a, b) => a - b);
                if (!vals.length) return null;
                const mid = Math.floor(vals.length / 2);
                return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
            })()
            : null;
    const holdMedian =
        data && data.trades.length
            ? (() => {
                const vals = data.trades
                    .map((t) => t.hold_seconds ?? 0)
                    .filter((v) => Number.isFinite(v))
                    .sort((a, b) => a - b);
                if (!vals.length) return null;
                const mid = Math.floor(vals.length / 2);
                return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
            })()
            : null;
    const maeZeroHeavy = maeMedian === 0 && (holdMedian ?? 0) > 0;
    const performanceTitle =
        pnlUsd != null
            ? pnlUsd >= 0
                ? "Net positive"
                : "Drawdown control"
            : "Awaiting trades";

    // Show message only if RUN scope selected without a run_id
    if (missingRunId) {
        return (
            <div className="p-6">
                <EmptyState
                    title="No Run Selected"
                    description="Select a run from the sidebar to view trade performance for 'Run actuel' scope, or switch to 'Portfolio 5K' for cross-run view."
                    icon={<BarChart3 className="w-8 h-8 text-slate-500" />}
                />
            </div>
        );
    }

    return (
        <div className="p-6">
            <div className="mb-4 rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_10%_10%,rgba(34,197,94,0.16),transparent_32%),radial-gradient(circle_at_85%_10%,rgba(236,72,153,0.16),transparent_32%),linear-gradient(135deg,rgba(7,11,18,0.96),rgba(8,14,24,0.9))] p-4 sm:p-5 shadow-[0_24px_120px_rgba(0,0,0,0.55)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="text-[11px] uppercase tracking-[0.24em] text-neutral-400">
                            Trade desk · {scopeLabel}
                        </div>
                        <div className="text-2xl font-semibold text-white mt-1">
                            {performanceTitle}
                        </div>
                        <div className="text-sm text-neutral-400">
                            {tradesCount} trades · win rate {winRate != null ? `${(winRate * 100).toFixed(0)}%` : "n/a"}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge className={scope === "RUN" ? "bg-indigo-600/30" : "bg-emerald-600/30"}>
                            {scopeLabel}
                        </Badge>
                        {data?.meta?.data_source && (
                            <Badge className={data.meta.data_source === "LEGACY" ? "bg-amber-600/40" : "bg-emerald-700/50"}>
                                {data.meta.data_source}
                            </Badge>
                        )}
                        {data?.meta?.fallback_used && (
                            <Badge className="bg-amber-600/40">fallback</Badge>
                        )}
                        {runId && <Badge>Run {runId.slice(0, 8)}</Badge>}
                        {data?.trades && <Badge>{data.trades.length} trades</Badge>}
                        {maeMissingBadge && (
                            <Badge className="bg-amber-500/20 text-amber-200">
                                {maeMissingBadge}
                            </Badge>
                        )}
                        <button
                            onClick={loadData}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-white transition-colors"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Refresh
                        </button>
                    </div>
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <BentoCard padding="sm" className="h-full">
                        <KpiStat
                            label="Net PnL"
                            value={pnlUsd != null ? pnlUsd.toFixed(2) : "-"}
                            hint="USD"
                            tone={
                                (pnlUsd ?? 0) > 0
                                    ? "success"
                                    : (pnlUsd ?? 0) > -50
                                        ? "warn"
                                        : "danger"
                            }
                        />
                    </BentoCard>
                    <BentoCard padding="sm" className="h-full">
                        <KpiStat
                            label="PnL (pips)"
                            value={pnlPips != null ? pnlPips.toFixed(1) : "-"}
                            hint="pips"
                            tone={
                                (pnlPips ?? 0) > 0
                                    ? "success"
                                    : (pnlPips ?? 0) > -10
                                        ? "warn"
                                        : "danger"
                            }
                        />
                    </BentoCard>
                    <BentoCard padding="sm" className="h-full">
                        <KpiStat
                            label="Win Rate"
                            value={winRate != null ? `${(winRate * 100).toFixed(0)}%` : "-"}
                            hint={`${tradesCount} trades`}
                            tone={
                                (winRate ?? 0) > 0.55
                                    ? "success"
                                    : (winRate ?? 0) > 0.45
                                        ? "warn"
                                        : "danger"
                            }
                        />
                    </BentoCard>
                    <BentoCard padding="sm" className="h-full">
                        <KpiStat
                            label="Profit Factor"
                            value={profitFactor != null ? profitFactor.toFixed(2) : "-"}
                            tone={
                                (profitFactor ?? 0) > 1.5
                                    ? "success"
                                    : (profitFactor ?? 0) > 1
                                        ? "warn"
                                        : "danger"
                            }
                        />
                    </BentoCard>
                </div>

                <div className="mt-4 flex flex-wrap gap-3 items-center">
                    {scope !== "RUN" && scope !== "BACKTEST" && <Badge className="opacity-80">Cross-run view</Badge>}
                    {scope === "RUN" && runId && <Badge className="opacity-80">Run scope</Badge>}
                </div>
            </div>

            {/* Charts */}
            <BentoGrid cols={2}>
                <ChartCard
                    title="Equity Curve"
                    subtitle="Cumulative PnL with drawdown"
                    span="full"
                    loading={loading}
                    error={error}
                    empty={!equityChartData}
                    height={300}
                >
                    {equityChartData && (
                        <React.Suspense fallback={<div className="h-[280px]" />}>
                            <Plot
                                data={equityChartData.data}
                                layout={equityChartData.layout}
                                config={plotConfig}
                                style={{ width: "100%", height: 280 }}
                            />
                        </React.Suspense>
                    )}
                </ChartCard>

                <ChartCard
                    title="PnL Distribution"
                    subtitle="Histogram of trade outcomes"
                    loading={loading}
                    error={error}
                    empty={!distributionData}
                    height={260}
                >
                    {distributionData && (
                        <React.Suspense fallback={<div className="h-[240px]" />}>
                            <Plot
                                data={distributionData.data}
                                layout={distributionData.layout}
                                config={plotConfig}
                                style={{ width: "100%", height: 240 }}
                            />
                        </React.Suspense>
                    )}
                </ChartCard>

                <ChartCard
                    title="MAE/MFE Scatter"
                    subtitle="Risk profile by trade"
                    loading={loading}
                    error={error}
                    empty={!maeMfeData}
                    emptyMessage="MAE/MFE data not available"
                    height={260}
                >
                    {maeMfeData && (
                        <React.Suspense fallback={<div className="h-[240px]" />}>
                            <Plot
                                data={maeMfeData.data}
                                layout={maeMfeData.layout}
                                config={plotConfig}
                                style={{ width: "100%", height: 240 }}
                            />
                        </React.Suspense>
                    )}
                    {maeZeroHeavy && (
                        <div className="mt-2 text-[11px] text-amber-200">
                            Attention: median MAE = 0 with non-zero hold times (MAE possibly missing/underreported).
                        </div>
                    )}
                </ChartCard>
            </BentoGrid>

            {/* Robust Edge Analysis (Sprint 2) */}
            {scope !== "RUN" && scope !== "BACKTEST" && (
                <RobustEdgeSection
                    edge={robustEdge}
                    loading={robustLoading}
                    onRefresh={loadRobust}
                />
            )}
        </div>
    );
}

// =============================================================================
// ROBUST EDGE SECTION (Sprint 2 - P2 Robust Metrics)
// =============================================================================

function RobustEdgeSection({
    edge,
    loading,
    onRefresh,
}: {
    edge: RobustEdge | null;
    loading: boolean;
    onRefresh: () => void;
}) {
    if (loading) {
        return (
            <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.02] p-5">
                <div className="text-sm text-neutral-400 animate-pulse">
                    Computing robust metrics (bootstrap CI)...
                </div>
            </div>
        );
    }
    if (!edge || edge.n_obs === 0) return null;

    const fmtPips = (v: number) => v.toFixed(2);
    const fmtPct = (v: number) => `${(v * 100).toFixed(0)}%`;
    const ciLabel = (ci: [number, number]) =>
        `[${fmtPips(ci[0])}, ${fmtPips(ci[1])}]`;

    const meanPositive = edge.mean > 0;
    const ciExcludesZero = edge.mean_ci_95[0] > 0 || edge.mean_ci_95[1] < 0;

    // Session bars data
    const sessionEntries = Object.entries(edge.by_session).filter(
        ([, v]) => v !== 0
    );
    const sessionMax = sessionEntries.length
        ? Math.max(...sessionEntries.map(([, v]) => Math.abs(v)))
        : 1;

    // Vol regime bars
    const regimeEntries = Object.entries(edge.by_vol_regime).filter(
        ([, v]) => v !== 0
    );
    const regimeMax = regimeEntries.length
        ? Math.max(...regimeEntries.map(([, v]) => Math.abs(v)))
        : 1;

    return (
        <div className="mt-6 rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(7,11,18,0.96),rgba(8,14,24,0.9))] p-4 sm:p-5 shadow-[0_24px_120px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-indigo-400" />
                    <span className="text-sm font-medium text-white">
                        Robust Edge Analysis
                    </span>
                    <span className="text-[11px] text-neutral-500">
                        {edge.n_obs} trades · block bootstrap 5k
                    </span>
                </div>
                <button
                    onClick={onRefresh}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-neutral-400 transition-colors"
                >
                    <RefreshCw className="w-3 h-3" />
                    Refresh
                </button>
            </div>

            {/* Row 1: Central tendency + Tail risk KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                <BentoCard padding="sm">
                    <KpiStat
                        label="Mean"
                        value={fmtPips(edge.mean)}
                        hint={`CI ${ciLabel(edge.mean_ci_95)}`}
                        tone={meanPositive ? "success" : "danger"}
                    />
                </BentoCard>
                <BentoCard padding="sm">
                    <KpiStat
                        label="Median"
                        value={fmtPips(edge.median)}
                        hint={`CI ${ciLabel(edge.median_ci_95)}`}
                        tone={edge.median > 0 ? "success" : "danger"}
                    />
                </BentoCard>
                <BentoCard padding="sm">
                    <KpiStat
                        label="Trimmed Mean"
                        value={fmtPips(edge.trimmed_mean)}
                        hint="5% trim"
                        tone={edge.trimmed_mean > 0 ? "success" : "danger"}
                    />
                </BentoCard>
                <BentoCard padding="sm">
                    <KpiStat
                        label="VaR 95"
                        value={fmtPips(edge.var_95)}
                        hint="pips (5th pctl)"
                        tone="danger"
                    />
                </BentoCard>
                <BentoCard padding="sm">
                    <KpiStat
                        label="CVaR 95"
                        value={fmtPips(edge.cvar_95)}
                        hint="expected shortfall"
                        tone="danger"
                    />
                </BentoCard>
                <BentoCard padding="sm">
                    <KpiStat
                        label="Payoff Ratio"
                        value={edge.payoff_ratio.toFixed(2)}
                        hint={`W ${fmtPips(edge.avg_win)} / L ${fmtPips(edge.avg_loss)}`}
                        tone={edge.payoff_ratio > 1 ? "success" : "warn"}
                    />
                </BentoCard>
            </div>

            {/* Row 2: CI significance + Stability */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* CI significance card */}
                <BentoCard padding="sm">
                    <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-2">
                        Statistical significance
                    </div>
                    <div className={`text-lg font-semibold ${ciExcludesZero ? "text-emerald-400" : "text-amber-400"}`}>
                        {ciExcludesZero ? "CI excludes zero" : "CI includes zero"}
                    </div>
                    <div className="text-xs text-neutral-400 mt-1">
                        Mean {fmtPips(edge.mean)}p, 95% CI {ciLabel(edge.mean_ci_95)}
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                        <div className="h-2 flex-1 rounded-full bg-white/5 overflow-hidden relative">
                            {/* CI bar visualization */}
                            <div
                                className={`absolute h-full rounded-full ${ciExcludesZero ? "bg-emerald-500/60" : "bg-amber-500/60"}`}
                                style={{
                                    left: `${Math.max(0, 50 + edge.mean_ci_95[0] * 5)}%`,
                                    right: `${Math.max(0, 50 - edge.mean_ci_95[1] * 5)}%`,
                                }}
                            />
                            {/* Zero line */}
                            <div className="absolute left-1/2 top-0 w-px h-full bg-white/30" />
                        </div>
                    </div>
                </BentoCard>

                {/* Stability by session */}
                <BentoCard padding="sm">
                    <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-2">
                        <Activity className="w-3 h-3 inline mr-1" />
                        Edge by session
                    </div>
                    {sessionEntries.length === 0 ? (
                        <div className="text-xs text-neutral-500">No session data</div>
                    ) : (
                        <div className="space-y-1.5">
                            {sessionEntries.map(([sess, val]) => (
                                <div key={sess} className="flex items-center gap-2">
                                    <span className="text-[11px] text-neutral-400 w-14 shrink-0">
                                        {sess}
                                    </span>
                                    <div className="flex-1 h-4 rounded bg-white/5 relative overflow-hidden">
                                        <div
                                            className={`absolute top-0 h-full rounded ${val > 0 ? "bg-emerald-500/50" : "bg-red-500/50"}`}
                                            style={{
                                                left: val > 0 ? "50%" : undefined,
                                                right: val <= 0 ? "50%" : undefined,
                                                width: `${(Math.abs(val) / sessionMax) * 50}%`,
                                            }}
                                        />
                                        <div className="absolute left-1/2 top-0 w-px h-full bg-white/20" />
                                    </div>
                                    <span className={`text-[11px] w-12 text-right ${val > 0 ? "text-emerald-400" : "text-red-400"}`}>
                                        {fmtPips(val)}p
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </BentoCard>

                {/* Max DD distribution + vol regime */}
                <BentoCard padding="sm">
                    <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-2">
                        Max Drawdown distribution (bootstrap)
                    </div>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                        <div>
                            <div className="text-[10px] text-neutral-500">p50</div>
                            <div className="text-sm font-medium text-red-400">
                                {fmtPips(edge.max_dd_distribution.p50)}p
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] text-neutral-500">p95</div>
                            <div className="text-sm font-medium text-red-400">
                                {fmtPips(edge.max_dd_distribution.p95)}p
                            </div>
                        </div>
                        <div>
                            <div className="text-[10px] text-neutral-500">p99</div>
                            <div className="text-sm font-medium text-red-400">
                                {fmtPips(edge.max_dd_distribution.p99)}p
                            </div>
                        </div>
                    </div>
                    {regimeEntries.length > 0 && (
                        <>
                            <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-1.5 mt-2 border-t border-white/5 pt-2">
                                Edge by vol regime
                            </div>
                            <div className="space-y-1">
                                {regimeEntries.map(([regime, val]) => (
                                    <div key={regime} className="flex items-center gap-2">
                                        <span className="text-[11px] text-neutral-400 w-14 shrink-0">
                                            {regime}
                                        </span>
                                        <div className="flex-1 h-3 rounded bg-white/5 relative overflow-hidden">
                                            <div
                                                className={`absolute top-0 h-full rounded ${val > 0 ? "bg-emerald-500/50" : "bg-red-500/50"}`}
                                                style={{
                                                    left: val > 0 ? "50%" : undefined,
                                                    right: val <= 0 ? "50%" : undefined,
                                                    width: `${(Math.abs(val) / regimeMax) * 50}%`,
                                                }}
                                            />
                                            <div className="absolute left-1/2 top-0 w-px h-full bg-white/20" />
                                        </div>
                                        <span className={`text-[11px] w-12 text-right ${val > 0 ? "text-emerald-400" : "text-red-400"}`}>
                                            {fmtPips(val)}p
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </BentoCard>
            </div>
        </div>
    );
}
