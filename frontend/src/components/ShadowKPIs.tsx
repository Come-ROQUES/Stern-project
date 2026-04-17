import { useEffect, useMemo, useState } from "react";
import { api, ShadowTrade } from "../lib/api";
import { ActiveContext, DataScope, activeContext, defaultScope, deriveContextForScope } from "../lib/activeContext";
import { ScopeSelector } from "./ui/ScopeSelector";
import { useRunId, useRunMeta } from "../lib/useRunContext";
import { RunMetadataBanner } from "./ui/RunMetadataBanner";
import { useCanonicalRunStats, ExecutionStats } from "../lib/canonicalApi";
import { useCommissionView } from "../lib/useCommissionView";

export function ShadowKPIs() {
  // Run context - single source of truth
  const runId = useRunId();
  const { run } = useRunMeta();
  const strategyId = run?.strategy_id ?? null;
  const { commissionView } = useCommissionView();

  // Canonical stats (primary source for execution data)
  const { stats: canonicalStats } = useCanonicalRunStats(runId, strategyId ?? undefined, {
    commissionView,
  });

  const [trades, setTrades] = useState<ShadowTrade[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dataScope, setDataScope] = useState<DataScope>(defaultScope);

  // Inject run_id from useRunContext into the context
  const scopedContext: ActiveContext = useMemo(() => {
    const ctx = deriveContextForScope(activeContext, dataScope);
    if (runId) {
      return { ...ctx, run_id: runId, strategy_id: strategyId ?? ctx.strategy_id };
    }
    return ctx;
  }, [dataScope, runId, strategyId]);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getShadowTrades(500, scopedContext, dataScope);
        setTrades(data);
      } catch (e: any) {
        setError(e.message || "Failed to load trades");
      }
    }
    load();
  }, [scopedContext, dataScope]);

  const metrics = useMemo(() => {
    // Use canonical stats if available
    if (canonicalStats.dataSource === 'canonical' && canonicalStats.tradeCount > 0) {
      return {
        trades: canonicalStats.tradeCount,
        pnl: canonicalStats.cumulativePnL,
        wins: Math.round(canonicalStats.winRate * canonicalStats.tradeCount),
        loss: canonicalStats.tradeCount - Math.round(canonicalStats.winRate * canonicalStats.tradeCount),
        winRate: canonicalStats.winRate * 100,
        avgPnL: canonicalStats.tradeCount ? canonicalStats.cumulativePnL / canonicalStats.tradeCount : 0,
        dataSource: 'canonical' as const,
      };
    }
    // Fallback to shadow trades
    if (trades.length === 0) return null;
    const pnl = trades.reduce((acc, t) => acc + (t.net_pnl_eur ?? 0), 0);
    const wins = trades.filter((t) => (t.net_pnl_eur ?? 0) > 0).length;
    const loss = trades.length - wins;
    const winRate = trades.length ? (wins / trades.length) * 100 : 0;
    const avgPnL = trades.length ? pnl / trades.length : 0;
    return { trades: trades.length, pnl, wins, loss, winRate, avgPnL, dataSource: 'shadow' as const };
  }, [trades, canonicalStats]);

  const dataSourceType = metrics?.dataSource === 'canonical' ? 'canonical' : metrics?.dataSource === 'shadow' ? 'shadow' : undefined;

  return (
    <div className="card">
      {/* Run Metadata Banner - shows data source */}
      <RunMetadataBanner tradeCount={metrics?.trades ?? 0} dataSourceType={dataSourceType} />

      <div className="flex items-center justify-between mb-3 mt-2">
        <div className="text-lg font-semibold">{dataSourceType === 'canonical' ? 'Execution KPIs' : 'Shadow KPIs'}</div>
        <div className="flex flex-col items-end gap-2">
          <ScopeSelector scope={dataScope} onChange={setDataScope} />
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>
      </div>
      {dataScope.scope !== "TODAY" && (
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-100 mb-2">
          HISTORICAL VIEW · Scope {dataScope.scope}
        </div>
      )}
      {metrics == null ? (
        <div className="text-sm text-slate-400">Aucun trade pour l’instant.</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Kpi label="Trades" value={metrics.trades} />
          <Kpi label="Win rate" value={metrics.winRate} suffix="%" />
          <Kpi label="P&L net" value={metrics.pnl} suffix="EUR" positive />
          <Kpi label="Moy. trade" value={metrics.avgPnL} suffix="EUR" positive />
          <Kpi label="Wins" value={metrics.wins} />
          <Kpi label="Loss" value={metrics.loss} inverse />
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  suffix,
  positive,
  inverse,
}: {
  label: string;
  value: number;
  suffix?: string;
  positive?: boolean;
  inverse?: boolean;
}) {
  const ok = inverse ? value <= 0 : positive ? value >= 0 : undefined;
  return (
    <div className="rounded-lg border border-slate-700/70 px-3 py-2 bg-slate-800/50">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold">
          {value.toFixed(2).replace(".00", "")}
          {suffix ? ` ${suffix}` : ""}
        </span>
        {ok !== undefined && (
          <span
            className={`h-2 w-2 rounded-full ${ok ? "bg-success" : "bg-danger"
              }`}
          />
        )}
      </div>
    </div>
  );
}
