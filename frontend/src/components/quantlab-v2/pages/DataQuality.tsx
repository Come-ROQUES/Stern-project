/**
 * Data Quality — Quant Lab V2
 * Score, KPI fraîcheur/completude, alertes, heatmaps missing/spikes.
 */

import React, { useEffect, useState } from "react";
import { RefreshCw, AlertTriangle, WifiOff } from "lucide-react";
import { useQuantLabScope } from "../../../lib/SelectionContext";
import {
    DataQualityAnomalies,
    DataQualityHealth,
    DataQualityMatrix,
    getDataQualityAnomalies,
    getDataQualityHealth,
    getDataQualityMatrix,
} from "../../../lib/quantApi";
import { Badge, BentoCard, BentoGrid, EmptyState, KpiStat, StatusBadge } from "../ui";

export function DataQualityPage() {
    const { scope, effectiveRunId, scopeLabel } = useQuantLabScope();

    const [health, setHealth] = useState<DataQualityHealth | null>(null);
    const [anoms, setAnoms] = useState<DataQualityAnomalies | null>(null);
    const [matrix, setMatrix] = useState<DataQualityMatrix | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadAll = async () => {
        setLoading(true);
        setError(null);
        try {
            const [h, a, m] = await Promise.all([
                getDataQualityHealth(effectiveRunId ?? undefined, scope),
                getDataQualityAnomalies(),
                getDataQualityMatrix(),
            ]);
            setHealth(h);
            setAnoms(a);
            setMatrix(m);
        } catch (e: any) {
            setError(e?.message || "Impossible de charger la qualité des données");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effectiveRunId, scope]);

    const stateTone =
        health?.state === "FRESH"
            ? "success"
            : health?.state === "DEGRADED"
                ? "warn"
                : "danger";

    const formatAge = (s: number | null | undefined) => {
        if (s == null) return "n/a";
        if (s < 60) return `${s.toFixed(1)}s`;
        const m = s / 60;
        return `${m.toFixed(1)}m`;
    };

    return (
        <div className="p-4 space-y-4">
            <div className="rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(9,14,26,0.92),rgba(6,9,18,0.9))] px-4 py-3 shadow-[0_24px_120px_rgba(0,0,0,0.55)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="text-[11px] uppercase tracking-[0.24em] text-neutral-400">
                            Data Quality · {scopeLabel}
                        </div>
                        <div className="text-2xl font-semibold text-white mt-1">
                            Score {health ? health.score.toFixed(1) : "--"}/100
                        </div>
                        <div className="text-sm text-neutral-400">
                            Fraîcheur, complétude, spikes & cohérence
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {health?.state && (
                            <StatusBadge
                                status={
                                    health.state.toLowerCase() as "fresh" | "stale" | "offline"
                                }
                            />
                        )}
                        <Badge className="bg-slate-700/60">run: {effectiveRunId ?? "n/a"}</Badge>
                        <button
                            onClick={loadAll}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-sm transition-colors"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                            Refresh
                        </button>
                    </div>
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                    <BentoCard padding="sm">
                        <KpiStat label="Tick age" value={formatAge(health?.tick_age_s)} tone={stateTone} />
                    </BentoCard>
                    <BentoCard padding="sm">
                        <KpiStat label="Bar age" value={formatAge(health?.bar_age_s)} tone={stateTone} />
                    </BentoCard>
                    <BentoCard padding="sm">
                        <KpiStat
                            label="Coverage"
                            value={health ? `${health.coverage_pct.toFixed(1)}%` : "n/a"}
                            tone={health && health.coverage_pct > 90 ? "success" : "warn"}
                        />
                    </BentoCard>
                    <BentoCard padding="sm">
                        <KpiStat
                            label="Spread spikes"
                            value={health ? `${health.spread_spike_pct.toFixed(1)}%` : "n/a"}
                            tone={health && health.spread_spike_pct < 5 ? "success" : "danger"}
                        />
                    </BentoCard>
                    <BentoCard padding="sm">
                        <KpiStat
                            label="Quotes invalides"
                            value={health ? `${health.invalid_quote_pct.toFixed(1)}%` : "n/a"}
                            tone={health && health.invalid_quote_pct < 2 ? "success" : "warn"}
                        />
                    </BentoCard>
                    <BentoCard padding="sm">
                        <KpiStat
                            label="DB p95 (ms)"
                            value={health?.db_latency_ms_p95 != null ? health.db_latency_ms_p95.toFixed(0) : "n/a"}
                        />
                    </BentoCard>
                </div>
            </div>

            <BentoGrid cols={2}>
                <BentoCard title="Alertes récentes" span={1}>
                    {anoms?.anomalies?.length ? (
                        <div className="space-y-2 max-h-[260px] overflow-auto pr-1">
                            {anoms.anomalies.map((a, idx) => (
                                <div
                                    key={`${a.ts}-${idx}`}
                                    className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm text-neutral-100"
                                >
                                    {a.severity === "danger" ? (
                                        <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5" />
                                    ) : a.severity === "warn" ? (
                                        <AlertTriangle className="w-4 h-4 text-amber-300 mt-0.5" />
                                    ) : (
                                        <WifiOff className="w-4 h-4 text-slate-300 mt-0.5" />
                                    )}
                                    <div>
                                        <div className="text-xs text-neutral-400">{a.ts}</div>
                                        <div className="text-sm">{a.message}</div>
                                        <div className="text-[11px] text-neutral-500 uppercase tracking-wide">
                                            {a.type}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : loading ? (
                        <div className="h-[200px] rounded-lg bg-white/5 animate-pulse" />
                    ) : (
                        <EmptyState title="Aucune alerte" />
                    )}
                </BentoCard>

                <BentoCard title="Heatmap spikes/missing" span={1}>
                    {matrix?.png_base64 ? (
                        <img
                            src={`data:image/png;base64,${matrix.png_base64}`}
                            alt="Heatmap spikes"
                            className="w-full rounded-xl border border-white/10 shadow-[0_16px_80px_rgba(0,0,0,0.45)]"
                            style={{ maxHeight: 280, objectFit: "contain" }}
                        />
                    ) : loading ? (
                        <div className="h-[240px] rounded-xl bg-white/5 animate-pulse" />
                    ) : (
                        <EmptyState title="Heatmap indisponible" />
                    )}
                </BentoCard>
            </BentoGrid>

            {error && (
                <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-rose-100 text-sm">
                    {error}
                </div>
            )}
        </div>
    );
}
