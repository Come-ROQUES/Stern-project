import type { AppState } from "../lib/api";
import { exportUrls } from "../lib/api";
import { fmtBps, fmtBtc, fmtPct, fmtPrice, fmtUsd } from "../lib/format";
import { LineChart } from "./LineChart";
import { Card, Stat } from "./ui";

type Props = {
  state: AppState;
};

export function AnalyticsPanel({ state }: Props) {
  const midSeries = state.mid_history.map((p) => p.mid_price);
  const equity = state.backtest_lite.equity_curve;
  const pnl = state.backtest_lite.pnl_curve;
  const spread01 = state.spread_history["0.1 BTC"] ?? [];
  const spread1 = state.spread_history["1 BTC"] ?? [];
  const spread5 = state.spread_history["5 BTC"] ?? [];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <Card title="Mid price" subtitle={`${midSeries.length} samples`} className="xl:col-span-2">
        <LineChart
          height={220}
          series={[
            {
              values: midSeries,
              stroke: "#2ce3ff",
              fill: "rgba(44,227,255,0.10)",
              strokeWidth: 1.6,
            },
          ]}
          yFormatter={(v) => fmtPrice(v, 0)}
        />
      </Card>

      <Card title="Microstructure" subtitle="lean of the book vs trades">
        <div className="grid grid-cols-2 gap-3">
          <Stat
            label="Realized vol"
            value={fmtBps(state.quant_lab.realized_vol_bps)}
            hint="rolling 60 ticks"
          />
          <Stat
            label="Momentum"
            value={fmtBps(state.quant_lab.momentum_bps)}
            hint="window mid drift"
            tone={state.quant_lab.momentum_bps > 0 ? "good" : state.quant_lab.momentum_bps < 0 ? "bad" : "default"}
          />
          <Stat
            label="Micro-bias"
            value={fmtBps(state.quant_lab.micro_bias_bps)}
            hint="size-weighted micro-price vs mid"
            tone={state.quant_lab.micro_bias_bps > 0 ? "good" : state.quant_lab.micro_bias_bps < 0 ? "bad" : "default"}
          />
          <Stat
            label="Top-5 depth imbalance"
            value={fmtPct(state.quant_lab.top5_depth_imbalance * 100)}
            hint="(bid − ask) / total"
          />
          <Stat
            label="Trade flow imbalance"
            value={fmtBtc(state.quant_lab.trade_flow_imbalance_btc, 3)}
            hint="last 50 trades"
            tone={state.quant_lab.trade_flow_imbalance_btc > 0 ? "good" : state.quant_lab.trade_flow_imbalance_btc < 0 ? "bad" : "default"}
          />
          <Stat
            label="Window"
            value={`${state.quant_lab.window_points}`}
            hint={state.quant_lab.readiness}
          />
        </div>
      </Card>

      <Card
        title="Spread history"
        subtitle="$ per BTC across executable depths"
        className="xl:col-span-2"
      >
        <LineChart
          height={220}
          series={[
            { values: spread01, stroke: "#34d399", strokeWidth: 1.5, label: "0.1 BTC" },
            { values: spread1, stroke: "#2ce3ff", strokeWidth: 1.5, label: "1 BTC" },
            { values: spread5, stroke: "#f472b6", strokeWidth: 1.5, label: "5 BTC" },
          ]}
          yFormatter={(v) => `$${v.toFixed(1)}`}
        />
        <div className="mt-2 flex gap-3 text-[11px] mono uppercase tracking-wider">
          <Legend color="#34d399">0.1 BTC</Legend>
          <Legend color="#2ce3ff">1 BTC</Legend>
          <Legend color="#f472b6">5 BTC</Legend>
        </div>
      </Card>

      <Card
        title="Equity & P&L"
        subtitle={`return ${fmtPct(state.backtest_lite.paper_return_pct)} · max DD ${fmtUsd(state.backtest_lite.max_drawdown_usd, { compact: true })}`}
        right={
          <a
            href={exportUrls.pnl}
            className="text-[11px] mono uppercase tracking-wider px-2.5 py-1 rounded-full border border-cyan-300/30 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20"
          >
            Export CSV
          </a>
        }
      >
        <LineChart
          height={170}
          showZero
          series={[
            {
              values: pnl,
              stroke: "#a3e635",
              fill: "rgba(163,230,53,0.10)",
              strokeWidth: 1.6,
            },
          ]}
          yFormatter={(v) => fmtUsd(v, { compact: true })}
        />
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <Stat label="Quote uptime" value={`${state.backtest_lite.quote_uptime_pct.toFixed(0)}%`} />
          <Stat label="Fills" value={state.backtest_lite.fill_count.toString()} hint={`${state.backtest_lite.fill_volume_btc.toFixed(3)} BTC`} />
          <Stat label="Notional traded" value={fmtUsd(state.backtest_lite.fill_notional_usd, { compact: true })} />
          <Stat label="Peak equity" value={fmtUsd(state.backtest_lite.peak_equity_usd, { compact: true })} />
        </div>
      </Card>

      <Card
        title="Equity curve"
        subtitle="paper account value, marked to mid"
        className="xl:col-span-3"
        right={
          <a
            href={exportUrls.spreads}
            className="text-[11px] mono uppercase tracking-wider px-2.5 py-1 rounded-full border border-white/15 bg-white/5 text-neutral-200 hover:bg-white/10"
          >
            Export spreads CSV
          </a>
        }
      >
        <LineChart
          height={200}
          series={[
            {
              values: equity,
              stroke: "#2ce3ff",
              fill: "rgba(44,227,255,0.10)",
              strokeWidth: 1.6,
            },
          ]}
          yFormatter={(v) => fmtUsd(v, { compact: true })}
        />
      </Card>
    </div>
  );
}

function Legend({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-neutral-400">
      <span className="inline-block h-2 w-3 rounded-sm" style={{ background: color }} />
      {children}
    </span>
  );
}
