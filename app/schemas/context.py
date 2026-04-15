from pydantic import BaseModel


class RetrievedChunk(BaseModel):
    doc_id: int
    chunk_id: int
    chunk_index: int
    content: str
    score: float

