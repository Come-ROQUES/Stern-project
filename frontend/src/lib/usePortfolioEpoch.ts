/**
 * usePortfolioEpoch -- convenience hook that delegates to the global
 * PortfolioEpochContext.  Keeps the same public API as the original
 * standalone hook so existing consumers do not need changes.
 */

import { usePortfolioEpochContext } from "./PortfolioEpochContext";

export function usePortfolioEpoch() {
  const ctx = usePortfolioEpochContext();
  return {
    epoch: ctx.selectedEpoch,
    startedAt: ctx.epochStartedAt,
    loading: ctx.loading,
    error: ctx.error,
    refresh: ctx.refresh,
  };
}
