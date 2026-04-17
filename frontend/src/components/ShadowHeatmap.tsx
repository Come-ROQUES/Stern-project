import React, { useEffect, useMemo, useState } from "react";
import { api, ShadowTrade } from "../lib/api";

export function ShadowHeatmap() {
  const [trades, setTrades] = useState<ShadowTrade[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getShadowTrades(500);
        setTrades(data);
      } catch (e: any) {
        setError(e.message || "Failed to load trades");
      }
    }
    load();
  }, []);

  const sessions = ["ASIA", "LONDON", "OVERLAP", "NY", "UNKNOWN"];
  const hours = Array.from({ length: 24 }).map((_, i) =>
    `${i.toString().padStart(2, "0")}h`
  );

  const grid = useMemo(() => {
    if (trades.length === 0) return [];
    const map: Record<string, number[]> = {};
    sessions.forEach((s) => {
      map[s] = Array(24).fill(0);
    });
    trades.forEach((t) => {
      const h = new Date(t.timestamp_entry).getUTCHours();
      const s = (t.session || "UNKNOWN").toUpperCase();
      const key = sessions.includes(s) ? s : "UNKNOWN";
      map[key][h] += t.net_pnl_eur ?? 0;
    });
    return sessions.map((s) => map[s]);
  }, [trades]);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs text-slate-400">Shadow P&L</div>
          <div className="text-lg font-semibold">Session x Hour Heatmap (EUR)</div>
        </div>
        {error && <span className="text-xs text-danger">{error}</span>}
        {!error && trades.length > 0 && (
          <span className="text-xs text-success">API</span>
        )}
      </div>
      {trades.length === 0 ? (
        <div className="text-sm text-slate-400">No shadow trades yet.</div>
      ) : (
        <div className="grid grid-cols-[80px_1fr] gap-2">
          <div />
          <div
            className="grid"
            style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0,1fr))` }}
          >
            {hours.map((h) => (
              <div key={h} className="text-center text-[10px] text-slate-500">
                {h}
              </div>
            ))}
          </div>
          {sessions.map((session, i) => (
            <React.Fragment key={session}>
              <div className="text-[11px] text-slate-300 text-right pr-2">{session}</div>
              <div
                className="grid"
                style={{ gridTemplateColumns: `repeat(${hours.length}, minmax(0,1fr))` }}
              >
                {grid[i].map((val, j) => {
                  const color = val >= 0 ? "bg-emerald-700" : "bg-rose-700";
                  const opacity = Math.min(0.9, Math.abs(val) / 20 + 0.2);
                  return (
                    <div
                      key={`${session}-${j}`}
                      className={`${color} text-center text-[10px] text-white py-2`}
                      style={{ opacity }}
                    >
                      {val.toFixed(1)}
                    </div>
                  );
                })}
              </div>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
