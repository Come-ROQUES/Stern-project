from __future__ import annotations

from dataclasses import dataclass

from crypto_mm.portfolio.ledger import PortfolioState


@dataclass(slots=True)
class RiskLimits:
    max_notional_exposure: float
    max_loss: float

    def can_quote(self, portfolio: PortfolioState, mark_price: float) -> tuple[bool, str]:
        snapshot = portfolio.snapshot(mark_price)
        exposure = abs(float(snapshot["exposure_usd"]))
        total_pnl = float(snapshot["realized_pnl"]) + float(snapshot["unrealized_pnl"])
        if exposure > self.max_notional_exposure:
            return False, "max_notional_exposure_breached"
        if total_pnl <= -self.max_loss:
            return False, "max_loss_breached"
        return True, "ok"

