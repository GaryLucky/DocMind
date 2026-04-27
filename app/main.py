from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.remote_env import load_remote_env_if_configured
from app.core.settings import Settings

load_dotenv(dotenv_path=Path(__file__).parent / ".env", override=False)
load_remote_env_if_configured()
settings = Settings()

from app.api.router import router as api_router
from app.infra.db.sqlalchemy import Base
from app.infra.db import models as _db_models
from app.infra.embeddings.openai_compatible import OpenAICompatibleEmbeddingsConfig, OpenAICompatibleEmbeddings
from app.infra.llm.openai_compatible import LLMConfig, OpenAICompatibleLLM
from app.services.retrieval import MultiRetriever

app = FastAPI()


@app.on_event("startup")
async def _startup() -> None:
    app.state.settings = settings
    engine = create_async_engine(settings.db_url)
    async with engine.begin() as conn:
        if settings.db_url.startswith("postgresql"):
            try:
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            except Exception:
                pass
        await conn.run_sync(Base.metadata.create_all)
        if settings.db_url.startswith("postgresql") and os.getenv("PGVECTOR_CREATE_INDEX", "0").strip() in {"1", "true", "yes", "y", "on"}:
            method = os.getenv("PGVECTOR_INDEX_METHOD", "hnsw").strip().lower()
            if method == "hnsw":
                try:
                    await conn.execute(
                        text(
                            "CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx "
                            "ON chunks USING hnsw (embedding vector_cosine_ops)"
                        )
                    )
                except Exception:
                    pass
        if settings.db_url.startswith("postgresql") and os.getenv("PG_FTS_CREATE_INDEX", "1").strip() in {"1", "true", "yes", "y", "on"}:
            try:
                await conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS chunks_content_tsv_idx "
                        "ON chunks USING gin (to_tsvector('simple', content))"
                    )
                )
            except Exception:
                pass
        if settings.db_url.startswith("postgresql") and os.getenv("PG_TRGM_CREATE_INDEX", "1").strip() in {"1", "true", "yes", "y", "on"}:
            try:
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
            except Exception:
                pass
            try:
                await conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS chunks_content_trgm_idx "
                        "ON chunks USING gin (content gin_trgm_ops)"
                    )
                )
            except Exception:
                pass
    app.state.engine = engine
    app.state.session_factory = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False
    )
    app.state.embeddings = OpenAICompatibleEmbeddings(
        config=OpenAICompatibleEmbeddingsConfig(
            model = settings.embed_model,
            base_url=settings.embed_api_url,
            api_key=settings.embed_key,
            timeout_s=60
        )
    )
    app.state.llm = OpenAICompatibleLLM(
        config=LLMConfig(
            api_key=settings.llm_api_key,
            base_url=settings.llm_base_url,
            model=settings.llm_model,
            timeout_s=settings.llm_timeout_s,
        )
    )
    app.state.retriever = MultiRetriever(settings=settings)


@app.on_event("shutdown")
async def _shutdown() -> None:
    embeddings = getattr(app.state, "embeddings", None)
    if embeddings is not None:
        close = getattr(embeddings, "aclose", None)
        if callable(close):
            await close()
    llm = getattr(app.state, "llm", None)
    if llm is not None:
        await llm.aclose()
    engine = getattr(app.state, "engine", None)
    if engine is not None:
        await engine.dispose()


app.include_router(api_router)

dist_dir = Path(__file__).parent / "frontend" / "dist"
dist_assets_dir = dist_dir / "assets"
if dist_assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=dist_assets_dir), name="assets")

doc_agent_dir = Path("/Users/gary/Documents/AI-Orchestration-System/ai-agent-station/docs/dev-ops/nginx/html")
if doc_agent_dir.exists():
    app.mount("/doc-agent-site", StaticFiles(directory=doc_agent_dir, html=True), name="doc-agent-site")


def _spa_index_path() -> Path | None:
    if dist_dir.exists() and (dist_dir / "index.html").exists():
        return dist_dir / "index.html"
    static_index = Path(__file__).parent / "static" / "index.html"
    if static_index.exists():
        return static_index
    return None


@app.get("/", include_in_schema=False)
async def root():
    index_path = _spa_index_path()
    if index_path is not None and index_path.is_file():
        return FileResponse(index_path)
    return RedirectResponse(url="/docs")


@app.get("/hello/{name}")
async def say_hello(name: str):
    return {"message": f"Hello {name}"}


@app.get("/{full_path:path}", include_in_schema=False)
async def spa_fallback(full_path: str):
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not Found")
    index_path = _spa_index_path()
    if index_path is not None and index_path.is_file():
        return FileResponse(index_path)
    raise HTTPException(status_code=404, detail="Not Found")
