import React, { useEffect, useState, useMemo, Suspense } from "react";
const Plot = React.lazy(() => import("../../lib/PlotlyBasic"));
import { ResearchDesk } from "../ResearchDesk";
import { fetchSummaryV2 } from "../../services/researchDeskApi";
import type { SummaryV2 } from "../../services/researchDeskApi";
import { BentoCard, QuantEmptyState, QuantLabLayout, QuantPlotlyCard } from "./ui";
import { useQuantLabRunIds } from "./QuantLabHeader";
import { usePortfolioEpoch } from "../../lib/usePortfolioEpoch";

// API base URL - use relative path for proxy
const API_BASE = '/react-api';

// Types
interface ParetoConfig {
  config_id: string;
  return_total: number;
  drawdown_max: number;
  sharpe: number;
  trade_count: number;
  win_rate: number;
  stability_score: number;
  is_pareto: boolean;
}

interface ParetoScatterData {
  x_axis: string;
  y_axis: string;
  color_by: string;
  points: Array<{
    config_id: string;
    x: number;
    y: number;
    color: number;
    is_pareto: boolean;
  }>;
  pareto_frontier: Array<{
    config_id: string;
    x: number;
    y: number;
    color: number;
    is_pareto: boolean;
  }>;
  pareto_count: number;
  total_count: number;
}

interface StabilityData {
  configs: ParetoConfig[];
  top_stable: ParetoConfig | null;
  mean_stability: number;
}

/**
 * ParameterSurfaces — Quant Lab V3 Phase 5
 * Multi-objective optimization with Pareto frontier visualization.
 */
export function ParameterSurfaces() {
  const [summary, setSummary] = useState<SummaryV2 | null>(null);
  const [paretoData, setParetoData] = useState<ParetoScatterData | null>(null);
  const [stabilityData, setStabilityData] = useState<StabilityData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedConfig, setSelectedConfig] = useState<ParetoConfig | null>(null);

  // Scope-aware run IDs (null = all portfolio, string = current run)
  const runIdsParam = useQuantLabRunIds();
  const { epoch: portfolioEpoch, refresh: refreshEpoch } = usePortfolioEpoch();

  // Fetch all data
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Build URL params with run_ids based on data scope
        const runParam = runIdsParam ? `&run_ids=${runIdsParam}` : '';
        const epochParam = portfolioEpoch !== null ? `&portfolio_epoch=${portfolioEpoch}` : '';

        const [summaryRes, paretoRes, stabilityRes] = await Promise.all([
          fetchSummaryV2("ROLLING", "LAST_30_RUNS").catch(() => null),
          fetch(`${API_BASE}/api/quant/pareto/scatter?x_axis=return_total&y_axis=drawdown_max&color_by=stability_score&limit=100${runParam}${epochParam}`)
            .then(r => r.json())
            .catch(() => null),
          fetch(`${API_BASE}/api/quant/pareto/stability?limit=20${runParam}${epochParam}`)
            .then(r => r.json())
            .catch(() => null),
        ]);

        setSummary(summaryRes);
        setParetoData(paretoRes);
        setStabilityData(stabilityRes);
        setError(null);
      } catch (e: any) {
        setError(e.message || "Failed to load data");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [runIdsParam, portfolioEpoch]);

  // Pareto scatter traces
  const paretoTraces = useMemo(() => {
    if (!paretoData || !paretoData.points) return [];

    const dominated = paretoData.points.filter(p => !p.is_pareto);
    const frontier = paretoData.pareto_frontier || [];

    return [
      // Dominated points (gray)
      {
        type: "scatter" as const,
        mode: "markers" as const,
        x: dominated.map(p => p.x),
        y: dominated.map(p => p.y),
        text: dominated.map(p => `${p.config_id}<br>Stability: ${(p.color * 100).toFixed(0)}%`),
        marker: {
          size: 8,
          color: dominated.map(p => p.color),
          colorscale: "Viridis",
          cmin: 0,
          cmax: 1,
          opacity: 0.5,
          colorbar: {
            title: "Stability",
            tickformat: ".0%",
            x: 1.02,
          },
        },
        name: "Dominated",
        hovertemplate: "%{text}<br>Return: %{x:.1f}<br>DD: %{y:.1f}<extra></extra>",
      },
      // Pareto frontier points (highlighted)
      {
        type: "scatter" as const,
        mode: "markers+text" as const,
        x: frontier.map(p => p.x),
        y: frontier.map(p => p.y),
        text: frontier.map(p => p.config_id.slice(0, 8)),
        textposition: "top center" as const,
        marker: {
          size: 14,
          color: "#f97316",
          symbol: "star",
          line: { width: 2, color: "#fff" },
        },
        name: "Pareto Frontier",
        hovertemplate: "%{text}<br>Return: %{x:.1f}<br>DD: %{y:.1f}<extra></extra>",
      },
      // Pareto frontier line
      {
        type: "scatter" as const,
        mode: "lines" as const,
        x: frontier.map(p => p.x),
        y: frontier.map(p => p.y),
        line: { color: "#f97316", width: 2, dash: "dash" as const },
        showlegend: false,
        hoverinfo: "skip" as const,
      },
    ];
  }, [paretoData]);

  return (
    <QuantLabLayout
      title="Multi-Objective Optimization"
      description="Pareto frontier analysis: Return vs Drawdown with stability scoring. Non-dominated configs are highlighted."
    >
      {/* Pareto Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard
          title="Total Configs"
          value={paretoData?.total_count || 0}
          subtitle="Analyzed"
        />
        <MetricCard
          title="Pareto Frontier"
          value={paretoData?.pareto_count || 0}
          subtitle="Non-dominated"
          highlight
        />
        <MetricCard
          title="Mean Stability"
          value={`${((stabilityData?.mean_stability || 0) * 100).toFixed(0)}%`}
          subtitle="Top 20 configs"
        />
        <MetricCard
          title="Most Stable"
          value={stabilityData?.top_stable?.config_id?.slice(0, 8) || "—"}
          subtitle={`${((stabilityData?.top_stable?.stability_score || 0) * 100).toFixed(0)}%`}
        />
      </div>

      {/* Main Pareto Scatter */}
      <BentoCard className="p-4 space-y-3">
        <div className="quant-section-title">Return vs Drawdown — Pareto Frontier</div>
        <p className="text-xs text-slate-500">
          ⭐ Stars = Pareto-optimal configs (non-dominated). Color = stability score.
          Higher return, lower drawdown = better.
        </p>
        {loading ? (
          <div className="h-96 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
          </div>
        ) : paretoTraces.length > 0 ? (
          <Suspense fallback={<div className="h-96 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div></div>}>
          <Plot
            data={paretoTraces}
            layout={{
              height: 450,
              margin: { l: 60, r: 100, t: 30, b: 60 },
              xaxis: {
                title: "Total Return (pips)",
                gridcolor: "#334155",
                zerolinecolor: "#475569",
              },
              yaxis: {
                title: "Max Drawdown (pips)",
                gridcolor: "#334155",
                zerolinecolor: "#475569",
              },
              paper_bgcolor: "rgba(0,0,0,0)",
              plot_bgcolor: "rgba(15,23,42,0.5)",
              font: { color: "#94a3b8", size: 11 },
              showlegend: true,
              legend: { x: 0, y: 1.15, orientation: "h" as const },
            }}
            config={{ displayModeBar: false }}
            className="w-full"
          />
          </Suspense>
        ) : (
          <QuantEmptyState message="No Pareto data available" />
        )}
      </BentoCard>

      {/* Stability Ranking Table */}
      <BentoCard className="p-4 space-y-3">
        <div className="quant-section-title">Top Stable Configs</div>
        <p className="text-xs text-slate-500">
          Ranked by bootstrap stability score. Higher = more consistent edge across folds.
        </p>
        {stabilityData?.configs && stabilityData.configs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-700">
                  <th className="p-2">Config</th>
                  <th className="p-2 text-right">Stability</th>
                  <th className="p-2 text-right">Return</th>
                  <th className="p-2 text-right">Max DD</th>
                  <th className="p-2 text-right">Sharpe</th>
                  <th className="p-2 text-right">Win Rate</th>
                  <th className="p-2 text-right">Trades</th>
                  <th className="p-2">Pareto</th>
                </tr>
              </thead>
              <tbody>
                {stabilityData.configs.slice(0, 15).map((cfg, idx) => (
                  <tr
                    key={cfg.config_id}
                    className={`border-b border-slate-800 hover:bg-slate-800/50 cursor-pointer ${selectedConfig?.config_id === cfg.config_id ? "bg-cyan-900/30" : ""
                      }`}
                    onClick={() => setSelectedConfig(cfg)}
                  >
                    <td className="p-2 font-mono text-xs">
                      {idx + 1}. {cfg.config_id.slice(0, 12)}
                    </td>
                    <td className="p-2 text-right">
                      <StabilityBar value={cfg.stability_score} />
                    </td>
                    <td className={`p-2 text-right ${cfg.return_total >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {cfg.return_total.toFixed(1)}
                    </td>
                    <td className="p-2 text-right text-amber-400">
                      {cfg.drawdown_max.toFixed(1)}
                    </td>
                    <td className="p-2 text-right">
                      {cfg.sharpe.toFixed(2)}
                    </td>
                    <td className="p-2 text-right">
                      {(cfg.win_rate * 100).toFixed(1)}%
                    </td>
                    <td className="p-2 text-right text-slate-400">
                      {cfg.trade_count}
                    </td>
                    <td className="p-2 text-center">
                      {cfg.is_pareto ? "⭐" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <QuantEmptyState message="No stability data available" />
        )}
      </BentoCard>

      {/* Legacy Research Desk */}
      <BentoCard className="space-y-3 p-4">
        <div className="quant-section-title">Research Desk (Legacy)</div>
        <ResearchDesk />
      </BentoCard>

      {/* 3D Surface (Legacy) */}
      <QuantPlotlyCard
        title="Parameter surface (3D)"
        subtitle="Projection 3D (PnL vs DD vs rank) — rolling LAST_30_RUNS"
        data={
          summary
            ? [
              {
                type: "mesh3d",
                x: summary.top.map((c, idx) => idx + 1),
                y: summary.top.map((c) => c.dd_day),
                z: summary.top.map((c) => c.pnl_net_day),
                text: summary.top.map((c) => c.config_id),
                opacity: 0.7,
                color: "#0ea5e9",
              },
              {
                type: "scatter3d",
                mode: "markers+text",
                x: summary.top.map((c, idx) => idx + 1),
                y: summary.top.map((c) => c.dd_day),
                z: summary.top.map((c) => c.pnl_net_day),
                text: summary.top.map((c) => c.config_id),
                textposition: "top center",
                marker: { size: 4, color: "#f97316" },
                name: "configs",
              },
            ]
            : []
        }
        layout={{
          height: 420,
          scene: {
            xaxis: { title: "Rank" },
            yaxis: { title: "DD (pips)" },
            zaxis: { title: "PnL net (pips)" },
          },
          showlegend: false,
        }}
        loading={loading}
        empty={!summary || summary.top.length === 0}
        footer={
          error ? <div className="text-xs text-amber-600">{error}</div> : undefined
        }
      />
    </QuantLabLayout>
  );
}

// Sub-components

function MetricCard({
  title,
  value,
  subtitle,
  highlight = false,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  highlight?: boolean;
}) {
  return (
    <BentoCard className={`p-3 ${highlight ? "ring-1 ring-cyan-500/50" : ""}`}>
      <div className="text-xs text-slate-400">{title}</div>
      <div className={`text-2xl font-bold ${highlight ? "text-cyan-400" : "text-white"}`}>
        {value}
      </div>
      <div className="text-xs text-slate-500">{subtitle}</div>
    </BentoCard>
  );
}

function StabilityBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 80 ? "bg-emerald-500" :
      pct >= 60 ? "bg-cyan-500" :
        pct >= 40 ? "bg-amber-500" :
          "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-slate-700 rounded overflow-hidden">
        <div
          className={`h-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs w-10 text-right">{pct}%</span>
    </div>
  );
}
