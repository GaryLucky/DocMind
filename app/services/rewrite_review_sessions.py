import datetime as dt
import hashlib
import json
from difflib import SequenceMatcher

from langchain_core.embeddings import Embeddings
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import Settings
from app.infra.db.models import (
    Document,
    RewriteReviewCommit,
    RewriteReviewSession,
)
from app.infra.llm.openai_compatible import OpenAICompatibleLLM
from app.services.llm_ops import rewrite_text
from app.services.rewrite_agent_chain import run_reflection_rewrite_chain
from app.services.rewrite_reviews import _reindex_document


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _compute_opcodes(*, base_text: str, target_text: str) -> list[dict]:
    a = base_text.splitlines(keepends=True)
    b = target_text.splitlines(keepends=True)
    sm = SequenceMatcher(a=a, b=b, autojunk=False)
    out: list[dict] = []
    idx = 1
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue
        out.append({"id": idx, "tag": tag, "i1": i1, "i2": i2, "j1": j1, "j2": j2})
        idx += 1
    return out


def _apply_opcodes(*, base_text: str, target_text: str, opcode_ids: set[int], opcodes: list[dict]) -> str:
    a = base_text.splitlines(keepends=True)
    b = target_text.splitlines(keepends=True)
    pieces: list[str] = []
    cur = 0
    for op in opcodes:
        i1 = int(op["i1"])
        i2 = int(op["i2"])
        j1 = int(op["j1"])
        j2 = int(op["j2"])
        op_id = int(op["id"])
        pieces.extend(a[cur:i1])
        if op_id in opcode_ids:
            pieces.extend(b[j1:j2])
        else:
            pieces.extend(a[i1:i2])
        cur = i2
    pieces.extend(a[cur:])
    return "".join(pieces)


async def create_session(
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
) -> tuple[RewriteReviewSession, dict | None]:
    base = doc.content
    original = base[start:end]
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
    target = base[:start] + proposed + base[end:]

    rr = RewriteReviewSession(
        document_id=doc.id,
        selection_start=start,
        selection_end=end,
        style=style,
        status="open",
        base_content=base,
        base_sha256=_sha256(base),
        target_content=target,
        target_sha256=_sha256(target),
    )
    session.add(rr)
    await session.commit()
    await session.refresh(rr)
    return rr, chain_meta


async def get_session(*, session: AsyncSession, session_id: int) -> RewriteReviewSession | None:
    return await session.get(RewriteReviewSession, session_id)


async def list_commits(*, session: AsyncSession, session_id: int) -> list[RewriteReviewCommit]:
    result = await session.execute(
        select(RewriteReviewCommit)
        .where(RewriteReviewCommit.session_id == session_id)
        .order_by(RewriteReviewCommit.created_at.asc())
    )
    return list(result.scalars().all())


async def apply_selected(
    *,
    session: AsyncSession,
    settings: Settings,
    embeddings: Embeddings,
    doc: Document,
    rr: RewriteReviewSession,
    opcode_ids: list[int],
) -> tuple[str, int, RewriteReviewCommit]:
    if rr.status != "open":
        raise ValueError("session_closed")

    if _sha256(doc.content) != rr.base_sha256:
        raise ValueError("document_changed")

    opcodes = _compute_opcodes(base_text=rr.base_content, target_text=rr.target_content)
    ids = set(opcode_ids)
    if not ids.issubset({int(o["id"]) for o in opcodes}):
        raise ValueError("invalid_opcode_ids")

    before = rr.base_content
    after = _apply_opcodes(base_text=rr.base_content, target_text=rr.target_content, opcode_ids=ids, opcodes=opcodes)

    chunks = await _reindex_document(session=session, settings=settings, embeddings=embeddings, doc=doc, content=after)

    commit = RewriteReviewCommit(
        session_id=rr.id,
        status="applied",
        before_sha256=_sha256(before),
        after_sha256=_sha256(after),
        before_content=before,
        after_content=after,
        opcode_ids_json=json.dumps(sorted(ids)),
    )
    session.add(commit)

    rr.base_content = after
    rr.base_sha256 = _sha256(after)
    remaining = _compute_opcodes(base_text=rr.base_content, target_text=rr.target_content)
    if not remaining:
        rr.status = "closed"

    await session.commit()
    await session.refresh(commit)
    return after, chunks, commit


async def rollback_commit(
    *,
    session: AsyncSession,
    settings: Settings,
    embeddings: Embeddings,
    doc: Document,
    rr: RewriteReviewSession,
    commit: RewriteReviewCommit,
) -> tuple[str, int]:
    if commit.session_id != rr.id:
        raise ValueError("commit_mismatch")

    if _sha256(doc.content) != commit.after_sha256:
        raise ValueError("document_changed")

    content = commit.before_content
    chunks = await _reindex_document(session=session, settings=settings, embeddings=embeddings, doc=doc, content=content)

    rr.base_content = content
    rr.base_sha256 = _sha256(content)
    rr.status = "open"
    commit.status = "rolled_back"

    await session.commit()
    return content, chunks
