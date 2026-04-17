/**
 * BacktestDiagnostics.tsx - Deep signal-level diagnostic views
 *
 * Lightweight rewrite without Plotly. Uses inline SVG/DOM charts so the
 * backtest tab stays responsive and visually aligned with the glass system.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    BarChart3,
    Clock,
    Filter,
    Layers,
    Target,
    TrendingDown,
} from 'lucide-react';
import {
    api,
    type DetailedReport,
    type DetailedReportResponse,
} from '../../lib/api';
import type { WalkForwardDetailedReport } from '../../lib/quantApi';
import {
    extractTradePnl,
    fmt,
    fmtPct,
} from '../../lib/backtestUtils';
import { cn } from '../../lib/utils';
import { GlassBadge, GlassCard, GlassKPI, GlassPanel } from '../ui/glass';

type TradeRow = Record<string, unknown>;
type DiagTab = 'exit' | 'mfe' | 'funnel' | 'session' | 'alpha' | 'hourly' | 'costs';

type BarDatum = {
    label: string;
    value: number;
    color?: string;
    note?: string;
};

type SeriesDatum = {
    label: string;
    primary: number;
    secondary?: number;
    note?: string;
    primaryColor?: string;
    secondaryColor?: string;
};

type ScatterPoint = {
    x: number;
    y: number;
    color: string;
    label?: string;
};

type HeatmapDatum = {
    label: string;
    value: number;
    count: number;
    winRate: number;
};

const TABS: { key: DiagTab; label: string; icon: React.ReactNode }[] = [
    { key: 'exit', label: 'Exit Analysis', icon: <Target size={13} /> },
    { key: 'mfe', label: 'MFE / MAE', icon: <TrendingDown size={13} /> },
    { key: 'funnel', label: 'Rejection Funnel', icon: <Filter size={13} /> },
    { key: 'session', label: 'Session / Regime', icon: <Layers size={13} /> },
    { key: 'alpha', label: 'Alpha Leak', icon: <AlertTriangle size={13} /> },
    { key: 'hourly', label: 'Hourly Heatmap', icon: <Clock size={13} /> },
    { key: 'costs', label: 'Cost Decomp', icon: <BarChart3 size={13} /> },
];

const SESSION_COLORS: Record<string, string> = {
    OVERLAP: '#22d3ee',
    LONDON: '#60a5fa',
    NEW_YORK: '#a78bfa',
    ASIA: '#fbbf24',
    CLOSED: '#525252',
    UNKNOWN: '#737373',
};

const REGIME_COLORS: Record<string, string> = {
    LOW: '#34d399',
    MEDIUM: '#fbbf24',
    HIGH: '#f87171',
    UNKNOWN: '#737373',
};

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface BacktestDiagnosticsProps {
    isRunId: string | null;
    oosRunId: string | null;
    isTrades: TradeRow[];
    oosTrades: TradeRow[];
    /** Walk-forward ID for aggregate diagnostics */
    wfId?: string | null;
}

function toObjectRecord<T>(value: Record<string, T> | null | undefined): Record<string, T> {
    return value ?? {};
}

function clampPct(value: number): number {
    return Math.max(0, Math.min(100, value));
}

function fmtPercentValue(value: number): string {
    return fmtPct(value / 100);
}

function fmtDateTime(value: string): string {
    return value.replace('T', ' ').slice(0, 19);
}

function createEmptyDetailedReport(phase: string = 'oos'): DetailedReport {
    return {
        strategy: 'walkforward',
        phase,
        period_start: '',
        period_end: '',
        n_trades: 0,
        session_breakdown: {},
        regime_breakdown: {},
        mfe_mae_analysis: {
            avg_mfe_pips: 0,
            avg_mae_pips: 0,
            avg_exit_efficiency: 0,
            pct_gave_back_mfe: 0,
            avg_unrealized_at_exit_pips: 0,
            pct_managed_exits_losing: 0,
            avg_tp_pips_vs_mfe: 0,
        },
        cost_decomposition: {
            avg_spread_pips: 0,
            avg_commission_pips: 0,
            avg_total_cost_pips: 0,
            total_cost_drag_pct: 0,
            cost_per_win_pips: 0,
            cost_per_loss_pips: 0,
            breakeven_win_rate: 0,
        },
        drawdown_periods: [],
        alpha_leak: {
            total_shocks: 0,
            accepted_signals: 0,
            traded: 0,
            accept_rate_pct: 0,
            trade_rate_pct: 0,
            rejection_breakdown: {},
            exit_reason_breakdown: {},
            pnl_from_tp: 0,
            pnl_from_sl: 0,
            pnl_from_managed_exits: 0,
            total_cost_drag_pips: 0,
        },
        rejection_funnel_pct: {},
        exit_reason_dist: {},
        hourly_heatmap: [],
        day_of_week_stats: [],
        slippage_adjustment: {
            applied: false,
            entry_mean_pips: 0,
            entry_std_pips: 0,
            exit_mean_pips: 0,
            exit_std_pips: 0,
            seed: 0,
            adj_net_pnl_pips: 0,
            adj_win_rate: 0,
            avg_slippage_entry_pips: 0,
            avg_slippage_exit_pips: 0,
            n_trades: 0,
        },
    };
}

function mean(values: number[]): number {
    if (!values.length) {
        return 0;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function normalizeWalkForwardDetailedReport(
    payload: WalkForwardDetailedReport,
): DetailedReport {
    const base = createEmptyDetailedReport(payload.phase);
    const rawReport = payload.report;

    if (!rawReport) {
        return {
            ...base,
            n_trades: payload.total_trades ?? 0,
        };
    }

    const mfeMae = Array.isArray(rawReport.mfe_mae) ? rawReport.mfe_mae : [];
    const mfeValues = mfeMae.map((point) => Number(point.mfe_pips) || 0);
    const maeValues = mfeMae.map((point) => Number(point.mae_pips) || 0);
    const winnerEfficiencies = mfeMae
        .filter((point) => (Number(point.pnl_net_pips) || 0) > 0 && (Number(point.mfe_pips) || 0) > 0)
        .map((point) => (Number(point.pnl_net_pips) / Number(point.mfe_pips)) * 100);
    const gaveBackPct = mfeMae
        .filter((point) => (Number(point.mfe_pips) || 0) > 0)
        .map((point) => {
            const mfe = Number(point.mfe_pips) || 0;
            const pnl = Number(point.pnl_net_pips) || 0;
            return clampPct(((mfe - pnl) / mfe) * 100);
        });
    const unrealizedAtExit = mfeMae.map((point) =>
        Math.max(0, (Number(point.mfe_pips) || 0) - (Number(point.pnl_net_pips) || 0))
    );
    const managedExits = mfeMae.filter((point) => {
        const reason = String(point.exit_reason || '').toUpperCase();
        return reason !== 'TP' && reason !== 'SL';
    });
    const managedExitsLosing =
        managedExits.length > 0
            ? (managedExits.filter((point) => (Number(point.pnl_net_pips) || 0) < 0).length /
                  managedExits.length) *
              100
            : 0;
    const tpVsMfe = mfeMae
        .filter((point) => String(point.exit_reason || '').toUpperCase() === 'TP' && (Number(point.mfe_pips) || 0) > 0)
        .map((point) => Number(point.pnl_net_pips) / Number(point.mfe_pips));

    const exitReasonDist = Object.fromEntries(
        Object.entries(rawReport.exit_analysis ?? {}).map(([reason, data]) => [
            reason,
            {
                count: data.count ?? 0,
                pct:
                    payload.total_trades && payload.total_trades > 0
                        ? ((data.count ?? 0) / payload.total_trades) * 100
                        : 0,
                total_pnl_pips: data.total_pnl ?? 0,
                avg_pnl_pips: data.avg_pnl ?? 0,
                wins: data.wins ?? 0,
                losses: data.losses ?? 0,
            },
        ]),
    );

    return {
        ...base,
        phase: payload.phase || base.phase,
        n_trades: payload.total_trades ?? mfeMae.length,
        mfe_mae_analysis: {
            avg_mfe_pips: mean(mfeValues),
            avg_mae_pips: mean(maeValues),
            avg_exit_efficiency: mean(winnerEfficiencies) / 100,
            pct_gave_back_mfe: mean(gaveBackPct),
            avg_unrealized_at_exit_pips: mean(unrealizedAtExit),
            pct_managed_exits_losing: managedExitsLosing,
            avg_tp_pips_vs_mfe: mean(tpVsMfe),
        },
        cost_decomposition: {
            ...base.cost_decomposition,
            avg_total_cost_pips:
                payload.total_trades && payload.total_trades > 0
                    ? (rawReport.cost_decomposition?.total_cost_pips ?? 0) / payload.total_trades
                    : 0,
            total_cost_drag_pct: rawReport.cost_decomposition?.cost_drag_pct ?? 0,
        },
        drawdown_periods: (rawReport.top_drawdowns ?? []).map((drawdown, index) => ({
            period_id: index + 1,
            start_trade_id: '',
            start_ts: drawdown.start_ts ?? '',
            end_trade_id: '',
            end_ts: drawdown.end_ts ?? '',
            depth_pips: drawdown.dd_pips ?? 0,
            n_trades: Math.max(0, (drawdown.end_idx ?? 0) - (drawdown.start_idx ?? 0) + 1),
            recovery_trades: 0,
        })),
        alpha_leak: {
            ...base.alpha_leak,
            traded: payload.total_trades ?? 0,
            trade_rate_pct: 100,
            exit_reason_breakdown: Object.fromEntries(
                Object.entries(exitReasonDist).map(([reason, data]) => [
                    reason,
                    {
                        count: data.count,
                        pct: data.pct,
                        total_pnl_pips: data.total_pnl_pips,
                        avg_pnl_pips: data.avg_pnl_pips,
                    },
                ]),
            ),
            pnl_from_tp: Object.entries(exitReasonDist)
                .filter(([reason]) => reason.toUpperCase() === 'TP')
                .reduce((sum, [, data]) => sum + data.total_pnl_pips, 0),
            pnl_from_sl: Object.entries(exitReasonDist)
                .filter(([reason]) => reason.toUpperCase() === 'SL')
                .reduce((sum, [, data]) => sum + data.total_pnl_pips, 0),
            pnl_from_managed_exits: Object.entries(exitReasonDist)
                .filter(([reason]) => !['TP', 'SL'].includes(reason.toUpperCase()))
                .reduce((sum, [, data]) => sum + data.total_pnl_pips, 0),
            total_cost_drag_pips: rawReport.cost_decomposition?.total_cost_pips ?? 0,
        },
        exit_reason_dist: exitReasonDist,
        hourly_heatmap: Object.entries(rawReport.hourly_heatmap ?? {})
            .map(([hour, data]) => ({
                hour_utc: Number(hour),
                count: data.count ?? 0,
                avg_pnl_pips: data.avg_pnl ?? 0,
                total_pnl_pips: data.total_pnl ?? 0,
                win_rate: 0,
            }))
            .sort((a, b) => a.hour_utc - b.hour_utc),
    };
}

function scatterAxis(points: ScatterPoint[], key: 'x' | 'y'): {
    min: number;
    max: number;
    span: number;
} {
    const values = points.map((point) => point[key]);
    const rawMin = Math.min(...values, 0);
    const rawMax = Math.max(...values, 0);
    const margin = Math.max((rawMax - rawMin) * 0.08, 1);
    const min = rawMin - margin;
    const max = rawMax + margin;
    return { min, max, span: Math.max(max - min, 1) };
}

function scatterPointsFromTrades(
    trades: TradeRow[],
    xField: 'mfe_pips' | 'mae_pips',
    color: string,
    prefix: string
): ScatterPoint[] {
    return trades
        .map((trade, index) => {
            const rawX = Number(trade[xField] ?? 0);
            const x = Number.isFinite(rawX) ? rawX : 0;
            const y = extractTradePnl(trade);
            return {
                x,
                y,
                color,
                label: `${prefix} #${index + 1}: ${fmt(x)} / ${fmt(y)}`,
            };
        })
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function CompactBars({
    title,
    data,
    rightLabel,
}: {
    title: string;
    data: BarDatum[];
    rightLabel?: string;
}) {
    if (!data.length) {
        return (
            <GlassCard>
                <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
                    {title}
                </div>
                <NoData />
            </GlassCard>
        );
    }

    const maxAbs = Math.max(...data.map((item) => Math.abs(item.value)), 1);

    return (
        <GlassCard>
            <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-4">
                {title}
            </div>
            <div className="space-y-3">
                {data.map((item) => {
                    const width = Math.max(6, (Math.abs(item.value) / maxAbs) * 100);
                    const color =
                        item.color ??
                        (item.value >= 0 ? 'rgba(52,211,153,0.75)' : 'rgba(248,113,113,0.75)');
                    return (
                        <div key={item.label} className="space-y-1">
                            <div className="flex items-center justify-between gap-3 text-[11px]">
                                <span className="text-neutral-300">{item.label}</span>
                                <span className="font-mono text-neutral-400">
                                    {fmt(item.value)}
                                    {rightLabel ? ` ${rightLabel}` : ''}
                                </span>
                            </div>
                            <div className="h-2.5 rounded-full bg-white/[0.04] overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-300"
                                    style={{ width: `${width}%`, backgroundColor: color }}
                                />
                            </div>
                            {item.note && (
                                <div className="text-[10px] text-neutral-500">{item.note}</div>
                            )}
                        </div>
                    );
                })}
            </div>
        </GlassCard>
    );
}

function DualMetricBars({
    title,
    subtitle,
    data,
    primaryLabel,
    secondaryLabel,
}: {
    title: string;
    subtitle?: string;
    data: SeriesDatum[];
    primaryLabel: string;
    secondaryLabel?: string;
}) {
    if (!data.length) {
        return (
            <GlassCard>
                <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
                    {title}
                </div>
                <NoData />
            </GlassCard>
        );
    }

    const maxValue = Math.max(
        ...data.flatMap((item) => [Math.abs(item.primary), Math.abs(item.secondary ?? 0)]),
        1
    );

    return (
        <GlassCard>
            <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-neutral-400">
                        {title}
                    </div>
                    {subtitle && <div className="text-[11px] text-neutral-500 mt-1">{subtitle}</div>}
                </div>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider">
                    <span className="inline-flex items-center gap-1 text-neutral-400">
                        <span className="h-2 w-2 rounded-full bg-cyan-400" />
                        {primaryLabel}
                    </span>
                    {secondaryLabel && (
                        <span className="inline-flex items-center gap-1 text-neutral-500">
                            <span className="h-2 w-2 rounded-full bg-emerald-400" />
                            {secondaryLabel}
                        </span>
                    )}
                </div>
            </div>
            <div className="space-y-3">
                {data.map((item) => (
                    <div key={item.label}>
                        <div className="flex items-center justify-between gap-3 text-[11px] mb-1">
                            <span className="text-neutral-300">{item.label}</span>
                            <span className="font-mono text-neutral-500">
                                {fmt(item.primary)}
                                {item.secondary != null ? ` / ${fmt(item.secondary)}` : ''}
                            </span>
                        </div>
                        <div className="space-y-1">
                            <div className="h-2 rounded-full bg-white/[0.04] overflow-hidden">
                                <div
                                    className="h-full rounded-full"
                                    style={{
                                        width: `${Math.max(4, (Math.abs(item.primary) / maxValue) * 100)}%`,
                                        backgroundColor: item.primaryColor ?? 'rgba(34,211,238,0.72)',
                                    }}
                                />
                            </div>
                            {item.secondary != null && (
                                <div className="h-2 rounded-full bg-white/[0.03] overflow-hidden">
                                    <div
                                        className="h-full rounded-full"
                                        style={{
                                            width: `${Math.max(4, (Math.abs(item.secondary) / maxValue) * 100)}%`,
                                            backgroundColor:
                                                item.secondaryColor ?? 'rgba(52,211,153,0.72)',
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                        {item.note && (
                            <div className="text-[10px] text-neutral-600 mt-1">{item.note}</div>
                        )}
                    </div>
                ))}
            </div>
        </GlassCard>
    );
}

function ScatterChart({
    title,
    xLabel,
    yLabel,
    points,
    showDiagonal = false,
}: {
    title: string;
    xLabel: string;
    yLabel: string;
    points: ScatterPoint[];
    showDiagonal?: boolean;
}) {
    if (!points.length) {
        return (
            <GlassCard>
                <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
                    {title}
                </div>
                <NoData />
            </GlassCard>
        );
    }

    const width = 520;
    const height = 260;
    const padX = 38;
    const padY = 18;
    const axisX = scatterAxis(points, 'x');
    const axisY = scatterAxis(points, 'y');
    const chartWidth = width - padX * 2;
    const chartHeight = height - padY * 2;

    const x = (value: number) => padX + ((value - axisX.min) / axisX.span) * chartWidth;
    const y = (value: number) =>
        height - padY - ((value - axisY.min) / axisY.span) * chartHeight;
    const zeroX = x(0);
    const zeroY = y(0);

    const diagonalStart = Math.max(axisX.min, axisY.min);
    const diagonalEnd = Math.min(axisX.max, axisY.max);

    return (
        <GlassCard>
            <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-4">
                {title}
            </div>
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[260px]">
                <line x1={padX} y1={zeroY} x2={width - padX} y2={zeroY} stroke="rgba(255,255,255,0.08)" />
                <line x1={zeroX} y1={padY} x2={zeroX} y2={height - padY} stroke="rgba(255,255,255,0.08)" />
                <rect
                    x={padX}
                    y={padY}
                    width={chartWidth}
                    height={chartHeight}
                    fill="transparent"
                    stroke="rgba(255,255,255,0.05)"
                />
                {showDiagonal && diagonalEnd > diagonalStart && (
                    <line
                        x1={x(diagonalStart)}
                        y1={y(diagonalStart)}
                        x2={x(diagonalEnd)}
                        y2={y(diagonalEnd)}
                        stroke="rgba(255,255,255,0.18)"
                        strokeDasharray="5 4"
                    />
                )}
                {points.map((point, index) => (
                    <g key={`${point.x}-${point.y}-${index}`}>
                        <circle
                            cx={x(point.x)}
                            cy={y(point.y)}
                            r="4.5"
                            fill={point.color}
                            fillOpacity="0.75"
                            stroke="rgba(255,255,255,0.18)"
                        />
                        {point.label && <title>{point.label}</title>}
                    </g>
                ))}
                <text x={width / 2} y={height - 2} textAnchor="middle" fill="#737373" fontSize="11">
                    {xLabel}
                </text>
                <text
                    x="12"
                    y={height / 2}
                    transform={`rotate(-90 12 ${height / 2})`}
                    textAnchor="middle"
                    fill="#737373"
                    fontSize="11"
                >
                    {yLabel}
                </text>
            </svg>
            <div className="mt-2 flex items-center gap-4 text-[10px] uppercase tracking-wider text-neutral-500">
                <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-cyan-400" />
                    IS
                </span>
                <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    OOS
                </span>
            </div>
        </GlassCard>
    );
}

function HeatmapGrid({
    title,
    data,
}: {
    title: string;
    data: HeatmapDatum[];
}) {
    if (!data.length) {
        return (
            <GlassCard>
                <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
                    {title}
                </div>
                <NoData />
            </GlassCard>
        );
    }

    const maxAbs = Math.max(...data.map((item) => Math.abs(item.value)), 1);

    return (
        <GlassCard>
            <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-4">
                {title}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                {data.map((item) => {
                    const intensity = Math.max(0.18, Math.abs(item.value) / maxAbs);
                    const base =
                        item.value >= 0
                            ? `rgba(52,211,153,${Math.min(0.78, intensity)})`
                            : `rgba(248,113,113,${Math.min(0.78, intensity)})`;
                    return (
                        <div
                            key={item.label}
                            className="rounded-xl border border-white/[0.08] p-3"
                            style={{ backgroundColor: base }}
                        >
                            <div className="text-[10px] uppercase tracking-[0.16em] text-white/80">
                                {item.label}
                            </div>
                            <div className="mt-2 text-lg font-mono font-semibold text-white">
                                {fmt(item.value)}
                            </div>
                            <div className="mt-1 text-[10px] text-white/75">
                                {item.count}T | WR {fmtPct(item.winRate)}
                            </div>
                        </div>
                    );
                })}
            </div>
        </GlassCard>
    );
}

function NoData() {
    return (
        <div className="h-[220px] flex items-center justify-center text-neutral-500 text-sm">
            Aucune donnee
        </div>
    );
}

export function BacktestDiagnostics({
    isRunId,
    oosRunId,
    isTrades,
    oosTrades,
    wfId,
}: BacktestDiagnosticsProps) {
    const [activeTab, setActiveTab] = useState<DiagTab>('exit');
    const [isReport, setIsReport] = useState<DetailedReport | null>(null);
    const [oosReport, setOosReport] = useState<DetailedReport | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // WF mode: load aggregate detailed report
        if (wfId) {
            let cancelled = false;
            const loadWf = async () => {
                setLoading(true);
                try {
                    const { getWalkForwardDetailedReport } = await import('../../lib/quantApi');
                    const resp = await getWalkForwardDetailedReport(wfId, 'oos');
                    if (cancelled) return;
                    if (resp.available && resp.report) {
                        setIsReport(normalizeWalkForwardDetailedReport(resp));
                    }
                    setOosReport(null);
                } catch {
                    if (!cancelled) { setIsReport(null); setOosReport(null); }
                } finally {
                    if (!cancelled) setLoading(false);
                }
            };
            loadWf();
            return () => { cancelled = true; };
        }

        if (!isRunId && !oosRunId) return;
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            try {
                const requests: Promise<DetailedReportResponse>[] = [];
                if (isRunId) {
                    requests.push(api.getDetailedReport(isRunId));
                } else {
                    requests.push(
                        Promise.resolve({ available: false, run_id: '', report: null })
                    );
                }
                if (oosRunId) {
                    requests.push(api.getDetailedReport(oosRunId));
                } else {
                    requests.push(
                        Promise.resolve({ available: false, run_id: '', report: null })
                    );
                }

                const [isResp, oosResp] = await Promise.all(requests);
                if (cancelled) return;
                setIsReport(isResp.report);
                setOosReport(oosResp.report);
            } catch {
                if (cancelled) return;
                setIsReport(null);
                setOosReport(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [isRunId, oosRunId]);

    if (!isReport && !loading) {
        return (
            <GlassCard className="text-center py-8">
                <div className="text-neutral-500 text-sm">
                    Aucun rapport detaille disponible. Relancer le backtest pour generer
                    les diagnostics.
                </div>
            </GlassCard>
        );
    }

    if (loading && !isReport) {
        return (
            <GlassCard className="text-center py-8">
                <div className="text-neutral-500 text-sm animate-pulse">
                    Chargement des diagnostics...
                </div>
            </GlassCard>
        );
    }

    if (!isReport) {
        return null;
    }

    return (
        <div className="space-y-4">
            <GlassCard padding="sm">
                <div className="flex flex-wrap items-center gap-2">
                    {TABS.map(({ key, label, icon }) => (
                        <button
                            key={key}
                            onClick={() => setActiveTab(key)}
                            className={cn(
                                'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs transition-all',
                                activeTab === key
                                    ? 'bg-white/[0.08] text-white border border-white/[0.1]'
                                    : 'text-neutral-400 border border-transparent hover:text-neutral-200 hover:bg-white/[0.04]'
                            )}
                        >
                            {icon}
                            {label}
                        </button>
                    ))}
                    <div className="ml-auto flex items-center gap-2">
                        <GlassBadge variant="info">IS {isReport.n_trades}T</GlassBadge>
                        {oosReport && (
                            <GlassBadge variant="success">OOS {oosReport.n_trades}T</GlassBadge>
                        )}
                    </div>
                </div>
            </GlassCard>

            {activeTab === 'exit' && <ExitAnalysisTab report={isReport} oosReport={oosReport} />}
            {activeTab === 'mfe' && (
                <MfeMaeTab report={isReport} isTrades={isTrades} oosTrades={oosTrades} />
            )}
            {activeTab === 'funnel' && (
                <RejectionFunnelTab report={isReport} oosReport={oosReport} />
            )}
            {activeTab === 'session' && (
                <SessionRegimeTab report={isReport} oosReport={oosReport} />
            )}
            {activeTab === 'alpha' && <AlphaLeakTab report={isReport} />}
            {activeTab === 'hourly' && (
                <HourlyHeatmapTab report={isReport} oosReport={oosReport} />
            )}
            {activeTab === 'costs' && <CostDecompTab report={isReport} />}
        </div>
    );
}

function ExitAnalysisTab({
    report,
    oosReport,
}: {
    report: DetailedReport;
    oosReport: DetailedReport | null;
}) {
    const exitRows = useMemo(() => {
        const exitReasonDist = toObjectRecord(report.exit_reason_dist);
        const oosExitReasonDist = toObjectRecord(oosReport?.exit_reason_dist);
        const labels = Array.from(
            new Set([
                ...Object.keys(exitReasonDist),
                ...Object.keys(oosExitReasonDist),
            ])
        );

        return labels.map((label) => ({
            label,
            primary: exitReasonDist[label]?.count ?? 0,
            secondary: oosExitReasonDist[label]?.count ?? 0,
            note: `IS avg ${fmt(exitReasonDist[label]?.avg_pnl_pips ?? 0)}p${
                oosReport
                    ? ` | OOS avg ${fmt(oosExitReasonDist[label]?.avg_pnl_pips ?? 0)}p`
                    : ''
            }`,
        }));
    }, [report, oosReport]);

    const pnlBars = useMemo(
        () =>
            Object.entries(toObjectRecord(report.exit_reason_dist)).map(([label, value]) => ({
                label,
                value: value.avg_pnl_pips,
                note: `${value.count} trades | WR ${fmtPercentValue(
                    value.count > 0 ? (value.wins / value.count) * 100 : 0
                )}`,
            })),
        [report]
    );

    return (
        <div className="space-y-4">
            <GlassPanel
                title="Exit Reason Distribution"
                subtitle="Nombre de trades par type de sortie et PnL moyen"
            >
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {Object.entries(toObjectRecord(report.exit_reason_dist)).map(([reason, data]) => (
                        <GlassKPI
                            key={reason}
                            label={reason}
                            value={`${data.count} (${data.pct}%)`}
                            sublabel={`Avg ${fmt(data.avg_pnl_pips)} pips`}
                            variant={data.avg_pnl_pips >= 0 ? 'success' : 'danger'}
                        />
                    ))}
                </div>
            </GlassPanel>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <DualMetricBars
                    title="Exit Count"
                    subtitle={oosReport ? 'Comparaison IS / OOS par type de sortie' : undefined}
                    data={exitRows}
                    primaryLabel="IS"
                    secondaryLabel={oosReport ? 'OOS' : undefined}
                />
                <CompactBars
                    title="Avg PnL by Exit Type"
                    data={pnlBars}
                    rightLabel="pips"
                />
            </div>
        </div>
    );
}

function MfeMaeTab({
    report,
    isTrades,
    oosTrades,
}: {
    report: DetailedReport;
    isTrades: TradeRow[];
    oosTrades: TradeRow[];
}) {
    const mfe = report.mfe_mae_analysis;

    const mfePoints = useMemo(
        () => [
            ...scatterPointsFromTrades(isTrades, 'mfe_pips', '#22d3ee', 'IS'),
            ...scatterPointsFromTrades(oosTrades, 'mfe_pips', '#34d399', 'OOS'),
        ],
        [isTrades, oosTrades]
    );

    const maePoints = useMemo(
        () => [
            ...scatterPointsFromTrades(isTrades, 'mae_pips', '#22d3ee', 'IS'),
            ...scatterPointsFromTrades(oosTrades, 'mae_pips', '#34d399', 'OOS'),
        ],
        [isTrades, oosTrades]
    );

    return (
        <div className="space-y-4">
            <GlassPanel
                title="MFE / MAE Analysis"
                subtitle="Efficience de sortie et alpha laisse sur la table"
            >
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                    <GlassKPI label="Avg MFE" value={`${fmt(mfe.avg_mfe_pips)} pips`} />
                    <GlassKPI label="Avg MAE" value={`${fmt(mfe.avg_mae_pips)} pips`} />
                    <GlassKPI
                        label="Exit Efficiency"
                        value={fmtPct(mfe.avg_exit_efficiency)}
                        sublabel="PnL / MFE (winners)"
                        variant={mfe.avg_exit_efficiency > 0.5 ? 'success' : 'danger'}
                    />
                    <GlassKPI
                        label="Gave Back MFE"
                        value={fmtPercentValue(mfe.pct_gave_back_mfe)}
                        variant={mfe.pct_gave_back_mfe < 40 ? 'success' : 'danger'}
                    />
                    <GlassKPI
                        label="Unrealized at Exit"
                        value={`${fmt(mfe.avg_unrealized_at_exit_pips)} pips`}
                    />
                    <GlassKPI
                        label="Managed Exits Losing"
                        value={fmtPercentValue(mfe.pct_managed_exits_losing)}
                        variant={mfe.pct_managed_exits_losing < 60 ? 'success' : 'danger'}
                    />
                    <GlassKPI
                        label="TP vs MFE"
                        value={fmt(mfe.avg_tp_pips_vs_mfe)}
                        sublabel="TP / MFE"
                    />
                </div>
            </GlassPanel>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <ScatterChart
                    title="MFE vs PnL Net"
                    xLabel="MFE (pips)"
                    yLabel="PnL Net (pips)"
                    points={mfePoints}
                    showDiagonal
                />
                <ScatterChart
                    title="MAE vs PnL Net"
                    xLabel="MAE (pips)"
                    yLabel="PnL Net (pips)"
                    points={maePoints}
                />
            </div>
        </div>
    );
}

function RejectionFunnelTab({
    report,
    oosReport,
}: {
    report: DetailedReport;
    oosReport: DetailedReport | null;
}) {
    const alphaLeak = report.alpha_leak;
    const funnelEntries = useMemo(
        () =>
            Object.entries(report.rejection_funnel_pct).sort(
                (a, b) => (b[1].count ?? 0) - (a[1].count ?? 0)
            ),
        [report]
    );

    const highLevel = [
        {
            label: 'Shocks',
            value: alphaLeak.total_shocks,
            note: 'Base observation',
            color: 'rgba(96,165,250,0.72)',
        },
        {
            label: 'Accepted',
            value: alphaLeak.accepted_signals,
            note: fmtPercentValue(alphaLeak.accept_rate_pct),
            color: 'rgba(34,211,238,0.72)',
        },
        {
            label: 'Traded',
            value: alphaLeak.traded,
            note: fmtPercentValue(alphaLeak.trade_rate_pct),
            color: 'rgba(52,211,153,0.72)',
        },
        {
            label: 'Rejected',
            value: Math.max(0, alphaLeak.total_shocks - alphaLeak.accepted_signals),
            note: 'Shocks non acceptes',
            color: 'rgba(248,113,113,0.72)',
        },
    ];

    return (
        <div className="space-y-4">
            <GlassPanel title="Signal Pipeline Funnel" subtitle="De la detection au trade">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <GlassKPI label="Shocks" value={alphaLeak.total_shocks} />
                    <GlassKPI
                        label="Accepted"
                        value={alphaLeak.accepted_signals}
                        sublabel={fmtPercentValue(alphaLeak.accept_rate_pct)}
                    />
                    <GlassKPI
                        label="Traded"
                        value={alphaLeak.traded}
                        sublabel={fmtPercentValue(alphaLeak.trade_rate_pct)}
                    />
                    <GlassKPI
                        label="Rejected"
                        value={Math.max(0, alphaLeak.total_shocks - alphaLeak.accepted_signals)}
                    />
                    <GlassKPI
                        label="Conversion"
                        value={fmtPct(
                            alphaLeak.total_shocks > 0
                                ? alphaLeak.traded / alphaLeak.total_shocks
                                : 0
                        )}
                    />
                </div>
            </GlassPanel>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <CompactBars title="Pipeline Stages" data={highLevel} />
                <GlassCard className="xl:col-span-2" padding="sm">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="text-xs uppercase tracking-[0.16em] text-neutral-400">
                            Rejection Breakdown
                        </div>
                        {oosReport && <GlassBadge variant="muted">IS report source</GlassBadge>}
                    </div>
                    <div className="max-h-[420px] overflow-auto rounded-xl border border-white/[0.06]">
                        <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-[#0a0f1c] text-neutral-400">
                                <tr>
                                    <th className="px-3 py-2 text-left">Gate / Reason</th>
                                    <th className="px-3 py-2 text-right">Count</th>
                                    <th className="px-3 py-2 text-right">% Rejected</th>
                                    <th className="px-3 py-2 text-right">% Total</th>
                                    <th className="px-3 py-2 text-left">Bar</th>
                                </tr>
                            </thead>
                            <tbody>
                                {funnelEntries.map(([reason, data]) => (
                                    <tr key={reason} className="border-t border-white/[0.04]">
                                        <td className="px-3 py-2 text-neutral-200 font-mono">
                                            {reason}
                                        </td>
                                        <td className="px-3 py-2 text-right text-neutral-300">
                                            {data.count}
                                        </td>
                                        <td className="px-3 py-2 text-right text-neutral-300">
                                            {fmtPercentValue(data.pct_of_rejected)}
                                        </td>
                                        <td className="px-3 py-2 text-right text-neutral-300">
                                            {fmtPercentValue(data.pct_of_total_shocks)}
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden max-w-[140px]">
                                                <div
                                                    className="h-full rounded-full bg-cyan-400/70"
                                                    style={{
                                                        width: `${clampPct(
                                                            data.pct_of_rejected
                                                        )}%`,
                                                    }}
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {!funnelEntries.length && (
                                    <tr>
                                        <td
                                            colSpan={5}
                                            className="px-4 py-8 text-center text-neutral-500"
                                        >
                                            Aucune rejection loggee
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </GlassCard>
            </div>
        </div>
    );
}

function SessionRegimeTab({
    report,
    oosReport,
}: {
    report: DetailedReport;
    oosReport: DetailedReport | null;
}) {
    const sessionBars = useMemo(
        () =>
            Object.entries(report.session_breakdown).map(([session, stats]) => ({
                label: session,
                value: stats.total_pnl_pips,
                color: SESSION_COLORS[session] ?? '#737373',
                note: `${stats.count}T | WR ${fmtPct(stats.win_rate)}`,
            })),
        [report]
    );

    const regimeBars = useMemo(
        () =>
            Object.entries(report.regime_breakdown).map(([regime, stats]) => ({
                label: regime,
                value: stats.total_pnl_pips,
                color: REGIME_COLORS[regime] ?? '#737373',
                note: `${stats.count}T | WR ${fmtPct(stats.win_rate)}`,
            })),
        [report]
    );

    return (
        <div className="space-y-4">
            <GlassPanel
                title="Performance par Session FX"
                subtitle="Lecture session et regime en un coup d'oeil"
                action={
                    oosReport ? <GlassBadge variant="success">OOS disponible</GlassBadge> : null
                }
            >
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {Object.entries(report.session_breakdown).map(([session, stats]) => (
                        <GlassKPI
                            key={session}
                            label={session}
                            value={`${fmt(stats.total_pnl_pips)} pips`}
                            sublabel={`${stats.count}T | WR ${fmtPct(stats.win_rate)}`}
                            variant={stats.total_pnl_pips >= 0 ? 'success' : 'danger'}
                        />
                    ))}
                </div>
            </GlassPanel>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <CompactBars title="PnL par Session" data={sessionBars} rightLabel="pips" />
                <CompactBars title="PnL par Regime" data={regimeBars} rightLabel="pips" />
            </div>

            <GlassCard padding="sm">
                <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
                    Detail par Regime
                </div>
                <div className="overflow-auto rounded-xl border border-white/[0.06]">
                    <table className="w-full text-xs">
                        <thead className="bg-[#0a0f1c] text-neutral-400">
                            <tr>
                                <th className="px-3 py-2 text-left">Regime</th>
                                <th className="px-3 py-2 text-right">Trades</th>
                                <th className="px-3 py-2 text-right">Wins</th>
                                <th className="px-3 py-2 text-right">Losses</th>
                                <th className="px-3 py-2 text-right">Win Rate</th>
                                <th className="px-3 py-2 text-right">Avg PnL</th>
                                <th className="px-3 py-2 text-right">Total PnL</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(report.regime_breakdown).map(([regime, stats]) => (
                                <tr key={regime} className="border-t border-white/[0.04]">
                                    <td className="px-3 py-2">
                                        <span
                                            className="inline-block w-2 h-2 rounded-full mr-2"
                                            style={{
                                                backgroundColor:
                                                    REGIME_COLORS[regime] ?? '#737373',
                                            }}
                                        />
                                        <span className="text-neutral-200">{regime}</span>
                                    </td>
                                    <td className="px-3 py-2 text-right text-neutral-300">
                                        {stats.count}
                                    </td>
                                    <td className="px-3 py-2 text-right text-emerald-300">
                                        {stats.wins}
                                    </td>
                                    <td className="px-3 py-2 text-right text-rose-300">
                                        {stats.losses}
                                    </td>
                                    <td className="px-3 py-2 text-right text-neutral-300">
                                        {fmtPct(stats.win_rate)}
                                    </td>
                                    <td
                                        className={cn(
                                            'px-3 py-2 text-right',
                                            stats.avg_pnl_pips >= 0
                                                ? 'text-emerald-300'
                                                : 'text-rose-300'
                                        )}
                                    >
                                        {fmt(stats.avg_pnl_pips)}
                                    </td>
                                    <td
                                        className={cn(
                                            'px-3 py-2 text-right font-medium',
                                            stats.total_pnl_pips >= 0
                                                ? 'text-emerald-300'
                                                : 'text-rose-300'
                                        )}
                                    >
                                        {fmt(stats.total_pnl_pips)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </GlassCard>
        </div>
    );
}

function AlphaLeakTab({ report }: { report: DetailedReport }) {
    const leak = report.alpha_leak;
    const exitReasonBreakdown = toObjectRecord(leak.exit_reason_breakdown);

    const waterfall = [
        {
            label: 'TP Profits',
            value: leak.pnl_from_tp,
            color: 'rgba(52,211,153,0.72)',
        },
        {
            label: 'SL Losses',
            value: leak.pnl_from_sl,
            color: 'rgba(248,113,113,0.72)',
        },
        {
            label: 'Managed Exits',
            value: leak.pnl_from_managed_exits,
            color: 'rgba(251,191,36,0.72)',
        },
        {
            label: 'Cost Drag',
            value: -Math.abs(leak.total_cost_drag_pips),
            color: 'rgba(167,139,250,0.72)',
        },
    ];

    return (
        <div className="space-y-4">
            <GlassPanel title="Alpha Leak Decomposition" subtitle="Ou l'EV potentielle est perdue">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <GlassKPI
                        label="PnL from TP"
                        value={`${fmt(leak.pnl_from_tp)} pips`}
                        variant="success"
                    />
                    <GlassKPI
                        label="PnL from SL"
                        value={`${fmt(leak.pnl_from_sl)} pips`}
                        variant="danger"
                    />
                    <GlassKPI
                        label="Managed Exits"
                        value={`${fmt(leak.pnl_from_managed_exits)} pips`}
                    />
                    <GlassKPI
                        label="Cost Drag"
                        value={`${fmt(leak.total_cost_drag_pips)} pips`}
                        variant="danger"
                    />
                </div>
            </GlassPanel>

            <CompactBars title="PnL Waterfall by Source" data={waterfall} rightLabel="pips" />

            {Object.keys(exitReasonBreakdown).length > 0 && (
                <GlassCard padding="sm">
                    <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
                        Exit Reason PnL Breakdown
                    </div>
                    <div className="overflow-auto rounded-xl border border-white/[0.06]">
                        <table className="w-full text-xs">
                            <thead className="bg-[#0a0f1c] text-neutral-400">
                                <tr>
                                    <th className="px-3 py-2 text-left">Reason</th>
                                    <th className="px-3 py-2 text-right">Count</th>
                                    <th className="px-3 py-2 text-right">%</th>
                                    <th className="px-3 py-2 text-right">Total PnL</th>
                                    <th className="px-3 py-2 text-right">Avg PnL</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(exitReasonBreakdown).map(
                                    ([reason, value]) => (
                                        <tr key={reason} className="border-t border-white/[0.04]">
                                            <td className="px-3 py-2 text-neutral-200 font-mono">
                                                {reason}
                                            </td>
                                            <td className="px-3 py-2 text-right text-neutral-300">
                                                {value.count}
                                            </td>
                                            <td className="px-3 py-2 text-right text-neutral-300">
                                                {value.pct}%
                                            </td>
                                            <td
                                                className={cn(
                                                    'px-3 py-2 text-right',
                                                    value.total_pnl_pips >= 0
                                                        ? 'text-emerald-300'
                                                        : 'text-rose-300'
                                                )}
                                            >
                                                {fmt(value.total_pnl_pips)}
                                            </td>
                                            <td
                                                className={cn(
                                                    'px-3 py-2 text-right',
                                                    value.avg_pnl_pips >= 0
                                                        ? 'text-emerald-300'
                                                        : 'text-rose-300'
                                                )}
                                            >
                                                {fmt(value.avg_pnl_pips)}
                                            </td>
                                        </tr>
                                    )
                                )}
                            </tbody>
                        </table>
                    </div>
                </GlassCard>
            )}

            {report.slippage_adjustment.applied && (
                <GlassPanel
                    title="Slippage Simulation"
                    subtitle={`N(${report.slippage_adjustment.entry_mean_pips}, ${report.slippage_adjustment.entry_std_pips}) entry`}
                >
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <GlassKPI
                            label="Adj Net PnL"
                            value={`${fmt(report.slippage_adjustment.adj_net_pnl_pips)} pips`}
                        />
                        <GlassKPI
                            label="Adj Win Rate"
                            value={fmtPct(report.slippage_adjustment.adj_win_rate)}
                        />
                        <GlassKPI
                            label="Avg Slip Entry"
                            value={`${fmt(
                                report.slippage_adjustment.avg_slippage_entry_pips,
                                3
                            )} pips`}
                        />
                        <GlassKPI
                            label="Avg Slip Exit"
                            value={`${fmt(
                                report.slippage_adjustment.avg_slippage_exit_pips,
                                3
                            )} pips`}
                        />
                    </div>
                </GlassPanel>
            )}
        </div>
    );
}

function HourlyHeatmapTab({
    report,
    oosReport,
}: {
    report: DetailedReport;
    oosReport: DetailedReport | null;
}) {
    const hourly = useMemo(
        () =>
            report.hourly_heatmap.map((bucket) => ({
                label: `${String(bucket.hour_utc).padStart(2, '0')}:00`,
                value: bucket.avg_pnl_pips,
                count: bucket.count,
                winRate: bucket.win_rate,
            })),
        [report]
    );

    const dowBars = useMemo(() => {
        const order = new Map(DAY_ORDER.map((day, index) => [day, index]));
        return [...report.day_of_week_stats]
            .sort((a, b) => (order.get(a.day) ?? 99) - (order.get(b.day) ?? 99))
            .map((bucket) => ({
                label: bucket.day,
                value: bucket.total_pnl_pips,
                note: `${bucket.count}T | WR ${fmtPct(bucket.win_rate)}`,
            }));
    }, [report]);

    return (
        <div className="space-y-4">
            <GlassPanel
                title="Hourly Edge Map"
                subtitle="Performance moyenne par heure UTC"
                action={
                    oosReport ? <GlassBadge variant="muted">Compare OOS via tab results</GlassBadge> : null
                }
            >
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <GlassKPI label="Hours Active" value={hourly.filter((item) => item.count > 0).length} />
                    <GlassKPI label="Best Slot" value={hourly.slice().sort((a, b) => b.value - a.value)[0]?.label ?? '--'} />
                    <GlassKPI label="Worst Slot" value={hourly.slice().sort((a, b) => a.value - b.value)[0]?.label ?? '--'} />
                    <GlassKPI
                        label="Total Buckets"
                        value={hourly.reduce((sum, item) => sum + item.count, 0)}
                    />
                </div>
            </GlassPanel>

            <HeatmapGrid title="Avg PnL per Hour (UTC)" data={hourly} />
            <CompactBars title="PnL by Day of Week" data={dowBars} rightLabel="pips" />
        </div>
    );
}

function CostDecompTab({ report }: { report: DetailedReport }) {
    const costs = report.cost_decomposition;
    const drawdowns = report.drawdown_periods;

    return (
        <div className="space-y-4">
            <GlassPanel title="Cost Decomposition" subtitle="Spread, commission et breakeven">
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                    <GlassKPI label="Avg Spread" value={`${fmt(costs.avg_spread_pips)} pips`} />
                    <GlassKPI
                        label="Avg Commission"
                        value={`${fmt(costs.avg_commission_pips)} pips`}
                    />
                    <GlassKPI
                        label="Avg Total Cost"
                        value={`${fmt(costs.avg_total_cost_pips)} pips`}
                    />
                    <GlassKPI
                        label="Cost Drag"
                        value={fmtPercentValue(costs.total_cost_drag_pct)}
                        variant={costs.total_cost_drag_pct < 30 ? 'success' : 'danger'}
                    />
                    <GlassKPI
                        label="Cost / Win"
                        value={`${fmt(costs.cost_per_win_pips)} pips`}
                    />
                    <GlassKPI
                        label="Cost / Loss"
                        value={`${fmt(costs.cost_per_loss_pips)} pips`}
                    />
                    <GlassKPI
                        label="Breakeven WR"
                        value={fmtPct(costs.breakeven_win_rate)}
                    />
                </div>
            </GlassPanel>

            {drawdowns.length > 0 && (
                <GlassCard padding="sm">
                    <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
                        Top {drawdowns.length} Drawdown Periods
                    </div>
                    <div className="overflow-auto rounded-xl border border-white/[0.06]">
                        <table className="w-full text-xs">
                            <thead className="bg-[#0a0f1c] text-neutral-400">
                                <tr>
                                    <th className="px-3 py-2 text-center">#</th>
                                    <th className="px-3 py-2 text-left">Start</th>
                                    <th className="px-3 py-2 text-left">End</th>
                                    <th className="px-3 py-2 text-right">Depth (pips)</th>
                                    <th className="px-3 py-2 text-right">Trades</th>
                                    <th className="px-3 py-2 text-right">Recovery</th>
                                </tr>
                            </thead>
                            <tbody>
                                {drawdowns.map((drawdown) => (
                                    <tr
                                        key={drawdown.period_id}
                                        className="border-t border-white/[0.04]"
                                    >
                                        <td className="px-3 py-2 text-center text-neutral-400">
                                            {drawdown.period_id}
                                        </td>
                                        <td className="px-3 py-2 text-neutral-300">
                                            {fmtDateTime(drawdown.start_ts)}
                                        </td>
                                        <td className="px-3 py-2 text-neutral-300">
                                            {fmtDateTime(drawdown.end_ts)}
                                        </td>
                                        <td className="px-3 py-2 text-right text-rose-300 font-medium">
                                            {fmt(drawdown.depth_pips)}
                                        </td>
                                        <td className="px-3 py-2 text-right text-neutral-300">
                                            {drawdown.n_trades}
                                        </td>
                                        <td className="px-3 py-2 text-right text-neutral-300">
                                            {drawdown.recovery_trades > 0
                                                ? `${drawdown.recovery_trades}T`
                                                : 'Ongoing'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </GlassCard>
            )}
        </div>
    );
}
