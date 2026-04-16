from __future__ import annotations

from collections import deque
from statistics import mean, median

from crypto_mm.marketdata.orderbook import OrderBook

DEPTH_SIZES = (0.1, 1.0, 5.0, 10.0)


def compute_depth_spreads(order_book: OrderBook) -> dict[float, float | None]:
    spreads: dict[float, float | None] = {}
    for size in DEPTH_SIZES:
        buy_cost = order_book.cost_to_buy(size)
        sell_proceeds = order_book.proceeds_to_sell(size)
        if buy_cost is None or sell_proceeds is None:
            spreads[size] = None
            continue
        spreads[size] = (buy_cost / size) - (sell_proceeds / size)
    return spreads


class SpreadTracker:
    def __init__(self, maxlen: int = 2_000) -> None:
        self._history: dict[float, deque[float]] = {
            size: deque(maxlen=maxlen) for size in DEPTH_SIZES
        }

    def record(self, spreads: dict[float, float | None]) -> None:
        for size, spread in spreads.items():
            if spread is None:
                continue
            self._history[size].append(spread)

    def summary(self) -> dict[str, dict[str, float | None]]:
        result: dict[str, dict[str, float | None]] = {}
        for size, values in self._history.items():
            key = _fmt_size(size)
            if not values:
                result[key] = {
                    "last": None,
                    "avg": None,
                    "median": None,
                    "min": None,
                    "max": None,
                    "samples": 0,
                }
                continue
            data = list(values)
            result[key] = {
                "last": data[-1],
                "avg": mean(data),
                "median": median(data),
                "min": min(data),
                "max": max(data),
                "samples": len(data),
            }
        return result

    def tail(self, points: int = 40) -> dict[str, list[float]]:
        return {
            _fmt_size(size): list(values)[-points:] for size, values in self._history.items()
        }


def _fmt_size(size: float) -> str:
    if size.is_integer():
        return f"{int(size)} BTC"
    return f"{size} BTC"
