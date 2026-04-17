import React, { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { fetchShocksMultiRun, fetchMarketProfileForRun } from "./dataAdapters";
import {
  BentoCard,
  MetricPill,
  QuantEmptyState,
  QuantLabLayout,
  QuantPlotlyCard,
  ToolbarButton,
} from "./ui";

/**
 * Microstructure — Quant Lab module
 * Run-scoped microstructure analysis (spread/vol) with Plotly.
 */
export function MicrostructureLab() {
  const [multiRunInput, setMultiRunInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [multiRunShocks, setMultiRunShocks] = useState<{ runId: string; shocks: any[] }[]>([]);

  const runIds = useMemo(
    () =>
      multiRunInput
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [multiRunInput],
  );

  const agg = useMemo(() => {
    if (!multiRunShocks.length) return { z: [] as number[], magnitude: [] as number[], byRun: [] as { runId: string; n: number }[] };
    const z: number[] = [];
    const magnitude: number[] = [];
    const byRun: { runId: string; n: number }[] = [];
    multiRunShocks.forEach(({ runId, shocks }) => {
      byRun.push({ runId, n: shocks.length });
      shocks.forEach((s: any) => {
        if (s.z_score != null) z.push(Number(s.z_score));
        if (s.magnitude_pips != null) magnitude.push(Number(s.magnitude_pips));
      });
    });
    return { z, magnitude, byRun };
  }, [multiRunShocks]);

  const loadMultiRun = async () => {
    if (!runIds.length) {
      setMultiRunShocks([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const shocks = await fetchShocksMultiRun(runIds, 500);
      setMultiRunShocks(shocks);
      // Opportunistic: warm cache for market profile if needed later
      runIds.slice(0, 2).forEach((r) => fetchMarketProfileForRun(r).catch(() => undefined));
    } catch (e: any) {
      setError(e.message || "Failed to load shocks multi-run");
    } finally {
      setLoading(false);
    }
  };

  return (
    <QuantLabLayout
      title="Microstructure"
      description="Profils de prix, heatmap spread, shocks/signals scatter. Pas de chart price."
    >
      <BentoCard className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="quant-section-title">Multi-run loader</div>
            <div className="text-sm text-slate-700">
              Fournis plusieurs run_id pour agréger la microstructure (z-score / magnitude). Limite 500
              shocks/run.
            </div>
          </div>
          <MetricPill label="Loaded" value={agg.byRun.length} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={multiRunInput}
            onChange={(e) => setMultiRunInput(e.target.value)}
            placeholder="run_a run_b run_c"
            className="w-full md:w-96 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
          />
          <ToolbarButton
            icon={<RefreshCw className="h-4 w-4" />}
            label={loading ? "Loading…" : "Load multi-run"}
            onClick={loadMultiRun}
            disabled={loading}
          />
          {error && <span className="text-xs text-amber-600">{error}</span>}
        </div>
        {agg.byRun.length > 0 && (
          <div className="text-[11px] text-slate-600">
            Runs chargés: {agg.byRun.map((r) => `${r.runId.slice(0, 8)} (${r.n})`).join(" · ")}
          </div>
        )}
      </BentoCard>

      <QuantPlotlyCard
        title="Microstructure cloud"
        subtitle="z-score vs magnitude (multi-run)"
        data={[
          {
            type: "histogram2dcontour",
            x: agg.z,
            y: agg.magnitude,
            colorscale: "Viridis",
            ncontours: 20,
            showscale: false,
          },
        ]}
        layout={{
          height: 320,
          xaxis: { title: "z-score" },
          yaxis: { title: "Magnitude (pips)" },
        }}
        loading={loading}
        empty={agg.z.length === 0 && !loading}
      />
      {agg.z.length === 0 && !loading && <QuantEmptyState message="Charge des runs pour voir le cloud." />}
    </QuantLabLayout>
  );
}
