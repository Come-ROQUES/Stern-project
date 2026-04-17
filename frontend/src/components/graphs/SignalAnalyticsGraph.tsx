import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, SlidersHorizontal, Sparkles } from "lucide-react";
import { api, Signal } from "../../lib/api";
import {
  ActiveContext,
  DataScope,
  activeContext,
  defaultScope,
  deriveContextForScope,
} from "../../lib/activeContext";
import { useRunId, useRunContextValid } from "../../lib/useRunContext";
import { ResearchGraphLayout } from "./ResearchGraphLayout";
import {
  EmptyState,
  GlassPanel,
  IconButton,
  QuantPlotlyCard,
  SegmentedControl,
} from "../quantlab/ui";
import {
  applyFilters,
  computeDerivedFields,
  frontierCurve,
  normalizeSignals,
  recommendThresholdMoves,
} from "../signal_analytics/core/computations";
import {
  DatasetMode,
  DerivedSignal,
  Filters,
  ParamsOverrides,
  TimezoneMode,
} from "../signal_analytics/types";
import {
  decodeStateFromQuery,
  encodeStateToQuery,
} from "../signal_analytics/permalink";
import { type PlotlySelection } from "./PlotlyChart";

type Props = { onBack: () => void };

const DEFAULT_PARAMS: ParamsOverrides = {
  minAmplitude: 0.8,
  maxSpread: 0.3,
  ttlBars: 60,
  feesPips: 0.1,
};

const DEFAULT_FILTERS: Filters = {
  acceptedOnly: true,
  side: "ALL",
  regime: "ALL",
  session: "ALL",
  timeframe: "4H",
  outcomeRequired: false,
  brushSelection: null,
  ttlMax: null,
};

export function SignalAnalyticsGraph({ onBack }: Props) {
  const runId = useRunId();
  const { invalidReason, contextValid } = useRunContextValid();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataScope, setDataScope] = useState<DataScope>(defaultScope);
  const [datasetMode, setDatasetMode] = useState<DatasetMode>("ACCEPTED");
  const [timezone, setTimezone] = useState<TimezoneMode>("UTC");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [params, setParams] = useState<ParamsOverrides>(DEFAULT_PARAMS);
  const [downsample, setDownsample] = useState(true);
  const [shareCopied, setShareCopied] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [timeframe, setTimeframe] = useState("1m");

  const scopedContext: ActiveContext | null = useMemo(() => {
    if (!runId) return null;
    const ctx = deriveContextForScope(activeContext, dataScope);
    return { ...ctx, run_id: runId };
  }, [runId, dataScope]);

  useEffect(() => {
    const decoded = decodeStateFromQuery(window.location.search, {
      dataset: datasetMode,
      filters,
      params,
      tz: timezone,
    });
    setDatasetMode(decoded.dataset);
    setFilters(decoded.filters);
    setParams(decoded.params);
    setTimezone(decoded.tz);
  }, []);

  useEffect(() => {
    const query = encodeStateToQuery({
      dataset: datasetMode,
      filters,
      params,
      tz: timezone,
    });
    window.history.replaceState(null, "", query);
  }, [datasetMode, filters, params, timezone]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!scopedContext || !contextValid) {
        setSignals([]);
        setError(invalidReason || "Sélectionne un run pour charger les signaux.");
        return;
      }
      setLoading(true);
      try {
        const data = await api.getSignals(800, scopedContext, dataScope);
        if (!mounted) return;
        setSignals(data);
        setError(null);
      } catch (e: any) {
        if (!mounted) return;
        setError(e.message || "Failed to load signals");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [scopedContext, dataScope, invalidReason, contextValid]);

  const normalizedSignals = useMemo(() => {
    const base = normalizeSignals(signals);
    return base.map((s) => computeDerivedFields(s, params));
  }, [signals, params]);

  const datasetSignals = useMemo(() => {
    if (datasetMode === "ACCEPTED") return normalizedSignals;
    return normalizedSignals.filter((s) => s.hasOutcome);
  }, [normalizedSignals, datasetMode]);

  const effectiveFilters = useMemo<Filters>(() => {
    const base = { ...filters };
    if (datasetMode !== "ACCEPTED") {
      base.acceptedOnly = false;
      base.outcomeRequired = true;
    }
    return base;
  }, [filters, datasetMode]);

  const filteredSignals = useMemo(
    () => applyFilters(datasetSignals, effectiveFilters, params, datasetMode),
    [datasetSignals, effectiveFilters, params, datasetMode],
  );
  const brushSelection = effectiveFilters.brushSelection;

  const edgeScatter = useMemo(
    () => buildEdgeScatter(filteredSignals, downsample),
    [filteredSignals, downsample],
  );
  const regimeBars = useMemo(
    () => buildRegimeSessionMatrix(filteredSignals),
    [filteredSignals],
  );
  const timeline = useMemo(
    () => buildTimeline(filteredSignals, timezone),
    [filteredSignals, timezone],
  );

  const recommendations = useMemo(
    () => recommendThresholdMoves(params, datasetSignals),
    [params, datasetSignals],
  );
  const frontier = useMemo(
    () =>
      frontierCurve(
        "maxSpread",
        [
          Math.max(0.05, params.maxSpread - 0.2),
          Math.max(0.05, params.maxSpread - 0.1),
          params.maxSpread,
          params.maxSpread + 0.1,
          params.maxSpread + 0.2,
        ],
        datasetSignals,
        params,
      ),
    [params, datasetSignals],
  );

  const handleSelection = useCallback(
    (selection: PlotlySelection) => {
      if (!selection?.xRange || !selection?.yRange) return;
      const [x0, x1] = selection.xRange;
      const [y0, y1] = selection.yRange;
      if (
        Number.isFinite(x0) &&
        Number.isFinite(x1) &&
        Number.isFinite(y0) &&
        Number.isFinite(y1)
      ) {
        setFilters((prev) => ({
          ...prev,
          brushSelection: {
            xMin: Math.min(x0, x1),
            xMax: Math.max(x0, x1),
            yMin: Math.min(y0, y1),
            yMax: Math.max(y0, y1),
          },
        }));
      }
    },
    [],
  );

  const clearBrush = useCallback(() => {
    setFilters((prev) => ({ ...prev, brushSelection: null }));
  }, []);

  const shareLink = useCallback(async () => {
    const url = `${window.location.origin}${window.location.pathname}${encodeStateToQuery({
      dataset: datasetMode,
      filters,
      params,
      tz: timezone,
    })}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1500);
    } catch {
      setShareCopied(false);
    }
  }, [datasetMode, filters, params, timezone]);

  const updateFilter = useCallback(
    (partial: Partial<Filters>) => {
      setFilters((prev) => ({ ...prev, ...partial }));
    },
    [],
  );

  const updateParam = useCallback(
    (key: keyof ParamsOverrides, value: number) => {
      setParams((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  return (
    <ResearchGraphLayout
      title="Signal Analytics · Graph Mode"
      subtitle="Edge density, regimes, timeline avec synchronisation des filtres"
      onBack={onBack}
      scopeLabel="Research"
      toolbar={{
        timeframe,
        onTimeframeChange: setTimeframe,
        scope: dataScope,
        onScopeChange: setDataScope,
        toggles: (
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              value={datasetMode}
              options={[
                { label: "Accepted", value: "ACCEPTED" },
                { label: "Traded", value: "TRADED" },
                { label: "Closed", value: "CLOSED" },
              ]}
              onChange={(v) => setDatasetMode(v as DatasetMode)}
            />
            <SegmentedControl
              value={timezone}
              options={[
                { label: "UTC", value: "UTC" },
                { label: "Local", value: "LOCAL" },
              ]}
              onChange={(v) => setTimezone(v as TimezoneMode)}
            />
            <IconButton
              icon={<SlidersHorizontal className="h-4 w-4" />}
              label="Params"
              variant="secondary"
              active={drawerOpen}
              onClick={() => setDrawerOpen(true)}
            />
            <IconButton
              icon={<Sparkles className="h-4 w-4" />}
              label={downsample ? "Downsample" : "Full"}
              variant="ghost"
              active={downsample}
              onClick={() => setDownsample(!downsample)}
            />
            <IconButton
              icon={<Link2 className="h-4 w-4" />}
              label={shareCopied ? "Copied" : "Share"}
              variant="ghost"
              onClick={shareLink}
            />
          </div>
        ),
      }}
    >
      <FilterRow
        filters={effectiveFilters}
        onChange={updateFilter}
        brushActive={!!brushSelection}
        onClear={clearBrush}
      />
      <ParameterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        params={params}
        onChange={updateParam}
        onReset={() => setParams(DEFAULT_PARAMS)}
      />
      {error && <EmptyState title="Erreur" description={error} />}
      <div className="grid gap-4 lg:grid-cols-2">
        <QuantPlotlyCard
          title="Edge density (Amp vs net)"
          subtitle="Heatmap + scatter overlay"
          data={[
            {
              type: "histogram2d",
              x: edgeScatter.x,
              y: edgeScatter.y,
              nbinsx: 30,
              nbinsy: 30,
              colorscale: "Blues",
              showscale: false,
              opacity: 0.8,
            },
            {
              type: "scattergl",
              mode: "markers",
              x: edgeScatter.points.map((p) => p.x),
              y: edgeScatter.points.map((p) => p.y),
              marker: { color: edgeScatter.points.map((p) => p.color), size: 5, opacity: 0.8 },
              name: "points",
            },
          ]}
          layout={{
            height: 380,
            xaxis: { title: "Amplitude (pips)" },
            yaxis: { title: "Net outcome (pips)" },
            dragmode: "lasso",
          }}
          loading={loading}
          empty={edgeScatter.x.length === 0 && !loading}
          onRefresh={() => setDatasetMode((prev) => prev)}
          onSelected={handleSelection}
          onDeselect={clearBrush}
          selectionActive={!!brushSelection}
          selectionLabel={
            brushSelection
              ? `Amp ${brushSelection.xMin.toFixed(2)}-${brushSelection.xMax.toFixed(2)} · Net ${brushSelection.yMin.toFixed(2)}-${brushSelection.yMax.toFixed(2)}`
              : undefined
          }
        />
        <GlassPanel className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="ql-section-label">Regime x Session</div>
              <div className="text-lg font-semibold text-slate-900">Average net</div>
            </div>
          </div>
          {regimeBars.matrix.length === 0 ? (
            <EmptyState
              title={loading ? "Loading…" : "No data"}
              description="Aucune combinaison régime/session sur ce scope."
            />
          ) : (
            <table className="w-full text-sm text-slate-700">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-2 pr-3">Regime</th>
                  {regimeBars.sessions.map((s) => (
                    <th key={s} className="py-2 pr-3">
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {regimeBars.regimes.map((regime) => (
                  <tr key={regime} className="border-t border-slate-200/60">
                    <td className="py-2 pr-3 font-medium text-slate-900">{regime}</td>
                    {regimeBars.sessions.map((session) => {
                      const cell = regimeBars.matrix.find(
                        (m) => m.regime === regime && m.session === session,
                      );
                      return (
                        <td key={session} className="py-2 pr-3">
                          {cell ? `${cell.avgNet.toFixed(2)}p · N=${cell.n}` : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </GlassPanel>
      </div>
      <QuantPlotlyCard
        title={`Timeline (${timezone})`}
        subtitle="Accepted / Rejected / Traded per hour"
        data={[
          { type: "bar", name: "Accepted", x: timeline.hours, y: timeline.accepted, marker: { color: "#22c55e" } },
          { type: "bar", name: "Rejected", x: timeline.hours, y: timeline.rejected, marker: { color: "#ef4444" } },
          { type: "bar", name: "Traded", x: timeline.hours, y: timeline.traded, marker: { color: "#22d3ee" } },
        ]}
        layout={{
          barmode: "stack",
          height: 360,
          xaxis: { title: timezone === "UTC" ? "Hour (UTC)" : "Hour (Local)", tickangle: -45 },
          yaxis: { title: "Count" },
          legend: { font: { color: "#0f172a" } },
        }}
        loading={loading}
        empty={timeline.hours.length === 0 && !loading}
      />
      <QuantPlotlyCard
        title="Recommendations (maxSpread frontier)"
        subtitle="Frontier median net vs maxSpread"
        data={[
          {
            type: "scatter",
            mode: "lines+markers",
            x: frontier.map((f) => f.value),
            y: frontier.map((f) => f.medianNet),
            marker: { color: "#0ea5e9" },
            line: { color: "#0ea5e9" },
          },
        ]}
        layout={{
          height: 260,
          xaxis: { title: "maxSpread" },
          yaxis: { title: "Median net" },
        }}
        footer={
          <div className="grid gap-2 sm:grid-cols-2">
            {recommendations.primary ? (
              <RecoCard reco={recommendations.primary} tone="primary" />
            ) : (
              <div className="text-sm text-slate-600">No primary recommendation.</div>
            )}
            {recommendations.secondary.map((r, idx) => (
              <RecoCard key={idx} reco={r} tone="secondary" />
            ))}
          </div>
        }
      />
    </ResearchGraphLayout>
  );
}

function FilterRow({
  filters,
  onChange,
  brushActive,
  onClear,
}: {
  filters: Filters;
  onChange: (partial: Partial<Filters>) => void;
  brushActive: boolean;
  onClear: () => void;
}) {
  return (
    <GlassPanel className="flex flex-wrap items-center gap-2 p-3">
      <FilterChip
        label="Side"
        value={filters.side}
        options={["ALL", "BUY", "SELL"]}
        onChange={(v) => onChange({ side: v as Filters["side"] })}
      />
      <FilterChip
        label="Regime"
        value={filters.regime}
        options={["ALL", "LOW", "MID", "HIGH", "UNKNOWN"]}
        onChange={(v) => onChange({ regime: v })}
      />
      <FilterChip
        label="Session"
        value={filters.session}
        options={["ALL", "ASIA", "LONDON", "NY"]}
        onChange={(v) => onChange({ session: v as Filters["session"] })}
      />
      <FilterChip
        label="Timeframe"
        value={filters.timeframe}
        options={["ALL", "1H", "4H", "24H"]}
        onChange={(v) => onChange({ timeframe: v as Filters["timeframe"] })}
      />
      <ToggleChip
        label="Accepted"
        checked={filters.acceptedOnly}
        onChange={(val) => onChange({ acceptedOnly: val })}
      />
      <ToggleChip
        label="Outcome"
        checked={filters.outcomeRequired}
        onChange={(val) => onChange({ outcomeRequired: val })}
      />
      {brushActive && (
        <IconButton
          icon={<SlidersHorizontal className="h-4 w-4" />}
          label="Clear selection"
          variant="ghost"
          onClick={onClear}
        />
      )}
    </GlassPanel>
  );
}

function FilterChip({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="ql-chip">
      <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--ql-muted)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-sm font-semibold text-[var(--ql-strong)] focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt} value={opt} className="bg-[#050a14] text-white">
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleChip({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="ql-chip"
      onClick={() => onChange(!checked)}
    >
      <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--ql-muted)]">
        {label}
      </span>
      <span className={checked ? "text-[var(--ql-success)]" : "text-[var(--ql-muted)]"}>
        {checked ? "on" : "off"}
      </span>
    </button>
  );
}

function ParameterDrawer({
  open,
  onClose,
  params,
  onChange,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  params: ParamsOverrides;
  onChange: (key: keyof ParamsOverrides, value: number) => void;
  onReset: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-end bg-slate-900/70 backdrop-blur-sm">
      <div className="h-full w-full max-w-md overflow-auto rounded-l-2xl border-l border-[var(--ql-border)] bg-[#050a14] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="ql-section-label">Parameters</div>
          <IconButton
            icon={<SlidersHorizontal className="h-4 w-4" />}
            label="Close"
            onClick={onClose}
          />
        </div>
        <div className="space-y-3 text-[var(--ql-strong)]">
          <ParamInput label="Min amplitude (pips)" value={params.minAmplitude} step={0.05} min={0} max={3} onChange={(v) => onChange("minAmplitude", v)} />
          <ParamInput label="Max spread (pips)" value={params.maxSpread} step={0.01} min={0.05} max={1.5} onChange={(v) => onChange("maxSpread", v)} />
          <ParamInput label="TTL bars" value={params.ttlBars} step={1} min={10} max={240} onChange={(v) => onChange("ttlBars", v)} />
          <ParamInput label="Fees (pips)" value={params.feesPips} step={0.01} min={0} max={1} onChange={(v) => onChange("feesPips", v)} />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <IconButton
            icon={<Sparkles className="h-4 w-4" />}
            label="Reset defaults"
            variant="secondary"
            onClick={onReset}
          />
        </div>
      </div>
    </div>
  );
}

function ParamInput({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-[0.12em] text-[var(--ql-muted)]">{label}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--ql-accent)]"
      />
      <div className="text-sm text-[var(--ql-strong)]">{value.toFixed(2)}</div>
    </div>
  );
}

function buildEdgeScatter(signals: DerivedSignal[], downsample: boolean) {
  const pts = signals
    .filter((s) => s.amplitude != null && s.net_outcome != null)
    .map((s) => ({
      x: s.amplitude as number,
      y: s.net_outcome as number,
      color: s.accepted ? "#22c55e" : "#f97316",
    }));
  const step = downsample && pts.length > 800 ? Math.ceil(pts.length / 800) : 1;
  const points = pts.filter((_, idx) => idx % step === 0);
  return {
    x: pts.map((p) => p.x),
    y: pts.map((p) => p.y),
    points,
  };
}

function buildRegimeSessionMatrix(signals: DerivedSignal[]) {
  const regimes = Array.from(new Set(signals.map((s) => s.regimeLabel || "UNKNOWN")));
  const sessions = Array.from(new Set(signals.map((s) => s.sessionLabel || "UNKNOWN")));
  const matrix: { regime: string; session: string; avgNet: number; n: number }[] = [];
  regimes.forEach((regime) => {
    sessions.forEach((session) => {
      const subset = signals.filter(
        (s) => s.regimeLabel === regime && s.sessionLabel === session && s.net_outcome != null,
      );
      if (subset.length === 0) return;
      const avg =
        subset.reduce((acc, s) => acc + (s.net_outcome as number), 0) /
        subset.length;
      matrix.push({ regime, session, avgNet: avg, n: subset.length });
    });
  });
  return { regimes, sessions, matrix };
}

function buildTimeline(signals: DerivedSignal[], tz: TimezoneMode) {
  const hours = Array.from({ length: 24 }, (_, h) => `${h.toString().padStart(2, "0")}h`);
  const accepted = Array(24).fill(0);
  const rejected = Array(24).fill(0);
  const traded = Array(24).fill(0);
  signals.forEach((s) => {
    const d = new Date(s.timestamp);
    const h = tz === "UTC" ? d.getUTCHours() : d.getHours();
    if (s.accepted) accepted[h] += 1;
    else rejected[h] += 1;
    if (s.hasOutcome) traded[h] += 1;
  });
  return { hours, accepted, rejected, traded };
}

function RecoCard({ reco, tone }: { reco: any; tone: "primary" | "secondary" }) {
  const style =
    tone === "primary"
      ? "border-[var(--ql-success)] bg-[rgba(45,227,160,0.08)]"
      : "border-[var(--ql-accent)] bg-[rgba(70,211,255,0.06)]";
  return (
    <div className={`rounded-2xl border px-3 py-2 ${style}`}>
      <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--ql-muted)]">
        {tone === "primary" ? "Primary" : "Secondary"} · {reco.param}
      </div>
      <div className="text-sm font-semibold text-slate-900">→ {reco.newValue}</div>
      <div className="text-xs text-[var(--ql-muted)]">
        Δmedian {reco.deltaMedianNet?.toFixed(2) ?? "n/a"}p · ΔN {reco.deltaN}
      </div>
    </div>
  );
}
