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
) -> str:
    """Build the AI prompt with full context for optimization decision.

    Based on SPEC.md prompt template.
    """
    soc_gap = max(0, target_soc - tesla_soc)
    battery_capacity_kwh = 75.0  # Tesla Model 3/Y typical
    kwh_needed = (soc_gap / 100.0) * battery_capacity_kwh
    solar_surplus_w = max(0, solar_w - household_w)
    max_solar_amps = min(32, int(solar_surplus_w / 240))
    
    # Departure time context
    departure_context = ""
    if departure_time and charging_strategy == "departure":
        departure_context = f"\nDeparture time: {departure_time} (charging strategy: Ready by departure)"
    elif charging_strategy == "solar":
        departure_context = "\nCharging strategy: Solar-first (maximize solar subsidy, grid draw avoided)"
    
    return f"""You are a solar EV charging optimizer for a home in the Philippines (Manila time, PHT +8).
Recommend a Tesla charging rate in amps (5-32A) or 0 to stop.
Your goal: autonomously manage amperage via Tessie to maximize solar efficiency while respecting constraints.

=== CHARGING STRATEGY ===
Mode: {charging_strategy}  [solar | departure]
Target SoC: {target_soc}% (currently {tesla_soc}%, gap: {soc_gap}%, ~{kwh_needed:.1f} kWh needed){departure_context}
Grid import budget remaining: {grid_budget_remaining_kwh:.1f} kWh (of {grid_budget_total_kwh:.1f} kWh daily limit)
Max grid import rate: {max_grid_import_w:.0f}W

=== ACTUAL CONDITIONS (Solax — ground truth) ===
Solar yield: {solar_w:.0f}W  |  Trend (last 5 min): {solar_trend}  [rising | stable | falling]
Household demand: {household_w:.0f}W
Solar surplus (available for car): {solar_surplus_w:.0f}W → max {max_solar_amps}A without grid draw
Grid import: {grid_import_w:.0f}W  (+ = importing, - = exporting)
Home battery SoC: {battery_soc}%  |  Battery power: {battery_w:.0f}W

=== SOLAR FORECAST (Open-Meteo — predictive) ===
Hours until sunset: {hours_until_sunset:.1f}h

Remaining hourly forecast:
{irradiance_curve}

=== SESSION CONTEXT ===
Session elapsed: {session_elapsed_mins} min
kWh added this session: {session_kwh_added:.2f}
Solar subsidy so far: {session_solar_pct:.0f}%
Current charging rate: {current_amps}A
Trigger reason: {trigger_reason}

=== REASONING GUIDANCE ===
- Weight Solax actual data most heavily for the next 5-15 minutes
- Use Open-Meteo forecast for planning decisions beyond 15 minutes
- If solar_trend is "falling" but forecast shows recovery within 30 min, consider holding current rate
- If SoC gap cannot be closed with solar alone before sunset and strategy is "departure", recommend minimum grid draw to bridge the gap
- If strategy is "solar", prioritize zero or minimal grid draw even if target SoC may not be reached
- Never recommend amps that would cause grid import to exceed {max_grid_import_w:.0f}W or exhaust budget_remaining_kwh
- Each amp ≈ 240W at 240V circuit
- Available solar surplus = solar_yield - household_demand (this is what can power the car without grid)
- Recommend the IDEAL target amps — do NOT limit yourself to small increments from current_amps. The system handles ramping.
- Your recommendation should be AT LEAST the calculated max solar amps (shown above) when solar surplus is positive and SoC gap exists
- Maximum charging rate is 32A — use it when solar surplus supports it
- Tesla MINIMUM charging rate is 5A — never recommend 1, 2, 3, or 4A
- If solar surplus only supports less than 5A (i.e. surplus < 1200W), recommend 0A to stop charging
- 0A means stop charging entirely

=== REASONING MESSAGE INSTRUCTIONS ===
The "reasoning" field is displayed directly to the user in the app banner. Write it to actively narrate what you're doing and why:
- Name the primary signal that drove the decision (e.g. "Solar at 2,840W and rising", "Grid budget 85% used")
- State what you're anticipating or protecting against (e.g. "holding rate for cloud recovery", "throttling to preserve budget")
- Be 1-2 short sentences max. Plain English. No jargon.
- Feel like a knowledgeable assistant explaining a decision, not a data readout.

Good examples:
- "Solar at 2,840W and rising — pushing to 18A to capture the peak window before 2pm."
- "Solar surplus only 800W — below the 1,200W needed to charge. Pausing until solar recovers."
- "Grid budget 92% used — throttling to 6A to stay within daily limit."
- "Departure in 45 min with 18% SoC gap — drawing from grid at 14A to reach target."

Bad examples:
- "Solar surplus insufficient for minimum charging rate — pausing until conditions improve." (no numbers)
- "Recommended amps: 18. Solar yield high. Irradiance peak approaching." (data readout, not narrative)

Always include the specific watt or amp value that drove the decision.

Respond ONLY in JSON (no preamble, no explanation outside JSON):
{{"recommended_amps": <int 0-32>, "reasoning": "<1-2 sentences>", "confidence": "low|medium|high"}}"""


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
