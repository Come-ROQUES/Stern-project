import pytest

from crypto_mm.analytics.spread import compute_depth_spreads
from crypto_mm.marketdata.orderbook import OrderBook


def test_compute_depth_spreads_returns_weighted_values() -> None:
    book = OrderBook()
    book.apply_snapshot(
        bids=[("100", "2"), ("99", "10")],
        asks=[("101", "2"), ("102", "10")],
    )

    spreads = compute_depth_spreads(book)

    assert spreads[0.1] == pytest.approx(1.0)
    assert spreads[1.0] == pytest.approx(1.0)
    assert spreads[5.0] == pytest.approx(2.2)
