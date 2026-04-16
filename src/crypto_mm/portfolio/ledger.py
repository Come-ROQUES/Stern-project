from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field

from crypto_mm.marketdata.models import SimFill
from crypto_mm.portfolio.pnl import compute_exposure_usd, compute_unrealized_pnl


@dataclass(slots=True)
class PortfolioState:
    initial_cash: float
    cash: float
    position_btc: float = 0.0
    avg_entry_price: float = 0.0
    realized_pnl: float = 0.0
    fills: deque[SimFill] = field(default_factory=lambda: deque(maxlen=200))

    @classmethod
    def bootstrap(cls, initial_cash: float, trade_history_limit: int) -> PortfolioState:
        return cls(
            initial_cash=initial_cash,
            cash=initial_cash,
            fills=deque(maxlen=trade_history_limit),
        )

    def apply_fill(self, fill: SimFill) -> None:
        signed_qty = fill.size if fill.side == "buy" else -fill.size
        self.cash -= signed_qty * fill.price

        if abs(self.position_btc) < 1e-12 or self.position_btc * signed_qty > 0:
            self._increase_position(signed_qty=signed_qty, fill_price=fill.price)
        else:
            self._reduce_or_flip_position(signed_qty=signed_qty, fill_price=fill.price)

        self.fills.append(fill)

    def snapshot(self, mark_price: float) -> dict[str, float | str]:
        unrealized = compute_unrealized_pnl(
            position_btc=self.position_btc,
            avg_entry_price=self.avg_entry_price,
            mark_price=mark_price,
        )
        equity = self.cash + self.position_btc * mark_price
        return {
            "cash": self.cash,
            "position_btc": self.position_btc,
            "avg_entry_price": self.avg_entry_price,
            "exposure_usd": compute_exposure_usd(self.position_btc, mark_price),
            "realized_pnl": self.realized_pnl,
            "unrealized_pnl": unrealized,
            "equity": equity,
            "drawdown": equity - self.initial_cash,
        }

    def _increase_position(self, signed_qty: float, fill_price: float) -> None:
        total_qty = self.position_btc + signed_qty
        if abs(total_qty) < 1e-12:
            self.position_btc = 0.0
            self.avg_entry_price = 0.0
            return
        weighted_cost = (self.position_btc * self.avg_entry_price) + (signed_qty * fill_price)
        self.position_btc = total_qty
        self.avg_entry_price = weighted_cost / total_qty

    def _reduce_or_flip_position(self, signed_qty: float, fill_price: float) -> None:
        closing_qty = min(abs(self.position_btc), abs(signed_qty))
        if self.position_btc > 0:
            self.realized_pnl += (fill_price - self.avg_entry_price) * closing_qty
        else:
            self.realized_pnl += (self.avg_entry_price - fill_price) * closing_qty

        new_position = self.position_btc + signed_qty
        if abs(new_position) < 1e-12:
            self.position_btc = 0.0
            self.avg_entry_price = 0.0
            return
        if self.position_btc * new_position < 0:
            self.position_btc = new_position
            self.avg_entry_price = fill_price
            return
        self.position_btc = new_position

