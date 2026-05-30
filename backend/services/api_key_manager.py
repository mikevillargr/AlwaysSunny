"""API key generation, hashing, and validation service."""

import secrets
import bcrypt
from datetime import datetime, timezone
from typing import Optional

from services.supabase_client import get_supabase_admin


def generate_api_key() -> str:
    """Generate a new API key with 'as_' prefix.
    
    Format: as_<32_random_hex_chars>
    Example: as_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
    """
    random_part = secrets.token_hex(16)  # 32 hex chars
    return f"as_{random_part}"


def hash_api_key(key: str) -> str:
    """Hash an API key using bcrypt.
    
    Args:
        key: The plain API key to hash
        
    Returns:
        The bcrypt hash as a string
    """
    return bcrypt.hashpw(key.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_api_key(key: str, key_hash: str) -> bool:
    """Verify an API key against its hash.
    
    Args:
        key: The plain API key to verify
        key_hash: The stored bcrypt hash
        
    Returns:
        True if the key matches the hash, False otherwise
    """
    try:
        return bcrypt.checkpw(key.encode('utf-8'), key_hash.encode('utf-8'))
    except Exception:
        return False


def create_api_key(user_id: str, name: str, expires_at: Optional[str] = None) -> dict:
    """Create a new API key for a user.
    
    Args:
        user_id: The user's UUID
        name: Human-readable name for the key
        expires_at: Optional ISO timestamp for key expiration
        
    Returns:
        Dict with 'key' (plain, show once), 'key_prefix', 'name', 'created_at'
    """
    sb = get_supabase_admin()
    
    # Generate key
    key = generate_api_key()
    key_hash = hash_api_key(key)
    key_prefix = key[:8]  # First 8 chars for identification
    
    # Store in database
    result = sb.table("api_keys").insert({
        "user_id": user_id,
        "key_hash": key_hash,
        "key_prefix": key_prefix,
        "name": name,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
    
    if not result.data:
        raise Exception("Failed to create API key")
    
    return {
        "key": key,  # Return plain key ONCE
        "key_prefix": key_prefix,
        "name": name,
        "created_at": result.data[0]["created_at"],
        "id": result.data[0]["id"],
    }


def validate_api_key(key: str) -> Optional[dict]:
    """Validate an API key and return the associated user.
    
    Args:
        key: The plain API key to validate
        
    Returns:
        Dict with user info if valid, None if invalid/expired/revoked
    """
    if not key or not key.startswith("as_"):
        return None
    
    sb = get_supabase_admin()
    
    # Get all non-revoked keys (we need to check hash for each)
    result = sb.table("api_keys").select("*").is_("revoked_at", "null").execute()
    
    if not result.data:
        return None
    
    # Check each key's hash
    for key_record in result.data:
        if verify_api_key(key, key_record["key_hash"]):
            # Check expiration
            if key_record.get("expires_at"):
                expires_at = datetime.fromisoformat(key_record["expires_at"].replace("Z", "+00:00"))
                if datetime.now(timezone.utc) > expires_at:
                    return None
            
            # Update last_used_at
            sb.table("api_keys").update({
                "last_used_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", key_record["id"]).execute()
            
            # Return user info
            return {
                "id": key_record["user_id"],
                "email": "",  # API keys don't have email
                "created_at": "",
                "auth_method": "api_key",
                "key_id": key_record["id"],
                "key_name": key_record["name"],
            }
    
    return None


def revoke_api_key(key_id: str, user_id: str) -> bool:
    """Revoke an API key (soft delete).
    
    Args:
        key_id: The API key's UUID
        user_id: The user's UUID (for authorization check)
        
    Returns:
        True if revoked successfully, False otherwise
    """
    sb = get_supabase_admin()
    
    result = sb.table("api_keys").update({
        "revoked_at": datetime.now(timezone.utc).isoformat()
    }).eq("id", key_id).eq("user_id", user_id).is_("revoked_at", "null").execute()
    
    return len(result.data or []) > 0


def list_api_keys(user_id: str) -> list[dict]:
    """List all active API keys for a user.
    
    Args:
        user_id: The user's UUID
        
    Returns:
        List of API key records (without key_hash)
    """
    sb = get_supabase_admin()
    
    result = sb.table("api_keys").select(
        "id, key_prefix, name, created_at, last_used_at, expires_at"
    ).eq("user_id", user_id).is_("revoked_at", "null").order("created_at", desc=True).execute()
    
    return result.data or []
