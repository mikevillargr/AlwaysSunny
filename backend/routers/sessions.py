"""Session history and current session endpoints."""

from fastapi import APIRouter, Depends, Query

from middleware.auth import get_current_user
from services.supabase_client import get_sessions, get_active_session

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


@router.get("/session/current")
async def current_session(user: dict = Depends(get_current_user)):
    """Get the currently active charging session, or null."""
    session = get_active_session(user["id"])
    return {"session": session}
