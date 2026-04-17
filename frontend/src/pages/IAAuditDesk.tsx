/**
 * IA Audit Desk - Run Analysis Dashboard
 *
 * PHILOSOPHY:
 * - Sober, readable, decision-oriented
 * - Everything is run-scoped
 * - IA observes, analyzes, explains, recommends
 * - IA NEVER trades, NEVER modifies parameters
 *
 * SECTIONS:
 * 1. Run IA Context (header)
 * 2. IA Executive Summary
 * 3. Anomaly Scorecard
 * 4. Actionable Recommendations
 * 5. Analysis History
 */

import { useCallback, useEffect, useState } from "react";
import { useRunMeta } from "../lib/useRunContext";
import {
    type IAAuditReport,
    type IASummary,
    type Anomaly,
    type Recommendation,
    type Verdict,
    iaAuditApi,
    VERDICT_LABELS,
    VERDICT_COLORS,
    VERDICT_BG,
    SEVERITY_COLORS,
    getHealthColor,
    getHealthBg,
} from "../services/iaAuditApi";

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function IAAuditDesk() {
    const { selectedRunId, run, loading: runLoading } = useRunMeta();
    const strategyId = run?.strategy_id ?? undefined;

    const [report, setReport] = useState<IAAuditReport | null>(null);
    const [summary, setSummary] = useState<IASummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastAnalysis, setLastAnalysis] = useState<string | null>(null);

    // Analysis history (local state for this session)
    const [history, setHistory] = useState<
        Array<{ timestamp: string; run_id: string; verdict: Verdict }>
    >([]);

    const runAnalysis = useCallback(async () => {
        if (!selectedRunId) return;

        setLoading(true);
        setError(null);

        try {
            const result = await iaAuditApi.analyzeRun(selectedRunId, strategyId);
            setReport(result);
            setSummary({
                run_id: result.run_id,
                verdict: result.verdict,
                confidence: result.confidence,
                summary: result.summary,
                detection_health: result.detection_health,
                execution_health: result.execution_health,
                risk_health: result.risk_health,
                infra_health: result.infra_health,
                anomaly_count: result.anomalies.length,
                analysis_timestamp: result.analysis_timestamp,
            });
            setLastAnalysis(result.analysis_timestamp);

            // Add to history
            setHistory((prev) => [
                {
                    timestamp: result.analysis_timestamp,
                    run_id: result.run_id,
                    verdict: result.verdict,
                },
                ...prev.slice(0, 9), // Keep last 10
            ]);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Analysis failed");
        } finally {
            setLoading(false);
        }
    }, [selectedRunId, strategyId]);

    // Auto-load summary when run changes
    useEffect(() => {
        if (!selectedRunId) {
            setReport(null);
            setSummary(null);
            return;
        }

        // Just get summary on run change (lighter)
        iaAuditApi
            .getSummary(selectedRunId, strategyId)
            .then((s) => {
                setSummary(s);
                setLastAnalysis(s.analysis_timestamp);
            })
            .catch(() => {
                // Silent fail for summary - user can trigger full analysis
            });
    }, [selectedRunId, strategyId]);

    // No run selected state
    if (!selectedRunId && !runLoading) {
        return (
            <div className="space-y-4">
                <Header />
                <div className="card glass p-8 text-center">
                    <div className="text-neutral-400 text-sm">
                        No run selected. Select a run from Pro Terminal or
                        Database tab to begin analysis.
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <Header />

            {/* 1. Run IA Context */}
            <RunContext
                runId={selectedRunId}
                run={run}
                lastAnalysis={lastAnalysis}
                loading={runLoading}
            />

            {/* Error state */}
            {error && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {error}
                </div>
            )}

            {/* 2. IA Executive Summary */}
            <ExecutiveSummary
                summary={summary}
                loading={loading}
                onAnalyze={runAnalysis}
            />

            {/* 3. Anomaly Scorecard */}
            {summary && (
                <AnomalyScorecard
                    detectionHealth={summary.detection_health}
                    executionHealth={summary.execution_health}
                    riskHealth={summary.risk_health}
                    infraHealth={summary.infra_health}
                    anomalies={report?.anomalies || []}
                />
            )}

            {/* 4. Actionable Recommendations */}
            {report && report.recommendations.length > 0 && (
                <Recommendations recommendations={report.recommendations} />
            )}

            {/* 5. Hypotheses (if available) */}
            {report && report.hypotheses.length > 0 && (
                <Hypotheses hypotheses={report.hypotheses} />
            )}

            {/* 6. Analysis History */}
            {history.length > 0 && <AnalysisHistory history={history} />}
        </div>
    );
}

// =============================================================================
// HEADER
// =============================================================================

function Header() {
    return (
        <header className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs text-neutral-200 uppercase tracking-[0.18em]">
                <AuditIcon />
                <span>IA Audit Desk</span>
            </div>
            <h2 className="text-xl font-semibold">Run Analysis & Diagnostics</h2>
            <p className="text-sm text-neutral-400">
                Automated audit of trading runs. IA observes, analyzes, and
                recommends. Never trades or modifies parameters.
            </p>
        </header>
    );
}

// =============================================================================
// RUN CONTEXT (HEADER COMPACT)
// =============================================================================

interface RunContextProps {
    runId: string | null;
    run: {
        strategy_id?: string;
        strategy_version?: string | null;
        trade_date?: string;
        status?: string;
    } | null;
    lastAnalysis: string | null;
    loading: boolean;
}

function RunContext({ runId, run, lastAnalysis, loading }: RunContextProps) {
    if (loading) {
        return (
            <div className="card glass p-4">
                <div className="animate-pulse h-4 bg-white/5 rounded w-1/3" />
            </div>
        );
    }

    if (!runId) return null;

    return (
        <div className="card glass p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-sm">
                <div>
                    <div className="text-xs text-neutral-500 uppercase tracking-wider">
                        Run ID
                    </div>
                    <div className="font-mono text-neutral-200">
                        {runId.slice(0, 12)}...
                    </div>
                </div>
                <div>
                    <div className="text-xs text-neutral-500 uppercase tracking-wider">
                        Strategy
                    </div>
                    <div className="text-neutral-200">
                        {run?.strategy_id || "damping_wave"}
                    </div>
                </div>
                <div>
                    <div className="text-xs text-neutral-500 uppercase tracking-wider">
                        Version
                    </div>
                    <div className="font-mono text-neutral-200 text-xs">
                        {run?.strategy_version?.slice(0, 12) || "n/a"}
                    </div>
                </div>
                <div>
                    <div className="text-xs text-neutral-500 uppercase tracking-wider">
                        Date
                    </div>
                    <div className="text-neutral-200">
                        {run?.trade_date || "n/a"}
                    </div>
                </div>
                <div>
                    <div className="text-xs text-neutral-500 uppercase tracking-wider">
                        Status
                    </div>
                    <div
                        className={
                            run?.status === "active"
                                ? "text-green-400"
                                : "text-neutral-400"
                        }
                    >
                        {run?.status || "unknown"}
                    </div>
                </div>
                <div>
                    <div className="text-xs text-neutral-500 uppercase tracking-wider">
                        Last Analysis
                    </div>
                    <div className="text-neutral-200 text-xs">
                        {lastAnalysis
                            ? new Date(lastAnalysis).toLocaleTimeString()
                            : "Not yet"}
                    </div>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// EXECUTIVE SUMMARY
// =============================================================================

interface ExecutiveSummaryProps {
    summary: IASummary | null;
    loading: boolean;
    onAnalyze: () => void;
}

function ExecutiveSummary({ summary, loading, onAnalyze }: ExecutiveSummaryProps) {
    return (
        <div className="card glass">
            <div className="flex items-center justify-between mb-4">
                <div className="text-xs text-neutral-200 uppercase tracking-[0.18em]">
                    IA Verdict
                </div>
                <button
                    onClick={onAnalyze}
                    disabled={loading}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition disabled:opacity-50"
                >
                    {loading ? "Analyzing..." : "Run Analysis"}
                </button>
            </div>

            {!summary && !loading && (
                <div className="text-neutral-400 text-sm">
                    No analysis available. Click "Run Analysis" to start.
                </div>
            )}

            {loading && (
                <div className="animate-pulse space-y-3">
                    <div className="h-6 bg-white/5 rounded w-1/4" />
                    <div className="h-4 bg-white/5 rounded w-3/4" />
                </div>
            )}

            {summary && !loading && (
                <div className="space-y-4">
                    {/* Verdict Badge */}
                    <div className="flex items-center gap-3">
                        <span
                            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border font-semibold ${VERDICT_BG[summary.verdict]} ${VERDICT_COLORS[summary.verdict]}`}
                        >
                            <VerdictIcon verdict={summary.verdict} />
                            {VERDICT_LABELS[summary.verdict]}
                        </span>
                        <span className="text-sm text-neutral-400">
                            Confidence: {Math.round(summary.confidence * 100)}%
                        </span>
                    </div>

                    {/* Summary Text */}
                    <div className="rounded-xl border border-white/5 bg-black/20 p-4">
                        <p className="text-neutral-100 leading-relaxed">
                            {summary.summary}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

// =============================================================================
// ANOMALY SCORECARD
// =============================================================================

interface AnomalyScorecardProps {
    detectionHealth: number;
    executionHealth: number;
    riskHealth: number;
    infraHealth: number;
    anomalies: Anomaly[];
}

function AnomalyScorecard({
    detectionHealth,
    executionHealth,
    riskHealth,
    infraHealth,
    anomalies,
}: AnomalyScorecardProps) {
    const cards = [
        {
            label: "Detection Health",
            score: detectionHealth,
            anomaly: anomalies.find((a) =>
                ["NO_SHOCKS", "NO_SIGNALS_FROM_SHOCKS"].includes(a.code)
            ),
        },
        {
            label: "Execution Health",
            score: executionHealth,
            anomaly: anomalies.find((a) =>
                ["ZERO_EXECUTION", "LOW_EXECUTION_RATE"].includes(a.code)
            ),
        },
        {
            label: "Risk Health",
            score: riskHealth,
            anomaly: anomalies.find((a) =>
                ["LOW_WIN_RATE", "NEGATIVE_PNL"].includes(a.code)
            ),
        },
        {
            label: "Infra Health",
            score: infraHealth,
            anomaly: anomalies.find((a) =>
                ["SIGNALS_WITHOUT_SHOCKS", "DATA_INCONSISTENCY"].includes(a.code)
            ),
        },
    ];

    return (
        <div className="card glass">
            <div className="text-xs text-neutral-200 uppercase tracking-[0.18em] mb-4">
                Health Scorecard
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {cards.map((card) => (
                    <HealthCard
                        key={card.label}
                        label={card.label}
                        score={card.score}
                        anomaly={card.anomaly}
                    />
                ))}
            </div>
        </div>
    );
}

interface HealthCardProps {
    label: string;
    score: number;
    anomaly?: Anomaly;
}

function HealthCard({ label, score, anomaly }: HealthCardProps) {
    const status = score >= 80 ? "OK" : score >= 50 ? "WARN" : "CRITICAL";

    return (
        <div
            className={`rounded-xl border p-4 ${getHealthBg(score)}`}
        >
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-neutral-400">{label}</span>
                <span
                    className={`text-lg font-bold ${getHealthColor(score)}`}
                >
                    {score}
                </span>
            </div>
            <div className={`text-sm font-medium ${getHealthColor(score)}`}>
                {status}
            </div>
            {anomaly && (
                <div className="mt-2 text-xs text-neutral-300 line-clamp-2">
                    {anomaly.message}
                </div>
            )}
        </div>
    );
}

// =============================================================================
// RECOMMENDATIONS
// =============================================================================

interface RecommendationsProps {
    recommendations: Recommendation[];
}

function Recommendations({ recommendations }: RecommendationsProps) {
    const sorted = [...recommendations].sort((a, b) => a.priority - b.priority);

    return (
        <div className="card glass">
            <div className="text-xs text-neutral-200 uppercase tracking-[0.18em] mb-4">
                Actionable Recommendations
            </div>
            <div className="space-y-3">
                {sorted.map((rec, idx) => (
                    <RecommendationItem key={idx} rec={rec} />
                ))}
            </div>
        </div>
    );
}

function RecommendationItem({ rec }: { rec: Recommendation }) {
    const priorityColor =
        rec.priority === 1
            ? "text-red-400 border-red-500/40"
            : rec.priority === 2
                ? "text-amber-400 border-amber-500/40"
                : "text-neutral-400 border-white/10";

    const categoryIcon = {
        inspect: "🔍",
        trace: "📋",
        adjust: "⚙️",
        escalate: "🚨",
    }[rec.category];

    return (
        <div className="rounded-lg border border-white/5 bg-black/20 p-4">
            <div className="flex items-start gap-3">
                <span
                    className={`flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full border text-xs font-bold ${priorityColor}`}
                >
                    {rec.priority}
                </span>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-neutral-100 font-medium">
                            {rec.action}
                        </span>
                        <span className="text-xs">{categoryIcon}</span>
                    </div>
                    <div className="text-xs text-neutral-400 mt-1">
                        {rec.rationale}
                    </div>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// HYPOTHESES
// =============================================================================

interface HypothesesProps {
    hypotheses: Array<{
        code: string;
        description: string;
        probability: number;
        evidence: string[];
    }>;
}

function Hypotheses({ hypotheses }: HypothesesProps) {
    return (
        <div className="card glass">
            <div className="text-xs text-neutral-200 uppercase tracking-[0.18em] mb-4">
                Causal Hypotheses
            </div>
            <div className="space-y-3">
                {hypotheses.map((h) => (
                    <div
                        key={h.code}
                        className="rounded-lg border border-white/5 bg-black/20 p-4"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-neutral-100 font-medium">
                                {h.description}
                            </span>
                            <span className="text-xs text-neutral-400">
                                P={Math.round(h.probability * 100)}%
                            </span>
                        </div>
                        {h.evidence.length > 0 && (
                            <ul className="text-xs text-neutral-400 list-disc list-inside space-y-0.5">
                                {h.evidence.map((e, i) => (
                                    <li key={i}>{e}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

// =============================================================================
// ANALYSIS HISTORY
// =============================================================================

interface AnalysisHistoryProps {
    history: Array<{ timestamp: string; run_id: string; verdict: Verdict }>;
}

function AnalysisHistory({ history }: AnalysisHistoryProps) {
    return (
        <div className="card glass">
            <div className="text-xs text-neutral-200 uppercase tracking-[0.18em] mb-4">
                Analysis History
            </div>
            <div className="space-y-2">
                {history.map((h, idx) => (
                    <div
                        key={idx}
                        className="flex items-center justify-between text-sm py-2 border-b border-white/5 last:border-0"
                    >
                        <div className="flex items-center gap-3">
                            <span className="text-neutral-400 text-xs">
                                {new Date(h.timestamp).toLocaleString()}
                            </span>
                            <span className="font-mono text-neutral-300 text-xs">
                                {h.run_id.slice(0, 8)}
                            </span>
                        </div>
                        <span
                            className={`text-xs font-medium ${VERDICT_COLORS[h.verdict]}`}
                        >
                            {VERDICT_LABELS[h.verdict]}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// =============================================================================
// ICONS
// =============================================================================

function AuditIcon() {
    return (
        <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            className="text-[var(--accent)]"
        >
            <path
                d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M9 12h6M9 16h6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
            />
        </svg>
    );
}

function VerdictIcon({ verdict }: { verdict: Verdict }) {
    if (verdict === "HEALTHY") {
        return (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path
                    d="M5 13l4 4L19 7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        );
    }
    if (verdict === "EXECUTION_FAILURE" || verdict === "DETECTION_ISSUE") {
        return (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        );
    }
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
                d="M12 9v2m0 4h.01M12 3l9.5 16.5H2.5L12 3z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

export default IAAuditDesk;
