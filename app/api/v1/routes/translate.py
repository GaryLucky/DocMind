from fastapi import APIRouter, Depends, HTTPException
from app.api.deps import get_current_user
from app.infra.db.models import User
from app.schemas.llm_ops import TranslateRequest, TranslateResponse
from app.services.llm_ops import translate_text

router = APIRouter()


@router.post("/translate", response_model=TranslateResponse)
async def translate(
    request: TranslateRequest,
    user: User = Depends(get_current_user),
):
    """
    文档翻译：将文档翻译为目标语言
    """
    try:
        translation = await translate_text(
            text=request.text,
            target_language=request.target_language,
            source_language=request.source_language
        )
        return TranslateResponse(translation=translation)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
