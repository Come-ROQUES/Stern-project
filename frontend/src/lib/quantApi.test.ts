import { afterEach, describe, expect, it, vi } from "vitest";

import {
    buildUrlWithBase,
    buildQuantScopeParams,
    getDampingWaveMissedOpportunities,
    getQuantRegimesDashboard,
    getSignalQualityV3First,
    getTradePerformanceV3First,
    scopeToDateRange,
} from "./quantApi";

describe("scopeToDateRange", () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it("returns UTC day bounds for TODAY", () => {
        const res = scopeToDateRange("TODAY");
        const today = new Date().toISOString().split("T")[0];

        expect(res.backendScope).toBe("TODAY");
        expect(res.from_date).toBe(today);
        expect(res.to_date).toBe(today);
        expect(res.useRunId).toBe(false);
    });

    it("maps EPOCH to backend EPOCH scope", () => {
        const res = scopeToDateRange("EPOCH");
        expect(res.backendScope).toBe("EPOCH");
        expect(res.from_date).toBeUndefined();
        expect(res.to_date).toBeUndefined();
        expect(res.useRunId).toBe(false);
    });

    it("maps BACKTEST to RUN scope", () => {
        const res = scopeToDateRange("BACKTEST");
        expect(res.backendScope).toBe("RUN");
        expect(res.useRunId).toBe(true);
    });
});

describe("buildQuantScopeParams", () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it("flags missing run_id for RUN scope", () => {
        const res = buildQuantScopeParams("RUN", undefined, "damping_wave");
        expect(res.useRunId).toBe(true);
        expect(res.missingRunId).toBe(true);
        expect(res.params.scope).toBe("RUN");
    });
});

describe("buildUrlWithBase", () => {
    it("supports relative API bases used in production", () => {
        const url = buildUrlWithBase(
            "/react-api",
            "/api/quant/v1/market",
            { scope: "TODAY", strategy_id: "damping_wave" }
        );

        expect(url).toContain("/react-api/api/quant/v1/market");
        expect(url).toContain("scope=TODAY");
        expect(url).toContain("strategy_id=damping_wave");
    });
});

describe("getTradePerformanceV3First", () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it("calls the dedicated V3 trade performance endpoint", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input: RequestInfo | URL) => {
                const url = String(input);
                if (url.includes("/api/portfolio/epoch")) {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({ current_epoch: 4 }),
                        text: async () => "",
                    } as unknown as Response;
                }
                if (url.includes("/api/quant/trades/performance")) {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            equity_curve: [],
                            trades: [],
                            distribution: { bins: [], counts: [] },
                            kpis: {
                                total_pnl: 0,
                                total_pnl_usd: 0,
                                max_drawdown: 0,
                                win_rate: 0,
                                profit_factor: 0,
                                sharpe_proxy: 0,
                                trade_count: 0,
                            },
                            meta: { data_source: "V3", fallback_used: false },
                        }),
                        text: async () => "",
                    } as unknown as Response;
                }
                throw new Error(`unexpected fetch url: ${url}`);
            }
        );

        const result = await getTradePerformanceV3First(
            undefined,
            "damping_wave",
            "30D"
        );

        const urls = fetchSpy.mock.calls.map(([arg]) => String(arg));
        expect(urls.some((u) => u.includes("/api/quant/trades/performance"))).toBe(true);
        expect(urls.some((u) => u.includes("/api/portfolio/trades"))).toBe(false);
        expect(result.meta?.data_source).toBe("V3");
        expect(result.meta?.fallback_used).toBe(false);
    });
});

describe("getSignalQualityV3First", () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it("deduplicates and caches identical V3 signal requests", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input: RequestInfo | URL) => {
                const url = String(input);
                if (url.includes("/api/portfolio/epoch")) {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({ current_epoch: 4 }),
                        text: async () => "",
                    } as unknown as Response;
                }
                if (url.includes("/api/quant/signals/quality")) {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            signals: [],
                            funnel: { total: 0, accepted: 0, traded: 0, profitable: 0 },
                            heatmap: [],
                            kpis: {
                                accept_rate: 0,
                                avg_net: 0,
                                traded_count: 0,
                                median_net: 0,
                                p25_net: 0,
                                p75_net: 0,
                                iqr_net: 0,
                                outlier_count: 0,
                                best_combo: null,
                            },
                            meta: { data_source: "V3", fallback_used: false },
                        }),
                        text: async () => "",
                    } as unknown as Response;
                }
                throw new Error(`unexpected fetch url: ${url}`);
            }
        );

        await getSignalQualityV3First(undefined, "damping_wave", "30D", "ALL");
        await getSignalQualityV3First(undefined, "damping_wave", "30D", "ALL");

        const urls = fetchSpy.mock.calls.map(([arg]) => String(arg));
        expect(urls.filter((u) => u.includes("/api/quant/signals/quality"))).toHaveLength(1);
    });
});

describe("getDampingWaveMissedOpportunities", () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it("deduplicates and caches identical S1 missed-opportunity requests", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input: RequestInfo | URL) => {
                const url = String(input);
                if (url.includes("/api/registry/signals/missed-opportunities")) {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            summary: {
                                rejected_total: 7,
                                rejected_executable_count: 6,
                                rejected_unreliable_count: 1,
                                missed_pnl_raw_pips: 20.4,
                                missed_pnl_clustered_pips: 5.2,
                                avg_missed_pnl_pips: 3.4,
                                tp_after_decision_rate: 1,
                                avg_mfe_pips: 6.6,
                                avg_mae_pips: -0.8,
                                cluster_count: 2,
                                unspecified_rejection_count: 1,
                                cluster_method: "first_signal",
                                top_reasons: [{ reason: "RR_NET_TOO_LOW", count: 1 }],
                            },
                            reasons: [],
                            clusters: [],
                            signals: [
                                {
                                    signal_id: "sig_1",
                                    timestamp: "2026-04-08T08:25:11+00:00",
                                    accepted: 0,
                                    rejection_reason: "RR_NET_TOO_LOW",
                                    sim_outcome: "TP_HIT",
                                    sim_valid: true,
                                    sim_verdict: "WOULD_WIN",
                                    sim_pnl_pips: 2.81,
                                    session: "LONDON",
                                    regime: "HIGH",
                                },
                            ],
                            _meta: {
                                run_id: "run_1",
                                strategy_id: "damping_wave",
                                cluster_window_s: 5,
                                generated_at: "2026-04-08T09:00:00+00:00",
                            },
                        }),
                        text: async () => "",
                    } as unknown as Response;
                }
                throw new Error(`unexpected fetch url: ${url}`);
            }
        );

        const first = await getDampingWaveMissedOpportunities("run_1", 5);
        const second = await getDampingWaveMissedOpportunities("run_1", 5);

        expect(first.summary.missed_pnl_clustered_pips).toBe(5.2);
        expect(first.signals[0].ts).toBe("2026-04-08T08:25:11+00:00");
        expect(first.signals[0].rejection_reason).toBe("RR_NET_TOO_LOW");
        expect(second.summary.cluster_count).toBe(2);

        const urls = fetchSpy.mock.calls.map(([arg]) => String(arg));
        expect(urls.filter((u) => u.includes("/api/registry/signals/missed-opportunities"))).toHaveLength(1);
    });
});

describe("getQuantRegimesDashboard", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("calls the new regimes dashboard endpoint without legacy fallback", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input: RequestInfo | URL) =>
                ({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        meta: { data_source: "V3", fallback_used: false },
                        taxonomy: {
                            vol_regime: ["LOW", "NORMAL", "HIGH", "EXTREME"],
                            spread_regime: ["TIGHT", "NORMAL", "WIDE"],
                            session: ["ASIA", "LONDON", "OVERLAP", "NY", "UNKNOWN"],
                        },
                        kpis: {
                            signals_total: 0,
                            accepted_total: 0,
                            traded_total: 0,
                            pnl_samples_total: 0,
                            coverage_ratio: 0,
                        },
                        heatmaps: {
                            expectancy: {
                                metric: "mean_pnl_net_pips",
                                x_labels: ["LOW", "NORMAL"],
                                y_labels: ["ASIA", "LONDON"],
                                matrix: [
                                    [0.2, null],
                                    [null, null],
                                ],
                                counts: [
                                    [4, 0],
                                    [0, 0],
                                ],
                                confidence: [
                                    ["HIGH", "LOW"],
                                    ["LOW", "LOW"],
                                ],
                                confidence_scores: [
                                    [0.82, 0],
                                    [0, 0],
                                ],
                                render_hint: "INTERACTIVE_ONLY",
                            },
                            risk_tail: {
                                metric: "cvar_5_pips",
                                x_labels: ["LOW", "NORMAL"],
                                y_labels: ["TIGHT", "NORMAL"],
                                matrix: [
                                    [null, null],
                                    [null, null],
                                ],
                                counts: [
                                    [0, 0],
                                    [0, 0],
                                ],
                                confidence: [
                                    ["LOW", "LOW"],
                                    ["LOW", "LOW"],
                                ],
                                confidence_scores: [
                                    [0, 0],
                                    [0, 0],
                                ],
                            },
                            execution_erosion: {
                                metric: "execution_erosion_pips",
                                x_labels: ["TIGHT", "NORMAL"],
                                y_labels: ["ASIA", "LONDON"],
                                matrix: [
                                    [null, null],
                                    [null, null],
                                ],
                                counts: [
                                    [0, 0],
                                    [0, 0],
                                ],
                                confidence: [
                                    ["LOW", "LOW"],
                                    ["LOW", "LOW"],
                                ],
                                confidence_scores: [
                                    [0, 0],
                                    [0, 0],
                                ],
                            },
                            funnel_conversion: {
                                metric: "accepted_over_signals_rate",
                                x_labels: ["LOW", "NORMAL"],
                                y_labels: ["ASIA", "LONDON"],
                                matrix: [
                                    [null, null],
                                    [null, null],
                                ],
                                counts: [
                                    [0, 0],
                                    [0, 0],
                                ],
                                confidence: [
                                    ["LOW", "LOW"],
                                    ["LOW", "LOW"],
                                ],
                                confidence_scores: [
                                    [0, 0],
                                    [0, 0],
                                ],
                            },
                            stability_confidence: {
                                metric: "stability_confidence_score",
                                x_labels: ["LOW", "NORMAL"],
                                y_labels: ["ASIA", "LONDON"],
                                matrix: [
                                    [null, null],
                                    [null, null],
                                ],
                                counts: [
                                    [0, 0],
                                    [0, 0],
                                ],
                                confidence: [
                                    ["LOW", "LOW"],
                                    ["LOW", "LOW"],
                                ],
                                confidence_scores: [
                                    [0, 0],
                                    [0, 0],
                                ],
                            },
                        },
                    }),
                    text: async () => "",
                }) as unknown as Response
        );

        const result = await getQuantRegimesDashboard({
            scope: "RUN",
            runId: "run_dw_123",
            strategyId: "damping_wave",
        });

        const urls = fetchSpy.mock.calls.map(([arg]) => String(arg));
        expect(urls.some((u) => u.includes("/api/quant/regimes/dashboard"))).toBe(true);
        expect(urls.some((u) => u.includes("/api/quant/regime/heatmap"))).toBe(false);
        expect(result.heatmaps.expectancy.image_base64).toBeUndefined();
        expect(result.heatmaps.expectancy.render_hint).toBe("INTERACTIVE_ONLY");
    });
});
