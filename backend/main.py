"""AlwaysSunny — FastAPI backend entry point."""

import logging
logging.basicConfig(level=logging.INFO, format="%(message)s")

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import os

from config import get_settings
from routers import status, sessions, settings, control, health, credentials, debug, outlook, reports
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
    
    # Auto-register control loops for all users on startup
    # This ensures continuous monitoring even when users don't access the app
    import asyncio
    from services.ollama import warmup_model, ollama_health_monitor
    from scheduler.control_loop import register_user_loop
    from services.supabase_client import get_supabase_admin
    
    async def auto_register_users():
        await asyncio.sleep(2)  # Wait for scheduler to initialize
        try:
            sb = get_supabase_admin()
            # Get all users who have credentials (active users)
            result = sb.table("user_credentials").select("user_id").execute()
            if result.data:
                user_ids = list(set(row["user_id"] for row in result.data))
                for user_id in user_ids:
                    register_user_loop(user_id)
                print(f"[AlwaysSunny] Auto-registered {len(user_ids)} user control loop(s)")
        except Exception as e:
            print(f"[AlwaysSunny] Auto-registration failed: {e}")
    
    asyncio.create_task(auto_register_users())
    asyncio.create_task(warmup_model())
    asyncio.create_task(ollama_health_monitor())
    yield
    stop_scheduler()
    print("[AlwaysSunny] Shutting down backend...")


app = FastAPI(
    title="AlwaysSunny API",
    description="Solar EV charging optimizer backend",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — dev origins + production origins from ALLOWED_ORIGINS env
_dev_origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
]
_extra_origins = [
    o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_dev_origins + _extra_origins,
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
app.include_router(outlook.router, prefix="/api", tags=["outlook"])
app.include_router(reports.router, prefix="/api", tags=["reports"])


@app.get("/")
async def root():
    """Health check root endpoint."""
    return {"app": "AlwaysSunny", "version": "0.1.0", "status": "running"}



