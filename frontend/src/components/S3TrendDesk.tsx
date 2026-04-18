import {
    Suspense,
    lazy,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    Activity,
    TrendingUp,
    TrendingDown,
    Clock,
    Info,
    Zap,
    AlertTriangle,
} from "lucide-react";
import { api, DashboardS3Snapshot, DwSummary, ExecutionMetricsResponse } from "../lib/api";
import {
    CanonicalKPIs,
    CanonicalTrade,
    Shock,
    ShockStats,
    Signal,
    SignalStats,
} from "../lib/canonicalApi";
import { activeContext } from "../lib/activeContext";
import { useBundleRuns } from "../lib/useBundleRuns";
import { useRunId, useRunMeta } from "../lib/useRunContext";
import { useViewVisibility } from "../lib/viewActivity";
import { GlassBadge, GlassKPI, MiniSparkline } from "./ui/glass";
import { BentoCard } from "./ui/BentoCard";
import { KPIRow } from "./ui/BentoLayout";
import { useDashboardPoll } from "../lib/dashboardPollingBus";

// =============================================================================
// CONSTANTS
// =============================================================================

const STRATEGY_ID = "tf_pullback_v1";
const STRATEGY_LABEL = "S3 Trend Following";
const SYMBOL = "EURUSD";
const S3_FULL_DEFER_MS = 700;
const S3SignalReplayPanel = lazy(() =>
    import("./S3SignalReplayPanel").then((module) => ({
        default: module.S3SignalReplayPanel,
    }))
);
// =============================================================================
// TF-SPECIFIC SIGNAL METADATA (from config_snapshot JSON)
// =============================================================================

interface TFSignalMeta {
    regime_quality?: string;      // A+, A, B
    regime_state?: string;        // TREND_OK, CHOP, EVENT_RISK
    regime_direction?: string;    // BUY, SELL, NONE
    er_h1?: number;               // Efficiency Ratio H1 [0,1] — min 0.35
    er_m15?: number;              // Efficiency Ratio M15 [0,1] — min 0.30
    atr_ratio?: number;           // ATR current / ATR median (480-bar) — min 1.10, A+ 1.20
    adx_m15?: number;             // ADX on M15 [0,100] — min 20, A+ 25
    pullback_depth_pct?: number;  // Pullback depth as fraction [0,1]
    entry_trigger_type?: string;  // BREAK_PULLBACK_HIGH/LOW, ENGULFING
    session_bucket?: string;      // LDN, OVL, NY, OFF
    shock_pips?: number;
    shock_ts?: string;
}

const EMPTY_META: TFSignalMeta = {};

function parseConfigSnapshot(sig: Signal): TFSignalMeta {
    if (!sig.config_snapshot) return EMPTY_META;
    try {
        return JSON.parse(sig.config_snapshot) as TFSignalMeta;
    } catch {
        return EMPTY_META;
    }
}

export function signalMetaKey(sig: Signal): string {
    return (
        sig.signal_id ??
        `${sig.timestamp}:${sig.direction}:${sig.accepted}:${sig.trade_id ?? ""}`
    );
}

export function buildSignalMetaMap(
    signals: Signal[],
    parser: (sig: Signal) => TFSignalMeta = parseConfigSnapshot
): Map<string, TFSignalMeta> {
    const map = new Map<string, TFSignalMeta>();
    for (const sig of signals) {
        const key = signalMetaKey(sig);
        if (map.has(key)) continue;
        map.set(key, parser(sig));
    }
    return map;
}

// =============================================================================
// HELPERS
// =============================================================================

function fmtEur(v: number | null | undefined, digits = 2): string {
    if (v == null || !Number.isFinite(v)) return "n/a";
    const sign = v >= 0 ? "+" : "−";
    return `${sign}€${Math.abs(v).toFixed(digits)}`;
}

function fmtPct(v: number | null | undefined, digits = 0): string {
    if (v == null || !Number.isFinite(v)) return "n/a";
    return `${(v * 100).toFixed(digits)}%`;
}

function fmtPips(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v)) return "n/a";
    return `${v.toFixed(2)}p`;
}

function fmtMs(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v)) return "n/a";
    return `${v.toFixed(0)}ms`;
}

type BadgeVariant = "default" | "success" | "danger" | "warning" | "info";

function qualityVariant(q: string | null | undefined): BadgeVariant {
    if (q === "A+") return "success";
    if (q === "A") return "info";
    if (q === "B") return "warning";
    return "default";
}

function stateVariant(state: string | null | undefined): BadgeVariant {
    if (state === "TREND_OK") return "success";
    if (state === "CHOP" || state === "EVENT_RISK") return "warning";
    return "default";
}

function sameRowsByKey<T>(
    current: T[],
    next: T[],
    getKey: (row: T) => string
): boolean {
    if (current === next) return true;
    if (current.length !== next.length) return false;
    for (let index = 0; index < current.length; index += 1) {
        if (getKey(current[index]) !== getKey(next[index])) {
            return false;
        }
    }
    return true;
}

const S3_SNAPSHOT_CRITICAL_ERRORS = new Set([
    "snapshot_unavailable",
    "summary:run_id_missing",
    "s3:run_id_missing",
]);

export function getS3SnapshotErrorMessage(
    errors: string[] | null | undefined
): string | null {
    if (!errors || errors.length === 0) return null;
    const relevant = errors.filter(
        (entry) =>
            entry.startsWith("s3:") ||
            entry.startsWith("snapshot:") ||
            S3_SNAPSHOT_CRITICAL_ERRORS.has(entry)
    );
    if (relevant.length === 0) return null;
    if (
        relevant.some((entry) =>
            entry === "summary:run_id_missing" || entry === "s3:run_id_missing"
        )
    ) {
        return "Run S3 non résolu.";
    }
    if (
        relevant.some(
            (entry) =>
                entry === "snapshot_unavailable" ||
                entry.startsWith("snapshot:")
        )
    ) {
        return "Snapshot S3 indisponible.";
    }
    const failedSources = relevant
        .filter((entry) => entry.startsWith("s3:"))
        .map((entry) => entry.split(":")[1] ?? entry)
        .filter((entry) => entry && entry !== "snapshot_internal_error");
    if (failedSources.length === 0) {
        return "Snapshot S3 indisponible.";
    }
    return `Sources indisponibles: ${failedSources.join(", ")}`;
}

export function shouldShowS3NoData(params: {
    loading: boolean;
    error: string | null;
    signalsCount: number;
    totalSignals: number | null | undefined;
}): boolean {
    if (params.loading || params.error) return false;
    const total = params.totalSignals ?? 0;
    return params.signalsCount === 0 && total === 0;
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function DirectionBadge({
    direction,
    large = false,
}: {
    direction: string | null | undefined;
    large?: boolean;
}) {
    if (!direction) return <span className="text-neutral-500">—</span>;
    const upper = direction.toUpperCase();
    const isBuy = upper === "BUY" || upper === "UP" || upper === "LONG";
    const isSell = upper === "SELL" || upper === "DOWN" || upper === "SHORT";
    return (
        <span
            className={`inline-flex items-center gap-1 font-mono font-semibold ${
                large ? "text-sm" : "text-[11px]"
            } ${
                isBuy
                    ? "text-emerald-400"
                    : isSell
                    ? "text-rose-400"
                    : "text-neutral-400"
            }`}
        >
            {isBuy ? (
                <TrendingUp className={large ? "h-4 w-4" : "h-3 w-3"} />
            ) : isSell ? (
                <TrendingDown className={large ? "h-4 w-4" : "h-3 w-3"} />
            ) : null}
            {isBuy ? "BUY" : isSell ? "SELL" : upper}
        </span>
    );
}

function GaugeBar({
    label,
    value,
    min = 0,
    max = 1,
    threshold,
    aPlusThreshold,
    unit = "",
    digits = 2,
}: {
    label: string;
    value: number | null | undefined;
    min?: number;
    max?: number;
    threshold?: number;
    aPlusThreshold?: number;
    unit?: string;
    digits?: number;
}) {
    const v = value ?? 0;
    const range = max - min;
    const pct = range > 0 ? Math.min(100, Math.max(0, ((v - min) / range) * 100)) : 0;
    const thresholdPct =
        threshold != null && range > 0
            ? Math.min(100, Math.max(0, ((threshold - min) / range) * 100))
            : null;
    const aPlusPct =
        aPlusThreshold != null && range > 0
            ? Math.min(100, Math.max(0, ((aPlusThreshold - min) / range) * 100))
            : null;
    const isAbove = threshold == null || v >= threshold;
    const isAPlus = aPlusThreshold != null && v >= aPlusThreshold;

    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.14em] text-neutral-500">
                    {label}
                </span>
                <span
                    className={`text-[11px] font-mono ${
                        isAPlus
                            ? "text-emerald-400"
                            : isAbove
                            ? "text-cyan-300"
                            : "text-rose-400"
                    }`}
                >
                    {value != null ? `${v.toFixed(digits)}${unit}` : "n/a"}
                    {isAPlus && (
                        <span className="ml-1 text-[9px] text-emerald-500/70">A+</span>
                    )}
                </span>
            </div>
            {/* Bar track */}
            <div className="relative h-1 rounded-full bg-white/[0.06]">
                <div
                    className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${
                        isAPlus
                            ? "bg-emerald-400"
                            : isAbove
                            ? "bg-cyan-400"
                            : "bg-rose-500"
                    }`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            {/* Threshold ticks (outside overflow-hidden) */}
            {(thresholdPct != null || aPlusPct != null) && (
                <div className="relative h-[5px]">
                    {thresholdPct != null && (
                        <div
                            className="absolute top-0 h-[5px] w-px bg-amber-400/50"
                            style={{ left: `${thresholdPct}%` }}
                            title={`Min: ${threshold}`}
                        />
                    )}
                    {aPlusPct != null && (
                        <div
                            className="absolute top-0 h-[5px] w-px bg-emerald-400/50"
                            style={{ left: `${aPlusPct}%` }}
                            title={`A+: ${aPlusThreshold}`}
                        />
                    )}
                </div>
            )}
        </div>
    );
}

function RowItem({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex items-center justify-between py-1 border-b border-white/[0.04] last:border-0">
            <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                {label}
            </span>
            <span className="text-[11px] text-neutral-200 font-mono">{children}</span>
        </div>
    );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

type SessionKey = "LDN" | "OVL" | "NY" | "OFF";

export function S3TrendDesk() {
    const runId = useRunId();
    const { run } = useRunMeta();
    const { enabled: bundleEnabled, tfRunId } = useBundleRuns();
    const tfRunIdEffective = bundleEnabled
        ? tfRunId
        : run?.strategy_id === STRATEGY_ID
        ? runId
        : null;

    const ctx = useMemo(
        () => ({
            ...activeContext,
            run_id: tfRunIdEffective ?? "",
            strategy_id: STRATEGY_ID,
        }),
        [tfRunIdEffective]
    );
    const isViewVisible = useViewVisibility();

    // ---------------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------------
    const [summary, setSummary] = useState<DwSummary | null>(null);
    const [kpis, setKpis] = useState<CanonicalKPIs | null>(null);
    const [signals, setSignals] = useState<Signal[]>([]);
    const [signalStats, setSignalStats] = useState<SignalStats | null>(null);
    const [shocks, setShocks] = useState<Shock[]>([]);
    const [shockStats, setShockStats] = useState<ShockStats | null>(null);
    const [trades, setTrades] = useState<CanonicalTrade[]>([]);
    const [executionMetrics, setExecutionMetrics] =
        useState<ExecutionMetricsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [coreReady, setCoreReady] = useState(false);
    const [replayEnabled, setReplayEnabled] = useState(false);
    const hydratedRef = useRef(false);
    const fullHydratedRef = useRef(false);
    const coreAbortRef = useRef<AbortController | null>(null);
    const fullAbortRef = useRef<AbortController | null>(null);

    const sharedRun = (summary as unknown as Record<string, unknown>)?._meta
        ? (
              (summary as unknown as Record<string, unknown>)
                  ._meta as Record<string, unknown>
          )?.shared_run === true
        : false;

    // ---------------------------------------------------------------------------
    // Data fetching: core first, then deferred/full.
    // ---------------------------------------------------------------------------
    useEffect(() => {
        hydratedRef.current = false;
        fullHydratedRef.current = false;
        coreAbortRef.current?.abort();
        fullAbortRef.current?.abort();
        setCoreReady(false);
        setReplayEnabled(false);
        setSignals([]);
        setShocks([]);
        setTrades([]);
        setExecutionMetrics(null);
    }, [tfRunIdEffective]);

    useEffect(() => {
        if (isViewVisible) {
            return;
        }
        coreAbortRef.current?.abort();
        fullAbortRef.current?.abort();
    }, [isViewVisible]);

    useEffect(() => {
        return () => {
            coreAbortRef.current?.abort();
            fullAbortRef.current?.abort();
        };
    }, []);

    const fetchCore = useCallback(async () => {
        if (!tfRunIdEffective) {
            setSummary(null);
            setKpis(null);
            setSignals([]);
            setSignalStats(null);
            setShocks([]);
            setShockStats(null);
            setTrades([]);
            setExecutionMetrics(null);
            setError(null);
            setCoreReady(false);
            setLoading(false);
            return;
        }
        if (!hydratedRef.current) {
            setLoading(true);
        }
        coreAbortRef.current?.abort();
        const controller = new AbortController();
        coreAbortRef.current = controller;
        setError(null);
        try {
            const snapshot = await api.getDashboardSnapshot(
                tfRunIdEffective,
                "s3",
                ctx,
                { detailLevel: "core", signal: controller.signal }
            );
            const s3Payload: DashboardS3Snapshot | null = snapshot.s3 ?? null;
            const snapshotError = getS3SnapshotErrorMessage(
                snapshot._meta?.errors ?? []
            );

            setSummary((s3Payload?.summary as DwSummary | null) ?? null);
            setKpis(s3Payload?.kpis ?? null);
            setSignalStats(s3Payload?.signal_stats ?? null);
            setShockStats(s3Payload?.shock_stats ?? null);
            setError(snapshotError);
            setCoreReady(true);
            hydratedRef.current = true;
        } catch (fetchError) {
            if (controller.signal.aborted) {
                return;
            }
            setSummary(null);
            setKpis(null);
            setSignals([]);
            setSignalStats(null);
            setShocks([]);
            setShockStats(null);
            setTrades([]);
            setExecutionMetrics(null);
            setCoreReady(false);
            setError(
                fetchError instanceof Error
                    ? fetchError.message
                    : "Snapshot S3 indisponible"
            );
        } finally {
            if (coreAbortRef.current === controller) {
                coreAbortRef.current = null;
                setLoading(false);
            }
        }
    }, [ctx, tfRunIdEffective]);

    const fetchFull = useCallback(async () => {
        if (!tfRunIdEffective || !coreReady) {
            return;
        }
        fullAbortRef.current?.abort();
        const controller = new AbortController();
        fullAbortRef.current = controller;
        try {
            const snapshot = await api.getDashboardSnapshot(
                tfRunIdEffective,
                "s3",
                ctx,
                { detailLevel: "full", signal: controller.signal }
            );
            const s3Payload: DashboardS3Snapshot | null = snapshot.s3 ?? null;
            const snapshotError = getS3SnapshotErrorMessage(
                snapshot._meta?.errors ?? []
            );

            setSummary((s3Payload?.summary as DwSummary | null) ?? null);
            setKpis(s3Payload?.kpis ?? null);
            setSignalStats(s3Payload?.signal_stats ?? null);
            setShockStats(s3Payload?.shock_stats ?? null);

            const nextSignals = s3Payload?.signals ?? [];
            setSignals((prev) =>
                sameRowsByKey(
                    prev,
                    nextSignals,
                    (row) =>
                        `${row.signal_id}:${row.timestamp}:${row.accepted}:${row.trade_id ?? ""}`
                )
                    ? prev
                    : nextSignals
            );

            const nextShocks = s3Payload?.shocks ?? [];
            setShocks((prev) =>
                sameRowsByKey(
                    prev,
                    nextShocks,
                    (row) => `${row.shock_id}:${row.timestamp}`
                )
                    ? prev
                    : nextShocks
            );

            const nextTrades = s3Payload?.trades ?? [];
            setTrades((prev) =>
                sameRowsByKey(
                    prev,
                    nextTrades,
                    (row) =>
                        `${row.canonical_id}:${row.status}:${row.entry_time}:${row.exit_time ?? ""}`
                )
                    ? prev
                    : nextTrades
            );
            setExecutionMetrics(s3Payload?.execution ?? null);
            setError(snapshotError);
            fullHydratedRef.current = true;
        } catch (fetchError) {
            if (controller.signal.aborted) {
                return;
            }
            if (!fullHydratedRef.current) {
                setError(
                    fetchError instanceof Error
                        ? fetchError.message
                    : "Snapshot S3 indisponible"
                );
            }
        } finally {
            if (fullAbortRef.current === controller) {
                fullAbortRef.current = null;
            }
        }
    }, [coreReady, ctx, tfRunIdEffective]);

    useDashboardPoll("summary", fetchCore, {
        enabled: true,
        immediate: true,
        intervalMs: 15_000,
    });

    useEffect(() => {
        if (!tfRunIdEffective || !coreReady) return;
        const timer = window.setTimeout(() => {
            void fetchFull();
        }, S3_FULL_DEFER_MS);
        return () => window.clearTimeout(timer);
    }, [coreReady, fetchFull, tfRunIdEffective]);

    useDashboardPoll("analytics", fetchFull, {
        enabled: Boolean(tfRunIdEffective && coreReady),
        immediate: false,
        intervalMs: 45_000,
    });

    // ---------------------------------------------------------------------------
    // Derived data
    // ---------------------------------------------------------------------------
    const warmupReady = summary?.warmup_state?.toUpperCase().includes("READY");
    const warmupPct =
        summary?.warmup_bars != null &&
        summary?.warmup_target != null &&
        summary.warmup_target > 0
            ? Math.min(
                  100,
                  Math.round(
                      (summary.warmup_bars / summary.warmup_target) * 100
                  )
              )
            : null;

    const signalMetaMap = useMemo(() => buildSignalMetaMap(signals), [signals]);
    const getSignalMeta = useCallback(
        (sig: Signal): TFSignalMeta =>
            signalMetaMap.get(signalMetaKey(sig)) ?? EMPTY_META,
        [signalMetaMap]
    );

    // Most recent signal's parsed metadata (regime engine state)
    const lastSignalMeta = useMemo(
        () => (signals.length > 0 ? getSignalMeta(signals[0]) : null),
        [getSignalMeta, signals]
    );

    // Session breakdown from all signals
    const sessionStats = useMemo(() => {
        const stats: Record<SessionKey, { signals: number; accepted: number }> =
            {
                LDN: { signals: 0, accepted: 0 },
                OVL: { signals: 0, accepted: 0 },
                NY: { signals: 0, accepted: 0 },
                OFF: { signals: 0, accepted: 0 },
            };
        signals.forEach((sig) => {
            const meta = getSignalMeta(sig);
            const bucket = (
                (meta.session_bucket || sig.session || "OFF") as string
            ).toUpperCase() as SessionKey;
            if (bucket in stats) {
                stats[bucket].signals++;
                if (sig.accepted) stats[bucket].accepted++;
            }
        });
        return stats;
    }, [signals]);

    // Cumulative PnL equity curve from closed trades
    const pnlSeries = useMemo(() => {
        let cumulative = 0;
        return trades
            .filter((t) => t.exit_time && t.status !== "open")
            .sort(
                (a, b) =>
                    new Date(a.exit_time).getTime() -
                    new Date(b.exit_time).getTime()
            )
            .map((t) => {
                const pnl =
                    t.pnl_net_eur_used ?? t.pnl_net_eur ?? t.pnl ?? 0;
                cumulative += pnl ?? 0;
                return cumulative;
            });
    }, [trades]);

    // Accept rate strictement derive des stats run-scoped.
    const acceptRate = useMemo(() => {
        if (signalStats && signalStats.total_signals > 0)
            return signalStats.accepted_signals / signalStats.total_signals;
        return null;
    }, [signalStats]);

    const regimeHistory = useMemo(() => {
        const ordered = [...signals].sort(
            (a, b) =>
                new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        return ordered.map((sig) => {
            const meta = getSignalMeta(sig);
            const quality = (meta.regime_quality || "").toUpperCase();
            const state = (meta.regime_state || "").toUpperCase();
            const qualityBucket =
                quality === "A+" || quality === "A" || quality === "B"
                    ? quality
                    : state === "CHOP" || state === "EVENT_RISK"
                    ? "CHOP"
                    : "UNK";
            const score =
                qualityBucket === "A+"
                    ? 4
                    : qualityBucket === "A"
                    ? 3
                    : qualityBucket === "B"
                    ? 2
                    : qualityBucket === "CHOP"
                    ? 1
                    : 0;
            return {
                ts: sig.timestamp,
                quality: qualityBucket,
                score,
                accepted: sig.accepted,
            };
        });
    }, [getSignalMeta, signals]);

    // ==========================================================================
    // RENDER
    // ==========================================================================
    return (
        <div className="relative w-full min-h-full bg-[#070A10] text-neutral-100 font-sans">
            {/* Ambient glows */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-48 left-[-10%] h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.08),transparent_60%)] ambient-float" />
                <div className="absolute -bottom-32 right-[-5%] h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle_at_center,rgba(34,197,94,0.07),transparent_60%)] ambient-float--slow" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[900px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(6,182,212,0.03),transparent_70%)]" />
            </div>

            <div className="relative w-full max-w-none px-2 sm:px-4 md:px-6 xl:px-10 2xl:px-14 py-4 sm:py-6 space-y-4">

                {/* ── SECTION 1 : HEADER ── */}
                <div className="glass-panel p-4 animate-fade-up">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        {/* Identity */}
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center flex-shrink-0">
                                <Activity className="h-5 w-5 text-violet-400" />
                            </div>
                            <div>
                                <div className="text-[10px] uppercase tracking-[0.32em] text-neutral-500">
                                    {STRATEGY_LABEL} · tf_pullback_v1
                                </div>
                                <div className="text-base font-semibold text-white">
                                    {SYMBOL}{" "}
                                    <span className="text-neutral-500 font-normal text-sm">
                                        · Trend Following Pullback
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Status badges */}
                        <div className="flex items-center gap-2 flex-wrap">
                            {tfRunIdEffective && (
                                <code className="text-[10px] text-neutral-500 bg-white/[0.04] border border-white/[0.07] rounded px-2 py-0.5 font-mono">
                                    {tfRunIdEffective.slice(0, 8)}
                                </code>
                            )}
                            {sharedRun && (
                                <GlassBadge variant="warning" size="sm">
                                    SHARED-RUN
                                </GlassBadge>
                            )}
                            {lastSignalMeta?.regime_state && (
                                <GlassBadge
                                    variant={stateVariant(
                                        lastSignalMeta.regime_state
                                    )}
                                    size="sm"
                                >
                                    {lastSignalMeta.regime_state}
                                </GlassBadge>
                            )}
                            {lastSignalMeta?.regime_quality && (
                                <GlassBadge
                                    variant={qualityVariant(
                                        lastSignalMeta.regime_quality
                                    )}
                                    size="sm"
                                    pulse={
                                        lastSignalMeta.regime_quality === "A+"
                                    }
                                >
                                    QUALITY {lastSignalMeta.regime_quality}
                                </GlassBadge>
                            )}
                            <GlassBadge
                                variant={warmupReady ? "success" : "warning"}
                                pulse={!warmupReady}
                                size="sm"
                            >
                                {summary?.warmup_state ?? "UNKNOWN"}
                                {warmupPct != null && !warmupReady
                                    ? ` · ${warmupPct}%`
                                    : ""}
                            </GlassBadge>
                            {loading && (
                                <span className="text-[9px] text-neutral-600 animate-pulse font-mono">
                                    SYNC…
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Warmup progress bar */}
                    {!warmupReady && warmupPct != null && (
                        <div className="mt-3">
                            <div className="flex justify-between text-[9px] text-neutral-600 mb-1 font-mono">
                                <span>WARMUP M15</span>
                                <span>
                                    {summary?.warmup_bars ?? 0} /{" "}
                                    {summary?.warmup_target ?? "—"} bars
                                </span>
                            </div>
                            <div className="h-[3px] rounded-full bg-white/[0.05]">
                                <div
                                    className="h-full rounded-full bg-amber-400/70 transition-all duration-1000"
                                    style={{ width: `${warmupPct}%` }}
                                />
                            </div>
                            <div className="mt-2 grid gap-1 text-[10px] font-mono text-neutral-500 sm:grid-cols-2 xl:grid-cols-3">
                                <span>
                                    RAW {summary?.history_bars ?? 0}/
                                    {summary?.history_bars_required ?? "—"}
                                </span>
                                <span>
                                    M15 {summary?.m15_bars_available ?? 0}/
                                    {summary?.required_m15_bars ?? "—"}
                                </span>
                                <span>
                                    H1 {summary?.h1_bars_available ?? 0}/
                                    {summary?.required_h1_bars ?? "—"}
                                </span>
                                <span>
                                    SRC {summary?.history_source ?? "n/a"} ·{" "}
                                    {summary?.history_bootstrap_status ?? "n/a"}
                                </span>
                                <span>
                                    SPAN {summary?.history_span_hours != null
                                        ? `${summary.history_span_hours.toFixed(1)}h`
                                        : "n/a"}
                                </span>
                                <span>
                                    THROTTLED {summary?.reject_throttled_count ?? 0}
                                </span>
                            </div>
                            {(summary?.warmup_detail || summary?.snapshot_age_h != null) && (
                                <div className="mt-1 text-[10px] text-neutral-500 font-mono">
                                    {summary?.warmup_detail ?? "warmup"} · snapshot{" "}
                                    {summary?.snapshot_loaded_from ?? "primary"} · age{" "}
                                    {summary?.snapshot_age_h != null
                                        ? `${summary.snapshot_age_h.toFixed(2)}h`
                                        : "n/a"}
                                </div>
                            )}
                        </div>
                    )}

                    {sharedRun && (
                        <div className="mt-2 text-[11px] text-cyan-300/70 flex items-center gap-1.5">
                            <Info className="h-3 w-3 flex-shrink-0" />
                            Run partagé avec DW — signaux filtrés par
                            strategy=tf_pullback_v1
                        </div>
                    )}
                    {!tfRunIdEffective && (
                        <div className="mt-2 text-[12px] text-amber-300">
                            NO RUN S3 — sélectionnez un run S3 dans le RunBanner
                            ou le Cockpit.
                        </div>
                    )}
                </div>

                {error && (
                    <div className="text-[12px] text-rose-300 px-2">
                        {error}
                    </div>
                )}

                {/* No-run guard */}
                {!tfRunIdEffective && (
                    <div className="glass-panel p-10 text-center">
                        <Activity className="h-10 w-10 mx-auto mb-3 text-violet-400/20" />
                        <div className="text-sm text-neutral-500">
                            NO RUN S3
                        </div>
                    </div>
                )}

                {tfRunIdEffective && (
                    <>
                        {shouldShowS3NoData({
                            loading,
                            error,
                            signalsCount: signals.length,
                            totalSignals: signalStats?.total_signals,
                        }) && (
                            <div className="glass-panel p-4 text-sm text-amber-300">
                                NO DATA S3 — aucun signal pour ce run.
                            </div>
                        )}
                        {/* ── SECTION 2 : KPI ROW ── */}
                        <div className="animate-fade-up" style={{ animationDelay: "40ms" }}>
                            <KPIRow columns={6}>
                                <GlassKPI
                                    label="PnL Total"
                                    value={
                                        kpis != null
                                            ? fmtEur(kpis.pnl_total)
                                            : undefined
                                    }
                                    variant={
                                        kpis != null
                                            ? kpis.pnl_total >= 0
                                                ? "success"
                                                : "danger"
                                            : "default"
                                    }
                                    size="md"
                                    loading={loading && !kpis}
                                />
                                <GlassKPI
                                    label="PnL Today"
                                    value={
                                        kpis != null
                                            ? fmtEur(kpis.pnl_today)
                                            : undefined
                                    }
                                    variant={
                                        kpis != null
                                            ? kpis.pnl_today >= 0
                                                ? "success"
                                                : "danger"
                                            : "default"
                                    }
                                    size="md"
                                    loading={loading && !kpis}
                                />
                                <GlassKPI
                                    label="Trades"
                                    value={kpis?.trades_count ?? 0}
                                    size="md"
                                    loading={loading && !kpis}
                                />
                                <GlassKPI
                                    label="Win Rate"
                                    value={
                                        kpis?.win_rate != null
                                            ? fmtPct(kpis.win_rate)
                                            : undefined
                                    }
                                    variant={
                                        kpis?.win_rate != null
                                            ? kpis.win_rate >= 0.5
                                                ? "success"
                                                : kpis.win_rate >= 0.4
                                                ? "warning"
                                                : "danger"
                                            : "default"
                                    }
                                    size="md"
                                    loading={loading && !kpis}
                                />
                                <GlassKPI
                                    label="Accept Rate"
                                    value={
                                        acceptRate != null
                                            ? fmtPct(acceptRate)
                                            : undefined
                                    }
                                    variant={
                                        acceptRate != null
                                            ? acceptRate >= 0.3
                                                ? "default"
                                                : "warning"
                                            : "default"
                                    }
                                    size="md"
                                    loading={loading && !signalStats}
                                />
                                <GlassKPI
                                    label="Shocks"
                                    value={
                                        shockStats?.total_shocks ?? shocks.length
                                    }
                                    size="md"
                                    loading={loading && !shockStats}
                                />
                            </KPIRow>
                        </div>

                        {/* ── SECTION 3 : INTELLIGENCE ROW (3 cards) ── */}
                        <div
                            className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-up"
                            style={{ animationDelay: "80ms" }}
                        >
                            {/* Card 1: REGIME ENGINE */}
                            <BentoCard
                                title="Regime Engine"
                                subtitle="H1 · M15 · Filtre Tendance"
                            >
                                <div className="space-y-0.5 mb-4">
                                    <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                                        <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                                            Direction
                                        </span>
                                        <DirectionBadge
                                            direction={
                                                lastSignalMeta?.regime_direction
                                            }
                                            large
                                        />
                                    </div>
                                    <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                                        <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                                            Qualité
                                        </span>
                                        {lastSignalMeta?.regime_quality ? (
                                            <GlassBadge
                                                variant={qualityVariant(
                                                    lastSignalMeta.regime_quality
                                                )}
                                                size="sm"
                                                pulse={
                                                    lastSignalMeta.regime_quality ===
                                                    "A+"
                                                }
                                            >
                                                {lastSignalMeta.regime_quality}
                                            </GlassBadge>
                                        ) : (
                                            <span className="text-neutral-600 text-[11px]">
                                                —
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
                                        <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                                            State
                                        </span>
                                        {lastSignalMeta?.regime_state ? (
                                            <GlassBadge
                                                variant={stateVariant(
                                                    lastSignalMeta.regime_state
                                                )}
                                                size="sm"
                                            >
                                                {lastSignalMeta.regime_state}
                                            </GlassBadge>
                                        ) : (
                                            <span className="text-neutral-600 text-[11px]">
                                                —
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Indicator gauges */}
                                <div className="space-y-3">
                                    <GaugeBar
                                        label="ER H1"
                                        value={lastSignalMeta?.er_h1}
                                        min={0}
                                        max={1}
                                        threshold={0.35}
                                        aPlusThreshold={0.6}
                                    />
                                    <GaugeBar
                                        label="ER M15"
                                        value={lastSignalMeta?.er_m15}
                                        min={0}
                                        max={1}
                                        threshold={0.3}
                                        aPlusThreshold={0.5}
                                    />
                                    <GaugeBar
                                        label="ATR Ratio"
                                        value={lastSignalMeta?.atr_ratio}
                                        min={0.8}
                                        max={2.0}
                                        threshold={1.1}
                                        aPlusThreshold={1.2}
                                    />
                                    <GaugeBar
                                        label="ADX M15"
                                        value={lastSignalMeta?.adx_m15}
                                        min={0}
                                        max={40}
                                        threshold={20}
                                        aPlusThreshold={25}
                                        unit=""
                                        digits={1}
                                    />
                                </div>

                                {lastSignalMeta?.session_bucket && (
                                    <div className="mt-4 pt-3 border-t border-white/[0.04] flex items-center justify-between">
                                        <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                                            Session
                                        </span>
                                        <GlassBadge
                                            variant={
                                                lastSignalMeta.session_bucket ===
                                                "LDN"
                                                    ? "info"
                                                    : lastSignalMeta.session_bucket ===
                                                      "OVL"
                                                    ? "success"
                                                    : lastSignalMeta.session_bucket ===
                                                      "NY"
                                                    ? "warning"
                                                    : "default"
                                            }
                                            size="sm"
                                        >
                                            {lastSignalMeta.session_bucket}
                                        </GlassBadge>
                                    </div>
                                )}
                            </BentoCard>

                            {/* Card 2: SHOCK PIPELINE */}
                            <BentoCard
                                title="Shock Pipeline"
                                subtitle="M5 · Détection Impulsive"
                            >
                                {shocks.length > 0 ? (
                                    <>
                                        {/* Last shock summary */}
                                        <div className="space-y-0.5 mb-4">
                                            <RowItem label="Last Shock">
                                                <span className="text-neutral-300">
                                                    {shocks[0].timestamp.slice(
                                                        11,
                                                        16
                                                    )}{" "}
                                                    UTC
                                                </span>
                                            </RowItem>
                                            <RowItem label="Direction">
                                                <DirectionBadge
                                                    direction={
                                                        shocks[0].direction ===
                                                        "UP"
                                                            ? "BUY"
                                                            : shocks[0]
                                                                    .direction ===
                                                              "DOWN"
                                                            ? "SELL"
                                                            : shocks[0]
                                                                  .direction
                                                    }
                                                />
                                            </RowItem>
                                            <RowItem label="Magnitude">
                                                <span className="text-amber-300">
                                                    {shocks[0]
                                                        .magnitude_pips != null
                                                        ? `${shocks[0].magnitude_pips.toFixed(
                                                              1
                                                          )}p`
                                                        : "n/a"}
                                                </span>
                                            </RowItem>
                                            {lastSignalMeta?.pullback_depth_pct !=
                                                null && (
                                                <RowItem label="Pullback">
                                                    <span className="text-cyan-300">
                                                        {Math.round(
                                                            lastSignalMeta.pullback_depth_pct *
                                                                100
                                                        )}
                                                        %
                                                    </span>
                                                </RowItem>
                                            )}
                                            {lastSignalMeta?.entry_trigger_type && (
                                                <RowItem label="Trigger">
                                                    <span className="text-violet-300 text-[10px]">
                                                        {lastSignalMeta.entry_trigger_type
                                                            .replace(
                                                                "BREAK_PULLBACK_HIGH",
                                                                "BREAK ↑"
                                                            )
                                                            .replace(
                                                                "BREAK_PULLBACK_LOW",
                                                                "BREAK ↓"
                                                            )
                                                            .replace(
                                                                "ENGULFING",
                                                                "ENGULF"
                                                            )}
                                                    </span>
                                                </RowItem>
                                            )}
                                        </div>

                                        {/* Recent M5 impulses list */}
                                        <div className="pt-3 border-t border-white/[0.04]">
                                            <div className="text-[9px] uppercase tracking-[0.2em] text-neutral-600 mb-2">
                                                Derniers impulses M5
                                            </div>
                                            <div className="space-y-1">
                                                {shocks
                                                    .slice(0, 7)
                                                    .map((shock) => (
                                                        <div
                                                            key={shock.shock_id}
                                                            className="flex items-center gap-2 text-[10px]"
                                                        >
                                                            <div
                                                                className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                                                                    shock.direction ===
                                                                    "UP"
                                                                        ? "bg-emerald-400"
                                                                        : "bg-rose-400"
                                                                }`}
                                                            />
                                                            <span className="font-mono text-neutral-500 w-10">
                                                                {shock.timestamp.slice(
                                                                    11,
                                                                    16
                                                                )}
                                                            </span>
                                                            <span
                                                                className={`w-8 ${
                                                                    shock.direction ===
                                                                    "UP"
                                                                        ? "text-emerald-300"
                                                                        : "text-rose-300"
                                                                }`}
                                                            >
                                                                {shock.direction ===
                                                                "UP"
                                                                    ? "BUY"
                                                                    : "SELL"}
                                                            </span>
                                                            <span className="text-amber-300/80 ml-auto font-mono">
                                                                {shock.magnitude_pips?.toFixed(
                                                                    1
                                                                )}
                                                                p
                                                            </span>
                                                            {shock.was_traded && (
                                                                <span className="text-emerald-400/60 text-[9px]">
                                                                    T
                                                                </span>
                                                            )}
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>

                                        {/* Shock conversion stats */}
                                        {shockStats && (
                                            <div className="mt-3 pt-3 border-t border-white/[0.04]">
                                                <div className="flex items-center justify-between text-[10px]">
                                                    <span className="text-neutral-600">
                                                        Conversion shocks→trades
                                                    </span>
                                                    <span className="font-mono text-cyan-300">
                                                        {shockStats.traded_shocks}
                                                        /
                                                        {shockStats.total_shocks}
                                                        {shockStats.total_shocks >
                                                            0 && (
                                                            <span className="ml-1 text-neutral-500">
                                                                (
                                                                {Math.round(
                                                                    (shockStats.traded_shocks /
                                                                        shockStats.total_shocks) *
                                                                        100
                                                                )}
                                                                %)
                                                            </span>
                                                        )}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="text-[12px] text-neutral-500 flex items-center gap-2 mt-2">
                                        <Zap className="h-4 w-4 text-neutral-600" />
                                        Aucun choc M5 détecté pour ce run.
                                    </div>
                                )}
                            </BentoCard>

                            {/* Card 3: LIVE SIGNAL PULSE */}
                            <BentoCard
                                title="Live Signal Pulse"
                                subtitle={
                                    loading
                                        ? "actualisation…"
                                        : "Dernier signal TF"
                                }
                            >
                                {signals.length > 0 ? (
                                    <div className="space-y-2">
                                        {/* Big status row */}
                                        <div className="flex items-center gap-3 py-2 border-b border-white/[0.04]">
                                            <div
                                                className={`h-3 w-3 rounded-full flex-shrink-0 ${
                                                    signals[0].accepted
                                                        ? "bg-emerald-400 animate-pulse"
                                                        : "bg-rose-400"
                                                }`}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="text-base">
                                                    <DirectionBadge
                                                        direction={
                                                            signals[0].direction
                                                        }
                                                        large
                                                    />
                                                </div>
                                                <div className="text-[10px] text-neutral-500 font-mono">
                                                    {signals[0].signal_type}
                                                </div>
                                            </div>
                                            <div className="flex-shrink-0">
                                                {signals[0].accepted ? (
                                                    <GlassBadge
                                                        variant="success"
                                                        size="sm"
                                                        pulse
                                                    >
                                                        ACCEPTED
                                                    </GlassBadge>
                                                ) : (
                                                    <GlassBadge
                                                        variant="danger"
                                                        size="sm"
                                                    >
                                                        REJECTED
                                                    </GlassBadge>
                                                )}
                                            </div>
                                        </div>

                                        {/* Details */}
                                        <div className="space-y-0.5">
                                            {lastSignalMeta?.regime_quality && (
                                                <RowItem label="Regime Q">
                                                    <GlassBadge
                                                        variant={qualityVariant(
                                                            lastSignalMeta.regime_quality
                                                        )}
                                                        size="sm"
                                                    >
                                                        {
                                                            lastSignalMeta.regime_quality
                                                        }
                                                    </GlassBadge>
                                                </RowItem>
                                            )}
                                            {signals[0].decision_stage && (
                                                <RowItem label="Stage">
                                                    <span className="text-neutral-300 text-[10px]">
                                                        {
                                                            signals[0]
                                                                .decision_stage
                                                        }
                                                    </span>
                                                </RowItem>
                                            )}
                                            {!signals[0].accepted &&
                                                (signals[0].rejection_reason ??
                                                    signals[0].reason) && (
                                                    <RowItem label="Reason">
                                                        <span className="text-rose-300 text-[10px] truncate max-w-[120px] block text-right">
                                                            {signals[0]
                                                                .rejection_reason ??
                                                                signals[0]
                                                                    .reason}
                                                        </span>
                                                    </RowItem>
                                                )}
                                            {signals[0].wait_state && (
                                                <RowItem label="Wait">
                                                    <GlassBadge
                                                        variant="warning"
                                                        size="sm"
                                                    >
                                                        {signals[0].wait_state}
                                                    </GlassBadge>
                                                </RowItem>
                                            )}
                                            <RowItem label="Time">
                                                <span className="text-[10px] font-mono text-neutral-400">
                                                    {signals[0].timestamp?.slice(
                                                        11,
                                                        19
                                                    )}{" "}
                                                    UTC
                                                </span>
                                            </RowItem>
                                        </div>

                                        {/* Last 3 rejections */}
                                        {signals.filter((s) => !s.accepted)
                                            .length > 0 && (
                                            <div className="pt-2 border-t border-white/[0.04]">
                                                <div className="text-[9px] uppercase tracking-[0.2em] text-neutral-600 mb-1.5">
                                                    Derniers rejets
                                                </div>
                                                {signals
                                                    .filter((s) => !s.accepted)
                                                    .slice(0, 3)
                                                    .map((sig) => (
                                                        <div
                                                            key={sig.signal_id}
                                                            className="flex items-center gap-2 py-0.5 text-[10px]"
                                                        >
                                                            <span className="font-mono text-neutral-600 w-10">
                                                                {sig.timestamp?.slice(
                                                                    11,
                                                                    16
                                                                )}
                                                            </span>
                                                            <span className="text-rose-300/70 truncate">
                                                                {sig.rejection_reason ??
                                                                    sig.reason ??
                                                                    "—"}
                                                            </span>
                                                        </div>
                                                    ))}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-[12px] text-neutral-500 flex items-center gap-2 mt-2">
                                        <Clock className="h-3.5 w-3.5" />
                                        Aucun signal pour ce run.
                                    </div>
                                )}
                            </BentoCard>
                        </div>

                        {/* ── SECTION 4 : BOTTOM ROW (2 cards) ── */}
                        <div
                            className="grid grid-cols-1 xl:grid-cols-2 gap-4 animate-fade-up"
                            style={{ animationDelay: "120ms" }}
                        >
                            {/* Card: SESSION PERFORMANCE */}
                            <BentoCard
                                title="Session Performance"
                                subtitle="LDN · OVL · NY · Reject breakdown"
                            >
                                {/* Session tiles */}
                                <div className="grid grid-cols-3 gap-2 mb-4">
                                    {(["LDN", "OVL", "NY"] as SessionKey[]).map(
                                        (session) => {
                                            const stats =
                                                sessionStats[session];
                                            const wr =
                                                stats.signals > 0
                                                    ? Math.round(
                                                          (stats.accepted /
                                                              stats.signals) *
                                                              100
                                                      )
                                                    : null;
                                            return (
                                                <div
                                                    key={session}
                                                    className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-2.5 text-center"
                                                >
                                                    <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 mb-1">
                                                        {session}
                                                    </div>
                                                    <div className="text-xl font-mono font-bold text-white">
                                                        {stats.signals}
                                                    </div>
                                                    <div className="text-[9px] text-neutral-600 mb-1">
                                                        signaux
                                                    </div>
                                                    {wr != null ? (
                                                        <div
                                                            className={`text-[10px] font-semibold font-mono ${
                                                                wr >= 50
                                                                    ? "text-emerald-400"
                                                                    : "text-rose-400"
                                                            }`}
                                                        >
                                                            {wr}% acc
                                                        </div>
                                                    ) : (
                                                        <div className="text-[9px] text-neutral-700">
                                                            —
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        }
                                    )}
                                </div>

                                {/* Rejection breakdown */}
                                {signalStats &&
                                    Object.keys(
                                        signalStats.by_rejection_reason
                                    ).length > 0 && (
                                        <div className="mb-4 pb-4 border-b border-white/[0.04]">
                                            <div className="text-[9px] uppercase tracking-[0.2em] text-neutral-600 mb-2">
                                                Top reasons de rejet
                                            </div>
                                            {Object.entries(
                                                signalStats.by_rejection_reason
                                            )
                                                .sort(([, a], [, b]) => b - a)
                                                .slice(0, 5)
                                                .map(([reason, count]) => {
                                                    const total =
                                                        signalStats.total_signals -
                                                            signalStats.accepted_signals ||
                                                        1;
                                                    const pct = Math.round(
                                                        (count / total) * 100
                                                    );
                                                    return (
                                                        <div
                                                            key={reason}
                                                            className="flex items-center gap-2 py-0.5"
                                                        >
                                                            <div className="flex-1 h-1 rounded-full bg-white/[0.04] overflow-hidden">
                                                                <div
                                                                    className="h-full rounded-full bg-rose-500/40"
                                                                    style={{
                                                                        width: `${pct}%`,
                                                                    }}
                                                                />
                                                            </div>
                                                            <span className="text-[10px] text-neutral-400 w-36 truncate text-right font-mono">
                                                                {reason}
                                                            </span>
                                                            <span className="text-[10px] font-mono text-rose-300 w-5 text-right">
                                                                {count}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    )}

                                {/* PnL Equity Curve */}
                                {pnlSeries.length > 1 ? (
                                    <div className="flex items-center gap-3">
                                        <div className="text-[9px] uppercase tracking-[0.2em] text-neutral-600 flex-shrink-0">
                                            Equity
                                        </div>
                                        <MiniSparkline
                                            data={pnlSeries}
                                            width={120}
                                            height={28}
                                            color={
                                                pnlSeries[
                                                    pnlSeries.length - 1
                                                ] >= 0
                                                    ? "#00FF88"
                                                    : "#ef4444"
                                            }
                                            showArea
                                        />
                                        <div
                                            className={`text-[11px] font-mono ml-auto flex-shrink-0 ${
                                                pnlSeries[
                                                    pnlSeries.length - 1
                                                ] >= 0
                                                    ? "text-emerald-400"
                                                    : "text-rose-400"
                                            }`}
                                        >
                                            {fmtEur(
                                                pnlSeries[pnlSeries.length - 1]
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-[11px] text-neutral-600 text-center py-2">
                                        Pas encore de trades fermés
                                    </div>
                                )}
                            </BentoCard>

                            {/* Card: SIGNAL DECISION LOG */}
                            <BentoCard
                                title="Signal Decision Log"
                                subtitle={`${signals.length} signaux · desc · regime Q`}
                            >
                                <div
                                    className="overflow-auto"
                                    style={{ maxHeight: "320px" }}
                                >
                                    <table className="w-full text-[10px] border-collapse">
                                        <thead>
                                            <tr
                                                className="text-neutral-600 border-b border-white/[0.05]"
                                                style={{
                                                    position: "sticky",
                                                    top: 0,
                                                    background:
                                                        "rgba(7,10,16,0.97)",
                                                }}
                                            >
                                                <th className="text-left py-1.5 pr-2 uppercase tracking-[0.12em] font-normal">
                                                    Time
                                                </th>
                                                <th className="text-left py-1.5 pr-2 uppercase tracking-[0.12em] font-normal">
                                                    Dir
                                                </th>
                                                <th className="text-left py-1.5 pr-2 uppercase tracking-[0.12em] font-normal">
                                                    Type
                                                </th>
                                                <th className="text-left py-1.5 pr-2 uppercase tracking-[0.12em] font-normal">
                                                    Q
                                                </th>
                                                <th className="text-left py-1.5 pr-2 uppercase tracking-[0.12em] font-normal">
                                                    Acc
                                                </th>
                                                <th className="text-left py-1.5 uppercase tracking-[0.12em] font-normal">
                                                    Reason / Stage
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {signals.map((sig) => {
                                                const meta = getSignalMeta(sig);
                                                const q = meta.regime_quality;
                                                const rowHover = !sig.accepted
                                                    ? "hover:bg-rose-900/[0.07]"
                                                    : q === "A+"
                                                    ? "hover:bg-emerald-900/[0.07]"
                                                    : "hover:bg-white/[0.02]";
                                                return (
                                                    <tr
                                                        key={sig.signal_id}
                                                        className={`border-b border-white/[0.025] transition-colors ${rowHover}`}
                                                    >
                                                        <td className="py-1.5 pr-2 font-mono text-neutral-500 whitespace-nowrap">
                                                            {sig.timestamp?.slice(
                                                                11,
                                                                16
                                                            )}{" "}
                                                            UTC
                                                        </td>
                                                        <td className="py-1.5 pr-2">
                                                            <DirectionBadge
                                                                direction={
                                                                    sig.direction
                                                                }
                                                            />
                                                        </td>
                                                        <td className="py-1.5 pr-2 text-neutral-500 font-mono text-[9px]">
                                                            {sig.signal_type ??
                                                                "—"}
                                                        </td>
                                                        <td className="py-1.5 pr-2">
                                                            {q ? (
                                                                <span
                                                                    className={`text-[9px] font-bold font-mono ${
                                                                        q ===
                                                                        "A+"
                                                                            ? "text-emerald-400"
                                                                            : q ===
                                                                              "A"
                                                                            ? "text-cyan-400"
                                                                            : "text-amber-400"
                                                                    }`}
                                                                >
                                                                    {q}
                                                                </span>
                                                            ) : (
                                                                <span className="text-neutral-700">
                                                                    —
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="py-1.5 pr-2">
                                                            {sig.accepted ? (
                                                                <span className="text-emerald-400 font-bold">
                                                                    ✓
                                                                </span>
                                                            ) : (
                                                                <span className="text-rose-400">
                                                                    ✗
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="py-1.5 text-neutral-500 max-w-[180px] truncate font-mono text-[9px]">
                                                            {sig.rejection_reason ??
                                                                sig.reason ??
                                                                sig.decision_stage ??
                                                                "—"}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    {signals.length === 0 && (
                                        <div className="text-[12px] text-neutral-500 py-8 text-center">
                                            Aucun signal enregistré pour ce run.
                                        </div>
                                    )}
                                </div>
                            </BentoCard>
                        </div>

                        {/* ── SECTION 5 : EXECUTION + REGIME HISTORY ── */}
                        <div
                            className="grid grid-cols-1 xl:grid-cols-2 gap-4 animate-fade-up"
                            style={{ animationDelay: "140ms" }}
                        >
                            <BentoCard
                                title="Execution Metrics"
                                subtitle="S3 · /api/execution/metrics"
                            >
                                {executionMetrics ? (
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                                                <div className="text-[9px] uppercase tracking-[0.15em] text-neutral-500">
                                                    Entry slip p50
                                                </div>
                                                <div className="text-[12px] font-mono text-neutral-200">
                                                    {fmtPips(executionMetrics.overall.entry.p50)}
                                                </div>
                                            </div>
                                            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                                                <div className="text-[9px] uppercase tracking-[0.15em] text-neutral-500">
                                                    Exit slip p50
                                                </div>
                                                <div className="text-[12px] font-mono text-neutral-200">
                                                    {fmtPips(executionMetrics.overall.exit.p50)}
                                                </div>
                                            </div>
                                            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                                                <div className="text-[9px] uppercase tracking-[0.15em] text-neutral-500">
                                                    Total slip p95
                                                </div>
                                                <div className="text-[12px] font-mono text-neutral-200">
                                                    {fmtPips(executionMetrics.overall.total.p95)}
                                                </div>
                                            </div>
                                            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                                                <div className="text-[9px] uppercase tracking-[0.15em] text-neutral-500">
                                                    Fill entry p95
                                                </div>
                                                <div className="text-[12px] font-mono text-neutral-200">
                                                    {fmtMs(
                                                        executionMetrics.overall
                                                            .latency_entry_ms?.p95
                                                    )}
                                                </div>
                                            </div>
                                            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                                                <div className="text-[9px] uppercase tracking-[0.15em] text-neutral-500">
                                                    Fill exit p95
                                                </div>
                                                <div className="text-[12px] font-mono text-neutral-200">
                                                    {fmtMs(
                                                        executionMetrics.overall
                                                            .latency_exit_ms?.p95
                                                    )}
                                                </div>
                                            </div>
                                            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
                                                <div className="text-[9px] uppercase tracking-[0.15em] text-neutral-500">
                                                    SLA
                                                </div>
                                                <div className="flex items-center gap-1.5 text-[11px] font-mono">
                                                    {executionMetrics.sla
                                                        ?.status === "WARNING" && (
                                                        <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />
                                                    )}
                                                    <span
                                                        className={
                                                            executionMetrics.sla
                                                                ?.status ===
                                                            "WARNING"
                                                                ? "text-amber-300"
                                                                : "text-emerald-300"
                                                        }
                                                    >
                                                        {executionMetrics.sla
                                                            ?.status || "NO_DATA"}
                                                    </span>
                                                    <span className="text-neutral-500">
                                                        {fmtMs(
                                                            executionMetrics.sla
                                                                ?.p95_ms
                                                        )}{" "}
                                                        /
                                                        {executionMetrics.sla
                                                            ?.threshold_ms ??
                                                            "n/a"}
                                                        ms
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-[12px] text-neutral-500">
                                        Métriques exécution indisponibles.
                                    </div>
                                )}
                            </BentoCard>

                            <BentoCard
                                title="Regime History"
                                subtitle="A+ · A · B · CHOP intraday"
                            >
                                {regimeHistory.length > 0 ? (
                                    <div className="space-y-3">
                                        <div className="h-24 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
                                            <div className="flex items-end gap-[2px] h-full overflow-x-auto">
                                                {regimeHistory.map((p, idx) => {
                                                    const color =
                                                        p.quality === "A+"
                                                            ? "bg-emerald-400/70"
                                                            : p.quality === "A"
                                                            ? "bg-cyan-400/70"
                                                            : p.quality === "B"
                                                            ? "bg-amber-400/70"
                                                            : p.quality ===
                                                              "CHOP"
                                                            ? "bg-rose-400/70"
                                                            : "bg-neutral-600/50";
                                                    const h = Math.max(
                                                        6,
                                                        p.score * 5
                                                    );
                                                    return (
                                                        <div
                                                            key={`${p.ts}:${idx}`}
                                                            className={`w-[6px] min-w-[6px] rounded-t ${color}`}
                                                            style={{
                                                                height: `${h * 4}px`,
                                                            }}
                                                            title={`${p.ts} · ${p.quality}`}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between text-[10px] font-mono text-neutral-500">
                                            <span>
                                                {regimeHistory[0].ts.slice(11, 16)}
                                            </span>
                                            <span>
                                                {
                                                    regimeHistory[
                                                        Math.floor(
                                                            regimeHistory.length /
                                                                2
                                                        )
                                                    ].ts.slice(11, 16)
                                                }
                                            </span>
                                            <span>
                                                {regimeHistory[
                                                    regimeHistory.length - 1
                                                ].ts.slice(11, 16)}
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-[12px] text-neutral-500">
                                        Pas encore d'historique de qualité.
                                    </div>
                                )}
                            </BentoCard>
                        </div>

                        {/* ── SECTION 6 : S3 SIGNAL REPLAY ── */}
                        <div
                            className="animate-fade-up"
                            style={{ animationDelay: "160ms" }}
                        >
                            <BentoCard
                                title="Signal Replay S3"
                                subtitle="tf_pullback_v1 · timeline + price overlay"
                            >
                                {!replayEnabled ? (
                                    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 text-sm text-neutral-400">
                                        <div className="mb-3">
                                            Le replay charge OHLC + chart à la demande pour
                                            préserver un first paint rapide.
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setReplayEnabled(true)}
                                            className="rounded-md border border-cyan-400/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20"
                                        >
                                            Charger le replay S3
                                        </button>
                                    </div>
                                ) : (
                                    <Suspense
                                        fallback={
                                            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 text-sm text-neutral-400">
                                                Chargement du replay S3...
                                            </div>
                                        }
                                    >
                                        <S3SignalReplayPanel
                                            runId={tfRunIdEffective}
                                            strategyId={STRATEGY_ID}
                                            signals={signals}
                                            trades={trades}
                                        />
                                    </Suspense>
                                )}
                            </BentoCard>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
