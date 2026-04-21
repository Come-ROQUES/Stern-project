from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from crypto_mm.marketdata.models import BookLevel, PublicTrade, Quote, SimFill
from crypto_mm.portfolio.ledger import PortfolioState
from crypto_mm.risk.limits import RiskLimits

MIN_TICK = 0.01


@dataclass(slots=True)
class MarketMakerConfig:
    """Parameters controlling quote width, size and inventory skew."""

    base_quote_spread_bps: float
    order_size_btc: float
    position_skew_bps_per_btc: float
    vol_adaptive_gain: float = 0.5
    vol_adaptive_cap_bps: float = 30.0


class MarketMaker:
    """Generate synthetic quotes and simulate fills from the public tape."""

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

    def update_quote(
        self,
        mid_price: float,
        best_bid: BookLevel | None = None,
        best_ask: BookLevel | None = None,
        realized_vol_bps: float = 0.0,
    ) -> Quote | None:
        """Refresh the active quote from the latest mid-price and risk state."""

        can_quote, reason = self._risk_limits.can_quote(self._portfolio, mid_price)
        self._risk_status = reason
        self._last_vol_bps = max(0.0, realized_vol_bps)
        if not can_quote:
            self._last_quote = None
            return None

        base_bps = self._config.base_quote_spread_bps
        vol_premium_bps = max(0.0, (self._last_vol_bps - base_bps)) * self._config.vol_adaptive_gain
        vol_premium_bps = min(vol_premium_bps, self._config.vol_adaptive_cap_bps)
        target_bps = base_bps + vol_premium_bps

        half_spread = mid_price * (target_bps / 10_000.0) / 2.0
        skew_bps = self._portfolio.position_btc * self._config.position_skew_bps_per_btc
        self._last_skew_bps = skew_bps
        skew = mid_price * (skew_bps / 10_000.0)

        raw_bid_price = max(MIN_TICK, mid_price - half_spread - skew)
        raw_ask_price = max(raw_bid_price + MIN_TICK, mid_price + half_spread - skew)

        bid_price = raw_bid_price
        ask_price = raw_ask_price
        if best_bid is not None:
            bid_price = max(bid_price, best_bid.price)
        if best_ask is not None:
            ask_price = min(ask_price, best_ask.price)
        if best_ask is not None:
            bid_price = min(bid_price, best_ask.price - MIN_TICK)
        if best_bid is not None:
            ask_price = max(ask_price, best_bid.price + MIN_TICK)
        ask_price = max(ask_price, bid_price + MIN_TICK)

        self._last_effective_spread_bps = ((ask_price - bid_price) / mid_price) * 10_000.0
        quote = Quote(
            bid_price=bid_price,
            ask_price=ask_price,
            bid_size=self._config.order_size_btc,
            ask_size=self._config.order_size_btc,
            ts=datetime.now(tz=UTC),
        )
        self._last_quote = quote
        return quote

    def maybe_fill(self, trade: PublicTrade) -> SimFill | None:
        """Simulate a fill when a public trade matches our resting maker quote.

        Coinbase `market_trades.side` reports the maker side of the matched
        order. A `buy` trade therefore means the maker bid traded, while a
        `sell` trade means the maker ask traded.
        """

        if self._last_quote is None:
            return None

        if trade.side == "buy" and trade.price <= self._last_quote.bid_price:
            fill_size = min(trade.size, self._last_quote.bid_size)
            if fill_size <= 1e-12:
                return None
            fill = SimFill(
                side="buy",
                price=self._last_quote.bid_price,
                size=fill_size,
                ts=trade.ts,
                reason="trade_hit_bid",
            )
            self._portfolio.apply_fill(fill)
            self._last_quote.bid_size = max(0.0, self._last_quote.bid_size - fill.size)
            return fill

        if trade.side == "sell" and trade.price >= self._last_quote.ask_price:
            fill_size = min(trade.size, self._last_quote.ask_size)
            if fill_size <= 1e-12:
                return None
            fill = SimFill(
                side="sell",
                price=self._last_quote.ask_price,
                size=fill_size,
                ts=trade.ts,
                reason="trade_lift_offer",
            )
            self._portfolio.apply_fill(fill)
            self._last_quote.ask_size = max(0.0, self._last_quote.ask_size - fill.size)
            return fill

        return None
