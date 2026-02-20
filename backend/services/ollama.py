"""Ollama AI integration — charging optimization recommendations."""

from __future__ import annotations

import json
import time
import httpx

from config import get_settings

TIMEOUT = 30


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
- Prefer gradual changes (±2A per adjustment) for battery health
- 0A means stop charging entirely

=== REASONING MESSAGE INSTRUCTIONS ===
The "reasoning" field is displayed directly to the user in the app banner. Write it to actively narrate what you're doing and why:
- Name the primary signal that drove the decision (e.g. "Solar at 2,840W and rising", "Grid budget 85% used")
- State what you're anticipating or protecting against (e.g. "holding rate for cloud recovery", "throttling to preserve budget")
- Be 1-2 short sentences max. Plain English. No jargon.
- Feel like a knowledgeable assistant explaining a decision, not a data readout.

Good: "Solar at 2,840W and rising — pushing to 18A to capture the peak window before 2pm."
Bad: "Recommended amps: 18. Solar yield high. Irradiance peak approaching."

Respond ONLY in JSON (no preamble, no explanation outside JSON):
{{"recommended_amps": <int 0-32>, "reasoning": "<1-2 sentences>", "confidence": "low|medium|high"}}"""


async def call_ollama(prompt: str, trigger_reason: str = "scheduled") -> AIRecommendation:
    """Call Ollama API and return parsed recommendation.

    Args:
        prompt: Full prompt string
        trigger_reason: Why this AI call was triggered

    Returns:
        AIRecommendation with parsed result

    Raises:
        httpx.HTTPError: on network errors
        TimeoutError: if Ollama doesn't respond within timeout
    """
    settings = get_settings()

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.post(
            f"{settings.ollama_host}/api/generate",
            json={
                "model": settings.ollama_model,
                "prompt": prompt,
                "format": "json",
                "stream": False,
                "options": {
                    "temperature": 0.1,
                    "num_predict": 150,
                },
            },
        )
        resp.raise_for_status()
        return AIRecommendation(resp.json(), trigger_reason)


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
