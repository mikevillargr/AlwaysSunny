"""APScheduler control loop — runs every 60-90s per active user.

Implements the rule-based charging optimization from SPEC.md and DATA_FLOWS.md.
"""

from __future__ import annotations

import asyncio
import time
import logging
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from services.solax import fetch_solax_data, SolaxData
from services.tessie import (
    fetch_tesla_state,
    fetch_tesla_location,
    set_charging_amps,
    start_charging,
    stop_charging,
    is_at_home_gps,
    TeslaState,
    TeslaLocation,
)
from services.weather import fetch_forecast, SolarForecast
from services.ollama import call_ollama, build_prompt, AIRecommendation
from services.session_tracker import SessionTracker
from services.supabase_client import (
    get_user_settings,
    get_user_credentials,
    save_snapshot,
    start_session as db_start_session,
    end_session as db_end_session,
)

logger = logging.getLogger("alwayssunny.control")


@dataclass
class UserLoopState:
    """In-memory state for one user's control loop."""

    user_id: str
    mode: str = "Suspended – Unplugged"
    ai_enabled: bool = True
    ai_status: str = "standby"

    # Latest data from external APIs
    solax: SolaxData | None = None
    tesla: TeslaState | None = None
    location: TeslaLocation | None = None
    forecast: SolarForecast | None = None
    ai_recommendation: AIRecommendation | None = None

    # Rolling average buffer (last 3 solar readings)
    solar_buffer: deque = field(default_factory=lambda: deque(maxlen=3))
    # Trend buffer (last 5 readings)
    trend_buffer: deque = field(default_factory=lambda: deque(maxlen=5))

    # Session tracker
    session_tracker: SessionTracker = field(default_factory=SessionTracker)

    # Timestamps
    last_solax_fetch: float = 0
    last_tessie_fetch: float = 0
    last_weather_fetch: float = 0
    last_ai_call: float = 0
    last_amps_sent: int = -1

    # Credentials (cached from DB)
    creds: dict = field(default_factory=dict)
    settings: dict = field(default_factory=dict)

    @property
    def solar_trend(self) -> str:
        """Compute short-term solar trend from last 5 readings."""
        if len(self.trend_buffer) < 3:
            return "unknown"
        current = self.trend_buffer[-1]
        avg = sum(self.trend_buffer) / len(self.trend_buffer)
        if avg == 0:
            return "stable"
        if current > avg * 1.10:
            return "rising"
        if current < avg * 0.90:
            return "falling"
        return "stable"

    @property
    def smoothed_available_w(self) -> float:
        """Rolling average of available-for-Tesla watts."""
        if not self.solar_buffer:
            return 0
        return sum(self.solar_buffer) / len(self.solar_buffer)


# Global registry of per-user loop states
_user_states: dict[str, UserLoopState] = {}
_scheduler: AsyncIOScheduler | None = None


def get_user_state(user_id: str) -> UserLoopState | None:
    """Get the current in-memory state for a user (used by /api/status)."""
    return _user_states.get(user_id)


async def _fetch_data(state: UserLoopState) -> bool:
    """Fetch latest data from Solax + Tessie. Returns False if critical data missing."""
    now = time.time()

    # Fetch Solax (every tick)
    try:
        if state.creds.get("solax_token_id") and state.creds.get("solax_dongle_sn"):
            state.solax = await fetch_solax_data(
                state.creds["solax_token_id"],
                state.creds["solax_dongle_sn"],
            )
            state.last_solax_fetch = now
        else:
            logger.warning(f"[{state.user_id[:8]}] Solax credentials not configured")
            return False
    except Exception as e:
        logger.error(f"[{state.user_id[:8]}] Solax fetch failed: {e}")
        if state.solax is None:
            return False

    # Fetch Tesla state (every tick)
    try:
        if state.creds.get("tessie_api_key") and state.creds.get("tessie_vin"):
            state.tesla = await fetch_tesla_state(
                state.creds["tessie_api_key"],
                state.creds["tessie_vin"],
            )
            state.last_tessie_fetch = now
        else:
            logger.warning(f"[{state.user_id[:8]}] Tessie credentials not configured")
            return False
    except Exception as e:
        logger.error(f"[{state.user_id[:8]}] Tessie fetch failed: {e}")
        if state.tesla is None:
            return False

    # Fetch location (every 5 minutes)
    if now - state.last_tessie_fetch > 300 or state.location is None:
        try:
            state.location = await fetch_tesla_location(
                state.creds["tessie_api_key"],
                state.creds["tessie_vin"],
            )
        except Exception as e:
            logger.error(f"[{state.user_id[:8]}] Location fetch failed: {e}")

    # Auto-populate home location from Tesla GPS if not set
    home_lat = float(state.settings.get("home_lat", 0))
    home_lon = float(state.settings.get("home_lon", 0))
    if (not home_lat or not home_lon) and state.location and state.location.is_at_home:
        home_lat = state.location.latitude
        home_lon = state.location.longitude
        if home_lat and home_lon:
            from services.supabase_client import upsert_user_setting
            upsert_user_setting(user_id, "home_lat", str(home_lat))
            upsert_user_setting(user_id, "home_lon", str(home_lon))
            state.settings["home_lat"] = str(home_lat)
            state.settings["home_lon"] = str(home_lon)
            logger.info(f"[{user_id[:8]}] Auto-set home location from Tesla GPS: {home_lat}, {home_lon}")

    # Fetch weather (every 60 minutes)
    if now - state.last_weather_fetch > 3600 or state.forecast is None:
        try:
            tz = state.settings.get("timezone", "Asia/Manila")
            if home_lat and home_lon:
                state.forecast = await fetch_forecast(home_lat, home_lon, tz)
                state.last_weather_fetch = now
        except Exception as e:
            logger.error(f"[{state.user_id[:8]}] Weather fetch failed: {e}")

    return True


def _check_home_detection(state: UserLoopState) -> tuple[bool, str, str | None]:
    """Two-layer home detection. Returns (at_home, charger_status, method)."""
    if not state.tesla or not state.tesla.charge_port_connected:
        return False, "not_connected", None

    # Layer 1: Named location from Tessie
    if state.location and state.location.saved_location:
        if state.location.is_at_home:
            return True, "charging_at_home", "named_location"
        else:
            return False, "charging_away", "named_location"

    # Layer 2: GPS proximity fallback
    home_lat = float(state.settings.get("home_lat", 0))
    home_lon = float(state.settings.get("home_lon", 0))
    if home_lat and home_lon and state.tesla:
        if is_at_home_gps(state.tesla.latitude, state.tesla.longitude, home_lat, home_lon):
            return True, "charging_at_home", "gps_proximity"
        else:
            return False, "charging_away", "gps_proximity"

    return False, "location_unknown", None


async def _maybe_call_ai(state: UserLoopState, trigger_reason: str) -> None:
    """Call Ollama AI if conditions are met (min 90s gap)."""
    now = time.time()
    if now - state.last_ai_call < 90:
        return

    if not state.solax or not state.tesla or not state.forecast:
        return

    try:
        grid_budget_total = float(state.settings.get("daily_grid_budget_kwh", 5.0))
        grid_used = state.session_tracker.active.grid_kwh if state.session_tracker.active else 0
        grid_remaining = max(0, grid_budget_total - grid_used)

        prompt = build_prompt(
            solar_w=state.solax.solar_w,
            household_w=state.solax.household_demand_w,
            grid_import_w=state.solax.grid_import_w,
            battery_soc=state.solax.battery_soc,
            tesla_soc=state.tesla.battery_level,
            target_soc=int(state.settings.get("target_soc", 80)),
            current_amps=state.tesla.charger_actual_current,
            grid_budget_remaining_kwh=grid_remaining,
            hours_until_sunset=state.forecast.hours_until_sunset(),
            irradiance_curve=state.forecast.build_irradiance_curve_for_ai(),
            trigger_reason=trigger_reason,
        )

        state.ai_recommendation = await call_ollama(prompt, trigger_reason)
        state.ai_status = "active"
        state.last_ai_call = now
        logger.info(
            f"[{state.user_id[:8]}] AI: {state.ai_recommendation.recommended_amps}A "
            f"({state.ai_recommendation.confidence}) — {state.ai_recommendation.reasoning[:60]}"
        )
    except Exception as e:
        state.ai_status = "fallback"
        logger.error(f"[{state.user_id[:8]}] AI call failed: {e}")


async def _control_tick(user_id: str) -> None:
    """Single control loop tick for one user."""
    state = _user_states.get(user_id)
    if not state:
        return

    # Refresh credentials and settings from DB periodically
    now = time.time()
    state.creds = get_user_credentials(user_id) or {}
    state.settings = get_user_settings(user_id)
    state.ai_enabled = state.settings.get("ai_enabled", "true").lower() == "true"

    # 1. Fetch external data
    data_ok = await _fetch_data(state)
    if not data_ok:
        state.mode = "Suspended – Data Unavailable"
        return

    solax = state.solax
    tesla = state.tesla

    # 2. Update buffers
    available_w = solax.solar_w - solax.household_demand_w
    state.solar_buffer.append(available_w)
    state.trend_buffer.append(solax.solar_w)

    # 3. Hard stops
    # Night check
    if state.forecast:
        try:
            now_time = datetime.now().strftime("%H:%M")
            sunrise = state.forecast.sunrise.split("T")[-1][:5] if "T" in state.forecast.sunrise else state.forecast.sunrise
            sunset = state.forecast.sunset.split("T")[-1][:5] if "T" in state.forecast.sunset else state.forecast.sunset
            if now_time >= sunset or now_time < sunrise:
                state.mode = "Suspended – Night"
                state.ai_status = "suspended_night"
                return
        except (ValueError, IndexError):
            pass

    # Plugged in check
    if not tesla.charge_port_connected:
        state.mode = "Suspended – Unplugged"
        return

    # Home detection
    at_home, charger_status, detection_method = _check_home_detection(state)
    if not at_home and charger_status != "not_connected":
        if charger_status == "charging_away":
            state.mode = "Suspended – Charging Away"
        else:
            state.mode = "Suspended – Location Unknown"
        state.ai_status = "suspended_away"
        return

    # Grid budget check
    grid_budget = float(state.settings.get("daily_grid_budget_kwh", 5.0))
    grid_used = state.session_tracker.active.grid_kwh if state.session_tracker.active else 0
    if grid_used >= grid_budget and grid_budget > 0:
        state.mode = "Cutoff – Grid Budget Reached"
        # TODO: send Telegram notification
        try:
            await stop_charging(state.creds["tessie_api_key"], state.creds["tessie_vin"])
        except Exception as e:
            logger.error(f"[{state.user_id[:8]}] Stop charging failed: {e}")
        return

    # 4. Compute rule-based target amps
    circuit_voltage = int(state.settings.get("circuit_voltage", 240))
    smoothed = state.smoothed_available_w
    target_amps = int(smoothed / circuit_voltage)
    target_amps = max(0, min(32, target_amps))

    if target_amps < 5 and target_amps > 0:
        target_amps = 0  # Never trickle below Tesla minimum

    # 5. AI evaluation (if enabled)
    if state.ai_enabled:
        # Check if AI call is needed
        ai_age = now - state.last_ai_call
        trigger = None
        if ai_age > 300:
            trigger = "scheduled"
        elif state.solar_trend != "stable" and ai_age > 90:
            trigger = "solar_shift"

        if trigger:
            await _maybe_call_ai(state, trigger)

        # Apply AI setpoint if fresh
        if (
            state.ai_recommendation
            and state.ai_recommendation.is_fresh
            and state.ai_recommendation.recommended_amps >= 0
        ):
            final_amps = state.ai_recommendation.recommended_amps
            state.mode = "Solar Optimizing"
        else:
            final_amps = target_amps
            state.mode = "Solar Optimizing"
            if state.ai_status == "active":
                state.ai_status = "fallback"
    else:
        final_amps = target_amps
        state.mode = "Manual Override" if final_amps > 0 else "Suspended – Unplugged"

    # 6. Send Tesla command (only if changed)
    try:
        api_key = state.creds["tessie_api_key"]
        vin = state.creds["tessie_vin"]

        if final_amps == 0 and tesla.charging_state == "Charging":
            await stop_charging(api_key, vin)
            state.last_amps_sent = 0
        elif final_amps >= 5 and tesla.charging_state != "Charging":
            await start_charging(api_key, vin)
            await set_charging_amps(api_key, vin, final_amps)
            state.last_amps_sent = final_amps
        elif final_amps >= 5 and final_amps != state.last_amps_sent:
            await set_charging_amps(api_key, vin, final_amps)
            state.last_amps_sent = final_amps
    except Exception as e:
        logger.error(f"[{state.user_id[:8]}] Tesla command failed: {e}")

    # 7. Session tracking
    meralco_rate = float(state.settings.get("meralco_rate", 10.83))
    event, data = state.session_tracker.tick(
        user_id=user_id,
        plugged_in=tesla.charge_port_connected,
        at_home=at_home,
        charging_state=tesla.charging_state,
        tesla_soc=tesla.battery_level,
        target_soc=int(state.settings.get("target_soc", 80)),
        consume_energy_kwh=solax.yield_today_kwh,  # Using yield as proxy
        meralco_rate=meralco_rate,
    )

    if event == "started" and data:
        result = db_start_session(user_id, data)
        if state.session_tracker.active and result.get("id"):
            state.session_tracker.active.db_session_id = result["id"]
    elif event == "ended" and data:
        db_id = data.pop("db_session_id", None)
        if db_id:
            db_end_session(db_id, data)

    # 8. Store snapshot
    try:
        snapshot = {
            "timestamp": datetime.now().isoformat(),
            "solar_w": solax.solar_w,
            "grid_w": solax.grid_import_w,
            "battery_soc": solax.battery_soc,
            "battery_w": solax.battery_w,
            "household_w": solax.household_demand_w,
            "tesla_amps": final_amps,
            "tesla_soc": tesla.battery_level,
            "ai_recommended_amps": state.ai_recommendation.recommended_amps if state.ai_recommendation else None,
            "ai_reasoning": state.ai_recommendation.reasoning if state.ai_recommendation else None,
            "ai_confidence": state.ai_recommendation.confidence if state.ai_recommendation else None,
            "mode": state.mode,
        }
        save_snapshot(user_id, snapshot)
    except Exception as e:
        logger.error(f"[{state.user_id[:8]}] Snapshot save failed: {e}")


def build_status_response(state: UserLoopState) -> dict:
    """Build the /api/status response from in-memory state."""
    solax = state.solax
    tesla = state.tesla
    ai = state.ai_recommendation
    forecast = state.forecast
    session = state.session_tracker.active

    at_home, charger_status, detection_method = _check_home_detection(state)

    return {
        "mode": state.mode,
        "charger_status": charger_status,
        "home_detection_method": detection_method,
        "solar_w": solax.solar_w if solax else 0,
        "household_demand_w": solax.household_demand_w if solax else 0,
        "grid_import_w": solax.grid_import_w if solax else 0,
        "battery_soc": solax.battery_soc if solax else 0,
        "battery_w": solax.battery_w if solax else 0,
        "solax_data_age_secs": solax.data_age_secs if solax else 999,
        "tesla_soc": tesla.battery_level if tesla else 0,
        "tesla_charging_amps": tesla.charger_actual_current if tesla else 0,
        "tesla_charging_kw": tesla.charging_kw if tesla else 0,
        "charge_port_connected": tesla.charge_port_connected if tesla else False,
        "charging_state": tesla.charging_state if tesla else "Disconnected",
        "ai_enabled": state.ai_enabled,
        "ai_status": state.ai_status,
        "ai_recommended_amps": ai.recommended_amps if ai else 0,
        "ai_reasoning": ai.reasoning if ai else "",
        "ai_confidence": ai.confidence if ai else "low",
        "ai_trigger_reason": ai.trigger_reason if ai else "scheduled",
        "ai_last_updated_secs": ai.age_secs if ai else 0,
        "session": session.to_api_dict() if session else None,
        "forecast": forecast.to_api_response() if forecast else {
            "sunrise": "", "sunset": "", "peak_window_start": "",
            "peak_window_end": "", "hours_until_sunset": 0, "hourly": [],
        },
        "grid_budget_total_kwh": float(state.settings.get("daily_grid_budget_kwh", 5.0)),
        "grid_budget_used_kwh": session.grid_kwh if session else 0,
        "grid_budget_pct": round(
            (session.grid_kwh / float(state.settings.get("daily_grid_budget_kwh", 5.0))) * 100, 1
        ) if session and float(state.settings.get("daily_grid_budget_kwh", 5.0)) > 0 else 0,
    }


# ---------------------------------------------------------------------------
# Scheduler management
# ---------------------------------------------------------------------------

def start_scheduler() -> AsyncIOScheduler:
    """Start the APScheduler instance."""
    global _scheduler
    _scheduler = AsyncIOScheduler()
    _scheduler.start()
    logger.info("[Scheduler] APScheduler started")
    return _scheduler


def stop_scheduler() -> None:
    """Stop the APScheduler instance."""
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        logger.info("[Scheduler] APScheduler stopped")
        _scheduler = None


def register_user_loop(user_id: str) -> None:
    """Register a control loop for a user (called on login or startup)."""
    global _scheduler
    if not _scheduler:
        return

    if user_id not in _user_states:
        _user_states[user_id] = UserLoopState(user_id=user_id)

    job_id = f"control_loop_{user_id}"
    if not _scheduler.get_job(job_id):
        _scheduler.add_job(
            _control_tick,
            "interval",
            seconds=60,
            args=[user_id],
            id=job_id,
            replace_existing=True,
        )
        logger.info(f"[Scheduler] Registered control loop for user {user_id[:8]}")


def unregister_user_loop(user_id: str) -> None:
    """Remove a user's control loop."""
    global _scheduler
    if _scheduler:
        job_id = f"control_loop_{user_id}"
        if _scheduler.get_job(job_id):
            _scheduler.remove_job(job_id)
    _user_states.pop(user_id, None)
    logger.info(f"[Scheduler] Unregistered control loop for user {user_id[:8]}")
