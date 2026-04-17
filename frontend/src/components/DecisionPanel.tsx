import React from "react";
import { DecisionResult } from "./signalDecision";

type Props = {
  decision: DecisionResult;
  sample: number;
  className?: string;
};

export function DecisionPanel({ decision, sample, className }: Props) {
  const tone =
    decision.status === "TRADE"
      ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-50"
      : decision.status === "NO TRADE"
        ? "border-amber-400/60 bg-amber-500/10 text-amber-50"
        : "border-cyan-400/60 bg-cyan-500/10 text-cyan-50";

  const confidenceTone =
    decision.confidence === "HIGH"
      ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-100"
      : decision.confidence === "MED"
        ? "bg-amber-500/20 border-amber-400/40 text-amber-100"
        : "bg-red-500/15 border-red-400/40 text-red-100";

  return (
    <div className={className ?? ""}>
      <div className={`rounded-3xl border px-4 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.45)] ${tone}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-300">Trade Decision</div>
            <div className="text-2xl font-bold">{decision.status}</div>
            <div className="text-sm text-neutral-100">{decision.reason}</div>
          </div>
          <div className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${confidenceTone}`}>
            {decision.confidence} · N={sample}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-neutral-100">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-[11px] uppercase tracking-[0.12em] text-neutral-400">Expected net (median)</div>
            <div className="text-lg font-semibold">{fmt(decision.expectedNetPips.median)} p</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-[11px] uppercase tracking-[0.12em] text-neutral-400">Expected net (p90)</div>
            <div className="text-lg font-semibold">{decision.expectedNetPips.p90 != null ? `${fmt(decision.expectedNetPips.p90)} p` : "n/a"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function fmt(v: number | null): string {
  if (v === null) return "n/a";
  return Number.isFinite(v) ? Number(v).toFixed(2) : "n/a";
}
