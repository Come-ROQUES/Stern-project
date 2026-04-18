import React, { useEffect, useMemo, useRef, useState } from "react";

import { loadPlotlyRuntime } from "../../lib/plotlyRuntime";

type PlotlyChartProps = {
  data: any[];
  layout?: any;
  config?: any;
  className?: string;
  style?: React.CSSProperties;
  onRelayout?: (event: any) => void;
  onReady?: (el: HTMLDivElement, Plotly: any) => void;
  onSelected?: (selection: PlotlySelection) => void;
  onDeselect?: () => void;
  useTemplate?: boolean;
};

export type PlotlySelection = {
  xRange?: [number, number];
  yRange?: [number, number];
  points?: { x: number | null; y: number | null; customdata?: any }[];
};

const BASE_LAYOUT = {
  paper_bgcolor: "#ffffff",
  plot_bgcolor: "#ffffff",
  font: { family: "Inter, system-ui, -apple-system, sans-serif", color: "#0f172a", size: 12 },
  margin: { l: 60, r: 28, t: 40, b: 48 },
  hovermode: "closest",
  hoverlabel: { bgcolor: "#0f172a", font: { color: "#ffffff", size: 11 } },
  xaxis: {
    color: "#0f172a",
    gridcolor: "#e2e8f0",
    zerolinecolor: "#cbd5e1",
    linecolor: "#cbd5e1",
    ticks: "outside",
    tickcolor: "#cbd5e1",
  },
  yaxis: {
    color: "#0f172a",
    gridcolor: "#e2e8f0",
    zerolinecolor: "#cbd5e1",
    linecolor: "#cbd5e1",
    ticks: "outside",
    tickcolor: "#cbd5e1",
  },
  legend: {
    orientation: "h" as const,
    x: 0,
    y: 1.08,
    font: { size: 11, color: "#0f172a" },
  },
  scene: {
    bgcolor: "#ffffff",
    xaxis: { backgroundcolor: "#ffffff", gridcolor: "#e2e8f0", zerolinecolor: "#cbd5e1", showspikes: false },
    yaxis: { backgroundcolor: "#ffffff", gridcolor: "#e2e8f0", zerolinecolor: "#cbd5e1", showspikes: false },
    zaxis: { backgroundcolor: "#ffffff", gridcolor: "#e2e8f0", zerolinecolor: "#cbd5e1", showspikes: false },
    camera: { eye: { x: 1.6, y: -1.6, z: 0.9 } },
    dragmode: "orbit" as const,
  },
};

function mergeLayout(base: any, custom?: any) {
  if (!custom) return base;
  const scene = custom.scene
    ? {
      ...base.scene,
      ...custom.scene,
      xaxis: { ...base.scene?.xaxis, ...custom.scene?.xaxis },
      yaxis: { ...base.scene?.yaxis, ...custom.scene?.yaxis },
      zaxis: { ...base.scene?.zaxis, ...custom.scene?.zaxis },
    }
    : base.scene;
  return {
    ...base,
    ...custom,
    margin: { ...base.margin, ...custom.margin },
    hoverlabel: { ...base.hoverlabel, ...custom.hoverlabel },
    legend: { ...base.legend, ...custom.legend },
    xaxis: { ...base.xaxis, ...custom.xaxis },
    yaxis: { ...base.yaxis, ...custom.yaxis },
    scene,
  };
}

const BASE_CONFIG = {
  displaylogo: false,
  responsive: true,
  scrollZoom: true,
  doubleClick: "reset",
  displayModeBar: false,
  modeBarButtonsToAdd: ["select2d", "lasso2d"],
};

export function PlotlyChart({
  data,
  layout,
  config,
  className,
  style,
  onRelayout,
  onReady,
  onSelected,
  onDeselect,
  useTemplate = true,
}: PlotlyChartProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const plotlyRef = useRef<any>(null);
  const initializedRef = useRef(false);
  const onRelayoutRef = useRef(onRelayout);
  const onSelectedRef = useRef(onSelected);
  const onDeselectRef = useRef(onDeselect);

  onRelayoutRef.current = onRelayout;
  onSelectedRef.current = onSelected;
  onDeselectRef.current = onDeselect;

  const mergedLayout = useMemo(
    () => (useTemplate ? mergeLayout(BASE_LAYOUT, layout) : layout),
    [layout, useTemplate],
  );
  const mergedConfig = useMemo(
    () => ({ ...BASE_CONFIG, ...(config || {}) }),
    [config],
  );

  const handleSelection = (event: any) => {
    const selectedCb = onSelectedRef.current;
    if (!selectedCb) return;
    const xRange = event?.range?.x as [number, number] | undefined;
    const yRange = event?.range?.y as [number, number] | undefined;
    const points =
      event?.points?.map((p: any) => ({
        x: typeof p.x === "number" ? p.x : Number(p.x) || null,
        y: typeof p.y === "number" ? p.y : Number(p.y) || null,
        customdata: p.customdata,
      })) || [];
    selectedCb({ xRange, yRange, points });
  };

  useEffect(() => {
    let mounted = true;
    loadPlotlyRuntime()
      .then((Plotly) => {
        if (!mounted || !ref.current) return;
        plotlyRef.current = Plotly;
        if (initializedRef.current) {
          setReady(true);
          return;
        }
        initializedRef.current = true;
        setReady(true);
        Plotly.react(ref.current, data, mergedLayout, mergedConfig);
        if (onReady && ref.current) {
          onReady(ref.current, Plotly);
        }
        const el = ref.current as any;
        if (el && typeof el.on === "function") {
          el.on("plotly_relayout", (event: any) => {
            onRelayoutRef.current?.(event);
          });
          el.on("plotly_selected", handleSelection);
          el.on("plotly_deselect", () => {
            onDeselectRef.current?.();
          });
        }
      })
      .catch(() => setReady(false));
    return () => {
      mounted = false;
    };
  }, [onReady]);

  useEffect(() => {
    if (!ready || !ref.current || !plotlyRef.current) return;
    let rafId = 0;
    rafId = window.requestAnimationFrame(() => {
      plotlyRef.current.react(ref.current, data, mergedLayout, mergedConfig);
    });
    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [ready, data, mergedLayout, mergedConfig]);

  useEffect(() => {
    return () => {
      const el = ref.current as any;
      if (el && typeof el.removeAllListeners === "function") {
        el.removeAllListeners("plotly_relayout");
        el.removeAllListeners("plotly_selected");
        el.removeAllListeners("plotly_deselect");
      }
      if (ref.current && window.Plotly?.purge) {
        window.Plotly.purge(ref.current);
      }
      initializedRef.current = false;
      plotlyRef.current = null;
    };
  }, []);

  return (
    <div ref={ref} className={className} style={style}>
      {!ready && (
        <div className="text-xs text-neutral-500">Loading Plotly…</div>
      )}
    </div>
  );
}
