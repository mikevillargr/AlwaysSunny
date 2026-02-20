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
    get_active_session,
    upsert_user_setting,
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

    # Daily grid budget tracking
    daily_grid_start_kwh: float = 0.0  # consumeenergy snapshot at midnight
    daily_grid_date: str = ""  # YYYY-MM-DD of last reset

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
            upsert_user_setting(state.user_id, "home_lat", str(home_lat))
            upsert_user_setting(state.user_id, "home_lon", str(home_lon))
            state.settings["home_lat"] = str(home_lat)
            state.settings["home_lon"] = str(home_lon)
            logger.info(f"[{state.user_id[:8]}] Auto-set home location from Tesla GPS: {home_lat}, {home_lon}")

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
        grid_budget_total = float(state.settings.get("daily_grid_budget_kwh", 0))
        grid_used = state.session_tracker.active.grid_kwh if state.session_tracker.active else 0
        grid_remaining = max(0, grid_budget_total - grid_used)
        
        session = state.session_tracker.active
        session_elapsed_mins = int((time.time() - session.start_time) / 60) if session else 0
        session_kwh_added = session.kwh_added if session else 0.0
        session_solar_pct = session.solar_pct if session else 0.0

        prompt = build_prompt(
            solar_w=state.solax.solar_w,
            household_w=state.solax.household_demand_w,
            grid_import_w=state.solax.grid_import_w,
            battery_soc=state.solax.battery_soc,
            battery_w=state.solax.battery_w,
            tesla_soc=state.tesla.battery_level,
            target_soc=int(state.settings.get("target_soc", 80)),
            current_amps=state.tesla.charger_actual_current,
            grid_budget_remaining_kwh=grid_remaining,
            grid_budget_total_kwh=grid_budget_total,
            max_grid_import_w=float(state.settings.get("max_grid_import_w", 7000)),
            hours_until_sunset=state.forecast.hours_until_sunset(),
            irradiance_curve=state.forecast.build_irradiance_curve_for_ai(),
            trigger_reason=trigger_reason,
            charging_strategy=state.settings.get("charging_strategy", "departure"),
            departure_time=state.settings.get("departure_time", ""),
            solar_trend=state.solar_trend,
            session_elapsed_mins=session_elapsed_mins,
            session_kwh_added=session_kwh_added,
            session_solar_pct=session_solar_pct,
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


def _apply_grid_import_limit(
    target_amps: int,
    current_amps: int,
    grid_import_w: float,
    grid_import_limit_w: float,
    circuit_voltage: int,
    user_id: str,
) -> int:
    """Bidirectional grid import limit throttling.

    - If grid import > limit: reduce amps to bring import down
    - If grid import < limit * 0.8: increase amps to use headroom
    """
    if grid_import_w > grid_import_limit_w:
        # Over limit — reduce
        excess_w = grid_import_w - grid_import_limit_w
        reduce_by = max(1, int(excess_w / circuit_voltage))
        adjusted = max(0, current_amps - reduce_by)
        logger.info(
            f"[{user_id[:8]}] Grid {grid_import_w:.0f}W > limit {grid_import_limit_w:.0f}W "
            f"— reducing by {reduce_by}A → {adjusted}A"
        )
        return adjusted
    elif grid_import_w < grid_import_limit_w * 0.8:
        # Under limit with headroom — can increase toward target
        headroom_w = grid_import_limit_w - grid_import_w
        max_increase = int(headroom_w / circuit_voltage)
        adjusted = min(32, min(target_amps, current_amps + max(1, max_increase)))
        return adjusted
    else:
        # Near limit — hold steady
        return min(target_amps, current_amps) if current_amps > 0 else target_amps


async def _control_tick(user_id: str) -> None:
    """Single control loop tick for one user."""
    state = _user_states.get(user_id)
    if not state:
        return

    # Refresh credentials and settings from DB periodically
    now = time.time()
    state.creds = get_user_credentials(user_id) or {}
    state.settings = get_user_settings(user_id)
    state.ai_enabled = state.settings.get("ai_enabled", "false").lower() == "true"
    tessie_enabled = state.settings.get("tessie_enabled", "true").lower() == "true"

    # 1. Fetch external data
    data_ok = await _fetch_data(state)
    if not data_ok:
        state.mode = "Suspended – Data Unavailable"
        return

    solax = state.solax
    tesla = state.tesla

    # 2. Update trend buffers (always, for monitoring)
    state.trend_buffer.append(solax.solar_w)

    # 3. Hard stops — these are the ONLY conditions that should stop charging.
    #    Each one returns early. If none fire, charging continues undisturbed.

    # Plugged in check (must be first — everything else is irrelevant if unplugged)
    if not tesla.charge_port_connected:
        state.mode = "Suspended – Unplugged"
        return

    # Home detection
    at_home, charger_status, detection_method = _check_home_detection(state)
    if charger_status == "charging_away":
        state.mode = "Suspended – Charging Away"
        state.ai_status = "suspended_away"
        return
    # If location_unknown, assume home (don't block charging on missing GPS)
    if charger_status == "location_unknown":
        at_home = True
        logger.debug(f"[{state.user_id[:8]}] Location unknown — assuming home")

    # Daily grid budget tracking — uses consumeenergy (cumulative all-time kWh)
    # Snapshot persisted to DB so it survives backend restarts.
    today_str = datetime.now().strftime("%Y-%m-%d")

    # Load persisted snapshot if in-memory state is empty (e.g. after restart)
    if not state.daily_grid_date:
        saved_date = state.settings.get("_daily_grid_date", "")
        saved_start = state.settings.get("_daily_grid_start_kwh", "")
        if saved_date == today_str and saved_start:
            state.daily_grid_date = saved_date
            state.daily_grid_start_kwh = float(saved_start)
            logger.info(f"[{state.user_id[:8]}] Restored daily grid snapshot from DB: {state.daily_grid_start_kwh:.2f} kWh")

    # New day (or first ever run) — take a fresh snapshot
    if state.daily_grid_date != today_str:
        state.daily_grid_start_kwh = solax.consume_energy_kwh
        state.daily_grid_date = today_str
        # Persist to DB
        upsert_user_setting(user_id, "_daily_grid_date", today_str)
        upsert_user_setting(user_id, "_daily_grid_start_kwh", str(solax.consume_energy_kwh))
        logger.info(f"[{state.user_id[:8]}] Daily grid reset: start={solax.consume_energy_kwh:.2f} kWh (persisted)")

    daily_grid_used = max(0, solax.consume_energy_kwh - state.daily_grid_start_kwh)
    grid_budget = float(state.settings.get("daily_grid_budget_kwh", 0))
    grid_budget_remaining = max(0, grid_budget - daily_grid_used) if grid_budget > 0 else float('inf')

    if grid_budget > 0 and grid_budget_remaining <= 0:
        state.mode = "Cutoff – Grid Budget Reached"
        if tessie_enabled:
            try:
                await stop_charging(state.creds["tessie_api_key"], state.creds["tessie_vin"])
                logger.info(f"[{state.user_id[:8]}] HARD STOP: Daily grid budget exhausted ({daily_grid_used:.1f}/{grid_budget:.1f} kWh)")
            except Exception as e:
                logger.error(f"[{state.user_id[:8]}] Stop charging failed: {e}")
        return

    # --- Past this point, NO code path should call stop_charging(). ---

    # 4. Determine final amps
    #    Priority: manual_override > AI > rule-based throttling
    api_key = state.creds.get("tessie_api_key")
    vin = state.creds.get("tessie_vin")
    circuit_voltage = int(state.settings.get("circuit_voltage", 240))
    grid_import_limit_w = float(state.settings.get("max_grid_import_w", 0))
    manual_override = state.settings.get("manual_amps_override")
    final_amps = None

    # 4a. Manual override — user explicitly set amps via slider, respect it
    if manual_override is not None and not state.ai_enabled:
        final_amps = int(manual_override)
        state.mode = "Manual Override"
        logger.debug(f"[{state.user_id[:8]}] Manual override: {final_amps}A")

    # 4b. AI evaluation (if enabled and no manual override)
    elif state.ai_enabled:
        # Hard stops for AI: suspend after sunset or when solar yield is 0
        is_after_sunset = False
        if state.forecast:
            is_after_sunset = state.forecast.hours_until_sunset() <= 0
        
        solar_yield_zero = solax.solar_w <= 0
        
        if is_after_sunset:
            state.ai_status = "suspended_night"
            state.mode = "Suspended – Night"
            logger.debug(f"[{state.user_id[:8]}] AI suspended: after sunset")
            # Don't call AI, fall through to rule-based
        elif solar_yield_zero:
            state.ai_status = "suspended_no_solar"
            logger.debug(f"[{state.user_id[:8]}] AI suspended: zero solar yield")
            # Don't call AI, fall through to rule-based
        else:
            # AI is active — evaluate triggers
            ai_age = now - state.last_ai_call
            trigger = None
            
            # Baseline: scheduled 5-min interval
            if ai_age > 300:
                trigger = "scheduled"
            
            # Event triggers (with 90s minimum gap to prevent hammering)
            elif ai_age > 90:
                # Solar trend shift
                if state.solar_trend != "stable":
                    trigger = "solar_shift"
                
                # SoC threshold: 75% or 95% of gap closed
                target_soc = int(state.settings.get("target_soc", 100))
                soc_gap = max(0, target_soc - tesla.battery_level)
                soc_progress = 0 if target_soc == tesla.battery_level else (100 - soc_gap) / 100.0
                if soc_progress >= 0.75 and not hasattr(state, '_soc_75_triggered'):
                    trigger = "soc_threshold"
                    state._soc_75_triggered = True
                elif soc_progress >= 0.95 and not hasattr(state, '_soc_95_triggered'):
                    trigger = "soc_threshold"
                    state._soc_95_triggered = True
                
                # Budget warning: 80% or 95% of daily limit
                grid_budget_total = float(state.settings.get("daily_grid_budget_kwh", 0))
                if grid_budget_total > 0:
                    grid_used = (solax.consume_energy_kwh - state.daily_grid_start_kwh) if state.daily_grid_date else 0
                    budget_pct = (grid_used / grid_budget_total) if grid_budget_total > 0 else 0
                    if budget_pct >= 0.80 and not hasattr(state, '_budget_80_triggered'):
                        trigger = "budget_warning"
                        state._budget_80_triggered = True
                    elif budget_pct >= 0.95 and not hasattr(state, '_budget_95_triggered'):
                        trigger = "budget_warning"
                        state._budget_95_triggered = True
                
                # Departure urgency: < 60 min away and SoC < target
                departure_time_str = state.settings.get("departure_time", "")
                if departure_time_str and soc_gap > 0:
                    try:
                        from datetime import datetime
                        now_dt = datetime.now()
                        dep_h, dep_m = departure_time_str.split(":")[:2]
                        dep_dt = now_dt.replace(hour=int(dep_h), minute=int(dep_m), second=0)
                        if dep_dt <= now_dt:
                            dep_dt = dep_dt.replace(day=dep_dt.day + 1)
                        mins_until_departure = (dep_dt - now_dt).total_seconds() / 60
                        if mins_until_departure < 60 and not hasattr(state, '_departure_triggered'):
                            trigger = "departure_soon"
                            state._departure_triggered = True
                    except (ValueError, IndexError):
                        pass
            
            # Stale recommendation: > 6 min old
            if ai_age > 360:
                trigger = "stale"
            
            if trigger:
                await _maybe_call_ai(state, trigger)

            if (
                state.ai_recommendation
                and state.ai_recommendation.is_fresh
                and state.ai_recommendation.recommended_amps >= 0
            ):
                # AI has full control — use its recommendation as final setpoint
                # Skip grid import limit throttling and rule-based strategies
                # AI already receives max_grid_import_w, charging_strategy, and all constraints in prompt
                final_amps = state.ai_recommendation.recommended_amps
                state.mode = "AI Optimizing"
                logger.debug(
                    f"[{state.user_id[:8]}] AI control: {final_amps}A "
                    f"({state.ai_recommendation.confidence}) — {state.ai_recommendation.reasoning[:40]}"
                )
            else:
                # AI enabled but no fresh recommendation — fall through to rule-based
                state.ai_status = "fallback"
                logger.debug(f"[{state.user_id[:8]}] AI stale/unavailable — using rule-based fallback")

    # 4c. Strategy-based charging (fallback when no manual override or AI)
    charging_strategy = state.settings.get("charging_strategy", "departure")
    current_amps = tesla.charger_actual_current

    if final_amps is None:
        # If both grid budget and grid import limit are disabled (0),
        # don't throttle — let Tesla charge at whatever it's doing.
        if grid_budget <= 0 and grid_import_limit_w <= 0:
            state.mode = "Charging – No Limits"
            final_amps = -1  # sentinel: don't send any command
            logger.debug(f"[{state.user_id[:8]}] No budget/limit set — not interfering")

        elif charging_strategy == "solar":
            # === SOLAR-FIRST STRATEGY ===
            # Only charge from solar surplus. Pause when no surplus.
            solar_surplus_w = solax.solar_w - solax.household_demand_w
            state.solar_buffer.append(solar_surplus_w)
            smoothed = state.smoothed_available_w
            target_amps = int(smoothed / circuit_voltage)
            target_amps = max(0, min(32, target_amps))

            # Apply grid import limit as ceiling
            if grid_import_limit_w > 0:
                target_amps = _apply_grid_import_limit(
                    target_amps, current_amps, solax.grid_import_w,
                    grid_import_limit_w, circuit_voltage, state.user_id
                )

            if target_amps < 5 and target_amps > 0:
                target_amps = 0  # Solar-first: pause, don't trickle

            final_amps = target_amps
            state.mode = "Solar-first" if final_amps >= 5 else "Solar-first – Waiting"
            logger.debug(
                f"[{state.user_id[:8]}] Solar-first: surplus={solar_surplus_w:.0f}W → {final_amps}A"
            )

        else:
            # === READY BY DEPARTURE STRATEGY ===
            # Ensure target SoC by departure time, allow grid draw.
            departure_time_str = state.settings.get("departure_time", "")
            target_soc = int(state.settings.get("target_soc", 100))
            soc_gap = max(0, target_soc - tesla.battery_level)
            battery_capacity = float(state.settings.get("battery_capacity_kwh", 75.0))
            kwh_needed = (soc_gap / 100.0) * battery_capacity

            # Calculate minimum amps needed to reach target by departure
            min_amps_for_departure = 0
            departure_status = "on_track"
            if departure_time_str and soc_gap > 0:
                try:
                    now_dt = datetime.now()
                    dep_h, dep_m = departure_time_str.split(":")[:2]
                    dep_dt = now_dt.replace(hour=int(dep_h), minute=int(dep_m), second=0)
                    if dep_dt <= now_dt:
                        dep_dt = dep_dt.replace(day=dep_dt.day + 1)  # tomorrow
                    hours_remaining = (dep_dt - now_dt).total_seconds() / 3600
                    if hours_remaining > 0:
                        min_kw = kwh_needed / hours_remaining
                        min_amps_for_departure = int(min_kw * 1000 / circuit_voltage)
                        if min_amps_for_departure > 32:
                            departure_status = "may_not_reach"
                        elif min_amps_for_departure < 5:
                            min_amps_for_departure = 0  # plenty of time
                    else:
                        departure_status = "passed"
                        min_amps_for_departure = 32  # charge at max
                except (ValueError, IndexError):
                    pass

            # Start with solar surplus calculation
            solar_surplus_w = solax.solar_w - solax.household_demand_w
            grid_allowance_w = grid_import_limit_w if grid_budget_remaining > 0 else 0
            available_w = solar_surplus_w + grid_allowance_w
            state.solar_buffer.append(available_w)
            smoothed = state.smoothed_available_w
            target_amps = int(smoothed / circuit_voltage)
            target_amps = max(0, min(32, target_amps))

            # Ensure at least min_amps_for_departure
            if min_amps_for_departure > target_amps:
                target_amps = min(32, min_amps_for_departure)

            # Apply grid import limit as ceiling (but departure urgency can override)
            if grid_import_limit_w > 0 and departure_status != "passed":
                target_amps = _apply_grid_import_limit(
                    target_amps, current_amps, solax.grid_import_w,
                    grid_import_limit_w, circuit_voltage, state.user_id
                )

            if target_amps < 5 and target_amps > 0:
                target_amps = 5  # Departure mode: keep charging at minimum

            final_amps = target_amps
            if soc_gap <= 0:
                state.mode = "Target SoC Reached"
            elif departure_status == "passed":
                state.mode = "Departure Passed – Max Charge"
            elif departure_status == "may_not_reach":
                state.mode = "Ready by Departure – Urgent"
            else:
                state.mode = "Ready by Departure"
            logger.debug(
                f"[{state.user_id[:8]}] Departure: gap={soc_gap}% need={kwh_needed:.1f}kWh "
                f"min_amps={min_amps_for_departure} → {final_amps}A ({departure_status})"
            )

    # 5. Send Tesla command (only if tessie_enabled and we have a definite setpoint)
    if not tessie_enabled:
        state.mode = "Tessie Disconnected"
        logger.debug(f"[{state.user_id[:8]}] Tessie disabled — skipping commands")
    elif final_amps >= 0 and api_key and vin:
        try:
            if final_amps == 0 and tesla.charging_state == "Charging":
                # Rule-based says 0 — but only stop if we're actively managing
                # (i.e., grid budget or import limit is set)
                if grid_budget > 0 or grid_import_limit_w > 0:
                    await stop_charging(api_key, vin)
                    state.last_amps_sent = 0
                    logger.info(f"[{state.user_id[:8]}] Rule-based → stop (0A, limits active)")
                else:
                    logger.debug(f"[{state.user_id[:8]}] Rule-based 0A but no limits — not stopping")
            elif final_amps >= 5 and tesla.charging_state != "Charging":
                await start_charging(api_key, vin)
                await set_charging_amps(api_key, vin, final_amps)
                state.last_amps_sent = final_amps
                logger.info(f"[{state.user_id[:8]}] Start charging at {final_amps}A")
            elif final_amps >= 5 and final_amps != state.last_amps_sent:
                await set_charging_amps(api_key, vin, final_amps)
                state.last_amps_sent = final_amps
                logger.info(f"[{state.user_id[:8]}] Set amps: {final_amps}A")
        except Exception as e:
            logger.error(f"[{state.user_id[:8]}] Tesla command failed: {e}")

    # 7. Session tracking — recover from DB on restart if car is already plugged in
    meralco_rate = float(state.settings.get("meralco_rate", 10.83))
    if not state.session_tracker._recovered and tesla.charge_port_connected:
        db_active = get_active_session(user_id)
        if db_active:
            # Restore persisted start_grid_kwh from settings
            saved_start_grid = state.settings.get("_session_start_grid_kwh", "")
            if saved_start_grid:
                start_grid_kwh = float(saved_start_grid)
            else:
                # No persisted value — use current (grid_kwh will be 0 until next session)
                start_grid_kwh = solax.consume_energy_kwh
                logger.warning(f"[{state.user_id[:8]}] No persisted start_grid_kwh — using current value")
            state.session_tracker.recover_from_db(db_active, start_grid_kwh, meralco_rate)
            logger.info(f"[{state.user_id[:8]}] Recovered session #{db_active['id']}, start_grid_kwh={start_grid_kwh:.2f}")
        else:
            state.session_tracker._recovered = True  # No DB session to recover

    event, data = state.session_tracker.tick(
        user_id=user_id,
        plugged_in=tesla.charge_port_connected,
        at_home=at_home,
        charging_state=tesla.charging_state,
        tesla_soc=tesla.battery_level,
        target_soc=int(state.settings.get("target_soc", 100)),
        consume_energy_kwh=solax.consume_energy_kwh,
        meralco_rate=meralco_rate,
        charge_energy_added=tesla.charge_energy_added,
    )

    if event == "started" and data:
        # Persist start_grid_kwh so it survives restarts
        upsert_user_setting(user_id, "_session_start_grid_kwh", str(solax.consume_energy_kwh))
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
        "target_soc": int(state.settings.get("target_soc", 100)),
        "tessie_enabled": state.settings.get("tessie_enabled", "true").lower() == "true",
        "charging_strategy": state.settings.get("charging_strategy", "departure"),
        "departure_time": state.settings.get("departure_time", ""),
        "grid_budget_total_kwh": float(state.settings.get("daily_grid_budget_kwh", 0)),
        "grid_budget_used_kwh": round(
            max(0, (state.solax.consume_energy_kwh if state.solax else 0) - state.daily_grid_start_kwh), 1
        ) if state.daily_grid_date else 0,
        "grid_budget_pct": round(
            (max(0, (state.solax.consume_energy_kwh if state.solax else 0) - state.daily_grid_start_kwh)
             / float(state.settings.get("daily_grid_budget_kwh", 0))) * 100, 1
        ) if state.daily_grid_date and float(state.settings.get("daily_grid_budget_kwh", 0)) > 0 else 0,
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
            next_run_time=datetime.now(),  # Fire immediately on first registration
        )
        logger.info(f"[Scheduler] Registered control loop for user {user_id[:8]} (immediate first tick)")


def unregister_user_loop(user_id: str) -> None:
    """Remove a user's control loop."""
    global _scheduler
    if _scheduler:
        job_id = f"control_loop_{user_id}"
        if _scheduler.get_job(job_id):
            _scheduler.remove_job(job_id)
    _user_states.pop(user_id, None)
    logger.info(f"[Scheduler] Unregistered control loop for user {user_id[:8]}")
