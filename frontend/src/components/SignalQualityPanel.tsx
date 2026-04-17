import React from "react";
import { Signal } from "../lib/api";

type Props = {
  signal: Signal | null;
  thresholds: { minAmplitude: number; maxSpread: number; ttlBars: number };
};

export function SignalQualityPanel({ signal, thresholds }: Props) {
  if (!signal) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
        <div className="text-xs uppercase tracking-[0.16em] text-neutral-400 mb-1">Signal Quality (Ex-Ante)</div>
        <div className="text-sm text-neutral-400">No signal in scope — wait for next shock.</div>
      </div>
    );
  }

  const amplitude = Math.abs(signal.delta_pips ?? 0);
  const spread = signal.spread_pips ?? 0;
  const z = signal.z_score ?? 0;
  const regime = signal.volatility_regime ?? "UNKNOWN";
  const ttr = signal.time_to_reflex_bars ?? signal.ttr_bars ?? null;
  const probReflex = signal.reversion_ratio ?? null;
  const spreadRel = amplitude > 0 ? spread / amplitude : null;
  const verdict = computeVerdict(amplitude, spread, thresholds.minAmplitude, thresholds.maxSpread);

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-neutral-400">Signal Quality (Ex-Ante)</div>
          <div className="text-lg font-semibold text-white">Current signal</div>
        </div>
        <Badge verdict={verdict} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-neutral-100">
        <Metric label="Amplitude" value={`${fmt(amplitude)} p`} hint={`Min ${thresholds.minAmplitude} p`} />
        <Metric label="Z-score" value={fmt(z)} hint="Current z" />
        <Metric label="Spread" value={`${fmt(spread)} p`} hint={`Max ${thresholds.maxSpread} p`} />
        <Metric label="Spread / Amp" value={spreadRel != null ? fmt(spreadRel) : "n/a"} hint="Lower is better" />
        <Metric label="Regime" value={regime} />
        <Metric label="P(reflex)" value={probReflex != null ? fmt(probReflex) : "n/a"} hint={ttr != null ? `ttr=${ttr} bars` : undefined} />
      </div>
    </div>
  );
}

function computeVerdict(amplitude: number, spread: number, minAmp: number, maxSpread: number): "VALID" | "WEAK" | "INVALID" {
  if (amplitude === 0) return "INVALID";
  if (amplitude >= minAmp && spread <= maxSpread) return "VALID";
  if (amplitude >= minAmp * 0.8 && spread <= maxSpread * 1.2) return "WEAK";
  return "INVALID";
}

function Badge({ verdict }: { verdict: string }) {
  const tone =
    verdict === "VALID"
      ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-100"
      : verdict === "WEAK"
        ? "border-amber-400/60 bg-amber-500/10 text-amber-100"
        : "border-rose-400/60 bg-rose-500/10 text-rose-100";
  return (
    <div className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${tone}`}>
      {verdict}
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
      <div className="text-[11px] uppercase tracking-[0.12em] text-neutral-400">{label}</div>
      <div className="font-semibold text-white">{value}</div>
      {hint && <div className="text-[10px] text-neutral-500">{hint}</div>}
    </div>
  );
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return "n/a";
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
}
