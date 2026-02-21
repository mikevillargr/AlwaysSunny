"""GET /api/outlook — AI-generated charging outlook narrative."""

from __future__ import annotations

import time
import logging
from datetime import datetime

from fastapi import APIRouter, Depends

from middleware.auth import get_current_user
from scheduler.control_loop import get_user_state
from services.ollama import call_ollama_text

logger = logging.getLogger(__name__)

router = APIRouter()

OUTLOOK_CACHE_SECS = 3600  # Refresh at most once per hour
OUTLOOK_ERROR_RETRY_SECS = 120  # Retry after 2 min on failure (not 1 hour)


def _build_outlook_prompt(state) -> str:
    """Build a prompt grounded in actual inverter data + forecast."""
    forecast = state.forecast
    solax = state.solax
    tesla = state.tesla
    settings = state.settings

    if not solax:
        return ""

    # Current time
    try:
        from zoneinfo import ZoneInfo
    except ImportError:
        from backports.zoneinfo import ZoneInfo
    user_tz = settings.get("timezone", "Asia/Manila")
    try:
        current_time = datetime.now(ZoneInfo(user_tz)).strftime("%H:%M")
    except Exception:
        current_time = datetime.now().strftime("%H:%M")

    # Actual inverter readings
    solar_w = solax.solar_w
    household_w = solax.household_demand_w
    grid_import_w = solax.grid_import_w
    surplus_w = max(0, solar_w - household_w)

    # Tesla state
    tesla_soc = tesla.battery_level if tesla else 0
    target_soc = int(settings.get("target_soc", 80))
    soc_gap = max(0, target_soc - tesla_soc)
    kwh_needed = (soc_gap / 100.0) * 75.0
    charging_amps = tesla.charger_actual_current if tesla else 0
    charging_state = tesla.charging_state if tesla else "Unknown"

    # Strategy
    charging_strategy = settings.get("charging_strategy", "departure")
    departure_time = settings.get("departure_time", "")

    # Forecast data
    hours_until_sunset = forecast.hours_until_sunset() if forecast else 0
    irradiance_curve = forecast.build_irradiance_curve_for_ai() if forecast else "No forecast data."
    is_night = hours_until_sunset <= 0 or solar_w < 10

    # Situation assessment (pre-computed so the AI doesn't hallucinate)
    if is_night:
        situation = f"""SITUATION: It is nighttime (or past sunset). Solar yield is {solar_w:.0f}W — effectively zero.
The grid is already importing {grid_import_w:.0f}W for household use. Any EV charging will add on top of that — e.g. 5A charging adds ~1,200W to the existing {grid_import_w:.0f}W grid draw."""
    elif surplus_w < 700:
        situation = f"""SITUATION: Solar yield is low at {solar_w:.0f}W with {household_w:.0f}W household demand.
Surplus of only {surplus_w:.0f}W — not enough to charge (minimum ~1,200W needed for 5A).
The grid is already importing {grid_import_w:.0f}W. Any EV charging will add on top of that existing grid draw."""
    elif surplus_w < 1200:
        situation = f"""SITUATION: Solar yield is {solar_w:.0f}W with {household_w:.0f}W household demand.
Surplus of {surplus_w:.0f}W — borderline. Can sustain 5A with minor grid draw (~{1200 - surplus_w:.0f}W from grid)."""
    else:
        max_solar_amps = min(32, int(surplus_w / 240))
        situation = f"""SITUATION: Good solar conditions. Yield is {solar_w:.0f}W with {household_w:.0f}W household demand.
Surplus of {surplus_w:.0f}W supports up to {max_solar_amps}A charging without grid draw."""

    strategy_line = ""
    if charging_strategy == "departure" and departure_time:
        strategy_line = f"Strategy: Ready by {departure_time} departure. Grid draw is acceptable to meet deadline."
    elif charging_strategy == "solar":
        strategy_line = "Strategy: Solar-first. Grid draw should be avoided."

    return f"""Write a 2-3 sentence plain text charging outlook. Be honest and direct about current conditions.

Current time: {current_time}
{situation}

ACTUAL READINGS (from inverter right now):
- Solar: {solar_w:.0f}W | Household: {household_w:.0f}W | Grid import: {grid_import_w:.0f}W
- Tesla: {tesla_soc}% → {target_soc}% target ({kwh_needed:.1f} kWh needed)
- Currently: {charging_state} at {charging_amps}A
{strategy_line}

FORECAST (next hours):
Hours of sun left: {hours_until_sunset:.1f}h
{irradiance_curve}

RULES:
- Be HONEST. If it's night or there's no solar, say so clearly. Do not pretend solar is available.
- If charging now means grid draw, say that directly.
- Reference specific numbers from the actual readings above.
- Mention what to expect in the next 2-3 hours based on the forecast.
- 2-3 sentences max. Plain conversational English. NO JSON, NO code, NO brackets, NO formatting."""


async def generate_outlook(state) -> tuple[str, str]:
    """Generate the outlook text via Ollama plain text call. Returns (text, generated_at)."""
    prompt = _build_outlook_prompt(state)
    if not prompt:
        return "No forecast data available yet.", ""

    try:
        ai_model = state.settings.get("ai_model") or None
        raw_text = await call_ollama_text(
            prompt,
            max_retries=3,
            model_override=ai_model,
            max_tokens_override=200,
        )
        # Extra cleanup: strip any JSON artifacts the model might still produce
        import json
        if raw_text.startswith("{"):
            try:
                parsed = json.loads(raw_text)
                # Try common keys
                for key in ("text", "reasoning", "outlook", "summary"):
                    if key in parsed and isinstance(parsed[key], str):
                        raw_text = parsed[key]
                        break
                else:
                    # Just grab the first string value
                    for v in parsed.values():
                        if isinstance(v, str) and len(v) > 20:
                            raw_text = v
                            break
            except json.JSONDecodeError:
                pass
        # Remove any remaining brackets/braces
        raw_text = raw_text.strip().strip("{}[]").strip()

        generated_at = datetime.now().strftime("%H:%M")
        return raw_text, generated_at
    except Exception as e:
        logger.warning(f"Outlook generation failed: {e}")
        return "Unable to generate outlook — AI service unavailable.", ""


@router.get("/outlook")
async def get_outlook(user: dict = Depends(get_current_user), force: bool = False):
    """Return the cached charging outlook, regenerating if stale (>1 hour) or forced."""
    user_id = user["id"]
    state = get_user_state(user_id)

    if not state or not state.solax:
        return {
            "text": "",
            "generated_at": "",
            "cached": False,
            "pending": True,
        }

    now = time.time()
    cache_ttl = OUTLOOK_CACHE_SECS

    # Use shorter TTL if last attempt was an error (no generated_at means failure)
    if state.outlook_text and not state.outlook_generated_at:
        cache_ttl = OUTLOOK_ERROR_RETRY_SECS

    # Return cached if fresh and not forced
    if not force and state.outlook_text and state.outlook_generated_at and (now - state.last_outlook_fetch) < cache_ttl:
        return {
            "text": state.outlook_text,
            "generated_at": state.outlook_generated_at,
            "cached": True,
        }

    # Skip re-generation if we recently failed (avoid hammering a dead service)
    if not force and not state.outlook_generated_at and state.last_outlook_fetch and (now - state.last_outlook_fetch) < OUTLOOK_ERROR_RETRY_SECS:
        return {
            "text": state.outlook_text or "AI service temporarily unavailable. Retrying shortly.",
            "generated_at": "",
            "cached": True,
            "error": True,
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
        "error": not generated_at,
    }
