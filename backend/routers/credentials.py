"""User API credentials endpoints — save/load Solax, Tessie, Telegram keys."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from middleware.auth import get_current_user
from models.database import CredentialsUpdate
from services.supabase_client import get_user_credentials, upsert_user_credentials

router = APIRouter()


@router.get("/credentials")
async def get_credentials(user: dict = Depends(get_current_user)):
    """Get stored API credentials for the authenticated user.

    Returns masked values (only last 4 chars visible) for security.
    """
    creds = get_user_credentials(user["id"])
    if not creds:
        return {
            "solax_token_id": "",
            "solax_dongle_sn": "",
            "tessie_api_key": "",
            "tessie_vin": "",
            "telegram_bot_token": "",
            "telegram_chat_id": "",
        }

    def mask(val: str) -> str:
        if not val or len(val) < 5:
            return val
        return "•" * (len(val) - 4) + val[-4:]

    return {
        "solax_token_id": creds.get("solax_token_id", ""),
        "solax_dongle_sn": creds.get("solax_dongle_sn", ""),
        "tessie_api_key": mask(creds.get("tessie_api_key", "")),
        "tessie_vin": creds.get("tessie_vin", ""),
        "telegram_bot_token": mask(creds.get("telegram_bot_token", "")),
        "telegram_chat_id": creds.get("telegram_chat_id", ""),
    }


@router.post("/credentials")
async def save_credentials(
    body: CredentialsUpdate,
    user: dict = Depends(get_current_user),
):
    """Save API credentials for the authenticated user.

    Only updates fields that are explicitly provided (non-None).
    """
    user_id = user["id"]

    # Get existing credentials to merge
    existing = get_user_credentials(user_id) or {}

    # Build update dict — only include fields that were provided
    updates = {}
    for field, value in body.model_dump(exclude_none=True).items():
        if value is not None and value != "":
            updates[field] = value

    if updates:
        merged = {**existing, **updates}
        # Remove non-credential fields
        merged.pop("user_id", None)
        merged.pop("updated_at", None)
        upsert_user_credentials(user_id, merged)

    return {"status": "saved", "fields_updated": list(updates.keys())}


@router.post("/credentials/test")
async def test_credentials(user: dict = Depends(get_current_user)):
    """Test all configured API connections and return status for each service."""
    from services.solax import test_solax_connection
    from services.tessie import test_tessie_connection
    from services.ollama import test_ollama_connection

    creds = get_user_credentials(user["id"]) or {}
    results = {}

    # Solax
    if creds.get("solax_token_id") and creds.get("solax_dongle_sn"):
        ok, detail = await test_solax_connection(creds["solax_token_id"], creds["solax_dongle_sn"])
        results["solax"] = {"ok": ok, "detail": detail}
    else:
        results["solax"] = {"ok": False, "detail": "Not configured"}

    # Tessie
    if creds.get("tessie_api_key") and creds.get("tessie_vin"):
        ok, detail = await test_tessie_connection(creds["tessie_api_key"], creds["tessie_vin"])
        results["tessie"] = {"ok": ok, "detail": detail}
    else:
        results["tessie"] = {"ok": False, "detail": "Not configured"}

    # Telegram — just check if credentials are present (no live test endpoint)
    if creds.get("telegram_bot_token") and creds.get("telegram_chat_id"):
        import httpx
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"https://api.telegram.org/bot{creds['telegram_bot_token']}/getMe"
                )
                if resp.status_code == 200:
                    bot_name = resp.json().get("result", {}).get("first_name", "Bot")
                    results["telegram"] = {"ok": True, "detail": f"Connected — {bot_name}"}
                else:
                    results["telegram"] = {"ok": False, "detail": f"Invalid token (HTTP {resp.status_code})"}
        except Exception as e:
            results["telegram"] = {"ok": False, "detail": str(e)}
    else:
        results["telegram"] = {"ok": False, "detail": "Not configured"}

    return results
