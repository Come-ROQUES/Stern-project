import React from "react";
import { ChevronDown } from "lucide-react";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type DecisionBandProps = {
  compact: React.ReactNode;
  expanded?: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
};

export function DecisionBand({ compact, expanded, isExpanded, onToggle }: DecisionBandProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl transition-all duration-200 ease-out shadow-[0_18px_60px_rgba(0,0,0,0.4)]",
        isExpanded ? "max-h-none" : "max-h-[72px]"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="group relative flex w-full flex-col gap-2 px-3.5 py-3 text-left"
      >
        <div className="pointer-events-none absolute inset-0 opacity-[0.7]" style={{ backgroundImage: "linear-gradient(90deg, rgba(44,227,255,0.08), transparent 55%), linear-gradient(120deg, rgba(255,255,255,0.06) 1px, transparent 1px)" }} />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />
        <div className="relative flex min-h-[44px] items-center gap-2 overflow-x-auto whitespace-nowrap pr-6 no-scrollbar">
          {compact}
          <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-neutral-300">
            View
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", isExpanded ? "rotate-180" : "")} />
          </span>
        </div>
        {expanded ? (
          <div
            className={cn("relative grid gap-3 transition-all duration-200 ease-out", isExpanded ? "opacity-100 max-h-[2000px]" : "max-h-0 opacity-0")}
          >
            {expanded}
          </div>
        ) : null}
      </button>
    </div>
  );
}
