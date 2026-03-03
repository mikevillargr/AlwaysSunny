"""Session history and current session endpoints."""

from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, Query, HTTPException

from middleware.auth import get_current_user
from services.supabase_client import (
    get_sessions, get_sessions_count, get_active_session, get_session_snapshots,
    get_supabase_admin, close_open_sessions, get_user_settings,
)

logger = logging.getLogger(__name__)

router = APIRouter()

PHANTOM_AGE_HOURS = 12  # Hard fallback — sessions older than this are always closed


def _get_active_tracker_session_id(user_id: str) -> int | None:
    """Return the DB session ID that the in-memory tracker considers active, or None."""
    try:
        from scheduler.control_loop import get_user_state
        state = get_user_state(user_id)
        if state and state.session_tracker.active:
            return state.session_tracker.active.db_session_id
    except Exception:
        pass
    return None


def _reconstruct_from_snapshots(user_id: str, started_at: str, electricity_rate: float) -> dict:
    """Reconstruct session stats from snapshots when the tracker failed to write them.

    Returns a dict of fields to update on the session row, or empty dict if
    no usable snapshots exist.
    """
    sb = get_supabase_admin()
    snaps = (
        sb.table("snapshots")
        .select("solar_w, grid_w, tesla_soc, tesla_amps, timestamp")
        .eq("user_id", user_id)
        .gte("timestamp", started_at)
        .order("timestamp")
        .execute()
    ).data or []

    charging = [s for s in snaps if (s.get("tesla_amps") or 0) > 0]
    if not charging:
        return {}

    n = len(charging)
    socs = [s["tesla_soc"] for s in snaps if s.get("tesla_soc")]
    soc_end = max(socs) if socs else None

    avg_amps = sum(s.get("tesla_amps", 0) for s in charging) / n
    avg_kw = avg_amps * 230 / 1000  # L2 charging ~230V
    duration_hrs = n / 60.0  # ~1 snapshot per minute
    kwh_added = round(avg_kw * duration_hrs, 2)

    total_solar_w = sum(s.get("solar_w", 0) for s in charging)
    total_grid_w = sum(s.get("grid_w", 0) for s in charging)
    total_power = total_solar_w + total_grid_w
    solar_frac = total_solar_w / total_power if total_power > 0 else 0
    solar_kwh = round(kwh_added * solar_frac, 2)
    grid_kwh = round(kwh_added - solar_kwh, 2)
    solar_pct = round(solar_frac * 100, 1)
    saved = round(solar_kwh * electricity_rate, 2)

    last_ts = charging[-1].get("timestamp", "")

    return {
        "kwh_added": kwh_added,
        "solar_kwh": solar_kwh,
        "grid_kwh": grid_kwh,
        "solar_pct": solar_pct,
        "saved_amount": saved,
        "end_soc": soc_end,
        "duration_mins": round(duration_hrs * 60),
        "_last_charging_ts": last_ts,
    }


def _close_phantom_sessions(user_id: str) -> int:
    """Close any open DB sessions that are NOT the actively-tracked session.

    Two layers:
    1. If the in-memory tracker has an active session, keep that one open
       and close every other open session immediately.
    2. If the tracker has NO active session, close all open sessions.

    When closing, if the session has null stats, reconstruct from snapshots
    so no charging data is ever lost.
    """
    sb = get_supabase_admin()

    result = (
        sb.table("sessions")
        .select("id, started_at, kwh_added, solar_kwh, duration_mins, electricity_rate")
        .eq("user_id", user_id)
        .is_("ended_at", "null")
        .order("started_at", desc=True)
        .execute()
    )
    open_sessions = result.data or []
    if not open_sessions:
        return 0

    active_db_id = _get_active_tracker_session_id(user_id)
    now = datetime.now(timezone.utc)
    closed = 0

    for s in open_sessions:
        sid = s["id"]
        # Never close the actively-tracked session
        if sid == active_db_id:
            continue

        # Any non-tracked open session should be closed
        started = datetime.fromisoformat(s["started_at"].replace("Z", "+00:00"))

        try:
            update: dict = {}
            # If session has no stats, reconstruct from snapshots
            if not s.get("kwh_added"):
                rate = float(s.get("electricity_rate") or 10.83)
                reconstructed = _reconstruct_from_snapshots(user_id, s["started_at"], rate)
                if reconstructed:
                    last_ts = reconstructed.pop("_last_charging_ts", "")
                    update.update(reconstructed)
                    # Use last charging snapshot as ended_at (more accurate)
                    if last_ts:
                        update["ended_at"] = last_ts
                    else:
                        update["ended_at"] = now.isoformat()
                    logger.info(
                        f"[{user_id[:8]}] Reconstructed phantom session {sid}: "
                        f"kwh={reconstructed.get('kwh_added')} solar_pct={reconstructed.get('solar_pct')}%"
                    )
                else:
                    update["ended_at"] = now.isoformat()
            else:
                dur = s.get("duration_mins") or 0
                ended = started + timedelta(minutes=dur) if dur > 0 else now
                update["ended_at"] = ended.isoformat()

            sb.table("sessions").update(update).eq("id", sid).execute()
            closed += 1
            logger.info(f"[{user_id[:8]}] Auto-closed phantom session {sid} "
                        f"(started {s['started_at']})")
        except Exception as e:
            logger.warning(f"[{user_id[:8]}] Failed to close phantom session {sid}: {e}")

    return closed


def _period_start_iso(period: str, tz_name: str) -> str | None:
    """Return UTC ISO-8601 start string for the given period filter."""
    if not period or period == "all":
        return None
    try:
        from zoneinfo import ZoneInfo
        local_now = datetime.now(ZoneInfo(tz_name))
    except Exception:
        local_now = datetime.now(timezone.utc)

    if period == "week":
        start = (local_now - timedelta(days=local_now.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
    elif period == "month":
        start = local_now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif period == "year":
        start = local_now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        return None
    return start.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")


@router.get("/sessions")
async def list_sessions(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    period: str = Query("all"),
    user: dict = Depends(get_current_user),
):
    """Get session history for the authenticated user.

    For the active (in-progress) session, overlays live stats from the
    in-memory session tracker so the History page mirrors the dashboard.
    """
    _close_phantom_sessions(user["id"])
    settings = get_user_settings(user["id"])
    tz_name = settings.get("timezone", "Asia/Manila")
    started_after = _period_start_iso(period, tz_name)
    sessions = get_sessions(user["id"], limit=limit, offset=offset, started_after=started_after)

    # Overlay live session tracker data onto the active session
    active_db_id = _get_active_tracker_session_id(user["id"])
    try:
        from scheduler.control_loop import get_user_state
        state = get_user_state(user["id"])
        if state and state.session_tracker.active:
            live = state.session_tracker.active
            for s in sessions:
                if not s.get("ended_at") and s["id"] == live.db_session_id:
                    s["kwh_added"] = round(live.kwh_added, 2)
                    s["solar_kwh"] = round(live.solar_kwh, 2)
                    s["grid_kwh"] = round(live.grid_kwh, 2)
                    s["solar_pct"] = round(live.solar_pct, 1)
                    s["saved_amount"] = round(live.saved_amount, 2)
                    s["end_soc"] = live.current_soc
                    s["duration_mins"] = live.elapsed_mins
                    s["subsidy_calculation_method"] = live.subsidy_calculation_method
                    break
    except Exception as e:
        logger.warning(f"[{user['id'][:8]}] Failed to overlay live session data: {e}")

    # Mark each session with is_live flag — only true if tracker confirms it
    for s in sessions:
        s["is_live"] = (not s.get("ended_at") and s["id"] == active_db_id)

    total = get_sessions_count(user["id"], started_after=started_after)
    return {"sessions": sessions, "count": len(sessions), "total": total, "offset": offset, "limit": limit}


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
