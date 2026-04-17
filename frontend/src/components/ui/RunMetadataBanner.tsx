/**
 * RunMetadataBanner - MANDATORY component for all tabs displaying data
 * 
 * This component MUST be rendered at the top of every panel that displays
 * run-specific data (trades, signals, metrics, etc.).
 * 
 * If the metadata cannot be displayed, the tab should NOT show any data.
 */

import React from 'react';
import { useRunMeta } from '../../lib/useRunContext';

export interface RunMetadataProps {
    /** Override the run context (for panels with their own run selector) */
    overrideRunId?: string | null;
    overrideDataOrigin?: 'RUN' | 'LEGACY';
    overrideTradeDate?: string;
    /** Additional context info */
    tradeCount?: number;
    signalCount?: number;
    dbPath?: string;
    /** Explicit data source indicator */
    dataSourceType?: 'canonical' | 'shadow' | 'mixed';
    /** Bundle run context (DW/S2) */
    bundleEnabled?: boolean;
    dwRunId?: string | null;
    s2RunId?: string | null;
    tfRunId?: string | null;
    onResetS2?: () => void;
    s2Resetting?: boolean;
}

export const RunMetadataBanner = React.memo(function RunMetadataBanner({
    overrideRunId,
    overrideDataOrigin,
    overrideTradeDate,
    tradeCount,
    signalCount,
    dbPath,
    dataSourceType,
    bundleEnabled,
    dwRunId,
    s2RunId,
    tfRunId,
    onResetS2,
    s2Resetting,
}: RunMetadataProps) {
    const { run, dataOrigin: contextDataOrigin } = useRunMeta();

    const runId = overrideRunId ?? run?.run_id;
    const dataOrigin = overrideDataOrigin ?? contextDataOrigin;
    const tradeDate = overrideTradeDate ?? run?.trade_date;
    const strategyId = run?.strategy_id ?? 'unknown';
    const strategyVersion =
        run?.strategy_version ??
        (run as any)?.cfg_hash ??
        (run as any)?.version ??
        'unknown';

    const isRunAware = dataOrigin === 'RUN';

    const bgColor = isRunAware
        ? 'border-emerald-400/30 bg-emerald-900/20'
        : 'border-amber-400/30 bg-amber-900/20';

    const originBadge = isRunAware
        ? 'bg-emerald-400/20 text-emerald-400 border-emerald-400/40'
        : 'bg-amber-400/20 text-amber-400 border-amber-400/40';

    // Data source badge styling
    const dataSourceBadge = dataSourceType === 'canonical'
        ? 'bg-cyan-400/20 text-cyan-400 border-cyan-400/40'
        : dataSourceType === 'shadow'
            ? 'bg-amber-400/20 text-amber-400 border-amber-400/40'
            : dataSourceType === 'mixed'
                ? 'bg-purple-400/20 text-purple-400 border-purple-400/40'
                : null;

    const dataSourceLabel = dataSourceType === 'canonical'
        ? 'Canonical'
        : dataSourceType === 'shadow'
            ? 'Shadow'
            : dataSourceType === 'mixed'
                ? 'Mixed'
                : null;

    const shortId = (value: string | null | undefined) =>
        value ? value.slice(0, 8) : "NO RUN";
    const showBundleRuns =
        Boolean(bundleEnabled) ||
        Boolean(dwRunId) ||
        Boolean(s2RunId) ||
        Boolean(tfRunId);

    return (
        <div className={`mb-4 rounded-lg border ${bgColor} p-3`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-3">
                    {/* Data Origin Badge */}
                    <span className={`rounded border px-2 py-0.5 text-xs font-bold uppercase ${originBadge}`}>
                        {dataOrigin}
                    </span>

                    {/* Data Source Badge (canonical vs shadow) */}
                    {dataSourceBadge && dataSourceLabel && (
                        <span className={`rounded border px-2 py-0.5 text-xs font-medium ${dataSourceBadge}`} title={dataSourceType === 'canonical' ? 'Data from canonical_trades.sqlite (Paper/Live execution)' : dataSourceType === 'shadow' ? 'Data from shadow_trading.sqlite (Research mode)' : 'Mixed data sources'}>
                            {dataSourceLabel}
                        </span>
                    )}

                    {/* Strategy/Version */}
                    <span className="text-xs text-neutral-400">
                        <span className="text-white font-medium">{strategyId}</span>
                        {strategyVersion && <span className="text-neutral-500"> / {strategyVersion}</span>}
                    </span>

                    {/* Date */}
                    {tradeDate && (
                        <span className="text-xs text-neutral-400">
                            <span className="text-white">{tradeDate}</span>
                        </span>
                    )}

                    {/* Run ID */}
                    {runId && (
                        <span className="text-xs font-mono text-neutral-500">
                            run: <span className="text-neutral-300">{runId.slice(0, 12)}</span>
                        </span>
                    )}
                    </div>

                    {showBundleRuns && (
                        <div className="flex flex-col gap-0.5 text-[11px] text-neutral-400">
                            <div>
                                DW run:{" "}
                                <span
                                    className="font-mono text-neutral-200"
                                    title={dwRunId ?? undefined}
                                >
                                    {shortId(dwRunId)}
                                </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span>
                                    S2 run:{" "}
                                    <span
                                        className="font-mono text-neutral-200"
                                        title={s2RunId ?? undefined}
                                    >
                                        {shortId(s2RunId)}
                                    </span>
                                </span>
                                {bundleEnabled && onResetS2 && (
                                    <button
                                        type="button"
                                        onClick={onResetS2}
                                        disabled={s2Resetting}
                                        className="rounded border border-cyan-300/30 px-2 py-0.5 text-[10px] uppercase tracking-wide text-cyan-200/90 transition hover:border-cyan-200 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
                                        title="Reset S2 vers le run actif"
                                    >
                                        {s2Resetting ? "Reset..." : "Reset S2"}
                                    </button>
                                )}
                            </div>
                            <div>
                                S3 run:{" "}
                                <span
                                    className="font-mono text-neutral-200"
                                    title={tfRunId ?? undefined}
                                >
                                    {shortId(tfRunId)}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-3 text-xs">
                    {/* Trade/Signal counts if provided */}
                    {tradeCount !== undefined && (
                        <span className="text-neutral-400">
                            trades: <span className="text-white font-medium">{tradeCount}</span>
                        </span>
                    )}
                    {signalCount !== undefined && (
                        <span className="text-neutral-400">
                            signals: <span className="text-white font-medium">{signalCount}</span>
                        </span>
                    )}
                    {/* DB Path (truncated) */}
                    {dbPath && (
                        <span className="text-neutral-500 font-mono text-[10px]" title={dbPath}>
                            {dbPath.split('/').slice(-2).join('/')}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
});

/**
 * NoDataWithoutRun - Placeholder when no run is resolved
 * Use this instead of showing empty/confusing data
 */
export function NoDataWithoutRun({ message }: { message?: string }) {
    return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-amber-400/20 bg-amber-900/10 p-8 text-center">
            <div className="text-lg font-semibold text-amber-400">No Run Context</div>
            <div className="mt-2 text-sm text-neutral-400">
                {message || 'Cannot display data without a resolved run. Please select a scope or run.'}
            </div>
        </div>
    );
}
