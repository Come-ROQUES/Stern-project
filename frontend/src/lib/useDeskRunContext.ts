import { useEffect, useMemo, useState } from "react";

import { api, type DeskRunContextResponse } from "./api";

export type DeskRunContextInput = {
    selectedRunId?: string | null;
    activeRunId?: string | null;
    bundleEnabled?: boolean;
    dwRunId?: string | null;
    s2RunId?: string | null;
    tfRunId?: string | null;
};

type DeskRunContextState = {
    data: DeskRunContextResponse;
    loading: boolean;
};

const DESK_STRATEGIES = [
    "damping_wave",
    "s2_pairs_trading",
    "tf_pullback_v1",
] as const;

const deskRunContextCache = new Map<string, DeskRunContextResponse>();
const deskRunContextInflight = new Map<string, Promise<DeskRunContextResponse>>();

function buildDeskRunContextKey({
    selectedRunId = null,
    activeRunId = null,
    bundleEnabled = true,
    dwRunId = null,
    s2RunId = null,
    tfRunId = null,
}: DeskRunContextInput): string {
    return [
        selectedRunId ?? "none",
        activeRunId ?? "none",
        bundleEnabled ? "bundle" : "single",
        dwRunId ?? "none",
        s2RunId ?? "none",
        tfRunId ?? "none",
    ].join(":");
}

function buildFallbackDeskRunContext({
    selectedRunId = null,
    activeRunId = null,
    bundleEnabled = true,
    dwRunId = null,
    s2RunId = null,
    tfRunId = null,
}: DeskRunContextInput): DeskRunContextResponse {
    const bundleInputs = {
        damping_wave: dwRunId ?? null,
        s2_pairs_trading: s2RunId ?? null,
        tf_pullback_v1: tfRunId ?? null,
    };
    const strategyRuns: Record<string, string | null> = {
        damping_wave: bundleEnabled ? dwRunId ?? null : selectedRunId ?? activeRunId ?? null,
        s2_pairs_trading: bundleEnabled ? s2RunId ?? null : null,
        tf_pullback_v1: bundleEnabled ? tfRunId ?? null : null,
    };
    const strategySources: DeskRunContextResponse["strategy_sources"] = {};

    for (const strategyId of DESK_STRATEGIES) {
        const runId = strategyRuns[strategyId] ?? null;
        strategySources[strategyId] = {
            run_id: runId,
            source: runId ? (bundleEnabled ? "bundle_fallback" : "selected_fallback") : "missing",
        };
    }

    const seedRunId = bundleEnabled
        ? dwRunId ?? s2RunId ?? tfRunId ?? selectedRunId ?? activeRunId ?? null
        : selectedRunId ?? activeRunId ?? dwRunId ?? s2RunId ?? tfRunId ?? null;

    return {
        bundle_enabled: bundleEnabled,
        seed_run_id: seedRunId,
        has_any_run: Boolean(
            seedRunId ||
                strategyRuns.damping_wave ||
                strategyRuns.s2_pairs_trading ||
                strategyRuns.tf_pullback_v1
        ),
        selected_run_id: selectedRunId,
        active_run_id: activeRunId,
        selected_run: null,
        active_run: null,
        runtime_runs: {},
        strategy_runs: strategyRuns,
        strategy_sources: strategySources,
        bundle_inputs: bundleInputs,
        _meta: {
            errors: [],
            cache_hit: false,
        },
    };
}

async function loadDeskRunContext(
    input: DeskRunContextInput
): Promise<DeskRunContextResponse> {
    const key = buildDeskRunContextKey(input);
    const cached = deskRunContextCache.get(key);
    if (cached) {
        return cached;
    }

    const inflight = deskRunContextInflight.get(key);
    if (inflight) {
        return inflight;
    }

    const request = api
        .getDeskRunContext(input)
        .then((payload) => {
            deskRunContextCache.set(key, payload);
            return payload;
        })
        .finally(() => {
            deskRunContextInflight.delete(key);
        });

    deskRunContextInflight.set(key, request);
    return request;
}

export function useDeskRunContext(input: DeskRunContextInput): DeskRunContextState {
    const normalizedInput = useMemo(
        () => ({
            selectedRunId: input.selectedRunId ?? null,
            activeRunId: input.activeRunId ?? null,
            bundleEnabled: input.bundleEnabled ?? true,
            dwRunId: input.dwRunId ?? null,
            s2RunId: input.s2RunId ?? null,
            tfRunId: input.tfRunId ?? null,
        }),
        [
            input.activeRunId,
            input.bundleEnabled,
            input.dwRunId,
            input.s2RunId,
            input.selectedRunId,
            input.tfRunId,
        ]
    );
    const key = useMemo(() => buildDeskRunContextKey(normalizedInput), [normalizedInput]);
    const fallback = useMemo(
        () => buildFallbackDeskRunContext(normalizedInput),
        [normalizedInput]
    );
    const [state, setState] = useState<DeskRunContextState>(() => {
        const cached = deskRunContextCache.get(key);
        return {
            data: cached ?? fallback,
            loading: !cached,
        };
    });

    useEffect(() => {
        const cached = deskRunContextCache.get(key);
        if (cached) {
            setState({ data: cached, loading: false });
            return;
        }

        let cancelled = false;
        setState((prev) => ({
            data: prev.data.seed_run_id ? prev.data : fallback,
            loading: true,
        }));

        void loadDeskRunContext(normalizedInput).then((payload) => {
            if (cancelled) {
                return;
            }
            setState({ data: payload, loading: false });
        });

        return () => {
            cancelled = true;
        };
    }, [fallback, key, normalizedInput]);

    return state;
}

export function resetDeskRunContextCacheForTests(): void {
    deskRunContextCache.clear();
    deskRunContextInflight.clear();
}
