import React from "react";
import { BentoCard, QuantLabLayout, QuantSkeleton } from "./ui";

/**
 * StressRegimes — Quant Lab module
 * Placeholder for stress testing / regime analysis (multi-run, heavy analytics).
 */
export function StressRegimes() {
  return (
    <QuantLabLayout
      title="Stress Regimes"
      description="Cadre pour rejouer des régimes (vol, spread, chocs extrêmes) hors du flux live."
    >
      <BentoCard className="space-y-3 p-4">
        <div className="quant-section-title">Coming soon</div>
        <div className="text-sm text-slate-700">
          TODO: ajouter les stress tests multi-run (volatility spikes, spread shocks, gaps) avec loaders
          explicites pour datasets volumineux (datashader/Plotly autorisés).
        </div>
        <QuantSkeleton lines={6} />
      </BentoCard>
    </QuantLabLayout>
  );
}
