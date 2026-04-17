import React, { useEffect, useMemo, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { useRunId, useRunMeta } from "../../lib/useRunContext";
import { applyFilters, computeDerivedFields, normalizeSignals } from "../signal_analytics/core/computations";
import { type Filters, type ParamsOverrides } from "../signal_analytics/types";
import { fetchSignalsMultiRun } from "./dataAdapters";
import {
  EmptyState,
  GlassPanel,
  IconButton,
  MetricPill,
  QuantLabLayout,
  QuantPlotlyCard,
  QuantSkeleton,
} from "./ui";

/**
 * EdgeAnalysis — Quant Lab module
 * Run-scoped edge diagnostics (filters, funnels, thresholds).
 * NOTE: multi-run surfaces to be added once adapters are ready.
 */
export function EdgeAnalysis() {
  const runId = useRunId();
  const { run } = useRunMeta();
  const strategyId = run?.strategy_id ?? undefined;
  const [multiRunInput, setMultiRunInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [multiRunSignals, setMultiRunSignals] = useState<{ runId: string; signals: any[] }[]>([]);

  const runIds = useMemo(
    () =>
      multiRunInput
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [multiRunInput],
  );

  useEffect(() => {
    if (runId && !multiRunInput) {
      setMultiRunInput(runId);
    }
  }, [runId, multiRunInput]);

  const aggregated = useMemo(() => {
    if (!multiRunSignals.length) return { x: [] as number[], y: [] as number[], byRun: [] as { runId: string; n: number }[] };
    const params: ParamsOverrides = { minAmplitude: 0.8, maxSpread: 0.3, ttlBars: 60, feesPips: 0.1 };
    const filters: Filters = { acceptedOnly: true, side: "ALL", regime: "ALL", session: "ALL", timeframe: "ALL", outcomeRequired: false, brushSelection: null, ttlMax: null };
    const byRun: { runId: string; n: number }[] = [];
    const x: number[] = [];
    const y: number[] = [];
    multiRunSignals.forEach(({ runId, signals }) => {
      const normalized = normalizeSignals(signals).map((s) => computeDerivedFields(s, params));
      const filtered = applyFilters(normalized, filters, params, "ACCEPTED");
      byRun.push({ runId, n: filtered.length });
      filtered.forEach((s) => {
        if (s.amplitude != null && s.net_outcome != null) {
          x.push(s.amplitude);
          y.push(s.net_outcome);
        }
      });
    });
    return { x, y, byRun };
  }, [multiRunSignals]);

  const loadMultiRun = async (override?: string[]) => {
    const targets = (override && override.length ? override : runIds.length ? runIds : runId ? [runId] : []);
    if (!targets.length) {
      setMultiRunSignals([]);
      setError("Aucun run_id fourni et aucun run courant détecté.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSignalsMultiRun(targets, 500, strategyId);
      setMultiRunSignals(data);
    } catch (e: any) {
      setError(e.message || "Failed to load multi-run signals");
    } finally {
      setLoading(false);
    }
  };

  return (
    <QuantLabLayout
      title="Edge Analysis"
      subtitle="Multi-run loader + edge cloud agrégé"
      actions={<MetricPill label="Loaded" value={aggregated.byRun.length} />}
    >
      <GlassPanel className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="ql-section-label">Multi-run loader</div>
            <div className="text-sm text-[var(--ql-strong)]">
              Fournis une liste de run_id (séparés par virgule ou espace) pour agréger les edges. Limite 500
              signaux/run.
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={multiRunInput}
            onChange={(e) => setMultiRunInput(e.target.value)}
            placeholder="run_a run_b run_c"
            className="w-full md:w-96 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
          />
          <IconButton
            icon={<RefreshCw className="h-4 w-4" />}
            label={loading ? "Loading…" : "Load multi-run"}
            variant="secondary"
            onClick={loadMultiRun}
            disabled={loading}
          />
          <IconButton
            icon={<Sparkles className="h-4 w-4" />}
            label="Run courant"
            variant="ghost"
            onClick={() => {
                if (runId) {
                  setMultiRunInput(runId);
                  loadMultiRun([runId]);
                } else {
                  loadMultiRun();
                }
            }}
            disabled={loading}
            tooltip="Pré-remplit avec le run actuel (résolu via run context)"
          />
        </div>
        {loading && <QuantSkeleton lines={3} />}
        {error && (
          <EmptyState
            title="Erreur multi-run"
            description={error}
          />
        )}
        {aggregated.byRun.length > 0 && (
          <div className="text-[11px] text-[var(--ql-muted)]">
            Runs chargés: {aggregated.byRun.map((r) => `${r.runId.slice(0, 8)} (${r.n})`).join(" · ")}
          </div>
        )}
      </GlassPanel>

      <QuantPlotlyCard
        title="Edge cloud (multi-run)"
        subtitle="Amplitude vs net outcome"
        data={[
          {
            type: "histogram2d",
            x: aggregated.x,
            y: aggregated.y,
            nbinsx: 40,
            nbinsy: 40,
            colorscale: "Blues",
            showscale: false,
          },
          {
            type: "scattergl",
            mode: "markers",
            x: aggregated.x,
            y: aggregated.y,
            marker: { color: "#0ea5e9", size: 4, opacity: 0.6 },
            name: "points",
          },
        ]}
        layout={{
          height: 360,
          xaxis: { title: "Amplitude (pips)" },
          yaxis: { title: "Net outcome (pips)" },
        }}
        loading={loading}
        empty={aggregated.x.length === 0 && !loading}
      />

      <GlassPanel className="p-4">
        <div className="ql-section-label">Signal Analytics V3</div>
        <div className="text-sm text-[var(--ql-strong)]">
          Utilise l&apos;onglet Signal Analytics V3 pour l&apos;analyse complète run-aware (filtres, QA, graph mode).
        </div>
      </GlassPanel>
    </QuantLabLayout>
  );
}
