/**
 * QuantLabHeader.tsx — Quant Lab V3.2 Global Header
 *
 * Provides a consistent header for all Quant Lab tabs with:
 * - Data scope selector: TODAY / YESTERDAY / 7D / EPOCH / RUN / BACKTEST
 * - Strategy filter: Toutes / S1 / S2 / S3
 * - Current epoch info display
 * - Active filters summary
 */

import React, { useEffect, useRef, useState } from "react";
import {
    Calendar,
    CalendarDays,
    Clock,
    Layers,
    TrendingUp,
    FlaskConical,
    RefreshCw,
    ChevronDown,
} from "lucide-react";
import {
    useSelection,
    useQuantLabScope,
    type QuantLabDataScope,
    type StrategyFilter,
} from "../../lib/SelectionContext";
import { useRunMeta } from "../../lib/useRunContext";
import { usePortfolioEpoch } from "../../lib/usePortfolioEpoch";
import { api, type BacktestRunRow } from "../../lib/api";

interface QuantLabHeaderProps {
    title: string;
    subtitle?: string;
    onRefresh?: () => void;
    loading?: boolean;
}

// Scope definitions for the selector
const SCOPE_OPTIONS: {
    value: QuantLabDataScope;
    label: string;
    icon: React.ReactNode;
}[] = [
    { value: "TODAY", label: "Aujourd'hui", icon: <Calendar className="w-3.5 h-3.5" /> },
    { value: "YESTERDAY", label: "Hier", icon: <Clock className="w-3.5 h-3.5" /> },
    { value: "7D", label: "7 jours", icon: <CalendarDays className="w-3.5 h-3.5" /> },
    { value: "EPOCH", label: "Epoch", icon: <Layers className="w-3.5 h-3.5" /> },
    { value: "RUN", label: "Run", icon: <TrendingUp className="w-3.5 h-3.5" /> },
    { value: "BACKTEST", label: "Backtest", icon: <FlaskConical className="w-3.5 h-3.5" /> },
];

const STRATEGY_OPTIONS: { value: StrategyFilter; label: string }[] = [
    { value: null, label: "Toutes" },
    { value: "damping_wave", label: "MM" },
    { value: "s2_pairs_trading", label: "Micro" },
    { value: "tf_pullback_v1", label: "Trend" },
];

// Re-use BacktestRunRow from api.ts

export function QuantLabHeader({ title, subtitle, onRefresh, loading }: QuantLabHeaderProps) {
    const {
        dataScope,
        setDataScope,
        strategyFilter,
        setStrategyFilter,
        backtestRunId,
        setBacktestRunId,
        hasActiveFilters,
    } = useSelection();
    const { run, selectedRunId } = useRunMeta();
    const {
        epoch,
        startedAt,
        loading: epochLoading,
        error: epochError,
        refresh,
    } = usePortfolioEpoch();

    const { scopeLabel } = useQuantLabScope();

    // -- Terminal <-> Quant Lab epoch sync --
    // When the user changes epoch on the Terminal/Portfolio tab, auto-switch
    // the Quant Lab scope to EPOCH so both views stay in sync.
    const prevEpochRef = useRef<number | null>(epoch);
    useEffect(() => {
        if (
            epoch !== null &&
            prevEpochRef.current !== null &&
            epoch !== prevEpochRef.current
        ) {
            setDataScope("EPOCH");
        }
        prevEpochRef.current = epoch;
    }, [epoch, setDataScope]);

    // Backtest runs list (lazy loaded)
    const [backtestRuns, setBacktestRuns] = useState<BacktestRunRow[]>([]);
    const [backtestOpen, setBacktestOpen] = useState(false);

    useEffect(() => {
        if (dataScope === "BACKTEST" && backtestRuns.length === 0) {
            api.listBacktestRuns(50)
                .then((res) => setBacktestRuns(res.runs.slice(0, 50)))
                .catch(() => setBacktestRuns([]));
        }
    }, [dataScope, backtestRuns.length]);

    const currentRunId = selectedRunId || run?.run_id;
    const epochLabel =
        epoch !== null
            ? `Epoch ${epoch}`
            : epochError
                ? "Epoch inconnu"
                : "Epoch...";
    const epochDetail = startedAt ? `depuis ${startedAt}` : null;

    return (
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-900/50 gap-3">
            {/* Left: Title + epoch info */}
            <div className="flex items-center gap-3 min-w-0 shrink-0">
                <div>
                    <h1 className="text-lg font-semibold text-white">{title}</h1>
                    {subtitle && (
                        <p className="text-xs text-neutral-400">{subtitle}</p>
                    )}
                    <div className="text-[10px] text-neutral-500 mt-1">
                        {epochLoading ? "Chargement epoch..." : epochLabel}
                        {!epochLoading && epochDetail ? ` · ${epochDetail}` : ""}
                    </div>
                </div>
            </div>

            {/* Center: Scope selector + Strategy filter */}
            <div className="flex items-center gap-4 flex-wrap">
                {/* Scope pills */}
                <div className="flex items-center gap-1.5">
                    <span className="text-xs text-neutral-500 mr-1">Scope:</span>
                    <div className="flex bg-neutral-800 rounded-lg p-0.5 gap-0.5">
                        {SCOPE_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                onClick={() => setDataScope(opt.value)}
                                className={`
                                    flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-all
                                    ${dataScope === opt.value
                                        ? "bg-blue-600 text-white shadow-lg"
                                        : "text-neutral-400 hover:text-white hover:bg-neutral-700"
                                    }
                                `}
                                title={opt.label}
                            >
                                {opt.icon}
                                <span className="font-medium">{opt.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Strategy filter */}
                <div className="flex items-center gap-1.5">
                    <span className="text-xs text-neutral-500 mr-1">Strategie:</span>
                    <div className="flex bg-neutral-800 rounded-lg p-0.5 gap-0.5">
                        {STRATEGY_OPTIONS.map((opt) => (
                            <button
                                key={opt.value ?? "all"}
                                onClick={() => setStrategyFilter(opt.value)}
                                className={`
                                    px-2.5 py-1 rounded-md text-xs font-medium transition-all
                                    ${strategyFilter === opt.value
                                        ? "bg-emerald-600 text-white shadow-lg"
                                        : "text-neutral-400 hover:text-white hover:bg-neutral-700"
                                    }
                                `}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Backtest run picker (shown only when BACKTEST scope) */}
                {dataScope === "BACKTEST" && (
                    <div className="relative">
                        <button
                            onClick={() => setBacktestOpen(!backtestOpen)}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs
                                bg-neutral-800 text-neutral-300 hover:bg-neutral-700 border border-neutral-700"
                        >
                            <FlaskConical className="w-3 h-3" />
                            {backtestRunId ? backtestRunId.slice(0, 16) + "..." : "Choisir backtest..."}
                            <ChevronDown className="w-3 h-3" />
                        </button>
                        {backtestOpen && (
                            <div className="absolute top-full mt-1 left-0 z-50 w-80 max-h-64 overflow-y-auto
                                bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl">
                                {backtestRuns.length === 0 && (
                                    <div className="px-3 py-2 text-xs text-neutral-500">
                                        Aucun backtest disponible
                                    </div>
                                )}
                                {backtestRuns.map((bt) => (
                                    <button
                                        key={bt.run_id}
                                        onClick={() => {
                                            setBacktestRunId(bt.run_id);
                                            setBacktestOpen(false);
                                        }}
                                        className={`w-full text-left px-3 py-2 text-xs hover:bg-neutral-800 transition-colors
                                            border-b border-neutral-800 last:border-0
                                            ${backtestRunId === bt.run_id ? "bg-blue-900/30 text-blue-300" : "text-neutral-300"}`}
                                    >
                                        <div className="font-mono">{bt.run_id}</div>
                                        <div className="text-neutral-500 mt-0.5">
                                            {bt.mode || "?"} · {bt.created_at || "?"}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Scope detail label */}
                <span className="text-[10px] text-neutral-500">
                    {scopeLabel}
                    {dataScope === "RUN" && currentRunId && (
                        <> · {currentRunId.slice(0, 8)}...</>
                    )}
                </span>
            </div>

            {/* Right: Refresh + Filters indicator */}
            <div className="flex items-center gap-3 shrink-0">
                {hasActiveFilters && (
                    <span className="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded">
                        Filtres actifs
                    </span>
                )}
                {onRefresh && (
                    <button
                        onClick={() => {
                            refresh();
                            onRefresh();
                        }}
                        disabled={loading}
                        className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 transition-colors disabled:opacity-50"
                        title="Rafraichir"
                    >
                        <RefreshCw className={`w-4 h-4 text-neutral-400 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                )}
            </div>
        </div>
    );
}

/**
 * Hook to get run_ids param based on current data scope.
 * @deprecated Use useQuantLabScope() instead for full scope resolution.
 */
export function useQuantLabRunIds(): string | null {
    const { scope, effectiveRunId } = useQuantLabScope();

    if (scope === "RUN" || scope === "BACKTEST") {
        return effectiveRunId || null;
    }
    return null;
}

export default QuantLabHeader;
