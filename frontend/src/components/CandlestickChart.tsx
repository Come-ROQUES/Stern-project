import { Suspense, lazy, useMemo } from 'react';
import type { Data, Layout, Shape } from 'plotly.js';
import type { HistoryPoint, Fill, PublicTrade } from '../types';
import { cn } from '../lib/utils';

const Plot = lazy(() => import('react-plotly.js'));

type OhlcBar = {
    ts: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
};

function buildOhlcFromMid(history: HistoryPoint[], barCount = 5): OhlcBar[] {
    if (history.length < barCount) return [];
    const bars: OhlcBar[] = [];
    const step = Math.max(1, Math.floor(history.length / Math.min(60, Math.ceil(history.length / barCount))));

    for (let i = 0; i < history.length; i += step) {
        const chunk = history.slice(i, i + step);
        if (chunk.length === 0) continue;
        const prices = chunk.map(p => p.mid_price);
        const open = prices[0];
        const close = prices[prices.length - 1];
        const high = Math.max(...prices);
        const low = Math.min(...prices);
        const vol = chunk.length;
        bars.push({ ts: chunk[0].ts, open, high, low, close, volume: vol });
    }
    return bars;
}

type CandlestickChartProps = {
    midHistory: HistoryPoint[];
    fills?: Fill[];
    recentTrades?: PublicTrade[];
    midPrice?: number | null;
    bestBid?: number | null;
    bestAsk?: number | null;
    className?: string;
};

export function CandlestickChart({
    midHistory,
    fills = [],
    recentTrades = [],
    midPrice,
    bestBid,
    bestAsk,
    className,
}: CandlestickChartProps) {
    const bars = useMemo(() => buildOhlcFromMid(midHistory), [midHistory]);

    const { candleTrace, volumeTrace, fillMarkers, tradeMarkers, atrUpper, atrLower, shapes } = useMemo(() => {
        if (bars.length === 0) return { candleTrace: null, volumeTrace: null, fillMarkers: null, tradeMarkers: null, atrUpper: null, atrLower: null, shapes: [] };

        const timestamps = bars.map(b => b.ts);
        const closes = bars.map(b => b.close);

        const candle: Data = {
            x: timestamps,
            open: bars.map(b => b.open),
            high: bars.map(b => b.high),
            low: bars.map(b => b.low),
            close: closes,
            type: 'candlestick',
            increasing: { line: { color: '#00E0FF', width: 1.5 } },
            decreasing: { line: { color: '#FF4D4D', width: 1.5 } },
            hovertemplate: 'O: %{open:.2f}<br>H: %{high:.2f}<br>L: %{low:.2f}<br>C: %{close:.2f}<extra></extra>',
            name: 'Price',
            showlegend: false,
        };

        const maxVol = Math.max(...bars.map(b => b.volume), 1);
        const volColors = bars.map(b => b.close >= b.open ? 'rgba(0,224,255,0.35)' : 'rgba(255,77,77,0.35)');
        const vol: Data = {
            x: timestamps,
            y: bars.map(b => b.volume),
            type: 'bar',
            marker: { color: volColors },
            yaxis: 'y2',
            hovertemplate: 'Vol: %{y}<extra></extra>',
            name: 'Volume',
            showlegend: false,
        };

        // ATR envelope (simple rolling range)
        const window = 10;
        const upperBand: (number | null)[] = [];
        const lowerBand: (number | null)[] = [];
        for (let i = 0; i < bars.length; i++) {
            if (i < window) {
                upperBand.push(null);
                lowerBand.push(null);
                continue;
            }
            const slice = bars.slice(i - window, i);
            const ranges = slice.map(b => b.high - b.low);
            const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
            upperBand.push(bars[i].close + avgRange * 1.5);
            lowerBand.push(bars[i].close - avgRange * 1.5);
        }

        const upper: Data = {
            x: timestamps,
            y: upperBand,
            type: 'scatter',
            mode: 'lines',
            line: { color: 'rgba(148,163,184,0.3)', width: 1, dash: 'dot' },
            hoverinfo: 'skip',
            showlegend: false,
            name: 'ATR+',
        };

        const lower: Data = {
            x: timestamps,
            y: lowerBand,
            type: 'scatter',
            mode: 'lines',
            line: { color: 'rgba(148,163,184,0.3)', width: 1, dash: 'dot' },
            fill: 'tonexty',
            fillcolor: 'rgba(148,163,184,0.03)',
            hoverinfo: 'skip',
            showlegend: false,
            name: 'ATR-',
        };

        // Fill markers (signals)
        const fm: Data | null = fills.length > 0 ? {
            x: fills.map(f => f.ts),
            y: fills.map(f => f.price),
            type: 'scattergl',
            mode: 'markers',
            marker: {
                size: fills.map(() => 12),
                symbol: fills.map(f => f.side === 'buy' ? 'triangle-up' : 'triangle-down'),
                color: fills.map(f => f.side === 'buy' ? '#00FF88' : '#FF4D4D'),
                line: { color: '#0b1220', width: 1.5 },
            },
            customdata: fills.map(f => [f.side, f.reason, f.size]),
            hovertemplate: '%{customdata[0]} | %{customdata[1]}<br>$%{y:.2f} x %{customdata[2]:.4f}<extra>Signal</extra>',
            name: 'Fills',
            showlegend: false,
        } : null;

        // Recent trades as small dots
        const last20 = recentTrades.slice(0, 20);
        const tm: Data | null = last20.length > 0 ? {
            x: last20.map(t => t.ts),
            y: last20.map(t => t.price),
            type: 'scattergl',
            mode: 'markers',
            marker: {
                size: 5,
                color: last20.map(t => t.side === 'buy' ? 'rgba(0,255,136,0.5)' : 'rgba(255,77,77,0.5)'),
                symbol: 'circle',
            },
            hovertemplate: '%{y:.2f}<extra>Trade</extra>',
            name: 'Trades',
            showlegend: false,
        } : null;

        // Bid/Ask lines as shapes
        const shps: Partial<Shape>[] = [];
        if (bestBid != null) {
            shps.push({
                type: 'line',
                xref: 'paper',
                x0: 0, x1: 1,
                y0: bestBid, y1: bestBid,
                line: { color: 'rgba(0,255,136,0.4)', width: 1, dash: 'dash' },
            });
        }
        if (bestAsk != null) {
            shps.push({
                type: 'line',
                xref: 'paper',
                x0: 0, x1: 1,
                y0: bestAsk, y1: bestAsk,
                line: { color: 'rgba(255,77,77,0.4)', width: 1, dash: 'dash' },
            });
        }

        return {
            candleTrace: candle,
            volumeTrace: vol,
            fillMarkers: fm,
            tradeMarkers: tm,
            atrUpper: upper,
            atrLower: lower,
            shapes: shps,
        };
    }, [bars, fills, recentTrades, bestBid, bestAsk]);

    if (bars.length === 0) {
        return (
            <div className={cn(
                'rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl p-6',
                className
            )}>
                <div className="text-xs text-neutral-500 uppercase tracking-wider mb-4">Price Action</div>
                <div className="h-[360px] flex items-center justify-center text-neutral-600 text-sm">
                    Hydrating price data...
                </div>
            </div>
        );
    }

    const data: Data[] = [
        candleTrace,
        atrUpper,
        atrLower,
        volumeTrace,
        fillMarkers,
        tradeMarkers,
    ].filter(Boolean) as Data[];

    const layout: Partial<Layout> = {
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        height: 420,
        margin: { l: 64, r: 24, t: 8, b: 36 },
        font: { family: 'IBM Plex Sans, Inter, sans-serif', color: '#8a918a', size: 11 },
        xaxis: {
            type: 'date',
            gridcolor: 'rgba(148,163,184,0.06)',
            zerolinecolor: 'rgba(148,163,184,0.06)',
            color: '#4a524a',
            showspikes: true,
            spikemode: 'across',
            spikecolor: 'rgba(148,163,184,0.25)',
            spikethickness: 1,
            spikedash: 'dot',
            rangeslider: { visible: false },
        },
        yaxis: {
            gridcolor: 'rgba(148,163,184,0.08)',
            zerolinecolor: 'rgba(148,163,184,0.06)',
            color: '#4a524a',
            tickformat: ',.2f',
            showspikes: true,
            spikemode: 'across',
            spikecolor: 'rgba(148,163,184,0.25)',
            spikethickness: 1,
            spikedash: 'dot',
            side: 'right',
            domain: [0.18, 1],
        },
        yaxis2: {
            gridcolor: 'rgba(148,163,184,0.04)',
            zerolinecolor: 'transparent',
            color: '#4a524a',
            domain: [0, 0.14],
            showticklabels: false,
        },
        shapes: shapes as any,
        showlegend: false,
        hovermode: 'x unified',
        hoverlabel: {
            bgcolor: 'rgba(8,14,24,0.95)',
            bordercolor: 'rgba(148,163,184,0.25)',
            font: { color: '#e2e8f0', size: 11 },
        },
    };

    return (
        <div className={cn(
            'rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl overflow-hidden',
            'shadow-[0_18px_60px_rgba(0,0,0,0.35)]',
            className,
        )}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
                <div>
                    <h3 className="text-sm font-medium text-white">Price Action</h3>
                    <span className="text-[10px] text-neutral-500">OHLC + Signals + ATR Envelope</span>
                </div>
                <div className="flex items-center gap-3">
                    {midPrice != null && (
                        <span className="text-lg font-mono font-semibold text-white">
                            ${midPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    )}
                    <div className="flex gap-1.5">
                        {[
                            { label: 'Candles', color: 'bg-cyan-400' },
                            { label: 'Signals', color: 'bg-[#00FF88]' },
                            { label: 'ATR', color: 'bg-neutral-400' },
                        ].map(l => (
                            <span key={l.label} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-white/[0.08] bg-white/[0.03] text-[9px] text-neutral-400 uppercase tracking-wider">
                                <span className={cn('h-1.5 w-1.5 rounded-full', l.color)} />
                                {l.label}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
            <div className="px-2">
                <Suspense fallback={
                    <div className="h-[420px] flex items-center justify-center text-neutral-600 text-sm animate-pulse">
                        Loading chart...
                    </div>
                }>
                    <Plot
                        data={data}
                        layout={layout}
                        config={{ responsive: true, displayModeBar: false }}
                        useResizeHandler
                        style={{ width: '100%', height: 420 }}
                    />
                </Suspense>
            </div>
        </div>
    );
}
