"""GET /api/health — service connection status."""

from fastapi import APIRouter, Depends

from middleware.auth import get_current_user
from models.database import HealthResponse, ServiceHealth
from services.supabase_client import get_user_credentials
from services.solax import test_solax_connection
from services.tessie import test_tessie_connection
from services.weather import test_weather_connection
from services.ollama import test_ollama_connection

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def get_health(user: dict = Depends(get_current_user)):
    """Check connectivity to all external services using user's stored credentials."""
    creds = get_user_credentials(user["id"])

    # Solax
    if creds and creds.get("solax_token_id") and creds.get("solax_dongle_sn"):
        ok, detail = await test_solax_connection(creds["solax_token_id"], creds["solax_dongle_sn"])
        solax = ServiceHealth(name="Solax Cloud", status="connected" if ok else "error", detail=detail)
    else:
        solax = ServiceHealth(name="Solax Cloud", status="disconnected", detail="Not configured")

    # Tessie
    if creds and creds.get("tessie_api_key") and creds.get("tessie_vin"):
        ok, detail = await test_tessie_connection(creds["tessie_api_key"], creds["tessie_vin"])
        tessie = ServiceHealth(name="Tessie (Tesla)", status="connected" if ok else "error", detail=detail)
    else:
        tessie = ServiceHealth(name="Tessie (Tesla)", status="disconnected", detail="Not configured")

    # Ollama
    ok, detail = await test_ollama_connection()
    ollama = ServiceHealth(name="Ollama AI", status="connected" if ok else "disconnected", detail=detail)

    # Open-Meteo (always available, no auth needed)
    ok, detail = await test_weather_connection()
    open_meteo = ServiceHealth(name="Open-Meteo", status="connected" if ok else "error", detail=detail)

    return HealthResponse(solax=solax, tessie=tessie, ollama=ollama, open_meteo=open_meteo)
