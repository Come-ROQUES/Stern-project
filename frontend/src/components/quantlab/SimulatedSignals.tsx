import React, { useEffect, useMemo, useState } from "react";
import {
    AlertTriangle,
    ArrowDownRight,
    ArrowUpRight,
    BarChart3,
    Ghost,
    Loader2,
    ScatterChart,
    ShieldCheck,
    Target,
    XCircle,
    Zap,
} from "lucide-react";
import { useQuantLabScope } from "../../lib/SelectionContext";
import {
    getDampingWaveMissedOpportunities,
    getSignalQualityFallback,
    type DampingWaveMissedOpportunitiesResponse,
    type SignalPoint,
} from "../../lib/quantApi";
import { cn } from "../../lib/utils";
import { BentoCard, KpiStat, QuantSkeleton } from "./ui";
import { quantLabCssVariables } from "./ui/theme";
const Plot = React.lazy(() => import("../../lib/PlotlyBasic"));

/* ---------- plotly dark theme constants ---------- */
const PL_BG = "transparent";
const PL_GRID = "rgba(255,255,255,0.04)";
const PL_TICK: Partial<{ color: string; size: number }> = { color: "#64748b", size: 11 };
const PL_MARGIN = { l: 44, r: 12, t: 8, b: 36 };
const PL_MARGIN_SCATTER = { l: 50, r: 12, t: 8, b: 44 };

/* ---------- helpers ---------- */
function fmtPips(v: number | null | undefined): string {
    return v != null ? v.toFixed(2) : "-";
}
function fmtUsd(v: number | null | undefined): string {
    return v != null ? `$${v.toFixed(2)}` : "-";
}
function fmtTs(iso: string): string {
    try {
        const d = new Date(iso);
        return d.toISOString().replace("T", " ").slice(5, 19);
    } catch {
        return iso.slice(0, 19);
    }
}
function shortRunId(id: string | null | undefined): string {
    if (!id) return "-";
    return id.slice(0, 8);
}

/* ---------- outcome badge ---------- */
function OutcomeBadge({ outcome }: { outcome: string | null | undefined }) {
    if (!outcome) return <span className="text-[var(--ql-muted)]">-</span>;
    const isTP = outcome.includes("TP");
    const isSL = outcome.includes("SL");
    const isTimeExit = outcome === "TIME_STOP" || outcome === "EARLY_KILL";
    const icon = isTP ? (
        <Target className="w-3 h-3" />
    ) : isSL ? (
        <XCircle className="w-3 h-3" />
    ) : isTimeExit ? (
        <AlertTriangle className="w-3 h-3" />
    ) : (
        <AlertTriangle className="w-3 h-3" />
    );
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium tracking-wide",
                isTP && "bg-emerald-500/12 text-[#2de3a0] border border-emerald-500/20",
                isSL && "bg-rose-500/12 text-[#f25f73] border border-rose-500/20",
                isTimeExit && "bg-amber-500/12 text-[#f0b429] border border-amber-500/20",
                !isTP && !isSL && !isTimeExit && "bg-white/5 text-[var(--ql-muted)] border border-white/8",
            )}
        >
            {icon}
            {outcome.replace("_HIT", "").replace("_FIRST", "")}
        </span>
    );
}

/* ---------- PnL cell ---------- */
function PnlCell({ value, suffix }: { value: number | null | undefined; suffix?: string }) {
    if (value == null) return <span className="text-[var(--ql-muted)]">-</span>;
    const positive = value >= 0;
    return (
        <span
            className={cn(
                "inline-flex items-center gap-0.5 font-mono text-xs tabular-nums",
                positive ? "text-[var(--ql-success)]" : "text-[var(--ql-danger)]",
            )}
        >
            {positive ? (
                <ArrowUpRight className="w-3 h-3 opacity-60" />
            ) : (
                <ArrowDownRight className="w-3 h-3 opacity-60" />
            )}
            {positive ? "+" : ""}
            {value.toFixed(2)}
            {suffix && <span className="text-[10px] opacity-50 ml-0.5">{suffix}</span>}
        </span>
    );
}

/* ---------- quality badge ---------- */
function QualityBadge({ q }: { q: string | null | undefined }) {
    if (!q) return <span className="text-[var(--ql-muted)]">-</span>;
    const tone =
        q === "HIGH"
            ? "text-[var(--ql-success)] bg-emerald-500/8 border-emerald-500/20"
            : q === "LOW"
                ? "text-[var(--ql-danger)] bg-rose-500/8 border-rose-500/20"
                : "text-[var(--ql-warn)] bg-amber-500/8 border-amber-500/20";
    return (
        <span
            className={cn(
                "px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border",
                tone,
            )}
        >
            {q}
        </span>
    );
}

function VerdictBadge({ verdict }: { verdict: SignalPoint["sim_verdict"] }) {
    if (!verdict) return <span className="text-[var(--ql-muted)]">-</span>;
    const tone =
        verdict === "WOULD_WIN"
            ? "text-[var(--ql-success)] bg-emerald-500/8 border-emerald-500/20"
            : verdict === "WOULD_LOSE"
                ? "text-[var(--ql-danger)] bg-rose-500/8 border-rose-500/20"
                : "text-[var(--ql-warn)] bg-amber-500/8 border-amber-500/20";
    return (
        <span
            className={cn(
                "px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border",
                tone,
            )}
        >
            {verdict.replace("WOULD_", "")}
        </span>
    );
}

/* ================================================================
   MAIN COMPONENT
   ================================================================ */
export function SimulatedSignals() {
    const { scope, effectiveRunId, effectiveStrategyId, scopeLabel: dataScope } = useQuantLabScope();

    const [signals, setSignals] = useState<SignalPoint[]>([]);
    const [dwReport, setDwReport] = useState<DampingWaveMissedOpportunitiesResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const useDwEndpoint =
                    effectiveStrategyId === "damping_wave" && Boolean(effectiveRunId);
                if (useDwEndpoint && effectiveRunId) {
                    const res = await getDampingWaveMissedOpportunities(effectiveRunId, 5);
                    if (!cancelled) {
                        setDwReport(res);
                        setSignals(res.signals || []);
                    }
                } else {
                    const res = await getSignalQualityFallback(
                        effectiveRunId ?? undefined,
                        effectiveStrategyId ?? undefined,
                        scope,
                        "ALL",
                    );
                    if (!cancelled) {
                        setDwReport(null);
                        setSignals(res.signals || []);
                    }
                }
            } catch (e) {
                if (!cancelled) {
                    setDwReport(null);
                    setError(e instanceof Error ? e.message : "Load error");
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [scope, effectiveRunId, effectiveStrategyId]);

    /* ---- derived data ---- */
    const refusedSimulated = useMemo(
        () => signals.filter((s) => s.accepted === false && s.sim_outcome),
        [signals],
    );
    const executableRefusedSimulated = useMemo(
        () => refusedSimulated.filter((s) => s.sim_valid === true),
        [refusedSimulated],
    );
    const reportSummary = dwReport?.summary ?? null;
    const totalRefused = useMemo(
        () => reportSummary?.rejected_total ?? signals.filter((s) => s.accepted === false).length,
        [reportSummary, signals],
    );

    const stats = useMemo(() => {
        const total = reportSummary?.rejected_executable_count ?? executableRefusedSimulated.length;
        const tp = executableRefusedSimulated.filter((s) =>
            ["TP_HIT", "TP_FIRST"].includes(s.sim_outcome || ""),
        ).length;
        const sl = executableRefusedSimulated.filter((s) =>
            ["SL_HIT", "SL_FIRST"].includes(s.sim_outcome || ""),
        ).length;
        const timeStop = executableRefusedSimulated.filter(
            (s) => s.sim_outcome === "TIME_STOP",
        ).length;
        const earlyKill = executableRefusedSimulated.filter(
            (s) => s.sim_outcome === "EARLY_KILL",
        ).length;
        const noHit = executableRefusedSimulated.filter(
            (s) => !s.sim_outcome || s.sim_outcome === "NONE_HIT",
        ).length;
        const unknown = total - tp - sl - timeStop - earlyKill - noHit;
        const winPct = reportSummary
            ? reportSummary.tp_after_decision_rate * 100
            : total
                ? (tp / total) * 100
                : 0;
        const totalPnlPips = executableRefusedSimulated.reduce(
            (acc, s) => acc + (s.sim_pnl_pips ?? 0),
            0,
        );
        const totalPnlUsd = executableRefusedSimulated.reduce(
            (acc, s) => acc + (s.sim_pnl_usd ?? 0),
            0,
        );
        const avgPnl = reportSummary?.avg_missed_pnl_pips ?? (total ? totalPnlPips / total : 0);
        return {
            total,
            tp,
            sl,
            timeStop,
            earlyKill,
            noHit,
            unknown,
            winPct,
            totalPnlPips,
            totalPnlUsd,
            avgPnl,
            clusteredPnlPips: reportSummary?.missed_pnl_clustered_pips ?? totalPnlPips,
            rawPnlPips: reportSummary?.missed_pnl_raw_pips ?? totalPnlPips,
            unreliableCount: reportSummary?.rejected_unreliable_count ?? 0,
            clusterCount: reportSummary?.cluster_count ?? 0,
            unspecifiedCount: reportSummary?.unspecified_rejection_count ?? 0,
        };
    }, [executableRefusedSimulated, reportSummary]);

    const latest = refusedSimulated.slice(0, 50);
    const topClusters = dwReport?.clusters.slice(0, 3) ?? [];

    /* ---- plotly: outcome waterfall ---- */
    const outcomeWaterfall = useMemo(() => {
        const labels = ["TP", "SL", "Time Stop", "Early Kill", "No Hit", "Unknown"];
        const values = [stats.tp, stats.sl, stats.timeStop, stats.earlyKill, stats.noHit, stats.unknown];
        const colors = ["#2de3a0", "#f25f73", "#f0b429", "#e09100", "#64748b", "#a78bfa"];
        return [
            {
                type: "bar" as const,
                x: labels,
                y: values,
                marker: {
                    color: colors,
                    line: { color: colors.map((c) => c + "60"), width: 1 },
                },
                text: values.map(String),
                textposition: "outside" as const,
                textfont: { color: "#94a3b8", size: 12 },
                hovertemplate: "%{x}: %{y}<extra></extra>",
            },
        ];
    }, [stats]);

    /* ---- plotly: amplitude vs pnl scatter ---- */
    const pnlScatter = useMemo(() => {
        const pts = executableRefusedSimulated.filter(
            (s) => s.amplitude_pips != null && s.sim_pnl_pips != null,
        );
        if (!pts.length) return null;
        const x = pts.map((s) => s.amplitude_pips!);
        const y = pts.map((s) => s.sim_pnl_pips!);
        const text = pts.map(
            (s) =>
                `${s.sim_outcome ?? "n/a"}<br>${fmtTs(s.ts)}<br>${fmtPips(s.amplitude_pips)}p`,
        );
        return [
            {
                type: "scattergl" as const,
                mode: "markers" as const,
                x,
                y,
                text,
                marker: {
                    color: y.map((v) => (v >= 0 ? "#2de3a0" : "#f25f73")),
                    size: 9,
                    opacity: 0.85,
                    line: {
                        color: y.map((v) =>
                            v >= 0 ? "rgba(45,227,160,0.4)" : "rgba(242,95,115,0.4)",
                        ),
                        width: 1,
                    },
                },
                hovertemplate:
                    "%{text}<br>PnL=%{y:+.2f}p<extra></extra>",
            },
            {
                type: "scatter" as const,
                mode: "lines" as const,
                x: [Math.min(...x) * 0.95, Math.max(...x) * 1.05],
                y: [0, 0],
                line: { color: "rgba(255,255,255,0.12)", dash: "dot" as const, width: 1 },
                hoverinfo: "skip" as const,
                showlegend: false,
            },
        ];
    }, [executableRefusedSimulated]);

    /* ---- plotly: cumulative sim pnl ---- */
    const cumulativePnl = useMemo(() => {
        if (!executableRefusedSimulated.length) return null;
        const sorted = [...executableRefusedSimulated].sort(
            (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime(),
        );
        let cum = 0;
        const x: string[] = [];
        const y: number[] = [];
        sorted.forEach((s) => {
            cum += s.sim_pnl_pips ?? 0;
            x.push(s.ts);
            y.push(cum);
        });
        return [
            {
                type: "scatter" as const,
                mode: "lines" as const,
                x,
                y,
                line: {
                    color: "#46d3ff",
                    width: 2,
                    shape: "hv" as const,
                },
                fill: "tozeroy" as const,
                fillcolor: "rgba(70,211,255,0.06)",
                hovertemplate: "%{x|%m-%d %H:%M}<br>Cum: %{y:+.2f}p<extra></extra>",
            },
        ];
    }, [executableRefusedSimulated]);

    /* ---- scope label ---- */
    const scopeLabel = dataScope;

    /* ================================================================
       RENDER
       ================================================================ */
    return (
        <div className="quantlab-shell" style={quantLabCssVariables as any}>
            <div className="quantlab-container">
                <div className="space-y-6">
                    {reportSummary && (
                        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                            <span className="ql-section-label mb-0">S1 Missed Opportunities</span>
                            <span className="text-xs text-[var(--ql-muted)]">
                                KPI principal = clusterisé ({reportSummary.cluster_method})
                            </span>
                            {stats.unspecifiedCount > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-[var(--ql-warn)]">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    {stats.unspecifiedCount} refus sans cause explicite
                                </span>
                            )}
                            {reportSummary.top_reasons.slice(0, 3).map((item) => (
                                <span
                                    key={item.reason}
                                    className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-[var(--ql-muted)]"
                                >
                                    {item.reason} · {item.count}
                                </span>
                            ))}
                        </div>
                    )}
                    {/* ============================================
                        ROW 1 - KPI Strip
                        ============================================ */}
                    <div className="grid grid-cols-12 gap-4">
                        {/* Hero KPI - Refus executables */}
                        <BentoCard className="col-span-12 lg:col-span-3 p-5" padding="">
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="ql-section-label mb-1">
                                        {reportSummary ? "Refus exécutables" : "Refusés simulés"}
                                    </div>
                                    <div className="text-3xl font-bold tracking-tight text-[var(--ql-strong)]">
                                        {loading ? (
                                            <Loader2 className="w-6 h-6 animate-spin text-[var(--ql-accent)]" />
                                        ) : (
                                            stats.total
                                        )}
                                    </div>
                                    <div className="text-xs text-[var(--ql-muted)] mt-1">
                                        sur {totalRefused} refusés total
                                    </div>
                                </div>
                                <div className="p-2 rounded-xl bg-[var(--ql-accent)]/10 border border-[var(--ql-accent)]/20">
                                    <Ghost className="w-5 h-5 text-[var(--ql-accent)]" />
                                </div>
                            </div>
                        </BentoCard>

                        {/* KPI - Bursts / TP */}
                        <BentoCard className="col-span-6 sm:col-span-3 lg:col-span-2 p-5" padding="">
                            <KpiStat
                                label={reportSummary ? "Bursts" : "TP Virtuels"}
                                value={reportSummary ? stats.clusterCount : stats.tp}
                                tone={reportSummary ? "default" : "success"}
                                hint={
                                    reportSummary
                                        ? "déduplication 5s"
                                        : stats.total
                                            ? `${((stats.tp / stats.total) * 100).toFixed(0)}% des sim`
                                            : undefined
                                }
                            />
                        </BentoCard>

                        {/* KPI - Non fiables / SL */}
                        <BentoCard className="col-span-6 sm:col-span-3 lg:col-span-2 p-5" padding="">
                            <KpiStat
                                label={reportSummary ? "Non fiables" : "SL Virtuels"}
                                value={reportSummary ? stats.unreliableCount : stats.sl}
                                tone={reportSummary ? "warn" : "danger"}
                                hint={
                                    reportSummary
                                        ? "hors missed-pnl"
                                        : stats.total
                                            ? `${((stats.sl / stats.total) * 100).toFixed(0)}% des sim`
                                            : undefined
                                }
                            />
                        </BentoCard>

                        {/* KPI - Win% */}
                        <BentoCard className="col-span-6 sm:col-span-3 lg:col-span-2 p-5" padding="">
                            <KpiStat
                                label="Win Rate"
                                value={`${stats.winPct.toFixed(1)}%`}
                                tone={stats.winPct >= 50 ? "success" : stats.winPct >= 35 ? "warn" : "danger"}
                                hint="TP / (TP+SL+NoHit)"
                            />
                        </BentoCard>

                        {/* KPI - Primary missed PnL */}
                        <BentoCard className="col-span-6 sm:col-span-3 lg:col-span-3 p-5" padding="">
                            <div className="ql-kpi">
                                <div className="ql-kpi-label">
                                    {reportSummary ? "Missed PnL Clusterisé" : "PnL Virtuel Cumulé"}
                                </div>
                                <div
                                    className={cn(
                                        "ql-kpi-value flex items-center gap-1",
                                        stats.clusteredPnlPips >= 0
                                            ? "text-[var(--ql-success)]"
                                            : "text-[var(--ql-danger)]",
                                    )}
                                >
                                    {stats.clusteredPnlPips >= 0 ? (
                                        <ArrowUpRight className="w-4 h-4" />
                                    ) : (
                                        <ArrowDownRight className="w-4 h-4" />
                                    )}
                                    {stats.clusteredPnlPips >= 0 ? "+" : ""}
                                    {stats.clusteredPnlPips.toFixed(1)}p
                                </div>
                                <div className="ql-kpi-hint">
                                    {reportSummary ? (
                                        <>
                                            brut {fmtPips(stats.rawPnlPips)}p &middot; avg {fmtPips(stats.avgPnl)}p/sig
                                        </>
                                    ) : (
                                        <>
                                            {fmtUsd(stats.totalPnlUsd)} &middot; avg {fmtPips(stats.avgPnl)}p/sig
                                        </>
                                    )}
                                </div>
                            </div>
                        </BentoCard>
                    </div>

                    {/* ============================================
                        ROW 2 - Charts Bento (3 panels)
                        ============================================ */}
                    <div className="grid grid-cols-12 gap-4">
                        {/* Chart: Outcome Distribution */}
                        <BentoCard className="col-span-12 lg:col-span-4 p-5 space-y-3" padding="">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="ql-section-label">Distribution</div>
                                    <div className="text-sm font-medium text-[var(--ql-strong)]">
                                        Outcomes simulés
                                    </div>
                                </div>
                                <BarChart3 className="w-4 h-4 text-[var(--ql-accent)]" />
                            </div>
                            <div className="h-56">
                                {loading ? (
                                    <QuantSkeleton lines={6} />
                                ) : stats.total === 0 ? (
                                    <div className="h-full flex items-center justify-center">
                                        <div className="text-center">
                                            <Ghost className="w-8 h-8 mx-auto mb-2 text-[var(--ql-muted)] opacity-40" />
                                            <div className="text-xs text-[var(--ql-muted)]">
                                                Aucune simulation
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <React.Suspense fallback={<QuantSkeleton lines={4} />}>
                                        <Plot
                                            data={outcomeWaterfall}
                                            layout={{
                                                height: 210,
                                                paper_bgcolor: PL_BG,
                                                plot_bgcolor: PL_BG,
                                                margin: PL_MARGIN,
                                                yaxis: {
                                                    gridcolor: PL_GRID,
                                                    tickfont: PL_TICK,
                                                    zeroline: false,
                                                },
                                                xaxis: { tickfont: PL_TICK },
                                                showlegend: false,
                                                bargap: 0.35,
                                            }}
                                            config={{ displayModeBar: false, responsive: true }}
                                            style={{ width: "100%", height: "100%" }}
                                        />
                                    </React.Suspense>
                                )}
                            </div>
                        </BentoCard>

                        {/* Chart: Amplitude vs PnL scatter */}
                        <BentoCard className="col-span-12 lg:col-span-4 p-5 space-y-3" padding="">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="ql-section-label">Edge Analysis</div>
                                    <div className="text-sm font-medium text-[var(--ql-strong)]">
                                        Shock Amplitude vs PnL
                                    </div>
                                </div>
                                <ScatterChart className="w-4 h-4 text-[var(--ql-success)]" />
                            </div>
                            <div className="h-56">
                                {loading ? (
                                    <QuantSkeleton lines={6} />
                                ) : pnlScatter ? (
                                    <React.Suspense fallback={<QuantSkeleton lines={4} />}>
                                        <Plot
                                            data={pnlScatter}
                                            layout={{
                                                height: 210,
                                                paper_bgcolor: PL_BG,
                                                plot_bgcolor: PL_BG,
                                                margin: PL_MARGIN_SCATTER,
                                                xaxis: {
                                                    title: {
                                                        text: "Amplitude (pips)",
                                                        font: { size: 11, color: "#64748b" } as any,
                                                    },
                                                    gridcolor: PL_GRID,
                                                    tickfont: PL_TICK,
                                                    zeroline: false,
                                                },
                                                yaxis: {
                                                    title: {
                                                        text: "Sim PnL (pips)",
                                                        font: { size: 11, color: "#64748b" } as any,
                                                    },
                                                    gridcolor: PL_GRID,
                                                    tickfont: PL_TICK,
                                                    zeroline: false,
                                                },
                                                showlegend: false,
                                                hovermode: "closest" as const,
                                            }}
                                            config={{ displayModeBar: false, responsive: true }}
                                            style={{ width: "100%", height: "100%" }}
                                        />
                                    </React.Suspense>
                                ) : (
                                    <div className="h-full flex items-center justify-center">
                                        <div className="text-center">
                                            <ScatterChart className="w-8 h-8 mx-auto mb-2 text-[var(--ql-muted)] opacity-40" />
                                            <div className="text-xs text-[var(--ql-muted)]">
                                                Pas assez de données
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </BentoCard>

                        {/* Chart: Cumulative PnL */}
                        <BentoCard className="col-span-12 lg:col-span-4 p-5 space-y-3" padding="">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="ql-section-label">Equity Curve</div>
                                    <div className="text-sm font-medium text-[var(--ql-strong)]">
                                        PnL Cumulé Virtuel
                                    </div>
                                </div>
                                <Zap className="w-4 h-4 text-[var(--ql-accent)]" />
                            </div>
                            <div className="h-56">
                                {loading ? (
                                    <QuantSkeleton lines={6} />
                                ) : cumulativePnl ? (
                                    <React.Suspense fallback={<QuantSkeleton lines={4} />}>
                                        <Plot
                                            data={cumulativePnl}
                                            layout={{
                                                height: 210,
                                                paper_bgcolor: PL_BG,
                                                plot_bgcolor: PL_BG,
                                                margin: PL_MARGIN,
                                                xaxis: {
                                                    gridcolor: PL_GRID,
                                                    tickfont: PL_TICK,
                                                    tickformat: "%m-%d %H:%M",
                                                },
                                                yaxis: {
                                                    gridcolor: PL_GRID,
                                                    tickfont: PL_TICK,
                                                    zeroline: true,
                                                    zerolinecolor: "rgba(255,255,255,0.1)",
                                                },
                                                showlegend: false,
                                                hovermode: "x unified" as any,
                                            }}
                                            config={{ displayModeBar: false, responsive: true }}
                                            style={{ width: "100%", height: "100%" }}
                                        />
                                    </React.Suspense>
                                ) : (
                                    <div className="h-full flex items-center justify-center">
                                        <div className="text-center">
                                            <Zap className="w-8 h-8 mx-auto mb-2 text-[var(--ql-muted)] opacity-40" />
                                            <div className="text-xs text-[var(--ql-muted)]">
                                                Aucune donnée
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </BentoCard>
                    </div>

                    {reportSummary && topClusters.length > 0 && (
                        <BentoCard className="col-span-12 p-5 space-y-4" padding="">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="ql-section-label">Top Bursts</div>
                                    <div className="text-sm font-medium text-[var(--ql-strong)]">
                                        Déduplication des refus quasi simultanés
                                    </div>
                                </div>
                                <span className="text-[11px] text-[var(--ql-muted)]">
                                    KPI desk basé sur le premier signal de cluster
                                </span>
                            </div>
                            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                                {topClusters.map((cluster) => (
                                    <div
                                        key={cluster.cluster_id}
                                        className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-sm font-semibold text-[var(--ql-strong)]">
                                                {cluster.direction || "N/A"} · {cluster.signal_count} signaux
                                            </div>
                                            <PnlCell value={cluster.clustered_pnl_pips} suffix="p" />
                                        </div>
                                        <div className="mt-2 text-xs text-[var(--ql-muted)]">
                                            {fmtTs(cluster.cluster_start_ts)} → {fmtTs(cluster.cluster_end_ts)}
                                        </div>
                                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[var(--ql-muted)]">
                                            <span className="rounded-full border border-white/10 px-2 py-1">
                                                brut {fmtPips(cluster.sum_sim_pnl_pips)}p
                                            </span>
                                            <span className="rounded-full border border-white/10 px-2 py-1">
                                                best {fmtPips(cluster.best_sim_pnl_pips)}p
                                            </span>
                                            {cluster.dominant_reason && (
                                                <span className="rounded-full border border-white/10 px-2 py-1">
                                                    {cluster.dominant_reason}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </BentoCard>
                    )}

                    {/* ============================================
                        ROW 3 - Blotter Table
                        ============================================ */}
                    <BentoCard className="col-span-12 overflow-hidden" padding="">
                        {/* Table header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--ql-border)]">
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded-lg bg-[var(--ql-accent)]/8 border border-[var(--ql-accent)]/15">
                                    <ShieldCheck className="w-4 h-4 text-[var(--ql-accent)]" />
                                </div>
                                <div>
                                    <div className="text-sm font-semibold text-[var(--ql-strong)]">
                                        Simulation Blotter
                                    </div>
                                    <div className="text-[11px] text-[var(--ql-muted)]">
                                        Top 50 signaux refusés &middot; {scopeLabel}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {error && (
                                    <span className="text-xs text-[var(--ql-danger)] flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" /> {error}
                                    </span>
                                )}
                                {loading && (
                                    <span className="text-xs text-[var(--ql-muted)] flex items-center gap-1">
                                        <Loader2 className="w-3 h-3 animate-spin" /> Loading...
                                    </span>
                                )}
                                <span className="ql-chip">
                                    <span className="text-[10px] uppercase tracking-wider text-[var(--ql-muted)]">
                                        Rows
                                    </span>
                                    <span className="font-semibold text-[var(--ql-strong)]">
                                        {latest.length}
                                    </span>
                                </span>
                            </div>
                        </div>

                        {/* Table body */}
                        <div className="max-h-[520px] overflow-auto">
                            <table className="w-full text-[13px]">
                                <thead>
                                    <tr className="border-b border-[var(--ql-border)]">
                                        <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wider text-[var(--ql-muted)] font-medium bg-white/[0.02] sticky top-0 backdrop-blur-sm z-[1]">
                                            Time
                                        </th>
                                        <th className="px-3 py-2.5 text-left text-[11px] uppercase tracking-wider text-[var(--ql-muted)] font-medium bg-white/[0.02] sticky top-0 backdrop-blur-sm z-[1]">
                                            Run
                                        </th>
                                        <th className="px-3 py-2.5 text-right text-[11px] uppercase tracking-wider text-[var(--ql-muted)] font-medium bg-white/[0.02] sticky top-0 backdrop-blur-sm z-[1]">
                                            Shock
                                        </th>
                                        <th className="px-3 py-2.5 text-center text-[11px] uppercase tracking-wider text-[var(--ql-muted)] font-medium bg-white/[0.02] sticky top-0 backdrop-blur-sm z-[1]">
                                            Outcome
                                        </th>
                                        <th className="px-3 py-2.5 text-center text-[11px] uppercase tracking-wider text-[var(--ql-muted)] font-medium bg-white/[0.02] sticky top-0 backdrop-blur-sm z-[1]">
                                            Verdict
                                        </th>
                                        <th className="px-3 py-2.5 text-right text-[11px] uppercase tracking-wider text-[var(--ql-muted)] font-medium bg-white/[0.02] sticky top-0 backdrop-blur-sm z-[1]">
                                            PnL
                                        </th>
                                        <th className="px-3 py-2.5 text-right text-[11px] uppercase tracking-wider text-[var(--ql-muted)] font-medium bg-white/[0.02] sticky top-0 backdrop-blur-sm z-[1]">
                                            USD
                                        </th>
                                        <th className="px-3 py-2.5 text-right text-[11px] uppercase tracking-wider text-[var(--ql-muted)] font-medium bg-white/[0.02] sticky top-0 backdrop-blur-sm z-[1]">
                                            MFE
                                        </th>
                                        <th className="px-3 py-2.5 text-right text-[11px] uppercase tracking-wider text-[var(--ql-muted)] font-medium bg-white/[0.02] sticky top-0 backdrop-blur-sm z-[1]">
                                            MAE
                                        </th>
                                        <th className="px-3 py-2.5 text-center text-[11px] uppercase tracking-wider text-[var(--ql-muted)] font-medium bg-white/[0.02] sticky top-0 backdrop-blur-sm z-[1]">
                                            Quality
                                        </th>
                                        <th className="px-3 py-2.5 text-left text-[11px] uppercase tracking-wider text-[var(--ql-muted)] font-medium bg-white/[0.02] sticky top-0 backdrop-blur-sm z-[1]">
                                            Reason
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {latest.map((s, i) => (
                                        <tr
                                            key={s.signal_id}
                                            className={cn(
                                                "border-b border-white/[0.03] transition-colors hover:bg-white/[0.04]",
                                                i % 2 === 1 && "bg-white/[0.015]",
                                            )}
                                        >
                                            <td className="px-4 py-2.5 font-mono text-xs text-[var(--ql-muted)] whitespace-nowrap">
                                                {fmtTs(s.ts)}
                                            </td>
                                            <td className="px-3 py-2.5 font-mono text-xs text-[var(--ql-muted)]">
                                                {shortRunId(s.run_id)}
                                            </td>
                                            <td className="px-3 py-2.5 text-right font-mono text-xs text-[var(--ql-strong)]">
                                                {fmtPips(s.amplitude_pips)}
                                                <span className="text-[10px] text-[var(--ql-muted)] ml-0.5">p</span>
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                <OutcomeBadge outcome={s.sim_outcome} />
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                <VerdictBadge verdict={s.sim_verdict} />
                                            </td>
                                            <td className="px-3 py-2.5 text-right">
                                                <PnlCell value={s.sim_pnl_pips} suffix="p" />
                                            </td>
                                            <td className="px-3 py-2.5 text-right">
                                                <PnlCell value={s.sim_pnl_usd} />
                                            </td>
                                            <td className="px-3 py-2.5 text-right font-mono text-xs text-[var(--ql-success)]">
                                                {fmtPips(s.sim_mfe_pips)}
                                            </td>
                                            <td className="px-3 py-2.5 text-right font-mono text-xs text-[var(--ql-danger)]">
                                                {fmtPips(s.sim_mae_pips)}
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                <QualityBadge q={s.sim_quality} />
                                            </td>
                                            <td className="px-3 py-2.5 text-xs text-[var(--ql-muted)]">
                                                {s.rejection_reason ?? "-"}
                                            </td>
                                        </tr>
                                    ))}
                                    {latest.length === 0 && !loading && (
                                        <tr>
                                            <td
                                                className="px-4 py-12 text-center text-[var(--ql-muted)]"
                                                colSpan={11}
                                            >
                                                <Ghost className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                                <div className="text-sm font-medium mb-1">
                                                    Aucun signal refusé simulé
                                                </div>
                                                <div className="text-xs opacity-60">
                                                    Fenêtre : {scopeLabel}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </BentoCard>
                </div>
            </div>
        </div>
    );
}
