"""SolaxCloud API integration — fetch realtime inverter data."""

from __future__ import annotations

import time
import httpx

SOLAX_BASE_URL = "https://www.solaxcloud.com/proxyApp/proxy/api/getRealtimeInfo.do"
TIMEOUT = 15


class SolaxData:
    """Parsed Solax inverter data."""

    def __init__(self, raw: dict):
        result = raw.get("result", {})
        self.raw = result

        # PV power (sum all MPPT strings)
        self.solar_w = (
            float(result.get("powerdc1") or 0)
            + float(result.get("powerdc2") or 0)
            + float(result.get("powerdc3") or 0)
            + float(result.get("powerdc4") or 0)
        )

        # Grid power: positive = export, negative = import
        feedin = float(result.get("feedinpower") or 0)
        self.grid_import_w = -feedin if feedin < 0 else 0.0
        self.grid_export_w = feedin if feedin > 0 else 0.0

        # Battery
        self.battery_soc = int(result.get("soc") or 0)
        self.battery_w = float(result.get("batPower") or 0)

        # Household demand = solar - feedin (feedin can be negative)
        self.household_demand_w = self.solar_w - feedin

        # Inverter AC output
        self.ac_power_w = float(result.get("acpower") or 0)

        # Today's yield
        self.yield_today_kwh = float(result.get("yieldtoday") or 0)

        # Cumulative grid import (kWh) — used for session grid tracking
        self.consume_energy_kwh = float(result.get("consumeenergy") or 0)

        # Data freshness
        self.upload_time = result.get("uploadTime", "")
        self.inverter_status = int(result.get("inverterStatus") or 0)

        # Track when we fetched this
        self.fetched_at = time.time()

    @property
    def data_age_secs(self) -> int:
        """Seconds since this data was fetched."""
        return int(time.time() - self.fetched_at)

    def to_dict(self) -> dict:
        return {
            "solar_w": self.solar_w,
            "grid_import_w": self.grid_import_w,
            "grid_export_w": self.grid_export_w,
            "battery_soc": self.battery_soc,
            "battery_w": self.battery_w,
            "household_demand_w": self.household_demand_w,
            "ac_power_w": self.ac_power_w,
            "yield_today_kwh": self.yield_today_kwh,
            "upload_time": self.upload_time,
            "inverter_status": self.inverter_status,
            "data_age_secs": self.data_age_secs,
        }


async def fetch_solax_data(token_id: str, dongle_sn: str) -> SolaxData:
    """Fetch realtime data from SolaxCloud API.

    Args:
        token_id: SolaxCloud API token
        dongle_sn: WiFi dongle serial number (NOT inverter SN)

    Returns:
        SolaxData with parsed inverter readings

    Raises:
        httpx.HTTPError: on network/API errors
        ValueError: if response indicates failure
    """
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.get(
            SOLAX_BASE_URL,
            params={"tokenId": token_id, "sn": dongle_sn},
        )
        resp.raise_for_status()
        data = resp.json()

        if not data.get("success", False):
            raise ValueError(f"SolaxCloud API error: {data.get('exception', 'Unknown error')}")

        return SolaxData(data)


async def test_solax_connection(token_id: str, dongle_sn: str) -> tuple[bool, str]:
    """Test SolaxCloud connectivity. Returns (success, detail_message)."""
    try:
        result = await fetch_solax_data(token_id, dongle_sn)
        return True, f"Connected — solar: {result.solar_w}W, last update: {result.upload_time}"
    except httpx.HTTPError as e:
        return False, f"HTTP error: {str(e)}"
    except ValueError as e:
        return False, str(e)
    except Exception as e:
        return False, f"Unexpected error: {str(e)}"
