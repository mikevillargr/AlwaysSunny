"""Debug endpoints for testing AI pipeline without a live charging session."""

from __future__ import annotations

import time
import logging
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException

from middleware.auth import get_current_user
from config import get_settings
from services.ollama import build_prompt, call_ollama

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
