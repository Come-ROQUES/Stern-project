import React, { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatTime } from "../lib/dateUtils";
import { useIsMobile } from "../lib/useIsMobile";
import { useSternState } from "../lib/sternApi";
import { formatUsd } from "./stern/format";

/**
 * DeskBanner — single control strip for both the Stern forex desk and the
 * crypto MM desk. Replaces the legacy StatusBar + duplicated readiness labels.
 *
 * Contract:
 *   - One state pill (no separate readiness clone).
 *   - Context ribbon: symbol · session · mode · run/uptime · feed.
 *   - Three lights (Gateway / Data / Risk). Causes live in an expandable drawer.
 *
 * Accepts a variant:
 *   - "crypto" (default): pulls truth from /api/state via useSternState().
 *   - "forex": reads props from caller (legacy Stern Trading terminal).
 */

type Tone = "success" | "warn" | "danger" | "muted";

type CommonProps = {
  showExpand?: boolean;
};

type ForexProps = CommonProps & {
  variant: "forex";
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
  strategyId?: string;
  runId?: string | null;
  scope?: string;
};

type CryptoProps = CommonProps & {
  variant?: "crypto";
};

type DeskBannerProps = ForexProps | CryptoProps;

function isForex(props: DeskBannerProps): props is ForexProps {
  return props.variant === "forex";
}

function toneForFeed(feed: string | undefined): Tone {
  if (feed === "live") return "success";
  if (feed === "trades_only") return "warn";
  return "muted";
}

function toneForRisk(status: string | undefined): Tone {
  if (!status) return "muted";
  if (status === "ok") return "success";
  if (status.includes("block") || status.includes("locked")) return "danger";
  return "warn";
}

function formatUptime(seconds: number | undefined): string {
  if (seconds === undefined || seconds === null || !Number.isFinite(seconds)) {
    return "—";
  }
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (h > 0) return `${h}h${m.toString().padStart(2, "0")}`;
  if (m > 0) return `${m}m${rem.toString().padStart(2, "0")}s`;
  return `${rem}s`;
}

export const DeskBanner = React.memo(function DeskBanner(props: DeskBannerProps) {
  if (isForex(props)) {
    return <ForexBanner {...props} />;
  }
  return <CryptoBanner showExpand={props.showExpand} />;
});

// ============================================================================
// Crypto variant (BTC-USD MM) — truth from /api/state
// ============================================================================

function CryptoBanner({ showExpand = true }: { showExpand?: boolean }) {
  const { data: state, error, lastUpdatedAt } = useSternState();
  const [expanded, setExpanded] = useState(false);
  const isMobile = useIsMobile();

  const feed = state?.runtime.feed_state;
  const midReady = state?.runtime.mid_ready ?? false;
  const quoteActive = state?.strategy.quote_active ?? false;
  const riskStatus = state?.risk_status ?? state?.strategy.risk_status;

  const dataTone: Tone = !state
    ? "muted"
    : feed === "live"
      ? "success"
      : feed === "trades_only"
        ? "warn"
        : "muted";

  const { stateValue, stateTone, causes, consequence } = useMemo(() => {
    const c: string[] = [];
    if (error) c.push(`/api/state: ${error}`);
    if (!state) return { stateValue: "CONNECTING", stateTone: "muted" as Tone, causes: c, consequence: "Waiting on first snapshot" };

    if (feed === "warming") c.push("Feed warming");
    if (!midReady) c.push("Mid not ready");
    if (riskStatus && riskStatus !== "ok") c.push(`Risk: ${riskStatus}`);
    if (!quoteActive) c.push("Quote inactive");

    const pnl = state.portfolio.realized_pnl + state.portfolio.unrealized_pnl;
    const dd = state.portfolio.drawdown;
    if (dd > 0) c.push(`Drawdown ${formatUsd(dd, 2)}`);

    let value: string = "OBSERVE";
    let tone: Tone = "muted";
    let cons = "Observe only — paper MM warming up";

    if (!feed || feed === "warming" || !midReady) {
      value = "WARMING";
      tone = "warn";
      cons = "Market feed warming — quotes disabled";
    } else if (riskStatus && riskStatus !== "ok") {
      value = "RISK LOCK";
      tone = "danger";
      cons = "Risk guard tripped — trading disabled";
    } else if (!quoteActive) {
      value = "OBSERVE";
      tone = "muted";
      cons = "Feed live, quotes idle";
    } else {
      value = "QUOTING";
      tone = "success";
      cons = pnl >= 0 ? "MM active · paper PnL positive" : "MM active · paper PnL drawdown";
    }

    return { stateValue: value, stateTone: tone, causes: c, consequence: cons };
  }, [state, error, feed, midReady, quoteActive, riskStatus]);

  const position = state?.portfolio.position_btc ?? 0;
  const pnl = state ? state.portfolio.realized_pnl + state.portfolio.unrealized_pnl : 0;
  const spreadUsd =
    state?.best_bid && state?.best_ask
      ? state.best_ask.price - state.best_bid.price
      : null;

  const lastUpdateIso = lastUpdatedAt ? new Date(lastUpdatedAt).toISOString() : null;

  const ribbon = (
    <>
      <span style={{ fontWeight: 500, color: "#fff" }}>
        {state?.product_id ?? "BTC-USD"} · MM · PAPER
      </span>
      <span style={{ fontFamily: "monospace", fontSize: "12px", color: "rgba(163,163,168,0.9)" }}>
        MID {state?.mid_price != null ? formatUsd(state.mid_price, 2) : "—"}
      </span>
      <span style={{ fontFamily: "monospace", fontSize: "12px", color: "rgba(163,163,168,0.9)" }}>
        SPREAD {spreadUsd != null ? formatUsd(spreadUsd, 2) : "—"}
      </span>
      <span style={{ fontFamily: "monospace", fontSize: "12px", color: sign(position) }}>
        POS {position.toFixed(4)} BTC
      </span>
      <span style={{ fontFamily: "monospace", fontSize: "12px", color: sign(pnl) }}>
        PnL {formatUsd(pnl, 2)}
      </span>
      <span style={{ fontSize: "12px", color: "rgba(163,163,168,0.9)" }}>
        UPTIME {formatUptime(state?.runtime.uptime_s)}
      </span>
      <span style={{ fontSize: "12px", color: "rgba(163,163,168,0.9)" }}>
        {lastUpdateIso ? formatTime(lastUpdateIso, "UTC") : "--:--:--"} UTC
      </span>
    </>
  );

  return (
    <BannerFrame
      stateValue={stateValue}
      stateTone={stateTone}
      ribbon={ribbon}
      lights={[
        { label: "Feed", tone: toneForFeed(feed) },
        { label: "Data", tone: dataTone },
        { label: "Risk", tone: toneForRisk(riskStatus) },
      ]}
      causes={causes}
      consequence={consequence}
      expandable={showExpand}
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
      isMobile={isMobile}
      mobileCollapsedSummary={
        <>
          <span style={{ fontFamily: "monospace", fontSize: "14px", fontWeight: 600, color: "#fff" }}>
            {state?.mid_price != null ? formatUsd(state.mid_price, 2) : "—"}
          </span>
          {spreadUsd != null && (
            <span style={{ fontSize: "11px", color: "rgba(163,163,168,0.9)" }}>
              {formatUsd(spreadUsd, 2)}
            </span>
          )}
        </>
      }
    />
  );
}

function sign(value: number): string {
  if (value > 0) return "rgba(110,231,183,0.95)";
  if (value < 0) return "rgba(253,164,175,0.95)";
  return "rgba(229,229,234,0.9)";
}

// ============================================================================
// Forex variant — props-driven, single source of truth for state
// ============================================================================

function ForexBanner(props: ForexProps) {
  const {
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
    runId,
    scope = "TODAY",
    showExpand = true,
  } = props;

  const [expanded, setExpanded] = useState(false);
  const isMobile = useIsMobile();

  const gatewayOk = gatewayUp === true;
  const gatewayDown = gatewayUp === false;
  const gatewayUnknown = gatewayUp == null;
  const gatewayTone: Tone = gatewayOk ? "success" : gatewayDown ? "danger" : "muted";

  const tickAgeSec = lastTickAgeMs != null ? Math.max(0, lastTickAgeMs / 1000) : null;
  const quotesValid =
    (typeof spreadPips === "number" ? spreadPips >= 0 && Number.isFinite(spreadPips) : true) &&
    (typeof bid === "number" ? bid !== -1 : true) &&
    (typeof ask === "number" ? ask !== -1 : true);

  const liveOk =
    gatewayOk &&
    !killSwitch &&
    marketOpen !== false &&
    quotesValid &&
    (tickAgeSec == null || tickAgeSec < 15);

  const { stateValue, stateTone, consequence } = useMemo(() => {
    if (killSwitch) return { stateValue: "BLOCKED", stateTone: "danger" as Tone, consequence: "Kill switch armed — trading disabled" };
    if (gatewayDown) return { stateValue: "GATEWAY OFFLINE", stateTone: "danger" as Tone, consequence: "Gateway offline — observe only" };
    if (gatewayUnknown) return { stateValue: "CHECKING", stateTone: "muted" as Tone, consequence: "Gateway status unknown" };
    if (marketOpen === false) return { stateValue: "OFF MARKET", stateTone: "warn" as Tone, consequence: "Market closed — observe only" };
    if (!quotesValid) return { stateValue: "NO DATA", stateTone: "warn" as Tone, consequence: "Quotes invalid — trading disabled" };
    if (tickAgeSec != null && tickAgeSec >= 15) return { stateValue: "FROZEN", stateTone: "warn" as Tone, consequence: "Data stale — trading disabled" };
    if (!bufferReady || readinessStatus === "WARMUP_HIST") return { stateValue: "WARMUP", stateTone: "warn" as Tone, consequence: "Observe only — warming up" };
    if (liveOk && mode === "LIVE") return { stateValue: "LIVE", stateTone: "success" as Tone, consequence: "Live trading permitted" };
    return { stateValue: "OBSERVE", stateTone: "muted" as Tone, consequence: "Shadow trading allowed" };
  }, [killSwitch, gatewayDown, gatewayUnknown, marketOpen, quotesValid, tickAgeSec, bufferReady, readinessStatus, liveOk, mode]);

  const causes: string[] = [];
  if (gatewayDown) causes.push("Gateway offline");
  if (gatewayUnknown) causes.push("Gateway status unknown");
  if (killSwitch) causes.push("Kill switch armed");
  if (!bufferReady) {
    const target = warmupTarget ?? 55;
    const progress = warmupBars != null ? ` (${Math.min(warmupBars, target)}/${target})` : "";
    causes.push(`Warmup incomplete${progress}`);
  }
  if (marketOpen === false) causes.push("Off market");
  if (!quotesValid) causes.push("Quotes invalid");
  if (tickAgeSec != null && tickAgeSec >= 15) causes.push(`Tick age ${tickAgeSec.toFixed(1)}s`);
  if (spreadPips != null && spreadPips > 1) causes.push("Spread above threshold");
  if (latencyMs != null && latencyMs > 1_000) causes.push("Latency high");
  if (lastTickAgeMs != null && lastTickAgeMs > 60_000) causes.push("Data freshness borderline");

  const computedLastUpdate = lastTickAgeMs != null ? Date.now() - lastTickAgeMs : null;
  const lastUpdate =
    lastTick ??
    (computedLastUpdate != null && !Number.isNaN(computedLastUpdate)
      ? new Date(computedLastUpdate).toISOString()
      : null);
  const midPrice = bid != null && ask != null ? ((bid + ask) / 2).toFixed(5) : "—";

  const ribbon = (
    <>
      <span style={{ fontWeight: 500, color: "#fff" }}>
        {(strategyId || "default_strategy")} · {symbol} · {scope} · {mode}
      </span>
      <span
        style={{ fontFamily: "monospace", fontSize: "12px", color: "rgba(163,163,168,0.9)" }}
        title={runId ? `Run ${runId}` : "Legacy / no run"}
      >
        RUN {runId ? runId.slice(0, 8) : "—"}
      </span>
      <span style={{ fontSize: "12px", color: "rgba(163,163,168,0.9)" }}>
        {lastUpdate ? formatTime(lastUpdate, "UTC") : "--:--:--"} UTC
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
    </>
  );

  return (
    <BannerFrame
      stateValue={stateValue}
      stateTone={stateTone}
      ribbon={ribbon}
      lights={[
        { label: "Gateway", tone: gatewayTone },
        { label: "Data", tone: lastTickAgeMs != null && lastTickAgeMs < 60_000 ? "success" : "warn" },
        { label: "Risk", tone: killSwitch ? "danger" : "muted" },
      ]}
      causes={causes}
      consequence={consequence}
      expandable={showExpand}
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
      isMobile={isMobile}
      mobileCollapsedSummary={
        <>
          <span style={{ fontFamily: "monospace", fontSize: "14px", fontWeight: 600, color: "#fff" }}>
            {midPrice}
          </span>
          {spreadPips != null && (
            <span
              style={{
                fontSize: "11px",
                color: spreadPips > 0.5 ? "rgba(251,191,36,0.9)" : "rgba(163,163,168,0.9)",
              }}
            >
              {spreadPips.toFixed(1)}p
            </span>
          )}
        </>
      }
    />
  );
}

// ============================================================================
// Shared frame — one pill, one ribbon, three lights, expandable drawer.
// No readiness duplicate — the pill IS the readiness.
// ============================================================================

function BannerFrame({
  stateValue,
  stateTone,
  ribbon,
  lights,
  causes,
  consequence,
  expandable,
  expanded,
  onToggle,
  isMobile,
  mobileCollapsedSummary,
}: {
  stateValue: string;
  stateTone: Tone;
  ribbon: React.ReactNode;
  lights: { label: string; tone: Tone }[];
  causes: string[];
  consequence: string;
  expandable: boolean;
  expanded: boolean;
  onToggle: () => void;
  isMobile: boolean;
  mobileCollapsedSummary?: React.ReactNode;
}) {
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

  const drawer = expandable && expanded && (
    <div
      style={{
        marginTop: "0.5rem",
        borderRadius: "0.75rem",
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.06)",
        padding: "0.5rem 0.75rem",
        fontSize: "13px",
        color: "rgba(229,229,234,0.9)",
      }}
    >
      <div style={{ color: "#fff", fontWeight: 500, marginBottom: causes.length ? "0.4rem" : 0 }}>
        {consequence}
      </div>
      {causes.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
          {causes.slice(0, 4).map((c) => (
            <span
              key={c}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.3rem",
                borderRadius: "9999px",
                background: "rgba(255,255,255,0.08)",
                padding: "2px 10px",
                fontSize: "12px",
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
    </div>
  );

  if (isMobile) {
    return (
      <div style={containerStyle}>
        <button
          type="button"
          onClick={expandable ? onToggle : undefined}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            width: "100%",
            cursor: expandable ? "pointer" : "default",
            background: "none",
            border: "none",
            padding: 0,
            color: "inherit",
            fontSize: "13px",
          }}
        >
          <StatePill tone={stateTone} value={stateValue} />
          {mobileCollapsedSummary}
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            {lights.map((l) => (
              <LightDot key={l.label} tone={l.tone} />
            ))}
          </span>
          {expandable && (
            <ChevronDown
              style={{
                width: 16,
                height: 16,
                color: "rgba(163,163,168,0.7)",
                transition: "transform 0.2s",
                transform: expanded ? "rotate(180deg)" : "none",
              }}
            />
          )}
        </button>
        {drawer}
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", fontSize: "14px" }}>
        <StatePill tone={stateTone} value={stateValue} onClick={expandable ? onToggle : undefined} />
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "0.6rem",
            fontSize: "13px",
            color: "rgba(229,229,234,0.9)",
          }}
        >
          {ribbon}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "13px" }}>
          {lights.map((l) => (
            <Light key={l.label} label={l.label} tone={l.tone} />
          ))}
          {expandable && (
            <button
              type="button"
              onClick={onToggle}
              aria-label={expanded ? "Collapse banner" : "Expand banner"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                height: 22,
                width: 22,
                borderRadius: "9999px",
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(212,212,216,0.9)",
                cursor: "pointer",
              }}
            >
              <ChevronDown
                style={{
                  width: 14,
                  height: 14,
                  transition: "transform 0.2s",
                  transform: expanded ? "rotate(180deg)" : "none",
                }}
              />
            </button>
          )}
        </div>
      </div>
      {drawer}
    </div>
  );
}

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
        fontSize: "13px",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.16em",
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.15s",
        ...styles[tone],
      }}
    >
      {value}
    </button>
  );
}

function LightDot({ tone }: { tone: Tone }) {
  const dot: Record<Tone, React.CSSProperties> = {
    success: { background: "#34d399", boxShadow: "0 0 10px rgba(16,185,129,0.45)" },
    warn: { background: "#fbbf24", boxShadow: "0 0 10px rgba(251,191,36,0.45)" },
    danger: { background: "#fb7185", boxShadow: "0 0 10px rgba(248,113,113,0.45)" },
    muted: { background: "rgba(255,255,255,0.6)" },
  };
  return (
    <span
      style={{
        height: 10,
        width: 10,
        borderRadius: "50%",
        display: "inline-block",
        ...dot[tone],
      }}
    />
  );
}

function Light({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        color: "rgba(212,212,216,0.9)",
      }}
    >
      <LightDot tone={tone} />
      {label}
    </span>
  );
}

export default DeskBanner;
