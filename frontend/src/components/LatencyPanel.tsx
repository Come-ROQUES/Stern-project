import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type MarketMetrics,
  type Signal,
  type SystemStatus,
} from "../lib/api";
import {
  type ActiveContext,
  type DataScope,
  activeContext,
  defaultScope,
  deriveContextForScope,
} from "../lib/activeContext";
import { useRunId } from "../lib/useRunContext";
import { formatDateTimeUTC, formatTime } from "../lib/dateUtils";
import { GlassBadge, GlassCard, GlassKPI, GlassPanel } from "./ui/glass";
import { ScopeSelector } from "./ui/ScopeSelector";
import { getExtremeState, getSignalModeLabel } from "../lib/signalMode";
import { useDashboardPoll } from "../lib/dashboardPollingBus";
import { ApexChart } from "../lib/ApexChart";

type LatencyPoint = { x: number; y: number };

const LATENCY_LOG_REGEX =
  /latency|bar_latency|tick_age|stale|market_data|queue|loop_lag/i;

function toMs(input: unknown): number | null {
  if (!input) return null;
  const ts = new Date(input as string | number | Date).getTime();
  return Number.isNaN(ts) ? null : ts;
}

function formatNumber(
  value: number | null | undefined,
  unit?: string,
  digits = 2
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const base = value.toFixed(digits);
  return unit ? `${base} ${unit}` : base;
}

function formatMs(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  return `${Math.round(value)} ms`;
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx] ?? null;
}

function readMetaNumber(
  meta: Record<string, unknown> | null,
  key: string
): number | null {
  const value = meta?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readMetaString(
  meta: Record<string, unknown> | null,
  key: string
): string | null {
  const value = meta?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function buildLatencySeries(metrics: MarketMetrics | null): LatencyPoint[] {
  const raw = ((metrics?.latency_series as any[]) || (metrics?.time_heatmap as any[]) || []) as any[];
  return raw
    .map((b) => {
      const ts = b.timestamp || b.t || b.timestamp_utc || Date.now();
      const y = Number(b.latency_ms ?? b.latency ?? b.avg_latency_ms ?? 0);
      return { x: new Date(ts).getTime(), y };
    })
    .filter((p) => Number.isFinite(p.y))
    .slice(-120);
}

function computeDeltaMs(start: unknown, end: unknown): number | null {
  const startMs = toMs(start);
  const endMs = toMs(end);
  if (startMs == null || endMs == null) return null;
  return endMs - startMs;
}

export function LatencyPanel() {
  const runId = useRunId();
  const [dataScope, setDataScope] = useState<DataScope>(defaultScope);
  const scopedContext: ActiveContext = useMemo(() => {
    const ctx = deriveContextForScope(activeContext, dataScope);
    return runId ? { ...ctx, run_id: runId } : ctx;
  }, [dataScope, runId]);

  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [metrics, setMetrics] = useState<MarketMetrics | null>(null);
  const [ohlcState, setOhlcState] = useState<string | null>(null);
  const [ohlcMeta, setOhlcMeta] = useState<Record<string, unknown> | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const isVisibleRef = useRef(true);
  useEffect(() => {
    const onVisibility = () => {
      isVisibleRef.current = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const load = useCallback(async () => {
    if (!isVisibleRef.current) return;
    try {
      setLoading(true);
      const snapshot = await api.getTerminalSnapshot(scopedContext, dataScope, {
        sections: ["system", "market_metrics", "ohlc", "signals", "logs"],
        signalsMode: "lite",
      });
      setSystem(snapshot.system ?? null);
      setMetrics(snapshot.market_metrics ?? null);
      setOhlcState(snapshot.ohlc?.state ?? null);
      setOhlcMeta((snapshot.ohlc?.meta as Record<string, unknown> | undefined) ?? null);
      setSignals(snapshot.signals ?? []);
      setLogs(snapshot.logs?.lines ?? []);
      setError(null);
      setLastUpdated(Date.now());
    } catch (err: any) {
      setError(err?.message || "Failed to load latency data");
    } finally {
      setLoading(false);
    }
  }, [dataScope, scopedContext]);

  useDashboardPoll("analytics", load, {
    enabled: true,
    immediate: true,
    intervalMs: 45_000,
  });

  const latencySeries = useMemo(() => buildLatencySeries(metrics), [metrics]);
  const latencyValues = useMemo(
    () => latencySeries.map((p) => p.y).filter((v) => Number.isFinite(v)),
    [latencySeries]
  );
  const latencyP50 = useMemo(() => percentile(latencyValues, 0.5), [latencyValues]);
  const latencyP95 = useMemo(() => percentile(latencyValues, 0.95), [latencyValues]);
  const latencyMax = useMemo(
    () => (latencyValues.length ? Math.max(...latencyValues) : null),
    [latencyValues]
  );

  const lastSignal = signals[0] ?? null;
  const tickAgeSec = useMemo(() => {
    if (system?.tick_age_seconds != null) return system.tick_age_seconds;
    if (system?.last_tick_time) {
      const ts = toMs(system.last_tick_time);
      return ts == null ? null : (Date.now() - ts) / 1000;
    }
    const fallbackTickAge = readMetaNumber(ohlcMeta, "tick_age");
    if (fallbackTickAge != null) return fallbackTickAge;
    return null;
  }, [system, ohlcMeta]);
  const barAgeSec = readMetaNumber(ohlcMeta, "bar_age");
  const barEndAgeSec = readMetaNumber(ohlcMeta, "bar_end_age");
  const latencyMs = system?.latency_ms ?? null;
  const gatewayConnected = system?.gateway_connected ?? system?.health?.gateway_connected ?? null;
  const dataFresh = system?.data_fresh ?? system?.health?.data_fresh ?? null;
  const marketOpen = system?.market_open ?? null;
  const dataSourceLabel = (system as any)?.data_source_label ?? null;

  const pipeline = useMemo(() => {
    if (!lastSignal) return null;
    return {
      decisionMs: computeDeltaMs(lastSignal.router_dispatch_ts, lastSignal.decision_ts),
      gateMs: computeDeltaMs(lastSignal.gate_eval_start_ts, lastSignal.gate_eval_end_ts),
      shockToDecisionMs: computeDeltaMs(
        lastSignal.shock_detect_ts ?? lastSignal.shock_detect_bar_ts,
        lastSignal.decision_ts
      ),
      dispatchToGateMs: computeDeltaMs(
        lastSignal.router_dispatch_ts,
        lastSignal.gate_eval_start_ts
      ),
    };
  }, [lastSignal]);

  const filteredLogs = useMemo(
    () => logs.filter((line) => LATENCY_LOG_REGEX.test(line)).slice(0, 120),
    [logs]
  );

  const signalRows = useMemo(() => signals.slice(0, 25), [signals]);
  const lastSignalMode = useMemo(
    () => (lastSignal ? getSignalModeLabel(lastSignal) : "—"),
    [lastSignal]
  );
  const lastSignalExtremeState = useMemo(
    () => (lastSignal ? getExtremeState(lastSignal) : null),
    [lastSignal]
  );

  const readinessBadges: {
    label: string;
    variant: "success" | "danger" | "warning" | "info" | "muted";
  }[] = [
    {
      label:
        gatewayConnected == null
          ? "Gateway ?"
          : gatewayConnected
            ? "Gateway OK"
            : "Gateway down",
      variant: gatewayConnected == null ? "muted" : gatewayConnected ? "success" : "danger",
    },
    {
      label: dataFresh == null ? "Data ?" : dataFresh ? "Data fresh" : "Data stale",
      variant: dataFresh == null ? "muted" : dataFresh ? "success" : "warning",
    },
    {
      label: marketOpen == null ? "Market ?" : marketOpen ? "Market open" : "Market closed",
      variant: marketOpen == null ? "muted" : marketOpen ? "info" : "muted",
    },
    {
      label: ohlcState ? `OHLC ${ohlcState}` : "OHLC n/a",
      variant: ohlcState === "LIVE" ? "success" : ohlcState === "DEGRADED" ? "warning" : "muted",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-neutral-300">
          <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-cyan-100">
            Latency Desk
          </span>
          <ScopeSelector scope={dataScope} onChange={setDataScope} />
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-[3px]">
            Run {runId ? runId.slice(0, 8) : "—"}
          </span>
          {dataSourceLabel && (
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-[3px]">
              Source {dataSourceLabel}
            </span>
          )}
        </div>
        <div className="text-[11px] text-neutral-400">
          Updated {lastUpdated ? formatTime(lastUpdated, "UTC") : "--:--:--"} UTC
        </div>
      </div>

      {error && (
        <GlassCard variant="danger">
          <div className="text-xs text-red-200">{error}</div>
        </GlassCard>
      )}

      <div className="grid gap-3 lg:grid-cols-12">
        <GlassPanel
          className="lg:col-span-8"
          title="Snapshot latency"
          subtitle="Tick/bar freshness, gateway and data state"
        >
          <div className="flex flex-wrap gap-2 mb-4">
            {readinessBadges.map((b) => (
              <GlassBadge key={b.label} variant={b.variant} size="sm" pulse>
                {b.label}
              </GlassBadge>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <GlassKPI
              label="Latency API"
              value={formatMs(latencyMs)}
              variant={latencyMs != null && latencyMs > 1000 ? "danger" : latencyMs != null && latencyMs > 400 ? "warning" : "info"}
            />
            <GlassKPI
              label="Tick age"
              value={formatNumber(tickAgeSec, "s")}
              variant={tickAgeSec != null && tickAgeSec > 2 ? "warning" : "default"}
            />
            <GlassKPI
              label="Bar age"
              value={formatNumber(barAgeSec, "s")}
              variant={barAgeSec != null && barAgeSec > 4 ? "warning" : "default"}
            />
            <GlassKPI
              label="Bar end age"
              value={formatNumber(barEndAgeSec, "s")}
              variant={barEndAgeSec != null && barEndAgeSec > 4 ? "warning" : "default"}
            />
            <GlassKPI
              label="Last tick"
              value={system?.last_tick_time ? formatDateTimeUTC(system.last_tick_time) : "—"}
              size="sm"
            />
            <GlassKPI
              label="Last log"
              value={system?.last_log_time ? formatDateTimeUTC(system.last_log_time) : "—"}
              size="sm"
            />
            <GlassKPI
              label="Ohlc data"
              value={readMetaString(ohlcMeta, "data_origin") ?? "—"}
              size="sm"
            />
            <GlassKPI
              label="Ohlc run"
              value={readMetaString(ohlcMeta, "run_id")?.slice(0, 8) ?? "—"}
              size="sm"
            />
          </div>
        </GlassPanel>

        <GlassPanel className="lg:col-span-4" title="Latest signal timing">
          {lastSignal ? (
            <div className="space-y-3 text-xs text-neutral-200">
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">Signal</span>
                <span className="font-mono">
                  {lastSignal.signal_id ? lastSignal.signal_id.slice(0, 8) : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">Decision</span>
                <span>{formatDateTimeUTC(lastSignal.decision_ts ?? lastSignal.timestamp)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">Stage</span>
                <span>{lastSignal.decision_stage ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">Reason</span>
                <span>{lastSignal.rejection_reason ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-400">Mode</span>
                <span>
                  {lastSignalMode}
                  {lastSignalExtremeState ? ` (${lastSignalExtremeState})` : ""}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-2">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Tick age</div>
                  <div className="font-semibold">{formatNumber(lastSignal.tick_age_at_decision_sec, "s")}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-2">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Bar end age</div>
                  <div className="font-semibold">{formatNumber(lastSignal.bar_end_age_at_decision_sec, "s")}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-2">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Spread decision</div>
                  <div className="font-semibold">{formatNumber(lastSignal.spread_pips_at_decision, "p")}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-2">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Spread submit</div>
                  <div className="font-semibold">{formatNumber(lastSignal.spread_pips_at_submit, "p")}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-2">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Burst</div>
                  <div className="font-semibold">
                    {lastSignal.burst_bars_count != null ? `${lastSignal.burst_bars_count}` : "—"}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-2">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Burst window</div>
                  <div className="font-semibold">{formatNumber(lastSignal.burst_bars_window_s, "s")}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-neutral-500">No signal data available.</div>
          )}
        </GlassPanel>
      </div>

      <div className="grid gap-3 lg:grid-cols-12">
        <GlassPanel
          className="lg:col-span-7"
          title="Latency series"
          subtitle="Last 120 samples from market metrics"
        >
          {latencySeries.length === 0 ? (
            <div className="text-xs text-neutral-500">No latency series available.</div>
          ) : (
            <ApexChart
              type="line"
              height={220}
              options={{
                chart: { animations: { enabled: false }, toolbar: { show: false } },
                stroke: { width: 2, curve: "smooth" },
                colors: ["#FF4D4D"],
                xaxis: { type: "datetime", labels: { style: { colors: "#94a3b8" } } },
                yaxis: { labels: { style: { colors: "#94a3b8" } } },
                tooltip: { theme: "dark" },
                grid: { borderColor: "rgba(255,255,255,0.08)" },
              }}
              series={[{ name: "Latency", data: latencySeries }]}
            />
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-3 text-xs text-neutral-300">
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">P50</div>
              <div className="text-sm font-semibold text-white">{formatMs(latencyP50)}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">P95</div>
              <div className="text-sm font-semibold text-white">{formatMs(latencyP95)}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Max</div>
              <div className="text-sm font-semibold text-white">{formatMs(latencyMax)}</div>
            </div>
          </div>
        </GlassPanel>

        <GlassPanel
          className="lg:col-span-5"
          title="Pipeline timing"
          subtitle="Dispatch → gate → decision"
        >
          {lastSignal ? (
            <div className="space-y-3 text-xs text-neutral-300">
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <span>Dispatch → Gate start</span>
                  <span className="font-mono">{formatMs(pipeline?.dispatchToGateMs ?? null)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Gate eval</span>
                  <span className="font-mono">{formatMs(pipeline?.gateMs ?? null)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Dispatch → Decision</span>
                  <span className="font-mono">{formatMs(pipeline?.decisionMs ?? null)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Shock → Decision</span>
                  <span className="font-mono">{formatMs(pipeline?.shockToDecisionMs ?? null)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Reflex elapsed (event)</span>
                  <span className="font-mono">{formatMs(lastSignal.reflex_elapsed_event_ms ?? null)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Reflex elapsed (wall)</span>
                  <span className="font-mono">{formatMs(lastSignal.reflex_elapsed_wall_ms ?? null)}</span>
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-neutral-400">
                <div>Dispatch: {formatDateTimeUTC(lastSignal.router_dispatch_ts)}</div>
                <div>Gate start: {formatDateTimeUTC(lastSignal.gate_eval_start_ts)}</div>
                <div>Gate end: {formatDateTimeUTC(lastSignal.gate_eval_end_ts)}</div>
                <div>Decision: {formatDateTimeUTC(lastSignal.decision_ts)}</div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-neutral-500">No pipeline data available.</div>
          )}
        </GlassPanel>
      </div>

      <GlassPanel
        title="Signals (latency gates)"
        subtitle="Latest signals with tick/bar age, spread and burst diagnostics"
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs text-neutral-300">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">
                <th className="text-left px-2 py-2">Time</th>
                <th className="text-left px-2 py-2">Dir</th>
                <th className="text-left px-2 py-2">Stage</th>
                <th className="text-left px-2 py-2">Reason</th>
                <th className="text-left px-2 py-2">Mode</th>
                <th className="text-right px-2 py-2">Tick s</th>
                <th className="text-right px-2 py-2">Bar end s</th>
                <th className="text-right px-2 py-2">Spread dec</th>
                <th className="text-right px-2 py-2">Spread sub</th>
                <th className="text-right px-2 py-2">Burst</th>
                <th className="text-right px-2 py-2">Pipeline</th>
              </tr>
            </thead>
            <tbody>
              {signalRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-2 py-4 text-center text-neutral-500">
                    No signals available.
                  </td>
                </tr>
              ) : (
                signalRows.map((s) => {
                  const pipelineMs = computeDeltaMs(s.router_dispatch_ts, s.decision_ts);
                  const signalMode = getSignalModeLabel(s);
                  const extremeState = getExtremeState(s);
                  return (
                    <tr key={`${s.timestamp}-${s.signal_id ?? "n/a"}`} className="border-t border-white/5">
                      <td className="px-2 py-2 font-mono">
                        {formatTime(s.timestamp, "UTC")}
                      </td>
                      <td className="px-2 py-2">{s.direction}</td>
                      <td className="px-2 py-2">{s.decision_stage ?? "—"}</td>
                      <td className="px-2 py-2">{s.rejection_reason ?? "—"}</td>
                      <td className="px-2 py-2">
                        {signalMode}
                        {extremeState ? ` (${extremeState})` : ""}
                      </td>
                      <td className="px-2 py-2 text-right font-mono">
                        {formatNumber(s.tick_age_at_decision_sec, "s")}
                      </td>
                      <td className="px-2 py-2 text-right font-mono">
                        {formatNumber(s.bar_end_age_at_decision_sec, "s")}
                      </td>
                      <td className="px-2 py-2 text-right font-mono">
                        {formatNumber(s.spread_pips_at_decision, "p")}
                      </td>
                      <td className="px-2 py-2 text-right font-mono">
                        {formatNumber(s.spread_pips_at_submit, "p")}
                      </td>
                      <td className="px-2 py-2 text-right font-mono">
                        {s.burst_bars_count != null
                          ? `${s.burst_bars_count} / ${formatNumber(s.burst_bars_window_s, "s", 1)}`
                          : "—"}
                      </td>
                      <td className="px-2 py-2 text-right font-mono">
                        {formatMs(pipelineMs ?? null)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </GlassPanel>

      <GlassPanel title="Latency logs" subtitle="Filtered logs (latency, bar, stale)">
        {filteredLogs.length === 0 ? (
          <div className="text-xs text-neutral-500">No matching log lines.</div>
        ) : (
          <div className="space-y-1 font-mono text-[11px] text-neutral-300">
            {filteredLogs.map((line, idx) => (
              <div key={`${idx}-${line.slice(0, 12)}`} className="border-b border-white/5 pb-1">
                {line}
              </div>
            ))}
          </div>
        )}
      </GlassPanel>

      {loading && (
        <GlassCard variant="inset">
          <div className="text-xs text-neutral-400">Loading latency data...</div>
        </GlassCard>
      )}
    </div>
  );
}
