/**
 * useLiveStream — WebSocket hook for real-time chart data.
 *
 * Replaces dual HTTP polling (OHLC 2s + tick 0.8s) with a single
 * push channel via /api/ws/live.  Falls back to HTTP polling if WS
 * connection fails or is unavailable.
 *
 * Messages from server (JSON):
 *   { type: "tick", tick: LiveTick, bar: Ohlc|null, bar_update: Ohlc|null }
 *
 *   - tick:       always present (bid/ask/mid/spread_pips/ts)
 *   - bar:        non-null when a NEW bar closes (append to chart)
 *   - bar_update: non-null when current bar OHLC updated (mutate last bar)
 */

import { useEffect, useRef, useCallback, useState } from "react";
import type { LiveTick, Ohlc } from "./api";
import { useViewActivity } from "./viewActivity";

// Build WS URL from current page origin
function buildWsUrl(): string {
    if (typeof window === "undefined") return "";
    const loc = window.location;
    const proto = loc.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${loc.host}/api/ws/live`;
}

export type LiveStreamMessage = {
    type: "tick";
    tick: LiveTick;
    bar: Ohlc | null;       // new closed bar
    bar_update: Ohlc | null; // current bar updated
};

export type LiveStreamCallbacks = {
    onTick: (tick: LiveTick) => void;
    onNewBar: (bar: Ohlc) => void;
    onBarUpdate: (bar: Ohlc) => void;
};

export type LiveStreamStatus = "connecting" | "connected" | "disconnected" | "fallback";

const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 15000;
const FALLBACK_POLL_MS = 2000; // poll agressif quand WS indispo (meme freq que applyTick HTTP)

function buildHttpBase(): string {
    return "";
}

function canAttemptLiveConnection(): boolean {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return false;
    }
    if (
        typeof navigator !== "undefined" &&
        "onLine" in navigator &&
        navigator.onLine === false
    ) {
        return false;
    }
    return true;
}

export type LiveStreamRequestContext = {
    runId?: string | null;
    strategyId?: string | null;
    disableHttpFallback?: boolean;
};

export function buildLiveFallbackOhlcUrl(
    base: string,
    context: LiveStreamRequestContext = {}
): string | null {
    if (!context.runId) return null;
    const params = new URLSearchParams({ limit: "2", run_id: context.runId });
    if (context.strategyId) {
        params.set("strategy_id", context.strategyId);
    }
    return `${base}/api/ohlc?${params.toString()}`;
}

export function useLiveStream(
    enabled: boolean,
    callbacks: LiveStreamCallbacks,
    context: LiveStreamRequestContext = {}
): { status: LiveStreamStatus } {
    const viewActive = useViewActivity();
    const effectiveEnabled = enabled && viewActive;
    const [status, setStatus] = useState<LiveStreamStatus>("disconnected");
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fallbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const reconnectDelayRef = useRef(RECONNECT_DELAY_MS);
    const connectVersionRef = useRef(0);
    const enabledRef = useRef(enabled);
    const contextRef = useRef(context);
    const disableHttpFallbackRef = useRef(Boolean(context.disableHttpFallback));
    const lastFallbackBarTsRef = useRef<number | null>(null);
    const callbacksRef = useRef(callbacks);
    callbacksRef.current = callbacks;
    enabledRef.current = effectiveEnabled;

    const closeSocket = useCallback((ws: WebSocket | null, forceDuringConnect = false) => {
        if (!ws) return;
        try {
            if (ws.readyState === WebSocket.CONNECTING && !forceDuringConnect) {
                return;
            }
            if (
                ws.readyState === WebSocket.OPEN ||
                ws.readyState === WebSocket.CONNECTING
            ) {
                ws.close();
            }
        } catch {
            // noop
        }
    }, []);

    useEffect(() => {
        contextRef.current = context;
        disableHttpFallbackRef.current = Boolean(context.disableHttpFallback);
    }, [context.runId, context.strategyId, context.disableHttpFallback]);

    const stopFallbackPolling = useCallback(() => {
        if (fallbackTimerRef.current) {
            clearInterval(fallbackTimerRef.current);
            fallbackTimerRef.current = null;
        }
    }, []);

    const clearReconnectTimer = useCallback(() => {
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }
    }, []);

    const runFallbackPoll = useCallback(async () => {
        const base = buildHttpBase();
        const ohlcUrl = buildLiveFallbackOhlcUrl(base, contextRef.current);
        const [tickRes, ohlcRes] = await Promise.allSettled([
            fetch(`${base}/api/price/tick`),
            ohlcUrl ? fetch(ohlcUrl) : Promise.resolve(null),
        ]);

        if (tickRes.status === "fulfilled" && tickRes.value.ok) {
            const tick = (await tickRes.value.json()) as LiveTick;
            callbacksRef.current.onTick(tick);
        }

        if (
            ohlcRes.status !== "fulfilled" ||
            ohlcRes.value == null ||
            !ohlcRes.value.ok
        ) {
            return;
        }
        const payload = (await ohlcRes.value.json()) as
            | { ohlc?: Ohlc[] }
            | Ohlc[];
        const rows = Array.isArray(payload) ? payload : payload.ohlc ?? [];
        if (!rows.length) return;
        const latest = rows[rows.length - 1];
        const latestTs = Date.parse(latest.timestamp);
        if (!Number.isFinite(latestTs)) return;
        if (lastFallbackBarTsRef.current === null || latestTs > lastFallbackBarTsRef.current) {
            lastFallbackBarTsRef.current = latestTs;
            callbacksRef.current.onNewBar(latest);
        } else {
            callbacksRef.current.onBarUpdate(latest);
        }
    }, []);

    const startFallbackPolling = useCallback(() => {
        if (
            fallbackTimerRef.current ||
            !enabledRef.current ||
            disableHttpFallbackRef.current
        ) {
            return;
        }
        setStatus("fallback");
        void runFallbackPoll().catch(() => undefined);
        fallbackTimerRef.current = setInterval(() => {
            if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
            void runFallbackPoll().catch(() => undefined);
        }, FALLBACK_POLL_MS);
    }, [runFallbackPoll]);

    const connect = useCallback(() => {
        if (!enabledRef.current) return;
        if (!canAttemptLiveConnection()) {
            stopFallbackPolling();
            setStatus("disconnected");
            return;
        }
        const url = buildWsUrl();
        if (!url) return;
        const connectVersion = ++connectVersionRef.current;
        clearReconnectTimer();

        // Clean up previous
        if (wsRef.current) {
            closeSocket(wsRef.current);
        }

        setStatus("connecting");
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
            if (connectVersion !== connectVersionRef.current || !enabledRef.current) {
                closeSocket(ws, true);
                return;
            }
            stopFallbackPolling();
            setStatus("connected");
            reconnectDelayRef.current = RECONNECT_DELAY_MS; // reset backoff
        };

        ws.onmessage = (event) => {
            if (connectVersion !== connectVersionRef.current || !enabledRef.current) return;
            try {
                const msg: LiveStreamMessage = JSON.parse(event.data);
                if (msg.tick) {
                    callbacksRef.current.onTick(msg.tick);
                }
                if (msg.bar) {
                    callbacksRef.current.onNewBar(msg.bar);
                }
                if (msg.bar_update) {
                    callbacksRef.current.onBarUpdate(msg.bar_update);
                }
            } catch {
                // ignore malformed messages
            }
        };

        ws.onerror = () => {
            // onclose will fire next
        };

        ws.onclose = () => {
            if (connectVersion !== connectVersionRef.current) return;
            if (wsRef.current === ws) {
                wsRef.current = null;
            }
            if (!enabledRef.current) {
                stopFallbackPolling();
                setStatus("disconnected");
                return;
            }
            const canRetryNow = canAttemptLiveConnection();
            if (disableHttpFallbackRef.current || !canRetryNow) {
                stopFallbackPolling();
                setStatus("disconnected");
            } else {
                startFallbackPolling();
            }
            if (!canRetryNow) {
                return;
            }
            // Exponential backoff reconnect
            const delay = reconnectDelayRef.current;
            reconnectDelayRef.current = Math.min(delay * 1.5, MAX_RECONNECT_DELAY_MS);
            reconnectTimerRef.current = setTimeout(() => {
                connect();
            }, delay);
        };
    }, [clearReconnectTimer, closeSocket, startFallbackPolling, stopFallbackPolling]);

    useEffect(() => {
        if (typeof window === "undefined" || typeof document === "undefined") return;
        const handleAvailabilityChange = () => {
            if (!enabledRef.current) return;
            if (!canAttemptLiveConnection()) {
                clearReconnectTimer();
                stopFallbackPolling();
                if (wsRef.current) {
                    closeSocket(wsRef.current);
                    wsRef.current = null;
                }
                setStatus("disconnected");
                return;
            }
            if (!wsRef.current) {
                connect();
            }
        };
        document.addEventListener("visibilitychange", handleAvailabilityChange);
        window.addEventListener("online", handleAvailabilityChange);
        window.addEventListener("offline", handleAvailabilityChange);
        return () => {
            document.removeEventListener("visibilitychange", handleAvailabilityChange);
            window.removeEventListener("online", handleAvailabilityChange);
            window.removeEventListener("offline", handleAvailabilityChange);
        };
    }, [clearReconnectTimer, closeSocket, connect, stopFallbackPolling]);

    useEffect(() => {
        if (effectiveEnabled) {
            connect();
        }
        return () => {
            connectVersionRef.current += 1;
            clearReconnectTimer();
            stopFallbackPolling();
            if (wsRef.current) {
                closeSocket(wsRef.current);
                wsRef.current = null;
            }
            setStatus("disconnected");
        };
    }, [clearReconnectTimer, closeSocket, effectiveEnabled, connect, stopFallbackPolling]);

    return { status };
}
