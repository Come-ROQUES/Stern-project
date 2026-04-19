from __future__ import annotations

from typing import Any

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    debug: bool = True
    host: str = "0.0.0.0"
    port: int = 8015
    product_id: str = "BTC-USD"
    ws_url: str = "wss://advanced-trade-ws.coinbase.com"
    initial_cash: float = 1_000_000.0
    max_notional_exposure: float = 1_000_000.0
    max_loss: float = 100_000.0
    # Demo-friendly defaults: tight enough to illustrate fills on BTC-USD while
    # still remaining a simple mid-price market-making exercise.
    base_quote_spread_bps: float = 1.5
    order_size_btc: float = 0.1
    position_skew_bps_per_btc: float = 2.0
    vol_adaptive_gain: float = 0.15
    vol_adaptive_cap_bps: float = 3.0
    trade_history_limit: int = 200

    @field_validator("debug", mode="before")
    @classmethod
    def _coerce_debug(cls, value: Any) -> Any:
        if not isinstance(value, str):
            return value
        return value.strip().lower() in {"1", "true", "yes", "on", "debug", "dev"}

    model_config = SettingsConfigDict(
        env_prefix="CRYPTO_MM_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
