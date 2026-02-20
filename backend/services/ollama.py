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
    tesla_soc: int,
    target_soc: int,
    current_amps: int,
    grid_budget_remaining_kwh: float,
    hours_until_sunset: float,
    irradiance_curve: str,
    trigger_reason: str,
) -> str:
    """Build the AI prompt with full context for optimization decision.

    Based on SPEC.md prompt template.
    """
    return f"""You are an EV charging optimizer for a home solar system. Your job is to recommend the optimal Tesla charging amperage (5-32A, or 0 to stop) that maximizes solar self-consumption and minimizes grid import.

Current state:
- Solar production: {solar_w}W
- Household demand: {household_w}W
- Grid import: {grid_import_w}W (positive = importing from grid)
- Home battery SoC: {battery_soc}%
- Tesla SoC: {tesla_soc}% → target {target_soc}%
- Current charging rate: {current_amps}A
- Grid budget remaining: {grid_budget_remaining_kwh:.1f} kWh today
- Hours until sunset: {hours_until_sunset:.1f}h
- Trigger: {trigger_reason}

Solar forecast (remaining hours):
{irradiance_curve}

Rules:
1. Available solar for EV = solar_w - household_w (never go negative)
2. Each amp ≈ 240W at 240V circuit
3. Prefer gradual changes (±2A per adjustment) for battery health
4. If grid budget is low (<1 kWh remaining), reduce aggressively
5. If solar is declining and Tesla SoC is close to target, maintain or reduce
6. If peak solar window is approaching, you may hold current rate and increase later
7. 0A means stop charging entirely

Respond with JSON only:
{{"recommended_amps": <int 0-32>, "reasoning": "<1-2 sentence explanation>", "confidence": "<low|medium|high>"}}"""


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
