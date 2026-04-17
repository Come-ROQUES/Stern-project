import { useEffect, useMemo, useState } from "react";
import { api, Ohlc, ShadowTrade } from "../lib/api";
import { ApexChart } from "../lib/ApexChart";

export function PriceTrades() {
  const [ohlc, setOhlc] = useState<Ohlc[]>([]);
  const [trades, setTrades] = useState<ShadowTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastTick, setLastTick] = useState<string | null>(null);
  const [offMarket, setOffMarket] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [ohlcData, tradesData] = await Promise.all([
          api.getOhlc(200),
          api.getShadowTrades(200),
        ]);
        setOffMarket(ohlcData.state === "OFF_MARKET");
        setOhlc(ohlcData.ohlc ?? []);
        setTrades(tradesData);
        if (ohlcData.ohlc && ohlcData.ohlc.length > 0) {
          const last = ohlcData.ohlc[ohlcData.ohlc.length - 1];
          setLastTick(last.timestamp);
        }
      } catch (e: any) {
        setError(e.message || "Failed to load data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const { candles, min, max, scaleY } = useMemo(() => {
    if (ohlc.length === 0) return { candles: [], min: 0, max: 1, scaleY: (p: number) => 50 };
    const lows = ohlc.map((c) => c.low);
    const highs = ohlc.map((c) => c.high);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const padding = (max - min || 1) * 0.1;
    const minP = min - padding;
    const maxP = max + padding;
    const span = maxP - minP || 1;
    const width = 100;
    const spacing = width / Math.max(1, ohlc.length - 1);
    const bodyWidth = Math.max(0.4, Math.min(8, spacing * 0.6));
    const scaleY = (v: number) => 100 - ((v - minP) / span) * 100;
    const candles = ohlc.map((c, idx) => {
      const x = (idx / Math.max(1, ohlc.length - 1)) * width;
      return {
        x,
        bodyWidth,
        openY: scaleY(c.open),
        closeY: scaleY(c.close),
        highY: scaleY(c.high),
        lowY: scaleY(c.low),
        up: c.close >= c.open,
        ts: c.timestamp,
      };
    });
    return { candles, min: minP, max: maxP, scaleY };
  }, [ohlc]);

  const tradeMarkers = useMemo(() => {
    if (candles.length === 0) return [];
    const idxForTs = (ts: string) => {
      const t = new Date(ts).getTime();
      let best = 0;
      let bestDiff = Infinity;
      candles.forEach((c, i) => {
        const diff = Math.abs(new Date(c.ts).getTime() - t);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = i;
        }
      });
      return best;
    };
    return trades.map((t) => {
      const idx = idxForTs(t.timestamp_entry);
      const c = candles[idx];
      const price = t.entry_price ?? (c ? 0 : 0);
      return {
        ts: t.timestamp_entry,
        price,
        x: c ? c.x : 0,
        y: c ? scaleY(price || min) : 50,
        color: (t.net_pnl_usd ?? t.net_pnl_eur ?? 0) >= 0 ? "#00FF88" : "#FF4444",
        dir: t.direction,
        session: t.session || "?",
        pnl: t.net_pnl_usd ?? t.net_pnl_eur ?? 0,
      };
    });
  }, [candles, trades]);

  return (
    <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs text-slate-400">EURUSD</div>
            <div className="text-lg font-semibold">Price & Trades</div>
          </div>
          <div className="flex items-center gap-2">
            {loading && <div className="text-xs text-slate-400">Loading…</div>}
            {error && <div className="text-xs text-danger">Error: {error}</div>}
            {!loading && !error && (
              <span className="text-xs text-success">API</span>
            )}
            {offMarket && <span className="text-[10px] text-amber-400">OFF MARKET</span>}
            {lastTick && !isNaN(new Date(lastTick).getTime()) && (
              <span className="text-[10px] text-slate-500">
                Last bar: {new Date(lastTick).toISOString()}
              </span>
            )}
          </div>
        </div>
        <div className="h-80 w-full rounded-lg bg-gradient-to-b from-slate-900 to-slate-950 relative overflow-hidden">
          {candles.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
              No OHLC data
            </div>
          ) : (
            <ApexChart
              type="candlestick"
              height="100%"
              width="100%"
              options={{
                chart: {
                  animations: { enabled: false },
                  toolbar: { show: true },
                  zoom: { enabled: true },
                  background: "transparent",
                },
                grid: {
                  borderColor: "rgba(255,255,255,0.04)",
                },
                theme: { mode: "dark" },
                xaxis: {
                  type: "datetime",
                  labels: { show: false },
                },
                yaxis: {
                  tooltip: { enabled: true },
                },
                plotOptions: {
                  candlestick: {
                    colors: { upward: "#00E0FF", downward: "#FF4444" },
                    wick: { useFillColor: true },
                  },
                },
                annotations: {
                  points: tradeMarkers.map((m) => ({
                    x: new Date(m.ts).getTime(),
                    y: m.price,
                    marker: { size: 4, fillColor: m.color, strokeWidth: 1, strokeColor: "#ffffff40" },
                    label: {
                      text: `${m.dir} ${m.pnl.toFixed(2)} USD`,
                      offsetY: -10,
                      style: {
                        fontSize: "10px",
                        background: "rgba(0,0,0,0.6)",
                        color: "#e5e7eb",
                      },
                    },
                  })),
                },
                tooltip: {
                  enabled: true,
                },
              }}
              series={[
                {
                  name: "EURUSD",
                  data: ohlc.map((c) => ({
                    x: new Date(c.timestamp).getTime(),
                    y: [c.open, c.high, c.low, c.close],
                  })),
                },
              ]}
            />
          )}
        </div>
      </div>
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">Recent Trades</div>
          <span className="text-xs text-slate-400">
            {trades.length} loaded
          </span>
        </div>
        <div className="space-y-2 max-h-72 overflow-auto pr-1">
          {trades.length === 0 && (
            <div className="text-sm text-slate-400">No trades yet.</div>
          )}
          {trades.slice(0, 20).map((t) => (
            <div
              key={t.timestamp_entry + t.direction}
              className="flex items-center justify-between rounded-lg border border-slate-700/70 px-3 py-2"
            >
              <div>
                <div className="text-sm font-semibold">{t.direction}</div>
                <div className="text-xs text-slate-400">
                  Entry {t.entry_price?.toFixed(5)} · Exit{" "}
                  {t.exit_price ? t.exit_price.toFixed(5) : "n/a"}
                </div>
                <div className="text-xs text-slate-500">
                  Session {t.session || "?"} · Spread{" "}
                  {t.spread_pips_entry ?? "?"} pips
                </div>
              </div>
              <div
                className={`text-sm font-bold ${(t.net_pnl_usd ?? t.net_pnl_eur ?? 0) >= 0 ? "text-success" : "text-danger"
                  }`}
              >
                {(t.net_pnl_usd ?? t.net_pnl_eur ?? 0) >= 0 ? "+" : ""}
                {(t.net_pnl_usd ?? t.net_pnl_eur ?? 0).toFixed(2)} USD
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
