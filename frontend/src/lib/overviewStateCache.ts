export const OVERVIEW_STATE_CACHE_TTL_MS = 5 * 60_000;

type OverviewStateCacheEntry<T> = {
  value: T;
  cachedAt: number;
};

const overviewStateCache = new Map<string, OverviewStateCacheEntry<unknown>>();

export function buildOverviewStateCacheKey(
  runId?: string | null,
  commissionView = "reported",
  portfolioEpoch?: number | null
): string {
  return [
    runId ?? "desk",
    commissionView,
    portfolioEpoch ?? "current",
  ].join(":");
}

export function readOverviewStateCache<T>(
  key: string,
  nowMs: number = Date.now()
): T | null {
  const cached = overviewStateCache.get(key) as
    | OverviewStateCacheEntry<T>
    | undefined;
  if (!cached) {
    return null;
  }
  if (nowMs - cached.cachedAt > OVERVIEW_STATE_CACHE_TTL_MS) {
    overviewStateCache.delete(key);
    return null;
  }
  return cached.value;
}

export function writeOverviewStateCache<T>(
  key: string,
  value: T,
  nowMs: number = Date.now()
): void {
  overviewStateCache.set(key, {
    value,
    cachedAt: nowMs,
  });
}

export function clearOverviewStateCache(): void {
  overviewStateCache.clear();
}
