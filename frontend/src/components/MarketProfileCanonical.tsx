import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRunId, useRunMeta, useRunStats } from "../lib/useRunContext";
import { canonicalApi, Shock, Signal } from "../lib/canonicalApi";
import { useDashboardPoll } from "../lib/dashboardPollingBus";
import { ZeroStateDisplay } from "./ZeroStateDisplay";
import { GraphModeButton } from "./graphs/GraphModeButton";
import { formatTime } from "../lib/dateUtils";

const glassCardCore =
    "rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.22),transparent_32%),linear-gradient(135deg,rgba(4,7,15,0.92),rgba(6,11,20,0.92))] p-4 sm:p-5 backdrop-blur-2xl shadow-[0_28px_110px_rgba(0,0,0,0.65)]";
const miniGlass =
    "rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.15),transparent_40%)] bg-[#04080f]/80 px-3 py-2 backdrop-blur-xl";

/**
 * MarketProfileCanonical - Étape 5
 * 
 * Market profile view using ONLY canonical DBs:
 * - shocks.sqlite: Market events (z-score, shock_type, session)
 * - signals.sqlite: Decisions (accepted/rejected, reason)
 * 
 * Three cards:
 * 1. Shock Activity: Volume of shocks by session/hour
 * 2. Decision Pressure: Accept/Reject ratio, rejection reasons
 * 3. Volatility & Spread Context: From shock data
 */
export function MarketProfileCanonical() {
    const runId = useRunId();
    const { run, isRunAware } = useRunMeta();
    const { shockStats } = useRunStats();
    const strategyId = run?.strategy_id ?? null;

    const [shocks, setShocks] = useState<Shock[]>([]);
    const [signals, setSignals] = useState<Signal[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const mountedRef = useRef(true);

    const load = useCallback(async () => {
        if (!runId) {
            setShocks([]);
            setSignals([]);
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            const [shockData, signalData] = await Promise.all([
                canonicalApi.listShocks(runId, {
                    limit: 500,
                    strategyId: strategyId ?? undefined,
                }),
                canonicalApi.listSignals(runId, {
                    limit: 500,
                    strategyId: strategyId ?? undefined,
                }),
            ]);
            if (!mountedRef.current) return;
            setShocks(shockData.shocks);
            setSignals(signalData.signals);
            setError(null);
        } catch (e: any) {
            if (!mountedRef.current) return;
            setError(e.message || "Failed to load canonical data");
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, [runId, strategyId]);

    useDashboardPoll("analytics", load, {
        enabled: Boolean(runId),
        immediate: true,
        intervalMs: 60_000,
    });

    useEffect(() => {
        if (!runId) {
            setShocks([]);
            setSignals([]);
            setLoading(false);
        }
    }, [runId]);

    useEffect(() => {
        return () => {
            mountedRef.current = false;
        };
    }, []);

    // Shock activity by session
    const shocksBySession = useMemo(() => {
        const counts: Record<string, number> = { LONDON: 0, NY: 0, ASIAN: 0, OTHER: 0 };
        shocks.forEach((s) => {
            const session = s.session?.toUpperCase() || "OTHER";
            if (session in counts) counts[session]++;
            else counts.OTHER++;
        });
        return counts;
    }, [shocks]);

    // Shock activity by hour (last 24h distribution)
    const shocksByHour = useMemo(() => {
        const hourCounts = Array(24).fill(0);
        shocks.forEach((s) => {
            const hour = new Date(s.timestamp).getUTCHours();
            hourCounts[hour]++;
        });
        return hourCounts;
    }, [shocks]);
    const shockHourSeries = useMemo(
        () => shocksByHour.map((count, hour) => ({ x: `${hour}h`, y: count })),
        [shocksByHour]
    );

    // Z-score distribution
    const zScoreStats = useMemo(() => {
        if (!shocks.length) return { avg: 0, max: 0, min: 0, high: 0, medium: 0, low: 0 };
        const zScores = shocks.map((s) => Math.abs(s.z_score || 0));
        const avg = zScores.reduce((a, b) => a + b, 0) / zScores.length;
        const max = Math.max(...zScores);
        const min = Math.min(...zScores);
        const high = zScores.filter((z) => z >= 2.0).length;
        const medium = zScores.filter((z) => z >= 1.5 && z < 2.0).length;
        const low = zScores.filter((z) => z < 1.5).length;
        return { avg, max, min, high, medium, low };
    }, [shocks]);
    const zHistogram = useMemo(() => buildZHistogram(shocks), [shocks]);

    // Decision pressure - acceptance rate
    const decisionStats = useMemo(() => {
        const total = signals.length;
        const accepted = signals.filter((s) => s.accepted).length;
        const rejected = signals.filter((s) => !s.accepted).length;
        const rate = total > 0 ? (accepted / total) * 100 : 0;

        // Rejection reasons breakdown
        const reasons: Record<string, number> = {};
        signals.filter((s) => !s.accepted && s.rejection_reason).forEach((s) => {
            const reason = s.rejection_reason || "unknown";
            reasons[reason] = (reasons[reason] || 0) + 1;
        });

        return { total, accepted, rejected, rate, reasons };
    }, [signals]);

    // Recent shocks (last 10)
    const recentShocks = useMemo(() => {
        return [...shocks].sort((a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        ).slice(0, 10);
    }, [shocks]);

    // Regime from shock stats
    const currentRegime = useMemo(() => {
        if (!shockStats) return "UNKNOWN";
        // Derive regime from shock intensity
        if (zScoreStats.avg >= 2.0 || zScoreStats.high > 5) return "HIGH";
        if (zScoreStats.avg >= 1.5 || zScoreStats.medium > 3) return "MEDIUM";
        return "LOW";
    }, [shockStats, zScoreStats]);

    const regimeTone = currentRegime === "HIGH" ? "danger" : currentRegime === "MEDIUM" ? "warn" : "success";

    // RULE: No data without run_id - show explicit zero state
    if (!runId) {
        return (
            <div className={`${glassCardCore} space-y-4`}>
                <CardHeader
                    title="Market Profile"
                    subtitle="Canonical view"
                    description="Sélectionne un run pour activer les données shocks + signals."
                />
                <ZeroStateDisplay
                    runId={null}
                    error={null}
                    isLoading={false}
                    dataCount={0}
                    dataType="shocks"
                />
            </div>
        );
    }

    const runLabel = run?.strategy_id ? `${run.strategy_id} · ${run.strategy_version ?? "v?"}` : null;

    return (
        <div className="space-y-5">
            <div className={`${glassCardCore} flex flex-wrap items-start justify-between gap-5`}>
                <div>
                    <p className="text-[11px] uppercase tracking-[0.45em] text-cyan-100/70">
                        Research · Canonical
                    </p>
                    <h2 className="text-2xl font-semibold text-white">Market Profile</h2>
                    <p className="text-sm text-white/60">
                        Observabilité directe des shocks et signaux depuis les DBs canoniques.
                    </p>
                    {error && <p className="text-xs text-red-300 mt-2">{error}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/80">
                    {runLabel && (
                        <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 font-mono text-white/70">
                            {runLabel}
                        </span>
                    )}
                    {isRunAware && runId && (
                        <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 font-mono text-emerald-100">
                            run · {runId.slice(0, 8)}
                        </span>
                    )}
                    <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 font-mono text-cyan-100">
                        shocks.sqlite · signals.sqlite
                    </span>
                    {loading && <span className="text-neutral-400">refreshing…</span>}
                </div>
                <GraphModeButton to="/research/market-profile/graphs" />
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
                <div className="space-y-5 xl:col-span-2">
                    <div className={`${glassCardCore} space-y-5`}>
                        <CardHeader
                            title="Shock Activity"
                            subtitle="Tempo" 
                            description="Volume par session et intensité horaire"
                        />
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                            <KpiCard label="Total shocks" value={shocks.length} />
                            <KpiCard label="Avg |z|" value={zScoreStats.avg.toFixed(2)} />
                            <KpiCard label="Max |z|" value={zScoreStats.max.toFixed(2)} tone="warn" />
                            <KpiCard label="Regime" value={currentRegime} tone={regimeTone} />
                        </div>

                        <SectionLabel label="Sessions" hint="Rolling last 500 shocks" />
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                            {Object.entries(shocksBySession).map(([session, count]) => (
                                <SessionTile key={session} session={session} value={count} />
                            ))}
                        </div>

                        <SectionLabel label="Hour map (UTC)" hint="Density of shocks" />
                        <div className="flex gap-1 overflow-hidden rounded-2xl border border-white/5 bg-black/30 p-2">
                            {shocksByHour.map((count, hour) => (
                                <HourBar key={hour} hour={hour} count={count} max={Math.max(...shocksByHour)} />
                            ))}
                        </div>
                    </div>
                </div>

                <div className="space-y-5 xl:col-span-1">
                    <div className={`${glassCardCore} space-y-4`}>
                        <CardHeader
                            title="Decision Pressure"
                            subtitle="Signals"
                            description="Accept / reject issu du canonical logger"
                        />
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-2">
                            <KpiCard label="Total" value={decisionStats.total} />
                            <KpiCard label="Accepted" value={decisionStats.accepted} tone="success" />
                            <KpiCard label="Rejected" value={decisionStats.rejected} tone="danger" />
                            <KpiCard
                                label="Accept rate"
                                value={`${decisionStats.rate.toFixed(1)}%`}
                                tone={decisionStats.rate > 50 ? "success" : "warn"}
                            />
                        </div>
                        <SectionLabel label="Top rejection reasons" />
                        {Object.keys(decisionStats.reasons).length === 0 ? (
                            <EmptyStrip label="No rejects" message="Aucune condition bloquante enregistrée." />
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {Object.entries(decisionStats.reasons)
                                    .sort((a, b) => b[1] - a[1])
                                    .slice(0, 6)
                                    .map(([reason, count]) => (
                                        <span
                                            key={reason}
                                            className="inline-flex items-center gap-1 rounded-full border border-red-400/40 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-200"
                                        >
                                            <span className="font-mono tracking-tight">{reason}</span>
                                            <span className="text-red-300">×{count}</span>
                                        </span>
                                    ))}
                            </div>
                        )}
                    </div>

                    <div className={`${glassCardCore} space-y-4`}>
                        <CardHeader
                            title="Z-score Intensity"
                            subtitle="Severity"
                            description="Répartition absolue des |z|"
                        />
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <SeverityTile label="High" detail="|z| ≥ 2.0" value={zScoreStats.high} tone="danger" />
                            <SeverityTile label="Medium" detail="1.5 ≤ |z| < 2.0" value={zScoreStats.medium} tone="warn" />
                            <SeverityTile label="Low" detail="|z| < 1.5" value={zScoreStats.low} tone="success" />
                        </div>
                        <SectionLabel label="Recent shocks" hint="Last 10 canonical rows" />
                        {recentShocks.length === 0 ? (
                            <EmptyStrip label="No shocks" message="Aucun shock récent enregistré pour ce run." />
                        ) : (
                            <div className="overflow-hidden rounded-2xl border border-white/5">
                                <table className="w-full text-xs">
                                    <thead className="bg-white/5 text-[11px] uppercase tracking-[0.2em] text-white/50">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Time</th>
                                            <th className="px-3 py-2 text-left">Type</th>
                                            <th className="px-3 py-2 text-right">|z|</th>
                                            <th className="px-3 py-2 text-left">Session</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recentShocks.map((shock, i) => (
                                            <RecentShockRow key={shock.shock_id || i} shock={shock} />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function CardHeader({
    title,
    subtitle,
    description,
}: {
    title: string;
    subtitle?: string;
    description?: string;
}) {
    return (
        <div>
            {subtitle && (
                <div className="text-[11px] uppercase tracking-[0.35em] text-white/40">
                    {subtitle}
                </div>
            )}
            <div className="text-xl font-semibold text-white">{title}</div>
            {description && <p className="text-sm text-white/60">{description}</p>}
        </div>
    );
}

function buildZHistogram(shocks: Shock[]) {
    const bins = [
        { label: "0-1.0", min: 0, max: 1.0, count: 0 },
        { label: "1.0-1.5", min: 1.0, max: 1.5, count: 0 },
        { label: "1.5-2.0", min: 1.5, max: 2.0, count: 0 },
        { label: "2.0-3.0", min: 2.0, max: 3.0, count: 0 },
        { label: "3.0+", min: 3.0, max: Infinity, count: 0 },
    ];
    shocks.forEach((s) => {
        const z = Math.abs(s.z_score || 0);
        const bin = bins.find((b) => z >= b.min && z < b.max);
        if (bin) bin.count += 1;
    });
    return {
        labels: bins.map((b) => b.label),
        counts: bins.map((b) => b.count),
    };
}

function SectionLabel({ label, hint }: { label: string; hint?: string }) {
    return (
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.3em] text-white/50">
            <span>{label}</span>
            {hint && <span className="text-white/30 normal-case tracking-normal">{hint}</span>}
        </div>
    );
}

function KpiCard({
    label,
    value,
    tone = "neutral",
}: {
    label: string;
    value: string | number;
    tone?: "success" | "warn" | "danger" | "neutral";
}) {
    const toneClasses = {
        success: "border-emerald-400/40 text-emerald-100",
        warn: "border-amber-400/40 text-amber-200",
        danger: "border-red-400/40 text-red-200",
        neutral: "border-white/15 text-white",
    };

    return (
        <div className={`${miniGlass} text-center ${toneClasses[tone]}`}>
            <div className="text-[10px] uppercase tracking-[0.35em] text-white/50">{label}</div>
            <div className="text-2xl font-semibold text-white">{value}</div>
        </div>
    );
}

function SessionTile({ session, value }: { session: string; value: number }) {
    return (
        <div className={`${miniGlass} text-center text-white/80`}>
            <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">{session}</div>
            <div className="text-xl font-semibold text-white">{value}</div>
        </div>
    );
}

function HourBar({ hour, count, max }: { hour: number; count: number; max: number }) {
    const intensity = max === 0 ? 0 : count / max;
    const height = count === 0 ? 6 : Math.max(14, intensity * 100);
    return (
        <div className="group flex-1" title={`${hour}:00 UTC · ${count} shocks`}>
            <div className="relative h-24 overflow-hidden rounded-full border border-white/5 bg-white/5">
                <div
                    className="absolute bottom-0 left-0 right-0 rounded-full bg-gradient-to-t from-cyan-400/70 via-cyan-400/20 to-transparent"
                    style={{ height: `${height}%` }}
                />
            </div>
            <div className="mt-1 text-center text-[9px] text-white/40">{hour}</div>
        </div>
    );
}

function SeverityTile({
    label,
    detail,
    value,
    tone,
}: {
    label: string;
    detail: string;
    value: number;
    tone: "danger" | "warn" | "success";
}) {
    const palette = {
        danger: "from-red-500/40 to-red-500/10 border-red-400/30 text-red-100",
        warn: "from-amber-500/40 to-amber-500/10 border-amber-400/30 text-amber-100",
        success: "from-emerald-500/40 to-emerald-500/10 border-emerald-400/30 text-emerald-100",
    } as const;

    return (
        <div className={`rounded-2xl border bg-gradient-to-br ${palette[tone]} px-3 py-3 text-center`}>
            <div className="text-[11px] uppercase tracking-[0.3em]">{label}</div>
            <div className="text-[11px] text-white/70">{detail}</div>
            <div className="text-3xl font-semibold">{value}</div>
        </div>
    );
}

function EmptyStrip({ label, message }: { label: string; message: string }) {
    return (
        <div className={`${miniGlass} w-full text-left text-white/60`}>
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">{label}</div>
            <p className="text-sm text-white/60">{message}</p>
        </div>
    );
}

function RecentShockRow({ shock }: { shock: Shock }) {
    const z = Math.abs(shock.z_score || 0);
    const zTone = z >= 2 ? "text-red-300" : z >= 1.5 ? "text-amber-200" : "text-white";
    const dirClass =
        shock.direction === "UP"
            ? "bg-emerald-500/15 text-emerald-200"
            : shock.direction === "DOWN"
                ? "bg-red-500/15 text-red-200"
                : "bg-white/10 text-white/70";
    return (
        <tr className="border-t border-white/5 text-white/70">
            <td className="px-3 py-2 text-white/60">
                {formatTime(shock.timestamp, "UTC")} UTC
            </td>
            <td className="px-3 py-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${dirClass}`}>
                    {shock.shock_type || shock.direction || "—"}
                </span>
            </td>
            <td className={`px-3 py-2 text-right font-mono ${zTone}`}>
                {shock.z_score?.toFixed(2) ?? "—"}
            </td>
            <td className="px-3 py-2 text-white/50">{shock.session || "—"}</td>
        </tr>
    );
}
