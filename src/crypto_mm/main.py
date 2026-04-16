from __future__ import annotations

import uvicorn

from crypto_mm.common.settings import settings
from crypto_mm.ui.app import app


def main() -> None:
    uvicorn.run(
        app,
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )


if __name__ == "__main__":
    main()

