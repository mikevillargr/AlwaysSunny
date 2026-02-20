"""Pydantic models for API request/response schemas."""

from datetime import datetime
from pydantic import BaseModel
from typing import Optional


# ---------------------------------------------------------------------------
# Status response (matches frontend TypeScript StatusResponse)
# ---------------------------------------------------------------------------

class ForecastHour(BaseModel):
    hour: str
    irradiance_wm2: float
    expected_yield_w: float
    cloud_cover_pct: float
    temperature_c: float = 0.0


class Forecast(BaseModel):
    sunrise: str
    sunset: str
    peak_window_start: str
    peak_window_end: str
    hours_until_sunset: float
    hourly: list[ForecastHour]


class Session(BaseModel):
    started_at: str
    elapsed_mins: int
    kwh_added: float
    solar_kwh: float
    grid_kwh: float
    solar_pct: float
    saved_pesos: float


class StatusResponse(BaseModel):
    # Mode
    mode: str
    # Charger pill
    charger_status: str
    home_detection_method: Optional[str] = None
    # Live energy values (from Solax)
    solar_w: float
    household_demand_w: float
    grid_import_w: float
    battery_soc: int
    battery_w: float
    solax_data_age_secs: int
    # Tesla
    tesla_soc: int
    tesla_charging_amps: int
    tesla_charging_kw: float
    charge_port_connected: bool
    charging_state: str
    minutes_to_full_charge: int = 0
    # AI state
    ai_enabled: bool
    ai_status: str
    ai_recommended_amps: int
    ai_reasoning: str
    ai_confidence: str
    ai_trigger_reason: str
    ai_last_updated_secs: int
    # Target SoC
    target_soc: int = 80
    # Tessie connection
    tessie_enabled: bool = True
    # Charging strategy
    charging_strategy: str = "departure"
    departure_time: str = ""
    # Session (null if no active session)
    session: Optional[Session] = None
    # Forecast
    forecast: Forecast
    # Grid budget
    grid_budget_total_kwh: float
    grid_budget_used_kwh: float
    grid_budget_pct: float


# ---------------------------------------------------------------------------
# Session history
# ---------------------------------------------------------------------------

class SessionRecord(BaseModel):
    id: int
    started_at: str
    ended_at: Optional[str] = None
    duration_mins: Optional[int] = None
    kwh_added: Optional[float] = None
    solar_kwh: Optional[float] = None
    grid_kwh: Optional[float] = None
    solar_pct: Optional[float] = None
    saved_pesos: Optional[float] = None
    meralco_rate: Optional[float] = None
    start_soc: Optional[int] = None
    end_soc: Optional[int] = None
    target_soc: Optional[int] = None


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

class SettingsUpdate(BaseModel):
    target_soc: Optional[int] = None
    default_charging_amps: Optional[int] = None
    daily_grid_budget_kwh: Optional[float] = None
    max_grid_import_w: Optional[float] = None
    meralco_rate: Optional[float] = None
    home_lat: Optional[float] = None
    home_lon: Optional[float] = None
    telegram_chat_id: Optional[str] = None
    timezone: Optional[str] = None
    notif_grid_budget: Optional[bool] = None
    notif_session_complete: Optional[bool] = None
    notif_ai_override: Optional[bool] = None
    notif_rate_reminder: Optional[bool] = None
    charging_strategy: Optional[str] = None
    departure_time: Optional[str] = None
    tessie_enabled: Optional[bool] = None


class SettingsResponse(BaseModel):
    target_soc: int = 80
    default_charging_amps: int = 8
    daily_grid_budget_kwh: float = 25.0
    max_grid_import_w: float = 7000
    meralco_rate: Optional[float] = 10.83
    meralco_rate_updated_at: Optional[str] = None
    home_lat: Optional[float] = None
    home_lon: Optional[float] = None
    telegram_chat_id: Optional[str] = None
    timezone: str = "Asia/Manila"
    notif_grid_budget: bool = True
    notif_session_complete: bool = True
    notif_ai_override: bool = False
    notif_rate_reminder: bool = True
    charging_strategy: str = "departure"
    departure_time: Optional[str] = None
    onboarding_complete: bool = False
    tessie_enabled: bool = True


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

class ServiceHealth(BaseModel):
    name: str
    status: str  # "connected" | "disconnected" | "error"
    detail: str


class HealthResponse(BaseModel):
    solax: ServiceHealth
    tessie: ServiceHealth
    ollama: ServiceHealth
    open_meteo: ServiceHealth


# ---------------------------------------------------------------------------
# Control
# ---------------------------------------------------------------------------

class OptimizeToggle(BaseModel):
    enabled: bool


class AmpsOverride(BaseModel):
    amps: int


# ---------------------------------------------------------------------------
# User credentials (for onboarding)
# ---------------------------------------------------------------------------

class CredentialsUpdate(BaseModel):
    solax_token_id: Optional[str] = None
    solax_dongle_sn: Optional[str] = None
    tessie_api_key: Optional[str] = None
    tessie_vin: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None
