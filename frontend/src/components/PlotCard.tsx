import { Suspense, lazy } from "react";
import type { Data, Layout } from "plotly.js";

import { GlassPanel } from "./GlassPanel";

const Plot = lazy(() => import("react-plotly.js"));

type PlotCardProps = {
  title: string;
  data: Data[];
  layout?: Partial<Layout>;
  className?: string;
};

const baseLayout: Partial<Layout> = {
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(0,0,0,0)",
  margin: { l: 36, r: 16, t: 18, b: 32 },
  font: {
    family: "IBM Plex Sans, Inter, sans-serif",
    color: "#8a918a",
    size: 11,
  },
  xaxis: {
    color: "#4a524a",
    gridcolor: "rgba(255,255,255,0.04)",
    zerolinecolor: "rgba(255,255,255,0.04)",
  },
  yaxis: {
    color: "#4a524a",
    gridcolor: "rgba(255,255,255,0.04)",
    zerolinecolor: "rgba(255,255,255,0.04)",
  },
  legend: {
    font: {
      color: "#8a918a",
      size: 11,
    },
  },
};

export function PlotCard({
  title,
  data,
  layout,
  className = "",
}: PlotCardProps) {
  return (
    <GlassPanel title={title} className={`plot-card ${className}`.trim()}>
      <div className="plot-shell">
        <Suspense fallback={<div className="plot-loading">Loading chart...</div>}>
          <Plot
            className="plot"
            data={data}
            layout={{ ...baseLayout, ...layout }}
            config={{
              responsive: true,
              displayModeBar: false,
            }}
            useResizeHandler
          />
        </Suspense>
      </div>
    </GlassPanel>
  );
}
