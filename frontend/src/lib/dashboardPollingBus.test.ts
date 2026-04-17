import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resetDashboardPollingBusForTests,
  subscribeDashboardPollForTests,
} from "./dashboardPollingBus";

describe("dashboardPollingBus", () => {
  afterEach(() => {
    vi.useRealTimers();
    resetDashboardPollingBusForTests();
  });

  it("coalesce les immediate polls d'une meme famille en un seul tick sequentiel", async () => {
    vi.useFakeTimers();
    const events: string[] = [];

    const unsubscribeFirst = subscribeDashboardPollForTests(
      "summary",
      async () => {
        events.push("first:start");
        await Promise.resolve();
        events.push("first:end");
      },
      { immediate: true }
    );

    const unsubscribeSecond = subscribeDashboardPollForTests(
      "summary",
      async () => {
        events.push("second:start");
        await Promise.resolve();
        events.push("second:end");
      },
      { immediate: true }
    );

    expect(events).toEqual([]);

    await vi.advanceTimersByTimeAsync(0);

    expect(events).toEqual([
      "first:start",
      "first:end",
      "second:start",
      "second:end",
    ]);

    unsubscribeFirst();
    unsubscribeSecond();
  });
});
