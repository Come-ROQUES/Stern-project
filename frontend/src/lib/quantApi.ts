/**
 * Quant Lab V2 - API Client
 * 
 * Typed client for /api/quant/v1/* endpoints
 * All requests are run-scoped and include downsampling.
 */

const API_BASE = (() => {
    const envBase = (import.meta.env.VITE_API_URL || "").trim();
    if (envBase) return envBase.replace(/\/$/, "");
    return "";
})();

const RESEARCH_API_BASE = (() => {
    const envBase = (
        import.meta.env.VITE_RESEARCH_API_URL ||
        import.meta.env.VITE_QUANT_RESEARCH_API_URL ||
        import.meta.env.VITE_QUANTLAB_API_URL ||
        ""
    ).trim();
    if (envBase) return envBase.replace(/\/$/, "");
    return API_BASE;
})();

// Sweep API runs on A1 (heavy computation)
// In production: /sweep-api, in dev: direct to A1 or fallback to x86
const SWEEP_API_BASE = (() => {
    const envBase = (import.meta.env.VITE_SWEEP_API_URL || "").trim();
    if (envBase) return envBase.replace(/\/$/, "");
    if (typeof window !== "undefined") {
        const host = window.location.hostname;
        if (host === "localhost" || host === "127.0.0.1") {
            // Local dev: try A1 direct or fallback to x86
            return "http://localhost:8002";
        }
    }
    return "/sweep-api";  // nginx proxies to A1:8002
})();
// =============================================================================
// TYPES - Market Conditions
// =============================================================================

export interface SpreadPoint {
    ts: string;
    spread_pips: number;
    session: "ASIA" | "LONDON" | "NY" | "UNKNOWN";
    vol_regime?: string;
}

export interface VolRegime {
    current: "LOW" | "NORMAL" | "HIGH";
    last_24h: Record<string, number>;
}

export interface DataFreshness {
    last_bar_ts: string;
    bar_age_seconds: number;
    status: "FRESH" | "STALE" | "OFFLINE";
}

export interface MarketConditionsResponse {
    spread_timeline: SpreadPoint[];
    spread_quantiles: {
        p50: number;
        p90: number;
        p95: number;
        p99: number;
    };
    spread_histogram: {
        bin_edges: number[];
        counts: number[];
        density: number[];
    };
    vol_regime: VolRegime;
    session_breakdown: SessionBreakdown[];
    freshness: DataFreshness;
    meta?: QuantMetaStandard;
    kpis: {
        avg_spread_24h: number;
        tradable: boolean;
        spread_breach_pct: number;
        total_bars: number;
    };
}

export interface SessionBreakdown {
    session: string;
    count: number;
    avg_spread: number;
    p50_spread: number;
    p95_spread: number;
    dominant_regime: string;
}

// =============================================================================
// TYPES - Data Quality
// =============================================================================

export interface DataQualityHealth {
    score: number;
    state: "FRESH" | "DEGRADED" | "OFFLINE";
    run_id: string | null;
    strategy_id: string;
    horizon_minutes: number;
    tick_age_s: number | null;
    bar_age_s: number | null;
    coverage_pct: number;
    spread_spike_pct: number;
    invalid_quote_pct: number;
    gateway_connected: boolean | null;
    bot_running: boolean | null;
    db_latency_ms_p95: number | null;
    last_bar_ts: string | null;
    last_tick_ts: string | null;
    meta: { rows: number; expected: number };
}

export interface DataQualityAnomalies {
    anomalies: Array<{
        ts: string;
        severity: "info" | "warn" | "danger";
        type: string;
        message: string;
    }>;
    count: number;
}

export interface DataQualityMatrix {
    missing: number[][];
    spikes: number[][];
    hours: number[];
    days: string[];
    png_base64: string | null;
    meta: { rows: number; expected_per_hour: number };
}

// =============================================================================
// API CLIENT
// =============================================================================
// =============================================================================
// TYPES - Regime Heatmap
// =============================================================================

export interface RegimeHeatmapResponse {
    png_base64: string | null;
    hours: number[];
    regimes: string[];
    counts: number[][];
    pct: number[][];
    spread_quantiles: {
        p50: Array<number | null>;
        p95: Array<number | null>;
    };
    meta: {
        limit: number;
        rows: number;
    };
}

// =============================================================================
// TYPES - Signal Quality
// =============================================================================

export interface SignalPoint {
    signal_id: string;
    ts: string;
    amplitude_pips: number | null;
    net_outcome_pips: number | null;
    sim_outcome?: string | null;
    sim_valid?: boolean | null;
    sim_verdict?: "WOULD_WIN" | "WOULD_LOSE" | "UNRELIABLE" | null;
    sim_profitable?: boolean | null;
    sim_anchor_ts?: string | null;
    sim_tp_after_decision?: boolean | null;
    sim_pnl_pips?: number | null;
    sim_pnl_usd?: number | null;
    sim_mfe_pips?: number | null;
    sim_mae_pips?: number | null;
    sim_quality?: string | null;
    accepted: boolean;
    rejection_reason: string | null;
    run_id?: string | null;
    session: "ASIA" | "LONDON" | "OVERLAP" | "NY" | "UNKNOWN";
    regime: string;
}

export interface SignalFunnel {
    total: number;
    accepted: number;
    traded: number;
    profitable: number;
}

export interface HeatmapCell {
    session: string;
    regime: string;
    avg_net: number;
    count: number;
}

export interface SignalQualityResponse {
    signals: SignalPoint[];
    funnel: SignalFunnel;
    heatmap: HeatmapCell[];
    meta?: QuantMetaStandard;
    kpis: {
        accept_rate: number;
        avg_net: number;
        traded_count: number;
        median_net: number;
        p25_net: number;
        p75_net: number;
        iqr_net: number;
        outlier_count: number;
        best_combo: { session: string; regime: string } | null;
    };
}

export interface DampingWaveMissedOpportunitySummary {
    rejected_total: number;
    rejected_executable_count: number;
    rejected_unreliable_count: number;
    missed_pnl_raw_pips: number;
    missed_pnl_clustered_pips: number;
    avg_missed_pnl_pips: number;
    tp_after_decision_rate: number;
    avg_mfe_pips: number;
    avg_mae_pips: number;
    cluster_count: number;
    unspecified_rejection_count: number;
    cluster_method: "first_signal" | string;
    top_reasons: Array<{ reason: string; count: number }>;
}

export interface DampingWaveMissedOpportunityReason {
    reason: string;
    count: number;
    pnl_pips_sum: number;
    pnl_pips_avg: number;
}

export interface DampingWaveMissedOpportunityCluster {
    cluster_id: string;
    cluster_start_ts: string;
    cluster_end_ts: string;
    signal_count: number;
    direction: string | null;
    run_id: string | null;
    signal_ids: string[];
    sum_sim_pnl_pips: number;
    best_sim_pnl_pips: number | null;
    clustered_pnl_pips: number | null;
    representative_signal_id: string | null;
    dominant_reason: string | null;
}

export interface DampingWaveMissedOpportunitiesResponse {
    summary: DampingWaveMissedOpportunitySummary;
    reasons: DampingWaveMissedOpportunityReason[];
    clusters: DampingWaveMissedOpportunityCluster[];
    signals: SignalPoint[];
    _meta?: {
        run_id: string;
        strategy_id: string;
        cluster_window_s: number;
        generated_at: string;
    };
}

// =============================================================================
// TYPES - Trade Performance
// =============================================================================

export interface EquityPoint {
    ts: string;
    cumulative_pnl: number;
    drawdown: number;
}

export interface TradePoint {
    trade_id: string;
    pnl_pips: number;
    mae_pips: number | null;
    mfe_pips: number | null;
    hold_seconds: number;
}

export interface PnlDistribution {
    bins: number[];
    counts: number[];
}

export interface TradePerformanceResponse {
    equity_curve: EquityPoint[];
    trades: TradePoint[];
    distribution: PnlDistribution;
    meta?: QuantMetaStandard;
    kpis: {
        total_pnl: number;        // in pips
        total_pnl_usd: number;    // in USD (net after commissions)
        max_drawdown: number;     // in pips
        win_rate: number;
        profit_factor: number;
        sharpe_proxy: number;
        trade_count: number;
    };
}

// =============================================================================
// TYPES - Parameter Tuning
// =============================================================================

export interface SensitivityBar {
    param: string;
    delta_pnl: number;
}

export interface Surface3D {
    x: number[];
    y: number[];
    z: number[][];
    x_label: string;
    y_label: string;
    z_label: string;
}

export interface SweepMeta {
    sweep_run_id: string;
    created_at: string;
    signals_total: number;
}

export interface ParameterTuningResponse {
    available: boolean;
    sweep_run: SweepMeta | null;
    sensitivity: SensitivityBar[];
    surface: Surface3D | null;
    kpis: {
        best_config_id: string | null;
        best_pnl: number | null;
        baseline_pnl: number | null;
        delta_vs_baseline: string | null;
    };
}

// =============================================================================
// TYPES - Common
// =============================================================================

export type Scope = "TODAY" | "YESTERDAY" | "7D" | "30D" | "RUN" | "EPOCH" | "BACKTEST";
export type Side = "BUY" | "SELL" | "ALL";
export type QuantDataSource = "V3" | "LEGACY";

export interface QuantMetaStandard {
    scope?: string;
    run_id?: string | null;
    run_ids?: string[] | null;
    strategy_id?: string | null;
    portfolio_epoch?: number | null;
    from_date?: string | null;
    to_date?: string | null;
    data_source: QuantDataSource;
    fallback_used: boolean;
    warnings?: string[];
    count?: number | null;
    [key: string]: unknown;
}

interface BaseParams {
    run_id?: string;
    scope?: Scope;
    strategy_id?: string;
    from_date?: string;
    to_date?: string;
    portfolio_epoch?: number;
}

export interface RegimesDashboardHeatmap {
    metric: string;
    secondary_metric?: string;
    x_labels: string[];
    y_labels: string[];
    matrix: Array<Array<number | null>>;
    secondary_matrix?: Array<Array<number | null>>;
    counts: number[][];
    confidence: string[][];
    confidence_scores: number[][];
    image_base64?: string | null; // deprecated: interactive rendering uses matrix data
    render_hint?: "INTERACTIVE_ONLY";
    warnings?: string[];
}

export interface RegimesDashboardResponse {
    meta: QuantMetaStandard;
    taxonomy: {
        vol_regime: string[];
        spread_regime: string[];
        session: string[];
    };
    kpis: {
        signals_total: number;
        accepted_total: number;
        traded_total: number;
        pnl_samples_total: number;
        coverage_ratio: number;
    };
    heatmaps: {
        expectancy: RegimesDashboardHeatmap;
        risk_tail: RegimesDashboardHeatmap;
        execution_erosion: RegimesDashboardHeatmap;
        funnel_conversion: RegimesDashboardHeatmap;
        stability_confidence: RegimesDashboardHeatmap;
    };
}

// =============================================================================
// API CLIENT
// =============================================================================

type QuantCacheEntry<T> = {
    value: T;
    expiresAt: number;
};

const quantCache = new Map<string, QuantCacheEntry<unknown>>();
const quantInflight = new Map<string, Promise<unknown>>();

async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) {
        const text = await res.text().catch(() => "Unknown error");
        throw new Error(`API error ${res.status} for ${url}: ${text}`);
    }
    return res.json() as Promise<T>;
}

async function fetchJsonCached<T>(url: string, ttlMs = 0): Promise<T> {
    if (ttlMs > 0) {
        const cached = quantCache.get(url);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.value as T;
        }
    }

    const inflight = quantInflight.get(url);
    if (inflight) {
        return inflight as Promise<T>;
    }

    const request = fetchJson<T>(url)
        .then((value) => {
            if (ttlMs > 0) {
                quantCache.set(url, {
                    value,
                    expiresAt: Date.now() + ttlMs,
                });
            }
            return value;
        })
        .finally(() => {
            quantInflight.delete(url);
        });
    quantInflight.set(url, request as Promise<unknown>);
    return request;
}

let cachedPortfolioEpoch: number | null | undefined;
let cachedPortfolioEpochTs = 0;
async function getCurrentPortfolioEpoch(): Promise<number | null> {
    const now = Date.now();
    if (cachedPortfolioEpoch !== undefined && now - cachedPortfolioEpochTs < 5_000) {
        return cachedPortfolioEpoch;
    }
    try {
        const url = buildUrl("/api/portfolio/epoch", {});
        const res = await fetchJson<{ current_epoch: number }>(url);
        cachedPortfolioEpoch = typeof res.current_epoch === "number" ? res.current_epoch : null;
        cachedPortfolioEpochTs = now;
        return cachedPortfolioEpoch;
    } catch {
        cachedPortfolioEpoch = null;
        cachedPortfolioEpochTs = now;
        return null;
    }
}

export function buildUrlWithBase(
    base: string,
    path: string,
    params: Record<string, unknown>
): string {
    const normalizedBase = base.replace(/\/$/, "");
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const target = `${normalizedBase}${normalizedPath}`;

    const url = /^https?:\/\//i.test(normalizedBase)
        ? new URL(target)
        : new URL(
            target,
            typeof window !== "undefined" ? window.location.origin : "http://localhost"
        );
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            url.searchParams.set(key, String(value));
        }
    });
    return url.toString();
}

function buildUrl(path: string, params: Record<string, unknown>): string {
    return buildUrlWithBase(API_BASE, path, params);
}

function buildResearchUrl(path: string, params: Record<string, unknown>): string {
    return buildUrlWithBase(RESEARCH_API_BASE, path, params);
}

function buildSweepUrl(path: string, params: Record<string, unknown>): string {
    return buildUrlWithBase(SWEEP_API_BASE, path, params);
}

// =============================================================================
// EXPORTED FUNCTIONS
// =============================================================================

/**
 * Fetch market conditions (spread, vol regime, freshness)
 */
export async function getMarketConditions(
    params: BaseParams & { downsample?: "5m" | "15m" | "1h" }
): Promise<MarketConditionsResponse> {
    const url = buildUrl("/api/quant/v1/market", { ...params });
    return fetchJsonCached<MarketConditionsResponse>(url, 15_000);
}

/**
 * Fetch signal quality data (scatter, funnel, heatmap)
 */
export async function getSignalQuality(
    params: BaseParams & { side?: Side; limit?: number }
): Promise<SignalQualityResponse> {
    const url = buildUrl("/api/quant/signals/quality", {
        ...params,
        limit: params.limit ?? 500,
    });
    return fetchJsonCached<SignalQualityResponse>(url, 45_000);
}

/**
 * Fetch trade performance data (equity curve, distribution, MAE/MFE)
 */
export async function getTradePerformance(
    params: BaseParams & { limit?: number }
): Promise<TradePerformanceResponse> {
    const url = buildUrl("/api/quant/trades/performance", {
        ...params,
        limit: params.limit ?? 200,
    });
    return fetchJsonCached<TradePerformanceResponse>(url, 45_000);
}

/**
 * Fetch parameter tuning data (sensitivity, surface)
 * 
 * Architecture:
 *   - Sweep runs on A1 (heavy computation, 24GB RAM)
 *   - Results stored in sweep_history.sqlite on A1
 *   - Frontend calls /sweep-api/ (proxied to A1:8002)
 *   - Fallback to x86 /api/research/sweep/* for legacy compatibility
 */
export async function getParameterTuning(
    params: {
        sweep_run_id?: string;
        scope_type?: "ROLLING" | "DAY";
        scope_key?: string;
        limit?: number;
    }
): Promise<ParameterTuningResponse> {
    // Try A1 sweep API first (new architecture)
    try {
        const sweepData = await getSweepFromA1(params);
        if (sweepData.available) {
            return sweepData;
        }
    } catch {
        // A1 sweep API not available, fallback to legacy
    }

    // Fallback to existing x86 sweep endpoints
    return getParameterTuningFallback(params);
}

/**
 * Fetch sweep data from A1 sweep API
 */
async function getSweepFromA1(
    params: {
        limit?: number;
    }
): Promise<ParameterTuningResponse> {
    const healthUrl = buildSweepUrl("/api/sweep/health", {});
    const health = await fetchJson<{ status: string; db_exists: boolean }>(healthUrl);

    if (!health.db_exists) {
        return {
            available: false,
            sweep_run: null,
            sensitivity: [],
            surface: null,
            kpis: {
                best_config_id: null,
                best_pnl: null,
                baseline_pnl: null,
                delta_vs_baseline: null,
            },
        };
    }

    // Fetch best configs from A1
    const bestUrl = buildSweepUrl("/api/sweep/best", {
        metric: "score",
        limit: params.limit ?? 50,
    });
    const bestResp = await fetchJson<{
        configs: Array<{
            config_id?: string;
            param_json?: string;
            score?: number;
            pnl_total?: number;
            win_rate?: number;
            timestamp?: string;
        }>;
        metric: string;
        count: number;
    }>(bestUrl);

    // Fetch summary
    const summaryUrl = buildSweepUrl("/api/sweep/summary", {});
    const summary = await fetchJson<{
        total_configs: number;
        campaigns: number;
        last_sweep: string | null;
        best_score: number | null;
    }>(summaryUrl);

    if (!bestResp.configs.length) {
        return {
            available: false,
            sweep_run: null,
            sensitivity: [],
            surface: null,
            kpis: {
                best_config_id: null,
                best_pnl: null,
                baseline_pnl: null,
                delta_vs_baseline: null,
            },
        };
    }

    // Compute sensitivity from configs
    const sensitivity = computeSensitivityFromA1(bestResp.configs);

    // Get top config
    const topConfig = bestResp.configs[0];
    const bestPnl = topConfig?.pnl_total ?? topConfig?.score ?? null;

    // Compute baseline (median)
    const allPnls = bestResp.configs
        .map((c) => c.pnl_total ?? c.score ?? 0)
        .sort((a, b) => a - b);
    const baselinePnl = allPnls.length
        ? allPnls[Math.floor(allPnls.length / 2)]
        : null;

    return {
        available: true,
        sweep_run: {
            sweep_run_id: topConfig?.config_id ?? "latest",
            created_at: summary.last_sweep ?? new Date().toISOString(),
            signals_total: summary.total_configs,
        },
        sensitivity,
        surface: null,  // TODO: compute 3D surface from A1 data
        kpis: {
            best_config_id: topConfig?.config_id ?? null,
            best_pnl: bestPnl,
            baseline_pnl: baselinePnl,
            delta_vs_baseline:
                bestPnl !== null && baselinePnl !== null
                    ? `${(bestPnl - baselinePnl).toFixed(2)}p`
                    : null,
        },
    };
}

/**
 * Compute sensitivity from A1 sweep configs
 */
function computeSensitivityFromA1(
    configs: Array<{ param_json?: string; pnl_total?: number; score?: number }>
): Array<{ param: string; delta_pnl: number; sample_size: number }> {
    if (!configs.length) return [];

    // Parse param_json to extract parameter values
    const paramValues: Record<string, number[]> = {};
    const outcomes: number[] = [];

    for (const cfg of configs) {
        const pnl = cfg.pnl_total ?? cfg.score ?? 0;
        outcomes.push(pnl);

        if (cfg.param_json) {
            try {
                const params = JSON.parse(cfg.param_json);
                for (const [key, value] of Object.entries(params)) {
                    if (typeof value === "number") {
                        if (!paramValues[key]) paramValues[key] = [];
                        paramValues[key].push(value);
                    }
                }
            } catch {
                // Skip invalid JSON
            }
        }
    }

    if (!outcomes.length) return [];

    // Compute baseline
    const baseline = outcomes.reduce((a, b) => a + b, 0) / outcomes.length;

    // For each param, compute correlation with outcome
    const sensitivity: Array<{ param: string; delta_pnl: number; sample_size: number }> = [];

    for (const [param, values] of Object.entries(paramValues)) {
        if (values.length < 5) continue;  // Need enough samples

        // Simple sensitivity: compare high vs low halves
        const sorted = values
            .map((v, i) => ({ v, pnl: outcomes[i] }))
            .sort((a, b) => a.v - b.v);

        const midpoint = Math.floor(sorted.length / 2);
        const lowHalf = sorted.slice(0, midpoint);
        const highHalf = sorted.slice(midpoint);

        const avgLow = lowHalf.reduce((s, x) => s + x.pnl, 0) / lowHalf.length;
        const avgHigh = highHalf.reduce((s, x) => s + x.pnl, 0) / highHalf.length;

        sensitivity.push({
            param,
            delta_pnl: avgHigh - avgLow,
            sample_size: values.length,
        });
    }

    // Sort by absolute impact
    sensitivity.sort((a, b) => Math.abs(b.delta_pnl) - Math.abs(a.delta_pnl));

    return sensitivity.slice(0, 10);  // Top 10 params
}

// =============================================================================
// FALLBACK - Legacy endpoints (until V1 API is deployed)
// =============================================================================

/**
 * Temporary: fetch from existing endpoints and transform
 * This allows the UI to work before the new API is deployed
 *
 * Note: Market profile is time-series data, not run-scoped.
 * The scope here controls how much data to fetch (time window).
 */
export async function getMarketConditionsFallback(
    _runId: string | undefined,  // Not used for market data (global)
    scope: Scope
): Promise<MarketConditionsResponse> {
    // Limit based on scope (assuming ~12 bars/hour for 5s data)
    // TODAY: ~24h = 288 bars, 7D: ~500 bars (downsampled), 30D: ~500 bars (downsampled)
    const limit = scope === "TODAY" ? 300 : 500;
    const url = buildUrl("/api/market/profile", { limit });

    try {
        const data = await fetchJson<any[]>(url);

        // Transform to new format
        const timeline: SpreadPoint[] = data.map((row) => ({
            ts: row.timestamp,
            spread_pips: row.spread_pips ?? 0,
            session: inferSession(row.timestamp),
            vol_regime: row.volatility_regime || "NORMAL",
        }));

        // Backend returns chronological series (oldest -> newest). Use the latest point
        // for freshness/regime "current" metrics; otherwise we end up reporting stale data.
        const latestRow = data.length ? data[data.length - 1] : null;
        const latestTs = timeline.length ? timeline[timeline.length - 1].ts : null;

        const avgSpread = timeline.length
            ? timeline.reduce((sum, p) => sum + p.spread_pips, 0) / timeline.length
            : 0;

        const regimeCounts: Record<string, number> = {};
        data.forEach((row) => {
            const r = row.volatility_regime || "UNKNOWN";
            regimeCounts[r] = (regimeCounts[r] || 0) + 1;
        });
        const total = data.length || 1;
        const regimePcts: Record<string, number> = {};
        Object.entries(regimeCounts).forEach(([k, v]) => {
            regimePcts[k] = v / total;
        });

        let barAge = 9999;
        if (latestTs) {
            const t = Date.parse(latestTs);
            if (!Number.isNaN(t)) {
                barAge = Math.floor((Date.now() - t) / 1000);
            }
        }

        return {
            spread_timeline: timeline.slice(-200),
            spread_quantiles: { p50: avgSpread, p90: avgSpread, p95: avgSpread, p99: avgSpread },
            spread_histogram: { bin_edges: [], counts: [], density: [] },
            vol_regime: {
                current: (latestRow?.volatility_regime as any) || "NORMAL",
                last_24h: regimePcts,
            },
            session_breakdown: [],
            freshness: {
                last_bar_ts: latestTs || new Date().toISOString(),
                bar_age_seconds: barAge,
                status: barAge < 30 ? "FRESH" : barAge < 120 ? "STALE" : "OFFLINE",
            },
            kpis: {
                avg_spread_24h: avgSpread,
                tradable: avgSpread < 0.5 && barAge < 60,
                spread_breach_pct: 0,
                total_bars: data.length,
            },
        };
    } catch {
        // Return empty state
        return {
            spread_timeline: [],
            spread_quantiles: { p50: 0, p90: 0, p95: 0, p99: 0 },
            spread_histogram: { bin_edges: [], counts: [], density: [] },
            vol_regime: { current: "NORMAL", last_24h: {} },
            session_breakdown: [],
            freshness: {
                last_bar_ts: new Date().toISOString(),
                bar_age_seconds: 9999,
                status: "OFFLINE",
            },
            kpis: { avg_spread_24h: 0, tradable: false, spread_breach_pct: 0, total_bars: 0 },
        };
    }
}

export async function getRegimeHeatmap(scope: Scope): Promise<RegimeHeatmapResponse> {
    const limit =
        scope === "TODAY"
            ? 360 // ~30 minutes
            : scope === "7D"
                ? 720
                : 720;
    const url = buildUrl("/api/market/regime_heatmap", { limit });
    return fetchJson<RegimeHeatmapResponse>(url);
}

export async function getDataQualityHealth(runId: string | undefined, scope: Scope): Promise<DataQualityHealth> {
    const url = buildUrl("/api/data_quality/health", { run_id: runId, scope });
    return fetchJson<DataQualityHealth>(url);
}

export async function getDataQualityAnomalies(): Promise<DataQualityAnomalies> {
    const url = buildUrl("/api/data_quality/anomalies", {});
    return fetchJson<DataQualityAnomalies>(url);
}

export async function getDataQualityMatrix(): Promise<DataQualityMatrix> {
    const url = buildUrl("/api/data_quality/matrix", { limit: 720 });
    return fetchJson<DataQualityMatrix>(url);
}

/**
 * Convert frontend scope to backend-compatible date range
 */
interface ScopeResolution {
    backendScope: string;
    from_date?: string;
    to_date?: string;
    useRunId: boolean;
}

function scopeToDateRange(scope: Scope, epochStartedAt?: string | null): ScopeResolution {
    const today = new Date();

    switch (scope) {
        case "TODAY": {
            const day = today.toISOString().split("T")[0];
            return {
                backendScope: "TODAY",
                from_date: day,
                to_date: day,
                useRunId: false,
            };
        }
        case "YESTERDAY": {
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const day = yesterday.toISOString().split("T")[0];
            return {
                backendScope: "YESTERDAY",
                from_date: day,
                to_date: day,
                useRunId: false,
            };
        }
        case "7D": {
            const from = new Date(today);
            from.setDate(from.getDate() - 6);
            return {
                backendScope: "RANGE",
                from_date: from.toISOString().split("T")[0],
                to_date: today.toISOString().split("T")[0],
                useRunId: false,
            };
        }
        case "30D": {
            const from = new Date(today);
            from.setDate(from.getDate() - 29);
            return {
                backendScope: "RANGE",
                from_date: from.toISOString().split("T")[0],
                to_date: today.toISOString().split("T")[0],
                useRunId: false,
            };
        }
        case "EPOCH": {
            return {
                backendScope: "EPOCH",
                useRunId: false,
            };
        }
        case "RUN":
            return {
                backendScope: "RUN",
                useRunId: true,
            };
        case "BACKTEST":
            return {
                backendScope: "RUN",
                useRunId: true,
            };
        default:
            return { backendScope: "TODAY", useRunId: false };
    }
}

export { scopeToDateRange };

export function buildQuantScopeParams(
    scope: Scope,
    runId: string | null | undefined,
    strategyId: string | null | undefined,
    opts?: {
        portfolioEpoch?: number | null;
        epochStartedAt?: string | null;
    }
): {
    params: Record<string, unknown>;
    useRunId: boolean;
    missingRunId: boolean;
} {
    const { backendScope, from_date, to_date, useRunId } = scopeToDateRange(
        scope,
        opts?.epochStartedAt
    );
    const params: Record<string, unknown> = {
        scope: backendScope,
    };
    if (from_date) params.from_date = from_date;
    if (to_date) params.to_date = to_date;
    if (useRunId && runId) {
        params.run_id = runId;
    }
    if (strategyId) {
        params.strategy_id = strategyId;
    }
    // Pass portfolio_epoch for EPOCH scope filtering
    if (scope === "EPOCH" && opts?.portfolioEpoch != null) {
        params.portfolio_epoch = opts.portfolioEpoch;
    }
    return {
        params,
        useRunId,
        missingRunId: useRunId && !runId,
    };
}

function withSourceMeta<T extends object>(
    payload: T,
    source: QuantDataSource,
    fallbackUsed: boolean,
    warnings: string[] = []
): T & { meta: QuantMetaStandard } {
    const currentMeta =
        payload && typeof payload === "object" && "meta" in payload
            ? (payload as Record<string, unknown>).meta
            : null;
    const baseMeta =
        currentMeta && typeof currentMeta === "object"
            ? (currentMeta as Record<string, unknown>)
            : {};
    return {
        ...payload,
        meta: {
            ...baseMeta,
            data_source: source,
            fallback_used: fallbackUsed,
            warnings: [
                ...((baseMeta.warnings as string[] | undefined) || []),
                ...warnings,
            ],
        },
    };
}

function mapRegistrySignalPoint(s: any): SignalPoint {
    return {
        signal_id: s.signal_id || s.timestamp,
        ts: s.timestamp || s.ts,
        amplitude_pips:
            s.shock_magnitude_pips ??
            s.shock_magnitude ??
            s.amplitude_pips ??
            s.atr_pips ??
            null,
        net_outcome_pips: s.final_pnl_pips ?? s.net_outcome_pips ?? null,
        sim_outcome: s.sim_outcome ?? null,
        sim_valid: s.sim_valid ?? null,
        sim_verdict: s.sim_verdict ?? null,
        sim_profitable: s.sim_profitable ?? null,
        sim_anchor_ts: s.sim_anchor_ts ?? s.decision_ts ?? null,
        sim_tp_after_decision: s.sim_tp_after_decision ?? null,
        sim_pnl_pips: s.sim_pnl_pips ?? null,
        sim_pnl_usd: s.sim_pnl_usd ?? null,
        sim_mfe_pips: s.sim_mfe_pips ?? null,
        sim_mae_pips: s.sim_mae_pips ?? null,
        sim_quality: s.sim_quality ?? null,
        accepted:
            s.accepted === 1 || s.accepted === true
                ? true
                : s.accepted === 0 || s.accepted === false
                    ? false
                    : true,
        rejection_reason: s.rejection_reason ?? null,
        run_id: s.run_id ?? null,
        session: normalizeSignalSession(s.session) || inferSession(s.timestamp || s.ts),
        regime: normalizeVolRegime(s.volatility_regime || s.regime),
    };
}

export async function getSignalQualityFallback(
    runId: string | undefined,
    strategyId: string | undefined,
    scope: Scope,
    side: Side
): Promise<SignalQualityResponse> {
    const MAX_ABS_PIPS = 50; // hard cap for corrupted outcomes
    const OUTLIER_THRESHOLD = 10; // used for lab charts (Edge Scatter)
    const epoch = await getCurrentPortfolioEpoch();
    const { backendScope, from_date, to_date, useRunId } = scopeToDateRange(scope);

    // For RUN scope, run_id is required
    if (useRunId && !runId) {
        return {
            signals: [],
            funnel: { total: 0, accepted: 0, traded: 0, profitable: 0 },
            heatmap: [],
            kpis: {
                accept_rate: 0,
                avg_net: 0,
                traded_count: 0,
                median_net: 0,
                p25_net: 0,
                p75_net: 0,
                iqr_net: 0,
                outlier_count: 0,
                best_combo: null,
            },
        };
    }

    const limit = 500;
    // Only pass run_id when useRunId is true (RUN scope)
    const params: Record<string, unknown> = {
        limit,
    };
    if (useRunId) {
        params.scope = backendScope;
    } else {
        params.scope = backendScope;
        params.include_all_signals = true;
    }
    if (from_date) params.from_date = from_date;
    if (to_date) params.to_date = to_date;
    if (epoch !== null && !useRunId) {
        params.portfolio_epoch = epoch;
    }
    if (runId && useRunId) {
        params.run_id = runId;
    }
    if (strategyId) {
        params.strategy_id = strategyId;
    }
    const url = useRunId
        ? buildUrl("/api/signals", params)
        : buildUrl("/api/portfolio/signals", params);

    try {
        // API returns { _meta: {...}, signals: [...] }
        const response = await fetchJson<{ signals: any[]; _meta?: any }>(url);
        const data = response.signals || [];

        const signals: SignalPoint[] = data
            .map((s) => ({
                signal_id: s.signal_id || s.timestamp,
                ts: s.timestamp,
                // Use shock magnitude when available (canonical signals)
                amplitude_pips:
                    s.shock_magnitude_pips ??
                    s.shock_magnitude ??
                    s.amplitude_pips ??
                    s.atr_pips ??
                    null,
                // Use enriched final_pnl_pips from canonical_trades join
                net_outcome_pips: s.final_pnl_pips,
                sim_outcome: s.sim_outcome ?? null,
                sim_valid: s.sim_valid ?? null,
                sim_verdict: s.sim_verdict ?? null,
                sim_profitable: s.sim_profitable ?? null,
                sim_anchor_ts: s.sim_anchor_ts ?? null,
                sim_tp_after_decision: s.sim_tp_after_decision ?? null,
                sim_pnl_pips: s.sim_pnl_pips ?? null,
                sim_pnl_usd: s.sim_pnl_usd ?? null,
                sim_mfe_pips: s.sim_mfe_pips ?? null,
                sim_mae_pips: s.sim_mae_pips ?? null,
                sim_quality: s.sim_quality ?? null,
                accepted: s.accepted === 1 || s.accepted === true ? true : s.accepted === 0 || s.accepted === false ? false : true,
                rejection_reason: s.rejection_reason,
                run_id: s.run_id ?? null,
                session: normalizeSignalSession(s.session) || inferSession(s.timestamp),
                regime: normalizeVolRegime(s.volatility_regime || s.regime),
            }))
            .filter((s) => {
                if (s.net_outcome_pips == null) return true;
                return Math.abs(s.net_outcome_pips) <= MAX_ABS_PIPS;
            });

        // Filter by side
        const filtered = side === "ALL"
            ? signals
            : signals.filter((s) => {
                const dir = (data.find((d) => d.timestamp === s.ts)?.direction || "").toUpperCase();
                return dir === side;
            });

        // Compute funnel
        const total = filtered.length;
        const accepted = filtered.filter((s) => s.accepted).length;
        const traded = filtered.filter((s) => s.net_outcome_pips != null).length;
        const profitable = filtered.filter((s) => (s.net_outcome_pips ?? 0) > 0).length;

        // Compute heatmap
        const heatmapMap: Record<string, { sum: number; count: number }> = {};
        filtered.forEach((s) => {
            if (s.net_outcome_pips == null) return;
            const key = `${s.session}|${s.regime}`;
            if (!heatmapMap[key]) heatmapMap[key] = { sum: 0, count: 0 };
            heatmapMap[key].sum += s.net_outcome_pips;
            heatmapMap[key].count += 1;
        });
        const heatmap: HeatmapCell[] = Object.entries(heatmapMap).map(([key, v]) => {
            const [session, regime] = key.split("|");
            return { session, regime, avg_net: v.sum / v.count, count: v.count };
        });

        const tradedSignals = filtered.filter((s) => s.net_outcome_pips != null);
        const nets = tradedSignals.map((s) => s.net_outcome_pips ?? 0);
        const avgNet = tradedSignals.length > 0
            ? nets.reduce((sum, v) => sum + v, 0) / tradedSignals.length
            : 0;

        const quantile = (arr: number[], q: number): number => {
            if (!arr.length) return 0;
            const sorted = [...arr].sort((a, b) => a - b);
            const pos = (sorted.length - 1) * q;
            const base = Math.floor(pos);
            const rest = pos - base;
            if (sorted[base + 1] !== undefined) {
                return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
            }
            return sorted[base];
        };

        const p25 = quantile(nets, 0.25);
        const p50 = quantile(nets, 0.5);
        const p75 = quantile(nets, 0.75);
        const iqr = p75 - p25;
        const outlierCount = nets.filter((v) => Math.abs(v) > OUTLIER_THRESHOLD).length;

        const best = heatmap.length
            ? heatmap.reduce((a, b) => (a.avg_net > b.avg_net ? a : b))
            : null;

        return {
            signals: filtered,
            funnel: { total, accepted, traded, profitable },
            heatmap,
            kpis: {
                accept_rate: total > 0 ? accepted / total : 0,
                avg_net: avgNet,
                traded_count: tradedSignals.length,
                median_net: p50,
                p25_net: p25,
                p75_net: p75,
                iqr_net: iqr,
                outlier_count: outlierCount,
                best_combo: best ? { session: best.session, regime: best.regime } : null,
            },
        };
    } catch {
        return {
            signals: [],
            funnel: { total: 0, accepted: 0, traded: 0, profitable: 0 },
            heatmap: [],
            kpis: {
                accept_rate: 0,
                avg_net: 0,
                traded_count: 0,
                median_net: 0,
                p25_net: 0,
                p75_net: 0,
                iqr_net: 0,
                outlier_count: 0,
                best_combo: null,
            },
        };
    }
}

export async function getDampingWaveMissedOpportunities(
    runId: string,
    clusterWindowS = 5,
): Promise<DampingWaveMissedOpportunitiesResponse> {
    const url = buildUrl("/api/registry/signals/missed-opportunities", {
        run_id: runId,
        strategy_id: "damping_wave",
        cluster_window_s: clusterWindowS,
    });
    const response = await fetchJsonCached<
        Omit<DampingWaveMissedOpportunitiesResponse, "signals"> & { signals: any[] }
    >(url, 30_000);
    return {
        ...response,
        signals: (response.signals || []).map((signal) => mapRegistrySignalPoint(signal)),
    };
}

export async function getTradePerformanceFallback(
    runId: string | undefined,
    strategyId: string | undefined,
    scope: Scope
): Promise<TradePerformanceResponse> {
    const { backendScope, from_date, to_date, useRunId } = scopeToDateRange(scope);

    // For RUN scope, run_id is required
    if (useRunId && !runId) {
        return {
            equity_curve: [],
            trades: [],
            distribution: { bins: [], counts: [] },
            kpis: {
                total_pnl: 0,
                total_pnl_usd: 0,
                max_drawdown: 0,
                win_rate: 0,
                profit_factor: 0,
                sharpe_proxy: 0,
                trade_count: 0,
            },
        };
    }

    // Build URL with proper scope
    const params: Record<string, unknown> = {
        limit: 200,
        commission_view: "economic",
        scope: backendScope,
    };
    const epoch = await getCurrentPortfolioEpoch();
    if (epoch !== null) {
        params.portfolio_epoch = epoch;
    }
    if (from_date) {
        params.from_date = from_date;
    }
    if (to_date) {
        params.to_date = to_date;
    }
    if (useRunId && runId) {
        params.run_id = runId;
        if (strategyId) params.strategy_id = strategyId;
        // scope=RUN means filter by run_id only
    } else {
        // Cross-run mode: use portfolio trades endpoint (epoch-scoped)
        if (strategyId) params.strategy_id = strategyId;
    }
    const url = useRunId && runId
        ? buildUrl("/api/canonical/trades", params)
        : buildUrl("/api/portfolio/trades", params);

    try {
        // API returns { trades: [...], count: N }
        const response = await fetchJson<{ trades: any[]; count?: number }>(url);
        const rawData = response.trades || [];

        const normalizeNetPips = (t: any): number => {
            const net =
                t.net_pips_used ??
                t.pnl_net_pips ??
                t.net_pips ??
                t.pnl_pips ??
                0;
            return typeof net === "number" && Number.isFinite(net) ? net : 0;
        };

        const normalizeNetUsd = (t: any): number => {
            const usd =
                t.pnl_net_usd_used ??
                t.pnl_net_usd ??
                t.pnl_gross_usd_used ??
                t.pnl_gross_usd ??
                0;
            return typeof usd === "number" && Number.isFinite(usd) ? usd : 0;
        };

        // Filter out corrupted trades (impossible PnL values)
        // A single EURUSD trade should never exceed ~500 pips (~5 EUR/pip movement)
        const MAX_REASONABLE_PIPS = 500;
        const data = rawData
            .filter((t) => Math.abs(normalizeNetPips(t)) < MAX_REASONABLE_PIPS)
            .sort((a, b) => {
                const tA = a.entry_time || a.exit_time || "";
                const tB = b.entry_time || b.exit_time || "";
                return tA < tB ? -1 : tA > tB ? 1 : 0;
            });

        // Build equity curve (data is now chronological, oldest first)
        let cumPnl = 0;
        let maxPnl = 0;
        const equity: EquityPoint[] = data.map((t) => {
            const pnl = normalizeNetPips(t);
            cumPnl += pnl;
            maxPnl = Math.max(maxPnl, cumPnl);
            const dd = maxPnl > 0 ? cumPnl - maxPnl : 0;
            return {
                ts: t.entry_time,
                cumulative_pnl: cumPnl,
                drawdown: dd,
            };
        });

        // Trade points
        const trades: TradePoint[] = data.map((t, i) => {
            const netPips = normalizeNetPips(t);
            const mae =
                typeof t.mae_pips === "number"
                    ? Math.abs(t.mae_pips)
                    : null;
            const mfe =
                typeof t.mfe_pips === "number"
                    ? t.mfe_pips
                    : null;

            return {
                trade_id: t.trade_id || `t_${i}`,
                pnl_pips: netPips,
                mae_pips: mae,
                mfe_pips: mfe,
                hold_seconds: t.holding_s ?? t.hold_seconds ?? 0,
            };
        });

        // Distribution
        const pnlValues = trades.map((t) => t.pnl_pips);
        const minPnl = Math.min(0, ...pnlValues);
        const maxPnlVal = Math.max(0, ...pnlValues);
        const binCount = 10;
        const binSize = (maxPnlVal - minPnl) / binCount || 1;
        const bins: number[] = [];
        const counts: number[] = [];
        for (let i = 0; i < binCount; i++) {
            bins.push(minPnl + i * binSize);
            counts.push(0);
        }
        pnlValues.forEach((v) => {
            const idx = Math.min(Math.floor((v - minPnl) / binSize), binCount - 1);
            counts[idx]++;
        });

        // KPIs
        const wins = trades.filter((t) => t.pnl_pips > 0);
        const losses = trades.filter((t) => t.pnl_pips <= 0);
        const totalPnl = trades.reduce((s, t) => s + t.pnl_pips, 0);
        // Sum EUR PnL from normalized net values
        const totalPnlUsd = data.reduce((s, t) => s + normalizeNetUsd(t), 0);
        const grossProfit = wins.reduce((s, t) => s + t.pnl_pips, 0);
        const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl_pips, 0));
        const pf = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
        const maxDd = Math.min(0, ...equity.map((e) => e.drawdown));

        return {
            equity_curve: equity,
            trades,
            distribution: { bins, counts },
            kpis: {
                total_pnl: totalPnl,
                total_pnl_usd: totalPnlUsd,
                max_drawdown: maxDd,
                win_rate: trades.length > 0 ? wins.length / trades.length : 0,
                profit_factor: pf,
                sharpe_proxy: 0, // Would need returns std
                trade_count: trades.length,
            },
        };
    } catch {
        return {
            equity_curve: [],
            trades: [],
            distribution: { bins: [], counts: [] },
            kpis: {
                total_pnl: 0,
                total_pnl_usd: 0,
                max_drawdown: 0,
                win_rate: 0,
                profit_factor: 0,
                sharpe_proxy: 0,
                trade_count: 0,
            },
        };
    }
}

export async function getMarketConditionsV3First(
    runId: string | undefined,
    scope: Scope
): Promise<MarketConditionsResponse> {
    void runId;
    return getMarketConditions({ scope });
}

export async function getSignalQualityV3First(
    runId: string | undefined,
    strategyId: string | undefined,
    scope: Scope,
    side: Side
): Promise<SignalQualityResponse> {
    const epoch = await getCurrentPortfolioEpoch();
    const { params, missingRunId } = buildQuantScopeParams(scope, runId, strategyId, {
        portfolioEpoch: epoch,
    });
    if (missingRunId) {
        throw new Error("run_id requis pour scope RUN");
    }
    return getSignalQuality({
        ...(params as BaseParams & { side?: Side; limit?: number }),
        side,
    });
}

export async function getTradePerformanceV3First(
    runId: string | undefined,
    strategyId: string | undefined,
    scope: Scope
): Promise<TradePerformanceResponse> {
    const epoch = await getCurrentPortfolioEpoch();
    const { params, missingRunId } = buildQuantScopeParams(scope, runId, strategyId, {
        portfolioEpoch: epoch,
    });
    if (missingRunId) {
        throw new Error("run_id requis pour scope RUN");
    }
    return getTradePerformance(params as BaseParams & { limit?: number });
}

export interface QuantV3Request {
    scope: Scope;
    runId?: string | null;
    strategyId?: string | null;
    portfolioEpoch?: number | null;
}

export interface DataQualitySummaryResponse {
    overview: {
        overall_score: number;
        state: "OK" | "WARNING" | "CRITICAL";
        dbs_total: number;
        dbs_ok: number;
        dbs_warning: number;
        dbs_critical: number;
        critical_actions: number;
        logging_score: number;
        ml_verdict: "READY" | "READY_WITH_EXCLUSIONS" | "NOT_READY";
        link_mismatches: number;
    };
    db_statuses: Record<
        string,
        {
            db_id: string;
            filename: string;
            path: string;
            exists: boolean;
            size_bytes: number;
            status: "OK" | "WARNING" | "CRITICAL";
            selected_table: string | null;
            row_count: number;
            missing_critical_columns: string[];
            missing_indexes: string[];
            warnings: string[];
            columns: Array<{
                name: string;
                level: "required" | "conditional" | "optional";
                present: boolean;
                fill_rate: number;
                applicable_rows: number;
                non_null_rows: number;
                null_rows: number;
                empty_rows: number;
                sentinel_rows: number;
                invalid_rows: number;
                status: "OK" | "WARNING" | "CRITICAL" | "INFO";
                issue: string | null;
            }>;
        }
    >;
    table_completeness: {
        tables: Array<{
            db_id: string;
            filename: string;
            table: string | null;
            status: "OK" | "WARNING" | "CRITICAL";
            row_count: number;
            missing_critical_columns: string[];
            missing_indexes: string[];
            columns: DataQualitySummaryResponse["db_statuses"][string]["columns"];
        }>;
    };
    linkage_health: {
        metrics: Record<
            string,
            {
                count: number;
                severity: "WARNING" | "CRITICAL";
                sample_ids: string[];
            }
        >;
        suspicious_runs: Array<{
            run_id: string;
            accepted_signals: number;
            claimed_traded: number;
            actual_trades: number;
            claim_gap: number;
        }>;
    };
    logging_quality: {
        score: number;
        summary: {
            critical_issues: number;
            warning_issues: number;
            columns_audited: number;
        };
        issues: Array<{
            db_id: string;
            table: string | null;
            column: string;
            level: "required" | "conditional" | "optional";
            status: "WARNING" | "CRITICAL";
            fill_rate: number;
            applicable_rows: number;
            null_rows: number;
            invalid_rows: number;
            issue: string | null;
        }>;
    };
    ml_readiness: {
        verdict: "READY" | "READY_WITH_EXCLUSIONS" | "NOT_READY";
        scores: {
            feature_completeness: number;
            label_reliability: number;
            coverage: number;
            governance: number;
            trust: number;
        };
        blockers: string[];
        exclusion_count: number;
        notes: string[];
    };
    outliers: {
        checks: Array<{
            check: string;
            table: string;
            column: string;
            count: number;
            severity: "WARNING" | "CRITICAL";
            sample_ids: string[];
        }>;
        suspicious_runs: Array<Record<string, unknown>>;
    };
    action_queue: Array<{
        code: string;
        severity: "WARNING" | "CRITICAL";
        count: number;
        auto_fix: boolean;
        title: string;
        action: string;
    }>;
    drilldown?: {
        selected_run_id: string | null;
        selected_strategy_id: string | null;
        runs: Array<{
            run_id: string | null;
            strategy_id: string | null;
            overall_score: number;
            state: "OK" | "WARNING" | "CRITICAL";
            ml_verdict: "READY" | "READY_WITH_EXCLUSIONS" | "NOT_READY";
            logging_score: number;
            dbs_critical: number;
            dbs_warning: number;
            link_mismatches: number;
            accepted_without_trade: number;
            trade_signal_orphans: number;
            orphan_exec_trades: number;
            shock_missing_trade_ref: number;
            action_count: number;
        }>;
        strategies: Array<{
            run_id: string | null;
            strategy_id: string | null;
            overall_score: number;
            state: "OK" | "WARNING" | "CRITICAL";
            ml_verdict: "READY" | "READY_WITH_EXCLUSIONS" | "NOT_READY";
            logging_score: number;
            dbs_critical: number;
            dbs_warning: number;
            link_mismatches: number;
            accepted_without_trade: number;
            trade_signal_orphans: number;
            orphan_exec_trades: number;
            shock_missing_trade_ref: number;
            action_count: number;
        }>;
    };
    meta?: QuantMetaStandard;
}

function buildQuantV3RequestParams(
    request: QuantV3Request
): { params: Record<string, unknown>; missingRunId: boolean } {
    const { params, missingRunId } = buildQuantScopeParams(
        request.scope,
        request.runId,
        request.strategyId
    );
    if (request.portfolioEpoch != null) {
        params.portfolio_epoch = request.portfolioEpoch;
    }
    return { params, missingRunId };
}

export async function getQuantFunnelFull(
    request: QuantV3Request
): Promise<Record<string, unknown>> {
    const { params, missingRunId } = buildQuantV3RequestParams(request);
    if (missingRunId) {
        throw new Error("run_id requis pour scope RUN");
    }
    const url = buildUrl("/api/quant/funnel/full", params);
    return fetchJson<Record<string, unknown>>(url);
}

export async function getQuantRegimeHeatmap(
    request: QuantV3Request & {
        x_dimension: string;
        y_dimension: string;
        metric: string;
    }
): Promise<Record<string, unknown>> {
    const { params, missingRunId } = buildQuantV3RequestParams(request);
    if (missingRunId) {
        throw new Error("run_id requis pour scope RUN");
    }
    const url = buildUrl("/api/quant/regime/heatmap", {
        ...params,
        x_dimension: request.x_dimension,
        y_dimension: request.y_dimension,
        metric: request.metric,
    });
    return fetchJson<Record<string, unknown>>(url);
}

export async function getQuantRegimeSlices(
    request: QuantV3Request & { dimension: string }
): Promise<Record<string, unknown>> {
    const { params, missingRunId } = buildQuantV3RequestParams(request);
    if (missingRunId) {
        throw new Error("run_id requis pour scope RUN");
    }
    const url = buildUrl("/api/quant/regime/slices", {
        ...params,
        dimension: request.dimension,
    });
    return fetchJson<Record<string, unknown>>(url);
}

export async function getQuantRegimesDashboard(
    request: QuantV3Request
): Promise<RegimesDashboardResponse> {
    const { params, missingRunId } = buildQuantV3RequestParams(request);
    if (missingRunId) {
        throw new Error("run_id requis pour scope RUN");
    }
    const url = buildUrl("/api/quant/regimes/dashboard", params);
    return fetchJson<RegimesDashboardResponse>(url);
}

export async function getQuantSlippageReport(
    request: QuantV3Request & {
        limit?: number;
        include_open?: boolean;
        include_anomalies?: boolean;
    }
): Promise<Record<string, unknown>> {
    const { params, missingRunId } = buildQuantV3RequestParams(request);
    if (missingRunId) {
        throw new Error("run_id requis pour scope RUN");
    }
    const url = buildUrl("/api/quant/slippage/report", {
        ...params,
        limit: request.limit ?? 250,
        include_open: request.include_open ?? true,
        include_anomalies: request.include_anomalies ?? false,
    });
    return fetchJson<Record<string, unknown>>(url);
}

export async function getQuantDataQualityCoverage(
    request: QuantV3Request & { limit?: number }
): Promise<Record<string, unknown>> {
    const { params, missingRunId } = buildQuantV3RequestParams(request);
    if (missingRunId) {
        throw new Error("run_id requis pour scope RUN");
    }
    const url = buildUrl("/api/data_quality/coverage", {
        ...params,
        limit: request.limit ?? 20,
    });
    return fetchJson<Record<string, unknown>>(url);
}

export async function getQuantDataQualityInvariants(
    request: QuantV3Request & { limit?: number; severity?: string | null }
): Promise<Record<string, unknown>> {
    const { params, missingRunId } = buildQuantV3RequestParams(request);
    if (missingRunId) {
        throw new Error("run_id requis pour scope RUN");
    }
    const url = buildUrl("/api/data_quality/invariants", {
        ...params,
        limit: request.limit ?? 20,
        severity: request.severity ?? undefined,
    });
    return fetchJson<Record<string, unknown>>(url);
}

export async function getQuantDataQualityAnomalies(
    request: QuantV3Request & {
        limit?: number;
        include_excluded?: boolean;
    }
): Promise<Record<string, unknown>> {
    const { params, missingRunId } = buildQuantV3RequestParams(request);
    if (missingRunId) {
        throw new Error("run_id requis pour scope RUN");
    }
    const url = buildUrl("/api/data_quality/anomalies", {
        ...params,
        limit: request.limit ?? 20,
        include_excluded: request.include_excluded ?? false,
    });
    return fetchJson<Record<string, unknown>>(url);
}

export async function getQuantDataQualitySummary(
    request: QuantV3Request & { limit?: number; include_drilldown?: boolean }
): Promise<DataQualitySummaryResponse> {
    const { params, missingRunId } = buildQuantV3RequestParams(request);
    if (missingRunId) {
        throw new Error("run_id requis pour scope RUN");
    }
    const url = buildUrl("/api/data_quality/summary", {
        ...params,
        limit: request.limit ?? 20,
        include_drilldown: request.include_drilldown ?? false,
    });
    return fetchJson<DataQualitySummaryResponse>(url);
}

export async function getParameterTuningFallback(
    params: {
        sweep_run_id?: string;
        scope_type?: "ROLLING" | "DAY";
        scope_key?: string;
        limit?: number;
    }
): Promise<ParameterTuningResponse> {
    const safeFetch = async (url: string) => {
        try {
            return await fetchJson<any>(url);
        } catch {
            return null;
        }
    };

    try {
        // Try requested scope first, but don't fail hard on 404/503
        const primarySummaryUrl = buildResearchUrl("/api/research/sweep/summary_v2", {
            sweep_run_id: params.sweep_run_id,
            scope_type: params.scope_type,
            scope_key: params.scope_key,
        });
        let summary = await safeFetch(primarySummaryUrl);

        // Fallback to latest SUCCESS (prefer DAY) if the requested scope is empty
        if (
            !summary?.run ||
            summary.available === false ||
            summary.run.status !== "SUCCESS"
        ) {
            const status = await safeFetch(
                buildResearchUrl("/api/research/sweep/status_v2", {})
            );
            const candidates = [
                status?.latest_by_scope?.DAY,
                status?.latest_by_scope?.ROLLING,
                status?.latest_by_scope?.RUN,
                status?.latest_by_scope?.CAMPAIGN,
                status?.latest,
            ].filter(Boolean) as any[];
            const successWithData =
                candidates.find(
                    (c) =>
                        c.status === "SUCCESS" &&
                        (c.metrics_count === undefined || c.metrics_count > 0)
                ) ||
                candidates.find((c) => c.status === "SUCCESS");
            const candidate = successWithData || candidates[0] || null;

            if (candidate?.sweep_run_id) {
                summary = await safeFetch(
                    buildResearchUrl("/api/research/sweep/summary_v2", {
                        sweep_run_id: candidate.sweep_run_id,
                    })
                );
            }
        }

        // Check if sweep data is available
        if (!summary.run || summary.run.status !== "SUCCESS") {
            return {
                available: false,
                sweep_run: null,
                sensitivity: [],
                surface: null,
                kpis: {
                    best_config_id: null,
                    best_pnl: null,
                    baseline_pnl: null,
                    delta_vs_baseline: null,
                },
            };
        }

        // Fetch top configs for sensitivity analysis
        const configsUrl = buildResearchUrl("/api/research/sweep/configs_v2", {
            sweep_run_id: summary.run.sweep_run_id,
            order_by: "pnl_net_day",
            direction: "desc",
            limit: params.limit ?? 50,
        });
        const configsResp = await fetchJson<any>(configsUrl);
        const configs = configsResp.data || [];

        const baselineMedian = summary.stats?.p50 ?? 0;

        // Compute sensitivity from real params in extra_json (no synthetic data)
        const sensitivity = computeSensitivity(configs, baselineMedian);

        // Optional 3D surface if we have two varying params with enough support
        const surface = computeSurface(configs, baselineMedian);

        // Extract KPIs
        const topConfig = summary.top?.[0];
        const baselinePnl = summary.stats?.p50 ?? null;
        const bestPnl = topConfig?.pnl_net_day ?? null;

        const response: ParameterTuningResponse = {
            available: true,
            sweep_run: {
                sweep_run_id: summary.run.sweep_run_id,
                created_at: summary.run.created_at,
                signals_total: summary.run.signals_count ?? 0,
            },
            sensitivity,
            surface,
            kpis: {
                best_config_id: topConfig?.config_id ?? null,
                best_pnl: bestPnl,
                baseline_pnl: baselinePnl,
                delta_vs_baseline:
                    bestPnl != null && baselinePnl != null
                        ? `${bestPnl - baselinePnl > 0 ? "+" : ""}${(bestPnl - baselinePnl).toFixed(2)}p`
                        : null,
            },
        };
        return response;
    } catch {
        return {
            available: false,
            sweep_run: null,
            sensitivity: [],
            surface: null,
            kpis: {
                best_config_id: null,
                best_pnl: null,
                baseline_pnl: null,
                delta_vs_baseline: null,
            },
        };
    }
}

// =============================================================================
// HELPERS
// =============================================================================

function inferSession(ts: string): "ASIA" | "LONDON" | "NY" | "UNKNOWN" {
    const h = new Date(ts).getUTCHours();
    if (h >= 23 || h < 7) return "ASIA";
    if (h >= 7 && h < 13) return "LONDON";
    if (h >= 13 && h < 22) return "NY";
    return "UNKNOWN";
}

function normalizeSignalSession(
    session: string | null | undefined
): "ASIA" | "LONDON" | "OVERLAP" | "NY" | "UNKNOWN" | null {
    if (!session) return null;
    const normalized = String(session).trim().toUpperCase();
    if (normalized === "OVERLAP") return "OVERLAP";
    if (normalized === "ASIA" || normalized === "EARLY_ASIA") return "ASIA";
    if (normalized === "LONDON") return "LONDON";
    if (normalized === "NY" || normalized === "LATE_NY") return "NY";
    return "UNKNOWN";
}

function normalizeVolRegime(value: string | null | undefined): string {
    if (!value) return "UNKNOWN";
    const normalized = String(value).trim().toUpperCase();
    if (normalized === "EXTREME") return "HIGH";
    if (normalized === "MEDIUM") return "NORMAL";
    return normalized;
}

// Extract numeric params from extra_json blob
function flattenNumericParams(extra: any): Record<string, number> {
    const out: Record<string, number> = {};
    if (!extra || typeof extra !== "object") return out;
    const params = extra.params ?? extra;

    const walk = (obj: any, prefix: string) => {
        if (!obj || typeof obj !== "object") return;
        for (const [k, v] of Object.entries(obj)) {
            const key = prefix ? `${prefix}.${k}` : k;
            if (typeof v === "number" && Number.isFinite(v)) {
                out[key] = v;
            } else if (v && typeof v === "object" && !Array.isArray(v)) {
                walk(v, key);
            }
        }
    };

    walk(params, "");
    return out;
}

function computeSensitivity(configs: any[], baseline: number): SensitivityBar[] {
    const points: Record<string, { value: number; pnl: number }[]> = {};
    configs.forEach((cfg) => {
        const pnl = typeof cfg.pnl_net_day === "number" ? cfg.pnl_net_day : null;
        if (pnl === null) return;
        let extra: any = {};
        if (cfg.extra_json) {
            try {
                extra = JSON.parse(cfg.extra_json);
            } catch {
                extra = {};
            }
        }
        const params = flattenNumericParams(extra);
        Object.entries(params).forEach(([k, v]) => {
            if (!points[k]) points[k] = [];
            points[k].push({ value: v, pnl });
        });
    });

    const bars: SensitivityBar[] = [];
    Object.entries(points).forEach(([param, values]) => {
        if (values.length < 3) return;
        const sorted = values.sort((a, b) => a.value - b.value);
        const q = Math.max(1, Math.floor(sorted.length * 0.25));
        const low = sorted.slice(0, q);
        const high = sorted.slice(-q);
        const avg = (arr: { pnl: number }[]) =>
            arr.reduce((s, x) => s + x.pnl, 0) / arr.length;
        const delta = avg(high) - avg(low);
        if (Number.isFinite(delta)) {
            bars.push({ param, delta_pnl: delta });
        }
    });

    // Sort by absolute impact, keep top 10
    return bars
        .sort((a, b) => Math.abs(b.delta_pnl) - Math.abs(a.delta_pnl))
        .slice(0, 10);
}

function computeSurface(configs: any[], baseline: number): Surface3D | null {
    // Pick two params with the most variability
    const paramValues: Record<string, Set<number>> = {};
    configs.forEach((cfg) => {
        let extra: any = {};
        if (cfg.extra_json) {
            try {
                extra = JSON.parse(cfg.extra_json);
            } catch {
                extra = {};
            }
        }
        const params = flattenNumericParams(extra);
        Object.entries(params).forEach(([k, v]) => {
            if (!paramValues[k]) paramValues[k] = new Set<number>();
            paramValues[k].add(v);
        });
    });

    const ranked = Object.entries(paramValues)
        .map(([k, set]) => ({ key: k, count: set.size }))
        .filter((x) => x.count >= 3)
        .sort((a, b) => b.count - a.count);
    if (ranked.length < 2) return null;

    const p1 = ranked[0].key;
    const p2 = ranked[1].key;
    const xVals = Array.from(paramValues[p1]).sort((a, b) => a - b).slice(0, 8);
    const yVals = Array.from(paramValues[p2]).sort((a, b) => a - b).slice(0, 8);
    if (xVals.length < 3 || yVals.length < 3) return null;

    const grid: Record<string, number[]> = {};
    configs.forEach((cfg) => {
        const pnl = typeof cfg.pnl_net_day === "number" ? cfg.pnl_net_day : null;
        if (pnl === null) return;
        let extra: any = {};
        if (cfg.extra_json) {
            try {
                extra = JSON.parse(cfg.extra_json);
            } catch {
                extra = {};
            }
        }
        const params = flattenNumericParams(extra);
        const x = params[p1];
        const y = params[p2];
        if (x === undefined || y === undefined) return;
        const key = `${x}|${y}`;
        if (!grid[key]) grid[key] = [];
        grid[key].push(pnl);
    });

    const z: number[][] = yVals.map(() => xVals.map(() => baseline));
    yVals.forEach((yVal, yi) => {
        xVals.forEach((xVal, xi) => {
            const key = `${xVal}|${yVal}`;
            const vals = grid[key];
            if (vals && vals.length) {
                const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
                z[yi][xi] = avg;
            }
        });
    });

    return {
        x: xVals,
        y: yVals,
        z,
        x_label: p1,
        y_label: p2,
        z_label: "PnL net (pips)",
    };
}

// =============================================================================
// ROBUST EDGE METRICS (Sprint 2)
// =============================================================================

export interface RobustEdge {
    mean: number;
    median: number;
    trimmed_mean: number;
    mean_ci_95: [number, number];
    median_ci_95: [number, number];
    win_rate: number;
    avg_win: number;
    avg_loss: number;
    payoff_ratio: number;
    var_95: number;
    cvar_95: number;
    worst_k: number[];
    by_run: { run_id: string; mean: number; count: number }[];
    by_session: Record<string, number>;
    by_vol_regime: Record<string, number>;
    max_dd_distribution: { mean: number; p50: number; p95: number; p99: number };
    n_obs: number;
}

export interface RobustEdgeResponse {
    robust_edge: RobustEdge;
    unit: string;
    portfolio_epoch: number | null;
    bootstrap_iter: number;
    meta?: QuantMetaStandard;
}

export async function getRobustEdgeMetrics(
    request: {
        scope: Scope;
        runId?: string;
        strategyId?: string;
        portfolioEpoch?: number | null;
        unit?: string;
    },
): Promise<RobustEdgeResponse> {
    const { params, missingRunId } = buildQuantScopeParams(
        request.scope,
        request.runId,
        request.strategyId
    );
    if (missingRunId) {
        throw new Error("run_id requis pour scope RUN");
    }
    params.unit = request.unit ?? "pips";
    if (request.portfolioEpoch != null) {
        params.portfolio_epoch = request.portfolioEpoch;
    }
    const url = buildUrl("/api/quant/robust/edge_metrics", params);
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`Robust edge metrics: ${res.status}`);
    return res.json();
}

// =============================================================================
// WALK-FORWARD API
// =============================================================================

export interface WalkForwardFoldMetrics {
    n_trades: number;
    pnl_pips: number;
    pnl_usd: number;
    win_rate: number;
    profit_factor: number;
    sharpe: number;
    max_dd_pips: number;
    calmar: number;
    avg_trade_pips: number;
    bars: number;
    avg_holding_s: number;
    total_cost_pips: number;
}

export interface WalkForwardFold {
    fold_id: number;
    status: "pending" | "running" | "done" | "failed";
    is: WalkForwardFoldMetrics;
    oos: WalkForwardFoldMetrics;
    degradation_pct?: number;
    error?: string;
}

export interface WalkForwardAggregate {
    oos_total_pnl_pips: number;
    oos_total_trades: number;
    oos_win_rate: number;
    oos_sharpe: number;
    oos_max_dd_pips: number;
    oos_profit_factor: number;
    oos_calmar: number;
    oos_avg_trade_pips: number;
    is_total_pnl_pips: number;
    is_vs_oos_degradation_pct: number;
    stability_score: number;
}

export interface WalkForwardSummary {
    wf_id: string;
    strategy: string;
    folds_count: number;
    folds_done: number;
    folds_failed: number;
    max_workers_used: number;
    aggregate: WalkForwardAggregate;
    per_fold: WalkForwardFold[];
    total_wall_time_s: number;
}

export interface WalkForwardManifest {
    wf_id: string;
    strategy: string;
    created_at: string;
    train_months: number;
    test_months: number;
    step_months: number;
    start: string;
    end: string;
    code_sha: string;
    params_hash: string;
    max_workers: number;
    status: "pending" | "running" | "done" | "failed" | "partial";
    folds: Array<{
        fold_id: number;
        train_start: string;
        train_end: string;
        test_start: string;
        test_end: string;
        status: string;
        is_wall_time_s?: number;
        oos_wall_time_s?: number;
    }>;
    total_wall_time_s: number;
}

export interface WalkForwardRunEntry {
    wf_id: string;
    path: string;
    summary?: WalkForwardSummary | { wf_id: string; strategy: string; status: string; folds_count: number; created_at?: string };
}

export async function listWalkForwards(limit: number = 20): Promise<{ runs: WalkForwardRunEntry[] }> {
    const url = buildUrl("/api/research/walkforward/runs", { limit });
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`Walk-forward list: ${res.status}`);
    return res.json();
}

export async function getWalkForwardManifest(wfId: string): Promise<WalkForwardManifest> {
    const url = buildUrl(`/api/research/walkforward/${wfId}`, {});
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`Walk-forward manifest: ${res.status}`);
    return res.json();
}

export async function getWalkForwardSummary(wfId: string): Promise<WalkForwardSummary> {
    const url = buildUrl(`/api/research/walkforward/${wfId}/summary`, {});
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`Walk-forward summary: ${res.status}`);
    return res.json();
}

export interface WalkForwardProgress {
    wf_id: string;
    status: string;
    folds_total: number;
    folds_done: number;
    folds_failed: number;
    pct: number;
    folds: Array<{
        fold_id: number;
        status: string;
        train_start: string;
        train_end: string;
        test_start: string;
        test_end: string;
        is_wall_time_s?: number;
        oos_wall_time_s?: number;
        error?: string;
    }>;
}

export async function getWalkForwardProgress(wfId: string): Promise<WalkForwardProgress> {
    const url = buildUrl(`/api/research/walkforward/${wfId}/progress`, {});
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`Walk-forward progress: ${res.status}`);
    return res.json();
}

export async function launchWalkForward(payload: {
    strategy: string;
    train_months: number;
    test_months: number;
    step_months: number;
    start: string;
    end: string;
    max_workers: number;
    bar_interval_s?: number;
    data_dir?: string;
}): Promise<{ wf_id: string; status: string }> {
    const url = buildUrl("/api/research/walkforward/run", {});
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
    });
    if (!res.ok) throw new Error(`Walk-forward launch: ${res.status}`);
    return res.json();
}

// -- Fold-level data (trades, equity, report) --

export interface WalkForwardTrade {
    trade_id: string;
    direction: string;
    entry_ts: string;
    exit_ts: string;
    entry_price: number;
    exit_price: number;
    exit_reason: string;
    pnl_gross_pips: number;
    pnl_net_pips: number;
    pnl_net_usd?: number;
    cost_rt_pips: number;
    holding_seconds: number;
    holding_bars?: number;
    fold?: number;
    [key: string]: unknown;
}

export interface WalkForwardTradesResponse {
    trades: WalkForwardTrade[];
    total: number;
    limit: number;
    offset: number;
}

export async function getWalkForwardFoldTrades(
    wfId: string,
    foldId: number,
    phase: "is" | "oos" = "oos",
    limit: number = 500,
    offset: number = 0,
): Promise<WalkForwardTradesResponse> {
    const url = buildUrl(`/api/research/walkforward/${wfId}/fold/${foldId}/trades`, { phase, limit, offset });
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`Walk-forward fold trades: ${res.status}`);
    return res.json();
}

export interface WalkForwardEquityPoint {
    ts?: string;
    trade_id?: string;
    cumulative_pnl_pips?: number;
    cumulative_pnl_usd?: number;
    trade_count?: number;
    [key: string]: unknown;
}

export async function getWalkForwardFoldEquity(
    wfId: string,
    foldId: number,
    phase: "is" | "oos" = "oos",
): Promise<{ points: WalkForwardEquityPoint[] }> {
    const url = buildUrl(`/api/research/walkforward/${wfId}/fold/${foldId}/equity`, { phase });
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`Walk-forward fold equity: ${res.status}`);
    return res.json();
}

export async function getWalkForwardFoldReport(
    wfId: string,
    foldId: number,
    phase: "is" | "oos" = "oos",
): Promise<Record<string, unknown>> {
    const url = buildUrl(`/api/research/walkforward/${wfId}/fold/${foldId}/report`, { phase });
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`Walk-forward fold report: ${res.status}`);
    return res.json();
}

export async function downloadWalkForwardExport(
    wfId: string,
    format: "csv" | "json" = "csv",
): Promise<{ blob: Blob; filename: string }> {
    const url = buildUrl(`/api/research/walkforward/${wfId}/export`, { fmt: format });
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`Walk-forward export: ${res.status}`);
    const disp = res.headers.get("Content-Disposition") || "";
    const match = disp.match(/filename="?([^"]+)"?/);
    const filename = match?.[1] || `${wfId}_export.${format}`;
    const blob = await res.blob();
    return { blob, filename };
}

// -- Aggregate WF endpoints (all folds) --

export interface WalkForwardAllTradesResponse {
    trades: WalkForwardTrade[];
    total: number;
    limit: number;
    offset: number;
    phase: string;
}

export async function getWalkForwardAllTrades(
    wfId: string,
    phase: "is" | "oos" = "oos",
    filters?: { direction?: string; exit_reason?: string; fold?: number; limit?: number; offset?: number },
): Promise<WalkForwardAllTradesResponse> {
    const params: Record<string, unknown> = { phase, limit: filters?.limit ?? 10000, offset: filters?.offset ?? 0 };
    if (filters?.direction) params.direction = filters.direction;
    if (filters?.exit_reason) params.exit_reason = filters.exit_reason;
    if (filters?.fold !== undefined) params.fold = filters.fold;
    const url = buildUrl(`/api/research/walkforward/${wfId}/trades`, params);
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`Walk-forward all trades: ${res.status}`);
    return res.json();
}

export interface WalkForwardCompositeEquityPoint {
    ts: string;
    cumulative_pnl_pips: number;
    trade_count: number;
    fold: number;
}

export async function getWalkForwardCompositeEquity(
    wfId: string,
    phase: "is" | "oos" = "oos",
): Promise<{ points: WalkForwardCompositeEquityPoint[]; phase: string }> {
    const url = buildUrl(`/api/research/walkforward/${wfId}/equity`, { phase });
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`Walk-forward composite equity: ${res.status}`);
    return res.json();
}

export interface WalkForwardDetailedReport {
    available: boolean;
    phase: string;
    total_trades: number;
    report: {
        exit_analysis: Record<string, { count: number; total_pnl: number; wins: number; losses: number; avg_pnl: number; win_rate: number }>;
        mfe_mae: Array<{ mfe_pips: number; mae_pips: number; pnl_net_pips: number; exit_reason: string; direction: string }>;
        hourly_heatmap: Record<string, { count: number; avg_pnl: number; total_pnl: number }>;
        cost_decomposition: { total_cost_pips: number; total_gross_pnl_pips: number; total_net_pnl_pips: number; cost_drag_pct: number };
        top_drawdowns: Array<{ start_idx: number; end_idx: number; dd_pips: number; start_ts: string; end_ts: string }>;
    };
}

export async function getWalkForwardDetailedReport(
    wfId: string,
    phase: "is" | "oos" = "oos",
): Promise<WalkForwardDetailedReport> {
    const url = buildUrl(`/api/research/walkforward/${wfId}/detailed_report`, { phase });
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`Walk-forward detailed report: ${res.status}`);
    return res.json();
}

// =============================================================================
// CAPACITY AUDIT API
// =============================================================================

export interface BenchmarkEntry {
    strategy: string;
    duration_label: string;
    bars_count: number;
    wall_time_s: number;
    cpu_time_s: number;
    rss_peak_mb: number;
    read_bytes_mb: number;
    write_bytes_mb: number;
    output_size_mb: number;
    extrapolated_1m_s?: number;
    extrapolated_3m_s?: number;
    error?: string | null;
}

export interface ScalingTest {
    workers: number;
    wall_time_s: number;
    strategies_run: string[];
    efficiency: number;
}

export interface CapacityAuditReport {
    audit_ts: string;
    code_sha: string;
    vm_specs: {
        platform: string;
        machine: string;
        python: string;
        vcpus: number;
        ram_total_mb?: number;
        ram_available_mb?: number;
    };
    benchmarks: BenchmarkEntry[];
    scaling: {
        tests: ScalingTest[];
        recommended_max_workers: number;
    };
    recommendations: Record<string, number | string>;
}

export async function getCapacityLatest(): Promise<CapacityAuditReport | { error: string; available: false }> {
    const url = buildUrl("/api/system/capacity/latest", {});
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`Capacity audit: ${res.status}`);
    return res.json();
}

export async function getCapacityHistory(limit: number = 10): Promise<{ reports: Array<Record<string, unknown>> }> {
    const url = buildUrl("/api/system/capacity/history", { limit });
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`Capacity history: ${res.status}`);
    return res.json();
}

// =============================================================================
// JOB QUEUE API
// =============================================================================

export interface QueueStatus {
    available: boolean;
    counts?: Record<string, number>;
    total?: number;
    message?: string;
}

export interface QueueJob {
    job_id: string;
    job_kind: string;
    strategy: string | null;
    status: string;
    queued_at: string;
    started_at: string | null;
    ended_at: string | null;
    error_message: string | null;
    exit_code: number | null;
}

export async function getQueueStatus(): Promise<QueueStatus> {
    const url = buildUrl("/api/research/backtest/queue/status", {});
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`Queue status: ${res.status}`);
    return res.json();
}

export async function listQueueJobs(status?: string, limit: number = 50): Promise<{ jobs: QueueJob[] }> {
    const params: Record<string, unknown> = { limit };
    if (status) params.status = status;
    const url = buildUrl("/api/research/backtest/queue/jobs", params);
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`Queue jobs: ${res.status}`);
    return res.json();
}

export async function killQueueJob(jobId: string): Promise<{ success: boolean; message: string }> {
    const url = buildUrl(`/api/research/backtest/queue/jobs/${jobId}/kill`, {});
    const res = await fetch(url, {
        method: "POST",
        credentials: "include",
    });
    if (!res.ok) throw new Error(`Kill job: ${res.status}`);
    return res.json();
}
