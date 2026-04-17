/**
 * Quant Lab V2 - UI Components
 * Minimal, composable, liquid glass design
 */

import React, { ReactNode } from "react";
import { cn } from "../../../lib/utils";
import "./tokens.css";

// =============================================================================
// LAYOUT
// =============================================================================

interface ShellProps {
    children: ReactNode;
    className?: string;
}

export function QuantLabShell({ children, className }: ShellProps) {
    return (
        <div className={cn("ql2-shell", className)}>
            <div className="ql2-container">{children}</div>
        </div>
    );
}

// =============================================================================
// HEADER
// =============================================================================

interface HeaderProps {
    title: string;
    subtitle?: string;
    actions?: ReactNode;
}

export function QuantHeader({ title, subtitle, actions }: HeaderProps) {
    return (
        <header className="ql2-header">
            <div>
                <h1 className="ql2-header__title">{title}</h1>
                {subtitle && <p className="ql2-header__subtitle">{subtitle}</p>}
            </div>
            {actions && <div className="flex items-center gap-3">{actions}</div>}
        </header>
    );
}

// =============================================================================
// TABS
// =============================================================================

interface Tab {
    id: string;
    label: string;
    disabled?: boolean;
}

interface TabsProps {
    tabs: Tab[];
    activeId: string;
    onChange: (id: string) => void;
}

export function QuantTabs({ tabs, activeId, onChange }: TabsProps) {
    return (
        <nav className="ql2-tabs">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    type="button"
                    className={cn("ql2-tab", activeId === tab.id && "ql2-tab--active")}
                    onClick={() => !tab.disabled && onChange(tab.id)}
                    disabled={tab.disabled}
                >
                    {tab.label}
                </button>
            ))}
        </nav>
    );
}

// =============================================================================
// BENTO CARD
// =============================================================================

interface BentoCardProps {
    title?: string;
    subtitle?: string;
    children: ReactNode;
    className?: string;
    span?: 1 | 2 | "full";
    interactive?: boolean;
    padding?: "none" | "sm" | "md" | "lg";
}

export function BentoCard({
    title,
    subtitle,
    children,
    className,
    span,
    interactive,
    padding = "md",
}: BentoCardProps) {
    const spanClass =
        span === 2
            ? "ql2-bento--span-2"
            : span === "full"
                ? "ql2-bento--span-full"
                : "";

    const paddingClass =
        padding === "none"
            ? "p-0"
            : padding === "sm"
                ? "p-3"
                : padding === "lg"
                    ? "p-6"
                    : "p-4";

    return (
        <div
            className={cn(
                "ql2-card",
                interactive && "ql2-card--interactive",
                spanClass,
                paddingClass,
                className
            )}
        >
            {(title || subtitle) && (
                <div className="mb-4">
                    {title && (
                        <h3 className="text-sm font-medium text-[var(--ql2-text-strong)]">
                            {title}
                        </h3>
                    )}
                    {subtitle && (
                        <p className="text-xs text-[var(--ql2-text-muted)] mt-1">
                            {subtitle}
                        </p>
                    )}
                </div>
            )}
            {children}
        </div>
    );
}

// =============================================================================
// BENTO GRID
// =============================================================================

interface BentoGridProps {
    children: ReactNode;
    cols?: 2 | 3;
    className?: string;
}

export function BentoGrid({ children, cols = 2, className }: BentoGridProps) {
    return (
        <div
            className={cn(
                "ql2-bento",
                cols === 3 ? "ql2-bento--3col" : "ql2-bento--2col",
                className
            )}
        >
            {children}
        </div>
    );
}

// =============================================================================
// KPI COMPONENTS
// =============================================================================

type KpiTone = "default" | "success" | "warn" | "danger";

interface KpiStatProps {
    label: string;
    value: ReactNode;
    hint?: string;
    tone?: KpiTone;
}

export function KpiStat({ label, value, hint, tone = "default" }: KpiStatProps) {
    const valueClass =
        tone === "success"
            ? "ql2-kpi__value--success"
            : tone === "warn"
                ? "ql2-kpi__value--warn"
                : tone === "danger"
                    ? "ql2-kpi__value--danger"
                    : "";

    return (
        <div className="ql2-kpi">
            <span className="ql2-kpi__label">{label}</span>
            <span className={cn("ql2-kpi__value", valueClass)}>{value}</span>
            {hint && <span className="ql2-kpi__hint">{hint}</span>}
        </div>
    );
}

interface KpiRowProps {
    children: ReactNode;
    className?: string;
}

export function KpiRow({ children, className }: KpiRowProps) {
    return (
        <div className={cn("flex flex-wrap gap-6", className)}>{children}</div>
    );
}

// =============================================================================
// FILTER BAR
// =============================================================================

interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
}

interface FilterSelectProps {
    label: string;
    value: string;
    options: SelectOption[];
    onChange: (value: string) => void;
    className?: string;
}

export function FilterSelect({
    label,
    value,
    options,
    onChange,
    className,
}: FilterSelectProps) {
    return (
        <div className={cn("flex items-center gap-2", className)}>
            <label className="text-xs text-[var(--ql2-text-dim)] uppercase tracking-wide">
                {label}
            </label>
            <select
                className="ql2-select"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            >
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                        {opt.label}
                    </option>
                ))}
            </select>
        </div>
    );
}

interface FilterBarProps {
    children: ReactNode;
    className?: string;
}

export function FilterBar({ children, className }: FilterBarProps) {
    return (
        <div
            className={cn(
                "flex flex-wrap items-center gap-4 py-3 px-1",
                className
            )}
        >
            {children}
        </div>
    );
}

// =============================================================================
// BUTTON
// =============================================================================

interface ButtonProps {
    children: ReactNode;
    variant?: "default" | "primary" | "ghost";
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
    icon?: ReactNode;
}

export function Button({
    children,
    variant = "default",
    onClick,
    disabled,
    className,
    icon,
}: ButtonProps) {
    const variantClass =
        variant === "primary"
            ? "ql2-btn--primary"
            : variant === "ghost"
                ? "ql2-btn--ghost"
                : "";

    return (
        <button
            type="button"
            className={cn("ql2-btn", variantClass, className)}
            onClick={onClick}
            disabled={disabled}
        >
            {icon}
            {children}
        </button>
    );
}

// =============================================================================
// BADGE
// =============================================================================

interface BadgeProps {
    children: ReactNode;
    variant?: "default" | "success" | "warn" | "danger";
    className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
    const variantClass =
        variant === "success"
            ? "ql2-badge--success"
            : variant === "warn"
                ? "ql2-badge--warn"
                : variant === "danger"
                    ? "ql2-badge--danger"
                    : "";

    return (
        <span className={cn("ql2-badge", variantClass, className)}>{children}</span>
    );
}

// =============================================================================
// EMPTY STATE
// =============================================================================

interface EmptyStateProps {
    title: string;
    description?: string;
    icon?: ReactNode;
    action?: ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
    return (
        <div className="ql2-empty">
            {icon && <div className="ql2-empty__icon">{icon}</div>}
            <div className="ql2-empty__title">{title}</div>
            {description && <div className="ql2-empty__desc">{description}</div>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}

// =============================================================================
// LOADING SKELETON
// =============================================================================

interface SkeletonProps {
    variant?: "line" | "chart";
    lines?: number;
    className?: string;
}

export function Skeleton({ variant = "line", lines = 3, className }: SkeletonProps) {
    if (variant === "chart") {
        return <div className={cn("ql2-skeleton ql2-skeleton--chart", className)} />;
    }

    return (
        <div className={className}>
            {Array.from({ length: lines }).map((_, i) => (
                <div
                    key={i}
                    className="ql2-skeleton ql2-skeleton--line"
                    style={{ width: `${70 + Math.random() * 30}%` }}
                />
            ))}
        </div>
    );
}

// =============================================================================
// CHART CARD (wrapper for Plotly/uPlot)
// =============================================================================

interface ChartCardProps {
    title: string;
    subtitle?: string;
    children: ReactNode;
    loading?: boolean;
    error?: string | null;
    empty?: boolean;
    emptyMessage?: string;
    span?: 1 | 2 | "full";
    height?: number;
    className?: string;
}

export function ChartCard({
    title,
    subtitle,
    children,
    loading,
    error,
    empty,
    emptyMessage = "No data available",
    span,
    height = 280,
    className,
}: ChartCardProps) {
    const renderContent = () => {
        if (error) {
            return (
                <EmptyState
                    title="Error"
                    description={error}
                />
            );
        }
        if (loading) {
            return <Skeleton variant="chart" />;
        }
        if (empty) {
            return (
                <EmptyState
                    title={emptyMessage}
                    description="Try adjusting filters or selecting a different run."
                />
            );
        }
        return children;
    };

    return (
        <BentoCard title={title} subtitle={subtitle} span={span} className={className}>
            <div style={{ minHeight: height }}>{renderContent()}</div>
        </BentoCard>
    );
}

// =============================================================================
// STATUS BADGE (for data freshness)
// =============================================================================

type StatusLevel = "fresh" | "stale" | "offline";

interface StatusBadgeProps {
    status: StatusLevel;
    label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
    const config: Record<StatusLevel, { variant: BadgeProps["variant"]; text: string }> = {
        fresh: { variant: "success", text: label || "FRESH" },
        stale: { variant: "warn", text: label || "STALE" },
        offline: { variant: "danger", text: label || "OFFLINE" },
    };

    const { variant, text } = config[status];
    return <Badge variant={variant}>{text}</Badge>;
}

// =============================================================================
// EXPORTS
// =============================================================================

export type {
    Tab,
    SelectOption,
    KpiTone,
    StatusLevel,
};
