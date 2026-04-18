import { useCallback, useEffect, useRef, useState } from "react";
import { AgentActions } from "../components/agent/AgentActions";
import { AgentDiagnosis } from "../components/agent/AgentDiagnosis";
import { AgentStatusCards } from "../components/agent/AgentStatusCards";
import { agentApi, AgentReport, AgentStatus, AGENT_API_CONFIGURED, AGENT_API_BASE } from "../services/agentApi";

const normalizeStatus = (raw: any): AgentStatus => {
  const repo = raw?.repo || {};
  const vm = raw?.vm || {};
  const toInt = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const reachable = typeof vm.reachable === "boolean" ? vm.reachable : null;
  return {
    timestamp: raw?.timestamp ?? raw?.ts ?? null,
    age_seconds: raw?.age_seconds ?? null,
    repo: {
      branch: repo.branch ?? "n/a",
      dirty: !!repo.dirty,
      ahead: toInt(repo.ahead),
      behind: toInt(repo.behind),
      status: repo.status ?? undefined,
    },
    vm: {
      reachable,
      bot_service: vm.bot_service ?? "UNKNOWN",
      last_heartbeat: vm.last_heartbeat ?? vm.timestamp ?? null,
      included: typeof vm.included === "boolean" ? vm.included : undefined,
    },
    health_score: raw?.health_score ?? null,
    vm_included: raw?.vm_included ?? vm?.included ?? undefined,
    warnings: Array.isArray(raw?.warnings) ? raw.warnings : [],
    errors: Array.isArray(raw?.errors) ? raw.errors : [],
  };
};

export function AgentSupervisor() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [report, setReport] = useState<AgentReport | null>(null);
  const [statusLoading, setStatusLoading] = useState<boolean>(true);
  const [reportLoading, setReportLoading] = useState<boolean>(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<{ snapshot: boolean; report: boolean }>({ snapshot: false, report: false });
  const [agentReady, setAgentReady] = useState<boolean>(AGENT_API_CONFIGURED);
  const [lastStatusAt, setLastStatusAt] = useState<Date | null>(null);
  const [lastReportAt, setLastReportAt] = useState<Date | null>(null);
  const [pendingSince, setPendingSince] = useState<Date | null>(null);
  const [debugStatus, setDebugStatus] = useState<string | null>(null);
  const [debugReport, setDebugReport] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadStatus = useCallback(async () => {
    if (!AGENT_API_CONFIGURED) {
      setStatusError("Agent API non configurée");
      setStatusLoading(false);
      setAgentReady(false);
      return;
    }
    setAgentReady(false);
    setStatusLoading(true);
    setStatusError(null);
    setPendingSince(new Date());
    const timeoutId = setTimeout(() => {
      if (!mountedRef.current) return;
      setStatusLoading(false);
      setStatusError("Agent API lente ou bloquée (timeout)");
      setAgentReady(false);
      setDebugStatus("timeout");
    }, 6_000);
    try {
      const res = await agentApi.getStatus();
      const normalized = normalizeStatus(res as any);
      if (!mountedRef.current) return;
      setStatus(normalized);
      setAgentReady(true);
      setLastStatusAt(new Date());
      setDebugStatus(JSON.stringify(normalized));
    } catch (err: any) {
      if (!mountedRef.current) return;
      // eslint-disable-next-line no-console
      console.error("Agent status failed", err);
      setStatusError(err?.message || "Failed to load status");
      setAgentReady(false);
      setDebugStatus(err?.message || "error");
    } finally {
      if (mountedRef.current) {
        setStatusLoading(false);
      }
      clearTimeout(timeoutId);
      setPendingSince(null);
    }
  }, []);

  const loadReport = useCallback(async () => {
    if (!AGENT_API_CONFIGURED) {
      setReportError("Agent API non configurée");
      setReportLoading(false);
      setAgentReady(false);
      return;
    }
    setAgentReady(false);
    setReportLoading(true);
    setReportError(null);
    setPendingSince(new Date());
    const timeoutId = setTimeout(() => {
      if (!mountedRef.current) return;
      setReportLoading(false);
      setReportError("Agent API lente ou bloquée (timeout)");
      setAgentReady(false);
      setDebugReport("timeout");
    }, 6_000);
    try {
      const res = await agentApi.getLatestReport();
      if (!mountedRef.current) return;
      setReport(res);
      setAgentReady(true);
      setLastReportAt(new Date());
      setDebugReport(JSON.stringify(res));
    } catch (err: any) {
      if (!mountedRef.current) return;
      // eslint-disable-next-line no-console
      console.error("Agent report failed", err);
      setReportError(err?.message || "Failed to load report");
      setAgentReady(false);
      setDebugReport(err?.message || "error");
    } finally {
      if (mountedRef.current) {
        setReportLoading(false);
      }
      clearTimeout(timeoutId);
      setPendingSince(null);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadReport();
    if (!AGENT_API_CONFIGURED) return;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      loadStatus();
      loadReport();
    }, 30_000);
    return () => clearInterval(id);
  }, [loadStatus, loadReport]);

  const handleSnapshot = useCallback(async () => {
    if (!AGENT_API_CONFIGURED) {
      setActionFeedback({ type: "error", text: "Agent API non configurée" });
      return;
    }
    setActionFeedback(null);
    setAgentReady(false);
    setActionLoading((s) => ({ ...s, snapshot: true }));
    try {
      await agentApi.runSnapshot();
      if (!mountedRef.current) return;
      setActionFeedback({ type: "success", text: "Snapshot triggered successfully." });
      await loadStatus();
    } catch (err: any) {
      if (!mountedRef.current) return;
      setActionFeedback({ type: "error", text: err?.message || "Snapshot failed." });
      setAgentReady(false);
    } finally {
      if (mountedRef.current) {
        setActionLoading((s) => ({ ...s, snapshot: false }));
      }
    }
  }, [loadStatus]);

  const handleGenerateReport = useCallback(async () => {
    if (!AGENT_API_CONFIGURED) {
      setActionFeedback({ type: "error", text: "Agent API non configurée" });
      return;
    }
    setActionFeedback(null);
    setAgentReady(false);
    setActionLoading((s) => ({ ...s, report: true }));
    try {
      await agentApi.generateReport();
      if (!mountedRef.current) return;
      setActionFeedback({ type: "success", text: "IA report generation requested." });
      await loadReport();
    } catch (err: any) {
      if (!mountedRef.current) return;
      const msg = err?.message || "Report generation failed.";
      const friendly =
        msg.toLowerCase().includes("not implemented")
          ? "IA report non implémenté sur cet agent."
          : msg;
      setActionFeedback({ type: "error", text: friendly });
      setAgentReady(false);
    } finally {
      if (mountedRef.current) {
        setActionLoading((s) => ({ ...s, report: false }));
      }
    }
  }, [loadReport]);

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs text-neutral-200 uppercase tracking-[0.18em]">
          <ShieldIcon />
          <span>Agent Supervisor</span>
        </div>
        <h2 className="text-xl font-semibold">Etat VM, repo et diagnostic IA</h2>
        <p className="text-sm text-neutral-400">
          Suivi temps réel et déclenchement manuel des snapshots / rapports. Reste lisible même si l&apos;API est indisponible.
        </p>
        {!AGENT_API_CONFIGURED && (
          <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Agent API non configurée : définis VITE_AGENT_API_BASE_URL ou assure-toi d&apos;accéder au front depuis le navigateur (fallback dev sur http://localhost:8005).
          </div>
        )}
        {AGENT_API_CONFIGURED && (
          <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-neutral-300">
            Agent API: {AGENT_API_BASE}
            {statusError && <span className="ml-2 text-red-300">Status err: {statusError}</span>}
            {reportError && <span className="ml-2 text-red-300">Report err: {reportError}</span>}
            {!agentReady && !statusError && !reportError && (
              <span className="ml-2 text-amber-200">
                En attente de réponse... {pendingSince ? `(${Math.round((Date.now() - pendingSince.getTime()) / 1000)}s)` : ""}
              </span>
            )}
            {lastStatusAt && <span className="ml-2 text-neutral-400">Status @ {lastStatusAt.toLocaleTimeString()}</span>}
            {lastReportAt && <span className="ml-2 text-neutral-400">Report @ {lastReportAt.toLocaleTimeString()}</span>}
            {debugStatus && <span className="block text-[11px] text-neutral-500 mt-1">Payload status: {debugStatus.slice(0, 120)}...</span>}
            {debugReport && <span className="block text-[11px] text-neutral-500 mt-1">Payload report: {debugReport.slice(0, 120)}...</span>}
          </div>
        )}
      </header>

      <section aria-label="System status">
        <AgentStatusCards
          status={status}
          loading={statusLoading && AGENT_API_CONFIGURED}
          error={statusError}
          onRefresh={AGENT_API_CONFIGURED ? loadStatus : undefined}
        />
      </section>

      <section aria-label="IA diagnosis">
        <AgentDiagnosis report={report} loading={reportLoading && AGENT_API_CONFIGURED} error={reportError} onRefresh={AGENT_API_CONFIGURED ? loadReport : undefined} />
      </section>

      <section aria-label="Actions">
        <AgentActions
          onSnapshot={handleSnapshot}
          onGenerate={handleGenerateReport}
          loadingSnapshot={actionLoading.snapshot}
          loadingReport={actionLoading.report}
          feedback={actionFeedback}
        />
      </section>
    </div>
  );
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-[var(--accent)]">
      <path
        d="M12 3 5 6v6c0 4.5 3.5 8.2 7 9 3.5-.8 7-4.5 7-9V6l-7-3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="currentColor"
        fillOpacity="0.08"
      />
    </svg>
  );
}
