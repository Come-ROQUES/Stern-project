import { useEffect, useMemo, useState } from "react";
import { api, ShadowTrade } from "../lib/api";

export function TradeGenome() {
  const [trades, setTrades] = useState<ShadowTrade[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number>(0);

  useEffect(() => {
    api
      .getShadowTrades(50)
      .then((t) => {
        setTrades(t);
        setSelected(0);
      })
      .catch((e: any) => setError(e.message || "Failed to load trades"));
  }, []);

  const trade = trades[selected];
  const costs = useMemo(() => {
    if (!trade) return { commission: 0, slippage: 0 };
    return {
      commission: trade.commission_total_eur ?? 0,
      slippage: trade.slippage_total_eur ?? 0,
    };
  }, [trade]);

  return (
    <div className="card glass">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs text-neutral-200 uppercase tracking-[0.18em]">
            Trade Genome
          </div>
          <div className="text-sm text-neutral-400">
            Découpe facteurs + coûts pour un trade sélectionné
          </div>
        </div>
        {trades.length > 0 && (
          <select
            className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-neutral-100"
            value={selected}
            onChange={(e) => setSelected(parseInt(e.target.value, 10))}
          >
            {trades.map((t, idx) => (
              <option key={t.timestamp_entry} value={idx}>
                {t.direction} {t.entry_price?.toFixed(5)} ({t.session || "?"})
              </option>
            ))}
          </select>
        )}
      </div>
      {error && <div className="text-xs text-danger">{error}</div>}
      {!trade ? (
        <div className="text-sm text-neutral-400">Aucun trade disponible.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="text-xs text-neutral-400">Résumé</div>
            <div className="text-sm text-neutral-100">
              {trade.direction} | Session {trade.session || "?"}
            </div>
            <div className="text-xs text-neutral-400">
              Entry {trade.entry_price?.toFixed(5)} · Exit{" "}
              {trade.exit_price ? trade.exit_price.toFixed(5) : "n/a"}
            </div>
            <div className="text-xs text-neutral-400">
              Spread {trade.spread_pips_entry ?? "?"} pips · Net P&L{" "}
              {(trade.net_pnl_eur ?? 0).toFixed(2)} EUR
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="text-xs text-neutral-400">Attribution</div>
            <div className="text-sm text-neutral-100">
              Brut: {(trade.gross_pnl_eur ?? 0).toFixed(2)} EUR
            </div>
            <div className="text-xs text-neutral-400">
              Commission: {costs.commission.toFixed(2)} · Slippage:{" "}
              {costs.slippage.toFixed(2)}
            </div>
            <div className="text-sm font-semibold text-neutral-100">
              Net: {(trade.net_pnl_eur ?? 0).toFixed(2)} EUR
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-3 md:col-span-2">
            <div className="text-xs text-neutral-400">Timeline</div>
            <div className="text-xs text-neutral-200">
              {trade.timestamp_entry} → {trade.timestamp_exit || "n/a"}
            </div>
            <div className="text-xs text-neutral-400">
              Exit reason: {trade.exit_reason || "n/a"} | Status: {trade.status}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
