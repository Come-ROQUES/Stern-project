import type { DashboardSnapshot, StrategyRuntimeStatus } from "../lib/api";

export type RuntimeWarmupState = "READY" | "WARMUP" | null;

export function resolveGateway(status: any): boolean | null {
  if (!status) return null;
  if (status.gateway_connected === false) return false;
  if (status.gateway_connected === true) return true;
  if (status.bot_running === true) return true;
  return null;
}

export function snapshotHasUnavailableError(
  snapshot: DashboardSnapshot | null | undefined
): boolean {
  return Boolean(snapshot?._meta?.errors?.includes("snapshot_unavailable"));
}

export function resolveOverviewStrategyRunId(
  strategyId: string,
  preferredRunId: string | null,
  snapshot: DashboardSnapshot | null | undefined,
  strategyStatuses: StrategyRuntimeStatus[] = []
): string | null {
  if (preferredRunId) return preferredRunId;
  const snapshotRunId = snapshot?.strategy_runs?.[strategyId];
  if (snapshotRunId) return snapshotRunId;
  return (
    strategyStatuses.find((row) => row.strategy_id === strategyId)?.run_id ?? null
  );
}

export function resolveRuntimeWarmupState(
  status: StrategyRuntimeStatus | null | undefined
): RuntimeWarmupState {
  const raw = status?.warmup_progress?.status?.trim().toUpperCase() ?? "";
  if (!raw) return null;
  if (raw.includes("READY") || raw.includes("COMPLETE")) {
    return "READY";
  }
  if (
    raw.includes("WARMUP") ||
    raw.includes("BOOTSTRAP") ||
    raw.includes("SYNC")
  ) {
    return "WARMUP";
  }
  return null;
}

export function resolveRuntimeWarmupProgress(
  status: StrategyRuntimeStatus | null | undefined
): number | null {
  const runtimeState = resolveRuntimeWarmupState(status);
  if (runtimeState === "READY") return 1;
  const current = status?.warmup_progress?.current ?? null;
  const target = status?.warmup_progress?.target ?? null;
  if (
    current === null ||
    target === null ||
    !Number.isFinite(current) ||
    !Number.isFinite(target) ||
    target <= 0
  ) {
    return null;
  }
  return Math.max(0, Math.min(current / target, 1));
}

export function resolveRuntimeWarmupLabel(
  status: StrategyRuntimeStatus | null | undefined
): string | null {
  const current = status?.warmup_progress?.current ?? null;
  const target = status?.warmup_progress?.target ?? null;
  if (
    current !== null &&
    Number.isFinite(current) &&
    target !== null &&
    Number.isFinite(target) &&
    target > 0
  ) {
    return `${Math.min(current, target)}/${target}`;
  }
  if (current !== null && Number.isFinite(current)) {
    return String(current);
  }
  return resolveRuntimeWarmupState(status);
}
