/**
 * usePolling.ts - Centralized polling infrastructure with stale-while-revalidate
 *
 * Features:
 * - Stale-while-revalidate: returns cached data immediately, revalidates in background
 * - Global request deduplication (same URL/params won't be called twice within TTL)
 * - Adaptive polling based on visibility (pause when tab is hidden)
 * - Rate limiting to prevent API overload
 * - Configurable TTL per key
 * - Automatic cleanup on unmount
 *
 * Usage:
 *   const { data, loading, stale, error, refresh } = usePolling(
 *     () => api.getSystemStatus(),
 *     { intervalMs: 10_000, key: 'system-status' }
 *   );
 */

import { useEffect, useRef, useState, useCallback } from 'react';

import { useViewActivity } from './viewActivity';

// =============================================================================
// GLOBAL DEDUPLICATION CACHE
// =============================================================================

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    promise?: Promise<T>;
}

const globalCache = new Map<string, CacheEntry<unknown>>();
const DEFAULT_CACHE_TTL_MS = 3000; // 3 seconds default deduplication window

function getCachedEntry<T>(key: string): CacheEntry<T> | null {
    const entry = globalCache.get(key);
    if (!entry || entry.data === null) return null;
    return entry as CacheEntry<T>;
}

function isCacheFresh(entry: CacheEntry<unknown>, ttlMs: number): boolean {
    return Date.now() - entry.timestamp <= ttlMs;
}

function setCache<T>(key: string, data: T): void {
    // Limit cache size
    if (globalCache.size > 100) {
        const oldestKey = globalCache.keys().next().value;
        if (oldestKey) globalCache.delete(oldestKey);
    }
    globalCache.set(key, { data, timestamp: Date.now() });
}

function getInflight<T>(key: string): Promise<T> | null {
    const entry = globalCache.get(key);
    return entry?.promise as Promise<T> | null;
}

function setInflight<T>(key: string, promise: Promise<T>): void {
    const existing = globalCache.get(key);
    if (existing) {
        existing.promise = promise as Promise<unknown>;
    } else {
        globalCache.set(key, { data: null as unknown, timestamp: Date.now(), promise: promise as Promise<unknown> });
    }
}

function clearInflight(key: string): void {
    const entry = globalCache.get(key);
    if (entry) {
        delete entry.promise;
    }
}

// =============================================================================
// VISIBILITY TRACKING
// =============================================================================

let isPageVisible = typeof document !== 'undefined' ? !document.hidden : true;

if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        isPageVisible = !document.hidden;
    });
}

// =============================================================================
// RATE LIMITER
// =============================================================================

const requestTimestamps: number[] = [];
const MAX_REQUESTS_PER_SECOND = 10;

function canMakeRequest(): boolean {
    const now = Date.now();
    // Remove timestamps older than 1 second
    while (requestTimestamps.length > 0 && requestTimestamps[0]! < now - 1000) {
        requestTimestamps.shift();
    }
    return requestTimestamps.length < MAX_REQUESTS_PER_SECOND;
}

function recordRequest(): void {
    requestTimestamps.push(Date.now());
}

// =============================================================================
// usePolling HOOK
// =============================================================================

interface UsePollingOptions {
    /** Unique key for deduplication. Required. */
    key: string;
    /** Polling interval in milliseconds. Default: 30000 (30s) */
    intervalMs?: number;
    /** Whether polling is enabled. Default: true */
    enabled?: boolean;
    /** Skip polling when tab is hidden. Default: true */
    pauseWhenHidden?: boolean;
    /** Cache TTL override in ms. Default: 3000 (3s) */
    cacheTtlMs?: number;
    /** Pause polling while the tab view is cached but inactive. Default: true */
    pauseWhenInactive?: boolean;
}

interface UsePollingResult<T> {
    data: T | null;
    loading: boolean;
    /** True when returning stale data while revalidation is in progress */
    stale: boolean;
    error: Error | null;
    refresh: () => Promise<void>;
    lastUpdated: number | null;
}

export function usePolling<T>(
    fetcher: () => Promise<T>,
    options: UsePollingOptions
): UsePollingResult<T> {
    const {
        key,
        intervalMs = 30_000,
        enabled = true,
        pauseWhenHidden = true,
        cacheTtlMs = DEFAULT_CACHE_TTL_MS,
        pauseWhenInactive = true,
    } = options;
    const viewActive = useViewActivity();

    const [data, setData] = useState<T | null>(() => {
        const entry = getCachedEntry<T>(key);
        return entry ? entry.data : null;
    });
    const [loading, setLoading] = useState(() => {
        const entry = getCachedEntry<T>(key);
        return !entry;
    });
    const [stale, setStale] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [lastUpdated, setLastUpdated] = useState<number | null>(null);

    const mountedRef = useRef(true);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const doFetch = useCallback(async (force = false) => {
        // Check visibility
        if (pauseWhenHidden && !isPageVisible && !force) {
            return;
        }
        if (pauseWhenInactive && !viewActive && !force) {
            return;
        }

        // Check rate limit
        if (!canMakeRequest() && !force) {
            return;
        }

        // SWR: check cache freshness
        if (!force) {
            const entry = getCachedEntry<T>(key);
            if (entry) {
                if (isCacheFresh(entry, cacheTtlMs)) {
                    // Fresh cache: use it, no refetch
                    if (mountedRef.current) {
                        setData(entry.data);
                        setLoading(false);
                        setStale(false);
                    }
                    return;
                }
                // Stale cache: return stale data immediately, revalidate in background
                if (mountedRef.current) {
                    setData(entry.data);
                    setLoading(false);
                    setStale(true);
                }
            }
        }

        // Check if request is already in flight
        const inflight = getInflight<T>(key);
        if (inflight) {
            try {
                const result = await inflight;
                if (mountedRef.current) {
                    setData(result);
                    setLoading(false);
                    setStale(false);
                    setError(null);
                }
            } catch (e) {
                if (mountedRef.current) {
                    setError(e instanceof Error ? e : new Error(String(e)));
                    setLoading(false);
                    setStale(false);
                }
            }
            return;
        }

        // First load (no data yet): show loading. Otherwise SWR handles it.
        const hasExistingData = getCachedEntry<T>(key) !== null;
        if (!hasExistingData) {
            setLoading(true);
        }

        recordRequest();
        const promise = fetcher();
        setInflight(key, promise);

        try {
            const result = await promise;
            clearInflight(key);
            setCache(key, result);
            if (mountedRef.current) {
                setData(result);
                setError(null);
                setStale(false);
                setLastUpdated(Date.now());
            }
        } catch (e) {
            clearInflight(key);
            if (mountedRef.current) {
                setError(e instanceof Error ? e : new Error(String(e)));
                setStale(false);
            }
        } finally {
            if (mountedRef.current) {
                setLoading(false);
            }
        }
    }, [key, fetcher, pauseWhenHidden, cacheTtlMs, pauseWhenInactive, viewActive]);

    // Initial fetch
    useEffect(() => {
        mountedRef.current = true;
        if (enabled && (!pauseWhenInactive || viewActive)) {
            doFetch();
        }
        return () => {
            mountedRef.current = false;
        };
    }, [enabled, doFetch, pauseWhenInactive, viewActive]);

    // Setup polling interval
    useEffect(() => {
        if (!enabled || intervalMs <= 0 || (pauseWhenInactive && !viewActive)) {
            return;
        }

        intervalRef.current = setInterval(() => {
            doFetch();
        }, intervalMs);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [enabled, intervalMs, doFetch, pauseWhenInactive, viewActive]);

    // Force refresh
    const refresh = useCallback(async () => {
        await doFetch(true);
    }, [doFetch]);

    return { data, loading, stale, error, refresh, lastUpdated };
}

// =============================================================================
// EXPORTS
// =============================================================================

/** Clear all cached data (useful for logout/context switch) */
export function clearPollingCache(): void {
    globalCache.clear();
}

/** Get current rate limit status */
export function getRateLimitStatus(): { requestsLastSecond: number; maxRequests: number } {
    const now = Date.now();
    const recentRequests = requestTimestamps.filter(ts => ts > now - 1000);
    return {
        requestsLastSecond: recentRequests.length,
        maxRequests: MAX_REQUESTS_PER_SECOND,
    };
}
