"""GET /api/reports/summary — aggregate savings & energy stats."""

from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, Query

from middleware.auth import get_current_user
from services.supabase_client import get_supabase_admin, get_user_settings

logger = logging.getLogger(__name__)

router = APIRouter()

CO2_KG_PER_LITER = 2.31  # kg CO2 per liter of gasoline


def _period_start(period: str, tz_name: str) -> str | None:
    """Return the UTC ISO-8601 start string for the given period, or None for 'all'.

    Returns a string (not datetime) so it works directly with Supabase .gte().
    """
    if period == "all":
        return None

    try:
        from zoneinfo import ZoneInfo
        local_now = datetime.now(ZoneInfo(tz_name))
    except Exception:
        local_now = datetime.now(timezone.utc)

    if period == "week":
        start_local = (local_now - timedelta(days=local_now.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
    elif period == "month":
        start_local = local_now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif period == "year":
        start_local = local_now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        return None

    utc_start = start_local.astimezone(timezone.utc)
    iso = utc_start.strftime("%Y-%m-%dT%H:%M:%S+00:00")
    logger.info(f"[Reports] period={period} tz={tz_name} → start={iso}")
    return iso


def _compute_savings(
    sessions: list[dict],
    electricity_rate: float,
    gas_price: float,
    ice_eff: float,
    ev_eff: float,
) -> dict:
    """Compute aggregate savings from a list of session rows."""
    total_kwh = 0.0
    total_solar_kwh = 0.0
    total_grid_kwh = 0.0

    for s in sessions:
        total_kwh += float(s.get("kwh_added") or 0)
        total_solar_kwh += float(s.get("solar_kwh") or 0)
        total_grid_kwh += float(s.get("grid_kwh") or 0)

    # If grid_kwh isn't tracked well, derive it
    if total_grid_kwh <= 0 and total_kwh > 0:
        total_grid_kwh = max(0, total_kwh - total_solar_kwh)

    # Distance & fuel equivalents
    km_driven = (total_kwh * 1000.0 / ev_eff) if ev_eff > 0 else 0
    gas_liters = (km_driven / ice_eff) if ice_eff > 0 else 0
    gas_equivalent_cost = gas_liters * gas_price

    # Costs
    ev_charging_cost = total_grid_kwh * electricity_rate
    solar_savings = total_solar_kwh * electricity_rate
    ev_vs_gas_savings = gas_equivalent_cost - (total_kwh * electricity_rate)
    total_savings = solar_savings + max(0, ev_vs_gas_savings)

    # CO2
    co2_avoided_kg = gas_liters * CO2_KG_PER_LITER

    # Average solar %
    avg_solar_pct = round((total_solar_kwh / total_kwh) * 100, 1) if total_kwh > 0 else 0

    # Cost per km
    cost_per_km_ev = (total_kwh * electricity_rate / km_driven) if km_driven > 0 else 0
    cost_per_km_gas = (gas_price / ice_eff) if ice_eff > 0 else 0

    return {
        "total_sessions": len(sessions),
        "total_kwh_charged": round(total_kwh, 1),
        "total_solar_kwh": round(total_solar_kwh, 1),
        "total_grid_kwh": round(total_grid_kwh, 1),
        "avg_solar_pct": avg_solar_pct,
        "solar_savings": round(solar_savings, 0),
        "ev_charging_cost": round(ev_charging_cost, 0),
        "gas_equivalent_cost": round(gas_equivalent_cost, 0),
        "ev_vs_gas_savings": round(max(0, ev_vs_gas_savings), 0),
        "total_savings": round(total_savings, 0),
        "equivalent_km_driven": round(km_driven, 0),
        "equivalent_liters_saved": round(gas_liters, 1),
        "co2_avoided_kg": round(co2_avoided_kg, 1),
        "cost_per_km_ev": round(cost_per_km_ev, 2),
        "cost_per_km_gas": round(cost_per_km_gas, 2),
    }


def _monthly_breakdown(
    sessions: list[dict],
    electricity_rate: float,
    gas_price: float,
    ice_eff: float,
    ev_eff: float,
) -> list[dict]:
    """Group sessions by month and compute per-month stats."""
    buckets: dict[str, list[dict]] = {}
    for s in sessions:
        started = s.get("started_at", "")
        if not started:
            continue
        # Extract YYYY-MM
        month_key = started[:7]
        buckets.setdefault(month_key, []).append(s)

    result = []
    for month_key in sorted(buckets.keys()):
        stats = _compute_savings(buckets[month_key], electricity_rate, gas_price, ice_eff, ev_eff)
        stats["month"] = month_key
        result.append(stats)
    return result


@router.get("/reports/summary")
async def reports_summary(
    period: str = Query("all", regex="^(week|month|year|all)$"),
    user: dict = Depends(get_current_user),
):
    """Aggregate savings and energy stats for the given period."""
    user_id = user["id"]
    settings = get_user_settings(user_id)

    electricity_rate = float(settings.get("electricity_rate", 10.83))
    gas_price = float(settings.get("gas_price_per_liter", 65.0))
    ice_eff = float(settings.get("ice_efficiency_km_per_liter", 10.0))
    ev_eff = float(settings.get("ev_efficiency_wh_per_km", 150.0))
    tz_name = settings.get("timezone", "Asia/Manila")

    sb = get_supabase_admin()

    # Fetch completed sessions for the period
    query = (
        sb.table("sessions")
        .select("started_at, ended_at, kwh_added, solar_kwh, grid_kwh, solar_pct, saved_amount, electricity_rate")
        .eq("user_id", user_id)
        .not_.is_("ended_at", "null")
        .order("started_at", desc=False)
    )

    start = _period_start(period, tz_name)
    if start:
        query = query.gte("started_at", start)

    result = query.execute()
    sessions = [s for s in (result.data or []) if float(s.get("kwh_added") or 0) > 0]

    summary = _compute_savings(sessions, electricity_rate, gas_price, ice_eff, ev_eff)
    summary["period"] = period
    summary["monthly_breakdown"] = _monthly_breakdown(sessions, electricity_rate, gas_price, ice_eff, ev_eff)

    # Currency for frontend display
    summary["currency_code"] = settings.get("currency_code", "PHP")
    summary["electricity_rate"] = electricity_rate
    summary["gas_price_per_liter"] = gas_price
    summary["ice_efficiency_km_per_liter"] = ice_eff
    summary["ev_efficiency_wh_per_km"] = ev_eff

    return summary
