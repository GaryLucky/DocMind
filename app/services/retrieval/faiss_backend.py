from __future__ import annotations

import json
import os
from dataclasses import dataclass

import numpy as np
from langchain_core.embeddings import Embeddings
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.retrieval.db import get_owner_chunk_stats, load_chunks_by_ids, load_owner_chunks
from app.services.retrieval.types import SearchHit


@dataclass(frozen=True)
class _FaissMeta:
    count: int
    max_chunk_id: int
    items: list[dict]


class FaissDiskVectorBackend:
    name = "faiss"

    def __init__(self, *, dir_path: str) -> None:
        self._dir = dir_path

    def _owner_key(self, owner: str) -> str:
        safe = "".join([c for c in owner if c.isalnum() or c in {"-", "_"}]) or "default"
        return safe[:64]

    def _index_paths(self, owner: str) -> tuple[str, str]:
        key = self._owner_key(owner)
        os.makedirs(self._dir, exist_ok=True)
        return os.path.join(self._dir, f"{key}.index"), os.path.join(self._dir, f"{key}.meta.json")

    def _read_meta(self, path: str) -> _FaissMeta | None:
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return _FaissMeta(
                count=int(data.get("count") or 0),
                max_chunk_id=int(data.get("max_chunk_id") or 0),
                items=list(data.get("items") or []),
            )
        except Exception:
            return None

    def _write_meta(self, path: str, meta: _FaissMeta) -> None:
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(
                {"count": meta.count, "max_chunk_id": meta.max_chunk_id, "items": meta.items},
                f,
                ensure_ascii=False,
            )
        os.replace(tmp, path)

    async def _ensure_index(
        self,
        *,
        session: AsyncSession,
        embeddings: Embeddings,
        owner: str,
    ) -> tuple[object, _FaissMeta]:
        try:
            import faiss  # type: ignore[import-not-found]
        except Exception as e:
            raise RuntimeError("missing_dependency:faiss-cpu") from e

        index_path, meta_path = self._index_paths(owner)
        meta = self._read_meta(meta_path)
        cnt, max_id = await get_owner_chunk_stats(session=session, owner=owner)
        needs_rebuild = meta is None or meta.count != cnt or meta.max_chunk_id != max_id
        if not needs_rebuild and os.path.exists(index_path):
            idx = faiss.read_index(index_path)
            return idx, meta

        rows = await load_owner_chunks(session=session, owner=owner)
        if not rows:
            idx = faiss.IndexFlatIP(int(getattr(embeddings, "dim", 256)))
            meta2 = _FaissMeta(count=0, max_chunk_id=0, items=[])
            faiss.write_index(idx, index_path)
            self._write_meta(meta_path, meta2)
            return idx, meta2

        vectors = np.array([r.embedding for r in rows], dtype="float32")
        if vectors.ndim != 2:
            vectors = vectors.reshape((vectors.shape[0], -1))
        faiss.normalize_L2(vectors)
        dim = int(vectors.shape[1])
        idx = faiss.IndexFlatIP(dim)
        idx.add(vectors)
        items = [{"chunk_id": r.chunk_id, "doc_id": r.doc_id, "chunk_index": r.chunk_index} for r in rows]
        meta2 = _FaissMeta(count=len(rows), max_chunk_id=max([r.chunk_id for r in rows]), items=items)
        faiss.write_index(idx, index_path)
        self._write_meta(meta_path, meta2)
        return idx, meta2

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
        try:
            import faiss  # type: ignore[import-not-found]
        except Exception as e:
            raise RuntimeError("missing_dependency:faiss-cpu") from e

        idx, meta = await self._ensure_index(session=session, embeddings=embeddings, owner=owner)
        if not meta.items:
            return []

        qv = np.array([embeddings.embed_query(query)], dtype="float32")
        faiss.normalize_L2(qv)
        oversample = max(top_k * 5, top_k)
        oversample = min(max(oversample, top_k), 200)
        scores, ids = idx.search(qv, oversample)

        picked: list[tuple[dict, float]] = []
        raw_ids = ids[0].tolist()
        raw_scores = scores[0].tolist()
        for pos, raw_i in enumerate(raw_ids):
            i = int(raw_i)
            if i < 0 or i >= len(meta.items):
                continue
            it = meta.items[i]
            if document_ids and int(it.get("doc_id") or 0) not in document_ids:
                continue
            picked.append((it, float(raw_scores[pos]) if pos < len(raw_scores) else 0.0))
            if len(picked) >= top_k:
                break

        chunk_ids = [int(it["chunk_id"]) for it, _ in picked if "chunk_id" in it]
        content_map = await load_chunks_by_ids(session=session, chunk_ids=chunk_ids)

        out: list[SearchHit] = []
        for it, score in picked:
            cid = int(it["chunk_id"])
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
                    score=float(score),
                    source=self.name,
                )
            )
        return out
