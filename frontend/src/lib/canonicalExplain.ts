/**
 * Canonical Explain - Zero State Explanations
 * 
 * Provides human-readable explanations for why data is missing/zero.
 * Principle: No blank state without reason - users need to understand WHY.
 */

export type ZeroStateReason =
    | 'NO_RUN_SELECTED'
    | 'RUN_HAS_NO_DATA'
    | 'API_ERROR'
    | 'LOADING'
    | 'FILTERED_OUT'
    | 'OUTSIDE_RUN_WINDOW';

export interface ZeroStateExplanation {
    reason: ZeroStateReason;
    title: string;
    message: string;
    action?: string;
    severity: 'info' | 'warning' | 'error';
}

/**
 * Generate explanation for zero/empty state
 */
export function explainZeroState(
    context: {
        runId: string | null | undefined;
        hasError: boolean;
        errorMessage?: string | null;
        isLoading: boolean;
        dataCount: number;
        dataType: 'signals' | 'shocks' | 'trades' | 'kpis' | 'chart';
    }
): ZeroStateExplanation | null {
    const { runId, hasError, errorMessage, isLoading, dataCount, dataType } = context;

    // Still loading
    if (isLoading) {
        return {
            reason: 'LOADING',
            title: 'Loading...',
            message: `Fetching ${dataType} data...`,
            severity: 'info',
        };
    }

    // No run selected
    if (!runId) {
        return {
            reason: 'NO_RUN_SELECTED',
            title: 'No Run Selected',
            message: `Select a run to view ${dataType}.`,
            action: 'Select a run from the dropdown above',
            severity: 'warning',
        };
    }

    // API error
    if (hasError) {
        if (errorMessage === 'NO_RUN_ID') {
            return {
                reason: 'NO_RUN_SELECTED',
                title: 'Run ID Required',
                message: `${dataType} data requires a valid run_id.`,
                action: 'Select a run from the dropdown above',
                severity: 'warning',
            };
        }
        return {
            reason: 'API_ERROR',
            title: 'Data Unavailable',
            message: errorMessage || `Failed to load ${dataType}.`,
            action: 'Try refreshing the page',
            severity: 'error',
        };
    }

    // No data for this run
    if (dataCount === 0) {
        const messages: Record<typeof dataType, { title: string; message: string }> = {
            signals: {
                title: 'No Signals',
                message: 'This run has not generated any signals yet.',
            },
            shocks: {
                title: 'No Shocks Detected',
                message: 'No market shocks were detected during this run.',
            },
            trades: {
                title: 'No Trades',
                message: 'No trades have been executed for this run.',
            },
            kpis: {
                title: 'No KPIs Available',
                message: 'KPI data is not yet available for this run.',
            },
            chart: {
                title: 'No Chart Data',
                message: 'No price data available for this run window.',
            },
        };
        return {
            reason: 'RUN_HAS_NO_DATA',
            ...messages[dataType],
            severity: 'info',
        };
    }

    // Data exists, no explanation needed
    return null;
}

/**
 * Generate a compact explanation badge text
 */
export function explainZeroStateBadge(
    runId: string | null | undefined,
    error: string | null,
    isLoading: boolean
): string | null {
    if (isLoading) return 'Loading...';
    if (!runId) return 'No run selected';
    if (error === 'NO_RUN_ID') return 'No run selected';
    if (error) return 'Error';
    return null;
}

/**
 * CSS class for zero state severity
 */
export function getZeroStateSeverityClass(severity: ZeroStateExplanation['severity']): string {
    switch (severity) {
        case 'info':
            return 'bg-blue-900/20 border-blue-700 text-blue-300';
        case 'warning':
            return 'bg-yellow-900/20 border-yellow-700 text-yellow-300';
        case 'error':
            return 'bg-red-900/20 border-red-700 text-red-300';
    }
}

/**
 * Zero State Display Component Props
 */
export interface ZeroStateDisplayProps {
    explanation: ZeroStateExplanation;
    className?: string;
}

// Note: Component would be in a .tsx file, this is just the utility
