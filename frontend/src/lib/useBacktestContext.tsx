/**
 * useBacktestContext.tsx - Shared state across Backtest mode tabs
 *
 * Provides:
 * - selectedRunId / lastJobId for single-run compatibility
 * - activeCampaignId / campaignStatus for IS/OOS campaign orchestration
 * - selectedStrategy + derived isRunId / oosRunId for Results view
 * - canonical strategy-first research state for the pipeline workspace
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { BacktestStrategy, CampaignSummary } from './api';

interface BacktestContextType {
    // Legacy single-run state (kept for backward compat)
    selectedRunId: string | null;
    setSelectedRunId: (id: string | null) => void;
    lastJobId: string | null;
    setLastJobId: (id: string | null) => void;

    // Navigation
    navigateToTab: ((tabId: string) => void) | null;
    setNavigateToTab: (fn: ((tabId: string) => void) | null) => void;

    // Campaign state
    activeCampaignId: string | null;
    setActiveCampaignId: (id: string | null) => void;
    campaignStatus: CampaignSummary | null;
    setCampaignStatus: (status: CampaignSummary | null) => void;

    // Strategy selection for Results view
    selectedStrategy: BacktestStrategy | null;
    setSelectedStrategy: (s: BacktestStrategy | null) => void;

    selectedWalkForwardId: string | null;
    setSelectedWalkForwardId: (id: string | null) => void;
    selectedWfId: string | null;
    setSelectedWfId: (id: string | null) => void;

    // Canonical research navigation
    selectedStrategyId: string | null;
    setSelectedStrategyId: (id: string | null) => void;
    activeStage: string | null;
    setActiveStage: (stage: string | null) => void;
    selectedCampaignId: string | null;
    setSelectedCampaignId: (id: string | null) => void;
    selectedCandidateId: string | null;
    setSelectedCandidateId: (id: string | null) => void;
    selectedResearchStrategyId: string | null;
    setSelectedResearchStrategyId: (id: string | null) => void;
    activeResearchStage: string | null;
    setActiveResearchStage: (stage: string | null) => void;
    selectedResearchCampaignId: string | null;
    setSelectedResearchCampaignId: (id: string | null) => void;
    selectedResearchCandidateId: string | null;
    setSelectedResearchCandidateId: (id: string | null) => void;
    selectedResearchRunId: string | null;
    setSelectedResearchRunId: (id: string | null) => void;
    selectedResearchArtifactId: string | null;
    setSelectedResearchArtifactId: (id: string | null) => void;
    filtersByView: Record<string, string>;
    setFilterForView: (view: string, value: string) => void;
    promotionContext: Record<string, string | null>;
    setPromotionContext: (ctx: Record<string, string | null>) => void;
    paperMatchContext: Record<string, string | null>;
    setPaperMatchContext: (ctx: Record<string, string | null>) => void;

    // Derived: IS/OOS run_ids for the selected strategy within active campaign
    isRunId: string | null;
    oosRunId: string | null;
}

const BacktestContext = createContext<BacktestContextType | null>(null);

export function BacktestProvider({ children }: { children: React.ReactNode }) {
    const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
    const [lastJobId, setLastJobId] = useState<string | null>(null);
    const [navigateToTab, setNavigateToTabState] = useState<((tabId: string) => void) | null>(null);
    const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
    const [campaignStatus, setCampaignStatus] = useState<CampaignSummary | null>(null);
    const [selectedStrategy, setSelectedStrategy] = useState<BacktestStrategy | null>(null);
    const [selectedWalkForwardId, setSelectedWalkForwardId] = useState<string | null>(null);
    const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>('s2_pairs_trading');
    const [activeStage, setActiveStage] = useState<string | null>('campaigns');
    const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
    const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
    const [selectedResearchRunId, setSelectedResearchRunId] = useState<string | null>(null);
    const [selectedResearchArtifactId, setSelectedResearchArtifactId] = useState<string | null>(null);
    const [filtersByView, setFiltersByView] = useState<Record<string, string>>({});
    const [promotionContext, setPromotionContext] = useState<Record<string, string | null>>({});
    const [paperMatchContext, setPaperMatchContext] = useState<Record<string, string | null>>({});

    const setNavigateToTab = useCallback((fn: ((tabId: string) => void) | null) => {
        setNavigateToTabState((prev: ((tabId: string) => void) | null) =>
            prev === fn ? prev : fn
        );
    }, []);

    // Derive IS/OOS run_ids from campaign jobs
    const isRunId = useMemo(() => {
        if (!campaignStatus || !selectedStrategy) return null;
        const job = campaignStatus.jobs.find(
            (j) => j.strategy === selectedStrategy && j.phase === 'is'
        );
        return job?.run_id ?? null;
    }, [campaignStatus, selectedStrategy]);

    const oosRunId = useMemo(() => {
        if (!campaignStatus || !selectedStrategy) return null;
        const job = campaignStatus.jobs.find(
            (j) => j.strategy === selectedStrategy && j.phase === 'oos'
        );
        return job?.run_id ?? null;
    }, [campaignStatus, selectedStrategy]);

    const value = useMemo(
        () => ({
            selectedRunId,
            setSelectedRunId,
            lastJobId,
            setLastJobId,
            navigateToTab,
            setNavigateToTab,
            activeCampaignId,
            setActiveCampaignId,
            campaignStatus,
            setCampaignStatus,
            selectedStrategy,
            setSelectedStrategy,
            selectedWalkForwardId,
            setSelectedWalkForwardId,
            selectedWfId: selectedWalkForwardId,
            setSelectedWfId: setSelectedWalkForwardId,
            selectedStrategyId,
            setSelectedStrategyId,
            selectedResearchStrategyId: selectedStrategyId,
            setSelectedResearchStrategyId: setSelectedStrategyId,
            activeStage,
            setActiveStage,
            activeResearchStage: activeStage,
            setActiveResearchStage: setActiveStage,
            selectedCampaignId,
            setSelectedCampaignId,
            selectedResearchCampaignId: selectedCampaignId,
            setSelectedResearchCampaignId: setSelectedCampaignId,
            selectedCandidateId,
            setSelectedCandidateId,
            selectedResearchCandidateId: selectedCandidateId,
            setSelectedResearchCandidateId: setSelectedCandidateId,
            selectedResearchRunId,
            setSelectedResearchRunId,
            selectedResearchArtifactId,
            setSelectedResearchArtifactId,
            filtersByView,
            setFilterForView: (view: string, value: string) =>
                setFiltersByView((current) => ({ ...current, [view]: value })),
            promotionContext,
            setPromotionContext,
            paperMatchContext,
            setPaperMatchContext,
            isRunId,
            oosRunId,
        }),
        [
            activeCampaignId,
            activeStage,
            campaignStatus,
            filtersByView,
            isRunId,
            lastJobId,
            navigateToTab,
            oosRunId,
            paperMatchContext,
            promotionContext,
            selectedRunId,
            selectedCampaignId,
            selectedCandidateId,
            selectedResearchRunId,
            selectedResearchArtifactId,
            selectedStrategyId,
            selectedStrategy,
            selectedWalkForwardId,
            setNavigateToTab,
        ]
    );

    return (
        <BacktestContext.Provider value={value}>
            {children}
        </BacktestContext.Provider>
    );
}

export function useBacktestContext() {
    const ctx = useContext(BacktestContext);
    if (!ctx) {
        throw new Error('useBacktestContext must be used within BacktestProvider');
    }
    return ctx;
}
