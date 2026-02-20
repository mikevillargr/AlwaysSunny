"""Control endpoints — toggle optimization, manual amp override.

These endpoints send Tessie commands IMMEDIATELY for minimal latency.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException

from middleware.auth import get_current_user
from models.database import OptimizeToggle, AmpsOverride
from services.supabase_client import upsert_user_setting, get_user_settings, get_user_credentials
from services.tessie import set_charging_amps, start_charging, stop_charging

logger = logging.getLogger("alwayssunny.control")

router = APIRouter()


@router.post("/optimize/toggle")
async def toggle_optimization(
    body: OptimizeToggle,
    user: dict = Depends(get_current_user),
):
    """Enable or disable AI optimization. When AI is turned off, immediately
    revert to default_charging_amps and send the command to Tessie."""
    user_id = user["id"]
    upsert_user_setting(user_id, "ai_enabled", str(body.enabled).lower())

    # When AI is turned OFF, immediately send default amps to Tessie
    if not body.enabled:
        creds = get_user_credentials(user_id) or {}
        settings = get_user_settings(user_id)
        api_key = creds.get("tessie_api_key")
        vin = creds.get("tessie_vin")
        default_amps = int(settings.get("default_charging_amps", 8))

        if api_key and vin:
            try:
                if default_amps >= 5:
                    await set_charging_amps(api_key, vin, default_amps)
                    logger.info(f"[{user_id[:8]}] AI OFF → set default amps: {default_amps}A")
                else:
                    await stop_charging(api_key, vin)
                    logger.info(f"[{user_id[:8]}] AI OFF → stopped charging")
            except Exception as e:
                logger.error(f"[{user_id[:8]}] AI toggle Tessie command failed: {e}")

    # Update control loop state if it exists
    from scheduler.control_loop import get_user_state
    state = get_user_state(user_id)
    if state:
        state.ai_enabled = body.enabled

    return {"ai_enabled": body.enabled}


@router.post("/override/amps")
async def override_amps(
    body: AmpsOverride,
    user: dict = Depends(get_current_user),
):
    """Manually set charging amps — sends command to Tessie IMMEDIATELY.

    Validates range: 0-32A. Setting to 0 stops charging.
    Values 1-4 are invalid (Tesla minimum is 5A) — treated as stop.
    """
    if body.amps < 0 or body.amps > 32:
        raise HTTPException(status_code=400, detail="Amps must be between 0 and 32")

    user_id = user["id"]
    creds = get_user_credentials(user_id) or {}
    api_key = creds.get("tessie_api_key")
    vin = creds.get("tessie_vin")

    if not api_key or not vin:
        raise HTTPException(status_code=400, detail="Tessie credentials not configured")

    # Save the override to settings
    upsert_user_setting(user_id, "manual_amps_override", str(body.amps))

    # Send command to Tessie IMMEDIATELY
    try:
        if body.amps == 0 or (1 <= body.amps < 5):
            await stop_charging(api_key, vin)
            logger.info(f"[{user_id[:8]}] Manual override → stop charging")
        else:
            await set_charging_amps(api_key, vin, body.amps)
            logger.info(f"[{user_id[:8]}] Manual override → {body.amps}A")
    except Exception as e:
        logger.error(f"[{user_id[:8]}] Override Tessie command failed: {e}")
        raise HTTPException(status_code=502, detail=f"Tessie command failed: {str(e)}")

    # Update control loop state
    from scheduler.control_loop import get_user_state
    state = get_user_state(user_id)
    if state:
        state.last_amps_sent = body.amps

    return {"amps": body.amps, "status": "command_sent"}
