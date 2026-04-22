from __future__ import annotations
import re

from langchain_core.embeddings import Embeddings
from sqlalchemy import Select, func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.db.models import Chunk, Document
from app.services.retrieval.types import SearchHit


_CJK_RUN_RE = re.compile(r"[\u4e00-\u9fff]+")


def _strip_zh_question_suffix(text: str) -> str:
    q = text.strip()
    q = q.replace("？", "?").replace("。", ".").replace("，", ",").replace("！", "!")
    q = re.sub(r"[\s\?\.\!,，。！？]+$", "", q)
    suffixes = [
        "是谁",
        "是谁呢",
        "是什么",
        "是啥",
        "是什么东西",
        "什么意思",
        "干什么的",
        "做什么的",
        "资料",
        "简介",
        "介绍",
    ]
    for s in suffixes:
        if q.endswith(s) and len(q) > len(s):
            return q[: -len(s)].strip()
    return q


def _fallback_term(query: str) -> str:
    q = _strip_zh_question_suffix(query)
    m = _CJK_RUN_RE.search(q)
    if m:
        return m.group(0)
    return q


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
        if not rows:
            term = _fallback_term(q)
            if term:
                fallback_stmt: Select[tuple[int, int, int, str, float]] = (
                    select(
                        Chunk.id,
                        Chunk.document_id,
                        Chunk.chunk_index,
                        Chunk.content,
                        literal(0.0).label("rank"),
                    )
                    .join(Document, Document.id == Chunk.document_id)
                    .where(Document.owner == owner)
                    .where(Chunk.content.ilike(f"%{term}%"))
                )
                if document_ids:
                    fallback_stmt = fallback_stmt.where(Chunk.document_id.in_(document_ids))
                fallback_stmt = fallback_stmt.limit(max(1, int(top_k)))
                rows = (await session.execute(fallback_stmt)).all()

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
