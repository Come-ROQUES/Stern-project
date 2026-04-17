import { Download, Maximize2, Settings2 } from "lucide-react";
import React from "react";

type GraphPanelProps = {
  title: string;
  description?: string;
  actions?: {
    onFullscreen?: () => void;
    onDownload?: () => void;
    onSettings?: () => void;
  };
  children: React.ReactNode;
};

export function GraphPanel({ title, description, actions, children }: GraphPanelProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl shadow-[0_16px_60px_rgba(0,0,0,0.45)]">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-100/70">Graph Mode</div>
          <div className="text-lg font-semibold text-white">{title}</div>
          {description && <div className="text-xs text-neutral-400">{description}</div>}
        </div>
        <div className="flex items-center gap-2 text-neutral-400">
          {actions?.onFullscreen && (
            <button
              type="button"
              onClick={actions.onFullscreen}
              className="rounded-lg border border-white/10 bg-white/5 p-2 hover:border-cyan-400/60 hover:bg-cyan-500/10 transition"
              title="Fullscreen panel"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          )}
          {actions?.onDownload && (
            <button
              type="button"
              onClick={actions.onDownload}
              className="rounded-lg border border-white/10 bg-white/5 p-2 hover:border-cyan-400/60 hover:bg-cyan-500/10 transition"
              title="Download image/CSV"
            >
              <Download className="h-4 w-4" />
            </button>
          )}
          {actions?.onSettings && (
            <button
              type="button"
              onClick={actions.onSettings}
              className="rounded-lg border border-white/10 bg-white/5 p-2 hover:border-cyan-400/60 hover:bg-cyan-500/10 transition"
              title="Panel settings"
            >
              <Settings2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div className="rounded-xl border border-white/5 bg-black/20 p-2 min-h-[240px]">{children}</div>
    </div>
  );
}
