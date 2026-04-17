import React from "react";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type BentoCardProps = {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  padding?: "sm" | "md";
};

export function BentoCard({ title, subtitle, action, children, className, padding = "md" }: BentoCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-clip rounded-2xl border border-white/8 bg-white/[0.03] shadow-[0_18px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-transform duration-150 ease-out hover:-translate-y-[1px] hover:border-white/12",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.65]" style={{ backgroundImage: "linear-gradient(120deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 35%, transparent 60%), radial-gradient(circle at 18% 16%, rgba(44, 227, 255, 0.12), transparent 32%), radial-gradient(circle at 84% 10%, rgba(124, 121, 255, 0.12), transparent 36%)" }} />
      <div className={cn("relative flex flex-col gap-3", padding === "sm" ? "p-3 sm:p-3.5" : "p-4 sm:p-5")}>
        {(title || action) && (
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              {title ? <div className="text-[11px] uppercase tracking-[0.14em] text-neutral-400">{title}</div> : null}
              {subtitle ? <div className="text-sm text-neutral-200">{subtitle}</div> : null}
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
