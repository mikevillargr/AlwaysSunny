"""Supabase client initialization and database helpers."""

from __future__ import annotations

from functools import lru_cache
from supabase import create_client, Client

from config import get_settings


@lru_cache()
def get_supabase_admin() -> Client:
    """Get Supabase client with service_role key (bypasses RLS, for backend use)."""
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_key)


def get_supabase_client(access_token: str) -> Client:
    """Get Supabase client authenticated as a specific user (respects RLS)."""
    settings = get_settings()
    client = create_client(settings.supabase_url, settings.supabase_anon_key)
    client.auth.set_session(access_token, "")
    return client


# ---------------------------------------------------------------------------
# Settings helpers
# ---------------------------------------------------------------------------

def get_user_settings(user_id: str) -> dict:
    """Fetch all settings for a user. Returns dict of key-value pairs."""
    sb = get_supabase_admin()
    result = sb.table("settings").select("*").eq("user_id", user_id).execute()
    return {row["key"]: row["value"] for row in result.data}


def upsert_user_setting(user_id: str, key: str, value: str) -> None:
    """Insert or update a single setting for a user."""
    sb = get_supabase_admin()
    sb.table("settings").upsert({
        "user_id": user_id,
        "key": key,
        "value": value,
    }, on_conflict="user_id,key").execute()


# ---------------------------------------------------------------------------
# Snapshot helpers
# ---------------------------------------------------------------------------

def save_snapshot(user_id: str, snapshot: dict) -> None:
    """Write an energy snapshot to the snapshots table."""
    sb = get_supabase_admin()
    snapshot["user_id"] = user_id
    sb.table("snapshots").insert(snapshot).execute()


def get_session_snapshots(user_id: str, started_at: str, ended_at: str | None) -> list[dict]:
    """Fetch snapshots within a session's time range."""
    sb = get_supabase_admin()
    query = (
        sb.table("snapshots")
        .select("solar_w, grid_w, battery_soc, battery_w, household_w, tesla_amps, tesla_soc, ai_recommended_amps, mode, timestamp")
        .eq("user_id", user_id)
        .gte("timestamp", started_at)
    )
    if ended_at:
        query = query.lte("timestamp", ended_at)
    result = query.order("timestamp").execute()
    return result.data


# ---------------------------------------------------------------------------
# Session helpers
# ---------------------------------------------------------------------------

def start_session(user_id: str, session_data: dict) -> dict:
    """Create a new charging session record. Returns the created row."""
    sb = get_supabase_admin()
    session_data["user_id"] = user_id
    result = sb.table("sessions").insert(session_data).execute()
    return result.data[0] if result.data else {}


def end_session(session_id: int, final_data: dict) -> dict:
    """Update a session with final stats on session end."""
    sb = get_supabase_admin()
    result = sb.table("sessions").update(final_data).eq("id", session_id).execute()
    return result.data[0] if result.data else {}


def get_sessions(user_id: str, limit: int = 20, offset: int = 0) -> list[dict]:
    """Fetch session history for a user, newest first."""
    sb = get_supabase_admin()
    result = (
        sb.table("sessions")
        .select("*")
        .eq("user_id", user_id)
        .order("started_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return result.data


def get_active_session(user_id: str) -> dict | None:
    """Get the currently active session (ended_at is null)."""
    sb = get_supabase_admin()
    result = (
        sb.table("sessions")
        .select("*")
        .eq("user_id", user_id)
        .is_("ended_at", "null")
        .order("started_at", desc=True)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


# ---------------------------------------------------------------------------
# Daily summary helpers
# ---------------------------------------------------------------------------

def upsert_daily_summary(user_id: str, summary: dict) -> None:
    """Insert or update a daily summary."""
    sb = get_supabase_admin()
    summary["user_id"] = user_id
    sb.table("daily_summary").upsert(summary, on_conflict="user_id,date").execute()


# ---------------------------------------------------------------------------
# User credentials helpers
# ---------------------------------------------------------------------------

def get_user_credentials(user_id: str) -> dict | None:
    """Fetch encrypted API credentials for a user."""
    sb = get_supabase_admin()
    result = (
        sb.table("user_credentials")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def upsert_user_credentials(user_id: str, credentials: dict) -> None:
    """Insert or update encrypted API credentials for a user."""
    sb = get_supabase_admin()
    credentials["user_id"] = user_id
    sb.table("user_credentials").upsert(
        credentials, on_conflict="user_id"
    ).execute()
