/**
 * Market Conditions V3 — Glass Hedge Desk
 *
 * Consumes server-side aggregates from /api/quant/v1/market:
 * - spread quantiles (p50/p90/p95/p99) computed on backend
 * - spread histogram (bin_edges/counts/density)
 * - session breakdown (ASIA/LONDON/NY stats)
 * - vol regime dominance
 * - freshness gauge
 *
 * Linked brushing: Plotly selections propagate to SelectionContext
 * for cross-tab filtering in the Quant Lab.
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useSelection, useQuantLabScope } from "../../../lib/SelectionContext";
import {
    getMarketConditionsV3First,
    MarketConditionsResponse,
} from "../../../lib/quantApi";
import {
    BentoCard,
    BentoGrid,
    KpiStat,
    Badge,
    StatusBadge,
    EmptyState,
} from "../ui";
import { useMarketAutoReload } from "./useMarketAutoReload";

// Plotly dynamic import for code splitting
const Plot = React.lazy(() => import("../../../lib/PlotlyBasic"));

// ---------------------------------------------------------------------------
// Session color palette (reused across charts)
// ---------------------------------------------------------------------------
const SESSION_COLORS: Record<string, string> = {
    ASIA: "#8b5cf6",
    LONDON: "#22c55e",
    NY: "#3b82f6",
    UNKNOWN: "#64748b",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function MarketConditions() {
    const quantScope = useQuantLabScope();
    const { scope, runId, scopeLabel } = quantScope;
    const { setRegime, clearRegime, setTimeRange } = useSelection();
    const requestSeq = useRef(0);

    const [data, setData] = useState<MarketConditionsResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        const requestId = ++requestSeq.current;
        setLoading(true);
        setError(null);
        try {
            const mc = await getMarketConditionsV3First(
                runId ?? undefined,
                scope,
            );
            if (requestId !== requestSeq.current) return;
            setData(mc);
        } catch (e: unknown) {
            if (requestId !== requestSeq.current) return;
            setError(e instanceof Error ? e.message : "Failed to load market data");
            throw e;
        } finally {
            if (requestId !== requestSeq.current) return;
            setLoading(false);
        }
    }, [runId, scope]);

    const { refreshNow } = useMarketAutoReload(loadData, {
        baseIntervalMs: 15_000,
        maxIntervalMs: 60_000,
    });

    // -----------------------------------------------------------------------
    // Server-side quantiles (no client-side sort needed)
    // -----------------------------------------------------------------------
    const p50 = data?.spread_quantiles?.p50 ?? null;
    const p90 = data?.spread_quantiles?.p90 ?? null;
    const p95 = data?.spread_quantiles?.p95 ?? null;
    const p99 = data?.spread_quantiles?.p99 ?? null;

    // -----------------------------------------------------------------------
    // Spread timeline chart
    // -----------------------------------------------------------------------
    const spreadChartData = useMemo(() => {
        if (!data?.spread_timeline?.length) return null;

        const timeline = data.spread_timeline;
        const x = timeline.map((p) => p.ts);
        const y = timeline.map((p) => p.spread_pips);

        return {
            data: [
                {
                    type: "scatter" as const,
                    mode: "lines" as const,
                    x,
                    y,
                    fill: "tozeroy" as const,
                    fillcolor: "rgba(99, 102, 241, 0.15)",
                    line: { color: "#6366f1", width: 1.5 },
                    hovertemplate: "%{y:.2f} pips<br>%{x}<extra></extra>",
                },
                // p50 reference line
                ...(p50 != null
                    ? [
                        {
                            type: "scatter" as const,
                            mode: "lines" as const,
                            x: [x[0], x[x.length - 1]],
                            y: [p50, p50],
                            line: {
                                color: "rgba(34,197,94,0.6)",
                                width: 1,
                                dash: "dot" as const,
                            },
                            hoverinfo: "skip" as const,
                            showlegend: false,
                        },
                    ]
                    : []),
            ],
            layout: {
                height: 220,
                margin: { l: 40, r: 20, t: 10, b: 30 },
                paper_bgcolor: "transparent",
                plot_bgcolor: "transparent",
                xaxis: {
                    showgrid: false,
                    tickfont: { size: 10, color: "#8b95a9" },
                    linecolor: "rgba(255,255,255,0.1)",
                },
                yaxis: {
                    title: {
                        text: "Spread (pips)",
                        font: { size: 10, color: "#8b95a9" },
                    },
                    showgrid: true,
                    gridcolor: "rgba(255,255,255,0.05)",
                    tickfont: { size: 10, color: "#8b95a9" },
                    zeroline: false,
                },
                dragmode: "select" as const,
                hovermode: "x unified" as const,
            },
        };
    }, [data, p50]);

    // -----------------------------------------------------------------------
    // Spread histogram from server
    // -----------------------------------------------------------------------
    const histogramData = useMemo(() => {
        const h = data?.spread_histogram;
        if (!h?.bin_edges?.length || !h?.counts?.length) return null;

        // bin_edges has N+1 edges for N bins; use midpoints for x
        const midpoints = h.bin_edges
            .slice(0, -1)
            .map((e, i) => (e + h.bin_edges[i + 1]) / 2);

        return {
            data: [
                {
                    type: "bar" as const,
                    x: midpoints,
                    y: h.counts,
                    marker: {
                        color: midpoints.map((m) =>
                            m < 0.3
                                ? "rgba(34,197,94,0.7)"
                                : m < 0.5
                                    ? "rgba(234,179,8,0.7)"
                                    : "rgba(239,68,68,0.7)",
                        ),
                    },
                    hovertemplate:
                        "Spread: %{x:.3f}p<br>Count: %{y}<extra></extra>",
                },
            ],
            layout: {
                height: 200,
                margin: { l: 40, r: 20, t: 10, b: 35 },
                paper_bgcolor: "transparent",
                plot_bgcolor: "transparent",
                bargap: 0.05,
                xaxis: {
                    title: {
                        text: "Spread (pips)",
                        font: { size: 10, color: "#8b95a9" },
                    },
                    tickfont: { size: 10, color: "#8b95a9" },
                    showgrid: false,
                },
                yaxis: {
                    title: {
                        text: "Count",
                        font: { size: 10, color: "#8b95a9" },
                    },
                    tickfont: { size: 10, color: "#8b95a9" },
                    showgrid: true,
                    gridcolor: "rgba(255,255,255,0.05)",
                },
                hovermode: "closest" as const,
            },
        };
    }, [data]);

    // -----------------------------------------------------------------------
    // Freshness gauge
    // -----------------------------------------------------------------------
    const freshnessGauge = useMemo(() => {
        if (!data?.freshness) return null;

        const age = data.freshness.bar_age_seconds;
        const maxAge = 120;

        const statusColor: Record<string, string> = {
            FRESH: "#22c55e",
            STALE: "#eab308",
            OFFLINE: "#ef4444",
        };

        return {
            data: [
                {
                    type: "indicator" as const,
                    mode: "gauge+number" as const,
                    value: age,
                    number: {
                        suffix: "s",
                        font: { size: 32, color: "#e4e8f1" },
                    },
                    gauge: {
                        axis: {
                            range: [0, maxAge],
                            tickfont: { size: 10, color: "#8b95a9" },
                            tickcolor: "rgba(255,255,255,0.1)",
                        },
                        bar: {
                            color:
                                statusColor[data.freshness.status] ??
                                "#ef4444",
                            thickness: 0.6,
                        },
                        bgcolor: "rgba(255,255,255,0.05)",
                        borderwidth: 0,
                        steps: [
                            {
                                range: [0, 30],
                                color: "rgba(34, 197, 94, 0.15)",
                            },
                            {
                                range: [30, 60],
                                color: "rgba(234, 179, 8, 0.15)",
                            },
                            {
                                range: [60, 120],
                                color: "rgba(239, 68, 68, 0.15)",
                            },
                        ],
                        threshold: {
                            line: {
                                color:
                                    statusColor[data.freshness.status] ??
                                    "#ef4444",
                                width: 2,
                            },
                            thickness: 0.8,
                            value: age,
                        },
                    },
                },
            ],
            layout: {
                height: 180,
                margin: { l: 20, r: 20, t: 30, b: 10 },
                paper_bgcolor: "transparent",
                font: { color: "#e4e8f1" },
            },
        };
    }, [data]);

    // -----------------------------------------------------------------------
    // Linked brushing handlers
    // -----------------------------------------------------------------------
    const handleTimelineSelected = useCallback(
        (event: Readonly<{ range?: { x?: [string, string] } }>) => {
            if (event?.range?.x) {
                setTimeRange(event.range.x[0], event.range.x[1]);
            }
        },
        [setTimeRange],
    );

    const handleRegimeClick = useCallback(
        (regime: string) => {
            setRegime({ vol_bucket: regime.toLowerCase() });
        },
        [setRegime],
    );

    // -----------------------------------------------------------------------
    // Plotly config
    // -----------------------------------------------------------------------
    const plotConfig = { displayModeBar: false, responsive: true };

    // -----------------------------------------------------------------------
    // Derived KPIs
    // -----------------------------------------------------------------------
    const spread24h = data?.kpis.avg_spread_24h ?? null;
    const volRegime = data?.vol_regime.current ?? null;
    const tradable = data?.kpis.tradable;
    const isTradable = tradable === true;
    const freshnessAge = data?.freshness?.bar_age_seconds ?? null;
    const breachPct = data?.kpis.spread_breach_pct ?? null;
    const totalBars = data?.kpis.total_bars ?? null;

    const marketHeadline = isTradable
        ? "Tradable now"
        : "Guarded / Observe only";
    const marketCopy = volRegime
        ? `Vol regime ${volRegime} · ${spread24h != null ? spread24h.toFixed(2) : "?"}p median spread`
        : "Awaiting market diagnostics";

    // -----------------------------------------------------------------------
    // Session breakdown from server
    // -----------------------------------------------------------------------
    const sessions = data?.session_breakdown ?? [];

    return (
        <div className="p-4 space-y-4">
            {/* Info banner */}
            <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-4 py-2 text-sm text-blue-300">
                <span className="font-medium">Market Conditions</span>{" "}
                affiche les donnees marche en temps reel (spread, regime
                volatilite). Ces donnees sont globales et ne dependent pas du
                run selectionne.
            </div>

            {/* ============================================================ */}
            {/* Headline Card — 6 KPIs (quantiles from backend)              */}
            {/* ============================================================ */}
            <div className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_20%_20%,rgba(34,197,94,0.15),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,0.2),transparent_30%),linear-gradient(135deg,rgba(6,10,20,0.95),rgba(7,13,24,0.9))] p-4 sm:p-5 shadow-[0_24px_120px_rgba(0,0,0,0.55)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="text-[11px] uppercase tracking-[0.24em] text-neutral-400">
                            Market cockpit · Temps reel (auto-refresh 15s)
                        </div>
                        <div className="text-2xl font-semibold text-white mt-1">
                            {marketHeadline}
                        </div>
                        <div className="text-sm text-neutral-400">
                            {marketCopy}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {data?.freshness && (
                            <StatusBadge
                                status={
                                    data.freshness.status.toLowerCase() as
                                    | "fresh"
                                    | "stale"
                                    | "offline"
                                }
                            />
                        )}
                        {data?.meta?.data_source && (
                            <Badge
                                className={
                                    data.meta.data_source === "LEGACY"
                                        ? "bg-amber-600/40"
                                        : "bg-emerald-700/50"
                                }
                            >
                                {data.meta.data_source}
                            </Badge>
                        )}
                        {data?.meta?.fallback_used && (
                            <Badge className="bg-amber-600/40">
                                fallback
                            </Badge>
                        )}
                        <Badge className="bg-cyan-600/30">Live</Badge>
                        <button
                            onClick={() => {
                                void refreshNow();
                            }}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm transition-colors"
                        >
                            <RefreshCw
                                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                            />
                            Refresh
                        </button>
                    </div>
                </div>

                {/* 6-KPI strip */}
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <BentoCard padding="sm" className="h-full">
                        <KpiStat
                            label="Spread p50"
                            value={p50 != null ? p50.toFixed(3) : "-"}
                            hint="pips"
                            tone={
                                (p50 ?? 1) < 0.25
                                    ? "success"
                                    : (p50 ?? 1) < 0.4
                                        ? "warn"
                                        : "danger"
                            }
                        />
                    </BentoCard>
                    <BentoCard padding="sm" className="h-full">
                        <KpiStat
                            label="Spread p95"
                            value={p95 != null ? p95.toFixed(3) : "-"}
                            hint="pips"
                            tone={
                                (p95 ?? 1) < 0.5
                                    ? "success"
                                    : (p95 ?? 1) < 0.8
                                        ? "warn"
                                        : "danger"
                            }
                        />
                    </BentoCard>
                    <BentoCard padding="sm" className="h-full">
                        <KpiStat
                            label="Current Regime"
                            value={volRegime ?? "-"}
                            tone={
                                volRegime === "LOW"
                                    ? "success"
                                    : volRegime === "HIGH"
                                        ? "danger"
                                        : "default"
                            }
                            hint="from canonical profile"
                        />
                    </BentoCard>
                    <BentoCard padding="sm" className="h-full">
                        <KpiStat
                            label="Bar Age"
                            value={
                                freshnessAge != null
                                    ? `${freshnessAge.toFixed(0)}s`
                                    : "-"
                            }
                            tone={
                                (freshnessAge ?? 999) < 30
                                    ? "success"
                                    : (freshnessAge ?? 999) < 60
                                        ? "warn"
                                        : "danger"
                            }
                            hint="data freshness"
                        />
                    </BentoCard>
                    <BentoCard padding="sm" className="h-full">
                        <KpiStat
                            label="Breach > 0.4p"
                            value={
                                breachPct != null
                                    ? `${breachPct.toFixed(1)}%`
                                    : "-"
                            }
                            tone={
                                (breachPct ?? 100) < 5
                                    ? "success"
                                    : (breachPct ?? 100) < 15
                                        ? "warn"
                                        : "danger"
                            }
                            hint="spread guard violations"
                        />
                    </BentoCard>
                    <BentoCard padding="sm" className="h-full">
                        <KpiStat
                            label="Tradable"
                            value={tradable ? "YES" : "NO"}
                            tone={tradable ? "success" : "danger"}
                            hint={
                                tradable
                                    ? "Guards open"
                                    : "Blocked by guards"
                            }
                        />
                    </BentoCard>
                </div>

                <div className="mt-4 flex flex-wrap gap-3 items-center">
                    <Badge className="opacity-80">
                        Scope: {scopeLabel}
                    </Badge>
                    {totalBars != null && (
                        <Badge className="opacity-70">
                            {totalBars.toLocaleString()} bars
                        </Badge>
                    )}
                </div>
            </div>

            {/* ============================================================ */}
            {/* Charts Grid                                                   */}
            {/* ============================================================ */}
            <BentoGrid cols={3}>
                {/* --- Spread Quantiles Card --- */}
                <BentoCard title="Spread quantiles">
                    <KpiStat
                        label="p50"
                        value={p50 != null ? `${p50.toFixed(3)} p` : "n/a"}
                        tone={p50 != null && p50 < 0.25 ? "success" : "warn"}
                    />
                    <KpiStat
                        label="p90"
                        value={p90 != null ? `${p90.toFixed(3)} p` : "n/a"}
                        tone={p90 != null && p90 < 0.5 ? "success" : "warn"}
                    />
                    <KpiStat
                        label="p95"
                        value={p95 != null ? `${p95.toFixed(3)} p` : "n/a"}
                        tone={
                            p95 != null && p95 < 0.5 ? "success" : "danger"
                        }
                    />
                    <KpiStat
                        label="p99"
                        value={p99 != null ? `${p99.toFixed(3)} p` : "n/a"}
                        tone={
                            p99 != null && p99 < 0.8 ? "warn" : "danger"
                        }
                    />
                </BentoCard>

                {/* --- Volatility Card --- */}
                <BentoCard title="Volatilite">
                    <KpiStat
                        label="Regime actuel"
                        value={volRegime ?? "n/a"}
                        tone={
                            volRegime === "LOW"
                                ? "success"
                                : volRegime === "HIGH"
                                    ? "danger"
                                    : "default"
                        }
                    />
                    <KpiStat
                        label="Mix 24h"
                        value={
                            data?.vol_regime?.last_24h
                                ? Object.entries(data.vol_regime.last_24h)
                                    .map(
                                        ([k, v]) =>
                                            `${k}: ${typeof v === "number" ? v.toFixed(0) : v}%`,
                                    )
                                    .join(" · ")
                                : "n/a"
                        }
                    />
                    {/* Clickable regime pills for linked brushing */}
                    {data?.vol_regime?.last_24h && (
                        <div className="flex flex-wrap gap-2 mt-2">
                            {Object.keys(data.vol_regime.last_24h).map(
                                (r) => (
                                    <button
                                        key={r}
                                        onClick={() =>
                                            handleRegimeClick(r)
                                        }
                                        className="px-2 py-0.5 rounded-full text-[10px] bg-white/10 hover:bg-white/20 text-white/80 transition-colors cursor-pointer"
                                    >
                                        {r}
                                    </button>
                                ),
                            )}
                            <button
                                onClick={() => clearRegime()}
                                className="px-2 py-0.5 rounded-full text-[10px] bg-white/5 hover:bg-white/10 text-white/50 transition-colors cursor-pointer"
                            >
                                clear
                            </button>
                        </div>
                    )}
                </BentoCard>

                {/* --- Freshness Gauge --- */}
                <BentoCard title="Freshness">
                    {freshnessGauge ? (
                        <React.Suspense
                            fallback={<div className="h-[180px]" />}
                        >
                            <Plot
                                data={freshnessGauge.data}
                                layout={freshnessGauge.layout}
                                config={plotConfig}
                                style={{ width: "100%", height: 180 }}
                            />
                        </React.Suspense>
                    ) : (
                        <div className="space-y-2">
                            <KpiStat
                                label="Derniere barre"
                                value={
                                    data?.freshness
                                        ? `${data.freshness.bar_age_seconds.toFixed(1)} s`
                                        : "n/a"
                                }
                                tone={
                                    data?.freshness &&
                                        data.freshness.bar_age_seconds < 30
                                        ? "success"
                                        : "warn"
                                }
                            />
                            <KpiStat
                                label="Statut"
                                value={
                                    data?.freshness?.status ?? "n/a"
                                }
                                tone={
                                    data?.freshness?.status === "FRESH"
                                        ? "success"
                                        : "warn"
                                }
                            />
                        </div>
                    )}
                </BentoCard>

                {/* --- Spread Timeline (linked brushing: drag-select) --- */}
                <BentoCard title="Spread Timeline" span={2}>
                    {spreadChartData ? (
                        <React.Suspense
                            fallback={<div className="h-[220px]" />}
                        >
                            <Plot
                                data={spreadChartData.data}
                                layout={spreadChartData.layout}
                                config={plotConfig}
                                style={{ width: "100%", height: 220 }}
                                onSelected={handleTimelineSelected as never}
                            />
                            <div className="text-[10px] text-white/40 mt-1">
                                Drag to select a time range (linked
                                brushing)
                            </div>
                        </React.Suspense>
                    ) : (
                        <EmptyState title="Pas de donnees spread" />
                    )}
                </BentoCard>

                {/* --- Spread Histogram (from server) --- */}
                <BentoCard title="Spread Distribution">
                    {histogramData ? (
                        <React.Suspense
                            fallback={<div className="h-[200px]" />}
                        >
                            <Plot
                                data={histogramData.data}
                                layout={histogramData.layout}
                                config={plotConfig}
                                style={{ width: "100%", height: 200 }}
                            />
                        </React.Suspense>
                    ) : (
                        <EmptyState title="Pas de donnees histogramme" />
                    )}
                </BentoCard>

                {/* --- Session Breakdown Table (from server) --- */}
                <BentoCard title="Session Breakdown" span={2}>
                    {sessions.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                                <thead>
                                    <tr className="text-neutral-400 border-b border-white/10">
                                        <th className="py-2 px-2 font-medium">
                                            Session
                                        </th>
                                        <th className="py-2 px-2 font-medium text-right">
                                            Bars
                                        </th>
                                        <th className="py-2 px-2 font-medium text-right">
                                            Avg Spread
                                        </th>
                                        <th className="py-2 px-2 font-medium text-right">
                                            p50
                                        </th>
                                        <th className="py-2 px-2 font-medium text-right">
                                            p95
                                        </th>
                                        <th className="py-2 px-2 font-medium">
                                            Dom. Regime
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sessions.map((s) => (
                                        <tr
                                            key={s.session}
                                            className="border-b border-white/5 hover:bg-white/5 transition-colors"
                                        >
                                            <td className="py-2 px-2">
                                                <span
                                                    className="inline-block w-2 h-2 rounded-full mr-2"
                                                    style={{
                                                        backgroundColor:
                                                            SESSION_COLORS[
                                                            s.session
                                                            ] ??
                                                            SESSION_COLORS.UNKNOWN,
                                                    }}
                                                />
                                                <span className="text-white/90">
                                                    {s.session}
                                                </span>
                                            </td>
                                            <td className="py-2 px-2 text-right text-white/80">
                                                {s.count.toLocaleString()}
                                            </td>
                                            <td className="py-2 px-2 text-right text-white/80">
                                                {s.avg_spread.toFixed(3)}p
                                            </td>
                                            <td className="py-2 px-2 text-right text-white/80">
                                                {s.p50_spread.toFixed(3)}p
                                            </td>
                                            <td className="py-2 px-2 text-right text-white/80">
                                                {s.p95_spread.toFixed(3)}p
                                            </td>
                                            <td className="py-2 px-2">
                                                <button
                                                    onClick={() =>
                                                        handleRegimeClick(
                                                            s.dominant_regime,
                                                        )
                                                    }
                                                    className="px-2 py-0.5 rounded-full text-[10px] bg-white/10 hover:bg-white/20 text-white/80 transition-colors cursor-pointer"
                                                >
                                                    {s.dominant_regime}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <EmptyState title="Pas de donnees session" />
                    )}
                </BentoCard>
            </BentoGrid>
        </div>
    );
}
