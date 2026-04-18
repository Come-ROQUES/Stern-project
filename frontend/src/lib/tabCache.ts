export interface TabCacheEntry {
  tabId: string;
  lastSeenMs: number;
}

export interface PruneTabCacheOptions {
  maxEntries: number;
  ttlMs: number;
  nowMs?: number;
}

export function sameTabCacheEntries(
  left: TabCacheEntry[],
  right: TabCacheEntry[]
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((entry, index) => {
    const peer = right[index];
    return (
      peer != null &&
      peer.tabId === entry.tabId &&
      peer.lastSeenMs === entry.lastSeenMs
    );
  });
}

export function pruneTabCacheEntries(
  entries: TabCacheEntry[],
  activeTab: string,
  options: PruneTabCacheOptions
): TabCacheEntry[] {
  const nowMs = options.nowMs ?? Date.now();
  const freshEntries = entries.filter(
    (entry) =>
      entry.tabId === activeTab || nowMs - entry.lastSeenMs <= options.ttlMs
  );
  const byTabId = new Map<string, TabCacheEntry>();

  freshEntries.forEach((entry) => {
    byTabId.set(entry.tabId, entry);
  });
  byTabId.set(activeTab, { tabId: activeTab, lastSeenMs: nowMs });

  return Array.from(byTabId.values())
    .sort((a, b) => b.lastSeenMs - a.lastSeenMs)
    .slice(0, Math.max(1, options.maxEntries));
}
