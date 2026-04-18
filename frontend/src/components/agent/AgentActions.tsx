type AgentActionsProps = {
  onSnapshot: () => Promise<void> | void;
  onGenerate: () => Promise<void> | void;
  loadingSnapshot: boolean;
  loadingReport: boolean;
  disabled?: boolean;
  feedback: { type: "success" | "error"; text: string } | null;
};

export function AgentActions({
  onSnapshot,
  onGenerate,
  loadingSnapshot,
  loadingReport,
  disabled,
  feedback,
}: AgentActionsProps) {
  const isBusy = loadingSnapshot || loadingReport;

  return (
    <div className="card glass">
      <div className="text-xs text-neutral-200 uppercase tracking-[0.18em] mb-2">Actions</div>
      <div className="text-sm text-neutral-400 mb-4">Déclencher manuellement un snapshot ou un rapport IA.</div>
      <div className="flex flex-wrap gap-3">
        <ActionButton
          label="Run snapshot"
          onClick={onSnapshot}
          loading={loadingSnapshot}
          disabled={disabled || isBusy}
        />
        <ActionButton
          label="Generate IA report"
          onClick={onGenerate}
          loading={loadingReport}
          disabled={disabled || isBusy}
          tone="highlight"
        />
      </div>
      {feedback && (
        <div
          className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
            feedback.type === "success"
              ? "border-green-500/40 bg-green-500/10 text-green-200"
              : "border-red-500/40 bg-red-500/10 text-red-200"
          }`}
        >
          {feedback.text}
        </div>
      )}
    </div>
  );
}

type ActionButtonProps = {
  label: string;
  onClick: () => Promise<void> | void;
  loading: boolean;
  disabled?: boolean;
  tone?: "primary" | "highlight";
};

function ActionButton({ label, onClick, loading, disabled, tone = "primary" }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition border border-white/10 shadow-lg shadow-black/30 ${
        tone === "highlight"
          ? "bg-[var(--accent)] text-black hover:brightness-110 disabled:opacity-60"
          : "bg-white/10 text-white hover:bg-white/15 disabled:opacity-60"
      }`}
    >
      {loading && <Spinner />}
      {label}
    </button>
  );
}

function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />;
}
