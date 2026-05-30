"""API key management endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from middleware.auth import get_current_user
from services.api_key_manager import create_api_key, list_api_keys, revoke_api_key

router = APIRouter()


class CreateAPIKeyRequest(BaseModel):
    name: str
    expires_at: Optional[str] = None


class CreateAPIKeyResponse(BaseModel):
    key: str
    key_prefix: str
    name: str
    created_at: str
    id: str
    warning: str = "Save this key securely - it will not be shown again"


class APIKeyInfo(BaseModel):
    id: str
    key_prefix: str
    name: str
    created_at: str
    last_used_at: Optional[str]
    expires_at: Optional[str]


@router.post("/api-keys", response_model=CreateAPIKeyResponse)
async def create_key(
    body: CreateAPIKeyRequest,
    user: dict = Depends(get_current_user),
):
    """Create a new API key for the authenticated user.
    
    The key is returned ONCE in the response. Store it securely.
    """
    user_id = user["id"]
    
    try:
        result = create_api_key(user_id, body.name, body.expires_at)
        return CreateAPIKeyResponse(
            key=result["key"],
            key_prefix=result["key_prefix"],
            name=result["name"],
            created_at=result["created_at"],
            id=result["id"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create API key: {str(e)}")


@router.get("/api-keys", response_model=list[APIKeyInfo])
async def list_keys(
    user: dict = Depends(get_current_user),
):
    """List all active API keys for the authenticated user."""
    user_id = user["id"]
    
    try:
        keys = list_api_keys(user_id)
        return keys
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list API keys: {str(e)}")


@router.delete("/api-keys/{key_id}")
async def revoke_key(
    key_id: str,
    user: dict = Depends(get_current_user),
):
    """Revoke an API key (soft delete)."""
    user_id = user["id"]
    
    try:
        success = revoke_api_key(key_id, user_id)
        if not success:
            raise HTTPException(status_code=404, detail="API key not found or already revoked")
        return {"message": "API key revoked successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to revoke API key: {str(e)}")
