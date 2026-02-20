# AlwaysSunny — Design Decisions Log

This document records key design decisions made during specification, the alternatives considered, and the rationale. Its purpose is to prevent Windsurf or future contributors from second-guessing or "improving" decisions that were made deliberately — and to provide context when revisiting them later.

---

## D1 — Rule-Based Loop Runs Every 60–90 Seconds; AI Runs Every 5 Minutes (+ Event Triggers)

**Decision:** Separate the control loop (60–90s) from the AI evaluation cycle (5-min baseline + event triggers). The rule-based loop acts on every tick; AI output is cached and applied when fresh.

**Alternatives considered:**
- AI on every control loop tick → too expensive; Ollama takes 5–15s per call; 7B model on VPS would bottleneck
- Fixed 5-min interval only → misses meaningful state changes (solar shift, SoC milestone, budget warning)
- Fully reactive AI (fire on every Solax change) → too noisy; solar fluctuates constantly

**Rationale:** The rule-based loop handles real-time control; the AI handles strategic setpoint decisions. These operate at different timescales. Event triggers add responsiveness to meaningful changes without hammering Ollama. The 90-second minimum gap prevents call storms.

---

## D2 — AI Output is Advisory; Rule-Based Loop Runs Independently

**Decision:** The rule-based loop runs regardless of AI availability. AI output adjusts the setpoint when fresh; rule-based is the fallback. AI never blocks control.

**Alternatives considered:**
- AI as sole controller → system fails entirely if Ollama is offline; unacceptable
- Rule-based only, no AI → works but misses anticipatory optimisation (cloud banks, SoC pressure, departure time)

**Rationale:** The rule-based loop is always safe to run — it acts on actual Solax data with hard stops. AI augments it with forward-looking reasoning. If Ollama goes down, the car still charges correctly. Separation of concerns also makes testing easier.

---

## D3 — Revert to Default Amps on Manual AI Toggle Off; Rule-Based Continues on Ollama Failure

**Decision:** When the user manually toggles AI off, immediately send `set_charging_amps(default_amps)`. When Ollama goes offline, the rule-based loop takes over without reverting — it manages amps dynamically.

**Alternatives considered:**
- Always revert to default amps when AI is unavailable → wrong for Ollama failure; rule-based is the appropriate controller in that case, not a fixed default
- Never revert, hold last AI setpoint → user gets unexpected amps when taking manual control

**Rationale:** These are different events with different intent. Manual off = user taking control = restore their baseline. Ollama offline = temporary AI outage = rule-based seamlessly takes over. The distinction matters because the rule-based loop adapts to live solar conditions; a fixed default amp does not.

---

## D4 — Home Detection Uses Two Layers: Named Location (Primary), GPS Proximity (Fallback)

**Decision:** Layer 1 checks Tessie `saved_location == "Home"`. Layer 2 uses GPS haversine within 100m of stored home coordinates. Both resolve to the same "Charging at Home" state in the UI.

**Alternatives considered:**
- Named location only → fails for users who haven't configured Tessie named locations
- GPS only → less reliable; GPS drift, tunnel parking, apartment underground lots can cause false negatives
- Voltage cross-check (Layer 3) → adds complexity; 240V chargers exist elsewhere; deferred to future
- IP address matching → unreliable; mobile hotspots, VPNs, Tesla's own connectivity
- Manual "I'm home" toggle → friction; defeats the point of automation

**Rationale:** Layer 1 is clean and reliable for users who use Tessie properly. Layer 2 covers the gap for users who haven't set named locations. Together they handle >95% of real-world cases without asking users to do anything extra beyond onboarding. Voltage check (Layer 3) is deliberately not implemented in Phase 1 to avoid over-engineering.

**100m radius rationale:** Tight enough to distinguish home from a neighbour's house or street parking. Wide enough to handle typical GPS drift (~10–20m). Can be made user-configurable in a future settings update.

---

## D5 — Solax Cloud API Only (No Local Modbus)

**Decision:** Use Solax Cloud API exclusively. Local Modbus TCP over LAN is not implemented in Phase 1.

**Alternatives considered:**
- Local Modbus TCP → sub-second refresh rate, no rate limits, works offline — but requires the app to run on the same LAN as the inverter; breaks if hosted on remote VPS; adds significant setup complexity

**Rationale:** Cloud API is simpler to deploy, works from any hosting location, and the ~5-min refresh rate matches the AI cycle anyway. Solax Cloud rate limits (10/min, 10,000/day) are well within our usage at one call per minute (~1,440/day). Local Modbus is a worthwhile future upgrade if the user wants sub-minute resolution.

---

## D6 — Rolling Average Window is 3 Readings (~3 Minutes)

**Decision:** Use a 3-reading rolling average (~3 minutes at 60s intervals) to smooth solar fluctuations before commanding Tesla.

**Alternatives considered:**
- 1 reading (no smoothing) → Tesla gets hammered with amp changes every 60s; stresses charging system; annoying for occupants
- 5 readings (~5 min) → too slow to respond to genuine sustained solar changes
- 10 readings (~10 min) → misses meaningful half-hour solar windows entirely

**Rationale:** 3 readings (~3 min) smooths transient clouds (which typically pass in 1–2 min) while still responding to sustained changes within a few minutes. This is consistent with EVCC and similar open-source projects' approach.

---

## D7 — System Efficiency Coefficient is Learned, Not User-Configured

**Decision:** The coefficient that translates Open-Meteo irradiance (W/m²) to expected yield (W) is computed automatically from historical snapshot data, bucketed by hour of day.

**Alternatives considered:**
- Ask user to enter panel area + efficiency → too technical; most users don't know their panel specs
- Fixed global coefficient → ignores time-of-day angle effects; would be significantly wrong at morning/evening
- Don't translate at all; pass raw irradiance to AI → AI has no way to know whether 500 W/m² means 1kW or 3kW for this system

**Rationale:** Automatic learning is zero-friction for the user and produces a more accurate result than any user-provided value. Bucketing by hour of day captures the angle effect (a fixed panel produces more per unit irradiance at solar noon than at 8am). Requires 7 days of data to be meaningful; before that the AI uses raw irradiance with reduced confidence — this is flagged explicitly in the prompt.

---

## D8 — Charging Amperage Slider is Read-Only When AI is Active

**Decision:** When AI optimization is enabled, the amperage slider is visually locked (dimmed, non-interactive) but animates to show the AI's current setpoint. User cannot drag it.

**Alternatives considered:**
- Allow user to drag slider even when AI is on → conflicting commands; user sets 20A, AI immediately overrides back to 12A; confusing and potentially harmful to session
- Hide the slider entirely when AI is on → loses visibility into what AI is doing; key UX feature lost
- Show slider but disable amp commands when AI is on → deceptive; user thinks they're doing something but nothing happens

**Rationale:** The slider as a read-only animated display gives the user real-time visibility into AI decisions (watching the thumb move is satisfying and builds trust). Locking it makes the system's authority clear — when AI is in charge, it's in charge. The tooltip explains how to regain manual control.

---

## D9 — AI Reasoning Text is Written by the AI and Displayed Verbatim

**Decision:** The `reasoning` field in the AI's JSON response is displayed directly in the dashboard banner without transformation. The AI prompt includes explicit instructions on how to write it.

**Alternatives considered:**
- Template-based reasoning strings (app generates them based on which rule fired) → deterministic but brittle; can't capture nuanced reasoning like "holding rate because forecast shows recovery"
- AI reasoning processed/summarised by a second AI call → expensive; adds latency; overkill
- Show technical data instead of reasoning → users don't want "smoothed_available_w: 2,400" — they want "Solar is strong, charging at full rate"

**Rationale:** The LLM is already reasoning through the decision — it should articulate that in human terms. The prompt includes worked examples and explicit style instructions (name the signal, state the anticipation, plain English) to ensure consistent quality. The AI banner becomes the app's primary communication channel with the user.

---

## D10 — Open-Meteo as the Sole Weather Source

**Decision:** Use Open-Meteo exclusively. No other weather API is integrated.

**Alternatives considered:**
- Tomorrow.io → better resolution, but requires API key and has rate limits on free tier
- OpenWeatherMap → widely used, but irradiance data is less detailed than Open-Meteo
- Visual Crossing → good data but paid for higher resolution

**Rationale:** Open-Meteo is free, no API key required, specifically designed for solar/energy applications, provides GHI (Global Horizontal Irradiance) directly, and has a clean REST API. For a home solar optimizer in the Philippines it's more than sufficient.

---

## D11 — SQLite for Phase 1, PostgreSQL Path for Production

**Decision:** Use SQLite for Phase 1 development. The schema is designed to be compatible with PostgreSQL when scaling is needed.

**Alternatives considered:**
- PostgreSQL from day one → more setup friction; unnecessary for single-user app on VPS/Pi
- InfluxDB (time-series) → better for snapshot data but adds significant operational complexity; SQLite is adequate for ~1,440 snapshots/day

**Rationale:** A single user generates ~1,440 snapshots/day and ~1 session/day. SQLite handles this easily. The key-value settings table, typed columns, and standard SQL queries all migrate cleanly to PostgreSQL if multi-user or multi-inverter support is added later.

---

## D12 — Ollama Model: Qwen2.5:7b Preferred, llama3.1:8b as Fallback

**Decision:** Default to Qwen2.5:7b. Fall back to llama3.1:8b if Qwen is not available.

**Alternatives considered:**
- Llama 3.1:8b only → adequate but produces more conversational preamble before JSON; less reliable JSON adherence
- Mistral:7b → good JSON adherence but weaker structured reasoning than Qwen2.5
- Larger models (13B+) → too slow on VPS CPU inference for a 5-min cycle; 5–15s is acceptable, 60s+ is not

**Rationale:** Qwen2.5:7b produces clean JSON with minimal preamble and has strong analytical reasoning for its parameter count. The prompt includes explicit "Respond ONLY in JSON" instructions which helps any model, but Qwen is more consistently reliable. The app's JSON parser should strip any accidental preamble before parsing regardless.

---

## D13 — Sunset-Aware Optimization Window; No Night Charging Optimization

**Decision:** AI and rule-based optimization only run between Open-Meteo's forecasted sunrise and sunset. After sunset, the system suspends entirely (or follows fallback charging setting).

**Alternatives considered:**
- Run optimization 24 hours → pointless after sunset; solar is zero; control loop would just stop charging every tick
- Run until actual solar_yield drops to zero → more precise but adds complexity; Open-Meteo's sunset time is accurate enough and avoids dependency on Solax readings to determine "end of solar day"

**Rationale:** Sunrise/sunset from Open-Meteo is a reliable, accurate, daily-updated value. Running the optimization loop at night wastes API calls and Ollama compute for zero benefit. The fallback charging behaviour (Stop / Free charge / Schedule) handles overnight charging needs if the user wants them.

---

## D14 — No Multi-Vehicle, No Multi-Inverter in Phase 1

**Decision:** Phase 1 assumes exactly one Tesla (via Tessie) and one Solax inverter. Multi-vehicle and multi-inverter support is explicitly out of scope.

**Rationale:** The data model (single `tessie_vin`, single Solax dongle SN) keeps the schema and logic simple. Adding multi-vehicle support would require significant changes to session tracking, amp command routing, and the dashboard. It's a natural Phase 3+ feature. The settings table key-value structure makes adding per-vehicle settings straightforward in the future without a schema migration.
