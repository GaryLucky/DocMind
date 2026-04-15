import asyncio

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
import httpx

from app.api.deps import get_current_user, get_llm, get_settings
from app.api.sse import sse_encode
from app.core.settings import Settings
from app.infra.db.models import User
from app.infra.llm.openai_compatible import OpenAICompatibleLLM
from app.schemas.llm_ops import ChatRequest, ChatResponse
from app.services.llm_ops import chat_with_history

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    llm: OpenAICompatibleLLM = Depends(get_llm),
    settings: Settings = Depends(get_settings),
    user: User = Depends(get_current_user),
):
    """
    多轮对话接口
    """
    try:
        if (
            not settings.llm_api_key
            and settings.llm_base_url.rstrip("/") == "https://api.openai.com/v1"
        ):
            raise HTTPException(
                status_code=400,
                detail="未配置 LLM_API_KEY（或 OPENAI_API_KEY），无法调用默认 OpenAI 接口",
            )
        messages = [msg.model_dump() for msg in request.messages]
        reply = await chat_with_history(llm, messages=messages)
        return ChatResponse(reply=reply)
    except HTTPException:
        raise
    except httpx.HTTPStatusError as e:
        status = e.response.status_code
        detail = f"LLM 上游返回错误: {status}"
        raise HTTPException(status_code=502, detail=detail) from e
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail="LLM 上游不可达或网络错误") from e
    except Exception as e:
        raise HTTPException(status_code=500, detail="服务器内部错误") from e


@router.post("/chat/stream")
async def chat_stream(
    request: ChatRequest,
    llm: OpenAICompatibleLLM = Depends(get_llm),
    settings: Settings = Depends(get_settings),
    user: User = Depends(get_current_user),
):
    if (
        not settings.llm_api_key
        and settings.llm_base_url.rstrip("/") == "https://api.openai.com/v1"
    ):
        raise HTTPException(
            status_code=400,
            detail="未配置 LLM_API_KEY（或 OPENAI_API_KEY），无法调用默认 OpenAI 接口",
        )

    messages = [msg.model_dump() for msg in request.messages]
    has_system = any(m.get("role") == "system" for m in messages)
    final_messages: list[dict[str, str]] = []
    if not has_system:
        final_messages.append(
            {"role": "system", "content": "你是一个智能文档助手，负责回答用户的问题或进行对话。"}
        )
    final_messages.extend(messages)

    async def gen():
        buf: list[str] = []
        try:
            yield sse_encode(event="start", data={"op": "chat"})
            try:
                async for t in llm.chat_messages_stream(messages=final_messages):
                    buf.append(t)
                    yield sse_encode(event="token", data={"text": t})
            except Exception:
                reply = await chat_with_history(llm, messages=messages)
                buf = [reply]
                yield sse_encode(event="token", data={"text": reply})
            yield sse_encode(event="done", data={"reply": "".join(buf)})
        except asyncio.CancelledError:
            return
        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            yield sse_encode(event="error", data={"message": f"LLM 上游返回错误: {status}"})
        except httpx.RequestError:
            yield sse_encode(event="error", data={"message": "LLM 上游不可达或网络错误"})
        except Exception:
            yield sse_encode(event="error", data={"message": "服务器内部错误"})

    return StreamingResponse(gen(), media_type="text/event-stream")
