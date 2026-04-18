import { useEffect, useRef, useState } from "react";
import { fetchState, type AppState } from "./api";

export type LiveState = {
  data: AppState | null;
  error: string | null;
  lastTickMs: number | null;
};

export function useLiveState(intervalMs = 750): LiveState {
  const [data, setData] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastTickMs, setLastTickMs] = useState<number | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    const tick = async () => {
      if (cancelled || inFlight.current) return;
      inFlight.current = true;
      try {
        const next = await fetchState(ctrl.signal);
        if (cancelled) return;
        setData(next);
        setError(null);
        setLastTickMs(Date.now());
      } catch (err) {
        if (cancelled) return;
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message ?? "fetch failed");
      } finally {
        inFlight.current = false;
      }
    };

    void tick();
    const id = window.setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      ctrl.abort();
      window.clearInterval(id);
    };
  }, [intervalMs]);

  return { data, error, lastTickMs };
}
