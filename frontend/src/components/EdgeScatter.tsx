import React from "react";
import { ApexChart } from "../lib/ApexChart";

export type EdgePoint = {
  x: number;
  y: number;
  spread: number;
  session: string;
  current?: boolean;
};

type Props = {
  points: EdgePoint[];
  thresholdLine: number;
  className?: string;
};

export function EdgeScatter({ points, thresholdLine, className }: Props) {
  const latest = points.length ? points[points.length - 1] : null;
  if (points.length === 0) {
    return (
      <div className={className}>
        <Header />
        <EmptyState />
      </div>
    );
  }

  return (
    <div className={className}>
      <Header />
      <ApexChart
        type="scatter"
        height={360}
        options={{
          chart: {
            animations: { enabled: false },
            toolbar: { show: false },
            background: "transparent",
          },
          colors: ["#22d3ee"],
          markers: {
            size: 6,
            strokeColors: "#0f172a",
            strokeWidth: 1.5,
            hover: { size: 9 },
          },
          grid: { borderColor: "rgba(255,255,255,0.08)", strokeDashArray: 4 },
          theme: { mode: "dark" },
          tooltip: {
            theme: "dark",
            y: { formatter: (val) => `${fmt(val)} p` },
            x: { formatter: (val) => `${fmt(val)} p` },
            custom: ({ seriesIndex, dataPointIndex, w }) => {
              const p = points[dataPointIndex];
              return `<div class="px-3 py-2 text-xs text-white bg-slate-900/90 border border-white/10 rounded-lg">
                <div>Amplitude: ${fmt(p.x)} p</div>
                <div>Net rev: ${fmt(p.y)} p</div>
                <div>Spread: ${fmt(p.spread)} p</div>
                <div>Session: ${p.session}</div>
              </div>`;
            },
          },
          xaxis: {
            title: { text: "Amplitude (pips)", style: { color: "#e2e8f0", fontWeight: 600 } },
            labels: { style: { colors: "#94a3b8" } },
          },
          yaxis: {
            title: { text: "Net reversion (pips)", style: { color: "#e2e8f0", fontWeight: 600 } },
            labels: { style: { colors: "#94a3b8" } },
            min: Math.min(-1, Math.min(...points.map((p) => p.y)) - 0.5),
            max: Math.max(1, Math.max(...points.map((p) => p.y)) + 0.5),
          },
          annotations: {
            yaxis: [
              {
                y: thresholdLine,
                borderColor: "rgba(248,113,113,0.7)",
                label: {
                  borderColor: "rgba(248,113,113,0.5)",
                  style: { color: "#fca5a5", background: "rgba(239,68,68,0.1)" },
                  text: `Fees+spread_p50 (${fmt(thresholdLine)}p)`,
                },
              },
            ],
          } as any,
        }}
        series={[
          {
            name: "signals",
            data: points.map((p) => [p.x, p.y]),
          },
          ...(latest
            ? [
              {
                name: "current",
                data: [[latest.x, latest.y]],
                color: "#fbbf24",
                markers: { size: 10, strokeWidth: 2.5, strokeColors: "#1f2937" },
              },
            ]
            : []),
        ] as any}
      />
    </div>
  );
}

function Header() {
  return (
    <div className="mb-2 flex items-center justify-between text-sm text-neutral-200">
      <div>
        <div className="text-xs uppercase tracking-[0.16em] text-neutral-400">Reversion vs Amplitude</div>
        <div className="text-neutral-200">Scatter (y = net reversion, x = amplitude pips)</div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-4 text-sm text-neutral-400">
      <div className="font-semibold text-white">No shocks in current scope</div>
      <div className="text-neutral-400">Wait for next session or broaden scope (YESTERDAY/DATE).</div>
    </div>
  );
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return "n/a";
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
}
