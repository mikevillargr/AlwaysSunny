"""AI-optimized endpoints for external AI harness integration."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime, timezone

from middleware.api_key_auth import get_current_user_flexible
from scheduler.control_loop import get_user_state, build_status_response, register_user_loop
from services.supabase_client import (
    get_sessions, get_active_session, get_user_settings, 
    upsert_user_setting, get_user_credentials
)
from services.tessie import set_charging_amps, start_charging, stop_charging
from routers.health import get_health
from models.database import StatusResponse

router = APIRouter()


class AIContextResponse(BaseModel):
    """Aggregated context for AI harness - everything in one call."""
    status: StatusResponse
    active_session: Optional[dict]
    recent_sessions: list[dict]
    settings: dict
    health: dict
    location: Optional[dict]
    timestamp: str


class AICommandRequest(BaseModel):
    """Unified command interface for AI harness."""
    action: Literal["set_charging_amps", "start_charging", "stop_charging", "update_settings"]
    params: dict


class AIRecommendationRequest(BaseModel):
    """AI charging recommendation submission."""
    recommended_amps: int
    reasoning: str
    confidence: Literal["low", "medium", "high"]
    trigger_reason: str


@router.get("/ai/context", response_model=AIContextResponse)
async def get_ai_context(user: dict = Depends(get_current_user_flexible)):
    """Get aggregated system context for AI harness.
    
    Returns everything an AI needs in one call:
    - Current status (solar, Tesla, battery, charging state)
    - Active session details
    - Recent session history (last 10)
    - User settings and preferences
    - System health status
    """
    user_id = user["id"]
    
    # Ensure control loop is running
    register_user_loop(user_id)
    
    # Get status
    import asyncio
    status = None
    for attempt in range(3):
        state = get_user_state(user_id)
        if state and (state.tesla is not None or state.solax is not None):
            status = build_status_response(state)
            break
        if attempt < 2:
            await asyncio.sleep(0.5)
    
    if not status:
        # Fallback to sample status
        from routers.status import get_sample_status
        status = get_sample_status(user_id)
    
    # Get active session
    active_session = get_active_session(user_id)
    
    # Get recent sessions
    recent_sessions = get_sessions(user_id, offset=0, limit=10)
    
    # Get settings
    settings = get_user_settings(user_id)
    
    # Get health
    health_response = await get_health(user)
    health = health_response.dict()
    
    # Get location from control loop state
    location = None
    state = get_user_state(user_id)
    if state and state.location:
        location = {
            "latitude": state.location.latitude,
            "longitude": state.location.longitude,
            "is_home": state.location.is_home,
            "detection_method": state.location.detection_method,
        }
    
    return AIContextResponse(
        status=status,
        active_session=active_session,
        recent_sessions=recent_sessions,
        settings=settings,
        health=health,
        location=location,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


@router.post("/ai/command")
async def execute_ai_command(
    body: AICommandRequest,
    user: dict = Depends(get_current_user_flexible),
):
    """Execute a control command from AI harness.
    
    Supported actions:
    - set_charging_amps: {"amps": int}
    - start_charging: {}
    - stop_charging: {}
    - update_settings: {"key": "value", ...}
    """
    user_id = user["id"]
    settings = get_user_settings(user_id)
    creds = get_user_credentials(user_id) or {}
    
    # Check Tessie enabled for charging commands
    tessie_enabled = settings.get("tessie_enabled", "true").lower() == "true"
    
    if body.action == "set_charging_amps":
        if not tessie_enabled:
            raise HTTPException(status_code=400, detail="Tessie is disabled")
        
        amps = body.params.get("amps")
        if not amps or not isinstance(amps, int) or amps < 0 or amps > 32:
            raise HTTPException(status_code=400, detail="Invalid amps value (must be 0-32)")
        
        api_key = creds.get("tessie_api_key")
        vin = creds.get("tessie_vin")
        
        if not api_key or not vin:
            raise HTTPException(status_code=400, detail="Tessie credentials not configured")
        
        try:
            await set_charging_amps(api_key, vin, amps)
            return {"message": f"Charging amps set to {amps}A", "amps": amps}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to set charging amps: {str(e)}")
    
    elif body.action == "start_charging":
        if not tessie_enabled:
            raise HTTPException(status_code=400, detail="Tessie is disabled")
        
        api_key = creds.get("tessie_api_key")
        vin = creds.get("tessie_vin")
        
        if not api_key or not vin:
            raise HTTPException(status_code=400, detail="Tessie credentials not configured")
        
        try:
            await start_charging(api_key, vin)
            return {"message": "Charging started"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to start charging: {str(e)}")
    
    elif body.action == "stop_charging":
        if not tessie_enabled:
            raise HTTPException(status_code=400, detail="Tessie is disabled")
        
        api_key = creds.get("tessie_api_key")
        vin = creds.get("tessie_vin")
        
        if not api_key or not vin:
            raise HTTPException(status_code=400, detail="Tessie credentials not configured")
        
        try:
            await stop_charging(api_key, vin)
            return {"message": "Charging stopped"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to stop charging: {str(e)}")
    
    elif body.action == "update_settings":
        if not body.params:
            raise HTTPException(status_code=400, detail="No settings provided")
        
        for key, value in body.params.items():
            upsert_user_setting(user_id, key, str(value))
        
        return {"message": f"Updated {len(body.params)} setting(s)", "updated": list(body.params.keys())}
    
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {body.action}")


@router.get("/ai/sessions")
async def get_ai_sessions(
    user: dict = Depends(get_current_user_flexible),
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    min_solar_pct: Optional[float] = Query(None, ge=0, le=100),
    min_kwh: Optional[float] = Query(None, ge=0),
):
    """Get session history with AI-friendly filters.
    
    Query params:
    - limit: Number of sessions to return (1-100, default 10)
    - offset: Pagination offset (default 0)
    - min_solar_pct: Filter sessions with solar % >= this value
    - min_kwh: Filter sessions with kWh added >= this value
    """
    user_id = user["id"]
    
    sessions = get_sessions(user_id, offset=offset, limit=limit)
    
    # Apply filters
    if min_solar_pct is not None:
        sessions = [s for s in sessions if s.get("solar_pct", 0) >= min_solar_pct]
    
    if min_kwh is not None:
        sessions = [s for s in sessions if s.get("kwh_added", 0) >= min_kwh]
    
    return {
        "sessions": sessions,
        "count": len(sessions),
        "offset": offset,
        "limit": limit,
    }


@router.post("/ai/recommendation")
async def submit_ai_recommendation(
    body: AIRecommendationRequest,
    user: dict = Depends(get_current_user_flexible),
):
    """Submit an AI charging recommendation.
    
    This stores the recommendation in the control loop state for display
    and potential execution.
    """
    user_id = user["id"]
    
    # Validate amps
    if body.recommended_amps < 0 or body.recommended_amps > 32:
        raise HTTPException(status_code=400, detail="Invalid amps value (must be 0-32)")
    
    # Get control loop state
    state = get_user_state(user_id)
    if not state:
        raise HTTPException(status_code=400, detail="Control loop not initialized")
    
    # Update AI recommendation in state
    from scheduler.control_loop import AIRecommendation
    state.ai_recommendation = AIRecommendation(
        recommended_amps=body.recommended_amps,
        reasoning=body.reasoning,
        confidence=body.confidence,
        trigger_reason=body.trigger_reason,
        timestamp=datetime.now(timezone.utc).timestamp(),
    )
    
    return {
        "message": "AI recommendation submitted",
        "recommended_amps": body.recommended_amps,
        "confidence": body.confidence,
    }
