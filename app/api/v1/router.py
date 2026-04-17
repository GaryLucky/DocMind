from fastapi import APIRouter

from app.api.v1.routes.auth import router as auth_router
from app.api.v1.routes.batch import router as batch_router
from app.api.v1.routes.chat import router as chat_router
from app.api.v1.routes.convert import router as convert_router
from app.api.v1.routes.docs import router as docs_router
from app.api.v1.routes.doc_ops import router as doc_ops_router
from app.api.v1.routes.export import router as export_router
from app.api.v1.routes.health import router as health_router
from app.api.v1.routes.qa import router as qa_router
from app.api.v1.routes.rewrite import router as rewrite_router
from app.api.v1.routes.search import router as search_router
from app.api.v1.routes.summarize import router as summarize_router
from app.api.v1.routes.analyze import router as analyze_router
from app.api.v1.routes.translate import router as translate_router
from app.api.v1.routes.tools_proxy import router as tools_proxy_router

router = APIRouter()
router.include_router(health_router)
router.include_router(auth_router, prefix="/api")
router.include_router(docs_router, prefix="/api")
router.include_router(export_router, prefix="/api")
router.include_router(search_router, prefix="/api")
router.include_router(qa_router, prefix="/api")
router.include_router(summarize_router, prefix="/api")
router.include_router(rewrite_router, prefix="/api")
router.include_router(chat_router, prefix="/api")
router.include_router(translate_router, prefix="/api")
router.include_router(analyze_router, prefix="/api")
router.include_router(convert_router, prefix="/api")
router.include_router(doc_ops_router, prefix="/api")
router.include_router(batch_router, prefix="/api")
router.include_router(tools_proxy_router, prefix="/api")
