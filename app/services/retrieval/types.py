from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SearchHit:
    chunk_id: int
    doc_id: int
    chunk_index: int
    content: str
    score: float
    source: str

