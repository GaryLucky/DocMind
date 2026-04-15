from typing import Optional
from pydantic import BaseModel, Field

from app.schemas.context import RetrievedChunk


class QARequest(BaseModel):
    question: str = Field(..., description="用户的问题")
    doc_id: Optional[int] = Field(None, description="限定在某个文档内问答")


class QAResponse(BaseModel):
    answer: str
    citations: list[RetrievedChunk]

