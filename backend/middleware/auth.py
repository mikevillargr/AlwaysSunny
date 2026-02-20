"""Supabase JWT authentication middleware for FastAPI."""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from services.supabase_client import get_supabase_admin

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Verify Supabase JWT and return the authenticated user.

    Returns a dict with at minimum: {"id": "<user_uuid>", "email": "..."}
    Raises 401 if token is invalid or expired.
    """
    token = credentials.credentials
    try:
        sb = get_supabase_admin()
        user_response = sb.auth.get_user(token)
        if not user_response or not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            )
        user = user_response.user
        return {
            "id": str(user.id),
            "email": user.email or "",
            "created_at": str(user.created_at) if user.created_at else "",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}",
        )
