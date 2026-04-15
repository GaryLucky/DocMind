from __future__ import annotations
from typing import TypedDict

from langchain_core.embeddings import Embeddings
from sqlalchemy.ext.asyncio import AsyncSession

from app.infra.llm.openai_compatible import OpenAICompatibleLLM
from app.services.retrieval import MultiRetriever


class QAState(TypedDict, total=False):
    question: str
    document_ids: list[int] | None
    top_k: int
    contexts: list[dict]
    answer: str
    owner_username: str


async def answer_question(
    *,
    session: AsyncSession,
    embeddings: Embeddings,
    retriever: MultiRetriever,
    llm: OpenAICompatibleLLM,
    question: str,
    top_k: int,
    document_ids: list[int] | None,
    owner_username: str,
) -> tuple[str, list[dict]]:
    hits = await retriever.search(
        session=session,
        embeddings=embeddings,
        owner=owner_username,
        query=question,
        top_k=top_k,
        document_ids=document_ids,
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
    context_text = "\n\n".join(
        f"[doc:{c['doc_id']} chunk:{c['chunk_index']}] {c['content']}" for c in contexts
    )
    system = "你是智能文档助手。仅基于提供的上下文回答问题；如果上下文不足以回答，就直接说不知道。"
    user = f"问题：{question}\n\n上下文：\n{context_text}"
    answer = await llm.chat(system=system, user=user)
    return answer, contexts
