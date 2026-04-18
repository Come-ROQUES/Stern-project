import type { AppState } from "../lib/api";
import { fmtPrice, fmtUptime, fmtUsd, pnlColor } from "../lib/format";
import { Dot, Pill } from "./ui";

type Props = {
  state: AppState | null;
  error: string | null;
  lastTickMs: number | null;
};

export function TopBar({ state, error, lastTickMs }: Props) {
  const product = state?.product_id ?? "BTC-USD";
  const mid = state?.mid_price ?? null;
  const bid = state?.best_bid?.price ?? null;
  const ask = state?.best_ask?.price ?? null;
  const spread = bid != null && ask != null ? ask - bid : null;
  const feed = state?.runtime.feed_state ?? "warming";
  const risk = state?.risk_status ?? "booting";
  const totalPnl =
    state ? state.portfolio.realized_pnl + state.portfolio.unrealized_pnl : null;
  const tickAgeMs = lastTickMs ? Date.now() - lastTickMs : null;

  const feedTone =
    feed === "live" ? "good" : feed === "trades_only" ? "warn" : "neutral";
  const riskTone =
    risk === "ok" ? "good" : risk === "booting" ? "neutral" : "bad";

  return (
    <header className="sticky top-0 z-30 backdrop-blur bg-bg/85 border-b border-white/5">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-3 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-[0.18em] text-neutral-400">Stern</span>
          <span className="text-base font-semibold tracking-tight text-white">Crypto Desk</span>
          <Pill tone="info">{product}</Pill>
        </div>

        <div className="flex items-center gap-5 mono num text-sm">
          <span className="text-neutral-400">
            BID <span className="text-emerald-300">{fmtPrice(bid)}</span>
          </span>
          <span className="text-neutral-200 text-base font-semibold">
            MID <span className="text-white">{fmtPrice(mid)}</span>
          </span>
          <span className="text-neutral-400">
            ASK <span className="text-rose-300">{fmtPrice(ask)}</span>
          </span>
          <span className="text-neutral-500">
            Δ {spread != null ? `$${spread.toFixed(2)}` : "—"}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-3 text-xs">
          <Pill tone={feedTone}><Dot tone={feedTone} pulsing={feed === "live"} />{feed}</Pill>
          <Pill tone={riskTone}><Dot tone={riskTone} />{risk}</Pill>
          <span className="text-neutral-400 mono">
            P&amp;L <span className={pnlColor(totalPnl)}>{fmtUsd(totalPnl, { signed: true })}</span>
          </span>
          <span className="text-neutral-500 mono">
            up {fmtUptime(state?.runtime.uptime_s ?? 0)}
          </span>
          <span className="text-neutral-600 mono">
            tick {tickAgeMs == null ? "—" : `${Math.floor(tickAgeMs / 100) * 100}ms`}
          </span>
          {error && (
            <Pill tone="bad" className="animate-pulse">
              {error.slice(0, 32)}
            </Pill>
          )}
        </div>
      </div>
    </header>
  );
}
