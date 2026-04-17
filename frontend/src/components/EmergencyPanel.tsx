import { startTransition, useCallback, useEffect, useRef, useState } from "react";

import {
  api,
  EmergencyControlFlag,
  EmergencyControlFlagState,
  EmergencyControlsResponse,
  SystemStatus,
} from "../lib/api";
import { useDashboardPoll } from "../lib/dashboardPollingBus";
import { formatTime } from "../lib/dateUtils";
import { strategyLabel, strategyShortLabel } from "../lib/strategies";

const UNLOCK_CODE = "159265";

type ActionState = "idle" | "confirm" | "loading" | "success" | "error";
type ProgressPhase = "sending" | "applying" | "verifying" | "done" | "error";
type ButtonVariant = "danger" | "warning" | "neutral";

type ControlAction = {
  key: string;
  label: string;
  confirmLabel: string;
  variant: ButtonVariant;
  fn: () => Promise<{ message?: string }>;
};

const FLAG_LABELS: Record<EmergencyControlFlag, string> = {
  kill_switch: "Kill Switch",
  systemd_block: "Systemd Block",
  disable_autostart: "Disable Autostart",
};

function ageLabel(timestamp: string | null | undefined): string {
  if (!timestamp) return "n/a";
  const parsed = new Date(timestamp).getTime();
  if (!Number.isFinite(parsed)) return "n/a";
  const ageSeconds = Math.max(0, (Date.now() - parsed) / 1000);
  if (ageSeconds < 60) return `${Math.round(ageSeconds)}s`;
  if (ageSeconds < 3600) return `${Math.round(ageSeconds / 60)}m`;
  return `${Math.round(ageSeconds / 3600)}h`;
}

function runtimeHealthLabel(
  healthy: boolean | undefined,
  reason: string | null | undefined
): { label: string; variant: "ok" | "warn" | "danger" } {
  if (healthy) return { label: "HEALTHY", variant: "ok" };
  if (!reason) return { label: "CHECK", variant: "warn" };
  if (
    reason === "kill_switch_active" ||
    reason === "service_inactive" ||
    reason === "stalled" ||
    reason === "warmup_stuck"
  ) {
    return { label: reason.toUpperCase(), variant: "danger" };
  }
  return { label: reason.toUpperCase(), variant: "warn" };
}

export function EmergencyPanel() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [controls, setControls] = useState<EmergencyControlsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [actionStates, setActionStates] = useState<Record<string, ActionState>>({});
  const [actionProgress, setActionProgress] = useState<{
    key: string;
    phase: ProgressPhase;
    percent: number;
    text: string;
    tone: "warning" | "success" | "error";
  } | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const unlocked = code === UNLOCK_CODE;

  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    const [statusResult, controlsResult] = await Promise.allSettled([
      api.getSystemStatus(),
      api.getEmergencyControls(),
    ]);
    if (!mountedRef.current) return;

    startTransition(() => {
      const failures: string[] = [];

      if (statusResult.status === "fulfilled") {
        setStatus(statusResult.value);
      } else {
        failures.push("statut runtime global indisponible");
      }

      if (controlsResult.status === "fulfilled") {
        setControls(controlsResult.value);
      } else {
        failures.push(
          controlsResult.reason?.message || "emergency controls unavailable"
        );
      }

      setError(failures.length > 0 ? failures.join(" · ") : null);
    });
  }, []);

  useDashboardPoll("status", load, {
    enabled: true,
    immediate: true,
    intervalMs: 10_000,
  });

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, []);

  function setActionState(key: string, state: ActionState) {
    setActionStates((prev) => ({ ...prev, [key]: state }));
  }

  function startProgressAnim(targetPercent: number, durationMs: number) {
    if (progressRef.current) clearInterval(progressRef.current);
    const step = 80;
    const inc = (targetPercent / (durationMs / step)) * 0.6;
    progressRef.current = setInterval(() => {
      setActionProgress((prev) => {
        if (!prev || prev.percent >= targetPercent) {
          if (progressRef.current) clearInterval(progressRef.current);
          return prev;
        }
        return {
          ...prev,
          percent: Math.min(prev.percent + inc, targetPercent),
        };
      });
    }, step);
  }

  async function reloadSnapshots() {
    await load();
  }

  async function doAction(key: string, fn: () => Promise<{ message?: string }>) {
    setMessage(null);
    setError(null);
    setActionState(key, "loading");

    const isRestart = key.includes("restart");
    setActionProgress({
      key,
      phase: "sending",
      percent: 6,
      text: "Validation de la commande...",
      tone: "warning",
    });
    startProgressAnim(isRestart ? 32 : 42, isRestart ? 2_000 : 1_200);

    try {
      setTimeout(() => {
        setActionProgress((current) =>
          current && current.key === key && current.phase === "sending"
            ? {
                ...current,
                phase: isRestart ? "applying" : "verifying",
                percent: isRestart ? 36 : 48,
                text: isRestart
                  ? "Application de la commande..."
                  : "Verification du nouvel etat...",
              }
            : current
        );
        startProgressAnim(isRestart ? 70 : 82, isRestart ? 8_000 : 1_800);
      }, isRestart ? 800 : 250);

      const result = await fn();

      if (progressRef.current) clearInterval(progressRef.current);
      setActionProgress({
        key,
        phase: "verifying",
        percent: isRestart ? 75 : 84,
        text: "Verification du statut...",
        tone: "warning",
      });
      startProgressAnim(isRestart ? 92 : 94, isRestart ? 3_000 : 1_200);

      await reloadSnapshots();

      if (progressRef.current) clearInterval(progressRef.current);
      setActionProgress({
        key,
        phase: "done",
        percent: 100,
        text: result.message || "Action terminee",
        tone: "success",
      });
      setActionState(key, "success");
      setTimeout(() => {
        setActionProgress((current) => (current?.key === key ? null : current));
        setActionStates((prev) =>
          prev[key] === "success" ? { ...prev, [key]: "idle" } : prev
        );
      }, 2_500);
      setMessage(result.message || "OK");
    } catch (actionError: any) {
      if (progressRef.current) clearInterval(progressRef.current);
      setActionProgress({
        key,
        phase: "error",
        percent: 100,
        text: actionError.message || "Echec de l'action",
        tone: "error",
      });
      setActionState(key, "error");
      setTimeout(() => {
        setActionProgress((current) => (current?.key === key ? null : current));
        setActionStates((prev) =>
          prev[key] === "error" ? { ...prev, [key]: "idle" } : prev
        );
      }, 4_000);
      setError(actionError.message || "Action failed");
    }
  }

  function handleClick(key: string, fn: () => Promise<{ message?: string }>) {
    const current = actionStates[key] || "idle";
    if (current === "idle") {
      setActionState(key, "confirm");
      setTimeout(() => {
        setActionStates((prev) =>
          prev[key] === "confirm" ? { ...prev, [key]: "idle" } : prev
        );
      }, 4_000);
      return;
    }
    if (current === "confirm") {
      void doAction(key, fn);
    }
  }

  const globalControlActions: ControlAction[] = [
    {
      key: "global_kill_switch_activate",
      label: "Kill Switch ON",
      confirmLabel: "Confirmer Kill ON",
      variant: "danger",
      fn: () =>
        api.postEmergencyControl(
          {
            flag: "kill_switch",
            scope: "global",
            action: "activate",
            reason: reason || null,
          },
          code
        ),
    },
    {
      key: "global_kill_switch_deactivate",
      label: "Kill Switch OFF",
      confirmLabel: "Confirmer Kill OFF",
      variant: "warning",
      fn: () =>
        api.postEmergencyControl(
          {
            flag: "kill_switch",
            scope: "global",
            action: "deactivate",
            reason: reason || null,
          },
          code
        ),
    },
    {
      key: "global_systemd_block_activate",
      label: "Block Boot ON",
      confirmLabel: "Confirmer Block ON",
      variant: "warning",
      fn: () =>
        api.postEmergencyControl(
          {
            flag: "systemd_block",
            scope: "global",
            action: "activate",
            reason: reason || null,
          },
          code
        ),
    },
    {
      key: "global_systemd_block_deactivate",
      label: "Block Boot OFF",
      confirmLabel: "Confirmer Block OFF",
      variant: "neutral",
      fn: () =>
        api.postEmergencyControl(
          {
            flag: "systemd_block",
            scope: "global",
            action: "deactivate",
            reason: reason || null,
          },
          code
        ),
    },
    {
      key: "global_disable_autostart_activate",
      label: "Disable Autostart ON",
      confirmLabel: "Confirmer Disable ON",
      variant: "warning",
      fn: () =>
        api.postEmergencyControl(
          {
            flag: "disable_autostart",
            scope: "global",
            action: "activate",
            reason: reason || null,
          },
          code
        ),
    },
    {
      key: "global_disable_autostart_deactivate",
      label: "Disable Autostart OFF",
      confirmLabel: "Confirmer Disable OFF",
      variant: "neutral",
      fn: () =>
        api.postEmergencyControl(
          {
            flag: "disable_autostart",
            scope: "global",
            action: "deactivate",
            reason: reason || null,
          },
          code
        ),
    },
  ];

  const globalActions: ControlAction[] = [
    {
      key: "close_all",
      label: "Close All Positions",
      confirmLabel: "Confirmer Close All",
      variant: "danger",
      fn: () => api.postCloseAll(reason || null, code),
    },
    {
      key: "pause",
      label: "Pause Trading",
      confirmLabel: "Confirmer Pause",
      variant: "warning",
      fn: () => api.postPauseTrading("pause", reason || null, code),
    },
    {
      key: "resume",
      label: "Resume Trading",
      confirmLabel: "Confirmer Resume",
      variant: "neutral",
      fn: () => api.postPauseTrading("resume", reason || null, code),
    },
  ];

  const strategies = Object.values(controls?.strategies ?? {});
  const runtimeActionsKnown =
    controls?._meta?.system_actions_enabled != null ||
    status?.system_actions_enabled != null;
  const runtimeActionsEnabled =
    controls?._meta?.system_actions_enabled ?? status?.system_actions_enabled ?? false;
  const runtimeActionsDisabledMessage =
    runtimeActionsKnown && !runtimeActionsEnabled
      ? "Restart Service indisponible: API runtime en lecture seule (ENABLE_SYSTEM_ACTIONS=false). Les flags Emergency restent actifs."
      : null;
  const globalKillSwitch = controls?.globals.kill_switch.active ?? status?.kill_switch ?? false;
  const globalSystemdBlock = controls?.globals.systemd_block.active ?? false;
  const globalAutostartDisabled =
    controls?.globals.disable_autostart.active ?? status?.autostart_disabled ?? false;

  return (
    <div className="card space-y-4">
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-400">
          Emergency Room
        </div>
        <div className="text-lg font-semibold text-slate-100">
          Kill Switch & Securite
        </div>
      </div>

      {(status || controls) && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
          <StatusPill
            label="Kill Switch"
            value={globalKillSwitch ? "ON" : "OFF"}
            variant={globalKillSwitch ? "danger" : "ok"}
          />
          <StatusPill
            label="Systemd Block"
            value={
              controls ? (globalSystemdBlock ? "ON" : "OFF") : "?"
            }
            variant={globalSystemdBlock ? "warn" : "ok"}
          />
          <StatusPill
            label="Autostart"
            value={globalAutostartDisabled ? "OFF" : "ON"}
            variant={globalAutostartDisabled ? "warn" : "ok"}
          />
          <StatusPill
            label="Runtime Actions"
            value={runtimeActionsEnabled ? "ON" : runtimeActionsKnown ? "RO" : "?"}
            variant={runtimeActionsEnabled ? "ok" : "warn"}
          />
          <StatusPill
            label="Close All"
            value={status ? (status.close_all ? "ON" : "OFF") : "?"}
            variant={status?.close_all ? "danger" : "ok"}
          />
          <StatusPill
            label="Paused"
            value={status ? (status.trading_paused ? "YES" : "NO") : "?"}
            variant={status?.trading_paused ? "warn" : "ok"}
          />
        </div>
      )}

      {status?.guardian && (
        <div className="space-y-1 rounded border border-slate-700/80 bg-slate-900/50 p-3 text-xs text-slate-300">
          <div className="text-[10px] uppercase tracking-wide text-slate-400">
            Guardian (orphan guard)
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>Service: {status.guardian.service_name}</span>
            <span>State: {status.guardian.service_state}</span>
            <span>Running: {status.guardian.running ? "YES" : "NO"}</span>
            <span>Checked: {status.guardian.service_checked ? "YES" : "NO"}</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-400">
            <span>Interval: {status.guardian.interval_seconds ?? "?"}s</span>
            <span>Grace: {status.guardian.grace_seconds ?? "?"}s</span>
            <span>Last action: {status.guardian.last_action_time ?? "none"}</span>
            <span>
              Last action payload: orders=
              {status.guardian.last_action_orphan_orders ?? 0} / positions=
              {status.guardian.last_action_orphan_positions ?? 0}
            </span>
          </div>
        </div>
      )}

      <div className="space-y-2 rounded border border-slate-700/60 bg-slate-800/30 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                unlocked ? "bg-emerald-400" : "bg-red-400"
              }`}
            />
            <span className="text-xs uppercase tracking-wide text-slate-400">
              {unlocked ? "Deverrouille" : "Verrouille"}
            </span>
          </div>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            placeholder="Code 6 chiffres"
            value={code}
            onChange={(event) => {
              const nextValue = event.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(nextValue);
            }}
            className={`w-[120px] rounded border px-2 py-1 text-center font-mono text-sm tracking-[0.3em] transition-colors ${
              unlocked
                ? "border-emerald-500/60 bg-slate-900 text-emerald-300"
                : code.length > 0
                  ? "border-red-500/40 bg-slate-900 text-red-300"
                  : "border-slate-600 bg-slate-900 text-white"
            }`}
          />
          <input
            type="text"
            placeholder="Raison (optionnel)"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="min-w-[180px] flex-1 rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-white"
          />
        </div>
        {controls && (
          <div className="space-y-1">
            <div className="text-[11px] text-slate-500">
              Control dir: <span className="font-mono">{controls.control_dir}</span>
            </div>
            {runtimeActionsDisabledMessage && (
              <div className="text-[11px] text-amber-300">
                {runtimeActionsDisabledMessage}
              </div>
            )}
          </div>
        )}
      </div>

      {(error || message) && (
        <div
          className={`rounded px-2 py-1 text-xs ${
            error
              ? "bg-red-900/30 text-red-300"
              : "bg-emerald-900/30 text-emerald-300"
          }`}
        >
          {error || message}
        </div>
      )}

      <section className="space-y-3">
        <div className="text-xs uppercase tracking-wide text-slate-400">
          Global Controls
        </div>
        <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-2 rounded border border-slate-700/60 bg-slate-900/40 p-3">
            <div className="text-xs font-medium text-slate-200">Flags</div>
            <div className="grid gap-3 md:grid-cols-3">
              {(Object.entries(controls?.globals ?? {}) as Array<
                [EmergencyControlFlag, EmergencyControlFlagState]
              >).map(([flag, state]) => (
                <FlagCard key={flag} label={FLAG_LABELS[flag]} state={state} />
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {globalControlActions.map((action) => (
                <ActionButton
                  key={action.key}
                  action={action}
                  state={actionStates[action.key] || "idle"}
                  disabled={!unlocked}
                  onClick={() => handleClick(action.key, action.fn)}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2 rounded border border-slate-700/60 bg-slate-900/40 p-3">
            <div className="text-xs font-medium text-slate-200">
              Global Actions
            </div>
            <div className="grid gap-2">
              {globalActions.map((action) => (
                <ActionButton
                  key={action.key}
                  action={action}
                  state={actionStates[action.key] || "idle"}
                  disabled={!unlocked}
                  onClick={() => handleClick(action.key, action.fn)}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="text-xs uppercase tracking-wide text-slate-400">
          Per Strategy Controls
        </div>
        <div className="grid gap-3">
          {strategies.map((strategy) => (
            <StrategyControlCard
              key={strategy.strategy_id}
              strategy={strategy}
              runtime={status?.strategies?.[strategy.strategy_id]}
              serviceRuntime={
                strategy.owner_service ? status?.services?.[strategy.owner_service] : undefined
              }
              runtimeActionsEnabled={runtimeActionsEnabled}
              unlocked={unlocked}
              reason={reason}
              code={code}
              actionStates={actionStates}
              onAction={(action) => handleClick(action.key, action.fn)}
            />
          ))}
        </div>
      </section>

      {actionProgress && (
        <ActionProgressBar
          phase={actionProgress.phase}
          percent={actionProgress.percent}
          text={actionProgress.text}
          tone={actionProgress.tone}
        />
      )}
    </div>
  );
}

function StrategyControlCard({
  strategy,
  runtime,
  serviceRuntime,
  runtimeActionsEnabled,
  unlocked,
  reason,
  code,
  actionStates,
  onAction,
}: {
  strategy: EmergencyControlsResponse["strategies"][string];
  runtime: NonNullable<SystemStatus["strategies"]>[string] | undefined;
  serviceRuntime: NonNullable<SystemStatus["services"]>[string] | undefined;
  runtimeActionsEnabled: boolean;
  unlocked: boolean;
  reason: string;
  code: string;
  actionStates: Record<string, ActionState>;
  onAction: (action: ControlAction) => void;
}) {
  const warmup = runtime?.warmup;
  const healthPill = runtimeHealthLabel(runtime?.healthy, runtime?.reason);
  const actions: ControlAction[] = [
    {
      key: `${strategy.strategy_id}_restart_service`,
      label: runtimeActionsEnabled ? "Restart Service" : "Restart Service (RO)",
      confirmLabel: "Confirmer Restart Service",
      variant: "warning",
      fn: () =>
        api.postRestartStrategyService(
          {
            strategy_id: strategy.strategy_id,
            reason: reason || null,
          },
          code
        ),
    },
    ...(Object.keys(strategy.flags) as EmergencyControlFlag[]).flatMap(
      (flag): ControlAction[] => {
        const prefix = `${strategy.strategy_id}_${flag}`;
        return [
          {
            key: `${prefix}_activate`,
            label: `${FLAG_LABELS[flag]} ON`,
            confirmLabel: `Confirmer ${FLAG_LABELS[flag]} ON`,
            variant: flag === "kill_switch" ? "danger" : "warning",
            fn: () =>
              api.postEmergencyControl(
                {
                  flag,
                  scope: "service",
                  strategy_id: strategy.strategy_id,
                  action: "activate",
                  reason: reason || null,
                },
                code
              ),
          },
          {
            key: `${prefix}_deactivate`,
            label: `${FLAG_LABELS[flag]} OFF`,
            confirmLabel: `Confirmer ${FLAG_LABELS[flag]} OFF`,
            variant: "neutral",
            fn: () =>
              api.postEmergencyControl(
                {
                  flag,
                  scope: "service",
                  strategy_id: strategy.strategy_id,
                  action: "deactivate",
                  reason: reason || null,
                },
                code
              ),
          },
        ];
      }
    ),
  ];

  return (
    <div className="space-y-3 rounded border border-slate-700/60 bg-slate-900/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">
            {strategyShortLabel(strategy.strategy_id)} · {strategyLabel(strategy.strategy_id)}
          </div>
          <div className="text-xs text-slate-400">
            {strategy.owner_service || "unknown service"} · state=
            {strategy.service_state} · pid={strategy.active_pid ?? "n/a"}
          </div>
          {runtime?.run_id && (
            <div className="text-[11px] text-slate-500">
              run_id: <span className="font-mono">{runtime.run_id}</span>
            </div>
          )}
          {strategy.restart_blockers.length > 0 && (
            <div className="text-[11px] text-amber-300">
              Restart bloque: {strategy.restart_blockers.join(", ")}
            </div>
          )}
          {!runtimeActionsEnabled && (
            <div className="text-[11px] text-slate-500">
              Restart runtime desactive par l&apos;API (`ENABLE_SYSTEM_ACTIONS=false`).
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill
            label="Health"
            value={healthPill.label}
            variant={healthPill.variant}
          />
          <StatusPill
            label="Service"
            value={strategy.service_active ? "RUN" : "STOP"}
            variant={strategy.service_active ? "ok" : "warn"}
          />
        </div>
      </div>

      {runtime && (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <RuntimeChip
            label="Signal"
            value={ageLabel(runtime.last_signal_ts)}
            detail={runtime.last_signal_ts ? formatTime(runtime.last_signal_ts) : "n/a"}
            variant={runtime.log_fresh || runtime.db_fresh ? "ok" : "warn"}
          />
          <RuntimeChip
            label="Trade"
            value={ageLabel(runtime.last_trade_ts)}
            detail={runtime.last_trade_ts ? formatTime(runtime.last_trade_ts) : "n/a"}
            variant={runtime.last_trade_ts ? "ok" : "warn"}
          />
          <RuntimeChip
            label="Freshness"
            value={`log:${runtime.log_fresh ? "OK" : "STALE"}`}
            detail={`db:${runtime.db_fresh ? "OK" : "STALE"}`}
            variant={runtime.log_fresh || runtime.db_fresh ? "ok" : "danger"}
          />
          <RuntimeChip
            label="Warmup"
            value={
              warmup?.status === "warmup" && warmup.target
                ? `${warmup.current ?? 0}/${warmup.target}`
                : warmup?.status?.toUpperCase() ?? "n/a"
            }
            detail={warmup?.stage || runtime.latest_reason || "n/a"}
            variant={warmup?.status === "warmup" ? "warn" : "ok"}
          />
        </div>
      )}

      {(runtime || serviceRuntime) && (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <RuntimeDetail
            label="Latest Reason"
            value={runtime?.latest_reason || runtime?.reason || "n/a"}
          />
          <RuntimeDetail
            label="Operator Ack"
            value={
              runtime?.requires_operator_ack
                ? `required (${runtime.kill_switch_reason || "kill_switch"})`
                : "not required"
            }
          />
          <RuntimeDetail
            label="Snapshot"
            value={
              runtime?.snapshot_saved_at
                ? `${formatTime(runtime.snapshot_saved_at)} · ${
                    runtime.snapshot_age_h?.toFixed(2) ?? "?"
                  }h`
                : "n/a"
            }
          />
          <RuntimeDetail
            label="Service Log"
            value={
              serviceRuntime?.last_log_time
                ? `${formatTime(serviceRuntime.last_log_time)} · ${ageLabel(
                    serviceRuntime.last_log_time
                  )}`
                : "n/a"
            }
          />
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr]">
        <div className="grid gap-3 md:grid-cols-3">
          {(Object.entries(strategy.flags) as Array<
            [EmergencyControlFlag, EmergencyControlFlagState]
          >).map(([flag, state]) => (
            <FlagCard key={flag} label={FLAG_LABELS[flag]} state={state} />
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {actions.map((action) => (
            <ActionButton
              key={action.key}
              action={action}
              state={actionStates[action.key] || "idle"}
              disabled={
                !unlocked ||
                (action.key === `${strategy.strategy_id}_restart_service` &&
                  !runtimeActionsEnabled) ||
                (action.key === `${strategy.strategy_id}_restart_service` &&
                  !strategy.restart_allowed)
              }
              onClick={() => onAction(action)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusPill({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant: "ok" | "warn" | "danger";
}) {
  const colors = {
    ok: "border-emerald-500/30 text-emerald-300",
    warn: "border-amber-500/30 text-amber-300",
    danger: "border-red-500/30 text-red-300",
  };

  return (
    <div className={`rounded border bg-slate-900/60 px-2 py-1 text-center ${colors[variant]}`}>
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
      <div className="text-xs font-semibold">{value}</div>
    </div>
  );
}

function FlagCard({
  label,
  state,
}: {
  label: string;
  state: EmergencyControlFlagState;
}) {
  return (
    <div className="space-y-1 rounded border border-slate-700/60 bg-slate-950/60 p-3 text-xs text-slate-300">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-slate-100">{label}</span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${
            state.active
              ? "bg-red-500/20 text-red-300"
              : "bg-emerald-500/20 text-emerald-300"
          }`}
        >
          {state.active ? "ON" : "OFF"}
        </span>
      </div>
      <div className="font-mono text-[11px] text-slate-500">{state.path}</div>
      <div className="text-slate-400">
        Reason: {state.reason || "none"} · Updated: {state.updated_at || "never"}
      </div>
    </div>
  );
}

function RuntimeChip({
  label,
  value,
  detail,
  variant,
}: {
  label: string;
  value: string;
  detail: string;
  variant: "ok" | "warn" | "danger";
}) {
  return (
    <div className="rounded border border-slate-700/60 bg-slate-950/60 p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={`text-sm font-semibold ${
          variant === "danger"
            ? "text-red-300"
            : variant === "warn"
              ? "text-amber-300"
              : "text-emerald-300"
        }`}
      >
        {value}
      </div>
      <div className="text-[11px] text-slate-500">{detail}</div>
    </div>
  );
}

function RuntimeDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="truncate text-[11px] text-slate-300">{value}</div>
    </div>
  );
}

function ActionProgressBar({
  phase,
  percent,
  text,
  tone,
}: {
  phase: ProgressPhase;
  percent: number;
  text: string;
  tone: "warning" | "success" | "error";
}) {
  const barColor =
    tone === "error"
      ? "bg-red-500"
      : tone === "success"
        ? "bg-emerald-400"
        : "bg-amber-400";
  const borderColor =
    tone === "error"
      ? "border-red-500/40"
      : tone === "success"
        ? "border-emerald-500/40"
        : "border-amber-500/30";
  const textColor =
    tone === "error"
      ? "text-red-300"
      : tone === "success"
        ? "text-emerald-300"
        : "text-amber-200";

  return (
    <div className={`space-y-2 rounded border ${borderColor} bg-slate-900/60 p-3`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium ${textColor}`}>{text}</span>
        <span className="font-mono text-[10px] text-slate-500">
          {Math.round(percent)}%
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-200 ease-out`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function ActionButton({
  action,
  state,
  disabled,
  onClick,
}: {
  action: ControlAction;
  state: ActionState;
  disabled: boolean;
  onClick: () => void;
}) {
  const base =
    "min-h-[48px] rounded-lg border p-3 text-left text-sm transition-all duration-150";
  const variants = {
    danger:
      state === "confirm"
        ? "animate-pulse border-red-500 bg-red-600/30 text-red-200"
        : state === "success"
          ? "border-emerald-500/40 bg-emerald-600/20 text-emerald-100"
          : state === "error"
            ? "border-red-500/50 bg-red-700/30 text-red-100"
        : "border-red-500/30 bg-slate-800/40 text-slate-200 hover:bg-red-900/40 hover:border-red-500/60",
    warning:
      state === "confirm"
        ? "animate-pulse border-amber-500 bg-amber-600/30 text-amber-200"
        : state === "success"
          ? "border-emerald-500/40 bg-emerald-600/20 text-emerald-100"
          : state === "error"
            ? "border-red-500/50 bg-red-700/30 text-red-100"
        : "border-amber-500/30 bg-slate-800/40 text-slate-200 hover:bg-amber-900/30 hover:border-amber-500/50",
    neutral:
      state === "confirm"
        ? "animate-pulse border-emerald-500 bg-emerald-600/30 text-emerald-200"
        : state === "success"
          ? "border-emerald-500/40 bg-emerald-600/20 text-emerald-100"
          : state === "error"
            ? "border-red-500/50 bg-red-700/30 text-red-100"
        : "border-slate-700/70 bg-slate-800/40 text-slate-200 hover:bg-slate-700 hover:border-slate-600",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || state === "loading"}
      className={`${base} ${variants[action.variant]} ${
        disabled || state === "loading"
          ? "cursor-not-allowed opacity-30"
          : "active:scale-[0.98]"
      }`}
    >
      {state === "loading" ? (
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-500 border-t-white" />
          <span>Application...</span>
        </span>
      ) : state === "confirm" ? (
        action.confirmLabel
      ) : state === "success" ? (
        "Valide"
      ) : state === "error" ? (
        "Echec"
      ) : (
        action.label
      )}
    </button>
  );
}
