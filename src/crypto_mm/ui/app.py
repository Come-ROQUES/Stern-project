from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles

from crypto_mm.common.settings import settings
from crypto_mm.marketdata.coinbase_ws import MarketDataService

service = MarketDataService(settings=settings)
APP_ROOT = Path(__file__).resolve().parents[3]
FRONTEND_DIST = APP_ROOT / "frontend" / "dist"
FRONTEND_ASSETS = FRONTEND_DIST / "assets"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    task = asyncio.create_task(service.run_forever())
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


app = FastAPI(title="Fractal Crypto Desk", lifespan=lifespan)


@app.get("/api/state")
async def api_state() -> dict[str, object]:
    return await service.state_snapshot()


if FRONTEND_ASSETS.exists():
    app.mount(
        "/assets",
        StaticFiles(directory=FRONTEND_ASSETS),
        name="frontend-assets",
    )


@app.get("/", response_class=HTMLResponse, response_model=None)
async def home() -> Response:
    if FRONTEND_DIST.exists():
        return FileResponse(FRONTEND_DIST / "index.html")
    return HTMLResponse(_fallback_html())


@app.get("/{path:path}", response_class=HTMLResponse, response_model=None)
async def spa_fallback(path: str) -> Response:
    if path.startswith("api/"):
        return HTMLResponse("Not Found", status_code=404)
    if FRONTEND_DIST.exists():
        candidate = FRONTEND_DIST / path
        if candidate.exists() and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
    return HTMLResponse(_fallback_html())


def _fallback_html() -> str:
    return """
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Fractal Crypto Desk</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #050510;
        color: #e8ebe8;
        font-family: "IBM Plex Sans", system-ui, sans-serif;
      }
      article {
        max-width: 720px;
        padding: 32px;
        border-radius: 20px;
        border: 1px solid rgba(0,255,136,0.12);
        background: rgba(10,14,24,0.92);
        box-shadow: 0 18px 40px rgba(0,0,0,0.35);
      }
      h1 {
        margin: 0 0 12px;
        letter-spacing: -0.04em;
      }
      p {
        color: #8a918a;
        line-height: 1.6;
      }
      code {
        color: #2ce3ff;
      }
    </style>
  </head>
  <body>
    <article>
      <h1>Frontend build missing</h1>
      <p>The React cockpit is not built yet. Run <code>npm --prefix frontend install</code> then <code>npm --prefix frontend run build</code>.</p>
    </article>
  </body>
</html>
"""
