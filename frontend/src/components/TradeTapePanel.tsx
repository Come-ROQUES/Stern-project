import type { PublicTrade } from "../lib/api";
import { fmtPrice, fmtTimeUtc } from "../lib/format";
import { Card } from "./ui";

type Props = {
  trades: PublicTrade[];
};

export function TradeTapePanel({ trades }: Props) {
  const rows = trades.slice(0, 60);
  return (
    <Card title="Time & sales" subtitle="latest market trades" className="h-full">
      <div className="grid grid-cols-[72px_1fr_1fr_56px] mono num text-xs uppercase tracking-wider text-neutral-500 border-b border-white/5 pb-1">
        <span>Time</span>
        <span className="text-right">Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Side</span>
      </div>
      <ul className="divide-y divide-white/5 mono num text-sm max-h-[420px] overflow-y-auto no-scrollbar">
        {rows.length === 0 && (
          <li className="py-3 text-center text-neutral-500 text-xs">no trades yet…</li>
        )}
        {rows.map((t, i) => {
          const isBuy = t.side === "buy";
          return (
            <li key={`${t.trade_id ?? i}-${t.ts}`} className="grid grid-cols-[72px_1fr_1fr_56px] py-1 px-1">
              <span className="text-neutral-500 text-xs">{fmtTimeUtc(t.ts)}</span>
              <span className={`text-right ${isBuy ? "text-emerald-300" : "text-rose-300"}`}>
                {fmtPrice(t.price)}
              </span>
              <span className="text-right text-neutral-200">{t.size.toFixed(4)}</span>
              <span
                className={`text-right text-[11px] uppercase ${
                  isBuy ? "text-emerald-300" : "text-rose-300"
                }`}
              >
                {isBuy ? "buy" : "sell"}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
