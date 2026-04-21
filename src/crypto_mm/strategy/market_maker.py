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
        self._bid_queue_ahead: float = 0.0
        self._ask_queue_ahead: float = 0.0

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
            self._bid_queue_ahead = 0.0
            self._ask_queue_ahead = 0.0
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
        bid_size, ask_size = self._next_quote_sizes(bid_price=bid_price, ask_price=ask_price)
        self._refresh_queue_state(
            bid_price=bid_price,
            ask_price=ask_price,
            best_bid=best_bid,
            best_ask=best_ask,
        )
        quote = Quote(
            bid_price=bid_price,
            ask_price=ask_price,
            bid_size=bid_size,
            ask_size=ask_size,
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
            fill_size = self._match_size(
                trade_price=trade.price,
                trade_size=trade.size,
                quote_price=self._last_quote.bid_price,
                remaining_size=self._last_quote.bid_size,
                queue_side="bid",
            )
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
            fill_size = self._match_size(
                trade_price=trade.price,
                trade_size=trade.size,
                quote_price=self._last_quote.ask_price,
                remaining_size=self._last_quote.ask_size,
                queue_side="ask",
            )
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

    def _next_quote_sizes(self, bid_price: float, ask_price: float) -> tuple[float, float]:
        if self._last_quote is None:
            return self._config.order_size_btc, self._config.order_size_btc

        bid_size = (
            self._last_quote.bid_size
            if abs(self._last_quote.bid_price - bid_price) <= 1e-12
            else self._config.order_size_btc
        )
        ask_size = (
            self._last_quote.ask_size
            if abs(self._last_quote.ask_price - ask_price) <= 1e-12
            else self._config.order_size_btc
        )
        return bid_size, ask_size

    def _refresh_queue_state(
        self,
        bid_price: float,
        ask_price: float,
        best_bid: BookLevel | None,
        best_ask: BookLevel | None,
    ) -> None:
        if self._last_quote is None or abs(self._last_quote.bid_price - bid_price) > 1e-12:
            self._bid_queue_ahead = best_bid.size if best_bid is not None and abs(best_bid.price - bid_price) <= 1e-12 else 0.0
        elif best_bid is not None and abs(best_bid.price - bid_price) <= 1e-12:
            self._bid_queue_ahead = min(self._bid_queue_ahead, best_bid.size)
        else:
            self._bid_queue_ahead = 0.0

        if self._last_quote is None or abs(self._last_quote.ask_price - ask_price) > 1e-12:
            self._ask_queue_ahead = best_ask.size if best_ask is not None and abs(best_ask.price - ask_price) <= 1e-12 else 0.0
        elif best_ask is not None and abs(best_ask.price - ask_price) <= 1e-12:
            self._ask_queue_ahead = min(self._ask_queue_ahead, best_ask.size)
        else:
            self._ask_queue_ahead = 0.0

    def _match_size(
        self,
        trade_price: float,
        trade_size: float,
        quote_price: float,
        remaining_size: float,
        queue_side: str,
    ) -> float:
        queue_ahead = self._bid_queue_ahead if queue_side == "bid" else self._ask_queue_ahead
        executable = trade_size
        if abs(trade_price - quote_price) <= 1e-12:
            if queue_ahead >= executable:
                queue_ahead -= executable
                executable = 0.0
            else:
                executable -= queue_ahead
                queue_ahead = 0.0
        else:
            queue_ahead = 0.0

        if queue_side == "bid":
            self._bid_queue_ahead = queue_ahead
        else:
            self._ask_queue_ahead = queue_ahead
        return min(executable, remaining_size)
