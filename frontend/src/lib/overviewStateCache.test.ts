import { describe, expect, it, beforeEach } from "vitest";

import {
  buildOverviewStateCacheKey,
  clearOverviewStateCache,
  OVERVIEW_STATE_CACHE_TTL_MS,
  readOverviewStateCache,
  writeOverviewStateCache,
} from "./overviewStateCache";

describe("overviewStateCache", () => {
  beforeEach(() => {
    clearOverviewStateCache();
  });

  it("builds a stable key from run, commission view and epoch", () => {
    expect(
      buildOverviewStateCacheKey("run_dw", "economic", 7)
    ).toBe("run_dw:economic:7");
    expect(buildOverviewStateCacheKey(null, "reported", null)).toBe(
      "desk:reported:current"
    );
  });

  it("returns cached state while the entry is still fresh", () => {
    writeOverviewStateCache("desk:reported:current", { ok: true }, 1_000);

    expect(
      readOverviewStateCache("desk:reported:current", 1_000 + 10)
    ).toEqual({ ok: true });
  });

  it("drops expired entries once the ttl is exceeded", () => {
    writeOverviewStateCache("desk:reported:current", { ok: true }, 1_000);

    expect(
      readOverviewStateCache(
        "desk:reported:current",
        1_000 + OVERVIEW_STATE_CACHE_TTL_MS + 1
      )
    ).toBeNull();
  });
});
