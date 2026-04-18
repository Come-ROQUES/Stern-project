/**
 * IB Account State Panel
 * ======================
 *
 * Real-time IB account state monitoring panel.
 * Source of truth: IB API only.
 *
 * Features:
 * - Connection & Permissions status
 * - Account Summary (NLV, Cash, Available Funds)
 * - Margin & Risk State
 * - Positions & Exposure
 * - Global status badge (OK / WARNING / BLOCKING)
 *
 * Author: FRACTAL Team
 * Date: 19 Dec 2024
 */

import { Fragment, useEffect, useState, useCallback, useRef } from "react";
import { formatDateTimeUTC, formatTime, safeTimestampMs } from "../lib/dateUtils";
import {
    api,
    IBAccountState,
    IBGlobalStatus,
    IBPosition,
    IBExecution,
    IBExecutionsResponse,
} from "../lib/api";
import { useDashboardPoll } from "../lib/dashboardPollingBus";

// Refresh interval in ms - LIVE FIX (27 Jan 2026): keep IB state always fresh
const REFRESH_INTERVAL = 5_000;

function useRefreshOnVisible(refresh: () => void): void {
    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === "visible") {
                refresh();
            }
        };
        const handleFocus = () => refresh();
        document.addEventListener("visibilitychange", handleVisibility);
        window.addEventListener("focus", handleFocus);
        return () => {
            document.removeEventListener("visibilitychange", handleVisibility);
            window.removeEventListener("focus", handleFocus);
        };
    }, [refresh]);
}

// Status badge component
function StatusBadge({ status }: { status: IBGlobalStatus }) {
    const colors: Record<IBGlobalStatus, string> = {
        OK: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
        WARNING: "bg-amber-500/20 text-amber-400 border-amber-500/30",
        BLOCKING: "bg-red-500/20 text-red-400 border-red-500/30",
        DISCONNECTED: "bg-slate-500/20 text-slate-400 border-slate-500/30",
    };

    const labels: Record<IBGlobalStatus, string> = {
        OK: "OK",
        WARNING: "WARNING",
        BLOCKING: "BLOCKING",
        DISCONNECTED: "DISCONNECTED",
    };

    return (
        <span
            className={`px-2 py-0.5 text-xs font-semibold rounded border ${colors[status]}`}
        >
            {labels[status]}
        </span>
    );
}

// Status dot component
function StatusDot({ status }: { status: IBGlobalStatus }) {
    const colors: Record<IBGlobalStatus, string> = {
        OK: "bg-emerald-400",
        WARNING: "bg-amber-400",
        BLOCKING: "bg-red-400",
        DISCONNECTED: "bg-slate-400",
    };

    return (
        <span
            className={`inline-block w-2 h-2 rounded-full ${colors[status]} animate-pulse`}
        />
    );
}

// Format currency value
function formatCurrency(
    value: number | null | undefined,
    currency = "USD"
): string {
    if (value == null) return "N/A";
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value);
}

// Format percentage
function formatPct(value: number | null | undefined): string {
    if (value == null) return "N/A";
    return `${value.toFixed(1)}%`;
}

// Format latency
function formatLatency(ms: number | null | undefined): string {
    if (ms == null) return "N/A";
    if (ms < 1000) return `${ms.toFixed(0)} ms`;
    return `${(ms / 1000).toFixed(1)} s`;
}

// Connection & Permissions Block
function ConnectionBlock({
    state,
}: {
    state: IBAccountState["connection"];
}) {
    const isConnected = state.ib_gateway_status === "CONNECTED";

    return (
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <StatusDot status={state.status} />
                    Connection & Permissions
                </h3>
                <StatusBadge status={state.status} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-xs">
                {/* Gateway Status */}
                <div>
                    <div className="text-slate-400">Gateway</div>
                    <div
                        className={`font-mono ${isConnected ? "text-emerald-400" : "text-red-400"}`}
                    >
                        {state.ib_gateway_status}
                    </div>
                </div>

                {/* Latency */}
                <div>
                    <div className="text-slate-400">API Latency</div>
                    <div
                        className={`font-mono ${state.api_latency_ms == null
                            ? "text-slate-400"
                            : state.api_latency_ms > 1000
                                ? "text-red-400"
                                : state.api_latency_ms > 500
                                    ? "text-amber-400"
                                    : "text-emerald-400"
                            }`}
                    >
                        {formatLatency(state.api_latency_ms)}
                    </div>
                </div>

                {/* Account Type */}
                <div>
                    <div className="text-slate-400">Account Type</div>
                    <div
                        className={`font-mono ${state.account_type === "PAPER"
                            ? "text-cyan-400"
                            : state.account_type === "LIVE"
                                ? "text-amber-400"
                                : "text-slate-400"
                            }`}
                    >
                        {state.account_type}
                    </div>
                </div>

                {/* Read-Only */}
                <div>
                    <div className="text-slate-400">Read-Only API</div>
                    <div
                        className={`font-mono ${state.read_only_api ? "text-red-400" : "text-emerald-400"}`}
                    >
                        {state.read_only_api ? "TRUE" : "FALSE"}
                    </div>
                </div>

                {/* Trading Permissions */}
                <div className="col-span-2">
                    <div className="text-slate-400 mb-1">Trading Permissions</div>
                    <div className="flex gap-3">
                        {Object.entries(state.trading_permissions).map(([key, val]) => (
                            <span
                                key={key}
                                className={`px-2 py-0.5 rounded text-[10px] font-mono ${val
                                    ? "bg-emerald-500/20 text-emerald-400"
                                    : "bg-slate-600/50 text-slate-500"
                                    }`}
                            >
                                {key}: {val ? "Y" : "N"}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Heartbeat */}
                <div className="col-span-2">
                    <div className="text-slate-400">Last Heartbeat</div>
                    <div className="font-mono text-slate-300">
                        {state.last_heartbeat_ts
                            ? `${formatTime(state.last_heartbeat_ts, "UTC")} UTC`
                            : "N/A"}
                        {state.heartbeat_age_seconds != null && (
                            <span className="text-slate-500 ml-2">
                                ({state.heartbeat_age_seconds.toFixed(1)}s ago)
                            </span>
                        )}
                    </div>
                </div>

                {/* Managed Accounts */}
                {state.managed_accounts.length > 0 && (
                    <div className="col-span-2">
                        <div className="text-slate-400">Accounts</div>
                        <div className="font-mono text-slate-300">
                            {state.managed_accounts.join(", ")}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Account Summary Block
function AccountBlock({ state }: { state: IBAccountState["account"] }) {
    const currencyBreakdown = state.currency_breakdown ?? [];

    return (
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <StatusDot status={state.status} />
                    Account Summary
                </h3>
                <StatusBadge status={state.status} />
            </div>

            {/* Big NLV number */}
            <div className="text-center mb-4">
                <div className="text-3xl font-bold text-white">
                    {formatCurrency(state.net_liquidation, state.currency)}
                </div>
                {state.net_liquidation_usd != null && (
                    <div className="text-sm text-slate-300">
                        ≈ {formatCurrency(state.net_liquidation_usd, "USD")} (USD)
                    </div>
                )}
                <div className="text-xs text-slate-400">Net Liquidation Value</div>
                {(state.nlv_change_abs != null || state.nlv_change_pct != null) && (
                    <div
                        className={`text-sm mt-1 ${(state.nlv_change_abs ?? 0) >= 0
                            ? "text-emerald-400"
                            : "text-red-400"
                            }`}
                    >
                        {state.nlv_change_abs != null &&
                            `${state.nlv_change_abs >= 0 ? "+" : ""}${formatCurrency(state.nlv_change_abs, state.currency)}`}
                        {state.nlv_change_pct != null && ` (${formatPct(state.nlv_change_pct)})`}
                    </div>
                )}
            </div>

            {/* Sub metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-center">
                <div>
                    <div className="text-slate-400">Cash</div>
                    <div className="font-mono text-slate-200">
                        {formatCurrency(state.cash_balance, state.currency)}
                    </div>
                </div>
                <div>
                    <div className="text-slate-400">Available</div>
                    <div
                        className={`font-mono ${state.available_funds == null
                            ? "text-slate-400"
                            : state.available_funds <= 0
                                ? "text-red-400"
                                : state.available_funds < 1000
                                    ? "text-amber-400"
                                    : "text-emerald-400"
                            }`}
                    >
                        {formatCurrency(state.available_funds, state.currency)}
                    </div>
                </div>
                <div>
                    <div className="text-slate-400">Buying Power</div>
                    <div className="font-mono text-slate-200">
                        {formatCurrency(state.buying_power, state.currency)}
                    </div>
                </div>
            </div>

            {state.day_trades_remaining != null && (
                <div className="mt-3 text-center text-xs">
                    <span className="text-slate-400">Day Trades Remaining: </span>
                    <span
                        className={`font-mono ${state.day_trades_remaining <= 0
                            ? "text-red-400"
                            : state.day_trades_remaining <= 1
                                ? "text-amber-400"
                                : "text-slate-200"
                            }`}
                    >
                        {state.day_trades_remaining}
                    </span>
                </div>
            )}

            {currencyBreakdown.length > 0 && (
                <div className="mt-4 bg-slate-900/60 rounded p-3">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-semibold text-slate-200">
                            Currency Breakdown (cash)
                        </div>
                        {state.total_cash_usd != null && (
                            <div className="text-xs text-slate-300 font-mono">
                                Total USD: {formatCurrency(state.total_cash_usd, "USD")}
                            </div>
                        )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-300">
                        <div className="text-slate-400">CCY</div>
                        <div className="text-slate-400">Cash</div>
                        <div className="text-slate-400 hidden sm:block">FX→USD</div>
                        <div className="text-slate-400 text-right hidden sm:block">USD Eq.</div>
                        {currencyBreakdown.map((cb) => (
                            <Fragment key={cb.currency}>
                                <div className="font-mono text-slate-200">
                                    {cb.currency}
                                </div>
                                <div className="font-mono text-slate-200">
                                    {formatCurrency(cb.cash, cb.currency)}
                                </div>
                                <div className="font-mono text-slate-400">
                                    {cb.exchange_rate_to_usd != null
                                        ? cb.exchange_rate_to_usd.toFixed(4)
                                        : "N/A"}
                                </div>
                                <div className="font-mono text-right text-slate-200">
                                    {formatCurrency(cb.usd_equivalent, "USD")}
                                </div>
                            </Fragment>
                        ))}
                    </div>
                    <div className="mt-2 text-[11px] text-slate-400">
                        Cash in other currencies is not FX exposure; it is just settled cash.
                    </div>
                </div>
            )}
        </div>
    );
}

// Margin & Risk Block
function MarginBlock({ state }: { state: IBAccountState["margin"] }) {
    return (
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <StatusDot status={state.status} />
                    Margin & Risk
                </h3>
                <StatusBadge status={state.status} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-xs">
                {/* Initial Margin */}
                <div>
                    <div className="text-slate-400">Initial Margin</div>
                    <div className="font-mono text-slate-200">
                        {formatCurrency(state.initial_margin)}
                    </div>
                </div>

                {/* Maintenance Margin */}
                <div>
                    <div className="text-slate-400">Maintenance Margin</div>
                    <div className="font-mono text-slate-200">
                        {formatCurrency(state.maintenance_margin)}
                    </div>
                </div>

                {/* Excess Liquidity */}
                <div>
                    <div className="text-slate-400">Excess Liquidity</div>
                    <div
                        className={`font-mono ${state.excess_liquidity == null
                            ? "text-slate-400"
                            : state.excess_liquidity <= 0
                                ? "text-red-400"
                                : "text-emerald-400"
                            }`}
                    >
                        {formatCurrency(state.excess_liquidity)}
                    </div>
                </div>

                {/* SMA */}
                <div>
                    <div className="text-slate-400">SMA</div>
                    <div className="font-mono text-slate-200">
                        {formatCurrency(state.sma)}
                    </div>
                </div>

                {/* Margin Cushion (prominent) */}
                <div className="col-span-2 bg-slate-900/50 rounded p-2">
                    <div className="flex items-center justify-between">
                        <span className="text-slate-400">Margin Cushion</span>
                        <span
                            className={`text-lg font-bold ${state.margin_cushion_pct == null
                                ? "text-slate-400"
                                : state.margin_cushion_pct < 10
                                    ? "text-red-400"
                                    : state.margin_cushion_pct < 20
                                        ? "text-amber-400"
                                        : "text-emerald-400"
                                }`}
                        >
                            {formatPct(state.margin_cushion_pct)}
                        </span>
                    </div>
                    {/* Visual bar */}
                    <div className="w-full h-2 bg-slate-700 rounded mt-1 overflow-hidden">
                        <div
                            className={`h-full rounded transition-all ${state.margin_cushion_pct == null
                                ? "bg-slate-600"
                                : state.margin_cushion_pct < 10
                                    ? "bg-red-500"
                                    : state.margin_cushion_pct < 20
                                        ? "bg-amber-500"
                                        : "bg-emerald-500"
                                }`}
                            style={{
                                width: `${Math.min(100, state.margin_cushion_pct ?? 0)}%`,
                            }}
                        />
                    </div>
                </div>

                {/* Leverage */}
                <div className="col-span-2">
                    <div className="text-slate-400">Current Leverage</div>
                    <div
                        className={`font-mono text-lg ${state.current_leverage == null
                            ? "text-slate-400"
                            : state.current_leverage > 10
                                ? "text-red-400"
                                : state.current_leverage > 5
                                    ? "text-amber-400"
                                    : "text-slate-200"
                            }`}
                    >
                        {state.current_leverage != null
                            ? `${state.current_leverage.toFixed(2)}x`
                            : "N/A"}
                    </div>
                </div>
            </div>
        </div>
    );
}

// Single Position Row
function PositionRow({ pos }: { pos: IBPosition }) {
    const pnlColor =
        pos.unrealized_pnl == null
            ? "text-slate-400"
            : pos.unrealized_pnl >= 0
                ? "text-emerald-400"
                : "text-red-400";

    return (
        <tr className="border-b border-slate-700/50 hover:bg-slate-700/30">
            <td className="py-2 px-2 font-mono text-slate-200">{pos.instrument}</td>
            <td className="py-2 px-2">
                <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${pos.side === "LONG"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-red-500/20 text-red-400"
                        }`}
                >
                    {pos.side}
                </span>
            </td>
            <td className="py-2 px-2 font-mono text-slate-300 text-right">
                {pos.size.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </td>
            <td className="py-2 px-2 font-mono text-slate-300 text-right">
                {pos.avg_price != null ? pos.avg_price.toFixed(5) : "N/A"}
            </td>
            <td className="py-2 px-2 font-mono text-slate-300 text-right">
                {pos.mark_price != null ? pos.mark_price.toFixed(5) : "N/A"}
            </td>
            <td className={`py-2 px-2 font-mono text-right ${pnlColor}`}>
                {pos.unrealized_pnl != null
                    ? `${pos.unrealized_pnl >= 0 ? "+" : ""}${pos.unrealized_pnl.toFixed(2)}`
                    : "N/A"}
            </td>
            <td className="py-2 px-2 font-mono text-slate-400 text-right">
                {formatCurrency(pos.notional_exposure, pos.currency)}
            </td>
        </tr>
    );
}

// =============================================================================
// IB EXECUTIONS BLOCK - SOURCE OF TRUTH
// =============================================================================
// This component fetches from the dedicated /api/ib/executions endpoint
// which reads from the persisted history file. It's the authoritative
// source for all IB fills.

function IBExecutionsBlock() {
    const [data, setData] = useState<IBExecutionsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showAll, setShowAll] = useState(false);
    const inFlightRef = useRef(false);

    const fetchExecutions = useCallback(async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        try {
            const result = await api.getIBExecutions(100);
            setData(result);
            setError(null);
        } catch (e: any) {
            setError(e.message || "Failed to fetch executions");
        } finally {
            inFlightRef.current = false;
            setLoading(false);
        }
    }, []);

    useDashboardPoll("status", fetchExecutions, {
        enabled: true,
        immediate: true,
        intervalMs: REFRESH_INTERVAL,
    });
    useRefreshOnVisible(fetchExecutions);

    // Status badge for freshness
    const statusColors: Record<string, string> = {
        OK: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
        STALE: "bg-amber-500/20 text-amber-400 border-amber-500/30",
        NO_FILE: "bg-slate-500/20 text-slate-400 border-slate-500/30",
        PARSE_ERROR: "bg-red-500/20 text-red-400 border-red-500/30",
        ERROR: "bg-red-500/20 text-red-400 border-red-500/30",
    };

    const displayLimit = showAll ? 100 : 20;
    const executions = data?.executions || [];

    return (
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div>
                    <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        IB Executions History
                        <span className="text-[10px] font-normal text-slate-400 ml-2">
                            SOURCE OF TRUTH
                        </span>
                    </h3>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                        All IB fills persisted • Survives daemon restart
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Status indicator */}
                    {data && (
                        <span className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${statusColors[data.status] || statusColors.ERROR}`}>
                            {data.status}
                        </span>
                    )}
                    {/* Count */}
                    {data && (
                        <span className="text-xs text-slate-400">
                            {data.count} / {data.total_in_file || data.count}
                        </span>
                    )}
                </div>
            </div>

            {/* Freshness info */}
            {data && (
                <div className="flex items-center gap-3 text-[10px] text-slate-500 mb-3">
                    <span>
                        Updated: {data.last_updated ? `${formatDateTimeUTC(data.last_updated)} UTC` : "—"}
                    </span>
                    {data.file_age_seconds != null && (
                        <span className={data.file_age_seconds > 30 ? "text-amber-400" : ""}>
                            Age: {data.file_age_seconds.toFixed(0)}s
                        </span>
                    )}
                </div>
            )}
            <div className="mb-3 text-[10px] text-slate-500">
                Fill-level log: Realized PnL peut etre indisponible sur certains fills IB.
                Le PnL de reference reste le trade ferme canonique.
            </div>

            {/* Error state */}
            {error && (
                <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400 mb-3">
                    {error}
                </div>
            )}

            {/* No data message */}
            {data?.status === "NO_FILE" && (
                <div className="p-3 bg-slate-900/50 rounded text-center">
                    <div className="text-sm text-slate-400 mb-1">
                        No execution history yet
                    </div>
                    <div className="text-[10px] text-slate-500">
                        {data.message || "The daemon will record fills once trades occur"}
                    </div>
                </div>
            )}

            {/* Loading */}
            {loading && !data && (
                <div className="text-xs text-slate-400 animate-pulse">Loading executions...</div>
            )}

            {/* Executions table */}
            {executions.length > 0 && (
                <>
                    <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                        <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-slate-800">
                                <tr className="text-slate-400 border-b border-slate-600">
                                    <th className="py-1.5 px-2 text-left">#</th>
                                    <th className="py-1.5 px-2 text-left">Time</th>
                                    <th className="py-1.5 px-2 text-left">Symbol</th>
                                    <th className="py-1.5 px-2 text-left">Side</th>
                                    <th className="py-1.5 px-2 text-right">Qty</th>
                                    <th className="py-1.5 px-2 text-right">Price</th>
                                    <th className="py-1.5 px-2 text-right">Notional</th>
                                    <th className="py-1.5 px-2 text-right">Comm</th>
                                    <th className="py-1.5 px-2 text-right">Realized PnL (fill)</th>
                                    <th className="py-1.5 px-2 text-left">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {executions.slice(0, displayLimit).map((ex, i) => {
                                    const isBuy = ex.side === "BOT";
                                    const sideColor = isBuy ? "text-emerald-400" : "text-rose-400";
                                    const hasRealizedPnl =
                                        ex.realized_pnl_known === true && ex.realized_pnl != null;
                                    const realizedPnl = ex.realized_pnl ?? 0;
                                    const pnlColor = !hasRealizedPnl
                                        ? "text-slate-500"
                                        : realizedPnl >= 0
                                            ? "text-emerald-400"
                                            : "text-rose-400";

                                    return (
                                        <tr
                                            key={ex.exec_id ?? `${ex.time}-${i}`}
                                            className="border-b border-slate-700/40 hover:bg-slate-700/20"
                                        >
                                            <td className="py-1.5 px-2 text-slate-500">{i + 1}</td>
                                            <td className="py-1.5 px-2 text-slate-300 whitespace-nowrap">
                                                {ex.time ? `${formatDateTimeUTC(ex.time)} UTC` : "—"}
                                            </td>
                                            <td className="py-1.5 px-2 font-medium">
                                                {ex.symbol || "—"}/{ex.currency || ""}
                                            </td>
                                            <td className={`py-1.5 px-2 font-semibold ${sideColor}`}>
                                                {isBuy ? "BUY" : "SELL"}
                                            </td>
                                            <td className="py-1.5 px-2 text-right font-mono">
                                                {ex.qty != null ? ex.qty.toLocaleString() : "—"}
                                            </td>
                                            <td className="py-1.5 px-2 text-right font-mono">
                                                {ex.price != null ? ex.price.toFixed(5) : "—"}
                                            </td>
                                            <td className="py-1.5 px-2 text-right font-mono">
                                                {ex.notional != null
                                                    ? `$${ex.notional.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                                                    : "—"}
                                            </td>
                                            <td className="py-1.5 px-2 text-right text-slate-400">
                                                {ex.commission != null
                                                    ? `${ex.commission.toFixed(2)} ${ex.commission_currency || ""}`
                                                    : "—"}
                                            </td>
                                            <td className={`py-1.5 px-2 text-right font-mono ${pnlColor}`}>
                                                {hasRealizedPnl
                                                    ? `${realizedPnl >= 0 ? "+" : ""}${realizedPnl.toFixed(2)}`
                                                    : "—"}
                                            </td>
                                            <td className="py-1.5 px-2">
                                                <span className={`px-1.5 py-0.5 rounded text-[10px] ${ex.status === "Filled"
                                                    ? "bg-emerald-500/20 text-emerald-400"
                                                    : "bg-slate-600/50 text-slate-400"
                                                    }`}>
                                                    {ex.status || "—"}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Show more/less toggle */}
                    {executions.length > 20 && (
                        <div className="mt-2 text-center">
                            <button
                                onClick={() => setShowAll(!showAll)}
                                className="text-xs text-cyan-400 hover:text-cyan-300 underline"
                            >
                                {showAll ? "Show less" : `Show all ${executions.length} executions`}
                            </button>
                        </div>
                    )}

                    {/* Summary stats */}
                    <div className="mt-3 pt-3 border-t border-slate-700 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                        <div className="text-center">
                            <div className="text-slate-400">Total Fills</div>
                            <div className="font-semibold text-slate-200">{executions.length}</div>
                        </div>
                        <div className="text-center">
                            <div className="text-slate-400">Buys</div>
                            <div className="font-semibold text-emerald-400">
                                {executions.filter(e => e.side === "BOT").length}
                            </div>
                        </div>
                        <div className="text-center">
                            <div className="text-slate-400">Sells</div>
                            <div className="font-semibold text-rose-400">
                                {executions.filter(e => e.side === "SLD").length}
                            </div>
                        </div>
                        <div className="text-center">
                            <div className="text-slate-400">Total Commission</div>
                            <div className="font-semibold text-slate-200">
                                {executions.reduce((sum, e) => sum + (e.commission || 0), 0).toFixed(2)} USD
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

// Positions & Exposure Block
function PositionsBlock({ state }: { state: IBAccountState["positions"] }) {
    // Séparer les vraies positions FX des cash balances
    const realPositions = state.positions.filter(p => (p as any).type !== "CASH_BALANCE");
    const cashBalances = state.positions.filter(p => (p as any).type === "CASH_BALANCE");
    const hasRealPositions = realPositions.length > 0;

    return (
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <StatusDot status={state.status} />
                    Positions & Exposure
                </h3>
                <div className="flex items-center gap-2">
                    {hasRealPositions && (
                        <span className="px-2 py-0.5 text-[10px] font-semibold rounded border bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse">
                            {realPositions.length} OPEN TRADE{realPositions.length > 1 ? 'S' : ''}
                        </span>
                    )}
                    <StatusBadge status={state.status} />
                </div>
            </div>

            {/* Aggregates - only show real exposure */}
            <div className="grid grid-cols-3 gap-3 mb-4 text-xs">
                <div className="bg-slate-900/50 rounded p-2 text-center">
                    <div className="text-slate-400">FX Exposure</div>
                    <div className={`font-mono text-sm ${hasRealPositions ? "text-amber-400 font-bold" : "text-slate-200"}`}>
                        {hasRealPositions
                            ? formatCurrency(realPositions.reduce((sum, p) => sum + (p.notional_exposure || 0), 0))
                            : "—"}
                    </div>
                </div>
                <div className="bg-slate-900/50 rounded p-2 text-center">
                    <div className="text-slate-400">Unrealized PnL</div>
                    <div
                        className={`font-mono text-sm ${!hasRealPositions
                            ? "text-slate-400"
                            : state.total_unrealized_pnl >= 0
                                ? "text-emerald-400"
                                : "text-red-400"
                            }`}
                    >
                        {hasRealPositions ? (
                            <>
                                {state.total_unrealized_pnl >= 0 ? "+" : ""}
                                {formatCurrency(state.total_unrealized_pnl)}
                            </>
                        ) : "—"}
                    </div>
                </div>
                <div className="bg-slate-900/50 rounded p-2 text-center">
                    <div className="text-slate-400">Open Trades</div>
                    <div className={`font-mono text-sm ${hasRealPositions ? "text-amber-400 font-bold" : "text-slate-200"}`}>
                        {realPositions.length}
                    </div>
                </div>
            </div>

            {/* ============================================================ */}
            {/* REAL FX POSITIONS - Highlighted prominently */}
            {/* ============================================================ */}
            {hasRealPositions ? (
                <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                        <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                            Active FX Positions
                        </span>
                    </div>
                    <div className="overflow-x-auto bg-amber-500/5 border border-amber-500/20 rounded-lg p-2">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="text-slate-400 border-b border-amber-500/30">
                                    <th className="py-1.5 px-2 text-left">Pair</th>
                                    <th className="py-1.5 px-2 text-left">Side</th>
                                    <th className="py-1.5 px-2 text-right">Size</th>
                                    <th className="py-1.5 px-2 text-right">Entry</th>
                                    <th className="py-1.5 px-2 text-right">Mark</th>
                                    <th className="py-1.5 px-2 text-right">Unreal. PnL</th>
                                    <th className="py-1.5 px-2 text-right">Notional</th>
                                </tr>
                            </thead>
                            <tbody>
                                {realPositions.map((pos, i) => (
                                    <tr key={pos.conid ?? i} className="border-b border-amber-500/10 hover:bg-amber-500/10">
                                        <td className="py-2 px-2 font-mono text-slate-100 font-semibold">
                                            {pos.instrument}
                                        </td>
                                        <td className="py-2 px-2">
                                            <span
                                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${pos.side === "LONG"
                                                    ? "bg-emerald-500/30 text-emerald-300"
                                                    : "bg-red-500/30 text-red-300"
                                                    }`}
                                            >
                                                {pos.side}
                                            </span>
                                        </td>
                                        <td className="py-2 px-2 font-mono text-slate-200 text-right font-semibold">
                                            {pos.size.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        </td>
                                        <td className="py-2 px-2 font-mono text-slate-200 text-right">
                                            {pos.avg_price?.toFixed(5) ?? "—"}
                                        </td>
                                        <td className="py-2 px-2 font-mono text-cyan-400 text-right">
                                            {pos.mark_price?.toFixed(5) ?? "—"}
                                        </td>
                                        <td className={`py-2 px-2 font-mono text-right font-bold ${pos.unrealized_pnl == null
                                            ? "text-slate-400"
                                            : pos.unrealized_pnl >= 0
                                                ? "text-emerald-400"
                                                : "text-red-400"
                                            }`}>
                                            {pos.unrealized_pnl != null
                                                ? `${pos.unrealized_pnl >= 0 ? "+" : ""}${pos.unrealized_pnl.toFixed(2)}`
                                                : "—"}
                                        </td>
                                        <td className="py-2 px-2 font-mono text-slate-300 text-right">
                                            {formatCurrency(pos.notional_exposure, pos.currency)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="text-center py-4 mb-4 bg-slate-900/30 rounded-lg border border-slate-700/50">
                    <div className="text-sm text-slate-400">No open FX positions</div>
                    <div className="text-[10px] text-slate-500 mt-1">
                        Cash balances below do not represent FX exposure
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* CASH BALANCES - Secondary, collapsible info */}
            {/* ============================================================ */}
            {cashBalances.length > 0 && (
                <details className="group">
                    <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-400 flex items-center gap-1 mb-2">
                        <span className="text-[10px]">▸</span>
                        <span>Cash balances ({cashBalances.length} currencies)</span>
                        <span className="text-[10px] text-slate-600 ml-1">— not FX positions</span>
                    </summary>
                    <div className="overflow-x-auto bg-slate-900/30 rounded p-2 mt-1">
                        <table className="w-full text-[11px]">
                            <thead>
                                <tr className="text-slate-500 border-b border-slate-700/50">
                                    <th className="py-1 px-2 text-left">Currency</th>
                                    <th className="py-1 px-2 text-right">Balance</th>
                                </tr>
                            </thead>
                            <tbody>
                                {cashBalances.map((pos, i) => (
                                    <tr key={i} className="border-b border-slate-800/50">
                                        <td className="py-1 px-2 text-slate-400 font-mono">
                                            {pos.instrument.replace("CASH_", "")}
                                        </td>
                                        <td className="py-1 px-2 font-mono text-slate-400 text-right">
                                            {pos.size.toLocaleString(undefined, { maximumFractionDigits: 2 })} {pos.currency}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </details>
            )}

            {/* Unknown positions warning */}
            {state.unknown_positions.length > 0 && (
                <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-400">
                    Unknown positions detected: {state.unknown_positions.join(", ")}
                </div>
            )}
        </div>
    );
}

// Main Panel Component
export function IBAccountPanel() {
    const [state, setState] = useState<IBAccountState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastFetch, setLastFetch] = useState<Date | null>(null);
    const inFlightRef = useRef(false);

    const dataTimestampMs = state?.timestamp
        ? safeTimestampMs(state.timestamp)
        : null;
    const dataAgeSeconds =
        dataTimestampMs != null ? (Date.now() - dataTimestampMs) / 1000 : null;
    const dataAgeClass =
        dataAgeSeconds != null && dataAgeSeconds > 15
            ? "text-amber-400"
            : "text-slate-500";
    const updatedLabel = state?.timestamp
        ? `Updated ${formatTime(state.timestamp, "UTC")} UTC`
        : lastFetch
            ? `Updated ${formatTime(lastFetch, "UTC")} UTC`
            : "Loading...";

    const fetchData = useCallback(async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        try {
            const data = await api.getIBAccountState();
            setState(data);
            setError(null);
            setLastFetch(new Date());
        } catch (e: any) {
            setError(e.message || "Failed to fetch IB account state");
        } finally {
            inFlightRef.current = false;
            setLoading(false);
        }
    }, []);

    useDashboardPoll("status", fetchData, {
        enabled: true,
        immediate: true,
        intervalMs: REFRESH_INTERVAL,
    });
    useRefreshOnVisible(fetchData);

    // Loading state
    if (loading && !state) {
        return (
            <div className="p-6">
                <div className="animate-pulse text-slate-400">
                    Loading IB account state...
                </div>
            </div>
        );
    }

    // Error state (but still show last known data if available)
    const showError = error && !state;

    return (
        <div className="p-4 space-y-4">
            {/* Header with global status */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-white">Risk State</h2>
                    <p className="text-xs text-slate-400">
                        Capital, exposition et etat d'execution en temps reel
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Last update */}
                    <div className="text-xs text-slate-500">
                        {updatedLabel}
                        {state?.fetch_duration_ms != null && (
                            <span className="ml-1">
                                ({state.fetch_duration_ms.toFixed(0)}ms)
                            </span>
                        )}
                        {dataAgeSeconds != null && (
                            <span className={`ml-2 ${dataAgeClass}`}>
                                Age: {dataAgeSeconds.toFixed(0)}s
                            </span>
                        )}
                    </div>
                    {/* Global status badge */}
                    {state && (
                        <div className="flex items-center gap-2">
                            <StatusBadge status={state.global_status} />
                        </div>
                    )}
                </div>
            </div>

            {/* Error banner */}
            {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
                    {error}
                </div>
            )}

            {/* Global status reasons */}
            {state && state.global_status_reasons.length > 0 && (
                <div
                    className={`p-3 rounded border text-sm ${state.global_status === "BLOCKING"
                        ? "bg-red-500/10 border-red-500/30 text-red-400"
                        : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                        }`}
                >
                    <strong>
                        {state.global_status === "BLOCKING" ? "BLOCKING: " : "WARNING: "}
                    </strong>
                    {state.global_status_reasons.join(" | ")}
                </div>
            )}

            {showError ? (
                <div className="text-center text-slate-500 py-8">
                    Unable to load IB account state
                </div>
            ) : state ? (
                <>
                    <div className="grid gap-4 lg:grid-cols-2">
                        {/* Connection & Permissions */}
                        <ConnectionBlock state={state.connection} />

                        {/* Account Summary */}
                        <AccountBlock state={state.account} />

                        {/* Margin & Risk */}
                        <MarginBlock state={state.margin} />

                        {/* Positions (full width) */}
                        <div className="lg:col-span-2">
                            <PositionsBlock state={state.positions} />
                        </div>
                    </div>

                    {/* IB Executions - Source of Truth (dedicated component) */}
                    <IBExecutionsBlock />
                </>
            ) : null}

            {/* Footer info */}
            <div className="text-xs text-slate-500 text-center">
                Source: IB Gateway API | Auto-refresh: {REFRESH_INTERVAL / 1000}s |
                Client ID: 99 (read-only)
            </div>
        </div>
    );
}
