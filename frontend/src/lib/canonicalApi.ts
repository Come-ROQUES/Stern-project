/**
 * Canonical API Client - V3 (RUN TRUTH LOCK)
 * 
 * Single source of truth for all canonical database endpoints.
 * All tabs MUST use these functions to access canonical data.
 * 
 * RULE: No run-scoped data without explicit run_id (throws error)
 * 
 * Databases:
 * - runs.sqlite: Run registry (strategy sessions)
 * - signals.sqlite: All signals (accepted + rejected)
 * - shocks.sqlite: Market shock events
 * - canonical_trades.sqlite: Aggregated trades for KPIs
 */

// =============================================================================
// DIAGNOSTICS - Track API usage for DevPanel QA
// =============================================================================

export interface CanonicalApiDiagnostics {
    missingRunIdErrors: number;
    lastMissingRunIdError: string | null;
    legacyFallbackUsed: boolean;
    lastError: string | null;
    totalRequests: number;
    runScopedRequests: number;
}

export const canonicalApiDiagnostics: CanonicalApiDiagnostics = {
    missingRunIdErrors: 0,
    lastMissingRunIdError: null,
    legacyFallbackUsed: false,
    lastError: null,
    totalRequests: 0,
    runScopedRequests: 0,
};

function trackRequest(hasRunId: boolean) {
    canonicalApiDiagnostics.totalRequests++;
    if (hasRunId) {
        canonicalApiDiagnostics.runScopedRequests++;
    }
}

function trackMissingRunIdError(endpoint: string) {
    canonicalApiDiagnostics.missingRunIdErrors++;
    canonicalApiDiagnostics.lastMissingRunIdError = `${endpoint} at ${new Date().toISOString()}`;
}

function trackError(error: string) {
    canonicalApiDiagnostics.lastError = `${error} at ${new Date().toISOString()}`;
}

/** Reset diagnostics (for testing) */
export function resetDiagnostics() {
    canonicalApiDiagnostics.missingRunIdErrors = 0;
    canonicalApiDiagnostics.lastMissingRunIdError = null;
    canonicalApiDiagnostics.legacyFallbackUsed = false;
    canonicalApiDiagnostics.lastError = null;
    canonicalApiDiagnostics.totalRequests = 0;
    canonicalApiDiagnostics.runScopedRequests = 0;
}

// =============================================================================
// RUN TRUTH LOCK - Validates run_id is present for scoped requests
// =============================================================================

class MissingRunIdError extends Error {
    constructor(endpoint: string) {
        super(`Missing run_id: canonical request blocked for ${endpoint}. Select a run first.`);
        this.name = 'MissingRunIdError';
        trackMissingRunIdError(endpoint);
    }
}

function requireRunId(runId: string | undefined | null, endpoint: string): asserts runId is string {
    if (!runId || runId.trim() === '') {
        throw new MissingRunIdError(endpoint);
    }
}

// API base - nginx proxies /react-api/ to FastAPI on port 8001
const API_BASE = (() => {
    const envBase = import.meta.env.VITE_API_URL;
    if (envBase) return envBase.replace(/\/$/, '');
    return '';
})();

const STERN_COMPAT = true;
const STERN_RUN_ID = 'stern-paper';

type SternStateSnapshot = {
    product_id?: string;
    best_bid?: { price?: number | null } | null;
    best_ask?: { price?: number | null } | null;
    mid_price?: number | null;
    recent_trades?: Array<{
        ts?: string | null;
        side?: string | null;
        price?: number | null;
        size?: number | null;
        trade_id?: string | number | null;
    }>;
    fills?: Array<{
        ts?: string | null;
        side?: string | null;
        price?: number | null;
        size?: number | null;
        reason?: string | null;
        fill_id?: string | number | null;
    }>;
    mid_history?: Array<{
        ts?: string | null;
        mid_price?: number | null;
    }>;
    portfolio?: {
        equity?: number | null;
        realized_pnl?: number | null;
        unrealized_pnl?: number | null;
        position_btc?: number | null;
    };
    strategy?: {
        fill_count?: number | null;
    };
    runtime?: {
        uptime_s?: number | null;
        last_trade_ts?: string | null;
        feed_state?: string | null;
    };
};

// =============================================================================
// TYPES - Run Registry
// =============================================================================

export interface Run {
    run_id: string;
    strategy: string;
    cfg_hash: string | null;
    start_ts: string;
    end_ts: string | null;
    status: 'running' | 'closed' | 'aborted';
    source: 'paper' | 'live' | 'shadow';
    pnl_total: number | null;
    trades_count: number | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export interface RunsListResponse {
    runs: Run[];
    count: number;
}

export interface ActiveRunResponse {
    active: Run | null;
}

export type RunResolveScope = 'TODAY' | 'YESTERDAY' | 'DATE';

export interface RunResolveResponse {
    resolved: boolean;
    run_id: string | null;
    strategy_id: string;
    strategy_version: string | null;
    trade_date: string;
    root_dir: string | null;
    meta?: unknown;
    available_dbs: string[];
    data_origin: string;
    scope: string;
    target_date: string;
    status?: 'running' | 'closed' | 'aborted';
    source?: 'paper' | 'live' | 'shadow';
    start_ts?: string;
    end_ts?: string | null;
}

// =============================================================================
// TYPES - Signals Registry (matches signals_schema.sql)
// =============================================================================

export interface Signal {
    signal_id: string;
    run_id: string;
    strategy: string;
    symbol: string;
    direction: 'BUY' | 'SELL';
    signal_type: 'ENTRY' | 'EXIT' | 'SHOCK' | 'REVERSAL' | 'STOP' | 'REJECTED';
    strength: number | null;
    price_at_signal: number | null;
    timestamp: string;
    // Analytics context
    z_score: number | null;
    anchor_price: number | null;
    volatility: number | null;
    spread: number | null;
    session: string | null;
    regime: string | null;
    accepted: boolean;
    rejection_reason: string | null;
    rejection_detail_json?: string | null;
    decision_stage?: string | null;
    wait_state?: string | null;
    wait_reason?: string | null;
    wait_enter_ts?: string | null;
    wait_release_ts?: string | null;
    wait_expire_ts?: string | null;
    // Shock context
    shock_id: string | null;
    shock_magnitude: number | null;
    // Outcome
    was_traded: boolean;
    trade_id: string | null;
    outcome: 'PROFIT' | 'LOSS' | 'PENDING' | 'SKIPPED' | null;
    reason: string | null;
    extreme_recovery_mode?: boolean | null;
    extreme_state?: string | null;
    extreme_event_id?: string | null;
    extreme_peak_pips?: number | null;
    sim_outcome?: string | null;
    sim_valid?: boolean | null;
    sim_verdict?: 'WOULD_WIN' | 'WOULD_LOSE' | 'UNRELIABLE' | null;
    sim_profitable?: boolean | null;
    sim_anchor_ts?: string | null;
    sim_tp_after_decision?: boolean | null;
    sim_pnl_pips?: number | null;
    sim_pnl_usd?: number | null;
    sim_mfe_pips?: number | null;
    sim_mae_pips?: number | null;
    sim_quality?: string | null;
    config_snapshot: string | null;
    created_at: string;
}

export interface SignalsListResponse {
    signals: Signal[];
    count: number;
}

export type SignalScope = 'RUN' | 'TODAY' | 'YESTERDAY' | 'DATE' | 'RANGE';

export interface ScopedSignal {
    timestamp: string;
    symbol: string;
    direction: string;
    signal_type: string;
    z_score: number | null;
    anchor_price: number | null;
    volatility: number | null;
    spread: number | null;
    session: string | null;
    regime: string | null;
    accepted: boolean;
    rejection_reason: string | null;
    run_id: string;
    signal_id: string;
    trade_id: string | null;
    was_traded: boolean;
    final_pnl_pips?: number | null;
    final_pnl_eur?: number | null;
    amplitude_pips?: number | null;
    atr_pips?: number | null;
    portfolio_epoch?: number | null;
}

export interface ScopedSignalsResponse {
    signals: ScopedSignal[];
    _meta: {
        run_id: string | null;
        scope: string;
        from_date?: string;
        to_date?: string;
        count: number;
        cross_run: boolean;
        portfolio_epoch?: number | null;
        epoch_started_at?: string | null;
    };
}

export interface SignalStats {
    total_signals: number;
    accepted_signals: number;
    traded_signals: number;
    profitable_signals: number;
    conversion_rate: number;
    win_rate: number;
    reaper_expired_signals?: number;
    by_type: Record<string, number>;
    by_rejection_reason: Record<string, number>;
    by_stage: Record<string, number>;
}

// =============================================================================
// TYPES - Shocks Registry (matches shocks_schema.sql)
// =============================================================================

export interface Shock {
    shock_id: string;
    run_id: string | null;
    symbol: string;
    timestamp: string;
    // Shock characteristics
    direction: 'UP' | 'DOWN' | null;
    magnitude_pips: number | null;
    magnitude_pct: number | null;
    duration_ms: number | null;
    // Analytics context
    shock_type: string | null;
    z_score: number | null;
    volatility: number | null;
    session: string | null;
    accepted: boolean;
    // Price context
    price_before: number | null;
    price_after: number | null;
    price_high: number | null;
    price_low: number | null;
    // Market context
    spread_at_shock: number | null;
    volume_spike: boolean;
    volatility_regime: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' | null;
    // Detection
    detector_version: string | null;
    detection_params: string | null;
    // Outcome
    was_traded: boolean;
    signal_id: string | null;
    trade_outcome: 'PROFIT' | 'LOSS' | 'SKIPPED' | null;
    trajectory_json: string | null;
    created_at: string;
}

export interface ShocksListResponse {
    shocks: Shock[];
    count: number;
}

export type ShockScope = SignalScope;
export type TradeScope = SignalScope | '7D' | '30D' | 'GLOBAL';

export interface ScopedShock {
    shock_id: string;
    run_id: string | null;
    symbol: string;
    timestamp: string;
    direction: string | null;
    magnitude_pips: number | null;
    magnitude_pct: number | null;
    duration_ms: number | null;
    price_before: number | null;
    price_after: number | null;
    price_high: number | null;
    price_low: number | null;
    spread_at_shock: number | null;
    volume_spike: boolean | null;
    volatility_regime: string | null;
    detector_version: string | null;
    detection_params: string | null;
    was_traded: boolean;
    signal_id: string | null;
    trade_outcome: string | null;
    trajectory_json: string | null;
    portfolio_epoch?: number | null;
}

export interface ScopedShocksResponse {
    shocks: ScopedShock[];
    _meta: {
        run_id: string | null;
        scope: string;
        from_date?: string;
        to_date?: string;
        count: number;
        cross_run: boolean;
        portfolio_epoch?: number | null;
        epoch_started_at?: string | null;
    };
}

export interface ShockStats {
    total_shocks: number;
    traded_shocks: number;
    avg_magnitude_pips: number;
    conversion_rate: number;
    by_direction: Record<string, number>;
    by_session: Record<string, number>;
}

// =============================================================================
// TYPES - Canonical Trades (KPIs)
// =============================================================================

export interface CanonicalKPIs {
    pnl_total: number;
    pnl_today: number;
    trades_count: number;
    linked_signals_count?: number;
    win_rate: number;
    last_sync: string | null;
    db_exists: boolean;
}

export interface CanonicalTrade {
    canonical_id: number;
    trade_id: string;
    signal_id: string;
    run_id: string;
    strategy_id: string;
    symbol: string;
    side: string;
    qty: number | null;
    entry_price: number | null;
    exit_price: number | null;
    entry_time: string;
    exit_time: string;
    status: string;
    pnl: number | null;
    source_db: string;
    // Extended fields for desk-grade chart (may be null if not provided by API)
    parent_order_id?: string | null;
    tp_order_id?: string | null;
    sl_order_id?: string | null;
    has_exit_orders?: number | boolean | null;
    tp_price?: number | null;
    sl_price?: number | null;
    exit_reason?: 'TP' | 'SL' | 'MANUAL' | 'TIMEOUT' | string | null;
    pnl_pips?: number | null;
    pnl_net_eur?: number | null;
    pnl_net_pips?: number | null;
    pnl_gross_eur?: number | null;
    pnl_net_usd?: number | null;
    pnl_gross_usd?: number | null;
    commission_total_eur?: number | null;
    commission_total_eur_real?: number | null;
    commission_total_eur_estimated?: number | null;
    commission_total_usd?: number | null;
    commission_total_usd_reported?: number | null;
    commission_total_usd_economic?: number | null;
    commission_entry_usd?: number | null;
    commission_exit_usd?: number | null;
    commission_model?: string | null;
    commission_entry_eur?: number | null;
    commission_exit_eur?: number | null;
    commission_usd_real_rt?: number | null;
    commission_pips_real_rt?: number | null;
    commission_rt_eur_used?: number | null;
    commission_rt_usd_used?: number | null;
    commission_model_used?: string | null;
    commission_completeness?: string | null;
    missing_exit_commission?: boolean;
    pnl_net_eur_used?: number | null;
    pnl_gross_eur_used?: number | null;
    pnl_net_usd_used?: number | null;
    pnl_gross_usd_used?: number | null;
    net_pips_used?: number | null;
    fx_rate_used?: number | null;
    anomaly_reason_code?: string | null;
    anomaly_reason?: string | null;
    is_anomaly?: number;
    spread_pips_at_entry?: number | null;
    spread_regime?: string | null;
    entry_slippage_pips?: number | null;
    exit_slippage_pips?: number | null;
    exit_submit_to_fill_ms?: number | null;
    scale_out_done?: number | boolean | null;
    scale_out_qty?: number | null;
    scale_out_price?: number | null;
    scale_out_ts?: string | null;
    scale_out_reason?: string | null;
    protection_replace_count?: number | null;
    protection_last_reason?: string | null;
    protection_last_ts?: string | null;
    protection_last_ack_ts?: string | null;
    protection_last_qty?: number | null;
    protection_last_price?: number | null;
    protection_last_old_tp_id?: string | null;
    protection_last_old_sl_id?: string | null;
    protection_last_new_tp_id?: string | null;
    protection_last_new_sl_id?: string | null;
    portfolio_epoch?: number | null;
}

export interface CanonicalTradesResponse {
    trades: CanonicalTrade[];
    count: number;
    _meta?: {
        commission_view_used?: 'reported' | 'economic';
        missing_exit_commission_pct?: number;
        anomaly_count?: number;
        anomaly_thresholds?: { gross_eur?: number; gross_pips?: number };
        portfolio_epoch?: number | null;
        epoch_started_at?: string | null;
    };
}

const CANONICAL_TRADES_HOT_CACHE_TTL_MS = 90_000;
const canonicalTradesHotCache = new Map<
    string,
    {
        payload: CanonicalTradesResponse;
        cachedAt: number;
    }
>();

function cloneCanonicalTradesPayload(
    payload: CanonicalTradesResponse,
): CanonicalTradesResponse {
    return {
        ...payload,
        trades: payload.trades.map((trade) => ({ ...trade })),
        _meta: payload._meta ? { ...payload._meta } : undefined,
    };
}

function buildCanonicalTradesCacheScopeKey(
    runId: string | null | undefined,
    options?: {
        commissionView?: 'reported' | 'economic';
        includeAnomalies?: boolean;
        onlyAnomalies?: boolean;
        strategyId?: string;
        portfolioEpoch?: number;
    },
): string | null {
    if (!runId) return null;
    return [
        runId,
        options?.commissionView ?? 'reported',
        options?.includeAnomalies ? 'anoms' : 'clean',
        options?.onlyAnomalies ? 'only-anoms' : 'all',
        options?.strategyId ?? 'all-strategies',
        options?.portfolioEpoch ?? 'all-epochs',
    ].join('::');
}

export function buildCanonicalTradesCacheKey(
    runId: string | null | undefined,
    limit = 50,
    options?: {
        commissionView?: 'reported' | 'economic';
        includeAnomalies?: boolean;
        onlyAnomalies?: boolean;
        strategyId?: string;
        portfolioEpoch?: number;
    },
): string | null {
    const scopeKey = buildCanonicalTradesCacheScopeKey(runId, options);
    if (!scopeKey) return null;
    return `${scopeKey}::${limit}`;
}

function readCanonicalTradesHotCache(
    cacheKey: string | null,
): CanonicalTradesResponse | null {
    if (!cacheKey) return null;
    const cached = canonicalTradesHotCache.get(cacheKey);
    if (!cached) return null;
    if (Date.now() - cached.cachedAt > CANONICAL_TRADES_HOT_CACHE_TTL_MS) {
        canonicalTradesHotCache.delete(cacheKey);
        return null;
    }
    return cloneCanonicalTradesPayload(cached.payload);
}

function findCanonicalTradesWarmCache(
    runId: string | null | undefined,
    limit = 50,
    options?: {
        commissionView?: 'reported' | 'economic';
        includeAnomalies?: boolean;
        onlyAnomalies?: boolean;
        strategyId?: string;
        portfolioEpoch?: number;
    },
): CanonicalTradesResponse | null {
    const exactKey = buildCanonicalTradesCacheKey(runId, limit, options);
    const exact = readCanonicalTradesHotCache(exactKey);
    if (exact) return exact;

    const scopeKey = buildCanonicalTradesCacheScopeKey(runId, options);
    if (!scopeKey) return null;
    const prefix = `${scopeKey}::`;
    let best:
        | {
              payload: CanonicalTradesResponse;
              cachedAt: number;
          }
        | null = null;

    canonicalTradesHotCache.forEach((entry, key) => {
        if (!key.startsWith(prefix)) return;
        if (Date.now() - entry.cachedAt > CANONICAL_TRADES_HOT_CACHE_TTL_MS) {
            canonicalTradesHotCache.delete(key);
            return;
        }
        if (!best || entry.cachedAt > best.cachedAt) {
            best = entry;
        }
    });

    return best ? cloneCanonicalTradesPayload(best.payload) : null;
}

function writeCanonicalTradesHotCache(
    cacheKey: string | null,
    payload: CanonicalTradesResponse,
): void {
    if (!cacheKey) return;
    canonicalTradesHotCache.set(cacheKey, {
        payload: cloneCanonicalTradesPayload(payload),
        cachedAt: Date.now(),
    });
    if (canonicalTradesHotCache.size > 96) {
        const oldestKey = canonicalTradesHotCache.keys().next().value;
        if (oldestKey) {
            canonicalTradesHotCache.delete(oldestKey);
        }
    }
}

export function clearCanonicalTradesHotCache(): void {
    canonicalTradesHotCache.clear();
}

// =============================================================================
// TYPES - Portfolio Epoch (soft reset system)
// =============================================================================

export interface PortfolioEpochResponse {
    current_epoch: number;
    sim_equity_usd: number;
    trades_in_epoch: number;
    pnl_epoch_usd: number;
    equity_usd: number;
    epoch_started_at?: string | null;
    _meta?: {
        db_exists?: boolean;
        db_path?: string;
        error?: string;
    };
}

export interface PortfolioSummaryResponse {
    current_epoch: number;
    sim_equity_usd: number;
    equity_usd: number;
    pnl_epoch_usd: number;
    pnl_7d_usd: number;
    pnl_30d_usd: number;
    trades_7d: number;
    trades_30d: number;
    epoch_started_at: string | null;
    _meta?: {
        db_exists?: boolean;
        db_path?: string;
        error?: string;
        generated_at_utc?: string;
    };
}

// =============================================================================
// TYPES - Portfolio Epoch List + Advance
// =============================================================================

export interface EpochSummary {
    epoch: number;
    trade_count: number;
    closed_count: number;
    first_trade: string | null;
    last_trade: string | null;
    pnl_usd: number;
    is_current: boolean;
}

export interface EpochListResponse {
    epochs: EpochSummary[];
    current_epoch: number;
}

export interface AdvanceEpochResponse {
    previous_epoch: number;
    new_epoch: number;
    advanced_at: string;
}

// =============================================================================
// HELPER - Fetch with error handling
// =============================================================================

class ApiHttpError extends Error {
    status: number;
    body: string;

    constructor(status: number, body: string, statusText: string) {
        super(`HTTP ${status}: ${body || statusText}`);
        this.name = 'ApiHttpError';
        this.status = status;
        this.body = body;
    }
}

function isRunNotFound404(error: unknown): error is ApiHttpError {
    if (!(error instanceof ApiHttpError)) {
        return false;
    }
    if (error.status !== 404) {
        return false;
    }
    return /run not found/i.test(error.body || error.message);
}

function resolveScopeDate(scope: RunResolveScope, date?: string): string {
    if (scope === 'DATE') {
        return date ?? '';
    }
    const now = new Date();
    const utcDate = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
    ));
    if (scope === 'YESTERDAY') {
        utcDate.setUTCDate(utcDate.getUTCDate() - 1);
    }
    return utcDate.toISOString().slice(0, 10);
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, init);
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        const error = new ApiHttpError(res.status, text, res.statusText);
        const errorMsg = error.message;
        trackError(errorMsg);
        throw error;
    }
    return res.json();
}

function isAbortLikeError(error: unknown): boolean {
    return (
        error instanceof Error &&
        (error.name === 'AbortError' ||
            error.message.toLowerCase().includes('abort') ||
            error.message.toLowerCase().includes('signal is aborted'))
    );
}

// =============================================================================
// API CLIENT - Canonical endpoints
// =============================================================================

export const canonicalApi = {
    // ---------------------------------------------------------------------------
    // Portfolio Epoch (soft reset system)
    // ---------------------------------------------------------------------------

    /**
     * Get current portfolio epoch and stats.
     * The portfolio epoch system allows soft resets:
     * - Each epoch represents a new portfolio starting from sim_equity (5000 USD)
     * - Old trades are preserved but tagged with their original epoch
     * - New trades auto-tag with the current epoch via DB trigger
     */
    getPortfolioEpoch: (): Promise<PortfolioEpochResponse> => {
        trackRequest(false);
        return fetchJson('/api/portfolio/epoch');
    },

    /**
     * Portfolio summary for the current epoch (5K sim)
     * Includes PnL for last 7d and 30d (UTC) and trade counts.
     */
    getPortfolioSummary: (): Promise<PortfolioSummaryResponse> => {
        trackRequest(false);
        return fetchJson('/api/portfolio/summary');
    },

    /**
     * Portfolio trades for the current epoch (cross-run).
     */
    getPortfolioTrades: (params?: {
        limit?: number;
        strategyId?: string;
        portfolioEpoch?: number;
        commissionView?: 'reported' | 'economic';
        includeOrphans?: boolean;
        includeAnomalies?: boolean;
        onlyAnomalies?: boolean;
        responseMode?: 'full' | 'compact';
    }): Promise<CanonicalTradesResponse> => {
        trackRequest(false);
        const qs = new URLSearchParams();
        qs.set('limit', String(params?.limit ?? 200));
        if (params?.strategyId) qs.set('strategy_id', params.strategyId);
        if (params?.portfolioEpoch !== undefined) {
            qs.set('portfolio_epoch', String(params.portfolioEpoch));
        }
        qs.set('commission_view', params?.commissionView ?? 'reported');
        if (params?.includeOrphans) qs.set('include_orphans', 'true');
        if (params?.includeAnomalies) qs.set('include_anomalies', 'true');
        if (params?.onlyAnomalies) qs.set('only_anomalies', 'true');
        if (params?.responseMode) qs.set('response_mode', params.responseMode);
        return fetchJson(`/api/portfolio/trades?${qs}`);
    },

    /**
     * List all portfolio epochs with summary stats per epoch.
     */
    listPortfolioEpochs: (): Promise<EpochListResponse> => {
        trackRequest(false);
        return fetchJson('/api/portfolio/epochs');
    },

    /**
     * Advance the portfolio epoch counter by 1 (soft reset).
     * Future trades/signals will be tagged with the new epoch.
     */
    advancePortfolioEpoch: (): Promise<AdvanceEpochResponse> => {
        trackRequest(false);
        return fetchJson('/api/portfolio/epoch/advance', { method: 'POST' });
    },

    // ---------------------------------------------------------------------------
    // Runs Registry (no run_id required - these resolve runs)
    // ---------------------------------------------------------------------------

    listRuns: (params?: {
        strategy?: string;
        status?: 'running' | 'closed' | 'aborted';
        limit?: number;
    }): Promise<RunsListResponse> => {
        trackRequest(false);
        const qs = new URLSearchParams();
        if (params?.strategy) qs.set('strategy', params.strategy);
        if (params?.status) qs.set('status', params.status);
        if (params?.limit) qs.set('limit', String(params.limit));
        const query = qs.toString();
        return fetchJson(`/api/registry/runs${query ? '?' + query : ''}`);
    },

    getActiveRun: (strategy?: string): Promise<ActiveRunResponse> => {
        trackRequest(false);
        const query = strategy ? `?strategy=${encodeURIComponent(strategy)}` : '';
        return fetchJson(`/api/registry/runs/active${query}`);
    },

    getRun: (runId: string): Promise<Run> => {
        trackRequest(true);
        return fetchJson(`/api/registry/runs/${encodeURIComponent(runId)}`);
    },

    resolveRunScope: (params: {
        strategyId: string;
        scope: RunResolveScope;
        date?: string;
    }): Promise<RunResolveResponse> => {
        trackRequest(false);
        const qs = new URLSearchParams();
        qs.set('strategy', params.strategyId);
        qs.set('scope', params.scope);
        if (params.scope === 'DATE') {
            if (!params.date) {
                throw new Error('date is required for scope=DATE');
            }
            qs.set('date', params.date);
        }
        return fetchJson<RunResolveResponse>(`/api/run/resolve?${qs}`).catch((error) => {
            if (!isRunNotFound404(error)) {
                throw error;
            }
            return {
                resolved: false,
                run_id: null,
                strategy_id: params.strategyId,
                strategy_version: null,
                trade_date: resolveScopeDate(params.scope, params.date),
                root_dir: null,
                available_dbs: [],
                data_origin: 'run_registry',
                scope: params.scope,
                target_date: resolveScopeDate(params.scope, params.date),
                meta: {
                    fallback: 'run_not_found',
                },
            };
        });
    },

    // ---------------------------------------------------------------------------
    // Signals Registry - RUN_ID REQUIRED
    // ---------------------------------------------------------------------------

    /**
     * List signals for a specific run
     * @param runId REQUIRED - run_id to scope the query
     */
    listSignals: (runId: string, params?: {
        symbol?: string;
        signal_type?: string;
        accepted?: boolean;
        limit?: number;
        from_ts?: string;
        to_ts?: string;
        order?: "asc" | "desc";
        strategyId?: string;
        lite?: boolean;
    }): Promise<SignalsListResponse> => {
        requireRunId(runId, 'listSignals');
        trackRequest(true);
        const qs = new URLSearchParams();
        qs.set('run_id', runId);
        if (params?.strategyId) qs.set('strategy_id', params.strategyId);
        if (params?.symbol) qs.set('symbol', params.symbol);
        if (params?.signal_type) qs.set('signal_type', params.signal_type);
        if (params?.accepted !== undefined) qs.set('accepted', String(params.accepted));
        if (params?.limit) qs.set('limit', String(params.limit));
        if (params?.from_ts) qs.set('from_ts', params.from_ts);
        if (params?.to_ts) qs.set('to_ts', params.to_ts);
        if (params?.order) qs.set('order', params.order);
        if (params?.lite) qs.set('lite', 'true');
        return fetchJson(`/api/registry/signals?${qs}`);
    },

    /**
     * List signals using date/range scopes (cross-run allowed).
     */
    listSignalsScoped: (params: {
        scope: SignalScope;
        runId: string;
        strategyId: string;
        fromDate?: string;
        toDate?: string;
        limit?: number;
    }): Promise<ScopedSignalsResponse> => {
        trackRequest(true);
        const qs = new URLSearchParams();
        qs.set('scope', params.scope);
        qs.set('run_id', params.runId);
        qs.set('strategy_id', params.strategyId);
        if (params.fromDate) qs.set('from_date', params.fromDate);
        if (params.toDate) qs.set('to_date', params.toDate);
        if (params.limit) qs.set('limit', String(params.limit));
        return fetchJson(`/api/signals?${qs}`);
    },

    /**
     * Get signal statistics for a specific run
     * @param runId REQUIRED - run_id to scope the query
     */
    getSignalStats: (runId: string, strategyId?: string): Promise<SignalStats> => {
        requireRunId(runId, 'getSignalStats');
        trackRequest(true);
        const qs = new URLSearchParams({ run_id: runId });
        if (strategyId) qs.set('strategy_id', strategyId);
        return fetchJson(`/api/registry/signals/stats?${qs}`);
    },

    getSignal: (signalId: string): Promise<Signal> => {
        trackRequest(true);
        return fetchJson(`/api/registry/signals/${encodeURIComponent(signalId)}`);
    },

    // ---------------------------------------------------------------------------
    // Shocks Registry - RUN_ID REQUIRED
    // ---------------------------------------------------------------------------

    /**
     * List shocks for a specific run
     * @param runId REQUIRED - run_id to scope the query
     */
    listShocks: (runId: string, params?: {
        symbol?: string;
        direction?: 'UP' | 'DOWN';
        min_magnitude?: number;
        limit?: number;
        from_ts?: string;
        to_ts?: string;
        order?: "asc" | "desc";
        strategyId?: string;
    }): Promise<ShocksListResponse> => {
        requireRunId(runId, 'listShocks');
        trackRequest(true);
        const qs = new URLSearchParams();
        qs.set('run_id', runId);
        if (params?.strategyId) qs.set('strategy_id', params.strategyId);
        if (params?.symbol) qs.set('symbol', params.symbol);
        if (params?.direction) qs.set('direction', params.direction);
        if (params?.min_magnitude) qs.set('min_magnitude', String(params.min_magnitude));
        if (params?.limit) qs.set('limit', String(params.limit));
        if (params?.from_ts) qs.set('from_ts', params.from_ts);
        if (params?.to_ts) qs.set('to_ts', params.to_ts);
        if (params?.order) qs.set('order', params.order);
        return fetchJson(`/api/registry/shocks?${qs}`);
    },

    /**
     * List shocks using date/range scopes (cross-run allowed).
     */
    listShocksScoped: (params: {
        scope: ShockScope;
        runId: string;
        strategyId: string;
        fromDate?: string;
        toDate?: string;
        limit?: number;
    }): Promise<ScopedShocksResponse> => {
        trackRequest(true);
        const qs = new URLSearchParams();
        qs.set('scope', params.scope);
        qs.set('run_id', params.runId);
        qs.set('strategy_id', params.strategyId);
        if (params.fromDate) qs.set('from_date', params.fromDate);
        if (params.toDate) qs.set('to_date', params.toDate);
        if (params.limit) qs.set('limit', String(params.limit));
        return fetchJson(`/api/shocks?${qs}`);
    },

    /**
     * Get shock statistics for a specific run
     * @param runId REQUIRED - run_id to scope the query
     */
    getShockStats: (runId: string, strategyId?: string): Promise<ShockStats> => {
        requireRunId(runId, 'getShockStats');
        trackRequest(true);
        const qs = new URLSearchParams({ run_id: runId });
        if (strategyId) qs.set('strategy_id', strategyId);
        return fetchJson(`/api/registry/shocks/stats?${qs}`);
    },

    getShock: (shockId: string): Promise<Shock> => {
        trackRequest(true);
        return fetchJson(`/api/registry/shocks/${encodeURIComponent(shockId)}`);
    },

    // ---------------------------------------------------------------------------
    // Canonical Trades - RUN_ID REQUIRED for scoped queries
    // ---------------------------------------------------------------------------

    /**
     * Get KPIs for a specific run
     * @param runId REQUIRED - run_id to scope the query
     */
    getKPIs: (
        runId: string,
        strategyId?: string,
        commissionView: 'reported' | 'economic' = 'reported',
        includeAnomalies = false,
    ): Promise<CanonicalKPIs> => {
        requireRunId(runId, 'getKPIs');
        trackRequest(true);
        const qs = new URLSearchParams();
        qs.set('run_id', runId);
        if (strategyId) qs.set('strategy_id', strategyId);
        qs.set('commission_view', commissionView);
        if (includeAnomalies) qs.set('include_anomalies', 'true');
        return fetchJson(`/api/canonical/kpis?${qs}`);
    },

    /**
     * Get trades for a specific run
     * @param runId REQUIRED - run_id to scope the query
     */
    getTrades: (
        runId: string,
        limit = 50,
        options?: {
            commissionView?: 'reported' | 'economic';
            includeAnomalies?: boolean;
            onlyAnomalies?: boolean;
            strategyId?: string;
            portfolioEpoch?: number;
            signal?: AbortSignal;
        },
    ): Promise<CanonicalTradesResponse> => {
        requireRunId(runId, 'getTrades');
        trackRequest(true);
        const qs = new URLSearchParams();
        qs.set('run_id', runId);
        if (options?.strategyId) qs.set('strategy_id', options.strategyId);
        qs.set('limit', String(limit));
        qs.set('commission_view', options?.commissionView ?? 'reported');
        if (options?.includeAnomalies) qs.set('include_anomalies', 'true');
        if (options?.onlyAnomalies) qs.set('only_anomalies', 'true');
        if (options?.portfolioEpoch !== undefined) qs.set('portfolio_epoch', String(options.portfolioEpoch));
        return fetchJson<CanonicalTradesResponse>(
            `/api/canonical/trades?${qs}`,
            options?.signal ? { signal: options.signal } : undefined,
        ).catch((error) => {
            if (!isRunNotFound404(error)) {
                throw error;
            }
            return { trades: [], count: 0 };
        });
    },

    /**
     * Get trades using date filters. If runId is omitted, scope defaults to GLOBAL.
     */
    getTradesByDate: (params: {
        runId: string;
        strategyId: string;
        scope?: TradeScope;
        fromDate?: string;
        toDate?: string;
        limit?: number;
        includeOrphans?: boolean;
        commissionView?: 'reported' | 'economic';
        includeAnomalies?: boolean;
        onlyAnomalies?: boolean;
    }): Promise<CanonicalTradesResponse> => {
        requireRunId(params.runId, 'getTradesByDate');
        trackRequest(true);
        const qs = new URLSearchParams();
        qs.set('limit', String(params.limit ?? 200));
        qs.set('run_id', params.runId);
        qs.set('strategy_id', params.strategyId);
        qs.set('scope', params.scope ?? 'RUN');
        if (params.fromDate) qs.set('from_date', params.fromDate);
        if (params.toDate) qs.set('to_date', params.toDate);
        if (params.includeOrphans) qs.set('include_orphans', 'true');
        qs.set('commission_view', params.commissionView ?? 'reported');
        if (params.includeAnomalies) qs.set('include_anomalies', 'true');
        if (params.onlyAnomalies) qs.set('only_anomalies', 'true');
        return fetchJson<CanonicalTradesResponse>(`/api/canonical/trades?${qs}`).catch((error) => {
            if (!isRunNotFound404(error)) {
                throw error;
            }
            return { trades: [], count: 0 };
        });
    },

    /**
     * Get trades for a run scoped to TODAY/7D/30D (UTC windows).
     */
    getTradesScoped: (params: {
        runId: string;
        strategyId: string;
        scope: 'TODAY' | '7D' | '30D';
        limit?: number;
        includeOrphans?: boolean;
        commissionView?: 'reported' | 'economic';
        includeAnomalies?: boolean;
        onlyAnomalies?: boolean;
    }): Promise<CanonicalTradesResponse> => {
        requireRunId(params.runId, 'getTradesScoped');
        trackRequest(true);
        const qs = new URLSearchParams();
        qs.set('limit', String(params.limit ?? 500));
        qs.set('run_id', params.runId);
        qs.set('strategy_id', params.strategyId);
        qs.set('scope', params.scope);
        if (params.includeOrphans) qs.set('include_orphans', 'true');
        qs.set('commission_view', params.commissionView ?? 'reported');
        if (params.includeAnomalies) qs.set('include_anomalies', 'true');
        if (params.onlyAnomalies) qs.set('only_anomalies', 'true');
        return fetchJson<CanonicalTradesResponse>(`/api/canonical/trades?${qs}`).catch((error) => {
            if (!isRunNotFound404(error)) {
                throw error;
            }
            return { trades: [], count: 0 };
        });
    },

    /**
    * Get trades across all runs (explicit GLOBAL scope)
    * @param portfolioEpoch - If provided, only returns trades from that epoch (soft reset)
    */
    getTradesGlobal: () => {
        throw new MissingRunIdError('getTradesGlobal (global scope disabled)');
    },

    /**
     * Sync trades from source DBs (admin operation, no run_id needed)
     */
    syncTrades: (): Promise<{ status: string; synced: number }> => {
        trackRequest(false);
        return fetchJson('/api/canonical/sync', { method: 'POST' });
    },

    // ---------------------------------------------------------------------------
    // Run Window helpers - for PriceChart scoping
    // ---------------------------------------------------------------------------

    /**
     * Get the time window for a run (start_ts, end_ts)
     * Falls back to min/max timestamps from signals/shocks if not set
     */
    getRunWindow: async (
        runId: string,
        strategyId?: string
    ): Promise<{ start: string; end: string } | null> => {
        requireRunId(runId, 'getRunWindow');
        trackRequest(true);

        const normalizeTs = (ts: string | null | undefined): string | null => {
            if (!ts) return null;
            const candidate = ts.includes(' ') && !ts.includes('T') ? ts.replace(' ', 'T') : ts;
            const parsed = Date.parse(candidate);
            if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
            return ts;
        };

        // 1) Fast path: direct run window (MIN/MAX timestamps by run_id)
        try {
            const runWindow = await fetchJson<{ start?: string; end?: string }>(
                `/api/registry/run_window?run_id=${encodeURIComponent(runId)}`
            );
            if (runWindow?.start) {
                const start = normalizeTs(runWindow.start);
                const end = normalizeTs(runWindow.end) || new Date().toISOString();
                if (start) return { start, end };
            }
        } catch {
            // Fall through to registry lookup
        }

        try {
            const run = await canonicalApi.getRun(runId);
            if (run.start_ts) {
                const start = normalizeTs(run.start_ts);
                const end = normalizeTs(run.end_ts) || new Date().toISOString();
                if (start) return { start, end };
            }
        } catch {
            // Run not found, try to derive from data
        }

        // Fallback: derive from earliest/latest signal or shock timestamps.
        // We explicitly query the boundaries instead of sampling the latest 100
        // rows, otherwise long runs can collapse back to a recent window.
        try {
            const [signalsAsc, signalsDesc, shocksAsc, shocksDesc] = await Promise.all([
                canonicalApi.listSignals(runId, {
                    limit: 1,
                    order: "asc",
                    strategyId,
                }),
                canonicalApi.listSignals(runId, {
                    limit: 1,
                    order: "desc",
                    strategyId,
                }),
                canonicalApi.listShocks(runId, {
                    limit: 1,
                    order: "asc",
                    strategyId,
                }),
                canonicalApi.listShocks(runId, {
                    limit: 1,
                    order: "desc",
                    strategyId,
                }),
            ]);

            const timestamps: number[] = [];
            signalsAsc.signals.forEach(s => timestamps.push(new Date(s.timestamp).getTime()));
            signalsDesc.signals.forEach(s => timestamps.push(new Date(s.timestamp).getTime()));
            shocksAsc.shocks.forEach(s => timestamps.push(new Date(s.timestamp).getTime()));
            shocksDesc.shocks.forEach(s => timestamps.push(new Date(s.timestamp).getTime()));

            if (timestamps.length === 0) return null;

            const minTs = Math.min(...timestamps);
            const maxTs = Math.max(...timestamps);

            return {
                start: normalizeTs(new Date(minTs).toISOString()) ?? new Date(minTs).toISOString(),
                end: normalizeTs(new Date(maxTs).toISOString()) ?? new Date(maxTs).toISOString(),
            };
        } catch {
            return null;
        }
    },
};

// =============================================================================
// HOOKS - React hooks for canonical data
// =============================================================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

/**
 * Hook for active run tracking
 * PERFORMANCE: Polling disabled by default - use refresh() manually or set disablePolling=false
 */
export function useActiveRun(strategy?: string, options?: { disablePolling?: boolean }) {
    const [activeRun, setActiveRun] = useState<Run | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const disablePolling = options?.disablePolling ?? true; // Default: no auto-polling

    const refresh = useCallback(async () => {
        try {
            const data = await canonicalApi.getActiveRun(strategy);
            setActiveRun(data.active);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    }, [strategy]);

    useEffect(() => {
        refresh();
        // Only poll if explicitly enabled
        const interval = disablePolling ? undefined : setInterval(refresh, 120_000); // 2 minutes
        return () => { if (interval) clearInterval(interval); };
    }, [refresh, disablePolling]);

    return { activeRun, loading, error, refresh };
}

/**
 * Hook for signal stats - REQUIRES run_id
 * Returns noRunId: true if runId is missing
 */
export function useSignalStats(
    runId: string | null | undefined,
    strategyId?: string | null,
) {
    const [stats, setStats] = useState<SignalStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const noRunId = !runId;

    const refresh = useCallback(async () => {
        if (!runId) {
            setStats(null);
            setError('NO_RUN_ID');
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const data = await canonicalApi.getSignalStats(runId, strategyId ?? undefined);
            setStats(data);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    }, [runId, strategyId]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { stats, loading, error, refresh, noRunId };
}

/**
 * Hook for shock stats - REQUIRES run_id
 * Returns noRunId: true if runId is missing
 */
export function useShockStats(
    runId: string | null | undefined,
    strategyId?: string | null,
) {
    const [stats, setStats] = useState<ShockStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const noRunId = !runId;

    const refresh = useCallback(async () => {
        if (!runId) {
            setStats(null);
            setError('NO_RUN_ID');
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const data = await canonicalApi.getShockStats(runId, strategyId ?? undefined);
            setStats(data);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    }, [runId, strategyId]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { stats, loading, error, refresh, noRunId };
}

export async function prefetchCanonicalTrades(
    runId: string | null | undefined,
    limit = 50,
    options?: {
        commissionView?: 'reported' | 'economic';
        includeAnomalies?: boolean;
        onlyAnomalies?: boolean;
        strategyId?: string;
        portfolioEpoch?: number;
    },
): Promise<void> {
    const cacheKey = buildCanonicalTradesCacheKey(runId, limit, options);
    if (!runId || readCanonicalTradesHotCache(cacheKey)) {
        return;
    }
    const payload = await canonicalApi.getTrades(runId, limit, options);
    writeCanonicalTradesHotCache(cacheKey, payload);
}

/**
 * Hook for canonical KPIs - REQUIRES run_id
 * Returns noRunId: true if runId is missing
 * @param runId - run_id to scope the query
 * @param options.disablePolling - if true, disables automatic polling (for use when parent polls)
 */
export function useCanonicalKPIs(
    runId: string | null | undefined,
    strategyId?: string | null,
    options?: { disablePolling?: boolean; commissionView?: 'reported' | 'economic' },
) {
    const [kpis, setKpis] = useState<CanonicalKPIs | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const noRunId = !runId;
    const disablePolling = options?.disablePolling ?? false;

    const refresh = useCallback(async () => {
        if (!runId) {
            setKpis(null);
            setError('NO_RUN_ID');
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const data = await canonicalApi.getKPIs(
                runId,
                strategyId ?? undefined,
                options?.commissionView ?? "reported"
            );
            setKpis(data);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    }, [runId, strategyId, options?.commissionView]);

    useEffect(() => {
        refresh();
        // PERFORMANCE: Only poll if not disabled and runId exists
        const interval = (!disablePolling && runId) ? setInterval(refresh, 60000) : undefined;
        return () => { if (interval) clearInterval(interval); };
    }, [runId, refresh, disablePolling]);

    return { kpis, loading, error, refresh, noRunId };
}

/**
 * Hook for canonical trades - REQUIRES run_id
 * Returns noRunId: true if runId is missing
 * @param runId - run_id to scope the query
 * @param limit - max number of trades to fetch
 * @param options.disablePolling - if true, disables automatic polling (for use when parent polls)
 */
export function useCanonicalTrades(
    runId: string | null | undefined,
    limit = 50,
    options?: {
        disablePolling?: boolean;
        enabled?: boolean;
        commissionView?: 'reported' | 'economic';
        includeAnomalies?: boolean;
        onlyAnomalies?: boolean;
        strategyId?: string;
        portfolioEpoch?: number;
    },
) {
    const [trades, setTrades] = useState<CanonicalTrade[]>([]);
    const [meta, setMeta] = useState<CanonicalTradesResponse['_meta']>();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const noRunId = !runId;
    const disablePolling = options?.disablePolling ?? false;
    const enabled = options?.enabled ?? true;
    const abortRef = useRef<AbortController | null>(null);
    const cacheKey = buildCanonicalTradesCacheKey(runId, limit, options);

    const refresh = useCallback(async (config?: { silent?: boolean }) => {
        if (!runId) {
            abortRef.current?.abort();
            setTrades([]);
            setMeta(undefined);
            setError('NO_RUN_ID');
            setLoading(false);
            return;
        }
        if (!enabled) {
            abortRef.current?.abort();
            setLoading(false);
            return;
        }
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        const warmPayload = findCanonicalTradesWarmCache(runId, limit, options);
        const hasWarmPayload = Boolean(warmPayload);
        if (warmPayload) {
            setTrades(warmPayload.trades);
            setMeta(warmPayload._meta);
            setError(null);
        }
        setLoading(!(config?.silent && hasWarmPayload));
        try {
            const data = await canonicalApi.getTrades(runId, limit, {
                commissionView: options?.commissionView,
                includeAnomalies: options?.includeAnomalies,
                onlyAnomalies: options?.onlyAnomalies,
                strategyId: options?.strategyId,
                portfolioEpoch: options?.portfolioEpoch,
                signal: controller.signal,
            });
            if (controller.signal.aborted) {
                return;
            }
            writeCanonicalTradesHotCache(cacheKey, data);
            setTrades(data.trades);
            setMeta(data._meta);
            setError(null);
        } catch (e) {
            if (controller.signal.aborted || isAbortLikeError(e)) {
                return;
            }
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            if (abortRef.current === controller) {
                abortRef.current = null;
                setLoading(false);
            }
        }
    }, [
        enabled,
        runId,
        limit,
        options?.commissionView,
        options?.includeAnomalies,
        options?.onlyAnomalies,
        options?.strategyId,
        options?.portfolioEpoch,
        cacheKey,
    ]);

    useEffect(() => {
        if (!enabled) {
            abortRef.current?.abort();
            setLoading(false);
            return () => {
                abortRef.current?.abort();
            };
        }
        const warmPayload = findCanonicalTradesWarmCache(runId, limit, options);
        if (warmPayload) {
            setTrades(warmPayload.trades);
            setMeta(warmPayload._meta);
            setError(null);
            setLoading(false);
        } else {
            setTrades([]);
            setMeta(undefined);
        }
        void refresh({ silent: Boolean(warmPayload) });
        // PERFORMANCE: Only poll if not disabled and runId exists
        const interval =
            !disablePolling && runId
                ? setInterval(() => {
                      void refresh({ silent: true });
                  }, 60_000)
                : undefined;
        return () => {
            abortRef.current?.abort();
            if (interval) clearInterval(interval);
        };
    }, [runId, refresh, disablePolling, enabled, cacheKey]);

    return { trades, meta, loading, error, refresh, noRunId };
}

/**
 * Hook for signals list - REQUIRES run_id
 */
export function useSignals(
    runId: string | null | undefined,
    params?: {
        limit?: number;
        accepted?: boolean;
        from_ts?: string;
        to_ts?: string;
        order?: "asc" | "desc";
        strategyId?: string;
    }
) {
    const [signals, setSignals] = useState<Signal[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const noRunId = !runId;

    const refresh = useCallback(async () => {
        if (!runId) {
            setSignals([]);
            setError('NO_RUN_ID');
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const data = await canonicalApi.listSignals(runId, params);
            setSignals(data.signals);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    }, [
        runId,
        params?.limit,
        params?.accepted,
        params?.from_ts,
        params?.to_ts,
        params?.order,
        params?.strategyId,
    ]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { signals, loading, error, refresh, noRunId };
}

/**
 * Hook for shocks list - REQUIRES run_id
 */
const SHOCKS_PAGE_LIMIT = 1000;
const SHOCKS_MAX_TOTAL = 10000;

export function useShocks(
    runId: string | null | undefined,
    params?: {
        limit?: number;
        window?: { start: string; end: string };
        strategyId?: string;
    }
) {
    const [shocks, setShocks] = useState<Shock[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const noRunId = !runId;

    const normalizeTs = (ts: string | null | undefined): string | null => {
        if (!ts) return null;
        const candidate = ts.includes(' ') && !ts.includes('T') ? ts.replace(' ', 'T') : ts;
        return candidate;
    };

    const parseTs = (ts: string | null | undefined): number => {
        const norm = normalizeTs(ts);
        if (!norm) return Number.NaN;
        const parsed = Date.parse(norm);
        return Number.isFinite(parsed) ? parsed : Number.NaN;
    };

    const refresh = useCallback(async () => {
        if (!runId) {
            setShocks([]);
            setError('NO_RUN_ID');
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            // If a run window is provided, page through the entire window
            if (params?.window?.start && params.window.end) {
                const collected: Shock[] = [];
                let cursor = params.window.end;
                const fromTs = params.window.start;

                while (cursor && collected.length < SHOCKS_MAX_TOTAL) {
                    const page = await canonicalApi.listShocks(runId, {
                        limit: SHOCKS_PAGE_LIMIT,
                        order: "desc",
                        from_ts: fromTs,
                        to_ts: cursor,
                        strategyId: params?.strategyId,
                    });
                    const batch = page.shocks ?? [];
                    if (!batch.length) break;
                    collected.push(...batch);
                    if (batch.length < SHOCKS_PAGE_LIMIT) break;

                    const oldest = batch[batch.length - 1]?.timestamp;
                    if (!oldest) break;
                    const nextCursorMs = parseTs(oldest) - 1;
                    if (!Number.isFinite(nextCursorMs)) break;
                    cursor = new Date(nextCursorMs).toISOString();
                }

                const sorted = collected.sort(
                    (a, b) => parseTs(a.timestamp) - parseTs(b.timestamp)
                );
                setShocks(sorted.slice(0, SHOCKS_MAX_TOTAL));
                setError(null);
                return;
            }

            // Fallback: bounded list
            const data = await canonicalApi.listShocks(runId, params);
            const sorted = [...(data.shocks || [])].sort(
                (a, b) => parseTs(a.timestamp) - parseTs(b.timestamp)
            );
            setShocks(sorted);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    }, [runId, params?.limit, params?.window?.start, params?.window?.end, params?.strategyId]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { shocks, loading, error, refresh, noRunId };
}

function sternFallbackState(): SternStateSnapshot {
    return {
        product_id: 'BTC-USD',
        best_bid: { price: null },
        best_ask: { price: null },
        mid_price: null,
        recent_trades: [],
        fills: [],
        mid_history: [],
        portfolio: {
            equity: 1_000_000,
            realized_pnl: 0,
            unrealized_pnl: 0,
            position_btc: 0,
        },
        strategy: { fill_count: 0 },
        runtime: {
            uptime_s: 0,
            last_trade_ts: null,
            feed_state: 'warming',
        },
    };
}

async function sternFetchState(signal?: AbortSignal): Promise<SternStateSnapshot> {
    if (!STERN_COMPAT) {
        return sternFallbackState();
    }
    try {
        return await fetchJson<SternStateSnapshot>(
            '/api/state',
            signal ? { signal } : undefined,
        );
    } catch {
        return sternFallbackState();
    }
}

function sternSymbol(state: SternStateSnapshot): string {
    return state.product_id || 'BTC-USD';
}

function sternNowIso(state: SternStateSnapshot): string {
    return (
        state.runtime?.last_trade_ts ||
        state.fills?.[0]?.ts ||
        state.recent_trades?.[0]?.ts ||
        state.mid_history?.[state.mid_history.length - 1]?.ts ||
        new Date().toISOString()
    );
}

function sternTotalPnl(state: SternStateSnapshot): number {
    return (state.portfolio?.realized_pnl ?? 0) + (state.portfolio?.unrealized_pnl ?? 0);
}

function sternRun(state: SternStateSnapshot): Run {
    const startTs = state.mid_history?.[0]?.ts || sternNowIso(state);
    const updatedAt = sternNowIso(state);
    return {
        run_id: STERN_RUN_ID,
        strategy: 'damping_wave',
        cfg_hash: null,
        start_ts: startTs,
        end_ts: null,
        status: 'running',
        source: 'paper',
        pnl_total: sternTotalPnl(state),
        trades_count: state.strategy?.fill_count ?? state.fills?.length ?? 0,
        notes: 'Synthetic Stern run from /api/state',
        created_at: startTs,
        updated_at: updatedAt,
    };
}

function sternSignals(state: SternStateSnapshot, limit = 200): Signal[] {
    const symbol = sternSymbol(state);
    const fills = state.fills ?? [];
    if (fills.length > 0) {
        return fills.slice(0, limit).map((fill, index) => ({
            signal_id: `stern-fill-${fill.fill_id ?? index}`,
            run_id: STERN_RUN_ID,
            strategy: 'damping_wave',
            symbol,
            direction: (String(fill.side || 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY'),
            signal_type: 'ENTRY',
            strength: null,
            price_at_signal: fill.price ?? null,
            timestamp: fill.ts || sternNowIso(state),
            z_score: null,
            anchor_price: fill.price ?? null,
            volatility: null,
            spread: null,
            session: null,
            regime: 'LIVE',
            accepted: true,
            rejection_reason: null,
            shock_id: `stern-shock-${fill.fill_id ?? index}`,
            shock_magnitude: null,
            was_traded: true,
            trade_id: `stern-trade-${fill.fill_id ?? index}`,
            outcome: 'PENDING',
            reason: fill.reason ?? 'fill',
            config_snapshot: null,
            created_at: fill.ts || sternNowIso(state),
        }));
    }

    return (state.recent_trades ?? []).slice(0, limit).map((trade, index) => ({
        signal_id: `stern-signal-${trade.trade_id ?? index}`,
        run_id: STERN_RUN_ID,
        strategy: 'damping_wave',
        symbol,
        direction: (String(trade.side || 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY'),
        signal_type: 'REJECTED',
        strength: null,
        price_at_signal: trade.price ?? null,
        timestamp: trade.ts || sternNowIso(state),
        z_score: null,
        anchor_price: trade.price ?? null,
        volatility: null,
        spread: null,
        session: null,
        regime: 'LIVE',
        accepted: false,
        rejection_reason: 'market_observation',
        shock_id: `stern-shock-${trade.trade_id ?? index}`,
        shock_magnitude: null,
        was_traded: false,
        trade_id: null,
        outcome: 'SKIPPED',
        reason: 'market_observation',
        config_snapshot: null,
        created_at: trade.ts || sternNowIso(state),
    }));
}

function sternShocks(state: SternStateSnapshot, limit = 200): Shock[] {
    const symbol = sternSymbol(state);
    const bid = state.best_bid?.price ?? null;
    const ask = state.best_ask?.price ?? null;
    return (state.recent_trades ?? []).slice(0, limit).map((trade, index) => {
        const price = trade.price ?? state.mid_price ?? null;
        return {
            shock_id: `stern-shock-${trade.trade_id ?? index}`,
            run_id: STERN_RUN_ID,
            symbol,
            timestamp: trade.ts || sternNowIso(state),
            direction: String(trade.side || 'BUY').toUpperCase() === 'SELL' ? 'DOWN' : 'UP',
            magnitude_pips: null,
            magnitude_pct: null,
            duration_ms: null,
            shock_type: 'trade_print',
            z_score: null,
            volatility: null,
            session: null,
            accepted: true,
            price_before: state.mid_price ?? null,
            price_after: price,
            price_high: price,
            price_low: price,
            spread_at_shock:
                bid != null && ask != null && state.mid_price
                    ? ((ask - bid) / state.mid_price) * 10_000
                    : null,
            volume_spike: false,
            volatility_regime: 'MEDIUM',
            detector_version: 'stern_compat',
            detection_params: null,
            was_traded: false,
            signal_id: null,
            trade_outcome: null,
            trajectory_json: null,
            created_at: trade.ts || sternNowIso(state),
        };
    });
}

function sternTrades(state: SternStateSnapshot, limit = 200): CanonicalTrade[] {
    const symbol = sternSymbol(state);
    return (state.fills ?? []).slice(0, limit).map((fill, index) => ({
        canonical_id: index + 1,
        trade_id: `stern-trade-${fill.fill_id ?? index}`,
        signal_id: `stern-fill-${fill.fill_id ?? index}`,
        run_id: STERN_RUN_ID,
        strategy_id: 'damping_wave',
        symbol,
        side: String(fill.side || 'BUY').toUpperCase(),
        qty: fill.size ?? null,
        entry_price: fill.price ?? null,
        exit_price: null,
        entry_time: fill.ts || sternNowIso(state),
        exit_time: fill.ts || sternNowIso(state),
        status: 'OPEN',
        pnl: null,
        source_db: 'stern_state',
        pnl_pips: null,
        pnl_net_eur: null,
        pnl_net_pips: null,
        pnl_gross_eur: null,
        pnl_net_usd: null,
        pnl_gross_usd: null,
        commission_total_eur: null,
        commission_total_usd: null,
        commission_total_usd_reported: null,
        commission_total_usd_economic: null,
        commission_model: 'stern_state',
        portfolio_epoch: 1,
    }));
}

function sternSignalStats(state: SternStateSnapshot): SignalStats {
    const signals = sternSignals(state, 500);
    const accepted = signals.filter((signal) => signal.accepted).length;
    const traded = signals.filter((signal) => signal.was_traded).length;
    return {
        total_signals: signals.length,
        accepted_signals: accepted,
        traded_signals: traded,
        profitable_signals: 0,
        conversion_rate: signals.length ? traded / signals.length : 0,
        win_rate: 0,
        by_type: signals.reduce<Record<string, number>>((acc, signal) => {
            acc[signal.signal_type] = (acc[signal.signal_type] ?? 0) + 1;
            return acc;
        }, {}),
        by_rejection_reason: signals.reduce<Record<string, number>>((acc, signal) => {
            if (signal.rejection_reason) {
                acc[signal.rejection_reason] = (acc[signal.rejection_reason] ?? 0) + 1;
            }
            return acc;
        }, {}),
        by_stage: { runtime: signals.length },
    };
}

function sternShockStats(state: SternStateSnapshot): ShockStats {
    const shocks = sternShocks(state, 500);
    return {
        total_shocks: shocks.length,
        traded_shocks: 0,
        avg_magnitude_pips: 0,
        conversion_rate: 0,
        by_direction: shocks.reduce<Record<string, number>>((acc, shock) => {
            const key = shock.direction ?? 'UNKNOWN';
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
        }, {}),
        by_session: shocks.reduce<Record<string, number>>((acc, shock) => {
            const key = shock.session ?? 'UNKNOWN';
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
        }, {}),
    };
}

function sternPortfolioSummary(state: SternStateSnapshot): PortfolioSummaryResponse {
    const equity = state.portfolio?.equity ?? 1_000_000;
    const totalPnl = sternTotalPnl(state);
    return {
        current_epoch: 1,
        sim_equity_usd: equity,
        equity_usd: equity,
        pnl_epoch_usd: totalPnl,
        pnl_7d_usd: totalPnl,
        pnl_30d_usd: totalPnl,
        trades_7d: state.strategy?.fill_count ?? state.fills?.length ?? 0,
        trades_30d: state.strategy?.fill_count ?? state.fills?.length ?? 0,
        epoch_started_at: state.mid_history?.[0]?.ts ?? null,
        _meta: {
            db_exists: false,
            generated_at_utc: sternNowIso(state),
        },
    };
}

function sternApplyCompat(): void {
    if (!STERN_COMPAT) {
        return;
    }

    Object.assign(canonicalApi, {
        getPortfolioEpoch: async (): Promise<PortfolioEpochResponse> => {
            const state = await sternFetchState();
            return {
                current_epoch: 1,
                sim_equity_usd: state.portfolio?.equity ?? 1_000_000,
                trades_in_epoch: state.strategy?.fill_count ?? state.fills?.length ?? 0,
                pnl_epoch_usd: sternTotalPnl(state),
                equity_usd: state.portfolio?.equity ?? 1_000_000,
                epoch_started_at: state.mid_history?.[0]?.ts ?? null,
                _meta: { db_exists: false },
            };
        },
        getPortfolioSummary: async (): Promise<PortfolioSummaryResponse> => {
            return sternPortfolioSummary(await sternFetchState());
        },
        getPortfolioTrades: async (params?: {
            limit?: number;
        }): Promise<CanonicalTradesResponse> => {
            const state = await sternFetchState();
            const trades = sternTrades(state, params?.limit ?? 200);
            return {
                trades,
                count: trades.length,
                _meta: {
                    commission_view_used: 'reported',
                    portfolio_epoch: 1,
                    epoch_started_at: state.mid_history?.[0]?.ts ?? null,
                },
            };
        },
        listPortfolioEpochs: async (): Promise<EpochListResponse> => {
            const state = await sternFetchState();
            return {
                epochs: [
                    {
                        epoch: 1,
                        trade_count: state.strategy?.fill_count ?? state.fills?.length ?? 0,
                        closed_count: 0,
                        first_trade: state.fills?.[state.fills.length - 1]?.ts ?? null,
                        last_trade: state.fills?.[0]?.ts ?? null,
                        pnl_usd: sternTotalPnl(state),
                        is_current: true,
                    },
                ],
                current_epoch: 1,
            };
        },
        advancePortfolioEpoch: async (): Promise<AdvanceEpochResponse> => ({
            previous_epoch: 1,
            new_epoch: 1,
            advanced_at: new Date().toISOString(),
        }),
        listRuns: async (params?: {
            strategy?: string;
            status?: 'running' | 'closed' | 'aborted';
            limit?: number;
        }): Promise<RunsListResponse> => {
            const state = await sternFetchState();
            const run = sternRun(state);
            const runs =
                params?.strategy && params.strategy !== 'damping_wave'
                    ? []
                    : [run];
            return {
                runs: runs.slice(0, params?.limit ?? runs.length),
                count: runs.length,
            };
        },
        getActiveRun: async (strategy?: string): Promise<ActiveRunResponse> => {
            if (strategy && strategy !== 'damping_wave') {
                return { active: null };
            }
            return { active: sternRun(await sternFetchState()) };
        },
        getRun: async (runId: string): Promise<Run> => {
            if (runId !== STERN_RUN_ID) {
                throw new ApiHttpError(404, 'run not found', 'Not Found');
            }
            return sternRun(await sternFetchState());
        },
        resolveRunScope: async (params: {
            strategyId: string;
            scope: RunResolveScope;
            date?: string;
        }): Promise<RunResolveResponse> => {
            const state = await sternFetchState();
            const targetDate = resolveScopeDate(params.scope, params.date);
            if (params.strategyId !== 'damping_wave') {
                return {
                    resolved: false,
                    run_id: null,
                    strategy_id: params.strategyId,
                    strategy_version: null,
                    trade_date: targetDate,
                    root_dir: null,
                    available_dbs: [],
                    data_origin: 'stern_state',
                    scope: params.scope,
                    target_date: targetDate,
                };
            }
            return {
                resolved: true,
                run_id: STERN_RUN_ID,
                strategy_id: 'damping_wave',
                strategy_version: null,
                trade_date: targetDate,
                root_dir: null,
                available_dbs: ['state'],
                data_origin: 'stern_state',
                scope: params.scope,
                target_date: targetDate,
                status: 'running',
                source: 'paper',
                start_ts: state.mid_history?.[0]?.ts ?? sternNowIso(state),
                end_ts: null,
            };
        },
        listSignals: async (
            runId: string,
            params?: { limit?: number; accepted?: boolean; order?: 'asc' | 'desc' },
        ): Promise<SignalsListResponse> => {
            requireRunId(runId, 'listSignals');
            if (runId !== STERN_RUN_ID) {
                return { signals: [], count: 0 };
            }
            const state = await sternFetchState();
            let signals = sternSignals(state, params?.limit ?? 200);
            if (params?.accepted !== undefined) {
                signals = signals.filter((signal) => signal.accepted === params.accepted);
            }
            if (params?.order === 'asc') {
                signals = [...signals].reverse();
            }
            return { signals, count: signals.length };
        },
        listSignalsScoped: async (params: {
            scope: SignalScope;
            runId: string;
            strategyId: string;
            fromDate?: string;
            toDate?: string;
            limit?: number;
        }): Promise<ScopedSignalsResponse> => {
            const signals = (await canonicalApi.listSignals(params.runId, {
                limit: params.limit,
            })).signals.map((signal) => ({
                timestamp: signal.timestamp,
                symbol: signal.symbol,
                direction: signal.direction,
                signal_type: signal.signal_type,
                z_score: signal.z_score,
                anchor_price: signal.anchor_price,
                volatility: signal.volatility,
                spread: signal.spread,
                session: signal.session,
                regime: signal.regime,
                accepted: signal.accepted,
                rejection_reason: signal.rejection_reason,
                run_id: signal.run_id,
                signal_id: signal.signal_id,
                trade_id: signal.trade_id,
                was_traded: signal.was_traded,
                portfolio_epoch: 1,
            }));
            return {
                signals,
                _meta: {
                    run_id: params.runId,
                    scope: params.scope,
                    from_date: params.fromDate,
                    to_date: params.toDate,
                    count: signals.length,
                    cross_run: false,
                    portfolio_epoch: 1,
                    epoch_started_at: null,
                },
            };
        },
        getSignalStats: async (runId: string): Promise<SignalStats> => {
            requireRunId(runId, 'getSignalStats');
            if (runId !== STERN_RUN_ID) {
                return sternSignalStats(sternFallbackState());
            }
            return sternSignalStats(await sternFetchState());
        },
        getSignal: async (signalId: string): Promise<Signal> => {
            const state = await sternFetchState();
            const signal = sternSignals(state, 500).find((entry) => entry.signal_id === signalId);
            if (!signal) {
                throw new ApiHttpError(404, 'signal not found', 'Not Found');
            }
            return signal;
        },
        listShocks: async (
            runId: string,
            params?: { limit?: number; order?: 'asc' | 'desc' },
        ): Promise<ShocksListResponse> => {
            requireRunId(runId, 'listShocks');
            if (runId !== STERN_RUN_ID) {
                return { shocks: [], count: 0 };
            }
            const state = await sternFetchState();
            let shocks = sternShocks(state, params?.limit ?? 200);
            if (params?.order === 'asc') {
                shocks = [...shocks].reverse();
            }
            return { shocks, count: shocks.length };
        },
        listShocksScoped: async (params: {
            scope: ShockScope;
            runId: string;
            strategyId: string;
            fromDate?: string;
            toDate?: string;
            limit?: number;
        }): Promise<ScopedShocksResponse> => {
            const shocks = (await canonicalApi.listShocks(params.runId, {
                limit: params.limit,
            })).shocks.map((shock) => ({
                shock_id: shock.shock_id,
                run_id: shock.run_id,
                symbol: shock.symbol,
                timestamp: shock.timestamp,
                direction: shock.direction,
                magnitude_pips: shock.magnitude_pips,
                magnitude_pct: shock.magnitude_pct,
                duration_ms: shock.duration_ms,
                price_before: shock.price_before,
                price_after: shock.price_after,
                price_high: shock.price_high,
                price_low: shock.price_low,
                spread_at_shock: shock.spread_at_shock,
                volume_spike: shock.volume_spike,
                volatility_regime: shock.volatility_regime,
                detector_version: shock.detector_version,
                detection_params: shock.detection_params,
                was_traded: shock.was_traded,
                signal_id: shock.signal_id,
                trade_outcome: shock.trade_outcome,
                trajectory_json: shock.trajectory_json,
                portfolio_epoch: 1,
            }));
            return {
                shocks,
                _meta: {
                    run_id: params.runId,
                    scope: params.scope,
                    from_date: params.fromDate,
                    to_date: params.toDate,
                    count: shocks.length,
                    cross_run: false,
                    portfolio_epoch: 1,
                    epoch_started_at: null,
                },
            };
        },
        getShockStats: async (runId: string): Promise<ShockStats> => {
            requireRunId(runId, 'getShockStats');
            if (runId !== STERN_RUN_ID) {
                return sternShockStats(sternFallbackState());
            }
            return sternShockStats(await sternFetchState());
        },
        getShock: async (shockId: string): Promise<Shock> => {
            const state = await sternFetchState();
            const shock = sternShocks(state, 500).find((entry) => entry.shock_id === shockId);
            if (!shock) {
                throw new ApiHttpError(404, 'shock not found', 'Not Found');
            }
            return shock;
        },
        getKPIs: async (runId: string): Promise<CanonicalKPIs> => {
            requireRunId(runId, 'getKPIs');
            const state = await sternFetchState();
            return {
                pnl_total: sternTotalPnl(state),
                pnl_today: sternTotalPnl(state),
                trades_count: state.strategy?.fill_count ?? state.fills?.length ?? 0,
                linked_signals_count: sternSignals(state, 500).filter((signal) => signal.was_traded).length,
                win_rate: 0,
                last_sync: sternNowIso(state),
                db_exists: true,
            };
        },
        getTrades: async (
            runId: string,
            limit = 50,
            options?: { signal?: AbortSignal },
        ): Promise<CanonicalTradesResponse> => {
            requireRunId(runId, 'getTrades');
            if (runId !== STERN_RUN_ID) {
                return { trades: [], count: 0 };
            }
            const state = await sternFetchState(options?.signal);
            const trades = sternTrades(state, limit);
            return {
                trades,
                count: trades.length,
                _meta: {
                    commission_view_used: 'reported',
                    portfolio_epoch: 1,
                    epoch_started_at: state.mid_history?.[0]?.ts ?? null,
                },
            };
        },
        getTradesByDate: async (params: {
            runId: string;
            strategyId: string;
            scope?: TradeScope;
            fromDate?: string;
            toDate?: string;
            limit?: number;
        }): Promise<CanonicalTradesResponse> => {
            return canonicalApi.getTrades(params.runId, params.limit ?? 200);
        },
        getTradesScoped: async (params: {
            runId: string;
            strategyId: string;
            scope: 'TODAY' | '7D' | '30D';
            limit?: number;
        }): Promise<CanonicalTradesResponse> => {
            return canonicalApi.getTrades(params.runId, params.limit ?? 200);
        },
        syncTrades: async (): Promise<{ status: string; synced: number }> => ({
            status: 'unsupported_in_stern',
            synced: 0,
        }),
        getRunWindow: async (runId: string): Promise<{ start: string; end: string } | null> => {
            requireRunId(runId, 'getRunWindow');
            if (runId !== STERN_RUN_ID) {
                return null;
            }
            const state = await sternFetchState();
            const points = state.mid_history ?? [];
            const start = points[0]?.ts;
            const end = points[points.length - 1]?.ts ?? sternNowIso(state);
            return start ? { start, end } : null;
        },
    });
}

sternApplyCompat();

export default canonicalApi;

// =============================================================================
// COMPUTED STATS - Canonical execution stats (replaces shadow stats)
// =============================================================================

export interface ExecutionStats {
    winRate: number;
    profitFactor: number;
    sharpe: number;
    dailyPnL: number;
    cumulativePnL: number;
    tradeCount: number;
    dataSource: 'canonical' | 'shadow' | 'none';
}

function isOrphanOrBackfill(trade: CanonicalTrade): boolean {
    const reason = (trade.exit_reason || '').toUpperCase();
    const run = (trade.run_id || '').toLowerCase();
    if (run.startsWith('orphan')) return true;
    if (reason.includes('ORPHAN')) return true;
    return reason === 'ENTRY';
}

function isOutlierTrade(
    trade: CanonicalTrade,
    startingEquity: number = 5_000
): boolean {
    const pnlUsd = computeNetPnlUsd(trade);
    const pnlPips = trade.pnl_net_pips ?? trade.pnl_pips ?? 0;
    const maxUsd = startingEquity * 1.5;
    const maxPips = 500;
    return Math.abs(pnlUsd) > maxUsd || Math.abs(pnlPips) > maxPips;
}

function computeNetPnlEur(trade: CanonicalTrade): number {
    if (trade.pnl_net_eur_used != null) return trade.pnl_net_eur_used;
    if (trade.pnl_net_eur != null) return trade.pnl_net_eur;
    if (trade.pnl != null) return trade.pnl;
    const pips = trade.net_pips_used ?? trade.pnl_net_pips ?? trade.pnl_pips ?? 0;
    const qty = trade.qty ?? 0;
    const entry = trade.entry_price ?? 1;
    return (pips * qty * 0.0001) / entry;
}

function computeNetPnlUsd(trade: CanonicalTrade): number {
    if (trade.pnl_net_usd_used != null) return trade.pnl_net_usd_used;
    if (trade.pnl_net_usd != null) return trade.pnl_net_usd;
    if (trade.pnl_net_eur_used != null && trade.fx_rate_used != null) {
        return trade.pnl_net_eur_used * trade.fx_rate_used;
    }
    const pips = trade.net_pips_used ?? trade.pnl_net_pips ?? trade.pnl_pips ?? 0;
    const qty = trade.qty ?? 0;
    return pips * qty * 0.0001;
}

/**
 * Compute execution stats from canonical trades
 * This replaces the legacy computeShadowStats function
 */
export function computeCanonicalStats(trades: CanonicalTrade[]): ExecutionStats {
    if (!trades || trades.length === 0) {
        return {
            winRate: 0,
            profitFactor: 0,
            sharpe: 0,
            dailyPnL: 0,
            cumulativePnL: 0,
            tradeCount: 0,
            dataSource: 'none',
        };
    }

    const sanitized = trades
        .filter((t) => t.status === 'CLOSED')
        .filter((t) => !isOrphanOrBackfill(t))
        .filter((t) => !isOutlierTrade(t));

    if (!sanitized.length) {
        return {
            winRate: 0,
            profitFactor: 0,
            sharpe: 0,
            dailyPnL: 0,
            cumulativePnL: 0,
            tradeCount: 0,
            dataSource: 'none',
        };
    }

    const pnlValues = sanitized.map((t) => computeNetPnlUsd(t));
    const wins = pnlValues.filter((p) => p > 0).length;
    const winRate = pnlValues.length ? wins / pnlValues.length : 0;

    const grossWin = pnlValues.filter((p) => p > 0).reduce((a, b) => a + b, 0);
    const grossLoss = Math.abs(
        pnlValues.filter((p) => p < 0).reduce((a, b) => a + b, 0)
    );
    const profitFactor =
        grossLoss === 0 ? (grossWin > 0 ? Infinity : 0) : grossWin / grossLoss;

    const cumulativePnL = pnlValues.reduce((a, b) => a + b, 0);

    // Daily PnL: sum of trades from today
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const dailyPnL = sanitized
        .filter((t) => new Date(t.exit_time || t.entry_time) >= todayStart)
        .reduce((sum, t) => sum + computeNetPnlUsd(t), 0);

    // Sharpe approximation (requires more data for proper calculation)
    const mean = pnlValues.length ? cumulativePnL / pnlValues.length : 0;
    const variance =
        pnlValues.length > 1
            ? pnlValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (pnlValues.length - 1)
            : 0;
    const sharpe = variance === 0 ? 0 : mean / Math.sqrt(variance || 1);

    return {
        winRate,
        profitFactor: Number.isFinite(profitFactor) ? profitFactor : 0,
        sharpe,
        dailyPnL,
        cumulativePnL,
        tradeCount: sanitized.length,
        dataSource: 'canonical',
    };
}

/**
 * Hook for canonical execution stats - REQUIRES run_id
 * Computes stats from canonical_trades.sqlite
 * PERFORMANCE: Disable polling by default since parent usually polls
 */
export function useCanonicalRunStats(
    runId: string | null | undefined,
    strategyId?: string | null,
    options?: { disablePolling?: boolean; commissionView?: 'reported' | 'economic' },
) {
    const { trades, loading, error, noRunId } = useCanonicalTrades(runId, 500, {
        disablePolling: options?.disablePolling ?? true,
        commissionView: options?.commissionView ?? "reported",
        strategyId: strategyId ?? undefined,
    });
    const stats = useMemo(() => computeCanonicalStats(trades), [trades]);

    return {
        stats,
        loading,
        error,
        noRunId,
        tradeCount: trades.length,
    };
}
