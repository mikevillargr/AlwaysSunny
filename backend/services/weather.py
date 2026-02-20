"""Open-Meteo API integration — weather and solar forecast."""

from __future__ import annotations

from datetime import datetime
import httpx

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
TIMEOUT = 15


class SolarForecast:
    """Parsed solar/weather forecast from Open-Meteo."""

    def __init__(self, raw: dict):
        self.raw = raw
        daily = raw.get("daily", {})
        hourly = raw.get("hourly", {})

        # Sunrise/sunset
        self.sunrise = daily.get("sunrise", [""])[0]
        self.sunset = daily.get("sunset", [""])[0]

        # Hourly data
        times = hourly.get("time", [])
        irradiance = hourly.get("shortwave_radiation", [])
        cloud_cover = hourly.get("cloud_cover", [])
        temperatures = hourly.get("temperature_2m", [])

        self.hourly = []
        for i, t in enumerate(times):
            self.hourly.append({
                "hour": t.split("T")[1][:5] if "T" in t else t,
                "irradiance_wm2": irradiance[i] if i < len(irradiance) else 0,
                "cloud_cover_pct": cloud_cover[i] if i < len(cloud_cover) else 0,
                "temperature_c": temperatures[i] if i < len(temperatures) else 0,
            })

        # Calculate peak window (hours where irradiance > 70% of max)
        max_irr = max((h["irradiance_wm2"] for h in self.hourly), default=0)
        self.peak_hours = [
            h for h in self.hourly
            if h["irradiance_wm2"] > max_irr * 0.7 and max_irr > 0
        ]
        self.peak_window_start = self.peak_hours[0]["hour"] if self.peak_hours else ""
        self.peak_window_end = self.peak_hours[-1]["hour"] if self.peak_hours else ""

    def hours_until_sunset(self, timezone: str = "Asia/Manila") -> float:
        """Calculate hours remaining until sunset from now."""
        try:
            from zoneinfo import ZoneInfo
        except ImportError:
            from backports.zoneinfo import ZoneInfo
        try:
            now = datetime.now(ZoneInfo(timezone))
            sunset_dt = datetime.fromisoformat(self.sunset)
            if sunset_dt.tzinfo is None:
                sunset_dt = sunset_dt.replace(tzinfo=ZoneInfo(timezone))
            diff = (sunset_dt - now).total_seconds() / 3600
            return max(0, round(diff, 1))
        except (ValueError, TypeError):
            return 0.0

    def to_api_response(self, efficiency_factor: float = 0.85, timezone: str = "Asia/Manila") -> dict:
        """Convert to the Forecast shape expected by the frontend.

        Args:
            efficiency_factor: Panel efficiency (default 0.85 = 85%)
            timezone: IANA timezone for correct hour matching
        """
        # Filter to daylight hours only (irradiance > 0)
        daylight_hours = [
            {
                "hour": h["hour"],
                "irradiance_wm2": h["irradiance_wm2"],
                "expected_yield_w": round(h["irradiance_wm2"] * efficiency_factor),
                "cloud_cover_pct": h["cloud_cover_pct"],
                "temperature_c": h.get("temperature_c", 0),
            }
            for h in self.hourly
            if h["irradiance_wm2"] > 0
        ]

        # Current temperature from closest hour (works day and night)
        try:
            from zoneinfo import ZoneInfo
            now_hour_str = datetime.now(ZoneInfo(timezone)).strftime("%H:00")
        except Exception:
            now_hour_str = datetime.now().strftime("%H:00")
        current_temp = 0.0
        if self.hourly:
            closest = min(self.hourly, key=lambda h: abs(
                int(h["hour"].split(":")[0]) - int(now_hour_str.split(":")[0])
            ))
            current_temp = closest.get("temperature_c", 0)

        return {
            "sunrise": self.sunrise.split("T")[1][:5] if "T" in self.sunrise else self.sunrise,
            "sunset": self.sunset.split("T")[1][:5] if "T" in self.sunset else self.sunset,
            "peak_window_start": self.peak_window_start,
            "peak_window_end": self.peak_window_end,
            "hours_until_sunset": self.hours_until_sunset(timezone),
            "current_temperature_c": current_temp,
            "hourly": daylight_hours,
        }

    def build_irradiance_curve_for_ai(self) -> str:
        """Build irradiance curve string for AI prompt context."""
        now_hour = datetime.now().strftime("%H:00")
        future_hours = [
            h for h in self.hourly
            if h["hour"] >= now_hour and h["irradiance_wm2"] > 0
        ]
        if not future_hours:
            return "No remaining solar hours today."

        lines = [f"  {h['hour']}: {h['irradiance_wm2']}W/m² (cloud: {h['cloud_cover_pct']}%)" for h in future_hours]
        return "\n".join(lines)


async def fetch_forecast(lat: float, lon: float, timezone: str = "Asia/Manila") -> SolarForecast:
    """Fetch today's solar/weather forecast from Open-Meteo.

    Args:
        lat: Latitude
        lon: Longitude
        timezone: IANA timezone string

    Returns:
        SolarForecast with parsed hourly data
    """
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.get(
            OPEN_METEO_URL,
            params={
                "latitude": lat,
                "longitude": lon,
                "hourly": "cloud_cover,shortwave_radiation,temperature_2m",
                "daily": "sunrise,sunset",
                "timezone": timezone,
                "forecast_days": 1,
            },
        )
        resp.raise_for_status()
        return SolarForecast(resp.json())


async def test_weather_connection(lat: float = 14.5995, lon: float = 120.9842) -> tuple[bool, str]:
    """Test Open-Meteo connectivity. Returns (success, detail_message)."""
    try:
        forecast = await fetch_forecast(lat, lon)
        return True, f"Connected — sunrise: {forecast.sunrise}, sunset: {forecast.sunset}"
    except httpx.HTTPError as e:
        return False, f"HTTP error: {str(e)}"
    except Exception as e:
        return False, f"Unexpected error: {str(e)}"
