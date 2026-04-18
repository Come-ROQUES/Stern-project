import React, { useEffect, useMemo, useState } from "react";
import { api, MarketProfileRow, Ohlc, Signal } from "../../lib/api";
import { ActiveContext, DataScope, activeContext, deriveContextForScope } from "../../lib/activeContext";
import { useResearchGraphState } from "../../lib/useResearchGraphState";
import { useRunId } from "../../lib/useRunContext";
import { ResearchGraphLayout } from "./ResearchGraphLayout";
import { QuantPlotlyCard, QuantEmptyState } from "../quantlab/ui";

type Props = { onBack: () => void };

export function MarketProfileGraph({ onBack }: Props) {
  const runId = useRunId();
  const { timeframe, scope, logScale, downsample, updateTimeframe, updateLogScale, updateDownsample } = useResearchGraphState({ timeframe: "1m" });
  const [profiles, setProfiles] = useState<MarketProfileRow[]>([]);
  const [ohlc, setOhlc] = useState<Ohlc[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scopedContext: ActiveContext | null = useMemo(() => {
    if (!runId) return null;
    const ctx = deriveContextForScope(activeContext, scope);
    return { ...ctx, run_id: runId };
  }, [runId, scope]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!scopedContext) {
        setProfiles([]);
        setOhlc([]);
        setSignals([]);
        setError("Sélectionne un run pour charger les données.");
        return;
      }
      setLoading(true);
      try {
        const [pRows, oRows, sRows] = await Promise.all([
          api.getMarketProfile(400, scopedContext, scope),
          api.getOhlc(400, scopedContext, scope),
          api.getSignals(400, scopedContext, scope),
        ]);
        if (!mounted) return;
        setProfiles(pRows);
        setOhlc(oRows.ohlc ?? []);
        setSignals(sRows);
        setError(null);
      } catch (e: any) {
        if (!mounted) return;
        setError(e.message || "Failed to load market profile graph data");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [scopedContext, scope]);

  const priceProfile = useMemo(() => buildPriceHistogram(ohlc), [ohlc]);
  const spreadHeatmap = useMemo(() => buildSpreadHeatmap(profiles), [profiles]);
  const shockScatter = useMemo(() => buildShockScatter(signals), [signals]);
  const scatterPoints = useMemo(
    () => maybeDownsample(shockScatter, downsample),
    [shockScatter, downsample],
  );

  return (
    <ResearchGraphLayout
      title="Market Profile · Graph Mode"
      subtitle="Lectures microstructure, profils de prix et spreads"
      onBack={onBack}
      scopeLabel="Research"
      toolbar={{
        timeframe,
        onTimeframeChange: updateTimeframe,
        scope,
        toggles: (
          <div className="flex items-center gap-2 text-xs">
            <ToggleButton label="Downsample" active={downsample} onClick={() => updateDownsample(!downsample)} />
            <ToggleButton label="Log scale" active={logScale} onClick={() => updateLogScale(!logScale)} />
          </div>
        ),
      }}
    >
      {error && <QuantEmptyState message={error} />}
      <div className="grid gap-4 lg:grid-cols-2">
        <QuantPlotlyCard
          title="Price distribution (histogram)"
          subtitle="Count by price bucket"
          data={[
            {
              type: "bar",
              orientation: "h",
              x: priceProfile.series.map((p) => p.x),
              y: priceProfile.series.map((p) => p.y),
              marker: { color: "#0ea5e9" },
            },
          ]}
          layout={{
            height: 360,
            xaxis: { title: "Count", type: logScale ? "log" : "linear" },
            yaxis: { title: "Price" },
          }}
          loading={loading}
          empty={priceProfile.series.length === 0 && !loading}
        />
        <QuantPlotlyCard
          title="Spread heatmap (time buckets)"
          subtitle="Average spread by UTC hour"
          data={[
            {
              type: "heatmap",
              x: spreadHeatmap.series.map((p) => p.x),
              y: ["Spread"],
              z: [spreadHeatmap.series.map((p) => p.y)],
              colorscale: [
                [0, "#0ea5e9"],
                [0.5, "#f59e0b"],
                [1, "#ef4444"],
              ],
              showscale: true,
            },
          ]}
          layout={{
            height: 360,
            xaxis: { tickangle: -45 },
            yaxis: { title: "Spread" },
          }}
          loading={loading}
          empty={spreadHeatmap.series.length === 0 && !loading}
        />
      </div>
      <QuantPlotlyCard
        title="Shocks & signals scatter"
        subtitle="z-score vs Δpips with accept highlight"
        data={[
          {
            type: "scattergl",
            mode: "markers",
            x: scatterPoints.map((d) => d.z),
            y: scatterPoints.map((d) => d.delta),
            marker: { color: scatterPoints.map((d) => d.color), size: 6, opacity: 0.8 },
          },
        ]}
        layout={{
          height: 380,
          xaxis: { title: "z-score", type: logScale ? "log" : "linear" },
          yaxis: { title: "Δ pips" },
        }}
        loading={loading}
        empty={shockScatter.length === 0 && !loading}
      />
    </ResearchGraphLayout>
  );
}

function buildPriceHistogram(ohlc: Ohlc[]) {
  if (!ohlc.length) return { series: [] as { x: string; y: number }[] };
  const closes = ohlc.map((c) => c.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const bins = 25;
  const width = (max - min || 1) / bins;
  const counts = Array.from({ length: bins }, () => 0);
  closes.forEach((p) => {
    const idx = Math.min(bins - 1, Math.floor((p - min) / width));
    counts[idx] += 1;
  });
  const series = counts.map((c, idx) => {
    const start = min + idx * width;
    const end = start + width;
    return { x: `${start.toFixed(5)}-${end.toFixed(5)}`, y: c };
  });
  return { series };
}

function buildSpreadHeatmap(profiles: MarketProfileRow[]) {
  if (!profiles.length) return { series: [] as { x: string; y: number }[] };
  const buckets: Record<string, number[]> = {};
  profiles.forEach((p) => {
    const d = new Date(p.timestamp);
    const hour = d.getUTCHours();
    const key = `${hour.toString().padStart(2, "0")}h`;
    buckets[key] = buckets[key] || [];
    buckets[key].push(Number(p.spread_pips ?? 0));
  });
  const series = Object.entries(buckets).map(([key, vals]) => ({
    x: key,
    y: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
  }));
  return { series };
}

function buildShockScatter(signals: Signal[]) {
  return signals
    .filter((s) => s.z_score != null && s.delta_pips != null)
    .map((s) => ({
      z: s.z_score as number,
      delta: s.delta_pips as number,
      color: (s.reversion_ratio ?? 0) >= 0.8 ? "#22c55e" : "#f97316",
    }));
}


function ToggleButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-1 ${
        active ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-100" : "border-white/10 bg-white/5 text-neutral-200 hover:border-cyan-400/40"
      }`}
    >
      {label}
    </button>
  );
}

function maybeDownsample<T>(points: T[], enabled: boolean, maxPoints = 500): T[] {
  if (!enabled || points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  return points.filter((_, idx) => idx % step === 0);
}
