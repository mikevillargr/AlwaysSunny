"""Session history and current session endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, HTTPException

from middleware.auth import get_current_user
from services.supabase_client import get_sessions, get_active_session, get_session_snapshots

router = APIRouter()


@router.get("/sessions")
async def list_sessions(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
):
    """Get session history for the authenticated user."""
    sessions = get_sessions(user["id"], limit=limit, offset=offset)
    return {"sessions": sessions, "count": len(sessions)}


@router.get("/sessions/{session_id}/details")
async def session_details(
    session_id: int,
    user: dict = Depends(get_current_user),
):
    """Get enriched session details with snapshot aggregates.

    Returns avg/peak solar, avg grid, avg household, avg battery,
    avg charging amps, and snapshot count for the session.
    """
    user_id = user["id"]
    # Find the session
    sessions = get_sessions(user_id, limit=100, offset=0)
    session = next((s for s in sessions if s["id"] == session_id), None)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    started_at = session["started_at"]
    ended_at = session.get("ended_at")

    snapshots = get_session_snapshots(user_id, started_at, ended_at)
    if not snapshots:
        return {"session_id": session_id, "snapshot_count": 0}

    n = len(snapshots)
    solar_values = [s.get("solar_w") or 0 for s in snapshots]
    grid_values = [s.get("grid_w") or 0 for s in snapshots]
    household_values = [s.get("household_w") or 0 for s in snapshots]
    battery_values = [s.get("battery_w") or 0 for s in snapshots]
    amps_values = [s.get("tesla_amps") or 0 for s in snapshots]
    soc_values = [s.get("tesla_soc") or 0 for s in snapshots]

    return {
        "session_id": session_id,
        "snapshot_count": n,
        "avg_solar_w": round(sum(solar_values) / n, 0),
        "peak_solar_w": round(max(solar_values), 0),
        "min_solar_w": round(min(solar_values), 0),
        "avg_grid_w": round(sum(grid_values) / n, 0),
        "avg_household_w": round(sum(household_values) / n, 0),
        "avg_battery_w": round(sum(battery_values) / n, 0),
        "avg_charging_amps": round(sum(amps_values) / n, 1),
        "peak_charging_amps": max(amps_values),
        "soc_start": soc_values[0] if soc_values else None,
        "soc_end": soc_values[-1] if soc_values else None,
    }


@router.get("/session/current")
async def current_session(user: dict = Depends(get_current_user)):
    """Get the currently active charging session, or null."""
    session = get_active_session(user["id"])
    return {"session": session}
