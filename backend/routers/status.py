"""GET /api/status — live dashboard data."""

from fastapi import APIRouter, Depends

from middleware.auth import get_current_user
from models.database import StatusResponse, Session, Forecast, ForecastHour
from scheduler.control_loop import get_user_state, build_status_response, register_user_loop

router = APIRouter()


def get_sample_status(user_id: str) -> StatusResponse:
    """Return sample data matching UI_SPEC.md for initial development."""
    return StatusResponse(
        mode="Solar Optimizing",
        charger_status="charging_at_home",
        home_detection_method="named_location",
        solar_w=2840,
        household_demand_w=880,
        grid_import_w=120,
        battery_soc=78,
        battery_w=-200,
        solax_data_age_secs=45,
        tesla_soc=58,
        tesla_charging_amps=12,
        tesla_charging_kw=2.9,
        charge_port_connected=True,
        charging_state="Charging",
        ai_enabled=True,
        ai_status="active",
        ai_recommended_amps=12,
        ai_reasoning="Peak solar in 45 min — holding moderate rate, will increase to 18A at 11am",
        ai_confidence="medium",
        ai_trigger_reason="scheduled",
        ai_last_updated_secs=120,
        session=Session(
            started_at="2026-02-20T09:14:00",
            elapsed_mins=84,
            kwh_added=8.4,
            solar_kwh=7.1,
            grid_kwh=1.3,
            solar_pct=85,
            saved_pesos=710,
        ),
        forecast=Forecast(
            sunrise="05:58",
            sunset="17:52",
            peak_window_start="10:00",
            peak_window_end="14:00",
            hours_until_sunset=4.2,
            hourly=[
                ForecastHour(hour="06:00", irradiance_wm2=120, expected_yield_w=580, cloud_cover_pct=20),
                ForecastHour(hour="07:00", irradiance_wm2=280, expected_yield_w=1360, cloud_cover_pct=25),
                ForecastHour(hour="08:00", irradiance_wm2=480, expected_yield_w=2340, cloud_cover_pct=30),
                ForecastHour(hour="09:00", irradiance_wm2=620, expected_yield_w=3020, cloud_cover_pct=35),
                ForecastHour(hour="10:00", irradiance_wm2=710, expected_yield_w=3460, cloud_cover_pct=20),
                ForecastHour(hour="11:00", irradiance_wm2=740, expected_yield_w=3610, cloud_cover_pct=15),
                ForecastHour(hour="12:00", irradiance_wm2=730, expected_yield_w=3560, cloud_cover_pct=15),
                ForecastHour(hour="13:00", irradiance_wm2=680, expected_yield_w=3310, cloud_cover_pct=20),
                ForecastHour(hour="14:00", irradiance_wm2=560, expected_yield_w=2730, cloud_cover_pct=40),
                ForecastHour(hour="15:00", irradiance_wm2=380, expected_yield_w=1850, cloud_cover_pct=55),
                ForecastHour(hour="16:00", irradiance_wm2=210, expected_yield_w=1020, cloud_cover_pct=60),
                ForecastHour(hour="17:00", irradiance_wm2=80, expected_yield_w=390, cloud_cover_pct=65),
            ],
        ),
        grid_budget_total_kwh=5.0,
        grid_budget_used_kwh=2.1,
        grid_budget_pct=42,
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
