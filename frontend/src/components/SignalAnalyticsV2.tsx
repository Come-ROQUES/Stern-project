import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  Filter,
  Link2,
  Maximize2,
  SlidersHorizontal,
} from "lucide-react";
import { api, Signal } from "../lib/api";
import {
  ActiveContext,
  DataScope,
  activeContext,
  defaultScope,
  deriveContextForScope,
} from "../lib/activeContext";
import { useRunId, useRunMeta } from "../lib/useRunContext";
import { ScopeSelector } from "./ui/ScopeSelector";
import { ApexChart } from "../lib/ApexChart";
import { PlotlyChart, type PlotlySelection } from "./graphs/PlotlyChart";
import {
  applyFilters,
  bootstrapCI,
  computeDerivedFields,
  computeFunnel,
  computeQuantiles,
  frontierCurve,
  normalizeSignals,
  recommendThresholdMoves,
  rollingMetrics,
  ttlSurvival,
} from "./signal_analytics/core/computations";
import {
  DatasetMode,
  DerivedSignal,
  Filters,
  ParamsOverrides,
  QualityGateThresholds,
  RollingPoint,
  TimezoneMode,
} from "./signal_analytics/types";
import {
  decodeStateFromQuery,
  encodeStateToQuery,
} from "./signal_analytics/permalink";
import {
  GlassPanel,
  IconButton,
  KpiStat,
  MetricPill,
  PaperPanel,
  QuantLabLayout,
  QuantPlotlyCard,
  SegmentedControl,
} from "./quantlab/ui";
import { EmptyState } from "./quantlab/ui";

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

const QUALITY_THRESHOLDS: QualityGateThresholds = {
  missingOutcomeMaxPct: 0.35,
  missingTTLMaxPct: 0.35,
  dupTsMaxPct: 0.02,
  extremeSpreadP99: 0.6,
};

export function SignalAnalyticsV2() {
  const runId = useRunId();
  const { run, invalidReason, contextValid } = useRunMeta();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataScope, setDataScope] = useState<DataScope>(defaultScope);
  const [datasetMode, setDatasetMode] = useState<DatasetMode>("ACCEPTED");
  const [timezone, setTimezone] = useState<TimezoneMode>("UTC");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [params, setParams] = useState<ParamsOverrides>(DEFAULT_PARAMS);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [edgeChartCtx, setEdgeChartCtx] = useState<{ el: HTMLDivElement; plotly: any } | null>(null);
  const [edgeFullscreen, setEdgeFullscreen] = useState(false);
  const [selectionActive, setSelectionActive] = useState(false);

  const scopedContext: ActiveContext = useMemo(() => {
    const ctx = deriveContextForScope(activeContext, dataScope);
    return runId
      ? { ...ctx, run_id: runId, strategy_id: run?.strategy_id ?? ctx.strategy_id }
      : ctx;
  }, [dataScope, runId, run?.strategy_id]);

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
    if (!runId || !contextValid) {
      setSignals([]);
      setError(
        invalidReason
          ? `Run indisponible (${invalidReason})`
          : "Aucun run sélectionné",
      );
      return;
    }
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const data = await api.getSignals(400, scopedContext, dataScope);
        if (!mounted) return;
        setSignals(data);
        setError(null);
      } catch (e: any) {
        if (!mounted) return;
        setError(e.message || "Failed to load signals");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [scopedContext, dataScope, runId, contextValid, invalidReason]);

  const normalizedSignals = useMemo(() => {
    const base = normalizeSignals(signals);
    return base.map((s) => computeDerivedFields(s, params));
  }, [signals, params]);

  const datasetSignals = useMemo(() => {
    if (datasetMode === "ACCEPTED") return normalizedSignals;
    return normalizedSignals.filter((s) => s.hasOutcome);
  }, [datasetMode, normalizedSignals]);

  const effectiveFilters = useMemo<Filters>(() => {
    const base = { ...filters };
    if (datasetMode !== "ACCEPTED") {
      base.acceptedOnly = false;
      base.outcomeRequired = true;
    }
    return base;
  }, [filters, datasetMode]);

  const filteredSignals = useMemo(() => {
    return applyFilters(
      datasetSignals,
      effectiveFilters,
      params,
      datasetMode,
    );
  }, [datasetSignals, effectiveFilters, params, datasetMode]);

  const funnel = useMemo(
    () => computeFunnel(filteredSignals),
    [filteredSignals],
  );

  const quality = useMemo(
    () => buildQualityGates(datasetSignals, QUALITY_THRESHOLDS),
    [datasetSignals],
  );

  const netValues = useMemo(
    () =>
      filteredSignals
        .map((s) => s.net_outcome)
        .filter((v): v is number => v != null),
    [filteredSignals],
  );

  const ttlValues = useMemo(
    () =>
      filteredSignals
        .map((s) => (s as any).time_to_reflex_bars as number | null)
        .filter((v): v is number => v != null),
    [filteredSignals],
  );

  const drift1h = useMemo(
    () => rollingMetrics(filteredSignals, 60),
    [filteredSignals],
  );
  const drift4h = useMemo(
    () => rollingMetrics(filteredSignals, 240),
    [filteredSignals],
  );
  const drift24h = useMemo(
    () => rollingMetrics(filteredSignals, 1440),
    [filteredSignals],
  );

  const survival = useMemo(
    () => ttlSurvival(ttlValues, params.ttlBars),
    [ttlValues, params.ttlBars],
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

  const bootstrapSeed = useMemo(() => {
    const key = `${runId || "na"}-${dataScope}-${datasetMode}-${params.maxSpread}`;
    let acc = 0;
    for (let i = 0; i < key.length; i += 1) {
      acc += key.charCodeAt(i);
    }
    return acc;
  }, [runId, dataScope, datasetMode, params.maxSpread]);

  const netCI = useMemo(
    () => bootstrapCI(netValues, median, bootstrapSeed, 300),
    [netValues, bootstrapSeed],
  );
  const winrateCI = useMemo(() => {
    const wins = filteredSignals.filter((s) => (s.net_outcome ?? 0) > 0).length;
    const arr = filteredSignals.map((_, idx) => (idx < wins ? 1 : 0));
    return bootstrapCI(arr, mean, bootstrapSeed + 7, 300);
  }, [filteredSignals, bootstrapSeed]);

  const brushSelection = effectiveFilters.brushSelection;

  const edge3d = useMemo(() => buildEdge3d(filteredSignals), [filteredSignals]);
  const parameterSurface = useMemo(
    () => buildParameterSurface(datasetSignals, effectiveFilters, params),
    [datasetSignals, effectiveFilters, params],
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
        setSelectionActive(true);
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
    setSelectionActive(false);
    setFilters((prev) => ({ ...prev, brushSelection: null }));
  }, []);

  const toggleDataset = useCallback(
    (mode: DatasetMode) => {
      setDatasetMode(mode);
      if (mode !== "ACCEPTED") {
        setFilters((prev) => ({ ...prev, outcomeRequired: true, acceptedOnly: false }));
      }
    },
    [],
  );

  const updateParam = useCallback(
    (key: keyof ParamsOverrides, value: number) => {
      setParams((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const resetParams = useCallback(() => setParams(DEFAULT_PARAMS), []);

  const updateFilter = useCallback(
    (partial: Partial<Filters>) => {
      setFilters((prev) => ({ ...prev, ...partial }));
    },
    [],
  );

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

  const downloadEdge = useCallback(
    async (format: "png" | "svg") => {
      if (!edgeChartCtx) return;
      try {
        const uri = await edgeChartCtx.plotly.toImage(edgeChartCtx.el, {
          format,
          width: 1400,
          height: 900,
        });
        const link = document.createElement("a");
        link.href = uri;
        link.download = `edge_cloud.${format}`;
        link.click();
      } catch {
        /* silent */
      }
    },
    [edgeChartCtx],
  );

  const scopeLabel = formatScopeLabel(dataScope);
  const selectionLabel = brushSelection
    ? `Amp ${brushSelection.xMin.toFixed(2)}-${brushSelection.xMax.toFixed(2)} · Net ${brushSelection.yMin.toFixed(2)}-${brushSelection.yMax.toFixed(2)}`
    : undefined;

  useEffect(() => {
    setSelectionActive(Boolean(brushSelection));
  }, [brushSelection]);

  if (!contextValid || !runId) {
    return (
      <QuantLabLayout
        title="Signal Analytics V3"
        subtitle="Edges, qualité et filtres run-aware"
        filters={<ScopeSelector scope={dataScope} onChange={setDataScope} />}
        actions={null}
      >
        <GlassPanel className="p-5">
          <EmptyState
            title="Run indisponible"
            description={invalidReason || "Sélectionne un run valide pour charger les signaux."}
          />
        </GlassPanel>
      </QuantLabLayout>
    );
  }

  return (
    <QuantLabLayout
      title="Signal Analytics V3"
      subtitle={`${scopeLabel} · dataset ${datasetMode}`}
      filters={
        <div className="flex flex-wrap items-center gap-2">
          <ScopeSelector scope={dataScope} onChange={setDataScope} />
          <FilterChip
            label="Side"
            value={effectiveFilters.side}
            options={["ALL", "BUY", "SELL"]}
            onChange={(v) => updateFilter({ side: v as Filters["side"] })}
          />
          <FilterChip
            label="Regime"
            value={effectiveFilters.regime}
            options={["ALL", "LOW", "MID", "HIGH", "UNKNOWN"]}
            onChange={(v) => updateFilter({ regime: v })}
          />
          <FilterChip
            label="Session"
            value={effectiveFilters.session}
            options={["ALL", "ASIA", "LONDON", "NY"]}
            onChange={(v) => updateFilter({ session: v as Filters["session"] })}
          />
          <FilterChip
            label="Timeframe"
            value={effectiveFilters.timeframe}
            options={["ALL", "1H", "4H", "24H"]}
            onChange={(v) => updateFilter({ timeframe: v as Filters["timeframe"] })}
          />
          <ToggleChip
            label="Accepted"
            checked={effectiveFilters.acceptedOnly}
            onChange={(val) => updateFilter({ acceptedOnly: val })}
          />
          <ToggleChip
            label="Outcome"
            checked={effectiveFilters.outcomeRequired}
            onChange={(val) => updateFilter({ outcomeRequired: val })}
          />
        </div>
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <IconButton
            icon={<SlidersHorizontal className="h-4 w-4" />}
            label="Parameters"
            variant="secondary"
            onClick={() => setDrawerOpen(true)}
            tooltip="Adjust thresholds"
          />
          <IconButton
            icon={<Link2 className="h-4 w-4" />}
            label={shareCopied ? "Copied" : "Share"}
            variant="ghost"
            onClick={shareLink}
            tooltip="Permalink with current filters"
          />
          <IconButton
            icon={<Download className="h-4 w-4" />}
            label="PNG"
            variant="ghost"
            onClick={() => downloadEdge("png")}
            disabled={!edgeChartCtx}
            tooltip="Exporter le graphe principal"
          />
          <IconButton
            icon={<Maximize2 className="h-4 w-4" />}
            label="Fullscreen"
            variant="ghost"
            onClick={() => setEdgeFullscreen(true)}
            tooltip="Plein écran edge cloud"
          />
        </div>
      }
      context={
        <div className="flex flex-wrap items-center gap-2">
          <MetricPill label="Run" value={runId.slice(0, 8)} />
          <MetricPill label="Scope" value={scopeLabel} />
          <SegmentedControl
            value={datasetMode}
            options={[
              { label: "Accepted", value: "ACCEPTED" },
              { label: "Traded", value: "TRADED" },
              { label: "Closed", value: "CLOSED" },
            ]}
            onChange={(v) => toggleDataset(v as DatasetMode)}
          />
          <SegmentedControl
            value={timezone}
            options={[
              { label: "UTC", value: "UTC" },
              { label: "Local", value: "LOCAL" },
            ]}
            onChange={(v) => setTimezone(v as TimezoneMode)}
          />
          <MetricPill label="Signals" value={datasetSignals.length} />
          {loading && <MetricPill label="Loading" value="…" />}
          {error && <MetricPill label="Error" value="API" />}
        </div>
      }
    >
      <ParameterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        params={params}
        onChange={updateParam}
        onReset={resetParams}
      />

      <div className="grid gap-2 sm:gap-4 xl:grid-cols-[320px_1fr_360px] xl:items-start">
        <div className="space-y-3">
          <GlassPanel className="p-4">
            <div className="ql-section-label mb-2">Funnel</div>
            <FunnelCard funnel={funnel} />
          </GlassPanel>
          <GlassPanel className="p-4">
            <div className="ql-section-label mb-2">Quality Gates</div>
            <QualityGatesCard
              quality={quality}
              thresholds={QUALITY_THRESHOLDS}
            />
          </GlassPanel>
        </div>

        <PaperPanel className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="ql-section-label">Edge cloud</div>
              <div className="text-lg font-semibold text-slate-900">
                Amplitude vs net outcome
              </div>
              <div className="text-sm text-slate-600">
                Brush/lasso pour affiner distributions et table.
              </div>
            </div>
            <div className="flex items-center gap-2">
              {brushSelection && (
                <IconButton
                  icon={<Filter className="h-4 w-4" />}
                  label="Clear selection"
                  variant="secondary"
                  onClick={clearBrush}
                  tooltip="Annuler le filtre brushing"
                />
              )}
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-2 min-h-[320px]">
            {filteredSignals.length === 0 && !loading ? (
              <EmptyState
                title="Aucun signal"
                description="Ajuste les filtres ou le scope pour visualiser le cloud."
              />
            ) : (
              <PlotlyChart
                data={[
                  {
                    type: "histogram2d",
                    x: filteredSignals.map((s) => s.amplitude ?? 0),
                    y: filteredSignals.map((s) => s.net_outcome ?? 0),
                    nbinsx: 28,
                    nbinsy: 28,
                    colorscale: "Blues",
                    showscale: false,
                    opacity: 0.85,
                  },
                  {
                    type: "scattergl",
                    mode: "markers",
                    x: filteredSignals.slice(-500).map((s) => s.amplitude ?? 0),
                    y: filteredSignals.slice(-500).map((s) => s.net_outcome ?? 0),
                    marker: {
                      size: 6,
                      color: filteredSignals
                        .slice(-500)
                        .map((s) => (s.accepted ? "#1fbf8f" : "#f59e0b")),
                      opacity: 0.85,
                    },
                    name: "points",
                  },
                ]}
                layout={{
                  height: 360,
                  xaxis: { title: "Amplitude (pips)" },
                  yaxis: { title: "Net outcome (pips)" },
                  dragmode: "lasso",
                  shapes: [
                    {
                      type: "line",
                      x0: params.minAmplitude,
                      x1: params.minAmplitude,
                      y0: -5,
                      y1: 5,
                      line: {
                        color: "rgba(31,191,143,0.7)",
                        width: 1,
                        dash: "dot",
                      },
                    },
                  ],
                }}
                config={{ displayModeBar: true }}
                onSelected={handleSelection}
                onDeselect={clearBrush}
                onReady={(el, plotly) => setEdgeChartCtx({ el, plotly })}
              />
            )}
          </div>
        </PaperPanel>

        <div className="space-y-3">
          <GlassPanel className="p-4">
            <DistributionsCard
              signals={filteredSignals}
              params={params}
              ci={{ net: netCI, winrate: winrateCI }}
            />
          </GlassPanel>
          <GlassPanel className="p-4">
            <RecommendationsCard
              recommendations={recommendations}
              frontier={frontier}
              params={params}
            />
          </GlassPanel>
        </div>
      </div>

      <div className="grid gap-2 sm:gap-4 lg:grid-cols-2">
        <QuantPlotlyCard
          title="Edge cloud 3D"
          subtitle="Amplitude vs spread vs net outcome"
          data={[
            {
              type: "scatter3d",
              mode: "markers",
              x: edge3d.x,
              y: edge3d.y,
              z: edge3d.z,
              marker: {
                size: 4,
                color: edge3d.c,
                colorscale: "RdBu",
                reversescale: true,
                opacity: 0.82,
              },
            },
          ]}
          layout={{
            height: 380,
            scene: {
              xaxis: { title: "Amplitude" },
              yaxis: { title: "Spread" },
              zaxis: { title: "Net" },
            },
          }}
          empty={edge3d.x.length === 0}
          selectionActive={selectionActive}
          selectionLabel={selectionLabel}
        />
        <QuantPlotlyCard
          title="Parameter surface"
          subtitle="Median net vs minAmplitude & maxSpread"
          data={
            parameterSurface.surface.length &&
              parameterSurface.surface.flat().some((v) => v != null)
              ? [
                {
                  type: "surface",
                  x: parameterSurface.spread,
                  y: parameterSurface.amplitude,
                  z: parameterSurface.surface,
                  colorscale: "Blues",
                  showscale: true,
                },
              ]
              : [
                {
                  type: "heatmap",
                  x: parameterSurface.spread,
                  y: parameterSurface.amplitude,
                  z: parameterSurface.surface,
                  colorscale: "Blues",
                },
              ]
          }
          layout={{
            height: 380,
            scene:
              parameterSurface.surface.length &&
                parameterSurface.surface.flat().some((v) => v != null)
                ? {
                  xaxis: { title: "Max spread" },
                  yaxis: { title: "Min amplitude" },
                  zaxis: { title: "Median net" },
                }
                : undefined,
            xaxis: parameterSurface.surface.length
              ? { title: "Max spread" }
              : undefined,
            yaxis: parameterSurface.surface.length
              ? { title: "Min amplitude" }
              : undefined,
          }}
          empty={parameterSurface.surface.flat().every((v) => v == null)}
        />
      </div>

      <div className="grid gap-2 sm:gap-4 lg:grid-cols-2">
        <PaperPanel className="p-4">
          <DriftCard
            title="Rolling median net"
            series={driftSeries(drift1h, drift4h, drift24h)}
          />
        </PaperPanel>
        <PaperPanel className="p-4">
          <DriftCard
            title="Rolling winrate"
            series={driftSeries(drift1h, drift4h, drift24h)}
          />
        </PaperPanel>
      </div>

      <div className="grid gap-2 sm:gap-4 lg:grid-cols-2">
        <PaperPanel className="p-4">
          <TTLCard
            survival={survival}
            ttlValues={ttlValues}
            ttlCap={params.ttlBars}
          />
        </PaperPanel>
        <PaperPanel className="p-4">
          <ExamplesTable
            signals={filteredSignals.slice(-30).reverse()}
            timezone={timezone}
          />
        </PaperPanel>
      </div>

      {edgeFullscreen && (
        <div className="fixed inset-0 z-40 bg-slate-900/70 backdrop-blur-sm">
          <div className="absolute inset-4 overflow-auto">
            <PaperPanel className="h-full space-y-3" padding="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="ql-section-label">Fullscreen</div>
                  <div className="text-lg font-semibold text-slate-900">
                    Edge cloud
                  </div>
                </div>
                <IconButton
                  icon={<Maximize2 className="h-4 w-4" />}
                  label="Close"
                  onClick={() => setEdgeFullscreen(false)}
                />
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-3 min-h-[420px]">
                <PlotlyChart
                  data={[
                    {
                      type: "histogram2d",
                      x: filteredSignals.map((s) => s.amplitude ?? 0),
                      y: filteredSignals.map((s) => s.net_outcome ?? 0),
                      nbinsx: 28,
                      nbinsy: 28,
                      colorscale: "Blues",
                      showscale: false,
                    },
                    {
                      type: "scattergl",
                      mode: "markers",
                      x: filteredSignals.slice(-500).map((s) => s.amplitude ?? 0),
                      y: filteredSignals.slice(-500).map((s) => s.net_outcome ?? 0),
                      marker: {
                        size: 6,
                        color: filteredSignals
                          .slice(-500)
                          .map((s) => (s.accepted ? "#1fbf8f" : "#f59e0b")),
                        opacity: 0.85,
                      },
                      name: "points",
                    },
                  ]}
                  layout={{
                    height: 520,
                    xaxis: { title: "Amplitude (pips)" },
                    yaxis: { title: "Net outcome (pips)" },
                    dragmode: "lasso",
                  }}
                  config={{ displayModeBar: true }}
                  onSelected={handleSelection}
                  onDeselect={clearBrush}
                  onReady={(el, plotly) => setEdgeChartCtx({ el, plotly })}
                />
              </div>
            </PaperPanel>
          </div>
        </div>
      )}
    </QuantLabLayout>
  );
}

function FunnelCard({ funnel }: { funnel: ReturnType<typeof computeFunnel> }) {
  const steps = [
    { label: "Signals", value: funnel.total },
    { label: "Accepted", value: funnel.accepted },
    { label: "Traded", value: funnel.traded },
    { label: "Closed", value: funnel.closed },
    { label: "Winners", value: funnel.winners },
    { label: "Losers", value: funnel.losers },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {steps.map((s) => (
        <KpiStat
          key={s.label}
          label={s.label}
          value={s.value}
          tone={
            s.label === "Winners"
              ? "success"
              : s.label === "Losers"
                ? "danger"
                : "default"
          }
        />
      ))}
    </div>
  );
}

function QualityGatesCard({
  quality,
  thresholds,
}: {
  quality: ReturnType<typeof buildQualityGates>;
  thresholds: QualityGateThresholds;
}) {
  const tone =
    quality.status === "OK"
      ? "text-[var(--ql-success)]"
      : quality.status === "CAUTION"
        ? "text-[var(--ql-warn)]"
        : quality.status === "INVALID"
          ? "text-[var(--ql-danger)]"
          : "text-[var(--ql-muted)]";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="ql-section-label">Quality Gates</div>
        <span
          className={`ql-chip ${tone}`}
          title={quality.total === 0 ? "insufficient data" : undefined}
        >
          {quality.status === "NA" ? "n/a" : quality.status}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <QualityItem label="Missing outcome" value={quality.missingOutcomePct} limit={thresholds.missingOutcomeMaxPct} />
        <QualityItem label="Missing TTL" value={quality.missingTTLPct} limit={thresholds.missingTTLMaxPct} />
        <QualityItem label="Duplicate timestamps" value={quality.dupPct} limit={thresholds.dupTsMaxPct} />
        <div className="rounded-xl border border-[var(--ql-border)] bg-white/10 px-3 py-2 text-sm text-[var(--ql-strong)]">
          <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--ql-muted)]">
            Spread p99
          </div>
          <div>{quality.spreadP99?.toFixed(2) ?? "n/a"}p</div>
        </div>
      </div>
      {quality.status === "INVALID" && (
        <div className="text-[11px] text-[var(--ql-muted)]">
          Conclusions bloquées — corriger la qualité des données ou ajuster les filtres.
        </div>
      )}
    </div>
  );
}

function QualityItem({ label, value, limit }: { label: string; value: number | null; limit: number }) {
  const pct = value != null ? value * 100 : null;
  const tone =
    pct == null
      ? "text-[var(--ql-muted)]"
      : pct < limit * 100
        ? "text-[var(--ql-success)]"
        : pct < limit * 100 * 1.5
          ? "text-[var(--ql-warn)]"
          : "text-[var(--ql-danger)]";
  return (
    <div className="rounded-xl border border-[var(--ql-border)] bg-white/10 px-3 py-2 text-sm text-[var(--ql-strong)]">
      <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--ql-muted)]">
        {label}
      </div>
      <div className={tone} title={pct == null ? "insufficient data" : undefined}>
        {pct != null ? `${pct.toFixed(1)}%` : "n/a"}
      </div>
    </div>
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
          <IconButton icon={<Maximize2 className="h-4 w-4" />} label="Close" onClick={onClose} />
        </div>
        <div className="space-y-3 text-[var(--ql-strong)]">
          <ParamInput label="Min amplitude (pips)" value={params.minAmplitude} step={0.05} min={0} max={3} onChange={(v) => onChange("minAmplitude", v)} />
          <ParamInput label="Max spread (pips)" value={params.maxSpread} step={0.01} min={0.05} max={1.5} onChange={(v) => onChange("maxSpread", v)} />
          <ParamInput label="TTL bars" value={params.ttlBars} step={1} min={10} max={240} onChange={(v) => onChange("ttlBars", v)} />
          <ParamInput label="Fees (pips)" value={params.feesPips} step={0.01} min={0} max={1} onChange={(v) => onChange("feesPips", v)} />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <IconButton
            icon={<SlidersHorizontal className="h-4 w-4" />}
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

function DriftCard({
  title,
  series,
}: {
  title: string;
  series: { name: string; points: RollingPoint[] }[];
}) {
  const metricKey = title.toLowerCase().includes("win") ? "winrate" : "medianNet";
  const data = series.map((s) => ({
    name: s.name,
    data: s.points.map((p) => (p as any)[metricKey] as number | null),
  }));
  const hasData = data.some((s) => s.data.length > 0);
  if (!hasData) {
    return (
      <EmptyState
        title="No data"
        description="Pas de séries temporelles sur la fenêtre sélectionnée."
      />
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="ql-section-label">{title}</div>
        <div className="text-xs text-[var(--ql-muted)]">1h · 4h · 24h</div>
      </div>
      <ApexChart
        type="line"
        height={240}
        options={{
          chart: { animations: { enabled: false }, toolbar: { show: false }, background: "#ffffff" },
          stroke: { width: 2, curve: "smooth" },
          grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
          theme: { mode: "light" },
          dataLabels: { enabled: false },
          xaxis: { labels: { show: false }, axisBorder: { show: false }, axisTicks: { show: false } },
          yaxis: { labels: { style: { colors: "#475569" } } },
          tooltip: { theme: "light" },
          colors: ["#0ea5e9", "#6b8bff", "#22c55e"],
        }}
        series={data}
      />
    </div>
  );
}

function TTLCard({
  survival,
  ttlValues,
  ttlCap,
}: {
  survival: ReturnType<typeof ttlSurvival>;
  ttlValues: number[];
  ttlCap: number;
}) {
  const ttlMedian = ttlValues.length ? median(ttlValues) : null;
  if (survival.length === 0) {
    return (
      <EmptyState
        title="No TTL data"
        description="Les time-to-reflex ne sont pas disponibles sur cette fenêtre."
      />
    );
  }
  return (
    <div className="space-y-2">
      <div className="ql-section-label">TTL · Survival & Hazard</div>
      <ApexChart
        type="line"
        height={240}
        options={{
          chart: { animations: { enabled: false }, toolbar: { show: false }, background: "#ffffff" },
          stroke: { width: 2, curve: "smooth" },
          theme: { mode: "light" },
          dataLabels: { enabled: false },
          yaxis: [
            { labels: { style: { colors: "#475569" } }, max: 1 },
            { opposite: true, labels: { style: { colors: "#475569" } } },
          ],
          xaxis: {
            labels: { style: { colors: "#475569" } },
            title: { text: "Bars", style: { color: "#475569" } },
          },
          colors: ["#0ea5e9", "#f59e0b"],
          grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
        }}
        series={[
          { name: "Survival", data: survival.map((p) => p.survival) },
          { name: "Hazard", data: survival.map((p) => p.hazard), yAxisIndex: 1 },
        ] as any}
      />
      <div className="text-xs text-[var(--ql-muted)]">
        TTL cap {ttlCap} bars · Median TTL: {ttlMedian != null ? ttlMedian.toFixed(1) : "n/a"}
      </div>
    </div>
  );
}

function DistributionsCard({
  signals,
  params,
  ci,
}: {
  signals: DerivedSignal[];
  params: ParamsOverrides;
  ci: { net: [number | null, number | null, number | null]; winrate: [number | null, number | null, number | null] };
}) {
  const amp = signals.map((s) => s.amplitude ?? 0);
  const spread = signals.map((s) => s.spread_pips ?? 0);
  const net = signals.map((s) => s.net_outcome ?? 0);
  const blocks = [
    { title: "Amplitude", values: amp, hint: `≥ ${params.minAmplitude.toFixed(2)}p` },
    { title: "Spread", values: spread, hint: `≤ ${params.maxSpread.toFixed(2)}p` },
    { title: "Net outcome", values: net, hint: "target > 0" },
  ];
  const hasData = signals.length > 0;
  return (
    <div className="space-y-3">
      <div className="ql-section-label">Distributions</div>
      {hasData ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {blocks.map((b) => {
            const q = computeQuantiles(b.values);
            return (
              <KpiStat
                key={b.title}
                label={b.title}
                value={`p50 ${fmt(q.p50)} · p90 ${fmt(q.p90)}`}
                hint={b.hint}
              />
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="Aucune donnée"
          description="Charge des signaux pour les distributions."
        />
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <KpiStat
          label="Median net (90% CI)"
          value={`${fmt(ci.net[1])}p`}
          hint={`CI ${fmt(ci.net[0])} · ${fmt(ci.net[2])}`}
        />
        <KpiStat
          label="Winrate (90% CI)"
          value={fmtPct(ci.winrate[1])}
          hint={`CI ${fmtPct(ci.winrate[0])} · ${fmtPct(ci.winrate[2])}`}
        />
      </div>
    </div>
  );
}

function RecommendationsCard({
  recommendations,
  frontier,
  params,
}: {
  recommendations: ReturnType<typeof recommendThresholdMoves>;
  frontier: { value: number; n: number; medianNet: number | null }[];
  params: ParamsOverrides;
}) {
  const primary = recommendations.primary;
  const secondary = recommendations.secondary;
  return (
    <div className="space-y-3">
      <div className="ql-section-label">Recommendations</div>
      {primary ? (
        <div className="space-y-2">
          <RecoCard reco={primary} tone="primary" />
          {secondary.map((r, idx) => (
            <RecoCard key={idx} reco={r} tone="secondary" />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No blocking recommendations"
          description="Ajuste les paramètres si besoin pour explorer la frontière."
        />
      )}
      <div>
        <div className="ql-section-label mb-1">Frontier (maxSpread)</div>
        <ApexChart
          type="line"
          height={180}
          options={{
            chart: { animations: { enabled: false }, toolbar: { show: false }, background: "#ffffff" },
            stroke: { width: 2, curve: "straight" },
            grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
            xaxis: { labels: { style: { colors: "#475569" } }, title: { text: "maxSpread", style: { color: "#475569" } } },
            yaxis: { labels: { style: { colors: "#475569" } }, title: { text: "Median net", style: { color: "#475569" } } },
            theme: { mode: "light" },
            dataLabels: { enabled: false },
            markers: { size: 4 },
            colors: ["#0ea5e9"],
          }}
          series={[
            {
              name: "Frontier",
              data: frontier.map((f) => ({ x: f.value, y: f.medianNet })),
            },
          ]}
        />
        <div className="text-xs text-[var(--ql-muted)]">
          Current: {params.maxSpread.toFixed(2)}p
        </div>
      </div>
    </div>
  );
}

function RecoCard({ reco, tone }: { reco: any; tone: "primary" | "secondary" }) {
  const toneClass =
    tone === "primary"
      ? "border-[var(--ql-success)] bg-[rgba(45,227,160,0.08)]"
      : "border-[var(--ql-accent)] bg-[rgba(70,211,255,0.06)]";
  return (
    <div className={`rounded-xl border px-3 py-2 ${toneClass}`}>
      <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--ql-muted)]">
        {tone === "primary" ? "Primary" : "Secondary"} · {reco.param}
      </div>
      <div className="text-sm font-semibold text-slate-900">→ {reco.newValue}</div>
      <div className="text-xs text-[var(--ql-muted)]">
        Δmedian {fmt(reco.deltaMedianNet)}p · ΔN {reco.deltaN}
      </div>
    </div>
  );
}

function ExamplesTable({
  signals,
  timezone,
}: {
  signals: DerivedSignal[];
  timezone: TimezoneMode;
}) {
  if (signals.length === 0) {
    return (
      <EmptyState
        title="No signals"
        description="Ajuste les filtres pour peupler le tableau."
      />
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="ql-section-label">Top matching</div>
        <div className="text-xs text-[var(--ql-muted)]">{signals.length} rows</div>
      </div>
      <div className="overflow-auto max-h-[420px] rounded-xl border border-slate-200 bg-white">
        <table className="ql-table text-slate-700">
          <thead>
            <tr>
              <th>Time</th>
              <th>Side</th>
              <th>Amp</th>
              <th>Spread</th>
              <th>Net</th>
              <th>TTR</th>
              <th>Regime</th>
              <th>Accepted</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((s) => (
              <tr key={`${s.timestamp}-${s.direction}`}>
                <td>{formatTime(s.timestamp, timezone)}</td>
                <td className="font-semibold text-slate-900">{s.direction}</td>
                <td>{fmt(s.amplitude)}</td>
                <td>{fmt(s.spread_pips)}</td>
                <td className={((s.net_outcome ?? 0) >= 0 ? "text-emerald-600" : "text-amber-600")}>
                  {s.net_outcome != null ? fmt(s.net_outcome) : "—"}
                </td>
                <td>{(s as any).time_to_reflex_bars ?? "—"}</td>
                <td>{s.regimeLabel}</td>
                <td>{s.accepted ? "yes" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
      title={checked ? "enabled" : "disabled"}
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

function driftSeries(
  a: RollingPoint[],
  b: RollingPoint[],
  c: RollingPoint[],
) {
  return [
    { name: "1h", points: a },
    { name: "4h", points: b },
    { name: "24h", points: c },
  ];
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.floor(sorted.length / 2)];
}

function mean(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function fmt(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return "n/a";
  return `${v.toFixed(2)}`;
}

function fmtPct(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return "n/a";
  return `${(v * 100).toFixed(1)}%`;
}

function formatTime(ts: string, tz: TimezoneMode) {
  const date = new Date(ts);
  if (isNaN(date.getTime())) return "-";
  return tz === "UTC"
    ? date.toISOString().split("T")[1]?.slice(0, 8)
    : date.toLocaleTimeString();
}

function formatScopeLabel(scope: DataScope): string {
  if (scope.scope === "TODAY") return "TODAY";
  if (scope.scope === "YESTERDAY") return "YESTERDAY";
  if (scope.scope === "DATE") return `DATE ${scope.date}`;
  if (scope.scope === "RANGE") return `RANGE ${scope.from_date}→${scope.to_date}`;
  return "TODAY";
}

function buildQualityGates(
  signals: DerivedSignal[],
  thresholds: QualityGateThresholds,
) {
  const total = signals.length;
  if (total === 0) {
    return {
      status: "NA" as const,
      missingOutcomePct: null,
      missingTTLPct: null,
      dupPct: null,
      spreadP99: null,
      total,
    };
  }
  const missingOutcome = signals.filter((s) => !s.hasOutcome).length / total;
  const missingTTL =
    signals.filter((s) => (s as any).time_to_reflex_bars == null).length / total;
  const uniqueTs = new Set(signals.map((s) => s.timestamp)).size;
  const dupPct = Math.max(0, 1 - uniqueTs / total);
  const spreads = signals.map((s) => s.spread_pips ?? 0).sort((a, b) => a - b);
  const p99 = spreads.length ? spreads[Math.floor(spreads.length * 0.99)] : null;

  let status: "OK" | "CAUTION" | "INVALID" | "NA" = "OK";
  if (
    missingOutcome > thresholds.missingOutcomeMaxPct ||
    missingTTL > thresholds.missingTTLMaxPct ||
    dupPct > thresholds.dupTsMaxPct
  ) {
    status = "INVALID";
  } else if (
    missingOutcome > thresholds.missingOutcomeMaxPct * 0.7 ||
    missingTTL > thresholds.missingTTLMaxPct * 0.7 ||
    dupPct > thresholds.dupTsMaxPct * 0.7
  ) {
    status = "CAUTION";
  }

  return {
    status,
    missingOutcomePct: missingOutcome,
    missingTTLPct: missingTTL,
    dupPct,
    spreadP99: p99,
    total,
  };
}

function buildEdge3d(signals: DerivedSignal[]) {
  const pts = signals.filter(
    (s) =>
      s.amplitude != null && s.spread_pips != null && s.net_outcome != null,
  );
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  return {
    x: pts.map((s) => s.amplitude as number),
    y: pts.map((s) => s.spread_pips as number),
    z: pts.map((s) => s.net_outcome as number),
    c: pts.map((s) => clamp(s.net_outcome as number, -2.5, 2.5)),
  };
}

function buildParameterSurface(
  signals: DerivedSignal[],
  filters: Filters,
  base: ParamsOverrides,
) {
  const ampGrid = [
    Math.max(0.1, base.minAmplitude - 0.2),
    base.minAmplitude,
    base.minAmplitude + 0.2,
    base.minAmplitude + 0.4,
  ];
  const spreadGrid = [
    Math.max(0.05, base.maxSpread - 0.1),
    base.maxSpread,
    base.maxSpread + 0.1,
    base.maxSpread + 0.2,
  ];
  const surface = ampGrid.map((amp) =>
    spreadGrid.map((spread) => {
      const params = { ...base, minAmplitude: amp, maxSpread: spread };
      const filtered = applyFilters(
        signals,
        { ...filters, brushSelection: filters.brushSelection },
        params,
        "TRADED",
      );
      const netValues = filtered
        .map((s) => s.net_outcome)
        .filter((v): v is number => v != null);
      return netValues.length ? median(netValues) : null;
    }),
  );
  return { amplitude: ampGrid, spread: spreadGrid, surface };
}
