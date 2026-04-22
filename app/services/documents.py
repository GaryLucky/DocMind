from langchain_core.embeddings import Embeddings
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import Settings
from app.infra.db.models import Chunk, Document
from app.services.chunking import chunk_text


async def ingest_document(
    *,
    session: AsyncSession,
    settings: Settings,
    embeddings: Embeddings,
    title: str,
    owner: str,
    content: str,
) -> tuple[int, int]:
    doc = Document(title=title, owner=owner, content=content)
    session.add(doc)
    await session.flush()

    chunks = chunk_text(
        text=content,
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
    )
    vectors = await embeddings.aembed_documents(chunks) if chunks else []

    for i, (chunk, vec) in enumerate(zip(chunks, vectors, strict=True)):
        session.add(
            Chunk(
                document_id=doc.id,
                chunk_index=i,
                content=chunk,
                embedding=[float(x) for x in vec],
            )
        )

    await session.commit()
    return doc.id, len(chunks)


async def reindex_document(
    *,
    session: AsyncSession,
    settings: Settings,
    embeddings: Embeddings,
    doc: Document,
) -> int:
    await session.execute(delete(Chunk).where(Chunk.document_id == doc.id))

    chunks = chunk_text(
        text=doc.content,
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
    )
    vectors = await embeddings.aembed_documents(chunks) if chunks else []

    for i, (chunk, vec) in enumerate(zip(chunks, vectors, strict=True)):
        session.add(
            Chunk(
                document_id=doc.id,
                chunk_index=i,
                content=chunk,
                embedding=[float(x) for x in vec],
            )
        )
    return len(chunks)
