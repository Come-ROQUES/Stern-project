import { afterEach, describe, expect, it, vi } from "vitest";

import {
  api,
  getApiPerfCounters,
  getApiPerfSummary,
  resetApiPerfState,
  setApiPerfScreen,
} from "./api";
import { activeContext, defaultScope } from "./activeContext";

describe("api.getLogs timeout handling", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetApiPerfState();
  });

  it("propagates the dedicated 45s timeout to fetchWithTimeout", async () => {
    vi.useFakeTimers();
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");
    vi.spyOn(globalThis, "fetch").mockImplementation(
      ((_: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const abortError = new Error("Aborted");
            abortError.name = "AbortError";
            reject(abortError);
          });
        })) as typeof fetch
    );

    const request = api.getLogs(120, activeContext, defaultScope, "s1");
    await vi.advanceTimersByTimeAsync(45_000);
    const payload = await request;

    expect(timeoutSpy).toHaveBeenCalled();
    const has45sTimer = timeoutSpy.mock.calls.some((call) => call[1] === 45_000);
    expect(has45sTimer).toBe(true);
    expect(payload.degraded).toBe(true);
    expect(payload.error).toBe("api_unavailable");
  });
});

describe("api overload backoff", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetApiPerfState();
  });

  it("applique un cooldown global court apres un 503 pour eviter de remarteler l'API", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      } as Response)
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          bot_db: true,
          analytics_db: true,
          shadow_db: false,
          status: "ok",
        }),
      } as Response);

    const first = await api.getHealth(activeContext, defaultScope);
    const second = await api.getHealth(activeContext, defaultScope);

    expect(first.status).toBe("ERROR");
    expect(second.status).toBe("ERROR");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3_100);
    const payload = await api.getHealth(activeContext, defaultScope);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(payload.status).toBe("ok");
  });
});

describe("api emergency controls wiring", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetApiPerfState();
  });

  it("loads the dedicated emergency controls endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      {
        ok: true,
        json: async () => ({
          control_dir: "/tmp/control",
          globals: {},
          strategies: {},
        }),
      } as Response
    );

    await api.getEmergencyControls(activeContext, defaultScope);

    const calledUrl = String(fetchSpy.mock.calls[0]?.[0] ?? "");
    expect(calledUrl).toContain("/api/system/emergency_controls");
  });

  it("posts scoped control mutations to the dedicated endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      {
        ok: true,
        json: async () => ({
          success: true,
          message: "ok",
        }),
      } as Response
    );

    await api.postEmergencyControl(
      {
        flag: "systemd_block",
        scope: "service",
        strategy_id: "tf_pullback_v1",
        action: "activate",
        reason: "manual_block",
      },
      "159265",
      activeContext,
      defaultScope
    );

    const [calledUrl, requestInit] = fetchSpy.mock.calls[0] ?? [];
    expect(String(calledUrl)).toContain("/api/system/emergency_controls");
    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-API-Key": "159265",
    });
    expect(requestInit?.body).toBe(
      JSON.stringify({
        flag: "systemd_block",
        scope: "service",
        strategy_id: "tf_pullback_v1",
        action: "activate",
        reason: "manual_block",
      })
    );
  });

  it("posts strategy restart mutations to the dedicated endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      {
        ok: true,
        json: async () => ({
          success: true,
          message: "s2-pairs-a1 restarted",
        }),
      } as Response
    );

    await api.postRestartStrategyService(
      {
        strategy_id: "s2_pairs_trading",
        reason: "post_deploy_manual_restart",
      },
      "159265",
      activeContext,
      defaultScope
    );

    const [calledUrl, requestInit] = fetchSpy.mock.calls[0] ?? [];
    expect(String(calledUrl)).toContain("/api/system/strategy_service/restart");
    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-API-Key": "159265",
    });
    expect(requestInit?.body).toBe(
      JSON.stringify({
        strategy_id: "s2_pairs_trading",
        reason: "post_deploy_manual_restart",
      })
    );
  });

  it("throws when a mutation returns success=false", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      {
        ok: true,
        json: async () => ({
          success: false,
          message: "System actions disabled (ENABLE_SYSTEM_ACTIONS not true)",
        }),
      } as Response
    );

    await expect(
      api.postEmergencyControl(
        {
          flag: "kill_switch",
          scope: "service",
          strategy_id: "tf_pullback_v1",
          action: "deactivate",
          reason: "manual_clear",
        },
        "159265",
        activeContext,
        defaultScope
      )
    ).rejects.toThrow("System actions disabled");
  });
});

describe("api.getVmStatus fallback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetApiPerfState();
  });

  it("returns the degraded fallback payload when fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    const payload = await api.getVmStatus(activeContext, defaultScope);

    expect(payload.host.supported).toBe(false);
    expect(payload.host.checked_at).toBeNull();
    expect(payload.resources.cpu_percent).toBeNull();
    expect(payload.services).toEqual([]);
    expect(payload._meta?.degraded).toBe(true);
  });
});

describe("api.getTerminalSnapshot fallback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetApiPerfState();
  });

  it("returns the degraded fallback payload when fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    const payload = await api.getTerminalSnapshot(activeContext, defaultScope);

    expect(payload.system).toBeNull();
    expect(payload.market_metrics).toBeNull();
    expect(payload.market_profile).toEqual([]);
    expect(payload.ohlc.state).toBe("DEGRADED");
    expect(payload.signals).toEqual([]);
    expect(payload.logs).toBeNull();
    expect(payload._meta?.degraded).toBe(true);
    expect(payload._meta?.errors).toContain("terminal_snapshot_unavailable");
  });

  it("adds sections and signals_mode query parameters when requested", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      {
        ok: true,
        json: async () => ({
          system: null,
          market_metrics: null,
          market_profile: [],
          ohlc: { state: "DEGRADED", ohlc: [] },
          signals: [],
          logs: null,
          _meta: { degraded: true },
        }),
      } as Response
    );

    await api.getTerminalSnapshot(activeContext, defaultScope, {
      sections: ["system", "ohlc", "signals"],
      signalsMode: "lite",
    });

    const calledUrl = String(fetchSpy.mock.calls[0]?.[0] ?? "");
    expect(calledUrl).toContain("/api/ui/terminal_snapshot?");
    expect(calledUrl).toContain("sections=system%2Cohlc%2Csignals");
    expect(calledUrl).toContain("signals_mode=lite");
  });

  it("uses signals_mode=lite by default for terminal snapshot", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      {
        ok: true,
        json: async () => ({
          system: null,
          market_metrics: null,
          market_profile: [],
          ohlc: { state: "DEGRADED", ohlc: [] },
          signals: [],
          logs: null,
        }),
      } as Response
    );

    await api.getTerminalSnapshot(activeContext, defaultScope);
    const calledUrl = String(fetchSpy.mock.calls[0]?.[0] ?? "");
    expect(calledUrl).toContain("signals_mode=lite");
  });

  it("reuses terminal snapshot cache across sequential reads", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      {
        ok: true,
        json: async () => ({
          system: { bot_running: true },
          market_metrics: null,
          market_profile: [],
          ohlc: { state: "LIVE", ohlc: [] },
          signals: [],
          logs: null,
        }),
      } as Response
    );

    await api.getTerminalSnapshot(activeContext, defaultScope, {
      sections: ["system", "ohlc"],
    });
    await api.getTerminalSnapshot(activeContext, defaultScope, {
      sections: ["system", "ohlc"],
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const counters = getApiPerfCounters();
    expect(counters.snapshotFresh).toBeGreaterThan(0);
  });

  it("supports network-only reads for the terminal banner snapshot", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      {
        ok: true,
        json: async () => ({
          system: { bot_running: true },
          market_metrics: null,
          market_profile: [],
          ohlc: { state: "LIVE", ohlc: [] },
          signals: [],
          logs: null,
        }),
      } as Response
    );

    await api.getTerminalSnapshot(activeContext, defaultScope, {
      sections: ["system", "ohlc"],
      cacheMode: "network-only",
    });
    await api.getTerminalSnapshot(activeContext, defaultScope, {
      sections: ["system", "ohlc"],
      cacheMode: "network-only",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("propagates abort for abortable terminal snapshot reads", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      ((_: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const abortError = new Error("Aborted");
            abortError.name = "AbortError";
            reject(abortError);
          });
        })) as typeof fetch
    );

    const controller = new AbortController();
    const request = api.getTerminalSnapshot(activeContext, defaultScope, {
      sections: ["system", "ohlc"],
      cacheMode: "network-only",
      signal: controller.signal,
    });
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("api.getDashboardSnapshot cache", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetApiPerfState();
  });

  it("reuses dashboard snapshot cache across sequential reads", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      {
        ok: true,
        json: async () => ({
          system: { bot_running: true },
          ui_status: null,
          health: { status: "ok", bot_db: true, analytics_db: true, shadow_db: false },
          strategy_summaries: {},
          strategies_status: { strategies: [] },
          portfolio_guard: { enabled: false, canonical_db_path: "", slots: {}, counts: {}, reservations: [] },
        }),
      } as Response
    );

    await api.getDashboardSnapshot("run_x", "ops", activeContext);
    await api.getDashboardSnapshot("run_x", "ops", activeContext);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const counters = getApiPerfCounters();
    expect(counters.snapshotFresh).toBeGreaterThan(0);
  });

  it("passes profile=overview when requested", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      {
        ok: true,
        json: async () => ({
          system: null,
          ui_status: null,
          health: null,
          strategy_summaries: {},
          strategy_runs: {},
          strategies_status: { strategies: [] },
          portfolio_guard: null,
        }),
      } as Response
    );

    await api.getDashboardSnapshot("run_overview", "overview", activeContext);

    const calledUrl = String(fetchSpy.mock.calls[0]?.[0] ?? "");
    expect(calledUrl).toContain("/api/ui/dashboard_snapshot?");
    expect(calledUrl).toContain("profile=overview");
    expect(calledUrl).toContain("run_id=run_overview");
  });

  it("passes overview portfolio options when requested", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      {
        ok: true,
        json: async () => ({
          system: null,
          ui_status: null,
          health: null,
          strategy_summaries: {},
          strategy_runs: {},
          portfolio: null,
          strategies_status: { strategies: [] },
          portfolio_guard: null,
        }),
      } as Response
    );

    await api.getDashboardSnapshot("run_overview", "overview", activeContext, {
      commissionView: "economic",
      portfolioEpoch: 7,
    });

    const calledUrl = String(fetchSpy.mock.calls[0]?.[0] ?? "");
    expect(calledUrl).toContain("profile=overview");
    expect(calledUrl).toContain("commission_view=economic");
    expect(calledUrl).toContain("portfolio_epoch=7");
  });

  it("passes detail_level=core for overview fast path", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      {
        ok: true,
        json: async () => ({
          system: null,
          ui_status: null,
          health: null,
          strategy_summaries: {},
          strategy_runs: {},
          portfolio: null,
          strategies_status: { strategies: [] },
          portfolio_guard: null,
          _meta: { detail_level: "core", deferred_sections: ["strategy_summaries", "portfolio"] },
        }),
      } as Response
    );

    await api.getDashboardSnapshot("run_overview", "overview", activeContext, {
      detailLevel: "core",
    });

    const calledUrl = String(fetchSpy.mock.calls[0]?.[0] ?? "");
    expect(calledUrl).toContain("profile=overview");
    expect(calledUrl).toContain("detail_level=core");
  });

  it("calls portfolio summary endpoint directly when requested", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      {
        ok: true,
        json: async () => ({
          current_epoch: 3,
          sim_equity_usd: 5000,
          equity_usd: 5123,
          pnl_epoch_usd: 123,
          pnl_7d_usd: 45,
          pnl_30d_usd: 67,
          trades_7d: 4,
          trades_30d: 8,
          epoch_started_at: "2026-03-20T00:00:00Z",
        }),
      } as Response
    );

    await api.getPortfolioSummary(activeContext);

    const calledUrl = String(fetchSpy.mock.calls[0]?.[0] ?? "");
    expect(calledUrl).toContain("/api/portfolio/summary");
  });

  it("passes profile=s3 when requested", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      {
        ok: true,
        json: async () => ({
          system: null,
          ui_status: null,
          health: null,
          strategy_summaries: {},
          strategy_runs: {},
          s3: null,
          strategies_status: { strategies: [] },
          portfolio_guard: null,
        }),
      } as Response
    );

    await api.getDashboardSnapshot("run_s3", "s3", activeContext);

    const calledUrl = String(fetchSpy.mock.calls[0]?.[0] ?? "");
    expect(calledUrl).toContain("profile=s3");
    expect(calledUrl).toContain("run_id=run_s3");
  });
});

describe("api.getOhlcForRun abort", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetApiPerfState();
  });

  it("propagates abort for abortable OHLC reads", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      ((_: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const abortError = new Error("Aborted");
            abortError.name = "AbortError";
            reject(abortError);
          });
        })) as typeof fetch
    );

    const controller = new AbortController();
    const request = api.getOhlcForRun(120, "run_abort", activeContext, defaultScope, {
      signal: controller.signal,
    });
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("api.getLogsSnapshot cache", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetApiPerfState();
  });

  it("reuses logs snapshot cache across sequential reads", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      {
        ok: true,
        json: async () => ({
          sources: {
            s1: { lines: [], degraded: false, source: "s1" },
            s2: { lines: [], degraded: false, source: "s2" },
            s3: { lines: [], degraded: false, source: "s3" },
          },
        }),
      } as Response
    );

    await api.getLogsSnapshot(180, activeContext, defaultScope);
    await api.getLogsSnapshot(180, activeContext, defaultScope);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("api perf summary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetApiPerfState();
  });

  it("groups samples by path and screen", async () => {
    setApiPerfScreen("terminal");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      {
        ok: true,
        json: async () => ({ status: "OK", bot_db: true, analytics_db: true, shadow_db: true }),
      } as Response
    );
    await api.getHealth(activeContext, defaultScope);
    const summary = getApiPerfSummary();
    expect(summary.length).toBeGreaterThan(0);
    const terminalCalls = summary.reduce(
      (acc, item) => acc + (item.screens?.terminal ?? 0),
      0
    );
    expect(terminalCalls).toBeGreaterThan(0);
    expect(summary[0]?.sources?.network ?? 0).toBeGreaterThan(0);
  });

  it("counts inflight dedup hits", async () => {
    let resolveFetch!: (value: Response) => void;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );

    const first = api.getHealth(activeContext, defaultScope);
    const second = api.getHealth(activeContext, defaultScope);
    resolveFetch({
      ok: true,
      json: async () => ({
        status: "OK",
        bot_db: true,
        analytics_db: true,
        shadow_db: true,
      }),
    } as Response);
    await Promise.all([first, second]);

    const counters = getApiPerfCounters();
    expect(counters.dedup).toBeGreaterThan(0);
  });
});

describe("api.getStrategySummary context wiring", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetApiPerfState();
  });

  it("uses caller context without duplicating run_id/strategy_id", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      {
        ok: true,
        json: async () => ({
          strategy_id: "tf_pullback_v1",
          strategy_name: "S3 Trend Following",
          run_id: "run_ctx",
          warmup_state: "READY",
          last_signal_ts: null,
          last_signal: null,
          counts: { total: 0, accepted: 0, rejected: 0 },
        }),
      } as Response
    );

    await api.getStrategySummary(
      {
        ...activeContext,
        run_id: "run_ctx",
        strategy_id: "tf_pullback_v1",
      },
      "tf_pullback_v1"
    );

    const calledUrl = String(fetchSpy.mock.calls[0]?.[0] ?? "");
    expect(calledUrl.match(/run_id=/g)?.length ?? 0).toBe(1);
    expect(calledUrl.match(/strategy_id=/g)?.length ?? 0).toBe(1);
    expect(calledUrl).toContain("run_id=run_ctx");
    expect(calledUrl).toContain("strategy_id=tf_pullback_v1");
  });
});
