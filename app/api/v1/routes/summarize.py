import asyncio

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.api.deps import get_current_user, get_llm
from app.api.sse import sse_encode
from app.infra.llm.openai_compatible import OpenAICompatibleLLM
from app.infra.db.models import User
from app.schemas.llm_ops import SummarizeRequest, SummarizeResponse
from app.services.llm_ops import summarize_text

router = APIRouter()


@router.post("/summarize", response_model=SummarizeResponse)
async def summarize(
    request: SummarizeRequest,
    llm: OpenAICompatibleLLM = Depends(get_llm),
    user: User = Depends(get_current_user),
):
    """
    自动摘要生成：对输入文本生成摘要
    """
    try:
        summary = await summarize_text(llm, text=request.text, max_length=request.max_length)
        return SummarizeResponse(summary=summary)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/summarize/stream")
async def summarize_stream(
    request: SummarizeRequest,
    llm: OpenAICompatibleLLM = Depends(get_llm),
    user: User = Depends(get_current_user),
):
    async def gen():
        buf: list[str] = []
        try:
            system_prompt = f"你是一个专业的摘要助手。请为以下文本生成摘要，尽量控制在 {request.max_length} 字以内。"
            user_prompt = f"需要摘要的文本：\n{request.text}"
            yield sse_encode(event="start", data={"op": "summarize"})
            try:
                async for t in llm.chat_stream(system=system_prompt, user=user_prompt):
                    buf.append(t)
                    yield sse_encode(event="token", data={"text": t})
            except Exception:
                summary = await summarize_text(llm, text=request.text, max_length=request.max_length)
                buf = [summary]
                yield sse_encode(event="token", data={"text": summary})
            yield sse_encode(event="done", data={"summary": "".join(buf)})
        except asyncio.CancelledError:
            return
        except Exception as e:
            yield sse_encode(event="error", data={"message": str(e)})

    return StreamingResponse(gen(), media_type="text/event-stream")
