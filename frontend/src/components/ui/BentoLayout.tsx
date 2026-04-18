/**
 * BentoLayout.tsx - Grid-based modular layout system
 * 
 * Provides:
 * - Responsive bento grid
 * - Slot-based card placement
 * - Animation on mount
 */

import React from 'react';
import { cn } from '../../lib/utils';

// =============================================================================
// BentoGrid - Main container
// =============================================================================

interface BentoGridProps {
    children: React.ReactNode;
    columns?: 1 | 2 | 3 | 4;
    gap?: 'sm' | 'md' | 'lg';
    className?: string;
}

export function BentoGrid({
    children,
    columns = 3,
    gap = 'md',
    className,
}: BentoGridProps) {
    const columnStyles = {
        1: 'grid-cols-1',
        2: 'grid-cols-1 md:grid-cols-2',
        3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
        4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
    };

    const gapStyles = {
        sm: 'gap-2 sm:gap-3',
        md: 'gap-2 sm:gap-3 lg:gap-4',
        lg: 'gap-3 sm:gap-4 lg:gap-6',
    };

    return (
        <div className={cn('grid', columnStyles[columns], gapStyles[gap], className)}>
            {children}
        </div>
    );
}

// =============================================================================
// BentoCell - Individual cell in the grid
// =============================================================================

interface BentoCellProps {
    children: React.ReactNode;
    colSpan?: 1 | 2 | 3 | 4;
    rowSpan?: 1 | 2 | 3;
    className?: string;
}

export function BentoCell({
    children,
    colSpan = 1,
    rowSpan = 1,
    className,
}: BentoCellProps) {
    const colSpanStyles = {
        1: '',
        2: 'md:col-span-2',
        3: 'md:col-span-2 lg:col-span-3',
        4: 'md:col-span-2 lg:col-span-3 xl:col-span-4',
    };

    const rowSpanStyles = {
        1: '',
        2: 'row-span-2',
        3: 'row-span-3',
    };

    return (
        <div className={cn(colSpanStyles[colSpan], rowSpanStyles[rowSpan], className)}>
            {children}
        </div>
    );
}

// =============================================================================
// PageLayout - Standard page wrapper
// =============================================================================

interface PageLayoutProps {
    children: React.ReactNode;
    title?: string;
    subtitle?: string;
    question?: string; // The question this page answers
    actions?: React.ReactNode;
    className?: string;
}

export function PageLayout({
    children,
    title,
    subtitle,
    question,
    actions,
    className,
}: PageLayoutProps) {
    return (
        <div className={cn('space-y-4', className)}>
            {(title || actions) && (
                <div className="flex items-start justify-between gap-2 sm:gap-4 flex-wrap">
                    <div>
                        {title && (
                            <h1 className="text-lg font-semibold text-white">{title}</h1>
                        )}
                        {subtitle && (
                            <p className="text-sm text-neutral-400 mt-0.5">{subtitle}</p>
                        )}
                        {question && (
                            <p className="text-xs text-[#00FF88]/70 mt-1 italic">
                                {question}
                            </p>
                        )}
                    </div>
                    {actions && (
                        <div className="flex items-center gap-2">{actions}</div>
                    )}
                </div>
            )}
            {children}
        </div>
    );
}

// =============================================================================
// SplitLayout - Two-column layout with main + sidebar
// =============================================================================

interface SplitLayoutProps {
    main: React.ReactNode;
    sidebar: React.ReactNode;
    sidebarPosition?: 'left' | 'right';
    sidebarWidth?: 'sm' | 'md' | 'lg';
    className?: string;
}

export function SplitLayout({
    main,
    sidebar,
    sidebarPosition = 'right',
    sidebarWidth = 'md',
    className,
}: SplitLayoutProps) {
    const sidebarWidthStyles = {
        sm: 'lg:w-64',
        md: 'lg:w-80',
        lg: 'lg:w-96',
    };

    const content = (
        <>
            <div className={cn('flex-shrink-0', sidebarWidthStyles[sidebarWidth])}>
                {sidebar}
            </div>
            <div className="flex-1 min-w-0">{main}</div>
        </>
    );

    return (
        <div className={cn(
            'flex flex-col lg:flex-row gap-4',
            sidebarPosition === 'left' ? '' : 'lg:flex-row-reverse',
            className
        )}>
            {content}
        </div>
    );
}

// =============================================================================
// StackLayout - Vertical stack with consistent spacing
// =============================================================================

interface StackLayoutProps {
    children: React.ReactNode;
    gap?: 'sm' | 'md' | 'lg';
    className?: string;
}

export function StackLayout({
    children,
    gap = 'md',
    className,
}: StackLayoutProps) {
    const gapStyles = {
        sm: 'space-y-3',
        md: 'space-y-4',
        lg: 'space-y-6',
    };

    return (
        <div className={cn(gapStyles[gap], className)}>
            {children}
        </div>
    );
}

// =============================================================================
// KPIRow - Horizontal row of KPIs
// =============================================================================

interface KPIRowProps {
    children: React.ReactNode;
    columns?: 2 | 3 | 4 | 5 | 6;
    className?: string;
}

export function KPIRow({
    children,
    columns = 4,
    className,
}: KPIRowProps) {
    const columnStyles = {
        2: 'grid-cols-2',
        3: 'grid-cols-3',
        4: 'grid-cols-2 sm:grid-cols-4',
        5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
        6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
    };

    return (
        <div className={cn(
            'grid gap-2 sm:gap-3 lg:gap-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-2 sm:p-3 lg:p-4',
            columnStyles[columns],
            className
        )}>
            {children}
        </div>
    );
}

// =============================================================================
// TabSection - Section with tabs for sub-views
// =============================================================================

interface Tab {
    id: string;
    label: string;
    content: React.ReactNode;
}

interface TabSectionProps {
    tabs: Tab[];
    defaultTab?: string;
    className?: string;
}

export function TabSection({
    tabs,
    defaultTab,
    className,
}: TabSectionProps) {
    const [activeTab, setActiveTab] = React.useState(defaultTab || tabs[0]?.id);
    const activeContent = tabs.find(t => t.id === activeTab)?.content;

    return (
        <div className={cn('rounded-xl border border-white/[0.08] bg-white/[0.02]', className)}>
            <div className="flex border-b border-white/[0.06] px-4">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            'px-4 py-3 text-xs font-medium transition-colors border-b-2 -mb-px',
                            activeTab === tab.id
                                ? 'border-[#00FF88] text-white'
                                : 'border-transparent text-neutral-400 hover:text-white'
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            <div className="p-4">
                {activeContent}
            </div>
        </div>
    );
}
