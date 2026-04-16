from fastapi import APIRouter, Depends, HTTPException
from app.api.deps import get_current_user
from app.infra.db.models import User
from app.schemas.llm_ops import CompareRequest, CompareResponse, MergeRequest, MergeResponse
from app.services.llm_ops import compare_documents, merge_documents

router = APIRouter()


@router.post("/compare", response_model=CompareResponse)
async def compare(
    request: CompareRequest,
    user: User = Depends(get_current_user),
):
    """
    文档比较：比较两个文档的相似性和差异
    """
    try:
        comparison = await compare_documents(
            text1=request.text1,
            text2=request.text2
        )
        return CompareResponse(**comparison)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/merge", response_model=MergeResponse)
async def merge(
    request: MergeRequest,
    user: User = Depends(get_current_user),
):
    """
    文档合并：合并多个文档，支持智能去重
    """
    try:
        merged = await merge_documents(
            texts=request.texts,
            smart_merge=request.smart_merge
        )
        return MergeResponse(result=merged)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
