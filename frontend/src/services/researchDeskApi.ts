import { getApiBase } from '../services/iaAuditApi';

export type ScopeType = 'DAY' | 'RUN' | 'CAMPAIGN' | 'ROLLING';

export interface SweepRunMeta {
  sweep_run_id: string;
  created_at: string;
  as_of_date: string;
  scope_type: ScopeType;
  scope_key: string;
  code_version: string | null;
  params?: Record<string, any>;
  source_meta?: Record<string, any>;
  status: string;
  metrics_count?: number;
  signals_total?: number | null;
  run_ids_missing_pct?: number | null;
  error_message?: string | null;
}

export interface StatusV2 {
  available: boolean;
  path: string;
  latest: SweepRunMeta | null;
  latest_by_scope?: Record<ScopeType, SweepRunMeta | null>;
  status_counts?: Record<string, number>;
  has_data: boolean;
  latest_sweep_run_id: string | null;
  signals_total?: number | null;
  run_ids_missing_pct?: number | null;
  resolved_run_ids_count?: number | null;
  resolved_first_run_ts?: string | null;
  resolved_last_run_ts?: string | null;
  resolved_run_ids_hash?: string | null;
  baseline_params?: Record<string, any> | null;
  shocks_total?: number | null;
  signals_total_after_exclusions?: number | null;
  signals_excluded_missing_run_id?: number | null;
}

export interface ConfigRow {
  config_id: string;
  pnl_net_day: number;
  n_trades_day: number;
  dd_day: number;
  winrate_day: number;
  gross_pnl_day?: number | null;
  costs_day?: number | null;
  avg_hold_s?: number | null;
}

export interface SummaryV2 {
  run: SweepRunMeta;
  stats: { count: number; p25: number | null; p50: number | null; p75: number | null };
  top: ConfigRow[];
  bottom: ConfigRow[];
  baseline_params?: Record<string, any> | null;
}

export interface ConfigsV2 {
  data: ConfigRow[];
  pagination: { limit: number; offset: number; total: number };
  run: SweepRunMeta;
}

export interface ConfigDetailV2 {
  config_id: string;
  series: Array<
    ConfigRow & {
      sweep_run_id: string;
      created_at: string;
      as_of_date: string;
      scope_type: ScopeType;
      scope_key: string;
      code_version: string | null;
      output_dir?: string | null;
      params?: Record<string, any> | null;
    }
  >;
  pagination: { limit: number; offset: number; total: number };
  baseline_params?: Record<string, any> | null;
}

export interface SweepJobStatus {
  job_id: string;
  status: "running" | "success" | "error";
  scope_type: ScopeType;
  scope_key: string;
  started_at: string;
  ended_at?: string | null;
  exit_code?: number | null;
  error?: string | null;
  logs: string[];
  as_of?: string | null;
}

const API_BASE = getApiBase();
const DEFAULT_LIMIT = 20;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed request: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchScopesV2(): Promise<Record<ScopeType, string[]>> {
  return fetchJson(`${API_BASE}/api/research/scopes_v2`);
}

export async function fetchStatusV2(scopeType: ScopeType, scopeKey?: string): Promise<StatusV2> {
  const params = new URLSearchParams();
  params.set('scope_type', scopeType);
  if (scopeKey) params.set('scope_key', scopeKey);
  return fetchJson(`${API_BASE}/api/research/sweep/status_v2?${params.toString()}`);
}

export async function fetchSummaryV2(scopeType: ScopeType, scopeKey: string): Promise<SummaryV2> {
  const params = new URLSearchParams({ scope_type: scopeType, scope_key: scopeKey });
  return fetchJson(`${API_BASE}/api/research/sweep/summary_v2?${params.toString()}`);
}

export async function fetchConfigsV2(
  scopeType: ScopeType,
  scopeKey: string,
  limit = DEFAULT_LIMIT,
  offset = 0,
  orderBy: keyof ConfigRow = 'pnl_net_day',
  direction: 'asc' | 'desc' = 'desc',
): Promise<ConfigsV2> {
  const params = new URLSearchParams({
    scope_type: scopeType,
    scope_key: scopeKey,
    limit: String(limit),
    offset: String(offset),
    order_by: orderBy,
    direction,
  });
  return fetchJson(`${API_BASE}/api/research/sweep/configs_v2?${params.toString()}`);
}

export async function fetchConfigDetailV2(
  configId: string,
  scopeType: ScopeType,
  scopeKey: string,
): Promise<ConfigDetailV2> {
  const params = new URLSearchParams({ scope_type: scopeType, scope_key: scopeKey });
  return fetchJson(`${API_BASE}/api/research/sweep/config_detail_v2/${configId}?${params.toString()}`);
}

export async function runSweepJob(scopeType: ScopeType, scopeKey: string): Promise<SweepJobStatus> {
  const res = await fetch(`${API_BASE}/api/research/sweep/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope_type: scopeType, scope_key: scopeKey }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail?.detail || `Failed to start sweep (${res.status})`);
  }
  return res.json() as Promise<SweepJobStatus>;
}

export async function fetchSweepJob(jobId: string, tail: number = 200): Promise<SweepJobStatus> {
  return fetchJson(`${API_BASE}/api/research/sweep/run/status/${jobId}?tail=${tail}`);
}
