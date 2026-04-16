from fastapi import APIRouter, Depends, HTTPException
from app.api.deps import get_current_user
from app.infra.db.models import User
from app.schemas.llm_ops import ConvertRequest, ConvertResponse
from app.services.llm_ops import convert_format

router = APIRouter()


@router.post("/convert", response_model=ConvertResponse)
async def convert(
    request: ConvertRequest,
    user: User = Depends(get_current_user),
):
    """
    格式转换：将文档从一种格式转换为另一种格式
    """
    try:
        result = await convert_format(
            text=request.text,
            input_format=request.input_format,
            output_format=request.output_format
        )
        return ConvertResponse(result=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
