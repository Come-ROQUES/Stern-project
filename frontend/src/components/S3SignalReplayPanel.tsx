import { useEffect, useMemo, useRef, useState } from "react";
import {
    createChart,
    CrosshairMode,
    LineStyle,
    type IChartApi,
    type ISeriesApi,
    type Time,
} from "lightweight-charts";
import { api, type Ohlc } from "../lib/api";
import { activeContext, defaultScope } from "../lib/activeContext";
import { type CanonicalTrade, type Signal } from "../lib/canonicalApi";
import { useLightweightChartAutosize } from "../lib/charts/useLightweightChartAutosize";
import { GlassBadge } from "./ui/glass";
import { isAbortLikeChartError } from "./price-trades/chartShared";

const REPLAY_WINDOW_PADDING_MINUTES = 45;

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

function qualityFromSignal(signal: Signal): string {
    if (!signal.config_snapshot) return "UNK";
    try {
        const meta = JSON.parse(signal.config_snapshot) as {
            regime_quality?: string;
            regime_state?: string;
        };
        if (meta.regime_quality) return String(meta.regime_quality).toUpperCase();
        if (meta.regime_state && String(meta.regime_state).toUpperCase() === "CHOP") {
            return "CHOP";
        }
        return "UNK";
    } catch {
        return "UNK";
    }
}

function markerColor(signal: Signal): string {
    if (!signal.accepted) return "#6b7280";
    const q = qualityFromSignal(signal);
    if (q === "A+") return "#22c55e";
    if (q === "A") return "#06b6d4";
    if (q === "B") return "#f59e0b";
    return "#9ca3af";
}

function markerText(signal: Signal): string {
    if (!signal.accepted) {
        const reason = signal.rejection_reason || signal.reason || "REJECTED";
        return `REJ ${reason}`;
    }
    return `ACC ${qualityFromSignal(signal)}`;
}

function fmtTime(ts?: string | null): string {
    if (!ts) return "--";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return d.toISOString().slice(11, 19);
}

export function computeReplayWindow(
    centerTs?: string | null,
    paddingMinutes: number = REPLAY_WINDOW_PADDING_MINUTES
): { fromTs: string; toTs: string; key: string } | null {
    if (!centerTs) return null;
    const centerMs = new Date(centerTs).getTime();
    if (!Number.isFinite(centerMs)) return null;
    const paddingMs = Math.max(5, paddingMinutes) * 60_000;
    const fromTs = new Date(centerMs - paddingMs).toISOString();
    const toTs = new Date(centerMs + paddingMs).toISOString();
    return {
        fromTs,
        toTs,
        key: `${fromTs}:${toTs}`,
    };
}

interface Props {
    runId: string;
    strategyId: string;
    signals: Signal[];
    trades: CanonicalTrade[];
}

export function S3SignalReplayPanel({
    runId,
    strategyId,
    signals,
    trades,
}: Props) {
    const chartRef = useRef<IChartApi | null>(null);
    const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const priceLinesRef = useRef<any[]>([]);
    const ohlcWindowCacheRef = useRef<Map<string, Ohlc[]>>(new Map());
    const containerRef = useRef<HTMLDivElement>(null);
    const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { waitingForSize } = useLightweightChartAutosize({
        containerRef,
        fallbackHeight: 280,
        debugName: "S3SignalReplayPanel",
    });

    const timeline = useMemo(() => {
        return [...signals]
            .filter((s) => !!s.signal_id)
            .sort(
                (a, b) =>
                    new Date(a.timestamp).getTime() -
                    new Date(b.timestamp).getTime()
            );
    }, [signals]);

    useEffect(() => {
        if (!selectedSignalId && timeline.length > 0) {
            setSelectedSignalId(timeline[timeline.length - 1].signal_id);
        }
    }, [timeline, selectedSignalId]);

    const selectedSignal = useMemo(() => {
        if (!selectedSignalId) return null;
        return timeline.find((s) => s.signal_id === selectedSignalId) ?? null;
    }, [timeline, selectedSignalId]);

    const selectedTrade = useMemo(() => {
        if (!selectedSignal?.trade_id) return null;
        return (
            trades.find((t) => t.trade_id === selectedSignal.trade_id) ?? null
        );
    }, [selectedSignal, trades]);

    const replayWindow = useMemo(() => {
        const selectedTs =
            selectedSignal?.timestamp ?? timeline[timeline.length - 1]?.timestamp ?? null;
        return computeReplayWindow(selectedTs);
    }, [selectedSignal?.timestamp, timeline]);

    useEffect(() => {
        ohlcWindowCacheRef.current.clear();
    }, [runId, strategyId]);

    // ── Effect 1: Chart creation + OHLC fetch (window centered on selected signal) ──
    useEffect(() => {
        if (!containerRef.current || !runId || timeline.length < 1 || !replayWindow) return;
        let cancelled = false;
        const ohlcController = new AbortController();

        async function initChart() {
            setLoading(true);
            setError(null);
            try {
                const ctx = {
                    ...activeContext,
                    run_id: runId,
                    strategy_id: strategyId,
                };
                const cacheKey = replayWindow.key;
                let bars: Ohlc[] | null = ohlcWindowCacheRef.current.get(cacheKey) ?? null;
                if (!bars) {
                    const ohlcPayload = await api.getOhlcForRun(
                        1200,
                        runId,
                        ctx,
                        defaultScope,
                        {
                            fromTs: replayWindow.fromTs,
                            toTs: replayWindow.toTs,
                            order: "asc",
                            signal: ohlcController.signal,
                        }
                    );
                    bars = (ohlcPayload.ohlc || []).filter(isValidOhlcBar);
                    ohlcWindowCacheRef.current.set(cacheKey, bars);
                }
                if (cancelled) return;
                if (bars.length < 2) {
                    setError("Pas assez de barres OHLC pour rejouer la journee S3.");
                    setLoading(false);
                    return;
                }

                if (chartRef.current) {
                    chartRef.current.remove();
                    chartRef.current = null;
                    candleSeriesRef.current = null;
                    priceLinesRef.current = [];
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
                        vertLine: {
                            color: "rgba(255,255,255,0.1)",
                            labelVisible: false,
                        },
                        horzLine: { color: "rgba(255,255,255,0.1)" },
                    },
                    timeScale: {
                        borderColor: "rgba(255,255,255,0.06)",
                        timeVisible: true,
                        secondsVisible: false,
                    },
                    rightPriceScale: {
                        borderColor: "rgba(255,255,255,0.06)",
                    },
                    grid: {
                        vertLines: { color: "rgba(255,255,255,0.03)" },
                        horzLines: { color: "rgba(255,255,255,0.03)" },
                    },
                });
                chartRef.current = chart;

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
                    setError("OHLC invalide: timestamps non exploitables.");
                    setLoading(false);
                    return;
                }
                candleSeries.setData(candleData);
                candleSeriesRef.current = candleSeries;

                chart.timeScale().fitContent();
                setLoading(false);
            } catch (e) {
                if (cancelled || isAbortLikeChartError(e)) {
                    setLoading(false);
                    return;
                }
                if (!cancelled) {
                    setError(
                        e instanceof Error
                            ? e.message
                            : "Erreur replay OHLC"
                    );
                    setLoading(false);
                }
            }
        }

        initChart();

        return () => {
            cancelled = true;
            ohlcController.abort();
            candleSeriesRef.current = null;
            priceLinesRef.current = [];
            if (chartRef.current) {
                chartRef.current.remove();
                chartRef.current = null;
            }
        };
    }, [replayWindow, runId, strategyId, timeline.length]);

    // ── Effect 2: Markers + price lines (updates on signal/trade selection) ──
    useEffect(() => {
        const series = candleSeriesRef.current;
        if (!series || !chartRef.current) return;

        // Clean old price lines
        priceLinesRef.current.forEach((line) => {
            try { series.removePriceLine(line); } catch { /* already removed */ }
        });
        priceLinesRef.current = [];

        // Build markers
        const markers: Array<Record<string, unknown>> = [];
        timeline.forEach((sig) => {
                const time = toChartTime(sig.timestamp);
                if (time == null) return;
                const isBuy =
                    (sig.direction || "").toUpperCase() === "BUY";
                markers.push({
                    time,
                    position: isBuy ? "belowBar" : "aboveBar",
                    color: markerColor(sig),
                    shape: isBuy ? "arrowUp" : "arrowDown",
                    text: markerText(sig),
                    size:
                        sig.signal_id === selectedSignal?.signal_id ? 2 : 1,
                });
            });

        if (
            selectedTrade &&
            selectedTrade?.entry_time &&
            isFiniteNumber(selectedTrade.entry_price)
        ) {
            const entryTime = toChartTime(selectedTrade.entry_time);
            if (entryTime != null) {
            markers.push({
                time: entryTime,
                position:
                    selectedTrade.side === "BUY"
                        ? "belowBar"
                        : "aboveBar",
                color: "#f59e0b",
                shape: "circle",
                text: `ENTRY ${selectedTrade.entry_price.toFixed(5)}`,
                size: 2,
            });
            }
        }

        if (
            selectedTrade &&
            selectedTrade?.exit_time &&
            isFiniteNumber(selectedTrade.exit_price)
        ) {
            const exitTime = toChartTime(selectedTrade.exit_time);
            if (exitTime != null) {
            markers.push({
                time: exitTime,
                position:
                    selectedTrade.side === "BUY"
                        ? "aboveBar"
                        : "belowBar",
                color:
                    selectedTrade.exit_reason === "TP"
                        ? "#22c55e"
                        : selectedTrade.exit_reason === "SL"
                        ? "#ef4444"
                        : "#a3a3a3",
                shape: "circle",
                text: `${selectedTrade.exit_reason || "EXIT"} ${selectedTrade.exit_price.toFixed(5)}`,
                size: 2,
            });
            }
        }

        markers.sort(
            (a, b) => Number(a.time ?? 0) - Number(b.time ?? 0)
        );
        series.setMarkers(markers as any);

        // Price lines
        if (selectedTrade && isFiniteNumber(selectedTrade.entry_price)) {
            priceLinesRef.current.push(series.createPriceLine({
                price: selectedTrade.entry_price,
                color: "rgba(245,158,11,0.55)",
                lineWidth: 1,
                lineStyle: LineStyle.Dashed,
                axisLabelVisible: true,
                title: "Entry",
            }));
        }
        if (selectedTrade && isFiniteNumber(selectedTrade.tp_price)) {
            priceLinesRef.current.push(series.createPriceLine({
                price: selectedTrade.tp_price,
                color: "rgba(34,197,94,0.5)",
                lineWidth: 1,
                lineStyle: LineStyle.Dotted,
                axisLabelVisible: true,
                title: "TP",
            }));
        }
        if (selectedTrade && isFiniteNumber(selectedTrade.sl_price)) {
            priceLinesRef.current.push(series.createPriceLine({
                price: selectedTrade.sl_price,
                color: "rgba(239,68,68,0.5)",
                lineWidth: 1,
                lineStyle: LineStyle.Dotted,
                axisLabelVisible: true,
                title: "SL",
            }));
        }

        // Center viewport on selected signal
        if (selectedSignal?.timestamp && chartRef.current) {
            const center = toChartTime(selectedSignal.timestamp);
            if (center != null) {
                const centerSec = Number(center);
                chartRef.current.timeScale().setVisibleRange({
                    from: (centerSec - 15 * 60) as Time,
                    to: (centerSec + 15 * 60) as Time,
                });
            }
        }

        return () => {
            priceLinesRef.current.forEach((line) => {
                try { candleSeriesRef.current?.removePriceLine(line); } catch { /* ignore */ }
            });
            priceLinesRef.current = [];
        };
    }, [selectedSignal, selectedTrade, timeline]);

    const stats = useMemo(() => {
        const total = timeline.length;
        const accepted = timeline.filter((s) => s.accepted).length;
        const traded = timeline.filter((s) => !!s.trade_id || s.was_traded).length;
        return { total, accepted, traded };
    }, [timeline]);

    return (
        <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-4">
            <div className="rounded-xl border border-white/[0.08] bg-black/20 p-3">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                            Timeline S3
                        </div>
                        <div className="text-[12px] text-neutral-300">
                            Decisions intraday
                        </div>
                    </div>
                    <div className="text-[10px] text-neutral-500 font-mono">
                        {stats.total} sig
                    </div>
                </div>

                <div className="flex items-center gap-2 mb-3 text-[10px]">
                    <GlassBadge variant="success" size="sm">
                        {stats.accepted} accepted
                    </GlassBadge>
                    <GlassBadge variant="info" size="sm">
                        {stats.traded} traded
                    </GlassBadge>
                    <GlassBadge variant="muted" size="sm">
                        {stats.total - stats.accepted} rejected
                    </GlassBadge>
                </div>

                <div className="space-y-1 max-h-[320px] overflow-auto pr-1">
                    {timeline.map((sig) => {
                        const active = sig.signal_id === selectedSignal?.signal_id;
                        const q = qualityFromSignal(sig);
                        return (
                            <button
                                key={sig.signal_id}
                                type="button"
                                onClick={() => setSelectedSignalId(sig.signal_id)}
                                className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${
                                    active
                                        ? "border-cyan-400/45 bg-cyan-500/10"
                                        : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]"
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] font-mono text-neutral-300">
                                        {fmtTime(sig.timestamp)} UTC
                                    </span>
                                    <span
                                        className={`text-[10px] font-semibold ${
                                            sig.accepted
                                                ? "text-emerald-400"
                                                : "text-rose-400"
                                        }`}
                                    >
                                        {sig.accepted ? "ACC" : "REJ"}
                                    </span>
                                </div>
                                <div className="mt-1 flex items-center justify-between text-[10px]">
                                    <span className="text-neutral-300">
                                        {sig.direction} · {sig.signal_type || "S3"}
                                    </span>
                                    <span className="text-neutral-500 font-mono">
                                        {q}
                                    </span>
                                </div>
                                <div className="mt-1 text-[10px] text-neutral-500 truncate">
                                    {sig.rejection_reason || sig.reason || sig.decision_stage || "entry"}
                                </div>
                            </button>
                        );
                    })}
                    {timeline.length === 0 && (
                        <div className="text-[11px] text-neutral-500 py-8 text-center">
                            Aucun signal S3 pour ce run.
                        </div>
                    )}
                </div>
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-black/20">
                <div className="px-3 py-2 border-b border-white/[0.04] flex items-center justify-between">
                    <div>
                        <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                            Price Overlay
                        </div>
                        <div className="text-[11px] text-neutral-400">
                            Signaux + entry/exit trade selectionne
                        </div>
                    </div>
                    <div className="text-[10px] text-neutral-500">
                        {loading ? "Chargement..." : "OHLC + markers"}
                    </div>
                </div>
                {error && (
                    <div className="px-3 py-2 text-[11px] text-rose-300 border-b border-white/[0.04]">
                        {error}
                    </div>
                )}
                {waitingForSize && (
                    <div className="px-3 py-1 text-[10px] text-amber-200 border-b border-white/[0.04] bg-amber-500/10">
                        Chart en attente de dimensions du conteneur...
                    </div>
                )}
                <div ref={containerRef} style={{ height: 280 }} />
            </div>
        </div>
    );
}
