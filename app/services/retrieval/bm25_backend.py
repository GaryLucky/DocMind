from __future__ import annotations
from langchain_core.embeddings import Embeddings
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.db.models import Chunk, Document
from app.services.retrieval.types import SearchHit


class BM25Backend:
    name = "bm25"

    async def query(
        self,
        *,
        session: AsyncSession,
        embeddings: Embeddings,
        owner: str,
        query: str,
        top_k: int,
        document_ids: list[int] | None = None,
    ) -> list[SearchHit]:
        if session.bind is None or session.bind.dialect.name != "postgresql":
            return []

        q = query.strip()
        if not q:
            return []

        ts_query = func.websearch_to_tsquery("simple", q)
        tsv = func.to_tsvector("simple", Chunk.content)
        rank = func.ts_rank_cd(tsv, ts_query)

        stmt: Select[tuple[int, int, int, str, float]] = (
            select(
                Chunk.id,
                Chunk.document_id,
                Chunk.chunk_index,
                Chunk.content,
                rank.label("rank"),
            )
            .join(Document, Document.id == Chunk.document_id)
            .where(Document.owner == owner)
            .where(tsv.op("@@")(ts_query))
        )
        if document_ids:
            stmt = stmt.where(Chunk.document_id.in_(document_ids))
        stmt = stmt.order_by(rank.desc()).limit(max(1, int(top_k)))

        rows = (await session.execute(stmt)).all()
        out: list[SearchHit] = []
        for chunk_id, doc_id, chunk_index, content, r in rows:
            out.append(
                SearchHit(
                    chunk_id=int(chunk_id),
                    doc_id=int(doc_id),
                    chunk_index=int(chunk_index),
                    content=str(content),
                    score=float(r or 0.0),
                    source=self.name,
                )
            )
        return out
