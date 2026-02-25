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
    messages = [{"role": "user", "content": prompt}]
    if format_json:
        messages.insert(0, {"role": "system", "content": "Respond only in valid JSON."})
    payload: dict = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_completion_tokens": max_tokens,
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


def _get_api_key(provider: str, user_settings: dict) -> str:
    """Get the API key for a cloud provider from user settings."""
    if provider == "openai":
        return user_settings.get("openai_api_key", "")
    elif provider == "anthropic":
        return user_settings.get("anthropic_api_key", "")
    return ""


def resolve_provider_config(user_settings: dict) -> dict:
    """Extract per-slot AI provider config from user settings dict.

    Returns dict with keys: primary_provider, primary_model, primary_api_key,
    fallback_provider, fallback_model, fallback_api_key.
    Each slot independently resolves its own provider, model, and API key.
    """
    s = user_settings or {}

    pri_prov = s.get("ai_primary_provider", "ollama")
    if pri_prov not in ("ollama", "openai", "anthropic"):
        pri_prov = "ollama"
    pri_model = s.get("ai_primary_model", "") or DEFAULT_MODELS.get(pri_prov, "")
    pri_key = _get_api_key(pri_prov, s)

    fb_prov = s.get("ai_fallback_provider", "ollama")
    if fb_prov not in ("ollama", "openai", "anthropic"):
        fb_prov = "ollama"
    fb_model = s.get("ai_fallback_model", "") or DEFAULT_FALLBACK_MODELS.get(fb_prov, "")
    fb_key = _get_api_key(fb_prov, s)

    return {
        "primary_provider": pri_prov,
        "primary_model": pri_model,
        "primary_api_key": pri_key,
        "fallback_provider": fb_prov,
        "fallback_model": fb_model,
        "fallback_api_key": fb_key,
    }


async def verify_api_key(provider: str, api_key: str) -> tuple[bool, str]:
    """Verify an API key by making a lightweight API call.

    Returns (valid, detail_message).
    """
    if provider == "openai":
        try:
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            timeout = httpx.Timeout(10, connect=5)
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.get(
                    "https://api.openai.com/v1/models",
                    headers=headers,
                )
                if resp.status_code == 200:
                    return True, "Valid — connected to OpenAI"
                elif resp.status_code == 401:
                    return False, "Invalid API key"
                else:
                    return False, f"HTTP {resp.status_code}"
        except Exception as e:
            return False, f"Connection error: {e}"

    elif provider == "anthropic":
        try:
            headers = {
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            }
            timeout = httpx.Timeout(10, connect=5)
            async with httpx.AsyncClient(timeout=timeout) as client:
                # Send a minimal request — Anthropic doesn't have a /models list endpoint,
                # so we send a tiny message and check for auth errors
                resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers=headers,
                    json={"model": "claude-3-haiku-20240307", "max_tokens": 1,
                          "messages": [{"role": "user", "content": "hi"}]},
                )
                if resp.status_code == 200:
                    return True, "Valid — connected to Anthropic"
                elif resp.status_code in (401, 403):
                    return False, "Invalid API key"
                else:
                    return False, f"HTTP {resp.status_code}"
        except Exception as e:
            return False, f"Connection error: {e}"

    return False, f"Unknown provider: {provider}"


async def generate_with_fallback(
    prompt: str,
    *,
    user_settings: dict | None = None,
    format_json: bool = False,
    temperature: float = 0.1,
    max_tokens: int = 150,
    max_retries: int = 3,
    model_override: str | None = None,
) -> tuple[str, str]:
    """Generate with automatic retry and fallback model.

    Primary and fallback can use different providers.
    Returns (response_text, "provider/model_used").
    """
    import asyncio

    config = resolve_provider_config(user_settings or {})
    pri_prov = config["primary_provider"]
    pri_model = model_override or config["primary_model"]
    pri_key = config["primary_api_key"]
    fb_prov = config["fallback_provider"]
    fb_model = config["fallback_model"]
    fb_key = config["fallback_api_key"]

    # --- Try primary model ---
    last_error: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            text = await generate(
                prompt, provider=pri_prov, model=pri_model, api_key=pri_key,
                format_json=format_json, temperature=temperature,
                max_tokens=max_tokens,
            )
            if attempt > 1:
                logger.info(f"AI [{pri_prov}/{pri_model}] succeeded on attempt {attempt}")
            return text, f"{pri_prov}/{pri_model}"
        except (httpx.ReadTimeout, httpx.ConnectTimeout, httpx.ConnectError,
                httpx.PoolTimeout) as e:
            last_error = e
            if attempt < max_retries:
                wait = 5 * (2 ** (attempt - 1))
                logger.warning(
                    f"AI [{pri_prov}/{pri_model}] attempt {attempt}/{max_retries} failed "
                    f"({type(e).__name__}), retrying in {wait}s..."
                )
                await asyncio.sleep(wait)
            else:
                logger.error(f"AI [{pri_prov}/{pri_model}] failed after {max_retries} attempts")
        except httpx.HTTPStatusError as e:
            if e.response.status_code >= 500 and attempt < max_retries:
                wait = 5 * (2 ** (attempt - 1))
                logger.warning(f"AI [{pri_prov}/{pri_model}] got {e.response.status_code}, retrying...")
                await asyncio.sleep(wait)
                last_error = e
            else:
                raise

    # --- Try fallback model (may be different provider) ---
    fb_id = f"{fb_prov}/{fb_model}"
    pri_id = f"{pri_prov}/{pri_model}"
    if fb_model and fb_id != pri_id:
        logger.warning(f"Primary [{pri_id}] failed, trying fallback [{fb_id}]...")
        try:
            text = await generate(
                prompt, provider=fb_prov, model=fb_model, api_key=fb_key,
                format_json=format_json, temperature=temperature,
                max_tokens=max_tokens,
            )
            return text, fb_id
        except Exception as fallback_err:
            logger.error(f"Fallback [{fb_id}] also failed: {fallback_err}")
            raise last_error or fallback_err from fallback_err

    raise last_error or Exception(f"AI [{pri_id}] failed after all retries")
