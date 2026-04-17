/**
 * Strategy Overview - Liquid Glass Bento Cockpit
 *
 * Intent: single-glance tradability verdict + run/execution facts + portfolio 5K pulse.
 */

import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react";
import {
    type S2Summary,
} from "../lib/api";
import { defaultScope } from "../lib/activeContext";
import { usePortfolioEpochContext } from "../lib/PortfolioEpochContext";
import { useBundleRuns } from "../lib/useBundleRuns";
import { useCommissionView } from "../lib/useCommissionView";
import { useDeskRunContext } from "../lib/useDeskRunContext";
import { useRunMeta, useRunStats } from "../lib/useRunContext";
import { formatDateTimeUTC } from "../lib/dateUtils";
import {
    useOverviewLanes,
} from "../lib/useOverviewLanes";
import { EquityCurveChart } from "./EquityCurveChart";
import {
    resolveGateway,
    resolveRuntimeWarmupLabel,
    resolveRuntimeWarmupProgress,
    resolveRuntimeWarmupState,
} from "./StrategyOverview.utils";
export {
    buildPortfolioSummaryView,
    buildPrefetchedOverviewState,
} from "../lib/useOverviewLanes";

type Verdict =
    | "READY"
    | "CAUTION"
    | "HALTED"
    | "WARMUP"
    | "SYNCING"
    | "NO DATA"
    | "OFF MARKET"
    | "FROZEN"
    | "DEGRADED";

type Tone = "good" | "warn" | "bad" | "neutral";

interface SystemSnapshot {
    verdict: Verdict;
    line: string;
    tone: Tone;
}

type StrategyDeskRow = {
    id: string;
    label: string;
    subtitle: string;
    verdict: Verdict;
    tone: Tone;
    runId: string | null;
    service: string | null;
    openPositions: number;
    tradeCount: number;
    pnlUsd: number | null;
    sharpe: number | null;
    warmupLabel: string | null;
    warmupPct: number | null;
    lastSignalTs: string | null;
    primaryMetricLabel: string;
    primaryMetricValue: string;
    secondaryMetricLabel: string;
    secondaryMetricValue: string;
    error: string | null;
};

type OverviewKpi = {
    label: string;
    value: string | number;
    tone?: Tone;
    mono?: boolean;
    progress?: number | null;
};

type CompactMetaItem = {
    label: string;
    value: string | number;
    tone?: Tone;
    mono?: boolean;
};

type ExpandedOverviewPanel =
    | "desk"
    | "portfolio_curve"
    | `strategy:${StrategyDeskRow["id"]}`;

const DEFAULT_S2_PAIR = "n/a";

function resolveS2Pair(summary: S2Summary | null): string {
    if (summary?.pair_key) return summary.pair_key;
    const symbolA = summary?.config?.symbol_a;
    const symbolB = summary?.config?.symbol_b;
    if (symbolA && symbolB) return `${symbolA}_${symbolB}`;
    return DEFAULT_S2_PAIR;
}

function formatUsd(
    value: number | null | undefined,
    options: { showPlus?: boolean; digits?: number } = {}
): string {
    if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
    const digits = options.digits ?? 2;
    const showPlus = options.showPlus ?? true;
    const prefix = value < 0 ? "-" : showPlus && value > 0 ? "+" : "";
    return `${prefix}${Math.abs(value).toFixed(digits)} USD`;
}

function toneFromPnL(value: number | null | undefined): Tone {
    if (value === null || value === undefined) return "neutral";
    if (value > 0) return "good";
    if (value < 0) return "bad";
    return "neutral";
}

function verdictTone(verdict: Verdict): Tone {
    switch (verdict) {
        case "READY":
            return "good";
        case "CAUTION":
        case "OFF MARKET":
        case "DEGRADED":
        case "FROZEN":
            return "warn";
        case "HALTED":
            return "bad";
        case "WARMUP":
        case "SYNCING":
        default:
            return "neutral";
    }
}

function toneTextClass(tone: Tone): string {
    switch (tone) {
        case "good":
            return "text-emerald-200";
        case "warn":
            return "text-amber-200";
        case "bad":
            return "text-rose-200";
        default:
            return "text-neutral-200";
    }
}

function tonePillClass(tone: Tone): string {
    switch (tone) {
        case "good":
            return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
        case "warn":
            return "border-amber-400/30 bg-amber-500/10 text-amber-200";
        case "bad":
            return "border-rose-400/30 bg-rose-500/10 text-rose-200";
        default:
            return "border-white/10 bg-white/[0.04] text-neutral-200";
    }
}

function formatPercent(value: number | null | undefined, digits = 0): string {
    if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
    return `${(value * 100).toFixed(digits)}%`;
}

function formatCompactRunId(runId: string | null | undefined): string {
    if (!runId) return "n/a";
    if (runId.length <= 24) return runId;
    return `${runId.slice(0, 10)}…${runId.slice(-8)}`;
}

function formatTickAgeSeconds(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
    if (value < 60) return `${value.toFixed(0)}s`;
    return `${(value / 60).toFixed(1)}m`;
}

function formatAgeFromUtc(value: string | null | undefined): string {
    if (!value) return "n/a";
    const ts = Date.parse(value);
    if (Number.isNaN(ts)) return "n/a";
    const ageSeconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (ageSeconds < 60) return `${ageSeconds}s`;
    if (ageSeconds < 3600) return `${Math.round(ageSeconds / 60)}m`;
    return `${Math.round(ageSeconds / 3600)}h`;
}

function isActivationKey(event: React.KeyboardEvent<HTMLElement>): boolean {
    return event.key === "Enter" || event.key === " ";
}

function toStrategyPanelId(
    strategyId: StrategyDeskRow["id"]
): ExpandedOverviewPanel {
    return `strategy:${strategyId}` as ExpandedOverviewPanel;
}

export function StrategyOverview() {
    const { run, selectedRunId, invalidReason, loading: runLoading } = useRunMeta();
    const { signalStats, shockStats } = useRunStats();
    const runId = selectedRunId ?? run?.run_id ?? null;
    const { selectedEpoch } = usePortfolioEpochContext();
    const { enabled: bundleEnabled, dwRunId, s2RunId, tfRunId } = useBundleRuns();
    const { commissionView } = useCommissionView();
    const { data: deskRunContext } = useDeskRunContext({
        selectedRunId: runId,
        activeRunId: run?.run_id ?? null,
        bundleEnabled,
        dwRunId,
        s2RunId,
        tfRunId,
    });
    const dwRunIdEffective = deskRunContext.strategy_runs.damping_wave ?? null;
    const s2RunIdEffective = deskRunContext.strategy_runs.s2_pairs_trading ?? null;
    const tfRunIdEffective = deskRunContext.strategy_runs.tf_pullback_v1 ?? null;
    const tfSummaryRunId = tfRunIdEffective ?? dwRunIdEffective ?? null;
    const hasAnyRun = deskRunContext.has_any_run;
    // Overview always renders the 3 desk rows, so data loading must stay aligned.
    const showS2 = true;
    const showTf = true;
    const dwScope =
        run?.strategy_id === "damping_wave" ? run?.scope : defaultScope;
    const dwScopeLabel =
        typeof dwScope === "string" ? dwScope : dwScope?.scope ?? defaultScope.scope;
    const overviewSeedRunId = deskRunContext.seed_run_id ?? null;
    const state = useOverviewLanes({
        overviewSeedRunId,
        commissionView,
        selectedEpoch: selectedEpoch ?? null,
        hasAnyRun,
        showS2,
        showTf,
    });
    const {
        systemStatus, strategyStatuses,
        s2Summary, tfSummary,
        dwEpochStats, s2EpochStats, tfEpochStats,
        portfolioRun, equityCurveData,
        loading, s2Loading, tfLoading, equityCurveLoading,
        error, s2Error, tfError, portfolioError, laneMeta,
    } = state;
    const [expandedPanel, setExpandedPanel] = useState<ExpandedOverviewPanel | null>(null);

    useEffect(() => {
        if (!expandedPanel) {
            return;
        }
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setExpandedPanel(null);
            }
        };
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        window.addEventListener("keydown", onKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [expandedPanel]);

    const openExpandedPanel = useCallback((panel: ExpandedOverviewPanel) => {
        setExpandedPanel(panel);
    }, []);
    const closeExpandedPanel = useCallback(() => {
        setExpandedPanel(null);
    }, []);
    const tradesCount = dwEpochStats?.tradeCount ?? 0;
    const hasTrades = tradesCount > 0;
    const s2TradesCount = s2EpochStats?.tradeCount ?? 0;
    const tfTradesCount = tfEpochStats?.tradeCount ?? 0;

    const dwRuntime = useMemo(
        () =>
            strategyStatuses.find((item) => item.strategy_id === "damping_wave") ??
            null,
        [strategyStatuses]
    );

    const dwSystemLine: SystemSnapshot = useMemo(() => {
        if (!dwRunIdEffective) {
            return {
                verdict: "NO DATA",
                tone: "neutral",
                line: `NO RUN · select a run to unlock data (${invalidReason || "no run"})`,
            };
        }
        if (!systemStatus) {
            if (loading) {
                return {
                    verdict: "SYNCING",
                    tone: "neutral",
                    line: `DAMPING_WAVE · EURUSD · SCOPE:${dwScopeLabel || "TODAY"} · STATUS:SYNCING`,
                };
            }
            return {
                verdict: "NO DATA",
                tone: "neutral",
                line: `DAMPING_WAVE · EURUSD · SCOPE:${dwScopeLabel || "TODAY"} · STATUS:NO DATA`,
            };
        }

        const gateway = resolveGateway(systemStatus);
        const warmupComplete =
            systemStatus.warmup?.warmup_complete ??
            systemStatus.warmup_ready ??
            systemStatus.warmup_pct === 1;
        const blocked =
            systemStatus.trading_blocked ||
            systemStatus.kill_switch ||
            systemStatus.close_all ||
            systemStatus.autostart_disabled;

        const marketOpen =
            systemStatus.market_open ?? systemStatus.block_reason !== "MARKET_CLOSED";
        const bid = systemStatus.bid ?? systemStatus.price?.bid ?? null;
        const ask = systemStatus.ask ?? systemStatus.price?.ask ?? null;
        const quotesValid = bid !== -1 && ask !== -1 && bid != null && ask != null;
        const tickAgeSeconds = systemStatus.tick_age_seconds ?? null;
        const stale = tickAgeSeconds != null && tickAgeSeconds >= 5;

        let verdict: Verdict = "READY";
        if (!gateway || blocked) {
            verdict = "HALTED";
        } else if (marketOpen === false) {
            verdict = "OFF MARKET";
        } else if (!quotesValid) {
            verdict = "DEGRADED";
        } else if (stale || systemStatus.data_fresh === false) {
            verdict = "FROZEN";
        } else if (!warmupComplete) {
            verdict = "WARMUP";
        }

        const parts = [
            "DAMPING_WAVE",
            "EURUSD",
            `SCOPE:${dwScopeLabel || "TODAY"}`,
            `STATUS:${verdict}`,
        ];

        return {
            verdict,
            tone: verdictTone(verdict),
            line: parts.join(" · "),
        };
    }, [
        dwRunIdEffective,
        run,
        systemStatus,
        invalidReason,
        dwScopeLabel,
    ]);

    const s2Runtime = useMemo(
        () =>
            strategyStatuses.find((item) => item.strategy_id === "s2_pairs_trading") ??
            null,
        [strategyStatuses]
    );
    const tfRuntime = useMemo(
        () =>
            strategyStatuses.find((item) => item.strategy_id === "tf_pullback_v1") ??
            null,
        [strategyStatuses]
    );

    const warmupBars =
        systemStatus?.warmup?.bars_current ?? systemStatus?.warmup_bars ?? null;
    const warmupTarget = systemStatus?.warmup?.bars_required ?? null;
    const warmupPct =
        systemStatus?.warmup?.warmup_pct ??
        (warmupBars !== null && warmupTarget
            ? Math.min(1, warmupBars / warmupTarget)
            : null);
    const warmupLabel =
        warmupBars !== null
            ? `${warmupBars}${warmupTarget ? `/${warmupTarget}` : ""}`
            : systemStatus?.warmup_ready
                ? "READY"
                : "n/a";
    const spreadPips =
        systemStatus?.spread_pips ?? systemStatus?.price?.spread_pips ?? null;

    const s2WarmupTarget = s2Summary?.config?.min_warmup ?? null;
    const s2RuntimeWarmupState = resolveRuntimeWarmupState(s2Runtime);
    const s2RuntimeWarmupLabel = resolveRuntimeWarmupLabel(s2Runtime);
    const s2RuntimeWarmupPct = resolveRuntimeWarmupProgress(s2Runtime);
    const tfRuntimeWarmupState = resolveRuntimeWarmupState(tfRuntime);
    const tfRuntimeWarmupLabel = resolveRuntimeWarmupLabel(tfRuntime);
    const tfRuntimeWarmupPct = resolveRuntimeWarmupProgress(tfRuntime);
    const s2WarmupCount = s2Summary?.counts?.total ?? null;
    const s2WarmupPct =
        s2Summary?.warmup_state?.toUpperCase().includes("READY")
            ? 1
            : s2WarmupTarget && s2WarmupCount !== null
                ? Math.min(1, s2WarmupCount / s2WarmupTarget)
                : s2RuntimeWarmupPct;
    const s2LastZ = s2Summary?.last_signal?.z_score ?? null;

    const portfolioEquity = portfolioRun?.equity ?? null;
    const portfolioPnl = portfolioRun?.pnl_epoch ?? null;
    const portfolioWeek = portfolioRun?.pnl_7d ?? null;
    const portfolioMonth = portfolioRun?.pnl_30d ?? null;
    const portfolioTrades30d = portfolioRun?.trades_30d ?? null;
    const dwSharpe =
        dwEpochStats && dwEpochStats.tradeCount > 0
            ? dwEpochStats.sharpe
            : null;
    const s2Sharpe =
        s2EpochStats && s2EpochStats.tradeCount > 0
            ? s2EpochStats.sharpe
            : null;
    const tfSharpe =
        tfEpochStats && tfEpochStats.tradeCount > 0
            ? tfEpochStats.sharpe
            : null;
    const s2ScopeLabel = defaultScope.scope.toUpperCase();
    const s2SystemLine: SystemSnapshot = useMemo(() => {
        const pairKey = resolveS2Pair(s2Summary);
        let verdict: Verdict = "NO DATA";
        if (!s2Summary && s2RuntimeWarmupState) {
            verdict = s2RuntimeWarmupState;
        } else if (!s2Summary && s2Loading) {
            verdict = "SYNCING";
        } else if (s2Summary) {
            verdict = s2Summary.warmup_state
                ?.toUpperCase()
                .includes("READY")
                ? "READY"
                : "WARMUP";
        }
        return {
            verdict,
            tone: verdictTone(verdict),
            line: `S2_PAIRS_TRADING · ${pairKey} · SCOPE:${s2ScopeLabel} · STATUS:${verdict}`,
        };
    }, [s2Loading, s2RuntimeWarmupState, s2ScopeLabel, s2Summary]);
    const tfSystemLine: SystemSnapshot = useMemo(() => {
        const verdict: Verdict = !tfSummary && tfRuntimeWarmupState
            ? tfRuntimeWarmupState
            : !tfSummary && tfLoading
                ? "SYNCING"
                : tfSummary?.warmup_state
                ?.toUpperCase()
                .includes("READY")
                ? "READY"
                : tfSummary
                    ? "WARMUP"
                    : "NO DATA";
        return {
            verdict,
            tone: verdictTone(verdict),
            line: `TF_PULLBACK_V1 · EURUSD · SCOPE:${defaultScope.scope} · STATUS:${verdict}`,
        };
    }, [defaultScope.scope, tfLoading, tfRuntimeWarmupState, tfSummary]);
    const totalOpenPositions = useMemo(
        () =>
            strategyStatuses.reduce(
                (sum, item) =>
                    sum + (Number.isFinite(item.open_positions) ? item.open_positions : 0),
                0
            ),
        [strategyStatuses]
    );
    const totalTradeCount = tradesCount + s2TradesCount + tfTradesCount;
    const deskVerdict: SystemSnapshot = useMemo(() => {
        if (!hasAnyRun) {
            return {
                verdict: "NO DATA",
                tone: "neutral",
                line: "Aucun run resolu pour alimenter l'Overview",
            };
        }
        if (
            dwSystemLine.verdict === "HALTED" ||
            strategyStatuses.some((row) => row.service_active === false)
        ) {
            return {
                verdict: "HALTED",
                tone: "bad",
                line: "Au moins un service critique est indisponible",
            };
        }
        if (
            dwSystemLine.verdict === "DEGRADED" ||
            dwSystemLine.verdict === "FROZEN"
        ) {
            return {
                verdict: "DEGRADED",
                tone: "warn",
                line: "Fraicheur des quotes ou qualite du flux sous surveillance",
            };
        }
        if (
            dwSystemLine.verdict === "WARMUP" ||
            s2RuntimeWarmupState === "WARMUP" ||
            tfRuntimeWarmupState === "WARMUP"
        ) {
            return {
                verdict: "WARMUP",
                tone: "neutral",
                line: "Au moins une strategie reste en phase de chauffe",
            };
        }
        return {
            verdict: "READY",
            tone: "good",
            line: "Lecture desk stable sur les 3 strategies actives",
        };
    }, [
        dwSystemLine.verdict,
        hasAnyRun,
        s2RuntimeWarmupState,
        strategyStatuses,
        tfRuntimeWarmupState,
    ]);
    const strategyDeskRows = useMemo<StrategyDeskRow[]>(
        () => [
            {
                id: "damping_wave",
                label: "S1",
                subtitle: "Market Maker",
                verdict: dwSystemLine.verdict,
                tone: dwSystemLine.tone,
                runId: dwRuntime?.run_id ?? dwRunIdEffective ?? null,
                service: dwRuntime?.owner_service ?? dwRuntime?.service ?? null,
                openPositions: dwRuntime?.open_positions ?? 0,
                tradeCount: tradesCount,
                pnlUsd: dwEpochStats?.tradeCount ? dwEpochStats.cumulativePnL : null,
                sharpe: dwSharpe,
                warmupLabel,
                warmupPct,
                lastSignalTs: dwRuntime?.last_signal_ts ?? null,
                primaryMetricLabel: "Shocks / Signals",
                primaryMetricValue: `${shockStats?.total_shocks ?? 0} / ${signalStats?.total_signals ?? 0}`,
                secondaryMetricLabel: "Win rate",
                secondaryMetricValue: hasTrades ? formatPercent(dwEpochStats?.winRate, 0) : "n/a",
                error,
            },
            {
                id: "s2_pairs_trading",
                label: "S2",
                subtitle: "Microstructure Lens",
                verdict: s2SystemLine.verdict,
                tone: s2SystemLine.tone,
                runId: s2Runtime?.run_id ?? s2RunIdEffective ?? null,
                service: s2Runtime?.owner_service ?? s2Runtime?.service ?? null,
                openPositions: s2Runtime?.open_positions ?? 0,
                tradeCount: s2TradesCount,
                pnlUsd: s2EpochStats?.tradeCount ? s2EpochStats.cumulativePnL : null,
                sharpe: s2Sharpe,
                warmupLabel: s2Summary?.warmup_state ?? s2RuntimeWarmupLabel ?? "n/a",
                warmupPct: s2WarmupPct,
                lastSignalTs: s2Runtime?.last_signal_ts ?? null,
                primaryMetricLabel: "Accepted / Total",
                primaryMetricValue: `${s2Summary?.counts?.accepted ?? 0} / ${s2Summary?.counts?.total ?? 0}`,
                secondaryMetricLabel: "Last Z",
                secondaryMetricValue:
                    s2LastZ !== null && s2LastZ !== undefined ? s2LastZ.toFixed(2) : "n/a",
                error: s2Error,
            },
            {
                id: "tf_pullback_v1",
                label: "S3",
                subtitle: "Trend Lens",
                verdict: tfSystemLine.verdict,
                tone: tfSystemLine.tone,
                runId: tfRuntime?.run_id ?? tfRunIdEffective ?? null,
                service: tfRuntime?.owner_service ?? tfRuntime?.service ?? null,
                openPositions: tfRuntime?.open_positions ?? 0,
                tradeCount: tfTradesCount,
                pnlUsd: tfEpochStats?.tradeCount ? tfEpochStats.cumulativePnL : null,
                sharpe: tfSharpe,
                warmupLabel: tfSummary?.warmup_state ?? tfRuntimeWarmupLabel ?? "n/a",
                warmupPct: tfRuntimeWarmupPct,
                lastSignalTs: tfRuntime?.last_signal_ts ?? null,
                primaryMetricLabel: "Accepted / Total",
                primaryMetricValue: `${tfSummary?.counts?.accepted ?? 0} / ${tfSummary?.counts?.total ?? 0}`,
                secondaryMetricLabel: "Last dir",
                secondaryMetricValue: tfSummary?.last_signal?.direction ?? "n/a",
                error: tfError,
            },
        ],
        [
            dwEpochStats?.winRate,
            dwRunIdEffective,
            dwRuntime?.last_signal_ts,
            dwRuntime?.open_positions,
            dwRuntime?.owner_service,
            dwRuntime?.run_id,
            dwRuntime?.service,
            dwSharpe,
            dwSystemLine.tone,
            dwSystemLine.verdict,
            error,
            hasTrades,
            dwEpochStats?.cumulativePnL,
            s2EpochStats?.cumulativePnL,
            s2EpochStats?.tradeCount,
            s2Error,
            s2LastZ,
            s2RunIdEffective,
            s2Runtime?.last_signal_ts,
            s2Runtime?.open_positions,
            s2Runtime?.owner_service,
            s2Runtime?.run_id,
            s2Runtime?.service,
            s2Sharpe,
            s2Summary?.counts?.accepted,
            s2Summary?.counts?.total,
            s2Summary?.warmup_state,
            s2SystemLine.tone,
            s2SystemLine.verdict,
            s2TradesCount,
            s2WarmupPct,
            s2RuntimeWarmupLabel,
            shockStats?.total_shocks,
            signalStats?.total_signals,
            tfEpochStats?.cumulativePnL,
            tfEpochStats?.tradeCount,
            tfError,
            tfRunIdEffective,
            tfRuntime?.last_signal_ts,
            tfRuntime?.open_positions,
            tfRuntime?.owner_service,
            tfRuntime?.run_id,
            tfRuntime?.service,
            tfSharpe,
            tfSummary?.counts?.accepted,
            tfSummary?.counts?.total,
            tfSummary?.last_signal?.direction,
            tfSummary?.warmup_state,
            tfSystemLine.tone,
            tfSystemLine.verdict,
            tfTradesCount,
            tfRuntimeWarmupLabel,
            tfRuntimeWarmupPct,
            tradesCount,
            warmupLabel,
            warmupPct,
        ]
    );
    const expandedStrategyId =
        expandedPanel?.startsWith("strategy:")
            ? (expandedPanel.slice("strategy:".length) as StrategyDeskRow["id"])
            : null;
    const expandedStrategyRow = useMemo(
        () =>
            expandedStrategyId
                ? strategyDeskRows.find((row) => row.id === expandedStrategyId) ?? null
                : null,
        [expandedStrategyId, strategyDeskRows]
    );
    const selectedRunLabel = formatCompactRunId(runId);
    const selectedStrategyLabel = run?.strategy_id ?? "bundle";
    const selectedScopeLabel =
        typeof run?.scope === "string"
            ? run.scope
            : ((run?.scope as { scope?: string } | null | undefined)?.scope ??
                defaultScope.scope);
    const spreadTone: Tone =
        spreadPips !== null &&
        (systemStatus?.max_spread_pips ?? null) !== null &&
        systemStatus?.max_spread_pips !== undefined &&
        spreadPips > (systemStatus?.max_spread_pips ?? 0)
            ? "warn"
            : "neutral";
    const runPipelineSignalRate =
        shockStats?.total_shocks && shockStats.total_shocks > 0 && signalStats?.total_signals
            ? signalStats.total_signals / shockStats.total_shocks
            : null;
    const deskPrimaryKpis: OverviewKpi[] = [
        {
            label: "Equity desk",
            value:
                portfolioEquity !== null
                    ? formatUsd(portfolioEquity, { showPlus: false })
                    : "n/a",
            tone: "neutral",
            mono: true,
        },
        {
            label: "PnL epoch",
            value: formatUsd(portfolioPnl),
            tone: toneFromPnL(portfolioPnl),
            mono: true,
        },
        {
            label: "Open positions",
            value: totalOpenPositions,
            tone: totalOpenPositions > 0 ? "warn" : "neutral",
        },
        {
            label: "Closed trades",
            value: totalTradeCount,
            tone: "neutral",
        },
    ];
    const deskExecutionRows = [
        {
            label: "Commission",
            value: portfolioRun?.commission_view ?? commissionView,
            tone: "neutral" as Tone,
        },
        {
            label: "Signal rate",
            value:
                runPipelineSignalRate !== null
                    ? formatPercent(runPipelineSignalRate, 0)
                    : "n/a",
            tone: "neutral" as Tone,
        },
        {
            label: "Spread",
            value: spreadPips !== null ? `${spreadPips.toFixed(2)}p` : "n/a",
            tone: spreadTone,
        },
        {
            label: "Tick age",
            value: formatTickAgeSeconds(systemStatus?.tick_age_seconds),
            tone:
                (systemStatus?.tick_age_seconds ?? 0) > 90
                    ? "bad"
                    : "neutral",
        },
    ];
    const deskContextItems: CompactMetaItem[] = [
        { label: "Run", value: selectedRunLabel, mono: true },
        { label: "Strategie", value: selectedStrategyLabel, mono: true },
        { label: "Scope", value: selectedScopeLabel, mono: true },
        {
            label: "Epoch",
            value: String(portfolioRun?.epoch ?? selectedEpoch ?? "n/a"),
            mono: true,
        },
    ];
    const laneHealthItems: CompactMetaItem[] = [
        {
            label: "Runtime",
            value: `${laneMeta.runtime.cacheHit === null ? "n/a" : laneMeta.runtime.cacheHit ? "hit" : "miss"} · ${laneMeta.runtime.queryMs !== null ? `${laneMeta.runtime.queryMs.toFixed(0)}ms` : "n/a"} · ${formatAgeFromUtc(laneMeta.runtime.generatedAtUtc)}`,
            tone:
                laneMeta.runtime.cacheHit === true
                    ? "good"
                    : laneMeta.runtime.cacheHit === false
                        ? "warn"
                        : "neutral",
            mono: true,
        },
        {
            label: "Portfolio",
            value: `${laneMeta.portfolio.cacheHit === null ? "n/a" : laneMeta.portfolio.cacheHit ? "hit" : "miss"} · ${laneMeta.portfolio.queryMs !== null ? `${laneMeta.portfolio.queryMs.toFixed(0)}ms` : "n/a"} · ${formatAgeFromUtc(laneMeta.portfolio.generatedAtUtc)}`,
            tone:
                laneMeta.portfolio.cacheHit === true
                    ? "good"
                    : laneMeta.portfolio.cacheHit === false
                        ? "warn"
                        : "neutral",
            mono: true,
        },
        {
            label: "Summaries",
            value: `${laneMeta.summaries.cacheHit === null ? "n/a" : laneMeta.summaries.cacheHit ? "hit" : "miss"} · ${laneMeta.summaries.queryMs !== null ? `${laneMeta.summaries.queryMs.toFixed(0)}ms` : "n/a"} · ${formatAgeFromUtc(laneMeta.summaries.generatedAtUtc)}`,
            tone:
                laneMeta.summaries.cacheHit === true
                    ? "good"
                    : laneMeta.summaries.cacheHit === false
                        ? "warn"
                        : "neutral",
            mono: true,
        },
    ];

    if (!hasAnyRun && !runLoading && !hasDataRef.current) {
        return (
            <div className="relative w-full min-h-full bg-[#070A10] text-neutral-100 font-sans">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute -top-48 left-[-10%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.14),transparent_60%)] ambient-float" />
                    <div className="absolute -bottom-48 right-[-10%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(34,197,94,0.12),transparent_60%)] ambient-float--slow" />
                </div>
                <div className="relative w-full max-w-none px-4 md:px-6 xl:px-10 2xl:px-14 py-8">
                    <div className="glass-panel p-6 animate-fade-up">
                        <div className="text-sm text-neutral-300">
                            Run non résolu ({invalidReason || "unknown"}). Sélectionnez
                            un run pour afficher le cockpit.
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full min-h-full bg-[#070A10] text-neutral-100 font-sans xl:h-[calc(100dvh-8rem)] xl:min-h-0 xl:overflow-hidden">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-48 left-[-10%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.16),transparent_60%)] ambient-float" />
                <div className="absolute -bottom-48 right-[-10%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(34,197,94,0.14),transparent_60%)] ambient-float--slow" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.03),transparent_45%)] ambient-shimmer" />
            </div>
            <div className="relative w-full max-w-none px-2 sm:px-4 md:px-6 xl:px-8 2xl:px-10 py-4 sm:py-6 xl:h-full xl:min-h-0 xl:overflow-hidden">
                <div className="space-y-4 sm:space-y-5 xl:grid xl:h-full xl:min-h-0 xl:grid-rows-[minmax(0,0.97fr)_minmax(0,1.03fr)] xl:gap-4 xl:space-y-0">
                <div className="grid gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[1.3fr_0.9fr]">
                    <BentoCard
                        title="Desk Pulse"
                        subtitle="Vue run-aware compacte pour lecture instantanee"
                        delayMs={60}
                        className="xl:h-full xl:min-h-0"
                        onExpand={() => openExpandedPanel("desk")}
                    >
                        <div className="flex h-full min-h-0 flex-col gap-3 xl:gap-2">
                            <div className="flex flex-col gap-2 xl:gap-1.5 lg:flex-row lg:items-end lg:justify-between">
                                <div className="space-y-1.5">
                                    <div className="text-[11px] uppercase tracking-[0.26em] text-cyan-200/80">
                                        Overview
                                    </div>
                                    <div className="text-xl font-semibold leading-tight text-white xl:text-lg 2xl:text-xl">
                                        {deskVerdict.line}
                                    </div>
                                    <div className={`text-[12px] leading-relaxed xl:text-[11px] ${toneTextClass(deskVerdict.tone)}`}>
                                        {dwSystemLine.line}
                                    </div>
                                </div>
                                <StatusBadge verdict={deskVerdict.verdict} tone={deskVerdict.tone} />
                            </div>
                            <div className="grid gap-2 xl:gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
                                {deskPrimaryKpis.map((kpi) => (
                                    <StatPill
                                        key={kpi.label}
                                        label={kpi.label}
                                        value={kpi.value}
                                        tone={kpi.tone}
                                        mono={kpi.mono}
                                        progress={kpi.progress}
                                    />
                                ))}
                            </div>
                            <div className="grid gap-3 xl:gap-2 xl:grid-cols-[0.95fr_1.05fr]">
                                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 xl:p-2.5">
                                    <div className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">
                                        Contexte selectionne
                                    </div>
                                    <div className="mt-3 grid gap-2 xl:mt-2 xl:gap-1.5 sm:grid-cols-2">
                                        {deskContextItems.map((item) => (
                                            <CompactMetaTile
                                                key={item.label}
                                                label={item.label}
                                                value={item.value}
                                                tone={item.tone}
                                                mono={item.mono}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 xl:p-2.5">
                                    <div className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">
                                        Execution quality
                                    </div>
                                    <div className="mt-3 grid gap-2 xl:mt-2 xl:gap-1.5 sm:grid-cols-2">
                                        {deskExecutionRows.map((row) => (
                                            <CompactMetaTile
                                                key={row.label}
                                                label={row.label}
                                                value={row.value}
                                                tone={row.tone}
                                                mono
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 xl:p-2.5">
                                <div className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">
                                    Lane health
                                </div>
                                <div className="mt-3 grid gap-2 xl:mt-2 xl:gap-1.5 sm:grid-cols-3">
                                    {laneHealthItems.map((item) => (
                                        <CompactMetaTile
                                            key={item.label}
                                            label={item.label}
                                            value={item.value}
                                            tone={item.tone}
                                            mono={item.mono}
                                        />
                                    ))}
                                </div>
                            </div>
                            {portfolioError && <div className="text-[11px] text-rose-300">{portfolioError}</div>}
                        </div>
                    </BentoCard>

                    <BentoCard
                        title="Live State"
                        subtitle="Etat runtime des 3 strategies proprietaires"
                        delayMs={100}
                        className="xl:h-full xl:min-h-0"
                    >
                        <div className="grid gap-3 xl:h-full xl:min-h-0 xl:grid-rows-3 xl:gap-2">
                            {strategyDeskRows.map((row) => (
                                <div
                                    key={row.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => openExpandedPanel(toStrategyPanelId(row.id))}
                                    onKeyDown={(event) => {
                                        if (isActivationKey(event)) {
                                            event.preventDefault();
                                            openExpandedPanel(toStrategyPanelId(row.id));
                                        }
                                    }}
                                    className="flex min-h-[268px] flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/20 hover:bg-white/[0.045] cursor-zoom-in xl:min-h-0 xl:overflow-hidden xl:p-2.5"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">
                                                {row.label}
                                            </div>
                                            <div className="mt-1 text-[15px] font-semibold text-white xl:text-[14px]">
                                                {row.subtitle}
                                            </div>
                                            <div className="mt-2 flex flex-wrap items-center gap-1.5 xl:mt-1.5 xl:gap-1 text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                                                <span className="rounded-full border border-white/10 px-2 py-0.5">
                                                    {row.id === "s2_pairs_trading"
                                                        ? resolveS2Pair(s2Summary)
                                                        : "EURUSD"}
                                                </span>
                                                <span className="rounded-full border border-white/10 px-2 py-0.5">
                                                    Scope {row.id === "s2_pairs_trading"
                                                        ? s2ScopeLabel
                                                        : defaultScope.scope.toUpperCase()}
                                                </span>
                                                <span className={`rounded-full border px-2 py-0.5 ${tonePillClass(row.tone)}`}>
                                                    {row.verdict}
                                                </span>
                                            </div>
                                        </div>
                                        <StatusBadge verdict={row.verdict} tone={row.tone} />
                                    </div>
                                    <div className="mt-3 grid gap-2 xl:mt-2 xl:gap-1.5 xl:grid-cols-3">
                                        <MiniInfoCard label="Run" value={formatCompactRunId(row.runId)} />
                                        <MiniInfoCard label="Service" value={row.service ?? "n/a"} />
                                        <MiniInfoCard label="Warmup" value={row.warmupLabel ?? "n/a"} />
                                    </div>
                                    <div className="mt-3 grid gap-2 xl:mt-2 xl:gap-1.5 sm:grid-cols-3">
                                        <StatPill
                                            label="Open"
                                            value={row.openPositions}
                                            tone={row.openPositions > 0 ? "warn" : "neutral"}
                                        />
                                        <StatPill label="Trades" value={row.tradeCount} tone="neutral" />
                                        <StatPill
                                            label="PnL"
                                            value={formatUsd(row.pnlUsd)}
                                            tone={toneFromPnL(row.pnlUsd)}
                                            mono
                                        />
                                    </div>
                                    {row.warmupPct !== null && (
                                        <div className="mt-3 xl:mt-2 progress-track">
                                            <div
                                                className={`progress-fill progress-fill--${row.tone}`}
                                                style={{
                                                    width: `${Math.max(4, row.warmupPct * 100)}%`,
                                                }}
                                            />
                                        </div>
                                    )}
                                    {row.error && <div className="mt-2 text-[11px] text-rose-300">{row.error}</div>}
                                </div>
                            ))}
                        </div>
                    </BentoCard>
                </div>

                <div className="grid gap-4 xl:h-full xl:min-h-0 xl:grid-cols-[1.35fr_0.85fr]">
                    <BentoCard
                        title="Portfolio Curve"
                        subtitle={`Epoch ${portfolioRun?.epoch ?? selectedEpoch ?? "n/a"} · equity agregee`}
                        delayMs={140}
                        className="xl:h-full xl:min-h-0"
                        onExpand={() => openExpandedPanel("portfolio_curve")}
                    >
                        <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden xl:gap-2">
                            <div className="grid gap-2 xl:gap-1.5 sm:grid-cols-4">
                                <StatPill
                                    label="Equity"
                                    value={
                                        portfolioEquity !== null
                                            ? formatUsd(portfolioEquity, { showPlus: false })
                                            : "n/a"
                                    }
                                    tone="neutral"
                                    mono
                                />
                                <StatPill
                                    label="PnL epoch"
                                    value={formatUsd(portfolioPnl)}
                                    tone={toneFromPnL(portfolioPnl)}
                                    mono
                                />
                                <StatPill
                                    label="Trades 30j"
                                    value={portfolioTrades30d ?? "n/a"}
                                    tone="neutral"
                                />
                                <StatPill
                                    label="Last exit"
                                    value={formatDateTimeUTC(portfolioRun?.last_exit_ts)}
                                    tone="neutral"
                                />
                            </div>
                            <div className="min-h-[280px] flex-1 xl:min-h-[220px]">
                                {!equityCurveLoading && equityCurveData && equityCurveData.equity_curve.length > 0 && (
                                    <EquityCurveChart
                                        equityCurve={equityCurveData.equity_curve}
                                        startingEquity={equityCurveData.starting_equity}
                                        height="100%"
                                    />
                                )}
                                {(!equityCurveData || equityCurveData.equity_curve.length === 0) && (
                                    <div className="flex h-full min-h-[260px] items-center justify-center rounded-2xl border border-dashed border-white/10 text-[11px] text-neutral-500">
                                        {equityCurveLoading
                                            ? "Courbe en synchronisation"
                                            : "Aucune donnee pour la courbe d'equite."}
                                    </div>
                                )}
                            </div>
                        </div>
                    </BentoCard>

                    <BentoCard
                        title="Strategy Health"
                        subtitle="Lecture compacte par strategie: cadence, PnL, qualite"
                        delayMs={180}
                        className="xl:h-full xl:min-h-0"
                    >
                        <div className="grid gap-3 xl:h-full xl:min-h-0 xl:grid-rows-3 xl:gap-2">
                            {strategyDeskRows.map((row) => (
                                <div
                                    key={`${row.id}-health`}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => openExpandedPanel(toStrategyPanelId(row.id))}
                                    onKeyDown={(event) => {
                                        if (isActivationKey(event)) {
                                            event.preventDefault();
                                            openExpandedPanel(toStrategyPanelId(row.id));
                                        }
                                    }}
                                    className="flex min-h-[224px] flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/20 hover:bg-white/[0.045] cursor-zoom-in xl:min-h-0 xl:overflow-hidden xl:p-2.5"
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-[11px] font-semibold tracking-[0.24em] text-neutral-200">
                                                {row.label}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-[14px] font-semibold leading-snug text-white break-words [overflow-wrap:anywhere] xl:text-[13px]">
                                                    {row.subtitle}
                                                </div>
                                                <div className="text-[11px] leading-snug text-neutral-500 break-words xl:text-[10px]">
                                                    {row.primaryMetricLabel}
                                                </div>
                                            </div>
                                        </div>
                                        <div className={`text-[14px] font-mono xl:text-[13px] ${toneTextClass(toneFromPnL(row.pnlUsd))}`}>
                                            {formatUsd(row.pnlUsd)}
                                        </div>
                                    </div>
                                    <div className="mt-3 grid gap-2 xl:mt-2 xl:gap-1.5 sm:grid-cols-3">
                                        <StatPill
                                            label={row.primaryMetricLabel}
                                            value={row.primaryMetricValue}
                                            tone="neutral"
                                        />
                                        <StatPill
                                            label={row.secondaryMetricLabel}
                                            value={row.secondaryMetricValue}
                                            tone={row.tone}
                                        />
                                        <StatPill
                                            label="Warmup"
                                            value={row.warmupLabel ?? "n/a"}
                                            tone={row.verdict === "READY" ? "good" : "warn"}
                                            progress={row.warmupPct}
                                        />
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-1 text-[11px] text-neutral-500 xl:text-[10px]">
                                        <span className="break-words [overflow-wrap:anywhere]">
                                            Run <span className="font-mono text-neutral-300">{formatCompactRunId(row.runId)}</span>
                                        </span>
                                        <span className="break-words">
                                            Sharpe <span className="font-mono text-neutral-300">
                                                {row.sharpe !== null ? row.sharpe.toFixed(2) : "n/a"}
                                            </span>
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </BentoCard>
                </div>
                </div>
            </div>
            {expandedPanel && (
                <ExpandedPanelOverlay
                    title={
                        expandedPanel === "desk"
                            ? "Desk Pulse"
                            : expandedPanel === "portfolio_curve"
                                ? "Portfolio Curve"
                                : expandedStrategyRow?.subtitle ?? "Strategy Detail"
                    }
                    subtitle={
                        expandedPanel === "desk"
                            ? "Vue detaillee des KPI desk et du contexte run-aware"
                            : expandedPanel === "portfolio_curve"
                                ? "Courbe d'equite desk-level en mode agrandi"
                                : expandedStrategyRow
                                    ? `${expandedStrategyRow.label} · ${expandedStrategyRow.verdict} · ${formatCompactRunId(expandedStrategyRow.runId)}`
                                    : "Detail runtime"
                    }
                    onClose={closeExpandedPanel}
                >
                    {expandedPanel === "desk" && (
                        <div className="grid gap-4 xl:grid-cols-[1.18fr_0.82fr]">
                            <div className="space-y-4">
                                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="space-y-1.5">
                                            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-200/80">
                                                Desk Verdict
                                            </div>
                                            <div className="text-[24px] font-semibold text-white">
                                                {deskVerdict.line}
                                            </div>
                                            <div className={`text-[12px] ${toneTextClass(dwSystemLine.tone)}`}>
                                                {dwSystemLine.line}
                                            </div>
                                        </div>
                                        <StatusBadge verdict={deskVerdict.verdict} tone={deskVerdict.tone} />
                                    </div>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                    <StatPill
                                        label="Equity desk"
                                        value={
                                            portfolioEquity !== null
                                                ? formatUsd(portfolioEquity, { showPlus: false })
                                                : "n/a"
                                        }
                                        tone="neutral"
                                        mono
                                    />
                                    <StatPill
                                        label="PnL epoch"
                                        value={formatUsd(portfolioPnl)}
                                        tone={toneFromPnL(portfolioPnl)}
                                        mono
                                    />
                                    <StatPill
                                        label="Open positions"
                                        value={totalOpenPositions}
                                        tone={totalOpenPositions > 0 ? "warn" : "neutral"}
                                    />
                                    <StatPill
                                        label="Closed trades"
                                        value={totalTradeCount}
                                        tone="neutral"
                                    />
                                    <StatPill
                                        label="Spread"
                                        value={spreadPips !== null ? `${spreadPips.toFixed(2)}p` : "n/a"}
                                        tone={spreadTone}
                                    />
                                    <StatPill
                                        label="Tick age"
                                        value={formatTickAgeSeconds(systemStatus?.tick_age_seconds)}
                                        tone={
                                            (systemStatus?.tick_age_seconds ?? 0) > 90 ? "bad" : "neutral"
                                        }
                                    />
                                    <StatPill
                                        label="PnL 7j"
                                        value={formatUsd(portfolioWeek)}
                                        tone={toneFromPnL(portfolioWeek)}
                                        mono
                                    />
                                    <StatPill
                                        label="PnL 30j"
                                        value={formatUsd(portfolioMonth)}
                                        tone={toneFromPnL(portfolioMonth)}
                                        mono
                                    />
                                </div>
                            </div>
                            <div className="grid gap-4">
                                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                                    <div className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">
                                        Contexte selectionne
                                    </div>
                                    <div className="mt-3 space-y-2">
                                        <ContextRow label="Run" value={selectedRunLabel} />
                                        <ContextRow label="Strategie" value={selectedStrategyLabel} />
                                        <ContextRow label="Scope" value={selectedScopeLabel} />
                                        <ContextRow
                                            label="Epoch"
                                            value={String(portfolioRun?.epoch ?? selectedEpoch ?? "n/a")}
                                        />
                                        <ContextRow
                                            label="Dernier exit"
                                            value={formatDateTimeUTC(portfolioRun?.last_exit_ts)}
                                        />
                                    </div>
                                </div>
                                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                                    <div className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">
                                        Execution quality
                                    </div>
                                    <div className="mt-3 space-y-2">
                                        <PipelineRow
                                            label="Commission"
                                            value={portfolioRun?.commission_view ?? commissionView}
                                        />
                                        <PipelineRow
                                            label="Missing exit"
                                            value={
                                                portfolioRun?.missing_exit_pct != null
                                                    ? `${portfolioRun.missing_exit_pct.toFixed(0)}%`
                                                    : "n/a"
                                            }
                                            tone={
                                                (portfolioRun?.missing_exit_pct ?? 0) > 5 ? "bad" : "neutral"
                                            }
                                        />
                                        <PipelineRow
                                            label="Anomalies"
                                            value={portfolioRun?.anomaly_count ?? "n/a"}
                                            tone={
                                                (portfolioRun?.anomaly_count ?? 0) > 0 ? "bad" : "neutral"
                                            }
                                        />
                                        <PipelineRow
                                            label="Signal rate"
                                            value={
                                                runPipelineSignalRate !== null
                                                    ? formatPercent(runPipelineSignalRate, 0)
                                                    : "n/a"
                                            }
                                        />
                                        <PipelineRow
                                            label="Signals"
                                            value={signalStats?.total_signals ?? "n/a"}
                                        />
                                        <PipelineRow
                                            label="Shocks"
                                            value={shockStats?.total_shocks ?? "n/a"}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {expandedPanel === "portfolio_curve" && (
                        <div className="grid gap-4 xl:grid-cols-[1.45fr_0.75fr]">
                            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4 min-h-[420px] xl:h-[60dvh]">
                                {!equityCurveLoading &&
                                    equityCurveData &&
                                    equityCurveData.equity_curve.length > 0 && (
                                        <EquityCurveChart
                                            equityCurve={equityCurveData.equity_curve}
                                            startingEquity={equityCurveData.starting_equity}
                                            height="100%"
                                        />
                                    )}
                                {(!equityCurveData || equityCurveData.equity_curve.length === 0) && (
                                    <div className="flex h-full items-center justify-center rounded-[20px] border border-dashed border-white/10 text-[12px] text-neutral-500">
                                        {equityCurveLoading
                                            ? "Courbe en synchronisation"
                                            : "Aucune donnee pour la courbe d'equite."}
                                    </div>
                                )}
                            </div>
                            <div className="grid content-start gap-3">
                                <div className="grid gap-2 sm:grid-cols-2">
                                    <StatPill
                                        label="Equity"
                                        value={
                                            portfolioEquity !== null
                                                ? formatUsd(portfolioEquity, { showPlus: false })
                                                : "n/a"
                                        }
                                        tone="neutral"
                                        mono
                                    />
                                    <StatPill
                                        label="PnL epoch"
                                        value={formatUsd(portfolioPnl)}
                                        tone={toneFromPnL(portfolioPnl)}
                                        mono
                                    />
                                    <StatPill
                                        label="Trades 30j"
                                        value={portfolioTrades30d ?? "n/a"}
                                        tone="neutral"
                                    />
                                    <StatPill
                                        label="Last exit"
                                        value={formatDateTimeUTC(portfolioRun?.last_exit_ts)}
                                        tone="neutral"
                                    />
                                </div>
                                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                                    <div className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">
                                        Desk details
                                    </div>
                                    <div className="mt-3 space-y-2">
                                        <PipelineRow
                                            label="Epoch"
                                            value={String(portfolioRun?.epoch ?? selectedEpoch ?? "n/a")}
                                        />
                                        <PipelineRow
                                            label="PnL 7j"
                                            value={formatUsd(portfolioWeek)}
                                            tone={toneFromPnL(portfolioWeek)}
                                        />
                                        <PipelineRow
                                            label="PnL 30j"
                                            value={formatUsd(portfolioMonth)}
                                            tone={toneFromPnL(portfolioMonth)}
                                        />
                                        <PipelineRow
                                            label="Commission"
                                            value={portfolioRun?.commission_view ?? commissionView}
                                        />
                                        <PipelineRow
                                            label="Anomalies"
                                            value={portfolioRun?.anomaly_count ?? "n/a"}
                                            tone={
                                                (portfolioRun?.anomaly_count ?? 0) > 0 ? "bad" : "neutral"
                                            }
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {expandedStrategyRow && (
                        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                            <div className="space-y-4">
                                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="space-y-1.5">
                                            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-200/80">
                                                {expandedStrategyRow.label}
                                            </div>
                                            <div className="text-[24px] font-semibold text-white">
                                                {expandedStrategyRow.subtitle}
                                            </div>
                                            <div className={`text-[12px] ${toneTextClass(expandedStrategyRow.tone)}`}>
                                                {expandedStrategyRow.id === "damping_wave"
                                                    ? dwSystemLine.line
                                                    : expandedStrategyRow.id === "s2_pairs_trading"
                                                        ? s2SystemLine.line
                                                        : tfSystemLine.line}
                                            </div>
                                        </div>
                                        <StatusBadge
                                            verdict={expandedStrategyRow.verdict}
                                            tone={expandedStrategyRow.tone}
                                        />
                                    </div>
                                </div>
                                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                                    <div className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">
                                        Runtime context
                                    </div>
                                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                        <ContextRow
                                            label="Run"
                                            value={formatCompactRunId(expandedStrategyRow.runId)}
                                        />
                                        <ContextRow
                                            label="Service"
                                            value={expandedStrategyRow.service ?? "n/a"}
                                        />
                                        <ContextRow
                                            label="Warmup"
                                            value={expandedStrategyRow.warmupLabel ?? "n/a"}
                                        />
                                        <ContextRow
                                            label="Signal"
                                            value={formatDateTimeUTC(expandedStrategyRow.lastSignalTs)}
                                        />
                                    </div>
                                </div>
                                {expandedStrategyRow.error && (
                                    <div className="rounded-[20px] border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-[12px] text-rose-200">
                                        {expandedStrategyRow.error}
                                    </div>
                                )}
                            </div>
                            <div className="space-y-4">
                                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                    <StatPill
                                        label="Open"
                                        value={expandedStrategyRow.openPositions}
                                        tone={expandedStrategyRow.openPositions > 0 ? "warn" : "neutral"}
                                    />
                                    <StatPill
                                        label="Trades"
                                        value={expandedStrategyRow.tradeCount}
                                        tone="neutral"
                                    />
                                    <StatPill
                                        label="PnL"
                                        value={formatUsd(expandedStrategyRow.pnlUsd)}
                                        tone={toneFromPnL(expandedStrategyRow.pnlUsd)}
                                        mono
                                    />
                                    <StatPill
                                        label="Sharpe"
                                        value={
                                            expandedStrategyRow.sharpe !== null
                                                ? expandedStrategyRow.sharpe.toFixed(2)
                                                : "n/a"
                                        }
                                        tone="neutral"
                                    />
                                </div>
                                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
                                    <div className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">
                                        Detail strategy
                                    </div>
                                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                        <PipelineRow
                                            label={expandedStrategyRow.primaryMetricLabel}
                                            value={expandedStrategyRow.primaryMetricValue}
                                        />
                                        <PipelineRow
                                            label={expandedStrategyRow.secondaryMetricLabel}
                                            value={expandedStrategyRow.secondaryMetricValue}
                                        />
                                        <PipelineRow
                                            label="Verdict"
                                            value={expandedStrategyRow.verdict}
                                            tone={
                                                expandedStrategyRow.verdict === "READY"
                                                    ? "good"
                                                    : expandedStrategyRow.verdict === "HALTED"
                                                        ? "bad"
                                                        : "neutral"
                                            }
                                        />
                                        <PipelineRow
                                            label="Progress"
                                            value={
                                                expandedStrategyRow.warmupPct !== null
                                                    ? formatPercent(expandedStrategyRow.warmupPct, 0)
                                                    : "n/a"
                                            }
                                        />
                                        {expandedStrategyRow.id === "damping_wave" && (
                                            <>
                                                <PipelineRow
                                                    label="Spread"
                                                    value={
                                                        spreadPips !== null
                                                            ? `${spreadPips.toFixed(2)}p`
                                                            : "n/a"
                                                    }
                                                    tone={spreadTone}
                                                />
                                                <PipelineRow
                                                    label="Tick age"
                                                    value={formatTickAgeSeconds(systemStatus?.tick_age_seconds)}
                                                    tone={
                                                        (systemStatus?.tick_age_seconds ?? 0) > 90
                                                            ? "bad"
                                                            : "neutral"
                                                    }
                                                />
                                            </>
                                        )}
                                        {expandedStrategyRow.id === "s2_pairs_trading" && (
                                            <>
                                                <PipelineRow
                                                    label="Pair"
                                                    value={resolveS2Pair(s2Summary)}
                                                />
                                                <PipelineRow
                                                    label="Warmup"
                                                    value={s2RuntimeWarmupLabel ?? "n/a"}
                                                />
                                            </>
                                        )}
                                        {expandedStrategyRow.id === "tf_pullback_v1" && (
                                            <>
                                                <PipelineRow
                                                    label="Direction"
                                                    value={tfSummary?.last_signal?.direction ?? "n/a"}
                                                />
                                                <PipelineRow
                                                    label="Warmup"
                                                    value={tfRuntimeWarmupLabel ?? "n/a"}
                                                />
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </ExpandedPanelOverlay>
            )}
        </div>
    );
}

const StatusBadge = React.memo(function StatusBadge({ verdict, tone }: { verdict: Verdict; tone: Tone }) {
    return (
        <span
            className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.3em] xl:px-2.5 xl:py-0.5 xl:text-[10px] ${tonePillClass(
                tone
            )} pulse-soft`}
        >
            {verdict}
        </span>
    );
});

const BentoCard = React.memo(function BentoCard({
    title,
    subtitle,
    className,
    delayMs,
    onExpand,
    children,
}: {
    title: string;
    subtitle?: string;
    className?: string;
    delayMs?: number;
    onExpand?: () => void;
    children: React.ReactNode;
}) {
    const interactive = Boolean(onExpand);
    return (
        <section
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            onClick={interactive ? onExpand : undefined}
            onKeyDown={
                interactive
                    ? (event) => {
                        if (isActivationKey(event)) {
                            event.preventDefault();
                            onExpand?.();
                        }
                    }
                    : undefined
            }
            className={`glass-panel glass-panel--lift flex min-h-0 flex-col p-4 xl:p-3 animate-fade-up ${interactive
                ? "cursor-zoom-in transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/20 hover:bg-white/[0.045]"
                : ""
                } ${className ? className : ""
                }`.trim()}
            style={delayMs ? { animationDelay: `${delayMs}ms` } : undefined}
        >
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-[11px] uppercase tracking-[0.24em] text-neutral-400">
                        {title}
                    </div>
                    {subtitle && (
                        <div className="text-[12px] text-neutral-500 mt-1">
                            {subtitle}
                        </div>
                    )}
                </div>
                {interactive && (
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            onExpand?.();
                        }}
                        className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-neutral-300 transition hover:border-cyan-300/30 hover:text-white"
                    >
                        Agrandir
                    </button>
                )}
            </div>
            <div className="mt-3 min-h-0 flex-1">{children}</div>
        </section>
    );
});

const ExpandedPanelOverlay = React.memo(function ExpandedPanelOverlay({
    title,
    subtitle,
    onClose,
    children,
}: {
    title: string;
    subtitle?: string;
    onClose: () => void;
    children: React.ReactNode;
}) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#04070d]/72 p-3 sm:p-5 backdrop-blur-xl"
            onClick={onClose}
        >
            <div
                className="w-full max-w-[1480px] overflow-hidden rounded-[32px] border border-white/12 bg-[linear-gradient(180deg,rgba(19,27,38,0.96),rgba(9,14,22,0.92))] shadow-[0_30px_120px_rgba(0,0,0,0.45)]"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4 sm:px-6">
                    <div className="space-y-1">
                        <div className="text-[11px] uppercase tracking-[0.26em] text-cyan-200/80">
                            Expanded View
                        </div>
                        <div className="text-[24px] font-semibold text-white">{title}</div>
                        {subtitle && (
                            <div className="text-[12px] text-neutral-400">{subtitle}</div>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] text-neutral-300 transition hover:border-cyan-300/30 hover:text-white"
                    >
                        Fermer
                    </button>
                </div>
                <div className="max-h-[calc(100dvh-5rem)] overflow-auto px-5 py-5 sm:px-6">
                    {children}
                </div>
            </div>
        </div>
    );
});

const StatPill = React.memo(function StatPill({
    label,
    value,
    tone = "neutral",
    mono = false,
    progress = null,
    pulse = false,
}: {
    label: string;
    value: string | number;
    tone?: Tone;
    mono?: boolean;
    progress?: number | null;
    pulse?: boolean;
}) {
    const progressClass = `progress-fill progress-fill--${tone}`;
    return (
        <div
            className={`flex h-full min-h-[76px] flex-col rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 xl:min-h-[60px] xl:px-2.5 xl:py-1.5 ${pulse ? "pulse-soft" : ""
                }`}
        >
            <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 xl:text-[9px]">
                {label}
            </div>
            <div
                className={`mt-1 min-h-[1.25rem] break-words [overflow-wrap:anywhere] text-[12px] leading-snug xl:mt-0.5 xl:text-[12px] ${toneTextClass(tone)} ${mono ? "font-mono" : "font-sans"
                    }`}
            >
                {value}
            </div>
            {progress !== null && (
                <div className="mt-2 progress-track">
                    <div
                        className={progressClass}
                        style={{ width: `${Math.max(4, progress * 100)}%` }}
                    />
                </div>
            )}
        </div>
    );
});

const ContextRow = React.memo(function ContextRow({
    label,
    value,
    tone = "neutral",
}: {
    label: string;
    value: string;
    tone?: Tone;
}) {
    const toneClass =
        tone === "good"
            ? "text-emerald-200"
            : tone === "warn"
                ? "text-amber-200"
            : tone === "bad"
                ? "text-rose-300"
                : "text-neutral-200";
    return (
        <div className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-x-2 xl:grid-cols-[76px_minmax(0,1fr)]">
            <span className="text-[11px] text-neutral-500 uppercase tracking-[0.18em]">
                {label}
            </span>
            <span className={`break-words [overflow-wrap:anywhere] text-[12px] leading-snug ${toneClass} font-mono`}>
                {value}
            </span>
        </div>
    );
});

const PipelineRow = React.memo(function PipelineRow({
    label,
    value,
    suffix,
    muted = false,
    tone = "neutral",
}: {
    label: string;
    value: string | number;
    suffix?: string;
    muted?: boolean;
    tone?: Tone;
}) {
    const toneClass =
        muted
            ? "text-neutral-500"
            : tone === "good"
                ? "text-emerald-200"
                : tone === "warn"
                    ? "text-amber-200"
                : tone === "bad"
                    ? "text-rose-300"
                    : "text-neutral-200";
    return (
        <div className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-x-2 xl:grid-cols-[88px_minmax(0,1fr)]">
            <span className="text-[11px] text-neutral-500 uppercase tracking-[0.18em]">
                {label}
            </span>
            <span className={`break-words [overflow-wrap:anywhere] text-[12px] leading-snug ${toneClass} font-mono`}>
                {value}
                {suffix ? ` ${suffix}` : ""}
            </span>
        </div>
    );
});

const MiniInfoCard = React.memo(function MiniInfoCard({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    return (
        <div className="flex h-full min-h-[76px] flex-col rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 xl:min-h-[60px] xl:px-2.5 xl:py-1.5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500 xl:text-[9px]">
                {label}
            </div>
            <div className="mt-1 break-words [overflow-wrap:anywhere] text-[12px] leading-snug text-neutral-200 font-mono xl:mt-0.5 xl:text-[11px]">
                {value}
            </div>
        </div>
    );
});

const CompactMetaTile = React.memo(function CompactMetaTile({
    label,
    value,
    tone = "neutral",
    mono = false,
}: {
    label: string;
    value: string | number;
    tone?: Tone;
    mono?: boolean;
}) {
    return (
        <div className="flex h-full min-h-[76px] flex-col rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 xl:min-h-[60px] xl:px-2.5 xl:py-1.5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-500 xl:text-[9px]">
                {label}
            </div>
            <div
                className={`mt-1 break-words [overflow-wrap:anywhere] text-[12px] leading-snug xl:mt-0.5 xl:text-[11px] ${toneTextClass(tone)} ${mono ? "font-mono" : "font-sans"
                    }`}
            >
                {value}
            </div>
        </div>
    );
});
