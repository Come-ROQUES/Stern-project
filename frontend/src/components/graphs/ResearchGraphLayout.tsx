import { ArrowLeft, Clock3, RefreshCw, SlidersHorizontal } from "lucide-react";
import React from "react";
import { useRunId, useRunMeta } from "../../lib/useRunContext";
import { DataScope } from "../../lib/activeContext";
import {
  IconButton,
  MetricPill,
  QuantLabLayout,
  SegmentedControl,
} from "../quantlab/ui";

type ResearchGraphLayoutProps = {
  title: string;
  subtitle?: string;
  onBack: () => void;
  scopeLabel?: string;
  children: React.ReactNode;
  toolbar?: {
    timeframe: string;
    onTimeframeChange?: (tf: string) => void;
    scope?: DataScope | string;
    onScopeChange?: (scope: DataScope) => void;
    onRefresh?: () => void;
    toggles?: React.ReactNode;
  };
};

const timeframes = ["1m", "5m", "15m", "1h", "1d"] as const;

function formatScopeLabel(scope: DataScope | string | undefined): string {
  if (!scope) return "TODAY";
  if (typeof scope === "string") return scope;
  if (scope.scope === "TODAY") return "TODAY";
  if (scope.scope === "YESTERDAY") return "YESTERDAY";
  if (scope.scope === "DATE") return `DATE ${scope.date}`;
  if (scope.scope === "RANGE") return `RANGE ${scope.from_date}→${scope.to_date}`;
  return "TODAY";
}

export function ResearchGraphLayout({
  title,
  subtitle,
  onBack,
  scopeLabel,
  children,
  toolbar,
}: ResearchGraphLayoutProps) {
  const runId = useRunId();
  const { run } = useRunMeta();

  const handleBackClick = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (typeof window !== "undefined") {
      window.location.hash = "#quant-edge";
    }
  };

  const filtersBar = toolbar ? (
    <div className="flex flex-wrap items-center gap-2">
      <Clock3 className="h-4 w-4 text-[var(--ql-accent)]" />
      <SegmentedControl
        value={toolbar.timeframe}
        options={timeframes.map((tf) => ({ label: tf, value: tf }))}
        onChange={(tf) => toolbar.onTimeframeChange?.(tf)}
      />
      <div className="flex items-center gap-2 text-xs text-[var(--ql-muted)]">
        <SlidersHorizontal className="h-4 w-4" />
        <span>Scope: {formatScopeLabel(toolbar.scope)}</span>
      </div>
      {toolbar.toggles}
    </div>
  ) : undefined;

  const contextRow = (
    <div className="flex flex-wrap items-center gap-2">
      {scopeLabel && <MetricPill label="Scope" value={scopeLabel} />}
      {runId && <MetricPill label="Run" value={runId.slice(0, 8)} />}
      {run?.strategy_id && (
        <MetricPill
          label="Strategy"
          value={`${run.strategy_id} · ${run.strategy_version ?? "v?"}`}
        />
      )}
    </div>
  );

  const actions = (
    <div className="flex items-center gap-2">
      <IconButton
        icon={<ArrowLeft className="h-4 w-4" />}
        label="Back"
        variant="ghost"
        onClick={handleBackClick}
      />
      {toolbar?.onRefresh && (
        <IconButton
          icon={<RefreshCw className="h-4 w-4" />}
          label="Refresh"
          variant="secondary"
          onClick={toolbar.onRefresh}
        />
      )}
    </div>
  );

  return (
    <QuantLabLayout
      title={title}
      subtitle={subtitle || "Graph Mode"}
      filters={filtersBar}
      actions={actions}
      context={contextRow}
    >
      <div className="grid gap-4">{children}</div>
    </QuantLabLayout>
  );
}
