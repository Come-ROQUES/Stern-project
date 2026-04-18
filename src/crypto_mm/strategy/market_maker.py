from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from crypto_mm.marketdata.models import PublicTrade, Quote, SimFill
from crypto_mm.portfolio.ledger import PortfolioState
from crypto_mm.risk.limits import RiskLimits


@dataclass(slots=True)
class MarketMakerConfig:
    base_quote_spread_bps: float
    order_size_btc: float
    position_skew_bps_per_btc: float
    vol_adaptive_gain: float = 0.5
    vol_adaptive_cap_bps: float = 30.0


class MarketMaker:
    def __init__(
        self, config: MarketMakerConfig, portfolio: PortfolioState, risk_limits: RiskLimits
    ) -> None:
        self._config = config
        self._portfolio = portfolio
        self._risk_limits = risk_limits
        self._last_quote: Quote | None = None
        self._risk_status: str = "booting"
        self._last_effective_spread_bps: float = config.base_quote_spread_bps
        self._last_skew_bps: float = 0.0
        self._last_vol_bps: float = 0.0

    @property
    def last_quote(self) -> Quote | None:
        return self._last_quote

    @property
    def risk_status(self) -> str:
        return self._risk_status

    @property
    def last_effective_spread_bps(self) -> float:
        return self._last_effective_spread_bps

    @property
    def last_skew_bps(self) -> float:
        return self._last_skew_bps

    @property
    def last_vol_bps(self) -> float:
        return self._last_vol_bps

    def update_quote(self, mid_price: float, realized_vol_bps: float = 0.0) -> Quote | None:
        can_quote, reason = self._risk_limits.can_quote(self._portfolio, mid_price)
        self._risk_status = reason
        if not can_quote:
            self._last_quote = None
            return None

        # Vol-adaptive spread: widen when realized vol exceeds the base quote.
        vol_premium_bps = max(
            0.0,
            (realized_vol_bps - self._config.base_quote_spread_bps) * self._config.vol_adaptive_gain,
        )
        vol_premium_bps = min(vol_premium_bps, self._config.vol_adaptive_cap_bps)
        effective_spread_bps = self._config.base_quote_spread_bps + vol_premium_bps
        skew_bps = self._portfolio.position_btc * self._config.position_skew_bps_per_btc

        half_spread = mid_price * (effective_spread_bps / 10_000.0) / 2.0
        skew = mid_price * (skew_bps / 10_000.0)

        bid_price = max(0.01, mid_price - half_spread - skew)
        ask_price = max(bid_price + 0.01, mid_price + half_spread - skew)
        quote = Quote(
            bid_price=bid_price,
            ask_price=ask_price,
            bid_size=self._config.order_size_btc,
            ask_size=self._config.order_size_btc,
            ts=datetime.now(tz=UTC),
        )
        self._last_quote = quote
        self._last_effective_spread_bps = effective_spread_bps
        self._last_skew_bps = skew_bps
        self._last_vol_bps = realized_vol_bps
        return quote

    def maybe_fill(self, trade: PublicTrade) -> SimFill | None:
        if self._last_quote is None:
            return None

        if trade.side == "sell" and trade.price <= self._last_quote.bid_price:
            fill = SimFill(
                side="buy",
                price=self._last_quote.bid_price,
                size=min(trade.size, self._last_quote.bid_size),
                ts=trade.ts,
                reason="trade_hit_bid",
            )
            self._portfolio.apply_fill(fill)
            return fill

        if trade.side == "buy" and trade.price >= self._last_quote.ask_price:
            fill = SimFill(
                side="sell",
                price=self._last_quote.ask_price,
                size=min(trade.size, self._last_quote.ask_size),
                ts=trade.ts,
                reason="trade_lift_offer",
            )
            self._portfolio.apply_fill(fill)
            return fill

        return None

