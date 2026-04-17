/**
 * Database Audit Panel - Canonical Data Only
 * 
 * Page blanche - on montre ce qui existe dans les DBs canoniques.
 * Pas de legacy, pas de fallback.
 */

import { useEffect, useState } from "react";
import { formatDateTimeUTC } from "../lib/dateUtils";
import { useRunMeta } from "../lib/useRunContext";
import { Database, Activity, Zap, TrendingUp, RefreshCw, AlertCircle } from "lucide-react";

const API_BASE = "/react-api/api";

// Types
interface Run {
    run_id: string;
    strategy: string;
    start_ts: string;
    end_ts: string | null;
    status: string;
    source: string;
    trades_count: number;
    pnl_total: number;
}

interface Trade {
    trade_id: string;
    strategy_id: string;
    symbol: string;
    side: string;
    qty: number;
    entry_price: number;
    exit_price: number | null;
    entry_time: string;
    exit_time: string | null;
    status: string;
    pnl: number | null;
    pnl_net_usd_used?: number | null;
    pnl_net_usd?: number | null;
    pnl_net_eur_used?: number | null;
    fx_rate_used?: number | null;
    net_pips_used?: number | null;
    pnl_net_pips?: number | null;
    pnl_pips?: number | null;
}

interface Signal {
    signal_id: string;
    symbol: string;
    direction: string;
    signal_type: string;
    timestamp: string;
    was_traded: boolean;
}

interface Shock {
    shock_id: string;
    symbol: string;
    direction: string;
    magnitude_pips: number;
    timestamp: string;
    was_traded: boolean;
}

// Badge component
function Badge({ children, variant }: { children: React.ReactNode; variant: "success" | "warning" | "error" | "info" | "neutral" }) {
    const colors = {
        success: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
        warning: "bg-amber-500/20 text-amber-400 border-amber-500/30",
        error: "bg-red-500/20 text-red-400 border-red-500/30",
        info: "bg-blue-500/20 text-blue-400 border-blue-500/30",
        neutral: "bg-neutral-500/20 text-neutral-400 border-neutral-500/30",
    };
    return (
        <span className={`px-2 py-0.5 text-xs font-medium rounded border ${colors[variant]}`}>
            {children}
        </span>
    );
}

export function DatabaseAudit() {
    const { run, contextValid, invalidReason } = useRunMeta();
    const [runs, setRuns] = useState<Run[]>([]);
    const [trades, setTrades] = useState<Trade[]>([]);
    const [signals, setSignals] = useState<Signal[]>([]);
    const [shocks, setShocks] = useState<Shock[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!contextValid || !run?.run_id || !run?.strategy_id) {
            setError(invalidReason || "Run context missing");
            setLoading(false);
            return;
        }
        fetchAllData(run.run_id, run.strategy_id);
    }, [contextValid, invalidReason, run?.run_id, run?.strategy_id]);

    const fetchAllData = async (runId: string, strategyId: string) => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                run_id: runId,
                strategy_id: strategyId,
                limit: "100",
            });
            const [runsRes, tradesRes, signalsRes, shocksRes] = await Promise.all([
                fetch(`${API_BASE}/registry/runs?limit=50`),
                fetch(`${API_BASE}/canonical/trades?${params}`),
                fetch(`${API_BASE}/registry/signals?${params}`),
                fetch(`${API_BASE}/registry/shocks?${params}`),
            ]);

            const runsData = await runsRes.json();
            const tradesData = await tradesRes.json();
            const signalsData = await signalsRes.json();
            const shocksData = await shocksRes.json();

            setRuns(runsData.runs || []);
            setTrades(tradesData.trades || []);
            setSignals(signalsData.signals || []);
            setShocks(shocksData.shocks || []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to fetch data");
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (ts: string | null) => {
        if (!ts) return "-";
        return `${formatDateTimeUTC(ts)} UTC`;
    };

    const resolveNetPnlUsd = (trade: Trade): number | null => {
        if (trade.pnl_net_usd_used != null) return trade.pnl_net_usd_used;
        if (trade.pnl_net_usd != null) return trade.pnl_net_usd;
        if (trade.pnl_net_eur_used != null && trade.fx_rate_used != null) {
            return trade.pnl_net_eur_used * trade.fx_rate_used;
        }
        const pips =
            trade.net_pips_used ?? trade.pnl_net_pips ?? trade.pnl_pips ?? null;
        if (pips == null) return null;
        const qty = trade.qty ?? 0;
        return pips * qty * 0.0001;
    };

    const formatPnl = (pnl: number | null) => {
        if (pnl === null) return "-";
        const sign = pnl >= 0 ? "+" : "";
        return `${sign}${pnl.toFixed(2)} USD`;
    };

    // Calculate totals
    const totalPnl = trades.reduce(
        (sum, t) => sum + (resolveNetPnlUsd(t) ?? 0),
        0
    );
    const winCount = trades.filter(t => (resolveNetPnlUsd(t) ?? 0) > 0).length;
    const winRate = trades.length > 0 ? (winCount / trades.length * 100).toFixed(1) : "0";

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Database className="w-6 h-6" />
                        Database Audit
                    </h1>
                    <p className="text-sm text-neutral-400 mt-1">
                        Canonical DBs only. Fresh start.
                    </p>
                </div>
                <button
                    onClick={() => {
                        if (run?.run_id && run?.strategy_id) {
                            fetchAllData(run.run_id, run.strategy_id);
                        }
                    }}
                    disabled={loading || !contextValid}
                    className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg flex items-center gap-2 text-sm disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                </button>
            </div>

            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400">
                    <AlertCircle className="w-5 h-5" />
                    {error}
                </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-neutral-900 rounded-lg p-4 border border-neutral-800">
                    <div className="text-xs text-neutral-400 uppercase">Runs</div>
                    <div className="text-2xl font-bold text-white">{runs.length}</div>
                    <div className="text-xs text-neutral-500">in runs.sqlite</div>
                </div>
                <div className="bg-neutral-900 rounded-lg p-4 border border-neutral-800">
                    <div className="text-xs text-neutral-400 uppercase">Trades</div>
                    <div className="text-2xl font-bold text-white">{trades.length}</div>
                    <div className="text-xs text-neutral-500">in canonical_trades.sqlite</div>
                </div>
                <div className="bg-neutral-900 rounded-lg p-4 border border-neutral-800">
                    <div className="text-xs text-neutral-400 uppercase">Signals</div>
                    <div className="text-2xl font-bold text-white">{signals.length}</div>
                    <div className="text-xs text-neutral-500">in signals.sqlite</div>
                </div>
                <div className="bg-neutral-900 rounded-lg p-4 border border-neutral-800">
                    <div className="text-xs text-neutral-400 uppercase">Shocks</div>
                    <div className="text-2xl font-bold text-white">{shocks.length}</div>
                    <div className="text-xs text-neutral-500">in shocks.sqlite</div>
                </div>
            </div>

            {/* KPIs from trades */}
            <div className="bg-neutral-900 rounded-lg p-4 border border-neutral-800">
                <div className="text-xs uppercase tracking-wider text-neutral-500 mb-3">
                    Canonical KPIs (from trades)
                </div>
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <div className="text-xs text-neutral-400">Total PnL</div>
                        <div className={`text-xl font-mono font-bold ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {formatPnl(totalPnl)}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs text-neutral-400">Win Rate</div>
                        <div className="text-xl font-mono font-bold text-white">{winRate}%</div>
                    </div>
                    <div>
                        <div className="text-xs text-neutral-400">Closed Trades</div>
                        <div className="text-xl font-mono font-bold text-white">
                            {trades.filter(t => t.status === "CLOSED").length}
                        </div>
                    </div>
                </div>
            </div>

            {/* Runs Table */}
            <div className="bg-neutral-900 rounded-lg p-4 border border-neutral-800">
                <div className="flex items-center gap-2 mb-3">
                    <Database className="w-4 h-4 text-blue-400" />
                    <span className="text-xs uppercase tracking-wider text-neutral-500">
                        Runs Registry ({runs.length})
                    </span>
                </div>
                {runs.length === 0 ? (
                    <div className="text-neutral-500 text-sm py-4 text-center">
                        No runs in registry
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-neutral-400 border-b border-neutral-800">
                                    <th className="pb-2 font-medium">Run ID</th>
                                    <th className="pb-2 font-medium">Strategy</th>
                                    <th className="pb-2 font-medium">Started</th>
                                    <th className="pb-2 font-medium">Status</th>
                                    <th className="pb-2 font-medium">Source</th>
                                </tr>
                            </thead>
                            <tbody>
                                {runs.map(r => (
                                    <tr key={r.run_id} className="border-b border-neutral-800/50">
                                        <td className="py-2 font-mono text-xs text-neutral-400">
                                            {r.run_id.slice(0, 12)}...
                                        </td>
                                        <td className="py-2">{r.strategy}</td>
                                        <td className="py-2 text-neutral-400">{formatDate(r.start_ts)}</td>
                                        <td className="py-2">
                                            <Badge variant={r.status === "running" ? "success" : "neutral"}>
                                                {r.status}
                                            </Badge>
                                        </td>
                                        <td className="py-2">
                                            <Badge variant="info">{r.source}</Badge>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Trades Table */}
            <div className="bg-neutral-900 rounded-lg p-4 border border-neutral-800">
                <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs uppercase tracking-wider text-neutral-500">
                        All Trades ({trades.length})
                    </span>
                </div>
                {trades.length === 0 ? (
                    <div className="text-neutral-500 text-sm py-4 text-center">
                        No trades in canonical DB
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-neutral-400 border-b border-neutral-800">
                                    <th className="pb-2 font-medium">ID</th>
                                    <th className="pb-2 font-medium">Symbol</th>
                                    <th className="pb-2 font-medium">Side</th>
                                    <th className="pb-2 font-medium">Qty</th>
                                    <th className="pb-2 font-medium">PnL</th>
                                    <th className="pb-2 font-medium">Status</th>
                                    <th className="pb-2 font-medium">Exit Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {trades.slice(0, 25).map(t => {
                                    const pnlValue = resolveNetPnlUsd(t);
                                    return (
                                    <tr key={t.trade_id} className="border-b border-neutral-800/50">
                                        <td className="py-2 font-mono text-xs text-neutral-400">
                                            {t.trade_id.slice(0, 8)}
                                        </td>
                                        <td className="py-2">{t.symbol}</td>
                                        <td className="py-2">
                                            <Badge variant={t.side === "BUY" ? "success" : "error"}>
                                                {t.side}
                                            </Badge>
                                        </td>
                                        <td className="py-2">{t.qty?.toLocaleString()}</td>
                                        <td className={`py-2 font-mono ${(pnlValue ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                            {formatPnl(pnlValue)}
                                        </td>
                                        <td className="py-2">
                                            <Badge variant={t.status === "CLOSED" ? "neutral" : "info"}>
                                                {t.status}
                                            </Badge>
                                        </td>
                                        <td className="py-2 text-neutral-400">{formatDate(t.exit_time)}</td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {trades.length > 25 && (
                            <div className="text-xs text-neutral-500 mt-2 text-center">
                                Showing 25 of {trades.length} trades
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Signals & Shocks - Ready for future */}
            <div className="grid md:grid-cols-2 gap-4">
                {/* Signals */}
                <div className="bg-neutral-900 rounded-lg p-4 border border-neutral-800">
                    <div className="flex items-center gap-2 mb-3">
                        <Activity className="w-4 h-4 text-blue-400" />
                        <span className="text-xs uppercase tracking-wider text-neutral-500">
                            Signals ({signals.length})
                        </span>
                    </div>
                    {signals.length === 0 ? (
                        <div className="text-neutral-500 text-sm py-4 text-center">
                            No signals yet - ready for future data
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {signals.slice(0, 10).map(s => (
                                <div key={s.signal_id} className="flex items-center justify-between text-sm">
                                    <span className="font-mono text-xs text-neutral-400">{s.signal_id.slice(0, 8)}</span>
                                    <span>{s.symbol}</span>
                                    <Badge variant={s.direction === "BUY" ? "success" : "error"}>{s.direction}</Badge>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Shocks */}
                <div className="bg-neutral-900 rounded-lg p-4 border border-neutral-800">
                    <div className="flex items-center gap-2 mb-3">
                        <Zap className="w-4 h-4 text-amber-400" />
                        <span className="text-xs uppercase tracking-wider text-neutral-500">
                            Shocks ({shocks.length})
                        </span>
                    </div>
                    {shocks.length === 0 ? (
                        <div className="text-neutral-500 text-sm py-4 text-center">
                            No shocks yet - ready for future data
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {shocks.slice(0, 10).map(s => (
                                <div key={s.shock_id} className="flex items-center justify-between text-sm">
                                    <span className="font-mono text-xs text-neutral-400">{s.shock_id.slice(0, 8)}</span>
                                    <span>{s.symbol}</span>
                                    <span className="font-mono">{s.magnitude_pips.toFixed(1)} pips</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="text-xs text-neutral-600 text-center py-2">
                Data sources: runs.sqlite | canonical_trades.sqlite | signals.sqlite | shocks.sqlite
            </div>
        </div>
    );
}
