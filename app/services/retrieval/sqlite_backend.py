from __future__ import annotations

from langchain_core.embeddings import Embeddings
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.retrieval.types import SearchHit
from app.services.search import search_chunks


class SqliteVectorBackend:
    name = "sqlite"

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
        rows = await search_chunks(
            session=session,
            embeddings=embeddings,
            query=query,
            top_k=top_k,
            document_ids=document_ids,
            owner_username=owner,
        )
        out: list[SearchHit] = []
        for r in rows:
            out.append(
                SearchHit(
                    chunk_id=int(r["chunk_id"]),
                    doc_id=int(r["doc_id"]),
                    chunk_index=int(r["chunk_index"]),
                    content=str(r["content"]),
                    score=float(r["score"]),
                    source=self.name,
                )
            )
        return out

