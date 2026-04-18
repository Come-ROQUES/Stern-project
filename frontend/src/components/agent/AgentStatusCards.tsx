import { AgentStatus } from "../../services/agentApi";

const STALE_SECONDS = 300; // 5 minutes

type AgentStatusCardsProps = {
  status: AgentStatus | null;
  loading: boolean;
  error: string | null;
  onRefresh?: () => void;
};

const toneClasses = {
  ok: "text-green-400 bg-green-500/10 border-green-500/40",
  warn: "text-amber-400 bg-amber-500/10 border-amber-500/40",
  error: "text-red-400 bg-red-500/10 border-red-500/40",
};

export function AgentStatusCards({ status, loading, error, onRefresh }: AgentStatusCardsProps) {
  const repoState = status?.repo;
  const vmState = status?.vm;
  const ageSeconds = status?.age_seconds ?? null;
  const isStale = ageSeconds != null && ageSeconds > STALE_SECONDS;

  const cleanliness = repoState?.dirty ? "DIRTY" : "CLEAN";
  const botState = vmState?.bot_service?.toLowerCase() === "running" ? "RUNNING" : vmState?.bot_service?.toUpperCase() ?? "UNKNOWN";
  const vmIncluded = vmState?.included !== false;
  const vmReachable = vmState?.reachable == null ? "N/A" : vmState.reachable ? "YES" : "NO";
  const vmTone = !vmIncluded ? "warn" : vmState?.reachable == null ? "warn" : vmState.reachable ? "ok" : "error";
  const botTone = botState === "RUNNING" ? "ok" : "error";

  return (
    <div className="card glass">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs text-neutral-200 uppercase tracking-[0.18em]">System Status</div>
          <div className="text-sm text-neutral-400">VM + Repo snapshot</div>
        </div>
        <div className="flex items-center gap-3">
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
      {!status && !loading && !error && (
        <div className="text-sm text-neutral-300">Aucun statut disponible.</div>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <StatusCard
          label="Freshness"
          value={ageSeconds != null ? `${Math.round(ageSeconds)}s old` : "Unknown"}
          tone={!status ? "warn" : isStale ? "error" : "ok"}
          hint={isStale ? "STALE (>5min)" : "Up to date"}
        />
        <StatusCard
          label="Repo State"
          value={cleanliness}
          tone={repoState ? (repoState.dirty ? "error" : "ok") : "warn"}
          hint={repoState?.status}
        />
        <StatusCard
          label="Branch"
          value={repoState?.branch || "n/a"}
          tone={repoState ? "ok" : "warn"}
          hint={`Ahead ${repoState?.ahead ?? 0} / Behind ${repoState?.behind ?? 0}`}
        />
        <StatusCard
          label="Bot Service"
          value={botState}
          tone={botTone}
          hint={vmState?.last_heartbeat ? `Last heartbeat ${vmState.last_heartbeat}` : undefined}
        />
        <StatusCard
          label="VM Reachable"
          value={!vmIncluded ? "SKIPPED" : vmReachable}
          tone={vmTone}
          hint={!vmIncluded ? "VM check non inclus dans le snapshot" : vmState?.reachable ? "Online" : vmState?.reachable === false ? "Offline" : "Unknown"}
        />
        <HealthScoreCard score={status?.health_score ?? null} />
        <StatusCard
          label="Warnings"
          value={status?.warnings?.length ? `${status.warnings.length} warning(s)` : "None"}
          tone={status?.warnings?.length ? "warn" : "ok"}
          hint={status?.warnings?.join(", ")}
        />
      </div>
    </div>
  );
}

type Tone = keyof typeof toneClasses;

function StatusCard({ label, value, tone, hint }: { label: string; value: string; tone: Tone; hint?: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 p-4 shadow-inner shadow-black/20">
      <div className="text-xs text-neutral-400 uppercase tracking-[0.14em] mb-1">{label}</div>
      <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1 text-sm font-semibold ${toneClasses[tone]}`}>
        <span className="h-2 w-2 rounded-full bg-current" />
        {value}
      </div>
      {hint && <div className="mt-2 text-xs text-neutral-400">{hint}</div>}
    </div>
  );
}

function HealthScoreCard({ score }: { score: number | null }) {
  const pct = score != null ? Math.max(0, Math.min(100, Math.round(score))) : null;
  const tone: Tone = pct == null ? "warn" : pct >= 80 ? "ok" : pct >= 50 ? "warn" : "error";

  return (
    <div className="rounded-xl border border-white/5 bg-black/20 p-4 shadow-inner shadow-black/20">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-neutral-400 uppercase tracking-[0.14em] mb-1">Health Score</div>
          <div className="text-sm text-neutral-200">{pct != null ? `${pct}/100` : "n/a"}</div>
        </div>
        <div className={`h-8 min-w-[4.5rem] rounded-lg border px-3 text-sm font-semibold flex items-center justify-center ${toneClasses[tone]}`}>
          {tone === "ok" ? "OK" : tone === "warn" ? "WARN" : "ALERT"}
        </div>
      </div>
      <div className="mt-2 h-2 rounded-full bg-white/5 overflow-hidden">
        <div
          className={`${tone === "ok" ? "bg-green-400/70" : tone === "warn" ? "bg-amber-400/70" : "bg-red-500/70"} h-full transition-all duration-300`}
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>
    </div>
  );
}
