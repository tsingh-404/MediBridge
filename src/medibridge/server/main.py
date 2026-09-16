"""FastAPI application — wraps the MediBridge agent + tools and serves the SPA."""
from __future__ import annotations

import mimetypes
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from medibridge.agent.graph import build_graph
from medibridge.server.routes import chat, clinics, coverage, insurers, mbs, profile
from medibridge.config import DB_PATH, ROOT_DIR, settings

WEB_DIR = ROOT_DIR / "ui"


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not DB_PATH.exists():
        raise RuntimeError(
            f"Database missing at {DB_PATH}. Run: python -m medibridge.data.ingest"
        )
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY not set (provide via .env or environment variable)")
    app.state.graph = build_graph()
    yield


app = FastAPI(title="MediBridge", lifespan=lifespan)

# The desktop web app is same-origin and unaffected. The Capacitor app loads its
# assets from a local scheme, so every API call is cross-origin and preflighted
# (the X-MB-Device header alone forces a preflight).
# Note: CapacitorHttp must stay disabled in the app — its native fetch buffers
# the whole body and breaks the /api/chat event stream.
CORS_ORIGINS = [o for o in os.environ.get("MEDIBRIDGE_CORS_ORIGINS", "").split(",") if o] or [
    "https://localhost",       # Capacitor Android (default androidScheme)
    "http://localhost",        # Capacitor Android if androidScheme is set to http
    "capacitor://localhost",   # Capacitor iOS
    "http://localhost:8100",   # dev live-reload
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    # Keep credentials off: no cookies are used, and it is what makes the
    # wildcard header list legal.
    allow_credentials=False,
)


@app.get("/api/health")
def health() -> dict:
    """Cheap liveness probe for Railway and the app's connectivity banner."""
    return {"ok": True, "db": DB_PATH.exists()}

api_routers = [
    insurers.router,
    profile.router,
    coverage.router,
    mbs.router,
    clinics.router,
    chat.router,
]
for r in api_routers:
    app.include_router(r, prefix="/api")


# StaticFiles guesses text/plain for these on Windows, where the registry has no
# entry for them. Harmless for @font-face, wrong for anything that sniffs.
mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("application/javascript", ".mjs")

if WEB_DIR.exists():
    app.mount("/", StaticFiles(directory=str(WEB_DIR), html=True), name="web")


def run() -> None:
    import uvicorn

    reload = os.environ.get("MEDIBRIDGE_RELOAD", "").lower() in ("1", "true")
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("medibridge.server.main:app", host="0.0.0.0", port=port, reload=reload)


if __name__ == "__main__":
    run()
