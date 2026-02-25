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
    current_time: str = "13:00"
    irradiance_curve: str = (
        "13:00 | 820 W/m² | 2600W | 15% cloud\n"
        "14:00 | 750 W/m² | 2400W | 20% cloud\n"
        "15:00 | 580 W/m² | 1850W | 25% cloud\n"
        "16:00 | 350 W/m² | 1100W | 30% cloud\n"
        "17:00 | 120 W/m² | 380W  | 40% cloud"
    )
    minutes_to_full_charge: int = 0
    has_home_battery: bool = True
    has_net_metering: bool = False
    panel_capacity_w: int = 0
    estimated_available_w: float = 0.0
    forecasted_irradiance_wm2: float = 0.0
    efficiency_coeff: float = 0.0
    custom_prompt: Optional[str] = None


def _build_test_prompt(body: AITestRequest, grid_remaining: float) -> str:
    """Build prompt from test request body."""
    return build_prompt(
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
        current_time=body.current_time,
        minutes_to_full_charge=body.minutes_to_full_charge,
        has_home_battery=body.has_home_battery,
        has_net_metering=body.has_net_metering,
        panel_capacity_w=body.panel_capacity_w,
        estimated_available_w=body.estimated_available_w,
        forecasted_irradiance_wm2=body.forecasted_irradiance_wm2,
        efficiency_coeff=body.efficiency_coeff,
    )


@router.post("/debug/ai-prompt-preview")
async def ai_prompt_preview(
    body: AITestRequest = AITestRequest(),
    admin: dict = Depends(get_admin_user),
):
    """Generate the prompt without calling Ollama. For inspection and editing."""
    grid_remaining = max(0, body.grid_budget_total_kwh - body.grid_budget_used_kwh)
    prompt = _build_test_prompt(body, grid_remaining)
    return {"prompt": prompt}


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

    # 1. Build prompt (or use custom prompt if provided)
    auto_prompt = _build_test_prompt(body, grid_remaining)
    prompt = body.custom_prompt if body.custom_prompt else auto_prompt

    # 2. Call Ollama
    start = time.time()
    try:
        # Get user settings for AI provider routing
        from services.supabase_client import get_user_settings
        u_settings = get_user_settings(admin["id"])
        recommendation = await call_ollama(prompt, trigger_reason="manual_test", user_settings=u_settings)
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        logger.error(f"Ollama call failed: {type(e).__name__}: {e}\n{tb}")
        raise HTTPException(status_code=502, detail=f"Ollama call failed: {type(e).__name__}: {str(e)}")
    elapsed = round(time.time() - start, 2)

    # 3. Determine simulated Tessie command
    # Tesla minimum is 5A — anything below that means stop charging
    amps = recommendation.recommended_amps
    if amps < 5:
        tessie_action = "stop_charging"
        tessie_amps = 0
    else:
        tessie_action = "set_charging_amps"
        tessie_amps = min(amps, 32)

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
    "ai_fallback_model",
    "ai_temperature",
    "ai_max_tokens",
    "ai_min_solar_surplus_w",
    "ai_min_amps",
    "ai_max_amps",
    "ai_call_interval_secs",
    "ai_stale_threshold_secs",
    "ai_retry_attempts",
    "ai_prompt_style",
    "outlook_refresh_mins",
]

AI_SETTING_DEFAULTS = {
    "ai_model": "qwen2.5:7b",
    "ai_fallback_model": "qwen2.5:1.5b",
    "ai_temperature": "0.1",
    "ai_max_tokens": "150",
    "ai_min_solar_surplus_w": "0",
    "ai_min_amps": "5",
    "ai_max_amps": "32",
    "ai_call_interval_secs": "300",
    "ai_stale_threshold_secs": "360",
    "ai_retry_attempts": "3",
    "ai_prompt_style": "default",
    "outlook_refresh_mins": "30",
}


class AISensitivityUpdate(BaseModel):
    """Partial update for AI sensitivity settings."""
    ai_model: Optional[str] = None
    ai_fallback_model: Optional[str] = None
    ai_temperature: Optional[float] = None
    ai_max_tokens: Optional[int] = None
    ai_min_solar_surplus_w: Optional[float] = None
    ai_min_amps: Optional[int] = None
    ai_max_amps: Optional[int] = None
    ai_call_interval_secs: Optional[int] = None
    ai_stale_threshold_secs: Optional[int] = None
    ai_retry_attempts: Optional[int] = None
    ai_prompt_style: Optional[str] = None
    outlook_refresh_mins: Optional[int] = None


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


@router.get("/admin/ollama-status")
async def ollama_status(
    admin: dict = Depends(get_admin_user),
):
    """Get detailed Ollama health status."""
    from services.ollama import check_ollama_health, is_ollama_healthy, _ollama_consecutive_failures, _ollama_last_check
    ok, detail = await check_ollama_health()
    return {
        "healthy": ok,
        "detail": detail,
        "consecutive_failures": _ollama_consecutive_failures,
        "last_check_secs_ago": round(time.time() - _ollama_last_check, 1) if _ollama_last_check > 0 else None,
    }


@router.post("/admin/ollama-restart")
async def ollama_restart(
    admin: dict = Depends(get_admin_user),
):
    """Manually trigger an Ollama container restart."""
    from services.ollama import _try_restart_ollama_container, check_ollama_health, warmup_model
    import asyncio

    restarted = await _try_restart_ollama_container()
    if not restarted:
        raise HTTPException(status_code=502, detail="Failed to restart Ollama container — Docker socket may not be mounted")

    # Wait for container to come back
    await asyncio.sleep(15)
    ok, detail = await check_ollama_health()
    if ok:
        asyncio.create_task(warmup_model())
    return {
        "restarted": True,
        "healthy_after_restart": ok,
        "detail": detail,
    }


@router.post("/admin/recalculate-sessions")
async def recalculate_sessions(
    admin: dict = Depends(get_admin_user),
):
    """Recalculate solar subsidy for sessions with 0% solar but valid snapshots.

    Uses snapshot data (solar_w, household_w, tesla_amps) to reconstruct
    solar-to-Tesla watts per tick, then integrates over time to get solar_kwh.
    Only fixes sessions where solar_pct is 0 or null but snapshots show charging.
    """
    from services.supabase_client import get_supabase_admin, get_session_snapshots

    sb = get_supabase_admin()
    user_id = admin["id"]

    # Find sessions with 0% solar that might be corrupted
    result = sb.table("sessions").select("*").eq("user_id", user_id).order("started_at", desc=True).limit(50).execute()
    sessions = result.data or []

    fixed = []
    skipped = []

    for sess in sessions:
        solar_pct = sess.get("solar_pct") or 0
        kwh_added = sess.get("kwh_added") or 0

        # Only fix sessions where solar is 0 but charging happened
        if solar_pct > 0 or kwh_added <= 0:
            skipped.append({"id": sess["id"], "reason": "solar_pct > 0 or no kwh_added"})
            continue

        # Get snapshots for this session
        started_at = sess["started_at"]
        ended_at = sess.get("ended_at")
        snapshots = get_session_snapshots(user_id, started_at, ended_at)

        if len(snapshots) < 2:
            skipped.append({"id": sess["id"], "reason": f"only {len(snapshots)} snapshots"})
            continue

        # Reconstruct solar_kwh from snapshots using proportional allocation
        # Same logic as _calc_solar_to_tesla_w in control_loop.py
        total_solar_kwh = 0.0
        has_home_battery = False  # conservative — assume no battery for reconstruction

        for i in range(1, len(snapshots)):
            prev_snap = snapshots[i - 1]
            snap = snapshots[i]

            # Time delta between snapshots
            from datetime import datetime as dt
            try:
                t_prev = dt.fromisoformat(prev_snap["timestamp"].replace("Z", "+00:00"))
                t_curr = dt.fromisoformat(snap["timestamp"].replace("Z", "+00:00"))
                elapsed_h = (t_curr - t_prev).total_seconds() / 3600.0
            except (ValueError, TypeError):
                continue

            if elapsed_h <= 0 or elapsed_h > 0.5:  # skip gaps > 30 min
                continue

            solar_w = snap.get("solar_w") or 0
            household_w = snap.get("household_w") or 0
            tesla_amps = snap.get("tesla_amps") or 0
            tesla_w = tesla_amps * 240.0

            if tesla_w <= 0:
                continue

            # Proportional allocation: solar share of Tesla charging
            # solar_to_tesla = min(tesla_w, max(0, solar_w - home_only_w))
            home_only_w = max(0, household_w - tesla_w)
            solar_available_for_tesla = max(0, solar_w - home_only_w)
            solar_to_tesla_w = min(tesla_w, solar_available_for_tesla)

            total_solar_kwh += solar_to_tesla_w * elapsed_h / 1000.0

        if total_solar_kwh <= 0:
            skipped.append({"id": sess["id"], "reason": "reconstructed solar_kwh is 0"})
            continue

        # Cap solar_kwh to kwh_added
        total_solar_kwh = min(total_solar_kwh, kwh_added)
        new_solar_pct = round((total_solar_kwh / kwh_added) * 100, 1)
        electricity_rate = sess.get("electricity_rate") or 10.83
        new_saved = round(total_solar_kwh * electricity_rate, 2)

        # Update the session
        sb.table("sessions").update({
            "solar_kwh": round(total_solar_kwh, 2),
            "solar_pct": new_solar_pct,
            "saved_amount": new_saved,
        }).eq("id", sess["id"]).execute()

        fixed.append({
            "id": sess["id"],
            "started_at": started_at,
            "snapshots_used": len(snapshots),
            "solar_kwh": round(total_solar_kwh, 2),
            "solar_pct": new_solar_pct,
            "saved_amount": new_saved,
            "kwh_added": kwh_added,
        })

    return {
        "fixed": len(fixed),
        "skipped": len(skipped),
        "details": fixed,
        "skipped_details": skipped[:10],  # limit output
    }


@router.get("/admin/ai-models")
async def list_ai_models(
    provider: str = "ollama",
    admin: dict = Depends(get_admin_user),
):
    """List available AI models for a given provider.

    - ollama: queries the local Ollama instance for installed models
    - openai: returns a curated list of popular models
    - anthropic: returns a curated list of popular models
    """
    if provider == "ollama":
        import httpx
        settings = get_settings()
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(f"{settings.ollama_host}/api/tags")
                resp.raise_for_status()
                models = resp.json().get("models", [])
                return {
                    "provider": "ollama",
                    "models": [
                        {
                            "id": m.get("name", ""),
                            "name": m.get("name", ""),
                            "size": m.get("size", 0),
                        }
                        for m in models
                    ],
                }
        except Exception as e:
            return {"provider": "ollama", "models": [], "error": str(e)}

    elif provider == "openai":
        return {
            "provider": "openai",
            "models": [
                {"id": "gpt-4o", "name": "GPT-4o"},
                {"id": "gpt-4o-mini", "name": "GPT-4o Mini"},
                {"id": "gpt-4-turbo", "name": "GPT-4 Turbo"},
                {"id": "gpt-4", "name": "GPT-4"},
                {"id": "gpt-3.5-turbo", "name": "GPT-3.5 Turbo"},
                {"id": "o1", "name": "o1"},
                {"id": "o1-mini", "name": "o1 Mini"},
                {"id": "o3-mini", "name": "o3 Mini"},
            ],
        }

    elif provider == "anthropic":
        return {
            "provider": "anthropic",
            "models": [
                {"id": "claude-sonnet-4-20250514", "name": "Claude Sonnet 4"},
                {"id": "claude-3-7-sonnet-20250219", "name": "Claude 3.7 Sonnet"},
                {"id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet"},
                {"id": "claude-3-5-haiku-20241022", "name": "Claude 3.5 Haiku"},
                {"id": "claude-3-haiku-20240307", "name": "Claude 3 Haiku"},
                {"id": "claude-3-opus-20240229", "name": "Claude 3 Opus"},
            ],
        }

    return {"provider": provider, "models": [], "error": f"Unknown provider: {provider}"}


@router.get("/admin/tessie-charges")
async def get_tessie_charges(
    days: int = 30,
    admin: dict = Depends(get_admin_user),
):
    """Fetch charge history from Tessie and compare with local DB sessions.

    Returns Tessie charges, DB sessions, and identified gaps (charges in Tessie
    that have no matching session in our DB).
    """
    import httpx
    from datetime import datetime, timezone, timedelta
    from services.supabase_client import get_supabase_admin, get_user_credentials

    user_id = admin["id"]
    creds = get_user_credentials(user_id)
    if not creds:
        raise HTTPException(status_code=400, detail="No Tessie credentials configured")
    api_key = creds.get("tessie_api_key", "")
    vin = creds.get("tessie_vin", "")
    if not api_key or not vin:
        raise HTTPException(status_code=400, detail="Tessie API key or VIN not set")

    # Fetch Tessie charges
    now = int(time.time())
    start = now - days * 86400
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"https://api.tessie.com/{vin}/charges",
                headers={"Authorization": f"Bearer {api_key}"},
                params={"from": start, "to": now, "distance_format": "km", "format": "json"},
            )
            resp.raise_for_status()
            tessie_charges = resp.json().get("results", [])
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Tessie API error: {e}")

    # Fetch DB sessions
    sb = get_supabase_admin()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    db_result = sb.table("sessions").select("*").eq("user_id", user_id).gte("started_at", cutoff).order("started_at", desc=True).execute()
    db_sessions = db_result.data or []

    # Compare: for each Tessie charge, check if there's a matching DB session
    # (within 10 min of start time and similar kWh)
    gaps = []
    matched = []
    for tc in tessie_charges:
        tc_start = datetime.fromtimestamp(tc["started_at"], tz=timezone.utc)
        tc_end = datetime.fromtimestamp(tc["ended_at"], tz=timezone.utc) if tc.get("ended_at") else None
        tc_kwh = tc.get("energy_added", 0)

        found_match = False
        for ds in db_sessions:
            ds_start = datetime.fromisoformat(ds["started_at"])
            diff_mins = abs((tc_start - ds_start).total_seconds()) / 60
            if diff_mins < 10:
                found_match = True
                matched.append({
                    "tessie_id": tc["id"],
                    "db_id": ds["id"],
                    "tessie_kwh": tc_kwh,
                    "db_kwh": ds.get("kwh_added", 0),
                    "start_diff_mins": round(diff_mins, 1),
                })
                break

        if not found_match and tc_kwh >= 0.5:  # Ignore trivial charges
            gaps.append({
                "tessie_id": tc["id"],
                "started_at": tc_start.isoformat(),
                "ended_at": tc_end.isoformat() if tc_end else None,
                "kwh_added": tc_kwh,
                "start_soc": tc.get("starting_battery", 0),
                "end_soc": tc.get("ending_battery", 0),
                "location": tc.get("location", ""),
                "duration_mins": round((tc["ended_at"] - tc["started_at"]) / 60) if tc.get("ended_at") else None,
            })

    return {
        "tessie_total": len(tessie_charges),
        "db_total": len(db_sessions),
        "matched": len(matched),
        "gaps": gaps,
        "matches": matched,
    }


@router.post("/admin/backfill-from-tessie")
async def backfill_from_tessie(
    admin: dict = Depends(get_admin_user),
    days: int = 30,
):
    """Backfill missing sessions from Tessie charge history.

    Fetches Tessie charges, identifies gaps vs local DB, and creates
    session records for charges that were missed by the session tracker.
    """
    import httpx
    from datetime import datetime, timezone, timedelta
    from services.supabase_client import get_supabase_admin, get_user_credentials, get_user_settings as _get_settings

    user_id = admin["id"]
    creds = get_user_credentials(user_id)
    if not creds:
        raise HTTPException(status_code=400, detail="No Tessie credentials configured")
    api_key = creds.get("tessie_api_key", "")
    vin = creds.get("tessie_vin", "")
    if not api_key or not vin:
        raise HTTPException(status_code=400, detail="Tessie API key or VIN not set")

    settings = _get_settings(user_id)
    electricity_rate = float(settings.get("electricity_rate", "10.83"))

    # Fetch Tessie charges
    now = int(time.time())
    start = now - days * 86400
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"https://api.tessie.com/{vin}/charges",
                headers={"Authorization": f"Bearer {api_key}"},
                params={"from": start, "to": now, "distance_format": "km", "format": "json"},
            )
            resp.raise_for_status()
            tessie_charges = resp.json().get("results", [])
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Tessie API error: {e}")

    # Fetch existing DB sessions
    sb = get_supabase_admin()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    db_result = sb.table("sessions").select("id,started_at").eq("user_id", user_id).gte("started_at", cutoff).execute()
    db_sessions = db_result.data or []
    db_starts = [datetime.fromisoformat(ds["started_at"]) for ds in db_sessions]

    backfilled = []
    skipped = []

    for tc in tessie_charges:
        tc_start = datetime.fromtimestamp(tc["started_at"], tz=timezone.utc)
        tc_end = datetime.fromtimestamp(tc["ended_at"], tz=timezone.utc) if tc.get("ended_at") else None
        tc_kwh = tc.get("energy_added", 0)

        # Skip trivial charges
        if tc_kwh < 0.5:
            skipped.append({"tessie_id": tc["id"], "reason": f"trivial ({tc_kwh} kWh)"})
            continue

        # Check if already in DB
        has_match = any(abs((tc_start - ds).total_seconds()) < 600 for ds in db_starts)
        if has_match:
            skipped.append({"tessie_id": tc["id"], "reason": "already in DB"})
            continue

        # Create session record from Tessie data
        duration_mins = round((tc["ended_at"] - tc["started_at"]) / 60) if tc.get("ended_at") else 0
        session_data = {
            "user_id": user_id,
            "started_at": tc_start.isoformat(),
            "ended_at": tc_end.isoformat() if tc_end else None,
            "duration_mins": duration_mins,
            "kwh_added": round(tc_kwh, 2),
            "start_soc": tc.get("starting_battery", 0),
            "end_soc": tc.get("ending_battery", 0),
            "target_soc": tc.get("ending_battery", 80),
            "electricity_rate": electricity_rate,
            # Solar data unavailable from Tessie — mark as backfilled
            "solar_kwh": 0,
            "solar_pct": 0,
            "grid_kwh": 0,
            "saved_amount": 0,
            "subsidy_calculation_method": "tessie_backfill",
        }
        try:
            sb.table("sessions").insert(session_data).execute()
            backfilled.append({
                "tessie_id": tc["id"],
                "started_at": tc_start.isoformat(),
                "kwh_added": tc_kwh,
                "soc": f"{tc.get('starting_battery',0)} → {tc.get('ending_battery',0)}",
            })
        except Exception as e:
            skipped.append({"tessie_id": tc["id"], "reason": f"insert error: {e}"})

    return {
        "backfilled": len(backfilled),
        "skipped": len(skipped),
        "details": backfilled,
        "skipped_details": skipped[:10],
    }


@router.post("/admin/verify-api-key")
async def verify_api_key_endpoint(
    body: dict,
    admin: dict = Depends(get_admin_user),
):
    """Verify an OpenAI or Anthropic API key.

    Body: {"provider": "openai"|"anthropic", "api_key": "sk-..."}
    Returns: {"valid": bool, "detail": str}
    """
    provider = body.get("provider", "")
    api_key = body.get("api_key", "")
    if not provider or not api_key:
        return {"valid": False, "detail": "Provider and API key required"}
    if provider not in ("openai", "anthropic"):
        return {"valid": False, "detail": f"Unknown provider: {provider}"}

    from services.ai_provider import verify_api_key
    valid, detail = await verify_api_key(provider, api_key)
    return {"valid": valid, "detail": detail}


@router.get("/admin/check")
async def check_admin(
    admin: dict = Depends(get_admin_user),
):
    """Check if the current user is an admin."""
    return {"is_admin": True, "email": admin["email"]}
