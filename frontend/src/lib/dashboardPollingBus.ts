import { useEffect, useMemo, useRef } from "react";

import { useViewActivity } from "./viewActivity";

export type DashboardPollFamily = "status" | "summary" | "logs" | "analytics";

type PollHandler = () => void | Promise<void>;

type Subscription = {
  id: number;
  handler: PollHandler;
  runWhenHidden: boolean;
  intervalMs?: number;
};

type FamilyState = {
  baseIntervalMs: number;
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  immediateTimer: ReturnType<typeof setTimeout> | null;
  subscriptions: Map<number, Subscription>;
};

const DEFAULT_INTERVALS: Record<DashboardPollFamily, number> = {
  status: 10_000,
  summary: 30_000,
  logs: 30_000,
  analytics: 30_000,
};

const JITTER_RATIO = 0.1;
const familyStates: Record<DashboardPollFamily, FamilyState> = {
  status: {
    baseIntervalMs: DEFAULT_INTERVALS.status,
    timer: null,
    running: false,
    immediateTimer: null,
    subscriptions: new Map(),
  },
  summary: {
    baseIntervalMs: DEFAULT_INTERVALS.summary,
    timer: null,
    running: false,
    immediateTimer: null,
    subscriptions: new Map(),
  },
  logs: {
    baseIntervalMs: DEFAULT_INTERVALS.logs,
    timer: null,
    running: false,
    immediateTimer: null,
    subscriptions: new Map(),
  },
  analytics: {
    baseIntervalMs: DEFAULT_INTERVALS.analytics,
    timer: null,
    running: false,
    immediateTimer: null,
    subscriptions: new Map(),
  },
};

let nextSubscriptionId = 1;

function isPageVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

function withJitter(baseMs: number): number {
  const min = 1 - JITTER_RATIO;
  const max = 1 + JITTER_RATIO;
  const ratio = min + Math.random() * (max - min);
  return Math.max(1000, Math.round(baseMs * ratio));
}

function effectiveInterval(state: FamilyState): number {
  let minMs = state.baseIntervalMs;
  for (const sub of state.subscriptions.values()) {
    if (sub.intervalMs && sub.intervalMs > 0) {
      minMs = Math.min(minMs, sub.intervalMs);
    }
  }
  return minMs;
}

function scheduleTick(family: DashboardPollFamily): void {
  const state = familyStates[family];
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  if (state.subscriptions.size === 0) {
    return;
  }
  state.timer = setTimeout(() => {
    void runTick(family);
  }, withJitter(effectiveInterval(state)));
}

function scheduleImmediateTick(family: DashboardPollFamily): void {
  const state = familyStates[family];
  if (state.immediateTimer || state.running || state.subscriptions.size === 0) {
    return;
  }
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  state.immediateTimer = setTimeout(() => {
    state.immediateTimer = null;
    void runTick(family);
  }, 0);
}

async function runTick(family: DashboardPollFamily): Promise<void> {
  const state = familyStates[family];
  if (state.running) {
    scheduleTick(family);
    return;
  }
  if (state.subscriptions.size === 0) {
    return;
  }

  state.running = true;
  try {
    const visible = isPageVisible();
    for (const sub of state.subscriptions.values()) {
      if (!visible && !sub.runWhenHidden) {
        continue;
      }
      await Promise.resolve(sub.handler())
        .then(() => undefined)
        .catch(() => undefined);
    }
  } finally {
    state.running = false;
    scheduleTick(family);
  }
}

type SubscribeOptions = {
  immediate?: boolean;
  runWhenHidden?: boolean;
  intervalMs?: number;
};

function subscribe(
  family: DashboardPollFamily,
  handler: PollHandler,
  options?: SubscribeOptions
): () => void {
  const state = familyStates[family];

  const id = nextSubscriptionId++;
  state.subscriptions.set(id, {
    id,
    handler,
    runWhenHidden: Boolean(options?.runWhenHidden),
    intervalMs: options?.intervalMs,
  });

  if (options?.immediate) {
    scheduleImmediateTick(family);
  }
  scheduleTick(family);

  return () => {
    const current = familyStates[family];
    current.subscriptions.delete(id);
    if (current.subscriptions.size === 0) {
      if (current.timer) {
        clearTimeout(current.timer);
        current.timer = null;
      }
      if (current.immediateTimer) {
        clearTimeout(current.immediateTimer);
        current.immediateTimer = null;
      }
    }
  };
}

type UseDashboardPollOptions = {
  enabled?: boolean;
  immediate?: boolean;
  runWhenHidden?: boolean;
  intervalMs?: number;
};

export function useDashboardPoll(
  family: DashboardPollFamily,
  handler: PollHandler,
  options?: UseDashboardPollOptions
): void {
  const handlerRef = useRef<PollHandler>(handler);
  handlerRef.current = handler;

  const viewActive = useViewActivity();
  const enabled = (options?.enabled ?? true) && viewActive;
  const immediate = options?.immediate ?? true;
  const runWhenHidden = options?.runWhenHidden ?? false;
  const intervalMs = options?.intervalMs;

  const stableOptions = useMemo(
    () => ({ immediate, runWhenHidden, intervalMs }),
    [immediate, runWhenHidden, intervalMs]
  );

  useEffect(() => {
    if (!enabled) return undefined;
    return subscribe(
      family,
      () => handlerRef.current(),
      stableOptions
    );
  }, [enabled, family, stableOptions]);
}

export const DASHBOARD_POLL_INTERVALS = DEFAULT_INTERVALS;
export const subscribeDashboardPollForTests = subscribe;

export function resetDashboardPollingBusForTests(): void {
  nextSubscriptionId = 1;
  for (const state of Object.values(familyStates)) {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    if (state.immediateTimer) {
      clearTimeout(state.immediateTimer);
      state.immediateTimer = null;
    }
    state.running = false;
    state.subscriptions.clear();
  }
}
