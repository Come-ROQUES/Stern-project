import { useCallback, useEffect, useState } from "react";

const STERN_COMPAT = true;

export type BundleRunsState = {
  enabled: boolean;
  dwRunId: string | null;
  s2RunId: string | null;
  tfRunId: string | null;
};

const STORAGE_KEYS = {
  enabled: "stern.bundle.enabled",
  dw: "stern.bundle.dwRunId",
  s2: "stern.bundle.s2RunId",
  s2Auto: "stern.bundle.s2AutoRunId",
  tf: "stern.bundle.tfRunId",
  tfAuto: "stern.bundle.tfAutoRunId",
};

let initialized = false;
let bundleState: BundleRunsState = {
  enabled: false,
  dwRunId: null,
  s2RunId: null,
  tfRunId: null,
};

const listeners = new Set<(state: BundleRunsState) => void>();

function sameBundleState(a: BundleRunsState, b: BundleRunsState): boolean {
  return (
    a.enabled === b.enabled &&
    a.dwRunId === b.dwRunId &&
    a.s2RunId === b.s2RunId &&
    a.tfRunId === b.tfRunId
  );
}

function notify() {
  listeners.forEach((listener) => listener(bundleState));
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value == null || value === "") {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // ignore storage errors
  }
}

export function resolveAutoSyncedRunId(
  currentRunId: string | null,
  previousAutoRunId: string | null,
  activeRunId: string | null
): string | null {
  if (!activeRunId) {
    return currentRunId;
  }
  if (!currentRunId) {
    return activeRunId;
  }
  if (currentRunId === activeRunId) {
    return activeRunId;
  }
  if (previousAutoRunId && currentRunId === previousAutoRunId) {
    return activeRunId;
  }
  return currentRunId;
}

function initBundleState() {
  if (initialized) return;
  initialized = true;
  const enabledStored = readStorage(STORAGE_KEYS.enabled);
  const enabled =
    enabledStored == null ? !STERN_COMPAT : enabledStored === "true";
  const dwRunId = readStorage(STORAGE_KEYS.dw);
  const s2RunId = STERN_COMPAT ? null : readStorage(STORAGE_KEYS.s2);
  const tfRunId = STERN_COMPAT ? null : readStorage(STORAGE_KEYS.tf);
  bundleState = normalizeBundleRunIds({
    enabled,
    dwRunId: dwRunId || null,
    s2RunId: s2RunId || null,
    tfRunId: tfRunId || null,
  });
}

function normalizeBundleRunIds(state: BundleRunsState): BundleRunsState {
  const normalized = { ...state };
  const { dwRunId, s2RunId, tfRunId } = normalized;

  if (dwRunId && s2RunId && dwRunId === s2RunId) {
    normalized.s2RunId = null;
  }
  if (dwRunId && tfRunId && dwRunId === tfRunId) {
    normalized.tfRunId = null;
  }
  if (
    normalized.s2RunId &&
    normalized.tfRunId &&
    normalized.s2RunId === normalized.tfRunId
  ) {
    normalized.tfRunId = null;
  }

  return normalized;
}

function updateBundleState(patch: Partial<BundleRunsState>) {
  const nextState = normalizeBundleRunIds({ ...bundleState, ...patch });
  if (sameBundleState(bundleState, nextState)) {
    return;
  }
  bundleState = nextState;
  writeStorage(STORAGE_KEYS.enabled, bundleState.enabled ? "true" : "false");
  writeStorage(STORAGE_KEYS.dw, bundleState.dwRunId);
  writeStorage(STORAGE_KEYS.s2, bundleState.s2RunId);
  writeStorage(STORAGE_KEYS.tf, bundleState.tfRunId);
  notify();
}

export function getBundleState(): BundleRunsState {
  initBundleState();
  return bundleState;
}

export function syncBundleDwRunId(runId: string | null) {
  initBundleState();
  updateBundleState({ dwRunId: runId });
}

export function syncBundleS2RunId(runId: string | null) {
  initBundleState();
  writeStorage(STORAGE_KEYS.s2Auto, null);
  updateBundleState({ s2RunId: runId });
}

export function autoSyncBundleS2RunId(activeRunId: string | null) {
  initBundleState();
  const previousAutoRunId = readStorage(STORAGE_KEYS.s2Auto);
  const nextRunId = resolveAutoSyncedRunId(
    bundleState.s2RunId,
    previousAutoRunId,
    activeRunId
  );
  if (nextRunId == null || nextRunId === bundleState.s2RunId) {
    return;
  }
  writeStorage(STORAGE_KEYS.s2Auto, nextRunId);
  updateBundleState({ s2RunId: nextRunId });
}

export function syncBundleTfRunId(runId: string | null) {
  initBundleState();
  writeStorage(STORAGE_KEYS.tfAuto, null);
  updateBundleState({ tfRunId: runId });
}

export function autoSyncBundleTfRunId(activeRunId: string | null) {
  initBundleState();
  const previousAutoRunId = readStorage(STORAGE_KEYS.tfAuto);
  const nextRunId = resolveAutoSyncedRunId(
    bundleState.tfRunId,
    previousAutoRunId,
    activeRunId
  );
  if (nextRunId == null || nextRunId === bundleState.tfRunId) {
    return;
  }
  writeStorage(STORAGE_KEYS.tfAuto, nextRunId);
  updateBundleState({ tfRunId: nextRunId });
}

export function resetBundleStateForTests() {
  initialized = false;
  bundleState = {
    enabled: false,
    dwRunId: null,
    s2RunId: null,
    tfRunId: null,
  };
  listeners.clear();
  writeStorage(STORAGE_KEYS.s2Auto, null);
  writeStorage(STORAGE_KEYS.tfAuto, null);
}

export function useBundleRuns() {
  const [state, setState] = useState<BundleRunsState>(() => {
    initBundleState();
    return bundleState;
  });

  useEffect(() => {
    const listener = (next: BundleRunsState) => {
      setState((prev) => (sameBundleState(prev, next) ? prev : { ...next }));
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const setEnabled = useCallback((enabled: boolean) => {
    updateBundleState({ enabled });
  }, []);

  const setDwRunId = useCallback((runId: string | null) => {
    updateBundleState({ dwRunId: runId });
  }, []);

  const setS2RunId = useCallback((runId: string | null) => {
    updateBundleState({ s2RunId: runId });
  }, []);

  const setTfRunId = useCallback((runId: string | null) => {
    updateBundleState({ tfRunId: runId });
  }, []);

  return {
    ...state,
    setEnabled,
    setDwRunId,
    setS2RunId,
    setTfRunId,
  };
}
