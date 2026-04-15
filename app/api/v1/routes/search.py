from fastapi import APIRouter, Depends
from langchain_core.embeddings import Embeddings
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_embeddings, get_retriever
from app.infra.db.session import get_db_session
from app.infra.db.models import User
from app.schemas.context import RetrievedChunk
from app.schemas.search import SearchRequest, SearchResponse
from app.services.retrieval import MultiRetriever

router = APIRouter()

@router.post("/search", response_model=SearchResponse)
async def search(
    body: SearchRequest,
    session: AsyncSession = Depends(get_db_session),
    embeddings: Embeddings = Depends(get_embeddings),
    retriever: MultiRetriever = Depends(get_retriever),
    user: User = Depends(get_current_user),
) -> SearchResponse:
    hits = await retriever.search(
        session=session,
        embeddings=embeddings,
        query=body.query,
        top_k=body.top_k,
        document_ids=body.document_ids,
        owner=user.username,
    )
    return SearchResponse(
        results=[
            RetrievedChunk(
                chunk_id=h.chunk_id,
                doc_id=h.doc_id,
                chunk_index=h.chunk_index,
                content=h.content,
                score=h.score,
            )
            for h in hits
        ]
    )
