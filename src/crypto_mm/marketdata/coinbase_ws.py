from __future__ import annotations

import asyncio
import json
import logging
from collections import deque
from datetime import UTC, datetime
from typing import Literal, cast

import websockets

from crypto_mm.analytics.spread import SpreadTracker, compute_depth_spreads
from crypto_mm.common.settings import Settings
from crypto_mm.marketdata.models import PublicTrade
from crypto_mm.marketdata.orderbook import OrderBook
from crypto_mm.portfolio.ledger import PortfolioState
from crypto_mm.risk.limits import RiskLimits
from crypto_mm.strategy.market_maker import MarketMaker, MarketMakerConfig

logger = logging.getLogger(__name__)


class MarketDataService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self.order_book = OrderBook()
        self.trade_tape: deque[PublicTrade] = deque(maxlen=settings.trade_history_limit)
        self.simulated_fills: deque[dict[str, object]] = deque(maxlen=settings.trade_history_limit)
        self.spread_tracker = SpreadTracker()
        self.portfolio = PortfolioState.bootstrap(
            initial_cash=settings.initial_cash,
            trade_history_limit=settings.trade_history_limit,
        )
        self.market_maker = MarketMaker(
            config=MarketMakerConfig(
                base_quote_spread_bps=settings.base_quote_spread_bps,
                order_size_btc=settings.order_size_btc,
                position_skew_bps_per_btc=settings.position_skew_bps_per_btc,
            ),
            portfolio=self.portfolio,
            risk_limits=RiskLimits(
                max_notional_exposure=settings.max_notional_exposure,
                max_loss=settings.max_loss,
            ),
        )
        self._lock = asyncio.Lock()

    async def run_forever(self) -> None:
        while True:
            try:
                await self._run_once()
            except Exception:
                logger.exception("coinbase websocket loop crashed")
                await asyncio.sleep(2)

    async def _run_once(self) -> None:
        async with websockets.connect(self._settings.ws_url, ping_interval=20) as ws:
            subscribe_payload = {
                "type": "subscribe",
                "product_ids": [self._settings.product_id],
                "channels": ["level2", "matches"],
            }
            await ws.send(json.dumps(subscribe_payload))
            async for raw_message in ws:
                message = json.loads(raw_message)
                await self._handle_message(message)

    async def _handle_message(self, message: dict[str, object]) -> None:
        msg_type = str(message.get("type", ""))
        async with self._lock:
            if msg_type == "snapshot":
                bids = message.get("bids", [])
                asks = message.get("asks", [])
                if isinstance(bids, list) and isinstance(asks, list):
                    self.order_book.apply_snapshot(bids=bids, asks=asks)
            elif msg_type == "l2update":
                changes = message.get("changes", [])
                if isinstance(changes, list):
                    for side, price, size in changes:
                        self.order_book.apply_l2_update(side=side, price=price, size=size)
            elif msg_type == "match":
                side = cast(Literal["buy", "sell"], str(message["side"]))
                trade = PublicTrade(
                    trade_id=_parse_optional_int(message.get("trade_id")),
                    side=side,
                    price=float(cast(str | float, message["price"])),
                    size=float(cast(str | float, message["size"])),
                    ts=_parse_ts(str(message["time"])),
                )
                self.trade_tape.appendleft(trade)
                fill = self.market_maker.maybe_fill(trade)
                if fill is not None:
                    self.simulated_fills.appendleft(fill.model_dump(mode="json"))

            mid = self.order_book.mid_price()
            if mid is None:
                return
            self.market_maker.update_quote(mid_price=mid)
            self.spread_tracker.record(compute_depth_spreads(self.order_book))

    async def state_snapshot(self) -> dict[str, object]:
        async with self._lock:
            top = self.order_book.top_n(10)
            mid = self.order_book.mid_price()
            mark_price = mid or 0.0
            quote = self.market_maker.last_quote
            return {
                "product_id": self._settings.product_id,
                "mid_price": mid,
                "best_bid": top["bids"][0].model_dump() if top["bids"] else None,
                "best_ask": top["asks"][0].model_dump() if top["asks"] else None,
                "book": {
                    "bids": [level.model_dump() for level in top["bids"]],
                    "asks": [level.model_dump() for level in top["asks"]],
                },
                "recent_trades": [trade.model_dump(mode="json") for trade in self.trade_tape],
                "spread_metrics": self.spread_tracker.summary(),
                "quote": quote.model_dump(mode="json") if quote is not None else None,
                "risk_status": self.market_maker.risk_status,
                "portfolio": self.portfolio.snapshot(mark_price=mark_price),
                "fills": list(self.simulated_fills),
            }


def _parse_ts(raw: str) -> datetime:
    return datetime.fromisoformat(raw.replace("Z", "+00:00")).astimezone(UTC)


def _parse_optional_int(value: object) -> int | None:
    if value is None:
        return None
    return int(cast(str | int | float, value))
