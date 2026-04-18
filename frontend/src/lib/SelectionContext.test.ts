import { describe, expect, it } from "vitest";

import {
    buildQuantScopeRequest,
    resolveEffectiveStrategyId,
} from "./SelectionContext";

describe("resolveEffectiveStrategyId", () => {
    it("uses explicit strategy filter when provided", () => {
        const out = resolveEffectiveStrategyId("RUN", "tf_pullback_v1", "damping_wave");
        expect(out).toBe("tf_pullback_v1");
    });

    it("falls back to run strategy in RUN scope when filter is all", () => {
        const out = resolveEffectiveStrategyId("RUN", null, "damping_wave");
        expect(out).toBe("damping_wave");
    });

    it("keeps null for cross-run all-strategies mode", () => {
        const out = resolveEffectiveStrategyId("EPOCH", null, "damping_wave");
        expect(out).toBeNull();
    });
});

describe("buildQuantScopeRequest", () => {
    it("keeps all strategies in cross-run mode by default", () => {
        const out = buildQuantScopeRequest({
            dataScope: "EPOCH",
            strategyFilter: null,
            runId: "run_dw_12345678",
            runStrategyId: "damping_wave",
            portfolioEpoch: 7,
        });

        expect(out.scope).toBe("EPOCH");
        expect(out.strategyId).toBeNull();
        expect(out.isCrossRun).toBe(true);
        expect(out.missingRunId).toBe(false);
        expect(out.portfolioEpoch).toBe(7);
    });

    it("requires a run id for RUN scope", () => {
        const out = buildQuantScopeRequest({
            dataScope: "RUN",
            strategyFilter: null,
            runStrategyId: "damping_wave",
        });

        expect(out.scope).toBe("RUN");
        expect(out.missingRunId).toBe(true);
        expect(out.isCrossRun).toBe(false);
    });

    it("uses the backtest run id for BACKTEST scope", () => {
        const out = buildQuantScopeRequest({
            dataScope: "BACKTEST",
            strategyFilter: null,
            backtestRunId: "bt_foo",
        });

        expect(out.scope).toBe("BACKTEST");
        expect(out.runId).toBe("bt_foo");
        expect(out.isBacktest).toBe(true);
        expect(out.missingRunId).toBe(false);
    });
});
