import json

import asyncio
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from langchain_core.embeddings import Embeddings
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_embeddings, get_llm, get_settings
from app.api.sse import sse_encode
from app.core.settings import Settings
from app.infra.db.models import Document, RewriteReview, RewriteReviewCommit, User
from app.infra.db.session import get_db_session
from app.infra.llm.openai_compatible import OpenAICompatibleLLM
from app.schemas.llm_ops import (
    RewriteRequest,
    RewriteResponse,
    RewriteReviewApplyResponse,
    RewriteReviewRequest,
    RewriteReviewResponse,
    RewriteReviewSessionApplyRequest,
    RewriteReviewSessionApplyResponse,
    RewriteReviewSessionCreateRequest,
    RewriteReviewSessionResponse,
    RewriteReviewSessionRollbackRequest,
)
from app.services.llm_ops import rewrite_text
from app.services.rewrite_agent_chain import run_reflection_rewrite_chain
from app.services.rewrite_reviews import (
    apply_rewrite_review,
    create_rewrite_review,
    rollback_rewrite_review,
)
from app.services.rewrite_review_sessions import (
    _compute_opcodes,
    apply_selected,
    create_session,
    get_session,
    list_commits,
    rollback_commit,
)

router = APIRouter()


@router.post("/rewrite", response_model=RewriteResponse)
async def rewrite(
    request: RewriteRequest,
    llm: OpenAICompatibleLLM = Depends(get_llm),
    user: User = Depends(get_current_user),
):
    """
    文档改写与建议：对输入文本进行重写
    """
    try:
        if request.enable_agent_chain:
            try:
                result, chain = await run_reflection_rewrite_chain(
                    llm=llm,
                    text=request.text,
                    style=request.style,
                    user_intent=request.user_intent,
                    audience=request.audience,
                    constraints=request.constraints,
                    glossary=request.glossary,
                    strictness=request.chain_strictness,
                    max_loops=request.chain_max_loops,
                )
                return RewriteResponse(result=result, chain=chain)
            except Exception as e:
                result = await rewrite_text(llm, text=request.text, style=request.style)
                chain = {
                    "enabled": True,
                    "strictness": int(request.chain_strictness),
                    "loops": 0,
                    "quality_passed": False,
                    "requirements_doc": {},
                    "qa_reports": [],
                    "final_notes": f"chain_error: {str(e)}",
                }
                return RewriteResponse(result=result, chain=chain)
        result = await rewrite_text(llm, text=request.text, style=request.style)
        return RewriteResponse(result=result, chain=None)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rewrite/stream")
async def rewrite_stream(
    request: RewriteRequest,
    llm: OpenAICompatibleLLM = Depends(get_llm),
    user: User = Depends(get_current_user),
):
    def chunk_text(s: str, size: int = 48):
        i = 0
        while i < len(s):
            yield s[i : i + size]
            i += size

    async def gen():
        try:
            yield sse_encode(event="start", data={"op": "rewrite", "enable_agent_chain": bool(request.enable_agent_chain)})
            if request.enable_agent_chain:
                q: asyncio.Queue[bytes] = asyncio.Queue()
                done = object()

                async def progress_cb(payload: dict):
                    await q.put(sse_encode(event="progress", data=payload))

                async def runner():
                    try:
                        result, chain = await run_reflection_rewrite_chain(
                            llm=llm,
                            text=request.text,
                            style=request.style,
                            user_intent=request.user_intent,
                            audience=request.audience,
                            constraints=request.constraints,
                            glossary=request.glossary,
                            strictness=request.chain_strictness,
                            max_loops=request.chain_max_loops,
                            progress_cb=progress_cb,
                        )
                        for t in chunk_text(result):
                            await q.put(sse_encode(event="token", data={"text": t}))
                        await q.put(sse_encode(event="done", data={"result": result, "chain": chain}))
                    except Exception as e:
                        await q.put(sse_encode(event="error", data={"message": str(e)}))
                    finally:
                        await q.put(done)  # type: ignore[arg-type]

                task = asyncio.create_task(runner())
                try:
                    while True:
                        item = await q.get()
                        if item is done:
                            break
                        yield item
                finally:
                    task.cancel()
                return

            system_prompt = f"你是一个专业的文本重写助手。请将以下文本重写为 {request.style} 风格。确保语义不变，但调整表达方式。"
            user_prompt = f"需要重写的文本：\n{request.text}"
            buf: list[str] = []
            try:
                async for t in llm.chat_stream(system=system_prompt, user=user_prompt):
                    buf.append(t)
                    yield sse_encode(event="token", data={"text": t})
            except Exception:
                result = await rewrite_text(llm, text=request.text, style=request.style)
                buf = [result]
                yield sse_encode(event="token", data={"text": result})
            yield sse_encode(event="done", data={"result": "".join(buf), "chain": None})
        except asyncio.CancelledError:
            return
        except Exception as e:
            yield sse_encode(event="error", data={"message": str(e)})

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.post("/rewrite/review", response_model=RewriteReviewResponse)
async def create_review(
    request: RewriteReviewRequest,
    session: AsyncSession = Depends(get_db_session),
    llm: OpenAICompatibleLLM = Depends(get_llm),
    user: User = Depends(get_current_user),
) -> RewriteReviewResponse:
    doc = await session.get(Document, request.doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.owner != user.username:
        raise HTTPException(status_code=404, detail="Document not found")
    if request.start >= request.end:
        raise HTTPException(status_code=400, detail="Invalid range")
    if request.end > len(doc.content):
        raise HTTPException(status_code=400, detail="Range out of bounds")
    try:
        review, chain = await create_rewrite_review(
            session=session,
            llm=llm,
            doc=doc,
            start=request.start,
            end=request.end,
            style=request.style,
            enable_agent_chain=request.enable_agent_chain,
            chain_strictness=request.chain_strictness,
            chain_max_loops=request.chain_max_loops,
            user_intent=request.user_intent,
            audience=request.audience,
            constraints=request.constraints,
            glossary=request.glossary,
        )
        return RewriteReviewResponse(
            review_id=review.id,
            doc_id=review.document_id,
            start=review.start_offset,
            end=review.end_offset,
            style=review.style,
            status=review.status,
            original=review.original_text,
            proposed=review.proposed_text,
            diff=review.diff_text,
            created_at=review.created_at,
            chain=chain,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/rewrite/review/{review_id}", response_model=RewriteReviewResponse)
async def get_review(
    review_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> RewriteReviewResponse:
    review = await session.get(RewriteReview, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    doc = await session.get(Document, review.document_id)
    if not doc or doc.owner != user.username:
        raise HTTPException(status_code=404, detail="Review not found")
    return RewriteReviewResponse(
        review_id=review.id,
        doc_id=review.document_id,
        start=review.start_offset,
        end=review.end_offset,
        style=review.style,
        status=review.status,
        original=review.original_text,
        proposed=review.proposed_text,
        diff=review.diff_text,
        created_at=review.created_at,
        chain=None,
    )


@router.post("/rewrite/review/{review_id}/apply", response_model=RewriteReviewApplyResponse)
async def apply_review(
    review_id: int,
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
    embeddings: Embeddings = Depends(get_embeddings),
    user: User = Depends(get_current_user),
) -> RewriteReviewApplyResponse:
    review = await session.get(RewriteReview, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    doc = await session.get(Document, review.document_id)
    if not doc or doc.owner != user.username:
        raise HTTPException(status_code=404, detail="Document not found")
    try:
        content, chunks = await apply_rewrite_review(
            session=session,
            settings=settings,
            embeddings=embeddings,
            doc=doc,
            review=review,
        )
        return RewriteReviewApplyResponse(
            review_id=review.id,
            doc_id=doc.id,
            status=review.status,
            chunks=chunks,
            content=content,
        )
    except ValueError as e:
        if str(e) == "review_not_pending":
            raise HTTPException(status_code=409, detail="Review is not pending")
        if str(e) == "document_changed":
            raise HTTPException(status_code=409, detail="Document changed, please recreate review")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rewrite/review/{review_id}/rollback", response_model=RewriteReviewApplyResponse)
async def rollback_review(
    review_id: int,
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
    embeddings: Embeddings = Depends(get_embeddings),
    user: User = Depends(get_current_user),
) -> RewriteReviewApplyResponse:
    review = await session.get(RewriteReview, review_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    doc = await session.get(Document, review.document_id)
    if not doc or doc.owner != user.username:
        raise HTTPException(status_code=404, detail="Document not found")
    try:
        content, chunks = await rollback_rewrite_review(
            session=session,
            settings=settings,
            embeddings=embeddings,
            doc=doc,
            review=review,
        )
        return RewriteReviewApplyResponse(
            review_id=review.id,
            doc_id=doc.id,
            status=review.status,
            chunks=chunks,
            content=content,
        )
    except ValueError as e:
        if str(e) == "review_not_applied":
            raise HTTPException(status_code=409, detail="Review is not applied")
        if str(e) == "document_changed":
            raise HTTPException(status_code=409, detail="Document changed, cannot rollback")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rewrite/review_sessions", response_model=RewriteReviewSessionResponse)
async def create_review_session(
    request: RewriteReviewSessionCreateRequest,
    session: AsyncSession = Depends(get_db_session),
    llm: OpenAICompatibleLLM = Depends(get_llm),
    user: User = Depends(get_current_user),
) -> RewriteReviewSessionResponse:
    doc = await session.get(Document, request.doc_id)
    if not doc or doc.owner != user.username:
        raise HTTPException(status_code=404, detail="Document not found")
    if request.start >= request.end:
        raise HTTPException(status_code=400, detail="Invalid range")
    if request.end > len(doc.content):
        raise HTTPException(status_code=400, detail="Range out of bounds")
    try:
        rr, chain = await create_session(
            session=session,
            llm=llm,
            doc=doc,
            start=request.start,
            end=request.end,
            style=request.style,
            enable_agent_chain=request.enable_agent_chain,
            chain_strictness=request.chain_strictness,
            chain_max_loops=request.chain_max_loops,
            user_intent=request.user_intent,
            audience=request.audience,
            constraints=request.constraints,
            glossary=request.glossary,
        )
        commits = await list_commits(session=session, session_id=rr.id)
        opcodes = _compute_opcodes(base_text=rr.base_content, target_text=rr.target_content)
        return RewriteReviewSessionResponse(
            session_id=rr.id,
            doc_id=rr.document_id,
            style=rr.style,
            status=rr.status,
            base_sha256=rr.base_sha256,
            target_sha256=rr.target_sha256,
            base_text=rr.base_content,
            target_text=rr.target_content,
            opcodes=opcodes,
            commits=[
                {
                    "id": c.id,
                    "created_at": c.created_at,
                    "opcode_ids": json.loads(c.opcode_ids_json),
                    "before_sha256": c.before_sha256,
                    "after_sha256": c.after_sha256,
                }
                for c in commits
            ],
            created_at=rr.created_at,
            updated_at=rr.updated_at,
            chain=chain,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/rewrite/review_sessions/{session_id}", response_model=RewriteReviewSessionResponse)
async def get_review_session(
    session_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> RewriteReviewSessionResponse:
    rr = await get_session(session=session, session_id=session_id)
    if not rr:
        raise HTTPException(status_code=404, detail="Session not found")
    doc = await session.get(Document, rr.document_id)
    if not doc or doc.owner != user.username:
        raise HTTPException(status_code=404, detail="Session not found")
    commits = await list_commits(session=session, session_id=rr.id)
    opcodes = _compute_opcodes(base_text=rr.base_content, target_text=rr.target_content)
    return RewriteReviewSessionResponse(
        session_id=rr.id,
        doc_id=rr.document_id,
        style=rr.style,
        status=rr.status,
        base_sha256=rr.base_sha256,
        target_sha256=rr.target_sha256,
        base_text=rr.base_content,
        target_text=rr.target_content,
        opcodes=opcodes,
        commits=[
            {
                "id": c.id,
                "created_at": c.created_at,
                "opcode_ids": json.loads(c.opcode_ids_json),
                "before_sha256": c.before_sha256,
                "after_sha256": c.after_sha256,
            }
            for c in commits
        ],
        created_at=rr.created_at,
        updated_at=rr.updated_at,
        chain=None,
    )


@router.post("/rewrite/review_sessions/{session_id}/apply", response_model=RewriteReviewSessionApplyResponse)
async def apply_review_session(
    session_id: int,
    request: RewriteReviewSessionApplyRequest,
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
    embeddings: Embeddings = Depends(get_embeddings),
    user: User = Depends(get_current_user),
) -> RewriteReviewSessionApplyResponse:
    rr = await get_session(session=session, session_id=session_id)
    if not rr:
        raise HTTPException(status_code=404, detail="Session not found")
    doc = await session.get(Document, rr.document_id)
    if not doc or doc.owner != user.username:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        _, chunks, _ = await apply_selected(
            session=session,
            settings=settings,
            embeddings=embeddings,
            doc=doc,
            rr=rr,
            opcode_ids=request.opcode_ids,
        )
        commits = await list_commits(session=session, session_id=rr.id)
        opcodes = _compute_opcodes(base_text=rr.base_content, target_text=rr.target_content)
        return RewriteReviewSessionApplyResponse(
            session_id=rr.id,
            doc_id=rr.document_id,
            status=rr.status,
            chunks=chunks,
            base_sha256=rr.base_sha256,
            opcodes=opcodes,
            commits=[
                {
                    "id": c.id,
                    "created_at": c.created_at,
                    "opcode_ids": json.loads(c.opcode_ids_json),
                    "before_sha256": c.before_sha256,
                    "after_sha256": c.after_sha256,
                }
                for c in commits
            ],
        )
    except ValueError as e:
        if str(e) == "session_closed":
            raise HTTPException(status_code=409, detail="Session is closed")
        if str(e) == "document_changed":
            raise HTTPException(status_code=409, detail="Document changed, please reload")
        if str(e) == "invalid_opcode_ids":
            raise HTTPException(status_code=400, detail="Invalid opcode ids")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rewrite/review_sessions/{session_id}/rollback", response_model=RewriteReviewSessionApplyResponse)
async def rollback_review_session(
    session_id: int,
    request: RewriteReviewSessionRollbackRequest,
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
    embeddings: Embeddings = Depends(get_embeddings),
    user: User = Depends(get_current_user),
) -> RewriteReviewSessionApplyResponse:
    rr = await get_session(session=session, session_id=session_id)
    if not rr:
        raise HTTPException(status_code=404, detail="Session not found")
    doc = await session.get(Document, rr.document_id)
    if not doc or doc.owner != user.username:
        raise HTTPException(status_code=404, detail="Session not found")
    commit = await session.get(RewriteReviewCommit, request.commit_id)
    if not commit:
        raise HTTPException(status_code=404, detail="Commit not found")
    try:
        _, chunks = await rollback_commit(
            session=session,
            settings=settings,
            embeddings=embeddings,
            doc=doc,
            rr=rr,
            commit=commit,
        )
        commits = await list_commits(session=session, session_id=rr.id)
        opcodes = _compute_opcodes(base_text=rr.base_content, target_text=rr.target_content)
        return RewriteReviewSessionApplyResponse(
            session_id=rr.id,
            doc_id=rr.document_id,
            status=rr.status,
            chunks=chunks,
            base_sha256=rr.base_sha256,
            opcodes=opcodes,
            commits=[
                {
                    "id": c.id,
                    "created_at": c.created_at,
                    "opcode_ids": json.loads(c.opcode_ids_json),
                    "before_sha256": c.before_sha256,
                    "after_sha256": c.after_sha256,
                }
                for c in commits
            ],
        )
    except ValueError as e:
        if str(e) == "document_changed":
            raise HTTPException(status_code=409, detail="Document changed, cannot rollback")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
