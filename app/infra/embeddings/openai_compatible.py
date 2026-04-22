from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

import httpx

from langchain_core.embeddings import Embeddings


@dataclass(frozen=True)
class OpenAICompatibleEmbeddingsConfig:
    base_url: str
    api_key: str = ""
    model: str = ""
    timeout_s: int = 60
    max_concurrency: int = 8


class OpenAICompatibleEmbeddings(Embeddings):
    def __init__(self, config: OpenAICompatibleEmbeddingsConfig) -> None:
        self._config = config
        self._client: httpx.AsyncClient | None = None

    async def aclose(self):
        if self._client is not None:
            await self._client.aclose()
            self._client = None

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
        if not texts:
            return []

        client = await self._get_client()
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self._config.api_key:
            headers["Authorization"] = f"Bearer {self._config.api_key}"

        sem = asyncio.Semaphore(max(1, int(self._config.max_concurrency)))

        async def embed_one(text: str) -> list[float]:
            async with sem:
                payload = {"input": text, "model": self._config.model}
                resp = await client.post(self._config.base_url, json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                if "embedding" in data:
                    return [float(x) for x in data["embedding"]]
                if "data" in data and data["data"]:
                    emb = data["data"][0].get("embedding")
                    if emb is not None:
                        return [float(x) for x in emb]
                raise RuntimeError(f"Unexpected response format: {list(data.keys())}")

        results = await asyncio.gather(*(embed_one(t) for t in texts))
        return list(results)

    async def aembed_query(self, text: str) -> list[float]:
        vectors = await self.aembed_documents([text])
        return vectors[0] if vectors else []

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=float(self._config.timeout_s))
        return self._client
