import React from "react";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type Tone = "neutral" | "success" | "warn" | "danger" | "muted";

type KpiChipProps = {
  label: string;
  value: string;
  unit?: string;
  tone?: Tone;
  className?: string;
  compact?: boolean;
};

const toneStyles: Record<Tone, string> = {
  neutral: "border-white/10 bg-white/5 text-neutral-100",
  muted: "border-white/5 bg-white/[0.02] text-neutral-400",
  success: "border-emerald-400/60 bg-emerald-400/12 text-emerald-100",
  warn: "border-amber-300/60 bg-amber-300/12 text-amber-50",
  danger: "border-red-400/60 bg-red-500/12 text-red-100",
};

export function KpiChip({ label, value, unit, tone = "neutral", className, compact = false }: KpiChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-[7px] text-[11px] leading-none font-mono tracking-tight",
        toneStyles[tone],
        compact && "px-2 py-[6px] text-[10px]",
        className
      )}
    >
      <span className="font-sans text-[10px] uppercase tracking-[0.12em] text-neutral-400">{label}</span>
      <span className="text-[12px] font-semibold text-white">{value}</span>
      {unit ? <span className="text-[10px] text-neutral-400">{unit}</span> : null}
    </span>
  );
}
