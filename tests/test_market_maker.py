from datetime import UTC, datetime

from crypto_mm.marketdata.models import BookLevel, PublicTrade
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
            side="buy",
            price=quote.bid_price - 0.01,
            size=0.2,
            ts=datetime.now(tz=UTC),
        )
    )

    assert fill is not None
    assert fill.side == "buy"
    assert portfolio.position_btc > 0


def test_market_maker_realizes_positive_spread_on_bid_then_ask_roundtrip() -> None:
    portfolio = PortfolioState.bootstrap(initial_cash=1_000_000, trade_history_limit=20)
    maker = MarketMaker(
        config=MarketMakerConfig(
            base_quote_spread_bps=10.0,
            order_size_btc=0.1,
            position_skew_bps_per_btc=0.0,
        ),
        portfolio=portfolio,
        risk_limits=RiskLimits(max_notional_exposure=1_000_000, max_loss=100_000),
    )

    quote = maker.update_quote(mid_price=100.0)
    assert quote is not None

    bid_fill = maker.maybe_fill(
        PublicTrade(
            side="buy",
            price=quote.bid_price,
            size=0.1,
            ts=datetime.now(tz=UTC),
        )
    )
    assert bid_fill is not None
    assert bid_fill.side == "buy"

    quote = maker.update_quote(mid_price=100.0)
    assert quote is not None

    ask_fill = maker.maybe_fill(
        PublicTrade(
            side="sell",
            price=quote.ask_price,
            size=0.1,
            ts=datetime.now(tz=UTC),
        )
    )
    assert ask_fill is not None
    assert ask_fill.side == "sell"

    snapshot = portfolio.snapshot(mark_price=100.0)
    assert float(snapshot["position_btc"]) == 0.0
    assert float(snapshot["realized_pnl"]) > 0.0


def test_market_maker_anchors_quotes_to_touch_to_capture_real_spread() -> None:
    portfolio = PortfolioState.bootstrap(initial_cash=1_000_000, trade_history_limit=20)
    maker = MarketMaker(
        config=MarketMakerConfig(
            base_quote_spread_bps=10.0,
            order_size_btc=0.1,
            position_skew_bps_per_btc=0.0,
        ),
        portfolio=portfolio,
        risk_limits=RiskLimits(max_notional_exposure=1_000_000, max_loss=100_000),
    )

    quote = maker.update_quote(
        mid_price=100.005,
        best_bid=BookLevel(price=100.0, size=1.0),
        best_ask=BookLevel(price=100.01, size=1.0),
    )

    assert quote is not None
    assert quote.bid_price == 100.0
    assert quote.ask_price == 100.01


def test_market_maker_does_not_overfill_same_quote_side_without_requote() -> None:
    portfolio = PortfolioState.bootstrap(initial_cash=1_000_000, trade_history_limit=20)
    maker = MarketMaker(
        config=MarketMakerConfig(
            base_quote_spread_bps=10.0,
            order_size_btc=0.1,
            position_skew_bps_per_btc=0.0,
        ),
        portfolio=portfolio,
        risk_limits=RiskLimits(max_notional_exposure=1_000_000, max_loss=100_000),
    )

    quote = maker.update_quote(mid_price=100.0)
    assert quote is not None

    first_fill = maker.maybe_fill(
        PublicTrade(
            side="buy",
            price=quote.bid_price,
            size=0.1,
            ts=datetime.now(tz=UTC),
        )
    )
    second_fill = maker.maybe_fill(
        PublicTrade(
            side="buy",
            price=quote.bid_price,
            size=0.1,
            ts=datetime.now(tz=UTC),
        )
    )

    assert first_fill is not None
    assert second_fill is None


def test_market_maker_waits_for_queue_ahead_at_touch() -> None:
    portfolio = PortfolioState.bootstrap(initial_cash=1_000_000, trade_history_limit=20)
    maker = MarketMaker(
        config=MarketMakerConfig(
            base_quote_spread_bps=10.0,
            order_size_btc=0.1,
            position_skew_bps_per_btc=0.0,
        ),
        portfolio=portfolio,
        risk_limits=RiskLimits(max_notional_exposure=1_000_000, max_loss=100_000),
    )

    quote = maker.update_quote(
        mid_price=100.005,
        best_bid=BookLevel(price=100.0, size=0.2),
        best_ask=BookLevel(price=100.01, size=0.2),
    )
    assert quote is not None

    no_fill = maker.maybe_fill(
        PublicTrade(
            side="buy",
            price=100.0,
            size=0.1,
            ts=datetime.now(tz=UTC),
        )
    )
    fill = maker.maybe_fill(
        PublicTrade(
            side="buy",
            price=100.0,
            size=0.2,
            ts=datetime.now(tz=UTC),
        )
    )

    assert no_fill is None
    assert fill is not None
    assert fill.size == 0.1


def test_market_maker_turns_off_bid_when_long_inventory_reaches_soft_limit() -> None:
    portfolio = PortfolioState.bootstrap(initial_cash=1_000_000, trade_history_limit=20)
    portfolio.position_btc = 0.5
    portfolio.avg_entry_price = 100.0
    maker = MarketMaker(
        config=MarketMakerConfig(
            base_quote_spread_bps=10.0,
            order_size_btc=0.1,
            position_skew_bps_per_btc=0.0,
            inventory_soft_limit_btc=0.5,
        ),
        portfolio=portfolio,
        risk_limits=RiskLimits(max_notional_exposure=1_000_000, max_loss=100_000),
    )

    quote = maker.update_quote(
        mid_price=100.005,
        best_bid=BookLevel(price=100.0, size=1.0),
        best_ask=BookLevel(price=100.01, size=1.0),
    )

    assert quote is not None
    assert quote.bid_size == 0.0
    assert quote.ask_size == 0.1
