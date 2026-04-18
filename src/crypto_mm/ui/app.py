from __future__ import annotations

import asyncio
import csv
import io
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from datetime import UTC, datetime
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

from crypto_mm.common.settings import settings
from crypto_mm.marketdata.coinbase_ws import MarketDataService

service = MarketDataService(settings=settings)
APP_ROOT = Path(__file__).resolve().parents[3]
FRONTEND_DIST = APP_ROOT / "frontend" / "dist"
FRONTEND_ASSETS = FRONTEND_DIST / "assets"
HTML_HEADERS = {"Cache-Control": "no-store, max-age=0"}


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


@app.get("/api/state/stream")
async def api_state_stream() -> StreamingResponse:
    async def event_stream() -> AsyncIterator[str]:
        async for snapshot in service.state_stream():
            if snapshot is None:
                yield ": keep-alive\n\n"
                continue
            yield f"data: {json.dumps(snapshot)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-store, max-age=0",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/export/fills.csv")
async def export_fills_csv() -> StreamingResponse:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["ts", "side", "price", "size", "notional_usd", "reason"])
    for fill in list(service.simulated_fills):
        price = float(fill["price"])
        size = float(fill["size"])
        writer.writerow(
            [
                fill.get("ts", ""),
                fill.get("side", ""),
                price,
                size,
                price * size,
                fill.get("reason", ""),
            ]
        )
    return _csv_response(buffer, f"fills_{_stamp()}.csv")


@app.get("/api/export/pnl.csv")
async def export_pnl_csv() -> StreamingResponse:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["ts", "equity_usd", "position_btc", "total_pnl_usd"])
    for point in list(service.portfolio_history):
        writer.writerow(
            [
                point.get("ts", ""),
                float(point.get("equity", 0.0)),
                float(point.get("position_btc", 0.0)),
                float(point.get("total_pnl", 0.0)),
            ]
        )
    return _csv_response(buffer, f"pnl_{_stamp()}.csv")


@app.get("/api/export/spreads.csv")
async def export_spreads_csv() -> StreamingResponse:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    depths = ["0.1 BTC", "1 BTC", "5 BTC", "10 BTC"]
    writer.writerow(["sample_index", *depths])
    history = service.spread_tracker.tail()
    if isinstance(history, dict):
        series = {depth: list(history.get(depth, [])) for depth in depths}
        max_len = max((len(values) for values in series.values()), default=0)
        for index in range(max_len):
            row: list[object] = [index]
            for depth in depths:
                values = series[depth]
                row.append(values[index] if index < len(values) else "")
            writer.writerow(row)
    return _csv_response(buffer, f"spreads_{_stamp()}.csv")


def _csv_response(buffer: io.StringIO, filename: str) -> StreamingResponse:
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _stamp() -> str:
    return datetime.now(tz=UTC).strftime("%Y%m%dT%H%M%SZ")


if FRONTEND_ASSETS.exists():
    app.mount(
        "/assets",
        StaticFiles(directory=FRONTEND_ASSETS),
        name="frontend-assets",
    )


@app.get("/", response_class=HTMLResponse, response_model=None)
async def home() -> Response:
    if FRONTEND_DIST.exists():
        return FileResponse(FRONTEND_DIST / "index.html", headers=HTML_HEADERS)
    return HTMLResponse(_fallback_html(), headers=HTML_HEADERS)


@app.get("/{path:path}", response_class=HTMLResponse, response_model=None)
async def spa_fallback(path: str) -> Response:
    if path.startswith("api/"):
        return HTMLResponse("Not Found", status_code=404)
    if FRONTEND_DIST.exists():
        candidate = FRONTEND_DIST / path
        if candidate.exists() and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html", headers=HTML_HEADERS)
    return HTMLResponse(_fallback_html(), headers=HTML_HEADERS)


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
