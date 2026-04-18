export type BookLevel = { price: number; size: number };

export type PublicTrade = {
  trade_id: number | null;
  side: "buy" | "sell";
  price: number;
  size: number;
  ts: string;
};

export type Quote = {
  bid_price: number;
  ask_price: number;
  bid_size: number;
  ask_size: number;
  ts: string;
};

export type SimFill = {
  side: "buy" | "sell";
  price: number;
  size: number;
  ts: string;
  reason: string;
};

export type SpreadMetric = {
  last: number | null;
  avg: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  samples: number;
};

export type Portfolio = {
  cash: number;
  position_btc: number;
  avg_entry_price: number;
  exposure_usd: number;
  realized_pnl: number;
  unrealized_pnl: number;
  equity: number;
  drawdown: number;
};

export type Runtime = {
  uptime_s: number;
  messages_seen: number;
  trade_events: number;
  order_book_ready: boolean;
  book_levels: { bids: number; asks: number };
  mid_ready: boolean;
  last_trade_ts: string | null;
  feed_state: "warming" | "trades_only" | "live" | string;
};

export type Strategy = {
  mode: string;
  quote_active: boolean;
  fill_count: number;
  avg_fill_notional: number;
  inventory_btc: number;
  avg_entry_price: number;
  risk_status: string;
  effective_spread_bps: number;
  skew_bps: number;
  vol_input_bps: number;
  config: {
    base_quote_spread_bps: number;
    order_size_btc: number;
    position_skew_bps_per_btc: number;
    max_notional_exposure: number;
    max_loss: number;
  };
};

export type QuantLab = {
  readiness: "ready" | "warming";
  window_points: number;
  realized_vol_bps: number;
  momentum_bps: number;
  trade_flow_imbalance_btc: number;
  top5_depth_imbalance: number;
  micro_bias_bps: number;
};

export type BacktestLite = {
  status: "ready" | "warming";
  window_points: number;
  equity_curve: number[];
  pnl_curve: number[];
  peak_equity_usd: number;
  max_drawdown_usd: number;
  quote_uptime_pct: number;
  fill_count: number;
  fill_volume_btc: number;
  fill_notional_usd: number;
  paper_return_pct: number;
  total_pnl_usd: number;
};

export type MidPoint = { ts: string; mid_price: number };

export type AppState = {
  product_id: string;
  mid_price: number | null;
  best_bid: BookLevel | null;
  best_ask: BookLevel | null;
  book: { bids: BookLevel[]; asks: BookLevel[] };
  recent_trades: PublicTrade[];
  spread_metrics: Record<string, SpreadMetric>;
  spread_history: Record<string, number[]>;
  mid_history: MidPoint[];
  quote: Quote | null;
  risk_status: string;
  portfolio: Portfolio;
  fills: SimFill[];
  runtime: Runtime;
  strategy: Strategy;
  quant_lab: QuantLab;
  backtest_lite: BacktestLite;
};

export async function fetchState(signal?: AbortSignal): Promise<AppState> {
  const res = await fetch("/api/state", { signal, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`/api/state ${res.status}`);
  }
  return (await res.json()) as AppState;
}

export const exportUrls = {
  fills: "/api/export/fills.csv",
  pnl: "/api/export/pnl.csv",
  spreads: "/api/export/spreads.csv",
} as const;
