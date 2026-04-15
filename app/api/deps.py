from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from langchain_core.embeddings import Embeddings
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import Settings
from app.core.security import JWTError, decode_access_token
from app.infra.db.models import User
from app.infra.db.session import get_db_session
from app.infra.llm.openai_compatible import OpenAICompatibleLLM
from app.services.retrieval import MultiRetriever


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_llm(request: Request) -> OpenAICompatibleLLM:
    return request.app.state.llm


def get_embeddings(request: Request) -> Embeddings:
    return request.app.state.embeddings


def get_retriever(request: Request) -> MultiRetriever:
    return request.app.state.retriever


_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_current_user(
    token: str = Depends(_oauth2_scheme),
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_db_session),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="未登录或 token 无效",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(
            token=token, secret_key=settings.jwt_secret, algorithm=settings.jwt_algorithm
        )
    except JWTError as e:
        raise credentials_exception from e
    sub = payload.get("sub")
    if not sub:
        raise credentials_exception
    try:
        user_id = int(sub)
    except ValueError:
        raise credentials_exception
    user = await session.get(User, user_id)
    if user is None:
        raise credentials_exception
    return user
