import type { SimFill } from "../lib/api";
import { exportUrls } from "../lib/api";
import { fmtPrice, fmtTimeUtc, fmtUsd } from "../lib/format";
import { Card } from "./ui";

type Props = {
  fills: SimFill[];
};

export function FillsPanel({ fills }: Props) {
  const rows = fills.slice(0, 40);
  return (
    <Card
      title="Simulated fills"
      subtitle="trade feed lifts/hits the resting paper quote"
      right={
        <div className="flex gap-2">
          <a
            href={exportUrls.fills}
            className="text-[11px] mono uppercase tracking-wider px-2.5 py-1 rounded-full border border-cyan-300/30 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20"
          >
            Export CSV
          </a>
        </div>
      }
      className="h-full"
    >
      <div className="grid grid-cols-[72px_56px_1fr_1fr_1fr_120px] mono num text-[11px] uppercase tracking-wider text-neutral-500 border-b border-white/5 pb-1">
        <span>Time</span>
        <span>Side</span>
        <span className="text-right">Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Notional</span>
        <span className="text-right">Reason</span>
      </div>
      <ul className="divide-y divide-white/5 mono num text-sm max-h-[360px] overflow-y-auto no-scrollbar">
        {rows.length === 0 && (
          <li className="py-3 text-center text-neutral-500 text-xs">
            no fills yet — quote needs to be lifted/hit by the trade feed
          </li>
        )}
        {rows.map((f, i) => {
          const isBuy = f.side === "buy";
          const notional = f.price * f.size;
          return (
            <li key={`${f.ts}-${i}`} className="grid grid-cols-[72px_56px_1fr_1fr_1fr_120px] py-1.5 px-1">
              <span className="text-neutral-500 text-xs">{fmtTimeUtc(f.ts)}</span>
              <span className={`text-[11px] uppercase ${isBuy ? "text-emerald-300" : "text-rose-300"}`}>
                {isBuy ? "buy" : "sell"}
              </span>
              <span className={`text-right ${isBuy ? "text-emerald-200" : "text-rose-200"}`}>
                {fmtPrice(f.price)}
              </span>
              <span className="text-right text-neutral-200">{f.size.toFixed(4)}</span>
              <span className="text-right text-neutral-300">{fmtUsd(notional, { compact: true })}</span>
              <span className="text-right text-[11px] text-neutral-500">{f.reason}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
