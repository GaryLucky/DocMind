from __future__ import annotations

from dataclasses import dataclass

from langchain_core.embeddings import Embeddings
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.retrieval.db import get_owner_chunk_stats, load_chunks_by_ids, load_owner_chunks
from app.services.retrieval.types import SearchHit


@dataclass(frozen=True)
class PineconeConfig:
    api_key: str
    index: str
    host: str


class PineconeVectorBackend:
    name = "pinecone"

    def __init__(self, *, config: PineconeConfig) -> None:
        self._cfg = config
        self._pc = None
        self._index = None
        self._synced_max: dict[str, int] = {}

    def _get_index(self):
        if not self._cfg.api_key.strip():
            raise RuntimeError("missing_config:pinecone_api_key")
        if not self._cfg.index.strip() and not self._cfg.host.strip():
            raise RuntimeError("missing_config:pinecone_index_or_host")
        try:
            from pinecone import Pinecone  # type: ignore[import-not-found]
        except Exception as e:
            raise RuntimeError("missing_dependency:pinecone") from e

        if self._pc is None:
            self._pc = Pinecone(api_key=self._cfg.api_key)
        if self._index is None:
            if self._cfg.host.strip():
                self._index = self._pc.Index(host=self._cfg.host)
            else:
                self._index = self._pc.Index(self._cfg.index)
        return self._index

    async def _ensure_synced(self, *, session: AsyncSession, embeddings: Embeddings, owner: str) -> None:
        index = self._get_index()
        _, max_id = await get_owner_chunk_stats(session=session, owner=owner)
        last = int(self._synced_max.get(owner) or 0)
        if max_id <= last:
            return

        rows = await load_owner_chunks(session=session, owner=owner)
        if not rows:
            self._synced_max[owner] = max_id
            return

        vectors = []
        for r in rows:
            vectors.append(
                (
                    str(int(r.chunk_id)),
                    r.embedding,
                    {"owner": owner, "doc_id": int(r.doc_id), "chunk_index": int(r.chunk_index)},
                )
            )
        index.upsert(vectors=vectors)
        self._synced_max[owner] = max_id

    async def query(
        self,
        *,
        session: AsyncSession,
        embeddings: Embeddings,
        owner: str,
        query: str,
        top_k: int,
        document_ids: list[int] | None,
    ) -> list[SearchHit]:
        await self._ensure_synced(session=session, embeddings=embeddings, owner=owner)
        index = self._get_index()
        vector = embeddings.embed_query(query)
        filt: dict = {"owner": {"$eq": owner}}
        if document_ids:
            filt["doc_id"] = {"$in": [int(x) for x in document_ids]}

        res = index.query(vector=vector, top_k=int(top_k), include_metadata=True, filter=filt)
        matches = (res.get("matches") or []) if isinstance(res, dict) else getattr(res, "matches", []) or []

        chunk_ids: list[int] = []
        scored: list[tuple[int, float]] = []
        for m in matches:
            mid = m.get("id") if isinstance(m, dict) else getattr(m, "id", None)
            try:
                cid = int(mid)
            except Exception:
                continue
            score = float(m.get("score") if isinstance(m, dict) else getattr(m, "score", 0.0) or 0.0)
            chunk_ids.append(cid)
            scored.append((cid, score))

        content_map = await load_chunks_by_ids(session=session, chunk_ids=chunk_ids)
        out: list[SearchHit] = []
        for cid, score in scored:
            tup = content_map.get(cid)
            if not tup:
                continue
            doc_id, chunk_index, content = tup
            out.append(
                SearchHit(
                    chunk_id=cid,
                    doc_id=doc_id,
                    chunk_index=chunk_index,
                    content=content,
                    score=score,
                    source=self.name,
                )
            )
        return out

