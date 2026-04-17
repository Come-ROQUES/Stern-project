/**
 * ResearchDesk v2 — SQL-first, run-aware sweep viewer.
 * Uses API v2 endpoints (status_v2, summary_v2, configs_v2, config_detail_v2)
 * with backend pagination and no client-side slicing.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type BacktestRunRow, type BacktestSummary } from '../lib/api';
import { formatTime } from '../lib/dateUtils';
import { useRunId } from '../lib/useRunContext';
import {
  canonicalApi,
  type CanonicalKPIs,
  type Run,
} from '../lib/canonicalApi';
import { cn } from '../lib/utils';
import {
  fetchScopesV2,
  fetchStatusV2,
  fetchSummaryV2,
  fetchConfigsV2,
  fetchConfigDetailV2,
  ScopeType,
  SweepRunMeta,
  StatusV2,
  SummaryV2,
  ConfigRow,
  ConfigsV2,
  ConfigDetailV2,
  SweepJobStatus,
  runSweepJob,
  fetchSweepJob,
} from '../services/researchDeskApi';

// =============================================================================
// Types (API v2)
// =============================================================================

const DEFAULT_LIMIT = 20;
const ORDERABLE_COLUMNS = [
  'pnl_net_day',
  'n_trades_day',
  'dd_day',
  'winrate_day',
  'gross_pnl_day',
  'costs_day',
  'avg_hold_s',
] as const;

// =============================================================================
// UI utilities
// =============================================================================

const researchGlass = [
  "rounded-3xl border border-white/10",
  "bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_35%)," +
  "radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.22),transparent_32%)," +
  "linear-gradient(135deg,rgba(4,7,15,0.92),rgba(6,11,20,0.92))]",
  "p-4 sm:p-5",
  "backdrop-blur-2xl",
  "shadow-[0_28px_110px_rgba(0,0,0,0.65)]",
].join(" ");
const ROLLING_PRESETS: string[] = ['LAST_30_RUNS', 'LAST_100_RUNS', 'LAST_24H'];

function inferBacktestStrategy(run: BacktestRunRow): 'S3' | 'S2' | 'DW' | 'OTHER' {
  const raw = `${run.run_id} ${run.mode} ${run.output_dir ?? ''}`.toLowerCase();
  if (raw.includes('tf_pullback') || raw.includes('s3')) return 'S3';
  if (raw.includes('s2')) return 'S2';
  if (raw.includes('damping') || raw.includes('dw')) return 'DW';
  return 'OTHER';
}

function fmtSigned(v: number | null | undefined, digits = 2, suffix = ''): string {
  if (v == null || Number.isNaN(v)) return 'n/a';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(digits)}${suffix}`;
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4 backdrop-blur-xl">
      <div className="text-xs text-neutral-400 mb-1">{label}</div>
      <div className="text-lg font-semibold text-neutral-100">{value}</div>
      {sub && <div className="text-xs text-neutral-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function ConfigTable({
  configs,
  sort,
  order,
  onSortChange,
  onSelect,
  selected,
}: {
  configs: ConfigRow[];
  sort: string;
  order: 'asc' | 'desc';
  onSortChange: (col: typeof ORDERABLE_COLUMNS[number]) => void;
  onSelect: (configId: string) => void;
  selected: string | null;
}) {
  const headers: Array<{ label: string; key: typeof ORDERABLE_COLUMNS[number] | 'config_id'; sortable?: boolean }> = [
    { label: 'Config', key: 'config_id' },
    { label: 'PnL', key: 'pnl_net_day', sortable: true },
    { label: 'Trades', key: 'n_trades_day', sortable: true },
    { label: 'DD', key: 'dd_day', sortable: true },
    { label: 'WR', key: 'winrate_day', sortable: true },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-neutral-400 text-xs border-b border-neutral-700">
            {headers.map((h) => {
              const isActive = h.key === sort;
              return (
                <th
                  key={h.key}
                  className={cn(
                    'text-left py-2 px-2',
                    h.sortable && 'cursor-pointer hover:text-neutral-200',
                  )}
                  onClick={() => {
                    if (h.sortable) onSortChange(h.key as typeof ORDERABLE_COLUMNS[number]);
                  }}
                >
                  <span className="flex items-center gap-1">
                    {h.label}
                    {h.sortable && isActive && (
                      <span className="text-[10px] text-neutral-500">
                        {order === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {configs.map((cfg) => (
            <tr
              key={cfg.config_id}
              className={cn(
                'border-b border-neutral-800 cursor-pointer hover:bg-neutral-800/50 transition-colors',
                selected === cfg.config_id && 'bg-neutral-700/40',
              )}
              onClick={() => onSelect(cfg.config_id)}
            >
              <td className="py-2 px-2 font-mono text-xs text-neutral-200">{cfg.config_id}</td>
              <td
                className={cn(
                  'py-2 px-2 text-right',
                  cfg.pnl_net_day >= 0 ? 'text-green-400' : 'text-red-400',
                )}
              >
                {cfg.pnl_net_day.toFixed(2)}
              </td>
              <td className="py-2 px-2 text-right text-neutral-300">{cfg.n_trades_day}</td>
              <td className="py-2 px-2 text-right text-red-400">{cfg.dd_day.toFixed(2)}</td>
              <td className="py-2 px-2 text-right text-neutral-300">
                {(cfg.winrate_day * 100).toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConfigDetail({
  detail,
  baselineFallback,
  onClose,
}: {
  detail: ConfigDetailV2 | null;
  baselineFallback: Record<string, any> | null;
  onClose: () => void;
}) {
  if (!detail) return null;
  const params = detail.series.find((row) => row.params)?.params || null;
  const baseline = detail.baseline_params ?? baselineFallback ?? null;
  const renderParams = () => {
    if (!params) return null;
    const flat = dedupeFlatParams(flattenParams(params));
    const flatBaseline = dedupeFlatParams(
      baseline ? flattenParams(structureBaseline(baseline) || {}) : {},
    );
    const keys = Array.from(new Set([...Object.keys(flat), ...Object.keys(flatBaseline)]));
    const entries = keys.map((k) => [k, flat[k], flatBaseline[k]] as const).slice(0, 32);
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="text-xs text-neutral-400 uppercase tracking-[0.2em] mb-2">
          Config vs baseline
        </div>
        <table className="w-full text-xs">
          <thead className="text-neutral-400">
            <tr>
              <th className="text-left py-1 pr-2">Param</th>
              <th className="text-left py-1 pr-2">Config</th>
              <th className="text-left py-1 pr-2">Baseline</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([k, v, b]) => (
              <tr key={k} className="border-t border-white/5">
                <td className="py-1 pr-2 text-neutral-400">{k}</td>
                <td className="py-1 pr-2 font-mono text-[11px] text-neutral-100">
                  {formatVal(v)}
                </td>
                <td
                  className={cn(
                    'py-1 pr-2 font-mono text-[11px]',
                    b !== undefined && v !== b ? 'text-amber-200' : 'text-neutral-400',
                  )}
                >
                  {formatVal(b)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };
  return (
    <div className={`${researchGlass} space-y-3`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-neutral-400">Config Detail</div>
          <div className="font-mono text-sm text-white">{detail.config_id}</div>
        </div>
        <button onClick={onClose} className="text-neutral-400 hover:text-neutral-200 text-sm">
          Close
        </button>
      </div>
      {renderParams()}
      <div className="max-h-64 overflow-y-auto rounded-xl border border-white/10">
        <table className="w-full text-xs">
          <thead className="bg-white/5 text-neutral-400">
            <tr>
              <th className="text-left px-2 py-2">Created</th>
              <th className="text-left px-2 py-2">As of</th>
              <th className="text-right px-2 py-2">PnL</th>
              <th className="text-right px-2 py-2">Trades</th>
              <th className="text-right px-2 py-2">DD</th>
              <th className="text-right px-2 py-2">WR</th>
            </tr>
          </thead>
          <tbody>
            {detail.series.map((row) => (
              <tr key={`${row.sweep_run_id}-${row.config_id}`} className="border-b border-neutral-800">
                <td className="px-2 py-2 text-neutral-300">
                  {row.created_at.slice(0, 19).replace('T', ' ')}
                </td>
                <td className="px-2 py-2 text-neutral-400">{row.as_of_date}</td>
                <td
                  className={cn(
                    'px-2 py-2 text-right',
                    row.pnl_net_day >= 0 ? 'text-green-400' : 'text-red-400',
                  )}
                >
                  {row.pnl_net_day.toFixed(2)}
                </td>
                <td className="px-2 py-2 text-right text-neutral-300">{row.n_trades_day}</td>
                <td className="px-2 py-2 text-right text-red-400">{row.dd_day.toFixed(2)}</td>
                <td className="px-2 py-2 text-right text-neutral-300">
                  {(row.winrate_day * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function flattenParams(obj: Record<string, any>, prefix = ''): Record<string, any> {
  return Object.entries(obj || {}).reduce<Record<string, any>>(
    (acc, [k, v]) => {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        Object.assign(acc, flattenParams(v, key));
      } else {
        acc[key] = v;
      }
      return acc;
    },
    {},
  );
}

function dedupeFlatParams(flat: Record<string, any>): Record<string, any> {
  const nestedNames = new Set(
    Object.keys(flat)
      .filter((k) => k.includes('.'))
      .map((k) => k.split('.').pop() || k),
  );
  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(flat)) {
    const simple = key.includes('.') ? key.split('.').pop() || key : key;
    if (!key.includes('.') && nestedNames.has(simple)) {
      continue; // drop duplicate top-level when nested exists
    }
    cleaned[key] = val;
  }
  return cleaned;
}

function structureBaseline(baseline: Record<string, any> | null): Record<string, any> | null {
  if (!baseline) return null;
  const shock: Record<string, any> = {};
  const signal: Record<string, any> = {};
  const exec: Record<string, any> = {};

  if (baseline.shock_threshold !== undefined) shock.shock_threshold = baseline.shock_threshold;
  if (baseline.vol_window !== undefined) shock.vol_window = baseline.vol_window;
  if (baseline.spread_multiplier !== undefined) shock.spread_multiplier = baseline.spread_multiplier;
  if (baseline.min_amplitude_pips !== undefined) shock.min_amplitude_pips = baseline.min_amplitude_pips;
  if (baseline.max_spread_pips !== undefined) shock.max_spread_pips = baseline.max_spread_pips;
  if (baseline.window !== undefined) shock.window = baseline.window;
  if (baseline.use_real_volatility !== undefined) shock.use_real_volatility = baseline.use_real_volatility;

  if (baseline.retrace_threshold !== undefined) signal.retrace_threshold = baseline.retrace_threshold;
  if (baseline.anchor_tolerance_pips !== undefined) signal.anchor_tolerance_pips = baseline.anchor_tolerance_pips;
  if (baseline.max_reflex_bars !== undefined) signal.max_reflex_bars = baseline.max_reflex_bars;
  if (baseline.signal_mode !== undefined) signal.mode = baseline.signal_mode;

  if (baseline.tp_multiplier !== undefined) exec.tp_multiplier = baseline.tp_multiplier;
  if (baseline.sl_multiplier !== undefined) exec.sl_multiplier = baseline.sl_multiplier;
  if (baseline.min_tp_pips !== undefined) exec.min_tp_pips = baseline.min_tp_pips;
  if (baseline.min_sl_pips !== undefined) exec.min_sl_pips = baseline.min_sl_pips;
  if (baseline.max_hold_bars !== undefined) exec.max_hold_bars = baseline.max_hold_bars;

  const structured: Record<string, any> = { ...baseline };
  if (Object.keys(shock).length) structured.shock = shock;
  if (Object.keys(signal).length) structured.signal = signal;
  if (Object.keys(exec).length) structured.exec = exec;
  return structured;
}

function formatVal(v: any): string {
  if (v === null || v === undefined) return '-';
  if (typeof v === 'number') return v % 1 === 0 ? v.toString() : v.toFixed(3);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

// =============================================================================
// Main Component
// =============================================================================

export function ResearchDesk() {
  const [scopeType, setScopeType] = useState<ScopeType>('ROLLING');
  const [scopeKey, setScopeKey] = useState<string>('');
  const [availableScopes, setAvailableScopes] = useState<Record<ScopeType, string[]>>({
    DAY: [],
    RUN: [],
    CAMPAIGN: [],
    ROLLING: ROLLING_PRESETS,
  });

  const [status, setStatus] = useState<StatusV2 | null>(null);
  const [summary, setSummary] = useState<SummaryV2 | null>(null);
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [totalConfigs, setTotalConfigs] = useState<number>(0);

  const [limit] = useState<number>(DEFAULT_LIMIT);
  const [offset, setOffset] = useState<number>(0);
  const [sort, setSort] = useState<typeof ORDERABLE_COLUMNS[number]>('pnl_net_day');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  const [selectedConfig, setSelectedConfig] = useState<string | null>(null);
  const [configDetail, setConfigDetail] = useState<ConfigDetailV2 | null>(null);
  const [downloadingTop, setDownloadingTop] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [sweepJob, setSweepJob] = useState<SweepJobStatus | null>(null);
  const [s3BacktestRuns, setS3BacktestRuns] = useState<BacktestRunRow[]>([]);
  const [selectedS3BacktestRunId, setSelectedS3BacktestRunId] = useState<string>('');
  const [s3BacktestSummary, setS3BacktestSummary] = useState<BacktestSummary | null>(null);
  const [s3PaperKpis, setS3PaperKpis] = useState<CanonicalKPIs | null>(null);
  const [s3BacktestError, setS3BacktestError] = useState<string | null>(null);
  const runId = useRunId();
  const sweepPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const [runCandidates, setRunCandidates] = useState<string[]>([]);
  const formatTs = (ts?: string | null) =>
    ts ? ts.replace('T', ' ').slice(0, 19) : '-';

  const resolveEffectiveScopeKey = useCallback(() => {
    return (
      scopeKey ||
      summary?.run?.scope_key ||
      status?.latest?.scope_key ||
      status?.latest_by_scope?.[scopeType]?.scope_key ||
      ''
    );
  }, [scopeKey, summary, status, scopeType]);

  const loadScopes = useCallback(async () => {
    try {
      const data = await fetchScopesV2();
      setAvailableScopes({
        DAY: data.DAY || [],
        RUN: data.RUN || [],
        CAMPAIGN: data.CAMPAIGN || [],
        ROLLING: data.ROLLING && data.ROLLING.length ? data.ROLLING : ROLLING_PRESETS,
      });
    } catch (e) {
      // noop: keep defaults, avoid blocking UI
      console.warn('Failed to load scopes_v2', e);
    }
  }, []);

  useEffect(() => {
    loadScopes();
  }, [loadScopes]);

  // Clear job when scope changes to avoid confusion
  useEffect(() => {
    setSweepJob(null);
  }, [scopeType, scopeKey]);

  useEffect(() => {
    // Fallback: list recent runs from canonical DB to populate RUN dropdown
    const loadRuns = async () => {
      try {
        const res = await canonicalApi.listRuns({ limit: 30 });
        const ids = (res.runs as Run[]).map((r) => r.run_id).filter(Boolean);
        setRunCandidates(ids);
      } catch (e) {
        console.warn('Failed to load canonical runs for RUN selector', e);
      }
    };
    loadRuns();
  }, []);

  useEffect(() => {
    const loadS3Backtests = async () => {
      try {
        const res = await api.listBacktestRuns(120);
        const filtered = (res.runs || []).filter(
          (r) => inferBacktestStrategy(r) === 'S3'
        );
        setS3BacktestRuns(filtered);
        if (!selectedS3BacktestRunId && filtered.length > 0) {
          setSelectedS3BacktestRunId(filtered[0].run_id);
        }
      } catch (e) {
        console.warn('Failed to load S3 backtest runs', e);
      }
    };
    loadS3Backtests();
  }, []);

  useEffect(() => {
    const loadS3Comparison = async () => {
      setS3BacktestError(null);
      try {
        const [paperRun, summary] = await Promise.all([
          canonicalApi.resolveRunScope({
            strategyId: 'tf_pullback_v1',
            scope: 'TODAY',
          }),
          selectedS3BacktestRunId
            ? api.getBacktestSummary(selectedS3BacktestRunId)
            : Promise.resolve(null),
        ]);
        if (paperRun?.run_id) {
          const kpis = await canonicalApi.getKPIs(
            paperRun.run_id,
            'tf_pullback_v1'
          );
          setS3PaperKpis(kpis);
        } else {
          setS3PaperKpis(null);
        }
        setS3BacktestSummary(summary);
      } catch (e: any) {
        setS3BacktestError(e?.message || 'Impossible de charger la comparaison S3');
      }
    };
    loadS3Comparison();
  }, [selectedS3BacktestRunId]);

  const scopeOptions = useMemo(
    () => [
      { value: 'DAY', label: 'DAY', disabled: false },
      { value: 'RUN', label: 'RUN', disabled: false },
      { value: 'CAMPAIGN', label: 'CAMPAIGN', disabled: false },
      { value: 'ROLLING', label: 'ROLLING', disabled: false },
    ],
    [],
  );

  useEffect(() => {
    const effectiveKey = resolveEffectiveScopeKey();
    if (!selectedConfig || !effectiveKey) {
      setConfigDetail(null);
      return;
    }
    fetchConfigDetailV2(selectedConfig, scopeType, effectiveKey)
      .then(setConfigDetail)
      .catch(() => setConfigDetail(null));
  }, [selectedConfig, scopeKey, scopeType, status, summary, resolveEffectiveScopeKey]);

  const resolvedScopeLabel = useMemo(() => {
    if (!status?.latest) return `${scopeType}`;
    return `${scopeType} · ${status.latest.scope_key || scopeKey}`;
  }, [status, scopeType, scopeKey]);

  const abortedStatus = useMemo(() => {
    const latest = status?.latest;
    if (!latest || !latest.status?.startsWith('ABORTED')) return null;
    const reason =
      latest.source_meta?.abort_reason || latest.error_message || 'Aborted (no data)';
    return `${latest.status}: ${reason}`;
  }, [status]);

  const resolutionMeta = useMemo(() => {
    const meta = (status?.latest as any)?.source_meta || {};
    const res = meta?.resolution_meta || {};
    return {
      count: status?.resolved_run_ids_count ?? res?.resolved_run_ids_count ?? null,
      first: status?.resolved_first_run_ts ?? res?.resolved_first_run_ts ?? null,
      last: status?.resolved_last_run_ts ?? res?.resolved_last_run_ts ?? null,
      hash: status?.resolved_run_ids_hash ?? res?.resolved_run_ids_hash ?? null,
    };
  }, [status]);

  const s3BacktestTradeStats = s3BacktestSummary?.trade_stats;
  const s3WinRateDelta = useMemo(() => {
    if (
      s3PaperKpis?.win_rate == null ||
      s3BacktestTradeStats?.win_rate == null
    ) {
      return null;
    }
    return s3PaperKpis.win_rate - s3BacktestTradeStats.win_rate;
  }, [s3PaperKpis, s3BacktestTradeStats]);

  const loadData = async () => {
    if ((scopeType === 'RUN' || scopeType === 'CAMPAIGN') && !scopeKey) {
      setStatus(null);
      setSummary(null);
      setConfigs([]);
      setTotalConfigs(0);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const statusData = await fetchStatusV2(scopeType, scopeKey || undefined);
      let effectiveKey = scopeKey;
      const scopeFallback =
        statusData.latest_by_scope?.[scopeType]?.scope_key ||
        statusData.latest?.scope_key ||
        '';
      if (!effectiveKey && scopeFallback) {
        effectiveKey = scopeFallback;
        setScopeKey(scopeFallback);
      }

      setStatus(statusData);

      if (!statusData.has_data || !effectiveKey) {
        setSummary(null);
        setConfigs([]);
        setTotalConfigs(0);
        setLoading(false);
        return;
      }

      const summaryData = await fetchSummaryV2(scopeType, effectiveKey);
      setSummary(summaryData);

      const configsData = await fetchConfigsV2(
        scopeType,
        effectiveKey,
        limit,
        offset,
        sort,
        order,
      );
      setConfigs(configsData.data);
      setTotalConfigs(configsData.pagination.total);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e.message || 'Failed to load Research Desk');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeType, scopeKey, limit, offset, sort, order]);

  const stopSweepPolling = useCallback(() => {
    if (sweepPollRef.current) {
      clearTimeout(sweepPollRef.current);
      sweepPollRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      stopSweepPolling();
    };
  }, [stopSweepPolling]);

  const pollSweepJob = useCallback(
    async (jobId: string) => {
      try {
        const updated = await fetchSweepJob(jobId, 200);
        if (!mountedRef.current) return;
        setSweepJob(updated);
        if (updated.status === 'running') {
          const delay = document.visibilityState === 'visible' ? 2_000 : 6_000;
          sweepPollRef.current = window.setTimeout(() => {
            void pollSweepJob(jobId);
          }, delay);
          return;
        }
        stopSweepPolling();
        void loadData();
      } catch {
        stopSweepPolling();
      }
    },
    [loadData, stopSweepPolling],
  );

  const startSweep = async () => {
    let effectiveKey = scopeKey;
    if (!effectiveKey && scopeType === 'RUN' && runId) {
      effectiveKey = runId;
      setScopeKey(runId);
    }
    if (!effectiveKey) {
      setError('scope_key requis pour lancer un sweep');
      return;
    }
    try {
      const job = await runSweepJob(scopeType, effectiveKey);
      setSweepJob(job);
      stopSweepPolling();
      if (job.status === 'running') {
        sweepPollRef.current = window.setTimeout(() => {
          void pollSweepJob(job.job_id);
        }, 2_000);
      } else {
        void loadData();
      }
    } catch (e: any) {
      setError(e.message || 'Impossible de lancer le sweep');
    }
  };

  const handleScopeChange = (value: ScopeType) => {
    setScopeType(value);
    if (value === 'RUN') {
      setScopeKey(availableScopes.RUN[0] || '');
    } else if (value === 'CAMPAIGN') {
      setScopeKey(availableScopes.CAMPAIGN[0] || '');
    } else if (value === 'ROLLING') {
      setScopeKey(availableScopes.ROLLING[0] || ROLLING_PRESETS[0] || '');
    } else {
      setScopeKey('');
    }
    setOffset(0);
    setSelectedConfig(null);
  };

  const handleDateChange = (value: string) => {
    setScopeKey(value);
    setOffset(0);
    setSelectedConfig(null);
  };

  const handleSortChange = (col: typeof ORDERABLE_COLUMNS[number]) => {
    if (sort === col) {
      setOrder(order === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(col);
      setOrder('desc');
    }
    setOffset(0);
  };

  const handleDownloadTopConfigs = async () => {
    if (!summary || !summary.top?.length) return;
    const effectiveKey = resolveEffectiveScopeKey();
    if (!effectiveKey) return;
    setDownloadingTop(true);
    try {
      const topRows = summary.top.slice(0, 10);
      const details = await Promise.all(
        topRows.map(async (row: ConfigRow) => {
          try {
            const detail = await fetchConfigDetailV2(row.config_id, scopeType, effectiveKey);
            const params = detail.series.find((s) => s.params)?.params || null;
            return {
              ...row,
              params,
              baseline_params: detail.baseline_params ?? null,
              as_of: detail.series[0]?.as_of_date ?? null,
              created_at: detail.series[0]?.created_at ?? null,
            };
          } catch (e: any) {
            return { ...row, params: null, error: e?.message || 'detail fetch failed' };
          }
        }),
      );
      const payload = {
        scope_type: scopeType,
        scope_key: effectiveKey,
        generated_at: new Date().toISOString(),
        top: details,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sweep_top10_${scopeType}_${effectiveKey || 'latest'}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingTop(false);
    }
  };

  const canPrev = offset > 0;
  const canNext = offset + limit < totalConfigs;
  const noKeysForScope =
    (scopeType === 'RUN' && availableScopes.RUN.length === 0) ||
    (scopeType === 'CAMPAIGN' && availableScopes.CAMPAIGN.length === 0) ||
    (scopeType === 'ROLLING' && availableScopes.ROLLING.length === 0);
  const isSweepRunningForSelection =
    sweepJob &&
    sweepJob.status === 'running' &&
    sweepJob.scope_type === scopeType &&
    sweepJob.scope_key === scopeKey;

  const renderSweepLaunch = (message: string) => (
    <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm text-cyan-50 space-y-3">
      <div className="font-semibold">{message}</div>
      <div className="text-[11px] text-cyan-100/80">
        Scope: {scopeType} ·{' '}
        {scopeKey ||
          (scopeType === 'RUN' && runId ? `active ${runId.slice(0, 8)}` : 'clé requise')}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={startSweep}
          disabled={(!scopeKey && !(scopeType === 'RUN' && runId)) || isSweepRunningForSelection || false}
          className={
            "rounded-lg border border-cyan-400/50 bg-cyan-500/10 px-3 py-1 " +
            "text-xs uppercase tracking-[0.14em] text-cyan-100 hover:bg-cyan-500/20 " +
            "disabled:opacity-50"
          }
        >
          {isSweepRunningForSelection ? 'Sweep running…' : 'Run sweep'}
        </button>
        <div className="text-[11px] text-neutral-300">
          Launch a new sweep for this scope (previous results are preserved).
        </div>
        {!scopeKey && !(scopeType === 'RUN' && runId) && (
          <span className="text-[11px] text-amber-200">
            Fournis une clé (date ou run_id) pour démarrer.
          </span>
        )}
      </div>
    </div>
  );

  const renderScopeKeyInput = () => {
    if (scopeType === 'DAY') {
      return (
        <input
          type="date"
          value={scopeKey}
          onChange={(e) => handleDateChange(e.target.value)}
          className="bg-neutral-900 border border-white/10 rounded-lg px-3 py-1 text-xs text-white"
        />
      );
    }
    if (scopeType === 'RUN') {
      const keys = Array.from(new Set([...(availableScopes.RUN || []), ...runCandidates]));
      return (
        <select
          value={scopeKey}
          onChange={(e) => setScopeKey(e.target.value)}
          className="bg-neutral-900 border border-white/10 rounded-lg px-3 py-1 text-xs text-white w-52"
          disabled={keys.length === 0}
        >
          <option value="">
            {keys.length === 0 ? 'No RUN sweeps yet' : 'Select run_id'}
          </option>
          {keys.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      );
    }
    if (scopeType === 'ROLLING') {
      const keys = availableScopes.ROLLING?.length ? availableScopes.ROLLING : ROLLING_PRESETS;
      return (
        <select
          value={scopeKey}
          onChange={(e) => setScopeKey(e.target.value)}
          className="bg-neutral-900 border border-white/10 rounded-lg px-3 py-1 text-xs text-white w-52"
        >
          {keys.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      );
    }
    const keys = availableScopes.CAMPAIGN;
    return (
      <select
        value={scopeKey}
        onChange={(e) => setScopeKey(e.target.value)}
        className="bg-neutral-900 border border-white/10 rounded-lg px-3 py-1 text-xs text-white w-52"
      >
        <option value="">{keys.length ? 'Select campaign_id' : 'No campaigns yet'}</option>
        {keys.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
    );
  };

  const header = (
    <div className={`${researchGlass} flex flex-wrap items-center justify-between gap-4`}>
      <div>
        <h2 className="text-lg font-semibold text-white">Research Desk</h2>
        <p className="text-xs text-neutral-400">{resolvedScopeLabel}</p>
        {abortedStatus && (
          <p className="text-[11px] text-amber-400 mt-1">
            {abortedStatus}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="flex items-center gap-2">
          <select
            value={scopeType}
            onChange={(e) => handleScopeChange(e.target.value as ScopeType)}
            className="bg-neutral-900 border border-white/10 rounded-lg px-3 py-1 text-xs text-white"
          >
            {scopeOptions.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
          </select>
          {renderScopeKeyInput()}
        </div>
        <span className="text-xs text-neutral-400">
          Last refresh {formatTime(lastRefresh, "UTC")} UTC
        </span>
        <button
          onClick={loadData}
          className={
            "rounded-full border border-cyan-400/40 bg-cyan-500/10 px-4 py-1 " +
            "text-xs uppercase tracking-[0.2em] text-cyan-100 transition"
          }
        >
          Refresh
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {header}
        <div className="flex items-center justify-center h-64 text-neutral-400">
          Loading Research Desk...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        {header}
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <div className="text-red-400 font-medium mb-2">Failed to load data</div>
          <div className="text-xs text-neutral-400">{error}</div>
          <button
            onClick={loadData}
            className="mt-4 px-4 py-2 bg-neutral-700 hover:bg-neutral-600 rounded-lg text-sm transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="space-y-4">
        {header}
        <div className="rounded-xl border border-neutral-700 bg-neutral-900/60 p-6 text-center">
          <div className="text-neutral-200 font-medium mb-2">Select a scope to load sweeps</div>
          <div className="text-xs text-neutral-500">Use the scope selector above.</div>
        </div>
        {renderSweepLaunch('Pas encore de données pour ce scope. Lance un sweep.')}
        {sweepJob && <SweepJobPanel job={sweepJob} />}
      </div>
    );
  }

  if (!status.available) {
    return (
      <div className="space-y-4">
        {header}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-center">
          <div className="text-amber-400 font-medium mb-2">No sweep data available</div>
          <div className="text-sm text-neutral-400 mb-4">
            {status?.path || 'Missing sweep_history.sqlite'}
          </div>
        </div>
        {renderSweepLaunch('Initialise un sweep pour ce scope.')}
        {sweepJob && <SweepJobPanel job={sweepJob} />}
      </div>
    );
  }

  const hasData = status.has_data;

  return (
    <div className="space-y-6">
      {header}
      {renderSweepLaunch('Lancer un sweep sur ce scope.')}

      <div className={`${researchGlass} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-neutral-400 uppercase tracking-[0.2em]">
              S3 Backtest View
            </div>
            <div className="text-sm text-neutral-200">
              Comparatif paper vs backtest (tf_pullback_v1)
            </div>
          </div>
          <select
            value={selectedS3BacktestRunId}
            onChange={(e) => setSelectedS3BacktestRunId(e.target.value)}
            className="bg-neutral-900 border border-white/10 rounded-lg px-3 py-1 text-xs text-white min-w-[280px]"
          >
            <option value="">
              {s3BacktestRuns.length === 0
                ? 'Aucun run backtest S3'
                : 'Selectionner un run backtest S3'}
            </option>
            {s3BacktestRuns.map((r) => (
              <option key={r.run_id} value={r.run_id}>
                {r.run_id} ({r.mode})
              </option>
            ))}
          </select>
        </div>

        {s3BacktestError && (
          <div className="text-xs text-amber-200">{s3BacktestError}</div>
        )}

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Paper trades (TODAY)"
            value={s3PaperKpis?.trades_count ?? 'n/a'}
            sub="source: canonical_trades"
          />
          <StatCard
            label="Paper win rate"
            value={fmtSigned(
              s3PaperKpis?.win_rate != null ? s3PaperKpis.win_rate * 100 : null,
              1,
              '%'
            )}
          />
          <StatCard
            label="Backtest trades"
            value={s3BacktestTradeStats?.count ?? s3BacktestSummary?.n_trades ?? 'n/a'}
            sub={selectedS3BacktestRunId ? `run ${selectedS3BacktestRunId.slice(0, 8)}` : undefined}
          />
          <StatCard
            label="Backtest win rate"
            value={fmtSigned(
              s3BacktestTradeStats?.win_rate != null
                ? s3BacktestTradeStats.win_rate * 100
                : null,
              1,
              '%'
            )}
            sub={
              s3WinRateDelta != null
                ? `paper-backtest: ${fmtSigned(s3WinRateDelta * 100, 1, '%')}`
                : undefined
            }
          />
        </div>
      </div>

      {noKeysForScope && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          No sweeps available for this scope yet.
        </div>
      )}

      {!hasData && !noKeysForScope && (
        <div className="space-y-3">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            No sweep data for this scope/key yet. Select another key or run a sweep.
          </div>
          {sweepJob && <SweepJobPanel job={sweepJob} />}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className={researchGlass}>
          <div className="text-xs text-neutral-400 uppercase tracking-[0.2em] mb-2">Status</div>
          <div className="space-y-2 text-sm text-neutral-200">
            <div>Latest run: {status.latest_sweep_run_id}</div>
            <div>As of: {status.latest?.as_of_date}</div>
            <div>Shocks: {status.shocks_total ?? '-'}</div>
            <div>
              Signals: {status.signals_total_after_exclusions ?? '-'}
              {status.signals_excluded_missing_run_id != null && (
                <span className="text-[11px] text-neutral-400">
                  {' '}
                  (excluded {status.signals_excluded_missing_run_id})
                </span>
              )}
            </div>
            <div>Resolved runs: {resolutionMeta.count ?? '-'}</div>
            {resolutionMeta.first && (
              <div className="text-xs text-neutral-400">
                Runs window: {formatTs(resolutionMeta.first)} → {formatTs(resolutionMeta.last || resolutionMeta.first)}
              </div>
            )}
            {resolutionMeta.hash && (
              <div className="text-[11px] text-neutral-500 break-all">
                run_ids_hash: {resolutionMeta.hash}
              </div>
            )}
          </div>
        </div>

        {hasData && summary && (
          <div className={researchGlass}>
            <div className="text-xs text-neutral-400 uppercase tracking-[0.2em] mb-2">
              Percentiles
            </div>
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="P25" value={summary.stats.p25 ?? '-'} />
              <StatCard label="P50" value={summary.stats.p50 ?? '-'} />
              <StatCard label="P75" value={summary.stats.p75 ?? '-'} />
            </div>
          </div>
        )}

        {hasData && (
          <div className={researchGlass}>
            <div className="text-xs text-neutral-400 uppercase tracking-[0.2em] mb-2">
              Pagination
            </div>
            <div className="flex items-center gap-3 text-sm text-neutral-200">
              <button
                onClick={() => canPrev && setOffset(Math.max(0, offset - limit))}
                disabled={!canPrev}
                className={cn(
                  'px-3 py-1 rounded-lg border border-white/10',
                  !canPrev && 'opacity-50 cursor-not-allowed',
                )}
              >
                Prev
              </button>
              <div>
                {offset + 1} - {Math.min(offset + limit, totalConfigs)} / {totalConfigs}
              </div>
              <button
                onClick={() => canNext && setOffset(offset + limit)}
                disabled={!canNext}
                className={cn(
                  'px-3 py-1 rounded-lg border border-white/10',
                  !canNext && 'opacity-50 cursor-not-allowed',
                )}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {sweepJob && hasData && <SweepJobPanel job={sweepJob} />}
      </div>

      {hasData && (
        <>
          <div className={`${researchGlass} space-y-4`}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-neutral-200">Configs</div>
              <div className="text-xs text-neutral-400">
                Sort: {sort} · {order}
              </div>
            </div>
            <ConfigTable
              configs={configs}
              sort={sort}
              order={order}
              onSortChange={handleSortChange}
              onSelect={setSelectedConfig}
              selected={selectedConfig}
            />
          </div>

          {summary && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className={researchGlass}>
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-medium text-neutral-200">Top Configs</div>
                  <button
                    onClick={handleDownloadTopConfigs}
                    disabled={downloadingTop}
                    className={cn(
                      "rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-neutral-100 hover:border-cyan-400/40",
                      downloadingTop && "opacity-50 cursor-not-allowed",
                    )}
                  >
                    {downloadingTop ? 'Preparing…' : 'Download top10 JSON'}
                  </button>
                </div>
                <div className="space-y-2">
                  {summary.top.map((c: ConfigRow) => (
                    <button
                      key={`top-${c.config_id}`}
                      onClick={() => setSelectedConfig(c.config_id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-sm transition-colors",
                        "hover:bg-white/5",
                        selectedConfig === c.config_id && "bg-white/10",
                      )}
                    >
                      <span className="font-mono text-xs text-neutral-200">{c.config_id}</span>
                      <span className={cn(c.pnl_net_day >= 0 ? 'text-green-400' : 'text-red-400')}>
                        {c.pnl_net_day.toFixed(2)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className={researchGlass}>
                <div className="text-sm font-medium text-neutral-200 mb-2">Bottom Configs</div>
                <div className="space-y-2">
                  {summary.bottom.map((c: ConfigRow) => (
                    <button
                      key={`bottom-${c.config_id}`}
                      onClick={() => setSelectedConfig(c.config_id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-sm transition-colors",
                        "hover:bg-white/5",
                        selectedConfig === c.config_id && "bg-white/10",
                      )}
                    >
                      <span className="font-mono text-xs text-neutral-200">{c.config_id}</span>
                      <span className={cn(c.pnl_net_day >= 0 ? 'text-green-400' : 'text-red-400')}>
                        {c.pnl_net_day.toFixed(2)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <ConfigDetail
            detail={configDetail}
            baselineFallback={
              summary?.baseline_params ??
              status?.baseline_params ??
              status?.latest_by_scope?.[scopeType]?.params ??
              status?.latest?.params ??
              summary?.run?.params ??
              null
            }
            onClose={() => setSelectedConfig(null)}
          />
        </>
      )}
    </div>
  );
}

function SweepJobPanel({ job }: { job: SweepJobStatus }) {
  const tone =
    job.status === 'running'
      ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-100'
      : job.status === 'success'
        ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100'
        : 'border-red-400/40 bg-red-500/10 text-red-100';
  return (
    <div className={`rounded-xl border ${tone} p-3 space-y-2`}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold">Live Job: {job.job_id}</span>
        <span className="uppercase tracking-[0.16em]">{job.status}</span>
      </div>
      <div className="text-[11px] text-neutral-300">
        Scope: {job.scope_type} · {job.scope_key} {job.as_of ? `(as of ${job.as_of})` : ''}
      </div>
      <div className="text-[11px] text-neutral-200">
        {job.started_at} {job.ended_at ? `→ ${job.ended_at}` : ''}
        {job.exit_code !== undefined && job.exit_code !== null && ` · exit ${job.exit_code}`}
      </div>
      {job.error && <div className="text-[11px] text-amber-200">Error: {job.error}</div>}
      {job.status === 'running' && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/3 animate-[pulse_1.4s_ease-in-out_infinite] bg-cyan-300/70" />
        </div>
      )}
      {job.logs && job.logs.length > 0 && (
        <div
          className={
            "max-h-56 overflow-y-auto rounded-lg border border-white/10 " +
            "bg-black/40 p-2 text-[11px] font-mono text-neutral-100"
          }
        >
          {job.logs.map((line, idx) => (
            <div key={idx} className="whitespace-pre-wrap">{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ResearchDesk;
