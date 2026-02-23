"""Tessie API integration — Tesla vehicle state and charging commands."""

from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)

TESSIE_BASE_URL = "https://api.tessie.com"
TIMEOUT = 15


class TeslaState:
    """Parsed Tesla vehicle state from Tessie API."""

    def __init__(self, raw: dict):
        self.raw = raw
        charge = raw.get("charge_state", {})
        drive = raw.get("drive_state", {})

        # Charging state
        self.charge_port_connected = bool(charge.get("charge_port_door_open", False))
        self.charging_state = charge.get("charging_state", "Disconnected")
        self.battery_level = int(charge.get("battery_level") or 0)
        self.charge_current_request = int(charge.get("charge_current_request") or 0)
        self.charge_energy_added = float(charge.get("charge_energy_added") or 0)
        self.charge_rate = float(charge.get("charge_rate") or 0)
        self.charger_actual_current = int(charge.get("charger_actual_current") or 0)
        self.charger_voltage = int(charge.get("charger_voltage") or 0)
        self.charge_limit_soc = int(charge.get("charge_limit_soc") or 80)
        self.minutes_to_full_charge = int(charge.get("minutes_to_full_charge") or 0)
        self.time_to_full_charge = float(charge.get("time_to_full_charge") or 0.0)

        # Charging power in kW
        self.charging_kw = (self.charger_actual_current * self.charger_voltage) / 1000.0

        # Location
        self.latitude = float(drive.get("latitude") or 0)
        self.longitude = float(drive.get("longitude") or 0)

    def to_dict(self) -> dict:
        return {
            "charge_port_connected": self.charge_port_connected,
            "charging_state": self.charging_state,
            "tesla_soc": self.battery_level,
            "tesla_charging_amps": self.charger_actual_current,
            "tesla_charging_kw": round(self.charging_kw, 1),
            "charge_energy_added": self.charge_energy_added,
            "charge_limit_soc": self.charge_limit_soc,
            "latitude": self.latitude,
            "longitude": self.longitude,
        }


class TeslaLocation:
    """Parsed Tesla location from Tessie API."""

    def __init__(self, raw: dict):
        self.latitude = float(raw.get("latitude") or 0)
        self.longitude = float(raw.get("longitude") or 0)
        self.address = raw.get("address", "")
        self.saved_location = raw.get("saved_location", "")

    @property
    def is_at_home(self) -> bool:
        """Layer 1: Check if Tessie's named location is 'Home'."""
        return self.saved_location.lower() == "home"


def _headers(api_key: str) -> dict:
    return {"Authorization": f"Bearer {api_key}"}


async def fetch_tesla_state(api_key: str, vin: str) -> TeslaState:
    """Fetch cached Tesla state (no sleep impact).

    Args:
        api_key: Tessie API key
        vin: Tesla VIN

    Returns:
        TeslaState with parsed vehicle data
    """
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.get(
            f"{TESSIE_BASE_URL}/{vin}/state",
            headers=_headers(api_key),
            params={"use_cache": "true"},
        )
        resp.raise_for_status()
        return TeslaState(resp.json())


async def fetch_tesla_location(api_key: str, vin: str) -> TeslaLocation:
    """Fetch Tesla location with named location info."""
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.get(
            f"{TESSIE_BASE_URL}/{vin}/location",
            headers=_headers(api_key),
        )
        resp.raise_for_status()
        return TeslaLocation(resp.json())


async def set_charging_amps(api_key: str, vin: str, amps: int) -> dict:
    """Set Tesla charging amps. Valid range: 5-32A.

    Do not send values below 5 — use stop_charging instead.
    """
    if amps < 5 or amps > 32:
        raise ValueError(f"Amps must be 5-32, got {amps}")

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{TESSIE_BASE_URL}/{vin}/command/set_charging_amps",
            headers=_headers(api_key),
            params={"amps": amps, "retry_duration": 40, "wait_for_completion": "true"},
        )
        resp.raise_for_status()
        result = resp.json()
        logger.info(f"[Tessie] set_charging_amps({amps}A) → {result}")
        return result


async def start_charging(api_key: str, vin: str) -> dict:
    """Start Tesla charging."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{TESSIE_BASE_URL}/{vin}/command/start_charging",
            headers=_headers(api_key),
            params={"retry_duration": 40, "wait_for_completion": "true"},
        )
        resp.raise_for_status()
        result = resp.json()
        logger.info(f"[Tessie] start_charging → {result}")
        return result


async def stop_charging(api_key: str, vin: str) -> dict:
    """Stop Tesla charging."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{TESSIE_BASE_URL}/{vin}/command/stop_charging",
            headers=_headers(api_key),
            params={"retry_duration": 40, "wait_for_completion": "true"},
        )
        resp.raise_for_status()
        result = resp.json()
        logger.info(f"[Tessie] stop_charging → {result}")
        return result


def is_at_home_gps(
    tesla_lat: float,
    tesla_lon: float,
    home_lat: float,
    home_lon: float,
    radius_km: float = 0.1,
) -> bool:
    """Layer 2: GPS proximity check (fallback if named location unavailable).

    Uses simple Euclidean approximation — accurate enough at ~100m scale.
    """
    import math
    # Approximate degrees to km at Philippine latitudes (~14°N)
    lat_diff_km = abs(tesla_lat - home_lat) * 111.0
    lon_diff_km = abs(tesla_lon - home_lon) * 111.0 * math.cos(math.radians(home_lat))
    distance_km = math.sqrt(lat_diff_km ** 2 + lon_diff_km ** 2)
    return distance_km <= radius_km


async def test_tessie_connection(api_key: str, vin: str) -> tuple[bool, str]:
    """Test Tessie connectivity. Returns (success, detail_message)."""
    try:
        state = await fetch_tesla_state(api_key, vin)
        return True, f"Connected — SoC: {state.battery_level}%, state: {state.charging_state}"
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            return False, "Invalid API key"
        return False, f"HTTP {e.response.status_code}: {e.response.text[:100]}"
    except httpx.HTTPError as e:
        return False, f"HTTP error: {str(e)}"
    except Exception as e:
        return False, f"Unexpected error: {str(e)}"
