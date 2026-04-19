/**
 * SideNav.tsx - Section-based navigation with collapsible groups
 *
 * Implements the nav model with:
 * - DESK section (terminal)
 * - QUANT section (Quant Lab modules)
 * - SYSTEM section (collapsible)
 * - Mobile bottom nav (iOS-native feel)
 * - "More" bottom sheet menu
 */

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
    LayoutDashboard,
    Terminal,
    LineChart,
    TrendingUp,
    ScrollText,
    AlertOctagon,
    AlertTriangle,
    Timer,
    Wallet,
    History,
    Activity,
    Filter,
    Grid,
    BarChart3,
    FlaskConical,
    Ghost,
    FlaskRound,
    Target,
    Link2,
    Server,
    Database,
    ShieldCheck,
    Shield,
    Settings,
    Brain,
    MoreHorizontal,
    Play,
    X,
    type LucideIcon,
} from 'lucide-react';
import { getTabsBySection, SECTION_INFO, type NavTab, type NavSection } from '../lib/navModel';
import { useDeskMode } from './HeaderControls';
import { cn } from '../lib/utils';
import { GlassBadge } from './ui/glass';

// Shared icon map - single source of truth for both desktop and mobile
const ICON_MAP: Record<string, LucideIcon> = {
    LayoutDashboard,
    Terminal,
    LineChart,
    TrendingUp,
    ScrollText,
    AlertOctagon,
    AlertTriangle,
    Timer,
    Wallet,
    History,
    Activity,
    Filter,
    Grid,
    BarChart3,
    FlaskConical,
    Ghost,
    FlaskRound,
    Target,
    Link2,
    Server,
    Database,
    ShieldCheck,
    Shield,
    Settings,
    Brain,
    MoreHorizontal,
    Play,
};

// =============================================================================
// Section Header
// =============================================================================

interface SectionHeaderProps {
    section: NavSection;
    collapsed?: boolean;
    onToggle?: () => void;
    count?: number;
}

function SectionHeader({ section, collapsed, onToggle, count }: SectionHeaderProps) {
    const info = SECTION_INFO[section];
    const SectionIcon = info.icon ? ICON_MAP[info.icon] : undefined;

    return (
        <button
            onClick={onToggle}
            className={cn(
                'w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors',
                'text-[10px] uppercase tracking-[0.15em] font-medium',
                'hover:bg-white/[0.05]',
                collapsed ? 'text-neutral-500' : 'text-neutral-400'
            )}
        >
            <span className="flex items-center gap-2">
                {SectionIcon && <SectionIcon size={14} className="opacity-60" />}
                {info.label}
            </span>
            <span className="flex items-center gap-2">
                {count !== undefined && (
                    <span className="text-[9px] text-neutral-600">{count}</span>
                )}
                {onToggle && (
                    <svg
                        className={cn(
                            'h-3 w-3 transition-transform',
                            collapsed && '-rotate-90'
                        )}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                )}
            </span>
        </button>
    );
}

// =============================================================================
// Nav Item
// =============================================================================

interface NavItemProps {
    tab: NavTab;
    active: boolean;
    onClick: () => void;
    compact?: boolean;
}

function NavItem({ tab, active, onClick, compact = false }: NavItemProps) {
    const Icon = tab.icon ? ICON_MAP[tab.icon] : undefined;

    return (
        <button
            onClick={onClick}
            className={cn(
                'group w-full flex items-center gap-2 rounded-xl px-3 transition-all duration-150',
                compact ? 'py-1.5 text-xs' : 'py-2 text-sm',
                active
                    ? 'bg-cyan-500/12 text-white shadow-[0_0_0_1px_rgba(0,198,255,0.35)]'
                    : 'bg-transparent text-neutral-300 hover:bg-white/[0.06] hover:text-white'
            )}
        >
            {/* Active indicator dot */}
            <span
                className={cn(
                    'h-1.5 w-1.5 rounded-full transition-all duration-150',
                    active
                        ? 'bg-cyan-400 shadow-[0_0_10px_rgba(0,198,255,0.9)]'
                        : 'bg-white/20 group-hover:bg-cyan-400/50'
                )}
            />

            {/* Icon */}
            {Icon && (
                <Icon
                    size={16}
                    className={cn(
                        'transition-colors',
                        active ? 'opacity-100 text-cyan-300' : 'opacity-60 group-hover:opacity-100 text-neutral-300'
                    )}
                />
            )}

            {/* Label */}
            <span className="font-medium">{tab.label}</span>

            {/* Quant badge */}
            {tab.section === 'QUANT' && !active && (
                <GlassBadge variant="info" size="sm">R</GlassBadge>
            )}
        </button>
    );
}

// =============================================================================
// SideNav - Main component (desktop)
// =============================================================================

interface SideNavProps {
    activeTab: string;
    onTabChange: (tabId: string) => void;
    className?: string;
}

export function SideNav({ activeTab, onTabChange, className }: SideNavProps) {
    const { mode, researchModeEnabled, appMode } = useDeskMode();
    const [systemCollapsed, setSystemCollapsed] = React.useState(false);

    // Get visible tabs per section
    const visibleTabsBySection = useMemo(() => {
        return getTabsBySection(appMode, mode, researchModeEnabled);
    }, [appMode, mode, researchModeEnabled]);

    const deskTabs = visibleTabsBySection.DESK;
    const quantTabs = visibleTabsBySection.QUANT;
    const systemTabs = visibleTabsBySection.SYSTEM;
    const backtestTabs = visibleTabsBySection.BACKTEST;

    return (
        <nav className={cn('flex flex-col gap-1', className)}>
            {/* DESK Section - Always visible in Terminal mode */}
            {deskTabs.length > 0 && (
                <div className="space-y-1">
                    <SectionHeader section="DESK" />
                    {deskTabs.map(tab => (
                        <NavItem
                            key={tab.id}
                            tab={tab}
                            active={activeTab === tab.id}
                            onClick={() => onTabChange(tab.id)}
                        />
                    ))}
                </div>
            )}

            {/* QUANT Section - Quant Lab modules */}
            {quantTabs.length > 0 && (
                <div className="space-y-1 mt-4 pt-4 border-t border-white/[0.06]">
                    <SectionHeader section="QUANT" count={quantTabs.length} />
                    {quantTabs.map(tab => (
                        <NavItem
                            key={tab.id}
                            tab={tab}
                            active={activeTab === tab.id}
                            onClick={() => onTabChange(tab.id)}
                        />
                    ))}
                </div>
            )}

            {/* BACKTEST Section - Offline backtest workbench */}
            {backtestTabs.length > 0 && (
                <div className="space-y-1 mt-4 pt-4 border-t border-white/[0.06]">
                    <SectionHeader section="BACKTEST" count={backtestTabs.length} />
                    {backtestTabs.map(tab => (
                        <NavItem
                            key={tab.id}
                            tab={tab}
                            active={activeTab === tab.id}
                            onClick={() => onTabChange(tab.id)}
                        />
                    ))}
                </div>
            )}

            {/* SYSTEM Section - Collapsible */}
            {systemTabs.length > 0 && (
                <div className="space-y-1 mt-4 pt-4 border-t border-white/[0.06]">
                    <SectionHeader
                        section="SYSTEM"
                        collapsed={systemCollapsed}
                        onToggle={() => setSystemCollapsed(!systemCollapsed)}
                        count={systemTabs.length}
                    />
                    {!systemCollapsed && systemTabs.map(tab => (
                        <NavItem
                            key={tab.id}
                            tab={tab}
                            active={activeTab === tab.id}
                            onClick={() => onTabChange(tab.id)}
                            compact
                        />
                    ))}
                </div>
            )}

            {/* Research Mode hint when not enabled */}
            {appMode === 'terminal' && !researchModeEnabled && mode !== 'prod' && (
                <div className="mt-auto pt-4 px-3">
                    <p className="text-[10px] text-neutral-600 leading-relaxed">
                        Enable <span className="text-cyan-500/70">Research Mode</span> in header to access Market Profile, Signal Analytics, and more.
                    </p>
                </div>
            )}
        </nav>
    );
}

// =============================================================================
// MobileNav - Bottom navigation for mobile (pro native feel)
// =============================================================================

interface MobileNavProps {
    activeTab: string;
    onTabChange: (tabId: string) => void;
}

export function MobileNav({ activeTab, onTabChange }: MobileNavProps) {
    const { mode, researchModeEnabled, appMode } = useDeskMode();
    const [moreOpen, setMoreOpen] = useState(false);
    const sheetRef = useRef<HTMLDivElement>(null);

    // Lock body scroll when More menu is open
    useEffect(() => {
        if (moreOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [moreOpen]);

    const { primaryTabs, overflowTabs } = useMemo(() => {
        const sections = getTabsBySection(appMode, mode, researchModeEnabled);
        const deskTabs = sections.DESK;
        const quantTabs = sections.QUANT;
        const systemTabs = sections.SYSTEM;
        const backtestTabs = sections.BACKTEST;
        const all: NavTab[] = [
            ...deskTabs,
            ...quantTabs,
            ...backtestTabs,
            ...systemTabs,
        ];

        // Use mobilePriority to select the 4 most important tabs.
        const withPriority = all
            .filter((t) => t.mobilePriority !== undefined)
            .sort((a, b) => (a.mobilePriority ?? 99) - (b.mobilePriority ?? 99));

        let primary: NavTab[];
        if (withPriority.length >= 4) {
            primary = withPriority.slice(0, 4);
        } else {
            // Fallback: fill from DESK tabs then SYSTEM.
            primary = [...withPriority];
            for (const t of [...deskTabs, ...backtestTabs, ...systemTabs]) {
                if (primary.length >= 4) break;
                if (!primary.some((p) => p.id === t.id)) primary.push(t);
            }
        }

        const overflow = all.filter((t) => !primary.some((p) => p.id === t.id));
        return { primaryTabs: primary.slice(0, 4), overflowTabs: overflow };
    }, [appMode, mode, researchModeEnabled]);

    const handleTabClick = useCallback((tabId: string) => {
        if (tabId === '__more__') {
            setMoreOpen(true);
            return;
        }
        onTabChange(tabId);
        setMoreOpen(false);
    }, [onTabChange]);

    const bottomTabs: NavTab[] = useMemo(() => {
        if (overflowTabs.length === 0) return primaryTabs;
        return [
            ...primaryTabs.slice(0, 4),
            {
                id: '__more__',
                label: 'More',
                section: 'SYSTEM',
                question: '',
                icon: 'MoreHorizontal',
                requiresRunId: false,
                visibleInModes: ['prod', 'research', 'dev'],
                requiresResearchToggle: false,
            },
        ];
    }, [overflowTabs.length, primaryTabs]);

    // Check if activeTab is in overflow (shown in More menu)
    const activeInOverflow = overflowTabs.some((t) => t.id === activeTab);

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
            {/* Bottom Tab Bar */}
            <div className="mobile-bottom-bar">
                <div className="flex items-end justify-around px-1 pt-1.5 pb-1">
                    {bottomTabs.map(tab => {
                        const Icon = tab.icon ? ICON_MAP[tab.icon] : undefined;
                        const isMore = tab.id === '__more__';
                        const isActive = isMore ? (moreOpen || activeInOverflow) : activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => handleTabClick(tab.id)}
                                className="mobile-nav-btn group"
                                aria-label={tab.label}
                            >
                                <div className={cn(
                                    'relative flex items-center justify-center w-10 h-8 rounded-2xl transition-all duration-200',
                                    isActive
                                        ? 'bg-cyan-500/15'
                                        : 'bg-transparent group-active:bg-white/[0.08]'
                                )}>
                                    {Icon && (
                                        <Icon
                                            className={cn(
                                                'h-[22px] w-[22px] transition-colors duration-150',
                                                isActive
                                                    ? 'text-cyan-400'
                                                    : 'text-neutral-500 group-hover:text-neutral-300'
                                            )}
                                            strokeWidth={isActive ? 2.2 : 1.8}
                                        />
                                    )}
                                    {/* Active indicator dot */}
                                    {isActive && (
                                        <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(0,198,255,0.8)]" />
                                    )}
                                    {/* Badge for More when active tab is in overflow */}
                                    {isMore && activeInOverflow && !moreOpen && (
                                        <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-cyan-400" />
                                    )}
                                </div>
                                <span className={cn(
                                    'text-[10px] leading-tight mt-0.5 transition-colors duration-150',
                                    isActive
                                        ? 'text-cyan-400 font-semibold'
                                        : 'text-neutral-500 font-medium'
                                )}>
                                    {tab.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
                {/* Safe area spacer */}
                <div className="h-safe-bottom" />
            </div>

            {/* More Bottom Sheet */}
            {moreOpen && overflowTabs.length > 0 && (
                <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm mobile-sheet-backdrop"
                        onClick={() => setMoreOpen(false)}
                    />

                    {/* Sheet */}
                    <div
                        ref={sheetRef}
                        className="absolute bottom-0 left-0 right-0 mobile-sheet"
                    >
                        {/* Drag handle */}
                        <div className="flex justify-center pt-3 pb-2">
                            <div className="h-1 w-10 rounded-full bg-white/20" />
                        </div>

                        {/* Header */}
                        <div className="px-5 pb-3 flex items-center justify-between">
                            <div>
                                <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">
                                    {appMode === 'quant'
                                        ? 'Quant Lab'
                                        : appMode === 'backtest'
                                            ? 'Backtest Lab'
                                            : 'Trading Desk'}
                                </div>
                                <div className="text-base font-semibold text-white/90">
                                    Navigation
                                </div>
                            </div>
                            <button
                                onClick={() => setMoreOpen(false)}
                                className="flex items-center justify-center h-8 w-8 rounded-full bg-white/[0.08] border border-white/[0.1] text-neutral-300 hover:bg-white/[0.12] active:scale-95 transition-all"
                                aria-label="Fermer"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Sections */}
                        <div className="px-4 pb-5 space-y-4 max-h-[60vh] overflow-y-auto overscroll-contain">
                            {(['DESK', 'QUANT', 'BACKTEST', 'SYSTEM'] as NavSection[]).map((section) => {
                                const info = SECTION_INFO[section];
                                const SIcon = info.icon ? ICON_MAP[info.icon] : undefined;
                                const items = overflowTabs.filter((t) => t.section === section);
                                if (items.length === 0) return null;

                                const sectionAccent = {
                                    DESK: 'border-l-cyan-500/40',
                                    QUANT: 'border-l-violet-500/40',
                                    BACKTEST: 'border-l-emerald-500/40',
                                    SYSTEM: 'border-l-amber-500/40',
                                };

                                return (
                                    <div key={section}>
                                        {/* Section header */}
                                        <div className="flex items-center gap-2 mb-2 px-1">
                                            {SIcon && (
                                                <SIcon size={14} className="text-neutral-400" />
                                            )}
                                            <span className="text-[10px] uppercase tracking-[0.18em] text-neutral-500 font-medium">
                                                {info.label}
                                            </span>
                                            <span className="text-[10px] text-neutral-600">{items.length}</span>
                                        </div>

                                        {/* Items grid */}
                                        <div className="grid grid-cols-2 gap-2">
                                            {items.map((tab) => {
                                                const Icon = tab.icon ? ICON_MAP[tab.icon] : undefined;
                                                const isTabActive = activeTab === tab.id;
                                                return (
                                                    <button
                                                        key={tab.id}
                                                        onClick={() => handleTabClick(tab.id)}
                                                        className={cn(
                                                            'flex items-center gap-2.5 rounded-xl border-l-2 px-3 py-3 text-left',
                                                            'transition-all duration-150 active:scale-[0.97]',
                                                            isTabActive
                                                                ? cn('bg-cyan-500/10 border-cyan-400/60', sectionAccent[section])
                                                                : cn('bg-white/[0.03] border-transparent hover:bg-white/[0.06]', sectionAccent[section])
                                                        )}
                                                    >
                                                        {Icon && (
                                                            <Icon
                                                                className={cn(
                                                                    'h-5 w-5 flex-shrink-0',
                                                                    isTabActive ? 'text-cyan-400' : 'text-neutral-400'
                                                                )}
                                                                strokeWidth={1.8}
                                                            />
                                                        )}
                                                        <span className={cn(
                                                            'text-[13px] leading-tight',
                                                            isTabActive ? 'text-white font-medium' : 'text-neutral-300'
                                                        )}>
                                                            {tab.label}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Safe area spacer */}
                        <div className="h-safe-bottom" />
                    </div>
                </div>
            )}
        </div>
    );
}
