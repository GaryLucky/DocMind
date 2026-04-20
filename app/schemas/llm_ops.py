from typing import Any, Optional

from pydantic import BaseModel, Field
import datetime as dt


class SummarizeRequest(BaseModel):
    text: str = Field(..., description="需要总结的文本")
    max_length: int = Field(200, description="摘要最大长度")


class SummarizeResponse(BaseModel):
    summary: str


class RewriteRequest(BaseModel):
    text: str = Field(..., description="需要重写的文本")
    style: str = Field("professional", description="重写风格，如 professional, casual, concise")
    enable_agent_chain: bool = Field(False, description="是否开启反思范式四节点改写链")
    chain_strictness: int = Field(1, ge=0, le=2, description="质量门控严格度：0宽松/1标准/2严格")
    chain_max_loops: int = Field(2, ge=0, le=5, description="质量不通过时最大回环次数")
    user_intent: Optional[str] = Field(None, description="用户改写意图（可选）")
    audience: Optional[str] = Field(None, description="读者画像（可选）")
    constraints: Optional[list[str]] = Field(None, description="硬约束列表（可选）")
    glossary: Optional[dict[str, str]] = Field(None, description="术语表 term->preferred（可选）")


class RewriteChainMeta(BaseModel):
    enabled: bool
    strictness: int
    max_loops: int
    loops: int
    quality_passed: bool
    overall_score: float
    steps: list[dict[str, Any]]
    requirements_doc: dict[str, Any]
    qa_reports: list[dict[str, Any]]
    final_notes: str


class RewriteResponse(BaseModel):
    result: str
    chain: Optional[RewriteChainMeta] = None


class RewriteReviewRequest(BaseModel):
    doc_id: int = Field(..., description="文档 ID")
    start: int = Field(..., ge=0, description="片段起始偏移（包含）")
    end: int = Field(..., ge=0, description="片段结束偏移（不包含）")
    style: str = Field("professional", description="重写风格，如 professional, casual, concise")
    enable_agent_chain: bool = Field(False, description="是否开启反思范式四节点改写链")
    chain_strictness: int = Field(1, ge=0, le=2, description="质量门控严格度：0宽松/1标准/2严格")
    chain_max_loops: int = Field(2, ge=0, le=5, description="质量不通过时最大回环次数")
    user_intent: Optional[str] = Field(None, description="用户改写意图（可选）")
    audience: Optional[str] = Field(None, description="读者画像（可选）")
    constraints: Optional[list[str]] = Field(None, description="硬约束列表（可选）")
    glossary: Optional[dict[str, str]] = Field(None, description="术语表 term->preferred（可选）")


class RewriteReviewResponse(BaseModel):
    review_id: int
    doc_id: int
    start: int
    end: int
    style: str
    status: str
    original: str
    proposed: str
    diff: str
    created_at: dt.datetime
    chain: Optional[RewriteChainMeta] = None


class RewriteReviewApplyResponse(BaseModel):
    review_id: int
    doc_id: int
    status: str
    chunks: int
    content: str


class RewriteReviewSessionCreateRequest(BaseModel):
    doc_id: int = Field(..., description="文档 ID")
    start: int = Field(..., ge=0, description="片段起始偏移（包含）")
    end: int = Field(..., ge=0, description="片段结束偏移（不包含）")
    style: str = Field("professional", description="重写风格，如 professional, casual, concise")
    enable_agent_chain: bool = Field(False, description="是否开启反思范式四节点改写链")
    chain_strictness: int = Field(1, ge=0, le=2, description="质量门控严格度：0宽松/1标准/2严格")
    chain_max_loops: int = Field(2, ge=0, le=5, description="质量不通过时最大回环次数")
    user_intent: Optional[str] = Field(None, description="用户改写意图（可选）")
    audience: Optional[str] = Field(None, description="读者画像（可选）")
    constraints: Optional[list[str]] = Field(None, description="硬约束列表（可选）")
    glossary: Optional[dict[str, str]] = Field(None, description="术语表 term->preferred（可选）")


class RewriteReviewOpcode(BaseModel):
    id: int
    tag: str
    i1: int
    i2: int
    j1: int
    j2: int


class RewriteReviewCommitItem(BaseModel):
    id: int
    created_at: dt.datetime
    opcode_ids: list[int]
    before_sha256: str
    after_sha256: str


class RewriteReviewSessionResponse(BaseModel):
    session_id: int
    doc_id: int
    style: str
    status: str
    base_sha256: str
    target_sha256: str
    base_text: str
    target_text: str
    opcodes: list[RewriteReviewOpcode]
    commits: list[RewriteReviewCommitItem]
    created_at: dt.datetime
    updated_at: dt.datetime
    chain: Optional[RewriteChainMeta] = None


class RewriteReviewSessionApplyRequest(BaseModel):
    opcode_ids: list[int] = Field(..., description="要提交的改动组 id 列表；空列表表示不提交")


class RewriteReviewSessionApplyResponse(BaseModel):
    session_id: int
    doc_id: int
    status: str
    chunks: int
    base_sha256: str
    opcodes: list[RewriteReviewOpcode]
    commits: list[RewriteReviewCommitItem]


class RewriteReviewSessionRollbackRequest(BaseModel):
    commit_id: int


class ChatMessage(BaseModel):
    role: str = Field(..., description="角色：user, assistant, system")
    content: str = Field(..., description="消息内容")


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., description="对话历史")


class ChatResponse(BaseModel):
    reply: str


class ChatHistoryItem(BaseModel):
    id: int
    user_text: str
    assistant_text: str
    created_at: dt.datetime


class ChatHistoryResponse(BaseModel):
    items: list[ChatHistoryItem]


class TranslateRequest(BaseModel):
    text: str = Field(..., description="需要翻译的文本")
    target_language: str = Field(..., description="目标语言")
    source_language: Optional[str] = Field(None, description="源语言")


class TranslateResponse(BaseModel):
    translation: str


class AnalyzeRequest(BaseModel):
    text: str = Field(..., description="需要分析的文本")


class AnalyzeResponse(BaseModel):
    readability: dict[str, Any]
    statistics: dict[str, Any]
    keywords: list[str]


class ConvertRequest(BaseModel):
    text: str = Field(..., description="需要转换的文本")
    input_format: str = Field(..., description="输入格式")
    output_format: str = Field(..., description="输出格式")


class ConvertResponse(BaseModel):
    result: str


class CompareRequest(BaseModel):
    text1: str = Field(..., description="第一个文档文本")
    text2: str = Field(..., description="第二个文档文本")


class CompareResponse(BaseModel):
    similarity: float
    statistics: dict[str, Any]
    differences: list[str]


class MergeRequest(BaseModel):
    texts: list[str] = Field(..., description="需要合并的文本列表")
    smart_merge: bool = Field(False, description="是否智能去重")


class MergeResponse(BaseModel):
    result: str


class BatchRequest(BaseModel):
    texts: list[str] = Field(..., description="需要处理的文本列表")
    operations: list[str] = Field(..., description="要执行的操作列表，如 summarize, analyze, translate")
    max_length: int = Field(200, description="摘要最大长度")
    target_language: str = Field("en", description="翻译目标语言")
    report: bool = Field(False, description="是否生成报告")


class BatchResponse(BaseModel):
    results: list[dict[str, Any]]
