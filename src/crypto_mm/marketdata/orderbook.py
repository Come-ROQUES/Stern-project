from __future__ import annotations

from collections.abc import Iterable

from crypto_mm.marketdata.models import BookLevel


class OrderBook:
    """In-memory level 2 book used for spread and quoting analytics."""

    def __init__(self) -> None:
        self._bids: dict[float, float] = {}
        self._asks: dict[float, float] = {}

    def clear(self) -> None:
        """Reset both sides of the book."""

        self._bids.clear()
        self._asks.clear()

    def apply_snapshot(
        self, bids: Iterable[tuple[str, str]], asks: Iterable[tuple[str, str]]
    ) -> None:
        """Replace the full book from a snapshot payload."""

        self._bids = {float(price): float(size) for price, size in bids if float(size) > 0}
        self._asks = {float(price): float(size) for price, size in asks if float(size) > 0}

    def apply_l2_update(self, side: str, price: str, size: str) -> None:
        """Apply one incremental level 2 update."""

        book = self._bids if side == "buy" else self._asks
        price_f = float(price)
        size_f = float(size)
        if size_f <= 0:
            book.pop(price_f, None)
            return
        book[price_f] = size_f

    def best_bid(self) -> BookLevel | None:
        """Return the highest bid currently available."""

        if not self._bids:
            return None
        price = max(self._bids)
        return BookLevel(price=price, size=self._bids[price])

    def best_ask(self) -> BookLevel | None:
        """Return the lowest ask currently available."""

        if not self._asks:
            return None
        price = min(self._asks)
        return BookLevel(price=price, size=self._asks[price])

    def mid_price(self) -> float | None:
        """Return the mid-price when both sides of the book are populated."""

        bid = self.best_bid()
        ask = self.best_ask()
        if bid is None or ask is None:
            return None
        return (bid.price + ask.price) / 2.0

    def top_n(self, n: int = 10) -> dict[str, list[BookLevel]]:
        """Expose the top `n` levels on each side for UI rendering."""

        bids = [
            BookLevel(price=price, size=size)
            for price, size in sorted(self._bids.items(), key=lambda item: item[0], reverse=True)[
                :n
            ]
        ]
        asks = [
            BookLevel(price=price, size=size)
            for price, size in sorted(self._asks.items(), key=lambda item: item[0])[:n]
        ]
        return {"bids": bids, "asks": asks}

    def cost_to_buy(self, size_btc: float) -> float | None:
        """Return the total cash needed to sweep asks for a target size."""

        return self._walk_book(size_btc=size_btc, levels=sorted(self._asks.items(), key=lambda x: x[0]))

    def proceeds_to_sell(self, size_btc: float) -> float | None:
        """Return the total proceeds from sweeping bids for a target size."""

        return self._walk_book(
            size_btc=size_btc,
            levels=sorted(self._bids.items(), key=lambda x: x[0], reverse=True),
        )

    def _walk_book(self, size_btc: float, levels: list[tuple[float, float]]) -> float | None:
        """Aggregate execution cost or proceeds across successive book levels."""

        if size_btc <= 0:
            return 0.0
        remaining = size_btc
        total = 0.0
        for price, size in levels:
            take = min(remaining, size)
            total += take * price
            remaining -= take
            if remaining <= 1e-12:
                return total
        return None
