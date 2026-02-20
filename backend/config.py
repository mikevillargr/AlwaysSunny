"""Application configuration loaded from environment variables."""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """All configuration for the AlwaysSunny backend."""

    # Supabase
    supabase_url: str
    supabase_anon_key: str
    supabase_service_key: str

    # Encryption key for user API credentials stored in DB
    credentials_encryption_key: str = ""

    # External APIs (dev/testing fallback — production uses per-user DB storage)
    solax_token_id: str = ""
    solax_dongle_sn: str = ""
    tessie_api_key: str = ""
    tessie_vin: str = ""

    # Ollama
    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:7b"

    # Telegram
    telegram_bot_token: str = ""

    # App
    circuit_voltage: int = 240
    poll_interval_seconds: int = 60
    ai_interval_seconds: int = 300

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """Cached settings instance."""
    return Settings()
