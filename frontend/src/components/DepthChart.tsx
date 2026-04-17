import { Suspense, lazy, useMemo } from 'react';
import type { Data, Layout } from 'plotly.js';
import type { BookLevel } from '../types';
import { cn } from '../lib/utils';

const Plot = lazy(() => import('react-plotly.js'));

type DepthChartProps = {
    bids: BookLevel[];
    asks: BookLevel[];
    midPrice?: number | null;
    className?: string;
};

export function DepthChart({ bids, asks, midPrice, className }: DepthChartProps) {
    const { bidTrace, askTrace, bidFill, askFill, midLine } = useMemo(() => {
        const sortedBids = [...bids].sort((a, b) => b.price - a.price);
        const sortedAsks = [...asks].sort((a, b) => a.price - b.price);

        // cumulative depth
        let cumBid = 0;
        const bidPrices: number[] = [];
        const bidCum: number[] = [];
        for (const level of sortedBids) {
            cumBid += level.size;
            bidPrices.push(level.price);
            bidCum.push(cumBid);
        }

        let cumAsk = 0;
        const askPrices: number[] = [];
        const askCum: number[] = [];
        for (const level of sortedAsks) {
            cumAsk += level.size;
            askPrices.push(level.price);
            askCum.push(cumAsk);
        }

        const bidLine: Data = {
            x: bidPrices,
            y: bidCum,
            type: 'scatter',
            mode: 'lines',
            line: { color: '#00FF88', width: 2, shape: 'hv' },
            hovertemplate: '$%{x:,.2f}<br>%{y:.4f} BTC<extra>Bid Depth</extra>',
            name: 'Bids',
            showlegend: false,
        };

        const bidArea: Data = {
            x: bidPrices,
            y: bidCum,
            type: 'scatter',
            mode: 'lines',
            line: { color: 'transparent', width: 0, shape: 'hv' },
            fill: 'tozeroy',
            fillcolor: 'rgba(0,255,136,0.08)',
            hoverinfo: 'skip',
            showlegend: false,
            name: '_bid_fill',
        };

        const askLine: Data = {
            x: askPrices,
            y: askCum,
            type: 'scatter',
            mode: 'lines',
            line: { color: '#FF4D4D', width: 2, shape: 'hv' },
            hovertemplate: '$%{x:,.2f}<br>%{y:.4f} BTC<extra>Ask Depth</extra>',
            name: 'Asks',
            showlegend: false,
        };

        const askArea: Data = {
            x: askPrices,
            y: askCum,
            type: 'scatter',
            mode: 'lines',
            line: { color: 'transparent', width: 0, shape: 'hv' },
            fill: 'tozeroy',
            fillcolor: 'rgba(255,77,77,0.08)',
            hoverinfo: 'skip',
            showlegend: false,
            name: '_ask_fill',
        };

        const mid = midPrice ?? (sortedBids[0] && sortedAsks[0]
            ? (sortedBids[0].price + sortedAsks[0].price) / 2
            : null);

        return {
            bidTrace: bidLine,
            askTrace: askLine,
            bidFill: bidArea,
            askFill: askArea,
            midLine: mid,
        };
    }, [bids, asks, midPrice]);

    const isEmpty = bids.length === 0 && asks.length === 0;

    if (isEmpty) {
        return (
            <div className={cn(
                'rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl p-6',
                className,
            )}>
                <div className="text-xs text-neutral-500 uppercase tracking-wider mb-4">Order Book Depth</div>
                <div className="h-[300px] flex items-center justify-center text-neutral-600 text-sm">
                    Book warming up...
                </div>
            </div>
        );
    }

    const data: Data[] = [bidFill, bidTrace, askFill, askTrace];

    const layout: Partial<Layout> = {
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        height: 320,
        margin: { l: 56, r: 56, t: 12, b: 36 },
        font: { family: 'IBM Plex Sans, Inter, sans-serif', color: '#8a918a', size: 11 },
        xaxis: {
            gridcolor: 'rgba(148,163,184,0.06)',
            zerolinecolor: 'transparent',
            color: '#4a524a',
            tickformat: ',.2f',
            tickprefix: '$',
            showspikes: true,
            spikemode: 'across',
            spikecolor: 'rgba(148,163,184,0.25)',
            spikethickness: 1,
            spikedash: 'dot',
        },
        yaxis: {
            gridcolor: 'rgba(148,163,184,0.06)',
            zerolinecolor: 'transparent',
            color: '#4a524a',
            ticksuffix: ' BTC',
            side: 'right',
        },
        shapes: midLine != null ? [{
            type: 'line',
            xref: 'x',
            yref: 'paper',
            x0: midLine,
            x1: midLine,
            y0: 0,
            y1: 1,
            line: { color: 'rgba(44,227,255,0.6)', width: 2, dash: 'dash' },
        }] : [],
        annotations: midLine != null ? [{
            x: midLine,
            y: 1,
            xref: 'x',
            yref: 'paper',
            text: `Mid $${midLine.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
            showarrow: false,
            font: { color: '#2CE3FF', size: 10 },
            bgcolor: 'rgba(8,14,24,0.9)',
            bordercolor: 'rgba(44,227,255,0.3)',
            borderwidth: 1,
            borderpad: 4,
            yshift: 10,
        }] : [],
        showlegend: false,
        hovermode: 'x unified',
        hoverlabel: {
            bgcolor: 'rgba(8,14,24,0.95)',
            bordercolor: 'rgba(148,163,184,0.25)',
            font: { color: '#e2e8f0', size: 11 },
        },
    };

    const totalBidDepth = bids.reduce((s, l) => s + l.size, 0);
    const totalAskDepth = asks.reduce((s, l) => s + l.size, 0);
    const imbalance = (totalBidDepth + totalAskDepth) > 0
        ? ((totalBidDepth - totalAskDepth) / (totalBidDepth + totalAskDepth) * 100)
        : 0;

    return (
        <div className={cn(
            'rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl overflow-hidden',
            'shadow-[0_18px_60px_rgba(0,0,0,0.35)]',
            className,
        )}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
                <div>
                    <h3 className="text-sm font-medium text-white">Order Book Depth</h3>
                    <span className="text-[10px] text-neutral-500">Cumulative L2 Liquidity</span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-4 text-[11px]">
                        <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-[#00FF88]" />
                            <span className="text-neutral-400">{totalBidDepth.toFixed(4)}</span>
                        </span>
                        <span className={cn(
                            'px-2 py-0.5 rounded-full border text-[10px] font-mono font-medium',
                            imbalance > 5 ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' :
                            imbalance < -5 ? 'border-red-500/30 bg-red-500/10 text-red-400' :
                            'border-white/10 bg-white/5 text-neutral-400'
                        )}>
                            {imbalance > 0 ? '+' : ''}{imbalance.toFixed(1)}%
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-[#FF4D4D]" />
                            <span className="text-neutral-400">{totalAskDepth.toFixed(4)}</span>
                        </span>
                    </div>
                </div>
            </div>
            <div className="px-2">
                <Suspense fallback={
                    <div className="h-[320px] flex items-center justify-center text-neutral-600 text-sm animate-pulse">
                        Loading depth...
                    </div>
                }>
                    <Plot
                        data={data}
                        layout={layout}
                        config={{ responsive: true, displayModeBar: false }}
                        useResizeHandler
                        style={{ width: '100%', height: 320 }}
                    />
                </Suspense>
            </div>
        </div>
    );
}
