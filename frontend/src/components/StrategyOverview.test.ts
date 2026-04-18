import { describe, expect, it } from "vitest";

import {
  buildPortfolioSummaryView,
  buildPrefetchedOverviewState,
} from "./StrategyOverview";
import {
  resolveGateway,
  resolveOverviewStrategyRunId,
  resolveRuntimeWarmupLabel,
  resolveRuntimeWarmupProgress,
  resolveRuntimeWarmupState,
  snapshotHasUnavailableError,
} from "./StrategyOverview.utils";

describe("resolveGateway", () => {
  it("priorise une deconnexion gateway explicite sur bot_running", () => {
    expect(
      resolveGateway({
        bot_running: true,
        gateway_connected: false,
      })
    ).toBe(false);
  });

  it("retombe sur bot_running quand gateway_connected est inconnu", () => {
    expect(
      resolveGateway({
        bot_running: true,
      })
    ).toBe(true);
  });
});

describe("buildPortfolioSummaryView", () => {
  it("construit un fallback portefeuille a partir des stats strategie si le summary agrege manque", () => {
    const view = buildPortfolioSummaryView(
      null,
      {
        winRate: 0.61,
        profitFactor: 1.42,
        sharpe: 1.1,
        dailyPnL: 14.5,
        cumulativePnL: 88.2,
        tradeCount: 6,
        dataSource: "canonical",
        last_exit_ts: "2026-04-02T15:00:00Z",
        commission_view: "economic",
        missing_exit_pct: 0,
        anomaly_count: 1,
      },
      "reported",
      null
    );

    expect(view).toMatchObject({
      equity: null,
      pnl_epoch: 88.2,
      pnl_7d: null,
      pnl_30d: null,
      trades_30d: 6,
      last_exit_ts: "2026-04-02T15:00:00Z",
      commission_view: "economic",
      missing_exit_pct: 0,
      anomaly_count: 1,
      epoch: null,
      run_pnl_usd: 88.2,
      run_pnl_today_usd: 14.5,
    });
  });

  it("prefere le summary agrege pour les KPI desk quand il est disponible", () => {
    const view = buildPortfolioSummaryView(
      {
        current_epoch: 7,
        sim_equity_usd: 5020,
        equity_usd: 5110,
        pnl_epoch_usd: 145.5,
        pnl_7d_usd: 91.2,
        pnl_30d_usd: 188.4,
        trades_7d: 5,
        trades_30d: 12,
        epoch_started_at: "2026-04-08T00:00:00Z",
      },
      {
        winRate: 0.61,
        profitFactor: 1.42,
        sharpe: 1.1,
        dailyPnL: 14.5,
        cumulativePnL: 88.2,
        tradeCount: 6,
        dataSource: "canonical",
        last_exit_ts: "2026-04-02T15:00:00Z",
        commission_view: "economic",
        missing_exit_pct: 0,
        anomaly_count: 1,
      },
      "reported",
      null
    );

    expect(view).toMatchObject({
      equity: 5110,
      pnl_epoch: 145.5,
      pnl_7d: 91.2,
      pnl_30d: 188.4,
      trades_30d: 12,
      last_exit_ts: "2026-04-02T15:00:00Z",
      commission_view: "economic",
      run_pnl_usd: 88.2,
      run_pnl_today_usd: 14.5,
    });
  });
});

describe("buildPrefetchedOverviewState", () => {
  it("rehydrate l'overview complet depuis un prefetch chaud", () => {
    const state = buildPrefetchedOverviewState(
      {
        key: "desk:reported:current",
        prefetchedAt: Date.now(),
        runtime: {
          system: { gateway_connected: true },
          ui_status: null,
          strategy_runs: {},
          strategies_status: {
            strategies: [
              {
                strategy_id: "damping_wave",
                source: "s1",
                service: "s1-dw-a1",
                service_active: true,
                service_state: "active",
                run_id: "run_dw",
                last_signal_ts: null,
                open_positions: 0,
              },
            ],
          },
        },
        portfolio: {
          portfolio: {
            summary: {
              current_epoch: 4,
              equity_usd: 5123,
              pnl_epoch_usd: 123.4,
              pnl_7d_usd: 44,
              pnl_30d_usd: 99,
              trades_7d: 3,
              trades_30d: 9,
              epoch_started_at: "2026-04-10T00:00:00Z",
            },
            strategies: {
              damping_wave: {
                winRate: 0.7,
                profitFactor: 1.8,
                sharpe: 1.2,
                dailyPnL: 10,
                cumulativePnL: 88,
                tradeCount: 5,
                dataSource: "canonical",
              },
              s2_pairs_trading: {
                winRate: 0.5,
                profitFactor: 1.1,
                sharpe: 0.4,
                dailyPnL: 2,
                cumulativePnL: 5,
                tradeCount: 2,
                dataSource: "canonical",
              },
              tf_pullback_v1: {
                winRate: 0.6,
                profitFactor: 1.3,
                sharpe: 0.8,
                dailyPnL: 6,
                cumulativePnL: 12,
                tradeCount: 3,
                dataSource: "canonical",
              },
            },
          },
          strategy_runs: {},
        },
        summaries: {
          strategy_summaries: {
            s2_pairs_trading: {
              pair_key: "EURUSD_GBPUSD",
              warmup_state: "READY",
              counts: { total: 12, accepted: 3 },
            },
            tf_pullback_v1: {
              warmup_state: "READY",
              counts: { total: 8, accepted: 2 },
              last_signal: { direction: "LONG" },
            },
          },
          strategy_summary_meta: {},
          strategy_runs: {},
        },
        equityCurve: {
          starting_equity: 5000,
          end_equity: 5123,
          trade_count: 9,
          equity_curve: [
            {
              ts: "2026-04-10T09:00:00Z",
              equity: 5000,
            },
            {
              ts: "2026-04-10T10:00:00Z",
              equity: 5123,
            },
          ],
        },
      },
      {
        showS2: true,
        showTf: true,
        commissionView: "reported",
        selectedEpoch: 4,
      }
    );

    expect(state).not.toBeNull();
    expect(state?.loading).toBe(false);
    expect(state?.systemStatus).toMatchObject({ gateway_connected: true });
    expect(state?.portfolioRun).toMatchObject({
      equity: 5123,
      pnl_epoch: 123.4,
      trades_30d: 9,
      epoch: 4,
    });
    expect(state?.dwEpochStats?.tradeCount).toBe(5);
    expect(state?.s2Summary?.counts?.accepted).toBe(3);
    expect(state?.tfSummary?.last_signal?.direction).toBe("LONG");
    expect(state?.equityCurveData?.equity_curve).toHaveLength(2);
  });
});

describe("snapshotHasUnavailableError", () => {
  it("detecte le fallback snapshot indisponible", () => {
    expect(
      snapshotHasUnavailableError({
        system: null,
        ui_status: null,
        health: null,
        strategy_summaries: {},
        strategy_runs: {},
        portfolio: null,
        s3: null,
        strategies_status: null,
        portfolio_guard: null,
        _meta: {
          errors: ["snapshot_unavailable"],
        },
      })
    ).toBe(true);
  });
});

describe("resolveOverviewStrategyRunId", () => {
  it("prefere le run explicitement selectionne", () => {
    expect(
      resolveOverviewStrategyRunId(
        "s2_pairs_trading",
        "run_manual",
        {
          system: null,
          ui_status: null,
          health: null,
          strategy_summaries: {},
          strategy_runs: {
            s2_pairs_trading: "run_snapshot",
          },
          portfolio: null,
          s3: null,
          strategies_status: null,
          portfolio_guard: null,
        },
        [
          {
            strategy_id: "s2_pairs_trading",
            source: "s2",
            service: "s2-pairs-a1",
            service_active: true,
            service_state: "active",
            run_id: "run_runtime",
            last_signal_ts: null,
            open_positions: 0,
          },
        ]
      )
    ).toBe("run_manual");
  });

  it("utilise le run runtime si le snapshot n'en fournit pas", () => {
    expect(
      resolveOverviewStrategyRunId(
        "tf_pullback_v1",
        null,
        {
          system: null,
          ui_status: null,
          health: null,
          strategy_summaries: {},
          strategy_runs: {},
          portfolio: null,
          s3: null,
          strategies_status: null,
          portfolio_guard: null,
        },
        [
          {
            strategy_id: "tf_pullback_v1",
            source: "s3",
            service: "s3-tf-a1",
            service_active: true,
            service_state: "active",
            run_id: "run_tf_runtime",
            last_signal_ts: null,
            open_positions: 0,
          },
        ]
      )
    ).toBe("run_tf_runtime");
  });
});

describe("runtime warmup fallbacks", () => {
  it("mappe un status runtime READY vers un rendu utilisable immediatement", () => {
    const runtime = {
      strategy_id: "s2_pairs_trading",
      source: "s2",
      service: "s2-pairs-a1",
      service_active: true,
      service_state: "active",
      run_id: "run_s2",
      last_signal_ts: null,
      open_positions: 0,
      warmup_progress: {
        status: "ready",
        stage: null,
        current: 120,
        target: 120,
        remaining: 0,
        reason: null,
      },
    };

    expect(resolveRuntimeWarmupState(runtime)).toBe("READY");
    expect(resolveRuntimeWarmupProgress(runtime)).toBe(1);
    expect(resolveRuntimeWarmupLabel(runtime)).toBe("120/120");
  });

  it("retombe sur la progression runtime quand le summary strategie manque encore", () => {
    const runtime = {
      strategy_id: "tf_pullback_v1",
      source: "s3",
      service: "s3-tf-a1",
      service_active: true,
      service_state: "active",
      run_id: "run_tf",
      last_signal_ts: null,
      open_positions: 0,
      warmup_progress: {
        status: "warmup_history",
        stage: "bootstrap",
        current: 37,
        target: 120,
        remaining: 83,
        reason: null,
      },
    };

    expect(resolveRuntimeWarmupState(runtime)).toBe("WARMUP");
    expect(resolveRuntimeWarmupProgress(runtime)).toBeCloseTo(37 / 120);
    expect(resolveRuntimeWarmupLabel(runtime)).toBe("37/120");
  });
});
