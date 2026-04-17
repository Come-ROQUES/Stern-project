/**
 * ExitReasonChart - Horizontal bar chart showing exit reason distribution.
 * Inline SVG rendering, no external chart library.
 */

import React, { useMemo } from 'react';
import { classifyExitReason } from '../../../lib/backtestUtils';
import { cn } from '../../../lib/utils';

interface ExitReasonChartProps {
    trades: Record<string, unknown>[];
    className?: string;
}

const REASON_COLORS: Record<string, string> = {
    TP: '#34d399',       // emerald-400
    SL: '#fb7185',       // rose-400
    Timeout: '#fbbf24',  // amber-400
    Trail: '#a78bfa',    // violet-400
    Other: '#a3a3a3',    // neutral-400
    Unknown: '#a3a3a3',  // neutral-400
};

const BAR_HEIGHT = 18;
const BAR_GAP = 6;
const LABEL_WIDTH = 60;
const COUNT_WIDTH = 80;
const BAR_X = LABEL_WIDTH + 4;

function ExitReasonChartInner({ trades, className }: ExitReasonChartProps) {
    const data = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const trade of trades) {
            const reason = classifyExitReason(trade);
            counts[reason] = (counts[reason] ?? 0) + 1;
        }
        const total = trades.length || 1;
        return Object.entries(counts)
            .map(([reason, count]) => ({
                reason,
                count,
                pct: count / total,
            }))
            .sort((a, b) => b.count - a.count);
    }, [trades]);

    if (data.length === 0) {
        return (
            <div className={cn('rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4', className)}>
                <p className="text-xs text-neutral-500">No exit reason data</p>
            </div>
        );
    }

    const svgHeight = data.length * (BAR_HEIGHT + BAR_GAP) - BAR_GAP + 8;
    const barMaxWidth = 220;
    const svgWidth = BAR_X + barMaxWidth + COUNT_WIDTH + 8;

    return (
        <div className={cn('rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4', className)}>
            <h4 className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-3">
                Exit Reasons
            </h4>
            <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                width="100%"
                height={svgHeight}
                className="overflow-visible"
            >
                {data.map((d, i) => {
                    const y = i * (BAR_HEIGHT + BAR_GAP) + 4;
                    const barWidth = d.pct * barMaxWidth;
                    const color = REASON_COLORS[d.reason] ?? REASON_COLORS.Other;

                    return (
                        <g key={d.reason}>
                            {/* Label */}
                            <text
                                x={LABEL_WIDTH}
                                y={y + BAR_HEIGHT / 2 + 1}
                                textAnchor="end"
                                fill="#a3a3a3"
                                fontSize={11}
                                fontFamily="ui-monospace, monospace"
                                dominantBaseline="middle"
                            >
                                {d.reason}
                            </text>

                            {/* Bar background */}
                            <rect
                                x={BAR_X}
                                y={y}
                                width={barMaxWidth}
                                height={BAR_HEIGHT}
                                rx={4}
                                fill="rgba(255,255,255,0.04)"
                            />

                            {/* Bar fill */}
                            <rect
                                x={BAR_X}
                                y={y}
                                width={Math.max(barWidth, 2)}
                                height={BAR_HEIGHT}
                                rx={4}
                                fill={color}
                                fillOpacity={0.7}
                            />

                            {/* Count + percentage */}
                            <text
                                x={BAR_X + barMaxWidth + 8}
                                y={y + BAR_HEIGHT / 2 + 1}
                                textAnchor="start"
                                fill="#d4d4d4"
                                fontSize={11}
                                fontFamily="ui-monospace, monospace"
                                dominantBaseline="middle"
                            >
                                {d.count} ({(d.pct * 100).toFixed(1)}%)
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

export const ExitReasonChart = React.memo(ExitReasonChartInner);
