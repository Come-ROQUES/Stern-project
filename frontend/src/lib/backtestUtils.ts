/**
 * backtestUtils.ts - Shared utilities for backtest components
 *
 * Centralizes PnL extraction, exit reason classification, formatters,
 * and extended metrics computation. Fixes known data bugs:
 * - PnL=0 when field names differ or values are strings
 * - Exit reason always "Other" due to narrow matching
 * - Hold time "--" due to ?? not catching empty strings
 * - Profit Factor "Infinity" displayed raw
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtendedMetrics {
    totalPnl: number;
    winRate: number;
    sharpe: number;
    maxDD: number;
    profitFactor: number;
    calmar: number;
    avgPnl: number;
    tradeCount: number;
    tpHitRate: number;
    slHitRate: number;
    cumPnl: number[];
    labels: string[];
}

type TradeRow = Record<string, unknown>;

// ---------------------------------------------------------------------------
// PnL Extraction (Bug fix: handles multiple field names + string values)
// ---------------------------------------------------------------------------

function toNum(v: unknown): number | null {
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v);
        if (!Number.isNaN(n)) return n;
    }
    return null;
}

const PNL_FIELDS = ['pnl_net_pips', 'net_pnl_pips', 'pnl_pips', 'gross_pnl_pips'] as const;

export function extractTradePnl(row: TradeRow): number {
    for (const field of PNL_FIELDS) {
        const v = toNum(row[field]);
        if (v !== null) return v;
    }
    // Fallback: compute from prices
    const entry = toNum(row.entry_price);
    const exit = toNum(row.exit_price);
    if (entry != null && exit != null && entry !== 0) {
        const side = String(row.side ?? row.direction ?? '').toUpperCase();
        const mult = side === 'SELL' || side === 'SHORT' ? -1 : 1;
        // Standard FX pip factor (4-digit pairs)
        const pipFactor = entry < 10 ? 10000 : 100; // JPY pairs have 2 decimals
        return (exit - entry) * mult * pipFactor;
    }
    return 0;
}

// ---------------------------------------------------------------------------
// Exit Reason Classification (Bug fix: expanded matching)
// ---------------------------------------------------------------------------

export function classifyExitReason(row: TradeRow): string {
    const reason = String(row.exit_reason ?? '').toUpperCase();
    if (reason.includes('TP') || reason.includes('TAKE') || reason.includes('TARGET') || reason.includes('PROFIT')) return 'TP';
    if (reason.includes('SL') || reason.includes('STOP') || reason.includes('LOSS')) return 'SL';
    // Check boolean fields (handle string "True"/"1" from CSV parsing)
    const tpHit = row.tp_hit;
    if (tpHit === true || tpHit === 'True' || tpHit === 'true' || tpHit === '1' || tpHit === 1) return 'TP';
    const slHit = row.sl_hit;
    if (slHit === true || slHit === 'True' || slHit === 'true' || slHit === '1' || slHit === 1) return 'SL';
    if (reason.includes('TIME') || reason.includes('MAX_HOLD') || reason.includes('EXPIRE') || reason.includes('EARLY') || reason.includes('TIMEOUT')) return 'Timeout';
    if (reason.includes('TRAIL')) return 'Trail';
    if (reason === '' || reason === 'NONE' || reason === 'NULL') return 'Unknown';
    return 'Other';
}

// ---------------------------------------------------------------------------
// Hold Time (Bug fix: || instead of ?? to catch empty strings)
// ---------------------------------------------------------------------------

export function computeHoldTime(row: TradeRow): string {
    // Try numeric fields first
    const holdBars = toNum(row.hold_bars) || toNum(row.bars_held);
    if (holdBars != null && holdBars > 0) {
        return `${holdBars}b`;
    }
    const holdSec = toNum(row.hold_seconds) || toNum(row.hold_s) || toNum(row.holding_s);
    if (holdSec != null && holdSec > 0) {
        return fmtDuration(holdSec);
    }
    // Compute from timestamps
    const entryTs = row.entry_ts as string | undefined;
    const exitTs = row.exit_ts as string | undefined;
    if (entryTs && exitTs) {
        const entryDate = new Date(entryTs);
        const exitDate = new Date(exitTs);
        const diffMs = exitDate.getTime() - entryDate.getTime();
        if (!Number.isNaN(diffMs) && diffMs > 0) {
            return fmtDuration(diffMs / 1000);
        }
    }
    return '--';
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

export function fmt(v: number | null | undefined, d = 2): string {
    if (v == null || Number.isNaN(v)) return '--';
    return v.toFixed(d);
}

export function fmtPct(v: number | null | undefined): string {
    if (v == null || Number.isNaN(v)) return '--';
    return `${(v * 100).toFixed(1)}%`;
}

export function fmtProfitFactor(v: number | null | undefined): string {
    if (v == null || Number.isNaN(v)) return '--';
    if (!Number.isFinite(v)) return v > 0 ? '\u221E' : '--';
    return v.toFixed(2);
}

export function fmtDuration(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m${Math.round(seconds % 60)}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h${m}m`;
}

export function fmtTimestamp(ts: string | null | undefined): string {
    if (!ts) return '--';
    return String(ts).replace('T', ' ').slice(0, 19);
}

// ---------------------------------------------------------------------------
// Extended Metrics Computation
// ---------------------------------------------------------------------------

export function computeExtendedMetrics(trades: TradeRow[]): ExtendedMetrics {
    const pnls = trades.map((t) => extractTradePnl(t));
    const tradeCount = pnls.length;

    // Cumulative PnL
    const cumPnl: number[] = [];
    const labels: string[] = [];
    let running = 0;
    for (const row of trades) {
        running += extractTradePnl(row);
        cumPnl.push(running);
        labels.push(String((row as TradeRow).entry_ts ?? (row as TradeRow).exit_ts ?? cumPnl.length));
    }

    const totalPnl = running;
    const wins = pnls.filter((p) => p > 0).length;
    const winRate = tradeCount > 0 ? wins / tradeCount : 0;
    const avgPnl = tradeCount > 0 ? totalPnl / tradeCount : 0;

    // Sharpe (annualized, rough: sqrt(252) * mean/std)
    const mean = tradeCount > 0 ? pnls.reduce((s, v) => s + v, 0) / tradeCount : 0;
    const variance = tradeCount > 1
        ? pnls.reduce((s, v) => s + (v - mean) ** 2, 0) / (tradeCount - 1)
        : 0;
    const std = Math.sqrt(variance);
    const sharpe = std > 0 ? (mean / std) * Math.sqrt(252) : 0;

    // Max Drawdown
    let peak = 0;
    let maxDD = 0;
    for (const eq of cumPnl) {
        if (eq > peak) peak = eq;
        const dd = peak - eq;
        if (dd > maxDD) maxDD = dd;
    }

    // Profit Factor
    const grossProfit = pnls.filter((p) => p > 0).reduce((s, v) => s + v, 0);
    const grossLoss = Math.abs(pnls.filter((p) => p < 0).reduce((s, v) => s + v, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : tradeCount > 0 ? Infinity : 0;

    // Calmar
    const calmar = maxDD > 0 ? totalPnl / maxDD : 0;

    // TP/SL hit rates
    const tpHits = trades.filter((t) => classifyExitReason(t) === 'TP').length;
    const slHits = trades.filter((t) => classifyExitReason(t) === 'SL').length;
    const tpHitRate = tradeCount > 0 ? tpHits / tradeCount : 0;
    const slHitRate = tradeCount > 0 ? slHits / tradeCount : 0;

    return {
        totalPnl, winRate, sharpe, maxDD, profitFactor, calmar, avgPnl,
        tradeCount, tpHitRate, slHitRate, cumPnl, labels,
    };
}

// ---------------------------------------------------------------------------
// Delta Analysis Helpers (IS vs OOS comparison)
// ---------------------------------------------------------------------------

export function deltaVariant(oosVal: number, isVal: number, higherIsBetter = true): 'success' | 'danger' | 'default' {
    if (isVal === 0) return 'default';
    const ratio = oosVal / isVal;
    if (higherIsBetter) return ratio >= 0.8 ? 'success' : 'danger';
    return ratio <= 1.2 ? 'success' : 'danger';
}

export function deltaTrend(oosVal: number, isVal: number, higherIsBetter = true): 'up' | 'down' | 'neutral' {
    if (isVal === 0 && oosVal === 0) return 'neutral';
    if (higherIsBetter) return oosVal >= isVal ? 'up' : 'down';
    return oosVal <= isVal ? 'up' : 'down';
}

export function deltaPct(oosVal: number, isVal: number): string {
    if (isVal === 0) return '--';
    const pct = ((oosVal - isVal) / Math.abs(isVal)) * 100;
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`;
}

// ---------------------------------------------------------------------------
// Strategy Metadata
// ---------------------------------------------------------------------------

export type BacktestStrategy = 'dw' | 's2' | 'tf_pullback';

export const STRATEGY_META: Record<BacktestStrategy, {
    label: string;
    accent: string;
    accentBg: string;
    accentBorder: string;
}> = {
    dw: {
        label: 'S1 Damping Wave',
        accent: 'text-cyan-400',
        accentBg: 'bg-cyan-500/10',
        accentBorder: 'border-cyan-500/30',
    },
    s2: {
        label: 'S2 Pairs Trading',
        accent: 'text-violet-400',
        accentBg: 'bg-violet-500/10',
        accentBorder: 'border-violet-500/30',
    },
    tf_pullback: {
        label: 'S3 TF Pullback',
        accent: 'text-emerald-400',
        accentBg: 'bg-emerald-500/10',
        accentBorder: 'border-emerald-500/30',
    },
};

export const STRATEGY_LABELS: Record<BacktestStrategy, string> = {
    dw: 'S1 Damping Wave',
    s2: 'S2 Pairs Trading',
    tf_pullback: 'S3 TF Pullback',
};

// ---------------------------------------------------------------------------
// Chart Colors
// ---------------------------------------------------------------------------

export const SESSION_COLORS: Record<string, string> = {
    OVERLAP: '#22d3ee',
    LONDON: '#60a5fa',
    NEW_YORK: '#a78bfa',
    ASIA: '#fbbf24',
    CLOSED: '#525252',
    UNKNOWN: '#737373',
};

export const REGIME_COLORS: Record<string, string> = {
    LOW: '#34d399',
    MEDIUM: '#fbbf24',
    HIGH: '#f87171',
    UNKNOWN: '#737373',
};

export const EXIT_COLORS: Record<string, string> = {
    TP: '#34d399',
    SL: '#f87171',
    Timeout: '#fbbf24',
    Trail: '#a78bfa',
    Unknown: '#525252',
    Other: '#737373',
};
