"""API key authentication middleware for FastAPI."""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from services.api_key_manager import validate_api_key
from middleware.auth import get_current_user

security = HTTPBearer()


async def get_current_user_flexible(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Verify either Supabase JWT OR API key and return the authenticated user.
    
    Checks the Authorization header for:
    1. API key (starts with 'as_')
    2. JWT token (fallback to existing auth)
    
    Returns a dict with at minimum: {"id": "<user_uuid>", "email": "...", "auth_method": "jwt|api_key"}
    Raises 401 if neither authentication method succeeds.
    """
    token = credentials.credentials
    
    # Check if it's an API key (starts with 'as_')
    if token.startswith("as_"):
        user = validate_api_key(token)
        if user:
            return user
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired API key",
        )
    
    # Otherwise, try JWT authentication
    try:
        user = await get_current_user(credentials)
        user["auth_method"] = "jwt"
        return user
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}",
        )
