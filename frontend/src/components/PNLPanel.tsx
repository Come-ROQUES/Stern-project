import { useEffect, useState, useMemo } from "react";
import { formatDateTimeUTC } from "../lib/dateUtils";
import { api, Portfolio, IBAccountState } from "../lib/api";
import { ActiveContext, DataScope, activeContext, defaultScope, deriveContextForScope } from "../lib/activeContext";
import { ScopeSelector } from "./ui/ScopeSelector";
import { useRunId, useRunMeta } from "../lib/useRunContext";
import { RunMetadataBanner } from "./ui/RunMetadataBanner";
import { useCanonicalRunStats, ExecutionStats, useCanonicalTrades, CanonicalTrade } from "../lib/canonicalApi";
import { useCommissionView } from "../lib/useCommissionView";
import { usePortfolioEpochContext } from "../lib/PortfolioEpochContext";
import { ApexChart } from "../lib/ApexChart";

export type PortfolioView = {
  equitySeries: { x: number; y: number }[];
  metrics: {
    equity: number;
    startEquity: number;
    totalPnlNetUsd: number;
    totalPnlGrossUsd: number;
    totalPnlPips: number;
    winRate: number;
    trades: number;
    maxDrawdownUsd: number;
    commissionUsd: number;
    returnPct: number;
    commissionModel: 'REAL' | 'ESTIMATED';
  };
};

function isOrphanOrBackfill(trade: CanonicalTrade): boolean {
  const reason = (trade.exit_reason || "").toUpperCase();
  const run = (trade.run_id || "").toLowerCase();
  if (run.startsWith("orphan")) return true;
  if (reason.includes("ORPHAN")) return true;
  return reason === "ENTRY";
}

function isOutlierTrade(
  trade: CanonicalTrade,
  startingEquity: number
): boolean {
  const pnlUsd =
    trade.pnl_net_usd_used ??
    trade.pnl_net_usd ??
    (trade.pnl_net_eur_used != null && trade.fx_rate_used != null
      ? trade.pnl_net_eur_used * trade.fx_rate_used
      : null) ??
    (() => {
      const pips = trade.pnl_net_pips ?? trade.pnl_pips ?? 0;
      const qty = trade.qty ?? 0;
      return pips * qty * 0.0001;
    })();
  const pnlPips = trade.pnl_net_pips ?? trade.pnl_pips ?? 0;
  const maxUsd = startingEquity * 1.5;
  const maxPips = 500;
  return Math.abs(pnlUsd) > maxUsd || Math.abs(pnlPips) > maxPips;
}

export function sanitizeTradesForPortfolio(
  trades: CanonicalTrade[],
  startingEquity = 5_000
): CanonicalTrade[] {
  return trades
    .filter((t) => t.status === "CLOSED")
    .filter((t) => !isOrphanOrBackfill(t))
    .filter((t) => !isOutlierTrade(t, startingEquity));
}

export function computePaperPortfolioFromClosedTrades(
  closedTrades: CanonicalTrade[],
  startingEquity = 5_000,
  commissionView: 'reported' | 'economic' = 'economic'
): PortfolioView | null {
  if (!closedTrades.length) return null;

  const sorted = [...closedTrades].sort((a, b) => {
    const ta = new Date(a.exit_time || a.entry_time).getTime();
    const tb = new Date(b.exit_time || b.entry_time).getTime();
    return ta - tb;
  });

  const equitySeries: { x: number; y: number }[] = [];
  let equity = startingEquity;
  let maxEquity = startingEquity;
  let maxDrawdown = 0;
  let wins = 0;
  let commission = 0;
  let totalPips = 0;
  let totalNetUsd = 0;
  let totalGrossUsd = 0;
  const commissionModel: 'REAL' | 'ESTIMATED' =
    commissionView === 'economic' ? 'ESTIMATED' : 'REAL';

  for (const t of sorted) {
    const commissionUsed =
      t.commission_rt_usd_used ??
      t.commission_total_usd_economic ??
      t.commission_total_usd_reported ??
      t.commission_total_usd ??
      0;

    const pnlNetUsd =
      t.pnl_net_usd_used ??
      t.pnl_net_usd ??
      (t.pnl_net_eur_used != null && t.fx_rate_used != null
        ? t.pnl_net_eur_used * t.fx_rate_used
        : null) ??
      (() => {
        const pips = t.net_pips_used ?? t.pnl_net_pips ?? t.pnl_pips ?? 0;
        const qty = t.qty ?? 0;
        return pips * qty * 0.0001;
      })();

    const pnlGrossUsd =
      t.pnl_gross_usd_used ??
      t.pnl_gross_usd ??
      (pnlNetUsd != null ? pnlNetUsd + commissionUsed : null);

    commission += commissionUsed;
    const ts = new Date(t.exit_time || t.entry_time).getTime();
    equity += pnlNetUsd;
    totalNetUsd += pnlNetUsd;
    totalGrossUsd += pnlGrossUsd ?? pnlNetUsd;
    maxEquity = Math.max(maxEquity, equity);
    maxDrawdown = Math.max(maxDrawdown, maxEquity - equity);
    if (pnlNetUsd > 0) wins += 1;
    const pips = t.net_pips_used ?? t.pnl_net_pips ?? t.pnl_pips ?? 0;
    totalPips += pips;
    equitySeries.push({ x: ts, y: equity });
  }

  const tradesCount = sorted.length;
  const returnPct = ((equity - startingEquity) / startingEquity) * 100;
  const metrics = {
    equity,
    startEquity: startingEquity,
    totalPnlNetUsd: totalNetUsd,
    totalPnlGrossUsd: totalGrossUsd,
    totalPnlPips: totalPips,
    winRate: tradesCount ? (wins / tradesCount) * 100 : 0,
    trades: tradesCount,
    maxDrawdownUsd: maxDrawdown,
    commissionUsd: commission,
    returnPct,
    commissionModel,
  };
  return { equitySeries, metrics };
}

export function computePaperPortfolio(
  trades: CanonicalTrade[],
  startingEquity = 5_000,
  commissionView: 'reported' | 'economic' = 'economic'
): PortfolioView | null {
  const closed = sanitizeTradesForPortfolio(trades, startingEquity);
  return computePaperPortfolioFromClosedTrades(
    closed,
    startingEquity,
    commissionView
  );
}

function computeCostTotals(
  trades: CanonicalTrade[]
): { commissionUsd: number; slippageUsd: number; spreadUsd: number } {
  const closed = sanitizeTradesForPortfolio(trades);
  let commissionUsd = 0;
  let slippageUsd = 0;
  let spreadUsd = 0;
  for (const t of closed) {
    const qty = t.qty ?? 0;
    const pipValueUsd = qty * 0.0001;
    const comm =
      t.commission_rt_usd_used ??
      t.commission_total_usd_reported ??
      t.commission_total_usd_economic ??
      t.commission_total_usd ??
      0;
    const spreadPips = t.spread_pips_at_entry ?? 0;
    const slipPips =
      (t.entry_slippage_pips ?? 0) + (t.exit_slippage_pips ?? 0);
    commissionUsd += comm;
    spreadUsd += spreadPips * pipValueUsd;
    slippageUsd += slipPips * pipValueUsd;
  }
  return { commissionUsd, slippageUsd, spreadUsd };
}

export function PNLPanel() {
  // Run context - single source of truth
  const runId = useRunId();
  const { run } = useRunMeta();
  const strategyId = run?.strategy_id ?? null;

  // Portfolio epoch from global context
  const { selectedEpoch } = usePortfolioEpochContext();

  // Canonical stats (primary source for execution data)
  const { commissionView, setCommissionView } = useCommissionView();
  const { stats: canonicalStats } = useCanonicalRunStats(runId, run?.strategy_id, {
    commissionView,
  });
  const { trades: canonicalTrades, meta: tradesMeta, noRunId: canonicalNoRunId, error: canonicalTradesError, refresh: refreshTrades } = useCanonicalTrades(
    runId,
    500,
    { commissionView, strategyId: run?.strategy_id, portfolioEpoch: selectedEpoch ?? undefined, disablePolling: true }
  );

  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [ibAccount, setIbAccount] = useState<IBAccountState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataScope, setDataScope] = useState<DataScope>(defaultScope);

  // Inject run_id from useRunContext into the context
  const scopedContext: ActiveContext = useMemo(() => {
    const ctx = deriveContextForScope(activeContext, dataScope);
    if (runId) {
      return { ...ctx, run_id: runId, strategy_id: run?.strategy_id ?? ctx.strategy_id };
    }
    return ctx;
  }, [dataScope, runId, run?.strategy_id]);

  useEffect(() => {
    async function load() {
      try {
        const [port, ibState] = await Promise.all([
          api.getPortfolio(scopedContext, dataScope),
          api.getIBAccountState(100_000, scopedContext, dataScope),
        ]);
        setPortfolio(port);
        setIbAccount(ibState || null);
      } catch (e: any) {
        setError(e.message || "Failed to load P&L");
      }
    }
    load();
  }, [scopedContext, dataScope]);

  const livePnl = portfolio?.pnl ?? null;

  // Use canonical stats (shadow désactivé)
  const activeStats: ExecutionStats = useMemo(() => {
    if (canonicalStats.dataSource === 'canonical') {
      return canonicalStats;
    }
    return {
      winRate: 0,
      profitFactor: 0,
      sharpe: 0,
      dailyPnL: 0,
      cumulativePnL: 0,
      tradeCount: 0,
      dataSource: 'none',
    };
  }, [canonicalStats]);

  const mergedTrades = canonicalTrades;

  const paperPortfolio = useMemo(
    () => computePaperPortfolio(mergedTrades, 5_000, commissionView),
    [mergedTrades, commissionView]
  );
  const costTotals = useMemo(
    () => computeCostTotals(mergedTrades),
    [mergedTrades]
  );

  const ibPnlOfficial = useMemo(() => {
    if (!ibAccount) return null;
    const realized = ibAccount.positions?.total_realized_pnl ?? 0;
    const unrealized = ibAccount.positions?.total_unrealized_pnl ?? 0;
    return realized + unrealized;
  }, [ibAccount]);

  const totalCostsUsd =
    costTotals.commissionUsd + costTotals.slippageUsd + costTotals.spreadUsd;

  return (
    <div className="card glass">
      {/* Run Metadata Banner - shows data source */}
      <RunMetadataBanner
        tradeCount={activeStats.tradeCount}
        dataSourceType={activeStats.dataSource === 'none' ? undefined : activeStats.dataSource}
      />

      <div className="flex items-center justify-between mb-3 mt-2">
        <div>
          <div className="text-xs text-neutral-200 uppercase tracking-[0.18em]">
            P&L Canonical
          </div>
          <div className="text-sm text-neutral-400">
            Shadow désactivé (aucune requête aux endpoints shadow)
          </div>
        </div>
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
      <div className="grid gap-2 sm:gap-3 grid-cols-2 md:grid-cols-4">
        <Metric
          label="Execution P&L (canonical)"
          value={`${activeStats.cumulativePnL.toFixed(2)} USD`}
        />
        <Metric
          label="IB P&L (base)"
          value={ibPnlOfficial != null ? `${ibPnlOfficial >= 0 ? "+" : ""}${ibPnlOfficial.toFixed(2)}` : "n/a"}
        />
        <Metric
          label="Live P&L"
          value={livePnl != null ? `${livePnl.toFixed(2)} USD` : "n/a"}
        />
        <Metric
          label="Costs (comm+slip)"
          value={`${totalCostsUsd >= 0 ? "+" : ""}${totalCostsUsd.toFixed(2)} USD`}
        />
      </div>
      <div className="text-xs text-neutral-400 mt-2">
        PnL net = fills IB + commissions. Spread/slippage sont déjà inclus dans les
        prix de fill ; coûts affichés = diagnostic.
      </div>

      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-neutral-200 uppercase tracking-[0.18em]">
              Portfolio Paper 5K (Persistant)
            </div>
            <div className="text-sm text-neutral-400">
              Source: canonical_trades.sqlite (run)
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-neutral-400">Commission view</span>
            <div className="btn-group">
              <button
                onClick={() => { setCommissionView("economic"); refreshTrades(); }}
                className={`btn btn-xs ${commissionView === "economic" ? "btn-primary" : "btn-ghost"}`}
                title="Vue économique: plancher 2 USD par jambe si sortie manquante."
              >
                Éco (min 2 USD/jambe)
              </button>
              <button
                onClick={() => { setCommissionView("reported"); refreshTrades(); }}
                className={`btn btn-xs ${commissionView === "reported" ? "btn-primary" : "btn-ghost"}`}
                title="Vue IB reportée: commissions réellement reçues (paper IB)."
              >
                IB reporté
              </button>
            </div>
            <div className="badge badge-outline">
              view {tradesMeta?.commission_view_used ?? commissionView} · missing exit {Math.round(tradesMeta?.missing_exit_commission_pct ?? 0)}% · anomalies {tradesMeta?.anomaly_count ?? 0}
            </div>
          </div>
          {canonicalNoRunId && (
            <span className="text-xs text-amber-300">
              Run manquant : chargement canonique indisponible (cache utilisé si présent).
            </span>
          )}
          {canonicalTrades.length === 0 && !canonicalNoRunId && mergedTrades.length === 0 && (
            <span className="text-xs text-neutral-400">
              Aucun trade canonique pour ce run (panel reste visible).
            </span>
          )}
          {canonicalTradesError && !canonicalNoRunId && (
            <span className="text-xs text-amber-400">
              Canonical trades error: {canonicalTradesError}
            </span>
          )}
        </div>

        {paperPortfolio ? (
          <div className="grid gap-2 sm:gap-3 lg:gap-4 lg:grid-cols-[1.2fr_0.9fr]">
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <ApexChart
                type="area"
                height={300}
                series={[
                  {
                    name: "Equity",
                    data: paperPortfolio.equitySeries.map((p) =>
                      Number(p.y.toFixed(2))
                    ),
                  },
                ]}
                options={{
                  chart: { id: "paper-equity", toolbar: { show: false }, animations: { enabled: true } },
                  xaxis: {
                    type: "category",
                    categories: paperPortfolio.equitySeries.map((p) => {
                      const d = new Date(p.x);
                      return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
                    }),
                    labels: {
                      rotate: -45,
                      rotateAlways: false,
                      hideOverlappingLabels: true,
                      style: { colors: "#9ca3af", fontSize: "10px" },
                    },
                    axisTicks: { show: false },
                    title: { text: "Trade #", style: { color: "#9ca3af", fontSize: "10px" } },
                  },
                  yaxis: { labels: { style: { colors: "#9ca3af" } }, title: { text: "USD", style: { color: "#9ca3af" } } },
                  stroke: { width: 2, curve: "straight" },
                  dataLabels: { enabled: false },
                  fill: { type: "gradient", gradient: { shadeIntensity: 0.5, opacityFrom: 0.3, opacityTo: 0.05 } },
                  colors: ["#2CE3FF"],
                  grid: { borderColor: "rgba(255,255,255,0.08)" },
                  tooltip: {
                    theme: "dark",
                    custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
                      const pt = paperPortfolio.equitySeries[dataPointIndex];
                      if (!pt) return "";
                      const d = new Date(pt.x);
                      const ts = `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
                      return `<div style="padding:6px 10px;font-size:12px;background:#1a1a2e;border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:#e5e7eb;">
                        <div style="font-weight:600;">Trade #${dataPointIndex + 1}</div>
                        <div>${ts} UTC</div>
                        <div>Equity: $${pt.y.toFixed(2)}</div>
                      </div>`;
                    },
                  },
                }}
              />
            </div>

            <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Equity" value={`USD ${paperPortfolio.metrics.equity.toFixed(2)}`} />
                <Metric label="Return" value={`${paperPortfolio.metrics.returnPct.toFixed(2)}%`} />
                <Metric label="Trades" value={`${paperPortfolio.metrics.trades}`} />
                <Metric label="Win rate" value={`${paperPortfolio.metrics.winRate.toFixed(1)}%`} />
                <Metric label="Max DD" value={`USD ${paperPortfolio.metrics.maxDrawdownUsd.toFixed(2)}`} />
                <Metric label="Commission" value={`USD ${paperPortfolio.metrics.commissionUsd.toFixed(2)}`} />
              </div>
              <div className="text-xs text-neutral-400">
                Start equity: USD {paperPortfolio.metrics.startEquity.toFixed(0)} · PnL net: USD {paperPortfolio.metrics.totalPnlNetUsd.toFixed(2)} ({paperPortfolio.metrics.totalPnlPips.toFixed(1)} pips)
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-neutral-400">
            {mergedTrades.length === 0
              ? "Aucun trade canonique pour ce run."
              : canonicalNoRunId
                ? "Run manquant : ajoute un run pour charger les trades."
                : "Trades trouvés mais aucun clos pour calculer le portefeuille."}
          </div>
        )}

        {mergedTrades.length > 0 && (
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="text-sm font-semibold text-neutral-100 mb-2">
              Trades paper (canonique + cache persistant)
            </div>
            <div className="text-[11px] text-neutral-400 mb-1">
              Coûts affichés : {commissionView === "economic" ? "théoriques (min 2 USD par jambe)" : "IB réel (reporté)"}.
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left">
                <thead className="text-neutral-400">
                  <tr>
                    <th className="px-2 py-1">Entry</th>
                    <th className="px-2 py-1">Side</th>
                    <th className="px-2 py-1">Qty</th>
                    <th className="px-2 py-1">Entry</th>
                    <th className="px-2 py-1">Exit</th>
                    <th className="px-2 py-1">PnL brut USD</th>
                    <th className="px-2 py-1">PnL net USD</th>
                    <th className="px-2 py-1">Comm USD</th>
                    <th className="px-2 py-1">PnL pips</th>
                    <th className="px-2 py-1">Exit reason</th>
                  </tr>
                </thead>
                <tbody>
                  {mergedTrades.slice(0, 20).map((t) => {
                    const commissionUsed = t.commission_rt_usd_used ?? t.commission_total_usd_economic ?? t.commission_total_usd_reported ?? t.commission_total_usd ?? 0;
                    const pnlGross = t.pnl_gross_usd ?? ((t.pnl_net_usd_used ?? t.pnl_net_usd ?? 0) + commissionUsed);
                    const pnlNet = pnlGross - commissionUsed;
                    const pnlPips = t.pnl_net_pips ?? t.pnl_pips ?? 0;
                    return (
                      <tr key={t.trade_id} className="border-t border-white/5">
                        <td className="px-2 py-1 text-neutral-300">
                          {formatDateTimeUTC(t.entry_time)} UTC
                        </td>
                        <td className="px-2 py-1">{t.side}</td>
                        <td className="px-2 py-1">{t.qty?.toFixed(0) ?? "n/a"}</td>
                        <td className="px-2 py-1">{t.entry_price?.toFixed(5) ?? "n/a"}</td>
                        <td className="px-2 py-1">{t.exit_price?.toFixed(5) ?? "—"}</td>
                        <td className={`px-2 py-1 ${pnlGross >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                          {pnlGross.toFixed(2)}
                        </td>
                        <td className={`px-2 py-1 ${pnlNet >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                          {pnlNet.toFixed(2)}
                        </td>
                        <td className="px-2 py-1">{commissionUsed.toFixed(2)}</td>
                        <td className="px-2 py-1">
                          {pnlPips.toFixed(2)}
                        </td>
                        <td className="px-2 py-1 text-neutral-400">{t.exit_reason || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <div className="text-xs text-neutral-400">{label}</div>
      <div className="text-lg font-semibold text-neutral-100">{value}</div>
    </div>
  );
}
