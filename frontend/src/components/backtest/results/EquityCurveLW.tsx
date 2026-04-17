/**
 * EquityCurveLW.tsx - Professional equity curve using LightweightCharts
 *
 * Area series with IS/OOS boundary support and walk-forward fold markers.
 * Dark glass theme, transparent background (parent GlassCard owns backdrop).
 */

import React, { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  LineStyle,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts';
import { cn } from '../../../lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EquityCurveLWProps {
  /** Cumulative PnL data points */
  data: { time: string; value: number }[];
  /** Optional IS/OOS boundary timestamp */
  isBoundary?: string | null;
  /** Optional fold boundaries for walk-forward mode */
  foldBoundaries?: { time: string; label: string }[];
  /** Height in pixels. Default: 300 */
  height?: number;
  /** CSS class name */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_HEIGHT = 300;

const CHART_OPTIONS = {
  layout: {
    background: { type: ColorType.Solid, color: 'transparent' },
    textColor: '#737373',
  },
  grid: {
    vertLines: { color: 'rgba(255,255,255,0.04)' },
    horzLines: { color: 'rgba(255,255,255,0.04)' },
  },
  crosshair: {
    mode: CrosshairMode.Normal,
    vertLine: { color: 'rgba(255,255,255,0.15)', style: LineStyle.Dashed, width: 1 as const },
    horzLine: { color: 'rgba(255,255,255,0.15)', style: LineStyle.Dashed, width: 1 as const },
  },
  timeScale: {
    timeVisible: true,
    secondsVisible: false,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  rightPriceScale: {
    borderColor: 'rgba(255,255,255,0.08)',
  },
  handleScroll: true,
  handleScale: true,
  autoSize: true,
} as const;

const AREA_SERIES_OPTIONS = {
  lineColor: '#22d3ee',
  topColor: 'rgba(34, 211, 238, 0.15)',
  bottomColor: 'rgba(34, 211, 238, 0.02)',
  lineWidth: 2 as const,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const EquityCurveLW: React.FC<EquityCurveLWProps> = ({
  data,
  isBoundary,
  foldBoundaries,
  height = DEFAULT_HEIGHT,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  // -----------------------------------------------------------------------
  // Chart lifecycle: create on mount, destroy on unmount
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      ...CHART_OPTIONS,
      height,
    });

    const series = chart.addAreaSeries(AREA_SERIES_OPTIONS);

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
    // Height is intentionally excluded -- we resize via applyOptions below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------------------------------------------------
  // Resize when height prop changes
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.applyOptions({ height });
  }, [height]);

  // -----------------------------------------------------------------------
  // Data update (without recreating the chart)
  // -----------------------------------------------------------------------
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    if (!data || data.length === 0) {
      series.setData([]);
      return;
    }

    // LightweightCharts expects Time -- string dates are accepted as-is.
    series.setData(
      data.map((d) => ({ time: d.time as Time, value: d.value })),
    );

    // ----- IS/OOS boundary marker -----
    // We use series markers for vertical event lines.
    const markers: {
      time: Time;
      position: 'aboveBar' | 'belowBar';
      shape: 'arrowDown' | 'arrowUp' | 'circle' | 'square';
      color: string;
      text: string;
    }[] = [];

    if (isBoundary) {
      markers.push({
        time: isBoundary as Time,
        position: 'aboveBar',
        shape: 'circle',
        color: '#f59e0b',
        text: 'IS|OOS',
      });
    }

    if (foldBoundaries && foldBoundaries.length > 0) {
      for (const fb of foldBoundaries) {
        markers.push({
          time: fb.time as Time,
          position: 'aboveBar',
          shape: 'square',
          color: 'rgba(139, 92, 246, 0.8)',
          text: fb.label,
        });
      }
    }

    // Sort markers chronologically (LW requirement)
    markers.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    series.setMarkers(markers);

    // Auto-fit content
    chart.timeScale().fitContent();
  }, [data, isBoundary, foldBoundaries]);

  // -----------------------------------------------------------------------
  // Empty state
  // -----------------------------------------------------------------------
  if (!data || data.length === 0) {
    return (
      <div
        className={cn('relative flex items-center justify-center', className)}
        style={{ height }}
      >
        <span className="text-sm text-neutral-500">No equity data</span>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div
      ref={containerRef}
      className={cn('relative', className)}
      style={{ height }}
    />
  );
};

export default React.memo(EquityCurveLW);
