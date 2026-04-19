/**
 * NavModel - Navigation Architecture for Stern Dashboard
 *
 * Modes:
 * - TERMINAL: live desk (monitoring only)
 * - QUANT: research-only (no live/price tabs)
 * - BACKTEST: offline backtest workbench
 *
 * Sections:
 * - DESK: primary trading workflow
 * - QUANT: research analytics (multi-run)
 * - SYSTEM: infrastructure/forensics
 * - BACKTEST: offline backtest lab
 *
 * DESK_MODE still controls env (prod/research/dev) but appMode gates
 * which tab set is exposed.
 */

export type DeskMode = 'prod' | 'research' | 'dev';
export type AppMode = 'terminal' | 'quant' | 'backtest';
export type NavSection = 'DESK' | 'QUANT' | 'SYSTEM' | 'BACKTEST';

export interface NavTab {
    id: string;
    label: string;
    section: NavSection;
    question: string; // Optional descriptive copy (unused in UI)
    icon: string; // Lucide icon name
    requiresRunId: boolean;
    visibleInModes: DeskMode[];
    requiresResearchToggle: boolean; // Only visible when Research Mode is ON
    deprecated?: boolean;
    featureGroup?: 'terminal' | 'quant' | 'backtest'; // Explicit grouping to avoid cross-mode leakage
    /** Lower number = higher priority in mobile bottom bar (1-4 shown). */
    mobilePriority?: number;
}

// =============================================================================
// Terminal Mode Tabs (monitoring only)
// =============================================================================
export const TERMINAL_TABS: NavTab[] = [
    // ============ DESK SECTION ============
    {
        id: 'overview',
        label: 'Overview',
        section: 'DESK',
        question: '',
        icon: 'LayoutDashboard',
        requiresRunId: false,
        visibleInModes: ['prod', 'research', 'dev'],
        requiresResearchToggle: false,
        featureGroup: 'terminal',
        mobilePriority: 1,
    },
    {
        id: 'terminal',
        label: 'Pro Terminal',
        section: 'DESK',
        question: '',
        icon: 'Terminal',
        requiresRunId: false,
        visibleInModes: ['prod', 'research', 'dev'],
        requiresResearchToggle: false,
        featureGroup: 'terminal',
        mobilePriority: 2,
    },
    {
        id: 'replay',
        label: 'Replay',
        section: 'DESK',
        question: '',
        icon: 'History',
        requiresRunId: true,
        visibleInModes: [],
        requiresResearchToggle: false,
        featureGroup: 'terminal',
        deprecated: true,
    },
    {
        id: 'pairs',
        label: 'Microstructure',
        section: 'DESK',
        question: '',
        icon: 'Link2',
        requiresRunId: false,
        visibleInModes: ['prod', 'research', 'dev'],
        requiresResearchToggle: false,
        featureGroup: 'terminal',
    },
    {
        id: 's3',
        label: 'Execution Lens',
        section: 'DESK',
        question: '',
        icon: 'Activity',
        requiresRunId: true,
        visibleInModes: [],
        requiresResearchToggle: false,
        featureGroup: 'terminal',
        deprecated: true,
    },
    {
        id: 'chart',
        label: 'Price Chart',
        section: 'DESK',
        question: '',
        icon: 'LineChart',
        requiresRunId: false,
        visibleInModes: ['prod', 'research', 'dev'],
        requiresResearchToggle: false,
        featureGroup: 'terminal',
    },
    {
        id: 'portfolio',
        label: 'Portfolio',
        section: 'DESK',
        question: '',
        icon: 'TrendingUp',
        requiresRunId: false,
        visibleInModes: ['prod', 'research', 'dev'],
        requiresResearchToggle: false,
        featureGroup: 'terminal',
        mobilePriority: 3,
    },
    {
        id: 'latency',
        label: 'Latency',
        section: 'DESK',
        question: '',
        icon: 'Timer',
        requiresRunId: true,
        visibleInModes: [],
        requiresResearchToggle: false,
        featureGroup: 'terminal',
        deprecated: true,
    },
    {
        id: 'anomalies',
        label: 'Anomalies',
        section: 'DESK',
        question: '',
        icon: 'AlertTriangle',
        requiresRunId: true,
        visibleInModes: [],
        requiresResearchToggle: false,
        featureGroup: 'terminal',
        deprecated: true,
    },
    {
        id: 'logs',
        label: 'Logs',
        section: 'DESK',
        question: '',
        icon: 'ScrollText',
        requiresRunId: false,
        visibleInModes: [],
        requiresResearchToggle: false,
        featureGroup: 'terminal',
        deprecated: true,
    },
    {
        id: 'emergency',
        label: 'Emergency',
        section: 'DESK',
        question: '',
        icon: 'AlertOctagon',
        requiresRunId: false,
        visibleInModes: [],
        requiresResearchToggle: false,
        featureGroup: 'terminal',
        deprecated: true,
    },

    // ============ SYSTEM SECTION ============
    {
        id: 'ib-account',
        label: 'Risk',
        section: 'SYSTEM',
        question: '',
        icon: 'Wallet',
        requiresRunId: false,
        visibleInModes: ['prod', 'research', 'dev'],
        requiresResearchToggle: false,
        featureGroup: 'terminal',
    },
    {
        id: 'vm-status',
        label: 'System',
        section: 'SYSTEM',
        question: '',
        icon: 'Server',
        requiresRunId: false,
        visibleInModes: ['prod', 'research', 'dev'],
        requiresResearchToggle: false,
        featureGroup: 'terminal',
    },

    {
        id: 'database',
        label: 'Database',
        section: 'SYSTEM',
        question: '',
        icon: 'Database',
        requiresRunId: false,
        visibleInModes: [],
        requiresResearchToggle: false,
        featureGroup: 'terminal',
        deprecated: true,
    },
    {
        id: 'config',
        label: 'Console',
        section: 'SYSTEM',
        question: '',
        icon: 'Settings',
        requiresRunId: true,
        visibleInModes: [],
        requiresResearchToggle: false,
        featureGroup: 'terminal',
        deprecated: true,
    },
    {
        id: 'export',
        label: 'Export',
        section: 'SYSTEM',
        question: 'Exporter fills, PnL et spreads en CSV',
        icon: 'Download',
        requiresRunId: false,
        visibleInModes: ['prod', 'research', 'dev'],
        requiresResearchToggle: false,
        featureGroup: 'terminal',
    },

];

// =============================================================================
// Quant Mode Tabs V2 (research-only; 4 pages with clear questions)
// =============================================================================
export const QUANT_TABS: NavTab[] = [
    {
        id: 'quant-data-quality',
        label: 'Data Quality',
        section: 'QUANT',
        question: 'Is my data clean? (Garbage in = garbage out)',
        icon: 'Shield',
        requiresRunId: false,
        visibleInModes: ['prod', 'research', 'dev'],
        requiresResearchToggle: false,
        featureGroup: 'quant',
    },
    {
        id: 'quant-funnel',
        label: 'Funnel',
        section: 'QUANT',
        question: 'Where does my edge appear and disappear?',
        icon: 'Filter',
        requiresRunId: false,
        visibleInModes: ['prod', 'research', 'dev'],
        requiresResearchToggle: false,
        featureGroup: 'quant',
        mobilePriority: 4,
    },
    {
        id: 'quant-regime',
        label: 'Regimes',
        section: 'QUANT',
        question: 'How does edge vary by market regime?',
        icon: 'Grid',
        requiresRunId: false,
        visibleInModes: ['prod', 'research', 'dev'],
        requiresResearchToggle: false,
        featureGroup: 'quant',
    },
    {
        id: 'quant-market',
        label: 'Market',
        section: 'QUANT',
        question: 'Is the market tradable right now?',
        icon: 'Activity',
        requiresRunId: false,
        visibleInModes: ['prod', 'research', 'dev'],
        requiresResearchToggle: false,
        featureGroup: 'quant',
        mobilePriority: 1,
    },
    {
        id: 'quant-slippage',
        label: 'Slippage',
        section: 'QUANT',
        question: "Comment l'execution erode-t-elle l'edge ?",
        icon: 'Timer',
        requiresRunId: true,
        visibleInModes: ['prod', 'research', 'dev'],
        requiresResearchToggle: false,
        featureGroup: 'quant',
    },
    {
        id: 'quant-signals',
        label: 'Signals',
        section: 'QUANT',
        question: 'Are my signals capturing edge?',
        icon: 'Target',
        requiresRunId: true,
        visibleInModes: ['prod', 'research', 'dev'],
        requiresResearchToggle: false,
        featureGroup: 'quant',
        mobilePriority: 3,
    },
    {
        id: 'quant-trades',
        label: 'Trades',
        section: 'QUANT',
        question: 'Is my strategy profitable?',
        icon: 'TrendingUp',
        requiresRunId: true,
        visibleInModes: ['prod', 'research', 'dev'],
        requiresResearchToggle: false,
        featureGroup: 'quant',
        mobilePriority: 2,
    },
    {
        id: 'quant-params',
        label: 'Params',
        section: 'QUANT',
        question: 'Which parameters should I adjust?',
        icon: 'FlaskRound',
        requiresRunId: false,
        visibleInModes: ['prod', 'research', 'dev'],
        requiresResearchToggle: false,
        featureGroup: 'quant',
    },
    {
        id: 'quant-sim-signals',
        label: 'Sim Signals',
        section: 'QUANT',
        question: 'Que donneraient les signaux refuses s\'ils etaient trades ?',
        icon: 'Ghost',
        requiresRunId: false,
        visibleInModes: ['prod', 'research', 'dev'],
        requiresResearchToggle: false,
        featureGroup: 'quant',
    },
    // Legacy tabs (deprecated - hidden but kept for URL compat)
    {
        id: 'quant-edge',
        label: 'Edge Analysis',
        section: 'QUANT',
        question: '',
        icon: 'BarChart3',
        requiresRunId: true,
        visibleInModes: [],
        requiresResearchToggle: false,
        featureGroup: 'quant',
        deprecated: true,
    },
    {
        id: 'quant-geometry',
        label: 'Signal Geometry',
        section: 'QUANT',
        question: '',
        icon: 'Activity',
        requiresRunId: true,
        visibleInModes: [],
        requiresResearchToggle: false,
        featureGroup: 'quant',
        deprecated: true,
    },
    {
        id: 'quant-parameters',
        label: 'Parameter Surfaces',
        section: 'QUANT',
        question: '',
        icon: 'FlaskRound',
        requiresRunId: false,
        visibleInModes: [],
        requiresResearchToggle: false,
        featureGroup: 'quant',
        deprecated: true,
    },
    {
        id: 'quant-microstructure',
        label: 'Microstructure',
        section: 'QUANT',
        question: '',
        icon: 'Activity',
        requiresRunId: true,
        visibleInModes: [],
        requiresResearchToggle: false,
        featureGroup: 'quant',
        deprecated: true,
    },
    {
        id: 'quant-stress',
        label: 'Stress Regimes',
        section: 'QUANT',
        question: '',
        icon: 'AlertOctagon',
        requiresRunId: false,
        visibleInModes: [],
        requiresResearchToggle: false,
        featureGroup: 'quant',
        deprecated: true,
    },
];

// =============================================================================
// Backtest Mode Tabs (offline backtest workbench)
// =============================================================================
export const BACKTEST_TABS: NavTab[] = [
    {
        id: 'bt-cockpit',
        label: 'Cockpit',
        section: 'BACKTEST',
        question: 'Vue transverse de gouvernance research S1 / S2 / S3',
        icon: 'LayoutDashboard',
        requiresRunId: false,
        visibleInModes: ['prod', 'research', 'dev'],
        requiresResearchToggle: false,
        featureGroup: 'backtest',
        mobilePriority: 1,
    },
    {
        id: 'bt-campaigns',
        label: 'Campaigns',
        section: 'BACKTEST',
        question: 'Registre des campagnes research par strategie',
        icon: 'FlaskRound',
        requiresRunId: false,
        visibleInModes: ['prod', 'research', 'dev'],
        requiresResearchToggle: false,
        featureGroup: 'backtest',
        mobilePriority: 2,
    },
    {
        id: 'bt-candidates',
        label: 'Candidates',
        section: 'BACKTEST',
        question: 'Leaderboard de robustesse et filtres de survivants',
        icon: 'Target',
        requiresRunId: false,
        visibleInModes: ['prod', 'research', 'dev'],
        requiresResearchToggle: false,
        featureGroup: 'backtest',
        mobilePriority: 3,
    },
    {
        id: 'bt-walk-forward',
        label: 'Walk-Forward',
        section: 'BACKTEST',
        question: 'Validation OOS temporelle et stabilite par folds',
        icon: 'Activity',
        requiresRunId: false,
        visibleInModes: ['prod', 'research', 'dev'],
        requiresResearchToggle: false,
        featureGroup: 'backtest',
    },
    {
        id: 'bt-promotion',
        label: 'Promotion',
        section: 'BACKTEST',
        question: 'Decision formelle, manifest et blocages de gouvernance',
        icon: 'ShieldCheck',
        requiresRunId: false,
        visibleInModes: ['prod', 'research', 'dev'],
        requiresResearchToggle: false,
        featureGroup: 'backtest',
        mobilePriority: 4,
    },
    {
        id: 'bt-paper-match',
        label: 'Paper Match',
        section: 'BACKTEST',
        question: 'Runtime parity, drift et rollback target',
        icon: 'Link2',
        requiresRunId: false,
        visibleInModes: ['prod', 'research', 'dev'],
        requiresResearchToggle: false,
        featureGroup: 'backtest',
    },
    {
        id: 'bt-runs',
        label: 'Runs',
        section: 'BACKTEST',
        question: 'Registre de diagnostics non promotables',
        icon: 'History',
        requiresRunId: false,
        visibleInModes: ['prod', 'research', 'dev'],
        requiresResearchToggle: false,
        featureGroup: 'backtest',
    },
    {
        id: 'bt-launch',
        label: 'Launch',
        section: 'BACKTEST',
        question: 'Orchestration secondaire des jobs a partir du contexte pipeline',
        icon: 'Play',
        requiresRunId: false,
        visibleInModes: ['prod', 'research', 'dev'],
        requiresResearchToggle: false,
        featureGroup: 'backtest',
    },
];

/**
 * Stern (crypto MM) whitelist: tabs whose data source exists in /api/state.
 * Everything not in this set is hidden even if declared above, keeping the
 * Keep the shell intact without exposing FX-only panels with no backend.
 */
const STERN_ENABLED_TABS: ReadonlySet<string> = new Set<string>([
    // Terminal
    'overview',
    'terminal',
    'chart',
    'pairs',
    'portfolio',
    'ib-account',
    'vm-status',
    'export',
    // Quant (crypto microstructure only)
    'quant-market',
    // Backtest (paper session replay from snapshot)
    'bt-cockpit',
]);

export function getTabsForMode(appMode: AppMode): NavTab[] {
    const base = appMode === 'backtest'
        ? BACKTEST_TABS
        : appMode === 'quant'
            ? QUANT_TABS
            : TERMINAL_TABS;
    return base.filter((tab) => STERN_ENABLED_TABS.has(tab.id));
}

/**
 * Get visible tabs based on current mode and research toggle
 */
export function getVisibleTabs(
    appMode: AppMode,
    deskMode: DeskMode,
    researchModeEnabled: boolean
): NavTab[] {
    const tabs = getTabsForMode(appMode);
    return tabs.filter((tab) => {
        // Check if tab is visible in current mode
        if (!tab.visibleInModes.includes(deskMode)) return false;

        // Check if tab requires research toggle
        if (tab.requiresResearchToggle && !researchModeEnabled) return false;

        // Hide deprecated tabs
        if (tab.deprecated) return false;

        return true;
    });
}

/**
 * Get tabs grouped by section
 */
export function getTabsBySection(
    appMode: AppMode,
    deskMode: DeskMode,
    researchModeEnabled: boolean
): Record<NavSection, NavTab[]> {
    const visibleTabs = getVisibleTabs(appMode, deskMode, researchModeEnabled);

    return {
        DESK: visibleTabs.filter((t) => t.section === 'DESK'),
        QUANT: visibleTabs.filter((t) => t.section === 'QUANT'),
        SYSTEM: visibleTabs.filter((t) => t.section === 'SYSTEM'),
        BACKTEST: visibleTabs.filter((t) => t.section === 'BACKTEST'),
    };
}

/**
 * Check if a NavTab object is visible in current context
 */
export function isTabVisible(
    tab: NavTab,
    appMode: AppMode,
    deskMode: DeskMode,
    researchModeEnabled: boolean
): boolean {
    if (appMode === 'quant' && tab.featureGroup !== 'quant') return false;
    if (appMode === 'terminal' && tab.featureGroup !== 'terminal') return false;
    if (appMode === 'backtest' && tab.featureGroup !== 'backtest') return false;
    if (!tab.visibleInModes.includes(deskMode)) return false;
    if (tab.requiresResearchToggle && !researchModeEnabled) return false;
    if (tab.deprecated) return false;

    return true;
}

/**
 * Check if a tab ID is valid and visible
 */
export function isTabIdVisible(
    tabId: string,
    appMode: AppMode,
    deskMode: DeskMode,
    researchModeEnabled: boolean
): boolean {
    const tab = getTabsForMode(appMode).find((t) => t.id === tabId);
    if (!tab) return false;
    return isTabVisible(tab, appMode, deskMode, researchModeEnabled);
}

/**
 * Get default tab for current mode
 */
export function getDefaultTab(appMode: AppMode, _deskMode: DeskMode): string {
    if (appMode === 'backtest') return 'bt-cockpit';
    if (appMode === 'quant') return 'quant-market';
    return 'overview';
}

/**
 * Section display info
 */
export const SECTION_INFO: Record<NavSection, { label: string; description: string; icon?: string }> = {
    DESK: {
        label: 'Desk',
        description: 'Primary trading workflow',
        icon: 'Terminal',
    },
    QUANT: {
        label: 'Quant Lab',
        description: 'Research-only analytics (multi-run)',
        icon: 'FlaskConical',
    },
    SYSTEM: {
        label: 'System',
        description: 'Infrastructure and forensics',
        icon: 'Server',
    },
    BACKTEST: {
        label: 'Backtest',
        description: 'Offline backtest workbench',
        icon: 'FlaskConical',
    },
};
