import { useCallback, useEffect, useRef, useState } from "react";
import { LogsResponse, api } from "../lib/api";
import { activeContext, defaultScope } from "../lib/activeContext";
import { useDashboardPoll } from "../lib/dashboardPollingBus";
import { useViewVisibility } from "../lib/viewActivity";

type LogSourceState = {
  lines: string[];
  degraded: boolean;
  message: string | null;
  error: string | null;
  retried: boolean;
  transport: string | null;
  window: string | null;
  latencyMs: number | null;
  attempts: number | null;
  lineCount: number | null;
};

const EMPTY_LOG_SOURCE: LogSourceState = {
  lines: [],
  degraded: false,
  message: null,
  error: null,
  retried: false,
  transport: null,
  window: null,
  latencyMs: null,
  attempts: null,
  lineCount: 0,
};

function toSourceState(payload: LogsResponse): LogSourceState {
  const lines = Array.isArray(payload.lines)
    ? payload.lines.filter((line) => line.trim() !== "-- No entries --")
    : [];
  const degraded = Boolean(payload.degraded);
  const message = payload.message ?? null;
  const error = payload.error ?? null;
  const retried = Boolean(payload.retried);
  const transport = payload.transport ?? null;
  const window = payload.window ?? null;
  const latencyMs =
    typeof payload.latency_ms === "number" ? payload.latency_ms : null;
  const attempts = typeof payload.attempts === "number" ? payload.attempts : null;
  const lineCount =
    typeof payload.line_count === "number" ? payload.line_count : lines.length;
  return {
    lines,
    degraded,
    message,
    error,
    retried,
    transport,
    window,
    latencyMs,
    attempts,
    lineCount,
  };
}

export function LogsPanel() {
  const [s1State, setS1State] = useState<LogSourceState>(EMPTY_LOG_SOURCE);
  const [s2State, setS2State] = useState<LogSourceState>(EMPTY_LOG_SOURCE);
  const [s3State, setS3State] = useState<LogSourceState>(EMPTY_LOG_SOURCE);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [lastUpdatedMs, setLastUpdatedMs] = useState<number | null>(null);
  const isViewVisible = useViewVisibility();
  const isVisibleRef = useRef(isViewVisible);
  const hydratedRef = useRef(false);
  const logsAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    isVisibleRef.current = isViewVisible;
    if (!isViewVisible) {
      logsAbortRef.current?.abort();
    }
  }, [isViewVisible]);

  useEffect(() => {
    return () => {
      logsAbortRef.current?.abort();
    };
  }, []);

  const loadLogs = useCallback(async () => {
    if (!isVisibleRef.current) return;
    logsAbortRef.current?.abort();
    const controller = new AbortController();
    logsAbortRef.current = controller;
    if (!hydratedRef.current) setLoading(true);
    else setRefreshing(true);
    try {
      const snapshot = await api.getLogsSnapshot(180, activeContext, defaultScope, {
        signal: controller.signal,
      });
      setS1State(toSourceState(snapshot.sources.s1));
      setS2State(toSourceState(snapshot.sources.s2));
      setS3State(toSourceState(snapshot.sources.s3));
      setLastUpdatedMs(Date.now());
      hydratedRef.current = true;
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      throw error;
    } finally {
      if (logsAbortRef.current === controller) {
        logsAbortRef.current = null;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useDashboardPoll("logs", loadLogs, { enabled: true, immediate: true });

  const lastUpdatedLabel =
    lastUpdatedMs != null
      ? new Date(lastUpdatedMs).toLocaleTimeString("fr-FR", { hour12: false })
      : null;

  const s1ErrorLabel = s1State.message ?? s1State.error;
  const s2ErrorLabel = s2State.message ?? s2State.error;
  const s3ErrorLabel = s3State.message ?? s3State.error;
  const buildSourceBadge = (state: LogSourceState): string => {
    const transport = state.transport ?? "unknown";
    const window = state.window && state.window !== "none" ? ` | ${state.window}` : "";
    const latency =
      state.latencyMs != null ? ` | ${Math.round(state.latencyMs)}ms` : "";
    const attempts = state.attempts != null ? ` | try:${state.attempts}` : "";
    return `${transport}${window}${latency}${attempts}`;
  };
  const buildEmptyLabel = (state: LogSourceState): string => {
    if (!state.degraded) return "Aucun log.";
    if (
      state.message?.includes("primary empty") ||
      state.error === "no_entries" ||
      state.error === "no_entries_primary"
    ) {
      return "Aucune entrée sur 30m, fallback 2h/12h appliqué.";
    }
    if (state.error === "timeout" || state.error === "timeout_primary") {
      return "Source indisponible (timeout lecture).";
    }
    return "Source indisponible temporairement.";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-neutral-400">
          {loading
            ? "Chargement initial des logs..."
            : refreshing
              ? "Actualisation des logs..."
              : `Dernière actualisation: ${lastUpdatedLabel ?? "n/a"}`}
        </div>
        <button
          type="button"
          className="text-xs px-2 py-1 rounded-md border border-white/10 text-neutral-200 hover:border-white/20"
          onClick={() => void loadLogs()}
        >
          Rafraîchir
        </button>
      </div>
      <div className="card glass">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-xs text-neutral-200 uppercase tracking-[0.18em]">
              S1 DW Logs
            </div>
            <div className="text-sm text-neutral-400">Dernières lignes</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-[10px] text-neutral-400">{buildSourceBadge(s1State)}</span>
            {s1State.degraded && (
              <span className="text-xs text-danger">{s1ErrorLabel ?? "Source dégradée"}</span>
            )}
          </div>
        </div>
        <div className="max-h-64 overflow-auto bg-black/30 rounded-lg border border-white/5 p-3 text-[11px] font-mono text-neutral-200">
          {s1State.lines.length === 0 ? (
            <div className="text-neutral-400">
              {buildEmptyLabel(s1State)}
            </div>
          ) : (
            s1State.lines.map((l, idx) => <div key={idx}>{l.trimEnd()}</div>)
          )}
        </div>
      </div>
      <div className="card glass">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-xs text-neutral-200 uppercase tracking-[0.18em]">
              S2 Pairs Logs
            </div>
            <div className="text-sm text-neutral-400">Dernières lignes</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-[10px] text-neutral-400">{buildSourceBadge(s2State)}</span>
            {s2State.degraded && (
              <span className="text-xs text-danger">
                {s2ErrorLabel ?? "Source dégradée"}
                {s2State.retried ? " (retry actif)" : ""}
              </span>
            )}
          </div>
        </div>
        <div className="max-h-64 overflow-auto bg-black/30 rounded-lg border border-white/5 p-3 text-[11px] font-mono text-neutral-200">
          {s2State.lines.length === 0 ? (
            <div className="text-neutral-400">
              {buildEmptyLabel(s2State)}
            </div>
          ) : (
            s2State.lines.map((l, idx) => <div key={idx}>{l.trimEnd()}</div>)
          )}
        </div>
      </div>
      <div className="card glass">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-xs text-neutral-200 uppercase tracking-[0.18em]">
              S3 TF Logs
            </div>
            <div className="text-sm text-neutral-400">Dernières lignes</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-[10px] text-neutral-400">{buildSourceBadge(s3State)}</span>
            {s3State.degraded && (
              <span className="text-xs text-danger">
                {s3ErrorLabel ?? "Source dégradée"}
                {s3State.retried ? " (retry actif)" : ""}
              </span>
            )}
          </div>
        </div>
        <div className="max-h-64 overflow-auto bg-black/30 rounded-lg border border-white/5 p-3 text-[11px] font-mono text-neutral-200">
          {s3State.lines.length === 0 ? (
            <div className="text-neutral-400">
              {buildEmptyLabel(s3State)}
            </div>
          ) : (
            s3State.lines.map((l, idx) => <div key={idx}>{l.trimEnd()}</div>)
          )}
        </div>
      </div>
    </div>
  );
}
