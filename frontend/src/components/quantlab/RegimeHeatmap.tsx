/**
 * RegimeHeatmap.tsx
 *
 * QUANT LAB V3 - Phase 4: Regime-Conditional Analysis
 *
 * Displays E[outcome] heatmaps by regime cross-sections.
 * Shows where edge lives (tight spread + low vol) and where it disappears.
 *
 * Reference: QUANT_LAB_V3_RESEARCH_ENGINE_SPEC.md Section D
 */

import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Grid, RefreshCw } from 'lucide-react';
import { usePortfolioEpoch } from '../../lib/usePortfolioEpoch';
import { useQuantLabScope } from '../../lib/SelectionContext';
import {
    Scope,
    QuantMetaStandard,
    getQuantRegimeHeatmap,
    getQuantRegimeSlices,
} from '../../lib/quantApi';

interface RegimeHeatmapData {
    x_dimension: string;
    y_dimension: string;
    x_bins: string[];
    y_bins: string[];
    metric: string;
    values: number[][];
    counts: number[][];
    meta?: QuantMetaStandard;
}

interface RegimeSlice {
    value: string;
    count: number;
    mean_outcome: number;
    median_outcome: number;
    win_rate: number;
    ci_95: [number, number];
}

interface RegimeSlicesData {
    dimension: string;
    slices: RegimeSlice[];
    meta?: QuantMetaStandard;
}

const DIMENSION_OPTIONS = [
    { value: 'spread_regime', label: 'Spread Regime' },
    { value: 'vol_regime', label: 'Vol Regime' },
    { value: 'session', label: 'Session' },
];

const METRIC_OPTIONS = [
    { value: 'mean_outcome', label: 'Mean Outcome' },
    { value: 'win_rate', label: 'Win Rate' },
    { value: 'count', label: 'Sample Count' },
];

export const RegimeHeatmap: React.FC = () => {
    const [heatmap, setHeatmap] = useState<RegimeHeatmapData | null>(null);
    const [slices, setSlices] = useState<RegimeSlicesData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const quantScope = useQuantLabScope();
    const { scope, runId, strategyId, scopeLabel, missingRunId } = quantScope;
    const { epoch: portfolioEpoch, refresh: refreshEpoch } = usePortfolioEpoch();
    const requestSeq = useRef(0);

    // Controls
    const [xDimension, setXDimension] = useState('spread_regime');
    const [yDimension, setYDimension] = useState('vol_regime');
    const [metric, setMetric] = useState('mean_outcome');
    const [sliceDimension, setSliceDimension] = useState('session');

    useEffect(() => {
        fetchData();
    }, [
        xDimension,
        yDimension,
        metric,
        sliceDimension,
        scope,
        runId,
        strategyId,
        portfolioEpoch,
        missingRunId,
    ]);

    const fetchData = async () => {
        const requestId = ++requestSeq.current;
        if (missingRunId) {
            setError("Selectionne un run pour afficher le regime RUN.");
            setHeatmap(null);
            setSlices(null);
            setLoading(false);
            return;
        }
        try {
            setLoading(true);
            setError(null);

            const [heatmapRes, slicesRes] = await Promise.all([
                getQuantRegimeHeatmap({
                    scope,
                    runId,
                    strategyId: strategyId ?? undefined,
                    portfolioEpoch: portfolioEpoch ?? undefined,
                    x_dimension: xDimension,
                    y_dimension: yDimension,
                    metric,
                }),
                getQuantRegimeSlices({
                    scope,
                    runId,
                    strategyId: strategyId ?? undefined,
                    portfolioEpoch: portfolioEpoch ?? undefined,
                    dimension: sliceDimension,
                }),
            ]);

            if (requestId !== requestSeq.current) return;
            setHeatmap(heatmapRes as unknown as RegimeHeatmapData);
            setSlices(slicesRes as unknown as RegimeSlicesData);
        } catch (err) {
            if (requestId !== requestSeq.current) return;
            setError(err instanceof Error ? err.message : 'Failed to load regime data');
        } finally {
            if (requestId !== requestSeq.current) return;
            setLoading(false);
        }
    };

    const formatValue = (value: number): string => {
        if (metric === 'win_rate') return `${(value * 100).toFixed(1)}%`;
        if (metric === 'count') return value.toFixed(0);
        return value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2);
    };

    const getHeatmapColor = (value: number, metric: string): string => {
        if (metric === 'count') {
            // Blue scale for counts
            const intensity = Math.min(value / 100, 1);
            return `rgba(59, 130, 246, ${0.2 + intensity * 0.8})`;
        }
        if (metric === 'win_rate') {
            // Green/Red scale for win rate around 0.5
            if (value >= 0.5) {
                const intensity = (value - 0.5) * 2;
                return `rgba(16, 185, 129, ${0.2 + intensity * 0.8})`;
            } else {
                const intensity = (0.5 - value) * 2;
                return `rgba(239, 68, 68, ${0.2 + intensity * 0.8})`;
            }
        }
        // Green/Red scale for mean outcome around 0
        if (value >= 0) {
            const intensity = Math.min(value / 2, 1);
            return `rgba(16, 185, 129, ${0.2 + intensity * 0.8})`;
        } else {
            const intensity = Math.min(Math.abs(value) / 2, 1);
            return `rgba(239, 68, 68, ${0.2 + intensity * 0.8})`;
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-neutral-400">Loading regime analysis...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <div className="flex items-center gap-2 text-red-400">
                    <AlertTriangle className="w-5 h-5" />
                    <span>{error}</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 p-6">
            {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-neutral-100">Regime Analysis</h2>
                        <p className="text-sm text-neutral-400 mt-1">
                            E[outcome] by regime cross-section: Where does edge live?
                        </p>
                        <p className="text-xs text-neutral-500 mt-1">
                            Scope: {scopeLabel}
                        </p>
                    </div>
                    {heatmap?.meta?.data_source && (
                        <span className={`px-2 py-1 rounded text-xs ${heatmap.meta.data_source === "LEGACY" ? "bg-amber-600/30 text-amber-100" : "bg-emerald-600/30 text-emerald-100"}`}>
                            {heatmap.meta.data_source}
                        </span>
                    )}
                    <button
                        onClick={() => {
                            refreshEpoch();
                            fetchData();
                        }}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>
            </div>

            {/* Controls */}
            <div className="bg-neutral-800/30 border border-neutral-700/50 rounded-lg p-4">
                <div className="grid grid-cols-4 gap-4">
                    <div>
                        <label className="block text-xs text-neutral-400 uppercase mb-1">X Dimension</label>
                        <select
                            value={xDimension}
                            onChange={(e) => setXDimension(e.target.value)}
                            className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded text-neutral-200 text-sm"
                        >
                            {DIMENSION_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-neutral-400 uppercase mb-1">Y Dimension</label>
                        <select
                            value={yDimension}
                            onChange={(e) => setYDimension(e.target.value)}
                            className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded text-neutral-200 text-sm"
                        >
                            {DIMENSION_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-neutral-400 uppercase mb-1">Metric</label>
                        <select
                            value={metric}
                            onChange={(e) => setMetric(e.target.value)}
                            className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded text-neutral-200 text-sm"
                        >
                            {METRIC_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs text-neutral-400 uppercase mb-1">Slice Dimension</label>
                        <select
                            value={sliceDimension}
                            onChange={(e) => setSliceDimension(e.target.value)}
                            className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded text-neutral-200 text-sm"
                        >
                            {DIMENSION_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Heatmap */}
            {heatmap && heatmap.x_bins && heatmap.y_bins && heatmap.x_bins.length > 0 && heatmap.y_bins.length > 0 && (
                <div className="bg-neutral-800/30 border border-neutral-700/50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-4">
                        <Grid className="w-5 h-5 text-blue-400" />
                        <h3 className="text-lg font-semibold text-neutral-100">
                            {DIMENSION_OPTIONS.find(d => d.value === xDimension)?.label} × {DIMENSION_OPTIONS.find(d => d.value === yDimension)?.label}
                        </h3>
                    </div>

                    {/* Heatmap Grid */}
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr>
                                    <th className="p-2 text-xs text-neutral-400 text-left"></th>
                                    {heatmap.x_bins.map((xBin) => (
                                        <th key={xBin} className="p-2 text-xs text-neutral-400 text-center">
                                            {xBin}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {heatmap.y_bins.map((yBin, yIdx) => (
                                    <tr key={yBin}>
                                        <td className="p-2 text-xs text-neutral-400 text-right font-medium">
                                            {yBin}
                                        </td>
                                        {heatmap.x_bins.map((_, xIdx) => {
                                            const value = heatmap.values[yIdx]?.[xIdx] ?? 0;
                                            const count = heatmap.counts[yIdx]?.[xIdx] ?? 0;
                                            return (
                                                <td
                                                    key={xIdx}
                                                    className="p-2 text-center border border-neutral-700/30"
                                                    style={{ backgroundColor: getHeatmapColor(value, metric) }}
                                                >
                                                    <div className="text-sm font-semibold text-white">
                                                        {formatValue(value)}
                                                    </div>
                                                    <div className="text-xs text-white/60">
                                                        n={count}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Legend */}
                    <div className="mt-4 flex items-center justify-center gap-4 text-xs text-neutral-400">
                        <div className="flex items-center gap-1">
                            <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(239, 68, 68, 0.6)' }} />
                            <span>Negative edge</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgba(16, 185, 129, 0.6)' }} />
                            <span>Positive edge</span>
                        </div>
                    </div>
                </div>
            )}

            {/* 1D Slices */}
            {slices && slices.slices.length > 0 && (
                <div className="bg-neutral-800/30 border border-neutral-700/50 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-neutral-100 mb-4">
                        Edge by {DIMENSION_OPTIONS.find(d => d.value === sliceDimension)?.label}
                    </h3>
                    <div className="space-y-2">
                        {slices.slices.map((slice) => (
                            <div
                                key={slice.value}
                                className="flex items-center justify-between p-3 bg-neutral-800/50 rounded-lg"
                            >
                                <div className="flex items-center gap-4">
                                    <span className="text-neutral-100 font-medium w-24">{slice.value}</span>
                                    <span className="text-neutral-400 text-sm">n={slice.count}</span>
                                </div>
                                <div className="flex items-center gap-6 text-sm">
                                    <div>
                                        <span className="text-neutral-400">Mean: </span>
                                        <span className={slice.mean_outcome >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                            {slice.mean_outcome >= 0 ? '+' : ''}{slice.mean_outcome.toFixed(2)} pips
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-neutral-400">Win: </span>
                                        <span className={slice.win_rate >= 0.5 ? 'text-emerald-400' : 'text-red-400'}>
                                            {(slice.win_rate * 100).toFixed(1)}%
                                        </span>
                                    </div>
                                    <div className="text-neutral-500">
                                        CI: [{slice.ci_95[0].toFixed(2)}, {slice.ci_95[1].toFixed(2)}]
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* No Data */}
            {(!heatmap || !heatmap.x_bins || heatmap.x_bins.length === 0) && (!slices || !slices.slices || slices.slices.length === 0) && (
                <div className="bg-neutral-800/30 border border-neutral-700/50 rounded-lg p-8 text-center">
                    <Grid className="w-12 h-12 text-neutral-500 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-neutral-300 mb-2">No Regime Data</h3>
                    <p className="text-neutral-400">
                        No signals with regime data found. Run some trading sessions to populate the data.
                    </p>
                </div>
            )}
        </div>
    );
};

export default RegimeHeatmap;
