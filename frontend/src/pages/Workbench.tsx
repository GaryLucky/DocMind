import { MessageSquare, Search, Sparkles, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";

import AsyncStateBanner, {
  type AsyncStatus,
} from "@/components/common/AsyncStateBanner";
import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import ResultCard from "@/components/common/ResultCard";
import Tabs, { type TabItem } from "@/components/common/Tabs";
import Textarea from "@/components/common/Textarea";
import {
  apiChat,
  apiQa,
  apiRewrite,
  apiSearch,
  apiSummarize,
  isAbortError,
} from "@/api";
import { clampNumber } from "@/lib/format";
import { useAppStore } from "@/stores/useAppStore";

type ToolKey = "search" | "qa" | "summarize" | "rewrite" | "chat";

export default function Workbench() {
  const selectedDocId = useAppStore((s) => s.selectedDocId);
  const setSelectedDocId = useAppStore((s) => s.setSelectedDocId);

  const [tool, setTool] = useState<ToolKey>("search");
  const [status, setStatus] = useState<AsyncStatus>("idle");
  const [error, setError] = useState<string | undefined>(undefined);
  const [aborter, setAborter] = useState<AbortController | null>(null);

  const [query, setQuery] = useState("");
  const [question, setQuestion] = useState("");
  const [sumText, setSumText] = useState("");
  const [maxLength, setMaxLength] = useState(200);
  const [topK, setTopK] = useState(8);
  const [rewriteText, setRewriteText] = useState("");
  const [rewriteStyle, setRewriteStyle] = useState("professional");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<
    { role: "system" | "user" | "assistant"; content: string }[]
  >([]);

  const [resultTitle, setResultTitle] = useState("结果");
  const [resultText, setResultText] = useState<string | undefined>(undefined);
  const [resultExtra, setResultExtra] = useState<React.ReactNode>(null);

  const toolItems: TabItem<ToolKey>[] = useMemo(
    () => [
      { key: "search", label: "检索", icon: <Search className="h-4 w-4" /> },
      { key: "qa", label: "问答", icon: <Sparkles className="h-4 w-4" /> },
      { key: "summarize", label: "总结", icon: <Wand2 className="h-4 w-4" /> },
      { key: "rewrite", label: "改写", icon: <Wand2 className="h-4 w-4" /> },
      { key: "chat", label: "对话", icon: <MessageSquare className="h-4 w-4" /> },
    ],
    []
  );

  function resetResult() {
    setResultTitle("结果");
    setResultText(undefined);
    setResultExtra(null);
  }

  function clearInputs() {
    setQuery("");
    setQuestion("");
    setSumText("");
    setRewriteText("");
    setChatInput("");
    setChatMessages([]);
    setError(undefined);
    setStatus("idle");
    resetResult();
  }

  const canRun = useMemo(() => {
    if (status === "loading") return false;
    if (tool === "search") return query.trim().length > 0;
    if (tool === "qa") return question.trim().length > 0;
    if (tool === "summarize") return sumText.trim().length > 0;
    if (tool === "rewrite") return rewriteText.trim().length > 0;
    if (tool === "chat") return chatInput.trim().length > 0 || chatMessages.length > 0;
    return false;
  }, [chatInput, chatMessages.length, query, question, rewriteText, status, sumText, tool]);

  async function run() {
    if (!canRun) return;
    const ac = new AbortController();
    setAborter(ac);
    setStatus("loading");
    setError(undefined);
    resetResult();

    try {
      if (tool === "search") {
        setResultTitle("检索结果");
        const data = await apiSearch(
          {
            query: query.trim(),
            top_k: clampNumber(topK, { min: 1, max: 50 }),
            document_ids: selectedDocId ? [selectedDocId] : null,
          },
          ac.signal
        );
        setResultExtra(
          <div className="space-y-2">
            {data.results.length ? (
              data.results.map((r) => (
                <div
                  key={r.chunk_id}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-zinc-600">
                      doc:{r.doc_id} · chunk:{r.chunk_index}
                    </div>
                    <div className="text-xs text-zinc-500">score {r.score.toFixed(3)}</div>
                  </div>
                  <div className="mt-2 text-sm leading-6 text-zinc-900">{r.content}</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-zinc-500">未检索到结果</div>
            )}
          </div>
        );
        setResultText(undefined);
      }

      if (tool === "qa") {
        setResultTitle("问答结果");
        const data = await apiQa(
          { question: question.trim(), doc_id: selectedDocId || null },
          ac.signal
        );
        setResultText(data.answer);
        setResultExtra(
          <div className="space-y-2">
            {data.citations.length ? (
              data.citations.map((c) => (
                <div
                  key={c.chunk_id}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 p-3"
                >
                  <div className="text-xs text-zinc-600">
                    doc:{c.doc_id} · chunk:{c.chunk_index} · score {c.score.toFixed(3)}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-zinc-900">{c.content}</div>
                </div>
              ))
            ) : (
              <div className="text-sm text-zinc-500">无引用片段</div>
            )}
          </div>
        );
      }

      if (tool === "summarize") {
        setResultTitle("摘要");
        const data = await apiSummarize(
          { text: sumText.trim(), max_length: maxLength },
          ac.signal
        );
        setResultText(data.summary);
      }

      if (tool === "rewrite") {
        setResultTitle("改写结果");
        const data = await apiRewrite(
          { text: rewriteText.trim(), style: rewriteStyle },
          ac.signal
        );
        setResultText(data.result);
      }

      if (tool === "chat") {
        setResultTitle("对话");
        const nextMessages = chatInput.trim()
          ? [...chatMessages, { role: "user" as const, content: chatInput.trim() }]
          : chatMessages;
        setChatInput("");
        const data = await apiChat({ messages: nextMessages }, ac.signal);
        const finalMessages = [...nextMessages, { role: "assistant" as const, content: data.reply }];
        setChatMessages(finalMessages);
        setResultExtra(
          <div className="space-y-2">
            {finalMessages.map((m, idx) => (
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
        setResultText(undefined);
      }

      setStatus("success");
    } catch (e) {
      if (isAbortError(e) || ac.signal.aborted) {
        setStatus("idle");
        setError(undefined);
        return;
      }
      const msg = e instanceof Error ? e.message : "请求失败";
      setError(msg);
      setStatus("error");
    } finally {
      setAborter(null);
    }
  }

  const docIdValue = selectedDocId ? String(selectedDocId) : "";

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[420px_1fr]">
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-zinc-900">工具</div>
          <div className="flex items-center gap-2">
            <Input
              className="h-9 w-[140px]"
              placeholder="docId（可选）"
              value={docIdValue}
              onChange={(e) => {
                const v = e.target.value.trim();
                if (!v) {
                  setSelectedDocId(null);
                  return;
                }
                const n = Number(v);
                if (Number.isFinite(n)) setSelectedDocId(n);
              }}
            />
          </div>
        </div>

        <div className="mt-3">
          <Tabs items={toolItems} value={tool} onChange={(v) => setTool(v)} />
        </div>

        <div className="mt-4 space-y-3">
          {tool === "search" ? (
            <div>
              <div className="text-xs font-medium text-zinc-700">查询</div>
              <Input
                className="mt-1"
                placeholder="输入关键词…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="text-xs text-zinc-500">top_k</div>
                <Input
                  className="h-9 w-[84px]"
                  type="number"
                  min={1}
                  max={50}
                  value={String(topK)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const n = raw.trim() ? Number(raw) : 8;
                    setTopK(clampNumber(n, { min: 1, max: 50 }));
                  }}
                />
              </div>
            </div>
          ) : null}

          {tool === "qa" ? (
            <div>
              <div className="text-xs font-medium text-zinc-700">问题</div>
              <Textarea
                className="mt-1"
                placeholder="输入你的问题…"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
              <div className="mt-2 text-xs text-zinc-500">
                不填写 docId 则在全库范围检索上下文。
              </div>
            </div>
          ) : null}

          {tool === "summarize" ? (
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-zinc-700">文本</div>
                <div className="flex items-center gap-2">
                  <div className="text-xs text-zinc-500">最大长度</div>
                  <Input
                    className="h-9 w-[84px]"
                    type="number"
                    min={1}
                    max={2000}
                    value={String(maxLength)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const n = raw.trim() ? Number(raw) : 200;
                      setMaxLength(clampNumber(n, { min: 1, max: 2000 }));
                    }}
                  />
                </div>
              </div>
              <Textarea
                className="mt-1"
                placeholder="输入需要总结的文本…"
                value={sumText}
                onChange={(e) => setSumText(e.target.value)}
              />
            </div>
          ) : null}

          {tool === "rewrite" ? (
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-zinc-700">文本</div>
                <Input
                  className="h-9 w-[160px]"
                  placeholder="style（默认 professional）"
                  value={rewriteStyle}
                  onChange={(e) => setRewriteStyle(e.target.value)}
                />
              </div>
              <Textarea
                className="mt-1"
                placeholder="输入需要改写的文本…"
                value={rewriteText}
                onChange={(e) => setRewriteText(e.target.value)}
              />
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
              <div className="mt-2 text-xs text-zinc-500">
                当前实现为简化多轮：将 messages 直接发给后端。
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            onClick={run}
            disabled={!canRun}
            className="min-w-28"
          >
            运行
          </Button>
          <Button variant="secondary" onClick={clearInputs}>
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
          <AsyncStateBanner status={status} message={error} />
        </div>
      </section>

      <section className="space-y-3">
        <ResultCard title={resultTitle} text={resultText} extra={resultExtra} />
      </section>
    </div>
  );
}
