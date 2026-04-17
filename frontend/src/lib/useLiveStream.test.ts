import { describe, expect, it } from "vitest";

import { buildLiveFallbackOhlcUrl } from "./useLiveStream";

describe("buildLiveFallbackOhlcUrl", () => {
  it("returns null when run_id is missing", () => {
    expect(
      buildLiveFallbackOhlcUrl("/react-api", {
        strategyId: "damping_wave",
      })
    ).toBeNull();
  });

  it("injects run_id and strategy_id into fallback OHLC requests", () => {
    expect(
      buildLiveFallbackOhlcUrl("/react-api", {
        runId: "run_123",
        strategyId: "damping_wave",
      })
    ).toBe(
      "/react-api/api/ohlc?limit=2&run_id=run_123&strategy_id=damping_wave"
    );
  });
});
