"""Multi-provider AI abstraction — routes to Ollama, OpenAI, or Anthropic.

Provides a unified generate() interface that the rest of the app can call
without caring which backend is in use.  Provider / model / API-key are
resolved per-user from the `settings` table (keys: ai_provider,
ai_primary_model, ai_fallback_model, openai_api_key, anthropic_api_key).
"""

from __future__ import annotations

import json
import logging
import time
from typing import Literal

import httpx

from config import get_settings

logger = logging.getLogger(__name__)

Provider = Literal["ollama", "openai", "anthropic"]

# Timeouts
_OLLAMA_READ_TIMEOUT = 180
_CLOUD_READ_TIMEOUT = 120
_CONNECT_TIMEOUT = 15

# Default models per provider
DEFAULT_MODELS: dict[str, str] = {
    "ollama": "qwen2.5:7b",
    "openai": "gpt-4o-mini",
    "anthropic": "claude-3-5-haiku-20241022",
}

DEFAULT_FALLBACK_MODELS: dict[str, str] = {
    "ollama": "qwen2.5:1.5b",
    "openai": "gpt-4o-mini",
    "anthropic": "claude-3-5-haiku-20241022",
}


# ---------------------------------------------------------------------------
# Provider-specific generate functions
# ---------------------------------------------------------------------------

async def _generate_ollama(
    host: str,
    model: str,
    prompt: str,
    *,
    format_json: bool = False,
    temperature: float = 0.1,
    max_tokens: int = 150,
) -> str:
    """Call Ollama /api/generate and return the response text."""
    payload: dict = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": temperature,
            "num_predict": max_tokens,
        },
    }
    if format_json:
        payload["format"] = "json"

    timeout = httpx.Timeout(_OLLAMA_READ_TIMEOUT, connect=_CONNECT_TIMEOUT)
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(f"{host}/api/generate", json=payload)
        resp.raise_for_status()
        return resp.json().get("response", "")


async def _generate_openai(
    api_key: str,
    model: str,
    prompt: str,
    *,
    format_json: bool = False,
    temperature: float = 0.1,
    max_tokens: int = 150,
) -> str:
    """Call OpenAI Chat Completions API and return the response text."""
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload: dict = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if format_json:
        payload["response_format"] = {"type": "json_object"}

    timeout = httpx.Timeout(_CLOUD_READ_TIMEOUT, connect=_CONNECT_TIMEOUT)
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


async def _generate_anthropic(
    api_key: str,
    model: str,
    prompt: str,
    *,
    format_json: bool = False,
    temperature: float = 0.1,
    max_tokens: int = 150,
) -> str:
    """Call Anthropic Messages API and return the response text."""
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    # For JSON mode, prepend instruction to respond in JSON
    effective_prompt = prompt
    if format_json and "JSON" not in prompt[-200:]:
        effective_prompt = prompt + "\n\nRespond ONLY in valid JSON."

    payload: dict = {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": [{"role": "user", "content": effective_prompt}],
    }

    timeout = httpx.Timeout(_CLOUD_READ_TIMEOUT, connect=_CONNECT_TIMEOUT)
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers=headers,
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        # Anthropic returns content as a list of blocks
        blocks = data.get("content", [])
        return blocks[0]["text"] if blocks else ""


# ---------------------------------------------------------------------------
# Unified generate interface
# ---------------------------------------------------------------------------

async def generate(
    prompt: str,
    *,
    provider: Provider = "ollama",
    model: str = "",
    api_key: str = "",
    format_json: bool = False,
    temperature: float = 0.1,
    max_tokens: int = 150,
) -> str:
    """Route a generation request to the appropriate provider.

    Returns raw response text.  Raises on failure.
    """
    if provider == "ollama":
        settings = get_settings()
        host = settings.ollama_host
        return await _generate_ollama(
            host, model or settings.ollama_model, prompt,
            format_json=format_json, temperature=temperature,
            max_tokens=max_tokens,
        )
    elif provider == "openai":
        if not api_key:
            raise ValueError("OpenAI API key required")
        return await _generate_openai(
            api_key, model or DEFAULT_MODELS["openai"], prompt,
            format_json=format_json, temperature=temperature,
            max_tokens=max_tokens,
        )
    elif provider == "anthropic":
        if not api_key:
            raise ValueError("Anthropic API key required")
        return await _generate_anthropic(
            api_key, model or DEFAULT_MODELS["anthropic"], prompt,
            format_json=format_json, temperature=temperature,
            max_tokens=max_tokens,
        )
    else:
        raise ValueError(f"Unknown AI provider: {provider}")


def resolve_provider_config(user_settings: dict) -> dict:
    """Extract AI provider config from user settings dict.

    Returns dict with keys: provider, primary_model, fallback_model, api_key.
    Falls back to Ollama defaults if nothing is configured.
    """
    provider = user_settings.get("ai_provider", "ollama")
    if provider not in ("ollama", "openai", "anthropic"):
        provider = "ollama"

    primary = user_settings.get("ai_primary_model", "") or DEFAULT_MODELS.get(provider, "")
    fallback = user_settings.get("ai_fallback_model", "") or DEFAULT_FALLBACK_MODELS.get(provider, "")
    api_key = ""

    if provider == "openai":
        api_key = user_settings.get("openai_api_key", "")
    elif provider == "anthropic":
        api_key = user_settings.get("anthropic_api_key", "")

    return {
        "provider": provider,
        "primary_model": primary,
        "fallback_model": fallback,
        "api_key": api_key,
    }


async def generate_with_fallback(
    prompt: str,
    *,
    user_settings: dict | None = None,
    format_json: bool = False,
    temperature: float = 0.1,
    max_tokens: int = 150,
    max_retries: int = 3,
    provider_override: str | None = None,
    model_override: str | None = None,
    api_key_override: str | None = None,
) -> tuple[str, str]:
    """Generate with automatic retry and fallback model.

    Returns (response_text, model_used).
    """
    import asyncio

    config = resolve_provider_config(user_settings or {})
    provider = provider_override or config["provider"]
    primary = model_override or config["primary_model"]
    fallback = config["fallback_model"]
    api_key = api_key_override or config["api_key"]

    # --- Try primary model ---
    last_error: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            text = await generate(
                prompt, provider=provider, model=primary, api_key=api_key,
                format_json=format_json, temperature=temperature,
                max_tokens=max_tokens,
            )
            if attempt > 1:
                logger.info(f"AI [{provider}/{primary}] succeeded on attempt {attempt}")
            return text, primary
        except (httpx.ReadTimeout, httpx.ConnectTimeout, httpx.ConnectError,
                httpx.PoolTimeout) as e:
            last_error = e
            if attempt < max_retries:
                wait = 5 * (2 ** (attempt - 1))
                logger.warning(
                    f"AI [{provider}/{primary}] attempt {attempt}/{max_retries} failed "
                    f"({type(e).__name__}), retrying in {wait}s..."
                )
                await asyncio.sleep(wait)
            else:
                logger.error(f"AI [{provider}/{primary}] failed after {max_retries} attempts")
        except httpx.HTTPStatusError as e:
            if e.response.status_code >= 500 and attempt < max_retries:
                wait = 5 * (2 ** (attempt - 1))
                logger.warning(f"AI [{provider}/{primary}] got {e.response.status_code}, retrying...")
                await asyncio.sleep(wait)
                last_error = e
            else:
                raise

    # --- Try fallback model ---
    if fallback and fallback != primary:
        logger.warning(f"Primary [{provider}/{primary}] failed, trying fallback [{fallback}]...")
        try:
            text = await generate(
                prompt, provider=provider, model=fallback, api_key=api_key,
                format_json=format_json, temperature=temperature,
                max_tokens=max_tokens,
            )
            return text, fallback
        except Exception as fallback_err:
            logger.error(f"Fallback [{provider}/{fallback}] also failed: {fallback_err}")
            raise last_error or fallback_err from fallback_err

    raise last_error or Exception(f"AI [{provider}/{primary}] failed after all retries")
