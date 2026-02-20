# AlwaysSunny — Onboarding Flow

## Overview

Onboarding runs on first launch when required settings are missing. It can also be re-triggered from Settings → "Re-run Setup". The flow is a 6-step modal wizard that collects the minimum required configuration before the app can activate optimization.

Onboarding is **blocking** — the dashboard is visible behind the modal but the optimization toggle is disabled and greyed out until all required steps are complete.

Required steps (cannot skip): 1, 2, 3, 4
Optional steps (can skip, can configure later): 5, 6

---

## Step Sequence

### Step 1 — Connect Solax Cloud
**Goal:** Verify the app can reach the user's inverter data.

**UI:**
```
☀️ Connect Your Solax Inverter

Enter your Solax Cloud credentials to pull live solar data.

[ Token ID          ]
[ Dongle Serial No. ]   ← Registration No. from solaxcloud.com, NOT inverter SN

                    [Test Connection]
```

**On "Test Connection":**
- POST to Solax API with provided credentials
- If success → green checkmark, "Connected — inverter data confirmed", Next button activates
- If fail → red error, "Could not connect. Check your Token ID and Dongle Serial No."

**On success:**
- Save `SOLAX_TOKEN_ID` and `SOLAX_DONGLE_SN` to settings table
- Display live solar yield from first successful read (e.g. "Currently seeing 2,840W solar")

**Failure handling:**
- User can retry unlimited times
- "Where do I find these?" link opens tooltip: "Log in at solaxcloud.com → API page → copy Token ID. Dongle SN = the Registration No. on your physical dongle, not the inverter serial number."

---

### Step 2 — Connect Tessie (Tesla)
**Goal:** Verify the app can read Tesla state and send charging commands.

**UI:**
```
🚗 Connect Your Tesla via Tessie

Tessie is a Tesla API service. You'll need a Tessie API key.

[ Tessie API Key    ]

Get your key at tessie.com/settings → API

                    [Test Connection]
```

**On "Test Connection":**
- GET Tessie `/state` with provided key (use_cache=true, no wake)
- If success → green checkmark, "Connected — Tesla found", shows vehicle name + current SoC
- If fail → red error, "Could not connect. Check your Tessie API key."

**On success:**
- Save `TESSIE_API_KEY` to settings table
- Also capture and save `TESSIE_VIN` from response

**Failure handling:**
- "My Tesla is asleep — will this still work?" tooltip: "Yes — we use Tessie's cached state so your car won't be woken up during setup."

---

### Step 3 — Set Home Location
**Goal:** Capture the GPS coordinates that define "home" for home stack detection (Layer 2 fallback).

**UI:**
```
📍 Set Your Home Location

We'll use your Tesla's current GPS location as your home.
Make sure your Tesla is parked at home right now.

Current Tesla location:
  14.5547° N, 121.0244° E   ✓ GPS confirmed

                    [Use This Location as Home]
```

**On load:**
- Auto-fetch Tesla GPS from Tessie `/location`
- If `saved_location == "Home"` in Tessie → show: "Tessie also recognises this as 'Home' ✓ — both detection methods will work"
- If `saved_location` is null or something else → show: "Tip: Setting 'Home' as a named location in the Tessie app gives more reliable home detection"

**On "Use This Location as Home":**
- Save `home_lat` and `home_lon` to settings table
- Save `tessie_home_location_name` ("Home" if confirmed, null if not)
- Green checkmark, "Home location saved", Next button activates

**Failure handling:**
- If GPS unavailable (car asleep, no fix): "Unable to get Tesla's location right now. Make sure the car is awake and try again, or enter coordinates manually."
- Manual entry fallback: two number inputs for lat/lon with "Use my coordinates" button

---

### Step 4 — Configure Charging Preferences
**Goal:** Set the core charging parameters the app and AI use as operating targets.

**UI:**
```
⚡ Charging Preferences

Target State of Charge
[●━━━━━━━━━━━━━━━━━━━━━━━━━━━] 80%
Stop charging when battery reaches this level.

Default Charging Amps (when AI is off)
[●━━━━━━━━━━━━━━━━━━━━━━━━━━━] 8A
Fallback rate when AI optimization is disabled.

Daily Grid Import Budget
[ 5.0 ] kWh   (set to 0 for no limit)
Max grid electricity the car can use per day.

Max Grid Draw During Charging
[ 500 ] W   (set to 0 for no limit)
Instantaneous cap on grid import while charging.

                    [Save & Continue]
```

**Defaults:** Target SoC = 80%, Default amps = 8A, Daily budget = 5.0 kWh, Max grid draw = 500W

**On "Save & Continue":**
- Save all four values to settings table
- Next button activates

---

### Step 5 — Enter Meralco Tariff Rate (Optional)
**Goal:** Configure the electricity rate used to calculate ₱ saved per session.

**UI:**
```
💡 Electricity Tariff (Optional)

Enter your all-in effective Meralco rate to track peso savings.

[ 10.83 ] ₱/kWh

ℹ️ Use your full effective rate — not just the generation charge.
   Tip: Total Amount Due ÷ Total kWh on your last bill = your rate.
   Typical range: ₱10–12/kWh

                    [Save]   [Skip for now]
```

**On "Skip for now":**
- ₱ saved will show as "—" until rate is configured
- Reminder shown in Settings: "Enter your Meralco rate to enable savings tracking"

**On "Save":**
- Save `meralco_rate` and `meralco_rate_updated_at` to settings table

---

### Step 6 — Configure Telegram Notifications (Optional)
**Goal:** Set up push notifications for key events.

**UI:**
```
🔔 Notifications (Optional)

Get notified when important events happen.

[ Telegram Chat ID  ]

How to get your Chat ID:
1. Message @userinfobot on Telegram
2. It will reply with your Chat ID

                    [Test Notification]   [Skip for now]
```

**On "Test Notification":**
- Send test message via Telegram Bot API
- If success → "✓ Test message sent! Check your Telegram."
- If fail → "Could not send. Check your Chat ID and try again."

**On "Skip for now":**
- Notifications disabled until configured in Settings

**Default notification toggles (all configurable in Settings later):**
- Grid budget reached: On
- Session complete with summary: On
- AI override events: Off
- Monthly Meralco rate reminder: On

---

### Completion Screen

```
✅ AlwaysSunny is ready.

Your system is configured and connected.
Solar optimization will activate automatically when your
Tesla is plugged in at home during daylight hours.

Solax Cloud     ✓ Connected
Tessie (Tesla)  ✓ Connected
Home Location   ✓ Set
Charging Prefs  ✓ Configured
Meralco Rate    ✓ / — (skipped)
Telegram        ✓ / — (skipped)

                    [Go to Dashboard]
```

---

## Re-Running Onboarding

From Settings → scroll to bottom → "Re-run Setup Wizard"

- All existing settings are pre-filled in each step
- User can update individual steps and save without completing all steps again
- "Update Home Location" in Settings jumps directly to Step 3 logic (re-captures GPS)

---

## Settings Keys Written During Onboarding

| Key | Step | Required |
|---|---|---|
| `solax_token_id` | 1 | Yes |
| `solax_dongle_sn` | 1 | Yes |
| `tessie_api_key` | 2 | Yes |
| `tessie_vin` | 2 | Yes |
| `home_lat` | 3 | Yes |
| `home_lon` | 3 | Yes |
| `tessie_home_location_name` | 3 | No |
| `target_soc` | 4 | Yes |
| `default_charging_amps` | 4 | Yes |
| `daily_grid_budget_kwh` | 4 | Yes |
| `max_grid_import_w` | 4 | Yes |
| `meralco_rate` | 5 | No |
| `meralco_rate_updated_at` | 5 | No |
| `telegram_chat_id` | 6 | No |

---

## Onboarding Completion Gate

The optimization toggle on the dashboard remains **disabled** until these four settings are all present in the settings table:
- `solax_token_id`
- `tessie_api_key`
- `home_lat` + `home_lon`
- `target_soc`

If any are missing on app load, onboarding modal is shown automatically.
