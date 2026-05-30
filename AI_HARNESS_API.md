# AI Harness API Documentation

This document describes how to integrate an external AI harness with AlwaysSunny using API key authentication.

## Quick Start

### 1. Generate an API Key

First, authenticate with your JWT token and create an API key:

```bash
curl -X POST http://localhost:8000/api/api-keys \
  -H "Authorization: Bearer <your_jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My AI Harness",
    "expires_at": null
  }'
```

Response:
```json
{
  "key": "as_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "key_prefix": "as_a1b2c",
  "name": "My AI Harness",
  "created_at": "2026-05-30T01:48:00Z",
  "id": "uuid-here",
  "warning": "Save this key securely - it will not be shown again"
}
```

**IMPORTANT:** Save the `key` value immediately - it will never be shown again.

### 2. Use the API Key

Include the API key in the `Authorization` header for all requests:

```bash
Authorization: Bearer as_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

## AI-Optimized Endpoints

### GET /api/ai/context

Get all system context in one call - perfect for AI decision making.

**Request:**
```bash
curl http://localhost:8000/api/ai/context \
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
    "tesla_soc": 65,
    "tesla_charging_amps": 16,
    "charging_state": "Charging",
    "charge_port_connected": true,
    "ai_enabled": true,
    "target_soc": 80,
    ...
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
    ...
  },
  "health": {
    "tessie": {"status": "connected"},
    "solax": {"status": "connected"},
    ...
  },
  "location": {
    "latitude": 14.550147,
    "longitude": 121.114333,
    "is_home": true,
    "detection_method": "geofence"
  },
  "timestamp": "2026-05-30T09:30:00Z"
}
```

### POST /api/ai/command

Execute control commands.

**Set Charging Amps:**
```bash
curl -X POST http://localhost:8000/api/ai/command \
  -H "Authorization: Bearer as_<your_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "set_charging_amps",
    "params": {"amps": 16}
  }'
```

**Start Charging:**
```bash
curl -X POST http://localhost:8000/api/ai/command \
  -H "Authorization: Bearer as_<your_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "start_charging",
    "params": {}
  }'
```

**Stop Charging:**
```bash
curl -X POST http://localhost:8000/api/ai/command \
  -H "Authorization: Bearer as_<your_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "stop_charging",
    "params": {}
  }'
```

**Update Settings:**
```bash
curl -X POST http://localhost:8000/api/ai/command \
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

### GET /api/ai/sessions

Query session history with filters.

**Request:**
```bash
curl "http://localhost:8000/api/ai/sessions?limit=20&min_solar_pct=70&min_kwh=5" \
  -H "Authorization: Bearer as_<your_key>"
```

**Query Parameters:**
- `limit` (1-100, default 10): Number of sessions to return
- `offset` (default 0): Pagination offset
- `min_solar_pct` (0-100): Filter sessions with solar % >= this value
- `min_kwh` (>= 0): Filter sessions with kWh added >= this value

**Response:**
```json
{
  "sessions": [...],
  "count": 15,
  "offset": 0,
  "limit": 20
}
```

### POST /api/ai/recommendation

Submit AI charging recommendations.

**Request:**
```bash
curl -X POST http://localhost:8000/api/ai/recommendation \
  -H "Authorization: Bearer as_<your_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "recommended_amps": 20,
    "reasoning": "High solar surplus (2500W) with battery at 85%. Maximize solar utilization.",
    "confidence": "high",
    "trigger_reason": "solar_surplus"
  }'
```

**Response:**
```json
{
  "message": "AI recommendation submitted",
  "recommended_amps": 20,
  "confidence": "high"
}
```

## Existing Endpoints (Also Support API Keys)

All existing endpoints now accept API key authentication:

- `GET /api/status` - Dashboard data
- `GET /api/sessions` - Session history
- `GET /api/settings` - User settings
- `POST /api/control/optimize/toggle` - Toggle AI optimization
- `POST /api/control/amps/override` - Manual amp override
- `GET /api/health` - System health
- `GET /api/outlook` - Solar forecast
- `GET /api/reports/*` - Analytics

## API Key Management

### List Your API Keys

```bash
curl http://localhost:8000/api/api-keys \
  -H "Authorization: Bearer <your_jwt_token>"
```

### Revoke an API Key

```bash
curl -X DELETE http://localhost:8000/api/api-keys/<key_id> \
  -H "Authorization: Bearer <your_jwt_token>"
```

## Security Best Practices

1. **Store keys securely**: Never commit API keys to version control
2. **Use environment variables**: Store keys in `.env` files or secure vaults
3. **Rotate regularly**: Create new keys and revoke old ones periodically
4. **Set expiration**: Use `expires_at` when creating keys for temporary access
5. **Monitor usage**: Check `last_used_at` to detect unauthorized access
6. **Revoke immediately**: If a key is compromised, revoke it right away

## Error Handling

### 401 Unauthorized
```json
{
  "detail": "Invalid or expired API key"
}
```

**Causes:**
- Invalid API key format
- Key has been revoked
- Key has expired

### 400 Bad Request
```json
{
  "detail": "Invalid amps value (must be 0-32)"
}
```

**Causes:**
- Invalid parameters in command
- Tessie disabled when trying to control charging

### 500 Internal Server Error
```json
{
  "detail": "Failed to set charging amps: <error details>"
}
```

**Causes:**
- Tessie API failure
- Database connection issues
- Internal server errors

## Rate Limiting

Currently, there are no rate limits on API key usage. However, be mindful of:
- Tessie API rate limits (10 requests/min per vehicle)
- Solax API rate limits (10 requests/min)
- Database connection pool limits

## Example: Python AI Harness

```python
import requests
from datetime import datetime

class AlwaysSunnyClient:
    def __init__(self, api_key: str, base_url: str = "http://localhost:8000"):
        self.api_key = api_key
        self.base_url = base_url
        self.headers = {"Authorization": f"Bearer {api_key}"}
    
    def get_context(self):
        """Get full system context."""
        response = requests.get(
            f"{self.base_url}/api/ai/context",
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()
    
    def set_charging_amps(self, amps: int):
        """Set charging amps."""
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
    
    def submit_recommendation(self, amps: int, reasoning: str, confidence: str):
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

# Usage
client = AlwaysSunnyClient("as_your_key_here")

# Get context
context = client.get_context()
solar_w = context["status"]["solar_w"]
tesla_soc = context["status"]["tesla_soc"]

# Make decision
if solar_w > 3000 and tesla_soc < 80:
    amps = min(32, int(solar_w / 240))
    client.set_charging_amps(amps)
    client.submit_recommendation(
        amps=amps,
        reasoning=f"High solar surplus ({solar_w}W), charging at {amps}A",
        confidence="high"
    )
```

## Support

For issues or questions:
- GitHub: https://github.com/mikevillargr/AlwaysSunny
- API Documentation: http://localhost:8000/docs (FastAPI Swagger UI)
