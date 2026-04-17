import { useCallback, useMemo, useState } from "react";
import { api, UiStatus } from "../lib/api";
import { activeContext } from "../lib/activeContext";
import { formatTime } from "../lib/dateUtils";
import { useRunId, useRunMeta } from "../lib/useRunContext";
import { useDashboardPoll } from "../lib/dashboardPollingBus";
import { GlassBadge } from "./ui/glass";

function resolveRelayTone(lastIngest: string | null): {
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
  if (ageSec <= 90) {
    return { label: "OK", variant: "success" };
  }
  if (ageSec <= 300) {
    return { label: "STALE", variant: "warning" };
  }
  return { label: "DOWN", variant: "danger" };
}

export function GlobalStatusStrip() {
  const runId = useRunId();
  const { run } = useRunMeta();
  const [status, setStatus] = useState<UiStatus | null>(null);
  const scopedContext = useMemo(
    () => (runId ? { ...activeContext, run_id: runId } : activeContext),
    [runId]
  );

  const load = useCallback(async () => {
    try {
      const snapshot = await api.getDashboardSnapshot(
        runId ?? null,
        "ops",
        scopedContext,
        { detailLevel: "core" }
      );
      setStatus(snapshot.ui_status ?? null);
    } catch {
      setStatus(null);
    }
  }, [runId, scopedContext]);

  useDashboardPoll("status", load, { enabled: true, immediate: true });

  const modeLabel = useMemo(() => {
    const source = run?.source || activeContext.mode || "paper";
    return source.toUpperCase();
  }, [run]);

  const lastIngest = status?.relay?.last_ingest_ts ?? null;
  const relayTone = resolveRelayTone(lastIngest);
  const runLabel = runId ? `${runId.slice(0, 10)}…` : "no-run";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-xs text-neutral-300 backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.24em] text-neutral-500">
            Run
          </span>
          <span className="font-mono text-[11px] text-neutral-200" title={runId ?? ""}>
            {runLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.24em] text-neutral-500">
            Mode
          </span>
          <GlassBadge variant="info" size="sm">
            {modeLabel}
          </GlassBadge>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.24em] text-neutral-500">
            Last ingest
          </span>
          <span className="text-[11px] text-neutral-200">
            {formatTime(lastIngest, "UTC")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.24em] text-neutral-500">
            Relay
          </span>
          <GlassBadge variant={relayTone.variant} size="sm">
            {relayTone.label}
          </GlassBadge>
        </div>
      </div>
    </div>
  );
}
