import type { Portfolio, Strategy } from "../lib/api";
import { fmtPct, fmtUsd } from "../lib/format";
import { Card, Pill } from "./ui";

type Props = {
  portfolio: Portfolio;
  strategy: Strategy;
  riskStatus: string;
};

export function RiskPanel({ portfolio, strategy, riskStatus }: Props) {
  const cfg = strategy.config;
  const exposure = Math.abs(portfolio.exposure_usd);
  const exposurePct = clamp(exposure / cfg.max_notional_exposure, 0, 1);
  const totalPnl = portfolio.realized_pnl + portfolio.unrealized_pnl;
  const lossUsed = Math.max(0, -totalPnl);
  const lossPct = clamp(lossUsed / cfg.max_loss, 0, 1);

  const tone =
    riskStatus === "ok" ? "good" : riskStatus === "booting" ? "neutral" : "bad";

  return (
    <Card
      title="Risk envelope"
      subtitle="hard limits enforced before quoting"
      right={<Pill tone={tone}>{riskStatus}</Pill>}
      className="h-full"
    >
      <div className="space-y-4">
        <Gauge
          label="Notional exposure"
          used={exposure}
          cap={cfg.max_notional_exposure}
          pct={exposurePct}
          format={(v) => fmtUsd(v, { compact: true })}
          tone={exposurePct > 0.85 ? "warn" : exposurePct > 0.97 ? "bad" : "good"}
        />
        <Gauge
          label="Loss budget consumed"
          used={lossUsed}
          cap={cfg.max_loss}
          pct={lossPct}
          format={(v) => fmtUsd(v, { compact: true })}
          tone={lossPct > 0.6 ? "warn" : lossPct > 0.85 ? "bad" : "good"}
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-[11px] text-neutral-500 mono">
        <div>
          <div className="uppercase tracking-wider">Max notional</div>
          <div className="text-neutral-300 text-sm">{fmtUsd(cfg.max_notional_exposure, { compact: true })}</div>
        </div>
        <div>
          <div className="uppercase tracking-wider">Max loss</div>
          <div className="text-neutral-300 text-sm">{fmtUsd(cfg.max_loss, { compact: true })} ({fmtPct(10)})</div>
        </div>
      </div>
    </Card>
  );
}

function Gauge({
  label,
  used,
  cap,
  pct,
  format,
  tone,
}: {
  label: string;
  used: number;
  cap: number;
  pct: number;
  format: (v: number) => string;
  tone: "good" | "warn" | "bad";
}) {
  const barColor = {
    good: "bg-emerald-400/70",
    warn: "bg-amber-300/80",
    bad: "bg-rose-400/80",
  }[tone];
  return (
    <div>
      <div className="flex justify-between text-xs mono">
        <span className="text-neutral-400 uppercase tracking-wider">{label}</span>
        <span className="text-neutral-200">
          {format(used)} <span className="text-neutral-500">/ {format(cap)}</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-white/5 overflow-hidden">
        <div
          className={`h-full ${barColor} transition-[width] duration-500`}
          style={{ width: `${(pct * 100).toFixed(1)}%` }}
        />
      </div>
      <div className="mt-1 text-[11px] text-neutral-500 mono">{(pct * 100).toFixed(1)}% utilised</div>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
