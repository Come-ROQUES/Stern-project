import { useMemo } from "react";
import { type Ohlc } from "./api";

export type TimeframeOption = {
  label: string;
  seconds: number;
};

export const TIMEFRAMES: TimeframeOption[] = [
  { label: "1s", seconds: 1 },
  { label: "5s", seconds: 5 },
  { label: "15s", seconds: 15 },
  { label: "30s", seconds: 30 },
  { label: "1m", seconds: 60 },
  { label: "5m", seconds: 300 },
  { label: "10m", seconds: 600 },
];

function bucketStart(timestampMs: number, timeframeSec: number): number {
  const tfMs = timeframeSec * 1000;
  return Math.floor(timestampMs / tfMs) * tfMs;
}

/**
 * aggregateCandles — O(n) single-pass aggregation.
 *
 * AXE 3 optimization: removed full sort + Map rebuild.
 * Input bars from the API are already time-ordered (ORDER BY timestamp ASC).
 * We iterate once, bucket into the Map, and return the last `maxCandles`.
 */
export function aggregateCandles(
  candles: Ohlc[],
  timeframeSec: number,
  maxCandles = 150
): Ohlc[] {
  if (timeframeSec <= 0) return candles;
  const buckets = new Map<number, Ohlc>();

  // Single pass — bars are already sorted by timestamp from the API/DB.
  // No need to clone + sort (was O(n log n), now O(n)).
  for (const bar of candles) {
    const ts = new Date(bar.timestamp).getTime();
    const bucketTs = bucketStart(ts, timeframeSec);
    const existing = buckets.get(bucketTs);
    if (!existing) {
      buckets.set(bucketTs, {
        ...bar,
        timestamp: new Date(bucketTs).toISOString(),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume ?? 0,
      });
      continue;
    }
    existing.high = Math.max(existing.high, bar.high);
    existing.low = Math.min(existing.low, bar.low);
    existing.close = bar.close;
    existing.volume = (existing.volume ?? 0) + (bar.volume ?? 0);
    // Keep last spread in bucket (spread at close of aggregated candle)
    if (bar.spread_close_pips != null) {
      existing.spread_close_pips = bar.spread_close_pips;
    }
  }

  // Map preserves insertion order — since input is sorted, entries are sorted
  const aggregated = Array.from(buckets.values());

  if (aggregated.length > maxCandles) {
    return aggregated.slice(aggregated.length - maxCandles);
  }
  return aggregated;
}

export function useAggregatedCandles(
  candles: Ohlc[],
  timeframeSec: number,
  maxCandles = 150
): Ohlc[] {
  return useMemo(
    () => aggregateCandles(candles, timeframeSec, maxCandles),
    [candles, timeframeSec, maxCandles]
  );
}
