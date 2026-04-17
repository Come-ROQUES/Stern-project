import { Signal } from "../lib/api";

export type DecisionStatus = "TRADE" | "NO TRADE" | "INSUFFICIENT DATA";
export type Confidence = "LOW" | "MED" | "HIGH";
export type Verdict = "VALID" | "WEAK" | "INVALID";
export type TtlBadge = "TTL_OK" | "TTL_TOO_LOOSE" | "TTL_TOO_TIGHT" | "LOW_SAMPLE";

export interface DecisionResult {
  status: DecisionStatus;
  reason: string;
  confidence: Confidence;
  expectedNetPips: { median: number; p90: number | null };
}

export interface Recommendation {
  param: string;
  suggestion: string;
  impact: string;
  rationale: string;
  level: "PRIMARY" | "SECONDARY";
}

export interface EdgePoint {
  x: number;
  y: number;
  spread: number;
  session: string;
  current?: boolean;
}

export interface QualitySnapshot {
  verdict: Verdict;
  amplitude: number;
  zScore: number;
  spread: number;
  spreadRel: number | null;
  regime: string;
  probReflex: number | null;
  ttr: number | null;
}

export interface TtlInsight {
  histogram: { label: string; count: number }[];
  badge: TtlBadge;
  sample: number;
  ttl: number;
}

export interface Distributions {
  amp: number[];
  spread: number[];
  revNet: number[];
  zScores: number[];
}

export interface DecisionOutput {
  decision: DecisionResult;
  quality: QualitySnapshot | null;
  scatter: EdgePoint[];
  ttlInsight: TtlInsight;
  distributions: Distributions;
  recommendations: Recommendation[];
  thresholds: {
    minSample: number;
    minAmplitude: number;
    maxSpread: number;
    ttlBars: number;
    feesPips: number;
    spreadP50: number;
  };
}

export interface DecisionConfig {
  minSample: number;
  minAmplitude: number;
  maxSpread: number;
  ttlBars: number;
  feesPips: number;
}

export function buildSignalDecision(signals: Signal[], config: DecisionConfig): DecisionOutput {
  const amp = signals.map((s) => Math.abs(s.delta_pips ?? 0));
  const spread = signals.map((s) => s.spread_pips ?? 0);
  const revNet = signals.map((s) => s.final_pnl_pips ?? s.reversion_ratio ?? 0);
  const zScores = signals.map((s) => s.z_score ?? 0);
  const spreadP50 = percentile(spread, 50);
  const netMed = percentile(revNet, 50);
  const netP90 = percentile(revNet, 90);
  const sample = signals.length;

  const decision = computeDecision({
    signals,
    netMedian: netMed,
    netP90,
    spreadP50,
    feesPips: config.feesPips,
    minSample: config.minSample,
  });

  const last = signals[signals.length - 1] ?? null;
  const quality = last
    ? buildQuality(last, config.minAmplitude, config.maxSpread)
    : null;

  const scatter: EdgePoint[] = signals.map((s, idx) => ({
    x: Math.abs(s.delta_pips ?? 0),
    y: s.final_pnl_pips ?? s.reversion_ratio ?? 0,
    spread: s.spread_pips ?? 0,
    session: s.volatility_regime ?? "UNKNOWN",
    current: idx === signals.length - 1,
  }));

  const ttlInsight = buildTtlInsight(signals, config.ttlBars);
  const recommendations = buildRecommendations(decision, netMed, spreadP50, sample, config);

  return {
    decision,
    quality,
    scatter,
    ttlInsight,
    distributions: { amp, spread, revNet, zScores },
    recommendations,
    thresholds: {
      minSample: config.minSample,
      minAmplitude: config.minAmplitude,
      maxSpread: config.maxSpread,
      ttlBars: config.ttlBars,
      feesPips: config.feesPips,
      spreadP50,
    },
  };
}

function buildQuality(signal: Signal, minAmp: number, maxSpread: number): QualitySnapshot {
  const amplitude = Math.abs(signal.delta_pips ?? 0);
  const spread = signal.spread_pips ?? 0;
  const zScore = signal.z_score ?? 0;
  const regime = signal.volatility_regime ?? "UNKNOWN";
  const ttr = (signal as any).time_to_reflex_bars ?? (signal as any).ttr_bars ?? null;
  const probReflex = signal.reversion_ratio ?? null;
  const spreadRel = amplitude > 0 ? spread / amplitude : null;
  const verdict = computeVerdict(amplitude, spread, minAmp, maxSpread);
  return { verdict, amplitude, zScore, spread, spreadRel, regime, probReflex, ttr };
}

function buildTtlInsight(signals: Signal[], ttl: number): TtlInsight {
  const ttrs = signals
    .map((s: any) => s.time_to_reflex_bars ?? s.ttr_bars ?? null)
    .filter((v) => v != null) as number[];
  const hist = binBy(ttrs, 10);
  const sample = ttrs.length;
  const median = percentile(ttrs, 50);
  let badge: TtlBadge = "LOW_SAMPLE";
  if (sample >= 5) {
    badge = median > ttl ? "TTL_TOO_LOOSE" : "TTL_OK";
  }
  return { histogram: hist, badge, sample, ttl };
}

function buildRecommendations(decision: DecisionResult, netMed: number, spreadP50: number, sample: number, cfg: DecisionConfig): Recommendation[] {
  const recos: Recommendation[] = [];
  if (sample < cfg.minSample) {
    recos.push({
      param: "scope",
      suggestion: "Elargir à YESTERDAY ou DATE",
      impact: "Confiance ↑ (N augmenté)",
      rationale: "Echantillon insuffisant pour décider",
      level: "PRIMARY",
    });
  }
  if (netMed <= cfg.feesPips + spreadP50) {
    recos.push({
      param: "min_amplitude_pips",
      suggestion: "Augmenter min amplitude (0.8 → 1.0)",
      impact: "+0.2-0.4p net median estimé",
      rationale: "Edge net trop proche des coûts",
      level: recos.length === 0 ? "PRIMARY" : "SECONDARY",
    });
  }
  if (spreadP50 > cfg.maxSpread) {
    recos.push({
      param: "max_spread_pips",
      suggestion: "Serrer le spread max (0.3 → 0.25)",
      impact: "Réduit les coûts de friction",
      rationale: "Spread médian élevé",
      level: recos.length === 0 ? "PRIMARY" : "SECONDARY",
    });
  }
  if (recos.length === 0) {
    recos.push({
      param: "action",
      suggestion: "Maintenir les paramètres actuels",
      impact: "Edge OK",
      rationale: "Net > coûts et échantillon suffisant",
      level: "PRIMARY",
    });
  }
  return recos;
}

export function computeDecision({
  signals,
  netMedian,
  netP90,
  spreadP50,
  feesPips,
  minSample,
}: {
  signals: Signal[];
  netMedian: number;
  netP90: number | null;
  spreadP50: number;
  feesPips: number;
  minSample: number;
}): DecisionResult {
  const sample = signals.length;
  if (sample === 0) {
    return {
      status: "INSUFFICIENT DATA",
      reason: "Aucun signal dans le scope actuel",
      confidence: "LOW",
      expectedNetPips: { median: 0, p90: null },
    };
  }
  if (sample < minSample) {
    return {
      status: "NO TRADE",
      reason: `Echantillon trop faible (N=${sample}/${minSample})`,
      confidence: "LOW",
      expectedNetPips: { median: netMedian, p90: netP90 },
    };
  }

  const costFloor = feesPips + spreadP50;
  if (netMedian <= 0) {
    return {
      status: "NO TRADE",
      reason: "Net median <= 0",
      confidence: sample >= 80 ? "MED" : "LOW",
      expectedNetPips: { median: netMedian, p90: netP90 },
    };
  }
  if (netMedian <= costFloor) {
    return {
      status: "NO TRADE",
      reason: `Net median (${fmt(netMedian)}p) <= coûts (${fmt(costFloor)}p)`,
      confidence: sample >= 80 ? "MED" : "LOW",
      expectedNetPips: { median: netMedian, p90: netP90 },
    };
  }

  return {
    status: "TRADE",
    reason: `Net median (${fmt(netMedian)}p) > coûts (${fmt(costFloor)}p)`,
    confidence: sample >= 120 ? "HIGH" : sample >= 60 ? "MED" : "LOW",
    expectedNetPips: { median: netMedian, p90: netP90 },
  };
}

function computeVerdict(amplitude: number, spread: number, minAmp: number, maxSpread: number): Verdict {
  if (amplitude === 0) return "INVALID";
  if (amplitude >= minAmp && spread <= maxSpread) return "VALID";
  if (amplitude >= minAmp * 0.8 && spread <= maxSpread * 1.2) return "WEAK";
  return "INVALID";
}

function percentile(arr: number[], p: number): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function binBy(values: number[], bins: number) {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = (max - min) / bins || 1;
  const results: { label: string; count: number }[] = [];
  for (let i = 0; i < bins; i++) {
    const bMin = min + i * width;
    const bMax = i === bins - 1 ? max + 1e-6 : bMin + width;
    const count = values.filter((v) => v >= bMin && v < bMax).length;
    results.push({ label: `${bMin.toFixed(1)}–${bMax.toFixed(1)}`, count });
  }
  return results;
}

function fmt(v: number): string {
  return Number.isFinite(v) ? v.toFixed(2) : "n/a";
}
