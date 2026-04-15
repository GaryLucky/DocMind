from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.router import router as api_router
from app.core.settings import Settings
from app.infra.db.sqlalchemy import Base
from app.infra.db import models as _db_models
from app.infra.embeddings.simple_hash import EmbeddingConfig, SimpleHashEmbeddings
from app.infra.llm.openai_compatible import LLMConfig, OpenAICompatibleLLM
from app.services.retrieval import MultiRetriever

app = FastAPI()

load_dotenv(dotenv_path=Path(__file__).parent / ".env", override=False)
settings = Settings()


@app.on_event("startup")
async def _startup() -> None:
    app.state.settings = settings
    engine = create_async_engine(settings.db_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    app.state.engine = engine
    app.state.session_factory = async_sessionmaker(
        bind=engine, class_=AsyncSession, expire_on_commit=False
    )
    app.state.embeddings = SimpleHashEmbeddings(
        config=EmbeddingConfig(dim=settings.embed_dim)
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
