/**
 * AppV2.tsx - Refactored main application with Liquid Glass design
 *
 * Uses:
 * - NavModel for navigation
 * - FractalModeProvider for mode context
 * - SideNav for section-based navigation
 * - HeaderControls for run selector + research toggle
 * - Glass design system components
 */

import React, {
    Suspense,
    useCallback,
    useMemo,
    useState,
    useEffect,
    useRef,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    getDefaultTab,
    getTabsForMode,
    isTabIdVisible,
    BACKTEST_TABS,
    QUANT_TABS,
    TERMINAL_TABS,
    type AppMode,
    type FractalMode,
} from './lib/navModel';
import {
    FractalModeProvider,
    useFractalMode,
    HeaderControls,
} from './components/HeaderControls';
import { SideNav, MobileNav } from './components/SideNav';
import { RunBanner } from './components/RunBanner';
import { DeskBanner } from './components/DeskBanner';
import { resolveStatusBarGateway } from './components/StatusBar.utils';
import { DevPanel } from './components/DevPanel';
import { cn } from './lib/utils';
import {
    api,
    setApiPerfScreen,
    SystemStatus,
    MarketProfileRow,
    Ohlc,
    Signal,
} from './lib/api';
import { activeContext, defaultScope } from './lib/activeContext';
import { useRunContext, useRunId } from './lib/useRunContext';
import {
    PortfolioEpochProvider,
    usePortfolioEpochContext,
} from './lib/PortfolioEpochContext';
import { useDashboardPoll } from './lib/dashboardPollingBus';
import { loadApexChartsRuntime } from './lib/apexchartsRuntime';
import { ensureFreshIndexAsset } from './lib/buildFreshness';

// Import page components
// Quant Lab V3 - Phase 6: LINKED BRUSHING + DATA SCOPE
import { SelectionProvider, SelectionBadges, useQuantLabScope } from './lib/SelectionContext';
import { QuantLabHeader } from './components/quantlab/QuantLabHeader';
// Quant Lab V3 - Phase 7: RESEARCH JOURNAL
import { ResearchJournal, JournalToggleButton } from './components/quantlab/ResearchJournal';
// V4.1: Desk-grade truth - ContextGuard blocks rendering when run_id is invalid
import { ContextGuard } from './components/InvalidContextScreen';
import { DashboardTimeframeProvider } from './lib/timeframeContext';
// Backtest Lab
import { BacktestProvider, useBacktestContext } from './lib/useBacktestContext';
// Prefetch Overview snapshot at app startup (before user navigates)
import {
    prewarmOverviewPrefetch,
    startOverviewPrefetch,
} from './lib/overviewPrefetch';
import { ViewActivityProvider } from './lib/viewActivity';
import {
    pruneTabCacheEntries,
    sameTabCacheEntries,
    type TabCacheEntry,
} from './lib/tabCache';
import { useBundleRuns } from './lib/useBundleRuns';
import { useCommissionView } from './lib/useCommissionView';
import { useDeskRunContext } from './lib/useDeskRunContext';

startOverviewPrefetch();

const loadS2PairsDesk = () =>
    import('./components/S2PairsDesk');
const loadS3TrendDesk = () =>
    import('./components/S3TrendDesk');
const loadStrategyOverview = () =>
    import('./components/StrategyOverview');
const loadProTerminalPanel = () =>
    import('./components/ProTerminalPanel');
const loadPriceTradesTV = () =>
    import('./components/PriceTradesTV');
const loadPortfolioTab = () =>
    import('./components/PortfolioTab');
const loadDatabasePanelCanonical = () =>
    import('./components/DatabasePanelCanonical');
const loadLogsPanel = () =>
    import('./components/LogsPanel');
const loadEmergencyPanel = () =>
    import('./components/EmergencyPanel');

// Stern crypto panels — lightweight, consume /api/state via sternApi.
import * as SternPanels from './components/stern/panels';

const S2PairsDesk = React.lazy(() =>
    loadS2PairsDesk().then((module) => ({ default: module.S2PairsDesk }))
);
const S3TrendDesk = React.lazy(() =>
    loadS3TrendDesk().then((module) => ({ default: module.S3TrendDesk }))
);
const StrategyOverview = React.lazy(() =>
    loadStrategyOverview().then((module) => ({ default: module.StrategyOverview }))
);
const ProTerminalPanel = React.lazy(() =>
    loadProTerminalPanel().then((module) => ({ default: module.ProTerminalPanel }))
);
const SignalReplayPanel = React.lazy(() =>
    import('./components/SignalReplayPanel').then((module) => ({ default: module.SignalReplayPanel }))
);
const PriceTradesTV = React.lazy(() =>
    loadPriceTradesTV().then((module) => ({ default: module.PriceTradesTV }))
);
const PerformancePanel = React.lazy(() =>
    import('./components/PerformancePanel').then((module) => ({ default: module.PerformancePanel }))
);
const LogsPanel = React.lazy(() =>
    loadLogsPanel().then((module) => ({ default: module.LogsPanel }))
);
const EmergencyPanel = React.lazy(() =>
    loadEmergencyPanel().then((module) => ({ default: module.EmergencyPanel }))
);
const MarketProfileCanonical = React.lazy(() =>
    import('./components/MarketProfileCanonical').then((module) => ({ default: module.MarketProfileCanonical }))
);
const SignalAnalyticsV2 = React.lazy(() =>
    import('./components/SignalAnalyticsV2').then((module) => ({ default: module.SignalAnalyticsV2 }))
);
const ExecutionPanel = React.lazy(() =>
    import('./components/ExecutionPanel').then((module) => ({ default: module.ExecutionPanel }))
);
const TradesTable = React.lazy(() =>
    import('./components/TradesTable').then((module) => ({ default: module.TradesTable }))
);
const PNLPanel = React.lazy(() =>
    import('./components/PNLPanel').then((module) => ({ default: module.PNLPanel }))
);
const PortfolioTab = React.lazy(() =>
    loadPortfolioTab().then((module) => ({ default: module.PortfolioTab }))
);
const DatabasePanelCanonical = React.lazy(() =>
    loadDatabasePanelCanonical().then((module) => ({ default: module.DatabasePanelCanonical }))
);
const Cockpit = React.lazy(() =>
    import('./components/Cockpit').then((module) => ({ default: module.Cockpit }))
);
const ResearchDesk = React.lazy(() =>
    import('./components/ResearchDesk').then((module) => ({ default: module.ResearchDesk }))
);
const IBAccountPanel = React.lazy(() =>
    import('./components/IBAccountPanel').then((module) => ({ default: module.IBAccountPanel }))
);
const LatencyPanel = React.lazy(() =>
    import('./components/LatencyPanel').then((module) => ({ default: module.LatencyPanel }))
);
const VMStatusDesk = React.lazy(() =>
    import('./components/VMStatusDesk').then((module) => ({ default: module.VMStatusDesk }))
);
const ParameterSurfaces = React.lazy(() =>
    import('./components/quantlab/ParameterSurfaces').then((module) => ({ default: module.ParameterSurfaces }))
);
const SimulatedSignals = React.lazy(() =>
    import('./components/quantlab/SimulatedSignals').then((module) => ({ default: module.SimulatedSignals }))
);
const MarketConditions = React.lazy(() =>
    import('./components/quantlab-v2/pages/MarketConditions').then((module) => ({ default: module.MarketConditions }))
);
const SignalQuality = React.lazy(() =>
    import('./components/quantlab-v2/pages/SignalQuality').then((module) => ({ default: module.SignalQuality }))
);
const TradePerformance = React.lazy(() =>
    import('./components/quantlab-v2/pages/TradePerformance').then((module) => ({ default: module.TradePerformance }))
);
const ParameterTuning = React.lazy(() =>
    import('./components/quantlab-v2/pages/ParameterTuning').then((module) => ({ default: module.ParameterTuning }))
);
const Regimes = React.lazy(() =>
    import('./components/quantlab-v2/pages/Regimes').then((module) => ({ default: module.Regimes }))
);
const DataQualityPage = React.lazy(() =>
    import('./components/quantlab-v2/pages/DataQualityV3').then((module) => ({ default: module.DataQualityV3 }))
);
const FunnelView = React.lazy(() =>
    import('./components/quantlab/FunnelView').then((module) => ({ default: module.FunnelView }))
);
const SlippageLab = React.lazy(() =>
    import('./components/quantlab/SlippageLab').then((module) => ({ default: module.SlippageLab }))
);
const AnomaliesPanel = React.lazy(() =>
    import('./components/AnomaliesPanel').then((module) => ({ default: module.AnomaliesPanel }))
);
const ExportDesk = React.lazy(() =>
    import('./components/ExportDesk').then((module) => ({ default: module.ExportDesk }))
);
const MarketProfileGraph = React.lazy(() =>
    import('./components/graphs/MarketProfileGraph').then((module) => ({ default: module.MarketProfileGraph }))
);
const SignalAnalyticsGraph = React.lazy(() =>
    import('./components/graphs/SignalAnalyticsGraph').then((module) => ({ default: module.SignalAnalyticsGraph }))
);
const ResearchDeskGraph = React.lazy(() =>
    import('./components/graphs/ResearchDeskGraph').then((module) => ({ default: module.ResearchDeskGraph }))
);
const BacktestPipelineWorkspace = React.lazy(() =>
    import('./components/backtest/BacktestPipelineWorkspace').then((module) => ({ default: module.BacktestPipelineWorkspace }))
);
const BacktestResults = React.lazy(() =>
    import('./components/backtest/BacktestResults').then((module) => ({ default: module.BacktestResults }))
);
const BacktestDataHealth = React.lazy(() =>
    import('./components/backtest/BacktestDataHealth').then((module) => ({ default: module.BacktestDataHealth }))
);


// =============================================================================
// Error Boundary for tabs
// =============================================================================

type BuildAssets = {
    index: string | null;
    appv2: string | null;
};

type TabCacheByMode = Record<AppMode, TabCacheEntry[]>;

const REACT_185_RECOVERY_KEY = "fractal.react185.recovery_once";
const TAB_CACHE_TTL_MS = 90_000;
const TAB_CACHE_MAX_ENTRIES = 3;

function compactAssetName(value: string | null): string | null {
    if (!value) return null;
    const base = value.split('#')[0]?.split('?')[0] ?? value;
    const tail = base.split('/').pop() ?? base;
    return tail.replace(/\.(js|css)$/i, '');
}

function pickAsset(urls: string[], pattern: RegExp): string | null {
    for (const url of urls) {
        if (pattern.test(url)) return url;
    }
    return null;
}

function isReact185Error(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const message = error.message || "";
    return (
        message.includes("Minified React error #185") ||
        message.includes("Maximum update depth exceeded")
    );
}

class TabBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean; message?: string }
> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, message: undefined };
    }

    static getDerivedStateFromError(error: any) {
        return { hasError: true, message: error?.message || 'Unknown error' };
    }

    componentDidCatch(error: any, info: any) {
        console.error('Tab render error', error, info);
        if (
            isReact185Error(error) &&
            typeof window !== "undefined"
        ) {
            try {
                const alreadyRecovered =
                    sessionStorage.getItem(REACT_185_RECOVERY_KEY) === "1";
                if (!alreadyRecovered) {
                    sessionStorage.setItem(REACT_185_RECOVERY_KEY, "1");
                    console.warn(
                        "[TabBoundary] React #185 detected. Triggering one controlled reload."
                    );
                    window.setTimeout(() => window.location.reload(), 80);
                }
            } catch {
                // Ignore storage errors and keep fallback UI.
            }
        }
    }

    render() {
        if (this.state.hasError) {
            return (
                <div
                    className={
                        'rounded-xl border border-red-500/30 bg-red-500/10 ' +
                        'p-6 text-center'
                    }
                >
                    <div className="text-red-400 font-medium mb-2">
                        Tab Render Error
                    </div>
                    <div className="text-xs text-neutral-400">
                        {this.state.message || 'Hard refresh and check console.'}
                    </div>
                </div>
            );
        }
        return this.props.children as JSX.Element;
    }
}

// =============================================================================
// Tab Content Router
// =============================================================================

type GraphRoute =
    | { kind: 'graph'; graphId: 'quant-microstructure' }
    | { kind: 'graph'; graphId: 'quant-geometry' }
    | { kind: 'graph'; graphId: 'quant-parameters' }
    | { kind: 'tab'; tabId: string };

type ResolvedHashRoute = {
    appMode: AppMode;
    route: GraphRoute;
};

const HASH_TAB_OWNERS: Record<string, AppMode> = [
    ...TERMINAL_TABS,
    ...QUANT_TABS,
    ...BACKTEST_TABS,
].reduce<Record<string, AppMode>>((acc, tab) => {
    if (tab.featureGroup) {
        acc[tab.id] = tab.featureGroup;
    }
    return acc;
}, {});

function sameRoute(a: GraphRoute, b: GraphRoute): boolean {
    if (a.kind !== b.kind) return false;
    if (a.kind === 'graph' && b.kind === 'graph') {
        return a.graphId === b.graphId;
    }
    if (a.kind === 'tab' && b.kind === 'tab') {
        return a.tabId === b.tabId;
    }
    return false;
}

function TabLoadingFallback({ label = 'Loading view' }: { label?: string }) {
    return (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 text-sm text-neutral-400 backdrop-blur-xl">
            <div className="text-[10px] uppercase tracking-[0.22em] text-neutral-500">
                STERN
            </div>
            <div className="mt-2 text-white">{label}</div>
            <div className="mt-1 text-xs text-neutral-500">
                Chargement differe du module pour alleger le shell initial.
            </div>
        </div>
    );
}

function withTabSuspense(
    node: React.ReactNode,
    label?: string
): JSX.Element {
    return <Suspense fallback={<TabLoadingFallback label={label} />}>{node}</Suspense>;
}

type RenderTabOptions = {
    emergencyBuildReady?: boolean;
};

function renderAppModeTab(
    appMode: AppMode,
    tabId: string,
    options: RenderTabOptions = {}
): React.ReactNode {
    if (appMode === 'backtest') {
        return renderBacktestTab(tabId);
    }
    if (appMode === 'quant') {
        return renderQuantTab(tabId);
    }
    return renderTerminalTab(tabId, options);
}

function parseRouteFromHash(
    appMode: AppMode,
    fractalMode: FractalMode,
    researchModeEnabled: boolean
): ResolvedHashRoute {
    const raw = (
        typeof window !== 'undefined' ? window.location.hash : ''
    ).replace(/^#/, '');
    // Normalize legacy research hashes
    const normalized = raw.replace(/^\/research\//, '/quant/');
    const path = normalized;
    if (path.startsWith('/quant/microstructure/graphs')) {
        return {
            appMode: 'quant',
            route: { kind: 'graph', graphId: 'quant-microstructure' },
        };
    }
    if (path.startsWith('/quant/geometry/graphs')) {
        return {
            appMode: 'quant',
            route: { kind: 'graph', graphId: 'quant-geometry' },
        };
    }
    if (path.startsWith('/quant/parameters/graphs')) {
        return {
            appMode: 'quant',
            route: { kind: 'graph', graphId: 'quant-parameters' },
        };
    }
    const hashTab = path.startsWith('/') ? path.slice(1) : path;
    const targetAppMode = hashTab ? HASH_TAB_OWNERS[hashTab] ?? appMode : appMode;
    const tabExists = hashTab ? HASH_TAB_OWNERS[hashTab] != null : false;
    if (hashTab && tabExists) {
        return {
            appMode: targetAppMode,
            route: { kind: 'tab', tabId: hashTab },
        };
    }
    return {
        appMode,
        route: { kind: 'tab', tabId: getDefaultTab(appMode, fractalMode) },
    };
}

function normalizeHashTarget(target: string): string {
    if (!target) return '';
    return target.startsWith('#') ? target : `#${target}`;
}

function setHashIfChanged(target: string): void {
    if (typeof window === 'undefined') return;
    const normalizedTarget = normalizeHashTarget(target);
    if (window.location.hash === normalizedTarget) return;
    window.location.hash = normalizedTarget;
}

function renderTerminalTab(tabId: string, _options: RenderTabOptions = {}) {
    switch (tabId) {
        case 'overview':
            return <SternPanels.OverviewPanel />;
        case 'terminal':
            return <SternPanels.ProTerminalPanel />;
        case 'chart':
            return <SternPanels.PriceChartPanel />;
        case 'pairs':
            return <SternPanels.MicrostructurePanel />;
        case 'portfolio':
        case 'performance':
            return <SternPanels.PortfolioPanel />;
        case 'ib-account':
            return <SternPanels.RiskPanel />;
        case 'vm-status':
            return <SternPanels.SystemPanel />;
        case 'export':
            return <SternPanels.ExportPanel />;
        default:
            return (
                <div className="text-center text-neutral-400 py-12">
                    Tab not implemented: {tabId}
                </div>
            );
    }
}

function renderQuantTab(tabId: string) {
    switch (tabId) {
        // V3 Quant Lab - Phase 1: DATA QUALITY (with scope header)
        case 'quant-data-quality':
            return (
                <div className="flex flex-col h-full">
                    <QuantLabHeader title="Data Quality" subtitle="Integrite et qualite des donnees" />
                    <div className="flex-1 overflow-auto">
                        {withTabSuspense(<DataQualityPage />, 'Loading data quality')}
                    </div>
                </div>
            );
        // V3 Quant Lab - Phase 3: FUNNEL VIEW (with scope header)
        case 'quant-funnel':
            return (
                <div className="flex flex-col h-full">
                    <QuantLabHeader title="Funnel Analysis" subtitle="Shock → Signal → Trade → PnL" />
                    <div className="flex-1 overflow-auto">
                        {withTabSuspense(<FunnelView />, 'Loading funnel')}
                    </div>
                </div>
            );
        // V3 Quant Lab - Phase 4: REGIMES V2 (with scope header)
        case 'quant-regime':
            return (
                <div className="flex flex-col h-full">
                    <QuantLabHeader title="Regime Analysis" subtitle="E[outcome] par spread/vol/session" />
                    <div className="flex-1 overflow-auto">
                        {withTabSuspense(<Regimes />, 'Loading regimes')}
                    </div>
                </div>
            );
        // V3 Quant Lab - Phase 5: PARETO (with scope header)
        case 'quant-parameters':
            return (
                <div className="flex flex-col h-full">
                    <QuantLabHeader title="Parameter Surfaces" subtitle="Frontiere de Pareto return/drawdown" />
                    <div className="flex-1 overflow-auto">
                        {withTabSuspense(<ParameterSurfaces />, 'Loading parameter surfaces')}
                    </div>
                </div>
            );
        // V2 Quant Lab pages (with scope header for consistency)
        case 'quant-market':
            return (
                <div className="flex flex-col h-full">
                    <QuantLabHeader title="Microstructure" subtitle="Realized vol, momentum, depth imbalance, micro-bias" />
                    <div className="flex-1 overflow-auto">
                        <SternPanels.MicrostructurePanel />
                    </div>
                </div>
            );
        case 'quant-slippage':
            return (
                <div className="flex flex-col h-full">
                    <QuantLabHeader
                        title="Slippage"
                        subtitle="Execution quality: IS, latence, spread, outliers"
                    />
                    <div className="flex-1 overflow-auto">
                        {withTabSuspense(<SlippageLab />, 'Loading slippage')}
                    </div>
                </div>
            );
        case 'quant-signals':
            return (
                <div className="flex flex-col h-full">
                    <QuantLabHeader title="Signal Quality" subtitle="Edge scatter, rejection funnel" />
                    <div className="flex-1 overflow-auto">
                        {withTabSuspense(<ContextGuard><SignalQuality /></ContextGuard>, 'Loading signal quality')}
                    </div>
                </div>
            );
        case 'quant-sim-signals':
            return (
                <div className="flex flex-col h-full">
                    <QuantLabHeader title="Signals Simulés" subtitle="Refusés rejoués en PnL virtuel" />
                    <div className="flex-1 overflow-auto">
                        {withTabSuspense(<ContextGuard><SimulatedSignals /></ContextGuard>, 'Loading simulated signals')}
                    </div>
                </div>
            );
        case 'quant-trades':
            return (
                <div className="flex flex-col h-full">
                    <QuantLabHeader title="Trade Performance" subtitle="Equity curve, PnL distribution" />
                    <div className="flex-1 overflow-auto">
                        {withTabSuspense(<ContextGuard><TradePerformance /></ContextGuard>, 'Loading trade performance')}
                    </div>
                </div>
            );
        case 'quant-params':
            return (
                <div className="flex flex-col h-full">
                    <QuantLabHeader title="Parameter Tuning" subtitle="Sweep results, sensitivity" />
                    <div className="flex-1 overflow-auto">
                        {withTabSuspense(<ParameterTuning />, 'Loading parameter tuning')}
                    </div>
                </div>
            );
        // Legacy pages (deprecated - redirected to V2 equivalents)
        case 'quant-edge':
            return (
                <div className="flex flex-col h-full">
                    <QuantLabHeader title="Trade Performance" subtitle="Equity curve, PnL distribution" />
                    <div className="flex-1 overflow-auto">
                        {withTabSuspense(<ContextGuard><TradePerformance /></ContextGuard>, 'Loading trade performance')}
                    </div>
                </div>
            );
        case 'quant-geometry':
            return (
                <div className="flex flex-col h-full">
                    <QuantLabHeader title="Signal Quality" subtitle="Edge scatter, rejection funnel" />
                    <div className="flex-1 overflow-auto">
                        {withTabSuspense(<ContextGuard><SignalQuality /></ContextGuard>, 'Loading signal quality')}
                    </div>
                </div>
            );
        case 'quant-microstructure':
            return (
                <div className="flex flex-col h-full">
                    <QuantLabHeader title="Market Conditions" subtitle="Spreads, volatilite, data freshness" />
                    <div className="flex-1 overflow-auto">
                        {withTabSuspense(<MarketConditions />, 'Loading market conditions')}
                    </div>
                </div>
            );
        default:
            return (
                <div className="text-center text-neutral-400 py-12">
                    Tab not implemented: {tabId}
                </div>
            );
    }
}

function canIdlePreloadHeavyTabs(): boolean {
    if (typeof navigator === 'undefined') return true;
    const nav = navigator as Navigator & {
        connection?: {
            saveData?: boolean;
            effectiveType?: string;
        };
    };
    if (nav.connection?.saveData) return false;
    if (nav.connection?.effectiveType && nav.connection.effectiveType !== '4g') {
        return false;
    }
    return true;
}

// =============================================================================
// Backtest Tab Router
// =============================================================================

function renderBacktestTab(tabId: string) {
    switch (tabId) {
        case 'bt-cockpit':
            return <SternPanels.BacktestCockpitPanel />;
        default:
            return (
                <div className="text-center text-neutral-400 py-12">
                    Tab not implemented: {tabId}
                </div>
            );
    }
}

// =============================================================================
// Backtest Running Badge (sidebar indicator)
// =============================================================================

function BacktestRunningBadge({ onNavigate }: { onNavigate: () => void }) {
    const { campaignStatus } = useBacktestContext();
    const runningJobs = campaignStatus?.jobs.filter((j) => j.status === 'running' || j.status === 'queued') ?? [];
    if (runningJobs.length === 0) return null;

    const running = runningJobs.filter((j) => j.status === 'running').length;
    const queued = runningJobs.filter((j) => j.status === 'queued').length;

    return (
        <button
            onClick={onNavigate}
            className={cn(
                'w-full px-3 py-2 rounded-lg text-left transition-all',
                'border border-cyan-500/20 bg-cyan-500/[0.06]',
                'hover:bg-cyan-500/[0.12] hover:border-cyan-500/30',
            )}
        >
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-[10px] uppercase tracking-wider text-cyan-300 font-medium">
                    BT Running
                </span>
            </div>
            <div className="text-[9px] text-neutral-500 mt-0.5 pl-4">
                {running > 0 && `${running} active`}
                {running > 0 && queued > 0 && ' / '}
                {queued > 0 && `${queued} queued`}
            </div>
        </button>
    );
}

// =============================================================================
// Main App Content (inside providers)
// =============================================================================

function AppContent() {
    const { mode, researchModeEnabled, setResearchModeEnabled, appMode, setAppMode } = useFractalMode();
    const quantScope = useQuantLabScope();
    const runId = useRunId();
    const { run: resolvedRun } = useRunContext();
    const { selectedEpoch } = usePortfolioEpochContext();
    const { enabled: bundleEnabled, dwRunId, s2RunId, tfRunId } = useBundleRuns();
    const { commissionView } = useCommissionView();
    const { data: deskRunContext } = useDeskRunContext({
        selectedRunId: runId,
        activeRunId: resolvedRun?.run_id ?? null,
        bundleEnabled,
        dwRunId,
        s2RunId,
        tfRunId,
    });
    const buildStamp = import.meta.env.VITE_BUILD_STAMP || 'dev';
    const [buildAssets, setBuildAssets] = useState<BuildAssets>({
        index: null,
        appv2: null,
    });

    const [route, setRoute] = useState<GraphRoute>(() =>
        parseRouteFromHash(appMode, mode, researchModeEnabled).route
    );
    const [tabCacheByMode, setTabCacheByMode] = useState<TabCacheByMode>({
        terminal: [],
        quant: [],
        backtest: [],
    });

    const syncGuardRef = useRef<{ windowStartMs: number; count: number }>({
        windowStartMs: 0,
        count: 0,
    });
    const overviewSeedRunId = deskRunContext.seed_run_id ?? null;

    const allowRouteSync = useCallback((reason: string): boolean => {
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        const guard = syncGuardRef.current;
        if (now - guard.windowStartMs > 250) {
            guard.windowStartMs = now;
            guard.count = 0;
        }
        guard.count += 1;
        if (guard.count > 24) {
            if (guard.count === 25) {
                console.error(
                    `[ROUTE_SYNC_GUARD] blocked potential update storm (${reason})`
                );
            }
            return false;
        }
        return true;
    }, []);

    const setAppModeIfChanged = useCallback((nextMode: AppMode) => {
        if (nextMode === appMode) return;
        if (!allowRouteSync("appMode")) return;
        setAppMode(nextMode);
    }, [appMode, allowRouteSync, setAppMode]);

    const setResearchModeIfChanged = useCallback((enabled: boolean) => {
        if (enabled === researchModeEnabled) return;
        if (!allowRouteSync("researchMode")) return;
        setResearchModeEnabled(enabled);
    }, [allowRouteSync, researchModeEnabled, setResearchModeEnabled]);

    const setRouteIfChanged = useCallback((nextRoute: GraphRoute) => {
        setRoute((prev) => {
            if (sameRoute(prev, nextRoute)) return prev;
            if (!allowRouteSync("route")) return prev;
            return nextRoute;
        });
    }, [allowRouteSync]);

    // Bootstrap hash sync once at mount.
    // Do not re-run on appMode changes, otherwise mode buttons get overridden
    // by the previous hash owner (terminal/quant/backtest).
    useEffect(() => {
        const hash = typeof window !== 'undefined' ? window.location.hash : '';
        if (!hash) return;
        const resolved = parseRouteFromHash(appMode, mode, researchModeEnabled);
        if (resolved.appMode !== appMode) {
            setAppModeIfChanged(resolved.appMode);
        }
        setRouteIfChanged(resolved.route);
    }, []);

    // Force research toggle on in Quant mode (purely research, no live coupling)
    useEffect(() => {
        if (appMode === 'quant' && !researchModeEnabled) {
            setResearchModeIfChanged(true);
        }
    }, [appMode, researchModeEnabled, setResearchModeIfChanged]);

    // Validate tab on mode/research change
    useEffect(() => {
        if (
            route.kind === 'tab' &&
            !isTabIdVisible(route.tabId, appMode, mode, researchModeEnabled)
        ) {
            const target = getTabsForMode(appMode).find((t) => t.id === route.tabId);
            if (target?.requiresResearchToggle && !researchModeEnabled) {
                setResearchModeIfChanged(true);
                return;
            }
            // Keep the requested tab; do not force a fallback.
        }
    }, [appMode, mode, researchModeEnabled, route, setResearchModeIfChanged]);

    // Switch route when app mode changes to avoid leaking terminal tabs into Quant and vice versa
    useEffect(() => {
        if (route.kind !== 'tab') {
            return;
        }
        if (isTabIdVisible(route.tabId, appMode, mode, researchModeEnabled)) {
            return;
        }
        setRouteIfChanged({ kind: 'tab', tabId: getDefaultTab(appMode, mode) });
    }, [appMode, mode, researchModeEnabled, route, setRouteIfChanged]);

    // Graph routes imply Quant Lab mode
    useEffect(() => {
        if (route.kind === 'graph' && appMode !== 'quant') {
            setAppModeIfChanged('quant');
        }
    }, [route, appMode, setAppModeIfChanged]);

    useEffect(() => {
        const onHashChange = () => {
            const hash = typeof window !== 'undefined' ? window.location.hash : '';
            if (!hash) return; // avoid resetting to default when hash is briefly cleared
            const resolved = parseRouteFromHash(appMode, mode, researchModeEnabled);
            if (resolved.appMode !== appMode) {
                setAppModeIfChanged(resolved.appMode);
            }
            setRouteIfChanged(resolved.route);
        };
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, [appMode, mode, researchModeEnabled, setAppModeIfChanged, setRouteIfChanged]);

    // Ensure research tabs force-enable research mode and keep the requested tab
    useEffect(() => {
        if (route.kind !== 'tab') return;
        const tab = getTabsForMode(appMode).find((t) => t.id === route.tabId);
        if (!tab || !tab.requiresResearchToggle) return;
        if (!researchModeEnabled) {
            setResearchModeIfChanged(true);
            setHashIfChanged(route.tabId);
            setRouteIfChanged({ kind: 'tab', tabId: route.tabId });
        }
    }, [appMode, route, researchModeEnabled, setResearchModeIfChanged, setRouteIfChanged]);

    // URL sync
    const handleTabChange = useCallback((tabId: string) => {
        const target = getTabsForMode(appMode).find((t) => t.id === tabId);
        if (target?.featureGroup === 'quant' && appMode !== 'quant') {
            setAppModeIfChanged('quant');
        }
        if (target?.featureGroup === 'terminal' && appMode !== 'terminal') {
            setAppModeIfChanged('terminal');
        }
        if (target?.featureGroup === 'backtest' && appMode !== 'backtest') {
            setAppModeIfChanged('backtest');
        }
        if (target?.requiresResearchToggle && !researchModeEnabled) {
            setResearchModeIfChanged(true);
        }
        setHashIfChanged(tabId);
        setRouteIfChanged({ kind: 'tab', tabId });
    }, [
        appMode,
        researchModeEnabled,
        setAppModeIfChanged,
        setResearchModeIfChanged,
        setRouteIfChanged,
    ]);

    const handleAppModeChange = useCallback((nextAppMode: AppMode) => {
        const nextTab = getDefaultTab(nextAppMode, mode);
        setHashIfChanged(nextTab);
        setAppModeIfChanged(nextAppMode);
        setRouteIfChanged({ kind: 'tab', tabId: nextTab });
    }, [mode, setAppModeIfChanged, setRouteIfChanged]);

    // Connect backtest context navigation
    const { setNavigateToTab } = useBacktestContext();
    useEffect(() => {
        setNavigateToTab(handleTabChange);
    }, [handleTabChange, setNavigateToTab]);

    const activeTab = route.kind === 'tab' ? route.tabId : getDefaultTab(appMode, mode);
    const [emergencyBuildCheckState, setEmergencyBuildCheckState] = useState<
        'idle' | 'checking' | 'ready'
    >('idle');
    useEffect(() => {
        if (route.kind !== 'tab') {
            return;
        }
        setTabCacheByMode((prev) => {
            const nextForMode = pruneTabCacheEntries(prev[appMode] ?? [], route.tabId, {
                maxEntries: TAB_CACHE_MAX_ENTRIES,
                ttlMs: TAB_CACHE_TTL_MS,
            });
            if (sameTabCacheEntries(prev[appMode] ?? [], nextForMode)) {
                return prev;
            }
            return {
                ...prev,
                [appMode]: nextForMode,
            };
        });
    }, [appMode, route]);
    const devPanelScopeLabel =
        appMode === 'quant' &&
        activeTab === 'quant-data-quality' &&
        quantScope.scope !== 'RUN' &&
        quantScope.scope !== 'BACKTEST'
            ? quantScope.scopeLabel
            : null;

    useEffect(() => {
        if (appMode === 'terminal') {
            setApiPerfScreen('terminal');
            return;
        }
        if (appMode === 'quant') {
            setApiPerfScreen('quant');
            return;
        }
        if (appMode === 'backtest') {
            setApiPerfScreen('backtest');
            return;
        }
        setApiPerfScreen('global');
    }, [appMode]);

    useEffect(() => {
        if (appMode !== 'terminal' || activeTab !== 'emergency') {
            setEmergencyBuildCheckState('idle');
            return;
        }
        let cancelled = false;
        setEmergencyBuildCheckState('checking');
        const verifyFreshness = async () => {
            const canContinue = await ensureFreshIndexAsset();
            if (cancelled || !canContinue) {
                return;
            }
            setEmergencyBuildCheckState('ready');
            void loadEmergencyPanel();
        };
        void verifyFreshness();
        return () => {
            cancelled = true;
        };
    }, [activeTab, appMode]);

    // System status polling
    const [statusData, setStatusData] = useState<{
        system: SystemStatus | null;
        profile: MarketProfileRow | null;
        lastOhlc: Ohlc | null;
        warmupBars: number | null;
        warmupTarget: number | null;
        readinessStatus: string | null;
        latestSignal: Signal | null;
        latencyMs: number | null;
        lastTickIso: string | null;
        tickAgeSeconds: number | null;
        ohlcState: string | null;
    }>({
        system: null,
        profile: null,
        lastOhlc: null,
        warmupBars: null,
        warmupTarget: null,
        readinessStatus: null,
        latestSignal: null,
        latencyMs: null,
        lastTickIso: null,
        tickAgeSeconds: null,
        ohlcState: null,
    });
    const [backendState, setBackendState] = useState<
        "BACKEND_UNAVAILABLE" | "OFF_MARKET" | "DEGRADED_NO_DATA" | "LIVE_READY"
    >("BACKEND_UNAVAILABLE");

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const collect = () => {
            const urls = new Set<string>();
            document.querySelectorAll('script[src]').forEach((el) => {
                const src = (el as HTMLScriptElement).src;
                if (src) urls.add(src);
            });
            document.querySelectorAll('link[rel="stylesheet"][href]').forEach((el) => {
                const href = (el as HTMLLinkElement).href;
                if (href) urls.add(href);
            });
            const perf = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
            perf.forEach((entry) => {
                if (entry?.name) urls.add(entry.name);
            });
            const list = Array.from(urls);
            const indexUrl = pickAsset(list, /\/assets\/index-[^/]+\.js|index-[^/]+\.js/);
            const appv2Url = pickAsset(list, /\/assets\/AppV2-[^/]+\.js|AppV2-[^/]+\.js/);
            const appv2Css = pickAsset(list, /\/assets\/AppV2-[^/]+\.css|AppV2-[^/]+\.css/);
            setBuildAssets({
                index: compactAssetName(indexUrl),
                appv2: compactAssetName(appv2Url || appv2Css),
            });
        };
        collect();
        const id = window.setTimeout(collect, 1500);
        return () => window.clearTimeout(id);
    }, []);

    const runInfo = useMemo(
        () => ({
            run_id: (statusData.system as any)?.run_id ?? null,
            strategy_version: (statusData.system as any)?.strategy_version ?? null,
            trade_date: (statusData.system as any)?.trade_date ?? null,
        }),
        [statusData.system]
    );
    const statusContext = useMemo(() => {
        if (runId) {
            return { ...activeContext, run_id: runId };
        }
        return activeContext;
    }, [runId]);

    // Derived metrics
    const lastTickMs = (() => {
        if (statusData.lastTickIso) {
            const ts = new Date(statusData.lastTickIso).getTime();
            return isNaN(ts) ? null : ts;
        }
        if (statusData.lastOhlc?.timestamp) {
            const ts = new Date(statusData.lastOhlc.timestamp).getTime();
            return isNaN(ts) ? null : ts + 55_000;
        }
        return null;
    })();
    const lastTickIso = lastTickMs != null && !isNaN(lastTickMs) ? new Date(lastTickMs).toISOString() : null;
    const readinessStatus =
        statusData.readinessStatus ??
        (statusData.system as any)?.readiness_status ??
        (statusData.system as any)?.warmup_status ??
        null;
    const warmupTarget =
        statusData.warmupTarget ?? (statusData.system as any)?.warmup_min_bars ?? 55;
    const warmupReady =
        readinessStatus && readinessStatus.toUpperCase().includes("WARMUP")
            ? false
            : (statusData.warmupBars ?? 0) >= warmupTarget;
    const spreadPips = statusData.profile?.spread_pips ?? null;
    const tickAgeMs = statusData.tickAgeSeconds != null
        ? statusData.tickAgeSeconds * 1000
        : lastTickMs
            ? Date.now() - lastTickMs
            : null;
    const effectiveLatencyMs = statusData.latencyMs ?? tickAgeMs;
    const killSwitch = !!statusData.system?.kill_switch;
    const gatewayUp = resolveStatusBarGateway(statusData.system);
    const dataSourceLabel = (
        (statusData.system as any)?.data_source_label ?? null
    ) as string | null;

    const loadShellStatus = useCallback(async () => {
        if (appMode === 'quant' || appMode === 'backtest') {
            return;
        }
        if (!runId) {
            setBackendState('BACKEND_UNAVAILABLE');
            setStatusData((prev) => ({
                ...prev,
                system: null,
                profile: null,
                lastOhlc: null,
                latestSignal: null,
                tickAgeSeconds: null,
            }));
            return;
        }
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
            return;
        }
        try {
            const snapshot = await api.getTerminalSnapshot(statusContext, defaultScope, {
                sections: ['system', 'ohlc', 'market_profile', 'signals'],
                signalsMode: 'lite',
                cacheMode: 'network-only',
            });
            const sys = snapshot.system;
            const ohlcPayload = snapshot.ohlc;
            const ohlcRows = ohlcPayload.ohlc ?? [];
            const ohlcState = ohlcPayload.state ?? null;
            const sysLastTick = sys?.last_tick_time || null;
            const sysLatency = (sys as any)?.latency_ms ?? null;
            const sysTickAge = (sys as any)?.tick_age_seconds ?? null;
            const sysWarmupBars = (sys as any)?.warmup_bars ?? null;
            const sysWarmupTarget = (sys as any)?.warmup_min_bars ?? null;
            const sysReadiness =
                (sys as any)?.readiness_status ??
                (sys as any)?.warmup_status ??
                null;
            const marketOpen = (sys as any)?.market_open;
            const bid = (sys as any)?.bid ?? (sys as any)?.price?.bid ?? null;
            const ask = (sys as any)?.ask ?? (sys as any)?.price?.ask ?? null;
            const quotesOk = bid !== -1 && ask !== -1 && bid != null && ask != null;
            const tickOk = sysTickAge == null || sysTickAge < 5;
            const nextState =
                ohlcState === 'OFF_MARKET' || marketOpen === false
                    ? 'OFF_MARKET'
                    : !quotesOk || !tickOk
                        ? 'DEGRADED_NO_DATA'
                        : 'LIVE_READY';
            setBackendState(nextState);
            setStatusData((prev) => ({
                ...prev,
                system: sys,
                profile: safeLast(snapshot.market_profile ?? []) ?? null,
                lastOhlc: safeLast(ohlcRows) ?? prev.lastOhlc,
                warmupBars: sysWarmupBars ?? prev.warmupBars,
                warmupTarget: sysWarmupTarget,
                readinessStatus: sysReadiness,
                latestSignal: (snapshot.signals ?? [])[0] ?? null,
                latencyMs: sysLatency,
                lastTickIso: sysLastTick,
                tickAgeSeconds: sysTickAge,
                ohlcState,
            }));
        } catch {
            setBackendState('DEGRADED_NO_DATA');
        }
    }, [appMode, runId, statusContext]);

    const shellStatusAutoPollingEnabled =
        appMode === 'terminal' &&
        activeTab !== 'overview' &&
        activeTab !== 'terminal' &&
        Boolean(runId);

    useEffect(() => {
        if (appMode !== 'terminal') {
            return;
        }
        void loadPriceTradesTV();
    }, [appMode]);

    useEffect(() => {
        if (appMode !== 'terminal' || !runId || typeof window === 'undefined') {
            return;
        }
        let cancelled = false;
        const prewarm = () => {
            if (cancelled) return;
            void loadPriceTradesTV().then((module) => {
                if (cancelled) return;
                return module.prewarmPriceTradesPanel?.(runId);
            });
        };

        if ('requestIdleCallback' in window) {
            const idleId = window.requestIdleCallback(prewarm, { timeout: 1200 });
            return () => {
                cancelled = true;
                window.cancelIdleCallback(idleId);
            };
        }

        const timeoutId = window.setTimeout(prewarm, 150);
        return () => {
            cancelled = true;
            window.clearTimeout(timeoutId);
        };
    }, [appMode, runId]);

    useEffect(() => {
        if (appMode !== 'terminal' || typeof window === 'undefined') {
            return;
        }
        let cancelled = false;
        const prewarm = () => {
            if (cancelled) return;
            void loadDatabasePanelCanonical().then((module) => {
                if (cancelled) return;
                return module.prewarmDatabasePanel?.({
                    runId,
                    strategyId: resolvedRun?.strategy_id ?? null,
                    commissionView,
                });
            });
        };

        if ('requestIdleCallback' in window) {
            const idleId = window.requestIdleCallback(prewarm, { timeout: 1400 });
            return () => {
                cancelled = true;
                window.cancelIdleCallback(idleId);
            };
        }

        const timeoutId = window.setTimeout(prewarm, 220);
        return () => {
            cancelled = true;
            window.clearTimeout(timeoutId);
        };
    }, [appMode, commissionView, resolvedRun?.strategy_id, runId]);

    useEffect(() => {
        if (appMode !== 'terminal' || typeof window === 'undefined') {
            return;
        }
        let cancelled = false;
        const prewarm = () => {
            if (cancelled) return;
            void loadStrategyOverview();
            void prewarmOverviewPrefetch({
                runId: overviewSeedRunId,
                commissionView,
                portfolioEpoch: selectedEpoch ?? null,
            });
        };

        if ('requestIdleCallback' in window) {
            const idleId = window.requestIdleCallback(prewarm, { timeout: 700 });
            return () => {
                cancelled = true;
                window.cancelIdleCallback(idleId);
            };
        }

        const timeoutId = window.setTimeout(prewarm, 80);
        return () => {
            cancelled = true;
            window.clearTimeout(timeoutId);
        };
    }, [appMode, commissionView, overviewSeedRunId, selectedEpoch]);

    useEffect(() => {
        if (appMode !== 'terminal' || typeof window === 'undefined') {
            return;
        }
        if (!canIdlePreloadHeavyTabs()) {
            return;
        }
        let cancelled = false;
        const preload = () => {
            if (cancelled) return;
            void Promise.allSettled([
                loadStrategyOverview(),
                loadProTerminalPanel(),
                loadDatabasePanelCanonical(),
                loadApexChartsRuntime(),
            ]);
        };

        if ('requestIdleCallback' in window) {
            const idleId = window.requestIdleCallback(preload, { timeout: 2000 });
            return () => {
                cancelled = true;
                window.cancelIdleCallback(idleId);
            };
        }

        const tid = window.setTimeout(preload, 1800);
        return () => {
            cancelled = true;
            window.clearTimeout(tid);
        };
    }, [appMode]);

    useEffect(() => {
        if (
            appMode !== 'terminal' ||
            !runId ||
            (activeTab !== 'overview' && activeTab !== 'terminal')
        ) {
            return;
        }
        void loadShellStatus();
    }, [activeTab, appMode, loadShellStatus, runId]);

    useDashboardPoll('status', loadShellStatus, {
        enabled: shellStatusAutoPollingEnabled,
        immediate: shellStatusAutoPollingEnabled,
        intervalMs:
            backendState === 'OFF_MARKET'
                ? 180_000
                : backendState === 'LIVE_READY'
                    ? 15_000
                    : 45_000,
    });

    // Get current tab info for question
    const currentTab = route.kind === 'tab'
        ? getTabsForMode(appMode).find((t) => t.id === activeTab)
        : undefined;

    if (route.kind === 'graph') {
        return (
            <div className="min-h-screen bg-[#050510] text-white">
                <ContextGuard>
                    <>
                        {route.graphId === 'quant-microstructure' && (
                            <Suspense fallback={<TabLoadingFallback label="Loading microstructure graph" />}>
                                <MarketProfileGraph
                                    onBack={() => handleTabChange('quant-microstructure')}
                                />
                            </Suspense>
                        )}
                        {route.graphId === 'quant-geometry' && (
                            <Suspense fallback={<TabLoadingFallback label="Loading signal graph" />}>
                                <SignalAnalyticsGraph
                                    onBack={() => handleTabChange('quant-geometry')}
                                />
                            </Suspense>
                        )}
                        {route.graphId === 'quant-parameters' && (
                            <Suspense fallback={<TabLoadingFallback label="Loading parameter graph" />}>
                                <ResearchDeskGraph
                                    onBack={() => handleTabChange('quant-parameters')}
                                />
                            </Suspense>
                        )}
                    </>
                </ContextGuard>
            </div>
        );
    }

    // Resolve active tab label for mobile header
    const activeTabMeta = route.kind === 'tab'
        ? getTabsForMode(appMode).find((t) => t.id === activeTab)
        : undefined;

    return (
        <div className="min-h-screen bg-[#050510] text-white app-shell">
            {/* Mobile Header - visible only on mobile */}
            <div className="lg:hidden sticky top-0 z-40 mobile-top-bar">
                <div className="flex items-center justify-between px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 flex-shrink-0">
                            STERN
                        </span>
                        <span className="text-neutral-700 flex-shrink-0">/</span>
                        <span className="text-sm font-semibold text-white truncate">
                            {activeTabMeta?.label ?? 'Dashboard'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Main Layout */}
            <div className={cn(
                "mx-auto py-1.5 sm:py-3 lg:py-4",
                appMode === 'backtest'
                    ? "px-3 sm:px-4 lg:px-6"
                    : "max-w-[1920px] px-2 sm:px-3 lg:px-8"
            )}>
                <div className="flex gap-2 sm:gap-3 lg:gap-6">
                    {/* Sidebar (hidden in backtest mode) */}
                    <aside className={cn("hidden lg:block w-56 flex-shrink-0", appMode === 'backtest' && "lg:hidden")}>
                        <div
                            className={
                                'sticky top-4 rounded-2xl border border-white/[0.08] ' +
                                'bg-white/[0.02] backdrop-blur-xl p-4 space-y-4'
                            }
                        >
                            {/* Brand */}
                            <div className="px-2">
                                <div
                                    className={
                                        'text-[10px] uppercase tracking-[0.2em] ' +
                                        'text-neutral-500'
                                    }
                                >
                                    STERN
                                </div>
                                <div className="text-lg font-semibold text-white">
                                    {appMode === 'quant' ? 'Quant Lab' : appMode === 'backtest' ? 'Backtest' : 'Trading'}
                                </div>
                            </div>

                            {/* Navigation */}
                            <SideNav
                                activeTab={activeTab}
                                onTabChange={handleTabChange}
                            />

                            {/* Backtest running badge */}
                            <BacktestRunningBadge onNavigate={() => handleTabChange('bt-launch')} />

                            <div className="px-2 pt-2 border-t border-white/[0.06]">
                                <div
                                    className={
                                        'text-[9px] uppercase tracking-[0.2em] ' +
                                        'text-neutral-600'
                                    }
                                >
                                    Build
                                </div>
                                <div
                                    className="text-[11px] font-mono text-neutral-400 break-all"
                                    title={buildStamp}
                                >
                                    {buildStamp}
                                </div>
                                <div
                                    className="text-[10px] font-mono text-neutral-500 break-all"
                                    title={`index ${buildAssets.index ?? 'n/a'}`}
                                >
                                    index {buildAssets.index ?? 'n/a'}
                                </div>
                                <div
                                    className="text-[10px] font-mono text-neutral-500 break-all"
                                    title={`appv2 ${buildAssets.appv2 ?? 'n/a'}`}
                                >
                                    appv2 {buildAssets.appv2 ?? 'n/a'}
                                </div>
                            </div>
                        </div>
                    </aside>

                    {/* Main Content */}
                    <main className="flex-1 min-w-0 space-y-2 sm:space-y-3 lg:space-y-4">
                        {/* Header Controls (hidden in backtest mode) */}
                        {appMode !== 'backtest' && (
                            <HeaderControls
                                onAppModeChange={handleAppModeChange}
                                runSelector={
                                    <RunBanner compact={true} showRefresh={true} />
                                }
                            />
                        )}

                        {/* Backtest desktop nav rail: keeps full-width layout without trapping navigation */}
                        {appMode === 'backtest' && (
                            <div className="hidden lg:flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl px-4 py-3">
                                <div className="flex items-center gap-2">
                                    {([
                                        { id: 'terminal' as AppMode, label: 'Trading' },
                                        { id: 'quant' as AppMode, label: 'Quant' },
                                        { id: 'backtest' as AppMode, label: 'Backtest' },
                                    ]).map((modeOption) => (
                                        <button
                                            key={modeOption.id}
                                            onClick={() => handleAppModeChange(modeOption.id)}
                                            className={cn(
                                                'rounded-xl px-3 py-2 text-xs font-medium transition-all',
                                                appMode === modeOption.id
                                                    ? 'border border-cyan-500/30 bg-cyan-500/10 text-cyan-200'
                                                    : 'border border-transparent text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200'
                                            )}
                                        >
                                            {modeOption.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex items-center gap-2">
                                    {getTabsForMode('backtest').map((tab) => (
                                        <button
                                            key={tab.id}
                                            onClick={() => handleTabChange(tab.id)}
                                            className={cn(
                                                'rounded-xl px-3 py-2 text-xs transition-all',
                                                activeTab === tab.id
                                                    ? 'border border-white/[0.12] bg-white/[0.08] text-white'
                                                    : 'border border-transparent text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200'
                                            )}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Desk Banner (terminal only) — unifies forex + crypto MM */}
                        {appMode === 'terminal' && (
                            <DeskBanner />
                        )}

                        {/* Tab Question */}
                        {currentTab?.question && (
                            <div
                                className={
                                    'text-xs text-neutral-500 px-1 flex items-center ' +
                                    'gap-2'
                                }
                            >
                                <span className="text-[#00FF88]/70">Q:</span>
                                <span className="italic">{currentTab.question}</span>
                            </div>
                        )}

                        {/* Tab Content */}
                        <TabBoundary>
                            <div className="h-full">
                                {(() => {
                                    const modeEntries = (
                                        tabCacheByMode[appMode].length > 0
                                            ? tabCacheByMode[appMode]
                                            : [{ tabId: activeTab, lastSeenMs: Date.now() }]
                                    );
                                    return modeEntries.map((entry) => {
                                        const isActive = entry.tabId === activeTab;
                                        const content = renderAppModeTab(appMode, entry.tabId, {
                                            emergencyBuildReady:
                                                entry.tabId !== 'emergency' ||
                                                !isActive ||
                                                emergencyBuildCheckState === 'ready',
                                        });
                                        return (
                                            <ViewActivityProvider
                                                key={`${appMode}:${entry.tabId}`}
                                                active={isActive}
                                            >
                                                <div
                                                    aria-hidden={!isActive}
                                                    className={cn("h-full", !isActive && "hidden")}
                                                >
                                                    {appMode === 'backtest' && isActive ? (
                                                        <AnimatePresence mode="wait">
                                                            <motion.div
                                                                key={entry.tabId}
                                                                initial={{ opacity: 0, y: 8 }}
                                                                animate={{ opacity: 1, y: 0 }}
                                                                exit={{ opacity: 0, y: -8 }}
                                                                transition={{ duration: 0.15, ease: 'easeOut' }}
                                                                className="h-full"
                                                            >
                                                                {content}
                                                            </motion.div>
                                                        </AnimatePresence>
                                                    ) : (
                                                        content
                                                    )}
                                                </div>
                                            </ViewActivityProvider>
                                        );
                                    });
                                })()}
                            </div>
                        </TabBoundary>

                        {/* Dev Panel (collapsible at bottom) */}
                        <DevPanel compact={true} overrideScopeLabel={devPanelScopeLabel} />
                    </main>
                </div>
            </div>

            {/* Mobile Navigation */}
            <MobileNav activeTab={activeTab} onTabChange={handleTabChange} />
        </div>
    );
}

// =============================================================================
// App with Providers
// =============================================================================

export function AppV2() {
    return (
        <FractalModeProvider>
            <DashboardTimeframeProvider>
                <PortfolioEpochProvider>
                    <SelectionProvider>
                        <BacktestProvider>
                            <AppContent />
                        </BacktestProvider>
                    </SelectionProvider>
                </PortfolioEpochProvider>
            </DashboardTimeframeProvider>
        </FractalModeProvider>
    );
}

// Helper
function safeLast<T>(arr: T[]): T | undefined {
    return arr.length ? arr[arr.length - 1] : undefined;
}

export default AppV2;
