from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class BookLevel(BaseModel):
    price: float = Field(gt=0)
    size: float = Field(ge=0)


class PublicTrade(BaseModel):
    trade_id: int | None = None
    side: Literal["buy", "sell"]
    price: float = Field(gt=0)
    size: float = Field(gt=0)
    ts: datetime

    @field_validator("ts")
    @classmethod
    def ensure_tz(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)


class Quote(BaseModel):
    bid_price: float
    ask_price: float
    bid_size: float
    ask_size: float
    ts: datetime


class SimFill(BaseModel):
    side: Literal["buy", "sell"]
    price: float
    size: float
    ts: datetime
    reason: str

