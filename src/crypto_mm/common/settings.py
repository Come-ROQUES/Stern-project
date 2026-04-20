from __future__ import annotations

from typing import Any

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables and `.env`."""

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
    base_quote_spread_bps: float = 8.0
    order_size_btc: float = 0.1
    position_skew_bps_per_btc: float = 2.0
    vol_adaptive_gain: float = 1.0
    vol_adaptive_cap_bps: float = 20.0
    trade_history_limit: int = 200
    # Optional Telegram alerts. Disabled when either field is empty.
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    @field_validator("debug", mode="before")
    @classmethod
    def _coerce_debug(cls, value: Any) -> Any:
        """Accept common truthy strings for local development toggles."""

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
