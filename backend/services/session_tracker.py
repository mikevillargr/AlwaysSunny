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
    electricity_rate: float = 10.83

    # Live-updated each tick
    kwh_added: float = 0.0
    grid_kwh: float = 0.0
    solar_kwh: float = 0.0
    solar_pct: float = 0.0
    saved_amount: float = 0.0
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
        charge_energy_added: float = 0.0,
    ) -> None:
        """Update session stats from latest Solax + Tesla data.

        Args:
            current_consume_energy_kwh: Solax cumulative grid import (consumeenergy)
            current_soc: Tesla battery_level %
            charge_energy_added: Tesla charge_energy_added (kWh added this charge session)
        """
        self.current_soc = current_soc

        # Grid kWh used this session
        self.grid_kwh = max(0, current_consume_energy_kwh - self.start_grid_kwh)

        # Total kWh added — use Tesla's own counter (much more accurate than SoC delta)
        self.kwh_added = charge_energy_added if charge_energy_added > 0 else 0.0

        # Solar kWh = total added - grid used
        self.solar_kwh = max(0, self.kwh_added - self.grid_kwh)

        # Solar subsidy percentage
        if self.kwh_added > 0:
            self.solar_pct = round((self.solar_kwh / self.kwh_added) * 100, 1)
        else:
            self.solar_pct = 0.0

        # Money saved
        self.saved_amount = round(self.solar_kwh * self.electricity_rate, 2)

    def to_api_dict(self) -> dict:
        """Return session data for /api/status response."""
        return {
            "started_at": datetime.fromtimestamp(self.start_time, tz=timezone.utc).isoformat() if self.start_time else "",
            "elapsed_mins": self.elapsed_mins,
            "kwh_added": round(self.kwh_added, 1),
            "solar_kwh": round(self.solar_kwh, 1),
            "grid_kwh": round(self.grid_kwh, 1),
            "solar_pct": self.solar_pct,
            "saved_amount": round(self.saved_amount, 0),
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
            "saved_amount": round(self.saved_amount, 2),
            "electricity_rate": self.electricity_rate,
            "end_soc": self.current_soc,
        }


class SessionTracker:
    """Manages session lifecycle for a single user."""

    def __init__(self):
        self.active: ActiveSession | None = None
        self._prev_plugged_in: bool = False
        self._recovered: bool = False

    def recover_from_db(
        self,
        db_session: dict | None,
        start_grid_kwh: float,
        electricity_rate: float,
    ) -> None:
        """Recover an active session from the DB after backend restart.

        Args:
            db_session: The active session row from the DB.
            start_grid_kwh: The persisted consumeenergy value at session start.
            electricity_rate: Current Meralco rate.
        """
        if not db_session or self._recovered:
            return
        self._recovered = True
        self.active = ActiveSession(
            user_id=db_session["user_id"],
            db_session_id=db_session["id"],
            start_time=datetime.fromisoformat(db_session["started_at"]).timestamp(),
            start_soc=db_session.get("start_soc", 0),
            target_soc=db_session.get("target_soc", 80),
            start_grid_kwh=start_grid_kwh,
            electricity_rate=electricity_rate,
        )
        self._prev_plugged_in = True

    def tick(
        self,
        user_id: str,
        plugged_in: bool,
        at_home: bool,
        charging_state: str,
        tesla_soc: int,
        target_soc: int,
        consume_energy_kwh: float,
        electricity_rate: float,
        charge_energy_added: float = 0.0,
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
                electricity_rate=electricity_rate,
            )
            self._prev_plugged_in = True
            return "started", {
                "user_id": user_id,
                "started_at": datetime.now(timezone.utc).isoformat(),
                "start_soc": tesla_soc,
                "target_soc": target_soc,
                "electricity_rate": electricity_rate,
            }

        # Detect session end
        # Only end on physical unplug or Tesla reporting "Complete".
        # Do NOT end on tesla_soc >= target_soc — user may change target mid-session
        # and this would cause premature session termination + stop_charging conflicts.
        if self.active is not None:
            should_end = (
                not plugged_in
                or charging_state == "Complete"
            )

            if should_end:
                # Final update before ending — use latest rate
                self.active.electricity_rate = electricity_rate
                self.active.update(consume_energy_kwh, tesla_soc, charge_energy_added)
                final_data = self.active.to_db_final()
                db_id = self.active.db_session_id
                self.active = None
                self._prev_plugged_in = plugged_in
                return "ended", {"db_session_id": db_id, **final_data}

            # Session still active — update stats and keep rate current
            self.active.electricity_rate = electricity_rate
            self.active.update(consume_energy_kwh, tesla_soc, charge_energy_added)
            self._prev_plugged_in = plugged_in
            return "updated", self.active.to_api_dict()

        self._prev_plugged_in = plugged_in
        return None, None
