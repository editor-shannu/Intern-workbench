"""
Thin streaming client for OpenRouter's OpenAI-compatible /chat/completions
endpoint. Each call uses the requesting intern's own (decrypted in-memory
only) API key, so usage is billed to their own OpenRouter account.
"""
import json
from typing import AsyncIterator

import httpx

from .config import settings


async def stream_chat(api_key: str, model: str, messages: list[dict]) -> AsyncIterator[str]:
    url = f"{settings.OPENROUTER_BASE_URL.rstrip('/')}/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {"model": model, "messages": messages, "stream": True}

    async with httpx.AsyncClient(timeout=180) as client:
        async with client.stream("POST", url, headers=headers, json=payload) as resp:
            if resp.status_code != 200:
                body = await resp.aread()
                raise RuntimeError(
                    f"OpenRouter returned HTTP {resp.status_code}: {body.decode(errors='ignore')[:500]}"
                )
            async for line in resp.aiter_lines():
                if not line or not line.startswith("data: "):
                    continue
                data = line[len("data: "):].strip()
                if data == "[DONE]":
                    break
                yield data


def extract_delta(raw_json_line: str) -> str:
    try:
        obj = json.loads(raw_json_line)
        return obj["choices"][0]["delta"].get("content") or ""
    except Exception:
        return ""


async def verify_key(api_key: str) -> bool:
    url = f"{settings.OPENROUTER_BASE_URL.rstrip('/')}/auth/key"
    headers = {"Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(url, headers=headers)
            return resp.status_code == 200
        except httpx.RequestError:
            return False


import time

_MODELS_CACHE = {}
_MODELS_CACHE_TIME = {}

async def get_models(api_key: str) -> list[dict]:
    now = time.time()
    if api_key in _MODELS_CACHE and now - _MODELS_CACHE_TIME.get(api_key, 0) < 600:
        return _MODELS_CACHE[api_key]

    url = f"{settings.OPENROUTER_BASE_URL.rstrip('/')}/models"
    headers = {"Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, headers=headers)
        if resp.status_code != 200:
            raise RuntimeError(f"OpenRouter models fetch failed: {resp.status_code}")
        data = resp.json()
        models_list = data.get("data", [])
        
        _MODELS_CACHE[api_key] = models_list
        _MODELS_CACHE_TIME[api_key] = now
        return models_list
