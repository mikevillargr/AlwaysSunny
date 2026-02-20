# AlwaysSunny — Data Flows

## Overview

This document describes what data flows where, in what order, and on what schedule. It bridges the structural view in ARCHITECTURE.md with the behavioural view in SPEC.md.

---

## Polling Schedule Summary

| Source | Interval | Triggered by | Data retained |
|---|---|---|---|
| Solax Cloud API | Every 60–90s | APScheduler control loop | Last reading + rolling buffer (5 readings) |
| Tessie `/state` | Every 60–90s | APScheduler control loop | Last reading only |
| Tessie `/location` | Every 60–90s | APScheduler control loop | Last reading only |
| Open-Meteo | Every 60 minutes | APScheduler hourly job | Full day forecast cached in memory + DB |
| Ollama AI | Every 5 min baseline + event triggers | Control loop evaluator | Last recommendation cached (amps + reasoning + confidence + trigger) |
| Efficiency coefficient | Nightly (midnight) | APScheduler nightly job | Written to settings table |
| Daily summary | Nightly (midnight) | APScheduler nightly job | Written to daily_summary table |

---

## Flow 1 — Control Loop (every 60–90 seconds)

This is the core heartbeat of the app. Every tick:

```
1. FETCH Solax data
   └─ GET https://www.solaxcloud.com/proxyApp/proxy/api/getRealtimeInfo
   └─ Extract: powerdc1, powerdc2, feedinpower, consumeenergy, batPower, soc, uploadTime
   └─ Derive:
        solar_yield_w     = powerdc1 + powerdc2
        household_demand_w = solar_yield_w - feedinpower
        available_for_tesla_w = solar_yield_w - household_demand_w
   └─ Check uploadTime → if stale (> 5 min from now): flag warning, hold setpoint, exit loop

2. FETCH Tessie state (cached, no car wake)
   └─ GET https://api.tessie.com/{vin}/state?use_cache=true
   └─ Extract: charge_port_connected, charging_state, battery_level,
               charge_current_request, charger_actual_current

3. FETCH Tessie location
   └─ GET https://api.tessie.com/{vin}/location
   └─ Extract: latitude, longitude, saved_location

4. UPDATE rolling buffers
   └─ solar_buffer.append(available_for_tesla_w)   ← deque maxlen=3 (~3 min smoothing)
   └─ trend_buffer.append(solar_yield_w)            ← deque maxlen=5 (~5 min trend)
   └─ Compute solar_trend: "rising" | "stable" | "falling"
   └─ Compute smoothed_available_w = mean(solar_buffer)

5. RUN home stack detection
   └─ Layer 1: saved_location == "Home" → location_confirmed = True
   └─ Layer 2 (if saved_location is null):
        distance = haversine(lat, lon, home_lat, home_lon)
        location_confirmed = distance < 0.1 km
   └─ If location_confirmed = False → set mode = "Suspended – Charging Away", exit

6. CHECK hard stops (in order)
   └─ if current_time >= sunset OR < sunrise → mode = "Suspended – Night", suspend AI, exit
   └─ if not charge_port_connected → mode = "Suspended – Unplugged", exit
   └─ if not location_confirmed → mode = "Suspended – Charging Away", exit
   └─ if daily_grid_imported_kwh >= grid_import_budget → stop_charging(), notify, exit

7. COMPUTE rule-based setpoint
   └─ target_amps = smoothed_available_w / 240
   └─ target_amps = clamp(target_amps, 5, 32)
   └─ if target_amps < 5 → stop_charging(), exit

8. EVALUATE AI setpoint
   └─ if ai_optimization_enabled:
        if ai_last_recommended_amps is not None AND ai_age < 6 min:
            final_amps = ai_last_recommended_amps   ← use cached AI
        else:
            final_amps = target_amps                ← AI stale, fall back to rule-based
   └─ if NOT ai_optimization_enabled:
        final_amps = target_amps                    ← rule-based only

9. SEND Tesla command (only if setpoint changed)
   └─ if final_amps == 0 AND charging_state == "Charging":
        POST /command/stop_charging
   └─ if final_amps > 0 AND charging_state != "Charging":
        POST /command/start_charging
        POST /command/set_charging_amps with final_amps
   └─ if final_amps != charge_current_request:
        POST /command/set_charging_amps with final_amps

10. UPDATE session tracker
    └─ (see Flow 3 — Session Tracking)

11. STORE snapshot to DB
    └─ INSERT into snapshots:
        timestamp, solar_w, grid_w, battery_soc, battery_w,
        household_w, tesla_amps=final_amps, tesla_soc=battery_level,
        ai_recommended_amps, ai_reasoning, ai_confidence, ai_trigger, mode

12. PUSH state to frontend via /api/status
    └─ Frontend polls this endpoint every 30s
    └─ Returns: all live values + AI state + session stats + mode
```

---

## Flow 2 — AI Evaluation (event-driven, min 90s gap)

Runs independently of the control loop, triggered by schedule or events:

```
TRIGGER CONDITIONS (any one fires an AI call):
  - 5 minutes elapsed since last AI call (baseline)
  - solar_trend changed direction since last call
  - tesla_soc crossed a gap threshold (75% or 95% of gap closed)
  - budget_remaining crossed 80% or 95% of daily limit
  - departure_time is now < 60 min away AND soc < target_soc
  - user tapped "Refresh" on AI banner (manual trigger)
  - last ai_recommended_amps is > 6 min old (stale)
  Minimum gap between calls: 90 seconds

ON TRIGGER:
1. Assemble prompt context:
   └─ From Solax buffer: solar_w, solar_trend, household_demand_w, grid_import_w, battery_soc
   └─ From Tessie: current_soc, target_soc, soc_gap, kwh_needed
   └─ From settings: charging_strategy, grid_import_budget, max_grid_import_w,
                     default_charging_amps, departure_time
   └─ From Open-Meteo cache: irradiance_curve (remaining hours), cloud_cover_curve,
                               sunrise, sunset, hrs_until_sunset, peak_window
   └─ From settings: efficiency_coefficient (per hour bucket), days_of_history
   └─ Derive: expected_yield_curve (irradiance × efficiency_coeff per hour)
   └─ From session: session_start_time, elapsed_mins, kwh_added, session_solar_pct
   └─ trigger_reason: which condition fired this call

2. POST to Ollama:
   └─ POST http://{OLLAMA_HOST}/api/generate
   └─ model: qwen2.5:7b
   └─ prompt: full assembled prompt (see SPEC.md prompt template)
   └─ Timeout: 30 seconds

3. PARSE response:
   └─ Extract JSON: { recommended_amps, reasoning, confidence, trigger_reason }
   └─ Validate: recommended_amps is integer 0–32
   └─ If parse fails or invalid → keep last recommendation, set ai_status = "parse_error"

4. ON SUCCESS:
   └─ Update in-memory cache: ai_last_recommended_amps, ai_reasoning, ai_confidence,
                               ai_trigger_reason, ai_last_updated = now
   └─ Control loop will pick up new value on next tick
   └─ Frontend /api/status will reflect new reasoning text within 30s

5. ON FAILURE (timeout, connection refused, parse error):
   └─ Set ai_status = "fallback"
   └─ Control loop falls back to rule_amps
   └─ Dashboard AI banner shows amber "AI unavailable" state
   └─ Retry on next scheduled interval (no immediate retry to avoid hammering)
```

---

## Flow 3 — Session Tracking

Session lifecycle managed alongside the control loop:

```
SESSION START detection (checked every control loop tick):
  Conditions:
    charge_port_connected == True
    AND location_confirmed == True
    AND previous_charge_port_connected == False  ← transition from unplugged

  On start:
    └─ Snapshot: session_start_grid_kwh = consumeenergy (cumulative from Solax)
    └─ Snapshot: session_start_car_kwh  = battery_level × battery_capacity_kwh
    └─ Record:   session_start_soc = battery_level
    └─ Record:   session_start_time = now
    └─ Set:      active_session = True

SESSION LIVE UPDATES (every control loop tick while active):
    └─ session_grid_kwh_used  = consumeenergy - session_start_grid_kwh
    └─ session_kwh_added      = current_car_kwh - session_start_car_kwh
    └─ session_solar_kwh      = session_kwh_added - session_grid_kwh_used
    └─ session_solar_pct      = session_solar_kwh / session_kwh_added × 100
    └─ session_saved_pesos    = session_solar_kwh × meralco_rate
    └─ Push to /api/session/current for dashboard display

SESSION END detection:
  Conditions (any one triggers end):
    charge_port_connected == False                ← unplugged
    OR charging_state == "Complete"               ← Tesla finished
    OR battery_level >= target_soc                ← target reached

  On end:
    └─ Finalise all deltas
    └─ INSERT into sessions table (all fields)
    └─ Set: active_session = False
    └─ Reset: session_start_* snapshots
    └─ Send Telegram notification if enabled:
         "Session complete: +{kwh_added}kWh · {solar_pct}% solar · ₱{saved} saved"

INTERRUPTED SESSION (unplug then replug within same day):
    └─ End existing session, write to DB
    └─ Start new session on next plug-in detection
    └─ Sessions are independent — no merging
```

---

## Flow 4 — Weather Forecast Refresh (every 60 minutes)

```
1. READ home_lat, home_lon from settings

2. GET Open-Meteo forecast:
   └─ https://api.open-meteo.com/v1/forecast
   └─ params: latitude, longitude, hourly=shortwave_radiation,cloud_cover,
              daily=sunrise,sunset, timezone=Asia/Manila, forecast_days=1

3. PARSE response:
   └─ Extract hourly irradiance array (W/m²) for today
   └─ Extract hourly cloud_cover array (%)
   └─ Extract today's sunrise and sunset times
   └─ Identify peak window: hours where irradiance > 80% of daily max

4. TRANSLATE irradiance → expected yield:
   └─ For each hour: expected_yield_w[hour] = irradiance[hour] × efficiency_coeff[hour_bucket]
   └─ If efficiency_coeff not calibrated (<7 days data): use raw irradiance, flag low confidence

5. CACHE in memory:
   └─ Full forecast dict (irradiance, cloud_cover, expected_yield per hour)
   └─ sunrise, sunset (used by control loop hard stop)
   └─ peak_window_start, peak_window_end
   └─ forecast_last_updated = now

6. PUSH to frontend via /api/forecast
   └─ Frontend chart re-renders with updated bars
```

---

## Flow 5 — Efficiency Coefficient Calibration (nightly)

Runs at midnight to update the learned system efficiency:

```
1. QUERY snapshots table:
   SELECT
     strftime('%H', timestamp) as hour_bucket,
     AVG(solar_w / forecasted_irradiance_wm2) as coeff
   FROM snapshots
   WHERE solar_w > 0
     AND forecasted_irradiance_wm2 > 100   ← exclude near-zero irradiance readings
     AND timestamp > datetime('now', '-90 days')  ← rolling 90-day window
   GROUP BY hour_bucket

   Note: requires forecasted_irradiance_wm2 to be stored in snapshots
   (add this column — the irradiance forecast value at time of snapshot)

2. COMPUTE median coefficient per hour bucket (more robust than mean — ignores outliers)

3. WRITE to settings table:
   └─ Key: efficiency_coeff_{HH} for each hour (e.g. efficiency_coeff_10, efficiency_coeff_11)
   └─ Key: efficiency_coeff_days_of_history = count of distinct days in snapshot data

4. LOG calibration run: timestamp, hour buckets updated, days of data used
```

---

## Flow 6 — Frontend Polling (/api/status, every 30 seconds)

The React frontend polls this single endpoint to update the entire dashboard:

```
GET /api/status returns:

{
  // Mode
  mode: "Solar Optimizing" | "Suspended – Night" | "Suspended – Unplugged" |
        "Suspended – Charging Away" | "Suspended – Location Unknown" |
        "Cutoff – Grid Budget Reached" | "Manual Override",

  // Charger pill
  charger_status: "charging_at_home" | "charging_away" | "location_unknown" | "not_connected",
  home_detection_method: "named_location" | "gps_proximity" | null,

  // Live energy values (from Solax)
  solar_w: 2840,
  household_demand_w: 880,
  grid_import_w: 120,
  battery_soc: 72,
  battery_w: -200,
  solax_data_age_secs: 45,

  // Tesla
  tesla_soc: 58,
  tesla_charging_amps: 8,
  tesla_charging_kw: 1.92,
  charge_port_connected: true,
  charging_state: "Charging",

  // AI state
  ai_enabled: true,
  ai_status: "active" | "fallback" | "suspended_night" | "suspended_away" |
             "standby" | "offline",
  ai_recommended_amps: 8,
  ai_reasoning: "Solar at 2,840W and rising...",
  ai_confidence: "medium",
  ai_trigger_reason: "solar_shift",
  ai_last_updated_secs: 120,

  // Session (null if no active session)
  session: {
    started_at: "2026-02-20T09:14:00",
    elapsed_mins: 84,
    kwh_added: 8.4,
    solar_kwh: 7.1,
    grid_kwh: 1.3,
    solar_pct: 85,
    saved_pesos: 710,
  },

  // Forecast
  forecast: {
    sunrise: "05:52",
    sunset: "18:09",
    peak_window_start: "10:00",
    peak_window_end: "14:00",
    hours_until_sunset: 4.2,
    hourly: [
      { hour: "08:00", irradiance_wm2: 320, expected_yield_w: 1560, cloud_cover_pct: 20 },
      { hour: "09:00", irradiance_wm2: 520, expected_yield_w: 2540, cloud_cover_pct: 15 },
      // ... remaining hours
    ]
  },

  // Grid budget
  grid_budget_total_kwh: 5.0,
  grid_budget_used_kwh: 2.1,
  grid_budget_pct: 42,
}
```

---

## Data Freshness Rules

| Data | Max acceptable age | If exceeded |
|---|---|---|
| Solax snapshot | 5 minutes (uploadTime) | Hold setpoint, flag warning, skip control loop |
| Tessie state | 5 minutes | Hold setpoint, flag warning |
| Open-Meteo forecast | 2 hours | Use stale forecast but flag in UI |
| AI recommendation | 6 minutes | Fall back to rule-based, trigger fresh AI call |
| Efficiency coefficient | 24 hours | Use last computed, no action |

---

## Database Write Schedule

| Table | Written when | Frequency |
|---|---|---|
| `snapshots` | Every control loop tick (during active session) | Every 60–90s |
| `sessions` | On session end | Per charging session |
| `settings` | On user save / onboarding / nightly calibration | On-demand + nightly |
| `daily_summary` | Nightly at midnight | Once per day |
