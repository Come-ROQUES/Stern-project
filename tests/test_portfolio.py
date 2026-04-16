from datetime import UTC, datetime

from crypto_mm.marketdata.models import SimFill
from crypto_mm.portfolio.ledger import PortfolioState


def test_portfolio_tracks_realized_and_unrealized_pnl() -> None:
    portfolio = PortfolioState.bootstrap(initial_cash=1_000_000, trade_history_limit=10)
    now = datetime.now(tz=UTC)

    portfolio.apply_fill(SimFill(side="buy", price=100.0, size=1.0, ts=now, reason="test"))
    portfolio.apply_fill(SimFill(side="sell", price=110.0, size=0.4, ts=now, reason="test"))

    snapshot = portfolio.snapshot(mark_price=120.0)

    assert round(float(snapshot["position_btc"]), 4) == 0.6
    assert round(float(snapshot["realized_pnl"]), 4) == 4.0
    assert round(float(snapshot["unrealized_pnl"]), 4) == 12.0

