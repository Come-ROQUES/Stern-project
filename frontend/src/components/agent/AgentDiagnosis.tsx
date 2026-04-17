import type { ReactNode } from "react";
import { AgentReport } from "../../services/agentApi";

const STALE_REPORT_SECONDS = 600; // 10 minutes

type AgentDiagnosisProps = {
  report: AgentReport | null;
  loading: boolean;
  error: string | null;
  onRefresh?: () => void;
};

export function AgentDiagnosis({ report, loading, error, onRefresh }: AgentDiagnosisProps) {
  const confidencePct = report ? Math.round((report.confidence ?? 0) * 100) : null;
  const ageSeconds = report?.age_seconds ?? null;
  const isStale = ageSeconds != null && ageSeconds > STALE_REPORT_SECONDS;

  return (
    <div className="card glass">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs text-neutral-200 uppercase tracking-[0.18em]">IA Diagnosis</div>
          <div className="text-sm text-neutral-400">Dernier rapport généré</div>
        </div>
        <div className="flex items-center gap-3">
          {isStale && report && <Badge tone="warn">STALE</Badge>}
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="text-xs text-neutral-200 hover:text-white transition underline-offset-4 hover:underline"
              disabled={loading}
            >
              Refresh
            </button>
          )}
          {loading && <span className="text-xs text-neutral-400">Loading...</span>}
          {error && <span className="text-xs text-red-400">Failed: {error}</span>}
        </div>
      </div>

      {!report && !loading && !error && <div className="text-sm text-neutral-300">Aucun rapport disponible.</div>}

      {report && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/5 bg-black/20 p-4">
            <div className="text-xs uppercase tracking-[0.14em] text-neutral-400 mb-2">Summary</div>
            <div className="text-neutral-100 text-sm leading-relaxed">{report.summary}</div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <DiagList title="What changed" items={report.what_changed} />
            <DiagList title="Risks" items={report.risks} tone="warn" />
            <DiagList title="Suggested actions" items={report.suggested_actions} tone="ok" />
          </div>

          <div className="flex items-center gap-3 text-sm text-neutral-300">
            <Badge tone="ok">Confidence {confidencePct != null ? `${confidencePct}%` : "n/a"}</Badge>
            {ageSeconds != null && (
              <Badge tone={isStale ? "warn" : "ok"}>
                Age {Math.round(ageSeconds)}s {isStale ? "STALE" : "fresh"}
              </Badge>
            )}
            {report.generated_at && <span className="text-xs text-neutral-400">Generated at {report.generated_at}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function DiagList({ title, items, tone = "warn" }: { title: string; items: string[]; tone?: Tone }) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 p-4">
      <div className="text-xs uppercase tracking-[0.14em] text-neutral-400 mb-2">{title}</div>
      {items && items.length ? (
        <ul className="space-y-1 text-sm text-neutral-100 list-disc list-inside">
          {items.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      ) : (
        <div className="text-xs text-neutral-400">No items.</div>
      )}
    </div>
  );
}

type Tone = "ok" | "warn" | "error";

function Badge({ children, tone = "ok" }: { children: ReactNode; tone?: Tone }) {
  const toneClass =
    tone === "ok"
      ? "text-green-300 bg-green-500/10 border-green-500/40"
      : tone === "warn"
        ? "text-amber-300 bg-amber-500/10 border-amber-500/40"
        : "text-red-300 bg-red-500/10 border-red-500/40";
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1 font-semibold ${toneClass}`}>
      <span className="h-2 w-2 rounded-full bg-current" />
      {children}
    </span>
  );
}
