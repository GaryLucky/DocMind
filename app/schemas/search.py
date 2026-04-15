from typing import Optional
from pydantic import BaseModel, Field

from app.schemas.context import RetrievedChunk


class SearchRequest(BaseModel):
    query: str = Field(min_length=1)
    top_k: int = Field(default=5, ge=1, le=50)
    document_ids: Optional[list[int]] = None


class SearchResponse(BaseModel):
    results: list[RetrievedChunk]

