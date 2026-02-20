# AlwaysSunny — UI Specification

## App Name
**AlwaysSunny** (was: SolarCharge)

## Design Reference
Magic Patterns generated design: https://www.magicpatterns.com/c/9chry93xuchicrfkq8z7ae/preview
Use this as the visual reference. Implement the generated component structure.

---

## Design System

### Colors
```css
--bg-base: #0f1923;
--bg-card: #162030;
--bg-card-raised: #1e2d40;
--border-subtle: #2a3f57;
--solar-yellow: #f5c518;
--solar-yellow-dim: #7a6209;
--grid-blue: #3b82f6;
--ev-green: #22c55e;
--home-teal: #14b8a6;
--alert-red: #ef4444;
--warning-amber: #f59e0b;
--ai-purple: #a855f7;
--text-primary: #f0f4f8;
--text-secondary: #8da4be;
--text-dim: #4a6382;
```

### Typography
- Font: Inter (Google Fonts)
- Data values: font-weight 700, 2–3rem
- Labels: font-weight 400, 0.75rem, uppercase, letter-spacing
- Body/reasoning: font-weight 400, 0.875rem

### Shape
- Card border-radius: 12px
- Card padding: 20px
- Card gap: 16px
- Button/input border-radius: 8px

---

## Screens

### Screen 1: Dashboard (/)

**Layout:** 3-column CSS grid on desktop, single column on mobile

**Components:**

#### Status Bar (full width, top)
- Left: AlwaysSunny logo + wordmark (sun + lightning icon)
- Center: Mode pill — color + icon + text
  - `● Solar Optimizing` → green, pulsing dot
  - `● Suspended – Night` → grey
  - `● Suspended – Unplugged` → grey
  - `● Suspended – Charging Away` → amber
  - `● Suspended – Location Unknown` → amber
  - `⛔ Cutoff – Grid Budget` → red
  - `◆ Manual Override` → blue
- Right: Master "Optimize My Charging" toggle
  - Disabled + tooltip "Tesla not detected at home" when unplugged or away

#### Charger Connection Pill (below status bar, above AI banner)
A secondary status pill showing the Tesla's physical connection state and home detection result:

| Condition | Pill text | Colour |
|---|---|---|
| Plugged in, home confirmed (Layer 1 — named location) | `⚡ Charging at Home` | Green |
| Plugged in, home confirmed (Layer 2 — GPS proximity) | `⚡ Charging at Home` | Green |
| Plugged in, away from home | `📍 Charging Away — Optimization Paused` | Amber |
| Plugged in, location unknown (no GPS, no named location) | `? Location Unknown — Optimization Paused` | Amber |
| Not plugged in | `○ Not Connected` | Grey |

- Tapping the pill when amber shows a tooltip: "Tesla is not on your home solar circuit. Optimization is paused."
- Tapping the pill when "Location Unknown" shows: "Unable to confirm Tesla location. Check Tessie connection or set your home location in Settings."
- Home detection method is not surfaced to the user (Layer 1 vs Layer 2 is an implementation detail) — both show the same "Charging at Home" pill

#### Energy Flow Panel (left column, tall card)
Animated SVG/diagram: 4 nodes connected by directional arrows

Nodes:
```
      [☀️ Solar]
           ↓ {solar_w}W
      [🏠 Home]
    ↙              ↘
[⚡ Grid]      [🚗 Tesla]
{grid_w}W       {tesla_w}W · {amps}A
```

- Arrows animate (pulse) when power is flowing
- Grid arrow: green label if exporting, blue if importing
- Tesla node: only visible when plugged in
- Below diagram: 4 live metric tiles (Solar / Home / Grid / Charging at)

#### Session Live Stats (center column, top card)
Only shown when session active. Placeholder "No active session" otherwise.

- Tesla SoC progress bar: current% → target% with dual-color fill (yellow=solar, blue=grid)
- Large SoC number (e.g. "58%") with arrow to target ("→ 80%")
- Session metrics table:
  - Charging at: 12A · 2.9 kW
  - Session duration: 1h 24m
  - Added this session: 8.4 kWh
  - Solar subsidy: **85%** (large, yellow) · 7.1 kWh
  - Saved: ₱710

#### Charging Amperage Card (full-width card, below AI banner)

Based on the actual UI design — a full-width card showing current charging rate with a slider:

```
┌────────────────────────────────────────────────────────────────────┐
│ 🔌 CHARGING AMPERAGE         [🤖 AI]                               │
│                                                                    │
│ 8A                           ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│ Managed by AI optimizer      0A                               32A  │
└────────────────────────────────────────────────────────────────────┘
```

- **Left:** Large amp value (e.g. "8A"), label below ("Managed by AI optimizer" / "Manual control" / "Charging paused")
- **Right:** Horizontal slider, 0A–32A range
- **Top right:** AI badge pill (purple "AI" label) — visible when AI is controlling

**AI Optimization ON — slider locked, animated:**
- Slider is **read-only** — pointer-events disabled, cursor: default
- Slider thumb and track visually dimmed (opacity ~0.6) to signal non-interactivity
- No hover state, no focus ring on the slider track
- **Slider position animates smoothly** as AI adjusts amps — CSS transition on the value (e.g. `transition: left 1.5s ease-in-out`) so the thumb visibly slides to new position when AI sends a new command
- Label reads: "Managed by AI optimizer"
- AI badge pill shown in top-right of card header
- Tooltip on hover/tap of slider: "Slider is controlled by AI — toggle off AI optimization to adjust manually"

**AI Optimization OFF — slider interactive:**
- Slider fully interactive — user can drag to any value between 5A and 32A
- Slider thumb and track full opacity, standard hover/active states
- Label reads: "Manual control"
- AI badge pill hidden
- On release, app sends `set_charging_amps(value)` to Tessie immediately
- Value snaps to nearest integer amp

**Charging paused (budget hit / night / unplugged):**
- Slider greyed out entirely (opacity 0.35), non-interactive
- Label reads: "Charging paused"
- Amp value shows last commanded value (not 0)

**Transition behaviour when AI toggled off:**
- Slider immediately becomes interactive
- Amp value and slider position revert to `settings.default_charging_amps`
- Tessie command `set_charging_amps(default_amps)` sent immediately
- Smooth CSS animation on revert (slider moves from AI position to default position over ~1s)
- Label transitions from "Managed by AI optimizer" → "Manual control"

**Transition behaviour when AI toggled on:**
- Slider immediately locks (pointer-events disabled)
- AI badge pill fades in
- Label transitions to "Managed by AI optimizer"
- AI call triggered immediately (trigger_reason: "manual") — slider animates to AI's first recommendation within seconds
Bar chart — hourly irradiance today (sunrise to sunset only)
- X-axis: hours
- Y-axis: W/m² (or relative %)
- Yellow/amber bars
- Current time: white dashed vertical line
- Peak window: highlighted brighter yellow
- Cloud cover overlay: grey semi-transparent layer on cloudy hours
- Below chart: weather summary, sunrise/sunset times, peak window label

#### AI Recommendation Banner (full-width strip, below charger status pill)
The AI recommendation is a **full-width horizontal banner** with a purple left border/glow. Based on the actual UI design:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [🤖] AI RECOMMENDATION  |  "Solar at 2,840W and rising — pushing to 18A to capture peak..."  |  ● Auto Optimize Charging with AI  [toggle] │
│      18A  ·  high confidence                                                                    │
│      Re-evaluated 2 min ago · solar trend shifted                                               │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Left section:** purple robot icon + "AI RECOMMENDATION" label (small caps), large amp value + confidence badge pill below
- **Center section:** two lines — (1) italic reasoning text explaining the decision in plain English; (2) small secondary sub-text showing when AI last re-evaluated and what triggered it
- **Right section:** "● Auto Optimize Charging with AI" label + purple toggle — always visible in ALL states
- Purple left border/glow when active; dims to grey/amber when suspended or unavailable

**Trigger sub-text format (secondary line below reasoning):**
```
"Re-evaluated {X} min ago · {trigger_label}"
```
Trigger labels by reason:
- `scheduled` → "routine check"
- `solar_shift` → "solar trend shifted"
- `soc_threshold` → "SoC milestone reached"
- `budget_warning` → "grid budget running low"
- `departure_soon` → "departure window approaching"
- `manual` → "you requested a refresh"
- `stale` → "recommendation refreshed"

**AI banner states — left + center change; toggle always remains on right:**

| State | Left section | Center reasoning text | Border |
|---|---|---|---|
| Active — stable | 🤖 purple · amp value · confidence | e.g. "Conditions stable — 2,400W solar, on track. Maintaining 16A." | Purple glow |
| Active — acting on solar | 🤖 purple · amp value · confidence | e.g. "Solar at 2,840W and rising — pushing to 18A to capture peak window before 2pm." | Purple glow |
| Active — holding for cloud | 🤖 purple · amp value · confidence | e.g. "Solar dipped but forecast shows recovery in ~20 min — holding at 12A rather than reducing." | Purple glow |
| Active — budget aware | 🤖 purple · amp value · confidence | e.g. "Grid budget 85% used — throttling to 8A to preserve remaining allowance." | Purple glow |
| Active — departure pressure | 🤖 purple · amp value · confidence | e.g. "Departing in 55 min with 12% gap — allowing grid draw to guarantee 80% by 7:00 AM." | Purple glow |
| Post-sunset suspended | 🌙 grey · "AI Suspended" | "No solar output — optimization resumes at 5:52 AM" | Grey, dimmed |
| Ollama offline | ⚠️ amber · "AI Unavailable" | "AI offline — running rule-based fallback" | Amber |
| No active session | 🤖 dim · "AI Standby" | "Plug in your Tesla to activate AI optimization" | Grey, no glow |
| Manual AI off | 🤖 dim · "AI Off" | "Charging at default {X}A · Toggle on to resume optimization" | Grey, no glow |

**Key UI behaviours:**
- Reasoning text is written by the AI itself and displayed verbatim — it must be human-readable, not a data dump
- Trigger sub-text updates immediately when AI re-evaluates, giving the user real-time confidence the system is watching
- "Refresh" tappable element in center section allows manual AI trigger at any time (respects 90s minimum gap)
- Post-sunset is a **clean expected state** — grey/dim, not an error
- Ollama offline is a **warning** — amber border
- Actual sunrise time from Open-Meteo is interpolated into post-sunset message

#### Grid Budget + Weather (bottom right, split card)
Top half — Grid Budget:
```
Daily Grid Import Budget
████████░░░░░░░░░  2.1 / 5.0 kWh  (42%)
Resets at midnight
```
- Bar: blue → amber at 80% → red at 100%

Bottom half — Weather:
- Current: temp, condition icon
- Forecast: short summary text
- Source credit: Open-Meteo

---

### Screen 2: History (/history)

**Summary stats row (4 cards):**
- All-time solar charged (kWh)
- All-time saved (₱)
- Average solar subsidy (%)
- Sessions this month (#)

**Session list:**
Each card shows:
```
Thu Feb 19, 2026 · 9:14am → 1:32pm  (4h 18m)
Charged: 22.4 kWh
████████████████████░░░  Solar: 18.6 kWh (83%)  Grid: 3.8 kWh
                                              Saved: ₱186
```
- Fill bar: yellow=solar, blue=grid, always adds to 100%
- Expandable: click to show hourly amp/solar chart for that session

**View toggle:** This month / Last month / All time

---

### Screen 3: Settings (/settings)

**Section: Charging Preferences**
| Setting | Control |
|---|---|
| Target SoC | Slider 50–100%, live label |
| Default charging amps (fallback when AI off) | Slider 5–32A, live label |
| Max grid draw during charging | Number input, W |
| Daily grid import budget | Number input, kWh |
| Fallback outside solar hours | Radio: Stop / Free charge / Schedule |

**Section: Home Location**
```
📍 Home Location
Lat: 14.5547  Lon: 121.0244
Last set: Feb 1, 2026

[↻ Update Home Location]   ← re-captures from Tesla's current GPS
```
- "Update Home Location" button only active when Tesla is connected via Tessie
- Warning if home coordinates not yet set: "Home location required to activate optimization"

**Section: Meralco Tariff**
```
Effective tariff rate (₱/kWh)
[ 10.83 ] ₱/kWh     [↻ Fetch latest Meralco rate]

Last updated: Feb 1, 2026 · Set manually
ⓘ Use full effective rate (generation + distribution + transmission + taxes)
  Tip: Total Amount Due ÷ Total kWh on your last bill = your effective rate
```
- Warning if last updated >35 days ago

**Section: Notifications**
| Toggle | Default |
|---|---|
| Grid budget reached | On |
| Session complete | On |
| AI override events | Off |
| Monthly Meralco rate reminder | On |

Telegram chat ID input field

**Section: API Connections**
| Service | Status |
|---|---|
| Solax Cloud | 🟢 Connected · last data 45s ago |
| Tessie (Tesla) | 🟢 Connected · Tesla plugged in |
| Ollama AI | 🟢 qwen2.5:7b · avg 1.4s |
| Open-Meteo | 🟢 Forecast updated 8m ago |

---

## App States

| State | Dashboard behavior |
|---|---|
| Tesla unplugged | Tesla node hidden, session card shows placeholder, toggle disabled, charger pill = "Not Connected" |
| Tesla charging away | Charger pill = "Charging Away — Optimization Paused" (amber), mode pill = "Suspended – Charging Away", AI banner = standby, slider locked/greyed |
| Tesla location unknown | Charger pill = "Location Unknown — Optimization Paused" (amber), mode pill = "Suspended – Location Unknown", optimization paused |
| Night / no solar | Solar node dimmed (0W), mode pill = Suspended – Night, AI strip shows grey suspended state with "No solar output available — AI optimization resumes at 5:58 AM", forecast shows "Next solar: 5:58am tomorrow" |
| Grid budget hit | Red mode pill, budget bar full red, "Charging paused – budget reached", countdown to midnight, slider locked |
| AI optimization ON | Slider locked + dimmed, animated on each AI amp adjustment, label = "Managed by AI optimizer", AI badge shown |
| AI optimization OFF | Slider interactive, label = "Manual control", reverts to default amps immediately |
| Ollama offline | Amber strip in AI banner: "AI unavailable – rule-based fallback active", slider remains locked (rule-based controls it) |
| First run (no settings) | Onboarding modal: 6 steps — Connect Solax → Connect Tessie → Set Home Location → Set target SoC → Enter Meralco rate → Enable switch |

---

## Sample Data (for Windsurf mockup state)

```js
const sampleState = {
  mode: "Solar Optimizing",
  solar_w: 2840,
  household_w: 880,
  grid_w: 120, // positive = importing
  battery_soc: 78,
  battery_w: -200, // negative = discharging
  tesla: {
    plugged_in: true,
    soc: 58,
    target_soc: 80,
    amps: 12,
    kw: 2.9,
    location: "Home"
  },
  session: {
    active: true,
    duration_mins: 84,
    kwh_added: 8.4,
    solar_kwh: 7.1,
    solar_pct: 85,
    saved_pesos: 710
  },
  ai: {
    status: "active",
    recommended_amps: 12,
    confidence: "medium",
    reasoning: "Peak solar in 45 min — holding moderate rate, will increase to 18A at 11am"
  },
  grid_budget: {
    used_kwh: 2.1,
    total_kwh: 5.0,
    pct: 42
  },
  weather: {
    temp_c: 28,
    condition: "Partly Cloudy",
    forecast: "Clearing by 11am"
  },
  forecast: {
    sunrise: "05:58",
    sunset: "17:52",
    peak_start: "10:00",
    peak_end: "14:00",
    hourly: [
      { hour: "06:00", irradiance: 120, cloud: 20 },
      { hour: "07:00", irradiance: 280, cloud: 25 },
      { hour: "08:00", irradiance: 480, cloud: 30 },
      { hour: "09:00", irradiance: 620, cloud: 35 },
      { hour: "10:00", irradiance: 710, cloud: 20 },
      { hour: "11:00", irradiance: 740, cloud: 15 },
      { hour: "12:00", irradiance: 730, cloud: 15 },
      { hour: "13:00", irradiance: 680, cloud: 20 },
      { hour: "14:00", irradiance: 560, cloud: 40 },
      { hour: "15:00", irradiance: 380, cloud: 55 },
      { hour: "16:00", irradiance: 210, cloud: 60 },
      { hour: "17:00", irradiance: 80, cloud: 65 }
    ]
  },
  meralco_rate: 10.83
}
```
