import React, { createContext, useContext, useMemo, useState } from "react";
import {
  TIMEFRAMES,
  type TimeframeOption,
  useAggregatedCandles,
} from "./aggregateCandles";
import { type Ohlc } from "./api";

export const BASE_TIMEFRAME: TimeframeOption =
  TIMEFRAMES.find((t) => t.label === "1s") ?? { label: "1s", seconds: 1 };

// Default chart view: 5s bars (was 1m). Keeps parity with bot native bar size.
const DEFAULT_TIMEFRAME: TimeframeOption =
  TIMEFRAMES.find((t) => t.label === "5s") ??
  TIMEFRAMES.find((t) => t.label === "1m") ??
  { label: "5s", seconds: 5 };

type TimeframeContextValue = {
  timeframe: TimeframeOption;
  setTimeframe: (tf: TimeframeOption) => void;
  allowedTimeframes: (TimeframeOption & { disabled: boolean })[];
};

const DashboardTimeframeContext = createContext<TimeframeContextValue | null>(
  null
);

export function DashboardTimeframeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [timeframe, setTimeframe] = useState<TimeframeOption>(DEFAULT_TIMEFRAME);

  const allowedTimeframes = useMemo(
    () =>
      TIMEFRAMES.map((tf) => ({
        ...tf,
        disabled: tf.seconds < BASE_TIMEFRAME.seconds,
      })),
    []
  );

  const value = useMemo(
    () => ({ timeframe, setTimeframe, allowedTimeframes }),
    [timeframe, allowedTimeframes]
  );

  return (
    <DashboardTimeframeContext.Provider value={value}>
      {children}
    </DashboardTimeframeContext.Provider>
  );
}

export function useDashboardTimeframe(): TimeframeContextValue {
  const ctx = useContext(DashboardTimeframeContext);
  if (!ctx) {
    throw new Error("useDashboardTimeframe must be used within provider");
  }
  return ctx;
}

export function useDashboardCandles(
  baseCandles: Ohlc[],
  maxCandles = 300
): Ohlc[] {
  const { timeframe } = useDashboardTimeframe();
  if (timeframe.seconds < BASE_TIMEFRAME.seconds) {
    return useAggregatedCandles(baseCandles, BASE_TIMEFRAME.seconds, maxCandles);
  }
  return useAggregatedCandles(baseCandles, timeframe.seconds, maxCandles);
}
