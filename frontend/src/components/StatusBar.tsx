import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatTime } from "../lib/dateUtils";
import { useIsMobile } from "../lib/useIsMobile";

/**
 * StatusBar - Standalone, zero external dependencies
 * This component is mounted at root level - must be bulletproof.
 * NO barrel imports, NO external styles, NO circular deps.
 */

type Tone = "success" | "warn" | "danger" | "muted";

type StatusBarProps = {
  mode: "SHADOW" | "LIVE";
  symbol: string;
  gatewayUp: boolean | null;
  killSwitch: boolean;
  marketOpen?: boolean | null;
  bid?: number | null;
  ask?: number | null;
  spreadPips?: number | null;
  lastTick?: string | null;
  lastTickAgeMs?: number | null;
  dataSourceLabel?: string;
  latencyMs?: number | null;
  bufferReady?: boolean;
  warmupBars?: number | null;
  warmupTarget?: number | null;
  readinessStatus?: string | null;
  volRegime?: string | null;
  atrPips?: number | null;
  activeSignal?: string | null;
  strategyId?: string;
  strategyVersion?: string;
  runId?: string | null;
  scope?: string;
};

export const StatusBar = React.memo(function StatusBar({
  mode,
  symbol,
  gatewayUp,
  killSwitch,
  marketOpen,
  bid,
  ask,
  spreadPips,
  lastTick,
  lastTickAgeMs,
  dataSourceLabel,
  latencyMs,
  bufferReady,
  warmupBars,
  warmupTarget,
  readinessStatus,
  strategyId,
  strategyVersion,
  runId,
  scope = "TODAY",
}: StatusBarProps) {
  const [stateExpanded, setStateExpanded] = useState(false);

  // Derive state BEFORE using in causes
  const riskState = killSwitch ? "LOCKED" : "IDLE";

  const safeStrategyId = strategyId || "default_strategy";
  const safeStrategyVersion = strategyVersion || "v1";
  const safeRunId = runId ?? null;
  const safeScope = scope || "TODAY";
  const runScoped = !!safeRunId;

  const gatewayOk = gatewayUp === true;
  const gatewayDown = gatewayUp === false;
  const gatewayUnknown = gatewayUp == null;
  const gatewayTone: Tone = gatewayOk ? "success" : gatewayDown ? "danger" : "muted";

  const tickAgeSeconds =
    lastTickAgeMs != null ? Math.max(0, lastTickAgeMs / 1000) : null;
  const quotesValid =
    (typeof spreadPips === "number" ? spreadPips >= 0 : true) &&
    (typeof spreadPips === "number" ? Number.isFinite(spreadPips) : true) &&
    (typeof bid === "number" ? bid !== -1 : true) &&
    (typeof ask === "number" ? ask !== -1 : true);

  const liveConditionsMet =
    gatewayOk &&
    !killSwitch &&
    (marketOpen !== false) &&
    quotesValid &&
    (tickAgeSeconds == null || tickAgeSeconds < 15);

  const statusLabel = (() => {
    if (killSwitch) {
      return { label: "STATE", value: "BLOCKED", tone: "danger" as Tone };
    }
    if (gatewayDown) {
      return { label: "STATE", value: "GATEWAY OFFLINE", tone: "danger" as Tone };
    }
    if (gatewayUnknown) {
      return { label: "STATE", value: "CHECKING", tone: "muted" as Tone };
    }
    if (marketOpen === false) {
      return { label: "STATE", value: "CONNECTED / OFF MARKET", tone: "warn" as Tone };
    }
    if (!quotesValid) {
      return { label: "STATE", value: "DEGRADED / NO DATA", tone: "warn" as Tone };
    }
    // Align threshold with readiness check (15s)
    if (tickAgeSeconds != null && tickAgeSeconds >= 15) {
      return { label: "STATE", value: "FROZEN", tone: "warn" as Tone };
    }
    if (!bufferReady) {
      return { label: "STATE", value: "OBSERVE", tone: "muted" as Tone };
    }
    return {
      label: "STATE",
      value: liveConditionsMet ? "LIVE" : "OBSERVE",
      tone: liveConditionsMet ? ("success" as Tone) : ("muted" as Tone),
    };
  })();

  const readiness = (() => {
    if (killSwitch) return { value: "BLOCKED", tone: "danger" as Tone };
    if (gatewayDown) return { value: "BLOCKED", tone: "danger" as Tone };
    if (gatewayUnknown) return { value: "CHECKING", tone: "muted" as Tone };
    if (marketOpen === false) return { value: "OFF MARKET", tone: "warn" as Tone };
    if (!quotesValid) return { value: "NO DATA", tone: "warn" as Tone };
    // Align with chart threshold (15s) - tick updates every few seconds are normal
    if (tickAgeSeconds != null && tickAgeSeconds >= 15) return { value: "FROZEN", tone: "warn" as Tone };
    if (!bufferReady || readinessStatus === "WARMUP_HIST") return { value: "WARMUP", tone: "warn" as Tone };
    return { value: liveConditionsMet ? "READY" : "OBSERVE", tone: liveConditionsMet ? ("success" as Tone) : ("muted" as Tone) };
  })();

  const causes: string[] = [];
  if (gatewayDown) causes.push("Gateway offline");
  if (gatewayUnknown) causes.push("Gateway status unknown");
  if (killSwitch) causes.push("Kill switch armed");
  if (!bufferReady) {
    const target = warmupTarget ?? 55;
    const progress =
      warmupBars != null ? ` (${Math.min(warmupBars, target)}/${target})` : "";
    causes.push(`Warmup incomplete${progress}`);
  }
  if (marketOpen === false) causes.push("Off market");
  if (!quotesValid) causes.push("Quotes invalid");
  // Align with readiness threshold (15s)
  if (tickAgeSeconds != null && tickAgeSeconds >= 15) causes.push(`Tick age ${tickAgeSeconds.toFixed(1)}s`);
  if (spreadPips != null && spreadPips > 1) causes.push("Spread above threshold");
  if (latencyMs != null && latencyMs > 1_000) causes.push("Latency high");
  if (lastTickAgeMs != null && lastTickAgeMs > 60_000) causes.push("Data freshness borderline");
  if (riskState !== "IDLE") causes.push("Risk lock active");

  const consequence = (() => {
    if (readiness.value === "BLOCKED") return "Trading disabled (observe only)";
    if (readiness.value === "CHECKING") return "Gateway status unknown - observe only";
    if (readiness.value === "OFF MARKET") return "Market closed - observe only";
    if (readiness.value === "NO DATA") return "Data unavailable - trading disabled";
    if (readiness.value === "FROZEN") return "Data stale - trading disabled";
    if (readiness.value === "WARMUP") return "Observe only (warming up)";
    return liveConditionsMet && mode === "LIVE"
      ? "Live trading permitted"
      : "Shadow trading allowed";
  })();

  const computedLastUpdate = lastTickAgeMs != null ? Date.now() - (lastTickAgeMs ?? 0) : null;
  const lastUpdate =
    lastTick ?? (computedLastUpdate != null && !isNaN(computedLastUpdate) ? new Date(computedLastUpdate).toISOString() : null);

  const isMobile = useIsMobile();
  const midPrice = bid != null && ask != null ? ((bid + ask) / 2).toFixed(5) : "—";

  // =========================================================================
  // Expanded detail panel (shared between mobile and desktop)
  // =========================================================================
  const expandedPanel = stateExpanded && (
    <div
      style={{
        marginTop: "0.5rem",
        borderRadius: "0.75rem",
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.06)",
        padding: "0.5rem 0.75rem",
        fontSize: "14px",
        color: "rgba(229,229,234,0.9)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem", fontSize: "12px" }}>
        <span style={{ textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(163,163,168,0.9)" }}>
          State
        </span>
        <span style={{ color: "#fff", fontWeight: 600 }}>{statusLabel.value}</span>
        <span style={{ textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(163,163,168,0.9)" }}>
          Readiness
        </span>
        <span style={{ color: "#fff", fontWeight: 600 }}>{readiness.value}</span>
      </div>
      {causes.length > 0 && (
        <div
          style={{
            marginTop: "0.25rem",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "12px",
          }}
        >
          {causes.slice(0, 3).map((c) => (
            <span
              key={c}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                borderRadius: "9999px",
                background: "rgba(255,255,255,0.08)",
                padding: "2px 8px",
              }}
            >
              <span
                style={{
                  height: "6px",
                  width: "6px",
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.7)",
                }}
              />
              {c}
            </span>
          ))}
        </div>
      )}
      <div style={{ marginTop: "0.25rem", fontSize: "13px", color: "#fff", fontWeight: 500 }}>
        {consequence}
      </div>

      {/* Mobile-only: show full context when expanded */}
      {isMobile && (
        <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.5rem", fontSize: "11px" }}>
          <span style={{ color: "#fff", fontWeight: 500 }}>
            {safeStrategyId} · {symbol} · {mode}
          </span>
          <span style={{ fontFamily: "monospace", color: "rgba(163,163,168,0.9)" }}>
            RUN {safeRunId ? safeRunId.slice(0, 8) : "—"}
          </span>
          <span style={{ color: "rgba(163,163,168,0.9)" }}>
            {lastUpdate ? formatTime(lastUpdate, "UTC") : "--:--:--"} UTC
          </span>
          <Light label="Gateway" tone={gatewayTone} />
          <Light label="Data" tone={lastTickAgeMs != null && lastTickAgeMs < 60_000 ? "success" : "warn"} />
          <Light label="Risk" tone={riskState === "IDLE" ? "muted" : "warn"} />
        </div>
      )}
    </div>
  );

  const containerStyle: React.CSSProperties = {
    position: "relative",
    width: "100%",
    overflow: "hidden",
    borderRadius: "1rem",
    border: "1px solid rgba(255,255,255,0.12)",
    padding: isMobile ? "0.4rem 0.75rem" : "0.5rem 1rem",
    background: "linear-gradient(120deg, rgba(8,16,28,0.78), rgba(12,26,38,0.78), rgba(18,28,46,0.78))",
    backdropFilter: "blur(12px)",
    boxShadow: "0 14px 32px rgba(0,0,0,0.35)",
  };

  // =========================================================================
  // Mobile compact layout
  // =========================================================================
  if (isMobile) {
    return (
      <div style={containerStyle}>
        <button
          type="button"
          onClick={() => setStateExpanded((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            width: "100%",
            cursor: "pointer",
            background: "none",
            border: "none",
            padding: 0,
            color: "inherit",
            fontSize: "13px",
          }}
        >
          <StatePill tone={statusLabel.tone} value={statusLabel.value} />
          <span style={{ fontFamily: "monospace", fontSize: "14px", fontWeight: 600, color: "#fff" }}>
            {midPrice}
          </span>
          {spreadPips != null && (
            <span style={{
              fontSize: "11px",
              color: spreadPips > 0.5 ? "rgba(251,191,36,0.9)" : "rgba(163,163,168,0.9)",
            }}>
              {spreadPips.toFixed(1)}p
            </span>
          )}
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
            <Light label="" tone={gatewayTone} />
          </span>
          <ChevronDown
            style={{
              width: 16,
              height: 16,
              color: "rgba(163,163,168,0.7)",
              transition: "transform 0.2s",
              transform: stateExpanded ? "rotate(180deg)" : "none",
            }}
          />
        </button>
        {expandedPanel}
      </div>
    );
  }

  // =========================================================================
  // Desktop full layout (unchanged)
  // =========================================================================
  return (
    <div style={containerStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", fontSize: "14px" }}>
        {/* Left: State pill */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <StatePill
            tone={statusLabel.tone}
            value={statusLabel.value}
            onClick={() => setStateExpanded((v) => !v)}
          />
          <span
            style={{
              fontSize: "12px",
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              color: "rgba(212,212,216,0.9)",
            }}
          >
            {readiness.value}
          </span>
        </div>

        {/* Center: context ribbon */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "0.5rem",
            fontSize: "13px",
            color: "rgba(229,229,234,0.9)",
          }}
        >
          <span style={{ fontWeight: 500, color: "#fff" }}>
            {safeStrategyId} · {symbol} · {safeScope} · {mode}
          </span>
          <span
            style={{
              fontFamily: "monospace",
              fontSize: "12px",
              color: "rgba(163,163,168,0.9)",
            }}
            title={safeRunId ? `Run ${safeRunId}` : "Legacy / no run"}
          >
            RUN {safeRunId ? safeRunId.slice(0, 8) : "—"}
          </span>
          <span style={{ fontSize: "12px", color: "rgba(163,163,168,0.9)" }}>
            {lastUpdate ? formatTime(lastUpdate, "UTC") : "--:--:--"} UTC
          </span>
          <span
            style={{
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: runScoped ? "rgba(167,243,208,0.9)" : "rgba(253,230,138,0.9)",
            }}
            title={runScoped ? "Run-scoped data" : "Legacy / read-only"}
          >
            {runScoped ? "Run-scoped" : "Legacy"}
          </span>
          {dataSourceLabel && (
            <span
              style={{
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: "rgba(165,243,252,0.9)",
              }}
            >
              {dataSourceLabel}
            </span>
          )}
        </div>

        {/* Right: system lights */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "13px" }}>
          <Light label="Gateway" tone={gatewayTone} />
          <Light
            label="Data"
            tone={lastTickAgeMs != null && lastTickAgeMs < 60_000 ? "success" : "warn"}
          />
          <Light label="Risk" tone={riskState === "IDLE" ? "muted" : "warn"} />
        </div>
      </div>

      {expandedPanel}
    </div>
  );
});

function StatePill({
  tone,
  value,
  onClick,
}: {
  tone: Tone;
  value: string;
  onClick?: () => void;
}) {
  const styles: Record<Tone, React.CSSProperties> = {
    success: {
      background: "rgba(16,185,129,0.18)",
      color: "rgba(236,253,245,0.95)",
      border: "1px solid rgba(110,231,183,0.4)",
      boxShadow: "0 0 14px rgba(16,185,129,0.35)",
    },
    warn: {
      background: "rgba(245,158,11,0.14)",
      color: "rgba(255,251,235,0.95)",
      border: "1px solid rgba(252,211,77,0.3)",
    },
    danger: {
      background: "rgba(244,63,94,0.18)",
      color: "rgba(255,241,242,0.95)",
      border: "1px solid rgba(253,164,175,0.4)",
      boxShadow: "0 0 14px rgba(248,113,113,0.35)",
    },
    muted: {
      background: "rgba(255,255,255,0.06)",
      color: "rgba(244,244,245,0.9)",
      border: "1px solid rgba(255,255,255,0.14)",
    },
  };

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        borderRadius: "9999px",
        padding: "6px 14px",
        fontSize: "14px",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.16em",
        cursor: "pointer",
        transition: "all 0.15s",
        ...styles[tone],
      }}
    >
      {value}
    </button>
  );
}

function Light({ label, tone }: { label: string; tone: Tone }) {
  const dotStyles: Record<Tone, React.CSSProperties> = {
    success: { background: "#34d399", boxShadow: "0 0 10px rgba(16,185,129,0.45)" },
    warn: { background: "#fbbf24", boxShadow: "0 0 10px rgba(251,191,36,0.45)" },
    danger: { background: "#fb7185", boxShadow: "0 0 10px rgba(248,113,113,0.45)" },
    muted: { background: "rgba(255,255,255,0.6)" },
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "12px",
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        color: "rgba(212,212,216,0.9)",
      }}
    >
      <span
        style={{
          height: "10px",
          width: "10px",
          borderRadius: "50%",
          ...dotStyles[tone],
        }}
      />
      {label}
    </span>
  );
}
