import { useCallback, useEffect, useRef } from "react";

export interface MarketAutoReloadOptions {
    baseIntervalMs?: number;
    maxIntervalMs?: number;
    documentRef?: Pick<Document, "hidden" | "addEventListener" | "removeEventListener">;
    windowRef?: Pick<Window, "addEventListener" | "removeEventListener">;
}

type TriggerReason = "timer" | "manual" | "visible";
type TickFn = () => Promise<void>;

export interface MarketAutoReloadController {
    start: () => void;
    stop: () => void;
    triggerNow: (reason?: TriggerReason) => Promise<void>;
    getCurrentDelayMs: () => number;
}

const DEFAULT_INTERVAL_MS = 15_000;
const DEFAULT_MAX_INTERVAL_MS = 60_000;

export function createMarketAutoReloadController(
    tick: TickFn,
    options: MarketAutoReloadOptions = {}
): MarketAutoReloadController {
    const baseIntervalMs = options.baseIntervalMs ?? DEFAULT_INTERVAL_MS;
    const maxIntervalMs = options.maxIntervalMs ?? DEFAULT_MAX_INTERVAL_MS;
    const doc = options.documentRef;
    const win = options.windowRef;
    const timers = globalThis;

    let active = false;
    let inFlight = false;
    let delayMs = baseIntervalMs;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const isVisible = () => (doc ? !doc.hidden : true);

    const clearTimer = () => {
        if (timerId != null) {
            timers.clearTimeout(timerId);
            timerId = null;
        }
    };

    const schedule = (nextDelayMs: number) => {
        clearTimer();
        if (!active || !isVisible()) return;
        timerId = timers.setTimeout(() => {
            void runTick("timer");
        }, nextDelayMs);
    };

    const runTick = async (reason: TriggerReason) => {
        if (!active || !isVisible() || inFlight) return;
        clearTimer();
        if (reason === "manual" || reason === "visible") {
            delayMs = baseIntervalMs;
        }
        inFlight = true;
        try {
            await tick();
            delayMs = baseIntervalMs;
        } catch {
            delayMs = Math.min(delayMs * 2, maxIntervalMs);
        } finally {
            inFlight = false;
            schedule(delayMs);
        }
    };

    const onVisibilityChange = () => {
        if (!active) return;
        if (isVisible()) {
            void runTick("visible");
        } else {
            clearTimer();
        }
    };

    const onWindowFocus = () => {
        if (!active || !isVisible()) return;
        void runTick("visible");
    };

    return {
        start: () => {
            if (active) return;
            active = true;
            doc?.addEventListener("visibilitychange", onVisibilityChange);
            win?.addEventListener("focus", onWindowFocus);
            if (isVisible()) {
                void runTick("visible");
            }
        },
        stop: () => {
            if (!active) return;
            active = false;
            clearTimer();
            doc?.removeEventListener("visibilitychange", onVisibilityChange);
            win?.removeEventListener("focus", onWindowFocus);
        },
        triggerNow: async (reason: TriggerReason = "manual") => {
            await runTick(reason);
        },
        getCurrentDelayMs: () => delayMs,
    };
}

export function useMarketAutoReload(
    tick: TickFn,
    options: Omit<MarketAutoReloadOptions, "documentRef" | "windowRef"> = {}
): { refreshNow: () => Promise<void> } {
    const tickRef = useRef<TickFn>(tick);
    tickRef.current = tick;

    const controllerRef = useRef<MarketAutoReloadController | null>(null);
    if (controllerRef.current == null) {
        controllerRef.current = createMarketAutoReloadController(
            () => tickRef.current(),
            {
                ...options,
                documentRef: typeof document !== "undefined" ? document : undefined,
                windowRef: typeof window !== "undefined" ? window : undefined,
            }
        );
    }

    useEffect(() => {
        const controller = controllerRef.current;
        if (!controller) return;
        controller.start();
        return () => controller.stop();
    }, []);

    const refreshNow = useCallback(async () => {
        const controller = controllerRef.current;
        if (!controller) return;
        await controller.triggerNow("manual");
    }, []);

    return { refreshNow };
}
