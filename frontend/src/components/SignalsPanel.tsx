import { useEffect, useMemo, useState } from "react";
import { api, Signal } from "../lib/api";
import { ActiveContext, DataScope, activeContext, defaultScope, deriveContextForScope } from "../lib/activeContext";
import { ScopeSelector } from "./ui/ScopeSelector";
import { useRunId, useRunContextValid } from "../lib/useRunContext";
import { ApexChart } from "../lib/ApexChart";

export function SignalsPanel() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dataScope, setDataScope] = useState<DataScope>(defaultScope);
  const runId = useRunId();
  const { invalidReason } = useRunContextValid();
  const scopedContext: ActiveContext = useMemo(() => {
    const ctx = deriveContextForScope(activeContext, dataScope);
    if (runId) {
      return { ...ctx, run_id: runId };
    }
    return ctx;
  }, [dataScope, runId]);

  useEffect(() => {
    if (!runId) {
      setSignals([]);
      setError(invalidReason ? `Run indisponible (${invalidReason})` : "Aucun run sélectionné");
      return;
    }
    async function load() {
      try {
        const data = await api.getSignals(100, scopedContext, dataScope);
        setSignals(data);
        setError(null);
      } catch (e: any) {
        setError(e.message || "Failed to load signals");
      }
    }
    load();
  }, [scopedContext, dataScope, runId, invalidReason]);

  const zSeries = useMemo(() => signals.map((s) => s.z_score ?? 0), [signals]);
  const revSeries = useMemo(
    () => signals.filter((s) => s.reversion_ratio != null && s.z_score != null),
    [signals]
  );
  const mfeMaeSeries = useMemo(
    () => signals.filter((s) => s.mfe_pips != null && s.mae_pips != null),
    [signals]
  );
  const zHist = useMemo(() => buildHistogram(zSeries, 12), [zSeries]);

  const zHistOptions = useMemo(() => ({
    chart: { animations: { enabled: false }, toolbar: { show: false }, background: "transparent" },
    grid: { borderColor: "rgba(255,255,255,0.05)" },
    theme: { mode: "dark" as const },
    plotOptions: { bar: { columnWidth: "80%" } },
    dataLabels: { enabled: false },
    xaxis: { categories: zHist.labels, labels: { style: { colors: "#94a3b8", fontSize: "10px" } } },
    yaxis: { labels: { style: { colors: "#94a3b8" } } },
  }), [zHist.labels]);

  const zHistSeries = useMemo(() => [{ name: "count", data: zHist.counts }], [zHist.counts]);

  const scatterOptions = useMemo(() => ({
    chart: { animations: { enabled: false }, toolbar: { show: false }, background: "transparent" },
    grid: { borderColor: "rgba(255,255,255,0.05)" },
    theme: { mode: "dark" as const },
    dataLabels: { enabled: false },
  }), []);

  const revScatterOptions = useMemo(() => ({
    ...scatterOptions,
    xaxis: { title: { text: "z-score", style: { color: "#94a3b8" } }, labels: { style: { colors: "#94a3b8" } } },
    yaxis: { title: { text: "reversion", style: { color: "#94a3b8" } }, labels: { style: { colors: "#94a3b8" } } },
  }), [scatterOptions]);

  const revScatterSeries = useMemo(
    () => [{ name: "signals", data: revSeries.map((s) => [s.z_score ?? 0, s.reversion_ratio ?? 0]) }],
    [revSeries]
  );

  const mfeScatterOptions = useMemo(() => ({
    ...scatterOptions,
    xaxis: { title: { text: "MAE (pips)", style: { color: "#94a3b8" } }, labels: { style: { colors: "#94a3b8" } } },
    yaxis: { title: { text: "MFE (pips)", style: { color: "#94a3b8" } }, labels: { style: { colors: "#94a3b8" } } },
  }), [scatterOptions]);

  const mfeScatterSeries = useMemo(
    () => [{ name: "signals", data: mfeMaeSeries.map((s) => [s.mae_pips ?? 0, s.mfe_pips ?? 0]) }],
    [mfeMaeSeries]
  );

  return (
    <div className="card glass space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-400">Signal Analytics</div>
          <div className="text-lg font-semibold">Derniers signaux</div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <ScopeSelector scope={dataScope} onChange={setDataScope} />
          {error && <span className="text-xs text-danger">{error}</span>}
          {!error && signals.length > 0 && (
            <span className="text-xs text-success">{signals.length} chargés</span>
          )}
        </div>
      </div>
      {dataScope.scope !== "TODAY" && (
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-100">
          HISTORICAL VIEW · Scope {dataScope.scope}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <Stat label="Total" value={signals.length} />
        <Stat label="Avg z-score" value={avg(zSeries).toFixed(2)} />
        <Stat label="Reversion avg" value={avg(signals.map((s) => s.reversion_ratio ?? 0)).toFixed(2)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="text-xs text-neutral-400 mb-2">Z-Score Distribution</div>
          {zSeries.length === 0 ? (
            <div className="text-xs text-neutral-500">Aucun signal.</div>
          ) : (
            <ApexChart
              type="bar"
              height={220}
              options={zHistOptions}
              series={zHistSeries}
            />
          )}
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="text-xs text-neutral-400 mb-2">Reversion vs Z</div>
          {revSeries.length === 0 ? (
            <div className="text-xs text-neutral-500">Pas de données.</div>
          ) : (
            <ApexChart
              type="scatter"
              height={220}
              options={revScatterOptions}
              series={revScatterSeries}
            />
          )}
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="text-xs text-neutral-400 mb-2">MFE vs MAE</div>
          {mfeMaeSeries.length === 0 ? (
            <div className="text-xs text-neutral-500">Pas de données.</div>
          ) : (
            <ApexChart
              type="scatter"
              height={220}
              options={mfeScatterOptions}
              series={mfeScatterSeries}
            />
          )}
        </div>
      </div>

      <div className="overflow-auto">
        {signals.length === 0 ? (
          <div className="text-sm text-slate-400">Aucun signal disponible.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-slate-400 text-xs">
              <tr className="border-b border-slate-800">
                <th className="py-2 pr-3 text-left">Date</th>
                <th className="py-2 pr-3 text-left">Dir</th>
                <th className="py-2 pr-3 text-left">z-score</th>
                <th className="py-2 pr-3 text-left">Δ pips</th>
                <th className="py-2 pr-3 text-left">Spread</th>
                <th className="py-2 pr-3 text-left">Reversion</th>
                <th className="py-2 pr-3 text-left">MFE</th>
                <th className="py-2 pr-3 text-left">MAE</th>
                <th className="py-2 pr-3 text-left">Final PnL</th>
              </tr>
            </thead>
            <tbody>
              {signals.slice(0, 50).map((s) => (
                <tr key={s.timestamp} className="border-b border-slate-900/70">
                  <td className="py-2 pr-3 text-slate-300">
                    {s.timestamp ? (isNaN(new Date(s.timestamp).getTime()) ? "-" : new Date(s.timestamp).toISOString()) : "-"}
                  </td>
                  <td className="py-2 pr-3 text-slate-200 font-semibold">{s.direction}</td>
                  <td className="py-2 pr-3">{s.z_score?.toFixed(2)}</td>
                  <td className="py-2 pr-3">{s.delta_pips?.toFixed(2)}</td>
                  <td className="py-2 pr-3">{s.spread_pips?.toFixed(2) ?? "n/a"}</td>
                  <td className="py-2 pr-3">{s.reversion_ratio?.toFixed(2) ?? "n/a"}</td>
                  <td className="py-2 pr-3">{s.mfe_pips?.toFixed(2) ?? "n/a"}</td>
                  <td className="py-2 pr-3">{s.mae_pips?.toFixed(2) ?? "n/a"}</td>
                  <td
                    className={`py-2 pr-3 font-semibold ${(s.final_pnl_pips ?? 0) >= 0 ? "text-success" : "text-danger"
                      }`}
                  >
                    {(s.final_pnl_pips ?? 0).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function avg(arr: number[]) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function buildHistogram(values: number[], bins: number) {
  if (values.length === 0) return { labels: [], counts: [] };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = (max - min || 1) / bins;
  const counts = Array.from({ length: bins }, () => 0);
  values.forEach((v) => {
    const idx = Math.min(bins - 1, Math.floor((v - min) / width));
    counts[idx] += 1;
  });
  const labels = counts.map((_, i) => (min + i * width).toFixed(1));
  return { labels, counts };
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-base font-semibold text-white">{value}</div>
    </div>
  );
}
