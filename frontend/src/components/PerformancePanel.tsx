import { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type DashboardPortfolioSnapshot,
  type DwSummary,
  type ExecutionMetricsResponse,
  type IBAccountState,
  type Ohlc,
  type S2Summary,
} from "../lib/api";
import {
  CanonicalTrade,
  CanonicalTradesResponse,
  PortfolioSummaryResponse,
  canonicalApi,
} from "../lib/canonicalApi";
import { RunMetadataBanner } from "./ui/RunMetadataBanner";
import {
  computePaperPortfolio,
  sanitizeTradesForPortfolio,
  type PortfolioView,
} from "./PNLPanel";
import { TimeframeOption } from "../lib/aggregateCandles";
import {
  useDashboardCandles,
  useDashboardTimeframe,
} from "../lib/timeframeContext";
import { TimeframeSelector } from "./ui/TimeframeSelector";
import { useRunId, useRunMeta } from "../lib/useRunContext";
import { usePortfolioEpochContext } from "../lib/PortfolioEpochContext";
import { activeContext } from "../lib/activeContext";
import { formatDateTimeUTC } from "../lib/dateUtils";
import { useBundleRuns } from "../lib/useBundleRuns";
import { useCommissionView } from "../lib/useCommissionView";
import { ApexChart } from "../lib/ApexChart";

function formatDate(value?: string | number | null) {
  if (!value) return "—";
  return `${formatDateTimeUTC(value)} UTC`;
}

function formatPips(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "n/a";
  return `${value.toFixed(2)}p`;
}

function formatMs(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "n/a";
  return `${value.toFixed(0)}ms`;
}

function formatUsd(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "n/a";
  return `USD ${value.toFixed(2)}`;
}

function sortTradesByExit(trades: CanonicalTrade[]) {
  return [...trades].sort((a, b) => {
    const ta = new Date(a.exit_time || a.entry_time).getTime();
    const tb = new Date(b.exit_time || b.entry_time).getTime();
    return tb - ta;
  });
}

type RunSummary = {
  pnlNetUsd: number;
  pnlGrossUsd: number;
  commissionUsd: number;
  trades: number;
  winRate: number;
  lastExitTs: number | null;
};

const RUN_TRADES_LIMIT = 2000;

function commissionUsed(trade: CanonicalTrade): number {
  return (
    trade.commission_rt_usd_used ??
    trade.commission_total_usd_economic ??
    trade.commission_total_usd_reported ??
    trade.commission_total_usd ??
    0
  );
}

function computeNetPnlUsd(trade: CanonicalTrade): number {
  if (trade.pnl_net_usd_used != null) return trade.pnl_net_usd_used;
  if (trade.pnl_net_usd != null) return trade.pnl_net_usd;
  if (trade.pnl_net_eur_used != null && trade.fx_rate_used != null) {
    return trade.pnl_net_eur_used * trade.fx_rate_used;
  }
  const pips = trade.net_pips_used ?? trade.pnl_net_pips ?? trade.pnl_pips ?? 0;
  const qty = trade.qty ?? 0;
  return pips * qty * 0.0001;
}

function pipsToUsd(trade: CanonicalTrade, pips: number | null | undefined): number {
  if (pips == null) return 0;
  const qty = trade.qty ?? 0;
  return pips * qty * 0.0001;
}

function summarizeRunTrades(trades: CanonicalTrade[]): RunSummary | null {
  const closed = trades.filter(
    (t) => t.exit_price != null && t.status !== "OPEN"
  );
  if (!closed.length) return null;

  let pnlNetUsd = 0;
  let pnlGrossUsd = 0;
  let commissionUsd = 0;
  let wins = 0;
  let lastExitTs: number | null = null;

  closed.forEach((t) => {
    const comm = commissionUsed(t);
    const gross =
      t.pnl_gross_usd_used ??
      t.pnl_gross_usd ??
      (computeNetPnlUsd(t) ?? 0) + comm;
    const net = computeNetPnlUsd(t) ?? (gross != null ? gross - comm : 0);
    pnlNetUsd += net;
    pnlGrossUsd += gross ?? net;
    commissionUsd += comm;
    if (net > 0) wins += 1;
    const ts = new Date(t.exit_time || t.entry_time).getTime();
    if (!Number.isNaN(ts)) {
      if (lastExitTs === null || ts > lastExitTs) {
        lastExitTs = ts;
      }
    }
  });

  const tradesCount = closed.length;
  const winRate = tradesCount ? (wins / tradesCount) * 100 : 0;

  return {
    pnlNetUsd,
    pnlGrossUsd,
    commissionUsd,
    trades: tradesCount,
    winRate,
    lastExitTs,
  };
}

export function PerformancePanel() {
  const runId = useRunId();
  const { run } = useRunMeta();
  const { enabled: bundleEnabled, dwRunId, s2RunId, tfRunId } = useBundleRuns();
  const strategyId = run?.strategy_id ?? null;
  const dwRunIdEffective = bundleEnabled
    ? dwRunId
    : strategyId === "damping_wave"
    ? runId
    : null;
  const s2RunIdEffective = bundleEnabled
    ? s2RunId && s2RunId !== dwRunIdEffective
      ? s2RunId
      : null
    : strategyId === "s2_pairs_trading"
    ? runId
    : null;
  const tfRunIdEffective = bundleEnabled
    ? tfRunId && tfRunId !== dwRunIdEffective && tfRunId !== s2RunIdEffective
      ? tfRunId
      : null
    : strategyId === "tf_pullback_v1"
    ? runId
    : null;
  const tfSummaryRunId = tfRunIdEffective ?? dwRunIdEffective ?? null;
  const overviewSeedRunId = bundleEnabled
    ? dwRunIdEffective ?? s2RunIdEffective ?? tfRunIdEffective ?? null
    : runId ?? dwRunIdEffective ?? s2RunIdEffective ?? tfRunIdEffective ?? null;
  const dwStrategyId = "damping_wave";
  const [trades, setTrades] = useState<CanonicalTrade[]>([]);
  const [tradesMeta, setTradesMeta] = useState<CanonicalTradesResponse["_meta"]>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runTrades, setRunTrades] = useState<CanonicalTrade[]>([]);
  const [runTradesMeta, setRunTradesMeta] = useState<CanonicalTradesResponse["_meta"]>();
  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const { commissionView, setCommissionView } = useCommissionView();
  const [ibAccount, setIbAccount] = useState<IBAccountState | null>(null);
  const [ibError, setIbError] = useState<string | null>(null);
  const [selectedTrade, setSelectedTrade] = useState<CanonicalTrade | null>(
    null
  );
  const [tradeOhlc, setTradeOhlc] = useState<Ohlc[]>([]);
  const [tradeOhlcLoading, setTradeOhlcLoading] = useState(false);
  const [tradeOhlcError, setTradeOhlcError] = useState<string | null>(null);
  const [s2Summary, setS2Summary] = useState<S2Summary | null>(null);
  const [s2Error, setS2Error] = useState<string | null>(null);
  const [tfSummary, setTfSummary] = useState<DwSummary | null>(null);
  const [tfError, setTfError] = useState<string | null>(null);
  const [portfolioSummary, setPortfolioSummary] =
    useState<PortfolioSummaryResponse | null>(null);
  const [executionMetrics, setExecutionMetrics] =
    useState<ExecutionMetricsResponse | null>(null);
  const [executionMetricsLoading, setExecutionMetricsLoading] = useState(false);
  const [executionMetricsError, setExecutionMetricsError] = useState<string | null>(
    null
  );
  const loadedPortfolioSnapshotRef = useRef(false);
  const [includeOpen, setIncludeOpen] = useState(false);
  const { timeframe, allowedTimeframes, setTimeframe } = useDashboardTimeframe();
  const aggregatedTradeOhlc = useDashboardCandles(tradeOhlc, 150);
  const selectedBreakdown = useMemo(() => {
    if (!selectedTrade) return null;
    const commissionUsd = commissionUsed(selectedTrade);
    const spreadPips = selectedTrade.spread_pips_at_entry ?? 0;
    const spreadUsd = pipsToUsd(selectedTrade, spreadPips);
    const entrySlipPips = selectedTrade.entry_slippage_pips ?? 0;
    const exitSlipPips = selectedTrade.exit_slippage_pips ?? 0;
    const slipPips = entrySlipPips + exitSlipPips;
    const slipUsd = pipsToUsd(selectedTrade, slipPips);
    const netUsd = computeNetPnlUsd(selectedTrade);
    const grossUsd = netUsd + commissionUsd + spreadUsd + slipUsd;
    return {
      commissionUsd,
      spreadPips,
      spreadUsd,
      entrySlipPips,
      exitSlipPips,
      slipPips,
      slipUsd,
      grossUsd,
      netUsd,
    };
  }, [selectedTrade]);

  const spreadBuckets = useMemo(() => {
    if (!executionMetrics) return [];
    const order = ["TIGHT", "NORMAL", "WIDE", "UNKNOWN"];
    return Object.entries(executionMetrics.by_spread_regime || {}).sort(
      ([a], [b]) => order.indexOf(a) - order.indexOf(b)
    );
  }, [executionMetrics]);

  const volBuckets = useMemo(() => {
    if (!executionMetrics) return [];
    const order = ["LOW", "MEDIUM", "HIGH", "UNKNOWN"];
    return Object.entries(executionMetrics.by_vol_regime || {}).sort(
      ([a], [b]) => order.indexOf(a) - order.indexOf(b)
    );
  }, [executionMetrics]);

  const latencyHist = useMemo(
    () => executionMetrics?.latency_hist_ms ?? [],
    [executionMetrics]
  );
  const latencyHistMax = useMemo(() => {
    if (!latencyHist.length) return 1;
    return Math.max(...latencyHist.map((b) => b.count || 0), 1);
  }, [latencyHist]);

  // Portfolio epoch from global context
  const { selectedEpoch: portfolioEpoch, epochs: epochList } = usePortfolioEpochContext();
  const epochInfo = useMemo(() => {
    if (portfolioEpoch == null) return null;
    const ep = epochList.find((e) => e.epoch === portfolioEpoch);
    if (!ep) return null;
    return {
      current_epoch: portfolioEpoch,
      trades_in_epoch: ep.closed_count,
      pnl_epoch_usd: ep.pnl_usd,
      equity_usd: 5000 + ep.pnl_usd,
    };
  }, [portfolioEpoch, epochList]);

  useEffect(() => {
    let cancelled = false;
    async function loadPortfolioSnapshot() {
      if (!loadedPortfolioSnapshotRef.current) {
        setLoading(true);
      }
      try {
        if (bundleEnabled && !dwRunIdEffective) {
          if (!cancelled) {
            setTrades([]);
            setTradesMeta(undefined);
            setPortfolioSummary(null);
            setS2Summary(null);
            setTfSummary(null);
            setError("Bundle DW : sélectionnez un run DW.");
          }
          return;
        }
        const snapshot = await api.getDashboardSnapshot(
          overviewSeedRunId,
          "portfolio",
          {
            ...activeContext,
            run_id: overviewSeedRunId ?? activeContext.run_id,
          },
          {
            commissionView,
            portfolioEpoch: portfolioEpoch ?? null,
          }
        );
        if (cancelled) return;
        const portfolioPayload =
          (snapshot.portfolio as DashboardPortfolioSnapshot | null | undefined) ??
          null;
        setPortfolioSummary(
          (portfolioPayload?.summary as PortfolioSummaryResponse | null | undefined) ??
            null
        );
        setTrades(
          (portfolioPayload?.recent_trades ?? []).filter(
            (trade) => trade.strategy_id === dwStrategyId
          )
        );
        setTradesMeta(
          (portfolioPayload?.recent_trades_meta as
            | CanonicalTradesResponse["_meta"]
            | null
            | undefined) ?? undefined
        );
        setS2Summary(
          (snapshot.strategy_summaries?.s2_pairs_trading as
            | S2Summary
            | null
            | undefined) ?? null
        );
        setTfSummary(
          (snapshot.strategy_summaries?.tf_pullback_v1 as
            | DwSummary
            | null
            | undefined) ?? null
        );
        setS2Error(
          s2RunIdEffective && !snapshot.strategy_summaries?.s2_pairs_trading
            ? "S2 summary indisponible"
            : null
        );
        setTfError(
          tfSummaryRunId && !snapshot.strategy_summaries?.tf_pullback_v1
            ? "S3 summary indisponible"
            : null
        );
        setError(snapshot._meta?.errors?.[0] ?? null);
      } catch (e: any) {
        if (!cancelled) {
          const msg = e?.message || "Impossible de charger le portefeuille";
          setError(msg);
        }
      } finally {
        if (!cancelled) {
          loadedPortfolioSnapshotRef.current = true;
          setLoading(false);
        }
      }
    }
    void loadPortfolioSnapshot();
    return () => {
      cancelled = true;
    };
  }, [
    commissionView,
    bundleEnabled,
    dwRunIdEffective,
    overviewSeedRunId,
    portfolioEpoch,
    s2RunIdEffective,
    tfSummaryRunId,
  ]);

  // Consolidated: run trades + IB account + execution metrics in parallel
  useEffect(() => {
    let cancelled = false;
    if (!dwRunIdEffective) {
      setRunTrades([]);
      setRunError(
        bundleEnabled
          ? "Bundle DW : sélectionnez un run DW."
          : "Sélectionnez un run DW pour le récap."
      );
      setIbAccount(null);
      setIbError(null);
      setExecutionMetrics(null);
      setExecutionMetricsError(null);
      return () => { cancelled = true; };
    }
    setRunLoading(true);
    setExecutionMetricsLoading(true);

    const tradesP = canonicalApi.getTrades(
      dwRunIdEffective,
      RUN_TRADES_LIMIT,
      { commissionView, strategyId: dwStrategyId }
    );
    const ibP = api.getIBAccountState(100_000, {
      ...activeContext,
      run_id: dwRunIdEffective ?? activeContext.run_id,
      strategy_id: dwStrategyId,
    });
    const metricsP = api.getExecutionMetrics(
      dwRunIdEffective,
      dwStrategyId,
      includeOpen
    );

    Promise.allSettled([tradesP, ibP, metricsP]).then(([tradesR, ibR, metricsR]) => {
      if (cancelled) return;
      // Run trades
      if (tradesR.status === "fulfilled") {
        setRunTrades(tradesR.value.trades);
        setRunTradesMeta(tradesR.value._meta);
        setRunError(null);
      } else {
        const msg = tradesR.reason?.message || "Impossible de charger les trades du run actuel";
        setRunError(msg);
        setRunTrades([]);
      }
      setRunLoading(false);
      // IB account
      if (ibR.status === "fulfilled") {
        setIbAccount(ibR.value);
        setIbError(null);
      } else {
        const msg = ibR.reason?.message || "Impossible de récupérer l'état de compte IB";
        setIbError(msg);
        setIbAccount(null);
      }
      // Execution metrics
      if (metricsR.status === "fulfilled") {
        setExecutionMetrics(metricsR.value);
        setExecutionMetricsError(null);
      } else {
        setExecutionMetrics(null);
        setExecutionMetricsError(
          metricsR.reason instanceof Error
            ? metricsR.reason.message
            : "Impossible de charger les métriques d'exécution"
        );
      }
      setExecutionMetricsLoading(false);
    });
    return () => { cancelled = true; };
  }, [dwRunIdEffective, commissionView, bundleEnabled, dwStrategyId, includeOpen]);

  const portfolioTrades = useMemo(() => trades, [trades]);
  const sanitizedTrades = useMemo(
    () => sanitizeTradesForPortfolio(portfolioTrades, 5_000),
    [portfolioTrades]
  );
  const filteredOutCount = portfolioTrades.length - sanitizedTrades.length;
  const sortedTrades = useMemo(
    () => sortTradesByExit(sanitizedTrades),
    [sanitizedTrades]
  );
  const portfolio: PortfolioView | null = useMemo(
    () => computePaperPortfolio(sanitizedTrades, 5_000, commissionView),
    [sanitizedTrades, commissionView]
  );
  const portfolioKpis = useMemo(() => {
    if (!portfolioSummary && !portfolio) return null;
    const simEquity = portfolioSummary?.sim_equity_usd ?? 5_000;
    const equity =
      portfolioSummary?.equity_usd ?? portfolio?.metrics.equity ?? null;
    const pnlNet =
      portfolioSummary?.pnl_epoch_usd ??
      portfolio?.metrics.totalPnlNetUsd ??
      null;
    const returnPct =
      equity != null && simEquity > 0
        ? ((equity - simEquity) / simEquity) * 100
        : portfolio?.metrics.returnPct ?? null;
    return {
      equity,
      returnPct,
      pnlNet,
      pnlGross: portfolio?.metrics.totalPnlGrossUsd ?? null,
      trades: epochInfo?.trades_in_epoch ?? portfolio?.metrics.trades ?? null,
      winRate: portfolio?.metrics.winRate ?? null,
      maxDrawdownUsd: portfolio?.metrics.maxDrawdownUsd ?? null,
      commissionUsd: portfolio?.metrics.commissionUsd ?? null,
      simEquity,
    };
  }, [portfolioSummary, portfolio, epochInfo]);
  const recentTrades = useMemo(
    () => sortedTrades.slice(0, 12),
    [sortedTrades]
  );
  const lastPoint =
    portfolio && portfolio.equitySeries.length > 0
      ? portfolio.equitySeries[portfolio.equitySeries.length - 1]
      : null;
  const runSummary = useMemo(
    () => summarizeRunTrades(runTrades),
    [runTrades]
  );
  const ibPnlOfficial = useMemo(() => {
    if (!ibAccount) return null;
    const nlvDelta = ibAccount.account?.nlv_change_abs;
    if (nlvDelta != null && Number.isFinite(nlvDelta)) return nlvDelta;
    const realized = ibAccount.positions?.total_realized_pnl ?? 0;
    const unrealized = ibAccount.positions?.total_unrealized_pnl ?? 0;
    return realized + unrealized;
  }, [ibAccount]);
  const pnlDelta = useMemo(() => {
    if (ibPnlOfficial === null || !runSummary) return null;
    return ibPnlOfficial - runSummary.pnlNetUsd;
  }, [ibPnlOfficial, runSummary]);
  const closedCount = useMemo(
    () => trades.filter((t) => t.status === "CLOSED").length,
    [trades]
  );
  const runIds = useMemo(
    () => Array.from(new Set(trades.map((t) => t.run_id))).slice(0, 8),
    [trades]
  );
  const runsLabel = useMemo(
    () =>
      runIds.length > 0
        ? runIds.map((r) => r.slice(0, 8)).join(", ")
        : "n/a",
    [runIds]
  );

  const handleSelectTrade = (trade: CanonicalTrade) => {
    setSelectedTrade(trade);
    setTradeOhlc([]);
    setTradeOhlcError(null);
    if (!trade.entry_time) return;
    const entryTs = new Date(trade.entry_time).getTime();
    const exitTs = trade.exit_time
      ? new Date(trade.exit_time).getTime()
      : entryTs;
    const start = entryTs - 60 * 60 * 1000;
    const end = exitTs + 60 * 60 * 1000;
    setTradeOhlcLoading(true);
    api
      .getOhlc(300)
      .then((bars) => {
        const series = bars.ohlc ?? [];
        const windowed = series.filter((b) => {
          const ts = new Date(b.timestamp).getTime();
          return ts >= start && ts <= end;
        });
        setTradeOhlc(windowed.length ? windowed : series.slice(-180));
      })
      .catch((e: any) => {
        const msg =
          e?.message || "Impossible de charger l'historique OHLC du trade";
        setTradeOhlcError(msg);
      })
      .finally(() => setTradeOhlcLoading(false));
  };

  return (
    <div className="card glass">
      <RunMetadataBanner
        tradeCount={closedCount}
        dataSourceType="canonical"
        bundleEnabled={bundleEnabled}
        dwRunId={dwRunIdEffective}
        s2RunId={s2RunIdEffective}
        tfRunId={tfSummaryRunId}
      />
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-neutral-400">
          Vue commissions / données : view {runTradesMeta?.commission_view_used ?? tradesMeta?.commission_view_used ?? commissionView} · missing exit {Math.round(runTradesMeta?.missing_exit_commission_pct ?? tradesMeta?.missing_exit_commission_pct ?? 0)}% · anomalies {runTradesMeta?.anomaly_count ?? tradesMeta?.anomaly_count ?? 0}
        </div>
        <div className="btn-group">
          <button
            className={`btn btn-xs ${commissionView === "economic" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setCommissionView("economic")}
            title="Vue économique : plancher 2 USD par jambe si sortie manquante."
          >
            Éco
          </button>
          <button
            className={`btn btn-xs ${commissionView === "reported" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setCommissionView("reported")}
            title="Vue IB reportée."
          >
            IB
          </button>
        </div>
      </div>

      <div className="grid gap-2 sm:gap-3 md:grid-cols-3 mb-4">
        <div className="rounded-lg border border-white/10 bg-white/5 p-2 sm:p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-neutral-100">
              Market Maker (MM)
            </div>
            <div className="text-xs text-neutral-400">
              Run {dwRunIdEffective ? dwRunIdEffective.slice(0, 8) : "n/a"}
            </div>
          </div>
          {dwRunIdEffective ? (
            <>
              {runLoading && (
                <div className="text-xs text-neutral-400 mb-1">
                  Chargement des trades du run…
                </div>
              )}
              <div className="grid gap-1 sm:gap-2 grid-cols-2 md:grid-cols-4">
                <StatCard
                  label="IB PnL (NLV delta)"
                  value={
                    ibPnlOfficial != null
                      ? `${ibPnlOfficial >= 0 ? "+" : ""}${ibPnlOfficial.toFixed(2)}`
                      : "n/a"
                  }
                  valueClassName={
                    ibPnlOfficial != null
                      ? ibPnlOfficial >= 0
                        ? "text-emerald-300"
                        : "text-rose-300"
                      : undefined
                  }
                />
                <StatCard
                  label="PnL canonique (run)"
                  value={
                    runSummary
                      ? `${runSummary.pnlNetUsd >= 0 ? "+" : ""}${runSummary.pnlNetUsd.toFixed(2)} USD`
                      : "n/a"
                  }
                  valueClassName={
                    runSummary
                      ? runSummary.pnlNetUsd >= 0
                        ? "text-emerald-300"
                        : "text-rose-300"
                      : undefined
                  }
                />
                <StatCard
                  label="Delta indicatif"
                  value={
                    pnlDelta != null
                      ? `${pnlDelta >= 0 ? "+" : ""}${pnlDelta.toFixed(2)} USD`
                      : "n/a"
                  }
                  valueClassName={
                    pnlDelta != null
                      ? Math.abs(pnlDelta) < 0.01
                        ? "text-neutral-200"
                        : "text-amber-200"
                      : undefined
                  }
                />
                <StatCard
                  label="Trades clos (run)"
                  value={runSummary ? `${runSummary.trades}` : runError || "0"}
                />
              </div>
              <div className="text-[11px] text-neutral-400 mt-2">
                {runSummary
                  ? `Win rate ${runSummary.winRate.toFixed(1)}% · Commission USD ${runSummary.commissionUsd.toFixed(2)} · Dernier exit ${runSummary.lastExitTs ? formatDate(runSummary.lastExitTs) : "n/a"}`
                  : "Aucun trade canonique pour ce run (ou filtrés)."}
                {ibPnlOfficial != null ? " · IB=NlvDelta compte" : ""}
                {pnlDelta != null ? " · delta indicatif (scope compte vs run)" : ""}
                {ibError ? ` · IB: ${ibError}` : ""}
                {runError ? ` · Run: ${runError}` : ""}
              </div>
            </>
          ) : (
            <div className="text-sm text-neutral-400">
              Sélectionnez le run market maker dans la console pour afficher la
              performance.
            </div>
          )}
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-neutral-100">
              Microstructure Lens
            </div>
            <div className="text-xs text-neutral-400">
              Run {s2RunIdEffective ? s2RunIdEffective.slice(0, 8) : "n/a"}
            </div>
          </div>
          {s2RunIdEffective ? (
            <>
              <div className="grid gap-1 sm:gap-2 grid-cols-2 md:grid-cols-4">
                <StatCard
                  label="Signals"
                  value={`${s2Summary?.counts?.total ?? 0}`}
                />
                <StatCard
                  label="Accepted"
                  value={`${s2Summary?.counts?.accepted ?? 0}`}
                />
                <StatCard
                  label="Warmup"
                  value={`${s2Summary?.counts?.warmup ?? 0}`}
                />
                <StatCard
                  label="Shadow PnL (bps)"
                  value={
                    s2Summary?.shadow
                      ? `${s2Summary.shadow.pnl_bps.toFixed(1)}`
                      : "n/a"
                  }
                  valueClassName={
                    s2Summary?.shadow
                      ? s2Summary.shadow.pnl_bps >= 0
                        ? "text-emerald-200"
                        : "text-rose-200"
                      : undefined
                  }
                />
              </div>
              <div className="text-[11px] text-neutral-400 mt-2">
                {s2Summary
                  ? `Pair ${s2Summary.pair_key ?? "n/a"} · Warmup ${s2Summary.warmup_state ?? "n/a"} · Shadow trades ${s2Summary.shadow?.trades ?? 0} · Win ${s2Summary.shadow?.win_rate?.toFixed(1) ?? "0.0"}% · Last ${formatDate(s2Summary.last_signal_ts)}`
                  : s2Error || "S2 summary indisponible"}
              </div>
              {s2Summary?.last_signal && (
                <div className="text-[11px] text-neutral-500 mt-1">
                  Last signal: z={s2Summary.last_signal.z_score ?? "n/a"} · spread{" "}
                  {s2Summary.last_signal.spread ?? "n/a"}
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-neutral-400">
              Sélectionnez le run microstructure dans la console pour afficher les métriques.
            </div>
          )}
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-neutral-100">
              Trend Lens
            </div>
            <div className="text-xs text-neutral-400">
              Run {tfSummaryRunId ? tfSummaryRunId.slice(0, 8) : "n/a"}
            </div>
          </div>
          {tfSummaryRunId ? (
            <>
              <div className="grid gap-1 sm:gap-2 grid-cols-2 md:grid-cols-4">
                <StatCard
                  label="Signals"
                  value={`${tfSummary?.counts?.total ?? 0}`}
                />
                <StatCard
                  label="Accepted"
                  value={`${tfSummary?.counts?.accepted ?? 0}`}
                />
                <StatCard
                  label="Rejected"
                  value={`${tfSummary?.counts?.rejected ?? 0}`}
                />
                <StatCard
                  label="Warmup"
                  value={tfSummary?.warmup_state ?? "n/a"}
                />
              </div>
              <div className="text-[11px] text-neutral-400 mt-2">
                {tfSummary
                  ? `Last ${formatDate(tfSummary.last_signal_ts)} · Direction ${tfSummary.last_signal?.direction ?? "n/a"} · z ${tfSummary.last_signal?.z_score ?? "n/a"}`
                  : tfError || "S3 summary indisponible"}
              </div>
            </>
          ) : (
            <div className="text-sm text-neutral-400">
              Sélectionnez le run principal ou trend lens dans la console pour afficher les métriques.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/5 p-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-neutral-100">
            Execution Quality (DW)
          </div>
          <div className="flex items-center gap-3 text-xs text-neutral-400">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-emerald-400"
                checked={includeOpen}
                onChange={(e) => setIncludeOpen(e.target.checked)}
              />
              Inclure OPEN
            </label>
            <div>
              Run {dwRunIdEffective ? dwRunIdEffective.slice(0, 8) : "n/a"} ·{" "}
              samples {executionMetrics?.sample_count ?? 0}
            </div>
            {executionMetrics?.sla && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] ${
                  executionMetrics.sla.status === "OK"
                    ? "bg-emerald-500/10 text-emerald-300"
                    : executionMetrics.sla.status === "WARNING"
                    ? "bg-amber-500/10 text-amber-300"
                    : "bg-neutral-500/10 text-neutral-300"
                }`}
              >
                SLA p95 {formatMs(executionMetrics.sla.p95_ms)} /{" "}
                {executionMetrics.sla.threshold_ms}ms
              </span>
            )}
          </div>
        </div>
        {executionMetricsLoading && (
          <div className="text-xs text-neutral-400 mb-2">Chargement…</div>
        )}
        {executionMetricsError && (
          <div className="text-xs text-danger mb-2">{executionMetricsError}</div>
        )}
        {dwRunIdEffective ? (
          executionMetrics ? (
            <>
              <div className="grid gap-1 sm:gap-2 grid-cols-2 md:grid-cols-4">
                <StatCard
                  label="Slip total p50"
                  value={formatPips(executionMetrics.overall.total.p50)}
                />
                <StatCard
                  label="Slip total p90"
                  value={formatPips(executionMetrics.overall.total.p90)}
                />
                <StatCard
                  label="Slip total p95"
                  value={formatPips(executionMetrics.overall.total.p95)}
                />
                <StatCard
                  label="Latency entry p95"
                  value={formatMs(executionMetrics.overall.latency_entry_ms?.p95)}
                />
              </div>
              <div className="grid gap-1 sm:gap-2 grid-cols-2 md:grid-cols-4 mt-2">
                <StatCard
                  label="Latency entry p50"
                  value={formatMs(executionMetrics.overall.latency_entry_ms?.p50)}
                />
                <StatCard
                  label="Latency entry p90"
                  value={formatMs(executionMetrics.overall.latency_entry_ms?.p90)}
                />
                <StatCard
                  label="Latency exit p95"
                  value={formatMs(executionMetrics.overall.latency_exit_ms?.p95)}
                />
                <StatCard
                  label="Latency entry avg"
                  value={formatMs(executionMetrics.overall.latency_entry_ms?.avg)}
                />
              </div>
              <div className="grid gap-1 sm:gap-2 grid-cols-2 md:grid-cols-4 mt-2">
                <StatCard
                  label="Latency entry min"
                  value={formatMs(executionMetrics.overall.latency_entry_ms?.min)}
                />
                <StatCard
                  label="Latency entry max"
                  value={formatMs(executionMetrics.overall.latency_entry_ms?.max)}
                />
                <StatCard
                  label="Latency exit p50"
                  value={formatMs(executionMetrics.overall.latency_exit_ms?.p50)}
                />
                <StatCard
                  label="Latency exit p90"
                  value={formatMs(executionMetrics.overall.latency_exit_ms?.p90)}
                />
              </div>
              {executionMetrics.latest_trade && (
                <div className="mt-3 rounded-lg border border-white/10 bg-neutral-900/40 p-2 text-[11px] text-neutral-300">
                  Dernier trade: {executionMetrics.latest_trade.trade_id.slice(0, 8)} ·{" "}
                  {executionMetrics.latest_trade.exit_time
                    ? `exit ${formatDate(executionMetrics.latest_trade.exit_time)}`
                    : `entry ${formatDate(executionMetrics.latest_trade.entry_time)}`}{" "}
                  · lat entry {formatMs(executionMetrics.latest_trade.entry_submit_to_fill_ms)} · lat exit{" "}
                  {formatMs(executionMetrics.latest_trade.exit_submit_to_fill_ms)} · slip{" "}
                  {formatPips(
                    (executionMetrics.latest_trade.entry_slippage_pips ?? 0) +
                      (executionMetrics.latest_trade.exit_slippage_pips ?? 0)
                  )}{" "}
                  · spread {formatPips(executionMetrics.latest_trade.spread_pips_at_entry)}
                </div>
              )}
              {latencyHist.length ? (
                <div className="mt-3 rounded-lg border border-white/10 bg-neutral-900/40 p-2">
                  <div className="text-[11px] text-neutral-400 mb-2">
                    Histogramme latence entry (ms)
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {latencyHist.map((bucket, idx) => {
                      const label = bucket.max_ms
                        ? `${bucket.min_ms}-${bucket.max_ms}`
                        : `${bucket.min_ms}+`;
                      const width = Math.max(
                        6,
                        Math.round((bucket.count / latencyHistMax) * 100)
                      );
                      return (
                        <div
                          key={`${label}-${idx}`}
                          className="rounded border border-white/10 bg-white/5 p-2"
                        >
                          <div className="text-[10px] text-neutral-500">{label} ms</div>
                          <div className="mt-1 h-2 rounded bg-white/10">
                            <div
                              className="h-2 rounded bg-emerald-400/70"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                          <div className="text-[11px] text-neutral-300 mt-1">
                            n={bucket.count}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <div className="grid gap-2 md:grid-cols-2 mt-3">
                <div className="rounded-lg border border-white/10 bg-neutral-900/40 p-2">
                  <div className="text-[11px] text-neutral-400 mb-2">
                    Par spread regime (p95 total)
                  </div>
                  {spreadBuckets.length ? (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {spreadBuckets.map(([label, bucket]) => (
                        <div
                          key={label}
                          className="rounded border border-white/10 bg-white/5 p-2"
                        >
                          <div className="text-[11px] text-neutral-400">
                            {label}
                          </div>
                          <div className="text-sm font-semibold text-neutral-100">
                            {formatPips(bucket.total.p95)}
                          </div>
                          <div className="text-[11px] text-neutral-500">
                            n={bucket.count} · lat{" "}
                            {formatMs(bucket.latency_entry_ms?.p95)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-neutral-500">Aucun bucket.</div>
                  )}
                </div>
                <div className="rounded-lg border border-white/10 bg-neutral-900/40 p-2">
                  <div className="text-[11px] text-neutral-400 mb-2">
                    Par vol regime (p95 total)
                  </div>
                  {volBuckets.length ? (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {volBuckets.map(([label, bucket]) => (
                        <div
                          key={label}
                          className="rounded border border-white/10 bg-white/5 p-2"
                        >
                          <div className="text-[11px] text-neutral-400">
                            {label}
                          </div>
                          <div className="text-sm font-semibold text-neutral-100">
                            {formatPips(bucket.total.p95)}
                          </div>
                          <div className="text-[11px] text-neutral-500">
                            n={bucket.count} · lat{" "}
                            {formatMs(bucket.latency_entry_ms?.p95)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-neutral-500">Aucun bucket.</div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-sm text-neutral-400">
              Aucune métrique d'exécution disponible pour ce run.
            </div>
          )
        ) : (
          <div className="text-sm text-neutral-400">
            Sélectionnez un run DW dans le Cockpit pour charger les métriques.
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-3 mt-2">
        <div>
          <div className="text-xs text-neutral-200 uppercase tracking-[0.18em]">
            Portfolio Paper 5K (DW){' '}
            {epochInfo ? `(Epoch ${epochInfo.current_epoch})` : "(multi-run)"}
          </div>
          <div className="text-sm text-neutral-400">
            Source: canonical_trades.sqlite
            {epochInfo && (
              <span className="ml-2 text-neutral-500">
                · {epochInfo.trades_in_epoch} trades · ${epochInfo.pnl_epoch_usd.toFixed(2)} PnL · ${epochInfo.equity_usd.toFixed(2)} equity
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {loading && (
            <span className="text-xs text-neutral-400">Chargement…</span>
          )}
          {error && (
            <span className="text-xs text-danger">
              {error}
            </span>
          )}
          <span className="text-[11px] text-neutral-400">
            Runs inclus: {runsLabel}
            {filteredOutCount > 0
              ? ` · Trades filtrés (orphelin/outlier): ${filteredOutCount}`
              : ""}
          </span>
        </div>
      </div>

      {selectedTrade && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 mt-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-semibold text-neutral-100">
                Détails trade {selectedTrade.trade_id?.slice(0, 8) || "—"}
              </div>
              <div className="text-xs text-neutral-400">
                Run {selectedTrade.run_id?.slice(0, 8) || "—"} ·{" "}
                {formatDate(selectedTrade.exit_time || selectedTrade.entry_time)}
              </div>
            </div>
            <TimeframeSelector
              options={allowedTimeframes}
              active={timeframe.label}
              onChange={setTimeframe}
            />
            {tradeOhlcLoading && (
              <span className="text-xs text-neutral-400">
                Chargement OHLC…
              </span>
            )}
            {tradeOhlcError && (
              <span className="text-xs text-danger">{tradeOhlcError}</span>
            )}
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-lg border border-white/10 bg-neutral-900/40 p-3">
              <div className="flex items-center justify-between text-[11px] text-neutral-300 mb-2">
                <div className="inline-flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-white/10 text-emerald-200">
                    Regime: Range
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white/10 text-[#00FF88]/80">
                    Vol: n/a
                  </span>
                </div>
                <div className="inline-flex items-center gap-1 text-neutral-400">
                  <span>Momentum OK</span>
                  <span>•</span>
                  <span>Volatility OK</span>
                  <span>•</span>
                  <span>Spread OK</span>
                </div>
              </div>
              {tradeOhlc.length > 0 ? (
                <TradeOhlcChart
                  trade={selectedTrade}
                  ohlc={aggregatedTradeOhlc}
                  timeframe={timeframe}
                  onChangeTimeframe={setTimeframe}
                  allowedTimeframes={allowedTimeframes}
                />
              ) : (
                <div className="text-sm text-neutral-400">
                  Pas d'OHLC disponibles autour de ce trade.
                </div>
              )}
            </div>

            <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <DetailRow label="Side" value={selectedTrade.side} />
                <DetailRow
                  label="Qty"
                  value={selectedTrade.qty?.toFixed(0) ?? "n/a"}
                />
                <DetailRow
                  label="Entry"
                  value={selectedTrade.entry_price?.toFixed(5) ?? "n/a"}
                />
                <DetailRow
                  label="Exit"
                  value={selectedTrade.exit_price?.toFixed(5) ?? "—"}
                />
                <DetailRow
                  label="PnL USD"
                  value={(
                    computeNetPnlUsd(selectedTrade) ?? 0
                  ).toFixed(2)}
                />
                <DetailRow
                  label="PnL pips"
                  value={(
                    selectedTrade.net_pips_used ??
                    selectedTrade.pnl_net_pips ??
                    selectedTrade.pnl_pips ??
                    0
                  ).toFixed(2)}
                />
                <DetailRow
                  label="Exit reason"
                  value={selectedTrade.exit_reason || "—"}
                />
                <DetailRow
                  label="Status"
                  value={selectedTrade.status || "—"}
                />
                {selectedTrade.tp_price != null && (
                  <DetailRow
                    label="TP"
                    value={selectedTrade.tp_price?.toFixed(5) ?? "n/a"}
                  />
                )}
                {selectedTrade.sl_price != null && (
                  <DetailRow
                    label="SL"
                    value={selectedTrade.sl_price?.toFixed(5) ?? "n/a"}
                  />
                )}
                {tradeDurationMinutes(selectedTrade) != null && (
                  <DetailRow
                    label="Durée"
                    value={`${tradeDurationMinutes(selectedTrade)} min`}
                  />
                )}
              </div>
              {selectedBreakdown && (
                <div className="rounded-md border border-white/10 bg-neutral-900/60 p-2 mt-2 text-xs text-neutral-200 space-y-1">
                  <div className="font-semibold text-neutral-100">
                    PnL net = brut − spread − slippage − commission
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>Brut: {selectedBreakdown.grossUsd.toFixed(2)} USD</div>
                    <div>
                      Spread: {selectedBreakdown.spreadPips.toFixed(2)} p (
                      {selectedBreakdown.spreadUsd.toFixed(2)} USD)
                    </div>
                    <div>
                      Slippage: {selectedBreakdown.slipPips.toFixed(2)} p (
                      {selectedBreakdown.slipUsd.toFixed(2)} USD)
                    </div>
                    <div>
                      Commission: {selectedBreakdown.commissionUsd.toFixed(2)} USD
                    </div>
                    <div className="col-span-2">
                      Net: {selectedBreakdown.netUsd.toFixed(2)} USD
                    </div>
                  </div>
                </div>
              )}
              {(selectedTrade as any).config_snapshot && (
                <div className="text-xs text-neutral-400 break-words">
                  Snapshot: {(selectedTrade as any).config_snapshot}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-neutral-100">
                Equity curve (simulé 5K)
              </div>
              <div className="text-xs text-neutral-400">
                Dernier point: {lastPoint ? formatDate(lastPoint.x) : "n/a"}
              </div>
            </div>
            {portfolio ? (
              <ApexChart
                type="area"
                height={260}
                series={[
                  {
                    name: "Equity",
                    data: portfolio.equitySeries.map((p) =>
                      Number(p.y.toFixed(2))
                    ),
                  },
                ]}
                options={{
                  chart: {
                    id: "performance-equity",
                    toolbar: { show: false },
                    animations: { enabled: true },
                  },
                  xaxis: {
                    type: "category",
                    categories: portfolio.equitySeries.map((p) => {
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
                  yaxis: {
                    labels: { style: { colors: "#9ca3af" } },
                    title: { text: "USD", style: { color: "#9ca3af" } },
                  },
                  stroke: { width: 2, curve: "straight" },
                  markers: { size: 3, strokeWidth: 0, hover: { size: 5 } },
                  dataLabels: { enabled: false },
                  fill: {
                    type: "gradient",
                    gradient: {
                      shadeIntensity: 0.5,
                      opacityFrom: 0.25,
                      opacityTo: 0.05,
                    },
                  },
                  colors: ["#a855f7"],
                  grid: { borderColor: "rgba(255,255,255,0.08)" },
                  tooltip: {
                    theme: "dark",
                    custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
                      const pt = portfolio.equitySeries[dataPointIndex];
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
            ) : (
              <div className="rounded border border-white/5 bg-neutral-900/40 p-3 text-sm text-neutral-300">
                {trades.length === 0
                  ? "Aucun trade canonique récent pour calculer l’equity curve."
                  : "Trades présents mais aucun clos pour la courbe d’equity."}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="text-sm font-semibold text-neutral-100 mb-2">
                KPIs portefeuille simulé
              </div>
              {portfolioKpis ? (
                <div className="grid grid-cols-2 gap-2">
                  <StatCard
                    label="Equity"
                    value={formatUsd(portfolioKpis.equity)}
                  />
                  <StatCard
                    label="Return"
                    value={
                      portfolioKpis.returnPct != null
                        ? `${portfolioKpis.returnPct.toFixed(2)}%`
                        : "n/a"
                    }
                  />
                  <StatCard
                    label="PnL brut"
                    value={formatUsd(portfolioKpis.pnlGross)}
                  />
                  <StatCard
                    label="PnL net"
                    value={formatUsd(portfolioKpis.pnlNet)}
                  />
                  <StatCard
                    label="Trades clos"
                    value={
                      portfolioKpis.trades != null
                        ? `${portfolioKpis.trades}`
                        : "n/a"
                    }
                  />
                  <StatCard
                    label="Win rate"
                    value={
                      portfolioKpis.winRate != null
                        ? `${portfolioKpis.winRate.toFixed(1)}%`
                        : "n/a"
                    }
                  />
                  <StatCard
                    label="Max DD"
                    value={formatUsd(portfolioKpis.maxDrawdownUsd)}
                  />
                  <StatCard
                    label="Commission"
                    value={formatUsd(portfolioKpis.commissionUsd)}
                  />
                </div>
              ) : (
                <div className="text-sm text-neutral-400">
                  KPIs indisponibles sans trades clos.
                </div>
              )}
              <div className="text-xs text-neutral-400 mt-2">
                Start equity: USD{" "}
                {portfolioKpis ? portfolioKpis.simEquity.toFixed(2) : "5000.00"} ·
                PnL net cumulé: USD{" "}
                {portfolioKpis && portfolioKpis.pnlNet != null
                  ? portfolioKpis.pnlNet.toFixed(2)
                  : "0.00"}
              </div>
              <div className="text-[11px] text-neutral-500">
                KPIs alignés sur le portfolio epoch quand disponible.
              </div>
            </div>

            {recentTrades.length > 0 && (
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="text-sm font-semibold text-neutral-100 mb-2">
                  Dernier trade
                </div>
                <LastTrade trade={recentTrades[0]} />
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="text-sm font-semibold text-neutral-100 mb-2">
            Derniers trades (portfolio epoch)
          </div>
          {recentTrades.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left">
                <thead className="text-neutral-400">
                  <tr>
                    <th className="px-2 py-1">Run</th>
                    <th className="px-2 py-1">Exit</th>
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
                  {recentTrades.map((t) => {
                    const commission = commissionUsed(t);
                    const pnlGross =
                      t.pnl_gross_usd_used ??
                      t.pnl_gross_usd ??
                      (computeNetPnlUsd(t) ?? 0) + commission;
                    const pnlNet = computeNetPnlUsd(t) ?? (pnlGross != null ? pnlGross - commission : 0);
                    return (
                      <tr
                        key={`${t.trade_id}-${t.exit_time}`}
                        className="border-t border-white/5 cursor-pointer hover:bg-white/5"
                        onClick={() => handleSelectTrade(t)}
                      >
                        <td className="px-2 py-1 text-neutral-400">
                          {t.run_id?.slice(0, 8) || "—"}
                        </td>
                        <td className="px-2 py-1 text-neutral-300">
                          {formatDate(t.exit_time || t.entry_time)}
                        </td>
                        <td className="px-2 py-1">{t.side}</td>
                        <td className="px-2 py-1">
                          {t.qty?.toFixed(0) ?? "n/a"}
                        </td>
                        <td className="px-2 py-1">
                          {t.entry_price?.toFixed(5) ?? "n/a"}
                        </td>
                        <td className="px-2 py-1">
                          {t.exit_price?.toFixed(5) ?? "—"}
                        </td>
                        <td className={`px-2 py-1 ${pnlGross >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                          {pnlGross.toFixed(2)}
                        </td>
                        <td className={`px-2 py-1 ${pnlNet >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                          {pnlNet.toFixed(2)}
                        </td>
                        <td className="px-2 py-1 text-neutral-300">
                          {commission.toFixed(2)}
                        </td>
                        <td className="px-2 py-1">
                          {(
                            t.net_pips_used ??
                            t.pnl_net_pips ??
                            t.pnl_pips ??
                            0
                          ).toFixed(2)}
                        </td>
                        <td className="px-2 py-1 text-neutral-400">
                          {t.exit_reason || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-neutral-400">
              Aucun trade canonique trouvé sur les runs récents.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-neutral-900/50 px-3 py-2">
      <div className="text-xs text-neutral-400">{label}</div>
      <div
        className={`text-lg font-semibold text-neutral-100 ${valueClassName ?? ""
          }`}
      >
        {value}
      </div>
    </div>
  );
}

function TradeOhlcChart({
  trade,
  ohlc,
  timeframe,
  onChangeTimeframe,
  allowedTimeframes,
}: {
  trade: CanonicalTrade;
  ohlc: Ohlc[];
  timeframe: TimeframeOption;
  onChangeTimeframe: (t: TimeframeOption) => void;
  allowedTimeframes: (TimeframeOption & { disabled?: boolean })[];
}) {
  const isWin =
    (computeNetPnlUsd(trade) ?? 0) > 0 ||
    ["TP", "TARGET", "PROFIT"].includes(
      (trade.exit_reason || "").toUpperCase()
    );
  const isLoss = ["SL", "STOP", "STOPLOSS"].includes(
    (trade.exit_reason || "").toUpperCase()
  );
  const outcomeColor = isWin
    ? "#22c55e"
    : isLoss
      ? "#f97316"
      : "#9ca3af";
  const entryColor = trade.side === "BUY" ? "#22d3ee" : "#f97316";

  const candles = useMemo(
    () =>
      ohlc.map((b) => ({
        x: new Date(b.timestamp).getTime(),
        y: [b.open, b.high, b.low, b.close],
      })),
    [ohlc]
  );

  const entryTs = new Date(trade.entry_time || Date.now()).getTime();
  const exitTs = trade.exit_time
    ? new Date(trade.exit_time).getTime()
    : undefined;

  const entryPrice = trade.entry_price ?? undefined;
  const exitPrice = trade.exit_price ?? undefined;

  const minTime = Math.min(...candles.map((c) => c.x));
  const maxTime = Math.max(...candles.map((c) => c.x));
  const timePad = Math.max((maxTime - minTime) * 0.15, 10 * 60 * 1000);

  const prices = candles.flatMap((c) => c.y);
  const minPrice = Math.min(
    ...prices,
    entryPrice ?? prices[0],
    exitPrice ?? prices[0]
  );
  const maxPrice = Math.max(
    ...prices,
    entryPrice ?? prices[prices.length - 1],
    exitPrice ?? prices[prices.length - 1]
  );
  const pricePad = Math.max((maxPrice - minPrice) * 0.15, 0.0005);

  const regions = [
    exitTs
      ? {
        x: entryTs,
        x2: exitTs,
        fillColor: outcomeColor,
        opacity: 0.16,
        label: {
          text: isWin
            ? "In-trade (win)"
            : isLoss
              ? "In-trade (loss)"
              : "In-trade",
          style: {
            color: "#0b1224",
            background: outcomeColor,
            fontSize: "10px",
          },
        },
      }
      : null,
    exitTs
      ? {
        x: exitTs,
        x2: maxTime + timePad,
        fillColor: "rgba(148,163,184,0.18)",
        opacity: 0.18,
        label: {
          text: "Post-exit price action",
          style: {
            color: "#0f172a",
            background: "rgba(148,163,184,0.8)",
            fontSize: "10px",
          },
        },
      }
      : null,
  ].filter(Boolean) as any[];

  const xAnnotations = [
    {
      x: entryTs,
      borderColor: entryColor,
      label: {
        text: `${trade.side} ${entryPrice?.toFixed(5) ?? ""}`,
        style: {
          background: entryColor,
          color: "#0b1224",
          fontSize: "10px",
        },
      },
    },
  ];
  if (exitTs) {
    xAnnotations.push({
      x: exitTs,
      borderColor: outcomeColor,
      label: {
        text: `Exit ${exitPrice?.toFixed(5) ?? ""}`,
        style: {
          background: outcomeColor,
          color: "#0b1224",
          fontSize: "10px",
        },
      },
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] text-neutral-300">
        <div className="inline-flex items-center gap-2">
          <span className="text-neutral-400">Timeframe</span>
          <TimeframeSelector
            options={allowedTimeframes}
            active={timeframe.label}
            onChange={onChangeTimeframe}
          />
        </div>
        <div className="inline-flex items-center gap-2 text-neutral-400">
          <span>Regime: Range</span>
          <span>•</span>
          <span>Vol: n/a</span>
        </div>
      </div>

      <ApexChart
        type="candlestick"
        height={260}
        series={[{ name: "OHLC", data: candles }]}
        options={{
          chart: { toolbar: { show: false } },
          xaxis: {
            type: "datetime",
            labels: { style: { colors: "#9ca3af" } },
            min: minTime - timePad,
            max: maxTime + timePad,
            tooltip: { enabled: false },
          },
          yaxis: {
            labels: {
              style: { colors: "#9ca3af" },
              formatter: (val: number) => val.toFixed(5),
            },
            tooltip: { enabled: true },
            min: minPrice - pricePad,
            max: maxPrice + pricePad,
            tickAmount: 6,
          },
          plotOptions: {
            candlestick: {
              colors: { upward: "#3fbf8c", downward: "#f97316" },
            },
          },
          annotations: { xaxis: [...xAnnotations, ...regions] },
          tooltip: {
            theme: "dark",
            x: { format: "dd MMM HH:mm:ss" },
            y: {
              formatter: (val: number) => val.toFixed(5),
            },
          },
          grid: { borderColor: "rgba(255,255,255,0.08)" },
          dataLabels: { enabled: false },
          stroke: { width: 1.5 },
          states: { hover: { filter: { type: "none" } } },
          noData: { text: "Pas de données OHLC", style: { color: "#9ca3af" } },
        }}
      />
    </div>
  );
}

function tradeDurationMinutes(trade: CanonicalTrade): number | null {
  if (!trade.entry_time || !trade.exit_time) return null;
  const delta =
    new Date(trade.exit_time).getTime() -
    new Date(trade.entry_time).getTime();
  return Math.max(0, Math.round(delta / 60000));
}

function LastTrade({ trade }: { trade: CanonicalTrade }) {
  const commission = commissionUsed(trade);
  const pnlGross =
    trade.pnl_gross_usd_used ??
    trade.pnl_gross_usd ??
    (computeNetPnlUsd(trade) ?? 0) + commission;
  const pnlUsd = computeNetPnlUsd(trade) ?? (pnlGross - commission);
  const pnlPips = trade.net_pips_used ?? trade.pnl_net_pips ?? trade.pnl_pips ?? 0;
  return (
    <div className="space-y-1 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-neutral-400">Run</span>
        <span className="text-neutral-200">{trade.run_id?.slice(0, 8) || "—"}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-neutral-400">Exit</span>
        <span className="text-neutral-200">{formatDate(trade.exit_time || trade.entry_time)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-neutral-400">Direction</span>
        <span className="text-neutral-200">{trade.side}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-neutral-400">Qty</span>
        <span className="text-neutral-200">{trade.qty?.toFixed(0) ?? "n/a"}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-neutral-400">Entry → Exit</span>
        <span className="text-neutral-200">
          {trade.entry_price?.toFixed(5) ?? "n/a"} → {trade.exit_price?.toFixed(5) ?? "—"}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-neutral-400">PnL</span>
        <span className={pnlUsd >= 0 ? "text-emerald-300" : "text-rose-300"}>
          {pnlUsd.toFixed(2)} USD ({pnlPips.toFixed(2)} pips)
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-neutral-400">Commission</span>
        <span className="text-neutral-200">
          {commission.toFixed(2)} USD
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-neutral-400">Exit reason</span>
        <span className="text-neutral-300">{trade.exit_reason || "—"}</span>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-neutral-400">{label}</span>
      <span className="text-neutral-200">{value}</span>
    </div>
  );
}
