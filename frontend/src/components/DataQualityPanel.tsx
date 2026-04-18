import { useEffect, useMemo, useState } from "react";
import { formatTime } from "../lib/dateUtils";
import { api, Ohlc } from "../lib/api";

type Gap = { from: string; to: string; minutes: number };

export function DataQualityPanel() {
  const [ohlc, setOhlc] = useState<Ohlc[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getOhlc(500)
      .then((payload) => setOhlc(payload.ohlc ?? []))
      .catch((e: any) => setError(e.message || "Failed to load OHLC"));
  }, []);

  const analysis = useMemo(() => analyzeOhlc(ohlc), [ohlc]);

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-400 uppercase tracking-[0.18em]">Data Quality</div>
          <div className="text-lg font-semibold">OHLC integrity & freshness</div>
        </div>
        {error && <div className="text-xs text-danger">{error}</div>}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="Last bar age" value={analysis.lastBarAgeLabel} variant={analysis.stale ? "danger" : "success"} />
        <Stat label="Coverage" value={analysis.coverageLabel} />
        <Stat label="Gaps >90s" value={`${analysis.gaps.length}`} variant={analysis.gaps.length ? "warning" : "success"} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-neutral-100">
          <div className="text-xs text-neutral-400 mb-2">Tick density</div>
          <ul className="text-xs text-neutral-300 space-y-1">
            <li>Avg ticks/bar: {analysis.avgTicksPerBar.toFixed(1)}</li>
            <li>Zero-tick bars: {analysis.zeroTickPct.toFixed(1)}%</li>
            <li>Volume missing: {analysis.missingVolumePct.toFixed(1)}%</li>
          </ul>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-neutral-100">
          <div className="text-xs text-neutral-400 mb-2">Gaps detected</div>
          {analysis.gaps.length === 0 ? (
            <div className="text-xs text-neutral-400">No gaps detected.</div>
          ) : (
            <ul className="text-xs text-neutral-300 space-y-1 max-h-28 overflow-auto pr-1">
              {analysis.gaps.slice(0, 6).map((g, idx) => (
                <li key={idx}>
                  {g.minutes.toFixed(1)} min gap: {formatTime(g.from, "UTC")} →{" "}
                  {formatTime(g.to, "UTC")} UTC
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="text-[11px] text-slate-500">
        Calculé sur les 500 dernières barres (1m). Si le marché est fermé, l’âge de la dernière barre augmentera et des
        gaps peuvent apparaître : pas d’alarme dans ce cas.
      </p>
    </div>
  );
}

function analyzeOhlc(ohlc: Ohlc[]) {
  if (ohlc.length === 0) {
    return {
      lastBarAgeLabel: "no data",
      stale: true,
      coverageLabel: "0%",
      gaps: [] as Gap[],
      avgTicksPerBar: 0,
      zeroTickPct: 0,
      missingVolumePct: 0,
    };
  }

  const sorted = [...ohlc].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const firstTs = new Date(sorted[0].timestamp).getTime();
  const lastTs = new Date(sorted[sorted.length - 1].timestamp).getTime();
  const ageMinutes = (Date.now() - lastTs) / 60000;
  const lastBarAgeLabel = ageMinutes < 1 ? "<1 min" : `${ageMinutes.toFixed(1)} min`;
  const stale = ageMinutes > 5;

  const expectedBars = Math.max(1, Math.round((lastTs - firstTs) / 60000) + 1);
  const coverage = Math.min(1, sorted.length / expectedBars);
  const coverageLabel = `${(coverage * 100).toFixed(1)}%`;

  const gaps: Gap[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].timestamp).getTime();
    const curr = new Date(sorted[i].timestamp).getTime();
    const diffMin = (curr - prev) / 60000;
    if (diffMin > 1.5) {
      gaps.push({ from: sorted[i - 1].timestamp, to: sorted[i].timestamp, minutes: diffMin });
    }
  }

  const tickCounts = sorted.map((b) => b.tick_count ?? 0);
  const avgTicksPerBar = tickCounts.reduce((a, b) => a + b, 0) / tickCounts.length || 0;
  const zeroTickPct = (tickCounts.filter((t) => t === 0).length / tickCounts.length) * 100;
  const missingVolumePct =
    (sorted.filter((b) => b.volume == null || b.volume === 0).length / sorted.length) * 100;

  return {
    lastBarAgeLabel,
    stale,
    coverageLabel,
    gaps,
    avgTicksPerBar,
    zeroTickPct,
    missingVolumePct,
  };
}

function Stat({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: string;
  variant?: "default" | "success" | "warning" | "danger";
}) {
  const color =
    variant === "success"
      ? "text-success"
      : variant === "warning"
      ? "text-amber-300"
      : variant === "danger"
      ? "text-danger"
      : "text-white";
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`text-base font-semibold ${color}`}>{value}</div>
    </div>
  );
}
