"""GET /api/outlook — AI-generated charging outlook narrative."""

from __future__ import annotations

import time
import logging
from datetime import datetime

from fastapi import APIRouter, Depends

from middleware.auth import get_current_user
from scheduler.control_loop import get_user_state
from config import get_settings
from services.ollama import call_ollama

logger = logging.getLogger(__name__)

router = APIRouter()

OUTLOOK_CACHE_SECS = 3600  # Refresh at most once per hour


def _build_outlook_prompt(state) -> str:
    """Build a lightweight prompt for the charging outlook narrative."""
    forecast = state.forecast
    solax = state.solax
    tesla = state.tesla
    settings = state.settings

    if not forecast or not solax:
        return ""

    irradiance_curve = forecast.build_irradiance_curve_for_ai()
    hours_until_sunset = forecast.hours_until_sunset()
    solar_w = solax.solar_w
    household_w = solax.household_demand_w
    surplus_w = max(0, solar_w - household_w)
    tesla_soc = tesla.battery_level if tesla else 0
    target_soc = int(settings.get("target_soc", 80))
    soc_gap = max(0, target_soc - tesla_soc)
    kwh_needed = (soc_gap / 100.0) * 75.0
    charging_strategy = settings.get("charging_strategy", "departure")
    departure_time = settings.get("departure_time", "")

    try:
        from zoneinfo import ZoneInfo
    except ImportError:
        from backports.zoneinfo import ZoneInfo
    user_tz = settings.get("timezone", "Asia/Manila")
    try:
        current_time = datetime.now(ZoneInfo(user_tz)).strftime("%H:%M")
    except Exception:
        current_time = datetime.now().strftime("%H:%M")

    strategy_line = ""
    if charging_strategy == "departure" and departure_time:
        strategy_line = f"Strategy: Ready by {departure_time} departure"
    elif charging_strategy == "solar":
        strategy_line = "Strategy: Solar-first (minimize grid draw)"

    return f"""You are a solar charging assistant. Write a brief 2-3 sentence charging outlook for the next few hours.
This is informational only — do NOT recommend specific amps. Just describe what to expect.

Current time: {current_time}
Current solar: {solar_w:.0f}W | Household: {household_w:.0f}W | Surplus: {surplus_w:.0f}W
Tesla SoC: {tesla_soc}% → Target: {target_soc}% ({kwh_needed:.1f} kWh needed)
{strategy_line}
Hours of sun left: {hours_until_sunset:.1f}h

Solar forecast (remaining hours):
{irradiance_curve}

Write a natural, conversational summary of:
1. What solar conditions look like for the next 2-3 hours
2. Whether charging pace is likely to increase, hold, or decrease
3. Any notable transitions (cloud buildup, peak ending, sunset approaching)

Keep it to 2-3 sentences. Be specific with times and numbers. No JSON — just plain text.
Example: "Strong solar expected until 3pm with peak around 850 W/m² at 1pm. Should sustain 12-16A charging for the next 2 hours. Cloud cover builds after 3pm — expect solar to drop below charging threshold by 4:30pm."
"""


async def generate_outlook(state) -> tuple[str, str]:
    """Generate the outlook text via Ollama. Returns (text, generated_at)."""
    prompt = _build_outlook_prompt(state)
    if not prompt:
        return "No forecast data available yet.", ""

    try:
        settings = get_settings()
        ai_model = state.settings.get("ai_model") or None
        rec = await call_ollama(
            prompt,
            trigger_reason="outlook",
            max_retries=2,
            model_override=ai_model,
            max_tokens_override=200,
        )
        # The response comes as JSON with reasoning field, but we asked for plain text
        # Try to extract just the text
        raw_text = rec.raw.get("response", "").strip()
        # If it's JSON (model ignored our instruction), extract reasoning
        if raw_text.startswith("{"):
            import json
            try:
                parsed = json.loads(raw_text)
                raw_text = parsed.get("reasoning", raw_text)
            except json.JSONDecodeError:
                pass
        # Strip any markdown fences
        if raw_text.startswith("```"):
            raw_text = raw_text.split("\n", 1)[-1]
        if raw_text.endswith("```"):
            raw_text = raw_text.rsplit("```", 1)[0]
        raw_text = raw_text.strip()

        generated_at = datetime.now().strftime("%H:%M")
        return raw_text, generated_at
    except Exception as e:
        logger.warning(f"Outlook generation failed: {e}")
        return "Unable to generate outlook — AI service unavailable.", ""


@router.get("/outlook")
async def get_outlook(user: dict = Depends(get_current_user)):
    """Return the cached charging outlook, regenerating if stale (>1 hour)."""
    user_id = user["id"]
    state = get_user_state(user_id)

    if not state:
        return {
            "text": "Waiting for system data...",
            "generated_at": "",
            "cached": False,
        }

    now = time.time()
    # Return cached if fresh
    if state.outlook_text and (now - state.last_outlook_fetch) < OUTLOOK_CACHE_SECS:
        return {
            "text": state.outlook_text,
            "generated_at": state.outlook_generated_at,
            "cached": True,
        }

    # Generate new outlook
    text, generated_at = await generate_outlook(state)
    state.outlook_text = text
    state.outlook_generated_at = generated_at
    state.last_outlook_fetch = now

    return {
        "text": text,
        "generated_at": generated_at,
        "cached": False,
    }
