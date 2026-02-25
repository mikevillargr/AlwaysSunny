"""User settings endpoints."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends

import logging

from middleware.auth import get_current_user
from models.database import SettingsUpdate, SettingsResponse
from services.supabase_client import get_user_settings, upsert_user_setting

logger = logging.getLogger(__name__)

# Settings that should trigger an immediate AI re-evaluation
AI_TRIGGER_SETTINGS = {
    "departure_time", "charging_strategy", "daily_grid_budget_kwh",
    "max_grid_import_w", "target_soc",
}

router = APIRouter()

# Default values for settings
DEFAULTS = {
    "target_soc": "80",
    "default_charging_amps": "8",
    "daily_grid_budget_kwh": "25.0",
    "max_grid_import_w": "7000",
    "tessie_enabled": "true",
    "electricity_rate": "10.83",
    "electricity_rate_updated_at": "",
    "home_lat": "",
    "home_lon": "",
    "telegram_chat_id": "",
    "timezone": "Asia/Manila",
    "notif_grid_budget": "true",
    "notif_session_complete": "true",
    "notif_ai_override": "false",
    "notif_rate_reminder": "true",
    "charging_strategy": "departure",
    "departure_time": "",
    "onboarding_complete": "false",
    "panel_capacity_w": "0",
    "has_home_battery": "false",
    "has_net_metering": "false",
    "currency_code": "PHP",
}


def _parse_bool(val: str) -> bool:
    return val.lower() in ("true", "1", "yes")


def _parse_optional_float(val: str) -> float | None:
    if not val:
        return None
    try:
        return float(val)
    except ValueError:
        return None


def _settings_dict_to_response(raw: dict) -> SettingsResponse:
    """Convert key-value settings dict to typed SettingsResponse."""
    merged = {**DEFAULTS, **raw}
    return SettingsResponse(
        target_soc=int(merged.get("target_soc", 80)),
        default_charging_amps=int(merged.get("default_charging_amps", 8)),
        daily_grid_budget_kwh=float(merged.get("daily_grid_budget_kwh", 5.0)),
        max_grid_import_w=float(merged.get("max_grid_import_w", 500)),
        electricity_rate=_parse_optional_float(merged.get("electricity_rate", "")),
        electricity_rate_updated_at=merged.get("electricity_rate_updated_at") or None,
        home_lat=_parse_optional_float(merged.get("home_lat", "")),
        home_lon=_parse_optional_float(merged.get("home_lon", "")),
        geofence_radius_m=int(merged.get("geofence_radius_m", 100)),
        location_name=merged.get("location_name") or None,
        telegram_chat_id=merged.get("telegram_chat_id") or None,
        timezone=merged.get("timezone", "Asia/Manila"),
        notif_grid_budget=_parse_bool(merged.get("notif_grid_budget", "true")),
        notif_session_complete=_parse_bool(merged.get("notif_session_complete", "true")),
        notif_ai_override=_parse_bool(merged.get("notif_ai_override", "false")),
        notif_rate_reminder=_parse_bool(merged.get("notif_rate_reminder", "true")),
        charging_strategy=merged.get("charging_strategy", "departure"),
        departure_time=merged.get("departure_time") or None,
        onboarding_complete=_parse_bool(merged.get("onboarding_complete", "false")),
        tessie_enabled=_parse_bool(merged.get("tessie_enabled", "true")),
        panel_capacity_w=int(merged.get("panel_capacity_w", 0)),
        has_home_battery=_parse_bool(merged.get("has_home_battery", "false")),
        has_net_metering=_parse_bool(merged.get("has_net_metering", "false")),
        currency_code=merged.get("currency_code", "PHP"),
    )


@router.get("/settings", response_model=SettingsResponse)
async def get_settings(user: dict = Depends(get_current_user)):
    """Get all settings for the authenticated user."""
    raw = get_user_settings(user["id"])
    return _settings_dict_to_response(raw)


@router.post("/settings", response_model=SettingsResponse)
async def update_settings(
    updates: SettingsUpdate,
    user: dict = Depends(get_current_user),
):
    """Update one or more settings for the authenticated user."""
    user_id = user["id"]
    now = datetime.now(timezone.utc).isoformat()

    # Only update fields that were explicitly provided
    for field, value in updates.model_dump(exclude_none=True).items():
        str_value = str(value).lower() if isinstance(value, bool) else str(value)
        upsert_user_setting(user_id, field, str_value)

        # Track when electricity_rate was last updated
        if field == "electricity_rate":
            upsert_user_setting(user_id, "electricity_rate_updated_at", now)

    # If any AI-relevant setting changed, force an immediate AI re-evaluation
    # by resetting last_ai_call so the next control loop tick triggers AI.
    changed_fields = set(updates.model_dump(exclude_none=True).keys())
    if changed_fields & AI_TRIGGER_SETTINGS:
        try:
            from scheduler.control_loop import get_user_state
            state = get_user_state(user_id)
            if state and state.ai_enabled:
                state.last_ai_call = 0
                logger.info(
                    f"[{user_id[:8]}] AI re-eval triggered by settings change: "
                    f"{changed_fields & AI_TRIGGER_SETTINGS}"
                )
        except Exception as e:
            logger.warning(f"[{user_id[:8]}] Failed to trigger AI re-eval: {e}")

    # Return full updated settings
    raw = get_user_settings(user_id)
    return _settings_dict_to_response(raw)
