from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class BookLevel(BaseModel):
    """One visible price level in the order book."""

    price: float = Field(gt=0)
    size: float = Field(ge=0)


class PublicTrade(BaseModel):
    """Normalized public trade received from the exchange feed."""

    trade_id: int | None = None
    side: Literal["buy", "sell"]
    price: float = Field(gt=0)
    size: float = Field(gt=0)
    ts: datetime

    @field_validator("ts")
    @classmethod
    def ensure_tz(cls, value: datetime) -> datetime:
        """Normalize timestamps to UTC for consistent downstream processing."""

        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)


class Quote(BaseModel):
    """Synthetic two-sided quote produced by the market maker."""

    bid_price: float
    ask_price: float
    bid_size: float
    ask_size: float
    ts: datetime


class SimFill(BaseModel):
    """Simulated execution generated when the public tape crosses a quote."""

    side: Literal["buy", "sell"]
    price: float
    size: float
    ts: datetime
    reason: str
