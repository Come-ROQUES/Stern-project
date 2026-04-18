/**
 * GlassPanel V4 - Extended components for Desk-Grade UI
 * 
 * Re-exports from glass.tsx and adds V4-specific components:
 * - MetricCard - KPI with statistical guards
 * - BentoGrid - Responsive grid (uses BentoLayout if available)
 * - WarningBanner - Alert component
 * - SectionDivider - Visual separator
 * - EmptyState - Placeholder
 * 
 * Note: Core GlassPanel and GlassCard are in glass.tsx
 */

import { type ReactNode } from 'react';
import { cn } from '../../lib/utils';

// Re-export core components
export { GlassCard, GlassPanel, GlassKPI, GlassBadge, EmptyState } from './glass';
export { BentoGrid, BentoCell } from './BentoLayout';

/**
 * MetricCard - V4 KPI display with statistical significance
 */
interface MetricCardProps {
    label: string;
    value: string | number;
    change?: string;
    status?: 'positive' | 'negative' | 'neutral' | 'na';
    tooltip?: string;
    compact?: boolean;
}

export function MetricCard({
    label,
    value,
    change,
    status = 'neutral',
    tooltip,
    compact = false,
}: MetricCardProps) {
    const valueColor = {
        positive: 'text-emerald-400',
        negative: 'text-red-400',
        neutral: 'text-white',
        na: 'text-neutral-500',
    }[status];

    return (
        <div
            className={cn(
                'rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm',
                compact ? 'p-3' : 'p-4'
            )}
            title={tooltip}
        >
            <div className="text-[10px] font-medium uppercase tracking-[0.1em] text-neutral-500 mb-1">
                {label}
            </div>
            <div className={cn(
                'font-mono font-semibold',
                valueColor,
                compact ? 'text-lg' : 'text-2xl',
                status === 'na' && 'text-sm'
            )}>
                {status === 'na' ? 'N/A' : value}
            </div>
            {change && status !== 'na' && (
                <div className="text-[11px] text-neutral-500 mt-1">
                    {change}
                </div>
            )}
        </div>
    );
}

/**
 * WarningBanner - Inline alert component
 */
interface WarningBannerProps {
    severity: 'info' | 'warning' | 'critical';
    message: string;
    action?: ReactNode;
    onDismiss?: () => void;
}

export function WarningBanner({ severity, message, action, onDismiss }: WarningBannerProps) {
    const styles = {
        info: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
        warning: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
        critical: 'bg-red-500/10 border-red-500/30 text-red-400',
    }[severity];

    return (
        <div className={cn('rounded-lg border px-4 py-3 flex items-center justify-between', styles)}>
            <div className="flex items-center gap-3">
                <span className="text-sm">{message}</span>
            </div>
            <div className="flex items-center gap-2">
                {action}
                {onDismiss && (
                    <button
                        onClick={onDismiss}
                        className="p-1 hover:bg-white/10 rounded transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    );
}

/**
 * SectionDivider - Visual separator with optional label
 */
export function SectionDivider({ label }: { label?: string }) {
    if (!label) {
        return <div className="h-px bg-white/[0.06] my-4" />;
    }
    return (
        <div className="flex items-center gap-3 my-4">
            <div className="h-px flex-1 bg-white/[0.06]" />
            <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-neutral-600">
                {label}
            </span>
            <div className="h-px flex-1 bg-white/[0.06]" />
        </div>
    );
}

