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
