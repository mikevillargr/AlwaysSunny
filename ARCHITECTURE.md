# AlwaysSunny — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        VPS / Pi                             │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   FastAPI    │    │  APScheduler │    │    Ollama    │  │
│  │   Backend    │◄───│ Control Loop │───►│  Qwen2.5:7b  │  │
│  │              │    │  (60-90s)    │    │              │  │
│  └──────┬───────┘    └──────────────┘    └──────────────┘  │
│         │                                                   │
│  ┌──────▼───────┐                                          │
│  │    SQLite    │                                          │
│  │   Database   │                                          │
│  └──────────────┘                                          │
└─────────────────┬───────────────────────────────────────────┘
                  │ REST API
                  ▼
┌─────────────────────────────┐
│      React Frontend         │
│      (Browser / PWA)        │
└─────────────────────────────┘

External APIs:
- SolaxCloud API     → solar/grid/battery data
- Tessie API         → Tesla state + charging commands
- Open-Meteo API     → weather + irradiance forecast
- Telegram Bot API   → push notifications
```

---

## Control Loop (runs every 60–90 seconds)

```
1. FETCH Solax data
   - solar_yield = powerdc1 + powerdc2 (+ dc3/dc4)
   - grid_power = feedinpower (negative = importing)
   - battery_soc = soc
   - battery_power = batPower
   - daily_grid_import = consumeenergy (cumulative, delta from day start)

2. FETCH Tessie state (cached, no wake)
   - charge_port_connected
   - charging_state
   - battery_level (SoC %)
   - charge_current_request (current amps)
   - saved_location ("Home" / "Work" / etc.)
   - latitude, longitude (for sunrise/sunset)

3. CHECK hard stops
   - if not charge_port_connected → idle, skip
   - if saved_location != "Home" → suspend, skip
   - if current_time < sunrise OR > sunset → suspend, skip
   - if daily_grid_import >= grid_import_budget → stop_charging(), skip

4. CALCULATE rule-based setpoint
   - household_demand = solar_yield - grid_power
   - available = solar_yield - household_demand + grid_threshold
   - rule_amps = clamp(available / 240, 5, 32)
   - if available / 240 < 5 → rule_amps = 0 (stop)

5. GET AI recommendation (every 5 minutes, async)
   - Build prompt with all current context + irradiance curve
   - POST to Ollama → parse JSON response
   - ai_amps = recommended_amps
   - Store reasoning + confidence for dashboard display
   - If Ollama fails → use rule_amps, set ai_status = "fallback"

6. DETERMINE final setpoint
   - final_amps = ai_amps if ai_available else rule_amps
   - Apply rolling average (last 3 readings) to smooth

7. COMMAND Tesla if setpoint changed
   - if final_amps == 0 and currently charging → stop_charging()
   - if final_amps > 0 and not charging → start_charging()
   - if final_amps != current_amps → set_charging_amps(final_amps)

8. UPDATE session tracker
   - Track kWh added (Tessie), grid consumed (Solax delta)
   - Update live session subsidy calculation

9. STORE snapshot to database
   - Timestamp, all energy values, amps set, AI recommendation
```

---

## AI Call Schedule

AI is called every 5 minutes (not every control loop iteration) to avoid excessive Ollama load. The most recent AI recommendation is cached and used by the control loop until the next AI call.

```
Control loop: every 60s → use cached AI recommendation
AI call:       every 5min → refresh recommendation
```

---

## Database Schema (SQLite)

```sql
-- Energy snapshots (every 60s during active session)
CREATE TABLE snapshots (
    id INTEGER PRIMARY KEY,
    timestamp DATETIME,
    solar_w REAL,
    grid_w REAL,
    battery_soc INTEGER,
    battery_w REAL,
    household_w REAL,
    tesla_amps INTEGER,
    tesla_soc INTEGER,
    ai_recommended_amps INTEGER,
    ai_reasoning TEXT,
    ai_confidence TEXT,
    mode TEXT
);

-- Charging sessions
CREATE TABLE sessions (
    id INTEGER PRIMARY KEY,
    started_at DATETIME,
    ended_at DATETIME,
    duration_mins INTEGER,
    kwh_added REAL,
    solar_kwh REAL,
    grid_kwh REAL,
    solar_pct REAL,
    saved_pesos REAL,
    meralco_rate REAL,
    start_soc INTEGER,
    end_soc INTEGER,
    target_soc INTEGER
);

-- User settings
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME
);

-- Daily summaries (computed nightly)
CREATE TABLE daily_summary (
    date DATE PRIMARY KEY,
    total_solar_kwh REAL,
    total_grid_kwh REAL,
    total_sessions INTEGER,
    total_saved_pesos REAL,
    avg_solar_pct REAL
);
```

---

## API Endpoints (FastAPI)

```
GET  /api/status          → current system state (live dashboard data)
GET  /api/session/current → active session stats
GET  /api/sessions        → session history (paginated)
GET  /api/summary         → all-time + monthly aggregates
GET  /api/forecast        → cached weather/irradiance forecast
POST /api/optimize/toggle → enable/disable optimization switch
POST /api/override/amps   → manual amp override
GET  /api/settings        → get all settings
POST /api/settings        → update settings
GET  /api/health          → service health (Solax, Tessie, Ollama status)
```

---

## Environment Variables

```
# Solax
SOLAX_TOKEN_ID=
SOLAX_DONGLE_SN=

# Tessie
TESSIE_API_KEY=
TESSIE_VIN=

# Ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# App
DATABASE_URL=sqlite:///./alwayssunny.db
CIRCUIT_VOLTAGE=240
POLL_INTERVAL_SECONDS=60
AI_INTERVAL_SECONDS=300
```

---

## Session Detection Logic

```python
# Session starts when:
charge_port_connected == True
AND saved_location == "Home"
AND previous state had charge_port_connected == False

# Session ends when:
charge_port_connected == False
OR charging_state == "Complete"
OR battery_level >= target_soc

# On session start: snapshot consumeenergy and battery_level
# On session end: calculate deltas → write to sessions table
```

---

## Rolling Average Implementation

To smooth solar fluctuations before commanding Tesla:

```python
from collections import deque

solar_buffer = deque(maxlen=3)  # last 3 readings (~3 minutes)

def get_smoothed_available_amps(solar_w, household_w, grid_threshold_w):
    available = solar_w - household_w + grid_threshold_w
    solar_buffer.append(available)
    smoothed = sum(solar_buffer) / len(solar_buffer)
    amps = smoothed / CIRCUIT_VOLTAGE
    return max(0, min(32, round(amps)))
```
