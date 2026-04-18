/**
 * SelectionContext.tsx — Quant Lab V3 Phase 6
 *
 * Cross-tab selection state for linked brushing between Quant Lab views.
 * Allows filtering by config_id, time range, regime, etc. across tabs.
 *
 * V3.1: Added dataScope for "Current Run" vs "Full Portfolio" toggle
 * V3.2: Extended dataScope (TODAY/7D/EPOCH/RUN/BACKTEST) + strategyFilter
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { useRunId, useRunMeta } from "./useRunContext";
import { usePortfolioEpoch } from "./usePortfolioEpoch";

// Data scope: granular time/source selection for Quant Lab
export type QuantLabDataScope =
    | "TODAY"
    | "YESTERDAY"
    | "7D"
    | "EPOCH"
    | "RUN"
    | "BACKTEST";

// Strategy filter: null = all strategies
export type StrategyFilter = "damping_wave" | "s2_pairs_trading" | "tf_pullback_v1" | null;

export interface QuantScopeRequest {
    scope: "TODAY" | "YESTERDAY" | "7D" | "30D" | "RUN" | "EPOCH" | "BACKTEST";
    runId: string | undefined;
    strategyId: string | null;
    portfolioEpoch: number | null;
    fromDate: string | null;
    toDate: string | null;
    scopeLabel: string;
    isCrossRun: boolean;
    missingRunId: boolean;
    isBacktest: boolean;
    effectiveRunId: string | undefined;
    effectiveStrategyId: string | null;
}

// Selection filter types
export interface SelectionFilter {
    // Data scope - determines time window and data source
    dataScope: QuantLabDataScope;

    // Strategy filter - null means all strategies (S1+S2+S3)
    strategyFilter: StrategyFilter;

    // Backtest run_id - only used when dataScope === "BACKTEST"
    backtestRunId?: string;

    // Config selection
    config_ids?: string[];

    // Time range selection
    time_range?: {
        start: string; // ISO date
        end: string;
    };

    // Regime selection
    regime?: {
        session?: string; // e.g., "ASIA", "LONDON", "NY"
        spread_bucket?: string; // e.g., "tight", "medium", "wide"
        vol_bucket?: string; // e.g., "low", "medium", "high"
    };

    // Feature filter (from amplitude/outcome scatter)
    amplitude_range?: {
        min: number;
        max: number;
    };

    // Outcome filter
    outcome_filter?: "winners" | "losers" | "all";

    // Custom tags
    tags?: string[];
}

interface SelectionContextType {
    // Current selection
    selection: SelectionFilter;

    // Data scope (most important for Quant Lab)
    dataScope: QuantLabDataScope;
    setDataScope: (scope: QuantLabDataScope) => void;

    // Strategy filter
    strategyFilter: StrategyFilter;
    setStrategyFilter: (strategy: StrategyFilter) => void;

    // Backtest run selection
    backtestRunId: string | undefined;
    setBacktestRunId: (runId: string) => void;

    // Update methods
    setConfigIds: (ids: string[]) => void;
    setTimeRange: (start: string, end: string) => void;
    setRegime: (regime: SelectionFilter["regime"]) => void;
    setAmplitudeRange: (min: number, max: number) => void;
    setOutcomeFilter: (filter: "winners" | "losers" | "all") => void;
    addTag: (tag: string) => void;
    removeTag: (tag: string) => void;

    // Clear methods
    clearSelection: () => void;
    clearConfigIds: () => void;
    clearTimeRange: () => void;
    clearRegime: () => void;

    // Query string builder for API calls
    buildQueryParams: (currentRunId?: string | null) => URLSearchParams;

    // Check if any filter is active
    hasActiveFilters: boolean;
}

const defaultSelection: SelectionFilter = {
    dataScope: "TODAY",
    strategyFilter: null, // all strategies by default
    outcome_filter: "all",
};

const SelectionContext = createContext<SelectionContextType | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
    const [selection, setSelection] = useState<SelectionFilter>(defaultSelection);

    // Config IDs
    const setConfigIds = useCallback((ids: string[]) => {
        setSelection(prev => ({ ...prev, config_ids: ids.length > 0 ? ids : undefined }));
    }, []);

    const clearConfigIds = useCallback(() => {
        setSelection(prev => {
            const { config_ids, ...rest } = prev;
            return rest;
        });
    }, []);

    // Time range
    const setTimeRange = useCallback((start: string, end: string) => {
        setSelection(prev => ({ ...prev, time_range: { start, end } }));
    }, []);

    const clearTimeRange = useCallback(() => {
        setSelection(prev => {
            const { time_range, ...rest } = prev;
            return rest;
        });
    }, []);

    // Regime
    const setRegime = useCallback((regime: SelectionFilter["regime"]) => {
        setSelection(prev => ({ ...prev, regime }));
    }, []);

    const clearRegime = useCallback(() => {
        setSelection(prev => {
            const { regime, ...rest } = prev;
            return rest;
        });
    }, []);

    // Amplitude range
    const setAmplitudeRange = useCallback((min: number, max: number) => {
        setSelection(prev => ({ ...prev, amplitude_range: { min, max } }));
    }, []);

    // Outcome filter
    const setOutcomeFilter = useCallback((filter: "winners" | "losers" | "all") => {
        setSelection(prev => ({ ...prev, outcome_filter: filter }));
    }, []);

    // Tags
    const addTag = useCallback((tag: string) => {
        setSelection(prev => ({
            ...prev,
            tags: [...(prev.tags || []), tag].filter((v, i, a) => a.indexOf(v) === i),
        }));
    }, []);

    const removeTag = useCallback((tag: string) => {
        setSelection(prev => ({
            ...prev,
            tags: (prev.tags || []).filter(t => t !== tag),
        }));
    }, []);

    // Data scope
    const setDataScope = useCallback((scope: QuantLabDataScope) => {
        setSelection(prev => ({ ...prev, dataScope: scope }));
    }, []);

    // Strategy filter
    const setStrategyFilter = useCallback((strategy: StrategyFilter) => {
        setSelection(prev => ({ ...prev, strategyFilter: strategy }));
    }, []);

    // Backtest run selection
    const setBacktestRunId = useCallback((runId: string) => {
        setSelection(prev => ({ ...prev, backtestRunId: runId, dataScope: "BACKTEST" as QuantLabDataScope }));
    }, []);

    // Clear all
    const clearSelection = useCallback(() => {
        setSelection(defaultSelection);
    }, []);

    // Build query params for API calls
    const buildQueryParams = useCallback((currentRunId?: string | null) => {
        const params = new URLSearchParams();

        // Handle data scope
        if (selection.dataScope === "RUN" && currentRunId) {
            params.set("run_ids", currentRunId);
        } else if (selection.dataScope === "BACKTEST" && selection.backtestRunId) {
            params.set("run_ids", selection.backtestRunId);
            params.set("source", "backtest");
        } else if (selection.config_ids && selection.config_ids.length > 0) {
            params.set("run_ids", selection.config_ids.join(","));
        }

        if (selection.time_range) {
            params.set("start_time", selection.time_range.start);
            params.set("end_time", selection.time_range.end);
        }

        if (selection.regime?.session) {
            params.set("session", selection.regime.session);
        }
        if (selection.regime?.spread_bucket) {
            params.set("spread_bucket", selection.regime.spread_bucket);
        }
        if (selection.regime?.vol_bucket) {
            params.set("vol_bucket", selection.regime.vol_bucket);
        }

        if (selection.amplitude_range) {
            params.set("amplitude_min", String(selection.amplitude_range.min));
            params.set("amplitude_max", String(selection.amplitude_range.max));
        }

        if (selection.outcome_filter && selection.outcome_filter !== "all") {
            params.set("outcome_filter", selection.outcome_filter);
        }

        return params;
    }, [selection]);

    // Check if any filter is active
    const hasActiveFilters =
        (selection.config_ids && selection.config_ids.length > 0) ||
        !!selection.time_range ||
        !!selection.regime?.session ||
        !!selection.regime?.spread_bucket ||
        !!selection.regime?.vol_bucket ||
        !!selection.amplitude_range ||
        (selection.outcome_filter && selection.outcome_filter !== "all") ||
        (selection.tags && selection.tags.length > 0);

    return (
        <SelectionContext.Provider
            value={{
                selection,
                dataScope: selection.dataScope,
                setDataScope,
                strategyFilter: selection.strategyFilter,
                setStrategyFilter,
                backtestRunId: selection.backtestRunId,
                setBacktestRunId,
                setConfigIds,
                setTimeRange,
                setRegime,
                setAmplitudeRange,
                setOutcomeFilter,
                addTag,
                removeTag,
                clearSelection,
                clearConfigIds,
                clearTimeRange,
                clearRegime,
                buildQueryParams,
                hasActiveFilters: !!hasActiveFilters,
            }}
        >
            {children}
        </SelectionContext.Provider>
    );
}

export function useSelection() {
    const context = useContext(SelectionContext);
    if (!context) {
        throw new Error("useSelection must be used within a SelectionProvider");
    }
    return context;
}

function currentParisDayIso(): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Paris",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
}

function addDaysIso(isoDate: string, deltaDays: number): string {
    const date = new Date(`${isoDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + deltaDays);
    return date.toISOString().slice(0, 10);
}

export function buildQuantScopeRequest(params: {
    dataScope: QuantLabDataScope;
    strategyFilter: StrategyFilter;
    runId?: string;
    runStrategyId?: string | null;
    backtestRunId?: string;
    portfolioEpoch?: number | null;
}): QuantScopeRequest {
    const {
        dataScope,
        strategyFilter,
        runId,
        runStrategyId,
        backtestRunId,
        portfolioEpoch,
    } = params;
    const today = currentParisDayIso();
    const effectiveStrategyId = resolveEffectiveStrategyId(
        dataScope,
        strategyFilter,
        runStrategyId ?? null
    );
    const effectiveRunId =
        dataScope === "BACKTEST" ? backtestRunId : dataScope === "RUN" ? runId : undefined;
    const needsRunId = dataScope === "RUN" || dataScope === "BACKTEST";

    const scopeMap: Record<QuantLabDataScope, string> = {
        TODAY: "Aujourd'hui",
        YESTERDAY: "Hier",
        "7D": "7 jours",
        EPOCH: "Epoch actuel",
        RUN: `Run ${runId ? `${runId.slice(0, 8)}...` : "?"}`,
        BACKTEST: "Backtest",
    };

    let fromDate: string | null = null;
    let toDate: string | null = null;
    let scope: QuantScopeRequest["scope"] = dataScope;
    if (dataScope === "TODAY") {
        fromDate = today;
        toDate = today;
    } else if (dataScope === "YESTERDAY") {
        fromDate = addDaysIso(today, -1);
        toDate = fromDate;
    } else if (dataScope === "7D") {
        fromDate = addDaysIso(today, -6);
        toDate = today;
    } else if (dataScope === "BACKTEST") {
        scope = "BACKTEST";
    }

    return {
        scope,
        runId: effectiveRunId,
        strategyId: effectiveStrategyId,
        portfolioEpoch: portfolioEpoch ?? null,
        fromDate,
        toDate,
        scopeLabel: scopeMap[dataScope] || dataScope,
        isCrossRun: !needsRunId,
        missingRunId: needsRunId && !effectiveRunId,
        isBacktest: dataScope === "BACKTEST",
        effectiveRunId,
        effectiveStrategyId,
    };
}

/**
 * useQuantLabScope -- Centralised helper that converts the current
 * QuantLabDataScope into the backend Scope + effectiveRunId + strategyId
 * that every Quant Lab component needs.  Replaces the duplicated
 * `dataScope === "CURRENT_RUN" ? "RUN" : "30D"` pattern.
 */
export function useQuantLabScope(): {
} & QuantScopeRequest {
    const { dataScope, strategyFilter, backtestRunId } = useSelection();
    const runIdRaw = useRunId();
    const { run } = useRunMeta();
    const { epoch: portfolioEpoch } = usePortfolioEpoch();

    const runId = runIdRaw || undefined;
    const runStrategyId = run?.strategy_id || null;
    return buildQuantScopeRequest({
        dataScope,
        strategyFilter,
        runId,
        runStrategyId,
        backtestRunId,
        portfolioEpoch,
    });
}

export function resolveEffectiveStrategyId(
    dataScope: QuantLabDataScope,
    strategyFilter: StrategyFilter,
    runStrategyId: string | null
): string | null {
    if (strategyFilter !== null) return strategyFilter;
    if (dataScope === "RUN") return runStrategyId;
    return null;
}

/**
 * SelectionBadges — Display active filters as removable badges
 */
export function SelectionBadges() {
    const {
        selection,
        clearConfigIds,
        clearTimeRange,
        clearRegime,
        clearSelection,
        hasActiveFilters,
    } = useSelection();

    if (!hasActiveFilters) return null;

    return (
        <div className="flex flex-wrap gap-2 items-center p-2 bg-slate-800/50 rounded-lg">
            <span className="text-xs text-slate-400">Filters:</span>

            {selection.config_ids && selection.config_ids.length > 0 && (
                <Badge
                    label={`${selection.config_ids.length} config(s)`}
                    onRemove={clearConfigIds}
                />
            )}

            {selection.time_range && (
                <Badge
                    label={`${selection.time_range.start.slice(0, 10)} → ${selection.time_range.end.slice(0, 10)}`}
                    onRemove={clearTimeRange}
                />
            )}

            {selection.regime?.session && (
                <Badge
                    label={`Session: ${selection.regime.session}`}
                    onRemove={() => clearRegime()}
                />
            )}

            {selection.regime?.spread_bucket && (
                <Badge
                    label={`Spread: ${selection.regime.spread_bucket}`}
                    onRemove={() => clearRegime()}
                />
            )}

            {selection.outcome_filter && selection.outcome_filter !== "all" && (
                <Badge
                    label={selection.outcome_filter === "winners" ? "Winners only" : "Losers only"}
                    color="amber"
                />
            )}

            <button
                onClick={clearSelection}
                className="text-xs text-red-400 hover:text-red-300 ml-2"
            >
                Clear all
            </button>
        </div>
    );
}

function Badge({
    label,
    onRemove,
    color = "cyan",
}: {
    label: string;
    onRemove?: () => void;
    color?: "cyan" | "amber" | "emerald";
}) {
    const colors = {
        cyan: "bg-cyan-900/50 text-cyan-300 border-cyan-700",
        amber: "bg-amber-900/50 text-amber-300 border-amber-700",
        emerald: "bg-emerald-900/50 text-emerald-300 border-emerald-700",
    };

    return (
        <span
            className={`px-2 py-1 rounded text-xs border ${colors[color]} flex items-center gap-1`}
        >
            {label}
            {onRemove && (
                <button
                    onClick={onRemove}
                    className="ml-1 hover:text-white"
                >
                    ×
                </button>
            )}
        </span>
    );
}
