from __future__ import annotations

import json
from typing import Any

from langchain_core.embeddings import Embeddings
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.db.models import Chunk, Document


def _l2_norm(v: list[float]) -> float:
    return sum(x * x for x in v) ** 0.5


def _normalize(v: list[float]) -> list[float]:
    if not v:
        return []
    n = _l2_norm(v)
    if n <= 0:
        return v
    inv = 1.0 / n
    return [x * inv for x in v]


def _dot(a: list[float], b: list[float]) -> float:
    n = min(len(a), len(b))
    return sum(a[i] * b[i] for i in range(n))


def _keyword_bonus(*, query: str, text: str) -> float:
    tokens = [t.strip().lower() for t in query.split() if t.strip()]
    if not tokens:
        return 0.0
    hay = text.lower()
    hits = sum(hay.count(t) for t in tokens)
    return min(1.0, hits / 10.0)


async def search_chunks(
    *,
    session: AsyncSession,
    embeddings: Embeddings,
    query: str,
    top_k: int,
    document_ids: list[int] | None,
    owner_username: str,
) -> list[dict]:
    q_vec = _normalize([float(x) for x in await embeddings.aembed_query(query)])

    stmt: Select[tuple[Chunk]] = (
        select(Chunk).join(Document, Document.id == Chunk.document_id).where(Document.owner == owner_username)
    )
    if document_ids:
        stmt = stmt.where(Chunk.document_id.in_(document_ids))

    result = await session.execute(stmt)
    chunks = list(result.scalars().all())

    scored: list[dict] = []
    for c in chunks:
        vec = json.loads(c.embedding_json)
        if not isinstance(vec, list):
            vec = []
        vec_n = _normalize([float(x) for x in vec])
        sim = _dot(q_vec, vec_n)
        score = sim + 0.05 * _keyword_bonus(query=query, text=c.content)
        scored.append(
            {
                "chunk_id": c.id,
                "doc_id": c.document_id,
                "chunk_index": c.chunk_index,
                "content": c.content,
                "score": score,
            }
        )

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[: max(1, top_k)]
