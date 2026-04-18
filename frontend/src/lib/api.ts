import { ActiveContext, DataScope, activeContext, withContext, defaultScope } from "./activeContext";
import { StrategyId } from "./strategies";
import type {
  CanonicalKPIs,
  CanonicalTrade,
  Shock,
  ShockStats,
  Signal as CanonicalSignal,
  SignalStats,
} from "./canonicalApi";

export type Ohlc = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  tick_count: number | null;
  spread_close_pips?: number | null;
};
export type OhlcPayload = {
  state?: "OFF_MARKET" | "DEGRADED" | "LIVE" | "EMPTY" | string;
  ohlc: Ohlc[];
  meta?: {
    reason?: string;
    tick_age?: number | null;
    bar_age?: number | null;
    bar_end_age?: number | null;
    data_origin?: string | null;
    run_id?: string | null;
    strategy_id?: string | null;
    bar_interval_s?: number | null;
    source_bar_interval_s?: number | null;
    market_open?: boolean | null;
    max_tick_age_seconds?: number | null;
    max_bar_age_seconds?: number | null;
    max_bar_age_hard_limit?: number | null;
    latest_source_bar_ts?: string | null;
    latest_returned_bar_ts?: string | null;
    is_time_range?: boolean;
  };
};

export type ShadowTrade = {
  timestamp_entry: string;
  timestamp_exit?: string | null;
  direction: "BUY" | "SELL";
  notional_eur: number;
  entry_price: number;
  exit_price?: number | null;
  spread_pips_entry?: number | null;
  spread_pips_exit?: number | null;
  gross_pnl_pips?: number | null;
  gross_pnl_eur?: number | null;
  commission_total_eur?: number | null;
  slippage_total_eur?: number | null;
  net_pnl_eur?: number | null;
  net_pnl_usd?: number | null;
  exit_reason?: string | null;
  status: string;
  session?: string | null;
};

export type ShadowSnapshot = {
  timestamp: string;
  current_equity: number;
  campaign_pnl_eur: number;
  campaign_pnl_usd?: number;
  campaign_pnl_pct: number;
  daily_pnl_eur: number;
  daily_pnl_usd?: number;
  total_trades: number;
  win_rate: number;
  current_drawdown_pct: number;
};

export type Health = {
  bot_db: boolean;
  analytics_db: boolean;
  shadow_db: boolean;
  status: string;
};

export type StrategyConfig = {
  damping: number | null;
  max_holding_bars: number | null;
  stop_loss_mult: number | null;
  risk_pct: number | null;
  slippage_bps: number | null;
  spread_multiplier: Record<string, number> | null;
  take_profit_mult?: number | null;
  risk_scale_min?: number | null;
  risk_scale_max?: number | null;
  min_tp_pips?: number | null;
  min_shock_amplitude_pips?: number | null;
};

export type CalibrationStatus = {
  shocks_collected: number | null;
  target_shocks: number | null;
  status: string;
  outdated: boolean;
  outdated_reason?: string | null;
  trajectories: any[];
  outcomes?: {
    avg_mfe_60?: number | null;
    avg_mae_60?: number | null;
    avg_final_pnl_60?: number | null;
  };
};

export type CalibrationReport = {
  report_date: string;
  verdict: { status: string; reasons: string[] };
  data_quality: any;
  strategy_behavior: any;
  performance: any;
  diagnostics: any;
  suggested_changes: any[];
  tomorrow_plan: string[];
  scorecard?: {
    deal_flow: any[];
    edge_table: any[];
    filter_impact: any[];
    episodes: { count: number };
    grid: any[];
  };
  artifacts: { json: string; md: string; parquet: string };
  ai_summary?: string;
};

export type MarketMetrics = {
  vol_regimes: any[];
  spreads_by_session: any[];
  acf: any[];
  vr: any[];
  time_heatmap: any[];
  latency_series?: any[];
};

export type SessionProfile = {
  session: string;
  profile: any;
  developing: any;
  acceptance: any;
  zones: any;
  count: number;
};

export type CompositeProfile = {
  today: any;
  composite_last5: any;
  hvn_lvn: any;
  playbook: any;
};

export type MarketProfileRow = {
  timestamp: string;
  symbol: string;
  vol_5min: number | null;
  vol_15min: number | null;
  vol_60min: number | null;
  atr_14: number | null;
  atr_50: number | null;
  atr_200: number | null;
  volatility_regime: string | null;
  acf_1: number | null;
  acf_5: number | null;
  acf_10: number | null;
  vr_2: number | null;
  vr_5: number | null;
  vr_10: number | null;
  skewness: number | null;
  kurtosis: number | null;
  spread_pips: number | null;
  hour_of_day: number | null;
  day_of_week: number | null;
  // V3 additions (legacy App.tsx removed; kept for compatibility if reintroduced)
  regime?: string | null;
  atr_pips?: number | null;
};

// Live tick for developing candle (polled ~1s)
export type LiveTick = {
  bid: number | null;
  ask: number | null;
  mid: number | null;
  spread_pips: number | null;
  run_id?: string | null;
  reflex?: {
    active: boolean;
    signal_id?: string | null;
    shock_id?: string | null;
    state?: string | null;
    direction?: string | null;
    mid?: number | null;
    anchor_price?: number | null;
    peak_price?: number | null;
    target_price?: number | null;
    retrace_threshold?: number | null;
    retrace_ratio?: number | null;
    move_pips?: number | null;
    retrace_distance_pips?: number | null;
    anchor_cross?: boolean | null;
    ttl_s?: number | null;
    elapsed_s?: number | null;
    remaining_s?: number | null;
    park_spread_active?: boolean | null;
    exhaustion_wait_active?: boolean | null;
    exhaustion_ok_ticks?: number | null;
    exhaustion_need_ticks?: number | null;
  } | null;
  ts: number; // server epoch
};

export type SystemStatus = {
  last_tick_time: string | null;
  last_log_time?: string | null;
  kill_switch: boolean;
  close_all: boolean;
  autostart_disabled: boolean;
  trading_paused: boolean;
  bot_running: boolean | null;
  service_status?: string;
  service_checked?: boolean;
  tick_age_seconds?: number | null;
  latency_ms?: number | null;
  // Flat warmup fields for backward compat
  warmup_bars?: number | null;
  warmup_ready?: boolean | null;
  warmup_eta_seconds?: number | null;
  // Flat price fields
  bid?: number | null;
  ask?: number | null;
  spread_pips?: number | null;
  mid?: number | null;
  // Strategy config from bot
  max_spread_pips?: number | null;
  // Flat health fields
  gateway_connected?: boolean | null;
  data_fresh?: boolean | null;
  trading_blocked?: boolean | null;
  block_reason?: string | null;
  market_open?: boolean | null;
  last_log: string | null;
  system_actions_enabled?: boolean;
  // Nested structures
  warmup?: {
    bars_current: number | null;
    bars_required: number;
    warmup_pct: number | null;
    warmup_complete: boolean | null;
  };
  price?: {
    bid: number | null;
    ask: number | null;
    spread_pips: number | null;
    mid: number | null;
  };
  health?: {
    gateway_connected: boolean;
    data_fresh: boolean;
    trading_blocked: boolean;
    block_reason: string | null;
  };
  guardian?: GuardianStatus | null;
  services?: Record<
    string,
    {
      service: string | null;
      strategy_id: string;
      active: boolean;
      state: string;
      active_pid: number | null;
      service_checked: boolean;
      log_path: string | null;
      last_log_time: string | null;
      log_fresh: boolean;
      last_db_ts: string | null;
      db_fresh: boolean;
      run_id: string | null;
      last_signal_ts: string | null;
      last_trade_ts: string | null;
    }
  >;
  strategies?: Record<
    string,
    {
      healthy: boolean;
      reason: string | null;
      mode: string;
      service: string | null;
      run_id: string | null;
      log_fresh: boolean;
      db_fresh: boolean;
      last_signal_ts: string | null;
      last_trade_ts: string | null;
      latest_reason: string | null;
      warmup?: {
        status: string;
        stage: string | null;
        current: number | null;
        target: number | null;
        remaining: number | null;
        reason: string | null;
      };
      kill_switch_reason?: string | null;
      kill_switch_ts?: string | null;
      kill_scope?: string | null;
      requires_operator_ack?: boolean;
      restart_allowed: boolean;
      restart_blockers: string[];
      reconcile_scope?: string | null;
      snapshot_saved_at?: string | null;
      snapshot_age_h?: number | null;
    }
  >;
};

export type EmergencyControlFlag =
  | "kill_switch"
  | "systemd_block"
  | "disable_autostart";

export type EmergencyControlScope = "global" | "service";

export type EmergencyControlFlagState = {
  flag: EmergencyControlFlag;
  active: boolean;
  scope: EmergencyControlScope;
  path: string;
  updated_at: string | null;
  reason: string | null;
  content: string | null;
  metadata: Record<string, string>;
};

export type EmergencyControlScopeState = {
  strategy_id: string;
  owner_service: string | null;
  service: string | null;
  service_active: boolean | null;
  service_state: string;
  service_checked: boolean;
  active_pid: number | null;
  restart_allowed: boolean;
  restart_blockers: string[];
  flags: Record<EmergencyControlFlag, EmergencyControlFlagState>;
};

export type EmergencyControlsResponse = {
  control_dir: string;
  globals: Record<EmergencyControlFlag, EmergencyControlFlagState>;
  strategies: Record<string, EmergencyControlScopeState>;
  _meta?: {
    endpoint?: string;
    system_actions_enabled?: boolean;
  };
};

export type GuardianStatus = {
  service_name: string;
  service_checked: boolean;
  service_state: string;
  running: boolean;
  log_path: string;
  last_log_time: string | null;
  last_action_time: string | null;
  last_action_orphan_orders: number | null;
  last_action_orphan_positions: number | null;
  interval_seconds: number | null;
  grace_seconds: number | null;
};

export type UiRelayStatus = {
  client_count: number;
  buffer_len: number;
  last_ingest_ts: string | null;
  last_broadcast_ts: string | null;
};

export type UiStatus = {
  run_id: string | null;
  last_tick_time: string | null;
  relay: UiRelayStatus;
  system: {
    gateway_connected: boolean | null;
    bot_running: boolean | null;
  };
};

export type DashboardSnapshotProfile =
  | "terminal"
  | "ops"
  | "overview"
  | "portfolio"
  | "s3";

export type DashboardSnapshotDetailLevel = "full" | "core";

export type DashboardStrategySummary = StrategySummary | S2Summary;

export type DashboardPortfolioStrategyStats = {
  winRate: number;
  profitFactor: number;
  sharpe: number;
  dailyPnL: number;
  cumulativePnL: number;
  tradeCount: number;
  dataSource: string;
  last_exit_ts?: string | null;
  commission_view?: "reported" | "economic" | null;
  missing_exit_pct?: number | null;
  anomaly_count?: number | null;
};

export type DashboardPortfolioSnapshot = {
  summary: {
    current_epoch: number;
    sim_equity_usd: number;
    equity_usd: number;
    pnl_epoch_usd: number;
    pnl_7d_usd: number;
    pnl_30d_usd: number;
    trades_7d: number;
    trades_30d: number;
    epoch_started_at: string | null;
    _meta?: Record<string, unknown>;
  } | null;
  strategies: Record<string, DashboardPortfolioStrategyStats | null>;
  portfolio_epoch?: number | null;
  commission_view?: "reported" | "economic" | string;
  recent_trades?: CanonicalTrade[];
  recent_trades_meta?: Record<string, unknown> | null;
};

export type PortfolioSummaryResponse = NonNullable<
  DashboardPortfolioSnapshot["summary"]
>;

export type DashboardS3Snapshot = {
  summary: DashboardStrategySummary | null;
  kpis: CanonicalKPIs | null;
  signals: CanonicalSignal[];
  signal_stats: SignalStats | null;
  shocks: Shock[];
  shock_stats: ShockStats | null;
  trades: CanonicalTrade[];
  execution: ExecutionMetricsResponse | null;
};

export type DashboardSnapshot = {
  system: SystemStatus | null;
  ui_status: UiStatus | null;
  health: Health | null;
  strategy_summaries: Record<string, DashboardStrategySummary | null>;
  strategy_summary_meta?: Record<
    string,
    {
      run_id?: string | null;
      status?: "pending" | "ready" | "empty" | "missing_run" | "error" | "skipped" | string;
      source?: string | null;
      error?: string | null;
    }
  >;
  strategy_runs?: Record<string, string | null>;
  portfolio?: DashboardPortfolioSnapshot | null;
  s3?: DashboardS3Snapshot | null;
  strategies_status?: StrategiesStatusResponse | null;
  portfolio_guard?: PortfolioGuardStatus | null;
  _meta?: {
    run_id?: string | null;
    profile?: DashboardSnapshotProfile | string;
    rows?: number;
    query_ms?: number;
    cache_hit?: boolean;
    generated_at_utc?: string;
    errors?: string[];
    detail_level?: DashboardSnapshotDetailLevel | string;
    deferred_sections?: string[];
    section_ms?: Record<string, number>;
  };
};

export type OverviewLane = "runtime" | "portfolio" | "summaries";

export type OverviewRuntimeLaneResponse = {
  lane: "runtime";
  system: SystemStatus | null;
  ui_status: UiStatus | null;
  strategies_status: StrategiesStatusResponse | null;
  strategy_runs: Record<string, string | null>;
  _meta?: Record<string, unknown>;
};

export type OverviewPortfolioLaneResponse = {
  lane: "portfolio";
  portfolio: DashboardPortfolioSnapshot | null;
  strategy_runs: Record<string, string | null>;
  _meta?: Record<string, unknown>;
};

export type OverviewSummariesLaneResponse = {
  lane: "summaries";
  strategy_summaries: Record<string, DashboardStrategySummary | null>;
  strategy_summary_meta: NonNullable<DashboardSnapshot["strategy_summary_meta"]>;
  strategy_runs: Record<string, string | null>;
  _meta?: Record<string, unknown>;
};

export type OverviewLaneResponse =
  | OverviewRuntimeLaneResponse
  | OverviewPortfolioLaneResponse
  | OverviewSummariesLaneResponse;

export type DeskRunContextResponse = {
  bundle_enabled: boolean;
  seed_run_id: string | null;
  has_any_run: boolean;
  selected_run_id: string | null;
  active_run_id: string | null;
  selected_run: Record<string, unknown> | null;
  active_run: Record<string, unknown> | null;
  runtime_runs: Record<string, string | null>;
  strategy_runs: Record<string, string | null>;
  strategy_sources: Record<
    string,
    {
      run_id: string | null;
      source: string | null;
    }
  >;
  bundle_inputs: Record<string, string | null>;
  _meta?: {
    errors?: string[];
    cache_hit?: boolean;
  };
};

export type TerminalSnapshotLogs = {
  source: string;
  service?: string | null;
  lines: string[];
  degraded: boolean;
  error?: string | null;
  message?: string | null;
  retried?: boolean;
  transport?: string | null;
  window?: string;
  attempts?: number;
  line_count?: number;
  latency_ms?: number | null;
  _meta?: {
    source?: string;
    query_ms?: number;
    cache_hit?: boolean;
    degraded?: boolean;
  };
};

export type LogsSnapshotResponse = {
  sources: Record<"s1" | "s2" | "s3", LogsResponse>;
  _meta?: {
    rows?: number;
    query_ms?: number;
    cache_hit?: boolean;
    degraded?: boolean;
    errors?: string[];
  };
};

export type TerminalSnapshot = {
  system: SystemStatus | null;
  market_metrics: MarketMetrics | null;
  market_profile: MarketProfileRow[];
  ohlc: OhlcPayload;
  signals: Signal[];
  logs: TerminalSnapshotLogs | null;
  _meta?: {
    run_id?: string | null;
    sections?: number;
    query_ms?: number;
    cache_hit?: boolean;
    degraded?: boolean;
    generated_at_utc?: string;
    errors?: string[];
    section_ms?: TerminalSnapshotMetaSectionTiming;
    requested_sections?: string[];
    signals_mode?: "full" | "lite";
  };
};

export type TerminalSnapshotMetaSectionTiming = Partial<
  Record<
    "system" | "market_metrics" | "market_profile" | "ohlc" | "signals" | "logs",
    number
  >
>;

export type VmHostStatus = {
  label: string;
  platform: string;
  supported: boolean;
  checked_at: string | null;
  snapshot_age_seconds: number | null;
};

export type VmResources = {
  cpu_percent: number | null;
  load_avg_1m: number | null;
  load_avg_5m: number | null;
  load_avg_15m: number | null;
  memory_total_mb: number | null;
  memory_used_mb: number | null;
  memory_available_mb: number | null;
  memory_percent: number | null;
  swap_total_mb: number | null;
  swap_used_mb: number | null;
  swap_free_mb: number | null;
  swap_percent: number | null;
};

export type VmServiceStatus = {
  name: string;
  label: string;
  state: "active" | "inactive" | "failed" | "unknown" | "unsupported" | string;
  ok: boolean | null;
  main_pid: number | null;
};

export type VmStatusResponse = {
  host: VmHostStatus;
  resources: VmResources;
  services: VmServiceStatus[];
  _meta?: {
    cache_ttl_s?: number;
    degraded?: boolean;
  };
};

export type Portfolio = {
  equity: number | null;
  pnl: number | null;
  positions?: number;
};

export type LogsResponse = {
  lines: string[];
  message?: string;
  source?: "bot" | "s1" | "s2" | "s3" | string;
  service?: string | null;
  degraded?: boolean;
  error?: string | null;
  retried?: boolean;
  transport?: "file_tail" | "journalctl_primary" | "journalctl_retry" | string;
  window?: "none" | "30m" | "2h" | "12h" | string;
  attempts?: number;
  line_count?: number;
  latency_ms?: number | null;
};

export type StrategyRuntimeStatus = {
  strategy_id: string;
  source: "s1" | "s2" | "s3" | string;
  owner_service?: string | null;
  service: string | null;
  service_active: boolean | null;
  service_state: string;
  active_pid?: number | null;
  run_id: string | null;
  last_signal_ts: string | null;
  last_accepted_ts?: string | null;
  last_trade_ts?: string | null;
  warmup_progress?: {
    status: string;
    stage: string | null;
    current: number | null;
    target: number | null;
    remaining: number | null;
    reason: string | null;
  };
  duplicate_writer_detected?: boolean;
  duplicate_writer_runs?: string[];
  open_positions: number;
};

export type StrategiesStatusResponse = {
  strategies: StrategyRuntimeStatus[];
  _meta?: Record<string, unknown>;
};

export type PortfolioGuardStatus = {
  enabled: boolean;
  canonical_db_path: string;
  slots: {
    max_open_per_strategy: number;
    max_pending_entry_per_strategy: number;
    max_open_global: number;
  };
  counts: {
    open_global: number;
    pending_global: number;
  };
  reservations: Array<{
    reservation_id: string;
    strategy_id: string;
    run_id: string;
    signal_id: string | null;
    created_ts: string;
    expires_ts: string;
  }>;
};

export type Signal = {
  timestamp: string;
  symbol: string;
  direction: string;
  signal_type?: string;
  z_score?: number | null;
  mu?: number | null;
  sigma?: number | null;
  beta?: number | null;
  beta_r2?: number | null;
  beta_std?: number | null;
  beta_obs?: number | null;
  beta_clamped?: boolean | null;
  corr?: number | null;
  delta_pips?: number | null;
  volatility_regime?: string | null;
  spread_pips?: number | null;
  spread?: number | null;
  spread_log?: number | null;
  spread_raw?: number | null;
  reversion_ratio?: number | null;
  mfe_pips?: number | null;
  mae_pips?: number | null;
  final_pnl_pips?: number | null;
  anchor_price?: number | null;
  accepted?: boolean;
  rejection_reason?: string | null;
  why_rejected?: string | null;
  gate_values?: Record<string, unknown>;
  gate_failures?: string[];
  run_id?: string | null;
  portfolio_epoch?: number | null;
  time_to_reflex_bars?: number | null;
  ttr_bars?: number | null;
  side?: string;
  signal_id?: string | null;
  trade_id?: string | null;
  was_traded?: boolean;
  final_pnl_eur?: number | null;
  amplitude_pips?: number | null;
  atr_pips?: number | null;
  decision_stage?: string | null;
  reason?: string | null;
  config_snapshot?: string | null;
  rejection_detail_json?: string | null;
  signal_created_ts?: string | null;
  decision_ts?: string | null;
  decision_source?: string | null;
  router_dispatch_ts?: string | null;
  gate_eval_start_ts?: string | null;
  gate_eval_end_ts?: string | null;
  shock_detect_ts?: string | null;
  shock_detect_bar_ts?: string | null;
  reflex_deadline_ms?: number | null;
  reflex_elapsed_ms?: number | null;
  reflex_elapsed_event_ms?: number | null;
  reflex_elapsed_wall_ms?: number | null;
  reflex_ttl_source?: string | null;
  bar_age_at_decision_sec?: number | null;
  bar_end_age_at_decision_sec?: number | null;
  tick_age_at_decision_sec?: number | null;
  spread_pips_at_decision?: number | null;
  spread_pips_at_submit?: number | null;
  burst_bars_window_s?: number | null;
  burst_bars_count?: number | null;
  wait_state?: string | null;
  wait_reason?: string | null;
  wait_enter_ts?: string | null;
  wait_release_ts?: string | null;
  wait_expire_ts?: string | null;
  wait_state_elapsed_ms?: number | null;
  wait_state_elapsed_source?: string | null;
  waiting_reflex_elapsed_ms?: number | null;
  waiting_reflex_ttl_ms?: number | null;
  sim_outcome?: string | null;
  sim_valid?: boolean | null;
  sim_verdict?: "WOULD_WIN" | "WOULD_LOSE" | "UNRELIABLE" | null;
  sim_profitable?: boolean | null;
  sim_anchor_ts?: string | null;
  sim_tp_after_decision?: boolean | null;
  sim_pnl_pips?: number | null;
  sim_pnl_usd?: number | null;
  sim_mfe_pips?: number | null;
  sim_mae_pips?: number | null;
  sim_quality?: string | null;
  extreme_recovery_mode?: boolean | null;
  extreme_state?: string | null;
  extreme_event_id?: string | null;
  extreme_peak_pips?: number | null;
  signal_trajectory_json?: string | null;
};

export type DwSummary = {
  strategy_id?: string | null;
  strategy_name: string;
  run_id: string | null;
  warmup_state: string | null;
  warmup_bars?: number | null;
  warmup_target?: number | null;
  warmup_detail?: string | null;
  last_signal_ts?: string | null;
  history_bars?: number | null;
  history_bars_required?: number | null;
  history_span_hours?: number | null;
  warmup_stage?: string | null;
  history_source?: string | null;
  history_bootstrap_status?: string | null;
  history_ready?: boolean | null;
  m15_bars_available?: number | null;
  h1_bars_available?: number | null;
  required_m15_bars?: number | null;
  required_h1_bars?: number | null;
  snapshot_saved_at?: string | null;
  snapshot_age_h?: number | null;
  snapshot_loaded_from?: string | null;
  reject_throttled_count?: number | null;
  last_signal?: {
    timestamp: string;
    symbol: string;
    direction: string;
    signal_type: string;
    accepted: boolean;
    reason: string | null;
    z_score: number | null;
    spread: number | null;
    decision_stage: string | null;
  } | null;
  counts: {
    total: number;
    accepted: number;
    rejected: number;
  };
};
export type StrategySummary = DwSummary;
export type StrategyTopRejection = {
  reason: string;
  count: number;
  share: number;
  last_ts: string | null;
};

export type StrategyTopRejectionsResponse = {
  strategy_id: string;
  strategy_name: string;
  run_id: string | null;
  top_n: number;
  totals: {
    signals_total: number;
    accepted_signals: number;
    rejected_signals: number;
    pending_signals: number;
    rejection_rate: number | null;
  };
  top_rejections: StrategyTopRejection[];
  _meta?: Record<string, unknown>;
};

export type S2Summary = {
  strategy_name: string;
  pair_key: string | null;
  run_id: string | null;
  config_hash?: string | null;
  run_started_at?: string | null;
  rotation_reason?: string | null;
  restart_count_seen?: number | null;
  warmup_state: string;
  warmup_reason?: string | null;
  last_signal_ts: string | null;
  last_signal: {
    timestamp: string;
    symbol: string;
    direction: string;
    signal_type: string;
    accepted: boolean;
    reason: string | null;
    z_score: number | null;
    spread: number | null;
  } | null;
  counts: {
    total: number;
    accepted: number;
    rejected: number;
    warmup: number;
  };
  signal_count?: number;
  shadow?: {
    trades: number;
    pnl_bps: number;
    pnl_bps_gross: number;
    pnl_bps_net: number;
    pnl_z: number;
    win_rate: number;
    sharpe: number;
    profit_factor: number;
    max_drawdown_bps: number;
    avg_pnl_bps: number;
    last_exit_ts: string | null;
    open_position: boolean;
    by_exit_reason: Record<string, {
      count: number;
      pnl_bps_net: number;
      wins: number;
      win_rate: number;
    }>;
    trade_list: Array<{
      entry_ts: string;
      exit_ts: string;
      direction: string;
      pnl_bps_gross: number;
      pnl_bps_net: number;
      pnl_z: number | null;
      exit_reason: string;
    }>;
  };
  config: {
    symbol_a?: string | null;
    symbol_b?: string | null;
    bar_interval_s?: number | null;
    window_bars?: number | null;
    min_warmup?: number | null;
    entry_z?: number | null;
    exit_z?: number | null;
    stop_z?: number | null;
    model_family?: string | null;
    config_version?: string | null;
    ecm_confirmation?: number | null;
    sigma_floor?: number | null;
    sigma_cap?: number | null;
    sigma_cap_mode?: string | null;
    sigma_cap_k?: number | null;
    sigma_cap_quantile?: number | null;
    sigma_cap_window?: number | null;
    beta_lookback?: number | null;
    beta_min?: number | null;
    beta_max?: number | null;
    min_r2_beta?: number | null;
    beta_stability_window?: number | null;
    max_beta_change?: number | null;
    ou_lookback?: number | null;
    half_life_min_bars?: number | null;
    half_life_max_bars?: number | null;
    min_edge_z?: number | null;
    min_edge_cost_ratio?: number | null;
    cost_commission_pips_rt?: number | null;
    cost_slippage_pips_rt?: number | null;
    min_corr?: number | null;
    min_corr_bars?: number | null;
    max_spread_pips?: number | null;
    cooldown_minutes?: number | null;
    max_holding_minutes?: number | null;
    max_missing_minutes_per_hour?: number | null;
    bar_age_limit_ms?: number | null;
    require_spread_est?: boolean | null;
    entry_reversal_confirm_enabled?: boolean | null;
    entry_reversal_min_delta_z?: number | null;
    session_aware?: boolean | null;
    block_low_liquidity?: boolean | null;
  };
  gates: {
    flags?: string[];
    bar_age_ms?: number | null;
    missing_minutes_1h?: number | null;
    missing_bars_1h?: number | null;
    corr?: number | null;
    beta?: number | null;
    beta_r2?: number | null;
    half_life_bars?: number | null;
    half_life_seconds?: number | null;
    edge_cost_ratio?: number | null;
    min_edge_cost_ratio?: number | null;
    cost_commission_pips_rt?: number | null;
    cost_slippage_pips_rt?: number | null;
    spread_side?: string | null;
    ou_kappa?: number | null;
    ou_sigma?: number | null;
  };
  last_prices: {
    price_a?: number | null;
    price_b?: number | null;
  };
};

export type S2RunResetResponse = {
  run_id: string | null;
  status: "queued" | "error";
  _meta?: Record<string, unknown>;
  error?: string;
};

export type S2Run = {
  run_id: string;
  start_ts?: string | null;
  end_ts?: string | null;
  status?: string | null;
  source?: string | null;
  note?: string | null;
  updated_at?: string | null;
};

export type S2RunsResponse = {
  runs: S2Run[];
  _meta?: Record<string, unknown>;
};

export type S2ActiveRunResponse = {
  run: S2Run | null;
  _meta?: Record<string, unknown>;
};

export type S2ChartPoint = {
  timestamp: string;
  symbol: string;
  direction: string;
  signal_type: string;
  accepted: boolean;
  reason: string | null;
  z_score: number | null;
  spread: number | null;
  price_a: number | null;
  price_b: number | null;
  flags?: string[];
  bar_age_ms?: number | null;
  missing_minutes_1h?: number | null;
};

export type S2Charts = {
  points: S2ChartPoint[];
  _meta?: {
    available?: boolean;
    path?: string;
    count?: number;
    run_id?: string | null;
    pair_key?: string | null;
  };
};

function emptyS2Summary(runId: string | null): S2Summary {
  return {
    strategy_name: "S2",
    pair_key: null,
    run_id: runId,
    config_hash: null,
    run_started_at: null,
    rotation_reason: null,
    restart_count_seen: null,
    warmup_state: "NO_DATA",
    last_signal_ts: null,
    last_signal: null,
    counts: { total: 0, accepted: 0, rejected: 0, warmup: 0 },
    config: {},
    gates: {},
    last_prices: {},
  };
}

function emptyS2Charts(runId: string | null): S2Charts {
  return {
    points: [],
    _meta: {
      available: false,
      run_id: runId,
      count: 0,
      pair_key: null,
    },
  };
}

export type DbSummary = {
  id: string;
  label: string;
  path: string;
  exists: boolean;
  size_bytes: number;
  tables: string[];
  strategy_id?: string;
  strategy_version?: string;
  trade_date?: string;
  run_id?: string;
  legacy_unpartitioned?: boolean;
};

export type DbTableMeta = {
  name: string;
  columns: string[];
  rows: number;
};

export type DbRows = {
  columns: string[];
  rows: any[][];
  total: number;
};

// =============================================================================
// IB ACCOUNT STATE TYPES
// =============================================================================

export type IBGlobalStatus = "OK" | "WARNING" | "BLOCKING" | "DISCONNECTED";

export type IBConnectionState = {
  ib_gateway_status: "CONNECTED" | "DISCONNECTED" | "ERROR";
  api_latency_ms: number | null;
  account_type: "PAPER" | "LIVE" | "UNKNOWN";
  read_only_api: boolean;
  trading_permissions: {
    FX?: boolean;
    Futures?: boolean;
    Options?: boolean;
  };
  last_heartbeat_ts: string | null;
  heartbeat_age_seconds: number | null;
  managed_accounts: string[];
  status: IBGlobalStatus;
};

export type IBAccountCurrency = {
  currency: string;
  cash: number | null;
  exchange_rate_to_usd: number | null;
  usd_equivalent: number | null;
};

export type IBAccountSummary = {
  net_liquidation: number | null;
  net_liquidation_usd?: number | null;
  cash_balance: number | null;
  available_funds: number | null;
  buying_power: number | null;
  currency: string;
  day_trades_remaining: number | null;
  nlv_change_abs: number | null;
  nlv_change_pct: number | null;
  status: IBGlobalStatus;
  currency_breakdown?: IBAccountCurrency[];
  total_cash_usd?: number | null;
};

export type IBMarginState = {
  initial_margin: number | null;
  maintenance_margin: number | null;
  excess_liquidity: number | null;
  margin_cushion_pct: number | null;
  current_leverage: number | null;
  sma: number | null;
  status: IBGlobalStatus;
};

export type IBPosition = {
  instrument: string;
  side: "LONG" | "SHORT";
  size: number;
  avg_price: number;
  mark_price: number | null;
  unrealized_pnl: number | null;
  realized_pnl: number | null;
  notional_exposure: number | null;
  currency: string;
  conid: number | null;
};

export type IBPositionsState = {
  positions: IBPosition[];
  total_fx_exposure: number;
  net_exposure_by_currency: Record<string, number>;
  total_unrealized_pnl: number;
  total_realized_pnl: number;
  position_count: number;
  unknown_positions: string[];
  status: IBGlobalStatus;
};

export type IBExecution = {
  exec_id?: string | null;
  order_id?: number | null;
  perm_id?: number | null;
  time?: string | null;
  symbol?: string | null;
  currency?: string | null;
  side?: string | null;
  qty?: number | null;
  price?: number | null;
  notional?: number | null;
  commission?: number | null;
  commission_currency?: string | null;
  commission_source?: string | null;
  realized_pnl?: number | null;
  realized_pnl_known?: boolean | null;
  realized_pnl_source?: string | null;
  status?: string | null;
  exchange?: string | null;
};

export type IBAccountState = {
  connection: IBConnectionState;
  account: IBAccountSummary;
  margin: IBMarginState;
  positions: IBPositionsState;
  executions?: IBExecution[];
  executions_history?: IBExecution[];
  global_status: IBGlobalStatus;
  global_status_reasons: string[];
  timestamp: string;
  fetch_duration_ms: number | null;
};

export type IBExecutionsResponse = {
  executions: IBExecution[];
  count: number;
  total_in_file?: number;
  source: string;
  commissions_db?: string;
  fallback_count?: number;
  last_updated: string | null;
  file_age_seconds?: number;
  status: "OK" | "STALE" | "NO_FILE" | "PARSE_ERROR" | "ERROR";
  message?: string;
};

export type Percentiles = {
  p50: number | null;
  p90: number | null;
  p95: number | null;
  min?: number | null;
  max?: number | null;
  avg?: number | null;
};

export type ExecutionMetricBucket = {
  count: number;
  entry: Percentiles;
  exit: Percentiles;
  total: Percentiles;
  latency_ms: Percentiles;
  latency_entry_ms?: Percentiles;
  latency_exit_ms?: Percentiles;
};

export type ExecutionMetricsResponse = {
  run_id: string;
  strategy_id: string;
  trade_count: number;
  sample_count: number;
  overall: ExecutionMetricBucket;
  by_spread_regime: Record<string, ExecutionMetricBucket>;
  by_vol_regime: Record<string, ExecutionMetricBucket>;
  latency_hist_ms?: Array<{
    min_ms: number;
    max_ms: number | null;
    count: number;
  }>;
  latest_trade?: {
    trade_id: string;
    entry_time: string | null;
    exit_time: string | null;
    status: string;
    entry_submit_to_fill_ms: number | null;
    exit_submit_to_fill_ms: number | null;
    entry_slippage_pips: number | null;
    exit_slippage_pips: number | null;
    spread_pips_at_entry: number | null;
    spread_regime: string | null;
    vol_regime: string | null;
  } | null;
  sla?: {
    threshold_ms: number;
    p95_ms: number | null;
    status: "OK" | "WARNING" | "NO_DATA";
  };
  _meta?: {
    include_open?: boolean;
    filtered_trade_valid?: boolean;
    filtered_anomalies?: boolean;
  };
};

export type EquityCurvePoint = {
  timestamp: string;
  equity: number;
  trade_id: string;
  pnl: number;
};

export type EquityCurveResponse = {
  starting_equity: number;
  end_equity: number;
  equity_curve: EquityCurvePoint[];
  trade_count: number;
};

export type IBHealthCheck = {
  connected: boolean;
  status: "OK" | "WARNING" | "DISCONNECTED" | "ERROR";
  latency_ms?: number;
  server_time?: string | null;
  message: string;
};

export type BacktestMode =
  | "shock_only"
  | "signal"
  | "end_to_end"
  | "production_faithful";
export type BacktestExecutionMode = "replay" | "regenerate";
export type BacktestStrategy = "dw" | "s2" | "tf_pullback";

export type BacktestRunRow = {
  run_id: string;
  mode: BacktestMode | string;
  execution_mode: BacktestExecutionMode | string;
  created_at: string | null;
  bars: number | null;
  n_raw_shocks: number | null;
  n_dedup_shocks: number | null;
  n_signals: number | null;
  n_trades: number | null;
  total_pnl_pips: number | null;
  win_rate: number | null;
  parse_errors?: number;
  metrics_source?: "summary" | "csv_recomputed" | "none";
  output_dir: string | null;
  artifact_status?: "ok" | "missing" | "queue_only";
  artifact_source?: "summary_json" | "queue_payload" | "queue_only" | "none";
  _meta?: {
    reason?: string;
  };
};

export type BacktestRunListResponse = {
  runs: BacktestRunRow[];
  _meta?: {
    limit?: number;
    mode?: string | null;
    count?: number;
    output_root?: string;
  };
};

export type BacktestTradeStats = {
  count: number;
  wins: number;
  losses: number;
  win_rate: number | null;
  total_pnl_pips: number;
  avg_pnl_pips: number | null;
  tp_hit_rate: number | null;
  sl_hit_rate: number | null;
  parse_errors?: number;
};

export type BacktestSummary = {
  run_id: string;
  mode: BacktestMode | string;
  execution_mode: BacktestExecutionMode | string;
  bars: number;
  n_raw_shocks: number;
  n_dedup_shocks: number;
  n_signals: number;
  n_trades: number;
  shock_metrics?: Record<string, any> | null;
  outputs?: {
    output_dir?: string;
    summary_json?: string;
    shock_records_csv?: string;
    signals_csv?: string;
    trades_csv?: string;
  };
  trade_stats?: BacktestTradeStats;
  _meta?: {
    run_dir?: string;
    summary_path?: string;
    created_at?: string;
    parity_snapshot_path?: string;
    metrics_source?: "summary" | "csv_recomputed" | "none";
  };
};

export type BacktestJobStatus = {
  job_id: string;
  run_id: string | null;
  status: "queued" | "running" | "success" | "error";
  mode: BacktestMode | string;
  execution_mode: BacktestExecutionMode | string;
  started_at: string;
  ended_at?: string | null;
  exit_code?: number | null;
  error?: string | null;
  output_dir?: string | null;
  queued_position?: number | null;
  summary?: BacktestSummary | null;
  logs: string[];
};

export type AudnzdChampionRow = {
  variant_id: string;
  method: string;
  env: Record<string, string>;
  full_sample: {
    total_trades: number;
    gross_pnl_bps: number;
    profit_factor: number;
    expectancy_bps: number;
    max_drawdown_bps: number;
    win_rate: number;
  };
  walk_forward: {
    folds: number;
    profitable_share: number;
    median_oos_pnl_bps: number;
    aggregate_trades: number;
    aggregate_pf: number;
    retained: boolean;
  };
};

export type AudnzdMultimethodReportResponse = {
  available: boolean;
  latest_report: {
    available: boolean;
    report_path: string;
    report_dir: string;
    generated_at?: string | null;
    profile?: string | null;
    dataset?: Record<string, any> | null;
    variant_count?: number | null;
    recommended_champion?: AudnzdChampionRow | null;
    champion_catalog: Array<Record<string, any>>;
    best_retained: AudnzdChampionRow[];
    error?: string | null;
  } | null;
  reports: Array<Record<string, any>>;
  _meta?: {
    count?: number;
    limit?: number;
    output_root?: string;
  };
};

export type ResearchValidationGate = {
  retained: boolean;
  failures: string[];
};

export type ResearchValidation = {
  strategy_id: string;
  campaign_id: string;
  candidate_id: string;
  stage: string;
  status: string;
  blocking_reasons: string[];
  summary: Record<string, any>;
};

export type PromotionManifest = {
  strategy_id: string;
  candidate_id: string;
  campaign_id: string;
  config_version: string;
  config_hash: string;
  dataset_ref: Record<string, any>;
  engine_version: string;
  validation_summary: Record<string, string>;
  runtime_target: string;
  rollback_target?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
};

export type PaperObservation = {
  status: string;
  signal_cadence_status: string;
  rejection_rate_status: string;
  cost_status: string;
  execution_status: string;
  drift_status: string;
  config_match: boolean;
  blocking_reasons: string[];
  summary: Record<string, any>;
};

export type PromotionDecision = {
  strategy_id: string;
  owner_service: string;
  recommended_candidate_id?: string | null;
  runner_up_candidate_id?: string | null;
  reasons_for_choice: string[];
  rejection_reasons: Record<string, string[]>;
  diff_vs_runtime: Array<Record<string, string>>;
  activation_status: string;
  blocking_reasons: string[];
};

export type ResearchArtifactRef = {
  artifact_id: string;
  strategy_id: string;
  campaign_id: string;
  candidate_id: string;
  kind: string;
  stage: string;
  phase: string;
  fold_id?: string | null;
  scenario_id?: string | null;
  canonical: boolean;
  backtest_logic_source: string;
  research_mode: string;
  status: string;
  title?: string | null;
  generated_at?: string | null;
  locator?: Record<string, any>;
  summary?: Record<string, any>;
};

export type ResearchCandidate = {
  candidate_id: string;
  campaign_id: string;
  strategy_id: string;
  strategy_label: string;
  market: string;
  model_family: string;
  params: Record<string, string>;
  dataset: Record<string, any>;
  train_period: Record<string, any>;
  test_period: Record<string, any>;
  full_sample_metrics: {
    total_trades: number;
    gross_pnl_bps: number;
    profit_factor: number;
    expectancy_bps: number;
    max_drawdown_bps: number;
    win_rate: number;
  };
  walk_forward_metrics: {
    folds: number;
    profitable_share: number;
    median_oos_pnl_bps: number;
    aggregate_trades: number;
    aggregate_pf: number;
    retained: boolean;
    folds_detail?: Array<Record<string, any>>;
  };
  stress_metrics: {
    available: boolean;
    suite_version?: string | null;
    gate?: {
      min_trades: number;
      min_gross_pnl_bps: number;
      min_profit_factor: number;
      max_drawdown_bps: number;
    } | null;
    retained: boolean;
    failures?: string[];
    scenarios?: Array<{
      scenario_id: string;
      label: string;
      cost_multiplier?: number | null;
      degrade_stride?: number | null;
      retained: boolean;
      metrics: {
        total_trades: number;
        gross_pnl_bps: number;
        profit_factor: number;
        expectancy_bps: number;
        max_drawdown_bps: number;
        win_rate: number;
      };
    }>;
  };
  validation: {
    eligibility: ResearchValidationGate;
    full_sample: ResearchValidationGate;
    walk_forward: ResearchValidationGate;
    stress: ResearchValidationGate;
  };
  validations: ResearchValidation[];
  selection_status: string;
  selection_stage: string;
  promotion_status: string;
  rejection_summary: Record<string, number>;
  config_version: string;
  config_hash: string;
  dataset_hash: string;
  engine_version: string;
  robustness_score?: number | null;
  robustness_score_normalized?: number | null;
  validation_statuses: Record<string, string>;
  blocking_reasons: string[];
  runtime_diff: Array<Record<string, string>>;
  paper_observation_summary: Record<string, any>;
  statistical_significance: Record<string, any>;
  economics: Record<string, any>;
  backtest_logic_source: string;
  research_mode: string;
  logic_certainty: string;
  promotion_eligible: boolean;
  promotion_eligibility_reasons: string[];
  runtime_funnel_snapshot: Record<string, any>;
  runtime_funnel_diff: Record<string, any>;
  parity_contract: Record<string, any>;
  artifacts: ResearchArtifactRef[];
  diagnostics: {
    top_rejections: Array<{ reason: string; count: number; share: number }>;
    drift: {
      full_sample_pnl_bps: number;
      median_oos_pnl_bps: number;
      oos_vs_full_sample_ratio?: number | null;
      oos_minus_full_sample_bps: number;
    };
    entry_frequency_per_1k_points?: number | null;
  };
};

export type ResearchCampaign = {
  campaign_id: string;
  strategy_id: string;
  label: string;
  report_path: string;
  generated_at?: string | null;
  profile?: string | null;
  dataset?: Record<string, any> | null;
  variant_count: number;
  retained_count: number;
  recommended_candidate_id?: string | null;
  engine_version?: string | null;
  status?: string | null;
  progress?: Record<string, any>;
  search_space?: Record<string, any>;
  costs_model?: Record<string, any>;
  pipeline_stage_summary?: Record<string, string>;
  blocking_reasons?: string[];
  research_mode?: string | null;
  logic_certainty?: string | null;
  promotion_eligible?: boolean;
};

export type ResearchCampaignDetailResponse = ResearchCampaign & {
  stress_contract?: {
    suite_version?: string;
    gate?: Record<string, number>;
    scenarios?: Array<Record<string, any>>;
  } | null;
  selection_funnel?: {
    eligibility: string[];
    full_sample: string[];
    walk_forward: string[];
    stress: string[];
  };
  _meta?: {
    candidate_count?: number;
  };
};

export type S2ResearchDeskResponse = {
  available: boolean;
  campaigns: ResearchCampaign[];
  candidates: ResearchCandidate[];
  runs?: ResearchRun[];
  cockpit_row?: ResearchCockpitRow;
  stress_contract?: {
    suite_version?: string;
    gate?: Record<string, number>;
    scenarios?: Array<Record<string, any>>;
  } | null;
  selection_funnel: {
    eligibility: string[];
    full_sample: string[];
    walk_forward: string[];
    stress: string[];
  };
  promotion: {
    owner_service: string;
    recommended_candidate_id?: string | null;
    runner_up_candidate_id?: string | null;
    runtime_candidate_id?: string | null;
    runtime_config_version?: string | null;
    runtime_model_family?: string | null;
    runtime_env_path?: string | null;
    runtime_matches_recommended: boolean;
    status: string;
    blocking_reasons?: string[];
    validation_statuses?: Record<string, string>;
    runtime_target?: string | null;
    rollback_target?: string | null;
    manifest?: PromotionManifest | null;
    paper_observation?: PaperObservation | null;
    decision?: PromotionDecision | null;
    diff_vs_recommended: Array<{
      candidate_key: string;
      runtime_key: string;
      expected: string;
      actual: string;
    }>;
  };
  _meta?: {
    count?: number;
    candidate_count?: number;
    limit?: number;
    output_root?: string;
    in_progress_campaigns?: ResearchCampaign[];
  };
};

export type ResearchCampaignListResponse = {
  campaigns: ResearchCampaign[];
  _meta?: {
    count?: number;
    total?: number;
    limit?: number;
  };
};

export type ResearchCandidateListResponse = {
  candidates: ResearchCandidate[];
  _meta?: {
    count?: number;
    total?: number;
    limit?: number;
    campaign_id?: string | null;
    strategy_id?: string | null;
  };
};

export type ResearchWalkForwardResponse = {
  candidate_id: string;
  campaign_id: string;
  strategy_id: string;
  model_family: string;
  walk_forward: ResearchCandidate["walk_forward_metrics"];
  _meta?: {
    selection_status?: string;
    promotion_status?: string;
  };
};

export type ResearchPromotionStatusResponse = S2ResearchDeskResponse["promotion"];
export type ResearchPaperMatchResponse = ResearchPromotionStatusResponse;

export type ParityStrategyResult = {
  strategy: string;
  status: string;
  match_rate: number | null;
  bt_trades: number;
  live_trades: number;
  matched: number;
  avg_pnl_delta_pips: number | null;
  warnings: string[];
};

export type ParityDailyReport = {
  date: string;
  error?: string;
  strategies?: ParityStrategyResult[];
  overall_pass?: boolean;
};

export type ParityHistoryResponse = {
  reports: ParityDailyReport[];
};

export type ResearchRun = {
  run_id: string;
  strategy_id: string;
  label: string;
  stage: string;
  status: string;
  promotable: boolean;
  generated_at?: string | null;
  source?: string | null;
  blocking_reasons: string[];
  summary: Record<string, any>;
  artifacts: ResearchArtifactRef[];
};

export type ResearchRunsResponse = {
  runs: ResearchRun[];
  _meta?: {
    count?: number;
    total?: number;
    limit?: number;
    strategy_id?: string;
  };
};

export type ResearchCockpitRow = {
  strategy_id: string;
  strategy_label: string;
  owner_service: string;
  active_stage: string;
  active_campaign_id?: string | null;
  retained_candidates: number;
  recommended_candidate_id?: string | null;
  runtime_status: string;
  paper_status: string;
  drift_status: string;
  governance_blockers: string[];
  jobs_in_progress: number;
  available: boolean;
};

export type ResearchArtifactOverviewResponse = {
  available: boolean;
  artifact: ResearchArtifactRef;
  overview: Record<string, any>;
  candidate?: ResearchCandidate | null;
  _meta?: {
    strategy_id?: string;
    status?: string;
    artifact_format?: string;
  };
};

export type ResearchArtifactTradesResponse = {
  available: boolean;
  artifact_id: string;
  status: string;
  data: Array<Record<string, unknown>>;
  stats: {
    count: number;
    wins: number;
    losses: number;
    win_rate?: number | null;
    total_pnl?: number | null;
  };
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
  _meta?: {
    strategy_id?: string;
    campaign_id?: string;
    candidate_id?: string;
  };
};

export type ResearchArtifactEquityResponse = {
  available: boolean;
  artifact_id: string;
  status: string;
  data: Array<Record<string, any>>;
  _meta?: {
    strategy_id?: string;
    campaign_id?: string;
    candidate_id?: string;
  };
};

export type ResearchArtifactPriceResponse = {
  available: boolean;
  artifact_id: string;
  status: string;
  price?: Record<string, any> | null;
  _meta?: {
    strategy_id?: string;
    campaign_id?: string;
    candidate_id?: string;
  };
};

export type ResearchArtifactProgressResponse = {
  available: boolean;
  artifact_id: string;
  status: string;
  progress?: Record<string, any> | null;
  _meta?: {
    strategy_id?: string;
    campaign_id?: string;
    candidate_id?: string;
  };
};

export type ResearchCockpitResponse = {
  rows: ResearchCockpitRow[];
  _meta?: {
    count?: number;
    available_count?: number;
  };
};

export type ResearchLaunchCapabilitiesResponse = {
  strategy_id: string;
  owner_service: string;
  launch_intents: Array<{
    intent: string;
    label: string;
    mutative: boolean;
    enabled: boolean;
  }>;
  blocking_reasons: string[];
};

export type BacktestShockEvent = {
  shock_id: string;
  ts: string;
  direction: string;
  amplitude_pips: number;
  z: number;
  regime?: string | null;
  dedup_group_id?: string | null;
  ttl_state?: string | null;
  accepted: number;
  spread_pips?: number | null;
  quote_age_ms?: number | null;
  burst_pips_per_second?: number | null;
  mfe_10s?: number | null;
  mae_10s?: number | null;
  mfe_30s?: number | null;
  mae_30s?: number | null;
  mfe_60s?: number | null;
  mae_60s?: number | null;
  mfe_180s?: number | null;
  mae_180s?: number | null;
  mfe_600s?: number | null;
  mae_600s?: number | null;
  time_to_reflex_s?: number | null;
  prob_revert_1pip_before_continue_1pip?: number | null;
};

export type BacktestShocksResponse = {
  available: boolean;
  run_id: string;
  events: BacktestShockEvent[];
  _meta?: {
    db_path?: string;
    count?: number;
    limit?: number;
    accepted_only?: boolean;
  };
};

export type BacktestTradesResponse = {
  available: boolean;
  run_id: string;
  data: Array<Record<string, any>>;
  stats: BacktestTradeStats;
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
  _meta?: {
    csv_path?: string;
  };
};

// ---------------------------------------------------------------------------
// Detailed Report types (session/regime breakdown, MFE/MAE, alpha leak, etc.)
// ---------------------------------------------------------------------------

export type SessionStats = {
  count: number;
  wins: number;
  losses: number;
  win_rate: number;
  avg_pnl_pips: number;
  avg_win_pips: number;
  avg_loss_pips: number;
  total_pnl_pips: number;
};

export type RegimeStats = {
  regime: string;
  count: number;
  wins: number;
  losses: number;
  win_rate: number;
  avg_pnl_pips: number;
  total_pnl_pips: number;
};

export type MfeMaeAnalysis = {
  avg_mfe_pips: number;
  avg_mae_pips: number;
  avg_exit_efficiency: number;
  pct_gave_back_mfe: number;
  avg_unrealized_at_exit_pips: number;
  pct_managed_exits_losing: number;
  avg_tp_pips_vs_mfe: number;
};

export type CostDecomposition = {
  avg_spread_pips: number;
  avg_commission_pips: number;
  avg_total_cost_pips: number;
  total_cost_drag_pct: number;
  cost_per_win_pips: number;
  cost_per_loss_pips: number;
  breakeven_win_rate: number;
};

export type DrawdownPeriod = {
  period_id: number;
  start_trade_id: string;
  start_ts: string;
  end_trade_id: string;
  end_ts: string;
  depth_pips: number;
  n_trades: number;
  recovery_trades: number;
};

export type AlphaLeak = {
  total_shocks: number;
  accepted_signals: number;
  traded: number;
  accept_rate_pct: number;
  trade_rate_pct: number;
  rejection_breakdown: Record<string, { count: number; pct_of_rejected: number; pct_of_total: number }>;
  exit_reason_breakdown: Record<string, { count: number; pct: number; total_pnl_pips: number; avg_pnl_pips: number }>;
  pnl_from_tp: number;
  pnl_from_sl: number;
  pnl_from_managed_exits: number;
  total_cost_drag_pips: number;
};

export type HourlyBucket = {
  hour_utc: number;
  count: number;
  avg_pnl_pips: number;
  total_pnl_pips: number;
  win_rate: number;
};

export type DowBucket = {
  day: string;
  count: number;
  avg_pnl_pips: number;
  total_pnl_pips: number;
  win_rate: number;
};

export type SlippageAdjustment = {
  applied: boolean;
  entry_mean_pips: number;
  entry_std_pips: number;
  exit_mean_pips: number;
  exit_std_pips: number;
  seed: number;
  adj_net_pnl_pips: number;
  adj_win_rate: number;
  avg_slippage_entry_pips: number;
  avg_slippage_exit_pips: number;
  n_trades: number;
};

export type DetailedReport = {
  strategy: string;
  phase: string;
  period_start: string;
  period_end: string;
  n_trades: number;
  session_breakdown: Record<string, SessionStats>;
  regime_breakdown: Record<string, RegimeStats>;
  mfe_mae_analysis: MfeMaeAnalysis;
  cost_decomposition: CostDecomposition;
  drawdown_periods: DrawdownPeriod[];
  alpha_leak: AlphaLeak;
  rejection_funnel_pct: Record<string, { count: number; pct_of_rejected: number; pct_of_total_shocks: number }>;
  exit_reason_dist: Record<string, { count: number; pct: number; total_pnl_pips: number; avg_pnl_pips: number; wins: number; losses: number }>;
  hourly_heatmap: HourlyBucket[];
  day_of_week_stats: DowBucket[];
  slippage_adjustment: SlippageAdjustment;
};

export type DetailedReportResponse = {
  available: boolean;
  run_id: string;
  report: DetailedReport | null;
  _meta?: { path?: string };
};

export type PipelineEvent = {
  type: string;
  ts: string;
  data: Record<string, any>;
  wall_time: number;
};

export type PipelineFunnel = {
  bars_scanned: number;
  shocks_detected: number;
  signals_generated: number;
  signals_accepted: number;
  trades_opened: number;
  trades_closed: number;
};

export type PipelineState = {
  layer: string;
  last_shock: { ts: string; z_score?: number; amplitude_pips?: number } | null;
  last_signal: { ts: string; accepted: boolean; direction?: string } | null;
  last_trade: { ts: string; pnl_pips: number; exit_reason?: string } | null;
  events: PipelineEvent[];
  funnel: PipelineFunnel;
  cumulative_pnl_pips: number;
};

export type BacktestProgress = {
  bars_processed: number;
  bars_total: number;
  pct: number;
  shocks_detected: number;
  signals_generated: number;
  signals_accepted: number;
  trades_simulated: number;
  current_pnl_pips: number;
  elapsed_seconds: number;
  eta_seconds: number;
  bars_per_second: number;
  last_bar_ts: string;
  phase: string;
  strategy?: string;
  pipeline?: PipelineState;
};

export type BacktestProgressResponse = {
  available: boolean;
  run_id: string;
  progress: BacktestProgress | null;
};

export type BacktestRunPayload = {
  mode: BacktestMode;
  strategy?: BacktestStrategy;
  strict_prod_interval?: boolean;
  parity_source?: "a1_runtime" | string;
  csv?: string;
  env_overrides?: Record<string, string>;
  strategy_overrides?: Record<string, string | number | boolean>;
  execution_mode?: BacktestExecutionMode;
  run_id?: string;
  marketdata_db?: string;
  ohlc_db?: string;
  shocks_db?: string;
  signals_db?: string;
  start_ts_ns?: number;
  end_ts_ns?: number;
  date?: string;
  window?: number;
  shock_threshold?: number;
  vol_window?: number;
  spread_multiplier?: number;
  min_amplitude_pips?: number;
  max_spread_pips?: number;
  signal_mode?: "contrarian" | "momentum";
  retrace_threshold?: number;
  anchor_tolerance_pips?: number;
  max_reflex_bars?: number;
  tp_multiplier?: number;
  sl_multiplier?: number;
  min_tp_pips?: number;
  min_sl_pips?: number;
  max_hold_bars?: number;
  dedup_ttl_seconds?: number;
  horizons?: number[] | string;
  detector_version?: string;
  skip_shock_sqlite?: boolean;
  allow_parallel?: boolean;
  // Price Lake params
  price_lake_root?: string;
  symbol?: string;
  bar_interval_s?: number;
  start_ts?: string;
  end_ts?: string;
  min_price_coverage_timeline?: number;
  allow_legacy_price_fallback?: boolean;
};

// =============================================================================
// Campaign types (IS/OOS orchestration)
// =============================================================================

export type CampaignJob = {
  strategy: BacktestStrategy;
  phase: "is" | "oos";
  run_id: string | null;
  job_id: string;
  status: "queued" | "running" | "success" | "error";
  n_trades?: number | null;
  total_pnl_pips?: number | null;
  win_rate?: number | null;
  exit_code?: number | null;
  ended_at?: string | null;
};

export type CampaignWindows = {
  is_start_ts: string;
  is_end_ts: string;
  oos_start_ts: string;
  oos_end_ts: string;
};

export type CampaignSummary = {
  campaign_id: string;
  created_at: string;
  windows: CampaignWindows;
  settings: {
    symbol: string;
    bar_interval_s: number;
    strategies: BacktestStrategy[];
    is_days: number;
    oos_days: number;
  };
  jobs: CampaignJob[];
};

export type CampaignListItem = {
  campaign_id: string;
  created_at: string;
  strategies: BacktestStrategy[] | null;
  n_jobs: number;
};

export type CampaignCreatePayload = {
  strategies: BacktestStrategy[];
  is_days?: number;
  oos_days?: number;
  oos_end_ts?: string;
  symbol?: string;
  bar_interval_s?: number;
  price_lake_root?: string;
  s2_csv?: string;
  s2_env_overrides?: Record<string, string>;
  strategy_overrides?: Record<string, Record<string, string | number | boolean>>;
};

export type CampaignListResponse = {
  campaigns: CampaignListItem[];
  _meta?: { count?: number; limit?: number };
};

// =============================================================================
// Price Lake types
// =============================================================================

export type PriceLakeHealthResponse = {
  available: boolean;
  root: string;
  symbols: string[];
  intervals: number[];
  date_range: { min: string; max: string } | null;
  total_bars: number;
  total_files: number;
  last_ingested_at: string | null;
};

export type PriceLakeCoverageResponse = {
  symbol: string;
  bar_interval_s: number;
  start_ts: string;
  end_ts: string;
  timeline_coverage: number;
  total_expected: number;
  total_present: number;
  missing_count: number;
};

export type MarketTrajectoryPoint = {
  ts_ns: number;
  ts: string;
  bid: number;
  ask: number;
  mid: number;
  price: number;
  source: "quotes_hi" | "quotes_1hz" | string;
};

export type SignalMarketTrajectoryResponse = {
  available: boolean;
  signal_id: string;
  run_id: string;
  strategy_id: string;
  source: "quotes_hi" | "quotes_1hz" | "none" | string;
  points: MarketTrajectoryPoint[];
  _meta?: Record<string, any>;
};

export type TradeMarketTrajectoryResponse = {
  available: boolean;
  trade_id: string;
  run_id: string;
  strategy_id: string;
  source: "quotes_1hz" | "none" | string;
  points: MarketTrajectoryPoint[];
  _meta?: Record<string, any>;
};

const API_BASE = (() => {
  const envBase = import.meta.env.VITE_API_URL;
  if (envBase) {
    return envBase.replace(/\/$/, "");
  }
  return "";
})();

const S2_API_BASE = (() => {
  const envBase = import.meta.env.VITE_S2_API_URL;
  if (envBase) {
    return envBase.replace(/\/$/, "");
  }
  return API_BASE;
})();

// Shadow endpoints are disabled by default (shadow trading gelé); set to false only if re-enabled.
let shadowEndpointsDisabled = true;

// API timeout in milliseconds (15 seconds)
const API_TIMEOUT_MS = 15_000;

// =============================================================================
// PERFORMANCE FIX (08 Jan 2026): Request deduplication layer
// =============================================================================

interface InflightRequest<T> {
  promise: Promise<T>;
  timestamp: number;
}

interface SnapshotCacheEntry<T> {
  value: T;
  fetchedAt: number;
  staleAt: number;
  expiresAt: number;
}

export type ApiPerfSample = {
  method: string;
  path: string;
  durationMs: number;
  ok: boolean;
  timestamp: number;
  screen: "terminal" | "quant" | "backtest" | "global";
  source: "network" | "dedup" | "snapshot_fresh" | "snapshot_stale";
};

const API_PERF_MAX_SAMPLES = 500;
const apiPerfSamples: ApiPerfSample[] = [];
let apiPerfScreen: ApiPerfSample["screen"] = "global";
const API_OVERLOAD_BACKOFF_BASE_MS = 3_000;
const API_OVERLOAD_BACKOFF_MAX_MS = 15_000;
let apiOverloadBackoffMs = 0;
let apiOverloadCooldownUntilMs = 0;

function recordApiPerf(sample: ApiPerfSample): void {
  apiPerfSamples.push(sample);
  if (apiPerfSamples.length > API_PERF_MAX_SAMPLES) {
    apiPerfSamples.splice(0, apiPerfSamples.length - API_PERF_MAX_SAMPLES);
  }
}

export function getApiPerfSamples(): ApiPerfSample[] {
  return [...apiPerfSamples];
}

export function resetApiPerfState(): void {
  apiPerfSamples.splice(0, apiPerfSamples.length);
  inflightRequests.clear();
  snapshotCache.clear();
  snapshotRevalidators.clear();
  shadowEndpointsDisabled = true;
  apiPerfScreen = "global";
  apiOverloadBackoffMs = 0;
  apiOverloadCooldownUntilMs = 0;
}

export function setApiPerfScreen(
  screen: ApiPerfSample["screen"] | undefined
): void {
  apiPerfScreen = screen ?? "global";
}

export function getApiPerfSummary() {
  const byPath = new Map<
    string,
    {
      count: number;
      durations: number[];
      okCount: number;
      screens: Record<string, number>;
      sources: Record<string, number>;
    }
  >();
  for (const sample of apiPerfSamples) {
    const current = byPath.get(sample.path) ?? {
      count: 0,
      durations: [],
      okCount: 0,
      screens: {},
      sources: {},
    };
    current.count += 1;
    current.durations.push(sample.durationMs);
    if (sample.ok) current.okCount += 1;
    current.screens[sample.screen] = (current.screens[sample.screen] ?? 0) + 1;
    current.sources[sample.source] = (current.sources[sample.source] ?? 0) + 1;
    byPath.set(sample.path, current);
  }
  const entries = [...byPath.entries()].map(([path, data]) => {
    const sorted = [...data.durations].sort((a, b) => a - b);
    const p95Idx = Math.max(0, Math.floor((sorted.length - 1) * 0.95));
    return {
      path,
      count: data.count,
      p95Ms: sorted[p95Idx] ?? 0,
      avgMs: sorted.length
        ? sorted.reduce((acc, value) => acc + value, 0) / sorted.length
        : 0,
      okRate: data.count ? data.okCount / data.count : 0,
      screens: data.screens,
      sources: data.sources,
    };
  });
  entries.sort((a, b) => b.count - a.count);
  return entries;
}

export function getApiPerfCounters(): {
  total: number;
  network: number;
  dedup: number;
  snapshotFresh: number;
  snapshotStale: number;
  cacheHits: number;
} {
  let network = 0;
  let dedup = 0;
  let snapshotFresh = 0;
  let snapshotStale = 0;
  for (const sample of apiPerfSamples) {
    if (sample.source === "network") network += 1;
    if (sample.source === "dedup") dedup += 1;
    if (sample.source === "snapshot_fresh") snapshotFresh += 1;
    if (sample.source === "snapshot_stale") snapshotStale += 1;
  }
  return {
    total: apiPerfSamples.length,
    network,
    dedup,
    snapshotFresh,
    snapshotStale,
    cacheHits: dedup + snapshotFresh + snapshotStale,
  };
}

const inflightRequests = new Map<string, InflightRequest<unknown>>();
const REQUEST_DEDUP_TTL_MS = 2000; // 2 second deduplication window
const snapshotCache = new Map<string, SnapshotCacheEntry<unknown>>();
const snapshotRevalidators = new Map<string, Promise<unknown>>();

function getInflightKey(path: string, init?: RequestInit): string {
  // Use path + method as key (body is not included for simplicity)
  return `${init?.method || 'GET'}:${path}`;
}

function cleanupInflight(): void {
  const now = Date.now();
  for (const [key, req] of inflightRequests.entries()) {
    if (now - req.timestamp > REQUEST_DEDUP_TTL_MS * 2) {
      inflightRequests.delete(key);
    }
  }
}

function readSnapshotCache<T>(
  key: string,
  now: number
): { value: T; status: "fresh" | "stale" } | null {
  const cached = snapshotCache.get(key) as SnapshotCacheEntry<T> | undefined;
  if (!cached) return null;
  if (cached.expiresAt <= now) {
    snapshotCache.delete(key);
    snapshotRevalidators.delete(key);
    return null;
  }
  return {
    value: cached.value,
    status: cached.staleAt > now ? "fresh" : "stale",
  };
}

function writeSnapshotCache<T>(
  key: string,
  value: T,
  freshTtlMs: number,
  staleTtlMs: number
): T {
  const now = Date.now();
  snapshotCache.set(key, {
    value,
    fetchedAt: now,
    staleAt: now + freshTtlMs,
    expiresAt: now + staleTtlMs,
  });
  return value;
}

async function revalidateSnapshotCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  freshTtlMs: number,
  staleTtlMs: number
): Promise<void> {
  if (snapshotRevalidators.has(key)) {
    await snapshotRevalidators.get(key);
    return;
  }
  const request = fetcher()
    .then((value) => {
      writeSnapshotCache(key, value, freshTtlMs, staleTtlMs);
    })
    .finally(() => {
      snapshotRevalidators.delete(key);
    });
  snapshotRevalidators.set(key, request);
  await request;
}

async function fetchSnapshotSWR<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  freshTtlMs: number,
  staleTtlMs: number,
  signal?: AbortSignal
): Promise<T> {
  const path = cacheKey.startsWith(API_BASE) ? cacheKey.slice(API_BASE.length) : cacheKey;
  const cached = readSnapshotCache<T>(cacheKey, Date.now());
  if (cached?.status === "fresh") {
    recordApiPerf({
      method: "GET",
      path,
      durationMs: 0,
      ok: true,
      timestamp: Date.now(),
      screen: apiPerfScreen,
      source: "snapshot_fresh",
    });
    return cached.value;
  }
  if (cached?.status === "stale") {
    if (signal) {
      const value = await fetcher();
      return writeSnapshotCache(cacheKey, value, freshTtlMs, staleTtlMs);
    }
    recordApiPerf({
      method: "GET",
      path,
      durationMs: 0,
      ok: true,
      timestamp: Date.now(),
      screen: apiPerfScreen,
      source: "snapshot_stale",
    });
    void revalidateSnapshotCache(cacheKey, fetcher, freshTtlMs, staleTtlMs);
    return cached.value;
  }
  const value = await fetcher();
  return writeSnapshotCache(cacheKey, value, freshTtlMs, staleTtlMs);
}

// =============================================================================

/**
 * Fetch with timeout - prevents hanging requests
 */
function mergeAbortSignals(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number
): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const abortFromExternal = () => {
    controller.abort();
  };
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", abortFromExternal, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    },
  };
}

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs: number = API_TIMEOUT_MS
): Promise<Response> {
  const merged = mergeAbortSignals(init?.signal, timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: merged.signal,
    });
    return response;
  } finally {
    merged.cleanup();
  }
}

function isAbortLikeError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "AbortError" ||
      err.message.includes("abort") ||
      err.message.includes("signal"))
  );
}

function getApiOverloadError(): Error {
  return new Error("HTTP 503");
}

function noteApiOverload(): void {
  apiOverloadBackoffMs = Math.min(
    apiOverloadBackoffMs > 0
      ? apiOverloadBackoffMs * 2
      : API_OVERLOAD_BACKOFF_BASE_MS,
    API_OVERLOAD_BACKOFF_MAX_MS
  );
  apiOverloadCooldownUntilMs = Date.now() + apiOverloadBackoffMs;
}

function clearApiOverload(): void {
  apiOverloadBackoffMs = 0;
  apiOverloadCooldownUntilMs = 0;
}

function shouldShortCircuitApiOverload(init?: RequestInit): boolean {
  if (init?.signal) {
    return false;
  }
  return Date.now() < apiOverloadCooldownUntilMs;
}

async function fetchJsonDeduped<T>(
  fullPath: string,
  pathForPerf: string,
  init?: RequestInit,
  timeoutMs: number = API_TIMEOUT_MS
): Promise<T> {
  const method = init?.method || "GET";
  if (shouldShortCircuitApiOverload(init)) {
    throw getApiOverloadError();
  }
  const dedupKey = getInflightKey(fullPath, init);
  const inflight = inflightRequests.get(dedupKey);

  if (inflight && Date.now() - inflight.timestamp < REQUEST_DEDUP_TTL_MS) {
    recordApiPerf({
      method,
      path: pathForPerf,
      durationMs: 0,
      ok: true,
      timestamp: Date.now(),
      screen: apiPerfScreen,
      source: "dedup",
    });
    return inflight.promise as Promise<T>;
  }

  if (inflightRequests.size > 50) {
    cleanupInflight();
  }

  const requestPromise = (async () => {
    const startedAt = performance.now();
    const res = await fetchWithTimeout(fullPath, init, timeoutMs);
    const durationMs = performance.now() - startedAt;
    recordApiPerf({
      method,
      path: pathForPerf,
      durationMs,
      ok: res.ok,
      timestamp: Date.now(),
      screen: apiPerfScreen,
      source: "network",
    });
    if (!res.ok) {
      if (res.status === 503) {
        noteApiOverload();
      }
      throw new Error(`HTTP ${res.status}`);
    }
    clearApiOverload();
    return (await res.json()) as T;
  })();

  inflightRequests.set(dedupKey, { promise: requestPromise, timestamp: Date.now() });

  try {
    return await requestPromise;
  } finally {
    setTimeout(() => inflightRequests.delete(dedupKey), REQUEST_DEDUP_TTL_MS);
  }
}

/**
 * Core JSON fetch with proper error handling and request deduplication
 * - Throws on error for POST requests (mutations need error feedback)
 * - Returns null-safe result for GET requests via fetchJsonSafe
 * - Deduplicates concurrent requests to same endpoint
 */
async function fetchJson<T>(
  path: string,
  init?: RequestInit,
  ctx: ActiveContext = activeContext,
  scope: DataScope = defaultScope,
  timeoutMs: number = API_TIMEOUT_MS
): Promise<T> {
  const fullPath = `${API_BASE}${withContext(path, ctx, scope)}`;
  const method = init?.method || 'GET';

  if (shadowEndpointsDisabled && path.includes("/shadow/")) {
    // Short-circuit if backend says shadow is disabled
    return [] as T;
  }

  // Request deduplication for GET requests only
  if (method === 'GET' && !init?.signal) {
    try {
      const result = await fetchJsonDeduped<T>(fullPath, path, init, timeoutMs);
      return result;
    } catch (err) {
      if (err instanceof Error && err.message === "HTTP 410" && path.includes("/shadow/")) {
        shadowEndpointsDisabled = true;
        return [] as T;
      }
      throw err;
    } finally {
    }
  }

  // Non-GET requests: no deduplication
  const startedAt = performance.now();
  const res = await fetchWithTimeout(fullPath, init, timeoutMs);
  const durationMs = performance.now() - startedAt;
  recordApiPerf({
    method,
    path,
    durationMs,
    ok: res.ok,
    timestamp: Date.now(),
    screen: apiPerfScreen,
    source: "network",
  });
  if (!res.ok) {
    if (res.status === 503) {
      noteApiOverload();
    }
    if (res.status === 410) {
      // Shadow endpoints disabled => return empty payload and stop further shadow calls
      if (path.includes("/shadow/")) {
        shadowEndpointsDisabled = true;
      }
      return [] as T;
    }
    throw new Error(`HTTP ${res.status}`);
  }
  clearApiOverload();
  return (await res.json()) as T;
}

/**
 * Safe JSON fetch that returns a default value on any error
 * Use this for GET requests where a failure should not crash the UI
 */
async function fetchJsonSafe<T>(
  path: string,
  defaultValue: T,
  init?: RequestInit,
  ctx: ActiveContext = activeContext,
  scope: DataScope = defaultScope,
  timeoutMs: number = API_TIMEOUT_MS,
  options?: { throwOnAbort?: boolean }
): Promise<T> {
  try {
    return await fetchJson<T>(path, init, ctx, scope, timeoutMs);
  } catch (err) {
    if (options?.throwOnAbort && isAbortLikeError(err)) {
      throw err;
    }
    if (!isAbortLikeError(err)) {
      console.warn(`[API] ${path} failed:`, err instanceof Error ? err.message : err);
    }
    return defaultValue;
  }
}

async function fetchJsonSafeNoDedup<T>(
  path: string,
  defaultValue: T,
  init?: RequestInit,
  ctx: ActiveContext = activeContext,
  scope: DataScope = defaultScope,
  timeoutMs: number = API_TIMEOUT_MS,
  options?: { throwOnAbort?: boolean }
): Promise<T> {
  const fullPath = `${API_BASE}${withContext(path, ctx, scope)}`;
  const method = init?.method || "GET";
  const startedAt = performance.now();
  try {
    const res = await fetchWithTimeout(fullPath, init, timeoutMs);
    const durationMs = performance.now() - startedAt;
    recordApiPerf({
      method,
      path,
      durationMs,
      ok: res.ok,
      timestamp: Date.now(),
      screen: apiPerfScreen,
      source: "network",
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (options?.throwOnAbort && isAbortLikeError(err)) {
      throw err;
    }
    if (!isAbortLikeError(err)) {
      console.warn(`[API] ${path} failed:`, err instanceof Error ? err.message : err);
    }
    return defaultValue;
  }
}

async function fetchJsonWithBase<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
  timeoutMs: number = API_TIMEOUT_MS
): Promise<T> {
  const fullPath = `${baseUrl}${path}`;
  const method = init?.method || "GET";
  if (method === "GET") {
    return fetchJsonDeduped<T>(fullPath, path, init, timeoutMs);
  }
  const res = await fetchWithTimeout(fullPath, init, timeoutMs);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

async function fetchJsonSafeWithBase<T>(
  baseUrl: string,
  path: string,
  defaultValue: T,
  init?: RequestInit,
  timeoutMs: number = API_TIMEOUT_MS
): Promise<T> {
  try {
    return await fetchJsonWithBase<T>(baseUrl, path, init, timeoutMs);
  } catch (err) {
    if (!isAbortLikeError(err)) {
      console.warn("[API] base fetch failed:", err instanceof Error ? err.message : err);
    }
    return defaultValue;
  }
}

async function postJson<T>(
  path: string,
  body: Record<string, any>,
  apiKey?: string,
  ctx: ActiveContext = activeContext,
  scope: DataScope = defaultScope
): Promise<T> {
  const payload = await fetchJson<T>(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { "X-API-Key": apiKey } : {}),
    },
    body: JSON.stringify(body),
  }, ctx, scope);
  if (
    payload &&
    typeof payload === "object" &&
    "success" in payload &&
    (payload as { success?: boolean }).success === false
  ) {
    throw new Error(
      String((payload as { message?: string }).message || "Mutation failed")
    );
  }
  return payload;
}

export const api = {
  getHealth: (ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) =>
    fetchJsonSafe<Health>("/api/health", { bot_db: false, analytics_db: false, shadow_db: false, status: "ERROR" }, undefined, ctx, scope),
  getOhlc: async (limit = 300, ctx: ActiveContext = activeContext, scope: DataScope = defaultScope): Promise<OhlcPayload> => {
    try {
      const result = await fetchJson<Ohlc[] | OhlcPayload>(`/api/ohlc?limit=${limit}`, undefined, ctx, scope);
      if (Array.isArray(result)) {
        return {
          state: result.length ? "LIVE" : "EMPTY",
          ohlc: result,
        };
      }
      return {
        state: result.state ?? (result.ohlc?.length ? "LIVE" : "EMPTY"),
        ohlc: result.ohlc ?? [],
        meta: result.meta,
      };
    } catch (err) {
      // Suppress abort errors (normal cleanup on unmount)
      const isAbortError = err instanceof Error && (err.name === 'AbortError' || err.message.includes('abort'));
      if (!isAbortError) {
        console.warn("[API] /api/ohlc failed:", err instanceof Error ? err.message : err);
      }
      return { state: "ERROR", ohlc: [], meta: { reason: "API request failed" } };
    }
  },
  getOhlcForRun: async (
    limit = 300,
    runId?: string | null,
    ctx: ActiveContext = activeContext,
    scope: DataScope = defaultScope,
    opts?: {
      fromTs?: string;
      toTs?: string;
      order?: "asc" | "desc";
      signal?: AbortSignal;
    }
  ): Promise<OhlcPayload> => {
    const qs = new URLSearchParams();
    qs.set("limit", String(limit));
    if (runId) qs.set("run_id", runId);
    if (opts?.fromTs) qs.set("from_ts", opts.fromTs);
    if (opts?.toTs) qs.set("to_ts", opts.toTs);
    if (opts?.order) qs.set("order", opts.order);
    try {
      const result = await fetchJson<Ohlc[] | OhlcPayload>(
        `/api/ohlc?${qs}`,
        opts?.signal ? { signal: opts.signal } : undefined,
        ctx,
        scope
      );
      if (Array.isArray(result)) {
        return {
          state: result.length ? "LIVE" : "EMPTY",
          ohlc: result,
        };
      }
      return {
        state: result.state ?? (result.ohlc?.length ? "LIVE" : "EMPTY"),
        ohlc: result.ohlc ?? [],
        meta: result.meta,
      };
    } catch (err) {
      const isAbortError = err instanceof Error && (err.name === 'AbortError' || err.message.includes('abort'));
      if (isAbortError) {
        throw err;
      }
      if (!isAbortError) {
        console.warn("[API] /api/ohlc failed:", err instanceof Error ? err.message : err);
      }
      return { state: "ERROR", ohlc: [], meta: { reason: "API request failed" } };
    }
  },
  getPortfolioEquityCurve: (
    strategyId?: string | null,
    commissionView: string = "economic",
    portfolioEpoch?: number | null
  ) => {
    const params = new URLSearchParams({
      commission_view: commissionView,
      starting_equity: "5000",
      scope: "EPOCH",
    });
    if (strategyId) {
      params.set("strategy_id", strategyId);
    }
    if (portfolioEpoch != null) {
      params.set("portfolio_epoch", String(portfolioEpoch));
    }
    return fetchJsonSafeWithBase<EquityCurveResponse>(
      API_BASE,
      `/api/portfolio/equity_curve?${params.toString()}`,
      { starting_equity: 5000, end_equity: 5000, equity_curve: [], trade_count: 0 },
    );
  },
  getShadowTrades: async (limit = 200, ctx: ActiveContext = activeContext, scope: DataScope = defaultScope): Promise<ShadowTrade[]> => {
    if (shadowEndpointsDisabled) return [];
    try {
      // Backend now returns { _meta, trades } - extract trades array for backward compat
      const result = await fetchJson<{ _meta?: any; trades?: ShadowTrade[] } | ShadowTrade[]>(
        `/api/shadow/trades?limit=${limit}`,
        undefined,
        ctx,
        scope
      );
      // Handle both old (array) and new ({ trades: [] }) formats
      if (Array.isArray(result)) return result;
      return result?.trades || [];
    } catch (err) {
      // Suppress abort errors (normal cleanup on unmount)
      const isAbortError = err instanceof Error && (err.name === 'AbortError' || err.message.includes('abort'));
      if (!isAbortError) {
        console.warn("[API] /api/shadow/trades failed:", err instanceof Error ? err.message : err);
      }
      return [];
    }
  },
  getShadowTradesWithMeta: (limit = 200, ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) =>
    shadowEndpointsDisabled
      ? Promise.resolve({ _meta: { run_id: null, data_origin: "shadow_disabled", db_path: "", count: 0 }, trades: [] })
      : fetchJson<{ _meta?: { run_id: string | null; data_origin: string; db_path: string; count: number }; trades: ShadowTrade[] }>(
        `/api/shadow/trades?limit=${limit}`,
        undefined,
        ctx,
        scope
      ),
  getShadowSnapshots: (limit = 50, ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) =>
    shadowEndpointsDisabled
      ? Promise.resolve([])
      : fetchJsonSafe<ShadowSnapshot[]>(`/api/shadow/snapshots?limit=${limit}`, [], undefined, ctx, scope),
  getSignals: async (limit = 200, ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) => {
    try {
      const result = await fetchJson<{ _meta?: any; signals?: Signal[] } | Signal[]>(
        `/api/signals?limit=${limit}`,
        undefined,
        ctx,
        scope
      );
      const signals = Array.isArray(result) ? result : result.signals || [];
      // Normalize canonical fields to legacy naming for UI compatibility
      return signals.map((s) => ({
        ...s,
        spread_pips: s.spread_pips ?? s.spread ?? null,
        volatility_regime: s.volatility_regime ?? (s as any).regime ?? null,
        delta_pips: s.delta_pips ?? null,
        reversion_ratio: s.reversion_ratio ?? null,
        mfe_pips: s.mfe_pips ?? null,
        mae_pips: s.mae_pips ?? null,
        final_pnl_pips: s.final_pnl_pips ?? null,
      }));
    } catch (err) {
      // Suppress abort errors (normal cleanup on unmount)
      const isAbortError = err instanceof Error && (err.name === 'AbortError' || err.message.includes('abort'));
      if (!isAbortError) {
        console.warn("[API] /api/signals failed:", err instanceof Error ? err.message : err);
      }
      return [];
    }
  },
  getS2Signals: async (limit = 300, ctx: ActiveContext = activeContext) => {
    if (!ctx.run_id) return [];
    const qs = new URLSearchParams();
    qs.set("limit", String(limit));
    if (ctx.run_id) qs.set("run_id", ctx.run_id);
    const result = await fetchJsonSafeWithBase<{ _meta?: any; signals?: Signal[] } | Signal[]>(
      S2_API_BASE,
      `/api/s2/signals?${qs.toString()}`,
      []
    );
    const signals = Array.isArray(result) ? result : result.signals || [];
    return signals.map((s) => ({
      ...s,
      spread_pips: s.spread_pips ?? s.spread ?? null,
    }));
  },
  getS2Runs: async (limit = 50) => {
    const qs = new URLSearchParams();
    qs.set("limit", String(limit));
    return fetchJsonSafeWithBase<S2RunsResponse>(
      S2_API_BASE,
      `/api/s2/runs?${qs.toString()}`,
      { runs: [] }
    );
  },
  getS2ActiveRun: async () => {
    return fetchJsonSafeWithBase<S2ActiveRunResponse>(
      S2_API_BASE,
      `/api/s2/run/active`,
      { run: null }
    );
  },
  resetS2Run: async (reason?: string) => {
    const qs = reason ? `?reason=${encodeURIComponent(reason)}` : "";
    return fetchJsonSafeWithBase<S2RunResetResponse>(
      S2_API_BASE,
      `/api/s2/run/reset${qs}`,
      {
        run_id: null,
        status: "error",
        error: "reset_failed",
      },
      { method: "POST" }
    );
  },
  getUiStatus: (ctx: ActiveContext = activeContext) => {
    const qs = new URLSearchParams();
    if (ctx.run_id) qs.set("run_id", ctx.run_id);
    return fetchJson<UiStatus>(`/api/ui/status?${qs.toString()}`);
  },
  getDeskRunContext: ({
    selectedRunId = null,
    activeRunId = null,
    bundleEnabled = true,
    dwRunId = null,
    s2RunId = null,
    tfRunId = null,
  }: {
    selectedRunId?: string | null;
    activeRunId?: string | null;
    bundleEnabled?: boolean;
    dwRunId?: string | null;
    s2RunId?: string | null;
    tfRunId?: string | null;
  }) => {
    const qs = new URLSearchParams();
    if (selectedRunId) qs.set("selected_run_id", selectedRunId);
    if (activeRunId) qs.set("active_run_id", activeRunId);
    qs.set("bundle_enabled", bundleEnabled ? "true" : "false");
    if (dwRunId) qs.set("dw_run_id", dwRunId);
    if (s2RunId) qs.set("s2_run_id", s2RunId);
    if (tfRunId) qs.set("tf_run_id", tfRunId);
    return fetchJsonSafe<DeskRunContextResponse>(
      `/api/ui/desk_run_context?${qs.toString()}`,
      {
        bundle_enabled: bundleEnabled,
        seed_run_id: selectedRunId ?? activeRunId ?? dwRunId ?? s2RunId ?? tfRunId ?? null,
        has_any_run: Boolean(selectedRunId ?? activeRunId ?? dwRunId ?? s2RunId ?? tfRunId),
        selected_run_id: selectedRunId,
        active_run_id: activeRunId,
        selected_run: null,
        active_run: null,
        runtime_runs: {},
        strategy_runs: {
          damping_wave: dwRunId ?? selectedRunId ?? activeRunId ?? null,
          s2_pairs_trading: s2RunId ?? null,
          tf_pullback_v1: tfRunId ?? null,
        },
        strategy_sources: {},
        bundle_inputs: {
          damping_wave: dwRunId ?? null,
          s2_pairs_trading: s2RunId ?? null,
          tf_pullback_v1: tfRunId ?? null,
        },
        _meta: {
          errors: [],
          cache_hit: false,
        },
      }
    );
  },
  getOverviewLane: (
    lane: OverviewLane,
    runId: string | null = null,
    ctx: ActiveContext = activeContext,
    options?: {
      commissionView?: "reported" | "economic";
      portfolioEpoch?: number | null;
      signal?: AbortSignal;
    }
  ) => {
    const qs = new URLSearchParams();
    qs.set("lane", lane);
    if (runId) {
      qs.set("run_id", runId);
    } else if (ctx.run_id) {
      qs.set("run_id", ctx.run_id);
    }
    if (options?.commissionView) qs.set("commission_view", options.commissionView);
    if (options?.portfolioEpoch !== undefined && options?.portfolioEpoch !== null) {
      qs.set("portfolio_epoch", String(options.portfolioEpoch));
    }
    const path = `/api/ui/overview_lane?${qs.toString()}`;
    return fetchJsonSafe<OverviewLaneResponse>(
      path,
      lane === "runtime"
        ? {
            lane: "runtime",
            system: null,
            ui_status: null,
            strategies_status: null,
            strategy_runs: {},
            _meta: { lane, cache_hit: false },
          }
        : lane === "portfolio"
          ? {
              lane: "portfolio",
              portfolio: null,
              strategy_runs: {},
              _meta: { lane, cache_hit: false },
            }
          : {
              lane: "summaries",
              strategy_summaries: {},
              strategy_summary_meta: {},
              strategy_runs: {},
              _meta: { lane, cache_hit: false },
            },
      options?.signal ? { signal: options.signal } : undefined,
      ctx,
      defaultScope,
      lane === "runtime" ? 8_000 : lane === "portfolio" ? 20_000 : 25_000,
      { throwOnAbort: true }
    );
  },
  getDashboardSnapshot: (
    runId: string | null = null,
    profile: DashboardSnapshotProfile = "terminal",
    ctx: ActiveContext = activeContext,
    options?: {
      commissionView?: "reported" | "economic";
      portfolioEpoch?: number | null;
      detailLevel?: DashboardSnapshotDetailLevel;
      signal?: AbortSignal;
    }
  ) => {
    const qs = new URLSearchParams();
    if (runId) {
      qs.set("run_id", runId);
    } else if (ctx.run_id) {
      qs.set("run_id", ctx.run_id);
    }
    qs.set("profile", profile);
    if (options?.commissionView) qs.set("commission_view", options.commissionView);
    if (options?.portfolioEpoch !== undefined && options.portfolioEpoch !== null) {
      qs.set("portfolio_epoch", String(options.portfolioEpoch));
    }
    if (options?.detailLevel) qs.set("detail_level", options.detailLevel);
    const path = `/api/ui/dashboard_snapshot?${qs.toString()}`;
    const cacheKey = `${API_BASE}${withContext(path, ctx, defaultScope)}`;
    const fallback: DashboardSnapshot = {
      system: null,
      ui_status: null,
      health: null,
      strategy_summaries: {},
      strategy_summary_meta: {},
      strategy_runs: {},
      portfolio: null,
      s3:
        profile === "s3"
          ? {
              summary: null,
              kpis: null,
              signals: [],
              signal_stats: null,
              shocks: [],
              shock_stats: null,
              trades: [],
              execution: null,
            }
          : null,
      strategies_status: null,
      portfolio_guard: null,
      _meta: {
        run_id: runId ?? ctx.run_id ?? null,
        profile,
        cache_hit: false,
        rows: 0,
        query_ms: undefined,
        errors: ["snapshot_unavailable", `snapshot:profile:${profile}`],
      },
    };
    const freshTtlMs =
      profile === "ops"
        ? 4_000
        : profile === "overview" || profile === "portfolio"
        ? 8_000
        : 2_500;
    const staleTtlMs =
      profile === "ops"
        ? 20_000
        : profile === "overview" || profile === "portfolio"
        ? 90_000
        : 10_000;
    const snapshotTimeoutMs =
      options?.detailLevel === "core"
        ? 6_000
        : profile === "overview" || profile === "portfolio"
        ? 25_000
        : API_TIMEOUT_MS;
    return fetchSnapshotSWR(
      cacheKey,
      () =>
        fetchJsonSafe<DashboardSnapshot>(
          path,
          fallback,
          options?.signal ? { signal: options.signal } : undefined,
          ctx,
          defaultScope,
          snapshotTimeoutMs,
          { throwOnAbort: true }
        ),
      freshTtlMs,
      staleTtlMs,
      options?.signal
    );
  },
  getTerminalSnapshot: (
    ctx: ActiveContext = activeContext,
    scope: DataScope = defaultScope,
    options?: {
      sections?: Array<
        "system" | "market_metrics" | "market_profile" | "ohlc" | "signals" | "logs"
      >;
      signalsMode?: "full" | "lite";
      cacheMode?: "default" | "network-only";
      signal?: AbortSignal;
    }
  ) => {
    const qs = new URLSearchParams();
    if (options?.sections?.length) {
      qs.set("sections", options.sections.join(","));
    }
    qs.set("signals_mode", options?.signalsMode ?? "lite");
    const path = qs.toString()
      ? `/api/ui/terminal_snapshot?${qs.toString()}`
      : "/api/ui/terminal_snapshot";
    const cacheKey = `${API_BASE}${withContext(path, ctx, scope)}`;
    const fallback: TerminalSnapshot = {
      system: null,
      market_metrics: null,
      market_profile: [],
      ohlc: { state: "DEGRADED", ohlc: [] },
      signals: [],
      logs: null,
      _meta: {
        run_id: ctx.run_id ?? null,
        sections: 0,
        cache_hit: false,
        degraded: true,
        errors: ["terminal_snapshot_unavailable"],
      },
    };
    if (options?.cacheMode === "network-only") {
      return fetchJsonSafeNoDedup<TerminalSnapshot>(
        path,
        fallback,
        options?.signal ? { signal: options.signal } : undefined,
        ctx,
        scope,
        API_TIMEOUT_MS,
        { throwOnAbort: true }
      );
    }
    const sectionCount = options?.sections?.length ?? 0;
    const freshTtlMs = sectionCount <= 3 ? 2_500 : 4_000;
    const staleTtlMs = sectionCount <= 3 ? 10_000 : 20_000;
    return fetchSnapshotSWR(
      cacheKey,
      () =>
        fetchJsonSafe<TerminalSnapshot>(
          path,
          fallback,
          options?.signal ? { signal: options.signal } : undefined,
          ctx,
          scope,
          API_TIMEOUT_MS,
          { throwOnAbort: true }
        ),
      freshTtlMs,
      staleTtlMs,
      options?.signal
    );
  },
  getStrategySummary: (
    ctx: ActiveContext = activeContext,
    strategyId?: StrategyId | string
  ) => {
    const qs = new URLSearchParams();
    if (ctx.run_id) qs.set("run_id", ctx.run_id);
    const strategy = strategyId ?? ctx.strategy_id;
    if (strategy) qs.set("strategy_id", strategy);
    return fetchJson<StrategySummary>(
      `/api/ui/strategy/summary?${qs.toString()}`,
      undefined,
      ctx,
      defaultScope
    );
  },
  getStrategyTopRejections: (
    ctx: ActiveContext = activeContext,
    strategyId?: StrategyId | string,
    topN = 5
  ) => {
    const qs = new URLSearchParams();
    if (ctx.run_id) qs.set("run_id", ctx.run_id);
    const strategy = strategyId ?? ctx.strategy_id;
    if (strategy) qs.set("strategy_id", strategy);
    qs.set("top_n", String(topN));
    return fetchJson<StrategyTopRejectionsResponse>(
      `/api/ui/strategy/rejections/top?${qs.toString()}`,
      undefined,
      ctx,
      defaultScope
    );
  },
  getS3TopRejections: (ctx: ActiveContext = activeContext, topN = 5) => {
    const qs = new URLSearchParams();
    if (ctx.run_id) qs.set("run_id", ctx.run_id);
    qs.set("top_n", String(topN));
    return fetchJson<StrategyTopRejectionsResponse>(
      `/api/ui/s3/rejections/top?${qs.toString()}`,
      undefined,
      ctx,
      defaultScope
    );
  },
  getDwSummary: (ctx: ActiveContext = activeContext) => {
    const qs = new URLSearchParams();
    if (ctx.run_id) qs.set("run_id", ctx.run_id);
    if (ctx.strategy_id) qs.set("strategy_id", ctx.strategy_id);
    return fetchJson<DwSummary>(
      `/api/ui/dw/summary?${qs.toString()}`,
      undefined,
      ctx,
      defaultScope
    );
  },
  getS2Summary: (ctx: ActiveContext = activeContext) => {
    if (!ctx.run_id) {
      return Promise.resolve(emptyS2Summary(null));
    }
    const qs = new URLSearchParams();
    if (ctx.run_id) qs.set("run_id", ctx.run_id);
    return fetchJsonSafeWithBase<S2Summary>(
      S2_API_BASE,
      `/api/ui/s2/summary?${qs.toString()}`,
      emptyS2Summary(ctx.run_id ?? null)
    );
  },
  getS2Charts: (limit = 720, ctx: ActiveContext = activeContext) => {
    if (!ctx.run_id) {
      return Promise.resolve(emptyS2Charts(null));
    }
    const qs = new URLSearchParams();
    qs.set("limit", String(limit));
    if (ctx.run_id) qs.set("run_id", ctx.run_id);
    return fetchJsonSafeWithBase<S2Charts>(
      S2_API_BASE,
      `/api/ui/s2/charts?${qs.toString()}`,
      emptyS2Charts(ctx.run_id ?? null)
    );
  },
  getS2Desk: (chartLimit = 720, ctx: ActiveContext = activeContext) => {
    if (!ctx.run_id) {
      return Promise.resolve({
        summary: emptyS2Summary(null),
        charts: emptyS2Charts(null),
      });
    }
    const qs = new URLSearchParams();
    if (ctx.run_id) qs.set("run_id", ctx.run_id);
    qs.set("chart_limit", String(chartLimit));
    return fetchJsonSafeWithBase<{ summary: S2Summary; charts: S2Charts }>(
      S2_API_BASE,
      `/api/ui/s2/desk?${qs.toString()}`,
      { summary: emptyS2Summary(ctx.run_id ?? null), charts: emptyS2Charts(ctx.run_id ?? null) }
    );
  },
  getTradesSummary: (runId: string | null = null) => {
    const qs = new URLSearchParams();
    if (runId) qs.set('run_id', runId);
    if (activeContext.strategy_id) qs.set('strategy_id', activeContext.strategy_id);
    const params = qs.toString();
    return fetchJson<{
      _meta: { run_id: string | null; data_origin: string; db_path: string; db_exists: boolean };
      counts: { total: number; filled: number; open: number; closed: number; cancelled: number };
      by_symbol: Record<string, number>;
      by_session: Record<string, number>;
    }>(`/api/trades/summary${params ? `?${params}` : ''}`);
  },
  resolveRun: (
    scope: 'TODAY' | 'YESTERDAY' | 'DATE' = 'TODAY',
    date?: string,
    strategyId?: string
  ) => {
    const params = new URLSearchParams({ scope });
    if (scope === 'DATE' && date) params.set('date', date);
    const strategy = strategyId ?? activeContext.strategy_id;
    if (strategy) params.set('strategy', strategy);
    return fetchJson<{
      resolved: boolean;
      run_id: string | null;
      strategy_id: string;
      strategy_version: string | null;
      trade_date: string;
      data_origin: 'RUN' | 'LEGACY';
      available_dbs: string[];
    }>(`/api/run/resolve?${params}`);
  },
  getConsistencyReport: (runId: string | null = null) => {
    const qs = new URLSearchParams();
    if (runId) qs.set('run_id', runId);
    if (activeContext.strategy_id) qs.set('strategy_id', activeContext.strategy_id);
    const params = qs.toString();
    return fetchJson<{
      run_id: string | null;
      data_origin: string;
      checks: { trades_without_signal: number; signals_without_trade: number };
      verdict: string;
      trade_count: number;
      signal_count: number;
    }>(`/api/consistency/report${params ? `?${params}` : ''}`);
  },
  getStrategyConfig: (ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) => fetchJson<StrategyConfig>("/api/strategy/config", undefined, ctx, scope),
  getCalibrationStatus: (ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) => fetchJson<CalibrationStatus>("/api/calibration/status", undefined, ctx, scope),
  runCalibration: (date?: string, mode: "quick" | "full" = "full", force = false, ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) =>
    postJson<{ status: string; report_date: string; verdict: any; paths: any }>(
      `/api/calibration/run?${new URLSearchParams({
        ...(date ? { date_str: date } : {}),
        mode,
        force: String(force),
      }).toString()}`,
      {},
      undefined,
      ctx,
      scope
    ),
  getCalibrationReport: (date?: string, ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) =>
    fetchJson<CalibrationReport>(`/api/calibration/report${date ? `?date_str=${date}` : ""}`, undefined, ctx, scope),
  getCalibrationSummary: (date?: string, ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) =>
    fetchJson<{ report_date: string; summary: string }>(`/api/calibration/summary${date ? `?date_str=${date}` : ""}`, undefined, ctx, scope),
  getMarketMetrics: (ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) =>
    fetchJsonSafe<MarketMetrics>("/api/market/metrics", {
      vol_regimes: [], spreads_by_session: [], acf: [], vr: [], time_heatmap: []
    }, undefined, ctx, scope),
  getExecutionMetrics: (
    runId: string,
    strategyId: string,
    includeOpen = false,
    ctx: ActiveContext = activeContext,
    scope: DataScope = defaultScope
  ) => {
    const params = new URLSearchParams({
      run_id: runId,
      strategy_id: strategyId,
      include_open: includeOpen ? "true" : "false",
    });
    return fetchJson<ExecutionMetricsResponse>(
      `/api/execution/metrics?${params.toString()}`,
      undefined,
      ctx,
      scope
    );
  },
  getMarketProfile: (limit = 500, ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) =>
    fetchJsonSafe<MarketProfileRow[]>(`/api/market/profile?limit=${limit}`, [], undefined, ctx, scope),
  getMarketProfileSessions: (mode: "TPO" | "TICKS" = "TPO", ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) =>
    fetchJson<SessionProfile[]>(`/api/market-profile/session?mode=${mode}`, undefined, ctx, scope),
  getMarketProfileDeveloping: (ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) => fetchJson<any>("/api/market-profile/developing", undefined, ctx, scope),
  getMarketProfileComposite: (ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) => fetchJson<CompositeProfile>("/api/market-profile/composite", undefined, ctx, scope),
  getMarketProfileTradeMap: (ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) => fetchJson<any>("/api/market-profile/trade-map", undefined, ctx, scope),
  getPortfolio: (ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) =>
    fetchJsonSafe<Portfolio>("/api/portfolio", { equity: null, pnl: null }, undefined, ctx, scope),
  getPortfolioSummary: (
    ctx: ActiveContext = activeContext,
    scope: DataScope = defaultScope
  ) =>
    fetchJsonSafe<PortfolioSummaryResponse>(
      "/api/portfolio/summary",
      {
        current_epoch: 1,
        sim_equity_usd: 5000.0,
        equity_usd: 5000.0,
        pnl_epoch_usd: 0.0,
        pnl_7d_usd: 0.0,
        pnl_30d_usd: 0.0,
        trades_7d: 0,
        trades_30d: 0,
        epoch_started_at: null,
      },
      undefined,
      ctx,
      scope
    ),
  getSystemStatus: (ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) =>
    fetchJsonSafe<SystemStatus>("/api/system/status", {
      last_tick_time: null,
      kill_switch: false,
      close_all: false,
      autostart_disabled: false,
      trading_paused: false,
      bot_running: null,
      last_log: null,
      system_actions_enabled: false,
    }, undefined, ctx, scope),
  getVmStatus: (ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) =>
    fetchJsonSafe<VmStatusResponse>(
      "/api/system/vm/status",
      {
        host: {
          label: "A1 (ARM64)",
          platform: "unknown",
          supported: false,
          checked_at: null,
          snapshot_age_seconds: null,
        },
        resources: {
          cpu_percent: null,
          load_avg_1m: null,
          load_avg_5m: null,
          load_avg_15m: null,
          memory_total_mb: null,
          memory_used_mb: null,
          memory_available_mb: null,
          memory_percent: null,
          swap_total_mb: null,
          swap_used_mb: null,
          swap_free_mb: null,
          swap_percent: null,
        },
        services: [],
        _meta: {
          degraded: true,
        },
      },
      undefined,
      ctx,
      scope
    ),
  getGuardianStatus: (ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) =>
    fetchJsonSafe<GuardianStatus>("/api/system/guardian", {
      service_name: "fractal-orphan-guard-a1",
      service_checked: false,
      service_state: "unknown",
      running: false,
      log_path: "",
      last_log_time: null,
      last_action_time: null,
      last_action_orphan_orders: null,
      last_action_orphan_positions: null,
      interval_seconds: null,
      grace_seconds: null,
    }, undefined, ctx, scope),
  getEmergencyControls: (
    ctx: ActiveContext = activeContext,
    scope: DataScope = defaultScope
  ) =>
    fetchJson<EmergencyControlsResponse>(
      "/api/system/emergency_controls",
      undefined,
      ctx,
      scope
    ),
  getLiveTick: async (): Promise<LiveTick> => {
    // BYPASS dedup layer — this endpoint is polled every ~1s and MUST hit the
    // network each time to get fresh bid/ask for the developing candle.
    const fallback: LiveTick = { bid: null, ask: null, mid: null, spread_pips: null, ts: 0 };
    try {
      const url = `${API_BASE}/api/price/tick`;
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 3000); // 3s hard timeout
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(tid);
      if (!res.ok) return fallback;
      return (await res.json()) as LiveTick;
    } catch {
      return fallback;
    }
  },
  getLogs: (
    lines = 200,
    ctx: ActiveContext = activeContext,
    scope: DataScope = defaultScope,
    source: "bot" | "s1" | "s2" | "s3" = "bot"
  ) => {
    const params = new URLSearchParams({
      lines: String(lines),
      source,
    });
    return fetchJsonSafe<LogsResponse>(
      `/api/logs?${params.toString()}`,
      {
        lines: [],
        source,
        degraded: true,
        error: "api_unavailable",
        message: "API unavailable",
        transport: "journalctl_retry",
        window: "none",
        attempts: 0,
        line_count: 0,
        latency_ms: null,
      },
      undefined,
      ctx,
      scope,
      45_000
    );
  },
  getLogsSnapshot: (
    lines = 180,
    ctx: ActiveContext = activeContext,
    scope: DataScope = defaultScope,
    options?: { signal?: AbortSignal }
  ) => {
    const params = new URLSearchParams({
      lines: String(lines),
    });
    const path = `/api/ui/logs_snapshot?${params.toString()}`;
    const cacheKey = `${API_BASE}${withContext(path, ctx, scope)}`;
    const emptySource = (source: "s1" | "s2" | "s3"): LogsResponse => ({
      lines: [],
      source,
      degraded: true,
      error: "api_unavailable",
      message: "API unavailable",
      transport: "journalctl_retry",
      window: "none",
      attempts: 0,
      line_count: 0,
      latency_ms: null,
    });
    const fallback: LogsSnapshotResponse = {
      sources: {
        s1: emptySource("s1"),
        s2: emptySource("s2"),
        s3: emptySource("s3"),
      },
      _meta: {
        rows: 0,
        cache_hit: false,
        degraded: true,
        errors: ["logs_snapshot_unavailable"],
      },
    };
    return fetchSnapshotSWR(
      cacheKey,
      () =>
        fetchJsonSafe<LogsSnapshotResponse>(
          path,
          fallback,
          options?.signal ? { signal: options.signal } : undefined,
          ctx,
          scope,
          45_000,
          { throwOnAbort: true }
        ),
      8_000,
      30_000,
      options?.signal
    );
  },
  postKillSwitch: (action: "activate" | "deactivate", reason: string | null, apiKey?: string, ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) =>
    postJson<{ success: boolean; message: string }>("/api/system/kill_switch", { action, reason }, apiKey, ctx, scope),
  postCloseAll: (reason: string | null, apiKey?: string, ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) =>
    postJson<{ success: boolean; message: string }>("/api/system/close_positions", { reason }, apiKey, ctx, scope),
  postPauseTrading: (action: "pause" | "resume", reason: string | null, apiKey?: string, ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) =>
    postJson<{ success: boolean; message: string }>("/api/system/pause_trading", { action, reason }, apiKey, ctx, scope),
  postAutostart: (action: "disable" | "enable", reason: string | null, apiKey?: string, ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) =>
    postJson<{ success: boolean; message: string }>("/api/system/autostart", { action, reason }, apiKey, ctx, scope),
  postRestartBot: (reason: string | null, apiKey?: string, ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) =>
    postJson<{ success: boolean; message: string }>("/api/system/restart_bot", { reason }, apiKey, ctx, scope),
  postRestartStrategyService: (
    payload: {
      strategy_id: string;
      reason: string | null;
    },
    apiKey?: string,
    ctx: ActiveContext = activeContext,
    scope: DataScope = defaultScope
  ) =>
    postJson<{ success: boolean; message: string }>(
      "/api/system/strategy_service/restart",
      payload,
      apiKey,
      ctx,
      scope
    ),
  postEmergencyControl: (
    payload: {
      flag: EmergencyControlFlag;
      scope: EmergencyControlScope;
      strategy_id?: string | null;
      action: "activate" | "deactivate";
      reason: string | null;
    },
    apiKey?: string,
    ctx: ActiveContext = activeContext,
    scope: DataScope = defaultScope
  ) =>
    postJson<{ success: boolean; message: string }>(
      "/api/system/emergency_controls",
      payload,
      apiKey,
      ctx,
      scope
    ),
  getDbIndex: (ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) => fetchJson<{ databases: DbSummary[] }>("/api/db/index", undefined, ctx, scope),
  getDbTables: (dbId: string, ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) => fetchJson<DbTableMeta[]>(`/api/db/${dbId}/tables`, undefined, ctx, scope),
  getDbRows: (dbId: string, table: string, limit = 100, offset = 0, order: "asc" | "desc" = "desc", ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) =>
    fetchJson<DbRows>(`/api/db/${dbId}/rows?table=${encodeURIComponent(table)}&limit=${limit}&offset=${offset}&order=${order}`, undefined, ctx, scope),
  getDbExportUrl: (
    dbId: string,
    table: string,
    format: "csv" | "json" = "csv",
    limit?: number,
    ctx: ActiveContext = activeContext,
    scope: DataScope = defaultScope
  ) => {
    const params = new URLSearchParams();
    params.set("table", table);
    params.set("export_format", format);
    if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
      params.set("limit", String(Math.floor(limit)));
    }
    return `${API_BASE}${withContext(`/api/db/${dbId}/export?${params.toString()}`, ctx, scope)}`;
  },
  getStrategiesStatus: (ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) =>
    fetchJsonSafe<StrategiesStatusResponse>("/api/system/strategies/status", { strategies: [] }, undefined, ctx, scope),
  getPortfolioGuardStatus: (ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) =>
    fetchJsonSafe<PortfolioGuardStatus>(
      "/api/risk/portfolio_guard",
      {
        enabled: false,
        canonical_db_path: "",
        slots: {
          max_open_per_strategy: 1,
          max_pending_entry_per_strategy: 1,
          max_open_global: 3,
        },
        counts: {
          open_global: 0,
          pending_global: 0,
        },
        reservations: [],
      },
      undefined,
      ctx,
      scope
    ),
  generateDailySnapshot: async (ctx: ActiveContext = activeContext) => {
    const res = await fetch(`${API_BASE}${withContext("/api/reports/daily-snapshot", ctx, { scope: "TODAY" })}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ctx),
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const disposition = res.headers.get("content-disposition");
    const filenameMatch = disposition?.match(/filename=\"?([^\";]+)\"?/i);
    const filename = filenameMatch?.[1] || "daily_snapshot.zip";
    return { blob, filename };
  },
  runBacktest: (payload: BacktestRunPayload) =>
    postJson<BacktestJobStatus>("/api/research/backtest/run", payload),
  getBacktestJobStatus: (jobId: string, tail = 200) =>
    fetchJson<BacktestJobStatus>(
      `/api/research/backtest/run/status/${encodeURIComponent(jobId)}?tail=${tail}`
    ),
  getAudnzdMultimethodReport: (limit = 5) =>
    fetchJsonSafe<AudnzdMultimethodReportResponse>(
      `/api/research/backtest/s2/audnzd/multimethod_report?limit=${limit}`,
      { available: false, latest_report: null, reports: [] }
    ),
  getS2ResearchDesk: (limit = 5) =>
    fetchJsonSafe<S2ResearchDeskResponse>(
      `/api/research/backtest/s2/audnzd/research_desk?limit=${limit}`,
      {
        available: false,
        campaigns: [],
        candidates: [],
        runs: [],
        stress_contract: {
          suite_version: "n/a",
          gate: {},
          scenarios: [],
        },
        selection_funnel: {
          eligibility: [],
          full_sample: [],
          walk_forward: [],
          stress: [],
        },
        promotion: {
          owner_service: "s2-pairs-a1",
          runtime_matches_recommended: false,
          status: "missing_report",
          diff_vs_recommended: [],
        },
      }
    ),
  getResearchCockpit: () =>
    fetchJsonSafe<ResearchCockpitResponse>(
      "/api/research/cockpit",
      { rows: [] }
    ),
  listResearchCampaigns: (limit = 20, strategyId?: string) => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (strategyId) params.set("strategy_id", strategyId);
    return fetchJsonSafe<ResearchCampaignListResponse>(
      `/api/research/campaigns?${params.toString()}`,
      { campaigns: [] }
    );
  },
  getResearchCampaign: (campaignId: string) =>
    fetchJson<ResearchCampaignDetailResponse>(
      `/api/research/campaign/${encodeURIComponent(campaignId)}`
    ),
  listResearchCandidates: (
    campaignId: string,
    limit = 100,
    selectionStatus?: string,
    modelFamily?: string
  ) => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (selectionStatus) params.set("selection_status", selectionStatus);
    if (modelFamily) params.set("model_family", modelFamily);
    return fetchJsonSafe<ResearchCandidateListResponse>(
      `/api/research/campaign/${encodeURIComponent(campaignId)}/candidates?${params.toString()}`,
      { candidates: [] }
    );
  },
  getResearchCandidate: (candidateId: string, campaignId?: string) => {
    const params = new URLSearchParams();
    if (campaignId) params.set("campaign_id", campaignId);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return fetchJson<ResearchCandidate>(
      `/api/research/candidate/${encodeURIComponent(candidateId)}${suffix}`
    );
  },
  getResearchCandidateWalkForward: (candidateId: string, campaignId?: string) => {
    const params = new URLSearchParams();
    if (campaignId) params.set("campaign_id", campaignId);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return fetchJson<ResearchWalkForwardResponse>(
      `/api/research/candidate/${encodeURIComponent(candidateId)}/walk_forward${suffix}`
    );
  },
  getResearchPromotionStatus: (strategyId: string) =>
    fetchJson<ResearchPromotionStatusResponse>(
      `/api/research/strategy/${encodeURIComponent(strategyId)}/promotion_status`
    ),
  listStrategyResearchCampaigns: (strategyId: string, limit = 20) => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    return fetchJsonSafe<ResearchCampaignListResponse>(
      `/api/research/${encodeURIComponent(strategyId)}/campaigns?${params.toString()}`,
      { campaigns: [] }
    );
  },
  getStrategyResearchCampaign: (strategyId: string, campaignId: string) =>
    fetchJson<ResearchCampaignDetailResponse>(
      `/api/research/${encodeURIComponent(strategyId)}/campaigns/${encodeURIComponent(campaignId)}`
    ),
  listStrategyResearchCandidates: (
    strategyId: string,
    campaignId: string,
    limit = 100,
    selectionStatus?: string,
    modelFamily?: string
  ) => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (selectionStatus) params.set("selection_status", selectionStatus);
    if (modelFamily) params.set("model_family", modelFamily);
    return fetchJsonSafe<ResearchCandidateListResponse>(
      `/api/research/${encodeURIComponent(strategyId)}/campaigns/${encodeURIComponent(campaignId)}/candidates?${params.toString()}`,
      { candidates: [] }
    );
  },
  getStrategyResearchCandidate: (strategyId: string, candidateId: string, campaignId?: string) => {
    const params = new URLSearchParams();
    if (campaignId) params.set("campaign_id", campaignId);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return fetchJson<ResearchCandidate>(
      `/api/research/${encodeURIComponent(strategyId)}/candidates/${encodeURIComponent(candidateId)}${suffix}`
    );
  },
  getStrategyResearchCandidateWalkForward: (
    strategyId: string,
    candidateId: string,
    campaignId?: string
  ) => {
    const params = new URLSearchParams();
    if (campaignId) params.set("campaign_id", campaignId);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return fetchJson<ResearchWalkForwardResponse>(
      `/api/research/${encodeURIComponent(strategyId)}/candidates/${encodeURIComponent(candidateId)}/walk-forward${suffix}`
    );
  },
  getStrategyResearchPromotion: (strategyId: string) =>
    fetchJsonSafe<ResearchPromotionStatusResponse>(
      `/api/research/${encodeURIComponent(strategyId)}/promotion`,
      {
        owner_service: 'unknown',
        runtime_matches_recommended: false,
        status: 'missing_report',
        diff_vs_recommended: [],
      }
    ),
  getStrategyResearchPaperMatch: (strategyId: string) =>
    fetchJsonSafe<ResearchPaperMatchResponse>(
      `/api/research/${encodeURIComponent(strategyId)}/paper-match`,
      {
        owner_service: 'unknown',
        runtime_matches_recommended: false,
        status: 'missing_report',
        diff_vs_recommended: [],
      }
    ),
  listStrategyResearchRuns: (strategyId: string, limit = 20) => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    return fetchJsonSafe<ResearchRunsResponse>(
      `/api/research/${encodeURIComponent(strategyId)}/runs?${params.toString()}`,
      { runs: [] }
    );
  },
  getStrategyResearchRun: (strategyId: string, runId: string) =>
    fetchJson<ResearchRun>(
      `/api/research/${encodeURIComponent(strategyId)}/runs/${encodeURIComponent(runId)}`
    ),
  getResearchArtifactOverview: (artifactId: string) =>
    fetchJson<ResearchArtifactOverviewResponse>(
      `/api/research/artifacts/${encodeURIComponent(artifactId)}/overview`
    ),
  getResearchArtifactTrades: (artifactId: string, limit = 500, offset = 0) => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    return fetchJsonSafe<ResearchArtifactTradesResponse>(
      `/api/research/artifacts/${encodeURIComponent(artifactId)}/trades?${params.toString()}`,
      {
        available: false,
        artifact_id: artifactId,
        status: "artifact_missing",
        data: [],
        stats: { count: 0, wins: 0, losses: 0, win_rate: null, total_pnl: null },
        pagination: { limit, offset, total: 0 },
      }
    );
  },
  getResearchArtifactEquity: (artifactId: string) =>
    fetchJsonSafe<ResearchArtifactEquityResponse>(
      `/api/research/artifacts/${encodeURIComponent(artifactId)}/equity`,
      {
        available: false,
        artifact_id: artifactId,
        status: "artifact_missing",
        data: [],
      }
    ),
  getResearchArtifactPrice: (artifactId: string) =>
    fetchJsonSafe<ResearchArtifactPriceResponse>(
      `/api/research/artifacts/${encodeURIComponent(artifactId)}/price`,
      {
        available: false,
        artifact_id: artifactId,
        status: "artifact_missing",
        price: null,
      }
    ),
  getResearchArtifactProgress: (artifactId: string) =>
    fetchJsonSafe<ResearchArtifactProgressResponse>(
      `/api/research/artifacts/${encodeURIComponent(artifactId)}/progress`,
      {
        available: false,
        artifact_id: artifactId,
        status: "artifact_missing",
        progress: null,
      }
    ),
  getStrategyLaunchCapabilities: (strategyId: string) =>
    fetchJsonSafe<ResearchLaunchCapabilitiesResponse>(
      `/api/research/${encodeURIComponent(strategyId)}/launch-capabilities`,
      {
        strategy_id: strategyId,
        owner_service: 'unknown',
        launch_intents: [],
        blocking_reasons: ['launch_capabilities_unavailable'],
      }
    ),
  listBacktestRuns: (limit = 50, mode?: BacktestMode) => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (mode) params.set("backtest_mode", mode);
    return fetchJsonSafe<BacktestRunListResponse>(
      `/api/research/backtest/runs?${params.toString()}`,
      { runs: [] }
    );
  },
  getBacktestSummary: (runId: string) =>
    fetchJson<BacktestSummary>(
      `/api/research/backtest/run/${encodeURIComponent(runId)}/summary`
    ),
  getDetailedReport: (runId: string) =>
    fetchJsonSafe<DetailedReportResponse>(
      `/api/research/backtest/run/${encodeURIComponent(runId)}/detailed_report`,
      { available: false, run_id: runId, report: null }
    ),
  getBacktestProgress: (runId: string) =>
    fetchJsonSafe<BacktestProgressResponse>(
      `/api/research/backtest/run/${encodeURIComponent(runId)}/progress`,
      { available: false, run_id: runId, progress: null }
    ),
  getBacktestShocks: (
    runId: string,
    limit = 200,
    acceptedOnly = false
  ) => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (acceptedOnly) params.set("accepted_only", "true");
    return fetchJsonSafe<BacktestShocksResponse>(
      `/api/research/backtest/run/${encodeURIComponent(runId)}/shocks?${params.toString()}`,
      { available: false, run_id: runId, events: [] }
    );
  },
  getBacktestTrades: (runId: string, limit = 200, offset = 0, direction?: string, exitReason?: string) => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    if (direction) params.set("direction", direction);
    if (exitReason) params.set("exit_reason", exitReason);
    return fetchJsonSafe<BacktestTradesResponse>(
      `/api/research/backtest/run/${encodeURIComponent(runId)}/trades?${params.toString()}`,
      {
        available: false,
        run_id: runId,
        data: [],
        stats: {
          count: 0,
          wins: 0,
          losses: 0,
          win_rate: null,
          total_pnl_pips: 0,
          avg_pnl_pips: null,
          tp_hit_rate: null,
          sl_hit_rate: null,
        },
        pagination: { limit, offset, total: 0 },
      }
    );
  },
  /** Download full backtest export as JSON blob (summary + trades + shocks + detailed report). */
  downloadBacktestExport: async (runId: string): Promise<{ blob: Blob; filename: string }> => {
    const res = await fetch(
      `${API_BASE}/api/research/backtest/run/${encodeURIComponent(runId)}/export`
    );
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const disposition = res.headers.get("content-disposition");
    const filenameMatch = disposition?.match(/filename="?([^";]+)"?/i);
    const filename = filenameMatch?.[1] || `backtest_export_${runId}.json`;
    return { blob, filename };
  },
  // Price Lake endpoints
  getLakeHealth: (root?: string) => {
    const params = new URLSearchParams();
    if (root) params.set("root", root);
    const qs = params.toString();
    return fetchJsonSafe<PriceLakeHealthResponse>(
      `/api/research/backtest/lake/health${qs ? `?${qs}` : ""}`,
      { available: false, root: "", symbols: [], intervals: [], date_range: null, total_bars: 0, total_files: 0, last_ingested_at: null }
    );
  },
  getLakeCoverage: (symbol: string, intervalS: number, startTs: string, endTs: string, root?: string) => {
    const params = new URLSearchParams();
    params.set("symbol", symbol);
    params.set("bar_interval_s", String(intervalS));
    params.set("start_ts", startTs);
    params.set("end_ts", endTs);
    if (root) params.set("root", root);
    return fetchJsonSafe<PriceLakeCoverageResponse>(
      `/api/research/backtest/lake/coverage?${params.toString()}`,
      { symbol, bar_interval_s: intervalS, start_ts: startTs, end_ts: endTs, timeline_coverage: 0, total_expected: 0, total_present: 0, missing_count: 0 }
    );
  },
  // Campaign endpoints (IS/OOS orchestration)
  createCampaign: (payload: CampaignCreatePayload) =>
    postJson<CampaignSummary>("/api/research/backtest/campaign", payload),
  getCampaignStatus: (campaignId: string) =>
    fetchJson<CampaignSummary>(
      `/api/research/backtest/campaign/${encodeURIComponent(campaignId)}`
    ),
  listCampaigns: (limit = 20) =>
    fetchJsonSafe<CampaignListResponse>(
      `/api/research/backtest/campaigns?limit=${limit}`,
      { campaigns: [] }
    ),
  getSignalMarketTrajectory: (
    signalId: string,
    options?: {
      preSeconds?: number;
      postSeconds?: number;
      maxPoints?: number;
      preferHi?: boolean;
    },
    ctx: ActiveContext = activeContext,
    scope: DataScope = defaultScope
  ) => {
    const params = new URLSearchParams();
    if (options?.preSeconds != null) params.set("pre_seconds", String(options.preSeconds));
    if (options?.postSeconds != null) params.set("post_seconds", String(options.postSeconds));
    if (options?.maxPoints != null) params.set("max_points", String(options.maxPoints));
    if (options?.preferHi != null) params.set("prefer_hi", String(options.preferHi));
    const query = params.toString();
    return fetchJsonSafe<SignalMarketTrajectoryResponse>(
      `/api/research/trajectory/signal/${encodeURIComponent(signalId)}${query ? `?${query}` : ""}`,
      {
        available: false,
        signal_id: signalId,
        run_id: ctx.run_id,
        strategy_id: ctx.strategy_id,
        source: "none",
        points: [],
      },
      undefined,
      ctx,
      scope
    );
  },
  getTradeMarketTrajectory: (
    tradeId: string,
    options?: {
      preSeconds?: number;
      postSeconds?: number;
      maxPoints?: number;
    },
    ctx: ActiveContext = activeContext,
    scope: DataScope = defaultScope
  ) => {
    const params = new URLSearchParams();
    if (options?.preSeconds != null) params.set("pre_seconds", String(options.preSeconds));
    if (options?.postSeconds != null) params.set("post_seconds", String(options.postSeconds));
    if (options?.maxPoints != null) params.set("max_points", String(options.maxPoints));
    const query = params.toString();
    return fetchJsonSafe<TradeMarketTrajectoryResponse>(
      `/api/research/trajectory/trade/${encodeURIComponent(tradeId)}${query ? `?${query}` : ""}`,
      {
        available: false,
        trade_id: tradeId,
        run_id: ctx.run_id,
        strategy_id: ctx.strategy_id,
        source: "none",
        points: [],
      },
      undefined,
      ctx,
      scope
    );
  },

  // IB Account State endpoints
  getIBAccountState: (maxExposure = 100_000, ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) =>
    fetchJson<IBAccountState>(`/api/ib/account_state?max_exposure=${maxExposure}`, undefined, ctx, scope),
  getIBHealth: (ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) =>
    fetchJson<IBHealthCheck>("/api/ib/health", undefined, ctx, scope),
  // Dedicated endpoint for execution history (SOURCE OF TRUTH)
  getIBExecutions: (limit = 100, ctx: ActiveContext = activeContext, scope: DataScope = defaultScope) =>
    fetchJson<IBExecutionsResponse>(`/api/ib/executions?limit=${limit}`, undefined, ctx, scope),
  // Parity gate reports
  getParityLatest: () =>
    fetchJsonSafe<ParityDailyReport>("/api/parity/latest", { date: "n/a", error: "unavailable" }),
  getParityHistory: (days = 7) =>
    fetchJsonSafe<ParityHistoryResponse>(`/api/parity/history?days=${days}`, { reports: [] }),
};

const STERN_COMPAT = true;

type SternBookLevel = { price: number; size: number };
type SternTrade = {
  trade_id?: number | null;
  side: "buy" | "sell";
  price: number;
  size: number;
  ts: string;
};
type SternFill = {
  side: "buy" | "sell";
  price: number;
  size: number;
  ts: string;
  reason: string;
};
type SternStateSnapshot = {
  product_id: string;
  mid_price: number | null;
  best_bid: SternBookLevel | null;
  best_ask: SternBookLevel | null;
  book: { bids: SternBookLevel[]; asks: SternBookLevel[] };
  recent_trades: SternTrade[];
  spread_metrics: Record<string, Record<string, number | null>>;
  spread_history: Array<Record<string, unknown>>;
  mid_history: Array<{ ts: string; mid_price: number }>;
  quote: {
    bid_price: number;
    ask_price: number;
    bid_size: number;
    ask_size: number;
    ts: string;
  } | null;
  risk_status: string;
  portfolio: {
    cash: number;
    position_btc: number;
    avg_entry_price: number;
    exposure_usd: number;
    realized_pnl: number;
    unrealized_pnl: number;
    equity: number;
    drawdown: number;
  };
  fills: SternFill[];
  runtime: {
    uptime_s: number;
    messages_seen: number;
    trade_events: number;
    order_book_ready: boolean;
    book_levels: { bids: number; asks: number };
    mid_ready: boolean;
    last_trade_ts: string | null;
    feed_state: string;
  };
  strategy: {
    mode: string;
    quote_active: boolean;
    fill_count: number;
    avg_fill_notional: number;
    inventory_btc: number;
    avg_entry_price: number;
    risk_status: string;
    config: Record<string, number>;
  };
  quant_lab: {
    readiness: string;
    window_points: number;
    realized_vol_bps: number;
    momentum_bps: number;
    trade_flow_imbalance_btc: number;
    top5_depth_imbalance: number;
    micro_bias_bps: number;
    spread_regimes: Record<string, string>;
    research_presets?: Array<Record<string, unknown>>;
  };
  backtest_lite: {
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
};

const STERN_RUN_ID = "stern-paper";

async function fetchSternState(signal?: AbortSignal): Promise<SternStateSnapshot> {
  const fallback: SternStateSnapshot = {
    product_id: "BTC-USD",
    mid_price: null,
    best_bid: null,
    best_ask: null,
    book: { bids: [], asks: [] },
    recent_trades: [],
    spread_metrics: {},
    spread_history: [],
    mid_history: [],
    quote: null,
    risk_status: "booting",
    portfolio: {
      cash: 1_000_000,
      position_btc: 0,
      avg_entry_price: 0,
      exposure_usd: 0,
      realized_pnl: 0,
      unrealized_pnl: 0,
      equity: 1_000_000,
      drawdown: 0,
    },
    fills: [],
    runtime: {
      uptime_s: 0,
      messages_seen: 0,
      trade_events: 0,
      order_book_ready: false,
      book_levels: { bids: 0, asks: 0 },
      mid_ready: false,
      last_trade_ts: null,
      feed_state: "warming",
    },
    strategy: {
      mode: "paper_market_maker",
      quote_active: false,
      fill_count: 0,
      avg_fill_notional: 0,
      inventory_btc: 0,
      avg_entry_price: 0,
      risk_status: "booting",
      config: {},
    },
    quant_lab: {
      readiness: "warming",
      window_points: 0,
      realized_vol_bps: 0,
      momentum_bps: 0,
      trade_flow_imbalance_btc: 0,
      top5_depth_imbalance: 0,
      micro_bias_bps: 0,
      spread_regimes: {},
      research_presets: [],
    },
    backtest_lite: {
      mode: "paper_session_replay",
      status: "warming",
      window_points: 0,
      equity_curve: [],
      pnl_curve: [],
      peak_equity_usd: 1_000_000,
      max_drawdown_usd: 0,
      quote_uptime_pct: 0,
      fill_count: 0,
      fill_volume_btc: 0,
      fill_notional_usd: 0,
      paper_return_pct: 0,
      total_pnl_usd: 0,
    },
  };
  return fetchJsonSafeWithBase<SternStateSnapshot>(
    API_BASE,
    "/api/state",
    fallback,
    signal ? { signal } : undefined
  );
}

function sternProductSymbol(state: SternStateSnapshot): string {
  return state.product_id || "BTC-USD";
}

function sternLastTs(state: SternStateSnapshot): string | null {
  return (
    state.runtime.last_trade_ts ||
    state.fills[0]?.ts ||
    state.recent_trades[0]?.ts ||
    state.mid_history[state.mid_history.length - 1]?.ts ||
    null
  );
}

function sternTotalPnl(state: SternStateSnapshot): number {
  return state.portfolio.realized_pnl + state.portfolio.unrealized_pnl;
}

function sternBuildSystemStatus(state: SternStateSnapshot): SystemStatus {
  const bestBid = state.best_bid?.price ?? null;
  const bestAsk = state.best_ask?.price ?? null;
  const mid =
    state.mid_price ??
    (bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : null);
  const spreadPips =
    bestBid != null && bestAsk != null && mid
      ? ((bestAsk - bestBid) / mid) * 10_000
      : null;
  const lastTick = sternLastTs(state);
  return {
    last_tick_time: lastTick,
    kill_switch: false,
    close_all: false,
    autostart_disabled: false,
    trading_paused: false,
    bot_running: true,
    service_status: "active",
    service_checked: true,
    tick_age_seconds: null,
    latency_ms: null,
    warmup_bars: state.quant_lab.window_points ?? 0,
    warmup_ready: state.runtime.feed_state === "live",
    warmup_eta_seconds: null,
    bid: bestBid,
    ask: bestAsk,
    spread_pips: spreadPips,
    mid,
    max_spread_pips: null,
    gateway_connected: state.runtime.mid_ready,
    data_fresh: state.runtime.feed_state === "live",
    trading_blocked: !state.strategy.quote_active,
    block_reason: state.strategy.quote_active ? null : state.risk_status,
    market_open: true,
    last_log: `Stern feed ${state.runtime.feed_state}`,
    system_actions_enabled: false,
    warmup: {
      bars_current: state.quant_lab.window_points ?? 0,
      bars_required: 25,
      warmup_pct: Math.min((state.quant_lab.window_points ?? 0) / 25, 1) * 100,
      warmup_complete: state.runtime.feed_state === "live",
    },
    price: {
      bid: bestBid,
      ask: bestAsk,
      spread_pips: spreadPips,
      mid,
    },
  };
}

function sternBuildUiStatus(state: SternStateSnapshot): UiStatus {
  return {
    run_id: STERN_RUN_ID,
    last_tick_time: sternLastTs(state),
    relay: {
      client_count: 1,
      buffer_len: state.recent_trades.length,
      last_ingest_ts: sternLastTs(state),
      last_broadcast_ts: sternLastTs(state),
    },
    system: {
      gateway_connected: state.runtime.mid_ready,
      bot_running: true,
    },
  };
}

function sternBuildOhlc(state: SternStateSnapshot, limit = 300): OhlcPayload {
  const buckets = new Map<string, Ohlc>();
  for (const point of state.mid_history) {
    const ts = new Date(point.ts);
    if (Number.isNaN(ts.getTime())) continue;
    ts.setUTCSeconds(0, 0);
    const bucket = ts.toISOString();
    const current = buckets.get(bucket);
    if (!current) {
      buckets.set(bucket, {
        timestamp: bucket,
        open: point.mid_price,
        high: point.mid_price,
        low: point.mid_price,
        close: point.mid_price,
        volume: null,
        tick_count: 1,
      });
      continue;
    }
    current.high = Math.max(current.high, point.mid_price);
    current.low = Math.min(current.low, point.mid_price);
    current.close = point.mid_price;
    current.tick_count = (current.tick_count ?? 0) + 1;
  }
  const ohlc = Array.from(buckets.values()).slice(-limit);
  return {
    state: ohlc.length ? "LIVE" : "EMPTY",
    ohlc,
    meta: {
      run_id: STERN_RUN_ID,
      strategy_id: "damping_wave",
      data_origin: "stern_state",
      latest_returned_bar_ts: ohlc[ohlc.length - 1]?.timestamp ?? null,
      market_open: true,
      bar_interval_s: 60,
      source_bar_interval_s: 1,
    },
  };
}

function sternBuildSignals(state: SternStateSnapshot, limit = 200): Signal[] {
  const symbol = sternProductSymbol(state);
  if (state.fills.length > 0) {
    return state.fills.slice(0, limit).map((fill, index) => ({
      timestamp: fill.ts,
      symbol,
      direction: fill.side.toUpperCase(),
      signal_type: "MM_FILL",
      accepted: true,
      reason: fill.reason,
      spread: null,
      spread_pips: null,
      side: fill.side,
      signal_id: `stern-fill-${index}`,
      run_id: STERN_RUN_ID,
      was_traded: true,
      final_pnl_usd: null,
    }));
  }
  return state.recent_trades.slice(0, limit).map((trade, index) => ({
    timestamp: trade.ts,
    symbol,
    direction: trade.side.toUpperCase(),
    signal_type: "MARKET_TRADE",
    accepted: false,
    reason: "market_observation",
    rejection_reason: "market_observation",
    spread: null,
    spread_pips: null,
    side: trade.side,
    signal_id: `stern-trade-${trade.trade_id ?? index}`,
    run_id: STERN_RUN_ID,
    was_traded: false,
    final_pnl_usd: null,
  }));
}

function sternBuildStrategySummary(
  state: SternStateSnapshot,
  strategyId = "damping_wave"
): StrategySummary {
  const lastSignal = sternBuildSignals(state, 1)[0] ?? null;
  return {
    strategy_id: strategyId,
    strategy_name:
      strategyId === "tf_pullback_v1"
        ? "Trend Proxy"
        : strategyId === "s2_pairs_trading"
          ? "Pairs Proxy"
          : "Crypto Maker",
    run_id: strategyId === "damping_wave" ? STERN_RUN_ID : null,
    warmup_state: state.runtime.feed_state === "live" ? "READY" : "WARMING",
    warmup_bars: state.quant_lab.window_points,
    warmup_target: 25,
    warmup_detail: state.runtime.feed_state,
    last_signal_ts: lastSignal?.timestamp ?? null,
    history_bars: state.mid_history.length,
    history_bars_required: 25,
    history_span_hours: state.runtime.uptime_s / 3600,
    warmup_stage: state.quant_lab.readiness,
    history_source: "coinbase_ws",
    history_bootstrap_status: state.runtime.feed_state,
    history_ready: state.runtime.feed_state === "live",
    m15_bars_available: state.mid_history.length,
    h1_bars_available: Math.floor(state.mid_history.length / 4),
    required_m15_bars: 25,
    required_h1_bars: 6,
    snapshot_saved_at: sternLastTs(state),
    snapshot_age_h: null,
    snapshot_loaded_from: "stern_state",
    reject_throttled_count: 0,
    last_signal: lastSignal
      ? {
          timestamp: lastSignal.timestamp,
          symbol: lastSignal.symbol,
          direction: lastSignal.direction,
          signal_type: lastSignal.signal_type ?? "MM_FILL",
          accepted: Boolean(lastSignal.accepted),
          reason: lastSignal.reason ?? null,
          z_score: lastSignal.z_score ?? null,
          spread: lastSignal.spread ?? null,
          decision_stage: lastSignal.decision_stage ?? "runtime",
        }
      : null,
    counts: {
      total: Math.max(state.strategy.fill_count, state.recent_trades.length),
      accepted: state.strategy.fill_count,
      rejected: 0,
    },
  };
}

function sternBuildS2Summary(state: SternStateSnapshot): S2Summary {
  return {
    strategy_name: "Pairs Proxy",
    pair_key: sternProductSymbol(state),
    run_id: null,
    warmup_state: "NO_DATA",
    last_signal_ts: null,
    last_signal: null,
    counts: { total: 0, accepted: 0, rejected: 0, warmup: 0 },
    signal_count: 0,
    config: {},
    gates: {},
    last_prices: {
      price_a: state.best_bid?.price ?? null,
      price_b: state.best_ask?.price ?? null,
    },
  };
}

function sternBuildStrategiesStatus(
  state: SternStateSnapshot
): StrategiesStatusResponse {
  const lastSignalTs = sternBuildSignals(state, 1)[0]?.timestamp ?? null;
  return {
    strategies: [
      {
        strategy_id: "damping_wave",
        source: "s1",
        owner_service: "stern-crypto-mm",
        service: "stern-crypto-mm",
        service_active: true,
        service_state: "active",
        active_pid: null,
        run_id: STERN_RUN_ID,
        last_signal_ts: lastSignalTs,
        last_trade_ts: sternLastTs(state),
        open_positions: Math.abs(state.portfolio.position_btc) > 0 ? 1 : 0,
        warmup_progress: {
          status: state.runtime.feed_state,
          stage: state.quant_lab.readiness,
          current: state.quant_lab.window_points,
          target: 25,
          remaining: Math.max(25 - state.quant_lab.window_points, 0),
          reason: state.risk_status,
        },
      },
      {
        strategy_id: "s2_pairs_trading",
        source: "s2",
        owner_service: "stern-crypto-mm",
        service: "stern-crypto-mm",
        service_active: false,
        service_state: "inactive",
        active_pid: null,
        run_id: null,
        last_signal_ts: null,
        last_trade_ts: null,
        open_positions: 0,
      },
      {
        strategy_id: "tf_pullback_v1",
        source: "s3",
        owner_service: "stern-crypto-mm",
        service: "stern-crypto-mm",
        service_active: false,
        service_state: "inactive",
        active_pid: null,
        run_id: null,
        last_signal_ts: null,
        last_trade_ts: null,
        open_positions: 0,
      },
    ],
    _meta: { source: "stern_state" },
  };
}

function sternBuildPortfolioSummary(
  state: SternStateSnapshot
): PortfolioSummaryResponse {
  return {
    current_epoch: 1,
    sim_equity_usd: state.portfolio.equity,
    equity_usd: state.portfolio.equity,
    pnl_epoch_usd: sternTotalPnl(state),
    pnl_7d_usd: sternTotalPnl(state),
    pnl_30d_usd: sternTotalPnl(state),
    trades_7d: state.strategy.fill_count,
    trades_30d: state.strategy.fill_count,
    epoch_started_at: state.mid_history[0]?.ts ?? null,
  };
}

function sternBuildPortfolioSnapshot(
  state: SternStateSnapshot
): DashboardPortfolioSnapshot {
  const totalPnl = sternTotalPnl(state);
  return {
    summary: sternBuildPortfolioSummary(state),
    strategies: {
      damping_wave: {
        winRate: 0,
        profitFactor: 0,
        sharpe: 0,
        dailyPnL: totalPnl,
        cumulativePnL: totalPnl,
        tradeCount: state.strategy.fill_count,
        dataSource: "stern_state",
        last_exit_ts: state.fills[0]?.ts ?? null,
        commission_view: "economic",
        missing_exit_pct: 0,
        anomaly_count: 0,
      },
      s2_pairs_trading: null,
      tf_pullback_v1: null,
    },
    portfolio_epoch: 1,
    commission_view: "economic",
    recent_trades: [],
    recent_trades_meta: { source: "stern_state" },
  };
}

function sternBuildMarketMetrics(state: SternStateSnapshot): MarketMetrics {
  return {
    vol_regimes: [
      {
        regime: state.quant_lab.readiness,
        realized_vol_bps: state.quant_lab.realized_vol_bps,
        momentum_bps: state.quant_lab.momentum_bps,
      },
    ],
    spreads_by_session: Object.entries(state.spread_metrics).map(
      ([size, metrics]) => ({
        session: size,
        avg: metrics.avg ?? null,
        median: metrics.median ?? null,
        min: metrics.min ?? null,
        max: metrics.max ?? null,
      })
    ),
    acf: [],
    vr: [],
    time_heatmap: [],
  };
}

function sternBuildMarketProfile(state: SternStateSnapshot): MarketProfileRow[] {
  return state.mid_history.slice(-120).map((point) => ({
    timestamp: point.ts,
    symbol: sternProductSymbol(state),
    vol_5min: state.quant_lab.realized_vol_bps,
    vol_15min: state.quant_lab.realized_vol_bps,
    vol_60min: state.quant_lab.realized_vol_bps,
    atr_14: null,
    atr_50: null,
    atr_200: null,
    volatility_regime: state.quant_lab.readiness,
    acf_1: null,
    acf_5: null,
    acf_10: null,
    vr_2: null,
    vr_5: null,
    vr_10: null,
    skewness: null,
    kurtosis: null,
    spread_pips:
      state.best_bid?.price != null &&
      state.best_ask?.price != null &&
      state.mid_price
        ? ((state.best_ask.price - state.best_bid.price) / state.mid_price) * 10_000
        : null,
    hour_of_day: new Date(point.ts).getUTCHours(),
    day_of_week: new Date(point.ts).getUTCDay(),
  }));
}

function sternBuildEquityCurve(state: SternStateSnapshot): EquityCurveResponse {
  const history = state.backtest_lite.equity_curve;
  const timestamps = state.mid_history.slice(-history.length).map((point) => point.ts);
  const equity_curve = history.map((equity, index) => ({
    timestamp: timestamps[index] ?? new Date().toISOString(),
    equity,
    trade_id: `stern-equity-${index}`,
    pnl: equity - (history[0] ?? equity),
  }));
  return {
    starting_equity: history[0] ?? state.portfolio.equity,
    end_equity: history[history.length - 1] ?? state.portfolio.equity,
    equity_curve,
    trade_count: state.strategy.fill_count,
  };
}

function sternOverviewRuns(): Record<string, string | null> {
  return {
    damping_wave: STERN_RUN_ID,
    s2_pairs_trading: null,
    tf_pullback_v1: null,
  };
}

function applySternCompat(): void {
  if (!STERN_COMPAT) return;
  Object.assign(api, {
    getUiStatus: async () => sternBuildUiStatus(await fetchSternState()),
    getSystemStatus: async () => sternBuildSystemStatus(await fetchSternState()),
    getLiveTick: async () => {
      const state = await fetchSternState();
      const bid = state.best_bid?.price ?? null;
      const ask = state.best_ask?.price ?? null;
      const mid =
        state.mid_price ??
        (bid != null && ask != null ? (bid + ask) / 2 : null);
      return {
        bid,
        ask,
        mid,
        spread_pips:
          bid != null && ask != null && mid
            ? ((ask - bid) / mid) * 10_000
            : null,
        ts: Date.now(),
      };
    },
    getLogs: async () => ({
      lines: [
        "STERN compatibility mode active",
        "Source: /api/state",
        "No dedicated log tail endpoint configured",
      ],
      source: "bot",
      degraded: false,
      transport: "stern_state",
      window: "none",
      attempts: 1,
      line_count: 3,
      latency_ms: null,
    }),
    getLogsSnapshot: async () => ({
      sources: {
        s1: {
          lines: ["STERN S1 proxy active"],
          source: "s1",
          degraded: false,
          line_count: 1,
        },
        s2: {
          lines: ["STERN S2 proxy inactive"],
          source: "s2",
          degraded: false,
          line_count: 1,
        },
        s3: {
          lines: ["STERN S3 proxy inactive"],
          source: "s3",
          degraded: false,
          line_count: 1,
        },
      },
      _meta: { rows: 3, cache_hit: false, degraded: false, errors: [] },
    }),
    getSignals: async (limit = 200) =>
      sternBuildSignals(await fetchSternState(), limit),
    getS2Signals: async () => [],
    getS2Runs: async () => ({ runs: [] }),
    getS2ActiveRun: async () => ({ run: null }),
    resetS2Run: async () => ({ run_id: null, status: "error", error: "unsupported_in_stern" }),
    getDeskRunContext: async ({
      selectedRunId = STERN_RUN_ID,
      activeRunId = STERN_RUN_ID,
      bundleEnabled = false,
      dwRunId = STERN_RUN_ID,
      s2RunId = null,
      tfRunId = null,
    }: {
      selectedRunId?: string | null;
      activeRunId?: string | null;
      bundleEnabled?: boolean;
      dwRunId?: string | null;
      s2RunId?: string | null;
      tfRunId?: string | null;
    }) => ({
      bundle_enabled: bundleEnabled,
      seed_run_id: selectedRunId,
      has_any_run: true,
      selected_run_id: selectedRunId,
      active_run_id: activeRunId,
      selected_run: { run_id: selectedRunId },
      active_run: { run_id: activeRunId },
      runtime_runs: sternOverviewRuns(),
      strategy_runs: {
        damping_wave: dwRunId ?? STERN_RUN_ID,
        s2_pairs_trading: s2RunId,
        tf_pullback_v1: tfRunId,
      },
      strategy_sources: {
        damping_wave: { run_id: dwRunId ?? STERN_RUN_ID, source: "stern_state" },
        s2_pairs_trading: { run_id: s2RunId, source: "stern_state" },
        tf_pullback_v1: { run_id: tfRunId, source: "stern_state" },
      },
      bundle_inputs: {
        damping_wave: dwRunId ?? STERN_RUN_ID,
        s2_pairs_trading: s2RunId,
        tf_pullback_v1: tfRunId,
      },
      _meta: { errors: [], cache_hit: false },
    }),
    getOverviewLane: async (lane: OverviewLane) => {
      const state = await fetchSternState();
      if (lane === "runtime") {
        return {
          lane,
          system: sternBuildSystemStatus(state),
          ui_status: sternBuildUiStatus(state),
          strategies_status: sternBuildStrategiesStatus(state),
          strategy_runs: sternOverviewRuns(),
          _meta: { lane, cache_hit: false, generated_at_utc: sternLastTs(state) },
        } satisfies OverviewRuntimeLaneResponse;
      }
      if (lane === "portfolio") {
        return {
          lane,
          portfolio: sternBuildPortfolioSnapshot(state),
          strategy_runs: sternOverviewRuns(),
          _meta: { lane, cache_hit: false, generated_at_utc: sternLastTs(state) },
        } satisfies OverviewPortfolioLaneResponse;
      }
      return {
        lane,
        strategy_summaries: {
          damping_wave: sternBuildStrategySummary(state, "damping_wave"),
          s2_pairs_trading: sternBuildS2Summary(state) as DashboardStrategySummary,
          tf_pullback_v1: sternBuildStrategySummary(state, "tf_pullback_v1"),
        },
        strategy_summary_meta: {
          damping_wave: { run_id: STERN_RUN_ID, status: "ready", source: "stern_state" },
          s2_pairs_trading: { run_id: null, status: "ready", source: "stern_state" },
          tf_pullback_v1: { run_id: null, status: "ready", source: "stern_state" },
        },
        strategy_runs: sternOverviewRuns(),
        _meta: { lane, cache_hit: false, generated_at_utc: sternLastTs(state) },
      } satisfies OverviewSummariesLaneResponse;
    },
    getDashboardSnapshot: async (
      runId: string | null = STERN_RUN_ID,
      profile: DashboardSnapshotProfile = "terminal"
    ) => {
      const state = await fetchSternState();
      return {
        system: sternBuildSystemStatus(state),
        ui_status: sternBuildUiStatus(state),
        health: {
          bot_db: true,
          analytics_db: true,
          shadow_db: true,
          status: state.runtime.feed_state,
        },
        strategy_summaries: {
          damping_wave: sternBuildStrategySummary(state, "damping_wave"),
          s2_pairs_trading: sternBuildS2Summary(state) as DashboardStrategySummary,
          tf_pullback_v1: sternBuildStrategySummary(state, "tf_pullback_v1"),
        },
        strategy_summary_meta: {
          damping_wave: { run_id: STERN_RUN_ID, status: "ready", source: "stern_state" },
          s2_pairs_trading: { run_id: null, status: "ready", source: "stern_state" },
          tf_pullback_v1: { run_id: null, status: "ready", source: "stern_state" },
        },
        strategy_runs: sternOverviewRuns(),
        portfolio: sternBuildPortfolioSnapshot(state),
        s3: null,
        strategies_status: sternBuildStrategiesStatus(state),
        portfolio_guard: null,
        _meta: {
          run_id: runId,
          profile,
          cache_hit: false,
          rows: state.recent_trades.length,
          generated_at_utc: sternLastTs(state) ?? new Date().toISOString(),
          errors: [],
        },
      } satisfies DashboardSnapshot;
    },
    getTerminalSnapshot: async (
      _ctx: ActiveContext = activeContext,
      _scope: DataScope = defaultScope,
      options?: {
        sections?: Array<"system" | "market_metrics" | "market_profile" | "ohlc" | "signals" | "logs">;
        signalsMode?: "full" | "lite";
        cacheMode?: "default" | "network-only";
        signal?: AbortSignal;
      }
    ) => {
      const state = await fetchSternState(options?.signal);
      return {
        system: sternBuildSystemStatus(state),
        market_metrics: sternBuildMarketMetrics(state),
        market_profile: sternBuildMarketProfile(state),
        ohlc: sternBuildOhlc(state),
        signals: sternBuildSignals(state, options?.signalsMode === "full" ? 200 : 60),
        logs: {
          source: "stern",
          lines: ["STERN terminal snapshot online"],
          degraded: false,
          line_count: 1,
        },
        _meta: {
          run_id: STERN_RUN_ID,
          sections: options?.sections?.length ?? 6,
          cache_hit: false,
          degraded: false,
          generated_at_utc: sternLastTs(state) ?? new Date().toISOString(),
          errors: [],
          requested_sections: options?.sections ?? [],
          signals_mode: options?.signalsMode ?? "lite",
        },
      } satisfies TerminalSnapshot;
    },
    getStrategySummary: async (
      _ctx: ActiveContext = activeContext,
      strategyId?: StrategyId | string
    ) => {
      const state = await fetchSternState();
      if (strategyId === "s2_pairs_trading") {
        return sternBuildS2Summary(state) as StrategySummary;
      }
      return sternBuildStrategySummary(state, strategyId ?? "damping_wave");
    },
    getS2Summary: async () => sternBuildS2Summary(await fetchSternState()),
    getMarketMetrics: async () => sternBuildMarketMetrics(await fetchSternState()),
    getMarketProfile: async () => sternBuildMarketProfile(await fetchSternState()),
    getPortfolio: async () => {
      const state = await fetchSternState();
      return {
        equity: state.portfolio.equity,
        pnl: sternTotalPnl(state),
        positions: Math.abs(state.portfolio.position_btc) > 0 ? 1 : 0,
      } satisfies Portfolio;
    },
    getPortfolioSummary: async () => sternBuildPortfolioSummary(await fetchSternState()),
    getPortfolioEquityCurve: async () => sternBuildEquityCurve(await fetchSternState()),
    getOhlcForRun: async (
      limit = 300,
      _runId?: string | null,
      _ctx: ActiveContext = activeContext,
      _scope: DataScope = defaultScope,
      _opts?: { fromTs?: string; toTs?: string; order?: "asc" | "desc"; signal?: AbortSignal }
    ) => sternBuildOhlc(await fetchSternState(), limit),
    getStrategiesStatus: async () => sternBuildStrategiesStatus(await fetchSternState()),
    getVmStatus: async () => ({
      host: {
        label: "Local / VM",
        platform: "crypto-mm",
        supported: true,
        checked_at: new Date().toISOString(),
        snapshot_age_seconds: 0,
      },
      resources: {
        cpu_percent: null,
        load_avg_1m: null,
        load_avg_5m: null,
        load_avg_15m: null,
        memory_total_mb: null,
        memory_used_mb: null,
        memory_available_mb: null,
        memory_percent: null,
        swap_total_mb: null,
        swap_used_mb: null,
        swap_free_mb: null,
        swap_percent: null,
      },
      services: [
        {
          name: "stern-crypto-mm",
          label: "STERN Crypto MM",
          state: "active",
          ok: true,
          main_pid: null,
        },
      ],
      _meta: { degraded: false },
    }),
  });
}

applySternCompat();
