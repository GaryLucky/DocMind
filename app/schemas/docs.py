import datetime as dt
from typing import Optional

from pydantic import BaseModel, Field


class DocIngestRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    content: str = Field(min_length=1)
    owner: str = Field(default="anonymous", min_length=1, max_length=128)
    chunk_size: Optional[int] = Field(default=None, ge=100, le=5000)
    chunk_overlap: Optional[int] = Field(default=None, ge=0, le=2000)


class DocIngestResponse(BaseModel):
    doc_id: int
    chunks: int


class DocSummary(BaseModel):
    id: int
    title: str
    owner: str
    created_at: dt.datetime
    content_length: int = Field(default=0)


class DocsListResponse(BaseModel):
    items: list[DocSummary]


class DocDetailResponse(BaseModel):
    id: int
    title: str
    owner: str
    created_at: dt.datetime
    content: str
