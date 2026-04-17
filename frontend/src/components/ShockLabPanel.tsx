import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Play, RefreshCw } from "lucide-react";
import {
  api,
  type BacktestJobStatus,
  type BacktestRunPayload,
  type BacktestRunRow,
  type BacktestShockEvent,
  type BacktestSummary,
} from "../lib/api";
import { cn } from "../lib/utils";

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function formatMaybePct(value: number | null): string {
  if (value == null) return "n/a";
  return `${(value * 100).toFixed(1)}%`;
}

function formatMaybeNum(value: number | null, digits = 2): string {
  if (value == null) return "n/a";
  return value.toFixed(digits);
}

function parseErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Request failed";
}

const cardClass =
  "rounded-xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur-xl";

export function ShockLabPanel() {
  const [runs, setRuns] = useState<BacktestRunRow[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [summary, setSummary] = useState<BacktestSummary | null>(null);
  const [events, setEvents] = useState<BacktestShockEvent[]>([]);
  const [job, setJob] = useState<BacktestJobStatus | null>(null);

  const [date, setDate] = useState<string>("");
  const [detectorVersion, setDetectorVersion] =
    useState<string>("shock_detector_v1");
  const [acceptedOnly, setAcceptedOnly] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [starting, setStarting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const jobPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const refreshRuns = useCallback(async () => {
    const response = await api.listBacktestRuns(40, "shock_only");
    setRuns(response.runs ?? []);
  }, []);

  const loadRun = useCallback(
    async (runId: string) => {
      setLoading(true);
      setError(null);
      try {
        const [summaryRes, eventsRes] = await Promise.all([
          api.getBacktestSummary(runId),
          api.getBacktestShocks(runId, 200, acceptedOnly),
        ]);
        setSummary(summaryRes);
        setEvents(eventsRes.events ?? []);
      } catch (err) {
        setError(parseErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [acceptedOnly]
  );

  useEffect(() => {
    refreshRuns().catch(() => undefined);
  }, [refreshRuns]);

  useEffect(() => {
    if (!runs.length) {
      setSelectedRunId(null);
      setSummary(null);
      setEvents([]);
      return;
    }
    if (!selectedRunId || !runs.find((run) => run.run_id === selectedRunId)) {
      setSelectedRunId(runs[0].run_id);
    }
  }, [runs, selectedRunId]);

  useEffect(() => {
    if (!selectedRunId) return;
    loadRun(selectedRunId).catch(() => undefined);
  }, [selectedRunId, loadRun]);

  const stopJobPolling = useCallback(() => {
    if (jobPollRef.current) {
      window.clearTimeout(jobPollRef.current);
      jobPollRef.current = null;
    }
  }, []);

  const pollJob = useCallback(
    async (jobId: string) => {
      try {
        const next = await api.getBacktestJobStatus(jobId, 120);
        if (!mountedRef.current) return;
        setJob(next);
        if (next.status === "queued" || next.status === "running") {
          const delay = document.visibilityState === "visible" ? 2_000 : 6_000;
          jobPollRef.current = window.setTimeout(() => {
            void pollJob(jobId);
          }, delay);
          return;
        }
        stopJobPolling();
        setStarting(false);
        await refreshRuns();
        if (next.status === "success" && next.run_id) {
          setSelectedRunId(next.run_id);
        }
      } catch {
        stopJobPolling();
        setStarting(false);
      }
    },
    [refreshRuns, stopJobPolling]
  );

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      stopJobPolling();
    };
  }, [stopJobPolling]);

  useEffect(() => {
    if (!job || (job.status !== "queued" && job.status !== "running")) {
      stopJobPolling();
      return;
    }
    stopJobPolling();
    jobPollRef.current = window.setTimeout(() => {
      void pollJob(job.job_id);
    }, 2_000);
    return stopJobPolling;
  }, [job, pollJob, stopJobPolling]);

  const onStart = async () => {
    setStarting(true);
    setError(null);
    try {
      const payload: BacktestRunPayload = {
        mode: "shock_only",
        execution_mode: "regenerate",
        date: date || undefined,
        detector_version: detectorVersion || undefined,
      };
      const created = await api.runBacktest(payload);
      setJob(created);
      if (created.status === "success" && created.run_id) {
        setSelectedRunId(created.run_id);
      }
    } catch (err) {
      setStarting(false);
      setError(parseErrorMessage(err));
    }
  };

  const metrics = useMemo(() => {
    const payload = summary?.shock_metrics ?? {};
    const exploitability =
      (payload.exploitability as Record<string, unknown> | undefined) ?? {};
    const nuisance =
      (payload.nuisance as Record<string, unknown> | undefined) ?? {};
    const shockEvProxy =
      (payload.shock_ev_proxy as Record<string, unknown> | undefined) ?? {};
    return {
      raw: asNumber(payload.n_raw_shocks),
      dedup: asNumber(payload.n_dedup_shocks),
      coverage: asNumber(payload.coverage_shocks_per_day),
      ratio: asNumber(payload.dedup_raw_to_dedup_ratio),
      pMfe60: asNumber(exploitability["p_mfe_ge_1_60s"]),
      pMae60: asNumber(nuisance["p_mae_ge_1_60s"]),
      ev60: asNumber(shockEvProxy["ev_proxy_60s"]),
    };
  }, [summary]);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="rounded-xl border border-white/10 bg-[linear-gradient(135deg,rgba(6,10,22,0.95),rgba(8,14,25,0.92))] p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px]">
            <label className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">
              Date UTC
            </label>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="mt-1 w-full rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-sm text-neutral-100"
            />
          </div>
          <div className="min-w-[220px]">
            <label className="text-[11px] uppercase tracking-[0.2em] text-neutral-400">
              Detector Version
            </label>
            <input
              value={detectorVersion}
              onChange={(event) => setDetectorVersion(event.target.value)}
              className="mt-1 w-full rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-sm text-neutral-100"
              placeholder="shock_detector_v1"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-neutral-300 pb-1">
            <input
              type="checkbox"
              checked={acceptedOnly}
              onChange={(event) => setAcceptedOnly(event.target.checked)}
            />
            Chocs dedup acceptés
          </label>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => refreshRuns()}
              className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-neutral-200 hover:bg-white/10"
            >
              <RefreshCw size={15} />
              Refresh
            </button>
            <button
              onClick={onStart}
              disabled={starting}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
                starting
                  ? "cursor-not-allowed bg-cyan-800/40 text-cyan-200"
                  : "bg-cyan-600/30 text-cyan-100 hover:bg-cyan-500/40"
              )}
            >
              <Play size={15} />
              Lancer Shock Backtest
            </button>
          </div>
        </div>
        {job && (
          <div className="mt-3 text-xs text-neutral-300">
            Job: <span className="font-mono">{job.job_id.slice(0, 10)}</span> ·
            status <span className="font-semibold">{job.status}</span>
            {job.run_id ? (
              <>
                {" "}
                · run <span className="font-mono">{job.run_id}</span>
              </>
            ) : null}
          </div>
        )}
        {error && (
          <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4">
        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="text-xs uppercase tracking-[0.2em] text-neutral-400 mb-2">
            Runs Shock-Only
          </div>
          <div className="max-h-[520px] overflow-auto space-y-2 pr-1">
            {runs.map((run) => (
              <button
                key={run.run_id}
                onClick={() => setSelectedRunId(run.run_id)}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  selectedRunId === run.run_id
                    ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-100"
                    : "border-white/10 bg-black/20 text-neutral-300 hover:bg-white/5"
                )}
              >
                <div className="font-mono text-xs">{run.run_id}</div>
                <div className="mt-1 text-[11px] text-neutral-400">
                  {run.created_at?.replace("T", " ").slice(0, 19) ?? "n/a"}
                </div>
                <div className="mt-1 text-[11px] text-neutral-400">
                  raw {run.n_raw_shocks ?? 0} · dedup {run.n_dedup_shocks ?? 0}
                </div>
              </button>
            ))}
            {!runs.length && (
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-4 text-sm text-neutral-400">
                Aucun run disponible.
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className={cardClass}>
              <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                Raw shocks
              </div>
              <div className="mt-1 text-xl font-semibold text-white">
                {formatMaybeNum(metrics.raw, 0)}
              </div>
            </div>
            <div className={cardClass}>
              <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                Dedup shocks
              </div>
              <div className="mt-1 text-xl font-semibold text-white">
                {formatMaybeNum(metrics.dedup, 0)}
              </div>
            </div>
            <div className={cardClass}>
              <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                Coverage/day
              </div>
              <div className="mt-1 text-xl font-semibold text-white">
                {formatMaybeNum(metrics.coverage, 2)}
              </div>
            </div>
            <div className={cardClass}>
              <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                Raw/Dedup
              </div>
              <div className="mt-1 text-xl font-semibold text-white">
                {formatMaybeNum(metrics.ratio, 2)}
              </div>
            </div>
            <div className={cardClass}>
              <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                P(MFE≥1 pip,60s)
              </div>
              <div className="mt-1 text-lg font-semibold text-emerald-300">
                {formatMaybePct(metrics.pMfe60)}
              </div>
            </div>
            <div className={cardClass}>
              <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                P(MAE≥1 pip,60s)
              </div>
              <div className="mt-1 text-lg font-semibold text-rose-300">
                {formatMaybePct(metrics.pMae60)}
              </div>
            </div>
            <div className={cardClass}>
              <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                EV proxy 60s
              </div>
              <div className="mt-1 text-lg font-semibold text-cyan-200">
                {formatMaybeNum(metrics.ev60, 3)}
              </div>
            </div>
            <div className={cardClass}>
              <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                Loaded events
              </div>
              <div className="mt-1 text-lg font-semibold text-white">
                {events.length}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs uppercase tracking-[0.2em] text-neutral-400">
                Shock Events
              </div>
              {loading && (
                <div className="inline-flex items-center gap-1 text-xs text-neutral-400">
                  <Activity size={13} className="animate-pulse" />
                  loading
                </div>
              )}
            </div>
            <div className="max-h-[420px] overflow-auto rounded-lg border border-white/10">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-black/70 text-neutral-400">
                  <tr>
                    <th className="px-2 py-2 text-left">ts</th>
                    <th className="px-2 py-2 text-left">dir</th>
                    <th className="px-2 py-2 text-right">amp</th>
                    <th className="px-2 py-2 text-right">z</th>
                    <th className="px-2 py-2 text-right">mfe60</th>
                    <th className="px-2 py-2 text-right">mae60</th>
                    <th className="px-2 py-2 text-right">EV60</th>
                    <th className="px-2 py-2 text-left">ttl</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => {
                    const ev60 =
                      (event.mfe_60s ?? 0) - (event.mae_60s ?? 0);
                    return (
                      <tr
                        key={`${event.shock_id}-${event.ts}`}
                        className="border-t border-white/5"
                      >
                        <td className="px-2 py-1.5 text-neutral-300">
                          {event.ts?.replace("T", " ").slice(0, 19)}
                        </td>
                        <td className="px-2 py-1.5 text-neutral-200">
                          {event.direction}
                        </td>
                        <td className="px-2 py-1.5 text-right text-neutral-200">
                          {formatMaybeNum(event.amplitude_pips, 2)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-neutral-300">
                          {formatMaybeNum(event.z, 2)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-emerald-300">
                          {formatMaybeNum(event.mfe_60s ?? null, 2)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-rose-300">
                          {formatMaybeNum(event.mae_60s ?? null, 2)}
                        </td>
                        <td
                          className={cn(
                            "px-2 py-1.5 text-right",
                            ev60 >= 0 ? "text-cyan-200" : "text-amber-200"
                          )}
                        >
                          {formatMaybeNum(ev60, 2)}
                        </td>
                        <td className="px-2 py-1.5 text-neutral-400">
                          {event.ttl_state ?? "n/a"}
                        </td>
                      </tr>
                    );
                  })}
                  {!events.length && (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-3 py-6 text-center text-neutral-500"
                      >
                        Aucun événement chargé.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
