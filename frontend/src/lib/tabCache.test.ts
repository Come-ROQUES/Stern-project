import { describe, expect, it } from "vitest";

import { pruneTabCacheEntries, sameTabCacheEntries } from "./tabCache";

describe("tabCache", () => {
  it("keeps the active tab hot and prunes expired entries", () => {
    const next = pruneTabCacheEntries(
      [
        { tabId: "overview", lastSeenMs: 1_000 },
        { tabId: "chart", lastSeenMs: 25_000 },
      ],
      "terminal",
      {
        maxEntries: 3,
        ttlMs: 20_000,
        nowMs: 30_000,
      }
    );

    expect(next).toEqual([
      { tabId: "terminal", lastSeenMs: 30_000 },
      { tabId: "chart", lastSeenMs: 25_000 },
    ]);
  });

  it("deduplicates the active tab and enforces the cache size cap", () => {
    const next = pruneTabCacheEntries(
      [
        { tabId: "overview", lastSeenMs: 10_000 },
        { tabId: "chart", lastSeenMs: 15_000 },
        { tabId: "overview", lastSeenMs: 18_000 },
        { tabId: "logs", lastSeenMs: 17_000 },
      ],
      "overview",
      {
        maxEntries: 2,
        ttlMs: 60_000,
        nowMs: 20_000,
      }
    );

    expect(next).toEqual([
      { tabId: "overview", lastSeenMs: 20_000 },
      { tabId: "logs", lastSeenMs: 17_000 },
    ]);
  });

  it("compares cache snapshots by tab id and timestamp", () => {
    expect(
      sameTabCacheEntries(
        [{ tabId: "overview", lastSeenMs: 1 }],
        [{ tabId: "overview", lastSeenMs: 1 }]
      )
    ).toBe(true);
    expect(
      sameTabCacheEntries(
        [{ tabId: "overview", lastSeenMs: 1 }],
        [{ tabId: "overview", lastSeenMs: 2 }]
      )
    ).toBe(false);
  });
});
