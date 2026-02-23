"""Session history and current session endpoints."""

from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, Query, HTTPException

from middleware.auth import get_current_user
from services.supabase_client import (
    get_sessions, get_active_session, get_session_snapshots, get_supabase_admin,
    close_open_sessions,
)

logger = logging.getLogger(__name__)

router = APIRouter()

PHANTOM_AGE_HOURS = 12  # Sessions open longer than this are considered phantom


def _close_phantom_sessions(user_id: str) -> int:
    """Auto-close sessions that have no ended_at but started > PHANTOM_AGE_HOURS ago.

    Only closes stale sessions — not the currently active one.
    """
    sb = get_supabase_admin()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=PHANTOM_AGE_HOURS)

    result = (
        sb.table("sessions")
        .select("id, started_at, duration_mins")
        .eq("user_id", user_id)
        .is_("ended_at", "null")
        .lt("started_at", cutoff.isoformat())
        .execute()
    )

    closed = 0
    for s in result.data or []:
        try:
            started = datetime.fromisoformat(s["started_at"].replace("Z", "+00:00"))
            dur = s.get("duration_mins") or 60
            ended = started + timedelta(minutes=dur)
            sb.table("sessions").update({
                "ended_at": ended.isoformat(),
            }).eq("id", s["id"]).execute()
            closed += 1
            logger.info(f"[{user_id[:8]}] Auto-closed phantom session {s['id']} "
                        f"(started {s['started_at']})")
        except Exception as e:
            logger.warning(f"[{user_id[:8]}] Failed to close phantom session {s['id']}: {e}")

    return closed


@router.get("/sessions")
async def list_sessions(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
):
    """Get session history for the authenticated user."""
    _close_phantom_sessions(user["id"])
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
