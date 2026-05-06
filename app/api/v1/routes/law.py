import asyncio

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
import httpx

from app.api.deps import get_current_user, get_law_llm, get_settings
from app.api.sse import sse_encode
from app.core.settings import Settings
from app.infra.db.models import User
from app.infra.llm.openai_compatible import OpenAICompatibleLLM
from app.schemas.llm_ops import ChatRequest, ChatResponse
from app.services.llm_ops import chat_with_history

router = APIRouter()


_LAW_SYSTEM_PROMPT = (
    "你是一个专业的法律助手，精通法律法规与司法解释。"
    "你需要基于用户提供的信息进行分析，给出清晰的结论与风险提示。"
    "若信息不足，请先提出需要补充的关键事实。"
)


def _effective_law_llm_configured(settings: Settings) -> bool:
    base_url = (settings.law_llm_base_url or settings.llm_base_url).rstrip("/")
    api_key = (settings.law_llm_api_key or settings.llm_api_key or "").strip()
    if api_key:
        return True
    return base_url != "https://api.openai.com/v1"


@router.post("/law/chat", response_model=ChatResponse)
async def law_chat(
    request: ChatRequest,
    llm: OpenAICompatibleLLM = Depends(get_law_llm),
    settings: Settings = Depends(get_settings),
    user: User = Depends(get_current_user),
) -> ChatResponse:
    try:
        if not _effective_law_llm_configured(settings):
            raise HTTPException(
                status_code=400,
                detail="未配置 LAW_LLM_API_KEY/LAW_LLM_BASE_URL（且默认 OpenAI 未配置 key），无法调用律法模型",
            )
        messages = [msg.model_dump() for msg in request.messages]
        has_system = any(m.get("role") == "system" for m in messages)
        final_messages: list[dict[str, str]] = []
        if not has_system:
            final_messages.append({"role": "system", "content": _LAW_SYSTEM_PROMPT})
        final_messages.extend(messages)
        reply = await chat_with_history(llm, messages=final_messages)
        return ChatResponse(reply=reply)
    except HTTPException:
        raise
    except httpx.HTTPStatusError as e:
        status = e.response.status_code
        raise HTTPException(status_code=502, detail=f"LLM 上游返回错误: {status}") from e
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail="LLM 上游不可达或网络错误") from e
    except Exception as e:
        raise HTTPException(status_code=500, detail="服务器内部错误") from e


@router.post("/law/chat/stream")
async def law_chat_stream(
    request: ChatRequest,
    llm: OpenAICompatibleLLM = Depends(get_law_llm),
    settings: Settings = Depends(get_settings),
    user: User = Depends(get_current_user),
):
    if not _effective_law_llm_configured(settings):
        raise HTTPException(
            status_code=400,
            detail="未配置 LAW_LLM_API_KEY/LAW_LLM_BASE_URL（且默认 OpenAI 未配置 key），无法调用律法模型",
        )

    messages = [msg.model_dump() for msg in request.messages]
    has_system = any(m.get("role") == "system" for m in messages)
    final_messages: list[dict[str, str]] = []
    if not has_system:
        final_messages.append({"role": "system", "content": _LAW_SYSTEM_PROMPT})
    final_messages.extend(messages)

    async def gen():
        buf: list[str] = []
        try:
            yield sse_encode(event="start", data={"op": "law_chat"})
            try:
                async for t in llm.chat_messages_stream(messages=final_messages):
                    buf.append(t)
                    yield sse_encode(event="token", data={"text": t})
            except Exception:
                reply = await chat_with_history(llm, messages=final_messages)
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

