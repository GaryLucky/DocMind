# 项目技术栈概览

## 1. 技术栈说明
本项目是一个“智能文档助手”应用，采用前后端分离架构，后端提供文档管理、检索、RAG 问答、改写审查与导出等能力，前端负责交互与流式回显。

### 1.1 后端（Python / FastAPI）
- Web 框架：FastAPI（异步 API）
- ASGI 服务：uvicorn
- HTTP 客户端：httpx（用于 OpenAI-compatible LLM 调用与流式）
- 配置：python-dotenv / pydantic-settings
- 鉴权：OAuth2 + JWT（python-jose），密码哈希（passlib[bcrypt]）
- ORM / 数据库：SQLAlchemy Async + SQLite（aiosqlite）
- 文档处理：pypdf（PDF 解析）、python-docx（DOCX 解析与生成）、reportlab（PDF 导出）
- Agent/工作流：langchain-core、langgraph（用于工作流编排/扩展）

### 1.2 检索与向量索引
- 向量表示：Embeddings（当前默认是本地实现的 SimpleHashEmbeddings）
- 多路检索：MultiRetriever（可并发使用多种后端并合并结果）
- 向量索引后端：
  - SQLite（chunks.embedding_json 存向量，应用层相似度计算）
  - FAISS（faiss-cpu，本地磁盘索引）
  - Milvus（pymilvus，分布式向量数据库，可选）
  - Pinecone（托管向量数据库，可选）
- 重排序（可选）：sentence-transformers CrossEncoder（rerank）

### 1.3 前端（React / TypeScript）
- 框架：React 18 + TypeScript
- 构建工具：Vite
- 路由：react-router-dom
- 状态管理：zustand
- Markdown 渲染：react-markdown + remark-gfm
- UI 样式：Tailwind CSS（配合 clsx / tailwind-merge）
- 图标：lucide-react
- 校验/测试：tsc --noEmit、vitest

### 1.4 流式交互（SSE）
- 协议：Server-Sent Events（text/event-stream）
- 后端：FastAPI StreamingResponse 统一发送 start/progress/token/done/error 事件
- 前端：fetch + ReadableStream + TextDecoder 解析 SSE，实时追加渲染 token；改写链路额外展示节点进度

---

## 2. Mermaid 架构图（技术栈视角）
```mermaid
flowchart TB
  classDef box fill:#fff,stroke:#333,stroke-width:1px
  classDef group fill:#f9f9f9,stroke:#666,stroke-dasharray: 5 5

  subgraph FE[Frontend]
    direction TB
    FE1[React 18 + TypeScript]:::box
    FE2[Vite]:::box
    FE3[react-router-dom]:::box
    FE4[zustand]:::box
    FE5[react-markdown + remark-gfm]:::box
    FE6[Tailwind CSS]:::box
    FE7[SSE Client\\nfetch + TextDecoder]:::box
  end

  subgraph API[Backend]
    direction TB
    BE1[FastAPI (Async)]:::box
    BE2[uvicorn (ASGI)]:::box
    BE3[StreamingResponse (SSE)]:::box
    BE4[SQLAlchemy Async]:::box
    BE5[Auth: OAuth2 + JWT\\npython-jose + passlib(bcrypt)]:::box
    BE6[LLM Client: httpx\\nOpenAI-compatible]:::box
    BE7[Workflow: langchain-core + langgraph]:::box
  end

  subgraph DATA[Storage & Index]
    direction TB
    DB[(SQLite / aiosqlite\\nDocuments + Chunks + Reviews)]:::box
    IDX[MultiRetriever]:::box
    V1[SQLite backend\\n(app-layer similarity)]:::box
    V2[FAISS (faiss-cpu)\\nDisk Index]:::box
    V3[Milvus (pymilvus)\\nOptional]:::box
    V4[Pinecone\\nOptional]:::box
    RR[Rerank: CrossEncoder\\n(sentence-transformers) Optional]:::box
  end

  subgraph DOCS[Document I/O]
    direction TB
    D1[pypdf (PDF)]:::box
    D2[python-docx (DOCX)]:::box
    D3[reportlab (PDF export)]:::box
  end

  FE -->|HTTP/JSON| API
  FE -->|SSE stream| API

  API --> DB
  API --> DOCS
  API --> IDX
  IDX --> V1 --> DB
  IDX --> V2
  IDX --> V3
  IDX --> V4
  IDX --> RR

  class FE,API,DATA,DOCS group
```

