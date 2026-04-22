from __future__ import annotations

import asyncio
from dataclasses import dataclass
import inspect
from typing import Any

from langchain_core.embeddings import Embeddings
from langchain_openai import OpenAIEmbeddings


@dataclass(frozen=True)
class OpenAICompatibleEmbeddingsConfig:
    base_url: str
    api_key: str = ""
    model: str = ""
    timeout_s: int = 60


class OpenAICompatibleEmbeddings(Embeddings):
    def __init__(self, config: OpenAICompatibleEmbeddingsConfig, *, embeddings: Embeddings | None = None) -> None:
        self._config = config
        self._embeddings: Embeddings = embeddings or self._build_langchain_embeddings(config)

    async def aclose(self):
        close = getattr(self._embeddings, "aclose", None)
        if callable(close):
            await close()

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            pass
        else:
            raise RuntimeError("embed_documents() called inside running event loop; use await aembed_documents()")
        return asyncio.run(self.aembed_documents(texts))

    def embed_query(self, text: str) -> list[float]:
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            pass
        else:
            raise RuntimeError("embed_query() called inside running event loop; use await aembed_query()")
        return asyncio.run(self.aembed_query(text))

    async def aembed_documents(self, texts: list[str]) -> list[list[float]]:
        return await self._embeddings.aembed_documents(texts)

    async def aembed_query(self, text: str) -> list[float]:
        return await self._embeddings.aembed_query(text)

    @staticmethod
    def _build_langchain_embeddings(config: OpenAICompatibleEmbeddingsConfig) -> Embeddings:
        base_url = config.base_url.rstrip("/")
        if base_url.endswith("/embeddings"):
            base_url = base_url[: -len("/embeddings")]

        api_key = config.api_key.strip()
        if not api_key:
            api_key = "noop"

        kwargs: dict[str, Any] = {
            "model": config.model or None,
            "api_key": api_key,
            "base_url": base_url,
            "timeout": config.timeout_s,
        }
        sig = inspect.signature(OpenAIEmbeddings)
        filtered = {k: v for k, v in kwargs.items() if k in sig.parameters and v is not None}
        return OpenAIEmbeddings(**filtered)
