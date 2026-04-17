from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass
from typing import List, Dict, Tuple

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from langchain_core.embeddings import Embeddings

from app.infra.db.models import Chunk
from app.services.retrieval.types import SearchHit


@dataclass
class BM25Config:
    k1: float = 1.5
    b: float = 0.75


class BM25Backend:
    def __init__(self, config: BM25Config = BM25Config()):
        self._config = config
        self._doc_lengths: Dict[int, int] = {}
        self._avg_doc_length: float = 0.0
        self._term_freq: Dict[str, Dict[int, int]] = {}
        self._doc_count: int = 0

    async def _load_doc_stats(self, session: AsyncSession, owner: str, document_ids: List[int] | None = None):
        query = select(Chunk.chunk_id, func.length(Chunk.content)).where(Chunk.owner == owner)
        if document_ids:
            query = query.where(Chunk.doc_id.in_(document_ids))
        result = await session.execute(query)
        doc_lengths = result.all()
        
        self._doc_count = len(doc_lengths)
        if self._doc_count == 0:
            self._avg_doc_length = 0
            return
        
        total_length = sum(length for _, length in doc_lengths)
        self._avg_doc_length = total_length / self._doc_count
        self._doc_lengths = {chunk_id: length for chunk_id, length in doc_lengths}

        # 构建词频统计
        self._term_freq = {}
        for chunk_id, _ in doc_lengths:
            chunk_query = select(Chunk.content).where(Chunk.chunk_id == chunk_id)
            chunk_result = await session.execute(chunk_query)
            content = chunk_result.scalar()
            if content:
                terms = self._tokenize(content)
                term_counts = Counter(terms)
                for term, count in term_counts.items():
                    if term not in self._term_freq:
                        self._term_freq[term] = {}
                    self._term_freq[term][chunk_id] = count

    def _tokenize(self, text: str) -> List[str]:
        import re
        text = text.lower()
        terms = re.findall(r'\b\w+\b', text)
        return terms

    def _calculate_idf(self, term: str) -> float:
        if term not in self._term_freq:
            return 0.0
        doc_freq = len(self._term_freq[term])
        if doc_freq == 0:
            return 0.0
        return math.log((self._doc_count - doc_freq + 0.5) / (doc_freq + 0.5) + 1.0)

    def _calculate_bm25(self, query_terms: List[str], chunk_id: int, content: str) -> float:
        score = 0.0
        doc_length = self._doc_lengths.get(chunk_id, 0)
        terms = self._tokenize(content)
        term_counts = Counter(terms)
        
        for term in query_terms:
            idf = self._calculate_idf(term)
            if idf == 0:
                continue
            tf = term_counts.get(term, 0)
            numerator = tf * (self._config.k1 + 1)
            denominator = tf + self._config.k1 * (1 - self._config.b + self._config.b * doc_length / max(self._avg_doc_length, 1))
            score += idf * (numerator / denominator)
        
        return score

    async def query(
        self,
        *, 
        session: AsyncSession,
        embeddings: Embeddings,
        owner: str,
        query: str,
        top_k: int,
        document_ids: List[int] | None = None,
    ) -> List[SearchHit]:
        await self._load_doc_stats(session, owner, document_ids)
        
        if self._doc_count == 0:
            return []
        
        query_terms = self._tokenize(query)
        if not query_terms:
            return []
        
        # 构建查询，获取所有可能的chunk
        chunk_query = select(Chunk).where(Chunk.owner == owner)
        if document_ids:
            chunk_query = chunk_query.where(Chunk.doc_id.in_(document_ids))
        result = await session.execute(chunk_query)
        chunks = result.scalars().all()
        
        # 计算每个chunk的BM25分数
        hits = []
        for chunk in chunks:
            score = self._calculate_bm25(query_terms, chunk.chunk_id, chunk.content)
            if score > 0:
                hits.append(SearchHit(
                    chunk_id=chunk.chunk_id,
                    doc_id=chunk.doc_id,
                    chunk_index=chunk.chunk_index,
                    content=chunk.content,
                    score=score
                ))
        
        # 按分数排序并返回top_k
        hits.sort(key=lambda x: x.score, reverse=True)
        return hits[:top_k]
