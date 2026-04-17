import { useMemo } from "react";
import { GlassBadge } from "./ui/glass";
import {
  useCanonicalTrades,
  useCanonicalRunStats,
  type CanonicalTrade,
} from "../lib/canonicalApi";

const S2_STRATEGY_ID = "s2_pairs_trading";

function fmtNum(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return value.toFixed(digits);
}

function fmtUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const sign = value >= 0 ? "+" : "";
  return `${sign}$${value.toFixed(2)}`;
}

function pnlColor(v: number): string {
  return v >= 0 ? "text-emerald-200" : "text-rose-200";
}

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

const KpiCell = ({
  label,
  value,
  colorize,
}: {
  label: string;
  value: string;
  colorize?: string;
}) => (
  <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
    <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-500">
      {label}
    </div>
    <div
      className={`mt-0.5 text-lg font-semibold ${colorize ?? "text-white"}`}
    >
      {value}
    </div>
  </div>
);

export function S2PaperPnlCard({
  runId,
}: {
  runId: string | null | undefined;
}) {
  const { stats, loading } = useCanonicalRunStats(runId, S2_STRATEGY_ID, {
    disablePolling: true,
    commissionView: "reported",
  });

  const { trades } = useCanonicalTrades(runId, 50, {
    disablePolling: true,
    strategyId: S2_STRATEGY_ID,
    commissionView: "reported",
  });

  const byExitReason = useMemo(() => {
    const map: Record<
      string,
      { count: number; pnl_usd: number; wins: number }
    > = {};
    for (const t of trades) {
      if (t.status !== "CLOSED") continue;
      const reason = t.exit_reason ?? "UNKNOWN";
      if (!map[reason]) map[reason] = { count: 0, pnl_usd: 0, wins: 0 };
      const pnl = resolveNetPnlUsd(t);
      map[reason].count += 1;
      map[reason].pnl_usd += pnl;
      if (pnl > 0) map[reason].wins += 1;
    }
    return Object.entries(map).map(([reason, data]) => ({
      reason,
      ...data,
      win_rate: data.count > 0 ? (data.wins / data.count) * 100 : 0,
    }));
  }, [trades]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-4 w-24 rounded bg-white/10" />
        <div className="h-20 w-full rounded bg-white/10" />
      </div>
    );
  }

  if (!stats || stats.dataSource === "none") {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs text-neutral-400">
        Aucun trade IB S2 pour ce run.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
            Paper PnL (IB)
          </span>
          <GlassBadge variant="info" size="sm">
            CANONICAL
          </GlassBadge>
        </div>
        <span className="text-xs text-neutral-400">
          {stats.tradeCount} trades
        </span>
      </div>

      {/* Row 1 -- KPIs principaux */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <KpiCell
          label="PnL cumul"
          value={fmtUsd(stats.cumulativePnL)}
          colorize={pnlColor(stats.cumulativePnL)}
        />
        <KpiCell
          label="Win rate"
          value={`${fmtNum(stats.winRate * 100)}%`}
        />
        <KpiCell label="Sharpe" value={fmtNum(stats.sharpe, 2)} />
        <KpiCell
          label="Profit factor"
          value={fmtNum(stats.profitFactor, 2)}
        />
      </div>

      {/* Row 2 -- Daily + trades */}
      <div className="grid grid-cols-2 gap-2">
        <KpiCell
          label="PnL today"
          value={fmtUsd(stats.dailyPnL)}
          colorize={pnlColor(stats.dailyPnL)}
        />
        <KpiCell label="Trades" value={String(stats.tradeCount)} />
      </div>

      {/* Row 3 -- Breakdown par exit reason */}
      {byExitReason.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/30">
          <table className="w-full text-[11px] text-neutral-300">
            <thead>
              <tr className="border-b border-white/10 text-left text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                <th className="px-3 py-2">Exit reason</th>
                <th className="px-3 py-2 text-right">Count</th>
                <th className="px-3 py-2 text-right">PnL USD</th>
                <th className="px-3 py-2 text-right">Win rate</th>
              </tr>
            </thead>
            <tbody>
              {byExitReason.map((row) => (
                <tr
                  key={row.reason}
                  className="border-b border-white/5 last:border-0"
                >
                  <td className="px-3 py-1.5">
                    <GlassBadge variant="muted" size="sm">
                      {row.reason}
                    </GlassBadge>
                  </td>
                  <td className="px-3 py-1.5 text-right">{row.count}</td>
                  <td
                    className={`px-3 py-1.5 text-right ${pnlColor(row.pnl_usd)}`}
                  >
                    {fmtUsd(row.pnl_usd)}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {fmtNum(row.win_rate)}%
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
