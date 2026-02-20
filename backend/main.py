"""AlwaysSunny — FastAPI backend entry point."""

import logging
logging.basicConfig(level=logging.INFO, format="%(message)s")

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from routers import status, sessions, settings, control, health, credentials, debug
from scheduler.control_loop import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    settings_config = get_settings()
    print(f"[AlwaysSunny] Starting backend...")
    print(f"[AlwaysSunny] Supabase URL: {settings_config.supabase_url}")
    print(f"[AlwaysSunny] Ollama host: {settings_config.ollama_host}")
    start_scheduler()
    print("[AlwaysSunny] Control loop scheduler started")
    yield
    stop_scheduler()
    print("[AlwaysSunny] Shutting down backend...")


app = FastAPI(
    title="AlwaysSunny API",
    description="Solar EV charging optimizer backend",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(status.router, prefix="/api", tags=["status"])
app.include_router(sessions.router, prefix="/api", tags=["sessions"])
app.include_router(settings.router, prefix="/api", tags=["settings"])
app.include_router(control.router, prefix="/api", tags=["control"])
app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(credentials.router, prefix="/api", tags=["credentials"])
app.include_router(debug.router, prefix="/api", tags=["debug"])


@app.get("/")
async def root():
    """Health check root endpoint."""
    return {"app": "AlwaysSunny", "version": "0.1.0", "status": "running"}
