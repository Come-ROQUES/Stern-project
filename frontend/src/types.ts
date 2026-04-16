export type SpreadMetric = {
  last: number | null;
  avg: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  samples: number;
};

export type BookLevel = {
  price: number;
  size: number;
};

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

export type Fill = {
  side: "buy" | "sell";
  price: number;
  size: number;
  ts: string;
  reason: string;
};

export type HistoryPoint = {
  ts: string;
  mid_price: number;
};

export type RuntimeSnapshot = {
  uptime_s: number;
  messages_seen: number;
  trade_events: number;
  order_book_ready: boolean;
  book_levels: {
    bids: number;
    asks: number;
  };
  mid_ready: boolean;
  last_trade_ts: string | null;
  feed_state: string;
};

export type StrategySnapshot = {
  mode: string;
  quote_active: boolean;
  fill_count: number;
  avg_fill_notional: number;
  inventory_btc: number;
  avg_entry_price: number;
  risk_status: string;
  config: {
    base_quote_spread_bps: number;
    order_size_btc: number;
    position_skew_bps_per_btc: number;
    max_notional_exposure: number;
    max_loss: number;
  };
};

export type SpreadRegime = {
  depth: string;
  state: string;
  last: number | null;
  avg: number | null;
};

export type ResearchPreset = {
  name: string;
  spread_bps: number;
  skew_bps_per_btc: number;
  stance: string;
};

export type QuantLabSnapshot = {
  readiness: string;
  window_points: number;
  realized_vol_bps: number;
  momentum_bps: number;
  trade_flow_imbalance_btc: number;
  top5_depth_imbalance: number;
  micro_bias_bps: number;
  spread_regimes: SpreadRegime[];
  research_presets: ResearchPreset[];
};

export type BacktestSnapshot = {
  mode: string;
  status: string;
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

export type PortfolioSnapshot = {
  cash: number;
  position_btc: number;
  avg_entry_price: number;
  exposure_usd: number;
  realized_pnl: number;
  unrealized_pnl: number;
  equity: number;
  drawdown: number;
};

export type ApiState = {
  product_id: string;
  mid_price: number | null;
  best_bid: BookLevel | null;
  best_ask: BookLevel | null;
  book: {
    bids: BookLevel[];
    asks: BookLevel[];
  };
  recent_trades: PublicTrade[];
  spread_metrics: Record<string, SpreadMetric>;
  spread_history: Record<string, number[]>;
  mid_history: HistoryPoint[];
  quote: Quote | null;
  risk_status: string;
  portfolio: PortfolioSnapshot;
  fills: Fill[];
  runtime: RuntimeSnapshot;
  strategy: StrategySnapshot;
  quant_lab: QuantLabSnapshot;
  backtest_lite: BacktestSnapshot;
};

