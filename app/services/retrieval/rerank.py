from __future__ import annotations

import asyncio
from dataclasses import dataclass

from app.services.retrieval.types import SearchHit


@dataclass(frozen=True)
class RerankConfig:
    enabled: bool
    model: str
    top_n: int


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

