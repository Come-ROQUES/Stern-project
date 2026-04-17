/**
 * EquityCurve.tsx - SVG equity curve for backtest results
 * Lightweight alternative to Plotly -- pure SVG with area fill
 */

import React, { useMemo } from 'react';
import { GlassCard } from '../../ui/glass';
import type { ExtendedMetrics } from '../../../lib/backtestUtils';

interface EquityCurveProps {
    isMetrics: ExtendedMetrics;
    oosMetrics: ExtendedMetrics;
    hasDualView: boolean;
}

const W = 800;
const H = 240;
const PAD = { top: 20, right: 20, bottom: 30, left: 55 };
const CHART_W = W - PAD.left - PAD.right;
const CHART_H = H - PAD.top - PAD.bottom;

function buildPath(data: number[], xScale: (i: number) => number, yScale: (v: number) => number): string {
    if (data.length === 0) return '';
    return data.map((v, i) => `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`).join('');
}

function buildAreaPath(data: number[], xScale: (i: number) => number, yScale: (v: number) => number, baseY: number): string {
    if (data.length === 0) return '';
    const line = buildPath(data, xScale, yScale);
    return `${line}L${xScale(data.length - 1).toFixed(1)},${baseY}L${xScale(0).toFixed(1)},${baseY}Z`;
}

export const EquityCurve = React.memo(function EquityCurve({ isMetrics, oosMetrics, hasDualView }: EquityCurveProps) {
    const { allData, isLen, min, max, hasData } = useMemo(() => {
        const isData = isMetrics.cumPnl;
        if (!isData.length) return { allData: [], isLen: 0, min: 0, max: 0, hasData: false };

        let all = [...isData];
        if (hasDualView && oosMetrics.cumPnl.length > 0) {
            const isEnd = isData[isData.length - 1] ?? 0;
            all = [...isData, ...oosMetrics.cumPnl.map((v) => v + isEnd)];
        }

        const mn = Math.min(0, ...all);
        const mx = Math.max(0, ...all);
        const range = mx - mn || 1;
        return {
            allData: all,
            isLen: isData.length,
            min: mn - range * 0.05,
            max: mx + range * 0.05,
            hasData: true,
        };
    }, [isMetrics.cumPnl, oosMetrics.cumPnl, hasDualView]);

    if (!hasData || allData.every((v) => v === 0)) {
        return (
            <GlassCard className="col-span-8">
                <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
                    Equity Curve
                </div>
                <div className="h-[240px] flex items-center justify-center text-neutral-600 text-sm">
                    Aucune donnee
                </div>
            </GlassCard>
        );
    }

    const xScale = (i: number) => PAD.left + (i / Math.max(1, allData.length - 1)) * CHART_W;
    const yScale = (v: number) => PAD.top + CHART_H - ((v - min) / (max - min)) * CHART_H;
    const zeroY = yScale(0);

    // Grid lines (5 horizontal)
    const gridLines = Array.from({ length: 5 }, (_, i) => {
        const v = min + ((max - min) * i) / 4;
        const y = yScale(v);
        return { y, label: v.toFixed(1) };
    });

    const isData = allData.slice(0, isLen);
    const oosData = hasDualView ? allData.slice(isLen) : [];

    // Build IS path
    const isPath = buildPath(isData, xScale, yScale);
    const isArea = buildAreaPath(isData, xScale, yScale, zeroY);

    // Build OOS path (offset x by isLen)
    const oosXScale = (i: number) => xScale(i + isLen);
    const oosPath = hasDualView ? buildPath(oosData, oosXScale, yScale) : '';
    const oosArea = hasDualView ? buildAreaPath(oosData, oosXScale, yScale, zeroY) : '';

    // Connecting line from IS end to OOS start
    const connectLine = hasDualView && oosData.length > 0
        ? `M${xScale(isLen - 1).toFixed(1)},${yScale(isData[isData.length - 1]).toFixed(1)}L${oosXScale(0).toFixed(1)},${yScale(oosData[0]).toFixed(1)}`
        : '';

    return (
        <GlassCard className="col-span-12 lg:col-span-8">
            <div className="flex items-center justify-between mb-3">
                <div className="text-xs uppercase tracking-[0.16em] text-neutral-400">
                    Equity Curve {hasDualView ? '(IS + OOS)' : '(pips cumulatifs)'}
                </div>
                {hasDualView && (
                    <div className="flex items-center gap-3 text-[10px]">
                        <span className="flex items-center gap-1">
                            <span className="w-3 h-0.5 bg-cyan-400 inline-block rounded" />
                            <span className="text-neutral-400">IS</span>
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-3 h-0.5 bg-emerald-400 inline-block rounded" />
                            <span className="text-neutral-400">OOS</span>
                        </span>
                    </div>
                )}
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
                {/* Grid */}
                {gridLines.map((g, i) => (
                    <g key={i}>
                        <line x1={PAD.left} y1={g.y} x2={W - PAD.right} y2={g.y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                        <text x={PAD.left - 8} y={g.y + 3} textAnchor="end" fill="#525252" fontSize="9" fontFamily="monospace">{g.label}</text>
                    </g>
                ))}
                {/* Zero line */}
                <line x1={PAD.left} y1={zeroY} x2={W - PAD.right} y2={zeroY} stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="4,3" />

                {/* IS area + line */}
                <path d={isArea} fill="rgba(34,211,238,0.06)" />
                <path d={isPath} fill="none" stroke="#22d3ee" strokeWidth="1.5" strokeLinejoin="round" />

                {/* OOS area + line */}
                {hasDualView && oosData.length > 0 && (
                    <>
                        <path d={oosArea} fill="rgba(52,211,153,0.06)" />
                        <path d={connectLine} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="3,3" />
                        <path d={oosPath} fill="none" stroke="#34d399" strokeWidth="1.5" strokeLinejoin="round" />
                        {/* IS/OOS boundary */}
                        <line x1={xScale(isLen - 1)} y1={PAD.top} x2={xScale(isLen - 1)} y2={H - PAD.bottom} stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="4,4" />
                    </>
                )}

                {/* End value marker */}
                {allData.length > 0 && (
                    <circle cx={xScale(allData.length - 1)} cy={yScale(allData[allData.length - 1])} r="3"
                        fill={allData[allData.length - 1] >= 0 ? '#34d399' : '#f87171'} />
                )}
            </svg>
        </GlassCard>
    );
});
