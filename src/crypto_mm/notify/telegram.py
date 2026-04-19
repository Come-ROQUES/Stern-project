from __future__ import annotations

import asyncio
import logging

import httpx

logger = logging.getLogger(__name__)


class TelegramNotifier:
    """Opt-in Telegram sendMessage client.

    No-op when bot token or chat id is empty. Failures are logged and swallowed
    so a notification outage never stalls the market data loop.
    """

    def __init__(self, bot_token: str, chat_id: str) -> None:
        self._bot_token = bot_token.strip()
        self._chat_id = chat_id.strip()

    @property
    def enabled(self) -> bool:
        return bool(self._bot_token and self._chat_id)

    async def send(self, text: str) -> None:
        if not self.enabled:
            return
        url = f"https://api.telegram.org/bot{self._bot_token}/sendMessage"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(
                    url,
                    json={
                        "chat_id": self._chat_id,
                        "text": text,
                        "parse_mode": "Markdown",
                        "disable_web_page_preview": True,
                    },
                )
        except Exception:
            logger.warning("telegram notification failed", exc_info=True)

    def fire_and_forget(self, text: str) -> None:
        """Schedule a send without awaiting. Safe from sync call sites."""

        if not self.enabled:
            return
        try:
            asyncio.get_running_loop().create_task(self.send(text))
        except RuntimeError:
            # No running loop (e.g. called from a sync test). Drop the message.
            logger.debug("telegram notifier called without a running loop")
