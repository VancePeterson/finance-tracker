from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import FRONTEND_DIST
from .db import connect, migrate
from .routes import (
    accounts,
    ask,
    budgets,
    categories,
    claude_auth,
    data_import,
    export,
    goals,
    rules,
    settings,
    simplefin,
    stats,
    sync,
    transactions,
)
from .scheduler import scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    conn = connect()
    try:
        migrate(conn)
    finally:
        conn.close()
    scheduler.start()
    try:
        yield
    finally:
        scheduler.stop()


app = FastAPI(title="finances-web", lifespan=lifespan)

# CORS: dev frontend runs at :5173, backend at :8765.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(accounts.router)
app.include_router(transactions.router)
app.include_router(categories.router)
app.include_router(rules.router)
app.include_router(stats.router)
app.include_router(sync.router)
app.include_router(claude_auth.router)
app.include_router(ask.router)
app.include_router(goals.router)
app.include_router(budgets.router)
app.include_router(settings.router)
app.include_router(export.router)
app.include_router(data_import.router)
app.include_router(simplefin.router)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


# Serve the built React app in production. In dev the frontend runs separately.
if FRONTEND_DIST.exists():
    app.mount(
        "/assets",
        StaticFiles(directory=FRONTEND_DIST / "assets"),
        name="assets",
    )

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        # Anything not under /api goes to index.html so client-side routing works.
        if full_path.startswith("api/"):
            return {"detail": "Not Found"}
        return FileResponse(FRONTEND_DIST / "index.html")
