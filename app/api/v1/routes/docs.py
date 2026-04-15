import os

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from langchain_core.embeddings import Embeddings
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_embeddings, get_settings
from app.core.settings import Settings
from app.infra.db.session import get_db_session
from app.infra.db.models import Document, User
from app.schemas.docs import (
    DocDetailResponse,
    DocIngestRequest,
    DocIngestResponse,
    DocsListResponse,
    DocSummary,
)
from app.services.documents import ingest_document
from app.services.file_convert import convert_upload_to_markdown, _guess_title

router = APIRouter()


@router.get("/docs", response_model=DocsListResponse)
async def list_docs(
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> DocsListResponse:
    result = await session.execute(
        select(Document)
        .where(Document.owner == user.username)
        .order_by(desc(Document.created_at))
        .limit(100)
    )
    docs = list(result.scalars().all())
    return DocsListResponse(
        items=[
            DocSummary(
                id=d.id,
                title=d.title,
                owner=d.owner,
                created_at=d.created_at,
            )
            for d in docs
        ]
    )


@router.get("/docs/{doc_id}", response_model=DocDetailResponse)
async def get_doc(
    doc_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> DocDetailResponse:
    doc = await session.get(Document, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.owner != user.username:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocDetailResponse(
        id=doc.id,
        title=doc.title,
        owner=doc.owner,
        created_at=doc.created_at,
        content=doc.content,
    )

@router.post("/docs", response_model=DocIngestResponse)
async def create_doc(
    body: DocIngestRequest,
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
    embeddings: Embeddings = Depends(get_embeddings),
    user: User = Depends(get_current_user),
) -> DocIngestResponse:
    doc_id, chunks = await ingest_document(
        session=session,
        settings=settings,
        embeddings=embeddings,
        title=body.title,
        owner=user.username,
        content=body.content,
    )
    return DocIngestResponse(doc_id=doc_id, chunks=chunks)


@router.post("/docs/upload", response_model=DocIngestResponse)
async def upload_doc(
    file: UploadFile = File(...),
    title: str | None = Form(None),
    session: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
    embeddings: Embeddings = Depends(get_embeddings),
    user: User = Depends(get_current_user),
) -> DocIngestResponse:
    name = file.filename or "document.md"
    raw = await file.read()
    doc_title = _guess_title(filename=name, form_title=title)
    try:
        content, _src = convert_upload_to_markdown(filename=name, raw=raw)
    except ValueError as e:
        if str(e) == "unsupported_doc":
            raise HTTPException(status_code=400, detail="暂不支持 .doc，请转换为 .docx 再上传")
        raise HTTPException(
            status_code=400,
            detail="仅支持上传 .md/.markdown/.txt/.pdf/.docx 文件",
        )
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    doc_id, chunks = await ingest_document(
        session=session,
        settings=settings,
        embeddings=embeddings,
        title=doc_title,
        owner=user.username,
        content=content,
    )
    return DocIngestResponse(doc_id=doc_id, chunks=chunks)
