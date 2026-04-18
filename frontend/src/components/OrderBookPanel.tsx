import type { BookLevel } from "../lib/api";
import { fmtPrice } from "../lib/format";
import { Card } from "./ui";

type Props = {
  bids: BookLevel[];
  asks: BookLevel[];
  mid: number | null;
};

const ROWS = 10;

export function OrderBookPanel({ bids, asks, mid }: Props) {
  const bidRows = padTo(bids.slice(0, ROWS), ROWS);
  const askRows = padTo(asks.slice(0, ROWS), ROWS).reverse();
  const maxSize = Math.max(
    1e-9,
    ...bidRows.map((l) => l?.size ?? 0),
    ...askRows.map((l) => l?.size ?? 0),
  );

  return (
    <Card title="Order book" subtitle={`top ${ROWS} levels · level2`} className="h-full">
      <div className="grid grid-cols-3 mono num text-xs uppercase tracking-wider text-neutral-500 border-b border-white/5 pb-1">
        <span>Size BTC</span>
        <span className="text-center">Price</span>
        <span className="text-right">Size BTC</span>
      </div>

      <ul className="divide-y divide-white/5 mono num text-sm">
        {askRows.map((lvl, i) => (
          <BookRow key={`ask-${i}`} level={lvl} side="ask" maxSize={maxSize} />
        ))}
      </ul>

      <div className="my-1 flex items-center justify-center gap-2 mono num text-sm border-y border-white/5 py-1.5">
        <span className="text-neutral-500 text-[11px] uppercase tracking-wider">mid</span>
        <span className="text-white text-base">{fmtPrice(mid)}</span>
      </div>

      <ul className="divide-y divide-white/5 mono num text-sm">
        {bidRows.map((lvl, i) => (
          <BookRow key={`bid-${i}`} level={lvl} side="bid" maxSize={maxSize} />
        ))}
      </ul>
    </Card>
  );
}

function BookRow({
  level,
  side,
  maxSize,
}: {
  level: BookLevel | null;
  side: "bid" | "ask";
  maxSize: number;
}) {
  const isBid = side === "bid";
  const sizeText = level ? level.size.toFixed(4) : "—";
  const priceText = level ? fmtPrice(level.price) : "—";
  const ratio = level ? Math.min(1, level.size / maxSize) : 0;
  const barColor = isBid
    ? "bg-emerald-500/15"
    : "bg-rose-500/15";
  const priceColor = isBid ? "text-emerald-300" : "text-rose-300";

  return (
    <li className="relative grid grid-cols-3 items-center py-1 px-1">
      <div
        className={`absolute inset-y-0 ${isBid ? "left-0" : "right-0"} ${barColor} pointer-events-none`}
        style={{ width: `${ratio * 100}%` }}
      />
      <span className={`relative ${isBid ? "text-neutral-300" : "text-neutral-500"}`}>{isBid ? sizeText : ""}</span>
      <span className={`relative text-center ${priceColor}`}>{priceText}</span>
      <span className={`relative text-right ${isBid ? "text-neutral-500" : "text-neutral-300"}`}>{isBid ? "" : sizeText}</span>
    </li>
  );
}

function padTo<T>(arr: T[], n: number): (T | null)[] {
  if (arr.length >= n) return arr.slice(0, n);
  return [...arr, ...Array.from({ length: n - arr.length }, () => null)];
}
