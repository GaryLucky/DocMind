from __future__ import annotations
from dataclasses import dataclass

import json
import httpx
from typing import AsyncIterator


@dataclass(frozen=True)
class LLMConfig:
    api_key: str
    base_url: str
    model: str
    timeout_s: int = 60


class OpenAICompatibleLLM:
    def __init__(self, config: LLMConfig) -> None:
        self._config = config
        self._client = httpx.AsyncClient(timeout=config.timeout_s, base_url=config.base_url)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def chat(self, *, system: str | None, user: str) -> str:
        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": user})
        return await self.chat_messages(messages=messages)

    # TODO 改造成langchain格式
    async def chat_messages(self, *, messages: list[dict[str, str]]) -> str:
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self._config.api_key:
            headers["Authorization"] = f"Bearer {self._config.api_key}"

        resp = await self._client.post(
            "/chat/completions",
            headers=headers,
            json={"model": self._config.model, "messages": messages, "temperature": 0},
        )
        resp.raise_for_status()
        data = resp.json()
        choices = data.get("choices") or []
        if not choices:
            return ""
        msg = (choices[0].get("message") or {}).get("content")
        return msg or ""

    async def chat_messages_stream(self, *, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self._config.api_key:
            headers["Authorization"] = f"Bearer {self._config.api_key}"

        payload = {"model": self._config.model, "messages": messages, "temperature": 0, "stream": True}
        async with self._client.stream(
            "POST",
            "/chat/completions",
            headers=headers,
            json=payload,
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line:
                    continue
                if line.startswith(":"):
                    continue
                if not line.startswith("data:"):
                    continue
                raw = line[len("data:") :].strip()
                if raw == "[DONE]":
                    break
                try:
                    data = json.loads(raw)
                except Exception:
                    continue
                choices = data.get("choices") or []
                if not choices:
                    continue
                delta = (choices[0].get("delta") or {}) if isinstance(choices[0], dict) else {}
                content = delta.get("content")
                if content:
                    yield content

    async def chat_stream(self, *, system: str | None, user: str) -> AsyncIterator[str]:
        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": user})
        async for t in self.chat_messages_stream(messages=messages):
            yield t
