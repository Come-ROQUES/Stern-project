import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  DwSummary,
  Health,
  S2Summary,
  SystemStatus,
  UiStatus,
  VmStatusResponse,
} from "../lib/api";
import { activeContext } from "../lib/activeContext";
import { formatTime } from "../lib/dateUtils";
import { useRunId, useRunMeta } from "../lib/useRunContext";
import { useBundleRuns } from "../lib/useBundleRuns";
import { GlassBadge, GlassCard, GlassPanel, Skeleton } from "./ui/glass";

const VM_LABEL = import.meta.env.VITE_VM_LABEL ?? "A1 (ARM64)";

function formatNumber(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return value.toFixed(digits);
}

function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(digits)}%`;
}

function metricVariant(
  value: number | null | undefined,
  warningAt: number,
  dangerAt: number
): "success" | "warning" | "danger" | "muted" {
  if (value == null || !Number.isFinite(value)) return "muted";
  if (value >= dangerAt) return "danger";
  if (value >= warningAt) return "warning";
  return "success";
}

function vmServiceVariant(
  state: string | null | undefined
): "success" | "warning" | "danger" | "muted" {
  if (state === "active") return "success";
  if (state === "failed") return "danger";
  if (state === "inactive") return "warning";
  return "muted";
}

function vmServiceLabel(state: string | null | undefined): string {
  if (state === "active") return "RUNNING";
  if (state === "inactive") return "DOWN";
  if (state === "failed") return "FAILED";
  if (state === "unsupported") return "UNSUPPORTED";
  return "UNKNOWN";
}

function formatUsage(used: number | null | undefined, total: number | null | undefined): string {
  if (used == null || total == null) return "n/a";
  return `${used} / ${total} MB`;
}

function statusVariant(ok: boolean | null | undefined):
  | "success"
  | "warning"
  | "danger"
  | "muted" {
  if (ok === true) return "success";
  if (ok === false) return "danger";
  return "muted";
}

function relayState(lastIngest: string | null): {
  label: string;
  variant: "success" | "warning" | "danger" | "muted";
} {
  if (!lastIngest) {
    return { label: "UNKNOWN", variant: "muted" };
  }
  const ts = new Date(lastIngest).getTime();
  if (!Number.isFinite(ts)) {
    return { label: "UNKNOWN", variant: "muted" };
  }
  const ageSec = (Date.now() - ts) / 1000;
  if (ageSec <= 90) return { label: "OK", variant: "success" };
  if (ageSec <= 300) return { label: "STALE", variant: "warning" };
  return { label: "DOWN", variant: "danger" };
}

function ageSeconds(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const parsed = new Date(ts).getTime();
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, (Date.now() - parsed) / 1000);
}

function ageState(
  ts: string | null | undefined,
  okSec: number,
  warnSec: number
): { label: string; variant: "success" | "warning" | "danger" | "muted" } {
  const age = ageSeconds(ts);
  if (age == null) return { label: "UNKNOWN", variant: "muted" };
  if (age <= okSec) return { label: `${Math.round(age)}s`, variant: "success" };
  if (age <= warnSec) return { label: `${Math.round(age)}s`, variant: "warning" };
  return { label: `${Math.round(age)}s`, variant: "danger" };
}

export function VMStatusDesk() {
  const runId = useRunId();
  const { run } = useRunMeta();
  const { enabled: bundleEnabled, s2RunId, tfRunId } = useBundleRuns();
  const strategyId = run?.strategy_id ?? null;
  const s2RunIdEffective = bundleEnabled
    ? s2RunId ?? null
    : strategyId === "s2_pairs_trading"
      ? runId
      : null;
  const tfRunIdEffective = bundleEnabled
    ? tfRunId ?? null
    : strategyId === "tf_pullback_v1"
      ? runId
      : null;
  const tfSummaryRunId = tfRunIdEffective ?? runId ?? null;
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [vmStatus, setVmStatus] = useState<VmStatusResponse | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [uiStatus, setUiStatus] = useState<UiStatus | null>(null);
  const [s2Summary, setS2Summary] = useState<S2Summary | null>(null);
  const [tfSummary, setTfSummary] = useState<DwSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const scopedContext = useMemo(
    () => (runId ? { ...activeContext, run_id: runId } : activeContext),
    [runId]
  );
  const s2ScopedContext = useMemo(() => {
    if (!s2RunIdEffective) return activeContext;
    return {
      ...activeContext,
      run_id: s2RunIdEffective,
      strategy_id: "s2_pairs_trading",
    };
  }, [s2RunIdEffective]);
  const tfScopedContext = useMemo(() => {
    if (!tfSummaryRunId) return { ...activeContext, strategy_id: "tf_pullback_v1" };
    return {
      ...activeContext,
      run_id: tfSummaryRunId,
      strategy_id: "tf_pullback_v1",
    };
  }, [tfSummaryRunId]);

  const loadStatusCore = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [snapshot, vm] = await Promise.all([
      api.getDashboardSnapshot(
        runId ?? null,
        "ops",
        scopedContext
      ),
      api.getVmStatus(scopedContext),
    ]);
    setSystem((snapshot.system ?? null) as SystemStatus | null);
    setVmStatus(vm ?? null);
    setHealth((snapshot.health ?? null) as Health | null);
    setUiStatus((snapshot.ui_status ?? null) as UiStatus | null);
    setLoading(false);
  }, [runId, scopedContext]);

  const loadStrategySummaries = useCallback(async () => {
    const calls: Promise<any>[] = [];
    if (s2RunIdEffective) {
      calls.push(api.getS2Summary(s2ScopedContext));
    }
    if (tfSummaryRunId) {
      calls.push(api.getStrategySummary(tfScopedContext, "tf_pullback_v1"));
    }
    if (calls.length === 0) {
      setS2Summary(null);
      setTfSummary(null);
      return;
    }
    const results = await Promise.allSettled(calls);
    let offset = 0;
    if (s2RunIdEffective) {
      const s2Res = results[offset];
      setS2Summary(s2Res?.status === "fulfilled" ? (s2Res.value as S2Summary) : null);
      offset += 1;
    } else {
      setS2Summary(null);
    }
    if (tfSummaryRunId) {
      const tfRes = results[offset];
      setTfSummary(tfRes?.status === "fulfilled" ? (tfRes.value as DwSummary) : null);
    } else {
      setTfSummary(null);
    }
  }, [s2RunIdEffective, s2ScopedContext, tfSummaryRunId, tfScopedContext]);

  const loadWithGuard = useCallback(async () => {
    try {
      await loadStatusCore();
    } catch {
      setSystem(null);
      setVmStatus(null);
      setHealth(null);
      setUiStatus(null);
      setError("VM status unavailable");
      setLoading(false);
    }
  }, [loadStatusCore]);

  const loadSummariesWithGuard = useCallback(async () => {
    try {
      await loadStrategySummaries();
    } catch {
      setS2Summary(null);
      setTfSummary(null);
    }
  }, [loadStrategySummaries]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadWithGuard(), loadSummariesWithGuard()]);
  }, [loadSummariesWithGuard, loadWithGuard]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const relay = relayState(uiStatus?.relay?.last_ingest_ts ?? null);
  const relayAge = ageState(uiStatus?.relay?.last_ingest_ts ?? null, 90, 300);
  const s2SignalAge = ageState(s2Summary?.last_signal_ts ?? null, 180, 420);
  const tickAgeVariant: "success" | "warning" | "danger" | "muted" =
    system?.tick_age_seconds == null
      ? "muted"
      : system.tick_age_seconds <= 5
        ? "success"
        : system.tick_age_seconds <= 15
          ? "warning"
          : "danger";
  const tickAgeLabel =
    system?.tick_age_seconds != null
      ? `${formatNumber(system.tick_age_seconds, 1)}s`
      : "n/a";
  const s2WarmupLabel = s2RunIdEffective
    ? s2Summary?.warmup_state ?? "NO DATA"
    : "NO RUN";
  const s2WarmupVariant =
    s2WarmupLabel === "READY"
      ? "success"
      : s2RunIdEffective
        ? "warning"
        : "muted";
  const tfWarmupLabel = tfSummaryRunId
    ? tfSummary?.warmup_state ?? "NO DATA"
    : "NO RUN";
  const tfWarmupVariant =
    tfWarmupLabel === "READY"
      ? "success"
      : tfSummaryRunId
        ? "warning"
        : "muted";
  const tfSignalAge = ageState(tfSummary?.last_signal_ts ?? null, 180, 420);
  const uiRunId = uiStatus?.run_id ?? null;
  const runMismatch = runId && uiRunId && runId !== uiRunId;
  const botTickActive =
    system?.tick_age_seconds != null && system.tick_age_seconds <= 5;
  let botLabel = "UNKNOWN";
  let botVariant: "success" | "warning" | "danger" | "muted" = "muted";
  if (system?.bot_running === true) {
    botLabel = "RUNNING";
    botVariant = "success";
  } else if (system?.bot_running === false) {
    if (botTickActive) {
      botLabel = "ACTIVE (ticks)";
      botVariant = "warning";
    } else {
      botLabel = "STOPPED";
      botVariant = "danger";
    }
  } else if (botTickActive) {
    botLabel = "ACTIVE (ticks)";
    botVariant = "warning";
  }
  const vmResources = vmStatus?.resources ?? null;
  const cpuVariant = metricVariant(vmResources?.cpu_percent, 70, 85);
  const memoryVariant = metricVariant(vmResources?.memory_percent, 75, 90);
  const swapVariant = metricVariant(vmResources?.swap_percent, 5, 20);
  const vmMetricsAvailable = vmStatus?.host?.supported;
  const vmServices = vmStatus?.services ?? [];

  return (
    <div className="space-y-4">
      <GlassPanel
        title="System Status"
        subtitle={`${VM_LABEL} exec, relay, runtime context`}
        action={(
          <button
            type="button"
            onClick={() => {
              void refreshAll();
            }}
            disabled={loading}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-neutral-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Loading" : "Refresh"}
          </button>
        )}
      >
        <div className="grid gap-4 lg:grid-cols-12">
          <GlassCard variant="inset" className="space-y-3 lg:col-span-4">
            <div className="text-xs uppercase tracking-[0.3em] text-neutral-500">
              {VM_LABEL} Exec
            </div>
            {loading ? (
              <Skeleton variant="card" className="h-24" />
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">Bot</span>
                  <GlassBadge variant={botVariant}>{botLabel}</GlassBadge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">Gateway</span>
                  <GlassBadge variant={statusVariant(system?.gateway_connected)}>
                    {system?.gateway_connected ? "CONNECTED" : "DOWN"}
                  </GlassBadge>
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>Tick age</span>
                  <GlassBadge variant={tickAgeVariant}>{tickAgeLabel}</GlassBadge>
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>Last tick</span>
                  <span>{formatTime(system?.last_tick_time, "UTC")}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>Service</span>
                  <span>{system?.service_status ?? "unknown"}</span>
                </div>
              </div>
            )}
          </GlassCard>

          <GlassCard variant="inset" className="space-y-3 lg:col-span-4">
            <div className="text-xs uppercase tracking-[0.3em] text-neutral-500">
              Relay
            </div>
            {loading ? (
              <Skeleton variant="card" className="h-24" />
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">Status</span>
                  <GlassBadge variant={relay.variant}>{relay.label}</GlassBadge>
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>Age</span>
                  <GlassBadge variant={relayAge.variant}>{relayAge.label}</GlassBadge>
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>Last ingest</span>
                  <span>{formatTime(uiStatus?.relay?.last_ingest_ts, "UTC")}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>Last broadcast</span>
                  <span>{formatTime(uiStatus?.relay?.last_broadcast_ts, "UTC")}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>Clients</span>
                  <span>{uiStatus?.relay?.client_count ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>Buffer</span>
                  <span>{uiStatus?.relay?.buffer_len ?? 0}</span>
                </div>
              </div>
            )}
          </GlassCard>

          <GlassCard variant="inset" className="space-y-3 lg:col-span-4">
            <div className="text-xs uppercase tracking-[0.3em] text-neutral-500">
              Databases
            </div>
            {loading ? (
              <Skeleton variant="card" className="h-24" />
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">Bot DB</span>
                  <GlassBadge variant={statusVariant(health?.bot_db)}>
                    {health?.bot_db ? "OK" : "FAIL"}
                  </GlassBadge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">Analytics DB</span>
                  <GlassBadge variant={statusVariant(health?.analytics_db)}>
                    {health?.analytics_db ? "OK" : "FAIL"}
                  </GlassBadge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">Shadow DB</span>
                  <GlassBadge variant={statusVariant(health?.shadow_db)}>
                    {health?.shadow_db ? "OK" : "FAIL"}
                  </GlassBadge>
                </div>
                <div className="text-[10px] text-neutral-500">
                  Shadow DB may be archived when shadow is disabled.
                </div>
              </div>
            )}
          </GlassCard>

          <GlassCard variant="inset" className="space-y-3 lg:col-span-6">
            <div className="text-xs uppercase tracking-[0.3em] text-neutral-500">
              VM Resources
            </div>
            {loading ? (
              <Skeleton variant="card" className="h-24" />
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">CPU</span>
                  <GlassBadge variant={cpuVariant}>
                    {formatPercent(vmResources?.cpu_percent, 1)}
                  </GlassBadge>
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>Load</span>
                  <span>
                    {formatNumber(vmResources?.load_avg_1m, 2)} / {formatNumber(vmResources?.load_avg_5m, 2)} / {formatNumber(vmResources?.load_avg_15m, 2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">Memory</span>
                  <GlassBadge variant={memoryVariant}>
                    {formatPercent(vmResources?.memory_percent, 1)}
                  </GlassBadge>
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>RAM</span>
                  <span>{formatUsage(vmResources?.memory_used_mb, vmResources?.memory_total_mb)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">Swap</span>
                  <GlassBadge variant={swapVariant}>
                    {formatPercent(vmResources?.swap_percent, 1)}
                  </GlassBadge>
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>Swap usage</span>
                  <span>{formatUsage(vmResources?.swap_used_mb, vmResources?.swap_total_mb)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>Checked</span>
                  <span>{formatTime(vmStatus?.host?.checked_at ?? null, "UTC")}</span>
                </div>
                {vmStatus && vmMetricsAvailable === false && (
                  <div className="text-[10px] text-neutral-500">
                    Linux metrics unavailable in current environment.
                  </div>
                )}
              </div>
            )}
          </GlassCard>

          <GlassCard variant="inset" className="space-y-3 lg:col-span-6">
            <div className="text-xs uppercase tracking-[0.3em] text-neutral-500">
              VM Services
            </div>
            {loading ? (
              <Skeleton variant="card" className="h-24" />
            ) : (
              <div className="space-y-2 text-sm">
                {vmServices.length === 0 ? (
                  <div className="text-xs text-neutral-500">No services available.</div>
                ) : (
                  vmServices.map((service) => (
                    <div
                      key={service.name}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-neutral-300">{service.label}</div>
                        <div className="truncate text-[10px] text-neutral-500">
                          {service.name}
                          {service.main_pid != null ? ` · PID ${service.main_pid}` : ""}
                        </div>
                      </div>
                      <GlassBadge variant={vmServiceVariant(service.state)}>
                        {vmServiceLabel(service.state)}
                      </GlassBadge>
                    </div>
                  ))
                )}
              </div>
            )}
          </GlassCard>

          <GlassCard variant="inset" className="space-y-3 lg:col-span-6">
            <div className="text-xs uppercase tracking-[0.3em] text-neutral-500">
              Run Context
            </div>
            {loading ? (
              <Skeleton variant="card" className="h-24" />
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">Selected run</span>
                  <span className="font-mono text-neutral-200">
                    {runId ? runId.slice(0, 8) : "n/a"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">Relay run</span>
                  <span className="font-mono text-neutral-200">
                    {uiRunId ? uiRunId.slice(0, 8) : "n/a"}
                  </span>
                </div>
                {runMismatch && (
                  <div className="text-[10px] text-amber-300">
                    Run mismatch between UI and relay.
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>Relay ingest</span>
                  <span>{formatTime(uiStatus?.relay?.last_ingest_ts, "UTC")}</span>
                </div>
              </div>
            )}
          </GlassCard>

          <GlassCard variant="inset" className="space-y-3 lg:col-span-6">
            <div className="text-xs uppercase tracking-[0.3em] text-neutral-500">
              A1 / Strategies
            </div>
            {loading ? (
              <Skeleton variant="card" className="h-24" />
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">UI</span>
                  <GlassBadge variant="success">LIVE</GlassBadge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">S2 Warmup</span>
                  <GlassBadge variant={s2WarmupVariant}>
                    {s2WarmupLabel}
                  </GlassBadge>
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>Last S2 signal</span>
                  <span>{formatTime(s2Summary?.last_signal_ts, "UTC")}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>S2 age</span>
                  <GlassBadge variant={s2SignalAge.variant}>{s2SignalAge.label}</GlassBadge>
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>Pair</span>
                  <span>{s2RunIdEffective ? s2Summary?.pair_key ?? "n/a" : "NO RUN"}</span>
                </div>
                <div className="border-t border-white/10 pt-2 mt-2" />
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">S3 Warmup</span>
                  <GlassBadge variant={tfWarmupVariant}>
                    {tfWarmupLabel}
                  </GlassBadge>
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>Last S3 signal</span>
                  <span>{formatTime(tfSummary?.last_signal_ts, "UTC")}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>S3 age</span>
                  <GlassBadge variant={tfSignalAge.variant}>{tfSignalAge.label}</GlassBadge>
                </div>
              </div>
            )}
          </GlassCard>
        </div>

        {error && <div className="text-xs text-red-300">{error}</div>}
      </GlassPanel>
    </div>
  );
}
