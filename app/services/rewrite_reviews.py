from __future__ import annotations

import datetime as dt
import difflib
import hashlib
import json

from langchain_core.embeddings import Embeddings
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import Settings
from app.infra.db.models import Chunk, Document, RewriteReview
from app.infra.llm.openai_compatible import OpenAICompatibleLLM
from app.services.chunking import chunk_text
from app.services.llm_ops import rewrite_text
from app.services.rewrite_agent_chain import run_reflection_rewrite_chain


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _unified_diff(original: str, proposed: str) -> str:
    a = original.splitlines(keepends=True)
    b = proposed.splitlines(keepends=True)
    return "".join(
        difflib.unified_diff(a, b, fromfile="original", tofile="proposed", lineterm="")
    )


async def _reindex_document(
    *,
    session: AsyncSession,
    settings: Settings,
    embeddings: Embeddings,
    doc: Document,
    content: str,
) -> int:
    doc.content = content
    await session.execute(delete(Chunk).where(Chunk.document_id == doc.id))

    chunks = chunk_text(
        text=content,
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
    )
    vectors = embeddings.embed_documents(chunks) if chunks else []

    for i, (chunk, vec) in enumerate(zip(chunks, vectors, strict=True)):
        session.add(
            Chunk(
                document_id=doc.id,
                chunk_index=i,
                content=chunk,
                embedding_json=json.dumps(vec, ensure_ascii=False),
            )
        )
    return len(chunks)


async def create_rewrite_review(
    *,
    session: AsyncSession,
    llm: OpenAICompatibleLLM,
    doc: Document,
    start: int,
    end: int,
    style: str,
    enable_agent_chain: bool = False,
    chain_strictness: int = 1,
    chain_max_loops: int = 2,
    user_intent: str | None = None,
    audience: str | None = None,
    constraints: list[str] | None = None,
    glossary: dict[str, str] | None = None,
) -> tuple[RewriteReview, dict | None]:
    original = doc.content[start:end]
    proposed: str
    chain_meta: dict | None = None
    if enable_agent_chain:
        try:
            proposed, chain_meta = await run_reflection_rewrite_chain(
                llm=llm,
                text=original,
                style=style,
                user_intent=user_intent,
                audience=audience,
                constraints=constraints,
                glossary=glossary,
                strictness=chain_strictness,
                max_loops=chain_max_loops,
            )
        except Exception as e:
            proposed = await rewrite_text(llm, text=original, style=style)
            chain_meta = {
                "enabled": True,
                "strictness": int(chain_strictness),
                "loops": 0,
                "quality_passed": False,
                "requirements_doc": {},
                "qa_reports": [],
                "final_notes": f"chain_error: {str(e)}",
            }
    else:
        proposed = await rewrite_text(llm, text=original, style=style)
    diff_text = _unified_diff(original, proposed)

    review = RewriteReview(
        document_id=doc.id,
        start_offset=start,
        end_offset=end,
        style=style,
        status="pending",
        base_content=doc.content,
        base_sha256=_sha256(doc.content),
        original_text=original,
        proposed_text=proposed,
        diff_text=diff_text,
    )
    session.add(review)
    await session.commit()
    await session.refresh(review)
    return review, chain_meta


async def apply_rewrite_review(
    *,
    session: AsyncSession,
    settings: Settings,
    embeddings: Embeddings,
    doc: Document,
    review: RewriteReview,
) -> tuple[str, int]:
    if review.status != "pending":
        raise ValueError("review_not_pending")

    if _sha256(doc.content) != review.base_sha256:
        raise ValueError("document_changed")

    base = review.base_content
    new_content = base[: review.start_offset] + review.proposed_text + base[review.end_offset :]

    chunks = await _reindex_document(
        session=session, settings=settings, embeddings=embeddings, doc=doc, content=new_content
    )

    review.status = "applied"
    review.applied_content = new_content
    review.applied_sha256 = _sha256(new_content)
    review.applied_at = dt.datetime.now(dt.UTC)

    await session.commit()
    return new_content, chunks


async def rollback_rewrite_review(
    *,
    session: AsyncSession,
    settings: Settings,
    embeddings: Embeddings,
    doc: Document,
    review: RewriteReview,
) -> tuple[str, int]:
    if review.status != "applied":
        raise ValueError("review_not_applied")

    if not review.applied_sha256 or not review.applied_content:
        raise ValueError("review_missing_applied_snapshot")

    if _sha256(doc.content) != review.applied_sha256:
        raise ValueError("document_changed")

    chunks = await _reindex_document(
        session=session,
        settings=settings,
        embeddings=embeddings,
        doc=doc,
        content=review.base_content,
    )

    review.status = "rolled_back"
    review.rolled_back_at = dt.datetime.now(dt.UTC)

    await session.commit()
    return review.base_content, chunks
