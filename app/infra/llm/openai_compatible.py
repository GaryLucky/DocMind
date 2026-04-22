from __future__ import annotations
from dataclasses import dataclass

import inspect
from typing import Any, AsyncIterator, Iterable, Sequence

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI


@dataclass(frozen=True)
class LLMConfig:
    api_key: str
    base_url: str
    model: str
    timeout_s: int = 60


class OpenAICompatibleLLM:
    def __init__(self, config: LLMConfig, *, llm: BaseChatModel | None = None) -> None:
        self._config = config
        self._llm: BaseChatModel = llm or self._build_langchain_llm(config)

    async def aclose(self) -> None:
        close = getattr(self._llm, "aclose", None)
        if callable(close):
            await close()

    async def chat(self, *, system: str | None, user: str) -> str:
        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": user})
        return await self.chat_messages(messages=messages)

    async def chat_messages(self, *, messages: list[dict[str, str]]) -> str:
        lc_messages = self._to_langchain_messages(messages)
        resp = await self._llm.ainvoke(lc_messages)
        content = getattr(resp, "content", None)
        return content if isinstance(content, str) else (str(content) if content is not None else "")

    async def chat_messages_stream(self, *, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        lc_messages = self._to_langchain_messages(messages)
        async for chunk in self._llm.astream(lc_messages):
            text = self._chunk_to_text(chunk)
            if text:
                yield text

    async def chat_stream(self, *, system: str | None, user: str) -> AsyncIterator[str]:
        messages: list[dict[str, str]] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": user})
        async for t in self.chat_messages_stream(messages=messages):
            yield t

    @staticmethod
    def _build_langchain_llm(config: LLMConfig) -> BaseChatModel:
        api_key = config.api_key.strip()
        if not api_key:
            api_key = "noop"
        kwargs: dict[str, Any] = {
            "model": config.model,
            "api_key": api_key,
            "base_url": config.base_url,
            "timeout": config.timeout_s,
            "temperature": 0,
            "streaming": True,
        }
        sig = inspect.signature(ChatOpenAI)
        filtered = {k: v for k, v in kwargs.items() if k in sig.parameters and v is not None}
        return ChatOpenAI(**filtered)

    @staticmethod
    def _to_langchain_messages(messages: Sequence[dict[str, Any]]) -> list[BaseMessage]:
        out: list[BaseMessage] = []
        for m in messages:
            role = str(m.get("role") or "").strip().lower()
            content = m.get("content")
            text = content if isinstance(content, str) else (str(content) if content is not None else "")
            if role == "system":
                out.append(SystemMessage(content=text))
            elif role == "assistant":
                out.append(AIMessage(content=text))
            else:
                out.append(HumanMessage(content=text))
        return out

    @staticmethod
    def _chunk_to_text(chunk: Any) -> str:
        content = getattr(chunk, "content", None)
        if content is None:
            return ""
        if isinstance(content, str):
            return content
        if isinstance(content, Iterable) and not isinstance(content, (bytes, bytearray, str)):
            parts: list[str] = []
            for p in content:
                if isinstance(p, str):
                    parts.append(p)
                elif isinstance(p, dict):
                    t = p.get("text")
                    if isinstance(t, str) and t:
                        parts.append(t)
            return "".join(parts)
        return str(content)
