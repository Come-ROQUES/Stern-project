import { Suspense, lazy } from 'react';
import type { Data, Layout } from 'plotly.js';
import { cn } from '../lib/utils';

const Plot = lazy(() => import('react-plotly.js'));

type PlotCardProps = {
    title: string;
    subtitle?: string;
    data: Data[];
    layout?: Partial<Layout>;
    height?: number;
    className?: string;
    legend?: { label: string; color: string }[];
};

const baseLayout: Partial<Layout> = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    margin: { l: 48, r: 16, t: 12, b: 36 },
    font: {
        family: 'IBM Plex Sans, Inter, sans-serif',
        color: '#8a918a',
        size: 11,
    },
    xaxis: {
        color: '#4a524a',
        gridcolor: 'rgba(148,163,184,0.06)',
        zerolinecolor: 'rgba(148,163,184,0.06)',
        showspikes: true,
        spikemode: 'across',
        spikecolor: 'rgba(148,163,184,0.2)',
        spikethickness: 1,
        spikedash: 'dot',
    },
    yaxis: {
        color: '#4a524a',
        gridcolor: 'rgba(148,163,184,0.08)',
        zerolinecolor: 'rgba(148,163,184,0.08)',
        showspikes: true,
        spikemode: 'across',
        spikecolor: 'rgba(148,163,184,0.2)',
        spikethickness: 1,
        spikedash: 'dot',
    },
    legend: {
        font: { color: '#8a918a', size: 11 },
        bgcolor: 'transparent',
    },
    hovermode: 'x unified',
    hoverlabel: {
        bgcolor: 'rgba(8,14,24,0.95)',
        bordercolor: 'rgba(148,163,184,0.25)',
        font: { color: '#e2e8f0', size: 11 },
    },
};

export function PlotCard({
    title,
    subtitle,
    data,
    layout,
    height = 320,
    className,
    legend,
}: PlotCardProps) {
    return (
        <div className={cn(
            'rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl overflow-hidden',
            'shadow-lg shadow-black/10 transition-all duration-200 hover:border-white/[0.12]',
            className,
        )}>
            <div className="relative flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.08]" />
                <div>
                    <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-white">{title}</h3>
                    {subtitle && <span className="text-[10px] text-neutral-500 mt-0.5 block">{subtitle}</span>}
                </div>
                {legend && legend.length > 0 && (
                    <div className="flex items-center gap-2">
                        {legend.map(l => (
                            <span key={l.label} className="inline-flex items-center gap-1 text-[10px] text-neutral-400">
                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: l.color }} />
                                {l.label}
                            </span>
                        ))}
                    </div>
                )}
            </div>
            <div className="px-2">
                <Suspense fallback={
                    <div style={{ height }} className="flex items-center justify-center text-neutral-600 text-sm animate-pulse">
                        Loading chart...
                    </div>
                }>
                    <Plot
                        data={data}
                        layout={{ ...baseLayout, ...layout, height }}
                        config={{ responsive: true, displayModeBar: false }}
                        useResizeHandler
                        style={{ width: '100%', height }}
                    />
                </Suspense>
            </div>
        </div>
    );
}
