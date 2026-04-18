/**
 * Signal Quality Page - Quant Lab V2
 *
 * Question: "Mes signaux capturent-ils un edge ?"
 *
 * Charts:
 * 1. Edge Scatter (amplitude vs net outcome)
 * 2. Rejection Funnel (total -> accepted -> traded -> profitable)
 * 3. Session x Regime Heatmap
 *
 * V3 Integration: Uses global SelectionContext for data scope
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Filter, TrendingUp } from "lucide-react";
import { useQuantLabScope } from "../../../lib/SelectionContext";
import {
    getSignalQualityV3First,
    SignalQualityResponse,
    Side,
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

const SIDE_OPTIONS = [
    { value: "ALL", label: "All sides" },
    { value: "BUY", label: "Buy only" },
    { value: "SELL", label: "Sell only" },
];

export function SignalQuality() {
    const quantScope = useQuantLabScope();
    const { scope, runId, strategyId, scopeLabel, missingRunId } = quantScope;
    const [side, setSide] = useState<Side>("ALL");
    const [data, setData] = useState<SignalQualityResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showOutliers, setShowOutliers] = useState(false);
    const requestSeq = useRef(0);

    const MIN_SAMPLE = 10;
    const MAX_VIEW_PIPS = 10;
    const formatPct = (value: number) => `${(value * 100).toFixed(1)}%`;

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
            const result = await getSignalQualityV3First(
                runId ?? undefined,
                strategyId ?? undefined,
                scope,
                side
            );
            if (requestId !== requestSeq.current) return;
            setData(result);
        } catch (e: unknown) {
            if (requestId !== requestSeq.current) return;
            setError(e instanceof Error ? e.message : "Failed to load signal data");
        } finally {
            if (requestId !== requestSeq.current) return;
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [runId, scope, side, strategyId, missingRunId]);

    // Edge scatter chart
    const edgeScatterData = useMemo(() => {
        if (!data?.signals.length) return null;

        const withOutcome = data.signals.filter(
            (s) =>
                s.amplitude_pips != null &&
                s.net_outcome_pips != null &&
                Math.abs(s.net_outcome_pips) <= 50
        );
        if (!withOutcome.length) return null;

        const viewThreshold = showOutliers ? 50 : MAX_VIEW_PIPS;
        const visiblePoints = withOutcome.filter((s) => Math.abs(s.net_outcome_pips!) <= viewThreshold);
        if (!visiblePoints.length) return null;

        const x = visiblePoints.map((s) => s.amplitude_pips!);
        const y = visiblePoints.map((s) => s.net_outcome_pips!);
        const colors = visiblePoints.map((s) =>
            s.net_outcome_pips! > 0 ? "#22c55e" : "#ef4444"
        );
        const text = visiblePoints.map(
            (s) => `${s.session} | ${s.regime}<br>Net: ${s.net_outcome_pips?.toFixed(2)}p`
        );

        return {
            meta: {
                n: visiblePoints.length,
                viewThreshold,
                outliersHidden: !showOutliers,
                hiddenCount: withOutcome.length - visiblePoints.length,
                simWin: data.signals.filter((s) => s.sim_verdict === "WOULD_WIN").length,
                simLose: data.signals.filter((s) => s.sim_verdict === "WOULD_LOSE").length,
                simUnreliable: data.signals.filter((s) => s.sim_verdict === "UNRELIABLE").length,
            },
            data: [
                // Density heatmap
                {
                    type: "histogram2d" as const,
                    x,
                    y,
                    colorscale: [
                        [0, "rgba(99,102,241,0)"],
                        [0.5, "rgba(99,102,241,0.3)"],
                        [1, "rgba(99,102,241,0.6)"],
                    ],
                    showscale: false,
                    nbinsx: 25,
                    nbinsy: 25,
                    hoverinfo: "skip" as const,
                },
                // Scatter points
                {
                    type: "scattergl" as const,
                    mode: "markers" as const,
                    x,
                    y,
                    marker: {
                        color: colors,
                        size: 6,
                        opacity: 0.7,
                        line: { width: 0 },
                    },
                    text,
                    hovertemplate: "%{text}<extra></extra>",
                },
                // Zero line
                {
                    type: "scatter" as const,
                    mode: "lines" as const,
                    x: [Math.min(...x), Math.max(...x)],
                    y: [0, 0],
                    line: { color: "rgba(255,255,255,0.2)", width: 1, dash: "dash" as const },
                    hoverinfo: "skip" as const,
                },
            ],
            layout: {
                height: 320,
                margin: { l: 50, r: 20, t: 10, b: 40 },
                paper_bgcolor: "transparent",
                plot_bgcolor: "transparent",
                xaxis: {
                    title: { text: "Amplitude (pips)", font: { size: 11, color: "#8b95a9" } },
                    showgrid: true,
                    gridcolor: "rgba(255,255,255,0.05)",
                    tickfont: { size: 10, color: "#8b95a9" },
                    zeroline: false,
                },
                yaxis: {
                    title: { text: "Net Outcome (pips)", font: { size: 11, color: "#8b95a9" } },
                    showgrid: true,
                    gridcolor: "rgba(255,255,255,0.05)",
                    tickfont: { size: 10, color: "#8b95a9" },
                    zeroline: false,
                    range: [-viewThreshold, viewThreshold],
                },
                showlegend: false,
                hovermode: "closest" as const,
                uirevision: "edge-scatter",
            },
        };
    }, [data, showOutliers]);

    const simMeta = (edgeScatterData as any)?.meta;
    const auditStats = useMemo(() => {
        const signals = data?.signals ?? [];
        return {
            wouldWin: signals.filter((s) => s.sim_verdict === "WOULD_WIN").length,
            wouldLose: signals.filter((s) => s.sim_verdict === "WOULD_LOSE").length,
            unreliable: signals.filter((s) => s.sim_verdict === "UNRELIABLE").length,
        };
    }, [data]);

    // Funnel chart
    const funnelData = useMemo(() => {
        if (!data?.funnel) return null;

        const { total, accepted, traded, profitable } = data.funnel;
        if (total === 0) return null;

        const stages = ["Total Signals", "Accepted", "Traded", "Profitable"];
        const values = [total, accepted, traded, profitable];
        const colors = ["#6366f1", "#3b82f6", "#22c55e", "#10b981"];

        return {
            data: [
                {
                    type: "funnel" as const,
                    y: stages,
                    x: values,
                    textposition: "inside" as const,
                    textinfo: "value+percent initial+percent previous" as const,
                    textfont: { size: 12, color: "#ffffff" },
                    marker: {
                        color: colors,
                        line: { width: 0 },
                    },
                    connector: {
                        fillcolor: "rgba(255,255,255,0.05)",
                        line: { color: "rgba(255,255,255,0.1)", width: 1 },
                    },
                    hovertemplate: "%{y}: %{x}<extra></extra>",
                },
            ],
            layout: {
                height: 280,
                margin: { l: 100, r: 20, t: 10, b: 10 },
                paper_bgcolor: "transparent",
                plot_bgcolor: "transparent",
                font: { color: "#8b95a9" },
                funnelmode: "stack" as const,
            },
        };
    }, [data]);

    const funnelStats = useMemo(() => {
        if (!data?.funnel) return null;
        const { total, accepted, traded, profitable } = data.funnel;
        if (total === 0) return null;

        const acceptanceRate = accepted / total;
        const tradeRate = accepted > 0 ? traded / accepted : 0;
        const winRate = traded > 0 ? profitable / traded : 0;
        const overallWin = profitable / total;

        const rejected = Math.max(total - accepted, 0);
        const notTraded = Math.max(accepted - traded, 0);
        const losing = Math.max(traded - profitable, 0);

        const drops = [
            { label: "Rejetés", count: rejected },
            { label: "Non exécutés", count: notTraded },
            { label: "Perdants", count: losing },
        ];
        const mainLeak = drops.reduce(
            (best, current) => (current.count > best.count ? current : best),
            drops[0]
        );

        return {
            acceptanceRate,
            tradeRate,
            winRate,
            overallWin,
            rejected,
            notTraded,
            losing,
            mainLeak,
        };
    }, [data]);

    // Heatmap chart
    const heatmapData = useMemo(() => {
        if (!data?.heatmap.length) return null;

        const sessions = ["ASIA", "LONDON", "OVERLAP", "NY"];
        const regimes = ["LOW", "NORMAL", "HIGH"];

        // Build matrix
        const z: (number | null)[][] = regimes.map((regime) =>
            sessions.map((session) => {
                const cell = data.heatmap.find(
                    (h) => h.session === session && h.regime === regime
                );
                return cell ? cell.avg_net : null;
            })
        );

        const text: string[][] = regimes.map((regime) =>
            sessions.map((session) => {
                const cell = data.heatmap.find(
                    (h) => h.session === session && h.regime === regime
                );
                return cell ? `${cell.avg_net.toFixed(2)}p (n=${cell.count})` : "-";
            })
        );

        return {
            data: [
                {
                    type: "heatmap" as const,
                    x: sessions,
                    y: regimes,
                    z,
                    text,
                    texttemplate: "%{text}",
                    textfont: { size: 11 },
                    colorscale: [
                        [0, "#ef4444"],
                        [0.5, "#1e1e2e"],
                        [1, "#22c55e"],
                    ],
                    zmid: 0,
                    showscale: true,
                    colorbar: {
                        title: { text: "Avg Net", font: { size: 10, color: "#8b95a9" } },
                        tickfont: { size: 9, color: "#8b95a9" },
                        thickness: 15,
                        len: 0.8,
                    },
                    hovertemplate: "%{y} x %{x}<br>Avg: %{z:.2f}p<extra></extra>",
                },
            ],
            layout: {
                height: 220,
                margin: { l: 70, r: 80, t: 10, b: 40 },
                paper_bgcolor: "transparent",
                plot_bgcolor: "transparent",
                xaxis: {
                    title: { text: "Session", font: { size: 11, color: "#8b95a9" } },
                    tickfont: { size: 10, color: "#8b95a9" },
                },
                yaxis: {
                    title: { text: "Regime", font: { size: 11, color: "#8b95a9" } },
                    tickfont: { size: 10, color: "#8b95a9" },
                },
            },
        };
    }, [data]);

    const plotConfig = {
        displayModeBar: false,
        responsive: true,
    };

    const sampleCount = data?.signals.length ?? 0;
    const acceptRate = data?.kpis.accept_rate ?? null;
    const avgNet = data?.kpis.avg_net ?? null;
    const tradedCount = data?.kpis.traded_count ?? 0;
    const bestCombo = data?.kpis.best_combo;
    const profitabilityLabel =
        avgNet != null
            ? `${avgNet >= 0 ? "Positive" : "Negative"} drift`
            : "Awaiting data";
    // Show message if no run is selected (only in RUN mode)
    if (missingRunId) {
        return (
            <div className="p-6">
                <EmptyState
                    title="No Run Selected"
                    description="Select a run from the sidebar to view signal quality metrics."
                    icon={<TrendingUp className="w-8 h-8 text-slate-500" />}
                />
            </div>
        );
    }

    return (
        <div className="p-6">
            <div className="mb-4 rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_15%_10%,rgba(99,102,241,0.2),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.18),transparent_32%),linear-gradient(135deg,rgba(7,10,20,0.95),rgba(8,13,24,0.9))] p-4 sm:p-5 shadow-[0_24px_120px_rgba(0,0,0,0.55)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="text-[11px] uppercase tracking-[0.24em] text-neutral-400">
                            Signal lab · {scopeLabel}
                        </div>
                        <div className="text-2xl font-semibold text-white mt-1">
                            {profitabilityLabel}
                        </div>
                        <div className="text-sm text-neutral-400">
                            {sampleCount} signals · {tradedCount} traded · {side.toLowerCase()}
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
                        <KpiStat label="Accept Rate" value={
                            acceptRate != null ? `${(acceptRate * 100).toFixed(0)}%` : "-"
                        } tone={
                            (acceptRate ?? 0) > 0.7 ? "success" : (acceptRate ?? 0) > 0.5 ? "warn" : "danger"
                        } hint="across scope" />
                    </BentoCard>
                    <BentoCard padding="sm" className="h-full">
                        <KpiStat
                            label="Avg Net Outcome"
                            value={avgNet != null ? avgNet.toFixed(2) : "-"}
                            hint="pips"
                            tone={
                                (avgNet ?? 0) > 0
                                    ? "success"
                                    : (avgNet ?? 0) > -0.5
                                        ? "warn"
                                        : "danger"
                            }
                        />
                    </BentoCard>
                    <BentoCard padding="sm" className="h-full">
                        <KpiStat
                            label="Distribution"
                            value={
                                data
                                    ? `${data.kpis.p25_net.toFixed(2)} / ${data.kpis.median_net.toFixed(2)} / ${data.kpis.p75_net.toFixed(2)}`
                                    : "-"
                            }
                            hint="p25 / median / p75 (pips)"
                        />
                    </BentoCard>
                    <BentoCard padding="sm" className="h-full">
                        <KpiStat
                            label="Best Combo"
                            value={
                                bestCombo
                                    ? `${bestCombo.session} · ${bestCombo.regime}`
                                    : "-"
                            }
                            hint={data?.kpis.outlier_count ? `${data.kpis.outlier_count} outliers hidden` : undefined}
                        />
                    </BentoCard>
                </div>

                <div className="mt-4 flex flex-wrap gap-3 items-center">
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-slate-400" />
                        <select
                            value={side}
                            onChange={(e) => setSide(e.target.value as Side)}
                            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        >
                            {SIDE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value} className="bg-slate-800">
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    {scope !== "RUN" && scope !== "BACKTEST" && <Badge className="opacity-80">Cross-run view</Badge>}
                    {scope === "RUN" && runId && <Badge className="opacity-80">Run scope</Badge>}
                    {auditStats.wouldWin > 0 && (
                        <Badge className="bg-emerald-700/40">Would have won {auditStats.wouldWin}</Badge>
                    )}
                    {auditStats.wouldLose > 0 && (
                        <Badge className="bg-rose-700/35">Would not have won {auditStats.wouldLose}</Badge>
                    )}
                    {auditStats.unreliable > 0 && (
                        <Badge className="bg-amber-600/35">Audit unreliable {auditStats.unreliable}</Badge>
                    )}
                </div>
            </div>

            {/* Charts Grid */}
            <BentoGrid cols={2}>
                <ChartCard
                    title="Edge Scatter"
                    subtitle="Amplitude vs Net Outcome"
                    loading={loading}
                    error={error}
                    empty={
                        !edgeScatterData ||
                        (edgeScatterData as any).meta?.n < MIN_SAMPLE
                    }
                    height={340}
                >
                    {edgeScatterData && (
                        <React.Suspense fallback={<div className="h-[320px]" />}>
                            <Plot
                                data={edgeScatterData.data}
                                layout={edgeScatterData.layout}
                                config={plotConfig}
                                style={{ width: "100%", height: 320 }}
                            />
                        </React.Suspense>
                    )}
                    {edgeScatterData && (
                        <div className="mt-2 text-[11px] text-slate-400">
                            n={(edgeScatterData as any).meta?.n ?? 0} | fenêtre ±
                            {(edgeScatterData as any).meta?.viewThreshold} pips | outliers masqués:
                            {(edgeScatterData as any).meta?.hiddenCount ?? 0} | anomalies exclues (&gt;50 pips)
                            {simMeta && (
                                <span className="ml-2">
                                    Audit: win {simMeta.simWin ?? 0} · lose {simMeta.simLose ?? 0} · unreliable {simMeta.simUnreliable ?? 0}
                                </span>
                            )}
                            <button
                                className="ml-2 underline text-slate-300"
                                onClick={() => setShowOutliers((v) => !v)}
                            >
                                {showOutliers ? "Masquer outliers" : "Afficher outliers"}
                            </button>
                        </div>
                    )}
                </ChartCard>

                <ChartCard
                    title="Signal Funnel"
                    subtitle="Conversion through stages"
                    loading={loading}
                    error={error}
                    empty={!funnelData}
                    height={300}
                >
                    {funnelData && (
                        <React.Suspense fallback={<div className="h-[280px]" />}>
                            <Plot
                                data={funnelData.data}
                                layout={funnelData.layout}
                                config={plotConfig}
                                style={{ width: "100%", height: 280 }}
                            />
                        </React.Suspense>
                    )}
                    {funnelStats && (
                        <div className="mt-4 space-y-3">
                            <KpiRow className="gap-4">
                                <KpiStat
                                    label="Accept rate"
                                    value={formatPct(funnelStats.acceptanceRate)}
                                    hint="accepted / total"
                                />
                                <KpiStat
                                    label="Trade-through"
                                    value={formatPct(funnelStats.tradeRate)}
                                    hint="traded / accepted"
                                />
                                <KpiStat
                                    label="Win rate"
                                    value={formatPct(funnelStats.winRate)}
                                    hint="profitable / traded"
                                />
                                <KpiStat
                                    label="Overall hit"
                                    value={formatPct(funnelStats.overallWin)}
                                    hint="profitable / total"
                                />
                            </KpiRow>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ql2-text-dim)]">
                                <Badge variant="warn">
                                    Leak principal: {funnelStats.mainLeak.label} ({funnelStats.mainLeak.count})
                                </Badge>
                                <span>
                                    Rejetés {funnelStats.rejected} · Non exécutés {funnelStats.notTraded} · Perdants {funnelStats.losing}
                                </span>
                            </div>
                        </div>
                    )}
                </ChartCard>

                <ChartCard
                    title="Session x Regime Heatmap"
                    subtitle="Average net outcome by combination"
                    span="full"
                    loading={loading}
                    error={error}
                    empty={!heatmapData}
                    height={240}
                >
                    {heatmapData && (
                        <React.Suspense fallback={<div className="h-[220px]" />}>
                            <Plot
                                data={heatmapData.data}
                                layout={heatmapData.layout}
                                config={plotConfig}
                                style={{ width: "100%", height: 220 }}
                            />
                        </React.Suspense>
                    )}
                </ChartCard>
            </BentoGrid>
        </div>
    );
}
