/**
 * Parameter Tuning Page - Quant Lab V2
 * 
 * Question: "Quels params dois-je ajuster ?"
 * 
 * Charts:
 * 1. Sensitivity Bars (impact of each param on PnL)
 * 2. 3D Surface (optional, param1 x param2 -> metric)
 * 
 * NOTE: Sweeps run on the compute host, not x86. This page displays results only.
 */

import React, { useEffect, useMemo, useState } from "react";
import { formatDateTimeUTC } from "../../../lib/dateUtils";
import { RefreshCw, FlaskRound, AlertCircle, Filter, Terminal } from "lucide-react";
import { useQuantLabScope } from "../../../lib/SelectionContext";
import {
    getParameterTuning,
    ParameterTuningResponse,
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

const SCOPE_TYPE_OPTIONS = [
    { value: "ROLLING", label: "Rolling" },
    { value: "DAY", label: "By Day" },
];

const SCOPE_KEY_OPTIONS = [
    { value: "LAST_30_RUNS", label: "Last 30 runs" },
    { value: "LAST_100_RUNS", label: "Last 100 runs" },
];

export function ParameterTuning() {
    const { scope, scopeLabel } = useQuantLabScope();
    const [scopeType, setScopeType] = useState<"ROLLING" | "DAY">("ROLLING");
    const [scopeKey, setScopeKey] = useState("LAST_30_RUNS");
    const [data, setData] = useState<ParameterTuningResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await getParameterTuning({
                scope_type: scopeType,
                scope_key: scopeKey,
                limit: 100,
            });
            setData(result);
        } catch (e: any) {
            setError(e.message || "Failed to load sweep data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [scopeType, scopeKey]);

    // Sensitivity bar chart
    const sensitivityData = useMemo(() => {
        if (!data?.sensitivity.length) return null;

        const sorted = [...data.sensitivity].sort((a, b) => Math.abs(b.delta_pnl) - Math.abs(a.delta_pnl));
        const params = sorted.map((s) => s.param);
        const values = sorted.map((s) => s.delta_pnl);
        const colors = sorted.map((s) => (s.delta_pnl > 0 ? "#22c55e" : "#ef4444"));

        return {
            data: [
                {
                    type: "bar" as const,
                    x: values,
                    y: params,
                    orientation: "h" as const,
                    marker: {
                        color: colors,
                        line: { width: 0 },
                    },
                    text: values.map((v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}p`),
                    textposition: "outside" as const,
                    textfont: { size: 11, color: "#8b95a9" },
                    hovertemplate: "%{y}: %{x:.2f}p delta<extra></extra>",
                },
            ],
            layout: {
                height: 280,
                margin: { l: 120, r: 60, t: 10, b: 30 },
                paper_bgcolor: "transparent",
                plot_bgcolor: "transparent",
                xaxis: {
                    title: { text: "Delta PnL (pips)", font: { size: 11, color: "#8b95a9" } },
                    showgrid: true,
                    gridcolor: "rgba(255,255,255,0.05)",
                    tickfont: { size: 10, color: "#8b95a9" },
                    zeroline: true,
                    zerolinecolor: "rgba(255,255,255,0.3)",
                },
                yaxis: {
                    tickfont: { size: 10, color: "#8b95a9" },
                    automargin: true,
                },
                bargap: 0.2,
            },
        };
    }, [data]);

    // 3D Surface chart
    const surfaceData = useMemo(() => {
        if (!data?.surface) return null;

        const { x, y, z, x_label, y_label, z_label } = data.surface;
        if (!x.length || !y.length || !z.length) return null;

        return {
            data: [
                {
                    type: "surface" as const,
                    x,
                    y,
                    z,
                    colorscale: [
                        [0, "#ef4444"],
                        [0.5, "#6366f1"],
                        [1, "#22c55e"],
                    ],
                    showscale: true,
                    colorbar: {
                        title: { text: z_label, font: { size: 10, color: "#8b95a9" } },
                        tickfont: { size: 9, color: "#8b95a9" },
                        thickness: 15,
                        len: 0.6,
                    },
                    contours: {
                        z: {
                            show: true,
                            usecolormap: true,
                            highlightcolor: "#ffffff",
                            project: { z: true },
                        },
                    },
                    hovertemplate: `${x_label}: %{x:.2f}<br>${y_label}: %{y:.2f}<br>${z_label}: %{z:.2f}<extra></extra>`,
                },
            ],
            layout: {
                height: 400,
                margin: { l: 0, r: 0, t: 30, b: 0 },
                paper_bgcolor: "transparent",
                scene: {
                    xaxis: {
                        title: { text: x_label, font: { size: 10, color: "#8b95a9" } },
                        tickfont: { size: 9, color: "#8b95a9" },
                        gridcolor: "rgba(255,255,255,0.1)",
                        backgroundcolor: "rgba(4, 8, 16, 0.9)",
                    },
                    yaxis: {
                        title: { text: y_label, font: { size: 10, color: "#8b95a9" } },
                        tickfont: { size: 9, color: "#8b95a9" },
                        gridcolor: "rgba(255,255,255,0.1)",
                        backgroundcolor: "rgba(4, 8, 16, 0.9)",
                    },
                    zaxis: {
                        title: { text: z_label, font: { size: 10, color: "#8b95a9" } },
                        tickfont: { size: 9, color: "#8b95a9" },
                        gridcolor: "rgba(255,255,255,0.1)",
                        backgroundcolor: "rgba(4, 8, 16, 0.9)",
                    },
                    camera: {
                        eye: { x: 1.5, y: 1.5, z: 1 },
                    },
                    bgcolor: "transparent",
                },
            },
        };
    }, [data]);

    const plotConfig = {
        displayModeBar: false,
        responsive: true,
    };

    // No sweep data available
    if (!loading && data && !data.available) {
        return (
            <div className="p-6">
                <BentoCard className="mt-4">
                    <EmptyState
                        title="No Sweep Data Available"
                        description="Sweep results are computed on A1 (heavy computation server)."
                        icon={<FlaskRound className="w-12 h-12" />}
                        action={
                            <div className="flex flex-col gap-4 items-center">
                                {/* Instructions for running sweep on A1 */}
                                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-left max-w-md">
                                    <div className="flex items-center gap-2 text-amber-300 font-medium text-sm mb-2">
                                        <Terminal className="w-4 h-4" />
                                        Run sweep on A1
                                    </div>
                                    <code className="text-xs text-slate-300 block bg-black/30 rounded p-2 font-mono">
                                        ssh &lt;compute-host&gt;<br />
                                        cd ~/compute-workspace<br />
                                        ./run_sweep.sh
                                    </code>
                                    <p className="text-xs text-slate-400 mt-2">
                                        Sweeps require 24GB RAM and must run on A1, not x86.
                                    </p>
                                </div>

                                {/* Check again button */}
                                <button
                                    onClick={loadData}
                                    disabled={loading}
                                    className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
                                >
                                    <RefreshCw className="w-4 h-4 inline mr-2" />
                                    Check Again
                                </button>
                            </div>
                        }
                    />
                </BentoCard>
            </div>
        );
    }

    return (
        <div className="p-6">
            {/* Header with filters */}
            <div className="mb-4 rounded-xl border border-white/10 bg-[linear-gradient(135deg,rgba(7,10,20,0.95),rgba(8,13,24,0.9))] p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <div className="text-[11px] uppercase tracking-[0.24em] text-neutral-400">
                            Parameter Tuning · {scopeLabel}
                        </div>
                        <div className="text-lg font-semibold text-white mt-1">
                            Which parameters should I adjust?
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge className={scope === "RUN" ? "bg-indigo-600/30" : "bg-emerald-600/30"}>
                            {scopeLabel}
                        </Badge>

                        <button
                            onClick={loadData}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-white transition-colors"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Refresh
                        </button>
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-3 items-center">
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-slate-400" />
                        <select
                            value={scopeType}
                            onChange={(e) => setScopeType(e.target.value as "ROLLING" | "DAY")}
                            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        >
                            {SCOPE_TYPE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value} className="bg-slate-800">
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <select
                            value={scopeKey}
                            onChange={(e) => setScopeKey(e.target.value)}
                            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        >
                            {SCOPE_KEY_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value} className="bg-slate-800">
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    {data?.sweep_run && (
                        <Badge>Sweep: {data.sweep_run.sweep_run_id.slice(0, 8)}</Badge>
                    )}
                    {data?.sweep_run && (
                        <Badge>{data.sweep_run.signals_total} signals</Badge>
                    )}
                </div>
            </div>

            {/* KPIs Row */}
            <BentoCard className="mb-4">
                <KpiRow>
                    <KpiStat
                        label="Best Config"
                        value={data?.kpis.best_config_id?.slice(0, 12) ?? "-"}
                    />
                    <KpiStat
                        label="Best PnL"
                        value={data?.kpis.best_pnl?.toFixed(2) ?? "-"}
                        hint="pips"
                        tone="success"
                    />
                    <KpiStat
                        label="Baseline PnL"
                        value={data?.kpis.baseline_pnl?.toFixed(2) ?? "-"}
                        hint="pips"
                    />
                    <KpiStat
                        label="Delta vs Baseline"
                        value={data?.kpis.delta_vs_baseline ?? "-"}
                        tone={
                            data?.kpis.delta_vs_baseline?.startsWith("+")
                                ? "success"
                                : data?.kpis.delta_vs_baseline?.startsWith("-")
                                    ? "danger"
                                    : "default"
                        }
                    />
                </KpiRow>
            </BentoCard>

            {/* Charts */}
            <BentoGrid cols={2}>
                <ChartCard
                    title="Parameter Sensitivity"
                    subtitle="Impact on PnL vs baseline"
                    loading={loading}
                    error={error}
                    empty={!sensitivityData}
                    emptyMessage="No sensitivity data available"
                    height={300}
                >
                    {sensitivityData && (
                        <React.Suspense fallback={<div className="h-[280px]" />}>
                            <Plot
                                data={sensitivityData.data}
                                layout={sensitivityData.layout}
                                config={plotConfig}
                                style={{ width: "100%", height: 280 }}
                            />
                        </React.Suspense>
                    )}
                </ChartCard>

                <ChartCard
                    title="3D Parameter Surface"
                    subtitle="PnL landscape (drag to rotate)"
                    loading={loading}
                    error={error}
                    empty={!surfaceData}
                    emptyMessage="Surface requires 2+ varying params"
                    height={420}
                >
                    {surfaceData && (
                        <React.Suspense fallback={<div className="h-[400px]" />}>
                            <Plot
                                data={surfaceData.data}
                                layout={surfaceData.layout}
                                config={{ ...plotConfig, scrollZoom: true }}
                                style={{ width: "100%", height: 400 }}
                            />
                        </React.Suspense>
                    )}
                </ChartCard>
            </BentoGrid>

            {/* Warning about heavy computation */}
            {data?.sweep_run && (
                <BentoCard className="mt-4">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-[var(--ql2-warn)] flex-shrink-0 mt-0.5" />
                        <div>
                            <div className="text-sm font-medium text-[var(--ql2-text)]">
                                Sweep Info
                            </div>
                            <div className="text-xs text-[var(--ql2-text-muted)] mt-1">
                                Last sweep: {formatDateTimeUTC(data.sweep_run.created_at)} UTC
                                {" | "}
                                {data.sweep_run.signals_total} signals analyzed.
                                Run daily_sweep.sh for updated results.
                            </div>
                        </div>
                    </div>
                </BentoCard>
            )}
        </div>
    );
}
