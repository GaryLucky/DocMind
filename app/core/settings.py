import os
from dataclasses import dataclass, field


def _getenv_str(name: str, default: str) -> str:
    value = os.getenv(name)
    return value if value is not None and value != "" else default


def _getenv_str_any(names: list[str], default: str) -> str:
    for name in names:
        value = os.getenv(name)
        if value is not None and value != "":
            return value
    return default


def _getenv_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    return int(value)


def _getenv_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    v = value.strip().lower()
    if v in {"1", "true", "yes", "y", "on"}:
        return True
    if v in {"0", "false", "no", "n", "off"}:
        return False
    return default


def _getenv_csv(name: str, default: list[str]) -> list[str]:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    return [x.strip() for x in value.split(",") if x.strip()]


@dataclass(frozen=True)
class Settings:
    db_url: str = field(default_factory=lambda: _getenv_str("DB_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/docmind"))

    llm_api_key: str = field(default_factory=lambda: _getenv_str_any(["LLM_API_KEY", "OPENAI_API_KEY"], ""))
    llm_base_url: str = field(default_factory=lambda: _getenv_str("LLM_BASE_URL", "https://api.openai.com/v1"))
    llm_model: str = field(default_factory=lambda: _getenv_str("LLM_MODEL", "gpt-4o-mini"))
    llm_timeout_s: int = field(default_factory=lambda: _getenv_int("LLM_TIMEOUT_S", 60))

    jwt_secret: str = field(default_factory=lambda: _getenv_str("JWT_SECRET", "dev-secret-change-me"))
    jwt_algorithm: str = field(default_factory=lambda: _getenv_str("JWT_ALGORITHM", "HS256"))
    access_token_exp_minutes: int = field(default_factory=lambda: _getenv_int("ACCESS_TOKEN_EXP_MINUTES", 60 * 24 * 7))

    embed_api_url: str = field(default_factory=lambda: _getenv_str("EMBED_API_URL", "http://10.61.5.7:11448/v1/embeddings"))
    embed_model: str = field(default_factory=lambda: _getenv_str("EMBED_MODEL", "text-embedding-3-small"))
    embed_key: str = field(default_factory=lambda: _getenv_str("EMBED_KEY", ""))
    embed_dim: int = field(default_factory=lambda: _getenv_int("EMBED_DIM", 256))
    chunk_size: int = field(default_factory=lambda: _getenv_int("CHUNK_SIZE", 1000))
    chunk_overlap: int = field(default_factory=lambda: _getenv_int("CHUNK_OVERLAP", 200))
    search_top_k: int = field(default_factory=lambda: _getenv_int("SEARCH_TOP_K", 5))

    vector_backends: list[str] = field(default_factory=lambda: _getenv_csv("VECTOR_BACKENDS", ["pgvector"]))

    rerank_enabled: bool = field(default_factory=lambda: _getenv_bool("RERANK_ENABLED", False))
    rerank_model: str = field(default_factory=lambda: _getenv_str("RERANK_MODEL", ""))
    rerank_top_n: int = field(default_factory=lambda: _getenv_int("RERANK_TOP_N", 30))
    rerank_url: str = field(default_factory=lambda: _getenv_str("RERANK_URL", ""))
    rerank_api_key: str = field(default_factory=lambda: _getenv_str("RERANK_API_KEY", ""))
    rerank_timeout_s: int = field(default_factory=lambda: _getenv_int("RERANK_TIMEOUT_S", 10))
