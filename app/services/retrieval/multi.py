from __future__ import annotations

import asyncio

from langchain_core.embeddings import Embeddings
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import Settings
from app.services.retrieval.rerank import CrossEncoderReranker, RemoteReranker, RerankConfig
from app.services.retrieval.pgvector_backend import PgVectorBackend
from app.services.retrieval.bm25_backend import BM25Backend
from app.services.retrieval.types import SearchHit


class MultiRetriever:
    def __init__(self, *, settings: Settings) -> None:
        self._settings = settings
        self._reranker = None

        enabled = [x.strip().lower() for x in (settings.vector_backends or []) if x.strip()]
        self._backends: list[object] = []
        for name in enabled:
            if name == "pgvector":
                self._backends.append(PgVectorBackend())
            elif name == "bm25":
                self._backends.append(BM25Backend())

        if not self._backends:
            self._backends = [PgVectorBackend()]

        cfg = RerankConfig(
            enabled=bool(settings.rerank_enabled),
            model=str(settings.rerank_model or "").strip(),
            top_n=int(settings.rerank_top_n),
            url=str(settings.rerank_url or "").strip(),
            api_key=str(settings.rerank_api_key or "").strip(),
            timeout_s=float(getattr(settings, "rerank_timeout_s", 10)),
        )
        self._rerank_cfg = cfg

    def _get_reranker(self) -> CrossEncoderReranker | RemoteReranker | None:
        if not self._rerank_cfg.enabled:
            return None
        if self._reranker is None:
            if self._rerank_cfg.url:
                self._reranker = RemoteReranker(
                    url=self._rerank_cfg.url,
                    api_key=self._rerank_cfg.api_key,
                    timeout_s=float(self._rerank_cfg.timeout_s),
                )
            elif self._rerank_cfg.model:
                self._reranker = CrossEncoderReranker(model_name=self._rerank_cfg.model)
            else:
                return None
        return self._reranker

    async def search(
        self,
        *,
        session: AsyncSession,
        embeddings: Embeddings,
        owner: str,
        query: str,
        top_k: int,
        document_ids: list[int] | None,
    ) -> list[SearchHit]:
        requested_top_k = max(int(top_k), 1)
        candidate_k = max(requested_top_k * 5, 20)
        if self._rerank_cfg.enabled:
            candidate_k = max(candidate_k, int(self._rerank_cfg.top_n))

        async def run_backend(b):
            try:
                return await b.query(
                    session=session,
                    embeddings=embeddings,
                    owner=owner,
                    query=query,
                    top_k=candidate_k,
                    document_ids=document_ids,
                )
            except Exception:
                return []

        tasks = [run_backend(b) for b in self._backends]
        results = await asyncio.gather(*tasks)
        per_chunk: dict[int, dict[str, SearchHit]] = {}
        rep_by_chunk: dict[int, SearchHit] = {}
        raw_by_source: dict[str, list[SearchHit]] = {}
        for hits in results:
            for h in hits:
                raw_by_source.setdefault(h.source, []).append(h)
                rep_by_chunk.setdefault(h.chunk_id, h)
                by_src = per_chunk.setdefault(h.chunk_id, {})
                prev = by_src.get(h.source)
                if prev is None or h.score > prev.score:
                    by_src[h.source] = h

        weights = {
            "bm25": float(getattr(self._settings, "bm25_weight", 0.4)),
            "pgvector": float(getattr(self._settings, "pgvector_weight", 0.6)),
        }

        minmax: dict[str, tuple[float, float]] = {}
        for src, hits in raw_by_source.items():
            if not hits:
                continue
            scores = [float(h.score) for h in hits]
            minmax[src] = (min(scores), max(scores))

        def norm(src: str, s: float) -> float:
            mm = minmax.get(src)
            if mm is None:
                return 0.0
            lo, hi = mm
            if hi <= lo:
                return 0.0
            return (float(s) - lo) / (hi - lo)

        out: list[SearchHit] = []
        for chunk_id, src_hits in per_chunk.items():
            rep = rep_by_chunk.get(chunk_id)
            if rep is None:
                continue

            numerator = 0.0
            denom = 0.0
            best_contrib = -1.0
            best_src = ""
            used_sources: list[str] = []
            for src, h in src_hits.items():
                w = float(weights.get(src, 0.0))
                if w <= 0:
                    continue
                contrib = w * norm(src, float(h.score))
                numerator += contrib
                denom += w
                used_sources.append(src)
                if contrib > best_contrib:
                    best_contrib = contrib
                    best_src = src

            blended = (numerator / denom) if denom > 0 else 0.0
            src_label = "hybrid" if len(set(used_sources)) > 1 else (best_src or rep.source)
            out.append(
                SearchHit(
                    chunk_id=rep.chunk_id,
                    doc_id=rep.doc_id,
                    chunk_index=rep.chunk_index,
                    content=rep.content,
                    score=float(blended),
                    source=src_label,
                )
            )

        out.sort(key=lambda x: x.score, reverse=True)

        reranker = self._get_reranker()
        if reranker is not None:
            try:
                out = await reranker.rerank(query=query, hits=out, top_n=int(self._rerank_cfg.top_n))
            except Exception:
                pass

        return out[:requested_top_k]
