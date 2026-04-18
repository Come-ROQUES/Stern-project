import { useDeferredValue, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  createChart,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import { api, Signal, type Ohlc, type MarketTrajectoryPoint } from "../lib/api";
import { useRunId, useRunMeta } from "../lib/useRunContext";
import { activeContext, defaultScope } from "../lib/activeContext";
import { useCanonicalTrades, CanonicalTrade } from "../lib/canonicalApi";
import { useLightweightChartAutosize } from "../lib/charts/useLightweightChartAutosize";
import { GlassBadge, GlassCard, GlassKPI } from "./ui/glass";
import { cn } from "../lib/utils";
import { isAbortLikeChartError } from "./price-trades/chartShared";

// =============================================================================
// TYPES
// =============================================================================

type ReplayView = "TRADES" | "ALL_SIGNALS";
type TradeFilter = "ALL" | "PROFIT" | "LOSS" | "OPEN";
type SignalFilter = "ALL" | "TRADED" | "ACCEPTED" | "REJECTED";

type PipelineStage = {
  id: string;
  layer: "OBSERVATION" | "DECISION" | "EXECUTION" | "OUTCOME";
  label: string;
  sublabel?: string;
  ts: string | null;
  deltaPrevMs?: number | null;
  detail?: string | null;
  metrics?: { label: string; value: string; tone?: "success" | "danger" | "warning" | "muted" | "info" }[];
  tone: "success" | "danger" | "warning" | "muted" | "info" | "default";
  icon: string;
};

// =============================================================================
// HELPERS
// =============================================================================

function fmtTs(ts?: string | null): string {
  if (!ts) return "--";
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts.slice(0, 23);
    return d.toISOString().slice(11, 23) + "Z";
  } catch {
    return ts.slice(0, 23);
  }
}

function fmtTsFull(ts?: string | null): string {
  if (!ts) return "--";
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toISOString().replace("T", " ").slice(0, 23) + "Z";
  } catch {
    return ts;
  }
}

function shortId(id?: string | null): string {
  if (!id) return "";
  return id.slice(0, 8);
}

function deltaMs(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null;
  try {
    const da = new Date(a).getTime();
    const db = new Date(b).getTime();
    if (isNaN(da) || isNaN(db)) return null;
    return db - da;
  } catch {
    return null;
  }
}

function fmtDelta(ms?: number | null): string {
  if (ms == null) return "";
  if (Math.abs(ms) < 1000) return `${ms.toFixed(0)}ms`;
  if (Math.abs(ms) < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}min`;
}

function fmtPips(v?: number | null): string {
  if (v == null) return "--";
  return `${v >= 0 ? "+" : ""}${Number(v).toFixed(2)}p`;
}

function fmtUsd(v?: number | null): string {
  if (v == null) return "--";
  return `${v >= 0 ? "+" : ""}$${Number(v).toFixed(2)}`;
}

function toChartTime(ts?: string | null): Time | null {
  if (!ts) return null;
  const ms = new Date(ts).getTime();
  if (!Number.isFinite(ms)) return null;
  const sec = Math.floor(ms / 1000);
  if (!Number.isFinite(sec) || sec <= 0) return null;
  return sec as Time;
}

function isValidOhlcBar(bar: Ohlc): boolean {
  if (!bar || typeof bar.timestamp !== "string") return false;
  if (!Number.isFinite(Date.parse(bar.timestamp))) return false;
  return [bar.open, bar.high, bar.low, bar.close].every(
    (value) => typeof value === "number" && Number.isFinite(value)
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

type SafeCandlePoint = {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
};

function toSafeCandlePoint(bar: Ohlc): SafeCandlePoint | null {
  const time = toChartTime(bar.timestamp);
  if (time == null) return null;

  const open = Number(bar.open);
  const highRaw = Number(bar.high);
  const lowRaw = Number(bar.low);
  const close = Number(bar.close);
  if (![open, highRaw, lowRaw, close].every((v) => Number.isFinite(v))) {
    return null;
  }

  const high = Math.max(highRaw, open, close, lowRaw);
  const low = Math.min(lowRaw, open, close, highRaw);
  if (!Number.isFinite(high) || !Number.isFinite(low) || high < low) {
    return null;
  }

  return { time, open, high, low, close };
}

function mapTrajectoryPoint(
  point: MarketTrajectoryPoint
): { time: Time; value: number } | null {
  const value = point.mid ?? point.price;
  if (!Number.isFinite(value)) return null;
  const time = toChartTime(point.ts);
  if (time == null || !Number.isFinite(time as number) || Number(time) <= 0) {
    return null;
  }
  return { time, value };
}

function pnlTone(v?: number | null): "success" | "danger" | "muted" {
  if (v == null) return "muted";
  return v > 0 ? "success" : v < 0 ? "danger" : "muted";
}

function exitReasonIcon(reason?: string | null): string {
  if (!reason) return "?";
  const r = reason.toUpperCase();
  if (r === "TP" || r.includes("TAKE_PROFIT")) return "TP";
  if (r === "SL" || r.includes("STOP_LOSS")) return "SL";
  if (r.includes("TIME") || r.includes("TIMEOUT")) return "TS";
  if (r.includes("EARLY_KILL")) return "EK";
  if (r.includes("MANUAL")) return "MN";
  if (r.includes("RECONCIL")) return "RC";
  return reason.slice(0, 2).toUpperCase();
}

function exitReasonTone(reason?: string | null): "success" | "danger" | "warning" | "muted" {
  if (!reason) return "muted";
  const r = reason.toUpperCase();
  if (r === "TP" || r.includes("TAKE_PROFIT")) return "success";
  if (r === "SL" || r.includes("STOP_LOSS")) return "danger";
  if (r.includes("TIME") || r.includes("EARLY")) return "warning";
  return "muted";
}

function isTrulyAccepted(s: Signal): boolean {
  if (s.accepted !== true) return false;
  if ((s.rejection_reason || "").trim()) return false;
  const stage = (s.decision_stage || "").toUpperCase();
  if (stage.includes("TIMEOUT") || stage === "REAPER_EXPIRED") return false;
  return true;
}

function finalReason(s: Signal): string {
  if (isTrulyAccepted(s)) return s.reason || "ACCEPTED";
  return s.rejection_reason || s.reason || s.wait_reason || "REJECTED";
}

function parseRejectionDetail(s: Signal): Record<string, unknown> | null {
  const raw = s.rejection_detail_json;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function simVerdictBadge(
  s: Signal
): { label: string; variant: "success" | "danger" | "warning" | "muted" | "info" } | null {
  const verdict = s.sim_verdict;
  if (verdict === "WOULD_WIN") return { label: "Would have won", variant: "success" };
  if (verdict === "WOULD_LOSE") return { label: "Would not have won", variant: "danger" };
  if (verdict === "UNRELIABLE") return { label: "Audit unreliable", variant: "warning" };
  return null;
}

// =============================================================================
// LAYER CONFIG
// =============================================================================

const LAYER_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; glow: string }> = {
  OBSERVATION: { label: "L1", color: "text-[#00FF88]", bg: "bg-[#00FF88]/15", border: "border-[#00FF88]/30", glow: "rgba(0,255,136,0.4)" },
  DECISION: { label: "L2", color: "text-violet-400", bg: "bg-violet-500/15", border: "border-violet-500/30", glow: "rgba(139,92,246,0.4)" },
  EXECUTION: { label: "L3", color: "text-amber-400", bg: "bg-amber-500/15", border: "border-amber-500/30", glow: "rgba(245,158,11,0.4)" },
  OUTCOME: { label: "R", color: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/30", glow: "rgba(16,185,129,0.4)" },
};

const TONE_COLORS: Record<string, { node: string; text: string; glow: string }> = {
  success: { node: "bg-emerald-500/25 border-emerald-500/50", text: "text-emerald-400", glow: "0 0 12px rgba(16,185,129,0.5)" },
  danger: { node: "bg-red-500/25 border-red-500/50", text: "text-red-400", glow: "0 0 12px rgba(239,68,68,0.5)" },
  warning: { node: "bg-amber-500/25 border-amber-500/50", text: "text-amber-400", glow: "0 0 12px rgba(245,158,11,0.5)" },
  info: { node: "bg-[#00FF88]/25 border-[#00FF88]/50", text: "text-[#00FF88]", glow: "0 0 12px rgba(0,255,136,0.5)" },
  muted: { node: "bg-neutral-500/20 border-neutral-500/30", text: "text-neutral-400", glow: "none" },
  default: { node: "bg-white/10 border-white/20", text: "text-neutral-300", glow: "none" },
};

const ICON_GLYPHS: Record<string, string> = {
  ZAP: "\u26A1", SIGNAL: "\u25C9", GATE: "\u2630", WAIT: "\u23F3",
  RELEASE: "\u25B6", EXPIRE: "\u2716", CHECK: "\u2714", BLOCK: "\u2718",
  TRIGGER: "\u25B7", SUBMIT: "\u21E7", FILL: "\u2605", BRACKET: "\u2B1C",
  HOLD: "\u2022", EXIT: "\u25C0", WIN: "\u2714", LOSS: "\u2718",
  OPEN: "\u25CB", SKIP: "\u2500", TP: "\u2191", SL: "\u2193",
  TS: "\u23F0", EK: "\u2620", MN: "\u270B", RC: "\u267B",
};

// =============================================================================
// PIPELINE BUILDER (unchanged logic)
// =============================================================================

function buildPipeline(sig: Signal | null, trade: CanonicalTrade | null): PipelineStage[] {
  const stages: PipelineStage[] = [];
  let prevTs: string | null = null;
  const sx = sig as any;

  function push(stage: Omit<PipelineStage, "deltaPrevMs">) {
    const delta = deltaMs(prevTs, stage.ts);
    stages.push({ ...stage, deltaPrevMs: delta });
    if (stage.ts) prevTs = stage.ts;
  }

  if (sig?.shock_detect_ts || sig?.shock_detect_bar_ts) {
    const shockTs = sig.shock_detect_ts || sig.shock_detect_bar_ts;
    push({ id: "shock", layer: "OBSERVATION", label: "Shock", sublabel: sx?.shock_id ? `${shortId(sx.shock_id)}` : undefined, ts: shockTs ?? null, tone: "info", icon: "ZAP", metrics: [...(sig.amplitude_pips != null ? [{ label: "Amplitude", value: fmtPips(sig.amplitude_pips) }] : []), ...(sig.atr_pips != null ? [{ label: "ATR", value: fmtPips(sig.atr_pips) }] : []), { label: "Dir", value: sig.direction || "--" }] });
  }

  if (sig?.signal_created_ts || sig?.timestamp) {
    push({ id: "signal_created", layer: "DECISION", label: "Signal", sublabel: sig.signal_id ? shortId(sig.signal_id) : undefined, ts: sig.signal_created_ts || sig.timestamp || null, tone: "default", icon: "SIGNAL", metrics: [...(sig.spread_pips_at_decision != null ? [{ label: "Spread", value: fmtPips(sig.spread_pips_at_decision) }] : []), ...(sig.z_score != null ? [{ label: "Z", value: Number(sig.z_score).toFixed(2) }] : [])] });
  }

  if (sig?.gate_eval_start_ts || sig?.gate_eval_end_ts) {
    const gateMs = deltaMs(sig.gate_eval_start_ts, sig.gate_eval_end_ts);
    const gateFailures = sig.gate_failures || [];
    push({ id: "gates", layer: "DECISION", label: "Gates", sublabel: gateFailures.length > 0 ? `${gateFailures.length} failed` : "passed", ts: sig.gate_eval_end_ts || sig.gate_eval_start_ts || null, tone: gateFailures.length > 0 ? "danger" : "success", icon: "GATE", metrics: [...(gateMs != null ? [{ label: "Duration", value: fmtDelta(gateMs) }] : []), ...gateFailures.map(g => ({ label: "Failed", value: g, tone: "danger" as const }))] });
  }

  if (sig?.wait_enter_ts) {
    push({ id: "wait_enter", layer: "DECISION", label: "Wait", sublabel: sig.wait_reason || sig.wait_state || undefined, ts: sig.wait_enter_ts, tone: "warning", icon: "WAIT", metrics: [...(sig.spread_pips_at_decision != null ? [{ label: "Spread", value: fmtPips(sig.spread_pips_at_decision) }] : [])] });
  }

  if (sig?.wait_release_ts) {
    const waitMs = deltaMs(sig.wait_enter_ts, sig.wait_release_ts);
    push({ id: "wait_release", layer: "DECISION", label: "Released", sublabel: sig.wait_reason || undefined, ts: sig.wait_release_ts, tone: "success", icon: "RELEASE", metrics: [...(waitMs != null ? [{ label: "Wait", value: fmtDelta(waitMs) }] : []), ...(sig.spread_pips_at_submit != null ? [{ label: "Spread", value: fmtPips(sig.spread_pips_at_submit) }] : [])] });
  }

  if (sig?.wait_expire_ts && !sig?.wait_release_ts) {
    const waitMs = deltaMs(sig.wait_enter_ts, sig.wait_expire_ts);
    push({ id: "wait_expire", layer: "DECISION", label: "Expired", sublabel: sig.rejection_reason || "TIMEOUT", ts: sig.wait_expire_ts, tone: "danger", icon: "EXPIRE", metrics: [...(waitMs != null ? [{ label: "Wait", value: fmtDelta(waitMs) }] : [])] });
  }

  if (sig?.decision_ts) {
    const traded = sig.was_traded === true || !!sig.trade_id;
    const accepted = isTrulyAccepted(sig);
    push({ id: "decision", layer: "DECISION", label: "Decision", sublabel: sig.decision_stage || undefined, ts: sig.decision_ts, tone: traded ? "success" : accepted ? "success" : "danger", icon: traded ? "CHECK" : accepted ? "CHECK" : "BLOCK", metrics: [{ label: "Verdict", value: traded ? "TRADE" : accepted ? "ACCEPTED" : finalReason(sig) }, ...(sig.reflex_elapsed_ms != null ? [{ label: "Reflex", value: fmtDelta(sig.reflex_elapsed_ms) }] : []), ...(sig.bar_age_at_decision_sec != null ? [{ label: "Bar age", value: `${Number(sig.bar_age_at_decision_sec).toFixed(1)}s` }] : [])] });
  }

  if (trade) {
    const t = trade as any;

    if (t.entry_trigger_ts) {
      push({ id: "entry_trigger", layer: "EXECUTION", label: "Trigger", ts: t.entry_trigger_ts, tone: "default", icon: "TRIGGER", metrics: [...(t.bar_age_at_trigger_sec != null ? [{ label: "Bar age", value: `${Number(t.bar_age_at_trigger_sec).toFixed(1)}s` }] : [])] });
    }

    if (t.entry_submit_ts) {
      push({ id: "entry_submit", layer: "EXECUTION", label: "Submit", sublabel: `${trade.side} ${trade.qty?.toLocaleString()}`, ts: t.entry_submit_ts, tone: "default", icon: "SUBMIT", metrics: [...(t.entry_submit_spread_pips != null ? [{ label: "Spread", value: fmtPips(t.entry_submit_spread_pips) }] : []), ...(t.entry_submit_bid != null && t.entry_submit_ask != null ? [{ label: "Quote", value: `${Number(t.entry_submit_bid).toFixed(5)}/${Number(t.entry_submit_ask).toFixed(5)}` }] : [])] });
    }

    if (t.entry_fill_ts || trade.entry_time) {
      const fillTs = t.entry_fill_ts || trade.entry_time;
      const latMs = t.entry_submit_to_fill_ms ?? deltaMs(t.entry_submit_ts, fillTs);
      push({ id: "entry_fill", layer: "EXECUTION", label: "Filled", sublabel: trade.entry_price ? `@ ${Number(trade.entry_price).toFixed(5)}` : undefined, ts: fillTs, tone: "success", icon: "FILL", metrics: [...(latMs != null ? [{ label: "Latency", value: fmtDelta(latMs), tone: (latMs > 500 ? "warning" : "success") as "warning" | "success" }] : []), ...(t.entry_slippage_pips != null ? [{ label: "Slip", value: fmtPips(t.entry_slippage_pips), tone: pnlTone(-Math.abs(t.entry_slippage_pips)) }] : []), ...(trade.spread_pips_at_entry != null ? [{ label: "Spread", value: fmtPips(trade.spread_pips_at_entry) }] : [])] });
    }

    if (t.tp_submit_ts || t.sl_submit_ts) {
      push({ id: "bracket", layer: "EXECUTION", label: "Bracket", sublabel: "TP+SL", ts: t.tp_submit_ts || t.sl_submit_ts, tone: "default", icon: "BRACKET", metrics: [...(trade.tp_price != null ? [{ label: "TP", value: Number(trade.tp_price).toFixed(5) }] : []), ...(trade.sl_price != null ? [{ label: "SL", value: Number(trade.sl_price).toFixed(5) }] : [])] });
    }

    if (trade.entry_time && trade.exit_time && trade.status === "CLOSED") {
      push({ id: "holding", layer: "EXECUTION", label: "Holding", sublabel: t.holding_s != null ? `${Number(t.holding_s).toFixed(1)}s` : undefined, ts: null, tone: "default", icon: "HOLD", metrics: [...(t.mfe_pips != null ? [{ label: "MFE", value: fmtPips(t.mfe_pips), tone: "success" as const }] : []), ...(t.mae_pips != null ? [{ label: "MAE", value: fmtPips(-Math.abs(t.mae_pips)), tone: "danger" as const }] : []), ...(t.time_to_mfe_s != null ? [{ label: "t-MFE", value: `${Number(t.time_to_mfe_s).toFixed(1)}s` }] : []), ...(t.holding_s != null ? [{ label: "Duration", value: `${Number(t.holding_s).toFixed(1)}s` }] : [])] });
    }

    if (t.exit_fill_ts || trade.exit_time) {
      const exitFillTs = t.exit_fill_ts || trade.exit_time;
      const exitLat = t.exit_submit_to_fill_ms ?? deltaMs(t.exit_submit_ts, exitFillTs);
      push({ id: "exit_fill", layer: "EXECUTION", label: "Exit", sublabel: trade.exit_price ? `@ ${Number(trade.exit_price).toFixed(5)}` : undefined, ts: exitFillTs, tone: exitReasonTone(trade.exit_reason), icon: exitReasonIcon(trade.exit_reason), metrics: [{ label: "Reason", value: trade.exit_reason || "--" }, ...(exitLat != null ? [{ label: "Latency", value: fmtDelta(exitLat), tone: (exitLat > 500 ? "warning" : "success") as "warning" | "success" }] : []), ...(trade.exit_slippage_pips != null ? [{ label: "Slip", value: fmtPips(trade.exit_slippage_pips), tone: pnlTone(-Math.abs(trade.exit_slippage_pips)) }] : [])] });
    }

    if (trade.status === "CLOSED") {
      const netPips = trade.pnl_net_pips ?? trade.pnl_pips ?? null;
      const netUsd = (trade as any).pnl_net_usd ?? null;
      const netEur = trade.pnl_net_eur ?? trade.pnl ?? null;
      const commUsd = trade.commission_total_usd ?? null;
      const rMult = (trade as any).r_multiple ?? null;
      push({ id: "outcome", layer: "OUTCOME", label: "PnL", sublabel: trade.exit_reason || undefined, ts: trade.exit_time || null, tone: pnlTone(netPips), icon: netPips != null && netPips >= 0 ? "WIN" : "LOSS", metrics: [...(netPips != null ? [{ label: "Net", value: fmtPips(netPips), tone: pnlTone(netPips) }] : []), ...(netUsd != null ? [{ label: "USD", value: fmtUsd(netUsd), tone: pnlTone(netUsd) }] : []), ...(netEur != null ? [{ label: "EUR", value: fmtUsd(netEur), tone: pnlTone(netEur) }] : []), ...(commUsd != null ? [{ label: "Comm", value: fmtUsd(-Math.abs(commUsd)), tone: "muted" as const }] : []), ...(rMult != null ? [{ label: "R", value: `${Number(rMult).toFixed(2)}R`, tone: pnlTone(rMult) }] : [])] });
    } else if (trade.status === "OPEN") {
      push({ id: "outcome", layer: "OUTCOME", label: "Open", ts: null, tone: "warning", icon: "OPEN", metrics: [{ label: "Status", value: "OPEN", tone: "warning" }, ...(trade.tp_price != null ? [{ label: "TP", value: Number(trade.tp_price).toFixed(5) }] : []), ...(trade.sl_price != null ? [{ label: "SL", value: Number(trade.sl_price).toFixed(5) }] : [])] });
    }
  } else if (sig) {
    const traded = sig.was_traded === true || !!sig.trade_id;
    if (!traded) {
      push({ id: "outcome", layer: "OUTCOME", label: "No Trade", sublabel: finalReason(sig), ts: sig.decision_ts || sig.timestamp || null, tone: "muted", icon: "SKIP", metrics: [{ label: "Decision", value: finalReason(sig) }, ...(sig.decision_stage ? [{ label: "Stage", value: sig.decision_stage }] : [])] });
    }
  }

  return stages;
}

// =============================================================================
// HORIZONTAL TIMELINE
// =============================================================================

function HorizontalTimeline({
  stages,
  selectedStageId,
  onSelectStage,
}: {
  stages: PipelineStage[];
  selectedStageId: string | null;
  onSelectStage: (id: string) => void;
}) {
  if (stages.length === 0) return null;

  return (
    <div className="overflow-x-auto pb-2 -mx-1 px-1">
      <div className="flex items-start min-w-max gap-0">
        {stages.map((stage, idx) => {
          const prev = idx > 0 ? stages[idx - 1] : null;
          const isNewLayer = !prev || prev.layer !== stage.layer;
          const isSelected = selectedStageId === stage.id;
          const tc = TONE_COLORS[stage.tone] || TONE_COLORS.default;
          const lc = LAYER_CONFIG[stage.layer] || LAYER_CONFIG.OUTCOME;

          return (
            <div key={stage.id} className="flex items-start">
              {/* Connector line */}
              {idx > 0 && (
                <div className="flex flex-col items-center justify-center pt-6 mx-0.5">
                  {stage.deltaPrevMs != null && stage.deltaPrevMs > 0 && (
                    <div className="text-[8px] font-mono text-neutral-500 mb-0.5 whitespace-nowrap">
                      +{fmtDelta(stage.deltaPrevMs)}
                    </div>
                  )}
                  <motion.div
                    className={cn("h-px w-8 sm:w-12", isNewLayer ? "bg-gradient-to-r from-white/10 to-white/20" : "bg-white/10")}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.3, delay: idx * 0.04 }}
                    style={{ transformOrigin: "left" }}
                  />
                </div>
              )}

              {/* Node */}
              <motion.button
                onClick={() => onSelectStage(stage.id)}
                className="flex flex-col items-center gap-1 px-1 group"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: idx * 0.04 }}
              >
                {/* Layer label (only on first of each layer) */}
                {isNewLayer && (
                  <div className={cn("text-[8px] uppercase tracking-[0.15em] font-bold px-1.5 py-0.5 rounded", lc.color, lc.bg, lc.border, "border")}>
                    {lc.label}
                  </div>
                )}
                {!isNewLayer && <div className="h-[18px]" />}

                {/* Dot */}
                <motion.div
                  className={cn(
                    "w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold cursor-pointer transition-all",
                    tc.node,
                    isSelected && "ring-2 ring-offset-1 ring-offset-neutral-950"
                  )}
                  style={isSelected ? { boxShadow: tc.glow } : undefined}
                  animate={isSelected ? {
                    boxShadow: [tc.glow, tc.glow.replace("0.5)", "0.2)"), tc.glow],
                  } : { boxShadow: "none" }}
                  transition={isSelected ? { duration: 1.5, repeat: Infinity } : { duration: 0.2 }}
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <span className="text-[10px]">{ICON_GLYPHS[stage.icon] || stage.icon.slice(0, 2)}</span>
                </motion.div>

                {/* Label */}
                <div className="text-[9px] font-semibold text-neutral-300 group-hover:text-white transition-colors whitespace-nowrap">
                  {stage.label}
                </div>

                {/* Timestamp */}
                <div className="text-[8px] font-mono text-neutral-600 group-hover:text-neutral-400 transition-colors whitespace-nowrap">
                  {stage.ts ? fmtTs(stage.ts).slice(0, 12) : "--"}
                </div>
              </motion.button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// STAGE DETAIL PANEL (animated)
// =============================================================================

function StageDetailPanel({ stage }: { stage: PipelineStage }) {
  const tc = TONE_COLORS[stage.tone] || TONE_COLORS.default;
  const lc = LAYER_CONFIG[stage.layer] || LAYER_CONFIG.OUTCOME;

  return (
    <motion.div
      key={stage.id}
      initial={{ opacity: 0, y: -8, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={{ opacity: 0, y: -8, height: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="overflow-hidden"
    >
      <div className="rounded-xl border border-white/[0.06] bg-black/30 p-4 mt-3">
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <div className={cn("w-6 h-6 rounded-full border flex items-center justify-center text-xs font-bold", tc.node)}>
            {ICON_GLYPHS[stage.icon] || stage.icon.slice(0, 2)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-white">{stage.label}</span>
              <span className={cn("text-[9px] uppercase tracking-[0.15em] font-bold px-1.5 py-0.5 rounded border", lc.color, lc.bg, lc.border)}>
                {lc.label} {stage.layer}
              </span>
            </div>
            {stage.sublabel && (
              <div className="text-[11px] text-neutral-400 font-mono mt-0.5">{stage.sublabel}</div>
            )}
          </div>
          {stage.ts && (
            <div className="ml-auto text-[10px] font-mono text-neutral-500">
              {fmtTsFull(stage.ts)}
            </div>
          )}
        </div>

        {/* Metrics grid */}
        {stage.metrics && stage.metrics.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {stage.metrics.map((m, i) => {
              const metricTone = m.tone ? (TONE_COLORS[m.tone]?.text || "text-neutral-200") : "text-neutral-200";
              return (
                <div key={i} className="rounded-lg bg-white/[0.03] border border-white/[0.05] px-3 py-2">
                  <div className="text-[9px] uppercase tracking-[0.15em] text-neutral-500">{m.label}</div>
                  <div className={cn("text-[13px] font-mono font-semibold mt-0.5", metricTone)}>
                    {m.value}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Delta from previous */}
        {stage.deltaPrevMs != null && stage.deltaPrevMs > 0 && (
          <div className="mt-2 text-[10px] text-neutral-500">
            +{fmtDelta(stage.deltaPrevMs)} depuis l'etape precedente
          </div>
        )}
      </div>
    </motion.div>
  );
}

// =============================================================================
// TRADE MINI CHART (lightweight-charts)
// =============================================================================

function TradeMiniChart({
  trade,
  runId,
  strategyId,
}: {
  trade: CanonicalTrade;
  runId: string;
  strategyId?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string>("none");
  const { waitingForSize } = useLightweightChartAutosize({
    containerRef,
    fallbackHeight: 200,
    debugName: "TradeMiniChart",
  });

  useEffect(() => {
    if (!containerRef.current || !trade.entry_time) return;
    let cancelled = false;
    const ohlcController = new AbortController();

    async function loadChart() {
      if (!containerRef.current) return;
      setLoading(true);
      setError(null);

      try {
        // Window: 2min before entry to 1min after exit
        const entryMs = new Date(trade.entry_time).getTime();
        const exitMs = trade.exit_time ? new Date(trade.exit_time).getTime() : Date.now();
        const fromMs = entryMs - 2 * 60_000;
        const toMs = exitMs + 1 * 60_000;
        const ctx = {
          ...activeContext,
          run_id: runId,
          strategy_id: strategyId ?? activeContext.strategy_id ?? undefined,
        } as any;

        const trajectory = await api.getTradeMarketTrajectory(
          trade.trade_id,
          {
            preSeconds: 120,
            postSeconds: 60,
            maxPoints: 1500,
          },
          ctx,
          defaultScope
        );
        if (cancelled) return;

        // Destroy previous chart
        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
        }

        const el = containerRef.current;
        if (!el) return;

        const chart = createChart(el, {
          autoSize: true,
          layout: { background: { color: "transparent" }, textColor: "#6b7280", fontFamily: "monospace", fontSize: 10 },
          crosshair: { mode: CrosshairMode.Normal, vertLine: { color: "rgba(255,255,255,0.1)", labelVisible: false }, horzLine: { color: "rgba(255,255,255,0.1)" } },
          timeScale: { borderColor: "rgba(255,255,255,0.06)", timeVisible: true, secondsVisible: true },
          rightPriceScale: { borderColor: "rgba(255,255,255,0.06)" },
          grid: { vertLines: { color: "rgba(255,255,255,0.03)" }, horzLines: { color: "rgba(255,255,255,0.03)" } },
        });
        chartRef.current = chart;

        const isBuy = trade.side === "BUY";
        const entryTime = toChartTime(trade.entry_time);
        if (entryTime == null) {
          setError("Trade invalide: entry_time non exploitable");
          setLoading(false);
          return;
        }

        const trajectoryPoints = trajectory.available ? trajectory.points : [];
        const canUseTrajectory = trajectoryPoints.length >= 2;

        if (canUseTrajectory) {
          const lineSeries = chart.addLineSeries({
            color: "#60a5fa",
            lineWidth: 2,
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
          });
          const lineData = trajectoryPoints
            .map(mapTrajectoryPoint)
            .filter((point): point is { time: Time; value: number } => point !== null);
          if (lineData.length < 2) {
            setError("Pas assez de points de trajectoire valides");
            setLoading(false);
            return;
          }
          lineSeries.setData(lineData);
          setSourceLabel(trajectory.source || "quotes_1hz");

          const markers: any[] = [
            {
              time: entryTime,
              position: isBuy ? "belowBar" : "aboveBar",
              color: isBuy ? "#1EB980" : "#E9436D",
              shape: isBuy ? "arrowUp" : "arrowDown",
              text: `ENTRY ${trade.entry_price?.toFixed(5) || ""}`,
              size: 2,
            },
          ];
          if (trade.exit_time && isFiniteNumber(trade.exit_price)) {
            const exitTime = toChartTime(trade.exit_time);
            if (exitTime != null) {
              const exitColor =
                trade.exit_reason === "TP"
                  ? "#1EB980"
                  : trade.exit_reason === "SL"
                    ? "#E9436D"
                    : "#EAB308";
              markers.push({
                time: exitTime,
                position: isBuy ? "aboveBar" : "belowBar",
                color: exitColor,
                shape: "circle",
                text: `${trade.exit_reason || "EXIT"} ${trade.exit_price.toFixed(5)}`,
                size: 1.6,
              });
            }
          }
          markers.sort((a, b) => (a.time as number) - (b.time as number));
          (lineSeries as any).setMarkers(markers);

          if (isFiniteNumber(trade.tp_price)) {
            lineSeries.createPriceLine({
              price: trade.tp_price,
              color: "rgba(30, 185, 128, 0.5)",
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: "TP",
            });
          }
          if (isFiniteNumber(trade.sl_price)) {
            lineSeries.createPriceLine({
              price: trade.sl_price,
              color: "rgba(233, 67, 109, 0.5)",
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: "SL",
            });
          }
          if (isFiniteNumber(trade.entry_price)) {
            lineSeries.createPriceLine({
              price: trade.entry_price,
              color: "rgba(255,255,255,0.2)",
              lineWidth: 1,
              lineStyle: LineStyle.Dotted,
              axisLabelVisible: false,
              title: "",
            });
          }
        } else {
          const ohlcPayload = await api.getOhlcForRun(
            600,
            runId,
            ctx,
            defaultScope,
            {
              fromTs: new Date(fromMs).toISOString(),
              toTs: new Date(toMs).toISOString(),
              order: "asc",
              signal: ohlcController.signal,
            }
          );
          if (cancelled) return;
          const bars = (ohlcPayload.ohlc || []).filter(isValidOhlcBar);
          if (bars.length < 2) {
            setError("Pas assez de donnees pour ce trade");
            setLoading(false);
            return;
          }
          setSourceLabel("ohlc_fallback");

          const candleSeries = chart.addCandlestickSeries({
            upColor: "#22c55e",
            downColor: "#ef4444",
            wickUpColor: "#22c55e",
            wickDownColor: "#ef4444",
            borderVisible: false,
          });

          const dedup = new Map<number, SafeCandlePoint>();
          bars.forEach((bar) => {
            const point = toSafeCandlePoint(bar);
            if (!point) return;
            dedup.set(Number(point.time), point);
          });
          const candleData = Array.from(dedup.values()).sort(
            (a, b) => Number(a.time) - Number(b.time)
          );
          if (candleData.length < 2) {
            setError("OHLC invalide: timestamps non exploitables");
            setLoading(false);
            return;
          }
          candleSeries.setData(candleData);

          const markers: any[] = [
            {
              time: entryTime,
              position: isBuy ? "belowBar" : "aboveBar",
              color: isBuy ? "#1EB980" : "#E9436D",
              shape: isBuy ? "arrowUp" : "arrowDown",
              text: `ENTRY ${trade.entry_price?.toFixed(5) || ""}`,
              size: 2,
            },
          ];
          if (trade.exit_time && isFiniteNumber(trade.exit_price)) {
            const exitTime = toChartTime(trade.exit_time);
            if (exitTime != null) {
              const exitColor =
                trade.exit_reason === "TP"
                  ? "#1EB980"
                  : trade.exit_reason === "SL"
                    ? "#E9436D"
                    : "#EAB308";
              markers.push({
                time: exitTime,
                position: isBuy ? "aboveBar" : "belowBar",
                color: exitColor,
                shape: "circle",
                text: `${trade.exit_reason || "EXIT"} ${trade.exit_price.toFixed(5)}`,
                size: 1.6,
              });
            }
          }
          markers.sort((a, b) => (a.time as number) - (b.time as number));
          candleSeries.setMarkers(markers);

          if (isFiniteNumber(trade.tp_price)) {
            candleSeries.createPriceLine({
              price: trade.tp_price,
              color: "rgba(30, 185, 128, 0.5)",
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: "TP",
            });
          }
          if (isFiniteNumber(trade.sl_price)) {
            candleSeries.createPriceLine({
              price: trade.sl_price,
              color: "rgba(233, 67, 109, 0.5)",
              lineWidth: 1,
              lineStyle: LineStyle.Dashed,
              axisLabelVisible: true,
              title: "SL",
            });
          }
          if (isFiniteNumber(trade.entry_price)) {
            candleSeries.createPriceLine({
              price: trade.entry_price,
              color: "rgba(255,255,255,0.2)",
              lineWidth: 1,
              lineStyle: LineStyle.Dotted,
              axisLabelVisible: false,
              title: "",
            });
          }
        }

        // Entry→Exit path line
        if (
          isFiniteNumber(trade.entry_price) &&
          isFiniteNumber(trade.exit_price) &&
          trade.exit_time
        ) {
          const exitTime = toChartTime(trade.exit_time);
          if (exitTime != null) {
            const pathSeries = chart.addLineSeries({
              color: (trade.pnl_net_pips ?? trade.pnl_pips ?? 0) >= 0 ? "rgba(30,185,128,0.6)" : "rgba(233,67,109,0.6)",
              lineWidth: 2,
              lineStyle: LineStyle.Dashed,
              crosshairMarkerVisible: false,
              lastValueVisible: false,
              priceLineVisible: false,
            });
            pathSeries.setData([
              { time: entryTime, value: trade.entry_price },
              { time: exitTime, value: trade.exit_price },
            ]);
          }
        }

        // Fit content
        chart.timeScale().fitContent();

        setLoading(false);
      } catch (e) {
        if (cancelled || isAbortLikeChartError(e)) {
          setLoading(false);
          return;
        }
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erreur chargement chart");
          setLoading(false);
        }
      }
    }

    loadChart();

    return () => {
      cancelled = true;
      ohlcController.abort();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [trade.trade_id, trade.entry_time, trade.exit_time, runId]);

  return (
    <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/20">
      <div className="px-3 py-2 flex items-center justify-between border-b border-white/[0.04]">
        <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-semibold">
          Price Action Replay
        </div>
        <div className="flex items-center gap-2">
          {!loading && <div className="text-[10px] text-neutral-500 font-mono">{sourceLabel}</div>}
          {loading && <div className="text-[10px] text-neutral-500">Chargement...</div>}
        </div>
        {error && <div className="text-[10px] text-red-400">{error}</div>}
      </div>
      {waitingForSize && (
        <div className="px-3 py-1 text-[10px] text-amber-200 border-b border-white/[0.04] bg-amber-500/10">
          Chart en attente de dimensions du conteneur...
        </div>
      )}
      <div ref={containerRef} style={{ height: 200 }} />
    </div>
  );
}

function SignalMiniChart({
  signal,
  runId,
  strategyId,
}: {
  signal: Signal;
  runId: string;
  strategyId?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string>("none");
  const { waitingForSize } = useLightweightChartAutosize({
    containerRef,
    fallbackHeight: 180,
    debugName: "SignalMiniChart",
  });

  useEffect(() => {
    if (!containerRef.current || !signal.signal_id || !runId) return;
    let cancelled = false;

    async function loadChart() {
      if (!containerRef.current) return;
      setLoading(true);
      setError(null);
      try {
        const ctx = {
          ...activeContext,
          run_id: runId,
          strategy_id: strategyId ?? activeContext.strategy_id ?? undefined,
        } as any;
        const trajectory = await api.getSignalMarketTrajectory(
          signal.signal_id!,
          {
            preSeconds: 120,
            postSeconds: 180,
            maxPoints: 1800,
            preferHi: true,
          },
          ctx,
          defaultScope
        );
        if (cancelled) return;
        const points = trajectory.available ? trajectory.points : [];
        if (points.length < 2) {
          setError("Pas assez de donnees trajectory pour ce signal");
          setLoading(false);
          return;
        }

        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
        }

        const el = containerRef.current;
        if (!el) return;
        const chart = createChart(el, {
          autoSize: true,
          layout: {
            background: { color: "transparent" },
            textColor: "#6b7280",
            fontFamily: "monospace",
            fontSize: 10,
          },
          crosshair: {
            mode: CrosshairMode.Normal,
            vertLine: { color: "rgba(255,255,255,0.1)", labelVisible: false },
            horzLine: { color: "rgba(255,255,255,0.1)" },
          },
          timeScale: {
            borderColor: "rgba(255,255,255,0.06)",
            timeVisible: true,
            secondsVisible: true,
          },
          rightPriceScale: { borderColor: "rgba(255,255,255,0.06)" },
          grid: {
            vertLines: { color: "rgba(255,255,255,0.03)" },
            horzLines: { color: "rgba(255,255,255,0.03)" },
          },
        });
        chartRef.current = chart;
        setSourceLabel(trajectory.source || "quotes_1hz");

        const lineSeries = chart.addLineSeries({
          color: "#38bdf8",
          lineWidth: 2,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        const lineData = points
          .map(mapTrajectoryPoint)
          .filter((point): point is { time: Time; value: number } => point !== null);
        if (lineData.length < 2) {
          setError("Trajectoire invalide: points insuffisants");
          setLoading(false);
          return;
        }
        lineSeries.setData(lineData);

        const signalTs = toChartTime(
          signal.signal_created_ts || signal.decision_ts || signal.timestamp
        );
        if (signalTs == null) {
          setError("Signal invalide: timestamp non exploitable");
          setLoading(false);
          return;
        }
        const isBuy = (signal.direction || "").toUpperCase() === "BUY";
        (lineSeries as any).setMarkers([
          {
            time: signalTs,
            position: isBuy ? "belowBar" : "aboveBar",
            color: isBuy ? "#1EB980" : "#E9436D",
            shape: isBuy ? "arrowUp" : "arrowDown",
            text: `SIGNAL ${signal.direction || ""}`,
            size: 2,
          },
        ]);

        chart.timeScale().fitContent();
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erreur chargement chart");
          setLoading(false);
        }
      }
    }

    loadChart();
    return () => {
      cancelled = true;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [runId, signal.signal_id, signal.signal_created_ts, signal.decision_ts, signal.timestamp, signal.direction, strategyId]);

  return (
    <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/20">
      <div className="px-3 py-2 flex items-center justify-between border-b border-white/[0.04]">
        <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-semibold">
          Signal Trajectory
        </div>
        <div className="flex items-center gap-2">
          {!loading && <div className="text-[10px] text-neutral-500 font-mono">{sourceLabel}</div>}
          {loading && <div className="text-[10px] text-neutral-500">Chargement...</div>}
        </div>
        {error && <div className="text-[10px] text-red-400">{error}</div>}
      </div>
      {waitingForSize && (
        <div className="px-3 py-1 text-[10px] text-amber-200 border-b border-white/[0.04] bg-amber-500/10">
          Chart en attente de dimensions du conteneur...
        </div>
      )}
      <div ref={containerRef} style={{ height: 180 }} />
    </div>
  );
}

// =============================================================================
// KPI SUMMARY ROW
// =============================================================================

function KPISummaryRow({ trade }: { trade: CanonicalTrade }) {
  const t = trade as any;
  const netPips = trade.pnl_net_pips ?? trade.pnl_pips ?? null;
  const netUsd = t.pnl_net_usd ?? null;
  const items = [
    { label: "PnL", value: fmtPips(netPips), tone: pnlTone(netPips) },
    { label: "PnL $", value: fmtUsd(netUsd), tone: pnlTone(netUsd) },
    { label: "Slip In", value: fmtPips(t.entry_slippage_pips) },
    { label: "Slip Out", value: fmtPips(trade.exit_slippage_pips) },
    { label: "Lat In", value: fmtDelta(t.entry_submit_to_fill_ms) || "--" },
    { label: "Lat Out", value: fmtDelta(trade.exit_submit_to_fill_ms) || "--" },
    { label: "MFE", value: fmtPips(t.mfe_pips), tone: "success" as const },
    { label: "MAE", value: t.mae_pips != null ? fmtPips(-Math.abs(t.mae_pips)) : "--", tone: "danger" as const },
    { label: "R", value: t.r_multiple != null ? `${Number(t.r_multiple).toFixed(2)}R` : "--", tone: pnlTone(t.r_multiple) },
    { label: "Hold", value: t.holding_s != null ? `${Number(t.holding_s).toFixed(1)}s` : "--" },
  ];

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {items.map((item, i) => {
        const tc = item.tone ? (TONE_COLORS[item.tone]?.text || "text-neutral-200") : "text-neutral-200";
        return (
          <div key={i} className="rounded-lg bg-white/[0.03] border border-white/[0.05] px-2.5 py-1.5 min-w-[70px]">
            <div className="text-[8px] uppercase tracking-[0.15em] text-neutral-500">{item.label}</div>
            <div className={cn("text-[12px] font-mono font-semibold", tc)}>{item.value}</div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// TRADE REPLAY CARD (horizontal timeline version)
// =============================================================================

function TradeReplayCard({
  trade,
  signal,
  isExpanded,
  onToggle,
  runId,
  strategyId,
}: {
  trade: CanonicalTrade;
  signal: Signal | null;
  isExpanded: boolean;
  onToggle: () => void;
  runId: string;
  strategyId?: string | null;
}) {
  const t = trade as any;
  const netPips = trade.pnl_net_pips ?? trade.pnl_pips ?? null;
  const netUsd = t.pnl_net_usd ?? null;
  const isOpen = trade.status === "OPEN";
  const exitReason = trade.exit_reason || "";
  const holdMs = deltaMs(trade.entry_time, trade.exit_time);

  const pipeline = useMemo(() => buildPipeline(signal, trade), [signal, trade]);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);

  const activeStage = useMemo(
    () => pipeline.find((s) => s.id === selectedStage) || null,
    [pipeline, selectedStage]
  );

  const handleSelectStage = useCallback((id: string) => {
    setSelectedStage((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div
      className={cn(
        "rounded-xl border transition-all duration-200",
        isExpanded
          ? "border-white/[0.15] bg-white/[0.04]"
          : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12]"
      )}
    >
      {/* Collapsed header */}
      <button onClick={onToggle} className="w-full text-left px-4 py-3 flex items-center gap-3">
        <div className={cn("w-1.5 h-10 rounded-full flex-shrink-0", isOpen ? "bg-amber-500/60" : netPips != null && netPips > 0 ? "bg-emerald-500/60" : netPips != null && netPips < 0 ? "bg-red-500/60" : "bg-neutral-500/40")} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-white">{trade.side} {trade.symbol}</span>
            <GlassBadge variant={isOpen ? "warning" : exitReasonTone(exitReason)} size="sm">{isOpen ? "OPEN" : exitReason || trade.status}</GlassBadge>
            <span className="text-[10px] font-mono text-neutral-500">{shortId(trade.trade_id)}</span>
          </div>
          <div className="text-[11px] text-neutral-400 mt-0.5">
            {fmtTs(trade.entry_time)}
            {trade.exit_time && !isOpen && (<><span className="text-neutral-600 mx-1">-&gt;</span>{fmtTs(trade.exit_time)}</>)}
            {holdMs != null && (<span className="ml-2 text-neutral-500">({fmtDelta(holdMs)})</span>)}
          </div>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          {!isOpen && netPips != null && (<div className={cn("text-[14px] font-mono font-bold", netPips > 0 ? "text-emerald-400" : netPips < 0 ? "text-red-400" : "text-neutral-400")}>{fmtPips(netPips)}</div>)}
          {!isOpen && netUsd != null && (<div className={cn("text-[12px] font-mono", netUsd > 0 ? "text-emerald-400/70" : netUsd < 0 ? "text-red-400/70" : "text-neutral-400")}>{fmtUsd(netUsd)}</div>)}
          {trade.qty != null && (<div className="text-[11px] text-neutral-500 font-mono">{trade.qty.toLocaleString()}</div>)}
          <div className={cn("text-neutral-500 transition-transform", isExpanded && "rotate-180")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
          </div>
        </div>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.06] px-4 py-4">
              {/* IDs */}
              <div className="flex flex-wrap gap-4 mb-4 px-1">
                <div className="text-[10px]"><span className="text-neutral-500">Trade: </span><span className="font-mono text-neutral-300">{trade.trade_id}</span></div>
                {signal?.signal_id && (<div className="text-[10px]"><span className="text-neutral-500">Signal: </span><span className="font-mono text-neutral-300">{signal.signal_id}</span></div>)}
                {(signal as any)?.shock_id && (<div className="text-[10px]"><span className="text-neutral-500">Shock: </span><span className="font-mono text-neutral-300">{(signal as any).shock_id}</span></div>)}
              </div>

              {/* Horizontal timeline */}
              <HorizontalTimeline
                stages={pipeline}
                selectedStageId={selectedStage}
                onSelectStage={handleSelectStage}
              />

              {/* Stage detail panel */}
              <AnimatePresence mode="wait">
                {activeStage && <StageDetailPanel stage={activeStage} />}
              </AnimatePresence>

              {/* KPI summary */}
              {trade.status === "CLOSED" && <KPISummaryRow trade={trade} />}

              {/* Mini chart */}
              <TradeMiniChart trade={trade} runId={runId} strategyId={strategyId} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
// SIGNAL-ONLY REPLAY CARD (horizontal timeline)
// =============================================================================

function SignalReplayCard({
  signal,
  isExpanded,
  onToggle,
  runId,
  strategyId,
}: {
  signal: Signal;
  isExpanded: boolean;
  onToggle: () => void;
  runId: string;
  strategyId?: string | null;
}) {
  const accepted = isTrulyAccepted(signal);
  const traded = signal.was_traded === true || !!signal.trade_id;
  const reason = finalReason(signal);
  const rejectionDetail = useMemo(() => parseRejectionDetail(signal), [signal]);
  const simBadge = useMemo(() => simVerdictBadge(signal), [signal]);
  const pipeline = useMemo(() => buildPipeline(signal, null), [signal]);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const activeStage = useMemo(() => pipeline.find((s) => s.id === selectedStage) || null, [pipeline, selectedStage]);

  return (
    <div className={cn("rounded-xl border transition-all duration-200", isExpanded ? "border-white/[0.15] bg-white/[0.04]" : "border-white/[0.06] bg-black/20 hover:bg-white/[0.03]")}>
      <button onClick={onToggle} className="w-full text-left px-4 py-2.5 flex items-center gap-3">
        <div className={cn("w-1.5 h-8 rounded-full flex-shrink-0", traded ? "bg-emerald-500/60" : accepted ? "bg-[#00FF88]/40" : "bg-neutral-500/30")} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-neutral-300">{signal.direction}</span>
            <GlassBadge variant={traded ? "success" : accepted ? "info" : "muted"} size="sm">{traded ? "TRADED" : accepted ? "ACCEPTED" : "REJECTED"}</GlassBadge>
            {simBadge && <GlassBadge variant={simBadge.variant} size="sm">{simBadge.label}</GlassBadge>}
            {signal.rejection_reason === "COUNTERSHOCK_SAME_CYCLE" && rejectionDetail?.parent_shock_id && (
              <GlassBadge variant="warning" size="sm">
                Parent {shortId(String(rejectionDetail.parent_shock_id))}
              </GlassBadge>
            )}
            <span className="text-[10px] font-mono text-neutral-500">{shortId(signal.signal_id)}</span>
          </div>
          <div className="text-[10px] text-neutral-500 mt-0.5">{fmtTs(signal.timestamp)}<span className="ml-2 text-neutral-600">{reason}</span></div>
        </div>
        <div className={cn("text-neutral-500 transition-transform", isExpanded && "rotate-180")}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.06] px-4 py-3">
              <HorizontalTimeline stages={pipeline} selectedStageId={selectedStage} onSelectStage={(id) => setSelectedStage(prev => prev === id ? null : id)} />
              <AnimatePresence mode="wait">
                {activeStage && <StageDetailPanel stage={activeStage} />}
              </AnimatePresence>
              {signal.signal_id && runId && (
                <SignalMiniChart signal={signal} runId={runId} strategyId={strategyId} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function SignalReplayPanel() {
  const runId = useRunId();
  const { run } = useRunMeta();
  const strategyId = run?.strategy_id ?? null;
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ReplayView>("TRADES");
  const [tradeFilter, setTradeFilter] = useState<TradeFilter>("ALL");
  const [signalFilter, setSignalFilter] = useState<SignalFilter>("ALL");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [visibleTradesCount, setVisibleTradesCount] = useState(30);
  const [visibleSignalsCount, setVisibleSignalsCount] = useState(40);
  const deferredQuery = useDeferredValue(query);

  const { trades: canonicalTrades, loading: tradesLoading } = useCanonicalTrades(runId, 500, {
    strategyId: strategyId ?? undefined,
    disablePolling: true,
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!runId) return;
      setLoading(true);
      setError(null);
      try {
        const ctx = { ...activeContext, run_id: runId, strategy_id: strategyId ?? undefined } as any;
        const rows = await api.getSignals(2000, ctx);
        if (!cancelled) setSignals(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erreur chargement signaux");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [runId, strategyId]);

  const signalBySignalId = useMemo(() => {
    const m = new Map<string, Signal>();
    for (const s of signals) { if (s.signal_id) m.set(s.signal_id, s); }
    return m;
  }, [signals]);

  const signalByTradeId = useMemo(() => {
    const m = new Map<string, Signal>();
    for (const s of signals) { if (s.trade_id) m.set(s.trade_id, s); }
    return m;
  }, [signals]);

  const filteredTrades = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return (canonicalTrades || [])
      .filter((t) => {
        if (tradeFilter === "PROFIT") return (t.pnl_net_pips ?? t.pnl_pips ?? 0) > 0;
        if (tradeFilter === "LOSS") return (t.pnl_net_pips ?? t.pnl_pips ?? 0) < 0;
        if (tradeFilter === "OPEN") return t.status === "OPEN";
        return true;
      })
      .filter((t) => {
        if (!q) return true;
        return [t.trade_id, t.signal_id, t.side, t.symbol, t.exit_reason, t.status].filter(Boolean).join(" ").toLowerCase().includes(q);
      })
      .sort((a, b) => new Date(b.entry_time).getTime() - new Date(a.entry_time).getTime());
  }, [canonicalTrades, tradeFilter, deferredQuery]);

  const filteredSignals = useMemo(() => {
    if (view !== "ALL_SIGNALS") return [];
    const q = deferredQuery.trim().toLowerCase();
    return signals
      .filter((s) => {
        const traded = s.was_traded === true || !!s.trade_id;
        const accepted = isTrulyAccepted(s);
        if (signalFilter === "TRADED") return traded;
        if (signalFilter === "ACCEPTED") return accepted && !traded;
        if (signalFilter === "REJECTED") return !accepted && !traded;
        return true;
      })
      .filter((s) => {
        if (!q) return true;
        return [s.signal_id, s.trade_id, s.direction, s.decision_stage, s.rejection_reason, s.reason, s.wait_reason].filter(Boolean).join(" ").toLowerCase().includes(q);
      });
  }, [signals, view, signalFilter, deferredQuery]);

  useEffect(() => {
    setVisibleTradesCount(30);
  }, [tradeFilter, deferredQuery, canonicalTrades, view]);

  useEffect(() => {
    setVisibleSignalsCount(40);
  }, [signalFilter, deferredQuery, signals, view]);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((m) => ({ ...m, [id]: !m[id] }));
  }, []);

  const stats = useMemo(() => {
    const trades = canonicalTrades || [];
    const closed = trades.filter((t) => t.status === "CLOSED");
    const wins = closed.filter((t) => (t.pnl_net_pips ?? t.pnl_pips ?? 0) > 0);
    const totalSignals = signals.length;
    const tradedSignals = signals.filter((s) => s.was_traded || s.trade_id).length;
    const rejectedSignals = signals.filter((s) => !isTrulyAccepted(s) && !s.was_traded && !s.trade_id).length;
    return {
      trades: trades.length,
      closed: closed.length,
      open: trades.filter((t) => t.status === "OPEN").length,
      wins: wins.length,
      winRate: closed.length > 0 ? ((wins.length / closed.length) * 100).toFixed(0) : "--",
      totalSignals,
      tradedSignals,
      rejectedSignals,
      conversionRate: totalSignals > 0 ? ((tradedSignals / totalSignals) * 100).toFixed(1) : "--",
    };
  }, [canonicalTrades, signals]);

  const isLoading = loading || tradesLoading;

  return (
    <div className="space-y-4">
      {/* Header */}
      <GlassCard className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-500">Replay</div>
            <div className="text-lg font-semibold text-white">Trade Pipeline Replay</div>
            <div className="mt-1 text-[11px] text-neutral-400">
              Cliquez sur un trade pour derouler la timeline, puis sur chaque etape pour les details
            </div>
          </div>
          <div className="text-[11px] text-neutral-400 font-mono">Run: {shortId(runId) || "n/a"}</div>
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <GlassKPI label="Trades" value={stats.trades} size="sm" />
          <GlassKPI label="Win Rate" value={`${stats.winRate}%`} size="sm" variant={Number(stats.winRate) > 50 ? "success" : "warning"} />
          <GlassKPI label="Open" value={stats.open} size="sm" variant={stats.open > 0 ? "warning" : "default"} />
          <GlassKPI label="Signals" value={stats.totalSignals} size="sm" />
          <GlassKPI label="Conversion" value={`${stats.conversionRate}%`} size="sm" />
          <GlassKPI label="Rejected" value={stats.rejectedSignals} size="sm" variant="default" />
        </div>
      </GlassCard>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-white/[0.05] border border-white/[0.08] p-0.5">
          <button onClick={() => setView("TRADES")} className={cn("rounded-md px-3 py-1.5 text-[11px] font-semibold transition", view === "TRADES" ? "bg-white/[0.12] text-white" : "text-neutral-400 hover:text-white")}>Trades ({stats.trades})</button>
          <button onClick={() => setView("ALL_SIGNALS")} className={cn("rounded-md px-3 py-1.5 text-[11px] font-semibold transition", view === "ALL_SIGNALS" ? "bg-white/[0.12] text-white" : "text-neutral-400 hover:text-white")}>Tous Signaux ({stats.totalSignals})</button>
        </div>
        {view === "TRADES" && (
          <div className="flex gap-1">
            {(["ALL", "PROFIT", "LOSS", "OPEN"] as TradeFilter[]).map((k) => (
              <button key={k} onClick={() => setTradeFilter(k)} className={cn("rounded-lg border px-2.5 py-1 text-[10px] font-semibold transition", tradeFilter === k ? "border-[#00FF88]/40 bg-[#00FF88]/10 text-[#00FF88]/80" : "border-white/10 bg-white/5 text-neutral-400 hover:text-white")}>{k}</button>
            ))}
          </div>
        )}
        {view === "ALL_SIGNALS" && (
          <div className="flex gap-1">
            {(["ALL", "TRADED", "ACCEPTED", "REJECTED"] as SignalFilter[]).map((k) => (
              <button key={k} onClick={() => setSignalFilter(k)} className={cn("rounded-lg border px-2.5 py-1 text-[10px] font-semibold transition", signalFilter === k ? "border-[#00FF88]/40 bg-[#00FF88]/10 text-[#00FF88]/80" : "border-white/10 bg-white/5 text-neutral-400 hover:text-white")}>{k}</button>
            ))}
          </div>
        )}
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="search: id / reason / side" className="ml-auto w-[240px] rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-[11px] text-white placeholder:text-neutral-500" />
      </div>

      {error && (<div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">{error}</div>)}
      {isLoading && (<div className="text-[12px] text-neutral-400 py-2">Chargement des donnees...</div>)}

      {/* TRADES VIEW */}
      {view === "TRADES" && !isLoading && (
        <div className="space-y-2">
          {filteredTrades.slice(0, visibleTradesCount).map((trade) => {
            const sig = (trade.signal_id && signalBySignalId.get(trade.signal_id)) || signalByTradeId.get(trade.trade_id) || null;
            return (
              <TradeReplayCard
                key={trade.trade_id}
                trade={trade}
                signal={sig}
                isExpanded={!!expanded[trade.trade_id]}
                onToggle={() => toggleExpand(trade.trade_id)}
                runId={runId || ""}
                strategyId={strategyId}
              />
            );
          })}
          {filteredTrades.length > visibleTradesCount && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-neutral-200 hover:bg-white/10"
                onClick={() => setVisibleTradesCount((count) => Math.min(count + 30, filteredTrades.length))}
              >
                Afficher 30 trades de plus
              </button>
            </div>
          )}
          {filteredTrades.length === 0 && (<div className="text-center text-neutral-500 py-8 text-[12px]">Aucun trade pour ce filtre.</div>)}
        </div>
      )}

      {/* ALL SIGNALS VIEW */}
      {view === "ALL_SIGNALS" && !isLoading && (
        <div className="space-y-1.5">
          {filteredSignals.slice(0, visibleSignalsCount).map((sig) => {
            const sid = sig.signal_id || sig.timestamp;
            return (
              <SignalReplayCard
                key={sid}
                signal={sig}
                isExpanded={!!expanded[sid]}
                onToggle={() => toggleExpand(sid)}
                runId={runId || ""}
                strategyId={strategyId}
              />
            );
          })}
          {filteredSignals.length > visibleSignalsCount && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-neutral-200 hover:bg-white/10"
                onClick={() => setVisibleSignalsCount((count) => Math.min(count + 40, filteredSignals.length))}
              >
                Afficher 40 signaux de plus
              </button>
            </div>
          )}
          {filteredSignals.length === 0 && (<div className="text-center text-neutral-500 py-8 text-[12px]">Aucun signal pour ce filtre.</div>)}
        </div>
      )}
    </div>
  );
}
