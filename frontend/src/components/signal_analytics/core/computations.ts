import { Signal } from "../../../lib/api";
import {
  DerivedSignal,
  Filters,
  FunnelCounts,
  ParamsOverrides,
  RollingPoint,
  SurvivalPoint,
} from "../types";

const DEFAULT_TIMEFRAME_MINUTES: Record<Filters["timeframe"], number> = {
  ALL: 0,
  "1H": 60,
  "4H": 240,
  "24H": 1440,
};

function seededRng(seed: number): () => number {
  // Simple LCG for deterministic bootstrap
  let value = seed || 1;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

export function normalizeSignals(signals: Signal[]): DerivedSignal[] {
  return signals.map((s) => {
    const ts = Date.parse(s.timestamp);
    return {
      ...s,
      ts: Number.isFinite(ts) ? ts : 0,
      amplitude: s.delta_pips != null ? Math.abs(s.delta_pips) : null,
      net_outcome: null,
      hasOutcome: s.final_pnl_pips != null,
      hasTTL: (s as any).time_to_reflex_bars != null,
      isTraded: s.final_pnl_pips != null,
      isClosed: s.final_pnl_pips != null,
      sessionLabel: sessionLabel(s.timestamp),
      regimeLabel: regimeLabel(s.volatility_regime),
    };
  });
}

export function computeDerivedFields(
  signal: DerivedSignal,
  params: ParamsOverrides,
): DerivedSignal {
  const net =
    signal.final_pnl_pips != null
      ? signal.final_pnl_pips - params.feesPips - (signal.spread_pips ?? 0)
      : null;
  return {
    ...signal,
    net_outcome: net,
    hasOutcome: signal.final_pnl_pips != null,
    isTraded: signal.final_pnl_pips != null,
    isClosed: signal.final_pnl_pips != null,
  };
}

export function applyFilters(
  signals: DerivedSignal[],
  filters: Filters,
  params: ParamsOverrides,
  dataset: "ACCEPTED" | "TRADED" | "CLOSED",
): DerivedSignal[] {
  const windowMinutes = DEFAULT_TIMEFRAME_MINUTES[filters.timeframe];
  const now = Date.now();
  const startTs = windowMinutes > 0 ? now - windowMinutes * 60_000 : null;
  const ttlLimit = filters.ttlMax ?? params.ttlBars;

  return signals.filter((s) => {
    if (!s.ts || (startTs && s.ts < startTs)) return false;
    if (filters.acceptedOnly && !s.accepted) return false;
    if (dataset !== "ACCEPTED" && !s.hasOutcome) return false;
    if (filters.outcomeRequired && !s.hasOutcome) return false;
    if (filters.side !== "ALL" && s.direction !== filters.side) return false;
    if (filters.regime !== "ALL" && s.regimeLabel !== filters.regime) {
      return false;
    }
    if (filters.session !== "ALL" && s.sessionLabel !== filters.session) {
      return false;
    }
    if (filters.brushSelection) {
      const { xMin, xMax, yMin, yMax } = filters.brushSelection;
      const amp = s.amplitude ?? 0;
      const net = s.net_outcome ?? 0;
      if (amp < xMin || amp > xMax || net < yMin || net > yMax) return false;
    }
    if (s.amplitude != null && s.amplitude < params.minAmplitude) return false;
    if (s.spread_pips != null && s.spread_pips > params.maxSpread) return false;
    const ttl = (s as any).time_to_reflex_bars as number | null;
    if (ttlLimit && ttlLimit > 0 && ttl != null && ttl > ttlLimit) return false;
    if (filters.outcomeRequired && s.net_outcome == null) return false;
    return true;
  });
}

export function computeFunnel(signals: DerivedSignal[]): FunnelCounts {
  const total = signals.length;
  const accepted = signals.filter((s) => s.accepted).length;
  const traded = signals.filter((s) => s.hasOutcome).length;
  const closed = traded; // proxy until trade linkage exists
  const winners = signals.filter((s) => (s.net_outcome ?? 0) > 0).length;
  const losers = signals.filter((s) => (s.net_outcome ?? 0) <= 0 && s.hasOutcome)
    .length;
  return { total, accepted, traded, closed, winners, losers };
}

export function computeQuantiles(values: number[]) {
  if (!values.length) {
    return { p10: null, p50: null, p90: null, mad: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const pct = (p: number) => {
    const idx = Math.floor((p / 100) * (sorted.length - 1));
    return sorted[idx];
  };
  const median = pct(50);
  const deviations = sorted.map((v) => Math.abs(v - median));
  const mad = deviations.length ? deviations.sort((a, b) => a - b)[Math.floor(deviations.length / 2)] : null;
  return { p10: pct(10), p50: median, p90: pct(90), mad };
}

export function bootstrapCI(
  values: number[],
  statFn: (arr: number[]) => number,
  seed: number,
  B = 500,
): [number | null, number | null, number | null] {
  if (!values.length) return [null, null, null];
  const rng = seededRng(seed);
  const res: number[] = [];
  for (let i = 0; i < B; i += 1) {
    const sample = values.map(() => values[Math.floor(rng() * values.length)]);
    res.push(statFn(sample));
  }
  res.sort((a, b) => a - b);
  const low = res[Math.floor(0.05 * res.length)];
  const mid = res[Math.floor(0.5 * res.length)];
  const high = res[Math.floor(0.95 * res.length)];
  return [low, mid, high];
}

export function rollingMetrics(
  signals: DerivedSignal[],
  windowMinutes: number,
): RollingPoint[] {
  if (!signals.length) return [];
  const sorted = [...signals].sort((a, b) => a.ts - b.ts);
  const buckets: Record<number, DerivedSignal[]> = {};
  sorted.forEach((s) => {
    const bucket = Math.floor(s.ts / (windowMinutes * 60_000));
    buckets[bucket] = buckets[bucket] || [];
    buckets[bucket].push(s);
  });
  return Object.entries(buckets).map(([bucket, arr]) => {
    const netValues = arr
      .map((s) => s.net_outcome)
      .filter((v): v is number => v != null);
    const medianNet = netValues.length
      ? netValues.sort((a, b) => a - b)[Math.floor(netValues.length / 2)]
      : null;
    const wins = arr.filter((s) => (s.net_outcome ?? 0) > 0).length;
    const winrate = arr.length ? wins / arr.length : null;
    return {
      ts: Number(bucket) * windowMinutes * 60_000,
      medianNet,
      winrate,
      n: arr.length,
    };
  });
}

export function ttlSurvival(
  ttlValues: number[],
  cap: number,
): SurvivalPoint[] {
  if (!ttlValues.length) return [];
  const capped = ttlValues.map((v) => Math.min(v, cap));
  const maxT = Math.max(...capped);
  const points: SurvivalPoint[] = [];
  for (let t = 0; t <= maxT; t += 1) {
    const atRisk = capped.filter((v) => v >= t).length;
    const events = capped.filter((v) => v === t).length;
    const survival = atRisk === 0 ? 0 : (atRisk - events) / atRisk;
    const hazard = atRisk === 0 ? 0 : events / atRisk;
    points.push({ t, survival, hazard });
  }
  return points;
}

export function sessionLabel(
  timestampUTC: string,
): "ASIA" | "LONDON" | "NY" | "UNKNOWN" {
  const h = new Date(timestampUTC).getUTCHours();
  if (h >= 23 || h < 7) return "ASIA";
  if (h >= 7 && h < 13) return "LONDON";
  if (h >= 13 && h < 22) return "NY";
  return "UNKNOWN";
}

export function regimeLabel(volatility_regime?: string | null): string {
  if (!volatility_regime) return "UNKNOWN";
  return volatility_regime.trim().toUpperCase();
}

export function bins(values: number[], edges: number[]) {
  const counts = Array(edges.length - 1).fill(0);
  values.forEach((v) => {
    for (let i = 0; i < edges.length - 1; i += 1) {
      if (v >= edges[i] && v < edges[i + 1]) {
        counts[i] += 1;
        break;
      }
    }
  });
  return counts;
}

export function recommendThresholdMoves(
  current: ParamsOverrides,
  signals: DerivedSignal[],
) {
  const candidates: { param: keyof ParamsOverrides; value: number }[] = [
    { param: "maxSpread", value: Math.max(0, current.maxSpread - 0.05) },
    { param: "minAmplitude", value: current.minAmplitude + 0.1 },
    { param: "ttlBars", value: Math.max(10, current.ttlBars - 10) },
    { param: "ttlBars", value: current.ttlBars + 10 },
  ];

  const scored = candidates.map((c) => {
    const adjusted: ParamsOverrides = { ...current, [c.param]: c.value };
    const filtered = applyFilters(signals, {
      acceptedOnly: false,
      side: "ALL",
      regime: "ALL",
      session: "ALL",
      timeframe: "ALL",
      outcomeRequired: true,
      brushSelection: null,
    }, adjusted, "TRADED");
    const netValues = filtered
      .map((s) => s.net_outcome)
      .filter((v): v is number => v != null);
    const median = netValues.length
      ? netValues.sort((a, b) => a - b)[Math.floor(netValues.length / 2)]
      : null;
    const base = signals
      .map((s) => s.net_outcome)
      .filter((v): v is number => v != null);
    const baseMedian = base.length
      ? base.sort((a, b) => a - b)[Math.floor(base.length / 2)]
      : null;
    const deltaMedian = median != null && baseMedian != null
      ? median - baseMedian
      : null;
    const deltaN = filtered.length - signals.length;
    const score = (deltaMedian ?? -1) - Math.max(0, -deltaN * 0.001);
    return {
      param: c.param,
      newValue: c.value,
      deltaMedianNet: deltaMedian,
      deltaWinrate: null,
      deltaN,
      score,
    };
  });

  const sorted = scored
    .filter((s) => s.deltaMedianNet != null)
    .sort((a, b) => (b.deltaMedianNet ?? 0) - (a.deltaMedianNet ?? 0));
  return {
    primary: sorted[0] || null,
    secondary: sorted.slice(1, 3),
  };
}

export function frontierCurve(
  paramName: keyof ParamsOverrides,
  grid: number[],
  signals: DerivedSignal[],
  base: ParamsOverrides,
) {
  return grid.map((val) => {
    const params = { ...base, [paramName]: val };
    const filtered = applyFilters(signals, {
      acceptedOnly: false,
      side: "ALL",
      regime: "ALL",
      session: "ALL",
      timeframe: "ALL",
      outcomeRequired: true,
      brushSelection: null,
    }, params, "TRADED");
    const netValues = filtered
      .map((s) => s.net_outcome)
      .filter((v): v is number => v != null);
    const median = netValues.length
      ? netValues.sort((a, b) => a - b)[Math.floor(netValues.length / 2)]
      : null;
    return { value: val, n: filtered.length, medianNet: median };
  });
}
