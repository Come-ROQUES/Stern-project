import React, { useMemo } from "react";
import { PlotlyChart } from "./graphs/PlotlyChart";
import { Signal } from "../lib/api";
import { CanonicalTrade } from "../lib/canonicalApi";
import { safeTimestampMs } from "../lib/dateUtils";
import { getExtremeState, getSignalModeLabel, isExtremeSignal } from "../lib/signalMode";

type Point = [number, number];

type Props = {
  priceSeries: Point[];
  atrBands: { upper: Point[]; lower: Point[] };
  regimeZones: any[];
  sessionZones: any[];
  signals: Signal[];
  canonicalTrades: CanonicalTrade[];
  showShocks: boolean;
  showPass: boolean;
  showFail: boolean;
  showRegime: boolean;
  showCanonicalTrades: boolean;
  timeframeSeconds: number;
};

const priceColor = "#cbd5e1";
const shockColor = "#7dd3fc";
const failColor = "rgba(248,113,113,0.8)";
const passBuyColor = "rgba(52,211,153,0.9)";
const passSellColor = "rgba(59,130,246,0.9)";
const tradeOpenColor = "#fbbf24";
const tradeWinColor = "#22c55e";
const tradeLossColor = "#ef4444";

const toUtcPlotMs = (input: unknown): number | null => {
  const ts = safeTimestampMs(input);
  if (ts == null) return null;
  const offsetMs = new Date(ts).getTimezoneOffset() * 60_000;
  return ts + offsetMs;
};

const resolveNetPnlUsd = (trade: CanonicalTrade): number | null => {
  if (trade.pnl_net_usd_used != null) return trade.pnl_net_usd_used;
  if (trade.pnl_net_usd != null) return trade.pnl_net_usd;
  if (trade.pnl_net_eur_used != null && trade.fx_rate_used != null) {
    return trade.pnl_net_eur_used * trade.fx_rate_used;
  }
  const pips = trade.net_pips_used ?? trade.pnl_net_pips ?? trade.pnl_pips ?? null;
  if (pips == null) return null;
  const qty = trade.qty ?? 0;
  return pips * qty * 0.0001;
};

export function ProTerminalMarketStateChart({
  priceSeries,
  atrBands,
  regimeZones,
  sessionZones,
  signals,
  canonicalTrades,
  showShocks,
  showPass,
  showFail,
  showRegime,
  showCanonicalTrades,
  timeframeSeconds,
}: Props) {
  const yRange = useMemo(() => {
    if (!priceSeries.length) return null;
    const prices = priceSeries.map((p) => p[1]);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const pad = (max - min || 0.0001) * 0.08;
    return [min - pad, max + pad];
  }, [priceSeries]);

  const shapes = useMemo(() => {
    const res: any[] = [];
    if (showRegime) {
      regimeZones.forEach((z) => {
        const x0 = toUtcPlotMs(z.x);
        const x1 = toUtcPlotMs(z.x2);
        if (x0 == null || x1 == null) return; // skip invalid zones
        res.push({
          type: "rect",
          xref: "x",
          yref: "paper",
          x0,
          x1,
          y0: 0,
          y1: 1,
          fillcolor: z.fillColor || "rgba(255,255,255,0.04)",
          opacity: 0.16,
          line: { width: 0 },
        });
      });
    }
    sessionZones.forEach((z: any) => {
      const x0 = toUtcPlotMs(z.x);
      const x1 = toUtcPlotMs(z.x2);
      if (x0 == null || x1 == null) return; // skip invalid zones
      res.push({
        type: "rect",
        xref: "x",
        yref: "paper",
        x0,
        x1,
        y0: 0,
        y1: 1,
        fillcolor: z.fillColor || "rgba(255,255,255,0.02)",
        opacity: 0.08,
        line: { width: 0 },
      });
    });
    return res;
  }, [regimeZones, sessionZones, showRegime]);

  const { shockTrace, failTrace, passTrace } = useMemo(() => {
    const validSignals = signals
      .map((s) => ({ signal: s, x: toUtcPlotMs(s.timestamp) }))
      .filter((row): row is { signal: Signal; x: number } => row.x != null);
    const shocks = validSignals.filter((s) => Math.abs(s.signal.z_score ?? 0) >= 2);
    const fails = validSignals.filter((s) => !s.signal.accepted);
    const passes = validSignals.filter((s) => s.signal.accepted);
    return {
      shockTrace: {
        name: "Shocks",
        type: "scattergl",
        mode: "markers",
        x: shocks.map((s) => s.x),
        y: shocks.map((s) => (s.signal as any).price_close ?? (s.signal as any).price ?? null),
        marker: { size: 5, color: shockColor, symbol: "circle" },
        hovertemplate:
          "DW Shock<br>%{x|%H:%M:%S}<br>mode=%{customdata[0]}<br>z=%{customdata[1]:.2f}<br>Δ=%{customdata[2]:.3f} pips<br>dir=%{customdata[3]}<br>spread=%{customdata[4]:.3f} pips<extra></extra>",
        customdata: shocks.map((s) => [
          getSignalModeLabel(s.signal),
          s.signal.z_score ?? 0,
          s.signal.delta_pips ?? 0,
          s.signal.direction || s.signal.side || "-",
          s.signal.spread_pips ?? 0,
        ]),
      },
      failTrace: {
        name: "Fails",
        type: "scattergl",
        mode: "markers",
        x: fails.map((s) => s.x),
        y: fails.map((s) => (s.signal as any).price_close ?? (s.signal as any).price ?? null),
        marker: {
          size: fails.map((s) => (isExtremeSignal(s.signal) ? 11 : 9)),
          color: fails.map((s) =>
            isExtremeSignal(s.signal) ? "rgba(251,191,36,0.95)" : failColor
          ),
          symbol: fails.map((s) =>
            isExtremeSignal(s.signal) ? "diamond-open" : "x-thin"
          ),
          line: { color: "#0b1220", width: 1 },
        },
        hovertemplate:
          "DW FAIL<br>%{x|%H:%M:%S}<br>mode=%{customdata[0]}<br>state=%{customdata[1]}<br>reason=%{customdata[2]}<br>z=%{customdata[3]:.2f}<br>Δ=%{customdata[4]:.3f} pips<br>spread=%{customdata[5]:.3f} pips<extra></extra>",
        customdata: fails.map((s) => [
          getSignalModeLabel(s.signal),
          getExtremeState(s.signal) || "—",
          s.signal.rejection_reason || "unknown",
          s.signal.z_score ?? 0,
          s.signal.delta_pips ?? 0,
          s.signal.spread_pips ?? 0,
        ]),
      },
      passTrace: {
        name: "Pass",
        type: "scattergl",
        mode: "markers",
        x: passes.map((s) => s.x),
        y: passes.map((s) => (s.signal as any).price_close ?? (s.signal as any).price ?? null),
        marker: {
          size: passes.map((s) => Math.max(10, Math.min(18, Math.abs(s.signal.z_score ?? 1) * 4))),
          color: passes.map((s) => {
            if (isExtremeSignal(s.signal)) return "#fbbf24";
            return (s.signal.direction || s.signal.side || "BUY").toUpperCase() === "BUY"
              ? passBuyColor
              : passSellColor;
          }),
          symbol: passes.map((s) => (s.signal.direction || s.signal.side || "BUY").toUpperCase() === "BUY" ? "triangle-up" : "triangle-down"),
          line: { color: "#0b1220", width: 1 },
        },
        hovertemplate:
          "DW PASS (%{customdata[0]})<br>%{x|%H:%M:%S}<br>mode=%{customdata[1]}<br>state=%{customdata[2]}<br>z=%{customdata[3]:.2f}<br>Δ=%{customdata[4]:.3f} pips<br>regime=%{customdata[5]}<br>spread=%{customdata[6]:.3f} pips<br>traded=%{customdata[7]}<extra></extra>",
        customdata: passes.map((s) => [
          (s.signal.direction || s.signal.side || "BUY").toUpperCase(),
          getSignalModeLabel(s.signal),
          getExtremeState(s.signal) || "—",
          s.signal.z_score ?? 0,
          s.signal.delta_pips ?? 0,
          s.signal.volatility_regime || "UNKNOWN",
          s.signal.spread_pips ?? 0,
          String((s.signal as any).was_traded ?? false),
        ]),
      },
    };
  }, [signals]);

  const tradeTrace = useMemo(() => {
    if (!showCanonicalTrades || !canonicalTrades.length) return null;
    const openColor = tradeOpenColor;
    const validTrades = canonicalTrades
      .map((t) => ({ trade: t, x: toUtcPlotMs(t.entry_time) }))
      .filter((row): row is { trade: CanonicalTrade; x: number } => row.x != null);
    if (!validTrades.length) return null;
    const entryMarkers = validTrades.map((t) => ({
      x: t.x,
      y: t.trade.entry_price ?? null,
      color: t.trade.exit_time ? (resolveNetPnlUsd(t.trade) ?? 0) >= 0 ? tradeWinColor : tradeLossColor : openColor,
      side: t.trade.side,
      pnl: resolveNetPnlUsd(t.trade),
      exit: t.trade.exit_price,
      exitTime: t.trade.exit_time,
      signalId: t.trade.signal_id,
    }));
    return {
      name: "Trades",
      type: "scattergl",
      mode: "markers",
      x: entryMarkers.map((m) => m.x),
      y: entryMarkers.map((m) => m.y),
      marker: { size: 14, symbol: "diamond", color: entryMarkers.map((m) => m.color), line: { color: "#0b1220", width: 2 } },
      hovertemplate:
        "DW TRADE %{customdata[0]}<br>entry=%{y:.5f}<br>exit=%{customdata[1]:.5f}<br>pnl_usd=%{customdata[2]:.2f}<br>exit_time=%{customdata[3]}<br>signal_id=%{customdata[4]}<extra></extra>",
      customdata: entryMarkers.map((m) => [m.side, m.exit ?? null, m.pnl ?? 0, m.exitTime ?? "open", m.signalId ?? "n/a"]),
    };
  }, [canonicalTrades, showCanonicalTrades]);

  const xRange = useMemo(() => {
    if (!priceSeries.length) return undefined;
    const times = priceSeries
      .map((p) => {
        const ts = toUtcPlotMs(p[0]);
        return Number.isFinite(ts) ? ts : null;
      })
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b);
    if (!times.length) return undefined;
    if (times.length === 1) {
      const pad = Math.max(timeframeSeconds * 1000 * 5, 30_000);
      return [times[0] - pad, times[0] + pad];
    }
    const diffs = times.slice(1).map((t, i) => t - times[i]);
    const sortedDiffs = [...diffs].sort((a, b) => a - b);
    const medianDelta = sortedDiffs[Math.floor(sortedDiffs.length / 2)] || 0;
    const baseStep = Math.max(medianDelta, timeframeSeconds * 1000);
    const gapLimit = Math.max(baseStep * 6, timeframeSeconds * 1000 * 6, 60_000);
    let end = times[times.length - 1];
    let start = end;
    for (let i = times.length - 2; i >= 0; i -= 1) {
      if (times[i + 1] - times[i] > gapLimit) break;
      start = times[i];
    }
    const pad = Math.max(baseStep * 3, timeframeSeconds * 1000 * 2, 10_000);
    return [start - pad, end + pad];
  }, [priceSeries, timeframeSeconds]);

  const layout = useMemo(() => {
    const shapesWithY = shapes.map((s) => ({ ...s, y0: s.yref === "paper" ? 0 : yRange?.[0], y1: s.yref === "paper" ? 1 : yRange?.[1] }));
    const tickFormat = timeframeSeconds <= 60 ? "%H:%M:%S" : "%H:%M";
    const tickInterval =
      timeframeSeconds <= 30
        ? Math.max(5_000, timeframeSeconds * 1000 * 6)
        : undefined;
    return {
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      height: 360,
      margin: { l: 64, r: 24, t: 16, b: 36 },
      hoverlabel: {
        bgcolor: "rgba(8,14,24,0.95)",
        bordercolor: "rgba(148,163,184,0.25)",
        font: { color: "#e2e8f0", size: 11 },
      },
      xaxis: {
        type: "date",
        showgrid: true,
        gridcolor: "rgba(148,163,184,0.08)",
        tickformat: tickFormat,
        tickformatstops: [
          { dtickrange: [null, 60_000], value: "%H:%M:%S" },
          { dtickrange: [60_000, 3_600_000], value: "%H:%M" },
          { dtickrange: [3_600_000, null], value: "%H:%M" },
        ],
        dtick: tickInterval,
        tickfont: { size: 11, color: "#9fb1c7" },
        ticks: "outside",
        ticklen: 4,
        linecolor: "rgba(148,163,184,0.25)",
        showline: true,
        range: xRange,
        showspikes: true,
        spikemode: "across",
        spikesnap: "cursor",
        spikecolor: "rgba(148,163,184,0.25)",
        spikethickness: 1,
        spikedash: "dot",
      },
      yaxis: {
        showgrid: true,
        gridcolor: "rgba(148,163,184,0.12)",
        tickformat: ".5f",
        tickfont: { size: 11, color: "#cbd5e1" },
        ticks: "outside",
        ticklen: 4,
        linecolor: "rgba(148,163,184,0.25)",
        showline: true,
        showspikes: true,
        spikemode: "across",
        spikesnap: "cursor",
        spikecolor: "rgba(148,163,184,0.25)",
        spikethickness: 1,
        spikedash: "dot",
        range: yRange ?? undefined,
      },
      shapes: shapesWithY,
      showlegend: false,
      hovermode: "x unified",
    };
  }, [shapes, yRange, xRange, timeframeSeconds]);

  if (priceSeries.length === 0) {
    return <div className="flex h-[320px] items-center justify-center text-sm text-slate-400">En attente de prix.</div>;
  }

  const validPriceSeries = priceSeries
    .map((p) => {
      const x = toUtcPlotMs(p[0]);
      return x == null ? null : ([x, p[1]] as Point);
    })
    .filter((p): p is Point => p != null);
  const validAtrUpper = atrBands.upper
    .map((p) => {
      const x = toUtcPlotMs(p[0]);
      return x == null ? null : ([x, p[1]] as Point);
    })
    .filter((p): p is Point => p != null);
  const validAtrLower = atrBands.lower
    .map((p) => {
      const x = toUtcPlotMs(p[0]);
      return x == null ? null : ([x, p[1]] as Point);
    })
    .filter((p): p is Point => p != null);

  // Debug: Log data availability (always log if filtered to empty)
  if (validPriceSeries.length === 0) {
    console.warn("[ProTerminalMarketStateChart] priceSeries:", priceSeries.length, "valid:", validPriceSeries.length,
      "sample:", priceSeries.slice(0, 2).map((p) => ({ ts: p[0], utc_plot_ts: toUtcPlotMs(p[0]), price: p[1] })));
  }

  // If all price points were filtered out, show message
  if (validPriceSeries.length === 0) {
    return <div className="flex h-[320px] items-center justify-center text-sm text-slate-400">Données prix invalides ({priceSeries.length} points filtrés).</div>;
  }

  const priceTrace = {
    name: "Close",
    type: "scattergl",
    mode: "lines",
    x: validPriceSeries.map((p) => p[0]),
    y: validPriceSeries.map((p) => p[1]),
    line: { color: priceColor, width: 2.2 },
    hovertemplate: "Price %{y:.5f}<extra></extra>",
  };

  const atrUpper = {
    name: "ATR upper",
    type: "scattergl",
    mode: "lines",
    x: validAtrUpper.map((p) => p[0]),
    y: validAtrUpper.map((p) => p[1]),
    line: { color: "rgba(148,163,184,0.45)", width: 1, dash: "dot" },
    hoverinfo: "skip",
  };
  const atrLower = {
    name: "ATR lower",
    type: "scattergl",
    mode: "lines",
    x: validAtrLower.map((p) => p[0]),
    y: validAtrLower.map((p) => p[1]),
    line: { color: "rgba(148,163,184,0.45)", width: 1, dash: "dot" },
    hoverinfo: "skip",
  };

  const traces = ([priceTrace, atrUpper, atrLower] as any[])
    .concat(showShocks ? [shockTrace] : [])
    .concat(showFail ? [failTrace] : [])
    .concat(showPass ? [passTrace] : [])
    .concat(tradeTrace ? [tradeTrace] : []);

  return <PlotlyChart data={traces} layout={layout} />;
}
