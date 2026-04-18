import type { Quote, Strategy } from "../lib/api";
import { fmtBps, fmtBtc, fmtPrice, fmtUsd } from "../lib/format";
import { Card, Pill, Stat } from "./ui";

type Props = {
  quote: Quote | null;
  strategy: Strategy;
  mid: number | null;
};

export function MarketMakerPanel({ quote, strategy, mid }: Props) {
  const cfg = strategy.config;
  const isLive = quote != null && strategy.quote_active;
  const bidEdgeBps =
    quote && mid ? ((mid - quote.bid_price) / mid) * 10_000 : null;
  const askEdgeBps =
    quote && mid ? ((quote.ask_price - mid) / mid) * 10_000 : null;
  const volPremium = strategy.effective_spread_bps - cfg.base_quote_spread_bps;

  return (
    <Card
      title="Market maker quote"
      subtitle="paper quotes · simulated fills via trade feed"
      right={
        <Pill tone={isLive ? "good" : "warn"}>
          {isLive ? "quoting" : strategy.risk_status}
        </Pill>
      }
      className="h-full"
    >
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Bid"
          value={
            <span className="text-emerald-300">{quote ? fmtPrice(quote.bid_price) : "—"}</span>
          }
          hint={
            quote
              ? `${quote.bid_size.toFixed(3)} BTC · edge ${fmtBps(bidEdgeBps)}`
              : "no quote (mid not ready or risk halt)"
          }
        />
        <Stat
          label="Ask"
          value={<span className="text-rose-300">{quote ? fmtPrice(quote.ask_price) : "—"}</span>}
          hint={
            quote
              ? `${quote.ask_size.toFixed(3)} BTC · edge ${fmtBps(askEdgeBps)}`
              : ""
          }
          align="right"
        />
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-white/5 pt-3">
        <Stat
          label="Effective spread"
          value={fmtBps(strategy.effective_spread_bps)}
          hint={`base ${cfg.base_quote_spread_bps} bps · vol+ ${volPremium.toFixed(1)}`}
          tone={volPremium > 5 ? "warn" : "default"}
        />
        <Stat label="Skew" value={fmtBps(strategy.skew_bps)} hint={`${cfg.position_skew_bps_per_btc} bps/BTC`} />
        <Stat label="Realized vol" value={fmtBps(strategy.vol_input_bps)} hint="rolling, 60 ticks" />
        <Stat label="Quote size" value={fmtBtc(cfg.order_size_btc, 3)} hint={fmtUsd((mid ?? 0) * cfg.order_size_btc, { compact: true })} />
      </div>

      <p className="mt-3 text-[11px] text-neutral-500">
        Quote = mid ± (effective spread / 2) − skew. Vol-adaptive widens the spread when realized volatility exceeds the base quote.
      </p>
    </Card>
  );
}
