from __future__ import annotations

from langchain_core.embeddings import Embeddings
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.db.models import Chunk, Document
from app.services.retrieval.types import SearchHit


class PgVectorBackend:
    name = "pgvector"

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
        q = query.strip()
        if not q:
            return []

        qvec = [float(x) for x in await embeddings.aembed_query(q)]
        if not qvec:
            return []

        distance = Chunk.embedding.op("<=>")(qvec)
        stmt: Select[tuple[int, int, int, str, float]] = (
            select(
                Chunk.id,
                Chunk.document_id,
                Chunk.chunk_index,
                Chunk.content,
                distance.label("distance"),
            )
            .join(Document, Document.id == Chunk.document_id)
            .where(Document.owner == owner)
        )
        if document_ids:
            stmt = stmt.where(Chunk.document_id.in_(document_ids))
        stmt = stmt.order_by(distance.asc()).limit(max(1, int(top_k)))

        rows = (await session.execute(stmt)).all()
        out: list[SearchHit] = []
        for chunk_id, doc_id, chunk_index, content, dist in rows:
            score = 1.0 - float(dist)
            out.append(
                SearchHit(
                    chunk_id=int(chunk_id),
                    doc_id=int(doc_id),
                    chunk_index=int(chunk_index),
                    content=str(content),
                    score=score,
                    source=self.name,
                )
            )
        return out
