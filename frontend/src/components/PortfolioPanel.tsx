import type { Portfolio } from "../lib/api";
import { fmtBtc, fmtPrice, fmtUsd, pnlColor } from "../lib/format";
import { Card, Stat } from "./ui";

type Props = {
  portfolio: Portfolio;
};

export function PortfolioPanel({ portfolio }: Props) {
  const total = portfolio.realized_pnl + portfolio.unrealized_pnl;
  const positionTone =
    portfolio.position_btc > 0 ? "good" : portfolio.position_btc < 0 ? "bad" : "default";

  return (
    <Card title="Position & P&L" subtitle="paper book — mark to mid" className="h-full">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Stat
          label="Position"
          value={fmtBtc(portfolio.position_btc, 4)}
          tone={positionTone}
          hint={
            portfolio.avg_entry_price
              ? `avg entry ${fmtPrice(portfolio.avg_entry_price)}`
              : "flat"
          }
        />
        <Stat label="Exposure" value={fmtUsd(Math.abs(portfolio.exposure_usd), { compact: true })} hint="abs(notional)" />
        <Stat label="Equity" value={fmtUsd(portfolio.equity, { compact: true })} hint={`cash ${fmtUsd(portfolio.cash, { compact: true })}`} />
        <Stat
          label="Realized P&L"
          value={<span className={pnlColor(portfolio.realized_pnl)}>{fmtUsd(portfolio.realized_pnl, { signed: true })}</span>}
        />
        <Stat
          label="Unrealized P&L"
          value={<span className={pnlColor(portfolio.unrealized_pnl)}>{fmtUsd(portfolio.unrealized_pnl, { signed: true })}</span>}
        />
        <Stat
          label="Total P&L"
          value={<span className={pnlColor(total)}>{fmtUsd(total, { signed: true })}</span>}
          hint={portfolio.drawdown < 0 ? `dd ${fmtUsd(portfolio.drawdown, { signed: true })}` : "no drawdown"}
        />
      </div>
    </Card>
  );
}
