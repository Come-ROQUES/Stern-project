/**
 * ZeroStateDisplay - Reusable component for explaining empty states
 * 
 * Principle: No blank state without reason
 * Users need to understand WHY data is missing and WHAT to do
 */

import React from 'react';
import { explainZeroState, getZeroStateSeverityClass, type ZeroStateExplanation } from '../lib/canonicalExplain';

interface ZeroStateDisplayProps {
    runId: string | null | undefined;
    error: string | null;
    isLoading: boolean;
    dataCount: number;
    dataType: 'signals' | 'shocks' | 'trades' | 'kpis' | 'chart';
    className?: string;
    compact?: boolean;
}

export function ZeroStateDisplay({
    runId,
    error,
    isLoading,
    dataCount,
    dataType,
    className = '',
    compact = false,
}: ZeroStateDisplayProps) {
    const explanation = explainZeroState({
        runId,
        hasError: !!error,
        errorMessage: error,
        isLoading,
        dataCount,
        dataType,
    });

    if (!explanation) return null;

    const severityClass = getZeroStateSeverityClass(explanation.severity);

    if (compact) {
        return (
            <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs ${severityClass} ${className}`}>
                <StatusIcon severity={explanation.severity} />
                <span>{explanation.title}</span>
            </div>
        );
    }

    return (
        <div className={`rounded-lg border p-4 ${severityClass} ${className}`}>
            <div className="flex items-start gap-3">
                <StatusIcon severity={explanation.severity} size="lg" />
                <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm mb-1">{explanation.title}</h3>
                    <p className="text-xs opacity-80 mb-2">{explanation.message}</p>
                    {explanation.action && (
                        <p className="text-xs font-medium opacity-90">
                            Action: {explanation.action}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

function StatusIcon({ severity, size = 'sm' }: { severity: ZeroStateExplanation['severity']; size?: 'sm' | 'lg' }) {
    const sizeClass = size === 'lg' ? 'w-5 h-5' : 'w-3.5 h-3.5';

    switch (severity) {
        case 'info':
            return (
                <svg className={`${sizeClass} flex-shrink-0`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
            );
        case 'warning':
            return (
                <svg className={`${sizeClass} flex-shrink-0`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
            );
        case 'error':
            return (
                <svg className={`${sizeClass} flex-shrink-0`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
            );
    }
}

/**
 * Inline version for use in table cells or tight spaces
 */
export function ZeroStateBadge({
    runId,
    error,
    isLoading,
}: {
    runId: string | null | undefined;
    error: string | null;
    isLoading: boolean;
}) {
    if (isLoading) {
        return <span className="text-blue-400 text-xs animate-pulse">Loading...</span>;
    }
    if (!runId) {
        return <span className="text-yellow-400 text-xs">No run</span>;
    }
    if (error === 'NO_RUN_ID') {
        return <span className="text-yellow-400 text-xs">Select run</span>;
    }
    if (error) {
        return <span className="text-red-400 text-xs" title={error}>Error</span>;
    }
    return null;
}

/**
 * Loading skeleton for data panels
 */
export function DataLoadingSkeleton({ rows = 3 }: { rows?: number }) {
    return (
        <div className="animate-pulse space-y-2">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="h-4 bg-neutral-700/50 rounded w-full" style={{ width: `${100 - i * 15}%` }} />
            ))}
        </div>
    );
}

export default ZeroStateDisplay;
