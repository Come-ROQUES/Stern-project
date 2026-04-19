import React from "react";
import { useDeskMode } from "../HeaderControls";

export function GraphModeButton({ to }: { to: string }) {
  const { setAppMode } = useDeskMode();
  return (
    <button
      type="button"
      onClick={() => {
        const targetHash = to.startsWith('#') ? to : `#${to.replace(/^#/, '')}`;
        setAppMode('quant');
        window.location.hash = targetHash;
      }}
      className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-white transition hover:border-cyan-400/60 hover:bg-cyan-500/10"
    >
      Graph Mode
    </button>
  );
}
