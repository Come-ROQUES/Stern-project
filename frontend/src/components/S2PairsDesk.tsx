import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDateTimeUTC, formatTime } from "../lib/dateUtils";
import {
  api,
  S2ChartPoint,
  S2Charts,
  S2Summary,
} from "../lib/api";
import { activeContext } from "../lib/activeContext";
import { useBundleRuns } from "../lib/useBundleRuns";
import { useRunId, useRunMeta } from "../lib/useRunContext";
import {
  GlassBadge,
  GlassCard,
  GlassPanel,
  MiniSparkline,
  Skeleton,
} from "./ui/glass";
import { StrategySwitchTabs } from "./StrategySwitchTabs";
import {
  ArrowRight,
  CheckCircle,
  Clock,
  Info,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { S2PaperPnlCard } from "./S2ShadowPnlCard";
import { S2TradeList } from "./S2TradeList";
import { useDashboardPoll } from "../lib/dashboardPollingBus";
import { DeferredRender } from "./ui/DeferredRender";
import { ApexChart } from "../lib/ApexChart";

const PAIR_SYMBOL = "AUDUSD_NZDUSD";
const DEFAULT_ENTRY_Z = 2.0;
const DEFAULT_EXIT_Z = 0.5;
const DEFAULT_STOP_Z = 3.0;
const CHART_LIMIT = 720;

const COLORS = {
  legA: "#e2e8f0",
  legB: "#94a3b8",
  spread: "#7dd3fc",
  zscore: "#22c55e",
  accept: "#22c55e",
  reject: "#f59e0b",
  warmup: "#94a3b8",
};

type MarkerKind = "WARMUP" | "ACCEPT" | "REJECT";

function fmtNum(value: number | null | undefined, digits = 3): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return value.toFixed(digits);
}

function fmtTime(ts: string | null | undefined): string {
  return formatTime(ts ?? null, "UTC");
}

function fmtInterval(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return "n/a";
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function toEpoch(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const parsed = new Date(ts).getTime();
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function resolveReason(point: S2ChartPoint): string {
  return point.reason || point.signal_type || "n/a";
}

function resolveMarkerKind(point: S2ChartPoint): MarkerKind {
  const reason = resolveReason(point).toUpperCase();
  if (reason.includes("WARMUP")) return "WARMUP";
  if (point.accepted) return "ACCEPT";
  return "REJECT";
}

function badgeForKind(kind: MarkerKind): {
  label: string;
  variant: "success" | "warning" | "muted";
} {
  if (kind === "ACCEPT") return { label: "ACCEPT", variant: "success" };
  if (kind === "REJECT") return { label: "REJECT", variant: "warning" };
  return { label: "WARMUP", variant: "muted" };
}

function buildMarkerSeries(
  points: S2ChartPoint[],
  ySelector: (p: S2ChartPoint) => number | null
): {
  warmup: { x: number; y: number; meta: any }[];
  accept: { x: number; y: number; meta: any }[];
  reject: { x: number; y: number; meta: any }[];
} {
  const warmup: { x: number; y: number; meta: any }[] = [];
  const accept: { x: number; y: number; meta: any }[] = [];
  const reject: { x: number; y: number; meta: any }[] = [];
  points.forEach((p) => {
    const ts = toEpoch(p.timestamp);
    const y = ySelector(p);
    if (ts == null || y == null || !Number.isFinite(y)) return;
    const kind = resolveMarkerKind(p);
    const entry = {
      x: ts,
      y,
      meta: {
        strategy: "S2",
        status: kind,
        reason: resolveReason(p),
        zScore: p.z_score,
        spread: p.spread,
      },
    };
    if (kind === "WARMUP") {
      warmup.push(entry);
    } else if (kind === "ACCEPT") {
      accept.push(entry);
    } else {
      reject.push(entry);
    }
  });
  return { warmup, accept, reject };
}

function buildTooltipHtml(point: any): string {
  if (!point?.meta) return "";
  const meta = point.meta as {
    strategy: string;
    status: string;
    reason: string;
    zScore: number | null;
    spread: number | null;
  };
  const time = formatTime(point.x, "UTC");
  return `
    <div class="rounded-lg border border-white/10 bg-[#0b1220] px-3 py-2 text-xs text-slate-200">
      <div class="text-[10px] uppercase tracking-[0.2em] text-[#00FF88]">${meta.strategy} ${meta.status}</div>
      <div class="mt-1">${meta.reason}</div>
      <div class="mt-1 text-[11px] text-neutral-400">${time}</div>
      <div class="mt-1 text-[11px] text-neutral-400">z=${fmtNum(meta.zScore, 2)} spread=${fmtNum(meta.spread, 4)}</div>
    </div>
  `;
}

const BentoGrid = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div className={`grid grid-cols-12 gap-4 ${className}`}>{children}</div>
  );
};

const BentoCard = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <GlassCard variant="inset" className={`flex flex-col ${className}`}>
      {children}
    </GlassCard>
  );
};

const StatCard = ({
  title,
  value,
  subtitle,
  sparklineData,
  sparklineColor,
}: {
  title: string;
  value: string | React.ReactNode;
  subtitle?: string;
  sparklineData?: number[];
  sparklineColor?: string;
}) => (
  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
    <div className="flex items-start justify-between">
      <div>
        <div className="text-[11px] uppercase tracking-[0.3em] text-neutral-500">
          {title}
        </div>
        <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
        {subtitle && (
          <div className="text-[11px] text-neutral-400">{subtitle}</div>
        )}
      </div>
      {sparklineData && sparklineColor && (
        <MiniSparkline
          data={sparklineData}
          width={80}
          height={32}
          color={sparklineColor}
        />
      )}
    </div>
  </div>
);

const GateItem = ({
  label,
  value,
  isOk,
  target,
}: {
  label: string;
  value: string;
  isOk?: boolean;
  target?: string;
}) => (
  <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12px]">
    <div className="flex items-center gap-2">
      {isOk !== undefined &&
        (isOk ? (
          <CheckCircle className="h-3 w-3 text-emerald-400" />
        ) : (
          <XCircle className="h-3 w-3 text-rose-400" />
        ))}
      <span className="text-neutral-400">{label}</span>
    </div>
    <div className="flex items-center gap-2">
      <span className="text-neutral-200">{value}</span>
      {target && <span className="text-neutral-500">/ {target}</span>}
    </div>
  </div>
);

export function S2PairsDesk() {
  const runId = useRunId();
  const { run } = useRunMeta();
  const { enabled: bundleEnabled, s2RunId } = useBundleRuns();
  const strategyId = run?.strategy_id ?? null;
  const isS2 = strategyId === "s2_pairs_trading";
  const [summary, setSummary] = useState<S2Summary | null>(null);
  const [charts, setCharts] = useState<S2Charts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const effectiveRunId = bundleEnabled ? s2RunId : runId;

  const scopedContext = useMemo(
    () =>
      effectiveRunId
        ? {
          ...activeContext,
          run_id: effectiveRunId,
          strategy_id: "s2_pairs_trading",
        }
        : activeContext,
    [effectiveRunId]
  );

  const isVisibleRef = useRef(true);
  useEffect(() => {
    const onVisibility = () => {
      isVisibleRef.current = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const load = useCallback(async () => {
      if (!isVisibleRef.current) return;
      if (bundleEnabled && !s2RunId) {
        setLoading(false);
        setError("Bundle S2 : sélectionnez un run S2.");
        return;
      }
      if (!effectiveRunId) {
        setLoading(false);
        setError("run_id required for S2 data");
        return;
      }
      if (!bundleEnabled && !isS2) {
        setLoading(false);
        setError("S2 observe-only : sélectionnez un run S2.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const desk = await api.getS2Desk(CHART_LIMIT, scopedContext);
        setSummary(desk.summary ?? null);
        setCharts(desk.charts ?? null);
      } catch {
        setError("S2 data unavailable");
      }
      setLoading(false);
    },
    [bundleEnabled, s2RunId, effectiveRunId, isS2, scopedContext]
  );

  useDashboardPoll("summary", load, {
    enabled: true,
    immediate: true,
    intervalMs: 45_000,
  });

  const points = Array.isArray(charts?.points) ? charts?.points ?? [] : [];
  const fallbackSymbols = PAIR_SYMBOL.split("_");
  const symbolA = summary?.config?.symbol_a ?? fallbackSymbols[0] ?? "AUDUSD";
  const symbolB = summary?.config?.symbol_b ?? fallbackSymbols[1] ?? "NZDUSD";
  const pairLabel = `${symbolA} / ${symbolB}`;
  const entryZ = summary?.config?.entry_z ?? DEFAULT_ENTRY_Z;
  const exitZ = summary?.config?.exit_z ?? DEFAULT_EXIT_Z;
  const stopZ = summary?.config?.stop_z ?? DEFAULT_STOP_Z;
  const modelFamily = summary?.config?.model_family ?? "n/a";
  const configVersion = summary?.config?.config_version ?? "n/a";
  const ecmConfirmation = summary?.config?.ecm_confirmation ?? null;
  const requireSpreadEst = summary?.config?.require_spread_est;
  const s2WarmupTarget = summary?.config?.min_warmup ?? null;
  const s2WarmupBars = summary?.warmup_state?.toUpperCase().includes("READY")
    ? s2WarmupTarget
    : summary?.counts?.warmup ?? null;
  const s2WarmupProgress =
    s2WarmupTarget && s2WarmupBars != null && s2WarmupTarget > 0
      ? Math.min(s2WarmupBars / s2WarmupTarget, 1)
      : summary?.warmup_state?.toUpperCase().includes("READY")
        ? 1
        : 0;
  const s2WarmupLabel =
    s2WarmupTarget && s2WarmupBars != null
      ? `${Math.min(s2WarmupBars, s2WarmupTarget)}/${s2WarmupTarget}`
      : summary?.warmup_state ?? "n/a";

  const acceptRate = useMemo(() => {
    if (!summary?.counts || summary.counts.total === 0) return null;
    return summary.counts.accepted / summary.counts.total;
  }, [summary]);

  const barIntervalS = summary?.config?.bar_interval_s ?? null;
  const barIntervalLabel = fmtInterval(barIntervalS);
  const windowBars = summary?.config?.window_bars ?? null;
  const ouLookback = summary?.config?.ou_lookback ?? null;
  const halfLifeMinBars = summary?.config?.half_life_min_bars ?? null;
  const halfLifeMaxBars = summary?.config?.half_life_max_bars ?? null;
  const betaLookback = summary?.config?.beta_lookback ?? null;
  const minCorr = summary?.config?.min_corr ?? null;
  const minR2 = summary?.config?.min_r2_beta ?? null;
  const maxSpreadPips = summary?.config?.max_spread_pips ?? null;
  const maxHoldMinutes = summary?.config?.max_holding_minutes ?? null;
  const cooldownMinutes = summary?.config?.cooldown_minutes ?? null;
  const halfLifeBars = summary?.gates?.half_life_bars ?? null;
  const halfLifeHours =
    halfLifeBars != null && barIntervalS
      ? (halfLifeBars * barIntervalS) / 3600
      : null;
  const halfLifeMinHours =
    halfLifeMinBars != null && barIntervalS
      ? (halfLifeMinBars * barIntervalS) / 3600
      : null;
  const halfLifeMaxHours =
    halfLifeMaxBars != null && barIntervalS
      ? (halfLifeMaxBars * barIntervalS) / 3600
      : null;

  const halfLifeLabel =
    halfLifeHours != null ? `${halfLifeHours.toFixed(1)}h` : "n/a";

  const minEdgeCostRatio = summary?.config?.min_edge_cost_ratio ?? null;
  const edgeCostRatio = summary?.gates?.edge_cost_ratio ?? null;

  const lastPriceA = summary?.last_prices?.price_a ?? null;
  const lastPriceB = summary?.last_prices?.price_b ?? null;

  const spreadSideLabel = summary?.gates?.spread_side ?? "n/a";
  const spreadSideTone =
    spreadSideLabel === "bid"
      ? "text-rose-300"
      : spreadSideLabel === "ask"
        ? "text-emerald-300"
        : "text-neutral-400";

  const halfLifeRangeLabel =
    halfLifeMinBars != null && halfLifeMaxBars != null
      ? `${halfLifeMinBars}-${halfLifeMaxBars} bars`
      : "n/a";

  const halfLifeOk =
    summary?.gates?.half_life_bars != null &&
    halfLifeMinBars != null &&
    halfLifeMaxBars != null &&
    summary.gates.half_life_bars >= halfLifeMinBars &&
    summary.gates.half_life_bars <= halfLifeMaxBars;

  const corrOk =
    summary?.gates?.corr != null &&
    minCorr != null &&
    summary.gates.corr >= minCorr;

  const betaR2Ok =
    summary?.gates?.beta_r2 != null &&
    minR2 != null &&
    summary.gates.beta_r2 >= minR2;

  const edgeCostRatioOk =
    summary?.gates?.edge_cost_ratio != null &&
    minEdgeCostRatio != null &&
    summary.gates.edge_cost_ratio >= minEdgeCostRatio;

  const zSeries = useMemo(() => {
    return points
      .filter((p) => typeof p.z_score === "number")
      .slice(-240)
      .map((p) => Number(p.z_score));
  }, [points]);

  const latestSignals = useMemo(() => {
    return [...points].reverse().slice(0, 10);
  }, [points]);

  const legASeries = useMemo(() => {
    const line = points
      .map((p) => ({ x: toEpoch(p.timestamp), y: p.price_a }))
      .filter((p) => p.x != null && p.y != null) as { x: number; y: number }[];
    const markers = buildMarkerSeries(points, (p) => p.price_a ?? null);
    return [
      { name: `S2 ${symbolA}`, type: "line", data: line },
      { name: "S2 Accept", type: "scatter", data: markers.accept },
      { name: "S2 Reject", type: "scatter", data: markers.reject },
      { name: "S2 Warmup", type: "scatter", data: markers.warmup },
    ];
  }, [points, symbolA]);

  const legBSeries = useMemo(() => {
    const line = points
      .map((p) => ({ x: toEpoch(p.timestamp), y: p.price_b }))
      .filter((p) => p.x != null && p.y != null) as { x: number; y: number }[];
    const markers = buildMarkerSeries(points, (p) => p.price_b ?? null);
    return [
      { name: `S2 ${symbolB}`, type: "line", data: line },
      { name: "S2 Accept", type: "scatter", data: markers.accept },
      { name: "S2 Reject", type: "scatter", data: markers.reject },
      { name: "S2 Warmup", type: "scatter", data: markers.warmup },
    ];
  }, [points, symbolB]);

  const pairSeries = useMemo(() => {
    const spread = points
      .map((p) => ({ x: toEpoch(p.timestamp), y: p.spread }))
      .filter((p) => p.x != null && p.y != null) as { x: number; y: number }[];
    const zscore = points
      .map((p) => ({ x: toEpoch(p.timestamp), y: p.z_score }))
      .filter((p) => p.x != null && p.y != null) as { x: number; y: number }[];
    const markers = buildMarkerSeries(points, (p) => p.z_score ?? null);
    return [
      { name: "S2 Z-Score", type: "line", data: zscore, yAxisIndex: 0 },
      { name: "S2 Spread", type: "line", data: spread, yAxisIndex: 1 },
      { name: "S2 Accept", type: "scatter", data: markers.accept },
      { name: "S2 Reject", type: "scatter", data: markers.reject },
      { name: "S2 Warmup", type: "scatter", data: markers.warmup },
    ];
  }, [points]);

  const baseChartOptions = {
    chart: {
      animations: { enabled: false },
      toolbar: { show: false },
      zoom: { enabled: false },
      background: "transparent",
    },
    stroke: { width: [2, 0, 0, 0] },
    markers: { size: 5, strokeWidth: 1.2, hover: { size: 6 } },
    xaxis: {
      type: "datetime" as const,
      labels: { style: { colors: "#94a3b8" } },
    },
    yaxis: {
      labels: { style: { colors: "#94a3b8" } },
    },
    grid: { borderColor: "rgba(255,255,255,0.06)" },
    legend: { show: false },
    tooltip: {
      shared: false,
      custom: ({ seriesIndex, dataPointIndex, w }: any) => {
        const series = w?.config?.series?.[seriesIndex];
        const point = series?.data?.[dataPointIndex];
        if (point?.meta) return buildTooltipHtml(point);
        if (!point?.x) return "";
        return `
          <div class="rounded-lg border border-white/10 bg-[#0b1220] px-3 py-2 text-xs text-slate-200">
            <div class="text-[10px] uppercase tracking-[0.2em] text-[#00FF88]">S2</div>
            <div class="mt-1">${series?.name ?? "Signal"}</div>
            <div class="mt-1 text-[11px] text-neutral-400">${formatTime(point.x, "UTC")}</div>
          </div>
        `;
      },
    },
  };

  const legAOptions = useMemo(() => {
    return {
      ...baseChartOptions,
      colors: [COLORS.legA, COLORS.accept, COLORS.reject, COLORS.warmup],
      markers: { size: [0, 5, 5, 5], strokeWidth: 1.2, hover: { size: 6 } },
    };
  }, [baseChartOptions]);

  const legBOptions = useMemo(() => {
    return {
      ...baseChartOptions,
      colors: [COLORS.legB, COLORS.accept, COLORS.reject, COLORS.warmup],
      markers: { size: [0, 5, 5, 5], strokeWidth: 1.2, hover: { size: 6 } },
    };
  }, [baseChartOptions]);

  const pairOptions = useMemo(() => {
    return {
      ...baseChartOptions,
      colors: [COLORS.zscore, COLORS.spread, COLORS.accept, COLORS.reject, COLORS.warmup],
      stroke: { width: [2, 2, 0, 0, 0] },
      markers: { size: [0, 0, 5, 5, 5], strokeWidth: 1.2, hover: { size: 6 } },
      yaxis: [
        {
          labels: { style: { colors: "#94a3b8" } },
          title: { text: "Z", style: { color: "#94a3b8" } },
        },
        {
          opposite: true,
          labels: { style: { colors: "#94a3b8" } },
          title: { text: "Spread", style: { color: "#94a3b8" } },
        },
      ],
      annotations: {
        yaxis: [
          {
            y: entryZ,
            borderColor: "rgba(34,197,94,0.4)",
            label: { text: `ENTRY +${entryZ}`, style: { color: "#e2e8f0" } },
          },
          {
            y: -entryZ,
            borderColor: "rgba(34,197,94,0.4)",
            label: { text: `ENTRY -${entryZ}`, style: { color: "#e2e8f0" } },
          },
          {
            y: exitZ,
            borderColor: "rgba(251,191,36,0.35)",
            label: { text: `EXIT +${exitZ}`, style: { color: "#e2e8f0" } },
          },
          {
            y: -exitZ,
            borderColor: "rgba(251,191,36,0.35)",
            label: { text: `EXIT -${exitZ}`, style: { color: "#e2e8f0" } },
          },
          {
            y: stopZ,
            borderColor: "rgba(248,113,113,0.45)",
            label: { text: `STOP +${stopZ}`, style: { color: "#e2e8f0" } },
          },
          {
            y: -stopZ,
            borderColor: "rgba(248,113,113,0.45)",
            label: { text: `STOP -${stopZ}`, style: { color: "#e2e8f0" } },
          },
        ],
      },
    };
  }, [baseChartOptions, entryZ, exitZ, stopZ]);

  return (
    <div className="space-y-4">
      <StrategySwitchTabs
        active="s2"
        dwSummary={null}
        s2Summary={summary}
        onChange={(target) => {
          if (typeof window !== "undefined") {
            window.location.hash = target === "dw" ? "#terminal" : "#pairs";
          }
        }}
      />

      {!loading && !error && points.length === 0 && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-100">
          No S2 data for run{" "}
          {effectiveRunId ? effectiveRunId.slice(0, 8) : "n/a"}. Check relay,
          run_id alignment, and S2 API base.
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-200">
          {error}
        </div>
      )}

      <BentoGrid>
        {/* Main Status & PnL */}
        <BentoCard className="col-span-12 lg:col-span-4 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-neutral-500">
                Strategy Status
              </div>
              <div className="text-lg font-semibold text-white">
                {summary?.warmup_state ?? "NO DATA"}
              </div>
              <div className="text-xs text-neutral-400">
                {summary?.warmup_reason ?? "S2 pairs engine"}
              </div>
            </div>
            <div className="text-right text-xs text-neutral-400">
              <div>Pair: {summary?.pair_key ?? PAIR_SYMBOL}</div>
              <div>Last: {fmtTime(summary?.last_signal_ts ?? null)}</div>
              <div>
                Run: {effectiveRunId ? effectiveRunId.slice(0, 8) : "n/a"}
              </div>
              <div>Model: {modelFamily}</div>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="flex items-center justify-between text-[11px] text-neutral-400">
              <span>Warmup progress</span>
              <span className="text-neutral-200">{s2WarmupLabel}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#00FF88] to-emerald-400"
                style={{ width: `${s2WarmupProgress * 100}%` }}
              />
            </div>
          </div>

          <S2PaperPnlCard runId={effectiveRunId} />
        </BentoCard>

        {/* Core Metrics */}
        <BentoCard className="col-span-12 lg:col-span-5 space-y-3">
          <StatCard
            title="z-score"
            value={fmtNum(summary?.last_signal?.z_score ?? null, 2)}
            subtitle={`${modelFamily} · Entry ±${entryZ} · Exit ±${exitZ} · Stop ±${stopZ}`}
            sparklineData={zSeries}
            sparklineColor={COLORS.zscore}
          />
          <StatCard
            title="spread log"
            value={fmtNum(summary?.last_signal?.spread ?? null, 5)}
            subtitle={
              acceptRate == null
                ? "n/a"
                : `Accept rate ${(acceptRate * 100).toFixed(1)}%`
            }
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="text-[11px] uppercase tracking-[0.3em] text-neutral-500">
                runtime
              </div>
              <div className={`mt-1 text-lg font-semibold ${spreadSideTone}`}>
                {modelFamily}
              </div>
              <div className="text-[11px] text-neutral-400">
                cfg {configVersion}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="text-[11px] uppercase tracking-[0.3em] text-neutral-500">
                last prices
              </div>
              <div className="mt-1 text-sm font-semibold text-white">
                {symbolA} {fmtNum(lastPriceA ?? null, 5)}
              </div>
              <div className="text-[11px] text-neutral-400">
                {symbolB} {fmtNum(lastPriceB ?? null, 5)}
              </div>
              <div className="mt-1 text-[11px] text-neutral-500">
                {modelFamily === "ecm"
                  ? `ecm ${fmtNum(ecmConfirmation, 5)}`
                  : `spread_est ${String(requireSpreadEst ?? "n/a")}`}
              </div>
            </div>
          </div>
        </BentoCard>

        {/* Latest Signals */}
        <BentoCard className="col-span-12 lg:col-span-3 space-y-3">
          <div className="text-xs uppercase tracking-[0.3em] text-neutral-500">
            Latest Signals
          </div>
          <div className="flex-grow rounded-xl border border-white/10 bg-black/40 p-3 text-[12px] text-neutral-200">
            {loading ? (
              <Skeleton variant="rect" className="h-full w-full" />
            ) : latestSignals.length === 0 ? (
              <div className="flex h-full items-center justify-center text-neutral-400">
                No S2 signals.
              </div>
            ) : (
              <div className="space-y-2">
                {latestSignals.slice(0, 8).map((s, idx) => {
                  const kind = resolveMarkerKind(s);
                  const badge = badgeForKind(kind);
                  return (
                    <div
                      key={`${s.timestamp}-${idx}`}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2 text-neutral-400">
                        <GlassBadge variant={badge.variant} size="sm">
                          {badge.label.slice(0, 1)}
                        </GlassBadge>
                        <span className="truncate" title={resolveReason(s)}>
                          {formatTime(s.timestamp, "UTC")} · {resolveReason(s)}
                        </span>
                      </div>
                      <div className="text-neutral-200">
                        {fmtNum(s.z_score ?? null, 2)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </BentoCard>

        {/* Pair Chart */}
        <BentoCard className="col-span-12 lg:col-span-8">
          <div className="mb-2 text-xs uppercase tracking-[0.3em] text-neutral-500">
            Pair spread + z-score
          </div>
          {loading ? (
            <Skeleton variant="card" className="h-64" />
          ) : (
            <DeferredRender minHeight={280}>
              <ApexChart
                type="line"
                height={280}
                series={pairSeries as any}
                options={pairOptions as any}
              />
            </DeferredRender>
          )}
        </BentoCard>

        {/* Gates */}
        <BentoCard className="col-span-12 lg:col-span-4 space-y-3">
          <div className="text-xs uppercase tracking-[0.3em] text-neutral-500">
            Live Gates
          </div>
          <div className="grid gap-2 text-[12px]">
            <GateItem
              label="Bar age"
              value={
                summary?.gates?.bar_age_ms != null
                  ? `${Math.round(summary.gates.bar_age_ms / 1000)}s`
                  : "n/a"
              }
            />
            <GateItem
              label="Half-life"
              value={halfLifeLabel}
              isOk={halfLifeOk}
              target={halfLifeRangeLabel}
            />
            <GateItem
              label="Corr / R²"
              value={`${summary?.gates?.corr != null
                ? summary.gates.corr.toFixed(2)
                : "n/a"
                } / ${summary?.gates?.beta_r2 != null
                  ? summary.gates.beta_r2.toFixed(2)
                  : "n/a"
                }`}
              isOk={corrOk && betaR2Ok}
              target={`${minCorr?.toFixed(2)} / ${minR2?.toFixed(2)}`}
            />
            <GateItem
              label="Edge/Cost Ratio"
              value={edgeCostRatio != null ? edgeCostRatio.toFixed(2) : "n/a"}
              isOk={edgeCostRatioOk}
              target={
                minEdgeCostRatio != null ? minEdgeCostRatio.toFixed(2) : "n/a"
              }
            />
            <GateItem
              label="Flags"
              value={(summary?.gates?.flags ?? []).join(", ") || "none"}
              isOk={!summary?.gates?.flags?.length}
            />
          </div>
        </BentoCard>

        {/* Leg A Chart */}
        <BentoCard className="col-span-12 lg:col-span-6">
          <div className="mb-2 text-xs uppercase tracking-[0.3em] text-neutral-500">
            {symbolA} leg
          </div>
          {loading ? (
            <Skeleton variant="card" className="h-48" />
          ) : (
            <DeferredRender minHeight={240}>
              <ApexChart
                type="line"
                height={240}
                series={legASeries as any}
                options={legAOptions as any}
              />
            </DeferredRender>
          )}
        </BentoCard>

        {/* Leg B Chart */}
        <BentoCard className="col-span-12 lg:col-span-6">
          <div className="mb-2 text-xs uppercase tracking-[0.3em] text-neutral-500">
            {symbolB} leg
          </div>
          {loading ? (
            <Skeleton variant="card" className="h-48" />
          ) : (
            <DeferredRender minHeight={240}>
              <ApexChart
                type="line"
                height={240}
                series={legBSeries as any}
                options={legBOptions as any}
              />
            </DeferredRender>
          )}
        </BentoCard>

        {/* Trades IB S2 */}
        <BentoCard className="col-span-12">
          <S2TradeList runId={effectiveRunId} />
        </BentoCard>
      </BentoGrid>
    </div>
  );
}
