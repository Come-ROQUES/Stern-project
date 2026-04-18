/**
 * SlippageLab.tsx
 *
 * Quant Lab - Execution quality focus.
 *
 * Sources: canonical_trades.sqlite via /api/quant/slippage/report
 * Metrics:
 * - entry_slippage_pips: exec residual vs cross at submit (pure execution)
 * - entry_slippage_total_pips: IS vs decision_mid (strategy perspective)
 * - exit_slippage_pips: exit shortfall (when available)
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, RefreshCw, Settings2 } from "lucide-react";
import { usePortfolioEpoch } from "../../lib/usePortfolioEpoch";
import { useQuantLabScope } from "../../lib/SelectionContext";
import {
  Scope,
  QuantMetaStandard,
  getQuantSlippageReport,
} from "../../lib/quantApi";

type Percentiles = {
  count: number;
  min: number | null;
  p50: number | null;
  p90: number | null;
  p95: number | null;
  max: number | null;
  mean: number | null;
};

type SlippageTradeRow = {
  trade_id: string;
  run_id: string | null;
  ts: string | null;
  symbol: string | null;
  side: string | null;
  status: string | null;
  entry_slippage_pips: number | null;
  entry_slippage_total_pips: number | null;
  exit_slippage_pips: number | null;
  entry_submit_to_fill_ms: number | null;
  exit_submit_to_fill_ms: number | null;
  entry_quote_age_ms: number | null;
  entry_submit_spread_pips: number | null;
  entry_drift_pips: number | null;
  session: string | null;
  spread_regime: string | null;
  vol_regime: string | null;
  exit_reason_group: string | null;
  is_anomaly: number | null;
};

type SlippageReport = {
  meta: QuantMetaStandard & {
    run_ids?: string[] | null;
    portfolio_epoch?: number | null;
    limit?: number;
    include_open?: boolean;
    include_anomalies?: boolean;
  };
  kpis: {
    entry_exec_slippage_pips: Percentiles;
    entry_is_pips: Percentiles;
    exit_slippage_pips: Percentiles;
    entry_submit_to_fill_ms: Percentiles;
    entry_quote_age_ms: Percentiles;
    entry_submit_spread_pips: Percentiles;
    entry_drift_pips: Percentiles;
    counts: {
      trades: number;
      with_entry_exec: number;
      with_entry_is: number;
      with_exit_slip: number;
    };
  };
  worst: {
    entry_is: Array<{
      trade_id: string;
      run_id: string | null;
      ts: string | null;
      side: string | null;
      symbol: string | null;
      entry_slippage_total_pips: number | null;
      entry_slippage_pips: number | null;
      entry_submit_to_fill_ms: number | null;
      entry_quote_age_ms: number | null;
      session: string | null;
      spread_regime: string | null;
      vol_regime: string | null;
    }>;
    exit_slippage: Array<{
      trade_id: string;
      run_id: string | null;
      ts: string | null;
      side: string | null;
      symbol: string | null;
      exit_slippage_pips: number | null;
      exit_submit_to_fill_ms: number | null;
      exit_reason_group: string | null;
      session: string | null;
      spread_regime: string | null;
      vol_regime: string | null;
    }>;
  };
  trades: SlippageTradeRow[];
};

function fmtMaybe(x: number | null | undefined, digits = 2): string {
  if (x == null || Number.isNaN(x)) return "n/a";
  return x >= 0 ? `+${x.toFixed(digits)}` : x.toFixed(digits);
}

function fmtMs(x: number | null | undefined): string {
  if (x == null || Number.isNaN(x)) return "n/a";
  return `${x.toFixed(0)} ms`;
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-neutral-800/30 border border-neutral-700/50 rounded-lg p-4">
      <div className="text-xs text-neutral-400 uppercase">{label}</div>
      <div className="text-2xl font-bold text-neutral-100 mt-1">{value}</div>
      {hint && <div className="text-xs text-neutral-500 mt-1">{hint}</div>}
    </div>
  );
}

function PercentileLine({ p }: { p: Percentiles }) {
  return (
    <div className="text-xs text-neutral-400">
      <span className="mr-3">p50 {p.p50 == null ? "n/a" : fmtMaybe(p.p50)}</span>
      <span className="mr-3">p90 {p.p90 == null ? "n/a" : fmtMaybe(p.p90)}</span>
      <span className="mr-3">p95 {p.p95 == null ? "n/a" : fmtMaybe(p.p95)}</span>
      <span className="mr-3">mean {p.mean == null ? "n/a" : fmtMaybe(p.mean)}</span>
      <span>n {p.count}</span>
    </div>
  );
}

export function SlippageLab() {
  const quantScope = useQuantLabScope();
  const { scope, runId, strategyId, scopeLabel, missingRunId } = quantScope;
  const { epoch: portfolioEpoch, refresh: refreshEpoch } = usePortfolioEpoch();

  const [report, setReport] = useState<SlippageReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [limit, setLimit] = useState<number>(250);
  const [includeOpen, setIncludeOpen] = useState<boolean>(true);
  const [includeAnomalies, setIncludeAnomalies] = useState<boolean>(false);
  const requestSeq = useRef(0);

  const fetchData = async () => {
    const requestId = ++requestSeq.current;
    if (missingRunId) {
      setError("Selectionne un run pour afficher le slippage RUN.");
      setReport(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await getQuantSlippageReport({
        scope,
        runId,
        strategyId: strategyId ?? undefined,
        portfolioEpoch: portfolioEpoch ?? undefined,
        limit,
        include_open: includeOpen,
        include_anomalies: includeAnomalies,
      });
      if (requestId !== requestSeq.current) return;
      setReport(data as SlippageReport);
    } catch (e: any) {
      if (requestId !== requestSeq.current) return;
      setError(e?.message || "Impossible de charger le slippage report");
      setReport(null);
    } finally {
      if (requestId !== requestSeq.current) return;
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, runId, strategyId, portfolioEpoch, limit, includeOpen, includeAnomalies, missingRunId]);

  const kpis = report?.kpis ?? null;
  const rows = report?.trades ?? [];

  const top = useMemo(() => {
    if (!kpis) return null;
    const entryExec = kpis.entry_exec_slippage_pips;
    const entryIS = kpis.entry_is_pips;
    const exitSlip = kpis.exit_slippage_pips;
    const fillMs = kpis.entry_submit_to_fill_ms;
    const quoteAge = kpis.entry_quote_age_ms;
    const spread = kpis.entry_submit_spread_pips;
    return { entryExec, entryIS, exitSlip, fillMs, quoteAge, spread };
  }, [kpis]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-neutral-400">Chargement slippage...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
        <div className="flex items-center gap-2 text-red-400">
          <AlertTriangle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!report || !kpis) {
    return (
      <div className="p-4 text-neutral-400 text-center">
        Aucune donnee slippage disponible
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-neutral-100">Slippage</h2>
          <p className="text-sm text-neutral-400 mt-1">
            Implementation shortfall (IS), exec residual, latence, spread, outliers.
          </p>
          <div className="text-xs text-neutral-500 mt-1">
            Trades: {kpis.counts.trades} (entry_exec {kpis.counts.with_entry_exec},{" "}
            entry_is {kpis.counts.with_entry_is}, exit {kpis.counts.with_exit_slip})
          </div>
          <div className="text-xs text-neutral-500 mt-1">Scope: {scopeLabel}</div>
        </div>
        <div className="flex items-center gap-2">
          {report.meta.data_source && (
            <span className={`px-2 py-1 rounded text-xs ${report.meta.data_source === "LEGACY" ? "bg-amber-600/30 text-amber-100" : "bg-emerald-600/30 text-emerald-100"}`}>
              {report.meta.data_source}
            </span>
          )}
          <button
            onClick={() => {
              refreshEpoch();
              fetchData();
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-neutral-800/30 border border-neutral-700/50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Settings2 className="w-4 h-4 text-blue-400" />
          <div className="text-sm font-semibold text-neutral-100">Filtres</div>
          <div className="text-xs text-neutral-500">
            {scopeLabel}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <label className="text-xs text-neutral-400 flex items-center gap-2">
            Limit
            <input
              type="number"
              min={10}
              max={2000}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-28 px-2 py-1 bg-neutral-900 border border-neutral-700 rounded text-neutral-200 text-xs"
            />
          </label>
          <label className="text-xs text-neutral-300 flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeOpen}
              onChange={(e) => setIncludeOpen(e.target.checked)}
            />
            Inclure OPEN
          </label>
          <label className="text-xs text-neutral-300 flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeAnomalies}
              onChange={(e) => setIncludeAnomalies(e.target.checked)}
            />
            Inclure anomalies
          </label>
          <button
            onClick={fetchData}
            className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-neutral-100 rounded text-xs transition-colors"
          >
            Appliquer
          </button>
        </div>
      </div>

      {top && (
        <div className="grid grid-cols-3 gap-4">
          <MetricCard
            label="Entry exec residual (pips)"
            value={
              top.entryExec.p50 == null ? "n/a" : `${fmtMaybe(top.entryExec.p50)}p`
            }
            hint={`p95 ${top.entryExec.p95 == null ? "n/a" : fmtMaybe(top.entryExec.p95)}p`}
          />
          <MetricCard
            label="Entry IS vs decision mid (pips)"
            value={top.entryIS.p50 == null ? "n/a" : `${fmtMaybe(top.entryIS.p50)}p`}
            hint={`p95 ${top.entryIS.p95 == null ? "n/a" : fmtMaybe(top.entryIS.p95)}p`}
          />
          <MetricCard
            label="Exit slippage (pips)"
            value={
              top.exitSlip.p50 == null ? "n/a" : `${fmtMaybe(top.exitSlip.p50)}p`
            }
            hint={`p95 ${top.exitSlip.p95 == null ? "n/a" : fmtMaybe(top.exitSlip.p95)}p`}
          />
          <MetricCard
            label="Entry submit to fill"
            value={top.fillMs.p50 == null ? "n/a" : fmtMs(top.fillMs.p50)}
            hint={`p95 ${top.fillMs.p95 == null ? "n/a" : fmtMs(top.fillMs.p95)}`}
          />
          <MetricCard
            label="Quote age at submit"
            value={top.quoteAge.p50 == null ? "n/a" : fmtMs(top.quoteAge.p50)}
            hint={`p95 ${top.quoteAge.p95 == null ? "n/a" : fmtMs(top.quoteAge.p95)}`}
          />
          <MetricCard
            label="Spread at submit (pips)"
            value={top.spread.p50 == null ? "n/a" : `${fmtMaybe(top.spread.p50)}p`}
            hint={`p95 ${top.spread.p95 == null ? "n/a" : fmtMaybe(top.spread.p95)}p`}
          />
        </div>
      )}

      <div className="bg-neutral-800/30 border border-neutral-700/50 rounded-lg p-4 space-y-2">
        <div className="text-sm font-semibold text-neutral-100">Distributions</div>
        <div className="space-y-1">
          <div className="text-xs text-neutral-300">Entry exec residual</div>
          <PercentileLine p={kpis.entry_exec_slippage_pips} />
        </div>
        <div className="space-y-1">
          <div className="text-xs text-neutral-300">Entry IS vs decision mid</div>
          <PercentileLine p={kpis.entry_is_pips} />
        </div>
        <div className="space-y-1">
          <div className="text-xs text-neutral-300">Exit slippage</div>
          <PercentileLine p={kpis.exit_slippage_pips} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-neutral-800/30 border border-neutral-700/50 rounded-lg p-4">
          <div className="text-sm font-semibold text-neutral-100 mb-2">Worst Entry IS</div>
          <div className="space-y-2">
            {report.worst.entry_is.length === 0 && (
              <div className="text-xs text-neutral-500">Aucun</div>
            )}
            {report.worst.entry_is.map((t) => (
              <div
                key={t.trade_id}
                className="flex items-center justify-between text-xs"
              >
                <div className="text-neutral-300">
                  {t.trade_id.slice(0, 8)} - {t.side ?? "?"} {t.symbol ?? ""}
                </div>
                <div className="text-neutral-100 font-mono">
                  {t.entry_slippage_total_pips == null
                    ? "n/a"
                    : `${fmtMaybe(t.entry_slippage_total_pips)}p`}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-neutral-800/30 border border-neutral-700/50 rounded-lg p-4">
          <div className="text-sm font-semibold text-neutral-100 mb-2">Worst Exit Slippage</div>
          <div className="space-y-2">
            {report.worst.exit_slippage.length === 0 && (
              <div className="text-xs text-neutral-500">Aucun</div>
            )}
            {report.worst.exit_slippage.map((t) => (
              <div
                key={t.trade_id}
                className="flex items-center justify-between text-xs"
              >
                <div className="text-neutral-300">
                  {t.trade_id.slice(0, 8)} - {t.side ?? "?"} {t.symbol ?? ""}
                </div>
                <div className="text-neutral-100 font-mono">
                  {t.exit_slippage_pips == null
                    ? "n/a"
                    : `${fmtMaybe(t.exit_slippage_pips)}p`}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-neutral-800/30 border border-neutral-700/50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-neutral-100">Trades (dernier {rows.length})</div>
          <div className="text-xs text-neutral-500">
            tri par ts desc
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-neutral-400 border-b border-neutral-700/50">
                <th className="text-left py-2 pr-3">trade</th>
                <th className="text-left py-2 pr-3">ts</th>
                <th className="text-left py-2 pr-3">side</th>
                <th className="text-left py-2 pr-3">entry_exec</th>
                <th className="text-left py-2 pr-3">entry_is</th>
                <th className="text-left py-2 pr-3">exit_slip</th>
                <th className="text-left py-2 pr-3">fill_ms</th>
                <th className="text-left py-2 pr-3">quote_ms</th>
                <th className="text-left py-2 pr-3">spread</th>
                <th className="text-left py-2 pr-3">drift</th>
                <th className="text-left py-2 pr-3">session</th>
                <th className="text-left py-2 pr-3">spread_reg</th>
                <th className="text-left py-2 pr-3">vol_reg</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.trade_id}
                  className="border-b border-neutral-700/30 text-neutral-200"
                >
                  <td className="py-2 pr-3 font-mono">
                    {r.trade_id.slice(0, 8)}
                  </td>
                  <td className="py-2 pr-3 text-neutral-300">
                    {r.ts ? r.ts.replace("T", " ").slice(0, 19) : "n/a"}
                  </td>
                  <td className="py-2 pr-3">
                    {r.side ?? "?"} {r.symbol ?? ""}
                  </td>
                  <td className="py-2 pr-3 font-mono">
                    {r.entry_slippage_pips == null
                      ? "n/a"
                      : `${fmtMaybe(r.entry_slippage_pips)}p`}
                  </td>
                  <td className="py-2 pr-3 font-mono">
                    {r.entry_slippage_total_pips == null
                      ? "n/a"
                      : `${fmtMaybe(r.entry_slippage_total_pips)}p`}
                  </td>
                  <td className="py-2 pr-3 font-mono">
                    {r.exit_slippage_pips == null
                      ? "n/a"
                      : `${fmtMaybe(r.exit_slippage_pips)}p`}
                  </td>
                  <td className="py-2 pr-3 font-mono">
                    {fmtMs(r.entry_submit_to_fill_ms)}
                  </td>
                  <td className="py-2 pr-3 font-mono">
                    {fmtMs(r.entry_quote_age_ms)}
                  </td>
                  <td className="py-2 pr-3 font-mono">
                    {r.entry_submit_spread_pips == null
                      ? "n/a"
                      : `${fmtMaybe(r.entry_submit_spread_pips)}p`}
                  </td>
                  <td className="py-2 pr-3 font-mono">
                    {r.entry_drift_pips == null
                      ? "n/a"
                      : `${fmtMaybe(r.entry_drift_pips)}p`}
                  </td>
                  <td className="py-2 pr-3 text-neutral-300">
                    {r.session ?? "UNKNOWN"}
                  </td>
                  <td className="py-2 pr-3 text-neutral-300">
                    {r.spread_regime ?? "UNKNOWN"}
                  </td>
                  <td className="py-2 pr-3 text-neutral-300">
                    {r.vol_regime ?? "UNKNOWN"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={13} className="py-6 text-center text-neutral-500">
                    Aucun trade dans ce scope
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default SlippageLab;
