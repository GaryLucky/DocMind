from fastapi import APIRouter, Depends, HTTPException
from app.api.deps import get_current_user
from app.infra.db.models import User
from app.schemas.llm_ops import AnalyzeRequest, AnalyzeResponse
from app.services.llm_ops import analyze_document

router = APIRouter()


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    request: AnalyzeRequest,
    user: User = Depends(get_current_user),
):
    """
    文档质量分析：分析文档的可读性、关键词等
    """
    try:
        analysis = await analyze_document(text=request.text)
        return AnalyzeResponse(**analysis)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
