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

function buildOhlcFromMid(history: HistoryPoint[]): OhlcBar[] {
    if (history.length < 6) return [];

    // Time-based aggregation: parse timestamps and bucket into ~30-50 bars
    const points = history.map(p => ({
        ts: new Date(p.ts).getTime(),
        price: p.mid_price,
        raw: p.ts,
    }));

    const timeSpan = points[points.length - 1].ts - points[0].ts;
    // Target 30-50 bars
    const targetBars = Math.min(50, Math.max(20, Math.ceil(history.length / 8)));
    const bucketMs = Math.max(1000, Math.floor(timeSpan / targetBars));

    const bars: OhlcBar[] = [];
    let bucketStart = points[0].ts;
    let chunk: typeof points = [];

    for (const pt of points) {
        if (pt.ts >= bucketStart + bucketMs && chunk.length > 0) {
            // Close current bar
            const prices = chunk.map(c => c.price);
            // Add synthetic noise so bars aren't flat
            const open = prices[0];
            const close = prices[prices.length - 1];
            const high = Math.max(...prices);
            const low = Math.min(...prices);
            // Only add bar if it has real price movement or we need it for continuity
            bars.push({
                ts: new Date(chunk[0].ts).toISOString(),
                open,
                high: high === low ? high * 1.00002 : high,
                low: low === high ? low * 0.99998 : low,
                close,
                volume: chunk.length,
            });
            chunk = [];
            bucketStart = pt.ts;
        }
        chunk.push(pt);
    }

    // Final bar
    if (chunk.length > 0) {
        const prices = chunk.map(c => c.price);
        const high = Math.max(...prices);
        const low = Math.min(...prices);
        bars.push({
            ts: new Date(chunk[0].ts).toISOString(),
            open: prices[0],
            high: high === low ? high * 1.00002 : high,
            low: low === high ? low * 0.99998 : low,
            close: prices[prices.length - 1],
            volume: chunk.length,
        });
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

    const { data, shapes, priceRange } = useMemo(() => {
        if (bars.length === 0) return { data: [] as Data[], shapes: [] as Partial<Shape>[], priceRange: null };

        const timestamps = bars.map(b => b.ts);
        const allPrices = bars.flatMap(b => [b.high, b.low]);
        const minPrice = Math.min(...allPrices);
        const maxPrice = Math.max(...allPrices);
        const pad = (maxPrice - minPrice) * 0.08 || maxPrice * 0.001;

        // Candlestick trace
        const candle: Data = {
            x: timestamps,
            open: bars.map(b => b.open),
            high: bars.map(b => b.high),
            low: bars.map(b => b.low),
            close: bars.map(b => b.close),
            type: 'candlestick',
            increasing: { line: { color: '#00E0FF', width: 1.5 } },
            decreasing: { line: { color: '#FF4D4D', width: 1.5 } },
            hovertemplate: 'O: %{open:.2f}<br>H: %{high:.2f}<br>L: %{low:.2f}<br>C: %{close:.2f}<extra></extra>',
            name: 'Price',
            showlegend: false,
        };

        // Volume bars
        const volColors = bars.map(b => b.close >= b.open ? 'rgba(0,224,255,0.3)' : 'rgba(255,77,77,0.3)');
        const vol: Data = {
            x: timestamps,
            y: bars.map(b => b.volume),
            type: 'bar',
            marker: { color: volColors },
            yaxis: 'y2',
            hovertemplate: 'Ticks: %{y}<extra></extra>',
            name: 'Volume',
            showlegend: false,
        };

        // ATR envelope
        const window = Math.min(8, Math.floor(bars.length / 3));
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
            upperBand.push(bars[i].close + avgRange * 1.8);
            lowerBand.push(bars[i].close - avgRange * 1.8);
        }

        const upper: Data = {
            x: timestamps, y: upperBand,
            type: 'scatter', mode: 'lines',
            line: { color: 'rgba(0,255,136,0.2)', width: 1, dash: 'dot' },
            hoverinfo: 'skip', showlegend: false, name: 'ATR+',
        };

        const lower: Data = {
            x: timestamps, y: lowerBand,
            type: 'scatter', mode: 'lines',
            line: { color: 'rgba(0,255,136,0.2)', width: 1, dash: 'dot' },
            fill: 'tonexty',
            fillcolor: 'rgba(0,255,136,0.02)',
            hoverinfo: 'skip', showlegend: false, name: 'ATR-',
        };

        // VWAP-like line (running average of close)
        const vwapWindow = Math.min(12, Math.floor(bars.length / 2));
        const vwap: (number | null)[] = bars.map((_, i) => {
            if (i < vwapWindow - 1) return null;
            const slice = bars.slice(i - vwapWindow + 1, i + 1);
            return slice.reduce((s, b) => s + b.close, 0) / slice.length;
        });
        const vwapTrace: Data = {
            x: timestamps, y: vwap,
            type: 'scatter', mode: 'lines',
            line: { color: 'rgba(234,179,8,0.5)', width: 1.5 },
            hovertemplate: 'MA: $%{y:.2f}<extra></extra>',
            showlegend: false, name: 'MA',
        };

        // Fill markers
        const fillTrace: Data | null = fills.length > 0 ? {
            x: fills.map(f => f.ts),
            y: fills.map(f => f.price),
            type: 'scattergl', mode: 'markers',
            marker: {
                size: fills.map(() => 12),
                symbol: fills.map(f => f.side === 'buy' ? 'triangle-up' : 'triangle-down'),
                color: fills.map(f => f.side === 'buy' ? '#00FF88' : '#FF4D4D'),
                line: { color: '#0b1220', width: 1.5 },
            },
            customdata: fills.map(f => [f.side, f.reason, f.size]),
            hovertemplate: '%{customdata[0]} | %{customdata[1]}<br>$%{y:.2f} x %{customdata[2]:.4f}<extra>Signal</extra>',
            showlegend: false, name: 'Fills',
        } : null;

        // Trade dots (small, semi-transparent)
        const last15 = recentTrades.slice(0, 15);
        const tradeTrace: Data | null = last15.length > 0 ? {
            x: last15.map(t => t.ts),
            y: last15.map(t => t.price),
            type: 'scattergl', mode: 'markers',
            marker: {
                size: 4,
                color: last15.map(t => t.side === 'buy' ? 'rgba(0,255,136,0.45)' : 'rgba(255,77,77,0.45)'),
                symbol: 'circle',
            },
            hovertemplate: '%{y:.2f}<extra>Trade</extra>',
            showlegend: false, name: 'Trades',
        } : null;

        // Bid/ask dashed lines
        const shps: Partial<Shape>[] = [];
        if (bestBid != null) {
            shps.push({
                type: 'line', xref: 'paper', x0: 0, x1: 1,
                y0: bestBid, y1: bestBid,
                line: { color: 'rgba(0,255,136,0.35)', width: 1, dash: 'dash' },
            });
        }
        if (bestAsk != null) {
            shps.push({
                type: 'line', xref: 'paper', x0: 0, x1: 1,
                y0: bestAsk, y1: bestAsk,
                line: { color: 'rgba(255,77,77,0.35)', width: 1, dash: 'dash' },
            });
        }

        const traces: Data[] = [candle, upper, lower, vwapTrace, vol, fillTrace, tradeTrace].filter(Boolean) as Data[];

        return { data: traces, shapes: shps, priceRange: { min: minPrice - pad, max: maxPrice + pad } };
    }, [bars, fills, recentTrades, bestBid, bestAsk]);

    if (bars.length === 0) {
        return (
            <div className={cn(
                'rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl p-6',
                className
            )}>
                <div className="text-xs text-neutral-500 uppercase tracking-wider mb-4">Price Action</div>
                <div className="h-[400px] flex items-center justify-center text-neutral-600 text-sm animate-pulse">
                    Hydrating price data...
                </div>
            </div>
        );
    }

    const pctChange = bars.length >= 2
        ? ((bars[bars.length - 1].close - bars[0].open) / bars[0].open * 100)
        : 0;

    const layout: Partial<Layout> = {
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        height: 440,
        margin: { l: 0, r: 64, t: 8, b: 36 },
        font: { family: 'IBM Plex Sans, Inter, sans-serif', color: '#8a918a', size: 11 },
        xaxis: {
            type: 'date',
            gridcolor: 'rgba(148,163,184,0.05)',
            zerolinecolor: 'transparent',
            color: '#4a524a',
            showspikes: true,
            spikemode: 'across',
            spikecolor: 'rgba(44,227,255,0.2)',
            spikethickness: 1,
            spikedash: 'dot',
            rangeslider: { visible: false },
        },
        yaxis: {
            gridcolor: 'rgba(148,163,184,0.06)',
            zerolinecolor: 'transparent',
            color: '#4a524a',
            tickformat: ',.2f',
            tickprefix: '$',
            showspikes: true,
            spikemode: 'across',
            spikecolor: 'rgba(44,227,255,0.2)',
            spikethickness: 1,
            spikedash: 'dot',
            side: 'right',
            domain: [0.16, 1],
            ...(priceRange ? { range: [priceRange.min, priceRange.max] } : {}),
        },
        yaxis2: {
            gridcolor: 'transparent',
            zerolinecolor: 'transparent',
            domain: [0, 0.12],
            showticklabels: false,
        },
        shapes: shapes as any,
        annotations: midPrice != null ? [{
            x: 1, y: midPrice,
            xref: 'paper', yref: 'y',
            text: `$${midPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
            showarrow: false,
            font: { color: '#2CE3FF', size: 11, family: 'IBM Plex Mono, monospace' },
            bgcolor: 'rgba(8,14,24,0.9)',
            bordercolor: 'rgba(44,227,255,0.25)',
            borderwidth: 1,
            borderpad: 4,
            xshift: 48,
        }] : [],
        showlegend: false,
        hovermode: 'x unified',
        hoverlabel: {
            bgcolor: 'rgba(8,14,24,0.95)',
            bordercolor: 'rgba(44,227,255,0.2)',
            font: { color: '#e2e8f0', size: 11 },
        },
    };

    return (
        <div className={cn(
            'rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl overflow-hidden',
            'shadow-[0_18px_60px_rgba(0,0,0,0.22)]',
            'transition-all duration-300 hover:border-[rgba(44,227,255,0.12)]',
            'hover:shadow-[0_18px_60px_rgba(0,0,0,0.24),0_0_30px_rgba(44,227,255,0.03)]',
            className,
        )}>
            <div className="relative flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.08]" />
                <div>
                    <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-white">Price Action</h3>
                    <span className="text-[10px] text-neutral-500">OHLC + Signals + ATR + MA</span>
                </div>
                <div className="flex items-center gap-3">
                    {midPrice != null && (
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-mono font-semibold text-white">
                                ${midPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <span className={cn(
                                'text-xs font-mono font-medium px-1.5 py-0.5 rounded',
                                pctChange >= 0
                                    ? 'text-emerald-400 bg-emerald-500/10'
                                    : 'text-red-400 bg-red-500/10'
                            )}>
                                {pctChange >= 0 ? '+' : ''}{pctChange.toFixed(3)}%
                            </span>
                        </div>
                    )}
                    <div className="flex gap-1.5">
                        {[
                            { label: 'Candles', color: 'bg-cyan-400' },
                            { label: 'Signals', color: 'bg-[#00FF88]' },
                            { label: 'MA', color: 'bg-amber-400' },
                            { label: 'ATR', color: 'bg-neutral-500' },
                        ].map(l => (
                            <span key={l.label} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-white/[0.08] bg-white/[0.04] text-[9px] text-neutral-500 uppercase tracking-wider">
                                <span className={cn('h-1.5 w-1.5 rounded-full', l.color)} />
                                {l.label}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
            <div className="px-1">
                <Suspense fallback={
                    <div className="h-[440px] flex items-center justify-center text-neutral-600 text-sm animate-pulse">
                        Loading chart...
                    </div>
                }>
                    <Plot
                        data={data}
                        layout={layout}
                        config={{ responsive: true, displayModeBar: false }}
                        useResizeHandler
                        style={{ width: '100%', height: 440 }}
                    />
                </Suspense>
            </div>
        </div>
    );
}
