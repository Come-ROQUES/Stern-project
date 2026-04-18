import React, { useMemo } from "react";
import { formatTime } from "../lib/dateUtils";
import { DwSummary, S2Summary } from "../lib/api";
import { GlassBadge, GlassCard } from "./ui/glass";

export type StrategySwitchTarget = "dw" | "s2" | "tf";

type StrategySwitchTabsProps = {
  active: StrategySwitchTarget;
  dwSummary: DwSummary | null;
  s2Summary: S2Summary | null;
  tfSummary?: DwSummary | null;
  onChange: (target: StrategySwitchTarget) => void;
};

const DEFAULT_S2_PAIR = "AUDUSD_NZDUSD";

type BadgeTone = "success" | "warning" | "danger" | "info" | "muted";

type StrategyCardState = {
  warmupLabel: string;
  warmupTone: BadgeTone;
  healthLabel: string;
  healthTone: BadgeTone;
  lastSignalTime: string;
};

function resolveWarmup(
  state: string | null | undefined,
  hasRun: boolean
): {
  label: string;
  tone: BadgeTone;
} {
  if (!hasRun) {
    return { label: "NO RUN", tone: "muted" };
  }
  const value = (state || "UNKNOWN").toUpperCase();
  if (value.includes("WARMUP")) {
    return { label: "WARMUP", tone: "warning" };
  }
  if (value.includes("READY")) {
    return { label: "READY", tone: "success" };
  }
  if (value.includes("NO_DATA")) {
    return { label: "NO DATA", tone: "muted" };
  }
  return { label: value, tone: "muted" };
}

function resolveHealth(
  lastSignalTs: string | null,
  staleSec: number,
  totalSignals?: number | null
): {
  label: string;
  tone: BadgeTone;
} {
  if (!lastSignalTs) {
    if (totalSignals === 0) {
      return { label: "NO SIGNALS", tone: "muted" };
    }
    return { label: "UNKNOWN", tone: "muted" };
  }
  const ts = new Date(lastSignalTs).getTime();
  if (!Number.isFinite(ts)) {
    return { label: "UNKNOWN", tone: "muted" };
  }
  const ageSec = (Date.now() - ts) / 1000;
  if (ageSec <= staleSec) {
    return { label: "OK", tone: "success" };
  }
  return { label: "STALE", tone: "warning" };
}

function buildState(
  summary: DwSummary | S2Summary | null,
  staleSec: number
): StrategyCardState {
  const hasRun = !!summary?.run_id;
  const totalSignals = summary?.counts?.total ?? null;
  const warmup = resolveWarmup(summary?.warmup_state, hasRun);
  const health = resolveHealth(
    summary?.last_signal_ts ?? null,
    staleSec,
    totalSignals
  );
  return {
    warmupLabel: warmup.label,
    warmupTone: warmup.tone,
    healthLabel: health.label,
    healthTone: health.tone,
    lastSignalTime: formatTime(summary?.last_signal_ts ?? null, "UTC"),
  };
}

function resolveS2Pair(summary: S2Summary | null): string {
  if (summary?.pair_key) return summary.pair_key;
  const symbolA = summary?.config?.symbol_a;
  const symbolB = summary?.config?.symbol_b;
  if (symbolA && symbolB) return `${symbolA}_${symbolB}`;
  return DEFAULT_S2_PAIR;
}

export const StrategySwitchTabs = React.memo(function StrategySwitchTabs({
  active,
  dwSummary,
  s2Summary,
  tfSummary = null,
  onChange,
}: StrategySwitchTabsProps) {
  const dwState = useMemo(
    () => buildState(dwSummary, 120),
    [dwSummary]
  );
  const s2State = useMemo(
    () => buildState(s2Summary, 180),
    [s2Summary]
  );
  const s2PairLabel = useMemo(
    () => resolveS2Pair(s2Summary),
    [s2Summary]
  );
  const tfState = useMemo(() => buildState(tfSummary, 180), [tfSummary]);

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <GlassCard
        variant={active === "dw" ? "elevated" : "default"}
        hover={active !== "dw"}
        onClick={() => onChange("dw")}
        className="flex flex-col gap-3"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-neutral-500">
              MM
            </div>
            <div className="text-lg font-semibold text-white">Market Maker</div>
            <div className="text-[11px] text-neutral-400">BTC-USD runtime</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <GlassBadge variant={dwState.warmupTone} size="sm">
              {dwState.warmupLabel}
            </GlassBadge>
            <GlassBadge variant={dwState.healthTone} size="sm">
              {dwState.healthLabel}
            </GlassBadge>
          </div>
        </div>
        <div className="text-[11px] text-neutral-400">
          Last signal: {dwState.lastSignalTime}
        </div>
      </GlassCard>

      <GlassCard
        variant={active === "s2" ? "elevated" : "default"}
        hover={active !== "s2"}
        onClick={() => onChange("s2")}
        className="flex flex-col gap-3"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-neutral-500">
              S2
            </div>
            <div className="text-lg font-semibold text-white">Microstructure Lens</div>
            <div className="text-[11px] text-neutral-400">
              {s2PairLabel}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <GlassBadge variant={s2State.warmupTone} size="sm">
              {s2State.warmupLabel}
            </GlassBadge>
            <GlassBadge variant={s2State.healthTone} size="sm">
              {s2State.healthLabel}
            </GlassBadge>
          </div>
        </div>
        <div className="text-[11px] text-neutral-400">
          Last signal: {s2State.lastSignalTime}
        </div>
      </GlassCard>

      <GlassCard
        variant={active === "tf" ? "elevated" : "default"}
        hover={active !== "tf"}
        onClick={() => onChange("tf")}
        className="flex flex-col gap-3"
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-neutral-500">
              TR
            </div>
            <div className="text-lg font-semibold text-white">Trend Lens</div>
            <div className="text-[11px] text-neutral-400">
              BTC momentum overlay
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <GlassBadge variant={tfState.warmupTone} size="sm">
              {tfState.warmupLabel}
            </GlassBadge>
            <GlassBadge variant={tfState.healthTone} size="sm">
              {tfState.healthLabel}
            </GlassBadge>
          </div>
        </div>
        <div className="text-[11px] text-neutral-400">
          Last signal: {tfState.lastSignalTime}
        </div>
      </GlassCard>
    </div>
  );
});
