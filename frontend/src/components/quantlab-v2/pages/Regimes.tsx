import React, { useEffect, useMemo, useRef, useState } from "react";
import { Grid, RefreshCw } from "lucide-react";

import { usePortfolioEpoch } from "../../../lib/usePortfolioEpoch";
import { useQuantLabScope } from "../../../lib/SelectionContext";
import {
    getQuantRegimesDashboard,
    RegimesDashboardHeatmap,
    RegimesDashboardResponse,
} from "../../../lib/quantApi";
import {
    Badge,
    BentoCard,
    BentoGrid,
    Button,
    EmptyState,
    KpiRow,
    KpiStat,
} from "../ui";

const Plot = React.lazy(() => import("../../../lib/PlotlyBasic"));

type HeatmapKey =
    | "expectancy"
    | "risk_tail"
    | "execution_erosion"
    | "funnel_conversion"
    | "stability_confidence";

const HEATMAP_META: Array<{
    key: HeatmapKey;
    title: string;
    subtitle: string;
}> = [
    {
        key: "expectancy",
        title: "Expectancy Map",
        subtitle: "Session x Vol regime · mean pnl net",
    },
    {
        key: "risk_tail",
        title: "Risk / Tail Map",
        subtitle: "Spread x Vol regime · CVaR 5%",
    },
    {
        key: "execution_erosion",
        title: "Execution Erosion Map",
        subtitle: "Session x Spread regime · edge net - edge gross",
    },
    {
        key: "funnel_conversion",
        title: "Funnel Conversion Map",
        subtitle: "Session x Vol regime · accept/trade rates",
    },
    {
        key: "stability_confidence",
        title: "Stability / Confidence Map",
        subtitle: "Session x Vol regime · confidence score",
    },
];

function matrixHasData(matrix: Array<Array<number | null>>): boolean {
    return matrix.some((row) => row.some((value) => value !== null));
}

const MAGMA_COLORSCALE: Array<[number, string]> = [
    [0, "#000004"],
    [0.25, "#3b0f70"],
    [0.5, "#8c2981"],
    [0.75, "#de4968"],
    [1, "#fcfdbf"],
];

type PlotModel = {
    data: Array<Record<string, unknown>>;
    layout: Record<string, unknown>;
    config: Record<string, unknown>;
};

export function buildHeatmapPlotModel(
    heatmap: RegimesDashboardHeatmap
): PlotModel | null {
    if (!matrixHasData(heatmap.matrix)) {
        return null;
    }

    const secondaryMetric = heatmap.secondary_metric ?? null;
    const z = heatmap.matrix.map((row) => row.map((value) => value));
    const text = heatmap.matrix.map((row, yIdx) =>
        row.map((value, xIdx) => {
            const count = heatmap.counts[yIdx]?.[xIdx] ?? 0;
            const confidence = heatmap.confidence[yIdx]?.[xIdx] ?? "LOW";
            const score = heatmap.confidence_scores[yIdx]?.[xIdx] ?? 0;
            if (value === null) {
                return `ND · n=${count} · conf=${confidence} (${score.toFixed(2)})`;
            }
            return `${value.toFixed(2)} · n=${count} · conf=${confidence} (${score.toFixed(2)})`;
        })
    );
    const customdata = heatmap.matrix.map((row, yIdx) =>
        row.map((_, xIdx) => {
            const secondary = heatmap.secondary_matrix?.[yIdx]?.[xIdx] ?? null;
            const count = heatmap.counts[yIdx]?.[xIdx] ?? 0;
            const confidence = heatmap.confidence[yIdx]?.[xIdx] ?? "LOW";
            const score = heatmap.confidence_scores[yIdx]?.[xIdx] ?? 0;
            return [secondary, count, confidence, score];
        })
    );

    const hovertemplate = secondaryMetric
        ? "<b>%{y}</b> x <b>%{x}</b><br>"
            + `${heatmap.metric}: %{z:.2f}<br>`
            + `${secondaryMetric}: %{customdata[0]:.2f}<br>`
            + "count: %{customdata[1]}<br>"
            + "confidence: %{customdata[2]} (%{customdata[3]:.2f})<extra></extra>"
        : "<b>%{y}</b> x <b>%{x}</b><br>"
            + `${heatmap.metric}: %{z:.2f}<br>`
            + "count: %{customdata[1]}<br>"
            + "confidence: %{customdata[2]} (%{customdata[3]:.2f})<extra></extra>";

    return {
        data: [
            {
                type: "heatmap",
                x: heatmap.x_labels,
                y: heatmap.y_labels,
                z,
                text,
                texttemplate: "%{text}",
                textfont: { size: 10, color: "#dbe3f4" },
                customdata,
                colorscale: MAGMA_COLORSCALE,
                hoverongaps: false,
                hovertemplate,
                colorbar: {
                    title: { text: heatmap.metric, font: { size: 10, color: "#9aa6bd" } },
                    tickfont: { size: 9, color: "#9aa6bd" },
                    thickness: 14,
                    len: 0.78,
                },
            },
        ],
        layout: {
            height: 260,
            margin: { l: 74, r: 72, t: 10, b: 44 },
            paper_bgcolor: "transparent",
            plot_bgcolor: "transparent",
            xaxis: {
                title: { text: "X axis", font: { size: 10, color: "#9aa6bd" } },
                tickfont: { size: 10, color: "#9aa6bd" },
                automargin: true,
            },
            yaxis: {
                title: { text: "Y axis", font: { size: 10, color: "#9aa6bd" } },
                tickfont: { size: 10, color: "#9aa6bd" },
                automargin: true,
            },
        },
        config: {
            displayModeBar: false,
            responsive: true,
            scrollZoom: true,
        },
    };
}

function HeatmapInteractive({ heatmap }: { heatmap: RegimesDashboardHeatmap }) {
    const plot = useMemo(() => buildHeatmapPlotModel(heatmap), [heatmap]);
    if (!plot) {
        return (
            <EmptyState
                title="No data"
                description="Aucune cellule exploitable sur ce scope."
            />
        );
    }
    return (
        <React.Suspense fallback={<div className="h-[260px]" />}>
            <Plot
                data={plot.data}
                layout={plot.layout}
                config={plot.config}
                style={{ width: "100%", height: 260 }}
            />
        </React.Suspense>
    );
}

export function Regimes() {
    const quantScope = useQuantLabScope();
    const { scope, runId, strategyId, scopeLabel, missingRunId } = quantScope;
    const { epoch: portfolioEpoch } = usePortfolioEpoch();

    const [data, setData] = useState<RegimesDashboardResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const requestSeq = useRef(0);

    const loadData = async () => {
        const requestId = ++requestSeq.current;
        if (missingRunId) {
            setData(null);
            setError("Selectionne un run pour le scope RUN.");
            return;
        }

        setLoading(true);
        setError(null);
        const [result] = await Promise.allSettled([
            getQuantRegimesDashboard({
                scope,
                runId,
                strategyId: strategyId ?? undefined,
                portfolioEpoch: portfolioEpoch ?? undefined,
            }),
        ]);
        if (requestId !== requestSeq.current) return;
        if (result.status === "fulfilled") {
            setData(result.value);
        } else {
            setData(null);
            setError(
                result.reason instanceof Error
                    ? result.reason.message
                    : "Regimes indisponible"
            );
        }
        setLoading(false);
    };

    useEffect(() => {
        loadData();
    }, [scope, runId, strategyId, portfolioEpoch, missingRunId]);

    const warnings = useMemo(
        () =>
            data
                ? [
                    ...(data.meta.warnings ?? []),
                    ...Object.values(data.heatmaps).flatMap((h) => h.warnings ?? []),
                ]
                : [],
        [data]
    );

    return (
        <div className="p-4 space-y-4">
            <div className="rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(9,14,26,0.92),rgba(6,9,18,0.9))] px-4 py-3 shadow-[0_24px_120px_rgba(0,0,0,0.55)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="text-[11px] uppercase tracking-[0.24em] text-neutral-400">
                            Regimes V2 · {scopeLabel} · Portfolio Epoch{" "}
                            {portfolioEpoch ?? "n/a"}
                        </div>
                        <div className="mt-1 text-2xl font-semibold text-white">
                            Poste d&apos;analyse regime
                        </div>
                        <div className="text-sm text-neutral-400">
                            Heatmaps interactives Plotly magma (run-aware strict)
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
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
                        <Button
                            variant="primary"
                            onClick={loadData}
                            icon={<RefreshCw className="h-4 w-4" />}
                        >
                            Refresh
                        </Button>
                    </div>
                </div>
                <KpiRow className="mt-4">
                    <KpiStat
                        label="Signals"
                        value={data?.kpis.signals_total ?? "--"}
                        hint="population totale"
                    />
                    <KpiStat
                        label="Accepted"
                        value={data?.kpis.accepted_total ?? "--"}
                        hint="signaux acceptes"
                    />
                    <KpiStat
                        label="Traded"
                        value={data?.kpis.traded_total ?? "--"}
                        hint="executions detectees"
                    />
                    <KpiStat
                        label="Coverage"
                        value={
                            data ? `${(data.kpis.coverage_ratio * 100).toFixed(1)}%` : "--"
                        }
                        hint="pnl samples / signals"
                    />
                </KpiRow>
                {warnings.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                        {warnings.map((warning) => (
                            <Badge key={warning} variant="warn">
                                {warning}
                            </Badge>
                        ))}
                    </div>
                )}
                {error && (
                    <div className="mt-3">
                        <Badge variant="danger">{error}</Badge>
                    </div>
                )}
            </div>

            <BentoGrid cols={2}>
                {HEATMAP_META.map((item) => {
                    const heatmap = data?.heatmaps[item.key];
                    return (
                        <BentoCard
                            key={item.key}
                            title={item.title}
                            subtitle={item.subtitle}
                            span={item.key === "stability_confidence" ? "full" : 1}
                        >
                            {loading || !heatmap ? (
                                <EmptyState
                                    title={loading ? "Loading..." : "No data"}
                                    description="Chargement en cours."
                                    icon={<Grid className="h-5 w-5" />}
                                />
                            ) : (
                                <HeatmapInteractive heatmap={heatmap} />
                            )}
                        </BentoCard>
                    );
                })}
            </BentoGrid>
        </div>
    );
}
