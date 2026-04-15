from __future__ import annotations

from dataclasses import dataclass

from langchain_core.embeddings import Embeddings
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.retrieval.db import get_owner_chunk_stats, load_chunks_by_ids, load_owner_chunks
from app.services.retrieval.types import SearchHit


@dataclass(frozen=True)
class MilvusConfig:
    uri: str
    token: str
    collection: str


class MilvusVectorBackend:
    name = "milvus"

    def __init__(self, *, config: MilvusConfig) -> None:
        self._cfg = config
        self._client = None
        self._synced_max: dict[str, int] = {}

    def _get_client(self):
        if not self._cfg.uri.strip():
            raise RuntimeError("missing_config:milvus_uri")
        try:
            from pymilvus import MilvusClient  # type: ignore[import-not-found]
        except Exception as e:
            raise RuntimeError("missing_dependency:pymilvus") from e
        if self._client is None:
            self._client = MilvusClient(uri=self._cfg.uri, token=self._cfg.token or None)
        return self._client

    async def _ensure_synced(self, *, session: AsyncSession, embeddings: Embeddings, owner: str) -> None:
        client = self._get_client()
        _, max_id = await get_owner_chunk_stats(session=session, owner=owner)
        last = int(self._synced_max.get(owner) or 0)
        if max_id <= last:
            return

        rows = await load_owner_chunks(session=session, owner=owner)
        if not rows:
            self._synced_max[owner] = max_id
            return

        dim = len(rows[0].embedding) if rows[0].embedding else int(getattr(embeddings, "dim", 256))
        try:
            client.create_collection(collection_name=self._cfg.collection, dimension=int(dim))
        except Exception:
            pass

        data = []
        for r in rows:
            data.append(
                {
                    "chunk_id": int(r.chunk_id),
                    "owner": owner,
                    "doc_id": int(r.doc_id),
                    "chunk_index": int(r.chunk_index),
                    "content": r.content,
                    "vector": r.embedding,
                }
            )

        try:
            client.upsert(collection_name=self._cfg.collection, data=data)
        except Exception:
            try:
                client.insert(collection_name=self._cfg.collection, data=data)
            except Exception:
                pass

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
        client = self._get_client()
        vector = embeddings.embed_query(query)

        filt = f'owner == "{owner}"'
        if document_ids:
            ids = ",".join([str(int(x)) for x in document_ids])
            filt = f'{filt} and doc_id in [{ids}]'

        res = client.search(
            collection_name=self._cfg.collection,
            data=[vector],
            limit=int(top_k),
            filter=filt,
            output_fields=["chunk_id", "doc_id", "chunk_index"],
        )

        hits_raw = (res[0] if isinstance(res, list) and res else []) or []
        chunk_ids: list[int] = []
        scored: list[tuple[int, float]] = []
        for h in hits_raw:
            try:
                cid = int((h.get("entity") or {}).get("chunk_id") or h.get("id") or 0)
            except Exception:
                cid = 0
            if cid <= 0:
                continue
            score = float(h.get("distance") or h.get("score") or 0.0)
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

