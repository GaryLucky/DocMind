# 智能文档助手（Desktop-first）页面设计说明

## 全局（适用于所有页面）
### Layout
- ≥1200px：左侧 Sidebar(240–280) + 右侧主内容；主内容内用纵向 Stack + 卡片。
- 768–1199px：Sidebar 可折叠为图标栏。
- <768px：Sidebar Drawer；关键输入区置顶。

### Meta
- Title：智能文档助手
- Description：浏览文档，检索、问答、总结、改写与对话。

### Global Styles（Token）
- 颜色：--bg/--panel/--text/--muted/--border/--primary/--danger
- 字体：H1 20–24、H2 16–18、Body 14–16、Mono 用于代码/片段
- 交互：按钮 hover 150–250ms；disabled 降低对比度；全局 Toast 用于短提示

### 主要全局组件
- AppShell：TopBar + Sidebar + Content
- DocPicker：当前 docId 显示/选择入口（跳转文档库）
- ResultCard：统一承载各工具结果（标题、状态、复制、展开）
- AsyncStateBanner：idle/loading/success/error 统一提示

---

## 页面 1：工作台（/）
### Page Structure
- 上：TopBar（标题 + 当前文档 DocPicker + 全局状态）
- 中：两栏
  - 左：输入与执行（固定宽 360–420）
  - 右：结果区（Tab + 内容）

### Sections & Components
1) 工具 Tabs（5 个）
- 检索（/api/search）/ 问答（/api/qa）/ 总结（/api/summarize）/ 改写（/api/rewrite）/ 对话（/api/chat）

2) 输入面板（随工具切换表单）
- 检索：query, topK
- 问答：question, docId(可选)
- 总结：docId 或 text（二选一），style
- 改写：text, instruction, docId(可选)
- 对话：messages（至少 user 一条），docId(可选)

3) 执行区
- 主按钮「运行」；次按钮「清空」
- 请求取消：loading 时显示「取消」(Abort)

4) 结果区（统一渲染）
- 检索：hits 列表（snippet 高亮、score 可选、点击 docId 进详情）
- 问答：answer + citations 列表
- 总结：summary（可复制）
- 改写：原文/改写对照（左右或上下）
- 对话：消息时间线（assistant 消息流式追加）

### 主要状态
- idle：提示“请选择工具并输入内容”
- loading：禁用运行；显示 skeleton/spinner；允许取消
- success：展示结果；显示“复制/清空”
- error：展示 message + 重试
- empty：接口成功但无内容时显示空结果态

---

## 页面 2：文档库（/docs）
### Page Structure
- 顶部：标题 + 搜索框（本地过滤）
- 主体：表格/列表（可滚动）

### Components
- DocsTable：调用 GET /api/docs 后渲染 rows（title/updatedAt）
- Row Actions：
  - 「打开」→ /docs/:docId
  - 「在工作台使用」→ 跳 / 并带 docId（用于后续 /api/qa 等）

### 状态
- loading：列表骨架屏
- error：错误提示 + 重试
- empty：无文档提示

---

## 页面 3：文档详情（/docs/:docId）
### Page Structure
- 左：文档信息与正文（可折叠长文）
- 右：操作面板（问答/总结/改写/对话四个 Tab）+ 历史结果

### Components
- DocHeader：标题、docId、复制 docId
- DocContent：正文渲染（若后端仅返回摘要则展示摘要）
- DocOpsTabs：
  - 问答：POST /api/qa（默认带 docId）
  - 总结：POST /api/summarize（默认 docId）
  - 改写：POST /api/rewrite（默认 docId，可覆盖 text）
  - 对话：POST /api/chat（默认 docId）
- HistoryTimeline：本页产生的结果记录（前端本地状态），支持复制/清空

### 状态
- doc loading/error：文档信息加载态（若你的后端提供）
- ops loading/success/error：各操作独立状态，不互相阻塞
- 保护：未获取到 docId 时禁止操作并提示返回文档库