"""Ollama AI integration — charging optimization recommendations."""

from __future__ import annotations

import json
import time
import httpx

from config import get_settings

TIMEOUT = 90


class AIRecommendation:
    """Parsed AI recommendation from Ollama."""

    def __init__(self, raw_response: dict, trigger_reason: str):
        self.raw = raw_response
        self.trigger_reason = trigger_reason
        self.timestamp = time.time()

        # Parse the JSON response from Ollama
        response_text = raw_response.get("response", "{}")
        # Defensively strip markdown fences
        response_text = response_text.strip()
        if response_text.startswith("```"):
            response_text = response_text.split("\n", 1)[-1]
        if response_text.endswith("```"):
            response_text = response_text.rsplit("```", 1)[0]
        response_text = response_text.strip()

        try:
            parsed = json.loads(response_text)
        except json.JSONDecodeError:
            parsed = {}

        self.recommended_amps = int(parsed.get("recommended_amps", 0))
        self.reasoning = str(parsed.get("reasoning", "Unable to parse AI response"))
        self.confidence = str(parsed.get("confidence", "low"))

        # Validate
        if self.recommended_amps < 0 or self.recommended_amps > 32:
            self.recommended_amps = 0
            self.confidence = "low"
            self.reasoning = f"AI returned invalid amps ({parsed.get('recommended_amps')}), using fallback"

        # Tesla minimum is 5A — clamp 1-4A to 0 and rewrite reasoning
        if 1 <= self.recommended_amps <= 4:
            original = self.recommended_amps
            self.recommended_amps = 0
            self.reasoning = (
                f"Solar surplus only supports {original}A — below Tesla's 5A minimum. "
                f"Pausing until conditions improve."
            )

        if self.confidence not in ("low", "medium", "high"):
            self.confidence = "low"

    @property
    def age_secs(self) -> int:
        """Seconds since this recommendation was generated."""
        return int(time.time() - self.timestamp)

    @property
    def is_fresh(self) -> bool:
        """Recommendation is considered fresh if < 6 minutes old."""
        return self.age_secs < 360

    def to_dict(self) -> dict:
        return {
            "ai_recommended_amps": self.recommended_amps,
            "ai_reasoning": self.reasoning,
            "ai_confidence": self.confidence,
            "ai_trigger_reason": self.trigger_reason,
            "ai_last_updated_secs": self.age_secs,
        }


def build_prompt(
    solar_w: float,
    household_w: float,
    grid_import_w: float,
    battery_soc: int,
    battery_w: float,
    tesla_soc: int,
    target_soc: int,
    current_amps: int,
    grid_budget_remaining_kwh: float,
    grid_budget_total_kwh: float,
    max_grid_import_w: float,
    hours_until_sunset: float,
    irradiance_curve: str,
    trigger_reason: str,
    charging_strategy: str = "departure",
    departure_time: str = "",
    solar_trend: str = "stable",
    session_elapsed_mins: int = 0,
    session_kwh_added: float = 0.0,
    session_solar_pct: float = 0.0,
    current_time: str = "",
) -> str:
    """Build the AI prompt with full context for optimization decision."""
    # --- Pre-compute goal-aware metrics ---
    soc_gap = max(0, target_soc - tesla_soc)
    battery_capacity_kwh = 75.0  # Tesla Model 3/Y typical
    kwh_needed = (soc_gap / 100.0) * battery_capacity_kwh
    solar_surplus_w = max(0, solar_w - household_w)
    max_solar_amps = min(32, int(solar_surplus_w / 240))
    kwh_per_amp_hour = 0.24  # 240V × 1A = 240W = 0.24 kWh/h

    # Time-to-target at various rates
    def hours_at(amps: int) -> float:
        if amps <= 0 or kwh_needed <= 0:
            return 0.0
        return kwh_needed / (amps * kwh_per_amp_hour)

    hours_at_current = hours_at(current_amps)
    hours_at_max_solar = hours_at(max_solar_amps)
    hours_at_max = hours_at(32)

    # Session progress
    progress_pct = (session_kwh_added / kwh_needed * 100) if kwh_needed > 0 else 100.0
    kwh_remaining = max(0, kwh_needed - session_kwh_added)
    current_rate_kwh_h = current_amps * kwh_per_amp_hour

    # Departure calculations
    hours_to_departure = 0.0
    min_amps_for_departure = 0
    departure_feasible = ""
    if departure_time and charging_strategy == "departure":
        try:
            from datetime import datetime
            now_str = current_time or datetime.now().strftime("%H:%M")
            now_parts = now_str.replace(" PHT", "").split(":")
            dep_parts = departure_time.split(":")
            now_mins = int(now_parts[0]) * 60 + int(now_parts[1])
            dep_mins = int(dep_parts[0]) * 60 + int(dep_parts[1])
            if dep_mins <= now_mins:
                dep_mins += 24 * 60  # next day
            hours_to_departure = (dep_mins - now_mins) / 60.0
            if hours_to_departure > 0 and kwh_remaining > 0:
                min_amps_for_departure = max(5, min(32, int(
                    kwh_remaining / (hours_to_departure * kwh_per_amp_hour) + 0.99
                )))
                if min_amps_for_departure <= max_solar_amps:
                    departure_feasible = "Achievable with solar alone"
                elif min_amps_for_departure <= 32:
                    departure_feasible = f"Needs grid draw — minimum {min_amps_for_departure}A required"
                else:
                    departure_feasible = "CANNOT reach target before departure even at 32A"
            elif kwh_remaining <= 0:
                departure_feasible = "Already at or above target SoC"
        except (ValueError, IndexError):
            pass

    # Solar feasibility
    solar_can_finish = "N/A"
    if kwh_needed > 0 and max_solar_amps >= 5:
        solar_can_finish = "Yes" if hours_at_max_solar <= hours_until_sunset else "No"
    elif max_solar_amps < 5:
        solar_can_finish = "No — solar surplus below minimum 5A"

    # Goal feasibility summary
    if soc_gap <= 0:
        goal_summary = "Target SoC already reached — consider stopping or reducing rate."
    elif charging_strategy == "solar":
        if solar_can_finish == "Yes":
            goal_summary = f"Achievable with solar alone — {hours_at_max_solar:.1f}h at {max_solar_amps}A, {hours_until_sunset:.1f}h of sun left."
        else:
            goal_summary = f"Cannot finish with solar before sunset — would need {hours_at_max_solar:.1f}h but only {hours_until_sunset:.1f}h left. Solar-first mode: accept partial charge."
    elif charging_strategy == "departure" and departure_feasible:
        goal_summary = departure_feasible
    else:
        goal_summary = f"Need {kwh_remaining:.1f} kWh more. At {current_amps}A: {hours_at_current:.1f}h. At 32A: {hours_at_max:.1f}h."

    # --- Build strategy context ---
    strategy_block = ""
    if charging_strategy == "departure" and departure_time:
        strategy_block = f"""Mode: DEPARTURE — Ready by {departure_time}
Current time: {current_time or 'unknown'}
Hours until departure: {hours_to_departure:.1f}h
Minimum amps to reach target by departure: {min_amps_for_departure}A
Feasibility: {departure_feasible}"""
    elif charging_strategy == "solar":
        strategy_block = f"""Mode: SOLAR-FIRST — Maximize solar, avoid grid draw
Current time: {current_time or 'unknown'}
Can finish with solar before sunset: {solar_can_finish}"""
    else:
        strategy_block = f"""Mode: {charging_strategy}
Current time: {current_time or 'unknown'}"""

    # --- Build the prompt ---
    return f"""You are a solar EV charging optimizer for a home in the Philippines.
Recommend a Tesla charging rate in amps (5-32A) or 0 to stop.
You autonomously manage amperage via Tessie to maximize solar efficiency while respecting constraints.

=== CHARGING STRATEGY ===
{strategy_block}

=== GOAL STATUS ===
Target SoC: {target_soc}% (currently {tesla_soc}%, gap: {soc_gap}%, ~{kwh_needed:.1f} kWh needed)
Session progress: {session_kwh_added:.1f} of {kwh_needed:.1f} kWh added ({progress_pct:.0f}% complete)
Remaining: {kwh_remaining:.1f} kWh
Current rate: {current_amps}A → {current_rate_kwh_h:.1f} kWh/h → {hours_at_current:.1f}h to finish
At max solar ({max_solar_amps}A): {hours_at_max_solar:.1f}h to finish
At max rate (32A): {hours_at_max:.1f}h to finish
Hours of sun left: {hours_until_sunset:.1f}h
ASSESSMENT: {goal_summary}

=== CONSTRAINTS ===
Grid import budget remaining: {grid_budget_remaining_kwh:.1f} kWh (of {grid_budget_total_kwh:.1f} kWh daily limit)
Max grid import rate: {max_grid_import_w:.0f}W
Tesla minimum charging rate: 5A (never recommend 1-4A)
Tesla maximum charging rate: 32A
Each amp ≈ 240W at 240V circuit (0.24 kWh/h per amp)

=== ACTUAL CONDITIONS (Solax — ground truth) ===
Solar yield: {solar_w:.0f}W  |  Trend (last 5 min): {solar_trend}
Household demand: {household_w:.0f}W
Solar surplus (available for car): {solar_surplus_w:.0f}W → max {max_solar_amps}A without grid draw
Grid import: {grid_import_w:.0f}W  (+ = importing, - = exporting)
Home battery SoC: {battery_soc}%  |  Battery power: {battery_w:.0f}W

=== SOLAR FORECAST (Open-Meteo) ===
{irradiance_curve}

=== SESSION CONTEXT ===
Session elapsed: {session_elapsed_mins} min  |  Solar subsidy: {session_solar_pct:.0f}%
Trigger reason: {trigger_reason}

=== DECISION RULES ===
- Weight Solax actual data most heavily for the next 5-15 minutes
- Use Open-Meteo forecast for planning decisions beyond 15 minutes
- If solar_trend is "falling" but forecast shows recovery within 30 min, consider holding current rate
- Recommend the IDEAL target amps — the system handles ramping. Do NOT limit to small increments.
- Your recommendation should be AT LEAST max solar amps when surplus exists and SoC gap remains
- DEPARTURE mode: if behind pace, draw from grid. If ahead, stay solar-only.
- SOLAR mode: minimize grid draw. Be patient. Accept partial charge if solar is insufficient.

=== GRID DRAW POLICY (important — overarching goal is to MINIMIZE grid draw) ===
- If grid budget is 0 (no budget set / unlimited): MINIMIZE grid draw as much as possible.
  - If solar surplus is 700-1200W (close to 5A but not quite), allow charging at 5A with minor grid draw (~500W buffer) to avoid constant start/stop cycling.
  - If solar surplus < 700W, recommend 0A — not enough solar to justify any grid draw.
  - Never draw more than ~1000W from grid when no budget is set, unless in DEPARTURE mode with time pressure.
- If grid budget > 0 (budget is set):
  - When budget remaining > 10%: allow grid draw freely up to the budget limit. The user has explicitly allocated this grid energy.
  - When budget remaining < 10%: throttle aggressively — reduce to solar-only or minimum amps.
  - It's acceptable to slightly exceed the budget (by ~5%) if needed to reach target SoC in departure mode.
- Never exceed the max grid import rate ({max_grid_import_w:.0f}W) regardless of budget.

=== REASONING MESSAGE INSTRUCTIONS ===
The "reasoning" field is shown to the user in the app. It MUST:
1. State the GOAL context first (e.g. "Need 12.5 kWh to reach 80% by 7am" or "Solar-first: capturing surplus")
2. State whether ON TRACK or BEHIND/AHEAD with numbers (e.g. "On pace — 2.1h left at 16A, 3h of sun remaining")
3. State the ACTION and why (e.g. "Pushing to 20A to capture peak" or "Pausing — only 600W surplus, below 1200W minimum")

Strategy-specific tone:
- SOLAR mode: Patient, conservation-focused. "Solar surplus at 2,400W — charging at 10A, staying grid-free. 3.2h to finish, 4h of sun left."
- DEPARTURE mode: Urgency-aware. "Need 15 kWh in 3h — that's 21A minimum. Solar covers 12A, pulling 9A from grid to hit 80% by 7am."

NEVER write generic statements. ALWAYS include specific numbers (watts, amps, hours, kWh, %).

Bad (FORBIDDEN):
- "Solar surplus insufficient for minimum charging rate — pausing until conditions improve."
- "Maximizing solar capture before demand increases."
- "Recommended amps: 18. Solar yield high."

Good:
- "Solar-first: surplus at 3,200W supports 13A. 8.5 kWh to go, ~2.7h at 13A with 4h of sun — on track."
- "Departure 7am: need 12 kWh in 5h (10A min). Solar covers 8A, pulling 2A from grid. Budget: 18 kWh remaining."
- "Only 600W surplus — below 1,200W minimum for 5A. Pausing. Forecast shows 900 W/m² at 2pm, will resume."

Respond ONLY in JSON (no preamble, no explanation outside JSON):
{{"recommended_amps": <int 0-32>, "reasoning": "<1-2 sentences with specific numbers>", "confidence": "low|medium|high"}}"""


async def call_ollama(
    prompt: str,
    trigger_reason: str = "scheduled",
    max_retries: int = 3,
    model_override: str | None = None,
    temperature_override: float | None = None,
    max_tokens_override: int | None = None,
) -> AIRecommendation:
    """Call Ollama API and return parsed recommendation.

    Retries up to max_retries times with exponential backoff on timeout
    or connection errors. Non-retryable errors (4xx) raise immediately.

    Args:
        prompt: Full prompt string
        trigger_reason: Why this AI call was triggered
        max_retries: Number of attempts before giving up
        model_override: Override the default model (from admin settings)
        temperature_override: Override the default temperature
        max_tokens_override: Override the default max tokens

    Returns:
        AIRecommendation with parsed result

    Raises:
        httpx.HTTPError: on non-retryable HTTP errors
        TimeoutError: if all retries exhausted
    """
    import asyncio
    import logging
    logger = logging.getLogger(__name__)
    settings = get_settings()
    model = model_override or settings.ollama_model
    temperature = temperature_override if temperature_override is not None else 0.1
    num_predict = max_tokens_override or 150

    last_error: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                resp = await client.post(
                    f"{settings.ollama_host}/api/generate",
                    json={
                        "model": model,
                        "prompt": prompt,
                        "format": "json",
                        "stream": False,
                        "options": {
                            "temperature": temperature,
                            "num_predict": num_predict,
                        },
                    },
                )
                resp.raise_for_status()
                if attempt > 1:
                    logger.info(f"Ollama succeeded on attempt {attempt}")
                return AIRecommendation(resp.json(), trigger_reason)
        except (httpx.ReadTimeout, httpx.ConnectTimeout, httpx.ConnectError) as e:
            last_error = e
            if attempt < max_retries:
                wait = 2 ** attempt  # 2s, 4s
                logger.warning(
                    f"Ollama attempt {attempt}/{max_retries} failed "
                    f"({type(e).__name__}), retrying in {wait}s..."
                )
                await asyncio.sleep(wait)
            else:
                logger.error(
                    f"Ollama failed after {max_retries} attempts: "
                    f"{type(e).__name__}: {e}"
                )
        except httpx.HTTPStatusError as e:
            # 4xx/5xx — don't retry client errors, do retry server errors
            if e.response.status_code >= 500 and attempt < max_retries:
                wait = 2 ** attempt
                logger.warning(
                    f"Ollama attempt {attempt}/{max_retries} got {e.response.status_code}, "
                    f"retrying in {wait}s..."
                )
                await asyncio.sleep(wait)
                last_error = e
            else:
                raise

    raise last_error or Exception("Ollama call failed after all retries")


async def call_ollama_text(
    prompt: str,
    max_retries: int = 2,
    model_override: str | None = None,
    max_tokens_override: int | None = None,
) -> str:
    """Call Ollama API and return raw text response (no JSON format constraint).

    Used for free-form text generation like the charging outlook.
    """
    import asyncio
    import logging
    logger = logging.getLogger(__name__)
    settings = get_settings()
    model = model_override or settings.ollama_model
    num_predict = max_tokens_override or 200

    last_error: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                resp = await client.post(
                    f"{settings.ollama_host}/api/generate",
                    json={
                        "model": model,
                        "prompt": prompt,
                        "stream": False,
                        "options": {
                            "temperature": 0.3,
                            "num_predict": num_predict,
                        },
                    },
                )
                resp.raise_for_status()
                raw = resp.json().get("response", "").strip()
                # Clean up any stray markdown fences
                if raw.startswith("```"):
                    raw = raw.split("\n", 1)[-1]
                if raw.endswith("```"):
                    raw = raw.rsplit("```", 1)[0]
                return raw.strip()
        except (httpx.ReadTimeout, httpx.ConnectTimeout, httpx.ConnectError) as e:
            last_error = e
            if attempt < max_retries:
                await asyncio.sleep(2 ** attempt)
            else:
                logger.error(f"Ollama text call failed after {max_retries} attempts: {e}")
        except httpx.HTTPStatusError as e:
            if e.response.status_code >= 500 and attempt < max_retries:
                await asyncio.sleep(2 ** attempt)
                last_error = e
            else:
                raise

    raise last_error or Exception("Ollama text call failed after all retries")


async def test_ollama_connection() -> tuple[bool, str]:
    """Test Ollama connectivity and model availability."""
    settings = get_settings()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{settings.ollama_host}/api/tags")
            resp.raise_for_status()
            models = resp.json().get("models", [])
            model_names = [m.get("name", "") for m in models]

            if settings.ollama_model in model_names:
                return True, f"Connected — {settings.ollama_model} available"
            elif any(settings.ollama_model.split(":")[0] in n for n in model_names):
                return True, f"Connected — found similar model: {', '.join(model_names[:3])}"
            else:
                return False, f"Connected but model '{settings.ollama_model}' not found. Available: {', '.join(model_names[:5])}"
    except httpx.HTTPError as e:
        return False, f"HTTP error: {str(e)}"
    except Exception as e:
        return False, f"Unexpected error: {str(e)}"
