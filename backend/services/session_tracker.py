"""Session tracking — detect start/end, compute solar subsidy."""

from __future__ import annotations

import time
from datetime import datetime, timezone
from dataclasses import dataclass, field


@dataclass
class ActiveSession:
    """In-memory state for a currently active charging session."""

    user_id: str
    db_session_id: int | None = None
    start_time: float = 0.0
    start_soc: int = 0
    target_soc: int = 80
    start_grid_kwh: float = 0.0  # cumulative consumeenergy at session start
    meralco_rate: float = 10.83

    # Live-updated each tick
    kwh_added: float = 0.0
    grid_kwh: float = 0.0
    solar_kwh: float = 0.0
    solar_pct: float = 0.0
    saved_pesos: float = 0.0
    current_soc: int = 0

    @property
    def elapsed_mins(self) -> int:
        if self.start_time == 0:
            return 0
        return int((time.time() - self.start_time) / 60)

    def update(
        self,
        current_consume_energy_kwh: float,
        current_soc: int,
        battery_capacity_kwh: float = 75.0,
    ) -> None:
        """Update session stats from latest Solax + Tesla data.

        Args:
            current_consume_energy_kwh: Solax cumulative grid import (consumeenergy)
            current_soc: Tesla battery_level %
            battery_capacity_kwh: Tesla battery capacity (default 75 kWh)
        """
        self.current_soc = current_soc

        # Grid kWh used this session
        self.grid_kwh = max(0, current_consume_energy_kwh - self.start_grid_kwh)

        # Total kWh added to Tesla
        soc_delta = max(0, current_soc - self.start_soc)
        self.kwh_added = (soc_delta / 100.0) * battery_capacity_kwh

        # Solar kWh = total added - grid used
        self.solar_kwh = max(0, self.kwh_added - self.grid_kwh)

        # Solar subsidy percentage
        if self.kwh_added > 0:
            self.solar_pct = round((self.solar_kwh / self.kwh_added) * 100, 1)
        else:
            self.solar_pct = 0.0

        # Money saved
        self.saved_pesos = round(self.solar_kwh * self.meralco_rate, 2)

    def to_api_dict(self) -> dict:
        """Return session data for /api/status response."""
        return {
            "started_at": datetime.fromtimestamp(self.start_time, tz=timezone.utc).isoformat() if self.start_time else "",
            "elapsed_mins": self.elapsed_mins,
            "kwh_added": round(self.kwh_added, 1),
            "solar_kwh": round(self.solar_kwh, 1),
            "grid_kwh": round(self.grid_kwh, 1),
            "solar_pct": self.solar_pct,
            "saved_pesos": round(self.saved_pesos, 0),
        }

    def to_db_final(self) -> dict:
        """Return final session data for writing to sessions table."""
        return {
            "ended_at": datetime.now(timezone.utc).isoformat(),
            "duration_mins": self.elapsed_mins,
            "kwh_added": round(self.kwh_added, 2),
            "solar_kwh": round(self.solar_kwh, 2),
            "grid_kwh": round(self.grid_kwh, 2),
            "solar_pct": round(self.solar_pct, 1),
            "saved_pesos": round(self.saved_pesos, 2),
            "meralco_rate": self.meralco_rate,
            "end_soc": self.current_soc,
        }


class SessionTracker:
    """Manages session lifecycle for a single user."""

    def __init__(self):
        self.active: ActiveSession | None = None
        self._prev_plugged_in: bool = False

    def tick(
        self,
        user_id: str,
        plugged_in: bool,
        at_home: bool,
        charging_state: str,
        tesla_soc: int,
        target_soc: int,
        consume_energy_kwh: float,
        meralco_rate: float,
    ) -> tuple[str | None, dict | None]:
        """Called every control loop tick. Returns (event, data).

        event: "started" | "updated" | "ended" | None
        data: session dict for DB write (on "ended") or API response (on "updated")
        """
        # Detect session start: transition from unplugged to plugged at home
        if plugged_in and at_home and not self._prev_plugged_in:
            self.active = ActiveSession(
                user_id=user_id,
                start_time=time.time(),
                start_soc=tesla_soc,
                target_soc=target_soc,
                start_grid_kwh=consume_energy_kwh,
                meralco_rate=meralco_rate,
            )
            self._prev_plugged_in = True
            return "started", {
                "user_id": user_id,
                "started_at": datetime.now(timezone.utc).isoformat(),
                "start_soc": tesla_soc,
                "target_soc": target_soc,
                "meralco_rate": meralco_rate,
            }

        # Detect session end
        if self.active is not None:
            should_end = (
                not plugged_in
                or charging_state == "Complete"
                or tesla_soc >= target_soc
            )

            if should_end:
                # Final update before ending
                self.active.update(consume_energy_kwh, tesla_soc)
                final_data = self.active.to_db_final()
                db_id = self.active.db_session_id
                self.active = None
                self._prev_plugged_in = plugged_in
                return "ended", {"db_session_id": db_id, **final_data}

            # Session still active — update stats
            self.active.update(consume_energy_kwh, tesla_soc)
            self._prev_plugged_in = plugged_in
            return "updated", self.active.to_api_dict()

        self._prev_plugged_in = plugged_in
        return None, None
