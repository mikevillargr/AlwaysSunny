# AlwaysSunny — API Reference

## 1. SolaxCloud API

**Base URL:** `https://www.solaxcloud.com/proxyApp/proxy/api/`  
**Auth:** tokenID passed as query parameter  
**Rate limit:** 10 requests/min, 10,000/day  
**Recommended poll:** every 60 seconds  

### Get Realtime Data
```
GET https://www.solaxcloud.com/proxyApp/proxy/api/getRealtimeInfo.do
  ?tokenId={TOKEN_ID}
  &sn={DONGLE_SN}
```

**Response fields used by AlwaysSunny:**

| Field | Description | Unit |
|---|---|---|
| `powerdc1` | PV string 1 power (MPPT1) | W |
| `powerdc2` | PV string 2 power (MPPT2) | W |
| `powerdc3` | PV string 3 power (MPPT3) | W |
| `powerdc4` | PV string 4 power (MPPT4) | W |
| `feedinpower` | Grid power (positive=export, negative=import) | W |
| `consumeenergy` | Cumulative grid import all-time | kWh |
| `feedinenergy` | Cumulative grid export all-time | kWh |
| `batPower` | Battery charge(+)/discharge(-) power | W |
| `soc` | Home battery state of charge | % |
| `acpower` | Inverter AC output total | W |
| `yieldtoday` | Solar generated today | kWh |
| `inverterStatus` | 100=Wait, 102=Normal, 103=Fault, 107=EPS | - |
| `uploadTime` | Timestamp of last data update | datetime |

**Derived calculations:**
```python
solar_yield_w = powerdc1 + powerdc2  # add dc3/dc4 if present
grid_import_w = -feedinpower if feedinpower < 0 else 0
grid_export_w = feedinpower if feedinpower > 0 else 0
household_demand_w = solar_yield_w - feedinpower  # feedinpower can be negative
```

**Notes:**
- `sn` = Registration No. on the WiFi/LAN dongle, NOT the inverter serial number
- `uploadTime` tells you actual data freshness — poll this to confirm refresh rate
- No historical time-series — build your own by storing each poll response

---

## 2. Tessie API

**Base URL:** `https://api.tessie.com/{vin}/`  
**Auth:** `Authorization: Bearer {API_KEY}` header  
**Rate limit:** Not publicly documented. Cached `/state` is safe to poll freely.

### Get Vehicle State (cached, no sleep impact)
```
GET https://api.tessie.com/{vin}/state?use_cache=true
```
Returns full vehicle state. Key fields:

| Field path | Description |
|---|---|
| `charge_state.charge_port_door_open` | Plug connected |
| `charge_state.charging_state` | "Charging", "Complete", "Stopped", "Disconnected" |
| `charge_state.battery_level` | SoC % |
| `charge_state.charge_current_request` | Current charging amps |
| `charge_state.charge_energy_added` | kWh added this session |
| `charge_state.charge_rate` | Current charge rate (mph/kph) |
| `drive_state.latitude` | GPS latitude |
| `drive_state.longitude` | GPS longitude |

### Get Location
```
GET https://api.tessie.com/{vin}/location
```
```json
{
  "latitude": 14.5995,
  "longitude": 120.9842,
  "address": "123 Example St, Quezon City, Metro Manila, Philippines",
  "saved_location": "Home"
}
```
Use `saved_location == "Home"` to confirm car is at home before activating optimization.

### Set Charging Amps
```
POST https://api.tessie.com/{vin}/command/set_charging_amps
Body: { "amps": 12 }
```
Valid range: 5–32A. Do not send values below 5 (stop charging instead).

### Start Charging
```
POST https://api.tessie.com/{vin}/command/start_charging
```

### Stop Charging
```
POST https://api.tessie.com/{vin}/command/stop_charging
```

**Notes:**
- Always use `use_cache=true` for state polling to avoid waking the car
- Only send commands when the value actually needs to change (don't spam)
- Command endpoints wake the car if asleep — only call when Tesla is plugged in at home

---

## 3. Open-Meteo API

**Base URL:** `https://api.open-meteo.com/v1/forecast`  
**Auth:** None required  
**Rate limit:** Generous free tier, no key needed  
**Poll frequency:** Once per hour is sufficient

### Forecast Request
```
GET https://api.open-meteo.com/v1/forecast
  ?latitude={LAT}
  &longitude={LON}
  &hourly=cloud_cover,direct_normal_irradiance,global_tilted_irradiance,shortwave_radiation
  &daily=sunrise,sunset,shortwave_radiation_sum
  &timezone=Asia/Manila
  &forecast_days=1
```

**Key response fields:**

| Field | Description | Unit |
|---|---|---|
| `hourly.shortwave_radiation` | Solar irradiance per hour | W/m² |
| `hourly.cloud_cover` | Cloud cover per hour | % |
| `hourly.direct_normal_irradiance` | Direct beam radiation | W/m² |
| `daily.sunrise` | Sunrise time (ISO8601) | datetime |
| `daily.sunset` | Sunset time (ISO8601) | datetime |
| `daily.shortwave_radiation_sum` | Total solar energy today | MJ/m² |

**Usage in AlwaysSunny:**
```python
# Get sunrise/sunset for optimization window
sunrise = response["daily"]["sunrise"][0]
sunset = response["daily"]["sunset"][0]

# Build irradiance curve string for AI prompt
irradiance_curve = {
    hour: f"{irradiance}W/m²"
    for hour, irradiance in zip(hourly_times, hourly_irradiance)
    if hour >= current_time  # only future hours
}

# Identify peak window (hours where irradiance > 70% of daily max)
peak_hours = [h for h, v in irradiance_curve.items() if v > max_irradiance * 0.7]
```

---

## 4. Ollama API

**Base URL:** `http://{VPS_HOST}:11434`  
**Auth:** None (internal network only — do not expose publicly)  
**Model:** `qwen2.5:7b`  
**Call frequency:** Every 5 minutes during active optimization

### Generate (chat completion)
```
POST http://{VPS_HOST}:11434/api/generate
Content-Type: application/json

{
  "model": "qwen2.5:7b",
  "prompt": "<full prompt string>",
  "format": "json",
  "stream": false,
  "options": {
    "temperature": 0.1,
    "num_predict": 150
  }
}
```

**Response:**
```json
{
  "response": "{\"recommended_amps\": 14, \"reasoning\": \"...\", \"confidence\": \"medium\"}",
  "done": true
}
```

**Implementation notes:**
- `format: "json"` enforces structured output — Qwen2.5 respects this reliably
- `temperature: 0.1` — low temperature for deterministic, consistent recommendations
- `num_predict: 150` — cap tokens since output is always small JSON
- `stream: false` — wait for complete response
- Parse `response` field as JSON; strip any markdown fences defensively
- Set HTTP timeout to 30 seconds — if exceeded, use rule-based fallback
- Log all AI calls: prompt, response, latency, for debugging

**Fallback behavior:**
```python
try:
    ai_result = call_ollama(prompt)
    recommended_amps = ai_result["recommended_amps"]
    ai_status = "active"
except (TimeoutError, ConnectionError, JSONDecodeError):
    recommended_amps = rule_based_amps
    ai_status = "fallback"
    # Dashboard shows amber "AI unavailable – rule-based fallback active"
```

---

## 5. Telegram Bot API

**Purpose:** Push notifications for key events  
**Setup:** Create bot via @BotFather, get token, get chat ID

### Send Message
```
POST https://api.telegram.org/bot{TOKEN}/sendMessage
Body: {
  "chat_id": "{CHAT_ID}",
  "text": "⚡ Grid budget reached (5.0 kWh). Tesla charging paused.",
  "parse_mode": "HTML"
}
```

**Notification triggers:**
| Event | Message |
|---|---|
| Grid budget reached | `⛔ Grid budget reached ({X} kWh). Tesla charging paused.` |
| Session complete | `✅ Session complete. Added {X} kWh — {Y}% solar (₱{Z} saved)` |
| Optimization activated | `☀️ AlwaysSunny activated. Charging at {X}A.` |
| AI fallback activated | `⚠️ Ollama unreachable. Running rule-based mode.` |
| Meralco rate reminder | `💡 Monthly reminder: verify your Meralco rate in AlwaysSunny settings.` |
