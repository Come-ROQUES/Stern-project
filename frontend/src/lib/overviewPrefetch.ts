/**
 * Overview Prefetch — fires a lightweight snapshot request at app startup
 * so data is ready before the user navigates to the Overview tab.
 *
 * The "core" detail level skips strategy summaries and portfolio queries,
 * returning only system status + strategies_status in ~50-150ms.
 */

import {
    api,
    type EquityCurveResponse,
    type OverviewPortfolioLaneResponse,
    type OverviewRuntimeLaneResponse,
    type OverviewSummariesLaneResponse,
} from "./api";
import {
    type ActiveContext,
    activeContext,
    defaultScope,
    deriveContextForScope,
} from "./activeContext";

export type OverviewPrefetchParams = {
    runId?: string | null;
    commissionView?: string;
    portfolioEpoch?: number | null;
};

export type OverviewPrefetchPayload = {
    runtime: OverviewRuntimeLaneResponse | null;
    portfolio: OverviewPortfolioLaneResponse | null;
    summaries: OverviewSummariesLaneResponse | null;
    equityCurve: EquityCurveResponse | null;
    key: string;
    prefetchedAt: number;
};

const PREFETCH_TTL_MS = 90_000;

let _data: OverviewRuntimeLaneResponse | null = null;
let _dataFetchedAt: number | null = null;
let _started = false;
const _prefetchCache = new Map<string, OverviewPrefetchPayload>();
const _prefetchInflight = new Map<string, Promise<void>>();

function buildScopedOverviewContext(runId?: string | null): ActiveContext {
    const ctx = deriveContextForScope(activeContext, defaultScope);
    return runId ? { ...ctx, run_id: runId } : ctx;
}

export function buildOverviewPrefetchKey(
    runId?: string | null,
    commissionView = "reported",
    portfolioEpoch?: number | null
): string {
    return [
        runId ?? "desk",
        commissionView,
        portfolioEpoch ?? "current",
    ].join(":");
}

export function startOverviewPrefetch(): void {
    if (_started) return;
    _started = true;
    const ctx = buildScopedOverviewContext();
    api.getOverviewLane("runtime", null, ctx)
        .then((runtime) => {
            _data = runtime as OverviewRuntimeLaneResponse;
            _dataFetchedAt = Date.now();
        })
        .catch(() => {});
}

export function prewarmOverviewPrefetch({
    runId = null,
    commissionView = "reported",
    portfolioEpoch = null,
}: OverviewPrefetchParams = {}): Promise<void> {
    const key = buildOverviewPrefetchKey(runId, commissionView, portfolioEpoch);
    const cached = _prefetchCache.get(key);
    if (cached && Date.now() - cached.prefetchedAt <= PREFETCH_TTL_MS) {
        return Promise.resolve();
    }
    const inflight = _prefetchInflight.get(key);
    if (inflight) {
        return inflight;
    }

    const ctx = buildScopedOverviewContext(runId);
    const request = Promise.allSettled([
        api.getOverviewLane("runtime", runId, ctx, {
            commissionView: commissionView as "reported" | "economic",
            portfolioEpoch,
        }),
        api.getOverviewLane("portfolio", runId, ctx, {
            commissionView: commissionView as "reported" | "economic",
            portfolioEpoch,
        }),
        api.getOverviewLane("summaries", runId, ctx, {
            commissionView: commissionView as "reported" | "economic",
            portfolioEpoch,
        }),
        api.getPortfolioEquityCurve(null, commissionView, portfolioEpoch),
    ])
        .then(([runtimeResult, portfolioResult, summariesResult, equityResult]) => {
            if (runtimeResult.status !== "fulfilled") {
                return;
            }
            const equityCurve =
                equityResult.status === "fulfilled" &&
                (equityResult.value.equity_curve?.length ?? 0) > 0
                    ? equityResult.value
                    : null;
            _prefetchCache.set(key, {
                runtime: runtimeResult.value as OverviewRuntimeLaneResponse,
                portfolio:
                    portfolioResult.status === "fulfilled"
                        ? (portfolioResult.value as OverviewPortfolioLaneResponse)
                        : null,
                summaries:
                    summariesResult.status === "fulfilled"
                        ? (summariesResult.value as OverviewSummariesLaneResponse)
                        : null,
                equityCurve,
                key,
                prefetchedAt: Date.now(),
            });
        })
        .catch(() => {})
        .finally(() => {
            _prefetchInflight.delete(key);
        });

    _prefetchInflight.set(key, request);
    return request;
}

export function consumeOverviewPrefetch(
    {
        runId = null,
        commissionView = "reported",
        portfolioEpoch = null,
    }: OverviewPrefetchParams = {}
): OverviewPrefetchPayload | null {
    const key = buildOverviewPrefetchKey(runId, commissionView, portfolioEpoch);
    const cached = _prefetchCache.get(key);
    if (cached && Date.now() - cached.prefetchedAt <= PREFETCH_TTL_MS) {
        return cached;
    }
    if (_data && _dataFetchedAt && Date.now() - _dataFetchedAt <= PREFETCH_TTL_MS) {
        return {
            runtime: _data,
            portfolio: null,
            summaries: null,
            equityCurve: null,
            key,
            prefetchedAt: _dataFetchedAt,
        };
    }
    return null;
}
