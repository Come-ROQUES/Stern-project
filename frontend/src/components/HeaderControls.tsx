/**
 * HeaderControls.tsx - Top navigation controls
 * 
 * Contains:
 * - Run selector (existing RunBanner logic)
 * - Research Mode toggle
 * - FRACTAL_MODE badge
 * - Quick actions
 */

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import type { AppMode, FractalMode } from '../lib/navModel';
import { GlassBadge } from './ui/glass';
import { cn } from '../lib/utils';
import { resetUiState } from '../lib/uiStateVersion';

// =============================================================================
// FRACTAL_MODE Context
// =============================================================================

interface FractalModeContextType {
    mode: FractalMode;
    setMode: (mode: FractalMode) => void;
    researchModeEnabled: boolean;
    setResearchModeEnabled: (enabled: boolean) => void;
    appMode: AppMode;
    setAppMode: (mode: AppMode) => void;
}

const FractalModeContext = createContext<FractalModeContextType | null>(null);

const STORAGE_KEY_MODE = 'fractal.mode';
const STORAGE_KEY_RESEARCH = 'fractal.researchMode';
const STORAGE_KEY_APP_MODE = 'fractal.appMode';

export function FractalModeProvider({ children }: { children: React.ReactNode }) {
    // Initialize from localStorage or env
    const [mode, setModeState] = useState<FractalMode>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_MODE);
        if (stored === 'prod' || stored === 'research' || stored === 'dev') {
            return stored;
        }
        // Check env-based default
        const envMode = (import.meta as any).env?.VITE_FRACTAL_MODE;
        if (envMode === 'prod' || envMode === 'research' || envMode === 'dev') {
            return envMode;
        }
        return 'prod'; // Default to prod
    });

    const [researchModeEnabled, setResearchModeEnabledState] = useState<boolean>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_RESEARCH);
        return stored === 'true';
    });

    const [appMode, setAppModeState] = useState<AppMode>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_APP_MODE);
        if (stored === 'terminal') return stored;
        return 'terminal';
    });

    const setMode = useCallback((newMode: FractalMode) => {
        setModeState((prev) => {
            if (prev === newMode) {
                return prev;
            }
            localStorage.setItem(STORAGE_KEY_MODE, newMode);
            return newMode;
        });
    }, []);

    const setResearchModeEnabled = useCallback((enabled: boolean) => {
        setResearchModeEnabledState((prev) => {
            if (prev === enabled) {
                return prev;
            }
            localStorage.setItem(STORAGE_KEY_RESEARCH, String(enabled));
            return enabled;
        });
    }, []);

    const setAppMode = useCallback((newMode: AppMode) => {
        const normalizedMode: AppMode = newMode === 'terminal' ? 'terminal' : 'terminal';
        setAppModeState((prev) => {
            if (prev === normalizedMode) {
                return prev;
            }
            localStorage.setItem(STORAGE_KEY_APP_MODE, normalizedMode);
            return normalizedMode;
        });
    }, []);

    // Quant Lab always forces research mode ON
    useEffect(() => {
        if (appMode === 'quant' && !researchModeEnabled) {
            setResearchModeEnabled(true);
        }
    }, [appMode, researchModeEnabled]);

    const value = useMemo(
        () => ({
            mode,
            setMode,
            researchModeEnabled,
            setResearchModeEnabled,
            appMode,
            setAppMode,
        }),
        [
            appMode,
            mode,
            researchModeEnabled,
            setAppMode,
            setMode,
            setResearchModeEnabled,
        ]
    );

    return (
        <FractalModeContext.Provider value={value}>
            {children}
        </FractalModeContext.Provider>
    );
}

export function useFractalMode() {
    const ctx = useContext(FractalModeContext);
    if (!ctx) {
        throw new Error('useFractalMode must be used within FractalModeProvider');
    }
    return ctx;
}

// =============================================================================
// ModeBadge - Shows current FRACTAL_MODE
// =============================================================================

interface ModeBadgeProps {
    mode: FractalMode;
    size?: 'sm' | 'md';
}

export function ModeBadge({ mode, size = 'sm' }: ModeBadgeProps) {
    const config = {
        prod: { label: 'PROD', variant: 'success' as const, pulse: true },
        research: { label: 'RESEARCH', variant: 'info' as const, pulse: false },
        dev: { label: 'DEV', variant: 'warning' as const, pulse: false },
    };
    const { label, variant, pulse } = config[mode];

    return (
        <GlassBadge variant={variant} size={size} pulse={pulse}>
            {label}
        </GlassBadge>
    );
}

// =============================================================================
// ResearchModeToggle - Toggle to show/hide research tabs
// =============================================================================

interface ResearchModeToggleProps {
    enabled: boolean;
    onChange: (enabled: boolean) => void;
    disabled?: boolean;
}

export function ResearchModeToggle({ enabled, onChange, disabled = false }: ResearchModeToggleProps) {
    return (
        <button
            onClick={() => !disabled && onChange(!enabled)}
            disabled={disabled}
            className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-200',
                enabled
                    ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
                    : 'bg-white/[0.03] border-white/[0.08] text-neutral-400 hover:text-white hover:border-white/[0.15]',
                disabled && 'opacity-50 cursor-not-allowed'
            )}
            title={enabled ? 'Hide Research tabs' : 'Show Research tabs'}
        >
            <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"
                />
            </svg>
            <span className="text-[10px] font-medium uppercase tracking-wider">
                Research
            </span>
            <span className={cn(
                'h-2 w-2 rounded-full transition-colors',
                enabled ? 'bg-cyan-400' : 'bg-neutral-600'
            )} />
        </button>
    );
}

// =============================================================================
// AppModeSwitch - Terminal vs Quant Lab vs Backtest
// =============================================================================

const APP_MODE_LABELS: Record<AppMode, string> = {
    terminal: 'Terminal',
    quant: 'Quant Lab',
    backtest: 'Backtest',
};

function AppModeSwitch({
    value,
    onChange,
}: {
    value: AppMode;
    onChange: (mode: AppMode) => void;
}) {
    const options: AppMode[] = ['terminal'];
    return (
        <div className="flex overflow-hidden rounded-lg border border-white/[0.10] bg-white/[0.04]">
            {options.map((opt) => (
                <button
                    key={opt}
                    onClick={() => onChange(opt)}
                    className={cn(
                        'px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] transition-all',
                        value === opt
                            ? 'bg-cyan-500/20 text-cyan-100 border-r border-white/10'
                            : 'text-neutral-400 hover:text-white border-r border-white/5 last:border-r-0'
                    )}
                >
                    {APP_MODE_LABELS[opt]}
                </button>
            ))}
        </div>
    );
}

// =============================================================================
// HeaderControls - Main header control strip
// =============================================================================

interface HeaderControlsProps {
    runSelector?: React.ReactNode; // Existing RunBanner
    className?: string;
    onAppModeChange?: (mode: AppMode) => void;
}

export function HeaderControls({
    runSelector,
    className,
    onAppModeChange,
}: HeaderControlsProps) {
    const {
        mode,
        researchModeEnabled,
        setResearchModeEnabled,
        appMode,
        setAppMode,
    } = useFractalMode();
    const handleAppModeChange = onAppModeChange ?? setAppMode;
    const handleResetUi = () => {
        resetUiState();
        if (typeof window !== 'undefined') {
            window.location.reload();
        }
    };

    return (
        <div className={cn(
            'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4',
            'rounded-xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl px-3 sm:px-4 py-3',
            className
        )}>
            {/* Left: Run selector */}
            <div className="w-full sm:flex-1 min-w-0">
                {runSelector}
            </div>

            {/* Right: Mode badge + app mode */}
            <div className="w-full sm:w-auto flex items-center justify-between sm:justify-end gap-3">
                <button
                    onClick={handleResetUi}
                    className={cn(
                        'hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border',
                        'border-white/[0.12] text-neutral-300 text-[10px] uppercase tracking-[0.14em]',
                        'bg-white/[0.04] hover:bg-white/[0.08] hover:text-white transition-all'
                    )}
                    title="Reset UI local state"
                >
                    Reset UI
                </button>
                <div className="flex items-center gap-2">
                    <AppModeSwitch value={appMode} onChange={handleAppModeChange} />
                    <ModeBadge mode={mode} />
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// QuickActions - Optional quick action buttons
// =============================================================================

interface QuickAction {
    id: string;
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    variant?: 'default' | 'danger';
}

interface QuickActionsProps {
    actions: QuickAction[];
}

export function QuickActions({ actions }: QuickActionsProps) {
    return (
        <div className="flex items-center gap-2">
            {actions.map((action) => (
                <button
                    key={action.id}
                    onClick={action.onClick}
                    className={cn(
                        'px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider rounded-lg border transition-all duration-200',
                        action.variant === 'danger'
                            ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                            : 'bg-white/[0.05] border-white/[0.10] text-neutral-300 hover:bg-white/[0.08] hover:text-white'
                    )}
                >
                    {action.icon}
                    {action.label}
                </button>
            ))}
        </div>
    );
}

// =============================================================================
// ConnectionStatus - Live connection indicator
// =============================================================================

interface ConnectionStatusProps {
    connected: boolean;
    latencyMs?: number | null;
    lastUpdate?: string | null;
}

export function ConnectionStatus({ connected, latencyMs, lastUpdate }: ConnectionStatusProps) {
    const [relativeTime, setRelativeTime] = useState<string>('');

    useEffect(() => {
        if (!lastUpdate) return;

        const updateRelative = () => {
            const diff = Date.now() - new Date(lastUpdate).getTime();
            if (diff < 5000) setRelativeTime('just now');
            else if (diff < 60000) setRelativeTime(`${Math.floor(diff / 1000)}s ago`);
            else setRelativeTime(`${Math.floor(diff / 60000)}m ago`);
        };

        updateRelative();
        // PERFORMANCE FIX (08 Jan 2026): Increased from 1s to 5s
        const interval = setInterval(updateRelative, 5000);
        return () => clearInterval(interval);
    }, [lastUpdate]);

    return (
        <div className="flex items-center gap-2 text-[10px]">
            <span className={cn(
                'h-2 w-2 rounded-full',
                connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'
            )} />
            <span className={connected ? 'text-emerald-400' : 'text-red-400'}>
                {connected ? 'LIVE' : 'OFFLINE'}
            </span>
            {latencyMs != null && (
                <span className="text-neutral-500">
                    {latencyMs < 1000 ? `${latencyMs}ms` : `${(latencyMs / 1000).toFixed(1)}s`}
                </span>
            )}
            {relativeTime && (
                <span className="text-neutral-600">{relativeTime}</span>
            )}
        </div>
    );
}
