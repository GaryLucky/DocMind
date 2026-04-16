from fastapi import APIRouter, Depends, HTTPException
from app.api.deps import get_current_user
from app.infra.db.models import User
from app.schemas.llm_ops import BatchRequest, BatchResponse
from app.services.llm_ops import batch_process

router = APIRouter()


@router.post("/batch", response_model=BatchResponse)
async def batch(
    request: BatchRequest,
    user: User = Depends(get_current_user),
):
    """
    批量处理：对多个文档执行多种操作
    """
    try:
        results = await batch_process(
            texts=request.texts,
            operations=request.operations,
            max_length=request.max_length,
            target_language=request.target_language,
            report=request.report
        )
        return BatchResponse(results=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
