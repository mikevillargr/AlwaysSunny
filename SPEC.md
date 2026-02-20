# AlwaysSunny — Feature Specification

## Signal Architecture

AlwaysSunny fuses two fundamentally different data sources. Understanding the role of each is critical to how the control loop, AI prompt, and app logic are designed.

### Solax API — Ground Truth (Actual, Near Real-Time)
- **What it is:** Real measured output from your physical inverter and PV strings
- **Latency:** ~60s cloud refresh (uploadTime field confirms actual freshness)
- **Key signals:** `powerdc1–4` (PV string output W), `feedinpower` (grid flow W, + = export, - = import), `consumeenergy` (cumulative grid import kWh), `batPower` / `soc` (battery), `acpower` (total AC output)
- **Role:** The only source of truth for what is actually happening right now. All real-time control decisions are made on Solax data.
- **Limitation:** No prediction. A cloud passes and solar drops — Solax sees it 60s later. It cannot anticipate.

### Open-Meteo API — Probabilistic Forecast (Predictive, Hourly)
- **What it is:** Weather model forecast for your GPS coordinates
- **Freshness:** Polled hourly; forecast covers full day in hourly buckets
- **Key signals:** `shortwave_radiation` (GHI, W/m²) per hour, `cloud_cover` (%), `sunrise`, `sunset`
- **Role:** Planning horizon. Tells the AI whether solar is rising or falling over the next 1–8 hours, whether a cloud bank is approaching, and exactly when solar will end for the day.
- **Limitation:** GHI (W/m²) ≠ actual yield (W). The forecast does not know your panel area, tilt, azimuth, shading, inverter efficiency, or temperature derating. Raw irradiance must be translated into expected yield using a learned system coefficient (see below).
- **Accuracy:** Reliable for ~1–2 hours ahead; degrades at longer ranges. Most useful for within-day shape (morning ramp, peak window, afternoon decline) rather than exact watt values.

### The Gap Between Them — System Efficiency Coefficient
Open-Meteo says "580 W/m²" but your Solax produces 2,840W. The ratio is your system's effective yield per unit irradiance:

```
efficiency_coefficient = actual_solar_yield_W / forecasted_irradiance_Wm2
```

This coefficient varies by time of day (angle effects), season, and weather type (direct vs. diffuse). Over time, the app learns this from historical `snapshots` data and uses it to translate future irradiance forecasts into **expected yield in watts** for this specific installation. In early operation (< 7 days of data), the AI uses raw irradiance with reduced confidence.

---

## Core Control Logic

### Rule-Based Loop (runs every 60–90 seconds)
The rule-based loop always acts on Solax actual data. It never waits for or depends on AI output.

```python
# --- Derive actual conditions from Solax ---
solar_yield_w = powerdc1 + powerdc2  # (+ powerdc3/4 if applicable)
household_demand_w = solar_yield_w - feedinpower  # feedinpower negative = importing
available_for_tesla_w = solar_yield_w - household_demand_w + (grid_import_limit_w if grid_budget_remaining > 0 else 0)

# --- Rolling average (last 3 readings, ~3 min) ---
smoothed_available_w = rolling_average(available_for_tesla_w, window=3)

# --- Compute target amps ---
target_amps = smoothed_available_w / circuit_voltage  # 240V
target_amps = clamp(target_amps, 5, 32)

# --- Hard stops (checked before any amp command) ---
if current_time >= sunset OR current_time < sunrise:
    suspend_optimization(); suspend_ai(); exit
if not tesla_plugged_in OR saved_location != "Home":
    idle(); exit
if daily_grid_imported_kwh >= grid_import_budget:
    stop_charging(); notify_telegram(); exit
if target_amps < 5:
    stop_charging(); exit  # Never trickle below Tesla minimum

# --- Apply AI setpoint if available and recent ---
if ai_recommended_amps is not None and ai_last_updated < 6_minutes_ago:
    final_amps = ai_recommended_amps  # AI overrides rule-based when fresh
else:
    final_amps = target_amps  # Fallback to rule-based

set_charging_amps(final_amps)
```

### Derived Trend Signal (from Solax rolling history)
Every control loop tick, the app computes a short-term solar trend from the last 5 readings (~5 min):

```python
solar_trend = "rising"   if current > avg_last_5 * 1.10
solar_trend = "falling"  if current < avg_last_5 * 0.90
solar_trend = "stable"   else
```

This trend is passed to the AI as a higher-confidence signal than the forecast for the immediate next 5–15 minutes. If Solax shows "falling" but forecast says "peak in 30 min", the AI should weight both: short-term dip may be temporary cloud, but trend + forecast together indicate whether to hold or reduce.

---

---

## Features

### 1. Live Dashboard
Real-time view of the full energy system.

- Energy flow diagram: Solar → Home → Grid, with Tesla as a fourth node
- Live values: solar yield (W), household demand (W), grid import/export (W), battery SoC (%)
- Current Tesla charge rate (A and kW)
- Current session stats (see Feature 5)
- Mode status indicator (see Feature 6)
- AI recommendation strip (see Feature 4)
- Solar forecast chart (see Feature 3)
- Grid budget progress bar (see Feature 2)

### 2. Daily Grid Import Budget (Hard Cutoff)
- User sets max daily grid import allowance in kWh (e.g. 5.0 kWh)
- App monitors `consumeenergy` delta from Solax API throughout the day
- Hard `stop_charging()` triggered when budget is reached
- Budget resets at midnight
- Dashboard shows: X.X / X.X kWh used, % consumed, progress bar
- Bar turns amber at 80%, red at 100%
- Optional Telegram notification when cutoff triggered

### 3. Weather & Solar Forecast Layer
- Source: Open-Meteo API (free, no key required), polled once per hour
- Coordinates sourced from Tessie `GET /location` (Tesla GPS)
- **Data retrieved:**
  - `shortwave_radiation` — hourly GHI (W/m²) for full day
  - `cloud_cover` — hourly % for full day
  - `sunrise`, `sunset` — drives optimization window
- **Forecast is a planning signal only** — never used directly as a control input
- Dashboard shows: hourly irradiance bar chart with current time marker, peak window highlight, cloud cover overlay, sunrise/sunset times, and weather summary

**Irradiance → Expected Yield Translation:**
Raw GHI from Open-Meteo is converted to expected watts using the learned system efficiency coefficient:
```python
expected_yield_w = forecasted_irradiance_wm2 × efficiency_coefficient
```
Where `efficiency_coefficient` is computed from historical snapshots:
```python
# Run nightly, stored in settings table
efficiency_coefficient = median(
    actual_solar_yield_w / forecasted_irradiance_wm2
    for all snapshots where irradiance > 100 and time_of_day matches hour_bucket
)
```
- Bucketed by hour of day (6am, 7am, … 6pm) to capture angle variation
- Requires minimum 7 days of data; before that, AI uses raw irradiance with lower confidence
- Displayed in Settings as "System efficiency: X W per W/m²"

### 4. AI Optimization Layer
- Calls Ollama REST API: `POST http://<vps>:11434/api/generate`
- Model: Qwen2.5:7b (preferred for JSON adherence) or fallback to llama3.1:8b
- Output: JSON with `recommended_amps`, `reasoning`, `confidence`, `trigger_reason`
- **AI is advisory** — rule-based loop runs every 60–90s independently; AI setpoint applied when fresh (< 6 min old)
- If Ollama unreachable or times out → rule-based control takes over; amber warning in banner

**AI Call Cadence — Event-Driven Hybrid:**

The AI does not run on a fixed timer alone. It uses a baseline interval plus event triggers for meaningful state changes:

```
Baseline cadence:       every 5 minutes
Minimum gap:            90 seconds (prevent hammering Ollama)

Early trigger if ANY of the following occur:
  - solar_trend changes direction (rising→falling or falling→rising)
  - tesla_soc crosses a gap threshold (75% of gap closed, or 95% of gap closed)
  - budget_remaining crosses 80% or 95% of daily limit
  - departure_time is now < 60 minutes away and soc < target_soc
  - user taps "Refresh" on the AI banner (manual trigger)
  - AI setpoint age exceeds 6 minutes (stale — force refresh)
```

Each AI call receives a `trigger_reason` field so the banner can explain *why* the AI re-evaluated:
- `"scheduled"` — routine 5-min interval
- `"solar_shift"` — solar trend changed direction
- `"soc_threshold"` — SoC crossed a milestone
- `"budget_warning"` — grid budget running low
- `"departure_soon"` — departure window approaching
- `"manual"` — user requested refresh
- `"stale"` — previous recommendation expired

**Revert-to-Default on AI Off:**

When AI optimization is disabled, amp control reverts based on *how* it was disabled:

| Trigger | Behaviour |
|---|---|
| User manually toggles AI off | Immediately revert to user's default charging amps from Settings. Send `set_charging_amps(default_amps)` command. |
| Ollama offline / AI unavailable | Rule-based loop continues managing amps dynamically. No revert — rule-based IS the appropriate control. |
| Hard stop (grid budget, sunset, unplugged) | Charging stops entirely. Last AI amp setting preserved in memory. On resume, AI re-evaluates fresh. |
| User toggles AI back on | AI runs immediately (does not wait for next 5-min interval). Trigger reason: `"manual"`. |

Default amps setting lives in Settings as "Default charging rate" — a user-configured fallback for non-optimized charging (e.g. 8A). This is distinct from max_grid_import_w.

**Charging Amperage Slider — Lock and Animate Behaviour:**

The charging amperage slider on the dashboard is a read-only display when AI is active, not a control. This prevents conflicting amp commands between user input and AI output.

| AI State | Slider behaviour | Tessie command on change |
|---|---|---|
| AI ON | Locked (non-interactive), animates smoothly to new value on each AI adjustment | Sent by AI only |
| AI OFF | Fully interactive, user drags to set amps | Sent immediately on drag release |
| Charging paused | Locked, greyed out, shows last commanded value | None |

- When AI adjusts amps, the slider thumb animates to the new position (CSS transition ~1.5s) so the user can visibly see the AI acting in real time
- When AI is toggled off: slider unlocks, reverts to `settings.default_charging_amps`, `set_charging_amps(default_amps)` sent immediately
- When AI is toggled on: slider locks instantly, AI call triggered immediately (trigger: `"manual"`), slider animates to first AI recommendation within seconds
- Tooltip on locked slider: "Controlled by AI — toggle off to adjust manually"
- AI unavailable when `current_time >= sunset` (from Open-Meteo)
- AI banner transitions to grey suspended state
- Rule-based loop also suspends at sunset (see Feature 6)
- AI resumes automatically at next sunrise — no user action required

**AI Banner Messaging — Active Optimization Narration:**

The AI banner is the primary surface where the app communicates what it's doing and why. It must actively narrate the optimization in real time, not just display a number.

The `reasoning` field returned by the AI (1–2 sentences) is displayed verbatim in the banner center. The AI prompt instructs the model to write reasoning that explains:
- What signal drove the decision (solar trend, forecast, SoC urgency, budget)
- What it's anticipating (holding for peak, bridging with grid, backing off for clouds)
- What constraint it's respecting (budget limit, departure time, solar-first mode)

**Reasoning message examples by scenario:**

| Scenario | Example banner reasoning |
|---|---|
| Peak solar, charging aggressively | "Solar at 2,840W and rising — pushing to 18A to capture peak irradiance window (10am–2pm)." |
| Temporary cloud dip, holding rate | "Solar dipped to 1,200W but forecast shows recovery in ~20 min — holding at 12A rather than reducing." |
| Approaching grid budget limit | "Grid budget 85% used — throttling to 8A to preserve remaining allowance for the afternoon." |
| SoC gap, solar insufficient | "Only 2.1 hrs until sunset with 18% SoC gap remaining — drawing 4A from grid to ensure 80% target is reached." |
| Solar-first, accepting shortfall | "Solar-first mode: maximizing solar subsidy at 14A. Grid draw avoided — target SoC may not be fully reached today." |
| Departure time pressure | "Departing in 55 min with 12% gap remaining — temporarily allowing grid draw to guarantee 80% by 7:00 AM." |
| Stable conditions, no action | "Conditions stable — 2,400W solar, 78% SoC on track. Maintaining 16A." |
| Early morning ramp-up | "Solar rising quickly from morning low — increasing from 8A to 14A as irradiance climbs toward peak." |

**Banner sub-text — trigger context:**

Below the reasoning text, the banner shows a small secondary line indicating what triggered the last AI evaluation and when:

```
"Re-evaluated 2 min ago · solar trend shifted"
"Re-evaluated just now · scheduled check"
"Re-evaluated 4 min ago · departure window approaching"
```

This gives the user confidence that the AI is actively watching and responding, not just running on a blind timer.

**Confidence indicator behaviour:**

The confidence dot (green/amber/grey) reflects the AI's self-reported confidence, which is informed by:
- `high` — Solax data fresh, solar stable, forecast consistent with actual, efficiency_coeff well-calibrated
- `medium` — some uncertainty (trend shifting, cloud cover moderate, forecast/actual divergence)
- `low` — high cloud cover, Solax data older than 3 min, efficiency_coeff not yet calibrated (<7 days), departure time creating conflicting pressures

**Signal Fusion Strategy for AI:**

The AI receives signals from both sources, clearly labelled by origin and reliability:

| Signal | Source | Reliability | Role in AI reasoning |
|---|---|---|---|
| `solar_yield_w` | Solax (actual) | High — ground truth | Primary current condition |
| `solar_trend` | Derived from Solax rolling 5-min | High for next 5–15 min | Short-term momentum |
| `household_demand_w` | Solax (actual) | High | Current load context |
| `grid_import_w` | Solax (actual) | High | How much grid is currently being used |
| `battery_soc` | Solax (actual) | High | Home battery state (affects surplus routing) |
| `forecasted_irradiance_curve` | Open-Meteo | Medium — degrades beyond 2hr | Shape of remaining solar day |
| `expected_yield_curve_w` | Derived (irradiance × efficiency_coeff) | Medium | Translated forecast in watts |
| `cloud_cover_curve` | Open-Meteo | Medium | Confidence modifier on irradiance |
| `hrs_until_sunset` | Open-Meteo | High | Time pressure for SoC gap |
| `efficiency_coefficient` | Learned from history | High after 7 days | Calibration quality signal |

**AI Decision Framework:**
The AI should reason across four dimensions simultaneously:

1. **Immediate** (next 5 min) — weight Solax actual + solar_trend heavily. If solar is rising and trend is "rising", increase amps. If "falling", hold or reduce.

2. **Short-term** (next 30–90 min) — weight Open-Meteo irradiance + cloud_cover. Is a cloud bank coming? Is peak solar window imminent? Adjust current rate to anticipate.

3. **Session horizon** (now until sunset) — can the SoC gap be closed with solar alone before sunset? If not, how much grid draw is the minimum needed? Factor in grid budget remaining.

4. **Constraint layer** (hard and soft) — daily grid budget is a hard cap. Target SoC is a goal. Max grid import rate is a ceiling. Departure time (if set) creates time urgency.

**User Preference Signals passed to AI:**
- `target_soc` — the goal; gap between current and target drives urgency
- `grid_import_budget_remaining_kwh` — hard ceiling; AI must not recommend amps that would exhaust this
- `max_grid_import_w` — per-session instantaneous ceiling on grid draw
- `departure_time` (if set) — deadline for reaching target SoC; increases urgency as deadline approaches
- `charging_strategy` — "Solar-first" (maximize solar subsidy) vs "Ready by departure" (hit target SoC on time, grid allowed)

**AI Prompt Template:**
```
You are a solar EV charging optimizer for a home in the Philippines (Manila time, PHT +8).
Recommend a Tesla charging rate in amps (5–32A) or 0 to stop.
Optimize based on the charging_strategy. Treat grid_import_budget as a hard limit.

=== CHARGING STRATEGY ===
Mode: {charging_strategy}  [Solar-first | Ready by departure]
Target SoC: {target_soc}% (currently {current_soc}%, gap: {soc_gap}%, ~{kwh_needed} kWh needed)
{if departure_time: "Departure: {departure_time} ({mins_until_departure} min away)"}
Grid import budget remaining: {budget_remaining_kwh} kWh (of {budget_total_kwh} kWh daily limit)
Max grid import rate: {max_grid_import_w}W

=== ACTUAL CONDITIONS (Solax — ground truth, ~{solax_data_age_secs}s ago) ===
Solar yield: {solar_w}W  |  Trend (last 5 min): {solar_trend}  [rising | stable | falling]
Household demand: {household_demand_w}W
Grid import: {grid_import_w}W  (+ = importing, - = exporting)
Home battery SoC: {battery_soc}%  |  Battery power: {battery_w}W

=== SOLAR FORECAST (Open-Meteo — predictive, last updated {forecast_age_mins}m ago) ===
System efficiency coefficient: {efficiency_coeff} W per W/m²  (based on {days_of_history} days of data)
Confidence in forecast translation: {forecast_confidence}  [low <7 days | medium 7–30 days | high >30 days]

Time now: {current_time}  |  Sunrise: {sunrise}  |  Sunset: {sunset}
Hours until sunset: {hrs_until_sunset}

Remaining hourly forecast (irradiance → expected yield):
{hourly_table: "HH:00 | irradiance W/m² | expected_yield W | cloud_cover %"}

Peak solar window today: {peak_start}–{peak_end}  |  Currently: {peak_position}

=== SESSION CONTEXT ===
Session started: {session_start_time} ({session_elapsed_mins} min ago)
kWh added this session: {kwh_added_session}
Solar subsidy so far: {session_solar_pct}%

=== REASONING GUIDANCE ===
- Weight Solax actual data most heavily for the next 5–15 minutes.
- Use Open-Meteo forecast for planning decisions beyond 15 minutes.
- If solar_trend is "falling" but forecast shows recovery within 30 min, consider holding current rate rather than reducing.
- If SoC gap cannot be closed with solar alone before sunset and strategy is "Ready by departure", recommend minimum grid draw to bridge the gap — do not leave the car short.
- If strategy is "Solar-first", prioritize zero or minimal grid draw even if target SoC may not be reached.
- Never recommend amps that would cause grid import to exceed max_grid_import_w or exhaust budget_remaining_kwh.
- Low forecast_confidence means irradiance-to-yield translation is uncertain — reduce confidence rating accordingly.

=== REASONING MESSAGE INSTRUCTIONS ===
The "reasoning" field is displayed directly to the user in the app banner. Write it to actively narrate what the AI is doing and why — not just what the number is. It must:
- Name the primary signal that drove the decision (e.g. "Solar at 2,840W and rising", "Grid budget 85% used", "Departing in 55 min")
- State what the AI is anticipating or protecting against (e.g. "holding rate for cloud recovery", "throttling to preserve budget")
- Be 1–2 short sentences max. Plain English. No jargon.
- Feel like a knowledgeable assistant explaining a decision, not a data readout.

Good: "Solar at 2,840W and rising — pushing to 18A to capture the peak window before 2pm."
Bad: "Recommended amps: 18. Solar yield high. Irradiance peak approaching."

Respond ONLY in JSON (no preamble, no explanation outside JSON):
{"recommended_amps": <int 0-32>, "reasoning": "<1-2 sentences>", "confidence": "low|medium|high", "trigger_reason": "<scheduled|solar_shift|soc_threshold|budget_warning|departure_soon|manual|stale>"}
```

### 5. Solar Subsidy Tracking
Tracks how much of each charging session was solar vs. grid.

**Per-session calculation:**
```
# Snapshot at session start (plug-in detected):
session_start_kwh_car = Tessie battery kWh
session_start_grid_import = Solax consumeenergy (cumulative)

# At session end (unplug or charge complete):
session_kwh_added = Tessie battery kWh - session_start_kwh_car
session_grid_consumed = Solax consumeenergy - session_start_grid_import
session_solar_kwh = session_kwh_added - session_grid_consumed
session_solar_pct = (session_solar_kwh / session_kwh_added) * 100
session_saved = session_solar_kwh × meralco_rate
```

**Tariff:**
- User configures Meralco all-in effective rate (₱/kWh)
- Full effective rate = generation + distribution + transmission + taxes
- Typical range: ₱10–12/kWh
- "Fetch latest rate" convenience button (best-effort scrape, not relied upon)
- Monthly prompt to re-confirm rate

**Stored per session:**
- Date/time, duration
- kWh added to car
- Solar kWh, grid kWh
- Solar subsidy %
- ₱ saved

**Aggregated:**
- All-time solar kWh
- All-time ₱ saved
- Average solar subsidy %
- Monthly breakdown

### 6. Sunset-Aware "Optimize My Charging" Switch
Master on/off toggle for solar optimization mode.

**Home Stack Detection — Two-Layer Gate:**

Before optimization activates, the app must confirm the Tesla is charging on the same physical stack as the Solax inverter. A car plugged in and charging elsewhere must never trigger optimization, control loop commands, or solar subsidy tracking.

**Layer 1 — Tessie Named Location (Primary)**
Tessie's `GET /location` returns a `saved_location` string if the user has configured named locations in the Tessie app (e.g. "Home", "Work"). This is the cleanest and most reliable signal.

```python
if tessie.saved_location == "Home":
    location_confirmed = True
elif tessie.saved_location is not None:
    # Named location exists but it's not Home (e.g. "Work")
    location_confirmed = False
else:
    # No named location set — fall through to Layer 2
    location_confirmed = None  # unknown, check GPS
```

**Layer 2 — GPS Proximity Check (Fallback)**
Used when `saved_location` is null (user hasn't configured Tessie named locations) or as a secondary confirmation. Home coordinates are captured once during onboarding.

```python
home_lat = settings.home_lat      # saved during onboarding
home_lon = settings.home_lon      # saved during onboarding
proximity_radius_km = 0.1         # 100 metres

distance_km = haversine(tessie.lat, tessie.lon, home_lat, home_lon)

if location_confirmed is None:    # Layer 1 gave no named location
    location_confirmed = distance_km < proximity_radius_km
```

**Combined gate — optimization only proceeds if:**
```python
is_on_home_stack = location_confirmed  # True = home, False = away/unknown
```

If `is_on_home_stack` is False, the control loop does not run, no Tessie commands are sent, and session tracking does not start.

**Onboarding — Home Location Setup:**
On first run (or via Settings → "Set Home Location"):
1. App reads current Tesla GPS via Tessie `GET /location`
2. Saves `home_lat` and `home_lon` to settings
3. If `saved_location` is already "Home" in Tessie, confirm and use that as primary
4. Display: "Home set to your current Tesla location. You can update this in Settings."

**Behavior:**
- Reads Tesla location via Tessie `GET /location` on every control loop tick
- Gets sunrise/sunset from Open-Meteo for home coordinates
- Optimization loop ONLY runs between sunrise and sunset AND when `is_on_home_stack = True`
- Switch is only activatable when Tesla is detected as plugged in AND at home
- If Tesla unplugs → switch auto-suspends, re-arms on next plug-in at home
- If car is plugged in but not at home → optimization suspended, dashboard shows "Charging Away" state

**"Connected to Charger" pill states (top of dashboard):**

| Condition | Pill text | Colour |
|---|---|---|
| Plugged in, home confirmed (Layer 1) | "Charging at Home" | Green |
| Plugged in, home confirmed (Layer 2 GPS) | "Charging at Home" | Green |
| Plugged in, away from home | "Charging Away — Optimization Paused" | Amber |
| Plugged in, location unknown (no GPS, no named location) | "Location Unknown — Optimization Paused" | Amber |
| Not plugged in | "Not Connected" | Grey |

**Mode states (dashboard pill indicator):**
- `Solar Optimizing` — green, pulsing
- `Suspended – Night` — grey (post-sunset or pre-sunrise; AI also suspended)
- `Suspended – Unplugged` — grey
- `Suspended – Charging Away` — amber (plugged in but not on home stack)
- `Suspended – Location Unknown` — amber (no GPS fix or named location available)
- `Cutoff – Grid Budget Reached` — red
- `Manual Override` — blue

**AI banner states (full-width strip; toggle always visible on right regardless of state):**
- `Active` — purple border/glow, left: amp value + confidence badge, center: italic reasoning text
- `Suspended – No Solar` — grey border, left: 🌙 "AI Suspended", center: "No solar output — optimization resumes at 5:52 AM"
- `Suspended – Away` — amber border, left: 📍 "Away from Home", center: "Tesla detected away from home — optimization paused"
- `Unavailable – Ollama Offline` — amber border, left: ⚠️ "AI Unavailable", center: "AI offline — running rule-based fallback"
- `Standby – No Session` — grey/dim, left: "AI Standby", center: "Plug in your Tesla at home to activate AI optimization"

### 7. Target SoC
- User sets desired charge target (default: 80%, range: 50–100%)
- AI incorporates this when calculating recommended amps
- If solar alone can't close the gap before sunset → AI recommends minimum grid draw to bridge
- App does not force grid charging — AI suggests, user can override

### 8. Settings
- Target SoC (slider)
- Max instantaneous grid draw during charging (W)
- Daily grid import budget (kWh)
- Default charging amps (fallback when AI is off, range 5–32A)
- Meralco effective tariff rate (₱/kWh)
- Fallback behavior outside solar hours: Stop / Free charge / Schedule
- **Home Location** — displays current saved coordinates; "Update Home Location" button re-captures from Tesla's current GPS position
- Notifications: toggles per event type
- Telegram bot chat ID
- API connection status: Solax, Tessie, Ollama, Open-Meteo

---

## Edge Cases

| Scenario | Handling |
|---|---|
| Rapid solar fluctuation | Rolling average over last 3 Solax readings (~3 min) before adjusting amps |
| Solax trend "falling" but forecast shows recovery | AI holds current rate rather than reducing; re-evaluates at next 5-min cycle |
| Forecast says "sunny" but Solax shows low actual yield | AI lowers confidence rating; weights Solax actual more heavily; flags forecast/actual divergence |
| Tesla min charge rate (5A) | Stop charging rather than trickle |
| Home battery not full | Home battery charges first; surplus goes to Tesla (visible in feedinpower) |
| Tesla asleep | Use Tessie cached state; don't wake |
| Daily grid budget hit | Hard stop, notify Telegram, resume at midnight |
| Cloudy all day + low SoC | AI recommends limited grid draw to hit target if strategy = "Ready by departure" |
| Efficiency coefficient not yet learned (<7 days) | AI uses raw irradiance with confidence = "low"; note included in prompt |
| Tesla at non-home location (named location) | Layer 1 detects non-Home named location; optimization suspended immediately; "Charging Away" pill shown |
| Tesla at non-home location (no named location) | Layer 2 GPS check fails distance threshold; optimization suspended; "Charging Away" pill shown |
| Tesla GPS unavailable (car asleep, no fix) | Location unknown; optimization suspended; "Location Unknown" pill shown; retry on next loop tick |
| Home coordinates not set (first run) | App prompts onboarding to capture home location before optimization can activate |
| User moves home (new location) | Settings → "Update Home Location" re-captures GPS from Tesla's current position |
| Ollama offline | Rule-based fallback, amber warning in dashboard |
| API rate limit hit | Back off, hold last setpoint, flag in dashboard |
| Solax data stale (uploadTime > 5 min) | Flag stale data warning; hold last setpoint; do not act on outdated readings |
| Sunset mid-session | Gracefully stop optimization and AI; display "No solar output — optimization resumes at {sunrise}" in AI banner; optional Telegram notification |
| Post-sunset plug-in | Car detected plugged in after sunset; charging proceeds per fallback setting; AI banner shows suspended state; optimization arms at next sunrise |
| Session interrupted (unplug/replug) | New session started; subsidy tracking resets |
| Departure time passed without hitting target SoC | Switch to free charge mode; notify user |
