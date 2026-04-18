import { useEffect, useMemo, useState } from "react";
import { api, CalibrationReport } from "../lib/api";

type RunState = "idle" | "running" | "error" | "done";

export function CalibrationPanel() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const yesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const [report, setReport] = useState<CalibrationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runState, setRunState] = useState<RunState>("idle");
  const [selectedDate, setSelectedDate] = useState<string>(today);

  const load = async (dateStr: string) => {
    setError(null);
    try {
      const r = await api.getCalibrationReport(dateStr);
      setReport(r);
    } catch (e: any) {
      setReport(null);
      setError(e.message || "Failed to load calibration report");
    }
  };

  useEffect(() => {
    load(selectedDate);
  }, [selectedDate]);

  const handleRun = async (mode: "quick" | "full" = "quick") => {
    setRunState("running");
    try {
      await api.runCalibration(selectedDate, mode, true);
      await load(selectedDate);
      setRunState("done");
    } catch (e: any) {
      setRunState("error");
      setError(e.message || "Failed to run calibration");
    }
  };

  const verdict = report?.verdict?.status || "N/A";
  const reasons = report?.verdict?.reasons || [];
  const dq = report?.data_quality || {};
  const shocks = report?.strategy_behavior?.shocks || {};
  const trades = report?.strategy_behavior?.trades || {};
  const perf = report?.performance || {};
  const suggestions = report?.suggested_changes || [];
  const issues = report?.diagnostics?.issues || [];

  const mdUrl = `${import.meta.env.VITE_API_URL || "/react-api"}/api/calibration/report.md?date_str=${selectedDate}`;
  const jsonUrl = `${import.meta.env.VITE_API_URL || "/react-api"}/api/calibration/report?date_str=${selectedDate}`;
  const summaryText = report?.ai_summary || "";

  return (
    <div className="card space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs text-slate-400">Calibration</div>
          <div className="text-lg font-semibold">Verdict & rapport quotidien</div>
          {error && <div className="text-xs text-danger">{error}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateChip label="Aujourd'hui" value={today} active={selectedDate === today} onSelect={setSelectedDate} />
          <DateChip label="Hier" value={yesterday} active={selectedDate === yesterday} onSelect={setSelectedDate} />
          <input
            type="date"
            className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-white"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
          <button
            onClick={() => handleRun("quick")}
            className="rounded-lg border border-[rgba(0,198,255,0.5)] px-3 py-1 text-xs text-[var(--accent)] hover:bg-white/5"
            disabled={runState === "running"}
          >
            {runState === "running" ? "Running…" : "Analyze"}
          </button>
          <button
            onClick={() => handleRun("full")}
            className="rounded-lg border border-white/15 px-3 py-1 text-xs text-neutral-200 hover:bg-white/5"
            disabled={runState === "running"}
          >
            Full
          </button>
          <a
            href={mdUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-white/15 px-3 py-1 text-xs text-neutral-200 hover:bg-white/5"
          >
            Download MD
          </a>
          <a
            href={jsonUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-white/15 px-3 py-1 text-xs text-neutral-200 hover:bg-white/5"
          >
            JSON
          </a>
          <button
            onClick={() => summaryText && navigator.clipboard.writeText(summaryText)}
            className="rounded-lg border border-white/15 px-3 py-1 text-xs text-neutral-200 hover:bg-white/5"
            disabled={!summaryText}
          >
            Copy AI Summary
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Tile label="Verdict" value={verdict} hint={reasons.join(", ") || "n/a"} tone={verdictTone(verdict)} />
        <Tile label="Shocks" value={shocks.count ?? "n/a"} hint={`Accepted ${shocks.accepted ?? 0} / Rejected ${shocks.rejected ?? 0}`} />
        <Tile label="Trades" value={trades.count ?? "n/a"} hint={`PF ${fmt(perf.profit_factor)} · Win ${fmt(perf.win_rate, "%")}`} />
        <Tile label="Spread p95" value={fmt(dq?.spread_stats?.p95)} hint={`Latency p95 ${fmt(dq?.latency_stats?.p95)} ms`} />
      </div>

      <Section title="Data Quality">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-neutral-200">
          <Stat label="Spread p50" value={fmt(dq?.spread_stats?.p50)} />
          <Stat label="Spread p95" value={fmt(dq?.spread_stats?.p95)} />
          <Stat label="Latency p50" value={fmt(dq?.latency_stats?.p50, "ms")} />
          <Stat label="Latency p95" value={fmt(dq?.latency_stats?.p95, "ms")} />
        </div>
        <TagList label="Anomalies" items={dq?.anomalies || []} />
      </Section>

      <Section title="Strategy Behavior">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-neutral-200">
          <Stat label="Amplitude p50" value={fmt(shocks?.amplitude?.p50)} />
          <Stat label="Amplitude p95" value={fmt(shocks?.amplitude?.p95)} />
          <Stat label="Up shocks" value={fmt(shocks?.directions?.up)} />
          <Stat label="Down shocks" value={fmt(shocks?.directions?.down)} />
        </div>
        <TagList label="Rejection reasons" items={Object.keys(shocks?.rejection_reasons || {})} />
      </Section>

      <Section title="PnL Explain">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-neutral-200">
          <Stat label="PnL EUR" value={fmt(perf.pnl_eur_total)} />
          <Stat label="Win rate" value={fmt(perf.win_rate, "%")} />
          <Stat label="Profit factor" value={fmt(perf.profit_factor)} />
          <Stat label="Worst trade" value={fmt(perf.worst_trades?.[0]?.pnl)} />
        </div>
        <TagList label="Issues" items={issues} />
      </Section>

      <Section title="Suggested changes">
        {suggestions.length === 0 && <div className="text-xs text-neutral-500">No change suggested.</div>}
        <div className="space-y-2">
          {suggestions.map((s: any, idx: number) => (
            <div key={idx} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-neutral-100">
                  {s.param} · {s.direction}
                </div>
                <span className="text-[11px] text-neutral-400">{s.confidence || "unknown"}</span>
              </div>
              <div className="text-xs text-neutral-300">{s.rationale}</div>
              {s.risk && <div className="text-[11px] text-amber-300 mt-1">Risque: {s.risk}</div>}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function DateChip({ label, value, active, onSelect }: { label: string; value: string; active: boolean; onSelect: (v: string) => void }) {
  return (
    <button
      onClick={() => onSelect(value)}
      className={`rounded-lg border px-3 py-1 text-xs transition ${
        active ? "border-[rgba(0,198,255,0.6)] bg-white/5 text-white" : "border-white/10 text-neutral-300 hover:border-white/30"
      }`}
    >
      {label}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-neutral-100">{title}</div>
      {children}
    </div>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: "green" | "red" | "yellow" | "default" }) {
  const toneClass =
    tone === "green"
      ? "border-emerald-400/40 bg-emerald-400/10"
      : tone === "red"
        ? "border-rose-400/40 bg-rose-400/10"
        : tone === "yellow"
          ? "border-amber-300/40 bg-amber-300/10"
          : "border-white/10 bg-slate-800/50";
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="text-xs text-slate-300">{label}</div>
      <div className="text-lg font-semibold text-white">{value}</div>
      {hint && <div className="text-[11px] text-slate-200">{hint}</div>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <div className="text-[11px] text-neutral-400">{label}</div>
      <div className="text-sm font-semibold text-neutral-100">{value}</div>
    </div>
  );
}

function TagList({ label, items }: { label: string; items: string[] }) {
  if (!items || items.length === 0) {
    return <div className="text-xs text-neutral-500">{label}: n/a</div>;
  }
  return (
    <div className="flex flex-wrap gap-2 text-xs text-neutral-200">
      <span className="text-neutral-400">{label}:</span>
      {items.map((i, idx) => (
        <span key={idx} className="rounded-md border border-white/10 bg-white/5 px-2 py-1">
          {i}
        </span>
      ))}
    </div>
  );
}

function verdictTone(v: string): "green" | "yellow" | "red" | "default" {
  if (v === "GREEN") return "green";
  if (v === "YELLOW") return "yellow";
  if (v === "RED") return "red";
  return "default";
}

function fmt(v?: number | string | null, suffix: string = "") {
  if (v == null) return "n/a";
  if (typeof v === "string") return v;
  if (Number.isNaN(Number(v))) return "n/a";
  return `${Number(v).toFixed(2)}${suffix}`;
}
