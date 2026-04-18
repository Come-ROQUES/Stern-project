import { canonicalApi, type Signal, type Shock } from "../../lib/canonicalApi";
import { activeContext, defaultScope, type DataScope } from "../../lib/activeContext";
import { api, type MarketProfileRow } from "../../lib/api";

type MultiRunSignals = {
  runId: string;
  signals: Signal[];
};

type MultiRunShocks = {
  runId: string;
  shocks: Shock[];
};

/**
 * Fetch signals for multiple run_ids (defensive: per-run limit).
 */
export async function fetchSignalsMultiRun(
  runIds: string[],
  limit = 400,
  strategyId?: string
): Promise<MultiRunSignals[]> {
  const unique = Array.from(new Set(runIds.filter(Boolean)));
  const results: MultiRunSignals[] = [];
  const strategy = strategyId ?? activeContext.strategy_id;
  for (const runId of unique) {
    try {
      const res = await canonicalApi.listSignals(runId, { limit, strategyId: strategy });
      results.push({ runId, signals: res.signals || [] });
    } catch (e) {
      // skip failed run to keep UI responsive
      console.warn("fetchSignalsMultiRun error", runId, e);
    }
  }
  return results;
}

/**
 * Fetch shocks (microstructure proxy) for multiple run_ids.
 */
export async function fetchShocksMultiRun(
  runIds: string[],
  limit = 400,
  strategyId?: string
): Promise<MultiRunShocks[]> {
  const unique = Array.from(new Set(runIds.filter(Boolean)));
  const results: MultiRunShocks[] = [];
  const strategy = strategyId ?? activeContext.strategy_id;
  for (const runId of unique) {
    try {
      const res = await canonicalApi.listShocks(runId, { limit, strategyId: strategy });
      results.push({ runId, shocks: res.shocks || [] });
    } catch (e) {
      console.warn("fetchShocksMultiRun error", runId, e);
    }
  }
  return results;
}

/**
 * Fetch lightweight market profile rows for a run (fallback when run-specific microstructure is needed).
 */
export async function fetchMarketProfileForRun(runId: string, scope: DataScope = defaultScope): Promise<MarketProfileRow[]> {
  const ctx = { ...activeContext, run_id: runId, strategy_id: activeContext.strategy_id };
  try {
    return await api.getMarketProfile(200, ctx, scope);
  } catch (e) {
    console.warn("fetchMarketProfileForRun error", runId, e);
    return [];
  }
}
