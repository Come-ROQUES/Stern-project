import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildCanonicalTradesCacheKey,
  canonicalApi,
  clearCanonicalTradesHotCache,
  prefetchCanonicalTrades,
  resetDiagnostics,
} from "./canonicalApi";

describe("canonicalApi run-not-found fallbacks", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetDiagnostics();
    clearCanonicalTradesHotCache();
  });

  it("returns empty trades payload on 404 run not found", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () => '{"detail":"Run not found: ee2c"}',
    } as Response);

    const payload = await canonicalApi.getTrades("ee2c", 50, {
      strategyId: "s2_pairs_trading",
    });

    expect(payload.count).toBe(0);
    expect(payload.trades).toEqual([]);
  });

  it("returns unresolved scope when run resolve endpoint has no run", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () =>
        '{"detail":"Run not found for strategy/date: strategy=s2_pairs_trading date=2026-02-27"}',
    } as Response);

    const payload = await canonicalApi.resolveRunScope({
      strategyId: "s2_pairs_trading",
      scope: "TODAY",
    });

    expect(payload.resolved).toBe(false);
    expect(payload.run_id).toBeNull();
    expect(payload.strategy_id).toBe("s2_pairs_trading");
    expect(payload.scope).toBe("TODAY");
  });

  it("returns unresolved scope when run resolve endpoint responds 200 unresolved", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        resolved: false,
        run_id: null,
        strategy_id: "s2_pairs_trading",
        strategy_version: null,
        trade_date: "2026-03-14",
        root_dir: null,
        available_dbs: [],
        data_origin: "REGISTRY",
        scope: "TODAY",
        target_date: "2026-03-14",
        meta: { fallback: "run_not_found" },
      }),
    } as Response);

    const payload = await canonicalApi.resolveRunScope({
      strategyId: "s2_pairs_trading",
      scope: "TODAY",
    });

    expect(payload.resolved).toBe(false);
    expect(payload.run_id).toBeNull();
    expect(payload.strategy_id).toBe("s2_pairs_trading");
    expect(payload.meta).toEqual({ fallback: "run_not_found" });
  });

  it("keeps throwing on unrelated 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () => '{"detail":"endpoint missing"}',
    } as Response);

    await expect(canonicalApi.getTrades("ee2c")).rejects.toThrow("HTTP 404");
  });

  it("passes lite=true when requesting lightweight signals payloads", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        signals: [],
        count: 0,
      }),
    } as Response);

    await canonicalApi.listSignals("run-1", {
      strategyId: "damping_wave",
      limit: 250,
      lite: true,
    });

    const [url] = fetchSpy.mock.calls[0] ?? [];
    expect(String(url)).toContain("/api/registry/signals?");
    expect(String(url)).toContain("run_id=run-1");
    expect(String(url)).toContain("strategy_id=damping_wave");
    expect(String(url)).toContain("limit=250");
    expect(String(url)).toContain("lite=true");
  });

  it("builds portfolio trades requests without the dashboard snapshot path", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        trades: [],
        count: 0,
        _meta: {},
      }),
    } as Response);

    await canonicalApi.getPortfolioTrades({
      limit: 500,
      portfolioEpoch: 7,
      commissionView: "economic",
      strategyId: "damping_wave",
      responseMode: "compact",
    });

    const [url] = fetchSpy.mock.calls[0] ?? [];
    expect(String(url)).toContain("/api/portfolio/trades?");
    expect(String(url)).toContain("limit=500");
    expect(String(url)).toContain("portfolio_epoch=7");
    expect(String(url)).toContain("commission_view=economic");
    expect(String(url)).toContain("strategy_id=damping_wave");
    expect(String(url)).toContain("response_mode=compact");
    expect(String(url)).not.toContain("/api/ui/dashboard_snapshot");
  });

  it("separe le cache trades par run, strategie et vue commission", () => {
    const base = buildCanonicalTradesCacheKey("run-1", 300, {
      strategyId: "damping_wave",
      commissionView: "reported",
    });
    const otherStrategy = buildCanonicalTradesCacheKey("run-1", 300, {
      strategyId: "tf_pullback_v1",
      commissionView: "reported",
    });
    const otherCommission = buildCanonicalTradesCacheKey("run-1", 300, {
      strategyId: "damping_wave",
      commissionView: "economic",
    });
    const otherRun = buildCanonicalTradesCacheKey("run-2", 300, {
      strategyId: "damping_wave",
      commissionView: "reported",
    });

    expect(base).not.toBe(otherStrategy);
    expect(base).not.toBe(otherCommission);
    expect(base).not.toBe(otherRun);
  });

  it("ne refetch pas un prefetch trades deja chaud", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        trades: [],
        count: 0,
        _meta: { commission_view_used: "reported" },
      }),
    } as Response);

    await prefetchCanonicalTrades("run-hot", 300, {
      strategyId: "damping_wave",
      commissionView: "reported",
    });
    await prefetchCanonicalTrades("run-hot", 300, {
      strategyId: "damping_wave",
      commissionView: "reported",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("derive une vraie fenetre complete quand le endpoint run_window manque", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => '{"detail":"missing"}',
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => '{"detail":"run missing"}',
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          signals: [{ timestamp: "2026-03-25T08:00:00.000Z" }],
          count: 1,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          signals: [{ timestamp: "2026-03-25T11:30:00.000Z" }],
          count: 1,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          shocks: [{ timestamp: "2026-03-25T07:45:00.000Z" }],
          count: 1,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          shocks: [{ timestamp: "2026-03-25T12:10:00.000Z" }],
          count: 1,
        }),
      } as Response);

    const window = await canonicalApi.getRunWindow("run-1", "damping_wave");

    expect(window).toEqual({
      start: "2026-03-25T07:45:00.000Z",
      end: "2026-03-25T12:10:00.000Z",
    });

    const urls = fetchSpy.mock.calls.map(([url]) => String(url));
    expect(urls[2]).toContain("order=asc");
    expect(urls[3]).toContain("order=desc");
    expect(urls[4]).toContain("order=asc");
    expect(urls[5]).toContain("order=desc");
  });
});
