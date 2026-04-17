/**
 * InvalidContextScreen - V4 DESK-GRADE TRUTH
 * 
 * Full-page takeover when run context is invalid.
 * This is NOT a soft warning - it blocks all data rendering.
 * 
 * Principle: No data without explicit run_id context.
 * This screen ensures users understand WHY and WHAT to do.
 */

import { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCw, ChevronDown, Database, XCircle } from 'lucide-react';
import { useRunContext, useRunMeta, type InvalidContextReason } from '../lib/useRunContext';
import { canonicalApi, type Run } from '../lib/canonicalApi';

interface InvalidContextScreenProps {
    /** Override the reason (otherwise uses context) */
    reason?: InvalidContextReason;
    /** Override error message */
    errorMessage?: string | null;
    /** Callback when run is selected */
    onRunSelected?: () => void;
}

const REASON_DETAILS: Record<InvalidContextReason, {
    title: string;
    message: string;
    action: string;
    icon: 'warning' | 'error' | 'loading';
}> = {
    NO_RUN_SELECTED: {
        title: 'No Run Selected',
        message: 'All data requires an explicit run context. Select a run to view signals, shocks, and trades.',
        action: 'Select a run from the list below',
        icon: 'warning',
    },
    RUN_NOT_FOUND: {
        title: 'Run Not Found',
        message: 'The previously selected run no longer exists or is inaccessible.',
        action: 'Select a different run',
        icon: 'error',
    },
    RUN_LOADING: {
        title: 'Loading Run Context',
        message: 'Fetching run details and canonical data...',
        action: 'Please wait',
        icon: 'loading',
    },
    API_ERROR: {
        title: 'Connection Error',
        message: 'Failed to connect to the canonical API. Check network and API status.',
        action: 'Retry or contact support',
        icon: 'error',
    },
    CONTEXT_STALE: {
        title: 'Context Stale',
        message: 'Run context may be outdated. Refresh to ensure data accuracy.',
        action: 'Refresh context',
        icon: 'warning',
    },
};

export function InvalidContextScreen({ reason, errorMessage, onRunSelected }: InvalidContextScreenProps) {
    const {
        invalidReason: contextReason,
        error: contextError,
        loading,
        selectRun,
        resetToActiveRun,
        refresh,
    } = useRunContext();

    const [availableRuns, setAvailableRuns] = useState<Run[]>([]);
    const [loadingRuns, setLoadingRuns] = useState(false);
    const [showRunList, setShowRunList] = useState(false);

    const actualReason = reason || contextReason || 'NO_RUN_SELECTED';
    const actualError = errorMessage || contextError;
    const details = REASON_DETAILS[actualReason];

    // Fetch available runs
    useEffect(() => {
        if (showRunList && availableRuns.length === 0) {
            setLoadingRuns(true);
            canonicalApi.listRuns({ limit: 15 })
                .then(data => setAvailableRuns(data.runs))
                .catch(() => { })
                .finally(() => setLoadingRuns(false));
        }
    }, [showRunList, availableRuns.length]);

    const handleSelectRun = async (runId: string) => {
        await selectRun(runId);
        onRunSelected?.();
    };

    const handleResetToActive = async () => {
        await resetToActiveRun();
        onRunSelected?.();
    };

    const isLoading = actualReason === 'RUN_LOADING' || loading;

    return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
            <div className="max-w-lg w-full">
                {/* Main Card */}
                <div className={`rounded-2xl border-2 p-8 ${details.icon === 'error'
                        ? 'bg-red-500/5 border-red-500/30'
                        : details.icon === 'loading'
                            ? 'bg-blue-500/5 border-blue-500/30'
                            : 'bg-amber-500/5 border-amber-500/30'
                    }`}>
                    {/* Icon */}
                    <div className="flex justify-center mb-6">
                        {isLoading ? (
                            <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center">
                                <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
                            </div>
                        ) : details.icon === 'error' ? (
                            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                                <XCircle className="w-8 h-8 text-red-400" />
                            </div>
                        ) : (
                            <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center">
                                <AlertTriangle className="w-8 h-8 text-amber-400" />
                            </div>
                        )}
                    </div>

                    {/* Title */}
                    <h2 className={`text-xl font-semibold text-center mb-2 ${details.icon === 'error' ? 'text-red-400' :
                            details.icon === 'loading' ? 'text-blue-400' : 'text-amber-400'
                        }`}>
                        {isLoading ? 'Loading...' : details.title}
                    </h2>

                    {/* Message */}
                    <p className="text-neutral-400 text-center text-sm mb-6">
                        {details.message}
                    </p>

                    {/* Error details (collapsed) */}
                    {actualError && !isLoading && (
                        <div className="mb-6 p-3 rounded-lg bg-neutral-900/50 border border-neutral-700">
                            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">
                                Technical Details
                            </div>
                            <div className="text-xs font-mono text-red-400 break-all">
                                {actualError}
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    {!isLoading && (
                        <div className="space-y-3">
                            {/* Primary: Select Run */}
                            <button
                                onClick={() => setShowRunList(!showRunList)}
                                className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <Database className="w-4 h-4 text-neutral-400" />
                                    <span className="text-sm font-medium text-white">Select Run</span>
                                </div>
                                <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform ${showRunList ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Run List */}
                            {showRunList && (
                                <div className="rounded-lg border border-white/10 bg-neutral-900/50 max-h-64 overflow-y-auto">
                                    {loadingRuns ? (
                                        <div className="p-4 text-center text-sm text-neutral-500">
                                            Loading runs...
                                        </div>
                                    ) : availableRuns.length === 0 ? (
                                        <div className="p-4 text-center text-sm text-neutral-500">
                                            No runs available
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-white/5">
                                            {availableRuns.map(run => (
                                                <button
                                                    key={run.run_id}
                                                    onClick={() => handleSelectRun(run.run_id)}
                                                    className="w-full px-4 py-3 text-left hover:bg-white/5 transition-colors"
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <div className="text-sm font-mono text-white">
                                                                {run.run_id.slice(0, 12)}...
                                                            </div>
                                                            <div className="text-xs text-neutral-500">
                                                                {run.strategy} - {run.start_ts?.split('T')[0]}
                                                            </div>
                                                        </div>
                                                        <div className={`px-2 py-0.5 rounded text-[10px] uppercase ${run.status === 'running'
                                                                ? 'bg-emerald-500/20 text-emerald-400'
                                                                : run.status === 'closed'
                                                                    ? 'bg-neutral-500/20 text-neutral-400'
                                                                    : 'bg-red-500/20 text-red-400'
                                                            }`}>
                                                            {run.status}
                                                        </div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Secondary: Reset to Active */}
                            <button
                                onClick={handleResetToActive}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Reset to Active Run
                            </button>

                            {/* Tertiary: Refresh */}
                            {actualReason === 'API_ERROR' && (
                                <button
                                    onClick={refresh}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 transition-colors"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    Retry Connection
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer hint */}
                <p className="text-center text-[11px] text-neutral-600 mt-4">
                    DESK-GRADE TRUTH: All data is scoped to a specific run for accuracy
                </p>
            </div>
        </div>
    );
}

/**
 * ContextGuard - HOC wrapper that shows InvalidContextScreen when context is invalid
 * 
 * Usage:
 * <ContextGuard>
 *   <YourComponent />
 * </ContextGuard>
 */
interface ContextGuardProps {
    children: React.ReactNode;
    /** Allow rendering during loading (shows loading state) */
    allowLoading?: boolean;
    /** Custom fallback component */
    fallback?: React.ReactNode;
}

export function ContextGuard({ children, allowLoading = false, fallback }: ContextGuardProps) {
    const { contextValid, loading, invalidReason } = useRunMeta();

    // Allow rendering during loading if specified
    if (loading && allowLoading) {
        return <>{children}</>;
    }

    // Show loading state
    if (loading && invalidReason === 'RUN_LOADING') {
        return fallback || <InvalidContextScreen />;
    }

    // Context invalid - show error screen
    if (!contextValid) {
        return fallback || <InvalidContextScreen />;
    }

    // Context valid - render children
    return <>{children}</>;
}

/**
 * Compact version for inline use
 */
export function InvalidContextBadge() {
    const { contextValid, invalidReason, loading } = useRunMeta();

    if (contextValid) return null;

    return (
        <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs ${loading
                ? 'bg-blue-500/10 border border-blue-500/30 text-blue-400'
                : 'bg-red-500/10 border border-red-500/30 text-red-400'
            }`}>
            {loading ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
                <AlertTriangle className="w-3 h-3" />
            )}
            <span className="uppercase tracking-wide">
                {loading ? 'Loading' : invalidReason?.replace(/_/g, ' ') || 'Invalid'}
            </span>
        </div>
    );
}
