import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MessageSquare, Sparkles, Wand2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import AsyncStateBanner, {
  type AsyncStatus,
} from "@/components/common/AsyncStateBanner";
import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import ResultCard from "@/components/common/ResultCard";
import Tabs, { type TabItem } from "@/components/common/Tabs";
import Textarea from "@/components/common/Textarea";
import {
  apiChatStream,
  apiExportDoc,
  apiGetDoc,
  apiQaStream,
  apiRewriteStream,
  apiSummarizeStream,
  isAbortError,
} from "@/api";
import { clampNumber, formatDateTime } from "@/lib/format";
import { useAppStore } from "@/stores/useAppStore";

type ToolKey = "qa" | "summarize" | "rewrite" | "chat";

type TextBlock = { start: number; end: number; text: string };

type ExportFormat = "md" | "txt" | "pdf" | "docx";

function isExportFormat(v: string): v is ExportFormat {
  return v === "md" || v === "txt" || v === "pdf" || v === "docx";
}

function buildTextBlocks(text: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  if (!text) return blocks;

  const hasParagraphs = text.includes("\n\n");
  if (hasParagraphs) {
    let i = 0;
    while (i < text.length) {
      const start = i;
      let sep = text.indexOf("\n\n", i);
      if (sep === -1) sep = text.length;
      const end = sep;
      const part = text.slice(start, end);
      if (part.trim().length > 0) blocks.push({ start, end, text: part });
      i = sep;
      while (i < text.length && text[i] === "\n") i += 1;
    }
    if (blocks.length > 1) return blocks;
  }

  let start = 0;
  while (start < text.length) {
    let next = text.indexOf("\n", start);
    if (next === -1) next = text.length;
    const lineEnd = next < text.length ? next + 1 : next;
    const part = text.slice(start, lineEnd);
    if (part.trim().length > 0) blocks.push({ start, end: lineEnd, text: part });
    start = lineEnd;
  }
  return blocks.length ? blocks : [{ start: 0, end: text.length, text }];
}

export default function DocDetail() {
  const navigate = useNavigate();
  const params = useParams();
  const docId = Number(params.docId);

  const setSelectedDocId = useAppStore((s) => s.setSelectedDocId);
  useEffect(() => {
    if (Number.isFinite(docId)) setSelectedDocId(docId);
  }, [docId, setSelectedDocId]);

  const [docStatus, setDocStatus] = useState<AsyncStatus>("idle");
  const [docError, setDocError] = useState<string | undefined>(undefined);
  const [doc, setDoc] = useState<
    | {
        id: number;
        title: string;
        owner: string;
        created_at: string;
        content: string;
      }
    | null
  >(null);
  const [contentExpanded, setContentExpanded] = useState(false);
  const [contentView, setContentView] = useState<"render" | "source">("render");

  const [tool, setTool] = useState<ToolKey>("qa");
  const [opStatus, setOpStatus] = useState<AsyncStatus>("idle");
  const [opError, setOpError] = useState<string | undefined>(undefined);
  const [aborter, setAborter] = useState<AbortController | null>(null);

  const [question, setQuestion] = useState("");
  const [sumMaxLength, setSumMaxLength] = useState(200);
  const [rewriteStyle, setRewriteStyle] = useState("professional");
  const [rewriteEnableChain, setRewriteEnableChain] = useState(false);
  const [rewriteChainStrictness, setRewriteChainStrictness] = useState(1);
  const [rewriteChainMaxLoops, setRewriteChainMaxLoops] = useState(2);
  const [rewriteText, setRewriteText] = useState("");
  const [rewriteSelectedBlocks, setRewriteSelectedBlocks] = useState<number[]>([]);
  const [rewriteAnchorBlock, setRewriteAnchorBlock] = useState<number | null>(null);
  const [rewriteReview, setRewriteReview] = useState(null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<
    { role: "system" | "user" | "assistant"; content: string }[]
  >([]);

  const [resultTitle, setResultTitle] = useState("结果");
  const [resultText, setResultText] = useState<string | undefined>(undefined);
  const [resultExtra, setResultExtra] = useState<React.ReactNode>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("md");

  const toolItems: TabItem<ToolKey>[] = useMemo(
    () => [
      { key: "qa", label: "问答", icon: <Sparkles className="h-4 w-4" /> },
      { key: "summarize", label: "总结", icon: <Wand2 className="h-4 w-4" /> },
      { key: "rewrite", label: "改写", icon: <Wand2 className="h-4 w-4" /> },
      { key: "chat", label: "对话", icon: <MessageSquare className="h-4 w-4" /> },
    ],
    []
  );

  useEffect(() => {
    if (!Number.isFinite(docId)) return;

    const ac = new AbortController();
    (async () => {
      setDocStatus("loading");
      setDocError(undefined);
      try {
        const data = await apiGetDoc(docId, ac.signal);
        setDoc(data);
        setDocStatus("success");
        setContentView("render");
      } catch (e) {
        if (isAbortError(e) || ac.signal.aborted) return;
        setDocStatus("error");
        setDocError(e instanceof Error ? e.message : "加载失败");
      }
    })();

    return () => {
      ac.abort();
    };
  }, [docId]);

  useEffect(() => {
    setRewriteSelectedBlocks([]);
    setRewriteAnchorBlock(null);
    setRewriteReview(null);
  }, [docId]);

  const rewriteBlocks = useMemo(() => buildTextBlocks(doc?.content || ""), [doc?.content]);

  const rewriteSelection = useMemo(() => {
    if (!rewriteSelectedBlocks.length) return null;
    const sorted = [...rewriteSelectedBlocks].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i] !== sorted[i - 1] + 1) return null;
    }
    const a = rewriteBlocks[sorted[0]];
    const b = rewriteBlocks[sorted[sorted.length - 1]];
    if (!a || !b) return null;
    return { start: a.start, end: b.end };
  }, [rewriteBlocks, rewriteSelectedBlocks]);

  const rewriteSelectionLabel = useMemo(() => {
    if (!rewriteSelectedBlocks.length) return "未选择";
    const sorted = [...rewriteSelectedBlocks].sort((a, b) => a - b);
    const contiguous = sorted.every((v, idx) => idx === 0 || v === sorted[idx - 1] + 1);
    if (!contiguous) return `已选 ${sorted.length} 段（非连续）`;
    return `已选 ${sorted.length} 段`;
  }, [rewriteSelectedBlocks]);

  const canRun = useMemo(() => {
    if (opStatus === "loading") return false;
    if (tool === "qa") return question.trim().length > 0;
    if (tool === "summarize") return (doc?.content || "").trim().length > 0;
    if (tool === "rewrite") {
      if (rewriteSelection && rewriteSelection.end > rewriteSelection.start) return true;
      return (rewriteText.trim() || doc?.content || "").trim().length > 0;
    }
    if (tool === "chat") return chatInput.trim().length > 0 || chatMessages.length > 0;
    return false;
  }, [
    chatInput,
    chatMessages.length,
    doc?.content,
    opStatus,
    question,
    rewriteSelection,
    rewriteText,
    tool,
  ]);

  async function run() {
    if (!canRun) return;
    const ac = new AbortController();
    setAborter(ac);
    setOpStatus("loading");
    setOpError(undefined);
    setResultTitle("结果");
    setResultText(undefined);
    setResultExtra(null);

    try {
      if (tool === "qa") {
        setResultTitle("问答结果");
        setResultText("");
        let citations: any[] = [];
        const renderCitations = (items: any[]) => (
          <div className="space-y-2">
            {items.length ? (
              items.map((c) => (
                <div key={c.chunk_id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <div className="text-xs text-zinc-600">
                    doc:{c.doc_id} · chunk:{c.chunk_index} · score {Number(c.score).toFixed(3)}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-zinc-900">{c.content}</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-zinc-500">无引用片段</div>
            )}
          </div>
        );
        setResultExtra(renderCitations([]));
        await apiQaStream(
          { question: question.trim(), doc_id: docId },
          {
            signal: ac.signal,
            onEvent: (evt) => {
              if (evt.event === "token") {
                const t = (evt.data as any)?.text ?? "";
                if (typeof t === "string" && t) setResultText((prev) => (prev || "") + t);
                return;
              }
              if (evt.event === "citations") {
                citations = (evt.data as any)?.citations ?? [];
                if (Array.isArray(citations)) setResultExtra(renderCitations(citations));
                return;
              }
              if (evt.event === "error") {
                const msg = (evt.data as any)?.message ?? "请求失败";
                throw new Error(typeof msg === "string" ? msg : "请求失败");
              }
              if (evt.event === "done") {
                const items = (evt.data as any)?.citations;
                if (Array.isArray(items)) setResultExtra(renderCitations(items));
              }
            },
          }
        );
      }

      if (tool === "summarize") {
        setResultTitle("摘要");
        setResultText("");
        await apiSummarizeStream(
          { text: doc?.content || "", max_length: sumMaxLength },
          {
            signal: ac.signal,
            onEvent: (evt) => {
              if (evt.event === "token") {
                const t = (evt.data as any)?.text ?? "";
                if (typeof t === "string" && t) setResultText((prev) => (prev || "") + t);
                return;
              }
              if (evt.event === "error") {
                const msg = (evt.data as any)?.message ?? "请求失败";
                throw new Error(typeof msg === "string" ? msg : "请求失败");
              }
              if (evt.event === "done") {
                const s = (evt.data as any)?.summary;
                if (typeof s === "string") setResultText(s);
              }
            },
          }
        );
      }

      if (tool === "rewrite") {
        if (doc && rewriteSelectedBlocks.length) {
          if (!rewriteSelection) {
            setOpStatus("error");
            setOpError("当前审查只支持连续片段：请 Shift+点击 选择连续范围");
            return;
          }
          navigate(`/docs/${doc.id}/rewrite`, {
            state: {
              start: rewriteSelection.start,
              end: rewriteSelection.end,
              enable_agent_chain: rewriteEnableChain,
              chain_strictness: rewriteChainStrictness,
              chain_max_loops: rewriteChainMaxLoops,
            },
          });
          setOpStatus("idle");
          return;
        }
        setRewriteReview(null);
        setResultTitle("改写结果");
        setResultText("");
        const source = rewriteText.trim() || doc?.content || "";
        let progressLine = "";
        const renderChain = (chain: any | null) => (
          <div className="space-y-2">
            {progressLine ? <div className="text-xs text-zinc-600">进度：{progressLine}</div> : null}
            {chain ? (
              <>
                <div className="text-xs text-zinc-600">
                  反思审查链：评分 {Number(chain.overall_score).toFixed(1)} · {chain.quality_passed ? "通过" : "未通过"} · 回环{" "}
                  {chain.loops}/{chain.max_loops} · 严格度 {chain.strictness}
                </div>
                {String(chain.final_notes || "").trim() ? (
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                    {String(chain.final_notes || "")}
                  </div>
                ) : null}
                {Array.isArray(chain.steps) && chain.steps.length ? (
                  <details className="rounded-lg border border-zinc-200 bg-white p-3">
                    <summary className="cursor-pointer text-sm text-zinc-900">查看节点回显</summary>
                    <div className="mt-2 space-y-2">
                      {chain.steps.map((s: any, idx: number) => (
                        <div key={idx} className="rounded-md bg-zinc-50 p-2 text-xs text-zinc-700">
                          <div className="font-medium">
                            节点 {String(s?.node ?? "?")} · {String(s?.name ?? "")}
                          </div>
                          <div className="mt-1 whitespace-pre-wrap break-words">{String(s?.reflection ?? "")}</div>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
              </>
            ) : null}
          </div>
        );
        setResultExtra(renderChain(null));
        let finalChain: any | null = null;
        await apiRewriteStream(
          {
            text: source,
            style: rewriteStyle,
            enable_agent_chain: rewriteEnableChain,
            chain_strictness: rewriteChainStrictness,
            chain_max_loops: rewriteChainMaxLoops,
          },
          {
            signal: ac.signal,
            onEvent: (evt) => {
              if (evt.event === "progress") {
                const p = evt.data as any;
                if (p?.type === "node_start") {
                  const r = p?.round ? `第${p.round}轮 ` : "";
                  progressLine = `${r}节点${String(p?.node ?? "?")} ${String(p?.name ?? "")}（开始）`;
                  setResultExtra(renderChain(finalChain));
                  return;
                }
                if (p?.type === "node_done") {
                  const r = p?.round ? `第${p.round}轮 ` : "";
                  const tail = typeof p?.overall_score === "number" ? ` · score ${p.overall_score.toFixed(1)}` : "";
                  const pass = typeof p?.pass === "boolean" ? ` · ${p.pass ? "通过" : "未通过"}` : "";
                  progressLine = `${r}节点${String(p?.node ?? "?")} ${String(p?.name ?? "")}（完成）${tail}${pass}`;
                  setResultExtra(renderChain(finalChain));
                }
                return;
              }
              if (evt.event === "token") {
                const t = (evt.data as any)?.text ?? "";
                if (typeof t === "string" && t) setResultText((prev) => (prev || "") + t);
                return;
              }
              if (evt.event === "done") {
                const d = evt.data as any;
                finalChain = d?.chain ?? null;
                const result = d?.result;
                if (typeof result === "string") setResultText(result);
                setResultExtra(renderChain(finalChain));
                return;
              }
              if (evt.event === "error") {
                const msg = (evt.data as any)?.message ?? "请求失败";
                throw new Error(typeof msg === "string" ? msg : "请求失败");
              }
            },
          }
        );
      }

      if (tool === "chat") {
        setResultTitle("对话");
        const nextMessages = chatInput.trim()
          ? [...chatMessages, { role: "user" as const, content: chatInput.trim() }]
          : chatMessages;
        setChatInput("");
        const renderChat = (items: { role: string; content: string }[]) => (
          <div className="space-y-2">
            {items.map((m, idx) => (
              <div
                key={idx}
                className={
                  m.role === "assistant"
                    ? "rounded-lg border border-zinc-200 bg-white p-3"
                    : "rounded-lg border border-zinc-200 bg-zinc-50 p-3"
                }
              >
                <div className="text-xs text-zinc-600">{m.role}</div>
                <div className="mt-1 text-sm leading-6 text-zinc-900">{m.content}</div>
              </div>
            ))}
          </div>
        );
        let working = [...nextMessages, { role: "assistant" as const, content: "" }];
        setChatMessages(working);
        setResultExtra(renderChat(working));
        setResultText(undefined);
        await apiChatStream(
          { messages: nextMessages },
          {
            signal: ac.signal,
            onEvent: (evt) => {
              if (evt.event === "token") {
                const t = (evt.data as any)?.text ?? "";
                if (typeof t === "string" && t) {
                  working = [
                    ...working.slice(0, working.length - 1),
                    { role: "assistant" as const, content: working[working.length - 1].content + t },
                  ];
                  setChatMessages(working);
                  setResultExtra(renderChat(working));
                }
                return;
              }
              if (evt.event === "done") {
                const reply = (evt.data as any)?.reply;
                if (typeof reply === "string") {
                  working = [
                    ...nextMessages,
                    { role: "assistant" as const, content: reply },
                  ];
                  setChatMessages(working);
                  setResultExtra(renderChat(working));
                }
                return;
              }
              if (evt.event === "error") {
                const msg = (evt.data as any)?.message ?? "请求失败";
                throw new Error(typeof msg === "string" ? msg : "请求失败");
              }
            },
          }
        );
      }

      setOpStatus("success");
    } catch (e) {
      if (isAbortError(e) || ac.signal.aborted) {
        setOpStatus("idle");
        setOpError(undefined);
        return;
      }
      setOpStatus("error");
      setOpError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setAborter(null);
    }
  }

  async function exportDoc() {
    if (!doc) return;
    const ac = new AbortController();
    setOpStatus("loading");
    setOpError(undefined);
    try {
      const res = await apiExportDoc(doc.id, exportFormat, ac.signal);
      const url = URL.createObjectURL(res.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename || `${doc.title}.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setOpStatus("success");
    } catch (e) {
      setOpStatus("error");
      setOpError(e instanceof Error ? e.message : "导出失败");
    }
  }

  const canCommitReview = useMemo(() => false, []);
  const canRollbackReview = useMemo(() => false, []);

  const sideBySide = contentView === "source";

  const toolPanel = (
    <section className="space-y-3">
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="text-sm font-semibold text-zinc-900">文档内操作</div>
        <div className="mt-3">
          <Tabs items={toolItems} value={tool} onChange={(v) => setTool(v)} />
        </div>
        <div className="mt-4 space-y-3">
          {tool === "qa" ? (
            <div>
              <div className="text-xs font-medium text-zinc-700">问题</div>
              <Textarea
                className="mt-1"
                placeholder="输入你的问题…"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </div>
          ) : null}

          {tool === "summarize" ? (
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-zinc-700">摘要长度</div>
                <Input
                  className="h-9 w-[84px]"
                  type="number"
                  min={1}
                  max={2000}
                  value={String(sumMaxLength)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const n = raw.trim() ? Number(raw) : 200;
                    setSumMaxLength(clampNumber(n, { min: 1, max: 2000 }));
                  }}
                />
              </div>
              <div className="mt-2 text-xs text-zinc-500">
                当前实现：直接对文档正文调用 /api/summarize。
              </div>
            </div>
          ) : null}

          {tool === "rewrite" ? (
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-zinc-700">style</div>
                <Input
                  className="h-9 w-[160px]"
                  value={rewriteStyle}
                  onChange={(e) => setRewriteStyle(e.target.value)}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={rewriteEnableChain}
                    onChange={(e) => setRewriteEnableChain(e.target.checked)}
                  />
                  开启反思审查链
                </label>
                <select
                  className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                  value={rewriteChainStrictness}
                  onChange={(e) => setRewriteChainStrictness(Number(e.target.value))}
                  disabled={!rewriteEnableChain}
                >
                  <option value={0}>宽松</option>
                  <option value={1}>标准</option>
                  <option value={2}>严格</option>
                </select>
                <Input
                  className="h-9 w-[96px]"
                  type="number"
                  min={0}
                  max={5}
                  value={String(rewriteChainMaxLoops)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const n = raw.trim() ? Number(raw) : 2;
                    setRewriteChainMaxLoops(clampNumber(n, { min: 0, max: 5 }));
                  }}
                  disabled={!rewriteEnableChain}
                />
                <div className="text-xs text-zinc-500">最大回环</div>
              </div>
              <div className="mt-2 text-xs text-zinc-500">可选两种模式：</div>
              <div className="mt-1 text-xs text-zinc-500">
                1）直接改写：输入文本，点“运行”。
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                2）审查改写：在下方正文框选中片段，点“运行”生成 diff，再“提交/回滚”。
              </div>
              <Textarea
                className="mt-2"
                placeholder="可选：输入需要改写的文本…"
                value={rewriteText}
                onChange={(e) => setRewriteText(e.target.value)}
              />
              <div className="mt-2 text-xs text-zinc-500">
                审查改写：请在左侧正文中选择片段（支持多选），再点“运行”生成 diff。
              </div>
              {rewriteReview ? (
                <div className="mt-2 text-xs text-zinc-600">当前已进入审查流程</div>
              ) : null}
            </div>
          ) : null}

          {tool === "chat" ? (
            <div>
              <div className="text-xs font-medium text-zinc-700">消息</div>
              <Textarea
                className="mt-1"
                placeholder="输入一条消息…"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
              />
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={run} disabled={!canRun}>
            运行
          </Button>
          {tool === "rewrite" ? (
            <>
              <Button variant="secondary" disabled={!canCommitReview}>
                提交
              </Button>
              <Button variant="secondary" disabled={!canRollbackReview}>
                回滚
              </Button>
            </>
          ) : null}
          <Button
            variant="secondary"
            onClick={() => {
              setQuestion("");
              setRewriteText("");
              setRewriteSelectedBlocks([]);
              setRewriteAnchorBlock(null);
              setRewriteReview(null);
              setChatInput("");
              setChatMessages([]);
              setOpStatus("idle");
              setOpError(undefined);
              setResultText(undefined);
              setResultExtra(null);
            }}
          >
            清空
          </Button>
          {aborter ? (
            <Button
              variant="ghost"
              onClick={() => {
                aborter.abort();
                setAborter(null);
              }}
            >
              取消
            </Button>
          ) : null}
        </div>

        <div className="mt-3">
          <AsyncStateBanner status={opStatus} message={opError} />
        </div>
      </div>

      {tool !== "rewrite" ? (
        <ResultCard title={resultTitle} text={resultText} extra={resultExtra} />
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="text-sm font-semibold text-zinc-900">改写审查</div>
          <div className="mt-2 text-sm text-zinc-600">
            在左侧正文中选择片段，然后点“运行”进入审查页面进行左右对照与分组提交。
          </div>
        </div>
      )}
    </section>
  );

  return (
    <div className={sideBySide ? "grid grid-cols-1 gap-4 md:grid-cols-[1fr_420px]" : "grid grid-cols-1 gap-4"}>
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-zinc-900">
              {doc ? doc.title : `文档 #${docId}`}
            </div>
            <div className="mt-1 text-sm text-zinc-500">
              docId {docId}
              {doc ? ` · owner ${doc.owner} · ${formatDateTime(doc.created_at)}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
              value={exportFormat}
              onChange={(e) => {
                const v = e.target.value;
                if (isExportFormat(v)) setExportFormat(v);
              }}
              disabled={!doc}
            >
              <option value="md">MD</option>
              <option value="txt">TXT</option>
              <option value="pdf">PDF</option>
              <option value="docx">Word</option>
            </select>
            <Button variant="secondary" onClick={() => void exportDoc()} disabled={!doc || opStatus === "loading"}>
              导出文档
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigator.clipboard.writeText(String(docId))}
            >
              复制 docId
            </Button>
          </div>
        </div>
        <div className="mt-3">
          <AsyncStateBanner status={docStatus} message={docError} />
        </div>
        <div className="mt-3">
          {doc ? (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium text-zinc-900">正文</div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={contentView === "render" ? "secondary" : "ghost"}
                    onClick={() => setContentView("render")}
                  >
                    渲染
                  </Button>
                  <Button
                    size="sm"
                    variant={contentView === "source" ? "secondary" : "ghost"}
                    onClick={() => setContentView("source")}
                  >
                    源代码
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setContentExpanded((v) => !v)}
                  >
                    {contentExpanded ? "收起" : "展开"}
                  </Button>
                </div>
              </div>
              {tool === "rewrite" ? (
                <div className="mt-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-zinc-600">点击选择要改写的片段</div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-zinc-500">{rewriteSelectionLabel}</div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setRewriteSelectedBlocks([]);
                          setRewriteAnchorBlock(null);
                        }}
                        disabled={!rewriteSelectedBlocks.length}
                      >
                        清除
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          const all = rewriteBlocks.map((_, idx) => idx);
                          setRewriteSelectedBlocks(all);
                          setRewriteAnchorBlock(all.length ? all[0] : null);
                        }}
                        disabled={!rewriteBlocks.length}
                      >
                        全选
                      </Button>
                    </div>
                  </div>
                  <div
                    className={
                      contentExpanded
                        ? "mt-2 max-h-[720px] overflow-auto rounded-lg border border-zinc-200 bg-white"
                        : "mt-2 max-h-[420px] overflow-auto rounded-lg border border-zinc-200 bg-white"
                    }
                  >
                    <div className="divide-y divide-zinc-100">
                      {rewriteBlocks.map((b, idx) => {
                        const selected = rewriteSelectedBlocks.includes(idx);
                        return (
                          <button
                            key={`${b.start}-${b.end}`}
                            type="button"
                            onClick={(e) => {
                              const isMulti = e.metaKey || e.ctrlKey;
                              const isRange = e.shiftKey && rewriteAnchorBlock != null;
                              if (isRange) {
                                const from = Math.min(rewriteAnchorBlock ?? idx, idx);
                                const to = Math.max(rewriteAnchorBlock ?? idx, idx);
                                const range: number[] = [];
                                for (let i = from; i <= to; i += 1) range.push(i);
                                setRewriteSelectedBlocks(isMulti ? Array.from(new Set([...rewriteSelectedBlocks, ...range])) : range);
                                return;
                              }
                              if (isMulti) {
                                const set = new Set(rewriteSelectedBlocks);
                                if (set.has(idx)) set.delete(idx);
                                else set.add(idx);
                                const next = Array.from(set).sort((a, b) => a - b);
                                setRewriteSelectedBlocks(next);
                                setRewriteAnchorBlock(idx);
                                return;
                              }
                              setRewriteSelectedBlocks([idx]);
                              setRewriteAnchorBlock(idx);
                            }}
                            className={
                              selected
                                ? "w-full whitespace-pre-wrap break-words bg-blue-50 px-3 py-2 text-left text-sm leading-6 text-zinc-900"
                                : "w-full whitespace-pre-wrap break-words px-3 py-2 text-left text-sm leading-6 text-zinc-900 hover:bg-zinc-50"
                            }
                          >
                            {b.text}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">
                    提示：单击=单选；Ctrl/Cmd+单击=多选；Shift+单击=连续多选
                  </div>
                </div>
              ) : (
                contentView === "source" ? (
                  <pre
                    className={
                      contentExpanded
                        ? "mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-900"
                        : "mt-2 line-clamp-12 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-900"
                    }
                  >
                    {doc.content}
                  </pre>
                ) : (
                  <div
                    className={
                      contentExpanded
                        ? "md mt-2 max-w-full overflow-hidden rounded-lg border border-zinc-200 bg-white p-3"
                        : "md mt-2 max-h-[360px] max-w-full overflow-hidden rounded-lg border border-zinc-200 bg-white p-3"
                    }
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.content}</ReactMarkdown>
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="text-sm text-zinc-500">暂无内容</div>
          )}
        </div>
      </section>
      {sideBySide ? toolPanel : null}
      {!sideBySide ? toolPanel : null}
    </div>
  );
}
