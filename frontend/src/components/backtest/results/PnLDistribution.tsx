/**
 * PnLDistribution.tsx - SVG histogram for PnL distribution
 */

import React, { useMemo } from 'react';
import { GlassCard } from '../../ui/glass';
import { extractTradePnl } from '../../../lib/backtestUtils';

interface PnLDistributionProps {
    isTrades: Record<string, unknown>[];
    oosTrades: Record<string, unknown>[];
    hasDualView: boolean;
}

const W = 400;
const H = 240;
const PAD = { top: 20, right: 15, bottom: 30, left: 40 };
const CHART_W = W - PAD.left - PAD.right;
const CHART_H = H - PAD.top - PAD.bottom;
const N_BINS = 20;

function buildHistogram(values: number[], binEdges: number[]): number[] {
    const counts = new Array(binEdges.length - 1).fill(0);
    for (const v of values) {
        for (let i = 0; i < binEdges.length - 1; i++) {
            if (v >= binEdges[i] && (v < binEdges[i + 1] || i === binEdges.length - 2)) {
                counts[i]++;
                break;
            }
        }
    }
    return counts;
}

export const PnLDistribution = React.memo(function PnLDistribution({ isTrades, oosTrades, hasDualView }: PnLDistributionProps) {
    const { isCounts, oosCounts, binEdges, maxCount, hasData } = useMemo(() => {
        const isPnls = isTrades.map((t) => extractTradePnl(t));
        const oosPnls = hasDualView ? oosTrades.map((t) => extractTradePnl(t)) : [];
        const allPnls = [...isPnls, ...oosPnls];
        if (allPnls.length === 0 || allPnls.every((v) => v === 0)) {
            return { isCounts: [], oosCounts: [], binEdges: [], maxCount: 0, hasData: false };
        }

        const mn = Math.min(...allPnls);
        const mx = Math.max(...allPnls);
        const range = mx - mn || 1;
        const edges: number[] = [];
        for (let i = 0; i <= N_BINS; i++) {
            edges.push(mn + (range * i) / N_BINS);
        }

        const ic = buildHistogram(isPnls, edges);
        const oc = hasDualView ? buildHistogram(oosPnls, edges) : [];
        const mc = Math.max(...ic, ...(oc.length ? oc : [0]));

        return { isCounts: ic, oosCounts: oc, binEdges: edges, maxCount: mc, hasData: true };
    }, [isTrades, oosTrades, hasDualView]);

    if (!hasData) {
        return (
            <GlassCard className="col-span-4">
                <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-3">
                    Distribution PnL
                </div>
                <div className="h-[240px] flex items-center justify-center text-neutral-600 text-sm">
                    Aucune donnee
                </div>
            </GlassCard>
        );
    }

    const barW = CHART_W / isCounts.length;
    const yScale = (v: number) => PAD.top + CHART_H - (v / (maxCount || 1)) * CHART_H;
    const xPos = (i: number) => PAD.left + i * barW;

    // X-axis labels (5 evenly spaced)
    const xLabels = [0, Math.floor(N_BINS / 4), Math.floor(N_BINS / 2), Math.floor((3 * N_BINS) / 4), N_BINS - 1].map((i) => ({
        x: xPos(i) + barW / 2,
        label: binEdges[i]?.toFixed(1) ?? '',
    }));

    return (
        <GlassCard className="col-span-12 lg:col-span-4">
            <div className="flex items-center justify-between mb-3">
                <div className="text-xs uppercase tracking-[0.16em] text-neutral-400">
                    Distribution PnL {hasDualView ? '(IS vs OOS)' : '(pips)'}
                </div>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
                {/* Grid lines */}
                {[0.25, 0.5, 0.75, 1].map((frac) => {
                    const y = PAD.top + CHART_H * (1 - frac);
                    return (
                        <line key={frac} x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
                            stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                    );
                })}

                {/* Zero line */}
                {binEdges[0] < 0 && binEdges[binEdges.length - 1] > 0 && (() => {
                    const zeroIdx = binEdges.findIndex((e) => e >= 0);
                    const zeroX = xPos(Math.max(0, zeroIdx - 1)) + barW / 2;
                    return <line x1={zeroX} y1={PAD.top} x2={zeroX} y2={H - PAD.bottom} stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="3,3" />;
                })()}

                {/* IS bars */}
                {isCounts.map((count, i) => {
                    if (count === 0) return null;
                    const h = (count / (maxCount || 1)) * CHART_H;
                    const bw = hasDualView ? barW * 0.45 : barW * 0.8;
                    const x = xPos(i) + (hasDualView ? barW * 0.05 : barW * 0.1);
                    return (
                        <rect key={`is-${i}`} x={x} y={yScale(count)} width={bw} height={h}
                            fill="rgba(34,211,238,0.5)" rx="1" />
                    );
                })}

                {/* OOS bars */}
                {hasDualView && oosCounts.map((count, i) => {
                    if (count === 0) return null;
                    const h = (count / (maxCount || 1)) * CHART_H;
                    const bw = barW * 0.45;
                    const x = xPos(i) + barW * 0.5;
                    return (
                        <rect key={`oos-${i}`} x={x} y={yScale(count)} width={bw} height={h}
                            fill="rgba(52,211,153,0.5)" rx="1" />
                    );
                })}

                {/* X-axis labels */}
                {xLabels.map((lbl, i) => (
                    <text key={i} x={lbl.x} y={H - 8} textAnchor="middle" fill="#525252" fontSize="9" fontFamily="monospace">
                        {lbl.label}
                    </text>
                ))}
            </svg>
        </GlassCard>
    );
});
