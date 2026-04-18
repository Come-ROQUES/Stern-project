import { useSyncExternalStore } from "react";

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

export type SimFill = {
  side: "buy" | "sell";
  price: number;
  size: number;
  ts: string;
  reason: string;
};

export type SpreadMetric = {
  avg: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  last: number | null;
};

export type SpreadMetrics = Record<string, SpreadMetric>;

export type MidPoint = {
  ts: string;
  mid_price: number;
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

export type RuntimeSnapshot = {
  uptime_s: number;
  messages_seen: number;
  trade_events: number;
  order_book_ready: boolean;
  book_levels: { bids: number; asks: number };
  mid_ready: boolean;
  last_trade_ts: string | null;
  feed_state: "warming" | "trades_only" | "live";
};

export type StrategySnapshot = {
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

export type SpreadRegime = {
  depth: string;
  state: "warming" | "tight" | "wide" | "balanced";
  last: number | null;
  avg: number | null;
};

export type QuantLabSnapshot = {
  readiness: "warming" | "ready";
  window_points: number;
  realized_vol_bps: number;
  momentum_bps: number;
  trade_flow_imbalance_btc: number;
  top5_depth_imbalance: number;
  micro_bias_bps: number;
  spread_regimes: SpreadRegime[];
  research_presets: Array<{
    name: string;
    spread_bps: number;
    skew_bps_per_btc: number;
    stance: string;
  }>;
};

export type BacktestLiteSnapshot = {
  mode: string;
  status: "warming" | "ready";
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

export type SternState = {
  product_id: string;
  mid_price: number | null;
  best_bid: BookLevel | null;
  best_ask: BookLevel | null;
  book: { bids: BookLevel[]; asks: BookLevel[] };
  recent_trades: PublicTrade[];
  spread_metrics: SpreadMetrics;
  spread_history: Record<string, number[]>;
  mid_history: MidPoint[];
  quote: Quote | null;
  risk_status: string;
  portfolio: PortfolioSnapshot;
  fills: SimFill[];
  runtime: RuntimeSnapshot;
  strategy: StrategySnapshot;
  quant_lab: QuantLabSnapshot;
  backtest_lite: BacktestLiteSnapshot;
};

const DEFAULT_POLL_MS = 500;

export async function fetchSternState(signal?: AbortSignal): Promise<SternState> {
  const res = await fetch("/api/state", { signal, credentials: "include" });
  if (!res.ok) {
    throw new Error(`/api/state ${res.status}`);
  }
  return (await res.json()) as SternState;
}

export type SternStateResult = {
  data: SternState | null;
  error: string | null;
  lastUpdatedAt: number | null;
};

/**
 * Singleton store — one poller, N subscribers.
 *
 * Previous impl ran an independent `fetch + setTimeout` loop per `useSternState`
 * call. Every crypto panel + the DeskBanner each opened their own poll (500 ms),
 * so a cockpit with 3 panels issued 3× the traffic AND each consumer had to
 * wait for its own first response before exiting the CONNECTING state. Now a
 * single pollLoop feeds all subscribers via useSyncExternalStore; first success
 * unblocks every consumer at once.
 */
const INITIAL_SNAPSHOT: SternStateResult = {
  data: null,
  error: null,
  lastUpdatedAt: null,
};

let snapshot: SternStateResult = INITIAL_SNAPSHOT;
const listeners = new Set<() => void>();
let activePollMs: number | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<void> | null = null;

function emit(next: SternStateResult): void {
  snapshot = next;
  listeners.forEach((cb) => cb());
}

async function runPoll(): Promise<void> {
  if (listeners.size === 0) {
    inFlight = null;
    return;
  }
  try {
    const state = await fetchSternState();
    emit({ data: state, error: null, lastUpdatedAt: Date.now() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emit({ data: snapshot.data, error: msg, lastUpdatedAt: snapshot.lastUpdatedAt });
  } finally {
    inFlight = null;
    if (listeners.size > 0 && activePollMs != null) {
      pollTimer = setTimeout(() => {
        inFlight = runPoll();
      }, activePollMs);
    }
  }
}

function subscribe(pollMs: number, listener: () => void): () => void {
  listeners.add(listener);
  // Honor the fastest requested cadence so one slow consumer can't starve
  // a fresh one. In practice every caller uses DEFAULT_POLL_MS today.
  if (activePollMs == null || pollMs < activePollMs) {
    activePollMs = pollMs;
  }
  if (!inFlight && !pollTimer) {
    inFlight = runPoll();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
      activePollMs = null;
    }
  };
}

function getSnapshot(): SternStateResult {
  return snapshot;
}

function getServerSnapshot(): SternStateResult {
  return INITIAL_SNAPSHOT;
}

export function useSternState(pollMs: number = DEFAULT_POLL_MS): SternStateResult {
  return useSyncExternalStore(
    (cb) => subscribe(pollMs, cb),
    getSnapshot,
    getServerSnapshot,
  );
}

export function downloadCsv(endpoint: "fills" | "pnl" | "spreads"): void {
  const anchor = document.createElement("a");
  anchor.href = `/api/export/${endpoint}.csv`;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
