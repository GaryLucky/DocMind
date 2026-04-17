import datetime as dt
import re
from urllib.parse import quote

from fastapi import APIRouter, Body, Depends, HTTPException, Response
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.infra.db.models import Document, User
from app.infra.db.session import get_db_session
from app.services.file_convert import md_to_docx_bytes, md_to_pdf_bytes, md_to_text, safe_filename


router = APIRouter()


def _build_download_response(*, data: bytes | str, media_type: str, filename: str) -> Response:
    safe = filename.encode("ascii", errors="ignore").decode("ascii") or "document"
    headers = {
        "Content-Disposition": f'attachment; filename="{safe}"; filename*=UTF-8\'\'{quote(filename)}'
    }
    return Response(content=data, media_type=media_type, headers=headers)


def _normalize_export_format(fmt: str) -> str:
    raw = (fmt or "").strip().lower()
    if not raw:
        return "md"

    candidates = [
        ("docx", "docx"),
        ("word", "docx"),
        ("wordprocessingml", "docx"),
        ("msword", "docx"),
        ("pdf", "pdf"),
        ("markdown", "md"),
        ("md", "md"),
        ("txt", "txt"),
        ("text", "txt"),
    ]

    for token, canonical in candidates:
        if re.search(rf"(?<![a-z0-9]){re.escape(token)}(?![a-z0-9])", raw):
            return canonical

    raise ValueError("unsupported_format")


def _export_doc_content(*, md: str, title: str, fmt: str) -> tuple[bytes | str, str, str]:
    f = _normalize_export_format(fmt)
    if f == "md":
        return (md + "\n"), "text/markdown; charset=utf-8", f"{safe_filename(title)}.md"
    if f == "txt":
        return md_to_text(md), "text/plain; charset=utf-8", f"{safe_filename(title)}.txt"
    if f == "docx":
        return (
            md_to_docx_bytes(md, title=title),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            f"{safe_filename(title)}.docx",
        )
    if f == "pdf":
        return (
            md_to_pdf_bytes(md, title=title),
            "application/pdf",
            f"{safe_filename(title)}.pdf",
        )
    raise ValueError("unsupported_format")


@router.get("/docs/{doc_id}/export")
async def export_doc(
    doc_id: int,
    format: str = "md",
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> Response:
    doc = await session.get(Document, doc_id)
    if not doc or doc.owner != user.username:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        data, media_type, filename = _export_doc_content(md=doc.content, title=doc.title, fmt=format)
        return _build_download_response(data=data, media_type=media_type, filename=filename)
    except ValueError:
        raise HTTPException(status_code=400, detail="Unsupported format: use md/txt/pdf/docx")
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/export/me")
async def export_me(
    format: str = "md",
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> Response:
    result = await session.execute(
        select(Document).where(Document.owner == user.username).order_by(desc(Document.created_at))
    )
    docs = list(result.scalars().all())

    ts = dt.datetime.now(dt.UTC).strftime("%Y-%m-%d %H:%M:%S UTC")
    title = f"{user.username}-export"
    parts: list[str] = [f"# 个人数据导出", "", f"- 用户：{user.username}", f"- 导出时间：{ts}", ""]
    for d in docs:
        parts.append(f"## {d.title}")
        parts.append("")
        parts.append(d.content.strip())
        parts.append("")

    md = "\n".join(parts).strip() + "\n"

    try:
        data, media_type, filename = _export_doc_content(md=md, title=title, fmt=format)
        return _build_download_response(data=data, media_type=media_type, filename=filename)
    except ValueError:
        raise HTTPException(status_code=400, detail="Unsupported format: use md/txt/pdf/docx")
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/export/result")
async def export_result(
    content: str = Body(..., media_type="text/plain"),
    title: str = "result",
    format: str = "md",
    user: User = Depends(get_current_user),
) -> Response:
    """
    导出结果内容
    """
    try:
        data, media_type, filename = _export_doc_content(md=content, title=title, fmt=format)
        return _build_download_response(data=data, media_type=media_type, filename=filename)
    except ValueError:
        raise HTTPException(status_code=400, detail="Unsupported format: use md/txt/pdf/docx")
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
