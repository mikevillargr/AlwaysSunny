# AlwaysSunny — Optimization Strategy & Logic

> Complete reference for all optimization features in the AlwaysSunny solar EV charging system.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Control Loop Architecture](#control-loop-architecture)
3. [Charging Strategies](#charging-strategies)
4. [Decision Priority Chain](#decision-priority-chain)
5. [AI Optimization Layer](#ai-optimization-layer)
6. [Grid Budget System](#grid-budget-system)
7. [Grid Import Limit Throttling](#grid-import-limit-throttling)
8. [Solar Trend Analysis](#solar-trend-analysis)
9. [Home Detection](#home-detection)
10. [Session Tracking & Solar Subsidy](#session-tracking--solar-subsidy)
11. [Weather Forecast Integration](#weather-forecast-integration)
12. [Hard Stops & Safety](#hard-stops--safety)
13. [Tesla Command Execution](#tesla-command-execution)
14. [Operating Modes](#operating-modes)

---

## System Overview

AlwaysSunny is a solar-first EV charging optimizer for Tesla vehicles. It reads real-time data from a Solax inverter and Tesla (via Tessie API), combines it with weather forecasts from Open-Meteo, and uses an AI model (Ollama) to dynamically adjust Tesla charging amperage every 60 seconds.

**Core principle:** Maximize the percentage of charging energy that comes from solar panels, minimizing grid electricity costs.

### Data Sources

| Source | Data | Refresh Rate |
|--------|------|-------------|
| **Solax Cloud API** | Solar yield (W), household demand (W), grid import/export (W), battery SoC/power, cumulative grid consumption (kWh) | Every tick (~60s) |
| **Tessie API** | Tesla SoC (%), charging state, charge port status, current amps, charging kW, GPS location, minutes to full charge | Every tick (~60s) |
| **Open-Meteo API** | Hourly irradiance (W/m²), cloud cover (%), temperature, sunrise/sunset | Every 60 minutes |
| **Ollama (local LLM)** | AI-generated charging recommendations (amps, reasoning, confidence) | Event-driven (90s min gap) |

---

## Control Loop Architecture

The control loop runs as an APScheduler job, firing every **60 seconds** per registered user.

### Tick Sequence

```
1. Fetch external data (Solax, Tessie, GPS, weather)
2. Update solar trend buffers
3. Evaluate hard stops (unplug, away from home, grid budget exhausted)
4. Determine final amps:
   a. Manual override (if AI disabled and slider set)
   b. AI recommendation (if AI enabled and fresh)
   c. Rule-based fallback (solar-first or departure strategy)
5. Apply grid import limit throttling
6. Send Tesla command (start/stop/set amps)
7. Track charging session (start/update/end)
8. Save snapshot to database
```

### State Management

Each user has a `UserLoopState` object holding:
- Latest Solax, Tesla, location, and forecast data
- Rolling average buffer (last 3 solar readings) for smoothing
- Trend buffer (last 5 readings) for solar direction detection
- Session tracker for active charging session
- Cached credentials and settings
- Daily grid budget tracking
- AI recommendation with freshness tracking

---

## Charging Strategies

### 1. Solar-First Mode (`solar`)

**Goal:** Only charge from solar surplus. Accept partial charge if solar is insufficient. Never draw from grid.

**Logic:**
```
solar_surplus_w = solar_yield - household_demand
smoothed_surplus = rolling_average(last 3 readings)
target_amps = smoothed_surplus / circuit_voltage (240V)
```

**Rules:**
- If `target_amps < 5`: pause charging (Tesla minimum is 5A; don't trickle)
- If `target_amps >= 5`: charge at that rate
- Grid import limit applied as a ceiling
- No grid draw allowed — if surplus drops below ~1200W (5A × 240V), charging pauses

### 2. Ready by Departure Mode (`departure`)

**Goal:** Ensure Tesla reaches target SoC by the user's departure time. Allow grid draw if needed.

**Logic:**
```
soc_gap = target_soc - current_soc
kwh_needed = (soc_gap / 100) × battery_capacity_kwh
hours_remaining = time_until_departure
min_amps = kwh_needed / (hours_remaining × 0.24 kWh/A/h)
```

**Rules:**
- Start with solar surplus + grid allowance (if budget remaining)
- If `min_amps_for_departure > solar_target`: boost to at least `min_amps_for_departure`
- If `min_amps > 32`: departure status = "may_not_reach" (charge at max)
- If departure time has passed: charge at 32A (max)
- Minimum 5A floor (departure mode keeps charging, unlike solar-first which pauses)
- Grid import limit still applies unless departure has passed (urgency override)

### Departure Feasibility Assessment

| Status | Condition | Behavior |
|--------|-----------|----------|
| `on_track` | `min_amps <= 32` and time remains | Normal optimization |
| `may_not_reach` | `min_amps > 32` | Charge at max, warn user |
| `passed` | Departure time elapsed | Charge at 32A, override grid limit |

---

## Decision Priority Chain

The system evaluates charging decisions in strict priority order:

```
1. HARD STOPS (highest priority)
   ├── Unplugged → Suspended
   ├── Away from home → Suspended
   └── Grid budget exhausted → Cutoff, stop charging

2. MANUAL OVERRIDE (if AI disabled)
   └── User-set amps via slider → apply directly

3. AI RECOMMENDATION (if AI enabled)
   ├── After sunset → suspend AI, fall to rule-based
   ├── Zero solar yield → suspend AI, fall to rule-based
   ├── Fresh recommendation exists → use AI amps
   └── Stale/unavailable → fall to rule-based

4. RULE-BASED FALLBACK (lowest priority)
   ├── No limits set → don't interfere (let Tesla charge freely)
   ├── Solar-first strategy → surplus-based amps
   └── Departure strategy → time-pressure-aware amps
```

---

## AI Optimization Layer

### When AI Fires

The AI is called based on **event triggers** with a minimum 90-second gap:

| Trigger | Condition | Min Gap |
|---------|-----------|---------|
| `scheduled` | Every 5 minutes (baseline) | 300s |
| `solar_shift` | Solar trend changed from "stable" | 90s |
| `soc_threshold` | SoC reached 75% or 95% of gap | 90s |
| `budget_warning` | Grid budget at 80% or 95% used | 90s |
| `departure_soon` | < 60 min to departure, SoC below target | 90s |
| `stale` | Last recommendation > 6 min old | 360s |

### AI Suspension Conditions

AI is **not called** when:
- After sunset (`hours_until_sunset <= 0`)
- Zero solar yield (`solar_w <= 0`)
- Missing data (no Solax, Tesla, or forecast)

### What AI Receives

The AI prompt includes:
- **Charging strategy** (solar-first or departure) with time calculations
- **Goal status**: SoC gap, kWh needed, progress %, time estimates at various amp levels
- **Constraints**: grid budget remaining, max grid import rate, Tesla 5-32A range
- **Live conditions**: solar yield, household demand, surplus, grid import, battery state, solar trend
- **Solar forecast**: remaining hourly irradiance curve from Open-Meteo
- **Session context**: elapsed time, kWh added, solar subsidy %
- **Pre-computed feasibility**: whether solar alone can finish, departure feasibility, Tesla's own ETA

### AI Output

```json
{
  "recommended_amps": 0-32,
  "reasoning": "human-readable explanation with specific numbers",
  "confidence": "low|medium|high"
}
```

**Clamping rules:**
- Values 1-4 are clamped to 5 (Tesla minimum)
- Values > 32 are clamped to 32 (Tesla maximum)
- 0 means stop charging

### AI Freshness

Recommendations expire after **6 minutes**. If stale, the system falls back to rule-based logic. The last good recommendation is kept for graceful degradation.

### Grid Draw Policy (AI-enforced)

- **No budget set (unlimited):** Minimize grid draw. Allow 5A with minor grid draw (~500W) if solar surplus is 700-1200W to avoid start/stop cycling. Below 700W surplus → 0A.
- **Budget set:** Allow grid draw freely when budget > 10% remaining. Throttle aggressively when < 10%.
- **Departure urgency:** Can slightly exceed budget (~5%) if needed to reach target SoC.
- **Never exceed** the max grid import rate regardless of budget.

---

## Grid Budget System

Tracks daily cumulative grid energy consumption to enforce a user-defined daily limit.

### How It Works

```
daily_grid_used = current_consumeenergy_kwh - snapshot_at_midnight
grid_budget_remaining = daily_budget - daily_grid_used
```

- **Midnight reset:** Snapshots the Solax cumulative `consumeenergy` value at the start of each day
- **Persistence:** Snapshot is saved to the database so it survives backend restarts
- **Hard cutoff:** When `grid_budget_remaining <= 0`, charging is stopped immediately
- **Budget = 0:** Treated as "no budget set" (unlimited, but AI still minimizes grid draw)

### Budget Thresholds

| % Used | Behavior |
|--------|----------|
| 0-80% | Normal operation, grid draw allowed per strategy |
| 80% | AI trigger: `budget_warning` |
| 95% | AI trigger: `budget_warning` (aggressive throttle) |
| 100% | Hard stop: `Cutoff – Grid Budget Reached` |

---

## Grid Import Limit Throttling

A real-time watt-level ceiling on grid import, independent of the daily budget.

### Bidirectional Algorithm

```python
if grid_import > limit:
    # Over limit — reduce amps
    excess_w = grid_import - limit
    reduce_by = max(1, excess_w / circuit_voltage)
    return max(0, current_amps - reduce_by)

elif grid_import < limit × 0.8:
    # Under limit with headroom — increase toward target
    headroom_w = limit - grid_import
    max_increase = headroom_w / circuit_voltage
    return min(32, min(target_amps, current_amps + max(1, max_increase)))

else:
    # Near limit (80-100%) — hold steady
    return min(target_amps, current_amps)
```

- Applied as a **ceiling** on rule-based strategies
- **Overridden** in departure mode when departure time has passed (urgency)
- **AI bypasses** this throttle — AI already receives `max_grid_import_w` in its prompt and factors it into its recommendation

---

## Solar Trend Analysis

### Rolling Average (Smoothing)

- **Buffer:** Last 3 readings of available watts (solar surplus or surplus + grid allowance)
- **Purpose:** Prevents rapid amp oscillation from momentary cloud cover
- **Used by:** Rule-based strategies for target amp calculation

### Trend Detection

- **Buffer:** Last 5 raw solar yield readings
- **Calculation:**
  ```
  if current > avg × 1.10 → "rising"
  if current < avg × 0.90 → "falling"
  else → "stable"
  ```
- **Used by:** AI trigger system (`solar_shift` event) and AI prompt context

---

## Home Detection

Two-layer system to ensure charging only happens at home:

### Layer 1: Named Location (Tessie)

If Tessie reports a saved/named location:
- `is_at_home = true` → charging allowed
- `is_at_home = false` → **Suspended – Charging Away**

### Layer 2: GPS Proximity (Fallback)

If no named location, uses GPS coordinates:
- Compares Tesla GPS to user's saved `home_lat`/`home_lon`
- Within proximity threshold → charging allowed
- Outside threshold → **Suspended – Charging Away**

### Unknown Location

If neither layer can determine location → **assume home** (don't block charging on missing GPS).

### Auto-Populate Home Location

If `home_lat`/`home_lon` are not set and Tesla reports being at a named "Home" location, the system automatically saves the GPS coordinates.

---

## Session Tracking & Solar Subsidy

### Session Lifecycle

| Event | Trigger | Action |
|-------|---------|--------|
| **Start** | Transition from unplugged → plugged at home | Create `ActiveSession`, snapshot grid kWh |
| **Update** | Every tick while plugged in | Recalculate solar/grid split |
| **End** | Physical unplug OR Tesla reports "Complete" | Finalize stats, write to DB |

### Solar Subsidy Calculation

```
grid_kwh = current_consumeenergy - start_consumeenergy
total_kwh = tesla.charge_energy_added  (Tesla's own counter)
solar_kwh = total_kwh - grid_kwh
solar_pct = (solar_kwh / total_kwh) × 100
saved_pesos = solar_kwh × meralco_rate
```

- Uses Tesla's `charge_energy_added` for total kWh (more accurate than SoC delta)
- Uses Solax cumulative `consumeenergy` delta for grid kWh
- Solar kWh = difference (total - grid)

### Session Recovery

On backend restart:
- Checks DB for active (un-ended) session
- Restores `start_grid_kwh` from persisted settings
- Resumes tracking seamlessly

---

## Weather Forecast Integration

### Open-Meteo Data

Fetched hourly, provides:
- **Shortwave radiation** (W/m²) — direct solar irradiance
- **Cloud cover** (%) — affects expected yield
- **Temperature** (°C) — displayed in UI
- **Sunrise/sunset** — determines solar window

### Peak Window Calculation

```
max_irradiance = max(all hourly irradiance values)
peak_hours = hours where irradiance > 70% of max
peak_window = first_peak_hour → last_peak_hour
```

### AI Forecast Usage

The AI receives a **future irradiance curve** — all remaining daylight hours with their W/m² and cloud cover. This allows the AI to:
- Anticipate solar recovery after clouds
- Plan grid draw timing (charge from grid now, solar later — or vice versa)
- Assess whether solar alone can finish the charge before sunset

---

## Hard Stops & Safety

These conditions **immediately halt** optimization and return early:

| Condition | Mode | Action |
|-----------|------|--------|
| Charge port disconnected | `Suspended – Unplugged` | Skip all logic |
| Charging away from home | `Suspended – Charging Away` | Skip all logic |
| Grid budget exhausted | `Cutoff – Grid Budget Reached` | `stop_charging()` |

**Critical rule:** Past the hard stop checks, **no code path calls `stop_charging()`** except:
- Rule-based 0A when grid budget or import limit is actively set
- Grid budget cutoff (above)

This prevents the optimizer from fighting with the user or Tesla's own charging logic.

---

## Tesla Command Execution

### Command Logic

```
if final_amps == 0 AND currently charging AND limits are active:
    → stop_charging()

if final_amps >= 5 AND not currently charging:
    → start_charging() + set_charging_amps(final_amps)

if final_amps >= 5 AND final_amps != last_sent_amps:
    → set_charging_amps(final_amps)
```

### Deduplication

Commands are only sent when the target amps **differ** from the last sent value (`last_amps_sent`). This prevents unnecessary API calls to Tessie.

### No-Limits Passthrough

If both grid budget and grid import limit are 0 (disabled), the system sets `final_amps = -1` (sentinel) and **sends no commands** — letting Tesla charge at whatever rate it's already doing.

---

## Operating Modes

The `mode` field in the status response tells the user what the system is currently doing:

| Mode | Meaning |
|------|---------|
| `Suspended – Unplugged` | Car not connected |
| `Suspended – Charging Away` | Car plugged in but not at home |
| `Suspended – Data Unavailable` | Can't reach Solax or Tessie |
| `Suspended – Night` | After sunset, AI suspended |
| `Cutoff – Grid Budget Reached` | Daily grid limit hit, charging stopped |
| `Manual Override` | User controlling amps via slider |
| `AI Optimizing` | AI actively managing amperage |
| `Solar-first` | Rule-based: charging from solar surplus |
| `Solar-first – Waiting` | Rule-based: surplus too low, paused |
| `Ready by Departure` | Rule-based: on track for departure |
| `Ready by Departure – Urgent` | Rule-based: behind pace, may not reach target |
| `Departure Passed – Max Charge` | Departure time elapsed, charging at max |
| `Target SoC Reached` | Tesla at or above target SoC |
| `Charging – No Limits` | No budget/limit set, not interfering |
| `Tessie Disconnected` | Tessie integration disabled by user |

---

## Configuration Parameters

| Setting | Default | Description |
|---------|---------|-------------|
| `target_soc` | 100% | Desired Tesla charge level |
| `daily_grid_budget_kwh` | 0 (unlimited) | Max grid kWh per day |
| `max_grid_import_w` | 0 (unlimited) | Max instantaneous grid import watts |
| `circuit_voltage` | 240V | Home circuit voltage for amp↔watt conversion |
| `battery_capacity_kwh` | 75 kWh | Tesla battery size for time estimates |
| `charging_strategy` | `departure` | `solar` or `departure` |
| `departure_time` | — | HH:MM for departure mode |
| `meralco_rate` | ₱10.83/kWh | Local electricity rate for savings calculation |
| `ai_enabled` | true | Enable/disable AI optimization |
| `tessie_enabled` | true | Enable/disable Tesla commands |
| `timezone` | Asia/Manila | User timezone for all time calculations |
