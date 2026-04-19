import asyncio
from time import monotonic

import pytest

from crypto_mm.common.settings import Settings
from crypto_mm.marketdata.coinbase_ws import MarketDataService


def test_snapshot_bootstrap_exposes_mid_and_quote_immediately() -> None:
    service = MarketDataService(settings=Settings())

    asyncio.run(
        service._handle_l2_message(
            {
                "events": [
                    {
                        "type": "snapshot",
                        "updates": [
                            {"side": "bid", "price_level": "100000", "new_quantity": "1.25"},
                            {"side": "offer", "price_level": "100010", "new_quantity": "0.80"},
                        ],
                    }
                ]
            }
        )
    )

    assert service.order_book.best_bid() is not None
    assert service.order_book.best_ask() is not None
    assert service.order_book.mid_price() == pytest.approx(100005.0)
    assert service.market_maker.last_quote is not None
    assert service.market_maker.risk_status == "ok"


def test_state_snapshot_marks_quant_and_backtest_ready_after_first_point() -> None:
    service = MarketDataService(settings=Settings())
    service.order_book.apply_snapshot(
        bids=[("100000", "1.0")],
        asks=[("100010", "1.0")],
    )
    service.market_maker.update_quote(mid_price=100005.0, realized_vol_bps=0.0)
    service._maybe_record_mid(100005.0)
    service._record_live_snapshots(mid=100005.0, quote_active=True)

    snapshot = asyncio.run(service.state_snapshot())

    assert snapshot["mid_price"] == pytest.approx(100005.0)
    assert snapshot["quant_lab"]["readiness"] == "ready"
    assert snapshot["backtest_lite"]["status"] == "ready"


def test_fast_path_keeps_quote_fresh_while_analytics_are_throttled() -> None:
    service = MarketDataService(settings=Settings())
    service.order_book.apply_snapshot(
        bids=[("100000", "1.0")],
        asks=[("100010", "1.0")],
    )
    service._last_vol_bps = 7.0
    service._last_analytics_at = monotonic()
    service._last_mid_sample_at = monotonic()

    asyncio.run(service._handle_message({"channel": "noop"}))

    assert service.market_maker.last_quote is not None
    assert service.market_maker.last_vol_bps == pytest.approx(7.0)
    assert len(service.mid_history) == 0
