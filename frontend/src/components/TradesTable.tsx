import { useEffect, useMemo, useState } from "react";
import { api, ShadowTrade } from "../lib/api";
import { useRunId, useRunMeta } from "../lib/useRunContext";
import { RunMetadataBanner } from "./ui/RunMetadataBanner";
import { activeContext, defaultScope, deriveContextForScope } from "../lib/activeContext";
import { useCanonicalTrades, CanonicalTrade } from "../lib/canonicalApi";
import { useCommissionView } from "../lib/useCommissionView";
import { formatDateTimeUTC } from "../lib/dateUtils";
import { useIsMobile } from "../lib/useIsMobile";

export function TradesTable() {
  // Run context - single source of truth
  const runId = useRunId();
  const { run } = useRunMeta();
  const strategyId = run?.strategy_id ?? null;
  const { commissionView } = useCommissionView();

  // Canonical trades (primary source)
  const { trades: canonicalTrades } = useCanonicalTrades(runId, 100, {
    strategyId: strategyId ?? undefined,
    commissionView,
    disablePolling: true,
  });

  const [shadowTrades, setShadowTrades] = useState<ShadowTrade[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Create context with run_id injected
  const scopedContext = useMemo(() => {
    const ctx = deriveContextForScope(activeContext, defaultScope);
    if (runId) {
      return { ...ctx, run_id: runId, strategy_id: strategyId ?? ctx.strategy_id };
    }
    return ctx;
  }, [runId, strategyId]);

  useEffect(() => {
    api
      .getShadowTrades(100, scopedContext, defaultScope)
      .then(setShadowTrades)
      .catch((e: any) => setError(e.message || "Failed to load trades"));
  }, [scopedContext]);

  // Determine which data source to use
  const useCanonical = canonicalTrades.length > 0;
  const dataSourceType = useCanonical ? 'canonical' : (shadowTrades.length > 0 ? 'shadow' : undefined);
  const tradeCount = useCanonical ? canonicalTrades.length : shadowTrades.length;

  return (
    <div className="card glass">
      {/* Run Metadata Banner - shows data source */}
      <RunMetadataBanner tradeCount={tradeCount} dataSourceType={dataSourceType} />

      <div className="flex items-center justify-between mb-2 mt-2">
        <div>
          <div className="text-xs text-neutral-200 uppercase tracking-[0.18em]">Trades</div>
          <div className="text-sm text-neutral-400">{useCanonical ? 'Canonical (Paper/Live)' : 'Shadow (Research)'} · derniers 100</div>
        </div>
        {error && <span className="text-xs text-danger">{error}</span>}
        {!error && <span className="text-xs text-neutral-400">{tradeCount} rows</span>}
      </div>
      <div className="overflow-auto max-h-80 lg:max-h-96">
        {useCanonical ? (
          <CanonicalTradesView trades={canonicalTrades} />
        ) : (
          <ShadowTradesView trades={shadowTrades} />
        )}
      </div>
    </div>
  );
}

function CanonicalTradesView({ trades }: { trades: CanonicalTrade[] }) {
  const isMobile = useIsMobile();
  const [visibleCount, setVisibleCount] = useState(40);

  useEffect(() => {
    setVisibleCount(40);
  }, [trades]);

  const computeNetPnlUsd = (t: CanonicalTrade): number | null => {
    if (t.pnl_net_usd_used != null) return t.pnl_net_usd_used;
    if (t.pnl_net_usd != null) return t.pnl_net_usd;
    if (t.pnl_net_eur_used != null && t.fx_rate_used != null) {
      return t.pnl_net_eur_used * t.fx_rate_used;
    }
    const pips = t.net_pips_used ?? t.pnl_net_pips ?? t.pnl_pips ?? null;
    if (pips == null) return null;
    const qty = t.qty ?? 0;
    return pips * qty * 0.0001;
  };

  if (trades.length === 0) {
    return <div className="py-2 text-xs text-neutral-400">No trades yet.</div>;
  }

  // Mobile: card layout
  if (isMobile) {
    const displayed = trades.slice(0, 20);
    return (
      <div className="space-y-2">
        {displayed.map((t) => {
          const pnl = computeNetPnlUsd(t) ?? 0;
          return (
            <div key={t.trade_id} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${t.side === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                    {t.side}
                  </span>
                  <span className="text-[11px] text-neutral-400">{formatDateTimeUTC(t.entry_time)}</span>
                </div>
                <span className={`text-sm font-semibold ${pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} $
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-[11px] text-neutral-300">
                <span>{t.entry_price?.toFixed(5) ?? '—'} → {t.exit_price?.toFixed(5) ?? '—'}</span>
                <span className="text-neutral-500">Qty {t.qty ?? '—'}</span>
                <span className="text-neutral-500 ml-auto">{t.status}</span>
              </div>
            </div>
          );
        })}
        {trades.length > 20 && (
          <div className="text-center text-xs text-neutral-500 py-2">
            +{trades.length - 20} trades masques
          </div>
        )}
      </div>
    );
  }

  const visibleTrades = trades.slice(0, visibleCount);
  const hasMore = trades.length > visibleCount;

  // Desktop: table layout (unchanged)
  return (
    <div>
      <table className="w-full text-xs text-neutral-200">
        <thead className="text-neutral-400">
          <tr className="border-b border-white/5">
            <th className="py-1 pr-2 text-left">Date</th>
            <th className="py-1 pr-2 text-left">Side</th>
            <th className="py-1 pr-2 text-left">Entry</th>
            <th className="py-1 pr-2 text-left">Exit</th>
            <th className="py-1 pr-2 text-left">Qty</th>
            <th className="py-1 pr-2 text-left">PnL (USD)</th>
            <th className="py-1 pr-2 text-left">Status</th>
          </tr>
        </thead>
        <tbody>
          {visibleTrades.map((t) => (
            <tr key={t.trade_id} className="border-b border-white/5">
              <td className="py-1 pr-2">{formatDateTimeUTC(t.entry_time)} UTC</td>
              <td className="py-1 pr-2 font-semibold">{t.side}</td>
              <td className="py-1 pr-2">{t.entry_price?.toFixed(5) ?? 'n/a'}</td>
              <td className="py-1 pr-2">{t.exit_price?.toFixed(5) ?? 'n/a'}</td>
              <td className="py-1 pr-2">{t.qty ?? 'n/a'}</td>
              <td className={`py-1 pr-2 font-semibold ${(computeNetPnlUsd(t) ?? 0) >= 0 ? "text-success" : "text-danger"}`}>
                {(computeNetPnlUsd(t) ?? 0).toFixed(2)}
              </td>
              <td className="py-1 pr-2">{t.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {hasMore && (
        <div className="flex justify-center pt-3">
          <button
            type="button"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-neutral-200 hover:bg-white/10"
            onClick={() => setVisibleCount((count) => Math.min(count + 40, trades.length))}
          >
            Afficher 40 lignes de plus
          </button>
        </div>
      )}
    </div>
  );
}

function ShadowTradesView({ trades }: { trades: ShadowTrade[] }) {
  const isMobile = useIsMobile();
  const [visibleCount, setVisibleCount] = useState(40);

  useEffect(() => {
    setVisibleCount(40);
  }, [trades]);

  if (trades.length === 0) {
    return <div className="py-2 text-xs text-neutral-400">No trades yet.</div>;
  }

  // Mobile: card layout
  if (isMobile) {
    const displayed = trades.slice(0, 20);
    return (
      <div className="space-y-2">
        {displayed.map((t) => {
          const pnl = t.net_pnl_eur ?? 0;
          return (
            <div key={t.timestamp_entry} className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${t.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                    {t.direction}
                  </span>
                  <span className="text-[11px] text-neutral-400">{t.timestamp_entry}</span>
                </div>
                <span className={`text-sm font-semibold ${pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} EUR
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-[11px] text-neutral-300">
                <span>{t.entry_price?.toFixed(5)} → {t.exit_price ? t.exit_price.toFixed(5) : '—'}</span>
                <span className="text-neutral-500">{t.exit_reason || '—'}</span>
                <span className="text-neutral-500 ml-auto">{t.session || '—'}</span>
              </div>
            </div>
          );
        })}
        {trades.length > 20 && (
          <div className="text-center text-xs text-neutral-500 py-2">
            +{trades.length - 20} trades masques
          </div>
        )}
      </div>
    );
  }

  const visibleTrades = trades.slice(0, visibleCount);
  const hasMore = trades.length > visibleCount;

  // Desktop: table layout (unchanged)
  return (
    <div>
      <table className="w-full text-xs text-neutral-200">
        <thead className="text-neutral-400">
          <tr className="border-b border-white/5">
            <th className="py-1 pr-2 text-left">Date</th>
            <th className="py-1 pr-2 text-left">Dir</th>
            <th className="py-1 pr-2 text-left">Entry</th>
            <th className="py-1 pr-2 text-left">Exit</th>
            <th className="py-1 pr-2 text-left">Spread</th>
            <th className="py-1 pr-2 text-left">Net EUR</th>
            <th className="py-1 pr-2 text-left">Session</th>
            <th className="py-1 pr-2 text-left">Exit reason</th>
          </tr>
        </thead>
        <tbody>
          {visibleTrades.map((t) => (
            <tr key={t.timestamp_entry} className="border-b border-white/5">
              <td className="py-1 pr-2">{t.timestamp_entry}</td>
              <td className="py-1 pr-2 font-semibold">{t.direction}</td>
              <td className="py-1 pr-2">{t.entry_price?.toFixed(5)}</td>
              <td className="py-1 pr-2">{t.exit_price ? t.exit_price.toFixed(5) : "n/a"}</td>
              <td className="py-1 pr-2">{t.spread_pips_entry ?? "n/a"}</td>
              <td className={`py-1 pr-2 font-semibold ${(t.net_pnl_eur ?? 0) >= 0 ? "text-success" : "text-danger"}`}>
                {(t.net_pnl_eur ?? 0).toFixed(2)}
              </td>
              <td className="py-1 pr-2">{t.session || "?"}</td>
              <td className="py-1 pr-2 text-neutral-400">{t.exit_reason || "n/a"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {hasMore && (
        <div className="flex justify-center pt-3">
          <button
            type="button"
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-neutral-200 hover:bg-white/10"
            onClick={() => setVisibleCount((count) => Math.min(count + 40, trades.length))}
          >
            Afficher 40 lignes de plus
          </button>
        </div>
      )}
    </div>
  );
}
