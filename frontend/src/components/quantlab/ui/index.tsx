import React, { ReactNode, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Download,
  Image as ImageIcon,
  Maximize2,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { PlotlyChart, type PlotlySelection } from "../../graphs/PlotlyChart";
import { quantLabCssVariables } from "./theme";
import "./quantlab.css";

type PanelProps = {
  children: ReactNode;
  className?: string;
  padding?: string;
};

export function GlassPanel({
  children,
  className,
  padding = "p-5",
}: PanelProps) {
  return (
    <div className={cn("ql-glass", padding, className)}>
      {children}
    </div>
  );
}

export function PaperPanel({
  children,
  className,
  padding = "p-5",
}: PanelProps) {
  return (
    <div className={cn("ql-paper", padding, className)}>
      {children}
    </div>
  );
}

export function KpiStat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "success" | "warn" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-[var(--ql-success)]"
      : tone === "warn"
        ? "text-[var(--ql-warn)]"
        : tone === "danger"
          ? "text-[var(--ql-danger)]"
          : "text-[var(--ql-strong)]";
  return (
    <div className="ql-kpi">
      <div className="ql-kpi-label">{label}</div>
      <div className={cn("ql-kpi-value", toneClass)}>{value}</div>
      {hint && <div className="ql-kpi-hint">{hint}</div>}
    </div>
  );
}

export type SegmentedOption = {
  label: string;
  value: string;
  disabled?: boolean;
};

export function SegmentedControl({
  value,
  options,
  onChange,
}: {
  value: string;
  options: SegmentedOption[];
  onChange: (val: string) => void;
}) {
  return (
    <div className="ql-segmented">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => !opt.disabled && onChange(opt.value)}
          className={cn(opt.value === value && "active", "transition-all")}
          disabled={opt.disabled}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function IconButton({
  icon,
  label,
  variant = "ghost",
  active,
  tooltip,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
  active?: boolean;
  tooltip?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const base = "ql-icon-button";
  const tone =
    variant === "primary"
      ? "primary"
      : variant === "ghost"
        ? "ghost"
        : "";
  return (
    <button
      type="button"
      className={cn(base, tone, active && "ring-2 ring-[var(--ql-accent)]")}
      title={tooltip || label}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
}) {
  return (
    <div className="ql-empty">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-[var(--ql-border)] bg-white/5 text-[var(--ql-muted)]">
        {icon || <Sparkles className="h-4 w-4" />}
      </div>
      <div className="text-sm font-medium text-[var(--ql-strong)]">{title}</div>
      {description && (
        <div className="mt-1 text-xs text-[var(--ql-muted)]">
          {description}
        </div>
      )}
      {actionLabel && onAction && (
        <div className="mt-3">
          <IconButton
            icon={<ArrowUpRight className="h-4 w-4" />}
            label={actionLabel}
            variant="secondary"
            onClick={onAction}
          />
        </div>
      )}
    </div>
  );
}

export function QuantEmptyState({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <EmptyState
      title={message}
      description={undefined}
      actionLabel={actionLabel}
      onAction={onAction}
    />
  );
}

export function QuantSkeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, idx) => (
        <div key={idx} className="ql-skeleton-line" />
      ))}
    </div>
  );
}

export function MetricPill({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <span className="ql-chip">
      <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--ql-muted)]">
        {label}
      </span>
      <span className="font-semibold text-[var(--ql-strong)]">{value}</span>
    </span>
  );
}

export function ToolbarButton({
  icon,
  label,
  onClick,
  disabled,
  active,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <IconButton
      icon={icon}
      label={label}
      onClick={onClick}
      disabled={disabled}
      active={active}
      variant="secondary"
    />
  );
}

export function BentoCard({
  children,
  className,
  padding = "p-5",
}: PanelProps) {
  return (
    <GlassPanel className={className} padding={padding}>
      {children}
    </GlassPanel>
  );
}

type QuantLabLayoutProps = {
  title: string;
  subtitle?: string;
  description?: string;
  context?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
};

export function QuantLabLayout({
  title,
  subtitle,
  description,
  context,
  filters,
  actions,
  children,
}: QuantLabLayoutProps) {
  const sub = subtitle || description;
  return (
    <div className="quantlab-shell" style={quantLabCssVariables}>
      <div className="quantlab-container">
        <div className="quantlab-header">
          <div className="quantlab-header-bar">
            <div>
              <div className="ql-section-label mb-1">Quant Lab</div>
              <div className="quantlab-header-title">{title}</div>
              {sub && <div className="quantlab-header-subtitle">{sub}</div>}
            </div>
            <div className="quantlab-filter-bar">{filters}</div>
            <div className="quantlab-actions">{actions}</div>
          </div>
          {context && <div className="mt-3">{context}</div>}
        </div>
        <div className="space-y-6">{children}</div>
      </div>
    </div>
  );
}

type QuantPlotlyCardProps = {
  title: string;
  subtitle?: string;
  data: any[];
  layout?: any;
  config?: any;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  footer?: ReactNode;
  className?: string;
  matplotlibUrl?: string;
  rendererDefault?: "plotly" | "matplotlib";
  onRefresh?: () => void;
  onRelayout?: (event: any) => void;
  onSelected?: (selection: PlotlySelection) => void;
  onDeselect?: () => void;
  selectionActive?: boolean;
  selectionLabel?: string;
};

export function QuantPlotlyCard({
  title,
  subtitle,
  data,
  layout,
  config,
  loading,
  error,
  empty,
  footer,
  className,
  matplotlibUrl,
  rendererDefault = "plotly",
  onRefresh,
  onRelayout,
  onSelected,
  onDeselect,
  selectionActive,
  selectionLabel,
}: QuantPlotlyCardProps) {
  const [renderer, setRenderer] = useState<"plotly" | "matplotlib">(rendererDefault);
  const [renderKey, setRenderKey] = useState(0);
  const [chartCtx, setChartCtx] = useState<{ el: HTMLDivElement; plotly: any } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const plotlyLayout = useMemo(
    () => ({
      hovermode: "closest",
      legend: { orientation: "h", x: 0, y: 1.1 },
      ...layout,
    }),
    [layout],
  );

  const plotlyConfig = useMemo(
    () => ({
      displaylogo: false,
      responsive: true,
      scrollZoom: true,
      doubleClick: "reset",
      displayModeBar: true,
      modeBarButtonsToAdd: ["select2d", "lasso2d"],
      ...(config || {}),
    }),
    [config],
  );

  const showMatplotlibToggle = !!matplotlibUrl;
  const effectiveRenderer = showMatplotlibToggle ? renderer : "plotly";

  const handleReset = () => setRenderKey((k) => k + 1);

  const handleDownload = async (format: "png" | "svg") => {
    if (!chartCtx) return;
    try {
      const uri = await chartCtx.plotly.toImage(chartCtx.el, {
        format,
        width: 1400,
        height: 900,
      });
      const link = document.createElement("a");
      link.href = uri;
      link.download = `${title.replace(/\s+/g, "_")}.${format}`;
      link.click();
    } catch {
      /* silent */
    }
  };

  const cardBody = () => {
    if (error) return <EmptyState title="Erreur" description={error} />;
    if (loading) return <QuantSkeleton lines={6} />;
    if (empty) return <EmptyState title="Empty" description="Aucune donnée à afficher." />;
    if (effectiveRenderer === "matplotlib" && matplotlibUrl) {
      return <QuantFigureImage src={matplotlibUrl} alt={title} />;
    }
    return (
      <PlotlyChart
        key={renderKey}
        data={data}
        layout={plotlyLayout}
        config={plotlyConfig}
        className="w-full"
        onReady={(el, plotly) => setChartCtx({ el, plotly })}
        onRelayout={onRelayout}
        onSelected={onSelected}
        onDeselect={onDeselect}
      />
    );
  };

  const chartActions = (
    <div className="flex items-center gap-2">
      {selectionActive && (
        <span className="ql-chip">
          {selectionLabel || "Selection active"}
        </span>
      )}
      {showMatplotlibToggle && (
        <IconButton
          icon={<ImageIcon className="h-4 w-4" />}
          label={renderer === "matplotlib" ? "Matplotlib" : "Plotly"}
          variant="secondary"
          active={renderer === "matplotlib"}
          onClick={() => setRenderer(renderer === "plotly" ? "matplotlib" : "plotly")}
        />
      )}
      {onRefresh && (
        <IconButton
          icon={<RefreshCw className="h-4 w-4" />}
          label="Refresh"
          variant="secondary"
          onClick={onRefresh}
        />
      )}
      <IconButton
        icon={<RotateCcw className="h-4 w-4" />}
        label="Reset"
        variant="ghost"
        onClick={handleReset}
      />
      <IconButton
        icon={<Download className="h-4 w-4" />}
        label="PNG"
        variant="ghost"
        onClick={() => handleDownload("png")}
        disabled={!chartCtx}
      />
      <IconButton
        icon={<ArrowUpRight className="h-4 w-4" />}
        label="Fullscreen"
        variant="ghost"
        onClick={() => setFullscreen(true)}
      />
    </div>
  );

  const content = (
    <PaperPanel className={cn("space-y-4", className)} padding="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="ql-section-label">Graph</div>
          <div className="text-lg font-semibold text-slate-900">{title}</div>
          {subtitle && <div className="text-sm text-slate-600">{subtitle}</div>}
        </div>
        {chartActions}
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-2 min-h-[280px]">
        {cardBody()}
      </div>
      {footer}
    </PaperPanel>
  );

  if (!fullscreen) return content;

  return (
    <>
      {content}
      <div className="fixed inset-0 z-40 bg-slate-900/70 backdrop-blur-sm">
        <div className="absolute inset-4 overflow-auto">
          <PaperPanel className="h-full space-y-4" padding="p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="ql-section-label">Fullscreen</div>
                <div className="text-lg font-semibold text-slate-900">{title}</div>
              </div>
              <IconButton
                icon={<Maximize2 className="h-4 w-4" />}
                label="Close"
                onClick={() => setFullscreen(false)}
              />
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-3 min-h-[420px]">
              {cardBody()}
            </div>
          </PaperPanel>
        </div>
      </div>
    </>
  );
}

export function QuantFigureImage({ src, alt }: { src: string; alt?: string }) {
  const [zoomed, setZoomed] = useState(false);
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white">
      <img
        src={src}
        alt={alt}
        className={cn(
          "transition duration-200 ease-out cursor-zoom-in",
          zoomed ? "scale-110" : "scale-100",
        )}
        onClick={() => setZoomed((z) => !z)}
      />
    </div>
  );
}
