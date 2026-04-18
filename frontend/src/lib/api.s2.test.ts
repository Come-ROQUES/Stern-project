import { afterEach, describe, expect, it, vi } from "vitest";

import { api, getApiPerfCounters, resetApiPerfState } from "./api";

describe("api S2 guards", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetApiPerfState();
  });

  it("court-circuite getS2Summary sans run_id", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const payload = await api.getS2Summary({
      strategy_id: "s2_pairs_trading",
      strategy_version: "v1_pairs_swing",
      trade_date: "2026-03-09",
      run_id: "",
      mode: "paper",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(payload.run_id).toBeNull();
    expect(payload.warmup_state).toBe("NO_DATA");
    expect(payload.counts.total).toBe(0);
    expect(payload.config_hash).toBeNull();
  });

  it("court-circuite getS2Charts sans run_id", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const payload = await api.getS2Charts(720, {
      strategy_id: "s2_pairs_trading",
      strategy_version: "v1_pairs_swing",
      trade_date: "2026-03-09",
      run_id: "",
      mode: "paper",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(payload.points).toEqual([]);
    expect(payload._meta?.available).toBe(false);
  });

  it("dedupe les GET S2 concurrents sur la meme route", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      {
        ok: true,
        json: async () => ({
          run_id: "run_s2_1",
          config_hash: "cfg123",
          warmup_state: "READY",
          counts: { total: 12, accepted: 3, rejected: 9, warmup: 120 },
          gates: {},
          config: {
            model_family: "ecm",
            config_version: "s2_audnzd_ecm_072_candidate",
            ecm_confirmation: 0.00005,
            exit_z: 0.5,
            stop_z: 3.0,
          },
        }),
      } as Response
    );

    const ctx = {
      strategy_id: "s2_pairs_trading",
      strategy_version: "v1_pairs_swing",
      trade_date: "2026-03-10",
      run_id: "run_s2_1",
      mode: "paper" as const,
    };

    const [first, second] = await Promise.all([
      api.getS2Summary(ctx),
      api.getS2Summary(ctx),
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(first.run_id).toBe("run_s2_1");
    expect(first.config.model_family).toBe("ecm");
    expect(first.config_hash).toBe("cfg123");
    expect(second.run_id).toBe("run_s2_1");
    expect(getApiPerfCounters().dedup).toBeGreaterThan(0);
  });

  it("n emet pas de warning pour un abort sur base fetch safe", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      Object.assign(new Error("signal is aborted without reason"), {
        name: "AbortError",
      })
    );

    const payload = await api.getS2Summary({
      strategy_id: "s2_pairs_trading",
      strategy_version: "v1_pairs_swing",
      trade_date: "2026-03-10",
      run_id: "run_abort",
      mode: "paper",
    });

    expect(payload.run_id).toBe("run_abort");
    expect(payload.warmup_state).toBe("NO_DATA");
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
