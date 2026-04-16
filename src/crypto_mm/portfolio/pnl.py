from __future__ import annotations


def compute_unrealized_pnl(position_btc: float, avg_entry_price: float, mark_price: float) -> float:
    if abs(position_btc) < 1e-12:
        return 0.0
    return (mark_price - avg_entry_price) * position_btc


def compute_exposure_usd(position_btc: float, mark_price: float) -> float:
    return position_btc * mark_price

