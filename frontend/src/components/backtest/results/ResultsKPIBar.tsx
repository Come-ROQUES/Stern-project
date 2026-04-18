/**
 * ResultsKPIBar.tsx - Full-width KPI bar for backtest results
 */

import React from 'react';
import { GlassKPI } from '../../ui/glass';
import {
    type ExtendedMetrics,
    fmt,
    fmtPct,
    fmtProfitFactor,
    deltaVariant,
    deltaTrend,
    deltaPct,
} from '../../../lib/backtestUtils';

interface ResultsKPIBarProps {
    isMetrics: ExtendedMetrics;
    oosMetrics: ExtendedMetrics;
    hasDualView: boolean;
}

export const ResultsKPIBar = React.memo(function ResultsKPIBar({ isMetrics, oosMetrics, hasDualView }: ResultsKPIBarProps) {
    const m = hasDualView ? oosMetrics : isMetrics;

    const kpis: {
        label: string;
        value: string;
        variant?: 'success' | 'danger' | 'default';
        trend?: 'up' | 'down' | 'neutral';
        trendValue?: string;
        sublabel?: string;
    }[] = [
        {
            label: 'PnL Total',
            value: fmt(m.totalPnl),
            variant: hasDualView ? deltaVariant(oosMetrics.totalPnl, isMetrics.totalPnl) : m.totalPnl >= 0 ? 'success' : 'danger',
            trend: hasDualView ? deltaTrend(oosMetrics.totalPnl, isMetrics.totalPnl) : undefined,
            trendValue: hasDualView ? deltaPct(oosMetrics.totalPnl, isMetrics.totalPnl) : undefined,
            sublabel: hasDualView ? `IS: ${fmt(isMetrics.totalPnl)}` : 'pips',
        },
        {
            label: 'Win Rate',
            value: fmtPct(m.winRate),
            variant: hasDualView ? deltaVariant(oosMetrics.winRate, isMetrics.winRate) : m.winRate >= 0.5 ? 'success' : 'danger',
            trend: hasDualView ? deltaTrend(oosMetrics.winRate, isMetrics.winRate) : undefined,
            trendValue: hasDualView ? deltaPct(oosMetrics.winRate, isMetrics.winRate) : undefined,
            sublabel: hasDualView ? `IS: ${fmtPct(isMetrics.winRate)}` : undefined,
        },
        {
            label: 'Sharpe',
            value: fmt(m.sharpe),
            variant: hasDualView ? deltaVariant(oosMetrics.sharpe, isMetrics.sharpe) : m.sharpe >= 1 ? 'success' : m.sharpe >= 0 ? 'default' : 'danger',
            trend: hasDualView ? deltaTrend(oosMetrics.sharpe, isMetrics.sharpe) : undefined,
            trendValue: hasDualView ? deltaPct(oosMetrics.sharpe, isMetrics.sharpe) : undefined,
            sublabel: hasDualView ? `IS: ${fmt(isMetrics.sharpe)}` : undefined,
        },
        {
            label: 'Max DD',
            value: fmt(m.maxDD),
            variant: hasDualView ? deltaVariant(oosMetrics.maxDD, isMetrics.maxDD, false) : 'default',
            trend: hasDualView ? deltaTrend(oosMetrics.maxDD, isMetrics.maxDD, false) : undefined,
            trendValue: hasDualView ? deltaPct(oosMetrics.maxDD, isMetrics.maxDD) : undefined,
            sublabel: hasDualView ? `IS: ${fmt(isMetrics.maxDD)}` : 'pips',
        },
        {
            label: 'Profit Factor',
            value: fmtProfitFactor(m.profitFactor),
            variant: hasDualView ? deltaVariant(oosMetrics.profitFactor, isMetrics.profitFactor) : m.profitFactor >= 1.5 ? 'success' : m.profitFactor >= 1 ? 'default' : 'danger',
            trend: hasDualView ? deltaTrend(oosMetrics.profitFactor, isMetrics.profitFactor) : undefined,
            trendValue: hasDualView ? deltaPct(oosMetrics.profitFactor, isMetrics.profitFactor) : undefined,
            sublabel: hasDualView ? `IS: ${fmtProfitFactor(isMetrics.profitFactor)}` : undefined,
        },
        {
            label: 'Calmar',
            value: fmt(m.calmar),
            variant: hasDualView ? deltaVariant(oosMetrics.calmar, isMetrics.calmar) : m.calmar >= 1 ? 'success' : 'default',
            trend: hasDualView ? deltaTrend(oosMetrics.calmar, isMetrics.calmar) : undefined,
            trendValue: hasDualView ? deltaPct(oosMetrics.calmar, isMetrics.calmar) : undefined,
            sublabel: hasDualView ? `IS: ${fmt(isMetrics.calmar)}` : undefined,
        },
        {
            label: 'Avg PnL/T',
            value: fmt(m.avgPnl, 3),
            variant: hasDualView ? deltaVariant(oosMetrics.avgPnl, isMetrics.avgPnl) : m.avgPnl > 0 ? 'success' : 'danger',
            trend: hasDualView ? deltaTrend(oosMetrics.avgPnl, isMetrics.avgPnl) : undefined,
            trendValue: hasDualView ? deltaPct(oosMetrics.avgPnl, isMetrics.avgPnl) : undefined,
            sublabel: hasDualView ? `IS: ${fmt(isMetrics.avgPnl, 3)}` : 'pips',
        },
        {
            label: 'Trades',
            value: String(m.tradeCount),
            sublabel: hasDualView ? `IS: ${isMetrics.tradeCount}` : undefined,
        },
    ];

    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {kpis.map((kpi) => (
                <GlassKPI
                    key={kpi.label}
                    label={kpi.label}
                    value={kpi.value}
                    variant={kpi.variant}
                    trend={kpi.trend}
                    trendValue={kpi.trendValue}
                    sublabel={kpi.sublabel}
                />
            ))}
        </div>
    );
});
