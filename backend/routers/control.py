"""Control endpoints — toggle optimization, manual amp override."""

from fastapi import APIRouter, Depends

from middleware.auth import get_current_user
from models.database import OptimizeToggle, AmpsOverride
from services.supabase_client import upsert_user_setting, get_user_settings

router = APIRouter()


@router.post("/optimize/toggle")
async def toggle_optimization(
    body: OptimizeToggle,
    user: dict = Depends(get_current_user),
):
    """Enable or disable AI optimization for the authenticated user."""
    upsert_user_setting(user["id"], "ai_enabled", str(body.enabled).lower())
    # TODO: Phase 2G — notify control loop of state change
    return {"ai_enabled": body.enabled}


@router.post("/override/amps")
async def override_amps(
    body: AmpsOverride,
    user: dict = Depends(get_current_user),
):
    """Manually set charging amps (only when AI is off).

    Validates range: 0-32A. Setting to 0 stops charging.
    """
    if body.amps < 0 or body.amps > 32:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Amps must be between 0 and 32")

    # Check if AI is currently enabled
    settings = get_user_settings(user["id"])
    ai_enabled = settings.get("ai_enabled", "true").lower() == "true"
    if ai_enabled:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=409,
            detail="Cannot manually override amps while AI optimization is active. Disable AI first.",
        )

    upsert_user_setting(user["id"], "manual_amps_override", str(body.amps))
    # TODO: Phase 2G — send command to Tesla via control loop
    return {"amps": body.amps, "status": "override_applied"}
