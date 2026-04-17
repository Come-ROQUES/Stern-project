/**
 * IA Audit API Client
 *
 * Service for communicating with the IA Audit backend.
 * All requests require explicit run_id - no fallback.
 *
 * Endpoints:
 * - POST /api/ia/run/analyze: Trigger full analysis
 * - GET /api/ia/run/report: Get full report
 * - GET /api/ia/run/summary: Get compact summary
 */

// =============================================================================
// TYPES
// =============================================================================

import { activeContext } from "../lib/activeContext";

export type Verdict =
    | "HEALTHY"
    | "FILTER_LOCK"
    | "DETECTION_ISSUE"
    | "EXECUTION_FAILURE"
    | "RISK_BREACH"
    | "DATA_INCONSISTENCY"
    | "INSUFFICIENT_DATA";

export type AnomalySeverity = "INFO" | "WARNING" | "CRITICAL";

export interface Anomaly {
    code: string;
    severity: AnomalySeverity;
    message: string;
    metric: string | null;
    expected: string | null;
    actual: string | null;
}

export interface Hypothesis {
    code: string;
    description: string;
    probability: number;
    evidence: string[];
}

export interface Recommendation {
    priority: number;
    action: string;
    rationale: string;
    category: "inspect" | "trace" | "adjust" | "escalate";
}

export interface RunMetrics {
    shocks_total: number;
    shocks_eligible: number;
    signals_total: number;
    signals_accepted: number;
    signals_rejected: number;
    trades_total: number;
    trades_closed: number;
    trades_open: number;
    trades_pnl_eur: number;
    execution_rate: number;
    rejection_rate: number;
    win_rate: number;
    sessions: Record<string, number>;
    rejection_reasons: Record<string, number>;
}

export interface IAAuditReport {
    run_id: string;
    strategy_id: string;
    strategy_version: string | null;
    trade_date: string;
    analysis_timestamp: string;

    verdict: Verdict;
    confidence: number;
    summary: string;

    metrics: RunMetrics;
    anomalies: Anomaly[];
    hypotheses: Hypothesis[];
    recommendations: Recommendation[];

    detection_health: number;
    execution_health: number;
    risk_health: number;
    infra_health: number;
}

export interface IASummary {
    run_id: string;
    verdict: Verdict;
    confidence: number;
    summary: string;
    detection_health: number;
    execution_health: number;
    risk_health: number;
    infra_health: number;
    anomaly_count: number;
    analysis_timestamp: string;
}

// =============================================================================
// API BASE
// =============================================================================

export const getApiBase = (): string => {
    const envBase = import.meta.env.VITE_API_URL;
    if (envBase) return envBase.replace(/\/$/, "");
    return "";
};

const API_BASE = getApiBase();

// =============================================================================
// FETCH HELPERS
// =============================================================================

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000); // 30s timeout for analysis

    try {
        const res = await fetch(url, {
            ...init,
            headers: {
                "Content-Type": "application/json",
                ...(init?.headers || {}),
            },
            signal: controller.signal,
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(text.slice(0, 200) || `HTTP ${res.status}`);
        }

        return (await res.json()) as T;
    } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
            throw new Error("Request timed out");
        }
        throw err;
    } finally {
        clearTimeout(timeout);
    }
}

// =============================================================================
// API CLIENT
// =============================================================================

export const iaAuditApi = {
    /**
     * Trigger full IA analysis on a run
     */
    analyzeRun: async (
        runId: string,
        strategy?: string
    ): Promise<IAAuditReport> => {
        if (!runId) throw new Error("run_id is required");
        const params = new URLSearchParams({ run_id: runId });
        const strategyValue = strategy ?? activeContext.strategy_id;
        if (strategyValue) params.set("strategy", strategyValue);

        return fetchJson<IAAuditReport>(
            `${API_BASE}/api/ia/run/analyze?${params}`,
            { method: "POST" }
        );
    },

    /**
     * Get full IA report for a run
     */
    getReport: async (
        runId: string,
        strategy?: string
    ): Promise<IAAuditReport> => {
        if (!runId) throw new Error("run_id is required");
        const params = new URLSearchParams({ run_id: runId });
        const strategyValue = strategy ?? activeContext.strategy_id;
        if (strategyValue) params.set("strategy", strategyValue);

        return fetchJson<IAAuditReport>(
            `${API_BASE}/api/ia/run/report?${params}`
        );
    },

    /**
     * Get compact IA summary for dashboard header
     */
    getSummary: async (runId: string, strategy?: string): Promise<IASummary> => {
        if (!runId) throw new Error("run_id is required");
        const params = new URLSearchParams({ run_id: runId });
        const strategyValue = strategy ?? activeContext.strategy_id;
        if (strategyValue) params.set("strategy", strategyValue);

        return fetchJson<IASummary>(`${API_BASE}/api/ia/run/summary?${params}`);
    },
};

// =============================================================================
// VERDICT HELPERS
// =============================================================================

export const VERDICT_LABELS: Record<Verdict, string> = {
    HEALTHY: "Healthy",
    FILTER_LOCK: "Filter Lock",
    DETECTION_ISSUE: "Detection Issue",
    EXECUTION_FAILURE: "Execution Failure",
    RISK_BREACH: "Risk Breach",
    DATA_INCONSISTENCY: "Data Inconsistency",
    INSUFFICIENT_DATA: "Insufficient Data",
};

export const VERDICT_COLORS: Record<Verdict, string> = {
    HEALTHY: "text-green-400",
    FILTER_LOCK: "text-amber-300",
    DETECTION_ISSUE: "text-amber-400",
    EXECUTION_FAILURE: "text-red-400",
    RISK_BREACH: "text-orange-400",
    DATA_INCONSISTENCY: "text-yellow-400",
    INSUFFICIENT_DATA: "text-neutral-400",
};

export const VERDICT_BG: Record<Verdict, string> = {
    HEALTHY: "bg-green-500/10 border-green-500/40",
    FILTER_LOCK: "bg-amber-500/10 border-amber-500/35",
    DETECTION_ISSUE: "bg-amber-500/10 border-amber-500/40",
    EXECUTION_FAILURE: "bg-red-500/10 border-red-500/40",
    RISK_BREACH: "bg-orange-500/10 border-orange-500/40",
    DATA_INCONSISTENCY: "bg-yellow-500/10 border-yellow-500/40",
    INSUFFICIENT_DATA: "bg-neutral-500/10 border-neutral-500/40",
};

export const SEVERITY_COLORS: Record<AnomalySeverity, string> = {
    INFO: "text-blue-400",
    WARNING: "text-amber-400",
    CRITICAL: "text-red-400",
};

export function getHealthColor(score: number): string {
    if (score >= 80) return "text-green-400";
    if (score >= 50) return "text-amber-400";
    return "text-red-400";
}

export function getHealthBg(score: number): string {
    if (score >= 80) return "bg-green-500/10 border-green-500/40";
    if (score >= 50) return "bg-amber-500/10 border-amber-500/40";
    return "bg-red-500/10 border-red-500/40";
}
