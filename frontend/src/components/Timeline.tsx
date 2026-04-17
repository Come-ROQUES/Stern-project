import { useEffect, useMemo, useState } from "react";
import { api, ShadowTrade, Signal } from "../lib/api";
import { useRunId } from "../lib/useRunContext";
import { RunMetadataBanner } from "./ui/RunMetadataBanner";
import { activeContext, defaultScope, deriveContextForScope } from "../lib/activeContext";

type EventItem = {
  ts: string;
  label: string;
  type: "signal" | "trade";
  detail: string;
};

export function Timeline() {
  // Run context - single source of truth
  const runId = useRunId();

  const [signals, setSignals] = useState<Signal[]>([]);
  const [trades, setTrades] = useState<ShadowTrade[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Create context with run_id injected
  const scopedContext = useMemo(() => {
    const ctx = deriveContextForScope(activeContext, defaultScope);
    if (runId) {
      return { ...ctx, run_id: runId };
    }
    return ctx;
  }, [runId]);

  useEffect(() => {
    async function load() {
      try {
        const [s, t] = await Promise.all([
          api.getSignals(50, scopedContext, defaultScope),
          api.getShadowTrades(50, scopedContext, defaultScope)
        ]);
        setSignals(s);
        setTrades(t);
      } catch (e: any) {
        setError(e.message || "Failed to load timeline");
      }
    }
    load();
  }, [scopedContext]);

  const events = useMemo<EventItem[]>(() => {
    const ev: EventItem[] = [];
    signals.forEach((s) =>
      ev.push({
        ts: s.timestamp,
        label: `Signal ${s.direction} z=${s.z_score?.toFixed(2)}`,
        type: "signal",
        detail: `Spread ${s.spread_pips ?? "n/a"} | Regime ${s.volatility_regime || "?"}`,
      })
    );
    trades.forEach((t) =>
      ev.push({
        ts: t.timestamp_entry,
        label: `Trade ${t.direction} ${t.session || "?"}`,
        type: "trade",
        detail: `Net ${(t.net_pnl_usd ?? t.net_pnl_eur ?? 0).toFixed(2)} USD | Exit ${t.exit_reason || "?"}`,
      })
    );
    return ev.sort((a, b) => (a.ts > b.ts ? -1 : 1));
  }, [signals, trades]);

  return (
    <div className="card glass">
      {/* Run Metadata Banner - shows data source */}
      <RunMetadataBanner tradeCount={trades.length} signalCount={signals.length} />

      <div className="flex items-center justify-between mb-3 mt-2">
        <div>
          <div className="text-xs text-neutral-200 uppercase tracking-[0.18em]">
            Timeline
          </div>
          <div className="text-sm text-neutral-400">
            Décisions modèle + exécutions (ordre décroissant)
          </div>
        </div>
        <div className="text-xs text-neutral-400">
          {events.length} events
        </div>
      </div>
      {error && <div className="text-xs text-danger">{error}</div>}
      {events.length === 0 ? (
        <div className="text-sm text-neutral-400">Aucun événement pour le moment.</div>
      ) : (
        <div className="space-y-2 max-h-72 overflow-auto pr-1">
          {events.map((e, idx) => (
            <div
              key={`${e.ts}-${idx}`}
              className="flex items-start gap-3 rounded-lg border border-white/5 bg-white/5 px-3 py-2"
            >
              <span
                className={`mt-1 h-2 w-2 rounded-full ${e.type === "signal"
                    ? "bg-primary shadow-[0_0_8px_rgba(0,224,255,0.6)]"
                    : "bg-secondary shadow-[0_0_8px_rgba(122,247,215,0.6)]"
                  }`}
              />
              <div className="flex-1">
                <div className="text-xs text-neutral-500">{e.ts}</div>
                <div className="text-sm text-neutral-100">{e.label}</div>
                <div className="text-xs text-neutral-400">{e.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
