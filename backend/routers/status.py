"""GET /api/status — live dashboard data."""

from fastapi import APIRouter, Depends

from middleware.auth import get_current_user
from models.database import StatusResponse, Session, Forecast, ForecastHour
from scheduler.control_loop import get_user_state, build_status_response, register_user_loop
from services.supabase_client import get_user_settings

router = APIRouter()


def get_sample_status(user_id: str) -> StatusResponse:
    """Return initial data before control loop has real data.

    Reads user settings from DB so persisted state (tessie_enabled, etc.)
    is reflected immediately on page load.
    """
    settings = get_user_settings(user_id)
    tessie_enabled = settings.get("tessie_enabled", "true").lower() == "true"
    charging_strategy = settings.get("charging_strategy", "departure")
    departure_time = settings.get("departure_time", "")
    target_soc = int(settings.get("target_soc", 80))
    ai_enabled = settings.get("ai_enabled", "false").lower() == "true"

    return StatusResponse(
        mode="Tessie Disconnected" if not tessie_enabled else "Waiting for data…",
        charger_status="not_connected",
        home_detection_method=None,
        solar_w=0,
        household_demand_w=0,
        grid_import_w=0,
        battery_soc=0,
        battery_w=0,
        solax_data_age_secs=0,
        tesla_soc=0,
        tesla_charging_amps=0,
        tesla_charging_kw=0,
        charge_port_connected=False,
        charging_state="Stopped",
        ai_enabled=ai_enabled,
        ai_status="standby",
        ai_recommended_amps=0,
        ai_reasoning="",
        ai_confidence="low",
        ai_trigger_reason="scheduled",
        ai_last_updated_secs=0,
        target_soc=target_soc,
        tessie_enabled=tessie_enabled,
        charging_strategy=charging_strategy,
        departure_time=departure_time,
        session=None,
        forecast=Forecast(
            sunrise="", sunset="", peak_window_start="",
            peak_window_end="", hours_until_sunset=0, hourly=[],
        ),
        grid_budget_total_kwh=float(settings.get("daily_grid_budget_kwh", 0)),
        grid_budget_used_kwh=0,
        grid_budget_pct=0,
    )


@router.get("/status", response_model=StatusResponse)
async def get_status(user: dict = Depends(get_current_user)):
    """Return current dashboard state.

    Uses real control loop data when available, falls back to sample data.
    Also ensures the user's control loop is registered.
    """
    user_id = user["id"]

    # Ensure control loop is running for this user
    register_user_loop(user_id)

    # Try real data from control loop
    state = get_user_state(user_id)
    if state and state.solax is not None:
        return build_status_response(state)

    # Fallback to sample data (before first control loop tick)
    return get_sample_status(user_id)
