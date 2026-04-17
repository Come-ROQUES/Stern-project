import { useState } from "react";
import { GlassBadge } from "./ui/glass";
import { useIsMobile } from "../lib/useIsMobile";
import {
  useCanonicalTrades,
  type CanonicalTrade,
} from "../lib/canonicalApi";
import { formatDateTimeUTC } from "../lib/dateUtils";

const S2_STRATEGY_ID = "s2_pairs_trading";
const INITIAL_LIMIT = 20;

function resolveNetPnlUsd(trade: CanonicalTrade): number {
  if (trade.pnl_net_usd_used != null) return trade.pnl_net_usd_used;
  if (trade.pnl_net_usd != null) return trade.pnl_net_usd;
  if (trade.pnl_net_eur_used != null && trade.fx_rate_used != null) {
    return trade.pnl_net_eur_used * trade.fx_rate_used;
  }
  const pips =
    trade.net_pips_used ?? trade.pnl_net_pips ?? trade.pnl_pips ?? 0;
  const qty = trade.qty ?? 0;
  return pips * qty * 0.0001;
}

function fmtUsd(v: number): string {
  const sign = v >= 0 ? "+" : "";
  return `${sign}$${v.toFixed(2)}`;
}

function pnlColor(v: number): string {
  return v >= 0 ? "text-emerald-300" : "text-rose-300";
}

function exitBadgeVariant(
  reason: string | null | undefined
): "success" | "danger" | "warning" | "muted" {
  if (!reason) return "muted";
  const r = reason.toUpperCase();
  if (r.includes("TP") || r.includes("MEAN_REVERT")) return "success";
  if (r.includes("SL") || r.includes("STOP")) return "danger";
  if (r.includes("TIME")) return "warning";
  return "muted";
}

function TradeCard({ trade }: { trade: CanonicalTrade }) {
  const pnl = resolveNetPnlUsd(trade);
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GlassBadge
            variant={trade.side === "BUY" ? "success" : "danger"}
            size="sm"
          >
            {trade.side}
          </GlassBadge>
          <span className="text-[11px] text-neutral-400">{trade.symbol}</span>
        </div>
        <span className={`text-sm font-semibold ${pnlColor(pnl)}`}>
          {fmtUsd(pnl)}
        </span>
      </div>
      <div className="flex items-center justify-between text-[10px] text-neutral-500">
        <span>{formatDateTimeUTC(trade.entry_time)}</span>
        <GlassBadge variant={exitBadgeVariant(trade.exit_reason)} size="sm">
          {trade.exit_reason ?? trade.status}
        </GlassBadge>
      </div>
    </div>
  );
}

export function S2TradeList({
  runId,
}: {
  runId: string | null | undefined;
}) {
  const [showAll, setShowAll] = useState(false);
  const isMobile = useIsMobile();

  const { trades, loading } = useCanonicalTrades(runId, 200, {
    disablePolling: true,
    strategyId: S2_STRATEGY_ID,
    commissionView: "reported",
  });

  if (loading) {
    return (
      <div className="animate-pulse h-20 w-full rounded-xl bg-white/10" />
    );
  }

  const closed = trades.filter((t) => t.status === "CLOSED");
  if (closed.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-center text-xs text-neutral-400">
        Aucun trade IB S2 cloture.
      </div>
    );
  }

  const visible = showAll ? closed : closed.slice(0, INITIAL_LIMIT);

  // Mobile: cards
  if (isMobile) {
    return (
      <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          Trades IB S2 ({closed.length})
        </div>
        {visible.map((t) => (
          <TradeCard key={t.trade_id} trade={t} />
        ))}
        {closed.length > INITIAL_LIMIT && !showAll && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full rounded-lg border border-white/10 bg-white/5 py-2 text-xs text-neutral-300 hover:bg-white/10"
          >
            Voir les {closed.length} trades
          </button>
        )}
      </div>
    );
  }

  // Desktop: table
  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
        Trades IB S2 ({closed.length})
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/30">
        <table className="w-full text-[11px] text-neutral-300">
          <thead>
            <tr className="border-b border-white/10 text-left text-[10px] uppercase tracking-[0.2em] text-neutral-500">
              <th className="px-3 py-2">Entry</th>
              <th className="px-3 py-2">Exit</th>
              <th className="px-3 py-2">Side</th>
              <th className="px-3 py-2">Symbol</th>
              <th className="px-3 py-2 text-right">PnL USD</th>
              <th className="px-3 py-2">Exit reason</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((t) => {
              const pnl = resolveNetPnlUsd(t);
              return (
                <tr
                  key={t.trade_id}
                  className="border-b border-white/5 last:border-0"
                >
                  <td className="px-3 py-1.5 text-neutral-400">
                    {formatDateTimeUTC(t.entry_time)}
                  </td>
                  <td className="px-3 py-1.5 text-neutral-400">
                    {formatDateTimeUTC(t.exit_time)}
                  </td>
                  <td className="px-3 py-1.5">
                    <GlassBadge
                      variant={t.side === "BUY" ? "success" : "danger"}
                      size="sm"
                    >
                      {t.side}
                    </GlassBadge>
                  </td>
                  <td className="px-3 py-1.5">{t.symbol}</td>
                  <td
                    className={`px-3 py-1.5 text-right font-semibold ${pnlColor(pnl)}`}
                  >
                    {fmtUsd(pnl)}
                  </td>
                  <td className="px-3 py-1.5">
                    <GlassBadge
                      variant={exitBadgeVariant(t.exit_reason)}
                      size="sm"
                    >
                      {t.exit_reason ?? t.status}
                    </GlassBadge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {closed.length > INITIAL_LIMIT && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full rounded-lg border border-white/10 bg-white/5 py-2 text-xs text-neutral-300 hover:bg-white/10"
        >
          Voir les {closed.length} trades
        </button>
      )}
    </div>
  );
}
