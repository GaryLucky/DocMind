import asyncio

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from langchain_core.embeddings import Embeddings

from app.api.deps import get_current_user, get_llm, get_embeddings, get_retriever
from app.api.sse import sse_encode
from app.infra.db.session import get_db_session
from app.infra.db.models import User
from app.infra.llm.openai_compatible import OpenAICompatibleLLM
from app.schemas.qa import QARequest, QAResponse
from app.services.retrieval import MultiRetriever
from app.services.rag import answer_question

router = APIRouter()


@router.post("/qa", response_model=QAResponse)
async def qa(
    request: QARequest,
    session: AsyncSession = Depends(get_db_session),
    llm: OpenAICompatibleLLM = Depends(get_llm),
    embeddings: Embeddings = Depends(get_embeddings),
    retriever: MultiRetriever = Depends(get_retriever),
    user: User = Depends(get_current_user),
):
    """
    问答与知识问答：结合文档上下文通过 LLM 生成回答
    """
    try:
        answer, citations = await answer_question(
            session=session,
            llm=llm,
            embeddings=embeddings,
            retriever=retriever,
            question=request.question,
            document_ids=[request.doc_id] if request.doc_id else None,
            top_k=5,
            owner_username=user.username,
        )
        return QAResponse(answer=answer, citations=citations)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/qa/stream")
async def qa_stream(
    request: QARequest,
    session: AsyncSession = Depends(get_db_session),
    llm: OpenAICompatibleLLM = Depends(get_llm),
    embeddings: Embeddings = Depends(get_embeddings),
    retriever: MultiRetriever = Depends(get_retriever),
    user: User = Depends(get_current_user),
):
    async def gen():
        buf: list[str] = []
        try:
            yield sse_encode(event="start", data={"op": "qa"})
            yield sse_encode(event="progress", data={"stage": "retrieve", "status": "start"})
            hits = await retriever.search(
                session=session,
                embeddings=embeddings,
                owner=user.username,
                query=request.question,
                top_k=5,
                document_ids=[request.doc_id] if request.doc_id else None,
            )
            contexts = [
                {
                    "chunk_id": h.chunk_id,
                    "doc_id": h.doc_id,
                    "chunk_index": h.chunk_index,
                    "content": h.content,
                    "score": h.score,
                }
                for h in hits
            ]
            yield sse_encode(
                event="progress",
                data={"stage": "retrieve", "status": "done", "count": len(contexts)},
            )
            yield sse_encode(event="citations", data={"citations": contexts})

            context_text = "\n\n".join(
                f"[doc:{c['doc_id']} chunk:{c['chunk_index']}] {c['content']}" for c in contexts
            )
            system = "你是智能文档助手。仅基于提供的上下文回答问题；如果上下文不足以回答，就直接说不知道。"
            user_prompt = f"问题：{request.question}\n\n上下文：\n{context_text}"

            yield sse_encode(event="progress", data={"stage": "generate", "status": "start"})
            try:
                async for t in llm.chat_stream(system=system, user=user_prompt):
                    buf.append(t)
                    yield sse_encode(event="token", data={"text": t})
            except Exception:
                answer, _ = await answer_question(
                    session=session,
                    llm=llm,
                    embeddings=embeddings,
                    retriever=retriever,
                    question=request.question,
                    document_ids=[request.doc_id] if request.doc_id else None,
                    top_k=5,
                    owner_username=user.username,
                )
                buf = [answer]
                yield sse_encode(event="token", data={"text": answer})

            yield sse_encode(
                event="done",
                data={"answer": "".join(buf), "citations": contexts},
            )
        except asyncio.CancelledError:
            return
        except Exception as e:
            yield sse_encode(event="error", data={"message": str(e)})

    return StreamingResponse(gen(), media_type="text/event-stream")
