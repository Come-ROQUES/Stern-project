import React, { useEffect, useMemo, useRef, useState } from "react";

import { loadApexChartsRuntime } from "./apexchartsRuntime";

type ApexChartProps = {
  type: string;
  series: any[];
  options?: Record<string, any>;
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: React.CSSProperties;
};

export function ApexChart({
  type,
  series,
  options,
  height,
  width,
  className,
  style,
}: ApexChartProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const mergedOptions = useMemo(
    () => ({
      ...(options || {}),
      chart: {
        ...(options?.chart || {}),
        type,
        ...(height != null ? { height } : {}),
        ...(width != null ? { width } : {}),
      },
    }),
    [height, options, type, width]
  );

  useEffect(() => {
    let mounted = true;

    loadApexChartsRuntime()
      .then((ApexCharts) => {
        if (!mounted || !ref.current) return;
        const chart = new ApexCharts(ref.current, {
          ...mergedOptions,
          series,
        });
        chartRef.current = chart;
        return chart.render();
      })
      .then(() => {
        if (!mounted) return;
        setReady(true);
        setLoadError(null);
      })
      .catch(() => {
        if (!mounted) return;
        setReady(false);
        setLoadError("Chart runtime unavailable");
      });

    return () => {
      mounted = false;
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!ready || !chartRef.current) return;
    chartRef.current.updateOptions(mergedOptions, false, true, false);
    chartRef.current.updateSeries(series, true);
  }, [mergedOptions, ready, series]);

  const resolvedStyle = useMemo<React.CSSProperties>(
    () => ({
      width: width ?? "100%",
      height: height ?? "100%",
      ...style,
    }),
    [height, style, width]
  );

  return (
    <div className={className} style={resolvedStyle}>
      <div ref={ref} style={{ width: "100%", height: "100%" }} />
      {!ready && (
        <div className="text-xs text-neutral-500">
          {loadError ?? "Loading chart…"}
        </div>
      )}
    </div>
  );
}
