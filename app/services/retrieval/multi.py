from __future__ import annotations

import asyncio

from langchain_core.embeddings import Embeddings
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import Settings
from app.services.retrieval.faiss_backend import FaissDiskVectorBackend
from app.services.retrieval.milvus_backend import MilvusConfig, MilvusVectorBackend
from app.services.retrieval.pinecone_backend import PineconeConfig, PineconeVectorBackend
from app.services.retrieval.rerank import CrossEncoderReranker, RerankConfig
from app.services.retrieval.sqlite_backend import SqliteVectorBackend
from app.services.retrieval.types import SearchHit


class MultiRetriever:
    def __init__(self, *, settings: Settings) -> None:
        self._settings = settings
        self._reranker = None

        enabled = [x.strip().lower() for x in (settings.vector_backends or []) if x.strip()]
        self._backends: list[object] = []
        for name in enabled:
            if name == "sqlite":
                self._backends.append(SqliteVectorBackend())
            elif name == "faiss":
                self._backends.append(FaissDiskVectorBackend(dir_path=settings.faiss_dir))
            elif name == "milvus":
                self._backends.append(
                    MilvusVectorBackend(
                        config=MilvusConfig(
                            uri=settings.milvus_uri,
                            token=settings.milvus_token,
                            collection=settings.milvus_collection,
                        )
                    )
                )
            elif name == "pinecone":
                self._backends.append(
                    PineconeVectorBackend(
                        config=PineconeConfig(
                            api_key=settings.pinecone_api_key,
                            index=settings.pinecone_index,
                            host=settings.pinecone_host,
                        )
                    )
                )

        if not self._backends:
            self._backends = [SqliteVectorBackend()]

        cfg = RerankConfig(
            enabled=bool(settings.rerank_enabled),
            model=str(settings.rerank_model or "").strip(),
            top_n=int(settings.rerank_top_n),
        )
        self._rerank_cfg = cfg

    def _get_reranker(self) -> CrossEncoderReranker | None:
        if not self._rerank_cfg.enabled:
            return None
        if not self._rerank_cfg.model:
            return None
        if self._reranker is None:
            self._reranker = CrossEncoderReranker(model_name=self._rerank_cfg.model)
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
        async def run_backend(b):
            try:
                return await b.query(
                    session=session,
                    embeddings=embeddings,
                    owner=owner,
                    query=query,
                    top_k=max(int(top_k), 1),
                    document_ids=document_ids,
                )
            except Exception:
                return []

        tasks = [run_backend(b) for b in self._backends]
        results = await asyncio.gather(*tasks)
        merged: dict[int, SearchHit] = {}
        for hits in results:
            for h in hits:
                prev = merged.get(h.chunk_id)
                if prev is None or h.score > prev.score:
                    merged[h.chunk_id] = h

        out = list(merged.values())
        out.sort(key=lambda x: x.score, reverse=True)

        reranker = self._get_reranker()
        if reranker is not None:
            try:
                out = await reranker.rerank(query=query, hits=out, top_n=int(self._rerank_cfg.top_n))
            except Exception:
                pass

        return out[: max(1, int(top_k))]

