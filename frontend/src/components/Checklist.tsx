import { useEffect, useState } from "react";
import { api, ShadowSnapshot, Health } from "../lib/api";

type ChecklistItem = { label: string; ok: boolean | null };

export function Checklist() {
  const [items, setItems] = useState<ChecklistItem[]>([
    { label: "Gateway UP", ok: null },
    { label: "Market data OK", ok: null },
    { label: "Shadow P&L > 0", ok: null },
  ]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [health, snaps, ohlc] = await Promise.all([
          api.getHealth(),
          api.getShadowSnapshots(1),
          api.getOhlc(1),
        ]);
        const latestSnap: ShadowSnapshot | undefined = Array.isArray(snaps) ? snaps[0] : undefined;
        const hasOhlc = ohlc.ohlc?.length > 0;

        const newItems: ChecklistItem[] = [
          { label: "Gateway UP", ok: health.shadow_db && health.analytics_db && health.bot_db },
          { label: "Market data OK", ok: hasOhlc && ohlc.state !== "OFF_MARKET" },
          {
            label: "Shadow P&L > 0",
            ok: latestSnap ? latestSnap.campaign_pnl_eur > 0 : null,
          },
        ];
        setItems(newItems);
      } catch (e: any) {
        setError(e.message || "Failed to load checklist");
      }
    }
    load();
  }, []);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="text-lg font-semibold">Pre-Live Checklist</div>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span
              className={`h-3 w-3 rounded-full ${
                item.ok === null ? "bg-gray-500" : item.ok ? "bg-success animate-pulse" : "bg-danger"
              }`}
            />
            <span className="text-sm text-slate-200">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
