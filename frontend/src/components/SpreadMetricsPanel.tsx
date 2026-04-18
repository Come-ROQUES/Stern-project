import type { SpreadMetric } from "../lib/api";
import { Card } from "./ui";
import { Sparkline } from "./Sparkline";

type Props = {
  metrics: Record<string, SpreadMetric>;
  history: Record<string, number[]>;
};

const SIZES = ["0.1 BTC", "1 BTC", "5 BTC", "10 BTC"] as const;

export function SpreadMetricsPanel({ metrics, history }: Props) {
  return (
    <Card
      title="Depth-weighted spread"
      subtitle="$ spread per BTC across executable sizes (avg / median / min / max)"
      className="h-full"
    >
      <div className="grid grid-cols-[68px_1fr_1fr_1fr_1fr_1fr_120px] mono num text-[11px] uppercase tracking-wider text-neutral-500 border-b border-white/5 pb-1">
        <span>Size</span>
        <span className="text-right">Last</span>
        <span className="text-right">Avg</span>
        <span className="text-right">Median</span>
        <span className="text-right">Min</span>
        <span className="text-right">Max</span>
        <span className="text-right">Trend</span>
      </div>
      <ul className="divide-y divide-white/5 mono num text-sm">
        {SIZES.map((size) => {
          const m = metrics[size];
          const series = history[size] ?? [];
          return (
            <li key={size} className="grid grid-cols-[68px_1fr_1fr_1fr_1fr_1fr_120px] items-center py-2">
              <span className="text-neutral-300">{size}</span>
              <Cell value={m?.last} highlight />
              <Cell value={m?.avg} />
              <Cell value={m?.median} />
              <Cell value={m?.min} muted />
              <Cell value={m?.max} muted />
              <div className="flex justify-end">
                <Sparkline
                  values={series}
                  width={120}
                  height={28}
                  baseline={m?.avg ?? null}
                  stroke="#2ce3ff"
                  fill="rgba(44,227,255,0.10)"
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] text-neutral-500">
        Spread = (cost-to-buy ÷ size) − (proceeds-to-sell ÷ size). Lower = tighter book at that depth.
      </p>
    </Card>
  );
}

function Cell({
  value,
  highlight = false,
  muted = false,
}: {
  value: number | null | undefined;
  highlight?: boolean;
  muted?: boolean;
}) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="text-right text-neutral-600">—</span>;
  }
  return (
    <span
      className={`text-right ${
        highlight ? "text-cyan-200" : muted ? "text-neutral-500" : "text-neutral-200"
      }`}
    >
      ${value.toFixed(2)}
    </span>
  );
}
