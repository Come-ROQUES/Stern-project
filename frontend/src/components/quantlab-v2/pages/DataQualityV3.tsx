/**
 * Data Quality V3 - Quant Lab
 * Poste de controle pour coherence, remplissage et readiness ML des DB.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { usePortfolioEpoch } from "../../../lib/usePortfolioEpoch";
import { useQuantLabScope } from "../../../lib/SelectionContext";
import { strategyLabel } from "../../../lib/strategies";
import {
    DataQualitySummaryResponse,
    getQuantDataQualitySummary,
} from "../../../lib/quantApi";
import { Badge, BentoCard, BentoGrid, EmptyState, KpiStat } from "../ui";

const STATUS_TONE: Record<string, "success" | "warn" | "danger"> = {
    OK: "success",
    WARNING: "warn",
    CRITICAL: "danger",
    READY: "success",
    READY_WITH_EXCLUSIONS: "warn",
    NOT_READY: "danger",
};

function statusClass(status: string): string {
    if (status === "OK" || status === "READY") return "text-emerald-400";
    if (status === "WARNING" || status === "READY_WITH_EXCLUSIONS") {
        return "text-amber-300";
    }
    return "text-rose-300";
}

function pct(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
}

function compact(value: number): string {
    return Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(
        value
    );
}

function formatBytes(value: number): string {
    if (value <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let size = value;
    let idx = 0;
    while (size >= 1024 && idx < units.length - 1) {
        size /= 1024;
        idx += 1;
    }
    return `${size.toFixed(size >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function shortRunId(value: string | null | undefined): string {
    if (!value) return "n/a";
    return value.length > 18 ? `${value.slice(0, 18)}...` : value;
}

function resolveDataQualityScope(params: {
    scope: string;
    runId: string | undefined;
    strategyId: string | null;
    missingRunId: boolean;
}): {
    scope: "TODAY" | "YESTERDAY" | "7D" | "EPOCH" | "RUN" | "BACKTEST";
    runId: string | undefined;
    strategyId: string | null;
    scopeNotice: string | null;
} {
    const { scope, runId, strategyId, missingRunId } = params;
    if (missingRunId && (scope === "RUN" || scope === "BACKTEST")) {
        return {
            scope: "TODAY",
            runId: undefined,
            strategyId: strategyId ?? null,
            scopeNotice:
                "Scope global invalide pour Data Quality: fallback local sur Aujourd'hui tant qu'aucun run n'est resolu.",
        };
    }
    return {
        scope: scope as "TODAY" | "YESTERDAY" | "7D" | "EPOCH" | "RUN" | "BACKTEST",
        runId,
        strategyId,
        scopeNotice: null,
    };
}

export function DataQualityV3() {
    const { epoch: portfolioEpoch } = usePortfolioEpoch();
    const { scope, runId, strategyId, scopeLabel, missingRunId } = useQuantLabScope();
    const summaryRequestSeq = useRef(0);
    const drilldownRequestSeq = useRef(0);

    const [summary, setSummary] = useState<DataQualitySummaryResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [drilldownLoading, setDrilldownLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [drilldownError, setDrilldownError] = useState<string | null>(null);
    const [dbFilter, setDbFilter] = useState<string>("ALL");
    const [severityFilter, setSeverityFilter] = useState<string>("ALL");
    const [drillRunId, setDrillRunId] = useState<string>("ALL");
    const [drillStrategyId, setDrillStrategyId] = useState<string>("ALL");

    const normalizedScope = useMemo(
        () =>
            resolveDataQualityScope({
                scope,
                runId,
                strategyId,
                missingRunId,
            }),
        [scope, runId, strategyId, missingRunId]
    );
    const displayScopeLabel = normalizedScope.scopeNotice
        ? "Aujourd'hui (fallback local)"
        : scopeLabel;
    const effectiveScope = drillRunId !== "ALL" ? "RUN" : normalizedScope.scope;
    const effectiveRunId = drillRunId !== "ALL" ? drillRunId : normalizedScope.runId;
    const effectiveStrategyId =
        drillStrategyId !== "ALL" ? drillStrategyId : normalizedScope.strategyId;

    const buildSummaryRequest = useCallback(
        (includeDrilldown: boolean) => ({
            scope: effectiveScope,
            runId: effectiveRunId,
            strategyId: effectiveStrategyId,
            portfolioEpoch,
            limit: 20,
            include_drilldown: includeDrilldown,
        }),
        [effectiveRunId, effectiveScope, effectiveStrategyId, portfolioEpoch]
    );

    const loadDrilldown = useCallback(async () => {
        const requestId = ++drilldownRequestSeq.current;
        if (effectiveScope === "RUN" && !effectiveRunId) {
            setDrilldownLoading(false);
            return;
        }
        setDrilldownLoading(true);
        setDrilldownError(null);
        try {
            const result = await getQuantDataQualitySummary(buildSummaryRequest(true));
            if (requestId !== drilldownRequestSeq.current) return;
            setSummary((current) => {
                if (!current) return result;
                return {
                    ...current,
                    drilldown: result.drilldown,
                };
            });
        } catch (e: any) {
            if (requestId !== drilldownRequestSeq.current) return;
            setDrilldownError(e?.message || "Impossible de charger le drill-down");
        } finally {
            if (requestId !== drilldownRequestSeq.current) return;
            setDrilldownLoading(false);
        }
    }, [buildSummaryRequest, effectiveRunId, effectiveScope]);

    const loadSummary = useCallback(async () => {
        const requestId = ++summaryRequestSeq.current;
        drilldownRequestSeq.current += 1;
        if (effectiveScope === "RUN" && !effectiveRunId) {
            setSummary(null);
            setError("Selectionne un run pour utiliser le scope RUN.");
            setLoading(false);
            setDrilldownLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        setDrilldownError(null);
        setDrilldownLoading(false);
        try {
            const result = await getQuantDataQualitySummary(buildSummaryRequest(false));
            if (requestId !== summaryRequestSeq.current) return;
            setSummary(result);
            if (typeof window !== "undefined") {
                window.setTimeout(() => {
                    void loadDrilldown();
                }, 0);
            } else {
                void loadDrilldown();
            }
        } catch (e: any) {
            if (requestId !== summaryRequestSeq.current) return;
            setError(e?.message || "Impossible de charger le monitoring Data Integrity");
        } finally {
            if (requestId !== summaryRequestSeq.current) return;
            setLoading(false);
        }
    }, [buildSummaryRequest, effectiveRunId, effectiveScope, loadDrilldown]);

    useEffect(() => {
        setDrilldownLoading(false);
        void loadSummary();
    }, [loadSummary, missingRunId]);

    useEffect(() => {
        setDrillRunId("ALL");
        setDrillStrategyId("ALL");
    }, [scope, runId, strategyId]);

    const filteredTables = useMemo(() => {
        if (!summary) return [];
        return summary.table_completeness.tables.filter((table) => {
            if (dbFilter !== "ALL" && table.db_id !== dbFilter) return false;
            if (severityFilter !== "ALL" && table.status !== severityFilter) return false;
            return true;
        });
    }, [dbFilter, severityFilter, summary]);

    const filteredIssues = useMemo(() => {
        if (!summary) return [];
        return summary.logging_quality.issues.filter((issue) => {
            if (dbFilter !== "ALL" && issue.db_id !== dbFilter) return false;
            if (severityFilter !== "ALL" && issue.status !== severityFilter) return false;
            return true;
        });
    }, [dbFilter, severityFilter, summary]);

    const filteredActions = useMemo(() => {
        if (!summary) return [];
        return summary.action_queue.filter((item) => {
            if (severityFilter !== "ALL" && item.severity !== severityFilter) return false;
            return true;
        });
    }, [severityFilter, summary]);

    const dbOptions = useMemo(
        () => ["ALL", ...(summary ? Object.keys(summary.db_statuses) : [])],
        [summary]
    );

    const runDrillOptions = useMemo(
        () =>
            summary?.drilldown?.runs
                .map((item) => item.run_id)
                .filter((value): value is string => Boolean(value)) ?? [],
        [summary]
    );

    const strategyDrillOptions = useMemo(
        () =>
            summary?.drilldown?.strategies
                .map((item) => item.strategy_id)
                .filter((value): value is string => Boolean(value)) ?? [],
        [summary]
    );

    const selectedRunSlice = useMemo(() => {
        if (drillRunId === "ALL") return null;
        return summary?.drilldown?.runs.find((item) => item.run_id === drillRunId) ?? null;
    }, [drillRunId, summary]);

    const selectedStrategySlice = useMemo(() => {
        if (drillStrategyId === "ALL") return null;
        return (
            summary?.drilldown?.strategies.find(
                (item) => item.strategy_id === drillStrategyId
            ) ?? null
        );
    }, [drillStrategyId, summary]);

    return (
        <div className="p-4 space-y-4">
            <div className="rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(9,14,26,0.92),rgba(6,9,18,0.9))] px-4 py-3 shadow-[0_24px_120px_rgba(0,0,0,0.55)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="text-[11px] uppercase tracking-[0.24em] text-neutral-400">
                            Data Integrity · {displayScopeLabel} · Portfolio Epoch {portfolioEpoch ?? "n/a"}
                        </div>
                        <div className="mt-1 text-2xl font-semibold text-white">
                            Score {summary?.overview.overall_score ?? "--"}/100
                        </div>
                        <div className="text-sm text-neutral-400">
                            Cohérence DB, remplissage, readiness ML et file d'actions.
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {summary && (
                            <Badge className={
                                summary.overview.state === "OK"
                                    ? "bg-emerald-700/50"
                                    : summary.overview.state === "WARNING"
                                        ? "bg-amber-700/50"
                                        : "bg-rose-700/50"
                            }>
                                {summary.overview.state}
                            </Badge>
                        )}
                        {summary && (
                            <Badge className={
                                summary.ml_readiness.verdict === "READY"
                                    ? "bg-emerald-700/50"
                                    : summary.ml_readiness.verdict === "READY_WITH_EXCLUSIONS"
                                        ? "bg-amber-700/50"
                                        : "bg-rose-700/50"
                            }>
                                ML {summary.ml_readiness.verdict}
                            </Badge>
                        )}
                        <button
                            onClick={loadSummary}
                            className="flex items-center gap-2 rounded-lg bg-neutral-800 px-3 py-1.5 text-sm text-neutral-200 transition-colors hover:bg-neutral-700"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                            Refresh
                        </button>
                        {drilldownLoading && (
                            <span className="text-xs text-neutral-500">Drill-down en chargement...</span>
                        )}
                    </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
                    <BentoCard padding="sm">
                        <KpiStat
                            label="DB Health"
                            value={summary ? `${summary.overview.overall_score}/100` : "--"}
                            tone={summary ? STATUS_TONE[summary.overview.state] : undefined}
                        />
                    </BentoCard>
                    <BentoCard padding="sm">
                        <KpiStat
                            label="Logging Score"
                            value={summary ? `${summary.overview.logging_score}/100` : "--"}
                            tone={summary ? STATUS_TONE[summary.overview.state] : undefined}
                        />
                    </BentoCard>
                    <BentoCard padding="sm">
                        <KpiStat
                            label="DB Critical"
                            value={summary?.overview.dbs_critical ?? 0}
                            tone={summary && summary.overview.dbs_critical > 0 ? "danger" : "success"}
                        />
                    </BentoCard>
                    <BentoCard padding="sm">
                        <KpiStat
                            label="Link Mismatch"
                            value={summary?.overview.link_mismatches ?? 0}
                            tone={summary && summary.overview.link_mismatches > 0 ? "danger" : "success"}
                        />
                    </BentoCard>
                    <BentoCard padding="sm">
                        <KpiStat
                            label="ML Exclusions"
                            value={summary?.ml_readiness.exclusion_count ?? 0}
                            tone={summary && summary.ml_readiness.exclusion_count > 0 ? "warn" : "success"}
                        />
                    </BentoCard>
                    <BentoCard padding="sm">
                        <KpiStat
                            label="Critical Actions"
                            value={summary?.overview.critical_actions ?? 0}
                            tone={summary && summary.overview.critical_actions > 0 ? "danger" : "success"}
                        />
                    </BentoCard>
                </div>
            </div>

            {normalizedScope.scopeNotice && (
                <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    {normalizedScope.scopeNotice}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm">
                <span className="text-neutral-400">Filtres</span>
                <select
                    value={dbFilter}
                    onChange={(e) => setDbFilter(e.target.value)}
                    className="rounded-lg border border-white/10 bg-neutral-900 px-3 py-1.5 text-neutral-200"
                >
                    {dbOptions.map((dbId) => (
                        <option key={dbId} value={dbId}>
                            {dbId}
                        </option>
                    ))}
                </select>
                <select
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                    className="rounded-lg border border-white/10 bg-neutral-900 px-3 py-1.5 text-neutral-200"
                >
                    <option value="ALL">All severities</option>
                    <option value="CRITICAL">Critical</option>
                    <option value="WARNING">Warning</option>
                    <option value="OK">OK</option>
                </select>
                {summary?.meta?.run_ids_resolved_count != null && (
                    <span className="ml-auto text-xs text-neutral-400">
                        {String(summary.meta.run_ids_resolved_count)} runs resolves
                    </span>
                )}
            </div>

            <BentoCard title="Drill-down Slice">
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-neutral-400">Vue ciblee</span>
                        <select
                            value={drillRunId}
                            onChange={(e) => setDrillRunId(e.target.value)}
                            className="rounded-lg border border-white/10 bg-neutral-900 px-3 py-1.5 text-neutral-200"
                        >
                            <option value="ALL">Tous les runs du scope</option>
                            {runDrillOptions.map((value) => (
                                <option key={value} value={value}>
                                    {shortRunId(value)}
                                </option>
                            ))}
                        </select>
                        <select
                            value={drillStrategyId}
                            onChange={(e) => setDrillStrategyId(e.target.value)}
                            className="rounded-lg border border-white/10 bg-neutral-900 px-3 py-1.5 text-neutral-200"
                        >
                            <option value="ALL">Toutes les strategies</option>
                            {strategyDrillOptions.map((value) => (
                                <option key={value} value={value}>
                                    {strategyLabel(value)}
                                </option>
                            ))}
                        </select>
                        {(drillRunId !== "ALL" || drillStrategyId !== "ALL") && (
                            <button
                                onClick={() => {
                                    setDrillRunId("ALL");
                                    setDrillStrategyId("ALL");
                                }}
                                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/10"
                            >
                                Reset slice
                            </button>
                        )}
                        <span className="ml-auto text-xs text-neutral-500">
                            {effectiveScope} · run {shortRunId(effectiveRunId)} ·{" "}
                            {effectiveStrategyId ? strategyLabel(effectiveStrategyId) : "Toutes"}
                        </span>
                    </div>

                    {!summary?.drilldown && (
                        <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3 text-sm text-neutral-400">
                            {drilldownLoading
                                ? "Construction du drill-down en arriere-plan..."
                                : drilldownError
                                    ? drilldownError
                                    : "Drill-down non charge."}
                            {!drilldownLoading && (
                                <button
                                    onClick={() => void loadDrilldown()}
                                    className="ml-3 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-neutral-200 hover:bg-white/10"
                                >
                                    Recharger le drill-down
                                </button>
                            )}
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                        <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                            <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                                Slice run
                            </div>
                            {selectedRunSlice ? (
                                <div className="mt-2 space-y-2 text-sm text-neutral-300">
                                    <div className="font-mono text-white">
                                        {selectedRunSlice.run_id}
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span>Score</span>
                                        <span className={statusClass(selectedRunSlice.state)}>
                                            {selectedRunSlice.overall_score}/100
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span>Mismatch traded</span>
                                        <span>{selectedRunSlice.link_mismatches}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span>Accepted sans trade</span>
                                        <span>{selectedRunSlice.accepted_without_trade}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-2 text-sm text-neutral-500">
                                    Aucun run cible. Selectionne un `run_id` pour isoler la coupe.
                                </div>
                            )}
                        </div>

                        <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                            <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                                Slice strategie
                            </div>
                            {selectedStrategySlice ? (
                                <div className="mt-2 space-y-2 text-sm text-neutral-300">
                                    <div className="text-white">
                                        {strategyLabel(selectedStrategySlice.strategy_id)}
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span>Verdict ML</span>
                                        <span className={statusClass(selectedStrategySlice.ml_verdict)}>
                                            {selectedStrategySlice.ml_verdict}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span>DB critiques</span>
                                        <span>{selectedStrategySlice.dbs_critical}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span>Actions</span>
                                        <span>{selectedStrategySlice.action_count}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-2 text-sm text-neutral-500">
                                    Aucune strategie ciblee. La vue reste agregee sur le scope courant.
                                </div>
                            )}
                        </div>

                        <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                            <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                                Scope resolu
                            </div>
                            <div className="mt-2 space-y-2 text-sm text-neutral-300">
                                <div className="flex items-center justify-between">
                                    <span>Scope label</span>
                                    <span>{displayScopeLabel}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>Runs visibles</span>
                                    <span>{runDrillOptions.length}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>Strategies visibles</span>
                                    <span>{strategyDrillOptions.length}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                        <div className="overflow-auto rounded-2xl border border-white/8 bg-white/5">
                            <table className="w-full text-sm">
                                <thead className="border-b border-white/10 text-left text-neutral-500">
                                    <tr>
                                        <th className="px-3 py-2">Run</th>
                                        <th className="px-3 py-2 text-right">Score</th>
                                        <th className="px-3 py-2 text-right">Mismatch</th>
                                        <th className="px-3 py-2 text-right">Accepted no trade</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {summary?.drilldown?.runs.map((item) => (
                                        <tr
                                            key={item.run_id ?? "run-null"}
                                            className={`border-t border-white/5 text-neutral-300 ${
                                                drillRunId === item.run_id ? "bg-blue-500/10" : ""
                                            }`}
                                        >
                                            <td className="px-3 py-2">
                                                <button
                                                    onClick={() =>
                                                        setDrillRunId((current) =>
                                                            current === item.run_id ? "ALL" : item.run_id ?? "ALL"
                                                        )
                                                    }
                                                    className="font-mono text-left text-xs text-white hover:text-blue-300"
                                                >
                                                    {shortRunId(item.run_id)}
                                                </button>
                                            </td>
                                            <td className={`px-3 py-2 text-right ${statusClass(item.state)}`}>
                                                {item.overall_score}
                                            </td>
                                            <td className="px-3 py-2 text-right">{item.link_mismatches}</td>
                                            <td className="px-3 py-2 text-right">
                                                {item.accepted_without_trade}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="overflow-auto rounded-2xl border border-white/8 bg-white/5">
                            <table className="w-full text-sm">
                                <thead className="border-b border-white/10 text-left text-neutral-500">
                                    <tr>
                                        <th className="px-3 py-2">Strategie</th>
                                        <th className="px-3 py-2 text-right">Score</th>
                                        <th className="px-3 py-2 text-right">DB crit.</th>
                                        <th className="px-3 py-2 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {summary?.drilldown?.strategies.map((item) => (
                                        <tr
                                            key={item.strategy_id ?? "strategy-null"}
                                            className={`border-t border-white/5 text-neutral-300 ${
                                                drillStrategyId === item.strategy_id ? "bg-emerald-500/10" : ""
                                            }`}
                                        >
                                            <td className="px-3 py-2">
                                                <button
                                                    onClick={() =>
                                                        setDrillStrategyId((current) =>
                                                            current === item.strategy_id
                                                                ? "ALL"
                                                                : item.strategy_id ?? "ALL"
                                                        )
                                                    }
                                                    className="text-left text-white hover:text-emerald-300"
                                                >
                                                    {strategyLabel(item.strategy_id)}
                                                </button>
                                            </td>
                                            <td className={`px-3 py-2 text-right ${statusClass(item.state)}`}>
                                                {item.overall_score}
                                            </td>
                                            <td className="px-3 py-2 text-right">{item.dbs_critical}</td>
                                            <td className="px-3 py-2 text-right">{item.action_count}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </BentoCard>

            <BentoGrid cols={3}>
                <BentoCard title="Integrity Overview" span={1}>
                    {summary ? (
                        <div className="space-y-3 text-sm text-neutral-300">
                            {Object.values(summary.db_statuses).map((db) => (
                                <div
                                    key={db.db_id}
                                    className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div>
                                            <div className="font-medium text-white">{db.db_id}</div>
                                            <div className="text-xs text-neutral-500">{db.filename}</div>
                                        </div>
                                        <div className={`text-xs font-semibold ${statusClass(db.status)}`}>
                                            {db.status}
                                        </div>
                                    </div>
                                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-neutral-400">
                                        <div>Rows: <span className="text-neutral-200">{compact(db.row_count)}</span></div>
                                        <div>Size: <span className="text-neutral-200">{formatBytes(db.size_bytes)}</span></div>
                                        <div>Table: <span className="text-neutral-200">{db.selected_table ?? "n/a"}</span></div>
                                    </div>
                                    {(db.missing_critical_columns.length > 0 || db.missing_indexes.length > 0) && (
                                        <div className="mt-2 text-xs text-amber-200">
                                            {db.missing_critical_columns.length > 0 && (
                                                <div>Cols manquantes: {db.missing_critical_columns.join(", ")}</div>
                                            )}
                                            {db.missing_indexes.length > 0 && (
                                                <div>Indexes manquants: {db.missing_indexes.join(", ")}</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : loading ? (
                        <div className="h-[220px] animate-pulse rounded-lg bg-white/5" />
                    ) : (
                        <EmptyState title="Aucune synthese" />
                    )}
                </BentoCard>

                <BentoCard title="Linkage Health" span={1}>
                    {summary ? (
                        <div className="space-y-3">
                            {Object.entries(summary.linkage_health.metrics).map(([key, metric]) => (
                                <div key={key} className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="text-sm font-medium text-white">{key}</div>
                                        <div className={`text-sm font-semibold ${statusClass(metric.count > 0 ? metric.severity : "OK")}`}>
                                            {metric.count}
                                        </div>
                                    </div>
                                    {metric.sample_ids.length > 0 && (
                                        <div className="mt-2 text-xs text-neutral-400">
                                            Sample: {metric.sample_ids.slice(0, 3).join(", ")}
                                        </div>
                                    )}
                                </div>
                            ))}
                            {summary.linkage_health.suspicious_runs.length > 0 && (
                                <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-3 py-3">
                                    <div className="mb-2 text-sm font-medium text-amber-100">
                                        Outliers par run
                                    </div>
                                    <div className="space-y-1 text-xs text-amber-50/90">
                                        {summary.linkage_health.suspicious_runs.slice(0, 5).map((run) => (
                                            <div key={run.run_id}>
                                                {run.run_id.slice(0, 10)} · gap {run.claim_gap} · claimed {run.claimed_traded} / trades {run.actual_trades}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <EmptyState title="Aucune donnee de linkage" />
                    )}
                </BentoCard>

                <BentoCard title="ML Readiness" span={1}>
                    {summary ? (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                                <div>
                                    <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                                        Verdict
                                    </div>
                                    <div className={`mt-1 text-lg font-semibold ${statusClass(summary.ml_readiness.verdict)}`}>
                                        {summary.ml_readiness.verdict}
                                    </div>
                                </div>
                                <div className="text-right text-xs text-neutral-400">
                                    {summary.ml_readiness.exclusion_count} exclusions
                                </div>
                            </div>
                            {Object.entries(summary.ml_readiness.scores).map(([key, value]) => (
                                <div key={key} className="space-y-1">
                                    <div className="flex items-center justify-between text-xs text-neutral-400">
                                        <span>{key}</span>
                                        <span className="text-neutral-200">{value}/100</span>
                                    </div>
                                    <div className="h-2 overflow-hidden rounded-full bg-white/8">
                                        <div
                                            className={`h-full ${value >= 90 ? "bg-emerald-400" : value >= 70 ? "bg-amber-300" : "bg-rose-400"}`}
                                            style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                            {summary.ml_readiness.blockers.length > 0 && (
                                <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-3 text-xs text-rose-100">
                                    {summary.ml_readiness.blockers.map((blocker) => (
                                        <div key={blocker}>{blocker}</div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <EmptyState title="ML readiness indisponible" />
                    )}
                </BentoCard>
            </BentoGrid>

            <BentoGrid cols={2}>
                <BentoCard title="Table Completeness" span={1}>
                    {filteredTables.length > 0 ? (
                        <div className="space-y-3">
                            {filteredTables.map((table) => {
                                const worstColumns = table.columns
                                    .filter((column) => column.status === "CRITICAL" || column.status === "WARNING")
                                    .slice(0, 5);
                                return (
                                    <div key={`${table.db_id}-${table.table}`} className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <div>
                                                <div className="font-medium text-white">{table.db_id}</div>
                                                <div className="text-xs text-neutral-500">{table.table ?? "table missing"}</div>
                                            </div>
                                            <div className={`text-xs font-semibold ${statusClass(table.status)}`}>
                                                {table.status}
                                            </div>
                                        </div>
                                        <div className="mt-2 text-xs text-neutral-400">
                                            {compact(table.row_count)} rows · {table.columns.length} colonnes auditees
                                        </div>
                                        {worstColumns.length > 0 ? (
                                            <div className="mt-3 overflow-auto">
                                                <table className="w-full text-xs">
                                                    <thead className="text-left text-neutral-500">
                                                        <tr>
                                                            <th className="pb-1">Colonne</th>
                                                            <th className="pb-1">Niveau</th>
                                                            <th className="pb-1 text-right">Fill</th>
                                                            <th className="pb-1 text-right">Invalid</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {worstColumns.map((column) => (
                                                            <tr key={column.name} className="border-t border-white/5 text-neutral-300">
                                                                <td className="py-1 font-mono">{column.name}</td>
                                                                <td className="py-1">{column.level}</td>
                                                                <td className={`py-1 text-right ${statusClass(column.status)}`}>
                                                                    {pct(column.fill_rate)}
                                                                </td>
                                                                <td className="py-1 text-right">{column.invalid_rows}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            <div className="mt-3 text-xs text-emerald-200">Aucune colonne critique sous-remplie.</div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : loading ? (
                        <div className="h-[260px] animate-pulse rounded-lg bg-white/5" />
                    ) : (
                        <EmptyState title="Aucune table selon les filtres" />
                    )}
                </BentoCard>

                <BentoCard title="Logging Quality" span={1}>
                    {filteredIssues.length > 0 ? (
                        <div className="overflow-auto max-h-[520px]">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 border-b border-white/10 bg-[rgba(9,14,26,0.95)] text-left text-neutral-500">
                                    <tr>
                                        <th className="px-3 py-2">DB</th>
                                        <th className="px-3 py-2">Column</th>
                                        <th className="px-3 py-2">Level</th>
                                        <th className="px-3 py-2 text-right">Fill</th>
                                        <th className="px-3 py-2 text-right">Null</th>
                                        <th className="px-3 py-2">Issue</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredIssues.map((issue) => (
                                        <tr key={`${issue.db_id}-${issue.column}`} className="border-b border-white/5 text-neutral-300">
                                            <td className="px-3 py-2">{issue.db_id}</td>
                                            <td className="px-3 py-2 font-mono text-xs">{issue.column}</td>
                                            <td className="px-3 py-2">{issue.level}</td>
                                            <td className={`px-3 py-2 text-right ${statusClass(issue.status)}`}>
                                                {pct(issue.fill_rate)}
                                            </td>
                                            <td className="px-3 py-2 text-right">{issue.null_rows}</td>
                                            <td className="px-3 py-2 text-xs">{issue.issue ?? "n/a"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : summary ? (
                        <EmptyState title="Aucune colonne sous-remplie selon les filtres" />
                    ) : (
                        <div className="h-[220px] animate-pulse rounded-lg bg-white/5" />
                    )}
                </BentoCard>
            </BentoGrid>

            <BentoGrid cols={2}>
                <BentoCard title="Outliers & Suspicious Runs" span={1}>
                    {summary ? (
                        summary.outliers.checks.length > 0 ? (
                            <div className="space-y-3">
                                {summary.outliers.checks.map((check) => (
                                    <div key={check.check} className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3 text-sm text-neutral-300">
                                        <div className="flex items-center justify-between gap-2">
                                            <div>
                                                <div className="font-medium text-white">{check.check}</div>
                                                <div className="text-xs text-neutral-500">{check.table}.{check.column}</div>
                                            </div>
                                            <div className={`font-semibold ${statusClass(check.severity)}`}>
                                                {check.count}
                                            </div>
                                        </div>
                                        {check.sample_ids.length > 0 && (
                                            <div className="mt-2 text-xs text-neutral-400">
                                                Sample: {check.sample_ids.join(", ")}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <EmptyState title="Aucun outlier dur détecté" />
                        )
                    ) : (
                        <div className="h-[220px] animate-pulse rounded-lg bg-white/5" />
                    )}
                </BentoCard>

                <BentoCard title="Action Queue" span={1}>
                    {filteredActions.length > 0 ? (
                        <div className="space-y-3">
                            {filteredActions.map((item) => (
                                <div key={item.code} className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <div className="font-medium text-white">{item.title}</div>
                                            <div className="mt-1 text-xs text-neutral-400">{item.action}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className={`text-sm font-semibold ${statusClass(item.severity)}`}>
                                                {item.severity}
                                            </div>
                                            <div className="text-xs text-neutral-500">x{item.count}</div>
                                        </div>
                                    </div>
                                    <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                                        {item.auto_fix ? "dry-run safe autofix" : "review required"}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : summary ? (
                        <EmptyState title="Aucune action selon les filtres" />
                    ) : (
                        <div className="h-[220px] animate-pulse rounded-lg bg-white/5" />
                    )}
                </BentoCard>
            </BentoGrid>

            {error && (
                <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                    {error}
                </div>
            )}

            {!summary && !loading && !error && (
                <EmptyState title="Aucune synthese Data Integrity disponible" />
            )}
        </div>
    );
}
