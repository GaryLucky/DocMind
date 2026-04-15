import hashlib
import math
from dataclasses import dataclass

from langchain_core.embeddings import Embeddings


@dataclass(frozen=True)
class EmbeddingConfig:
    dim: int = 256


def _l2_normalize(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(x * x for x in vec))
    if norm == 0.0:
        return vec
    return [x / norm for x in vec]


class SimpleHashEmbeddings(Embeddings):
    def __init__(self, config: EmbeddingConfig) -> None:
        self._dim = config.dim

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self.embed_query(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        if self._dim <= 0:
            raise ValueError("Embedding dim must be > 0")
        digest = hashlib.sha256(text.encode("utf-8")).digest()
        vec = [0.0] * self._dim
        for i, b in enumerate(digest):
            vec[i % self._dim] += (b - 128) / 128.0
        return _l2_normalize(vec)

