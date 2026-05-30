# AlwaysSunny AI API - Quick Start Guide

**Base URL:** `http://76.13.191.149`

## Authentication

All requests require an API key in the `Authorization` header:

```
Authorization: Bearer as_<your_api_key>
```

## Core Endpoints

### 1. Get System Context

**Endpoint:** `GET /api/ai/context`

Returns everything you need in one call: current status, active session, recent sessions, settings, and system health.

**Request:**
```bash
curl http://76.13.191.149/api/ai/context \
  -H "Authorization: Bearer as_<your_key>"
```

**Response:**
```json
{
  "status": {
    "mode": "Solar-First",
    "solar_w": 4500,
    "household_demand_w": 2000,
    "grid_import_w": 100,
    "battery_soc": 85,
    "battery_w": -500,
    "tesla_soc": 65,
    "tesla_charging_amps": 16,
    "tesla_charging_kw": 3.8,
    "charge_port_connected": true,
    "charging_state": "Charging",
    "target_soc": 80,
    "ai_enabled": true,
    "tessie_enabled": true
  },
  "active_session": {
    "id": 123,
    "started_at": "2026-05-30T08:00:00Z",
    "kwh_added": 5.2,
    "solar_kwh": 4.1,
    "solar_pct": 78.8
  },
  "recent_sessions": [...],
  "settings": {
    "target_soc": "80",
    "charging_strategy": "solar",
    "ai_enabled": "true",
    "default_charging_amps": "16"
  },
  "health": {
    "tessie": {"status": "connected"},
    "solax": {"status": "connected"}
  },
  "timestamp": "2026-05-30T09:30:00Z"
}
```

### 2. Execute Commands

**Endpoint:** `POST /api/ai/command`

Unified interface for all control actions.

#### Set Charging Amps (0-32A)

```bash
curl -X POST http://76.13.191.149/api/ai/command \
  -H "Authorization: Bearer as_<your_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "set_charging_amps",
    "params": {"amps": 20}
  }'
```

**Response:**
```json
{
  "message": "Charging amps set to 20A",
  "amps": 20
}
```

#### Start Charging

```bash
curl -X POST http://76.13.191.149/api/ai/command \
  -H "Authorization: Bearer as_<your_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "start_charging",
    "params": {}
  }'
```

#### Stop Charging

```bash
curl -X POST http://76.13.191.149/api/ai/command \
  -H "Authorization: Bearer as_<your_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "stop_charging",
    "params": {}
  }'
```

#### Update Settings

```bash
curl -X POST http://76.13.191.149/api/ai/command \
  -H "Authorization: Bearer as_<your_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "update_settings",
    "params": {
      "target_soc": "85",
      "ai_enabled": "true"
    }
  }'
```

### 3. Query Sessions

**Endpoint:** `GET /api/ai/sessions`

Get session history with optional filters.

**Parameters:**
- `limit` (1-100, default 10): Number of sessions
- `offset` (default 0): Pagination offset
- `min_solar_pct` (0-100): Filter by minimum solar percentage
- `min_kwh` (>= 0): Filter by minimum kWh added

**Request:**
```bash
curl "http://76.13.191.149/api/ai/sessions?limit=20&min_solar_pct=70" \
  -H "Authorization: Bearer as_<your_key>"
```

**Response:**
```json
{
  "sessions": [
    {
      "id": 123,
      "started_at": "2026-05-30T08:00:00Z",
      "ended_at": "2026-05-30T10:30:00Z",
      "duration_mins": 150,
      "kwh_added": 12.5,
      "solar_kwh": 9.8,
      "grid_kwh": 2.7,
      "solar_pct": 78.4,
      "start_soc": 45,
      "end_soc": 80
    }
  ],
  "count": 15,
  "offset": 0,
  "limit": 20
}
```

### 4. Submit AI Recommendation

**Endpoint:** `POST /api/ai/recommendation`

Submit your AI's charging recommendation with reasoning.

**Request:**
```bash
curl -X POST http://76.13.191.149/api/ai/recommendation \
  -H "Authorization: Bearer as_<your_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "recommended_amps": 24,
    "reasoning": "High solar surplus (3500W) with battery at 90%. Maximize solar utilization while staying within grid import limits.",
    "confidence": "high",
    "trigger_reason": "solar_surplus"
  }'
```

**Fields:**
- `recommended_amps` (0-32): Your recommended charging rate
- `reasoning` (string): Explanation of your decision
- `confidence` ("low" | "medium" | "high"): Your confidence level
- `trigger_reason` (string): What triggered this recommendation

**Response:**
```json
{
  "message": "AI recommendation submitted",
  "recommended_amps": 24,
  "confidence": "high"
}
```

## Additional Endpoints

All existing AlwaysSunny endpoints also accept API key authentication:

- `GET /api/status` - Current dashboard state
- `GET /api/sessions` - Session history (paginated)
- `GET /api/settings` - User settings
- `POST /api/control/optimize/toggle` - Toggle AI optimization
- `POST /api/control/amps/override` - Manual amp override
- `GET /api/health` - System health check
- `GET /api/outlook` - Solar forecast
- `GET /api/reports/summary` - Analytics summary

## Error Responses

### 401 Unauthorized
```json
{
  "detail": "Invalid or expired API key"
}
```

### 400 Bad Request
```json
{
  "detail": "Invalid amps value (must be 0-32)"
}
```

### 500 Internal Server Error
```json
{
  "detail": "Failed to set charging amps: <error details>"
}
```

## Rate Limits

Be mindful of upstream API limits:
- **Tessie API:** 10 requests/min per vehicle
- **Solax API:** 10 requests/min

Recommended polling interval: **60 seconds** for `/api/ai/context`

## Example: Python Client

```python
import requests
from typing import Dict, Any

class AlwaysSunnyClient:
    def __init__(self, api_key: str, base_url: str = "http://76.13.191.149"):
        self.api_key = api_key
        self.base_url = base_url
        self.headers = {"Authorization": f"Bearer {api_key}"}
    
    def get_context(self) -> Dict[str, Any]:
        """Get full system context."""
        response = requests.get(
            f"{self.base_url}/api/ai/context",
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()
    
    def set_charging_amps(self, amps: int) -> Dict[str, Any]:
        """Set charging amps (0-32)."""
        response = requests.post(
            f"{self.base_url}/api/ai/command",
            headers=self.headers,
            json={
                "action": "set_charging_amps",
                "params": {"amps": amps}
            }
        )
        response.raise_for_status()
        return response.json()
    
    def start_charging(self) -> Dict[str, Any]:
        """Start charging."""
        response = requests.post(
            f"{self.base_url}/api/ai/command",
            headers=self.headers,
            json={"action": "start_charging", "params": {}}
        )
        response.raise_for_status()
        return response.json()
    
    def stop_charging(self) -> Dict[str, Any]:
        """Stop charging."""
        response = requests.post(
            f"{self.base_url}/api/ai/command",
            headers=self.headers,
            json={"action": "stop_charging", "params": {}}
        )
        response.raise_for_status()
        return response.json()
    
    def submit_recommendation(
        self, 
        amps: int, 
        reasoning: str, 
        confidence: str = "medium"
    ) -> Dict[str, Any]:
        """Submit AI recommendation."""
        response = requests.post(
            f"{self.base_url}/api/ai/recommendation",
            headers=self.headers,
            json={
                "recommended_amps": amps,
                "reasoning": reasoning,
                "confidence": confidence,
                "trigger_reason": "ai_decision"
            }
        )
        response.raise_for_status()
        return response.json()
    
    def get_sessions(
        self, 
        limit: int = 10, 
        min_solar_pct: float = None
    ) -> Dict[str, Any]:
        """Get session history with optional filters."""
        params = {"limit": limit}
        if min_solar_pct is not None:
            params["min_solar_pct"] = min_solar_pct
        
        response = requests.get(
            f"{self.base_url}/api/ai/sessions",
            headers=self.headers,
            params=params
        )
        response.raise_for_status()
        return response.json()

# Usage Example
client = AlwaysSunnyClient("as_your_api_key_here")

# Get current state
context = client.get_context()
solar_w = context["status"]["solar_w"]
tesla_soc = context["status"]["tesla_soc"]
charging = context["status"]["charging_state"] == "Charging"

# Make decision
if solar_w > 3000 and tesla_soc < 80 and charging:
    # Calculate optimal amps (240V L2 charging)
    amps = min(32, int(solar_w / 240))
    
    # Set charging rate
    client.set_charging_amps(amps)
    
    # Submit recommendation
    client.submit_recommendation(
        amps=amps,
        reasoning=f"High solar surplus ({solar_w}W), charging at {amps}A to maximize solar utilization",
        confidence="high"
    )
    
    print(f"✓ Set charging to {amps}A based on {solar_w}W solar")
```

## Key Data Points for AI Decision Making

From `/api/ai/context`, the most important fields for charging decisions:

**Solar & Energy:**
- `status.solar_w` - Current solar production (Watts)
- `status.household_demand_w` - Total home consumption (Watts)
- `status.grid_import_w` - Grid import/export (positive = importing)
- `status.battery_soc` - Home battery state of charge (%)
- `status.battery_w` - Battery charge/discharge rate (Watts)

**Tesla:**
- `status.tesla_soc` - Tesla battery level (%)
- `status.tesla_charging_amps` - Current charging rate (Amps)
- `status.tesla_charging_kw` - Current charging power (kW)
- `status.charge_port_connected` - Is car plugged in?
- `status.charging_state` - "Charging" | "Stopped" | "Complete" | "Disconnected"
- `status.target_soc` - Target charge level (%)

**Settings:**
- `settings.charging_strategy` - "solar" | "departure" | "immediate"
- `settings.ai_enabled` - Is AI control enabled?
- `settings.default_charging_amps` - Fallback charging rate

**Session:**
- `active_session.kwh_added` - Energy added this session (kWh)
- `active_session.solar_kwh` - Solar energy used this session (kWh)
- `active_session.solar_pct` - Percentage from solar (%)

## Decision Logic Example

```python
def calculate_optimal_amps(context: dict) -> int:
    """Calculate optimal charging amps based on solar surplus."""
    status = context["status"]
    
    # Extract key values
    solar_w = status["solar_w"]
    household_w = status["household_demand_w"]
    tesla_w = status["tesla_charging_kw"] * 1000
    battery_soc = status["battery_soc"]
    tesla_soc = status["tesla_soc"]
    target_soc = status["target_soc"]
    
    # Calculate home demand (excluding Tesla)
    home_demand_w = household_w - tesla_w
    
    # Calculate available solar surplus
    solar_surplus_w = solar_w - home_demand_w
    
    # Don't charge if battery is low (prioritize home battery)
    if battery_soc < 20:
        return 0
    
    # Don't charge if already at target
    if tesla_soc >= target_soc:
        return 0
    
    # Calculate amps from surplus (240V L2 charging)
    amps = int(solar_surplus_w / 240)
    
    # Clamp to valid range (5-32A, or 0 to stop)
    if amps < 5:
        return 0  # Not enough surplus
    
    return min(32, amps)
```

## Support

- **API Docs:** http://76.13.191.149/docs (interactive Swagger UI)
- **GitHub:** https://github.com/mikevillargr/AlwaysSunny
- **Full Documentation:** See `AI_HARNESS_API.md` in the repository
