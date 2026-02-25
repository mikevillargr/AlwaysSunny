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
    subsidy_calculation_method: str = "estimated"

    # Live-updated each tick
    kwh_added: float = 0.0
    grid_kwh: float = 0.0
    solar_kwh: float = 0.0
    solar_pct: float = 0.0
    saved_amount: float = 0.0
    current_soc: int = 0
    _last_tick_time: float = 0.0  # for accumulating solar kWh tick-by-tick
    _prev_charge_energy_added: float = 0.0  # detect Tesla counter resets
    _kwh_added_offset: float = 0.0  # accumulated kWh from previous charge segments

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
        solar_to_tesla_w: float = 0.0,
    ) -> None:
        """Update session stats from latest Solax + Tesla data.

        Args:
            current_consume_energy_kwh: Solax cumulative grid import (consumeenergy)
            current_soc: Tesla battery_level %
            charge_energy_added: Tesla charge_energy_added (kWh added this charge session)
            solar_to_tesla_w: Watts of solar currently going to Tesla (proportional)
        """
        self.current_soc = current_soc
        now = time.time()

        # Grid kWh used this session (whole-house, kept for reference)
        self.grid_kwh = max(0, current_consume_energy_kwh - self.start_grid_kwh)

        # Total kWh added — use Tesla's own counter (much more accurate than SoC delta)
        # Tesla resets charge_energy_added to 0 when charging is interrupted and resumed.
        # Detect resets and accumulate across segments to preserve session totals.
        if charge_energy_added < self._prev_charge_energy_added - 0.1:
            # Counter reset detected — save what we had before the reset
            self._kwh_added_offset += self._prev_charge_energy_added
        self._prev_charge_energy_added = charge_energy_added
        self.kwh_added = self._kwh_added_offset + (charge_energy_added if charge_energy_added > 0 else 0.0)

        # Accumulate solar kWh tick-by-tick using proportional allocation
        # solar_to_tesla_w × elapsed_hours since last tick
        if self._last_tick_time > 0 and solar_to_tesla_w > 0:
            elapsed_h = (now - self._last_tick_time) / 3600.0
            self.solar_kwh += solar_to_tesla_w * elapsed_h / 1000.0
        self._last_tick_time = now

        # Cap solar_kwh to never exceed total kwh_added (but never reduce it below
        # its current value due to a temporary kwh_added dip from a counter reset)
        if self.kwh_added > 0 and self.solar_kwh > self.kwh_added:
            self.solar_kwh = self.kwh_added

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
            "subsidy_calculation_method": self.subsidy_calculation_method,
        }


class SessionTracker:
    """Manages session lifecycle for a single user."""

    def __init__(self):
        self.active: ActiveSession | None = None
        self._prev_plugged_in: bool = False
        self._prev_charging_state: str = ""  # track Charging/Stopped/Complete transitions
        self._recovered: bool = False

    def recover_from_db(
        self,
        db_session: dict | None,
        start_grid_kwh: float,
        electricity_rate: float,
        recovered_kwh_added: float = 0.0,
        recovered_solar_kwh: float = 0.0,
    ) -> None:
        """Recover an active session from the DB after backend restart.

        Args:
            db_session: The active session row from the DB.
            start_grid_kwh: The persisted consumeenergy value at session start.
            electricity_rate: Current electricity rate.
            recovered_kwh_added: Pre-computed kWh added from snapshot reconstruction.
            recovered_solar_kwh: Pre-computed solar kWh from snapshot reconstruction.
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
            _last_tick_time=time.time(),
            # Restore accumulated values so they survive restarts and counter resets.
            # _kwh_added_offset holds energy from before the current Tesla counter segment.
            _kwh_added_offset=recovered_kwh_added,
            solar_kwh=recovered_solar_kwh,
        )
        # Set kwh_added so API dict is correct immediately
        if recovered_kwh_added > 0:
            self.active.kwh_added = recovered_kwh_added
            if recovered_solar_kwh > 0:
                self.active.solar_pct = round((recovered_solar_kwh / recovered_kwh_added) * 100, 1)
                self.active.saved_amount = round(recovered_solar_kwh * electricity_rate, 2)
        self._prev_plugged_in = True
        self._prev_charging_state = "Charging"

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
        subsidy_calculation_method: str = "estimated",
        solar_to_tesla_w: float = 0.0,
    ) -> tuple[str | None, dict | None]:
        """Called every control loop tick. Returns (event, data).

        event: "started" | "updated" | "ended" | None
        data: session dict for DB write (on "ended") or API response (on "updated")
        """
        # Detect session start:
        # 1. Transition from unplugged to plugged at home, OR
        # 2. Car stays plugged but transitions to "Charging" from a non-charging state
        #    (e.g., Complete/Stopped → Charging when a new charge begins next day)
        # Guard: never start a new session if one is already active
        is_new_plug = plugged_in and at_home and not self._prev_plugged_in
        is_new_charge = (
            plugged_in and at_home
            and charging_state == "Charging"
            and self._prev_charging_state not in ("", "Charging")
        )
        if (is_new_plug or is_new_charge) and self.active is None:
            now = time.time()
            self.active = ActiveSession(
                user_id=user_id,
                start_time=now,
                start_soc=tesla_soc,
                target_soc=target_soc,
                start_grid_kwh=consume_energy_kwh,
                electricity_rate=electricity_rate,
                subsidy_calculation_method=subsidy_calculation_method,
                _last_tick_time=now,
            )
            self._prev_plugged_in = True
            self._prev_charging_state = charging_state
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
                self.active.update(consume_energy_kwh, tesla_soc, charge_energy_added, solar_to_tesla_w)
                final_data = self.active.to_db_final()
                db_id = self.active.db_session_id
                self.active = None
                self._prev_plugged_in = plugged_in
                self._prev_charging_state = charging_state
                return "ended", {"db_session_id": db_id, **final_data}

            # Session still active — update stats and keep rate current
            self.active.electricity_rate = electricity_rate
            self.active.update(consume_energy_kwh, tesla_soc, charge_energy_added, solar_to_tesla_w)
            self._prev_plugged_in = plugged_in
            self._prev_charging_state = charging_state
            return "updated", self.active.to_api_dict()

        self._prev_plugged_in = plugged_in
        self._prev_charging_state = charging_state
        return None, None
