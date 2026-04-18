import type { ReactNode } from "react";
import { cn } from "../lib/cn";

type CardProps = {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
};

export function Card({ title, subtitle, right, className, bodyClassName, children }: CardProps) {
  return (
    <section className={cn("panel", className)}>
      {(title || right) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          <div>
            {title && <div className="panel-title">{title}</div>}
            {subtitle && <div className="text-xs text-neutral-400 mt-0.5">{subtitle}</div>}
          </div>
          {right && <div className="flex items-center gap-2">{right}</div>}
        </header>
      )}
      <div className={cn(bodyClassName)}>{children}</div>
    </section>
  );
}

type StatProps = {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
  align?: "left" | "right";
  className?: string;
};

export function Stat({ label, value, hint, tone = "default", align = "left", className }: StatProps) {
  return (
    <div className={cn("flex flex-col gap-0.5", align === "right" && "items-end text-right", className)}>
      <div className="panel-label">{label}</div>
      <div
        className={cn(
          "mono num text-base sm:text-lg leading-tight",
          tone === "good" && "text-emerald-400",
          tone === "warn" && "text-amber-300",
          tone === "bad" && "text-rose-400",
          tone === "default" && "text-white",
        )}
      >
        {value}
      </div>
      {hint && <div className="text-[11px] text-neutral-400 mt-0.5">{hint}</div>}
    </div>
  );
}

type PillProps = {
  tone?: "neutral" | "good" | "warn" | "bad" | "info";
  children: ReactNode;
  className?: string;
};

export function Pill({ tone = "neutral", children, className }: PillProps) {
  const palette = {
    neutral: "bg-white/5 text-neutral-200 border-white/10",
    good: "bg-emerald-500/10 text-emerald-300 border-emerald-400/30",
    warn: "bg-amber-400/10 text-amber-300 border-amber-300/30",
    bad: "bg-rose-500/15 text-rose-300 border-rose-400/30",
    info: "bg-cyan-400/10 text-cyan-200 border-cyan-300/30",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] uppercase tracking-wider mono",
        palette,
        className,
      )}
    >
      {children}
    </span>
  );
}

type DotProps = { tone?: "good" | "warn" | "bad" | "neutral"; pulsing?: boolean };
export function Dot({ tone = "neutral", pulsing = false }: DotProps) {
  const color = {
    good: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]",
    warn: "bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.7)]",
    bad: "bg-rose-400 shadow-[0_0_8px_rgba(248,113,113,0.7)]",
    neutral: "bg-neutral-400",
  }[tone];
  return <span className={cn("inline-block h-2 w-2 rounded-full", color, pulsing && "animate-pulse")} />;
}
