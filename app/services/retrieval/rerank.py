from __future__ import annotations

import asyncio
from dataclasses import dataclass

import httpx

from app.services.retrieval.types import SearchHit


@dataclass(frozen=True)
class RerankConfig:
    enabled: bool
    model: str
    top_n: int
    url: str
    api_key: str
    timeout_s: float


class CrossEncoderReranker:
    def __init__(self, *, model_name: str) -> None:
        self._model_name = model_name
        self._model = None

    def _get_model(self):
        if self._model is not None:
            return self._model
        try:
            from sentence_transformers import CrossEncoder  # type: ignore[import-not-found]
        except Exception as e:
            raise RuntimeError("missing_dependency:sentence-transformers") from e
        self._model = CrossEncoder(self._model_name)
        return self._model

    def _predict(self, pairs: list[tuple[str, str]]) -> list[float]:
        model = self._get_model()
        scores = model.predict(pairs)
        return [float(x) for x in scores]

    async def rerank(self, *, query: str, hits: list[SearchHit], top_n: int) -> list[SearchHit]:
        if not hits:
            return []
        n = max(1, min(int(top_n), len(hits)))
        candidates = hits[:n]
        pairs = [(query, h.content) for h in candidates]
        scores = await asyncio.to_thread(self._predict, pairs)
        merged = list(zip(candidates, scores, strict=True))
        merged.sort(key=lambda x: x[1], reverse=True)
        out: list[SearchHit] = []
        for h, s in merged:
            out.append(
                SearchHit(
                    chunk_id=h.chunk_id,
                    doc_id=h.doc_id,
                    chunk_index=h.chunk_index,
                    content=h.content,
                    score=float(s),
                    source=f"{h.source}+rerank",
                )
            )
        out.extend(hits[n:])
        return out


class RemoteReranker:
    def __init__(self, *, url: str, api_key: str, timeout_s: float) -> None:
        self._url = url
        self._api_key = api_key
        self._timeout_s = timeout_s

    async def _predict(self, *, query: str, documents: list[str]) -> list[float]:
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        payload = {"query": query, "documents": documents}
        async with httpx.AsyncClient(timeout=self._timeout_s) as client:
            resp = await client.post(self._url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        scores: list[float] | None = None
        if isinstance(data, dict) and isinstance(data.get("scores"), list):
            scores = [float(x) for x in data["scores"]]
        elif isinstance(data, dict) and isinstance(data.get("data"), list):
            items = data["data"]
            out: list[float] = []
            for it in items:
                if isinstance(it, dict):
                    if "score" in it:
                        out.append(float(it["score"]))
                    elif "relevance_score" in it:
                        out.append(float(it["relevance_score"]))
            if out:
                scores = out

        if scores is None or len(scores) != len(documents):
            raise RuntimeError("invalid_rerank_response")
        return scores

    async def rerank(self, *, query: str, hits: list[SearchHit], top_n: int) -> list[SearchHit]:
        if not hits:
            return []
        n = max(1, min(int(top_n), len(hits)))
        candidates = hits[:n]
        docs = [h.content for h in candidates]
        scores = await self._predict(query=query, documents=docs)

        merged = list(zip(candidates, scores, strict=True))
        merged.sort(key=lambda x: x[1], reverse=True)
        out: list[SearchHit] = []
        for h, s in merged:
            out.append(
                SearchHit(
                    chunk_id=h.chunk_id,
                    doc_id=h.doc_id,
                    chunk_index=h.chunk_index,
                    content=h.content,
                    score=float(s),
                    source=f"{h.source}+rerank",
                )
            )
        out.extend(hits[n:])
        return out
