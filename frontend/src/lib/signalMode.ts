export type SignalModeLike = {
  accepted?: boolean | null;
  reason?: string | null;
  rejection_reason?: string | null;
  wait_state?: string | null;
  wait_reason?: string | null;
  decision_stage?: string | null;
  extreme_recovery_mode?: boolean | null;
  extreme_state?: string | null;
};

function upper(value: string | null | undefined): string {
  return (value || "").toUpperCase().trim();
}

export function isExtremeSignal(signal: SignalModeLike): boolean {
  if (signal.extreme_recovery_mode === true) return true;
  if (upper(signal.extreme_state).startsWith("EXTREME_")) return true;
  if (upper(signal.wait_state).startsWith("EXTREME_")) return true;
  if (upper(signal.wait_reason).startsWith("EXTREME_")) return true;
  const tokens = [
    upper(signal.reason),
    upper(signal.rejection_reason),
    upper(signal.decision_stage),
  ];
  return tokens.some((t) => t.includes("EXTREME"));
}

export function getExtremeState(signal: SignalModeLike): string | null {
  const explicit = upper(signal.extreme_state);
  if (explicit.startsWith("EXTREME_")) return explicit;

  const waitState = upper(signal.wait_state);
  if (waitState.startsWith("EXTREME_")) return waitState;

  const waitReason = upper(signal.wait_reason);
  if (waitReason.startsWith("EXTREME_")) return waitReason;

  const rejection = upper(signal.rejection_reason);
  if (rejection === "EXTREME_EVENT_TTL_EXPIRED") return rejection;

  const reason = upper(signal.reason);
  if (reason.includes("ENTERED_EXTREME")) return "ENTERED_EXTREME";
  return null;
}

export function getSignalModeLabel(signal: SignalModeLike): "EXTREME" | "NORMAL" {
  return isExtremeSignal(signal) ? "EXTREME" : "NORMAL";
}

export function summarizeExtremeSignals(signals: SignalModeLike[]): {
  total: number;
  accepted: number;
  rejected: number;
  waiting: number;
  ttlExpired: number;
} {
  const extreme = signals.filter(isExtremeSignal);
  const waiting = extreme.filter((s) =>
    upper(s.wait_state).startsWith("EXTREME_WAIT_")
  ).length;
  const accepted = extreme.filter((s) => Boolean(s.accepted)).length;
  const rejected = extreme.filter((s) => !Boolean(s.accepted)).length;
  const ttlExpired = extreme.filter(
    (s) => upper(s.rejection_reason) === "EXTREME_EVENT_TTL_EXPIRED"
  ).length;
  return {
    total: extreme.length,
    accepted,
    rejected,
    waiting,
    ttlExpired,
  };
}
