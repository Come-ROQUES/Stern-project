/**
 * Liquid Glass Design System - Stern Dashboard
 * 
 * Visual direction:
 * - Dark theme, low-saturation, high-clarity
 * - Glass cards: blur, subtle border, soft inner highlights
 * - Bento layout: grid-based, modular cards
 * - Motion: tiny micro-interactions (hover lift, shimmer)
 * 
 * Tokens:
 * - spacing: 12/16/20
 * - radius: 16-24
 * - borders: 1px with opacity
 * - blur: backdrop-blur-xl
 * - shadows: subtle, not heavy
 */

import React from 'react';
import { cn } from '../../lib/utils';

// =============================================================================
// GlassCard - Primary container component
// =============================================================================

interface GlassCardProps {
    children: React.ReactNode;
    className?: string;
    variant?: 'default' | 'elevated' | 'inset' | 'danger' | 'success' | 'warning';
    padding?: 'none' | 'sm' | 'md' | 'lg';
    hover?: boolean;
    onClick?: () => void;
}

export function GlassCard({
    children,
    className,
    variant = 'default',
    padding = 'md',
    hover = false,
    onClick,
}: GlassCardProps) {
    const baseStyles = 'rounded-2xl border backdrop-blur-xl transition-all duration-200';

    const variantStyles = {
        default: 'bg-white/[0.03] border-white/[0.08] shadow-lg shadow-black/10',
        elevated: 'bg-white/[0.05] border-white/[0.12] shadow-xl shadow-black/20',
        inset: 'bg-black/20 border-white/[0.05] shadow-inner',
        danger: 'bg-red-500/[0.08] border-red-500/30 shadow-lg shadow-red-500/5',
        success: 'bg-emerald-500/[0.08] border-emerald-500/30 shadow-lg shadow-emerald-500/5',
        warning: 'bg-amber-500/[0.08] border-amber-500/30 shadow-lg shadow-amber-500/5',
    };

    const paddingStyles = {
        none: '',
        sm: 'p-3',
        md: 'p-4',
        lg: 'p-6',
    };

    const hoverStyles = hover
        ? 'hover:bg-white/[0.06] hover:border-white/[0.15] hover:shadow-xl hover:-translate-y-0.5 cursor-pointer'
        : '';

    return (
        <div
            className={cn(baseStyles, variantStyles[variant], paddingStyles[padding], hoverStyles, className)}
            onClick={onClick}
        >
            {children}
        </div>
    );
}

// =============================================================================
// GlassPanel - Full-width section container
// =============================================================================

interface GlassPanelProps {
    children: React.ReactNode;
    className?: string;
    title?: string;
    subtitle?: string;
    action?: React.ReactNode;
}

export function GlassPanel({
    children,
    className,
    title,
    subtitle,
    action,
}: GlassPanelProps) {
    return (
        <div className={cn('rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl', className)}>
            {(title || action) && (
                <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
                    <div>
                        {title && <h3 className="text-sm font-medium text-white">{title}</h3>}
                        {subtitle && <p className="text-xs text-neutral-400 mt-0.5">{subtitle}</p>}
                    </div>
                    {action && <div>{action}</div>}
                </div>
            )}
            <div className="p-5">{children}</div>
        </div>
    );
}

// =============================================================================
// GlassKPI - Key Performance Indicator display
// =============================================================================

interface GlassKPIProps {
    label: string;
    value: string | number | null | undefined;
    sublabel?: string;
    trend?: 'up' | 'down' | 'neutral';
    trendValue?: string;
    variant?: 'default' | 'success' | 'danger' | 'warning' | 'info';
    size?: 'sm' | 'md' | 'lg';
    tooltip?: string;
    loading?: boolean;
}

export function GlassKPI({
    label,
    value,
    sublabel,
    trend,
    trendValue,
    variant = 'default',
    size = 'md',
    tooltip,
    loading = false,
}: GlassKPIProps) {
    const valueColors = {
        default: 'text-white',
        success: 'text-emerald-400',
        danger: 'text-red-400',
        warning: 'text-amber-400',
        info: 'text-[#00FF88]',
    };

    const trendColors = {
        up: 'text-emerald-400',
        down: 'text-red-400',
        neutral: 'text-neutral-400',
    };

    const trendIcons = {
        up: '↑',
        down: '↓',
        neutral: '→',
    };

    const sizeStyles = {
        sm: { value: 'text-lg', label: 'text-[10px]' },
        md: { value: 'text-2xl', label: 'text-xs' },
        lg: { value: 'text-3xl', label: 'text-sm' },
    };

    if (loading) {
        return (
            <div className="animate-pulse">
                <div className="h-3 w-16 bg-white/10 rounded mb-2" />
                <div className="h-7 w-24 bg-white/10 rounded" />
            </div>
        );
    }

    const displayValue = value === null || value === undefined ? '—' : value;

    return (
        <div className="group" title={tooltip}>
            <div className={cn('uppercase tracking-wider text-neutral-400 mb-1', sizeStyles[size].label)}>
                {label}
            </div>
            <div className="flex items-baseline gap-2">
                <span className={cn('font-semibold font-mono', sizeStyles[size].value, valueColors[variant])}>
                    {displayValue}
                </span>
                {trend && trendValue && (
                    <span className={cn('text-xs font-medium', trendColors[trend])}>
                        {trendIcons[trend]} {trendValue}
                    </span>
                )}
            </div>
            {sublabel && (
                <div className="text-[10px] text-neutral-500 mt-0.5">{sublabel}</div>
            )}
        </div>
    );
}

// =============================================================================
// GlassBadge - Status badge
// =============================================================================

interface GlassBadgeProps {
    children: React.ReactNode;
    variant?: 'default' | 'success' | 'danger' | 'warning' | 'info' | 'muted';
    size?: 'sm' | 'md';
    pulse?: boolean;
    icon?: React.ReactNode;
}

export function GlassBadge({
    children,
    variant = 'default',
    size = 'sm',
    pulse = false,
    icon,
}: GlassBadgeProps) {
    const variantStyles = {
        default: 'bg-white/10 text-white border-white/20',
        success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        danger: 'bg-red-500/15 text-red-400 border-red-500/30',
        warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        info: 'bg-[#00FF88]/15 text-[#00FF88] border-[#00FF88]/30',
        muted: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20',
    };

    const sizeStyles = {
        sm: 'px-2 py-0.5 text-[10px]',
        md: 'px-3 py-1 text-xs',
    };

    return (
        <span className={cn(
            'inline-flex items-center gap-1 rounded-full border font-medium uppercase tracking-wider',
            variantStyles[variant],
            sizeStyles[size]
        )}>
            {pulse && (
                <span className={cn(
                    'h-1.5 w-1.5 rounded-full animate-pulse',
                    variant === 'success' ? 'bg-emerald-400' :
                        variant === 'danger' ? 'bg-red-400' :
                            variant === 'warning' ? 'bg-amber-400' :
                                variant === 'info' ? 'bg-[#00FF88]' : 'bg-white'
                )} />
            )}
            {icon}
            {children}
        </span>
    );
}

// =============================================================================
// SegmentedControl - Toggle between options
// =============================================================================

interface SegmentedControlProps<T extends string> {
    options: { value: T; label: string; icon?: React.ReactNode }[];
    value: T;
    onChange: (value: T) => void;
    size?: 'sm' | 'md';
}

export function SegmentedControl<T extends string>({
    options,
    value,
    onChange,
    size = 'sm',
}: SegmentedControlProps<T>) {
    const sizeStyles = {
        sm: 'text-[10px] px-2 py-1',
        md: 'text-xs px-3 py-1.5',
    };

    return (
        <div className="inline-flex rounded-lg bg-white/[0.05] border border-white/[0.08] p-0.5">
            {options.map((option) => (
                <button
                    key={option.value}
                    onClick={() => onChange(option.value)}
                    className={cn(
                        'rounded-md font-medium transition-all duration-150 flex items-center gap-1',
                        sizeStyles[size],
                        value === option.value
                            ? 'bg-white/[0.12] text-white shadow-sm'
                            : 'text-neutral-400 hover:text-white hover:bg-white/[0.05]'
                    )}
                >
                    {option.icon}
                    {option.label}
                </button>
            ))}
        </div>
    );
}

// =============================================================================
// EmptyState - Meaningful empty state (never silent zero)
// =============================================================================

interface EmptyStateProps {
    icon?: React.ReactNode;
    title: string;
    message: string;
    action?: {
        label: string;
        onClick: () => void;
    };
    variant?: 'default' | 'info' | 'warning';
}

export function EmptyState({
    icon,
    title,
    message,
    action,
    variant = 'default',
}: EmptyStateProps) {
    const variantStyles = {
        default: 'border-white/[0.08] bg-white/[0.02]',
        info: 'border-[#00FF88]/20 bg-[#00FF88]/[0.03]',
        warning: 'border-amber-500/20 bg-amber-500/[0.03]',
    };

    const iconColors = {
        default: 'text-neutral-500',
        info: 'text-[#00FF88]',
        warning: 'text-amber-400',
    };

    return (
        <div className={cn(
            'rounded-xl border p-8 text-center',
            variantStyles[variant]
        )}>
            {icon && (
                <div className={cn('mx-auto mb-4 h-12 w-12 flex items-center justify-center', iconColors[variant])}>
                    {icon}
                </div>
            )}
            <h3 className="text-sm font-medium text-white mb-1">{title}</h3>
            <p className="text-xs text-neutral-400 max-w-xs mx-auto">{message}</p>
            {action && (
                <button
                    onClick={action.onClick}
                    className="mt-4 px-4 py-2 text-xs font-medium rounded-lg bg-white/[0.08] border border-white/[0.12] text-white hover:bg-white/[0.12] transition-colors"
                >
                    {action.label}
                </button>
            )}
        </div>
    );
}

// =============================================================================
// DangerBanner - Critical warning banner
// =============================================================================

interface DangerBannerProps {
    title: string;
    message: string;
    variant?: 'error' | 'warning' | 'info';
    action?: {
        label: string;
        onClick: () => void;
    };
    dismissible?: boolean;
    onDismiss?: () => void;
}

export function DangerBanner({
    title,
    message,
    variant = 'error',
    action,
    dismissible = false,
    onDismiss,
}: DangerBannerProps) {
    const variantStyles = {
        error: 'bg-red-500/10 border-red-500/30 text-red-400',
        warning: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
        info: 'bg-[#00FF88]/10 border-[#00FF88]/30 text-[#00FF88]',
    };

    return (
        <div className={cn(
            'rounded-xl border px-4 py-3 flex items-center justify-between gap-4',
            variantStyles[variant]
        )}>
            <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-current animate-pulse" />
                <div>
                    <div className="text-sm font-medium">{title}</div>
                    <div className="text-xs opacity-80">{message}</div>
                </div>
            </div>
            <div className="flex items-center gap-2">
                {action && (
                    <button
                        onClick={action.onClick}
                        className="px-3 py-1 text-xs font-medium rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                    >
                        {action.label}
                    </button>
                )}
                {dismissible && onDismiss && (
                    <button
                        onClick={onDismiss}
                        className="p-1 text-current opacity-60 hover:opacity-100 transition-opacity"
                    >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    );
}

// =============================================================================
// Skeleton - Loading placeholder
// =============================================================================

interface SkeletonProps {
    className?: string;
    variant?: 'text' | 'circle' | 'rect' | 'card';
}

export function Skeleton({ className, variant = 'rect' }: SkeletonProps) {
    const variantStyles = {
        text: 'h-4 w-full rounded',
        circle: 'h-10 w-10 rounded-full',
        rect: 'h-20 w-full rounded-lg',
        card: 'h-32 w-full rounded-xl',
    };

    return (
        <div
            className={cn(
                'animate-pulse bg-white/[0.08]',
                variantStyles[variant],
                className
            )}
        />
    );
}

// =============================================================================
// MiniSparkline - Tiny inline chart
// =============================================================================

interface MiniSparklineProps {
    data: number[];
    width?: number;
    height?: number;
    color?: string;
    showArea?: boolean;
}

export function MiniSparkline({
    data,
    width = 60,
    height = 20,
    color = '#00FF88',
    showArea = true,
}: MiniSparklineProps) {
    if (data.length < 2) return null;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const points = data.map((value, index) => {
        const x = (index / (data.length - 1)) * width;
        const y = height - ((value - min) / range) * height;
        return `${x},${y}`;
    });

    const linePath = `M ${points.join(' L ')}`;
    const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;

    return (
        <svg width={width} height={height} className="overflow-visible">
            {showArea && (
                <path d={areaPath} fill={color} fillOpacity={0.1} />
            )}
            <path
                d={linePath}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

// =============================================================================
// Verdict - Strategy health indicator
// =============================================================================

interface VerdictProps {
    status: 'GREEN' | 'AMBER' | 'RED' | 'UNKNOWN';
    reasons?: string[];
    size?: 'sm' | 'md' | 'lg';
}

export function Verdict({ status, reasons = [], size = 'md' }: VerdictProps) {
    const statusConfig = {
        GREEN: {
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/10',
            border: 'border-emerald-500/30',
            label: 'HEALTHY',
        },
        AMBER: {
            color: 'text-amber-400',
            bg: 'bg-amber-500/10',
            border: 'border-amber-500/30',
            label: 'CAUTION',
        },
        RED: {
            color: 'text-red-400',
            bg: 'bg-red-500/10',
            border: 'border-red-500/30',
            label: 'CRITICAL',
        },
        UNKNOWN: {
            color: 'text-neutral-400',
            bg: 'bg-neutral-500/10',
            border: 'border-neutral-500/30',
            label: 'UNKNOWN',
        },
    };

    const config = statusConfig[status];

    const sizeStyles = {
        sm: { text: 'text-lg', dot: 'h-2 w-2' },
        md: { text: 'text-2xl', dot: 'h-3 w-3' },
        lg: { text: 'text-4xl', dot: 'h-4 w-4' },
    };

    return (
        <div className={cn('rounded-xl border p-4', config.bg, config.border)}>
            <div className="flex items-center gap-3 mb-2">
                <div className={cn('rounded-full animate-pulse', sizeStyles[size].dot, config.bg.replace('/10', ''))}
                    style={{ backgroundColor: status === 'GREEN' ? '#00FF88' : status === 'AMBER' ? '#f59e0b' : status === 'RED' ? '#ef4444' : '#6b7280' }}
                />
                <span className={cn('font-bold', sizeStyles[size].text, config.color)}>
                    {config.label}
                </span>
            </div>
            {reasons.length > 0 && (
                <ul className="space-y-1">
                    {reasons.map((reason, i) => (
                        <li key={i} className="text-xs text-neutral-400 flex items-start gap-2">
                            <span className="text-neutral-600">•</span>
                            {reason}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
