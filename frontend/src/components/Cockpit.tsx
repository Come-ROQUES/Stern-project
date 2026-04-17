import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  Health,
  PortfolioGuardStatus,
  S2Run,
  S2Summary,
  StrategyRuntimeStatus,
  SystemStatus,
} from "../lib/api";
import {
  canonicalApi,
  type Run,
  useCanonicalRunStats,
  useSignalStats,
  useShockStats,
} from "../lib/canonicalApi";
import { useBundleRuns } from "../lib/useBundleRuns";
import { useRunContext, useRunId } from "../lib/useRunContext";
import { useCommissionView } from "../lib/useCommissionView";
import { useDashboardPoll } from "../lib/dashboardPollingBus";
import { RunMetadataBanner } from "./ui/RunMetadataBanner";
import { activeContext, defaultScope } from "../lib/activeContext";
import { formatTime } from "../lib/dateUtils";
import { strategyLabel } from "../lib/strategies";

type PulseState = {
  lastSignalTs: string | null;
  lastShockTs: string | null;
  loading: boolean;
  error: string | null;
};

function shortId(value: string | null | undefined): string {
  if (!value) return "n/a";
  return value.length > 8 ? value.slice(0, 8) : value;
}

function infoValue(value: string | number | null | undefined): string {
  if (value == null || value === "") return "n/a";
  return String(value);
}

function formatTickAge(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "n/a";
  if (value < 1) return value.toFixed(6);
  if (value < 10) return value.toFixed(3);
  return value.toFixed(1);
}

export function Cockpit() {
  const { run, selectRun } = useRunContext();
  const runId = useRunId();
  const {
    enabled: bundleEnabled,
    dwRunId,
    s2RunId,
    tfRunId,
    setEnabled: setBundleEnabled,
    setDwRunId,
    setS2RunId,
    setTfRunId,
  } = useBundleRuns();
  const { commissionView } = useCommissionView();

  const [dwRuns, setDwRuns] = useState<Run[]>([]);
  const [s2Runs, setS2Runs] = useState<S2Run[]>([]);
  const [tfRuns, setTfRuns] = useState<Run[]>([]);
  const [s2RunIdsFallback, setS2RunIdsFallback] = useState<string[]>([]);
  const [bundleError, setBundleError] = useState<string | null>(null);

  const dwRunIdEffective = bundleEnabled ? dwRunId : runId;
  const dwRun = useMemo(() => {
    const fromList = dwRuns.find((r) => r.run_id === dwRunIdEffective) || null;
    if (fromList) return fromList;
    if (runId && runId === dwRunIdEffective) return run ?? null;
    return null;
  }, [dwRuns, dwRunIdEffective, runId, run]);

  const dwStrategyId = (dwRun && 'strategy' in dwRun ? dwRun.strategy : undefined) ?? run?.strategy_id ?? "damping_wave";

  const s2RunIdEffective = bundleEnabled
    ? s2RunId
    : run?.strategy_id === "s2_pairs_trading"
      ? runId
      : null;
  const s2Run = useMemo(
    () => s2Runs.find((r) => r.run_id === s2RunIdEffective) || null,
    [s2Runs, s2RunIdEffective]
  );
  const tfRunIdEffective = bundleEnabled
    ? tfRunId
    : run?.strategy_id === "tf_pullback_v1"
      ? runId
      : null;
  const tfRun = useMemo(() => {
    const fromList = tfRuns.find((r) => r.run_id === tfRunIdEffective) || null;
    if (fromList) return fromList;
    if (runId && runId === tfRunIdEffective) return run ?? null;
    return null;
  }, [tfRuns, tfRunIdEffective, runId, run]);
  const tfStrategyId =
    (tfRun && "strategy" in tfRun ? tfRun.strategy : undefined) ??
    "tf_pullback_v1";

  const { stats: dwSignalStats } = useSignalStats(dwRunIdEffective, dwStrategyId);
  const { stats: dwShockStats } = useShockStats(dwRunIdEffective, dwStrategyId);
  const { stats: dwExecStats, tradeCount: dwTradeCount } = useCanonicalRunStats(
    dwRunIdEffective,
    dwStrategyId,
    { commissionView }
  );

  const [dwPulse, setDwPulse] = useState<PulseState>({
    lastSignalTs: null,
    lastShockTs: null,
    loading: false,
    error: null,
  });
  const [s2Pulse, setS2Pulse] = useState<PulseState>({
    lastSignalTs: null,
    lastShockTs: null,
    loading: false,
    error: null,
  });
  const [tfPulse, setTfPulse] = useState<PulseState>({
    lastSignalTs: null,
    lastShockTs: null,
    loading: false,
    error: null,
  });
  const [s2Summary, setS2Summary] = useState<S2Summary | null>(null);
  const [s2Resetting, setS2Resetting] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [strategyStatuses, setStrategyStatuses] = useState<StrategyRuntimeStatus[]>([]);
  const [guardStatus, setGuardStatus] = useState<PortfolioGuardStatus | null>(null);

  const dwConfig = (dwRun && 'cfg_hash' in dwRun ? dwRun.cfg_hash : undefined) ?? run?.strategy_version ?? "n/a";
  const s2StrategyLabel = "s2_pairs";
  const s2Config =
    s2Summary?.config?.bar_interval_s
      ? `swing ${Math.round(s2Summary.config.bar_interval_s / 60)}m`
      : s2Summary
        ? "swing 15m"
        : "n/a";
  const tfConfig =
    tfRun && "cfg_hash" in tfRun && tfRun.cfg_hash ? tfRun.cfg_hash : "n/a";
  const dashboardContext = useMemo(
    () => (runId ? { ...activeContext, run_id: runId } : activeContext),
    [runId]
  );

  const s2RunIds = useMemo(() => {
    if (s2Runs.length) return s2Runs.map((r) => r.run_id);
    return s2RunIdsFallback;
  }, [s2Runs, s2RunIdsFallback]);
  const s2OptionIds = useMemo(
    () => (s2Runs.length ? s2Runs.map((r) => r.run_id) : s2RunIds),
    [s2Runs, s2RunIds]
  );
  const s2OptionSet = useMemo(() => new Set(s2OptionIds), [s2OptionIds]);

  useEffect(() => {
    let cancelled = false;
    canonicalApi
      .listRuns({ strategy: "damping_wave", limit: 50 })
      .then((res) => {
        if (!cancelled) setDwRuns(res.runs || []);
      })
      .catch(() => {
        if (!cancelled) setDwRuns([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .getS2Runs(50)
      .then((res) => {
        if (!cancelled) setS2Runs(res.runs || []);
      })
      .catch(() => {
        if (!cancelled) setS2Runs([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      canonicalApi.listRuns({ strategy: "tf_pullback_v1", limit: 50 }),
      canonicalApi.getActiveRun("tf_pullback_v1"),
    ])
      .then(([listRes, activeRes]) => {
        if (cancelled) return;
        const runs = [...(listRes.runs || [])];
        // S'assurer que le run actif est toujours dans la liste,
        // même s'il a été créé après le montage de la page.
        const activeRun = activeRes?.active;
        if (activeRun && !runs.some((r) => r.run_id === activeRun.run_id)) {
          runs.unshift(activeRun);
        }
        setTfRuns(runs);
      })
      .catch(() => {
        if (!cancelled) setTfRuns([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (s2Runs.length) return;
    api
      .getS2Signals(200, { ...activeContext, run_id: "" })
      .then((signals) => {
        if (cancelled) return;
        const runs = Array.from(
          new Set(
            signals
              .map((s) => (typeof s.run_id === "string" ? s.run_id : null))
              .filter((id): id is string => !!id)
          )
        );
        setS2RunIdsFallback(runs);
      })
      .catch(() => {
        if (!cancelled) setS2RunIdsFallback([]);
      });
    return () => {
      cancelled = true;
    };
  }, [s2Runs.length]);

  useEffect(() => {
    if (bundleEnabled && !dwRunId && runId) {
      setDwRunId(runId);
    }
  }, [bundleEnabled, dwRunId, runId, setDwRunId]);

  useEffect(() => {
    if (!bundleEnabled) return;
    if (!dwRunId || dwRunId === runId) return;
    selectRun(dwRunId).catch((err) => {
      setBundleError(err instanceof Error ? err.message : "Bundle DW run error");
    });
  }, [bundleEnabled, dwRunId, runId, selectRun]);

  useEffect(() => {
    if (!bundleEnabled) return;
    if (dwRunId && s2RunId && dwRunId === s2RunId) {
      setS2RunId(null);
      setBundleError("DW et S2 doivent être distincts. Sélectionnez un run S2.");
    }
  }, [bundleEnabled, dwRunId, s2RunId, setS2RunId]);

  useEffect(() => {
    if (!bundleEnabled) return;
    if (dwRunId && tfRunId && dwRunId === tfRunId) {
      setTfRunId(null);
      setBundleError("DW et S3 doivent être distincts. Sélectionnez un run S3.");
      return;
    }
    if (s2RunId && tfRunId && s2RunId === tfRunId) {
      setTfRunId(null);
      setBundleError("S2 et S3 doivent être distincts. Sélectionnez un run S3.");
    }
  }, [bundleEnabled, dwRunId, s2RunId, tfRunId, setTfRunId]);

  const resetS2ToLatest = async () => {
    if (!bundleEnabled) {
      setBundleError("Activez le bundle pour sélectionner le run S2.");
      return;
    }
    setS2Resetting(true);
    setBundleError(null);
    try {
      const activeRes = await api.getS2ActiveRun();
      let targetRunId =
        activeRes?.run && typeof activeRes.run.run_id === "string"
          ? activeRes.run.run_id
          : null;
      if (!targetRunId) {
        const resetRes = await api.resetS2Run("ui_reset_latest");
        targetRunId =
          resetRes && typeof resetRes.run_id === "string" ? resetRes.run_id : null;
      }
      if (!targetRunId) {
        const signals = await api.getS2Signals(1, {
          ...activeContext,
          run_id: "",
        });
        const latest = signals?.[0];
        targetRunId =
          latest && typeof latest.run_id === "string" ? latest.run_id : null;
      }
      if (!targetRunId) {
        setBundleError("Aucun run S2 disponible pour reset.");
        return;
      }
      if (dwRunId && targetRunId === dwRunId) {
        setBundleError("DW et S2 doivent être distincts. Sélectionnez un run S2.");
        return;
      }
      if (tfRunId && targetRunId === tfRunId) {
        setBundleError("S2 et S3 doivent être distincts. Sélectionnez un run S2.");
        return;
      }
      setS2RunId(targetRunId);
    } catch (err) {
      setBundleError(
        err instanceof Error ? err.message : "Reset S2 impossible"
      );
    } finally {
      setS2Resetting(false);
    }
  };

  const loadGlobalStatus = useCallback(async () => {
    try {
      const snapshot = await api.getDashboardSnapshot(runId ?? null, "ops", dashboardContext);
      setSystem((snapshot.system as SystemStatus) ?? null);
      setHealth((snapshot.health as Health) ?? null);
      setStrategyStatuses(snapshot.strategies_status?.strategies ?? []);
      setGuardStatus(snapshot.portfolio_guard ?? null);
    } catch {
      setSystem(null);
      setHealth(null);
      setStrategyStatuses([]);
      setGuardStatus(null);
    }
  }, [dashboardContext, runId]);

  useDashboardPoll("status", loadGlobalStatus, { enabled: true, immediate: true });

  const dwRuntime = useMemo(
    () => strategyStatuses.find((item) => item.strategy_id === "damping_wave") ?? null,
    [strategyStatuses]
  );
  const s2Runtime = useMemo(
    () =>
      strategyStatuses.find((item) => item.strategy_id === "s2_pairs_trading") ?? null,
    [strategyStatuses]
  );
  const tfRuntime = useMemo(
    () => strategyStatuses.find((item) => item.strategy_id === "tf_pullback_v1") ?? null,
    [strategyStatuses]
  );

  const loadDwPulse = useCallback(async () => {
    if (!dwRunIdEffective || !dwStrategyId) {
      setDwPulse({ lastSignalTs: null, lastShockTs: null, loading: false, error: null });
      return;
    }
    setDwPulse((prev) => ({ ...prev, loading: true, error: null }));
    const shocksRes = await Promise.allSettled([
      canonicalApi.listShocks(dwRunIdEffective, {
        limit: 1,
        order: "desc",
        strategyId: dwStrategyId,
      }),
    ]);

    const lastSignalTs = dwRuntime?.last_signal_ts ?? null;
    const lastShockTs =
      shocksRes[0].status === "fulfilled" && shocksRes[0].value.shocks?.length
        ? shocksRes[0].value.shocks[0].timestamp
        : null;

    setDwPulse({
      lastSignalTs,
      lastShockTs,
      loading: false,
      error: shocksRes[0].status === "rejected" ? "Telemetry error" : null,
    });
  }, [dwRunIdEffective, dwStrategyId, dwRuntime?.last_signal_ts]);

  useDashboardPoll("summary", loadDwPulse, { enabled: true, immediate: true });

  const loadS2Pulse = useCallback(async () => {
    if (!s2RunIdEffective) {
      setS2Pulse({ lastSignalTs: null, lastShockTs: null, loading: false, error: null });
      setS2Summary(null);
      return;
    }
    setS2Pulse((prev) => ({ ...prev, loading: true, error: null }));
    const s2Ctx = { ...activeContext, run_id: s2RunIdEffective };
    const [summaryRes] = await Promise.allSettled([api.getS2Summary(s2Ctx)]);

    setS2Summary(summaryRes.status === "fulfilled" ? summaryRes.value : null);
    setS2Pulse({
      lastSignalTs:
        summaryRes.status === "fulfilled"
          ? summaryRes.value?.last_signal_ts ?? null
          : null,
      lastShockTs: null,
      loading: false,
      error: summaryRes.status === "rejected" ? "Telemetry error" : null,
    });
  }, [s2RunIdEffective]);

  useDashboardPoll("summary", loadS2Pulse, { enabled: true, immediate: true });

  const loadTfPulse = useCallback(async () => {
    if (!tfRunIdEffective) {
      setTfPulse({ lastSignalTs: null, lastShockTs: null, loading: false, error: null });
      return;
    }
    setTfPulse((prev) => ({ ...prev, loading: true, error: null }));
    const shocksRes = await Promise.allSettled([
      canonicalApi.listShocks(tfRunIdEffective, {
        limit: 1,
        order: "desc",
        strategyId: tfStrategyId,
      }),
    ]);

    const lastSignalTs = tfRuntime?.last_signal_ts ?? null;
    const lastShockTs =
      shocksRes[0].status === "fulfilled" && shocksRes[0].value.shocks?.length
        ? shocksRes[0].value.shocks[0].timestamp
        : null;

    setTfPulse({
      lastSignalTs,
      lastShockTs,
      loading: false,
      error: shocksRes[0].status === "rejected" ? "Telemetry error" : null,
    });
  }, [tfRunIdEffective, tfStrategyId, tfRuntime?.last_signal_ts]);

  useDashboardPoll("summary", loadTfPulse, { enabled: true, immediate: true });

  return (
    <div className="space-y-4">
      <RunMetadataBanner
        tradeCount={dwTradeCount}
        dataSourceType={dwExecStats.dataSource === "none" ? undefined : dwExecStats.dataSource}
        bundleEnabled={bundleEnabled}
        dwRunId={dwRunIdEffective}
        s2RunId={s2RunIdEffective}
        tfRunId={tfRunIdEffective}
      />

      <div className="card glass">
        <div className="text-xs text-neutral-200 uppercase tracking-[0.18em]">
          Cockpit tri-run (DW + S2 + S3)
        </div>
        <div className="mt-2 flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-neutral-200">
            <input
              type="checkbox"
              checked={bundleEnabled}
              onChange={(e) => setBundleEnabled(e.target.checked)}
            />
            Activer bundle
          </label>
          {bundleError && <span className="text-xs text-danger">{bundleError}</span>}
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <div>
            <div className="text-xs text-neutral-400 mb-1">Run DW (canonical)</div>
            <select
              className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-neutral-200"
              value={dwRunId ?? ""}
              onChange={(e) => {
                const value = e.target.value || null;
                setDwRunId(value);
                if (value) {
                  selectRun(value);
                }
              }}
              disabled={!bundleEnabled}
            >
              <option value="">Sélectionnez un run DW</option>
              {dwRuns.map((r) => (
                <option key={r.run_id} value={r.run_id}>
                  {shortId(r.run_id)} · {r.status} · {r.start_ts}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="text-xs text-neutral-400">Run S2 (observe-only)</div>
              <button
                className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-neutral-200 hover:bg-white/10 disabled:opacity-50"
                onClick={resetS2ToLatest}
                disabled={!bundleEnabled || s2Resetting}
              >
                {s2Resetting ? "Reset..." : "Reset S2 → latest"}
              </button>
            </div>
            <select
              className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-neutral-200"
              value={s2RunId ?? ""}
              onChange={(e) => setS2RunId(e.target.value || null)}
              disabled={!bundleEnabled}
            >
              <option value="">Sélectionnez un run S2</option>
              {s2RunId && !s2OptionSet.has(s2RunId) && (
                <option value={s2RunId}>{shortId(s2RunId)} · selected</option>
              )}
              {s2Runs.length
                ? s2Runs
                  .filter((r) => !dwRunId || r.run_id !== dwRunId)
                  .map((r) => (
                    <option key={r.run_id} value={r.run_id}>
                      {shortId(r.run_id)} · {r.status ?? "n/a"} · {r.start_ts ?? "n/a"}
                    </option>
                  ))
                : s2RunIds
                  .filter((id) => !dwRunId || id !== dwRunId)
                  .map((id) => (
                    <option key={id} value={id}>
                      {shortId(id)}
                    </option>
                  ))}
            </select>
            <input
              className="mt-2 w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-neutral-300"
              placeholder="Ou collez un run_id S2"
              value={s2RunId ?? ""}
              onChange={(e) => {
                const value = e.target.value || null;
                if (value && dwRunId && value === dwRunId) {
                  setS2RunId(null);
                  setBundleError(
                    "DW et S2 doivent être distincts. Sélectionnez un run S2."
                  );
                  return;
                }
                setS2RunId(value);
              }}
              disabled={!bundleEnabled}
            />
          </div>
          <div>
            <div className="text-xs text-neutral-400 mb-1">Run S3 Trend Following</div>
            <select
              className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-sm text-neutral-200"
              value={tfRunId ?? ""}
              onChange={(e) => {
                const value = e.target.value || null;
                if (value && (value === dwRunId || value === s2RunId)) {
                  setTfRunId(null);
                  setBundleError(
                    "S3 doit utiliser un run distinct de DW et S2."
                  );
                  return;
                }
                setTfRunId(value);
              }}
              disabled={!bundleEnabled}
            >
              <option value="">Sélectionnez un run S3</option>
              {tfRuns
                .filter((r) => !dwRunId || r.run_id !== dwRunId)
                .filter((r) => !s2RunId || r.run_id !== s2RunId)
                .map((r) => (
                  <option key={r.run_id} value={r.run_id}>
                    {shortId(r.run_id)} · {r.status} · {r.start_ts}
                  </option>
                ))}
            </select>
            <input
              className="mt-2 w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-neutral-300"
              placeholder="Ou collez un run_id S3"
              value={tfRunId ?? ""}
              onChange={(e) => {
                const value = e.target.value || null;
                if (value && (value === dwRunId || value === s2RunId)) {
                  setTfRunId(null);
                  setBundleError(
                    "S3 doit utiliser un run distinct de DW et S2."
                  );
                  return;
                }
                setTfRunId(value);
              }}
              disabled={!bundleEnabled}
            />
          </div>
        </div>
        <div className="mt-2 text-xs text-neutral-500">
          Le bundle affiche DW + S2 + S3 côte-à-côte sans fusionner les DBs.
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card title="Damping Wave" subtitle="Execution & shocks">
          <div className="grid gap-2 text-sm">
            <InfoRow label="Run" value={shortId(dwRunIdEffective)} />
            <InfoRow label="Strategy" value={dwStrategyId} />
            <InfoRow label="Config" value={dwConfig} />
            <InfoRow label="Status" value={dwRun?.status ?? "n/a"} />
            <InfoRow label="Source" value={dwRun?.source ?? "n/a"} />
            <InfoRow label="Service" value={dwRuntime?.service_state ?? "n/a"} />
            <InfoRow label="Open pos" value={infoValue(dwRuntime?.open_positions)} />
            <InfoRow
              label="Last signal"
              value={dwPulse.loading ? "..." : formatTime(dwPulse.lastSignalTs, "UTC")}
            />
            <InfoRow
              label="Last shock"
              value={dwPulse.loading ? "..." : formatTime(dwPulse.lastShockTs, "UTC")}
            />
            <InfoRow
              label="Signals"
              value={infoValue(dwSignalStats?.total_signals)}
            />
            <InfoRow
              label="Shocks"
              value={infoValue(dwShockStats?.total_shocks)}
            />
            <InfoRow
              label="Trades"
              value={infoValue(dwExecStats.tradeCount)}
            />
          </div>
        </Card>

        <Card title="S2 Pairs" subtitle="Observe-only telemetry">
          <div className="grid gap-2 text-sm">
            <InfoRow label="Run" value={shortId(s2RunIdEffective)} />
            <InfoRow label="Strategy" value={s2StrategyLabel} />
            <InfoRow label="Config" value={s2Config} />
            <InfoRow label="Status" value={s2Run?.status ?? "n/a"} />
            <InfoRow label="Source" value={s2Run?.source ?? "n/a"} />
            <InfoRow label="Service" value={s2Runtime?.service_state ?? "n/a"} />
            <InfoRow label="Open pos" value={infoValue(s2Runtime?.open_positions)} />
            <InfoRow
              label="Warmup"
              value={s2Summary?.warmup_state ?? "n/a"}
            />
            <InfoRow
              label="Last signal"
              value={s2Pulse.loading ? "..." : formatTime(s2Pulse.lastSignalTs, "UTC")}
            />
            <InfoRow
              label="Signals"
              value={infoValue(s2Summary?.signal_count)}
            />
          </div>
        </Card>

        <Card title={strategyLabel(tfStrategyId)} subtitle="Canonical trend-following telemetry">
          <div className="grid gap-2 text-sm">
            <InfoRow label="Run" value={shortId(tfRunIdEffective)} />
            <InfoRow label="Strategy" value={tfStrategyId} />
            <InfoRow label="Config" value={tfConfig} />
            <InfoRow label="Status" value={tfRun?.status ?? "n/a"} />
            <InfoRow label="Source" value={tfRun?.source ?? "n/a"} />
            <InfoRow label="Service" value={tfRuntime?.service_state ?? "n/a"} />
            <InfoRow label="Open pos" value={infoValue(tfRuntime?.open_positions)} />
            <InfoRow
              label="Last signal"
              value={tfPulse.loading ? "..." : formatTime(tfPulse.lastSignalTs, "UTC")}
            />
            <InfoRow
              label="Last shock"
              value={tfPulse.loading ? "..." : formatTime(tfPulse.lastShockTs, "UTC")}
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Tile
          title="Gateway"
          value={system?.gateway_connected ? "CONNECTED" : "DOWN"}
          subtitle={`Tick age ${formatTickAge(system?.tick_age_seconds)}s`}
        />
        <Tile
          title="Bot"
          value={system?.bot_running ? "RUNNING" : "STOPPED"}
          subtitle={system?.service_status ?? "service unknown"}
        />
        <Tile
          title="Databases"
          value={health?.status === "ok" ? "OK" : "WARN"}
          subtitle={`Analytics ${health?.analytics_db ? "OK" : "FAIL"} · Guard pending ${guardStatus?.counts?.pending_global ?? 0}`}
        />
      </div>

      {(dwPulse.error || s2Pulse.error || tfPulse.error) && (
        <div className="text-xs text-danger">
          {dwPulse.error || s2Pulse.error || tfPulse.error}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-neutral-400">{label}</span>
      <span className="text-neutral-100">{value}</span>
    </div>
  );
}

function Tile({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="card glass">
      <div className="text-xs text-neutral-200 uppercase tracking-[0.18em]">
        {title}
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {subtitle && <div className="text-xs text-neutral-400">{subtitle}</div>}
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="text-xs text-neutral-200 uppercase tracking-[0.18em]">
        {title}
      </div>
      {subtitle && <div className="text-xs text-neutral-400 mb-2">{subtitle}</div>}
      {children}
    </div>
  );
}
