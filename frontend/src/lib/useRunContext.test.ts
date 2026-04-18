import { describe, expect, it } from "vitest";

import {
  buildResolvedRunFromRegistryRun,
  withActiveRunFallback,
  type ResolvedRun,
} from "./useRunContext";
import type { Run } from "./canonicalApi";

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    run_id: "run-active-123",
    strategy: "damping_wave",
    cfg_hash: "v6",
    start_ts: "2026-03-13T22:15:00Z",
    end_ts: null,
    status: "running",
    source: "live",
    pnl_total: null,
    trades_count: 0,
    notes: null,
    created_at: "2026-03-13T22:15:00Z",
    updated_at: "2026-03-13T22:15:00Z",
    ...overrides,
  };
}

describe("useRunContext helpers", () => {
  it("preserves unresolved backend payload until a real run is chosen", () => {
    const unresolved: ResolvedRun = {
      resolved: false,
      run_id: null,
      strategy_id: "damping_wave",
      strategy_version: null,
      trade_date: "2026-03-14",
      root_dir: null,
      available_dbs: [],
      data_origin: "CANONICAL",
      scope: "TODAY",
      target_date: "2026-03-14",
    };

    expect(withActiveRunFallback(unresolved, "DATE", makeRun())).toEqual(unresolved);
    expect(withActiveRunFallback(unresolved, "TODAY", null)).toEqual(unresolved);
  });

  it("falls back to the active run for TODAY when the date-scoped run is missing", () => {
    const unresolved: ResolvedRun = {
      resolved: false,
      run_id: null,
      strategy_id: "damping_wave",
      strategy_version: null,
      trade_date: "2026-03-14",
      root_dir: null,
      available_dbs: [],
      data_origin: "CANONICAL",
      scope: "TODAY",
      target_date: "2026-03-14",
    };

    const fallback = withActiveRunFallback(unresolved, "TODAY", makeRun());

    expect(fallback.resolved).toBe(true);
    expect(fallback.run_id).toBe("run-active-123");
    expect(fallback.trade_date).toBe("2026-03-13");
    expect(fallback.target_date).toBe("2026-03-14");
    expect(fallback.status).toBe("running");
  });

  it("builds a resolved run from registry metadata", () => {
    const resolved = buildResolvedRunFromRegistryRun(makeRun(), "TODAY");

    expect(resolved).toMatchObject({
      resolved: true,
      run_id: "run-active-123",
      strategy_id: "damping_wave",
      strategy_version: "v6",
      trade_date: "2026-03-13",
      target_date: "2026-03-13",
      source: "live",
      status: "running",
    });
  });
});
