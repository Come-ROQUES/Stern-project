import { useEffect, useState, type RefObject } from "react";

type UseLightweightChartAutosizeParams = {
  containerRef: RefObject<HTMLElement | null>;
  fallbackHeight: number;
  debugName?: string;
  enabled?: boolean;
};

type ChartSizeState = {
  waitingForSize: boolean;
  width: number;
  height: number;
};

const AUTOSIZE_DEBUG =
  String((import.meta as any).env?.VITE_CHART_AUTOSIZE_DEBUG ?? "").toLowerCase() ===
    "1" ||
  String((import.meta as any).env?.VITE_CHART_AUTOSIZE_DEBUG ?? "").toLowerCase() ===
    "true";

function logDebug(debugName: string, message: string): void {
  if (!AUTOSIZE_DEBUG) return;
  console.debug(`[chart-autosize:${debugName}] ${message}`);
}

/**
 * Lightweight hook that tracks whether the chart container has measurable
 * dimensions.  Actual resize handling is delegated to lightweight-charts
 * built-in `autoSize: true` option — this hook only provides a
 * `waitingForSize` flag so the UI can show a placeholder while the
 * container is not yet laid out (e.g. hidden tab).
 */
export function useLightweightChartAutosize({
  containerRef,
  fallbackHeight,
  debugName = "chart",
  enabled = true,
}: UseLightweightChartAutosizeParams): ChartSizeState {
  const [state, setState] = useState<ChartSizeState>({
    waitingForSize: false,
    width: 0,
    height: fallbackHeight,
  });

  useEffect(() => {
    if (!enabled) return;

    let rafId: number | null = null;
    let ro: ResizeObserver | null = null;
    let disposed = false;

    const updateState = (next: ChartSizeState) => {
      setState((prev) => {
        if (
          prev.waitingForSize === next.waitingForSize &&
          prev.width === next.width &&
          prev.height === next.height
        ) {
          return prev;
        }
        return next;
      });
    };

    const measure = (): boolean => {
      if (disposed) return false;

      const container = containerRef.current;
      if (!container) return false;

      const width = Math.floor(container.clientWidth);
      const rawHeight = Math.floor(container.clientHeight);
      const height = rawHeight > 0 ? rawHeight : fallbackHeight;

      if (width <= 0 || height <= 0) {
        updateState({
          waitingForSize: true,
          width: Math.max(width, 0),
          height: Math.max(height, 0),
        });
        logDebug(
          debugName,
          `container not measurable yet (width=${width}, height=${height})`
        );
        return false;
      }

      updateState({ waitingForSize: false, width, height });
      return true;
    };

    const scheduleRemeasureUntilReady = () => {
      if (rafId != null) {
        cancelAnimationFrame(rafId);
      }
      const tick = () => {
        if (disposed) return;
        const ready = measure();
        if (!ready) {
          rafId = requestAnimationFrame(tick);
        } else {
          rafId = null;
        }
      };
      rafId = requestAnimationFrame(tick);
    };

    const onResize = () => {
      const ready = measure();
      if (!ready) {
        scheduleRemeasureUntilReady();
      }
    };

    const initialContainer = containerRef.current;
    if (initialContainer) {
      ro = new ResizeObserver(onResize);
      ro.observe(initialContainer);
    }
    window.addEventListener("resize", onResize);

    const readyAtStart = measure();
    if (!readyAtStart) {
      scheduleRemeasureUntilReady();
    }

    return () => {
      disposed = true;
      if (rafId != null) {
        cancelAnimationFrame(rafId);
      }
      if (ro) {
        ro.disconnect();
      }
      window.removeEventListener("resize", onResize);
    };
  }, [containerRef, fallbackHeight, debugName, enabled]);

  return state;
}
