/**
 * Skeleton loading screens for backtest dashboard first-load states.
 */

import React from 'react';
import { Skeleton } from '../ui/glass';
import { cn } from '../../lib/utils';

// =============================================================================
// CockpitSkeleton - 3 cards in a grid matching cockpit layout
// =============================================================================

interface SkeletonProps {
    className?: string;
}

function CockpitSkeletonInner({ className }: SkeletonProps) {
    return (
        <div className={cn('grid grid-cols-1 md:grid-cols-3 gap-4', className)}>
            {Array.from({ length: 3 }).map((_, i) => (
                <div
                    key={i}
                    className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3"
                >
                    {/* Title */}
                    <Skeleton className="h-4 w-32" />
                    {/* Badge placeholders */}
                    <div className="flex gap-2">
                        <Skeleton className="h-5 w-16 rounded-full" />
                        <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                    {/* Metric placeholders */}
                    <div className="grid grid-cols-2 gap-2">
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-8 w-full" />
                    </div>
                </div>
            ))}
        </div>
    );
}

export const CockpitSkeleton = React.memo(CockpitSkeletonInner);

// =============================================================================
// KPIBarSkeleton - Horizontal row of 6 KPI tile placeholders
// =============================================================================

function KPIBarSkeletonInner({ className }: SkeletonProps) {
    return (
        <div className={cn('flex gap-3 overflow-x-auto', className)}>
            {Array.from({ length: 6 }).map((_, i) => (
                <div
                    key={i}
                    className="flex-shrink-0 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3 w-36 space-y-2"
                >
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-6 w-24" />
                </div>
            ))}
        </div>
    );
}

export const KPIBarSkeleton = React.memo(KPIBarSkeletonInner);

// =============================================================================
// TradeTableSkeleton - Header row + 8 fake rows with alternating widths
// =============================================================================

const ROW_WIDTHS = ['w-full', 'w-4/5', 'w-full', 'w-3/5', 'w-full', 'w-4/5', 'w-2/3', 'w-full'];

function TradeTableSkeletonInner({ className }: SkeletonProps) {
    return (
        <div className={cn('rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-2', className)}>
            {/* Header row */}
            <div className="flex gap-4 pb-2 border-b border-white/[0.06]">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-20" />
            </div>
            {/* Data rows */}
            {ROW_WIDTHS.map((w, i) => (
                <div key={i} className="flex gap-4 py-1">
                    <Skeleton className={cn('h-4', w)} />
                </div>
            ))}
        </div>
    );
}

export const TradeTableSkeleton = React.memo(TradeTableSkeletonInner);

// =============================================================================
// EquityCurveSkeleton - Single tall rectangle placeholder
// =============================================================================

function EquityCurveSkeletonInner({ className }: SkeletonProps) {
    return (
        <div className={cn('rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4', className)}>
            <Skeleton className="h-4 w-28 mb-3" />
            <Skeleton className="h-[300px] w-full rounded-lg" />
        </div>
    );
}

export const EquityCurveSkeleton = React.memo(EquityCurveSkeletonInner);
