import type { ReactNode } from "react";

type GlassPanelProps = {
  title: string;
  className?: string;
  children: ReactNode;
};

export function GlassPanel({
  title,
  className = "",
  children,
}: GlassPanelProps) {
  return (
    <article className={`glass-panel ${className}`.trim()}>
      <div className="panel-inner">
        <div className="panel-title">{title}</div>
        {children}
      </div>
    </article>
  );
}

