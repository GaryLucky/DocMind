from __future__ import annotations
from dataclasses import dataclass

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.db.models import Chunk, Document



@dataclass(frozen=True)
class ChunkRow:
    chunk_id: int
    doc_id: int
    chunk_index: int
    content: str
    embedding: list[float]


async def get_owner_chunk_stats(*, session: AsyncSession, owner: str) -> tuple[int, int]:
    stmt = (
        select(func.count(Chunk.id), func.coalesce(func.max(Chunk.id), 0))
        .select_from(Chunk)
        .join(Document, Document.id == Chunk.document_id)
        .where(Document.owner == owner)
    )
    row = (await session.execute(stmt)).one()
    return int(row[0] or 0), int(row[1] or 0)


async def load_owner_chunks(*, session: AsyncSession, owner: str) -> list[ChunkRow]:
    stmt: Select[tuple[Chunk]] = (
        select(Chunk)
        .join(Document, Document.id == Chunk.document_id)
        .where(Document.owner == owner)
        .order_by(Chunk.id.asc())
    )
    result = await session.execute(stmt)
    chunks = list(result.scalars().all())
    out: list[ChunkRow] = []
    for c in chunks:
        out.append(
            ChunkRow(
                chunk_id=int(c.id),
                doc_id=int(c.document_id),
                chunk_index=int(c.chunk_index),
                content=str(c.content),
                embedding=[float(x) for x in (c.embedding or [])],
            )
        )
    return out


async def load_chunks_by_ids(*, session: AsyncSession, chunk_ids: list[int]) -> dict[int, tuple[int, int, str]]:
    if not chunk_ids:
        return {}
    stmt = select(Chunk).where(Chunk.id.in_(chunk_ids))
    result = await session.execute(stmt)
    rows = list(result.scalars().all())
    out: dict[int, tuple[int, int, str]] = {}
    for c in rows:
        out[int(c.id)] = (int(c.document_id), int(c.chunk_index), str(c.content))
    return out
