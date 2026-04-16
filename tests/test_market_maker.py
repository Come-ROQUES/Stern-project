from datetime import UTC, datetime

from crypto_mm.marketdata.models import PublicTrade
from crypto_mm.portfolio.ledger import PortfolioState
from crypto_mm.risk.limits import RiskLimits
from crypto_mm.strategy.market_maker import MarketMaker, MarketMakerConfig


def test_market_maker_simulates_fill_when_trade_hits_bid() -> None:
    portfolio = PortfolioState.bootstrap(initial_cash=1_000_000, trade_history_limit=20)
    maker = MarketMaker(
        config=MarketMakerConfig(
            base_quote_spread_bps=10.0,
            order_size_btc=0.1,
            position_skew_bps_per_btc=2.0,
        ),
        portfolio=portfolio,
        risk_limits=RiskLimits(max_notional_exposure=1_000_000, max_loss=100_000),
    )

    quote = maker.update_quote(mid_price=100.0)
    assert quote is not None

    fill = maker.maybe_fill(
        PublicTrade(
            side="sell",
            price=quote.bid_price - 0.01,
            size=0.2,
            ts=datetime.now(tz=UTC),
        )
    )

    assert fill is not None
    assert fill.side == "buy"
    assert portfolio.position_btc > 0

