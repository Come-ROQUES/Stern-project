import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMarketAutoReloadController } from "./useMarketAutoReload";

interface EventHandlerMap {
    [event: string]: Set<() => void>;
}

function createVisibilityDoc(hidden = false) {
    const handlers: EventHandlerMap = {};
    return {
        get hidden() {
            return hidden;
        },
        set hidden(value: boolean) {
            hidden = value;
        },
        addEventListener(event: string, handler: () => void) {
            if (!handlers[event]) handlers[event] = new Set();
            handlers[event].add(handler);
        },
        removeEventListener(event: string, handler: () => void) {
            handlers[event]?.delete(handler);
        },
        emit(event: string) {
            handlers[event]?.forEach((handler) => handler());
        },
    };
}

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

describe("createMarketAutoReloadController", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("declenche un refresh toutes les 15s quand visible", async () => {
        const doc = createVisibilityDoc(false);
        const tick = vi.fn(async () => {});
        const controller = createMarketAutoReloadController(tick, { documentRef: doc });

        controller.start();
        await flush();
        expect(tick).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(15_000);
        await flush();
        expect(tick).toHaveBeenCalledTimes(2);
    });

    it("met en pause cache et reprend immediatement au retour visible", async () => {
        const doc = createVisibilityDoc(false);
        const tick = vi.fn(async () => {});
        const controller = createMarketAutoReloadController(tick, { documentRef: doc });

        controller.start();
        await flush();
        expect(tick).toHaveBeenCalledTimes(1);

        doc.hidden = true;
        doc.emit("visibilitychange");
        vi.advanceTimersByTime(60_000);
        await flush();
        expect(tick).toHaveBeenCalledTimes(1);

        doc.hidden = false;
        doc.emit("visibilitychange");
        await flush();
        expect(tick).toHaveBeenCalledTimes(2);
    });

    it("n execute pas de tick concurrent pendant un fetch en vol", async () => {
        const doc = createVisibilityDoc(false);
        let release: (() => void) | null = null;
        const tick = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    release = resolve;
                })
        );

        const controller = createMarketAutoReloadController(tick, { documentRef: doc });
        controller.start();
        await flush();
        expect(tick).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(60_000);
        await flush();
        expect(tick).toHaveBeenCalledTimes(1);

        release?.();
        await flush();
        vi.advanceTimersByTime(15_000);
        await flush();
        expect(tick).toHaveBeenCalledTimes(2);
    });

    it("applique le backoff 15s->30s->60s puis reset au succes", async () => {
        const doc = createVisibilityDoc(false);
        const tick = vi
            .fn<[], Promise<void>>()
            .mockRejectedValueOnce(new Error("boom"))
            .mockResolvedValueOnce();

        const controller = createMarketAutoReloadController(tick, { documentRef: doc });
        controller.start();
        await flush();

        expect(tick).toHaveBeenCalledTimes(1);
        expect(controller.getCurrentDelayMs()).toBe(30_000);

        vi.advanceTimersByTime(15_000);
        await flush();
        expect(tick).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(15_000);
        await flush();
        expect(tick).toHaveBeenCalledTimes(2);
        expect(controller.getCurrentDelayMs()).toBe(15_000);
    });
});
