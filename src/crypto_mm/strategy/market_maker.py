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
    inventory_soft_limit_btc: float = 0.5
    vol_adaptive_gain: float = 0.5
    vol_adaptive_cap_bps: float = 30.0
    micro_bias_gain: float = 1.5
    flow_imbalance_gain_bps_per_btc: float = 6.0
    signal_skew_cap_bps: float = 12.0
    adverse_side_threshold_bps: float = 4.0
    flat_adverse_side_threshold_bps: float = 6.0
    min_join_spread_bps: float = 1.0
    touch_queue_ahead_factor: float = 3.0


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
        micro_bias_bps: float = 0.0,
        trade_flow_imbalance_btc: float = 0.0,
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
        inventory_skew_bps = self._portfolio.position_btc * self._config.position_skew_bps_per_btc
        signal_skew_bps = -(
            (micro_bias_bps * self._config.micro_bias_gain)
            + (trade_flow_imbalance_btc * self._config.flow_imbalance_gain_bps_per_btc)
        )
        signal_skew_bps = max(
            -self._config.signal_skew_cap_bps,
            min(self._config.signal_skew_cap_bps, signal_skew_bps),
        )
        skew_bps = inventory_skew_bps + signal_skew_bps
        self._last_skew_bps = skew_bps
        skew = mid_price * (skew_bps / 10_000.0)

        raw_bid_price = max(MIN_TICK, mid_price - half_spread - skew)
        raw_ask_price = max(raw_bid_price + MIN_TICK, mid_price + half_spread - skew)

        bid_price = raw_bid_price
        ask_price = raw_ask_price
        if best_bid is not None and best_ask is not None:
            # Public trade prints cluster heavily at the touch. When our target
            # spread is wider than the live spread, joining the best bid/ask is
            # a better passive-maker approximation than resting deep in the book
            # where the public feed almost never reveals executions.
            bid_price = max(raw_bid_price, best_bid.price)
            ask_price = min(raw_ask_price, best_ask.price)
            bid_price = min(bid_price, best_ask.price - MIN_TICK)
            ask_price = max(ask_price, best_bid.price + MIN_TICK)
        else:
            if best_bid is not None:
                bid_price = min(bid_price, best_bid.price)
            if best_ask is not None:
                ask_price = max(ask_price, best_ask.price)
            if best_ask is not None:
                bid_price = min(bid_price, best_ask.price - MIN_TICK)
            if best_bid is not None:
                ask_price = max(ask_price, best_bid.price + MIN_TICK)
        ask_price = max(ask_price, bid_price + MIN_TICK)
        live_spread_bps = 0.0
        if best_bid is not None and best_ask is not None and mid_price > 0:
            live_spread_bps = ((best_ask.price - best_bid.price) / mid_price) * 10_000.0

        self._last_effective_spread_bps = ((ask_price - bid_price) / mid_price) * 10_000.0
        bid_size, ask_size = self._next_quote_sizes(
            bid_price=bid_price,
            ask_price=ask_price,
            signal_skew_bps=signal_skew_bps,
        )
        if (
            best_bid is not None
            and best_ask is not None
            and live_spread_bps < self._config.min_join_spread_bps
        ):
            position = self._portfolio.position_btc
            if position > 0:
                bid_size = 0.0
            elif position < 0:
                ask_size = 0.0
            else:
                bid_size = 0.0
                ask_size = 0.0
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

        We only claim fills when the tape trades exactly at our resting level.
        Prints through our price are treated as stale/ambiguous because the
        public feed does not guarantee our order was still at the front of the
        queue when the move continued through the book.
        """

        if self._last_quote is None:
            return None

        if trade.side == "buy" and abs(trade.price - self._last_quote.bid_price) <= 1e-12:
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

        if trade.side == "sell" and abs(trade.price - self._last_quote.ask_price) <= 1e-12:
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

    def _next_quote_sizes(
        self,
        bid_price: float,
        ask_price: float,
        signal_skew_bps: float,
    ) -> tuple[float, float]:
        if self._last_quote is None:
            return self._inventory_capped_sizes(
                self._config.order_size_btc,
                self._config.order_size_btc,
                signal_skew_bps=signal_skew_bps,
            )

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
        return self._inventory_capped_sizes(
            bid_size,
            ask_size,
            signal_skew_bps=signal_skew_bps,
        )

    def _inventory_capped_sizes(
        self,
        bid_size: float,
        ask_size: float,
        signal_skew_bps: float = 0.0,
    ) -> tuple[float, float]:
        soft_limit = max(self._config.inventory_soft_limit_btc, self._config.order_size_btc)
        position = self._portfolio.position_btc
        if position > 0:
            bid_size *= max(0.0, 1.0 - (position / soft_limit))
        elif position < 0:
            ask_size *= max(0.0, 1.0 - (abs(position) / soft_limit))
        threshold = self._config.adverse_side_threshold_bps
        flat_threshold = max(threshold, self._config.flat_adverse_side_threshold_bps)
        if signal_skew_bps > 0:
            bid_size *= max(0.0, 1.0 - (signal_skew_bps / max(threshold * 2.0, 1e-12)))
            if signal_skew_bps >= flat_threshold or (
                position > 0 and signal_skew_bps >= threshold
            ):
                bid_size = 0.0
        elif signal_skew_bps < 0:
            ask_size *= max(0.0, 1.0 - (abs(signal_skew_bps) / max(threshold * 2.0, 1e-12)))
            if abs(signal_skew_bps) >= flat_threshold or (
                position < 0 and abs(signal_skew_bps) >= threshold
            ):
                ask_size = 0.0
        return bid_size, ask_size

    def _refresh_queue_state(
        self,
        bid_price: float,
        ask_price: float,
        best_bid: BookLevel | None,
        best_ask: BookLevel | None,
    ) -> None:
        if self._last_quote is None or abs(self._last_quote.bid_price - bid_price) > 1e-12:
            self._bid_queue_ahead = self._queue_ahead_at_touch(best_bid, bid_price)
        elif best_bid is not None and abs(best_bid.price - bid_price) <= 1e-12:
            self._bid_queue_ahead = min(
                self._bid_queue_ahead,
                self._queue_ahead_at_touch(best_bid, bid_price),
            )
        else:
            self._bid_queue_ahead = 0.0

        if self._last_quote is None or abs(self._last_quote.ask_price - ask_price) > 1e-12:
            self._ask_queue_ahead = self._queue_ahead_at_touch(best_ask, ask_price)
        elif best_ask is not None and abs(best_ask.price - ask_price) <= 1e-12:
            self._ask_queue_ahead = min(
                self._ask_queue_ahead,
                self._queue_ahead_at_touch(best_ask, ask_price),
            )
        else:
            self._ask_queue_ahead = 0.0

    def _queue_ahead_at_touch(self, level: BookLevel | None, quote_price: float) -> float:
        if level is None or abs(level.price - quote_price) > 1e-12:
            return 0.0
        return level.size * self._config.touch_queue_ahead_factor

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
