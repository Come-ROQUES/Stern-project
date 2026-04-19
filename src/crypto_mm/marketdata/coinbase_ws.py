from __future__ import annotations

import asyncio
import json
import logging
from collections import deque
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from math import sqrt
from statistics import mean
from time import monotonic
from typing import Literal, cast

import websockets

from crypto_mm.analytics.spread import SpreadTracker, compute_depth_spreads
from crypto_mm.common.settings import Settings
from crypto_mm.marketdata.models import BookLevel, PublicTrade
from crypto_mm.marketdata.orderbook import OrderBook
from crypto_mm.notify import TelegramNotifier
from crypto_mm.portfolio.ledger import PortfolioState
from crypto_mm.risk.limits import RiskLimits
from crypto_mm.strategy.market_maker import MarketMaker, MarketMakerConfig

logger = logging.getLogger(__name__)
EVENT_LOOP_YIELD_EVERY = 1
SNAPSHOT_YIELD_EVERY = 500
READINESS_MIN_POINTS = 1
FAST_ANALYTICS_INTERVAL_S = 0.25
MID_SAMPLE_INTERVAL_S = 0.1
STATE_PUBLISH_INTERVAL_S = 0.10


class MarketDataService:
    """Own the live feed loop, derived analytics and UI state publication."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._started_at = datetime.now(tz=UTC)
        self._message_count = 0
        self._state_version = 0
        self._state_event = asyncio.Event()
        self._last_analytics_at = 0.0
        self._last_publish_at = 0.0
        self._last_mid_sample_at = 0.0
        self._last_vol_bps = 0.0
        self.order_book = OrderBook()
        self.trade_tape: deque[PublicTrade] = deque(maxlen=settings.trade_history_limit)
        self.simulated_fills: deque[dict[str, float | str]] = deque(
            maxlen=settings.trade_history_limit
        )
        self.spread_tracker = SpreadTracker()
        self.mid_history: deque[dict[str, float | str]] = deque(maxlen=1800)
        self.portfolio_history: deque[dict[str, float | str]] = deque(maxlen=240)
        self.quote_history: deque[dict[str, float | str | bool]] = deque(maxlen=240)
        self.portfolio = PortfolioState.bootstrap(
            initial_cash=settings.initial_cash,
            trade_history_limit=settings.trade_history_limit,
        )
        self.market_maker = MarketMaker(
            config=MarketMakerConfig(
                base_quote_spread_bps=settings.base_quote_spread_bps,
                order_size_btc=settings.order_size_btc,
                position_skew_bps_per_btc=settings.position_skew_bps_per_btc,
                vol_adaptive_gain=settings.vol_adaptive_gain,
                vol_adaptive_cap_bps=settings.vol_adaptive_cap_bps,
            ),
            portfolio=self.portfolio,
            risk_limits=RiskLimits(
                max_notional_exposure=settings.max_notional_exposure,
                max_loss=settings.max_loss,
            ),
        )
        self.notifier = TelegramNotifier(
            bot_token=settings.telegram_bot_token,
            chat_id=settings.telegram_chat_id,
        )
        self._last_risk_status = self.market_maker.risk_status

    async def run_forever(self) -> None:
        """Reconnect forever so the local dashboard survives feed interruptions."""

        while True:
            try:
                await self._run_once()
            except Exception:
                logger.exception("coinbase websocket loop crashed")
                await asyncio.sleep(2)

    async def _run_once(self) -> None:
        """Open subscriptions and process the Coinbase websocket stream."""

        async with websockets.connect(
            self._settings.ws_url,
            ping_interval=20,
            max_size=None,
        ) as ws:
            await ws.send(
                json.dumps(
                    {
                        "type": "subscribe",
                        "product_ids": [self._settings.product_id],
                        "channel": "level2",
                    }
                )
            )
            await ws.send(
                json.dumps(
                    {
                        "type": "subscribe",
                        "product_ids": [self._settings.product_id],
                        "channel": "market_trades",
                    }
                )
            )
            async for raw_message in ws:
                message = json.loads(raw_message)
                await self._handle_message(message)
                if self._message_count % EVENT_LOOP_YIELD_EVERY == 0:
                    # Let uvicorn serve pending HTTP requests under sustained market flow.
                    await asyncio.sleep(0)

    async def _handle_message(self, message: dict[str, object]) -> None:
        # Golden rule: dashboard reactivity wins. Keep top-of-book and quote
        # updates on the fast path, and sample heavier analytics so bursts of
        # market data cannot delay UI freshness.
        msg_type = str(message.get("type", ""))
        channel = str(message.get("channel", ""))
        self._message_count += 1
        if msg_type == "error":
            logger.warning("coinbase subscription error: %s", message)
            return
        if channel == "l2_data":
            await self._handle_l2_message(message)
        elif channel == "market_trades":
            self._handle_market_trades_message(message)

        mid = self.order_book.mid_price()
        if mid is None:
            return
        quote = self.market_maker.update_quote(
            mid_price=mid,
            realized_vol_bps=self._last_vol_bps,
        )
        self._maybe_record_mid(mid)
        self._maybe_refresh_analytics(mid=mid, quote_active=quote is not None)
        self._publish_state()

    def _realized_vol_bps(self) -> float:
        """Estimate realized volatility from recent mid-price returns in bps."""

        mid_values = [float(point["mid_price"]) for point in list(self.mid_history)[-150:]]
        if len(mid_values) < 2:
            return 0.0
        returns = _returns_bps(mid_values)
        if not returns:
            return 0.0
        return sqrt(mean(ret * ret for ret in returns))

    async def _handle_l2_message(self, message: dict[str, object]) -> None:
        """Apply order book snapshots or incremental updates from the feed."""

        events = message.get("events", [])
        if not isinstance(events, list):
            return
        for event in events:
            if not isinstance(event, dict):
                continue
            updates = event.get("updates", [])
            if not isinstance(updates, list):
                continue
            event_type = str(event.get("type", ""))
            if event_type == "snapshot":
                self.order_book.clear()
                for index, update in enumerate(updates):
                    if not isinstance(update, dict):
                        continue
                    side = _normalize_book_side(str(update.get("side", "")))
                    price = str(update.get("price_level", "0"))
                    size = str(update.get("new_quantity", "0"))
                    if side:
                        self.order_book.apply_l2_update(
                            side=side,
                            price=price,
                            size=size,
                        )
                    if index and index % SNAPSHOT_YIELD_EVERY == 0:
                        # Expose provisional top-of-book while the initial L2 dump
                        # is still streaming so the UI can render immediately.
                        self._refresh_quote_preview()
                        await asyncio.sleep(0)
                self._refresh_quote_preview()
            elif event_type == "update":
                for update in updates:
                    if not isinstance(update, dict):
                        continue
                    side = _normalize_book_side(str(update.get("side", "")))
                    price = str(update.get("price_level", "0"))
                    size = str(update.get("new_quantity", "0"))
                    if side:
                        self.order_book.apply_l2_update(
                            side=side,
                            price=price,
                            size=size,
                        )

    def _refresh_quote_preview(self) -> None:
        """Publish a provisional quote during long snapshot hydration."""

        mid = self.order_book.mid_price()
        if mid is None:
            return
        self.market_maker.update_quote(
            mid_price=mid,
            realized_vol_bps=self._last_vol_bps,
        )
        self._publish_state(force=True)

    def _maybe_record_mid(self, mid: float) -> None:
        # Mid sampling is decoupled from the heavier analytics pass so the
        # price chart has dense points (10 Hz) for a smooth candle render,
        # while vol/momentum/depth analytics stay throttled.
        now = monotonic()
        if now - self._last_mid_sample_at < MID_SAMPLE_INTERVAL_S:
            return
        self._last_mid_sample_at = now
        self.mid_history.append(
            {
                "ts": datetime.now(tz=UTC).isoformat(),
                "mid_price": mid,
            }
        )

    def _maybe_refresh_analytics(self, mid: float, quote_active: bool) -> None:
        """Throttle heavier analytics so market bursts do not starve the UI."""

        now = monotonic()
        if now - self._last_analytics_at < FAST_ANALYTICS_INTERVAL_S:
            return
        self._last_analytics_at = now
        self._last_vol_bps = self._realized_vol_bps()
        # Re-price once with the refreshed vol input so strategy telemetry and
        # UI panels reflect the same effective spread regime as analytics.
        quote = self.market_maker.update_quote(
            mid_price=mid,
            realized_vol_bps=self._last_vol_bps,
        )
        spreads = compute_depth_spreads(self.order_book)
        self.spread_tracker.record(spreads)
        self._record_live_snapshots(mid=mid, quote_active=quote is not None and quote_active)
        self._maybe_notify_risk_transition(mid=mid)

    def _maybe_notify_risk_transition(self, mid: float) -> None:
        # Only fire on state change so a breached book does not spam Telegram.
        current = self.market_maker.risk_status
        if current == self._last_risk_status:
            return
        previous = self._last_risk_status
        self._last_risk_status = current
        if not self.notifier.enabled:
            return
        portfolio = self.portfolio.snapshot(mark_price=mid)
        total_pnl = float(portfolio["realized_pnl"]) + float(portfolio["unrealized_pnl"])
        text = (
            f"*Risk status*: `{previous}` → `{current}`\n"
            f"Mid: `{mid:,.2f}` USD\n"
            f"Position: `{float(portfolio['position_btc']):+.4f}` BTC\n"
            f"Exposure: `{float(portfolio['exposure_usd']):,.0f}` USD\n"
            f"PnL: `{total_pnl:+,.2f}` USD"
        )
        self.notifier.fire_and_forget(text)

    def _publish_state(self, force: bool = False) -> None:
        """Signal state updates to polling and streaming consumers."""

        now = monotonic()
        if not force and now - self._last_publish_at < STATE_PUBLISH_INTERVAL_S:
            return
        self._last_publish_at = now
        self._state_version += 1
        # A single event fan-outs to both /api/state snapshots and the SSE
        # stream, which keeps frontend consumers synchronized on one backend cadence.
        self._state_event.set()

    def _handle_market_trades_message(self, message: dict[str, object]) -> None:
        """Normalize public trades and run fill simulation against active quotes."""

        events = message.get("events", [])
        if not isinstance(events, list):
            return
        for event in events:
            if not isinstance(event, dict):
                continue
            trades = event.get("trades", [])
            if not isinstance(trades, list):
                continue
            for raw_trade in reversed(trades):
                if not isinstance(raw_trade, dict):
                    continue
                side = cast(
                    Literal["buy", "sell"],
                    str(raw_trade.get("side", "")).lower(),
                )
                if side not in {"buy", "sell"}:
                    continue
                trade = PublicTrade(
                    trade_id=_parse_optional_int(raw_trade.get("trade_id")),
                    side=side,
                    price=float(cast(str | float, raw_trade["price"])),
                    size=float(cast(str | float, raw_trade["size"])),
                    ts=_parse_ts(str(raw_trade["time"])),
                )
                self.trade_tape.appendleft(trade)
                fill = self.market_maker.maybe_fill(trade)
                if fill is not None:
                    self.simulated_fills.appendleft(fill.model_dump(mode="json"))

    async def state_snapshot(self) -> dict[str, object]:
        top = self.order_book.top_n(10)
        mid = self.order_book.mid_price()
        mark_price = mid or 0.0
        quote = self.market_maker.last_quote
        portfolio = self.portfolio.snapshot(mark_price=mark_price)
        spread_metrics = self.spread_tracker.summary()
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
            "spread_metrics": spread_metrics,
            "spread_history": self.spread_tracker.tail(),
            "mid_history": list(self.mid_history),
            "quote": quote.model_dump(mode="json") if quote is not None else None,
            "risk_status": self.market_maker.risk_status,
            "portfolio": portfolio,
            "fills": list(self.simulated_fills),
            "runtime": self._runtime_snapshot(top=top, mid=mid),
            "strategy": self._strategy_snapshot(quote=quote, portfolio=portfolio),
            "quant_lab": self._quant_lab_snapshot(
                top=top,
                mid=mid,
                spread_metrics=spread_metrics,
            ),
            "backtest_lite": self._backtest_snapshot(portfolio=portfolio),
        }

    async def state_stream(self) -> AsyncIterator[dict[str, object] | None]:
        last_seen = -1
        while True:
            if self._state_version != last_seen:
                last_seen = self._state_version
                yield await self.state_snapshot()
                continue

            self._state_event.clear()
            try:
                await asyncio.wait_for(self._state_event.wait(), timeout=15.0)
            except TimeoutError:
                # Keep SSE connections warm even during quiet periods.
                yield None

    def _record_live_snapshots(self, mid: float, quote_active: bool) -> None:
        now = datetime.now(tz=UTC)
        portfolio = self.portfolio.snapshot(mark_price=mid)
        total_pnl = float(portfolio["realized_pnl"]) + float(portfolio["unrealized_pnl"])
        self.portfolio_history.append(
            {
                "ts": now.isoformat(),
                "equity": float(portfolio["equity"]),
                "position_btc": float(portfolio["position_btc"]),
                "total_pnl": total_pnl,
            }
        )
        self.quote_history.append(
            {
                "ts": now.isoformat(),
                "active": quote_active,
                "position_btc": float(portfolio["position_btc"]),
            }
        )

    def _runtime_snapshot(
        self, top: dict[str, list[BookLevel]], mid: float | None
    ) -> dict[str, object]:
        last_trade = self.trade_tape[0] if self.trade_tape else None
        return {
            "uptime_s": int((datetime.now(tz=UTC) - self._started_at).total_seconds()),
            "messages_seen": self._message_count,
            "trade_events": len(self.trade_tape),
            "order_book_ready": bool(top["bids"] and top["asks"]),
            "book_levels": {
                "bids": len(top["bids"]),
                "asks": len(top["asks"]),
            },
            "mid_ready": mid is not None,
            "last_trade_ts": last_trade.ts.isoformat() if last_trade is not None else None,
            "feed_state": self._feed_state(mid=mid, top=top),
        }

    def _strategy_snapshot(
        self, quote: object | None, portfolio: dict[str, float | str]
    ) -> dict[str, object]:
        fill_notionals = [float(fill["price"]) * float(fill["size"]) for fill in self.simulated_fills]
        return {
            "mode": "paper_market_maker",
            "quote_active": quote is not None,
            "fill_count": len(self.simulated_fills),
            "avg_fill_notional": mean(fill_notionals) if fill_notionals else 0.0,
            "inventory_btc": float(portfolio["position_btc"]),
            "avg_entry_price": float(portfolio["avg_entry_price"]),
            "risk_status": self.market_maker.risk_status,
            "effective_spread_bps": self.market_maker.last_effective_spread_bps,
            "skew_bps": self.market_maker.last_skew_bps,
            "vol_input_bps": self.market_maker.last_vol_bps,
            "config": {
                "base_quote_spread_bps": self._settings.base_quote_spread_bps,
                "order_size_btc": self._settings.order_size_btc,
                "position_skew_bps_per_btc": self._settings.position_skew_bps_per_btc,
                "max_notional_exposure": self._settings.max_notional_exposure,
                "max_loss": self._settings.max_loss,
            },
        }

    def _quant_lab_snapshot(
        self,
        top: dict[str, list[BookLevel]],
        mid: float | None,
        spread_metrics: dict[str, dict[str, float | None]],
    ) -> dict[str, object]:
        mid_values = [float(point["mid_price"]) for point in self.mid_history]
        returns_bps = _returns_bps(mid_values)
        top_bids = top["bids"][:5]
        top_asks = top["asks"][:5]
        bid_depth = sum(float(level.size) for level in top_bids)
        ask_depth = sum(float(level.size) for level in top_asks)
        total_depth = bid_depth + ask_depth
        depth_imbalance = (
            (bid_depth - ask_depth) / total_depth if total_depth > 0 else 0.0
        )
        flow_imbalance = _trade_flow_imbalance(list(self.trade_tape)[:50])
        micro_bias_bps = _micro_bias_bps(top=top, mid=mid)
        return {
            "readiness": "ready" if len(mid_values) >= READINESS_MIN_POINTS else "warming",
            "window_points": len(mid_values),
            "realized_vol_bps": sqrt(mean([ret * ret for ret in returns_bps])) if returns_bps else 0.0,
            "momentum_bps": _momentum_bps(mid_values),
            "trade_flow_imbalance_btc": flow_imbalance,
            "top5_depth_imbalance": depth_imbalance,
            "micro_bias_bps": micro_bias_bps,
            "spread_regimes": _spread_regimes(spread_metrics),
            "research_presets": [
                {
                    "name": "Tight Maker",
                    "spread_bps": max(self._settings.base_quote_spread_bps - 2.0, 2.0),
                    "skew_bps_per_btc": self._settings.position_skew_bps_per_btc + 1.0,
                    "stance": "more fills, more inventory pressure",
                },
                {
                    "name": "Baseline",
                    "spread_bps": self._settings.base_quote_spread_bps,
                    "skew_bps_per_btc": self._settings.position_skew_bps_per_btc,
                    "stance": "current live paper baseline",
                },
                {
                    "name": "Defensive",
                    "spread_bps": self._settings.base_quote_spread_bps + 3.0,
                    "skew_bps_per_btc": self._settings.position_skew_bps_per_btc + 2.0,
                    "stance": "lower cadence, stronger inventory control",
                },
            ],
        }

    def _backtest_snapshot(self, portfolio: dict[str, float | str]) -> dict[str, object]:
        equity_curve = [float(point["equity"]) for point in self.portfolio_history]
        peak_equity = max(equity_curve) if equity_curve else float(portfolio["equity"])
        max_drawdown = _max_drawdown(equity_curve)
        fill_volume = sum(float(fill["size"]) for fill in self.simulated_fills)
        fill_notional = sum(
            float(fill["size"]) * float(fill["price"]) for fill in self.simulated_fills
        )
        quote_samples = [1.0 if bool(point["active"]) else 0.0 for point in self.quote_history]
        total_pnl = float(portfolio["realized_pnl"]) + float(portfolio["unrealized_pnl"])
        return {
            "mode": "paper_session_replay",
            "status": "ready" if len(equity_curve) >= READINESS_MIN_POINTS else "warming",
            "window_points": len(equity_curve),
            "equity_curve": equity_curve[-60:],
            "pnl_curve": [float(point["total_pnl"]) for point in self.portfolio_history][-60:],
            "peak_equity_usd": peak_equity,
            "max_drawdown_usd": max_drawdown,
            "quote_uptime_pct": mean(quote_samples) * 100 if quote_samples else 0.0,
            "fill_count": len(self.simulated_fills),
            "fill_volume_btc": fill_volume,
            "fill_notional_usd": fill_notional,
            "paper_return_pct": (
                (float(portfolio["equity"]) - self._settings.initial_cash)
                / self._settings.initial_cash
                * 100
            ),
            "total_pnl_usd": total_pnl,
        }

    def _feed_state(self, mid: float | None, top: dict[str, list[BookLevel]]) -> str:
        if mid is None:
            return "warming"
        if not top["bids"] or not top["asks"]:
            return "trades_only"
        return "live"


def _parse_ts(raw: str) -> datetime:
    return datetime.fromisoformat(raw.replace("Z", "+00:00")).astimezone(UTC)


def _parse_optional_int(value: object) -> int | None:
    if value is None:
        return None
    return int(cast(str | int | float, value))


def _normalize_book_side(value: str) -> Literal["buy", "sell"] | None:
    lowered = value.lower()
    if lowered == "bid":
        return "buy"
    if lowered in {"offer", "ask"}:
        return "sell"
    return None


def _returns_bps(values: list[float]) -> list[float]:
    returns: list[float] = []
    for index in range(1, len(values)):
        previous = values[index - 1]
        current = values[index]
        if previous <= 0:
            continue
        returns.append(((current / previous) - 1.0) * 10_000.0)
    return returns


def _momentum_bps(values: list[float]) -> float:
    if len(values) < 2 or values[0] <= 0:
        return 0.0
    return ((values[-1] / values[0]) - 1.0) * 10_000.0


def _trade_flow_imbalance(trades: list[PublicTrade]) -> float:
    return sum(trade.size if trade.side == "buy" else -trade.size for trade in trades)


def _micro_bias_bps(top: dict[str, list[BookLevel]], mid: float | None) -> float:
    if mid is None or not top["bids"] or not top["asks"] or mid <= 0:
        return 0.0
    bid = top["bids"][0]
    ask = top["asks"][0]
    weight = float(bid.size) + float(ask.size)
    if weight <= 0:
        return 0.0
    micro_price = (
        float(bid.price) * float(ask.size) + float(ask.price) * float(bid.size)
    ) / weight
    return ((micro_price / mid) - 1.0) * 10_000.0


def _spread_regimes(
    spread_metrics: dict[str, dict[str, float | None]]
) -> list[dict[str, float | str | None]]:
    regimes: list[dict[str, float | str | None]] = []
    for depth, metrics in spread_metrics.items():
        latest = metrics["last"]
        average = metrics["avg"]
        if latest is None or average is None:
            state = "warming"
        elif latest < average * 0.9:
            state = "tight"
        elif latest > average * 1.1:
            state = "wide"
        else:
            state = "balanced"
        regimes.append(
            {
                "depth": depth,
                "state": state,
                "last": latest,
                "avg": average,
            }
        )
    return regimes


def _max_drawdown(curve: list[float]) -> float:
    if not curve:
        return 0.0
    peak = curve[0]
    max_drawdown = 0.0
    for value in curve:
        peak = max(peak, value)
        max_drawdown = min(max_drawdown, value - peak)
    return abs(max_drawdown)
