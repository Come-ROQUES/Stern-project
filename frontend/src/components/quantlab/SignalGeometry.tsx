import React from "react";
import { SignalAnalyticsGraph } from "../graphs/SignalAnalyticsGraph";
import { BentoCard, QuantLabLayout } from "./ui";

/**
 * SignalGeometry — Quant Lab module
 * Graph-mode view (density, frontier) scoped by explicit run selection.
 */
export function SignalGeometry() {
  const handleBack = () => {
    if (typeof window !== "undefined") {
      window.location.hash = "#quant-geometry";
    }
  };

  return (
    <QuantLabLayout
      title="Signal Geometry"
      description="Géométrie des signaux (densité, filtres, frontier). Utilise Plotly, pas de prix live."
    >
      <BentoCard className="p-3">
        <SignalAnalyticsGraph onBack={handleBack} />
      </BentoCard>
    </QuantLabLayout>
  );
}
