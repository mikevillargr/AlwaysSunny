"""Admin endpoints for AI testing and sensitivity settings."""

from __future__ import annotations

import time
import logging
from pydantic import BaseModel
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException

from middleware.auth import get_admin_user
from config import get_settings
from services.ollama import build_prompt, call_ollama
from services.supabase_client import get_user_settings, upsert_user_setting

logger = logging.getLogger(__name__)

router = APIRouter()


class AITestRequest(BaseModel):
    """Mock data for AI pipeline dry run. All fields optional with sunny midday defaults."""
    solar_w: float = 2800
    household_w: float = 900
    grid_import_w: float = 150
    battery_soc: int = 65
    battery_w: float = -200
    tesla_soc: int = 55
    target_soc: int = 80
    current_amps: int = 10
    charging_strategy: str = "solar"
    departure_time: str = ""
    grid_budget_total_kwh: float = 25
    grid_budget_used_kwh: float = 5
    max_grid_import_w: float = 7000
    solar_trend: str = "rising"
    session_elapsed_mins: int = 45
    session_kwh_added: float = 3.2
    session_solar_pct: float = 82.0
    hours_until_sunset: float = 5.5
    irradiance_curve: str = (
        "13:00 | 820 W/m² | 2600W | 15% cloud\n"
        "14:00 | 750 W/m² | 2400W | 20% cloud\n"
        "15:00 | 580 W/m² | 1850W | 25% cloud\n"
        "16:00 | 350 W/m² | 1100W | 30% cloud\n"
        "17:00 | 120 W/m² | 380W  | 40% cloud"
    )


@router.post("/debug/ai-test")
async def ai_pipeline_test(
    body: AITestRequest = AITestRequest(),
    admin: dict = Depends(get_admin_user),
):
    """Full AI pipeline dry run with mock data.

    Returns all 5 pipeline stages:
    1. Prompt sent to Ollama
    2. Raw Ollama response
    3. Parsed recommendation
    4. Simulated Tessie command (DRY RUN)
    5. User-facing message as it would appear in the AI banner
    """
    settings = get_settings()
    grid_remaining = max(0, body.grid_budget_total_kwh - body.grid_budget_used_kwh)

    # 1. Build prompt
    prompt = build_prompt(
        solar_w=body.solar_w,
        household_w=body.household_w,
        grid_import_w=body.grid_import_w,
        battery_soc=body.battery_soc,
        battery_w=body.battery_w,
        tesla_soc=body.tesla_soc,
        target_soc=body.target_soc,
        current_amps=body.current_amps,
        grid_budget_remaining_kwh=grid_remaining,
        grid_budget_total_kwh=body.grid_budget_total_kwh,
        max_grid_import_w=body.max_grid_import_w,
        hours_until_sunset=body.hours_until_sunset,
        irradiance_curve=body.irradiance_curve,
        trigger_reason="manual_test",
        charging_strategy=body.charging_strategy,
        departure_time=body.departure_time,
        solar_trend=body.solar_trend,
        session_elapsed_mins=body.session_elapsed_mins,
        session_kwh_added=body.session_kwh_added,
        session_solar_pct=body.session_solar_pct,
    )

    # 2. Call Ollama
    start = time.time()
    try:
        recommendation = await call_ollama(prompt, trigger_reason="manual_test")
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        logger.error(f"Ollama call failed: {type(e).__name__}: {e}\n{tb}")
        raise HTTPException(status_code=502, detail=f"Ollama call failed: {type(e).__name__}: {str(e)}")
    elapsed = round(time.time() - start, 2)

    # 3. Determine simulated Tessie command
    amps = recommendation.recommended_amps
    if amps == 0 or (1 <= amps < 5):
        tessie_action = "stop_charging"
        tessie_amps = 0
    else:
        tessie_action = "set_charging_amps"
        tessie_amps = amps

    return {
        "pipeline": {
            "1_prompt_sent": prompt,
            "2_ollama_raw_response": recommendation.raw.get("response", ""),
            "3_parsed_recommendation": {
                "recommended_amps": recommendation.recommended_amps,
                "reasoning": recommendation.reasoning,
                "confidence": recommendation.confidence,
            },
            "4_tessie_command": {
                "action": tessie_action,
                "amps": tessie_amps,
                "endpoint": f"POST https://api.tessie.com/{{vin}}/command/{tessie_action}",
                "note": "DRY RUN — no command sent to Tesla",
            },
            "5_user_facing_message": {
                "banner_text": recommendation.reasoning,
                "confidence_badge": recommendation.confidence,
                "mode": "AI Optimizing",
                "recommended_amps_display": f"{recommendation.recommended_amps}A",
            },
        },
        "timing": {
            "ollama_response_secs": elapsed,
            "model": settings.ollama_model,
            "host": settings.ollama_host,
        },
    }


# --- AI Sensitivity Settings ---

AI_SETTING_KEYS = [
    "ai_model",
    "ai_temperature",
    "ai_max_tokens",
    "ai_min_solar_surplus_w",
    "ai_min_amps",
    "ai_max_amps",
    "ai_call_interval_secs",
    "ai_stale_threshold_secs",
    "ai_retry_attempts",
    "ai_prompt_style",
]

AI_SETTING_DEFAULTS = {
    "ai_model": "qwen2.5:7b",
    "ai_temperature": "0.1",
    "ai_max_tokens": "150",
    "ai_min_solar_surplus_w": "0",
    "ai_min_amps": "5",
    "ai_max_amps": "32",
    "ai_call_interval_secs": "300",
    "ai_stale_threshold_secs": "360",
    "ai_retry_attempts": "3",
    "ai_prompt_style": "default",
}


class AISensitivityUpdate(BaseModel):
    """Partial update for AI sensitivity settings."""
    ai_model: Optional[str] = None
    ai_temperature: Optional[float] = None
    ai_max_tokens: Optional[int] = None
    ai_min_solar_surplus_w: Optional[float] = None
    ai_min_amps: Optional[int] = None
    ai_max_amps: Optional[int] = None
    ai_call_interval_secs: Optional[int] = None
    ai_stale_threshold_secs: Optional[int] = None
    ai_retry_attempts: Optional[int] = None
    ai_prompt_style: Optional[str] = None


@router.get("/admin/ai-settings")
async def get_ai_settings(
    admin: dict = Depends(get_admin_user),
):
    """Get current AI sensitivity settings."""
    user_id = admin["id"]
    settings = get_user_settings(user_id)
    result = {}
    for key in AI_SETTING_KEYS:
        result[key] = settings.get(key, AI_SETTING_DEFAULTS.get(key, ""))
    return result


@router.post("/admin/ai-settings")
async def update_ai_settings(
    body: AISensitivityUpdate,
    admin: dict = Depends(get_admin_user),
):
    """Update AI sensitivity settings. Only provided fields are updated."""
    user_id = admin["id"]
    updated = {}
    for key, value in body.dict(exclude_none=True).items():
        upsert_user_setting(user_id, key, str(value))
        updated[key] = str(value)
    return {"updated": updated}


@router.get("/admin/check")
async def check_admin(
    admin: dict = Depends(get_admin_user),
):
    """Check if the current user is an admin."""
    return {"is_admin": True, "email": admin["email"]}
