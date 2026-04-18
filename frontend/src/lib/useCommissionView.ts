import { useCallback, useEffect, useState } from "react";

export type CommissionView = "reported" | "economic";

const STORAGE_KEY = "fractal.commission.view";
const DEFAULT_VIEW: CommissionView = "reported";

let initialized = false;
let globalView: CommissionView = DEFAULT_VIEW;
const listeners = new Set<(view: CommissionView) => void>();

function notify() {
  listeners.forEach((listener) => listener(globalView));
}

function readStorage(): CommissionView | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "reported" || stored === "economic") return stored;
    return null;
  } catch {
    return null;
  }
}

function writeStorage(view: CommissionView) {
  try {
    localStorage.setItem(STORAGE_KEY, view);
  } catch {
    // ignore storage errors
  }
}

function initState() {
  if (initialized) return;
  initialized = true;
  const stored = readStorage();
  globalView = stored ?? DEFAULT_VIEW;
}

function updateView(view: CommissionView) {
  if (globalView === view) {
    return;
  }
  globalView = view;
  writeStorage(view);
  notify();
}

export function useCommissionView() {
  const [commissionView, setCommissionViewState] = useState<CommissionView>(() => {
    initState();
    return globalView;
  });

  useEffect(() => {
    const listener = (view: CommissionView) => {
      setCommissionViewState(view);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const setCommissionView = useCallback((view: CommissionView) => {
    updateView(view);
  }, []);

  return { commissionView, setCommissionView };
}
