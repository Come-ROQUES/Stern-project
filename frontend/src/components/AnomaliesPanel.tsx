import { useMemo } from "react";
import { useRunId, useRunMeta } from "../lib/useRunContext";
import { useCanonicalTrades } from "../lib/canonicalApi";
import { useCommissionView } from "../lib/useCommissionView";

export function AnomaliesPanel() {
  const runId = useRunId();
  const { run } = useRunMeta();
  const strategyId = run?.strategy_id ?? null;
  const { commissionView } = useCommissionView();
  const {
    trades,
    meta,
    loading,
    error,
  } = useCanonicalTrades(runId, 200, {
    commissionView,
    includeAnomalies: true,
    onlyAnomalies: true,
    strategyId: strategyId ?? undefined,
  });

  const rows = useMemo(() => trades, [trades]);

  return (
    <div className="card glass p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-neutral-200">
            Anomalies
          </div>
          <div className="text-sm text-neutral-400">
            Scope: {runId ? `run ${runId.slice(0, 8)}` : "n/a"} · only_anomalies=true · commission_view={commissionView}
          </div>
        </div>
        <div className="badge badge-outline">
          missing exit {Math.round(meta?.missing_exit_commission_pct ?? 0)}% · anomalies {meta?.anomaly_count ?? rows.length}
        </div>
      </div>
      {loading && <div className="text-sm text-neutral-400">Chargement…</div>}
      {error && <div className="text-sm text-rose-400">Erreur: {error}</div>}
      {!loading && rows.length === 0 && (
        <div className="text-sm text-neutral-400">Aucune anomalie détectée.</div>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-white/10 bg-white/5">
          <table className="min-w-full text-sm">
            <thead className="text-neutral-400">
              <tr>
                <th className="px-2 py-1">trade_id</th>
                <th className="px-2 py-1">run_id</th>
                <th className="px-2 py-1">Entry</th>
                <th className="px-2 py-1">Exit</th>
                <th className="px-2 py-1">Gross USD</th>
                <th className="px-2 py-1">Net USD</th>
                <th className="px-2 py-1">Reason</th>
                <th className="px-2 py-1">Completeness</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={`${t.trade_id}-${t.exit_time}`} className="border-t border-white/5 hover:bg-white/5">
                  <td className="px-2 py-1 text-neutral-200">{t.trade_id?.slice(0, 8)}</td>
                  <td className="px-2 py-1 text-neutral-200">{t.run_id?.slice(0, 8)}</td>
                  <td className="px-2 py-1 text-neutral-200">{t.entry_time ?? "—"}</td>
                  <td className="px-2 py-1 text-neutral-200">{t.exit_time ?? "—"}</td>
                  <td className="px-2 py-1 text-neutral-200">{(t.pnl_gross_usd_used ?? t.pnl_gross_usd ?? 0).toFixed(2)}</td>
                  <td className="px-2 py-1 text-neutral-200">{(t.pnl_net_usd_used ?? t.pnl_net_usd ?? 0).toFixed(2)}</td>
                  <td className="px-2 py-1 text-amber-300">{t.anomaly_reason_code ?? t.anomaly_reason ?? "—"}</td>
                  <td className="px-2 py-1 text-neutral-200">
                    {t.commission_completeness ?? (t.missing_exit_commission ? "ENTRY_ONLY" : "UNKNOWN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
