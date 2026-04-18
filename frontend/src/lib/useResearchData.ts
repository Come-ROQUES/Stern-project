/**
 * useResearchData.ts - Centralized research data cache with SWR semantics
 *
 * Replaces the 5 parallel Promise.all calls in StrategyResearchDesk
 * with a module-level cache that persists across tab switches.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    api,
    type ResearchCampaign,
    type ResearchCampaignListResponse,
    type ResearchLaunchCapabilitiesResponse,
    type ResearchPaperMatchResponse,
    type ResearchPromotionStatusResponse,
    type ResearchRunsResponse,
} from './api';
import { useViewActivity } from './viewActivity';

export interface StrategyResearchData {
    campaigns: ResearchCampaign[];
    promotion: ResearchPromotionStatusResponse | null;
    paperMatch: ResearchPaperMatchResponse | null;
    runs: ResearchRunsResponse | null;
    launchCapabilities: ResearchLaunchCapabilitiesResponse | null;
}

interface CacheEntry {
    data: StrategyResearchData;
    timestamp: number;
}

// Module-level cache persists across component mounts/unmounts
const researchCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000; // 60s TTL

// Inflight dedup
const inflightRequests = new Map<string, Promise<StrategyResearchData>>();

function getCached(strategyId: string): CacheEntry | null {
    const entry = researchCache.get(strategyId);
    if (!entry) return null;
    return entry;
}

function isFresh(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp <= CACHE_TTL_MS;
}

async function fetchStrategyData(
    strategyId: string,
    campaignLimit: number,
): Promise<StrategyResearchData> {
    const [campaignsPayload, promotionPayload, paperMatchPayload, runsPayload, launchPayload] =
        await Promise.all([
            api.listStrategyResearchCampaigns(strategyId, campaignLimit),
            api.getStrategyResearchPromotion(strategyId),
            api.getStrategyResearchPaperMatch(strategyId),
            api.listStrategyResearchRuns(strategyId, 20),
            api.getStrategyLaunchCapabilities(strategyId),
        ]);
    return {
        campaigns: campaignsPayload.campaigns ?? [],
        promotion: promotionPayload,
        paperMatch: paperMatchPayload,
        runs: runsPayload,
        launchCapabilities: launchPayload,
    };
}

async function fetchWithDedup(
    strategyId: string,
    campaignLimit: number,
): Promise<StrategyResearchData> {
    const existing = inflightRequests.get(strategyId);
    if (existing) return existing;

    const promise = fetchStrategyData(strategyId, campaignLimit).finally(() => {
        inflightRequests.delete(strategyId);
    });
    inflightRequests.set(strategyId, promise);
    return promise;
}

/** Prefetch strategy data into cache (fire-and-forget, no state updates) */
export function prefetchStrategyData(strategyId: string, campaignLimit = 8): void {
    const cached = getCached(strategyId);
    if (cached && isFresh(cached)) return;
    fetchWithDedup(strategyId, campaignLimit).then((data) => {
        researchCache.set(strategyId, { data, timestamp: Date.now() });
    }).catch(() => { /* prefetch failure is silent */ });
}

export interface UseResearchDataResult {
    data: StrategyResearchData | null;
    loading: boolean;
    stale: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

export function useResearchData(
    strategyId: string | null,
    campaignLimit = 8,
): UseResearchDataResult {
    const viewActive = useViewActivity();
    const [data, setData] = useState<StrategyResearchData | null>(() => {
        if (!strategyId) return null;
        return getCached(strategyId)?.data ?? null;
    });
    const [loading, setLoading] = useState(() => {
        if (!strategyId) return false;
        return !getCached(strategyId);
    });
    const [stale, setStale] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const mountedRef = useRef(true);

    const doFetch = useCallback(async (force = false) => {
        if (!strategyId) return;
        if (!viewActive && !force) return;

        if (!force) {
            const cached = getCached(strategyId);
            if (cached) {
                if (isFresh(cached)) {
                    if (mountedRef.current) {
                        setData(cached.data);
                        setLoading(false);
                        setStale(false);
                    }
                    return;
                }
                // Stale: show immediately, revalidate in background
                if (mountedRef.current) {
                    setData(cached.data);
                    setLoading(false);
                    setStale(true);
                }
            } else {
                if (mountedRef.current) setLoading(true);
            }
        } else {
            const cached = getCached(strategyId);
            if (!cached && mountedRef.current) setLoading(true);
        }

        try {
            const result = await fetchWithDedup(strategyId, campaignLimit);
            researchCache.set(strategyId, { data: result, timestamp: Date.now() });
            if (mountedRef.current) {
                setData(result);
                setError(null);
                setStale(false);
            }
        } catch (err) {
            if (mountedRef.current) {
                setError(err instanceof Error ? err.message : 'Research data fetch failed');
                setStale(false);
            }
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, [strategyId, campaignLimit, viewActive]);

    useEffect(() => {
        mountedRef.current = true;
        if (!viewActive) {
            return () => {
                mountedRef.current = false;
            };
        }
        doFetch();
        return () => { mountedRef.current = false; };
    }, [doFetch, viewActive]);

    const refresh = useCallback(async () => {
        await doFetch(true);
    }, [doFetch]);

    return { data, loading, stale, error, refresh };
}
