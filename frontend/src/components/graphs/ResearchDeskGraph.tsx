import React, { useEffect, useMemo, useState } from "react";
import {
  fetchStatusV2,
  fetchSummaryV2,
  fetchConfigDetailV2,
  ScopeType,
  ConfigDetailV2,
  SummaryV2,
} from "../../services/researchDeskApi";
import { ResearchGraphLayout } from "./ResearchGraphLayout";
import { QuantPlotlyCard, QuantEmptyState } from "../quantlab/ui";
import { useResearchGraphState } from "../../lib/useResearchGraphState";

type Props = { onBack: () => void };

export function ResearchDeskGraph({ onBack }: Props) {
  const { logScale, downsample, updateLogScale, updateDownsample } =
    useResearchGraphState({ timeframe: "1d" });
  const [summary, setSummary] = useState<SummaryV2 | null>(null);
  const [equitySeries, setEquitySeries] = useState<{ x: number; y: number }[]>([]);
  const [topRankData, setTopRankData] = useState<
    { x: number; y: number; name: string }[]
  >([]);
  const [frontierData, setFrontierData] = useState<
    { x: number; y: number; name: string }[]
  >([]);
  const [scopeLabel, setScopeLabel] = useState<string>("DAY");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        let scope: ScopeType = "ROLLING";
        let key: string | undefined = "LAST_30_RUNS";
        let status = await fetchStatusV2(scope, key);
        if (!status.available || !status.has_data) {
          scope = "DAY";
          key = undefined;
          status = await fetchStatusV2(scope);
        }
        const effectiveKey =
          key ||
          status.latest_by_scope?.[scope]?.scope_key ||
          status.latest?.scope_key ||
          new Date().toISOString().slice(0, 10);
        const summaryData = await fetchSummaryV2(scope, effectiveKey);
        if (!mounted) return;
        setSummary(summaryData);
        setScopeLabel(`${summaryData.run.scope_type} · ${summaryData.run.scope_key}`);
        const topConfig = summaryData.top[0];
        if (topConfig) {
          const detail = await fetchConfigDetailV2(
            topConfig.config_id,
            summaryData.run.scope_type,
            summaryData.run.scope_key,
          );
          if (!mounted) return;
          const cumulative = buildEquity(detail.series);
          setEquitySeries(cumulative);
        } else {
          setEquitySeries([]);
        }
        const ranked = summaryData.top.slice(0, 10).map((c, idx) => ({
          x: idx + 1,
          y: c.pnl_net_day,
          name: c.config_id,
        }));
        setTopRankData(ranked);
        setFrontierData(
          summaryData.top.slice(0, 12).map((c) => ({
            x: c.dd_day,
            y: c.pnl_net_day,
            name: c.config_id,
          })),
        );
        setError(null);
      } catch (e: any) {
        if (!mounted) return;
        setError(e.message || "Failed to load Research Desk graph data");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <ResearchGraphLayout
      title="Research Desk · Graph Mode"
      subtitle="Equity top configs et profils PnL"
      onBack={onBack}
      scopeLabel={scopeLabel}
      toolbar={{
        timeframe: "1d",
        toggles: (
          <div className="flex items-center gap-2 text-xs">
            <ToggleButton
              label="Downsample"
              active={downsample}
              onClick={() => updateDownsample(!downsample)}
            />
            <ToggleButton
              label="Log scale"
              active={logScale}
              onClick={() => updateLogScale(!logScale)}
            />
          </div>
        ),
      }}
    >
      {error && <QuantEmptyState message={error} />}
      <QuantPlotlyCard
        title="Top config equity curve"
        subtitle="Cumulative PnL of best config"
        data={[
          {
            type: "scattergl",
            mode: "lines",
            x: maybeDownsample(equitySeries, downsample).map((p) => p.x),
            y: maybeDownsample(equitySeries, downsample).map((p) => p.y),
            line: { color: "#0ea5e9", width: 2 },
          },
        ]}
        layout={{
          height: 400,
          xaxis: { type: "date" },
          yaxis: { title: "PnL net cum.", type: logScale ? "log" : "linear" },
        }}
        loading={loading}
        empty={equitySeries.length === 0 && !loading}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <QuantPlotlyCard
          title="Top configs · PnL rank"
          subtitle="PnL by rank (top 10)"
          data={[
            {
              type: "scatter",
              mode: "lines+markers",
              x: topRankData.map((d) => d.x),
              y: topRankData.map((d) => d.y),
              text: topRankData.map((d) => d.name),
              hovertemplate: "Config %{text}<br>Rank %{x}<br>PnL %{y:.2f}p",
              line: { color: "#22c55e" },
              marker: { color: "#22c55e" },
            },
          ]}
          layout={{
            height: 360,
            xaxis: { title: "Rank (PnL)" },
            yaxis: { title: "PnL net day" },
          }}
          loading={loading}
          empty={topRankData.length === 0 && !loading}
        />
        <QuantPlotlyCard
          title="PnL vs DD frontier (top configs)"
          subtitle="Risk/return cloud"
          data={[
            {
              type: "scatter",
              mode: "markers",
              x: frontierData.map((d) => d.x),
              y: frontierData.map((d) => d.y),
              text: frontierData.map((d) => d.name),
              marker: { color: "#0ea5e9", size: 10, opacity: 0.85 },
              hovertemplate: "Config %{text}<br>PnL %{y:.2f}p<br>DD %{x:.2f}p",
            },
          ]}
          layout={{
            height: 360,
            xaxis: { title: "Drawdown (pips)" },
            yaxis: { title: "PnL net day" },
          }}
          loading={loading}
          empty={frontierData.length === 0 && !loading}
        />
      </div>
    </ResearchGraphLayout>
  );
}

function buildEquity(rows: ConfigDetailV2["series"]) {
  if (!rows.length) return [];
  let acc = 0;
  return rows
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((r) => {
      acc += r.pnl_net_day;
      return { x: new Date(r.created_at).getTime(), y: acc };
    });
}

function EmptyState({ message }: { message: string }) {
  return (
    <QuantEmptyState message={message} />
  );
}

function ToggleButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-1 ${
        active
          ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-100"
          : "border-white/10 bg-white/5 text-neutral-200 hover:border-cyan-400/40"
      }`}
    >
      {label}
    </button>
  );
}

function maybeDownsample<T>(points: T[], enabled: boolean, maxPoints = 800): T[] {
  if (!enabled || points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  return points.filter((_, idx) => idx % step === 0);
}
