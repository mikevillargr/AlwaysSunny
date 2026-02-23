"""Ollama AI integration — charging optimization recommendations."""

from __future__ import annotations

import json
import time
import httpx

from config import get_settings

# Separate timeouts: connect should be fast, but read (inference) can be slow
# especially on cold start when Ollama needs to load the model into VRAM
CONNECT_TIMEOUT = 15
READ_TIMEOUT = 180  # 7B models can take 60-120s on first call after idle
TIMEOUT = httpx.Timeout(READ_TIMEOUT, connect=CONNECT_TIMEOUT)


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


def _build_actual_conditions(
    solar_w: float,
    solar_trend: str,
    household_w: float,
    grid_import_w: float,
    battery_soc: int,
    battery_w: float,
    solar_surplus_w: float,
    max_solar_amps: int,
    has_home_battery: bool,
    panel_capacity_w: int,
    estimated_available_w: float,
    forecasted_irradiance_wm2: float,
    efficiency_coeff: float,
    solar_to_tesla_w: float = 0.0,
    live_tesla_solar_pct: float = 0.0,
    tesla_charging_w: float = 0.0,
) -> str:
    """Build the ACTUAL CONDITIONS block, conditional on inverter setup."""
    home_demand_w = max(0, household_w - tesla_charging_w)
    tesla_solar_line = f"\nSolar going to Tesla now: {solar_to_tesla_w:.0f}W ({live_tesla_solar_pct:.0f}%)"
    if not has_home_battery and panel_capacity_w > 0 and estimated_available_w > 0:
        return f"""Solar yield (actual measured): {solar_w:.0f}W
Solar trend (last 5 min): {solar_trend}  [rising | stable | falling]
Estimated panel capacity available now: {estimated_available_w:.0f}W
  ↑ Derived from Open-Meteo irradiance ({forecasted_irradiance_wm2:.0f} W/m²)
    × learned system efficiency coefficient ({efficiency_coeff:.2f} W per W/m²)
    capped at installed panel capacity ({panel_capacity_w}W)
  ↑ Actual yield is lower than estimate because this system has no home battery
    and no net metering — the Solax inverter self-limits output to match current
    load via MPPT throttling. Solar yield will increase automatically as Tesla
    charging amps increase. Do not treat solar_yield_w as a ceiling.
    Treat estimated_available_w as the true available ceiling.
  ↑ Use solar_trend to assess short-term confidence in the estimate:
    if trend is "falling", weight estimate conservatively;
    if "rising" or "stable", trust the estimate fully.
Home demand (excl. Tesla): {home_demand_w:.0f}W  |  Total load (incl. Tesla): {household_w:.0f}W
Grid import: {grid_import_w:.0f}W  (+ = importing, - = exporting)
Solar surplus (estimated available for car): {solar_surplus_w:.0f}W → max {max_solar_amps}A without grid draw{tesla_solar_line}"""
    else:
        return f"""Solar yield: {solar_w:.0f}W  |  Trend (last 5 min): {solar_trend}
Home demand (excl. Tesla): {home_demand_w:.0f}W  |  Total load (incl. Tesla): {household_w:.0f}W
Solar surplus (available for car): {solar_surplus_w:.0f}W → max {max_solar_amps}A without grid draw
Grid import: {grid_import_w:.0f}W  (+ = importing, - = exporting)
Home battery SoC: {battery_soc}%  |  Battery power: {battery_w:.0f}W{tesla_solar_line}"""


def _build_reasoning_guidance(has_home_battery: bool, has_net_metering: bool) -> str:
    """Build conditional reasoning guidance blocks based on inverter setup."""
    blocks = []

    if not has_net_metering:
        blocks.append("""NET METERING NOTE: This system cannot export solar to the grid for credit.
Any solar energy not consumed locally is wasted entirely. Therefore:
- Prioritise consuming all available solar aggressively
- Do not hold back charging to "conserve" solar — unused solar has zero value
- When solar surplus is available, always prefer higher amps over lower
- Grid budget is still a hard constraint, but solar consumption is the primary goal
- If estimated_available_w exceeds current charging rate plus household demand,
  increase amps immediately — the inverter will follow""")
    else:
        blocks.append("""NET METERING NOTE: This system can export surplus solar for grid credit.
Unused solar is not wasted — it earns a return. Therefore:
- Balance between charging the Tesla and exporting surplus
- Do not aggressively consume all solar if the export rate is favourable
- Optimise for overall solar value (charging + export), not just charging speed""")

    if not has_home_battery:
        blocks.append("""BATTERY NOTE: This system has no home battery. The inverter self-limits to
match demand — increasing Tesla charging amps directly causes the inverter
to produce more solar output up to the estimated ceiling. There is no
battery buffer to draw from or charge. Decisions should be made purely on
live solar availability vs Tesla charging need.""")
    else:
        blocks.append("""BATTERY NOTE: This system has a home battery. Solar subsidy calculations
are estimates — battery discharge may be attributed to solar. Home battery
SoC should be considered when recommending aggressive charging, as the
battery may be the source of apparent surplus rather than live solar.""")

    return "\n\n".join(blocks)


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
    minutes_to_full_charge: int = 0,
    has_home_battery: bool = True,
    has_net_metering: bool = False,
    panel_capacity_w: int = 0,
    estimated_available_w: float = 0.0,
    forecasted_irradiance_wm2: float = 0.0,
    efficiency_coeff: float = 0.0,
    solar_to_tesla_w: float = 0.0,
    live_tesla_solar_pct: float = 0.0,
) -> str:
    """Build the AI prompt with full context for optimization decision."""
    # --- Pre-compute goal-aware metrics ---
    soc_gap = max(0, target_soc - tesla_soc)
    battery_capacity_kwh = 75.0  # Tesla Model 3/Y typical
    kwh_needed = (soc_gap / 100.0) * battery_capacity_kwh
    # For no-battery setups, use estimated available as the true ceiling
    if not has_home_battery and panel_capacity_w > 0 and estimated_available_w > 0:
        effective_available_w = estimated_available_w
    else:
        effective_available_w = solar_w
    solar_surplus_w = max(0, effective_available_w - household_w)
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
    # Tesla's native ETA (based on current charge rate)
    tesla_eta_line = ""
    if minutes_to_full_charge > 0:
        eta_h = minutes_to_full_charge // 60
        eta_m = minutes_to_full_charge % 60
        tesla_eta_line = f"\nTesla ETA to charge limit at current rate: {eta_h}h {eta_m}m ({minutes_to_full_charge} min)"

    if charging_strategy == "departure" and departure_time:
        # Compare Tesla ETA vs departure window
        eta_vs_departure = ""
        if minutes_to_full_charge > 0 and hours_to_departure > 0:
            departure_mins = hours_to_departure * 60
            if minutes_to_full_charge <= departure_mins:
                eta_vs_departure = f"\nTesla ETA vs departure: ON TRACK — finishes {departure_mins - minutes_to_full_charge:.0f} min before departure"
            else:
                eta_vs_departure = f"\nTesla ETA vs departure: BEHIND — would finish {minutes_to_full_charge - departure_mins:.0f} min AFTER departure at current rate. Must increase amps."

        strategy_block = f"""Mode: DEPARTURE — Ready by {departure_time}
Current time: {current_time or 'unknown'}
Hours until departure: {hours_to_departure:.1f}h
Minimum amps to reach target by departure: {min_amps_for_departure}A
Feasibility: {departure_feasible}{tesla_eta_line}{eta_vs_departure}"""
    elif charging_strategy == "solar":
        strategy_block = f"""Mode: SOLAR-FIRST — Maximize solar, avoid grid draw
Current time: {current_time or 'unknown'}
Can finish with solar before sunset: {solar_can_finish}{tesla_eta_line}"""
    else:
        strategy_block = f"""Mode: {charging_strategy}
Current time: {current_time or 'unknown'}{tesla_eta_line}"""

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

=== SYSTEM CONFIGURATION ===
Home battery present: {has_home_battery}
Net metering enabled: {has_net_metering}
Installed panel capacity: {panel_capacity_w}W (0 = unknown)

=== ACTUAL CONDITIONS (Solax — ground truth) ===
{_build_actual_conditions(solar_w, solar_trend, household_w, grid_import_w, battery_soc, battery_w, solar_surplus_w, max_solar_amps, has_home_battery, panel_capacity_w, estimated_available_w, forecasted_irradiance_wm2, efficiency_coeff, solar_to_tesla_w, live_tesla_solar_pct, tesla_charging_w=current_amps * 240)}

=== SOLAR FORECAST (Open-Meteo) ===
{irradiance_curve}

=== SESSION CONTEXT ===
Session elapsed: {session_elapsed_mins} min  |  Tesla solar subsidy this session: {session_solar_pct:.0f}%
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

=== SYSTEM-SPECIFIC GUIDANCE ===
{_build_reasoning_guidance(has_home_battery, has_net_metering)}

Respond ONLY in JSON (no preamble, no explanation outside JSON):
{{"recommended_amps": <int 0-32>, "reasoning": "<1-2 sentences with specific numbers>", "confidence": "low|medium|high"}}"""


async def _generate(
    host: str,
    model: str,
    prompt: str,
    *,
    format_json: bool = False,
    temperature: float = 0.1,
    num_predict: int = 150,
    max_retries: int = 3,
) -> dict:
    """Low-level Ollama /api/generate call with retries.

    Returns the raw JSON response dict. Raises on total failure.
    """
    import asyncio
    import logging
    logger = logging.getLogger(__name__)

    payload: dict = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": temperature,
            "num_predict": num_predict,
        },
    }
    if format_json:
        payload["format"] = "json"

    global _ollama_healthy
    last_error: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                resp = await client.post(
                    f"{host}/api/generate",
                    json=payload,
                )
                resp.raise_for_status()
                if attempt > 1:
                    logger.info(f"Ollama [{model}] succeeded on attempt {attempt}")
                _ollama_healthy = True
                return resp.json()
        except (httpx.ReadTimeout, httpx.ConnectTimeout, httpx.ConnectError, httpx.PoolTimeout) as e:
            last_error = e
            if attempt < max_retries:
                wait = 5 * (2 ** (attempt - 1))
                logger.warning(
                    f"Ollama [{model}] attempt {attempt}/{max_retries} failed "
                    f"({type(e).__name__}), retrying in {wait}s..."
                )
                await asyncio.sleep(wait)
            else:
                logger.error(
                    f"Ollama [{model}] failed after {max_retries} attempts: "
                    f"{type(e).__name__}: {e}"
                )
        except httpx.HTTPStatusError as e:
            if e.response.status_code >= 500 and attempt < max_retries:
                wait = 5 * (2 ** (attempt - 1))
                logger.warning(
                    f"Ollama [{model}] attempt {attempt}/{max_retries} got "
                    f"{e.response.status_code}, retrying in {wait}s..."
                )
                await asyncio.sleep(wait)
                last_error = e
            else:
                raise

    _ollama_healthy = False
    raise last_error or Exception(f"Ollama [{model}] call failed after all retries")


async def call_ollama(
    prompt: str,
    trigger_reason: str = "scheduled",
    max_retries: int = 3,
    model_override: str | None = None,
    temperature_override: float | None = None,
    max_tokens_override: int | None = None,
) -> AIRecommendation:
    """Call Ollama API and return parsed recommendation.

    Tries the primary model first. If all retries fail with a connection
    or timeout error, falls back to the lighter fallback model.
    """
    import logging
    logger = logging.getLogger(__name__)
    settings = get_settings()
    model = model_override or settings.ollama_model
    temperature = temperature_override if temperature_override is not None else 0.1
    num_predict = max_tokens_override or 150

    # --- Try primary model ---
    try:
        raw = await _generate(
            settings.ollama_host, model, prompt,
            format_json=True, temperature=temperature,
            num_predict=num_predict, max_retries=max_retries,
        )
        return AIRecommendation(raw, trigger_reason)
    except (httpx.ReadTimeout, httpx.ConnectTimeout, httpx.ConnectError,
            httpx.PoolTimeout, Exception) as primary_err:
        # Only fall back for connection/timeout errors, not parse errors
        if not isinstance(primary_err, (httpx.ReadTimeout, httpx.ConnectTimeout,
                                         httpx.ConnectError, httpx.PoolTimeout)):
            # Check if it's our wrapped "failed after all retries" message
            if "failed after all retries" not in str(primary_err):
                raise

        fallback = settings.ollama_fallback_model
        if not fallback or fallback == model:
            raise

        logger.warning(
            f"Primary model [{model}] unreachable, trying fallback [{fallback}]..."
        )
        try:
            raw = await _generate(
                settings.ollama_host, fallback, prompt,
                format_json=True, temperature=temperature,
                num_predict=num_predict, max_retries=2,
            )
            rec = AIRecommendation(raw, trigger_reason)
            rec.reasoning = f"[fallback model] {rec.reasoning}"
            logger.info(f"Fallback model [{fallback}] succeeded: {rec.recommended_amps}A")
            return rec
        except Exception as fallback_err:
            logger.error(f"Fallback model [{fallback}] also failed: {fallback_err}")
            raise primary_err from fallback_err


def _clean_text_response(raw: str) -> str:
    """Strip markdown fences and whitespace from raw Ollama text output."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1]
    if raw.endswith("```"):
        raw = raw.rsplit("```", 1)[0]
    return raw.strip()


async def call_ollama_text(
    prompt: str,
    max_retries: int = 3,
    model_override: str | None = None,
    max_tokens_override: int | None = None,
) -> str:
    """Call Ollama API and return raw text response (no JSON format constraint).

    Used for free-form text generation like the charging outlook.
    Tries primary model, then falls back to lighter model on failure.
    """
    import logging
    logger = logging.getLogger(__name__)
    settings = get_settings()
    model = model_override or settings.ollama_model
    num_predict = max_tokens_override or 200

    # --- Try primary model ---
    try:
        raw = await _generate(
            settings.ollama_host, model, prompt,
            format_json=False, temperature=0.3,
            num_predict=num_predict, max_retries=max_retries,
        )
        return _clean_text_response(raw.get("response", ""))
    except Exception as primary_err:
        fallback = settings.ollama_fallback_model
        if not fallback or fallback == model:
            raise

        logger.warning(
            f"Primary text model [{model}] failed, trying fallback [{fallback}]..."
        )
        try:
            raw = await _generate(
                settings.ollama_host, fallback, prompt,
                format_json=False, temperature=0.3,
                num_predict=num_predict, max_retries=2,
            )
            return _clean_text_response(raw.get("response", ""))
        except Exception as fallback_err:
            logger.error(f"Fallback text model [{fallback}] also failed: {fallback_err}")
            raise primary_err from fallback_err


# ---------------------------------------------------------------------------
# Health monitoring, warmup, and self-healing
# ---------------------------------------------------------------------------

# Shared state for the health monitor
_ollama_healthy: bool = False
_ollama_last_check: float = 0
_ollama_consecutive_failures: int = 0


def is_ollama_healthy() -> bool:
    """Return the last-known health status (non-blocking)."""
    return _ollama_healthy


async def check_ollama_health() -> tuple[bool, str]:
    """Quick connectivity check — GET /api/tags (lightweight, no inference)."""
    global _ollama_healthy, _ollama_last_check, _ollama_consecutive_failures
    settings = get_settings()
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10, connect=5)) as client:
            resp = await client.get(f"{settings.ollama_host}/api/tags")
            resp.raise_for_status()
            models = resp.json().get("models", [])
            model_names = [m.get("name", "") for m in models]
            _ollama_healthy = True
            _ollama_last_check = time.time()
            _ollama_consecutive_failures = 0

            if settings.ollama_model in model_names:
                return True, f"Connected — {settings.ollama_model} available"
            elif any(settings.ollama_model.split(":")[0] in n for n in model_names):
                return True, f"Connected — found similar model: {', '.join(model_names[:3])}"
            else:
                return True, f"Connected but model '{settings.ollama_model}' not found. Available: {', '.join(model_names[:5])}"
    except Exception as e:
        _ollama_healthy = False
        _ollama_last_check = time.time()
        _ollama_consecutive_failures += 1
        return False, f"{type(e).__name__}: {e}"


async def _try_restart_ollama_container() -> bool:
    """Attempt to restart the Ollama Docker container via the Docker socket.

    Requires /var/run/docker.sock to be mounted into the backend container.
    Returns True if restart command succeeded.
    """
    import logging
    logger = logging.getLogger(__name__)
    settings = get_settings()
    container = settings.ollama_container_name
    if not container:
        return False

    try:
        async with httpx.AsyncClient(
            transport=httpx.AsyncHTTPTransport(uds="/var/run/docker.sock"),
            timeout=30,
        ) as client:
            logger.warning(f"Attempting to restart Ollama container: {container}")
            resp = await client.post(
                f"http://localhost/containers/{container}/restart",
                params={"t": 10},  # 10s grace period
            )
            if resp.status_code == 204:
                logger.info(f"Ollama container '{container}' restart triggered successfully")
                return True
            else:
                logger.error(f"Docker restart returned {resp.status_code}: {resp.text}")
                return False
    except Exception as e:
        logger.warning(f"Cannot restart Ollama container ({type(e).__name__}): {e}")
        return False


async def _ensure_model_available(host: str, model: str) -> None:
    """Pull a model if it's not already available. Non-blocking best-effort."""
    import logging
    logger = logging.getLogger(__name__)
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10, connect=5)) as client:
            resp = await client.get(f"{host}/api/tags")
            resp.raise_for_status()
            model_names = [m.get("name", "") for m in resp.json().get("models", [])]
            if model in model_names:
                return
            # Model not found — pull it
            logger.info(f"Pulling Ollama model: {model} (this may take several minutes for large models)")
            async with httpx.AsyncClient(timeout=httpx.Timeout(1800, connect=15)) as pull_client:
                pull_resp = await pull_client.post(
                    f"{host}/api/pull",
                    json={"name": model, "stream": False},
                )
                pull_resp.raise_for_status()
                logger.info(f"Model {model} pulled successfully")
    except Exception as e:
        logger.warning(f"Failed to ensure model {model}: {type(e).__name__}: {e}")


async def warmup_model() -> None:
    """Warm up Ollama on backend startup.

    Retries every 30s for up to 5 minutes if Ollama is unreachable.
    Ensures both primary and fallback models are pulled before warming up.
    """
    import asyncio
    import logging
    logger = logging.getLogger(__name__)
    settings = get_settings()

    global _ollama_healthy
    max_attempts = 10  # 10 × 30s = 5 minutes
    for attempt in range(1, max_attempts + 1):
        try:
            # Quick connectivity check first — set healthy as soon as Ollama responds
            async with httpx.AsyncClient(timeout=httpx.Timeout(10, connect=5)) as client:
                resp = await client.get(f"{settings.ollama_host}/api/tags")
                resp.raise_for_status()
                if not _ollama_healthy:
                    _ollama_healthy = True
                    logger.info("Ollama is reachable — marked healthy")

            # Ensure primary model is available (pulls if missing — may take minutes)
            logger.info(f"Ensuring primary model available: {settings.ollama_model} (attempt {attempt})")
            await _ensure_model_available(settings.ollama_host, settings.ollama_model)

            # Also ensure fallback model is available
            if settings.ollama_fallback_model and settings.ollama_fallback_model != settings.ollama_model:
                await _ensure_model_available(settings.ollama_host, settings.ollama_fallback_model)

            # Warm up primary model with a minimal inference
            async with httpx.AsyncClient(timeout=httpx.Timeout(300, connect=15)) as client:
                logger.info(f"Warming up Ollama model: {settings.ollama_model}")
                resp = await client.post(
                    f"{settings.ollama_host}/api/generate",
                    json={
                        "model": settings.ollama_model,
                        "prompt": "Reply OK",
                        "stream": False,
                        "options": {"num_predict": 5},
                    },
                )
                resp.raise_for_status()
                logger.info("Ollama model warm — ready for inference")
                return
        except Exception as e:
            logger.warning(
                f"Ollama warmup attempt {attempt}/{max_attempts} failed "
                f"({type(e).__name__}): {e}"
            )
            if attempt < max_attempts:
                await asyncio.sleep(30)
            else:
                logger.error("Ollama warmup exhausted — AI features may be unavailable")


async def ollama_health_monitor() -> None:
    """Background task that periodically checks Ollama health.

    Runs every 60s. If Ollama is down for 3+ consecutive checks,
    attempts a container restart via Docker socket.
    """
    import asyncio
    import logging
    logger = logging.getLogger(__name__)

    # Run first check immediately, then every 60s
    first_run = True
    while True:
        if first_run:
            first_run = False
        else:
            await asyncio.sleep(60)
        ok, detail = await check_ollama_health()
        if ok:
            continue

        logger.warning(f"Ollama health check failed ({_ollama_consecutive_failures}x): {detail}")

        # After 3 consecutive failures, try restarting the container
        if _ollama_consecutive_failures >= 3 and _ollama_consecutive_failures % 3 == 0:
            logger.error(
                f"Ollama down for {_ollama_consecutive_failures} checks — "
                f"attempting container restart..."
            )
            restarted = await _try_restart_ollama_container()
            if restarted:
                # Wait for container to come back up
                await asyncio.sleep(30)
                ok2, detail2 = await check_ollama_health()
                if ok2:
                    logger.info(f"Ollama recovered after restart: {detail2}")
                    # Re-warm the model
                    asyncio.create_task(warmup_model())
                else:
                    logger.error(f"Ollama still down after restart: {detail2}")


async def test_ollama_connection() -> tuple[bool, str]:
    """Test Ollama connectivity and model availability (used by /api/health)."""
    return await check_ollama_health()
