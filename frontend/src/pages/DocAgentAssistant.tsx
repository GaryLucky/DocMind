import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import Button from "@/components/common/Button";
import Input from "@/components/common/Input";

type StageType = "analysis" | "execution" | "supervision" | "summary" | "error" | "complete" | "completed";

type SseMsg = {
  type?: StageType;
  subType?: string | null;
  step?: string | number | null;
  content?: string | null;
  sessionId?: string | null;
  timestamp?: number | null;
};

type ChatMsg =
  | { id: string; kind: "user"; content: string; ts: number }
  | { id: string; kind: "ai"; stage: StageType; subType?: string | null; step?: string | number | null; content: string; ts: number };

type ChatHistory = {
  sessionId: string;
  title: string;
  timestamp: number;
  agentId: string | null;
  maxStep: string;
  messages: ChatMsg[];
};

type AgentOption = { id: string; name: string; description?: string };

function genId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

const CHAT_HISTORY_KEY = "ai_agent_chat_history";

function readHistory(): ChatHistory[] {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    const out: ChatHistory[] = [];
    for (const it of parsed) {
      if (!it || typeof it !== "object") continue;
      const obj = it as Record<string, unknown>;
      const sessionId = String(obj.sessionId ?? "");
      if (!sessionId) continue;
      const title = String(obj.title ?? "");
      const timestamp = Number(obj.timestamp ?? Date.now());
      const agentIdRaw = obj.agentId;
      const agentId =
        agentIdRaw == null || agentIdRaw === "" ? null : String(agentIdRaw);
      const maxStep = String(obj.maxStep ?? "5") || "5";

      const msgsRaw = obj.messages;
      const msgs: ChatMsg[] = [];
      if (Array.isArray(msgsRaw)) {
        for (const m of msgsRaw) {
          if (!m || typeof m !== "object") continue;
          const mo = m as Record<string, unknown>;

          if (mo.kind === "user" || mo.kind === "ai") {
            const kind = mo.kind as "user" | "ai";
            if (kind === "user") {
              const content = String(mo.content ?? "");
              if (!content) continue;
              msgs.push({ id: String(mo.id ?? genId("u")), kind: "user", content, ts: Number(mo.ts ?? Date.now()) });
            } else {
              const content = String(mo.content ?? "");
              if (!content) continue;
              const stage = String(mo.stage ?? "analysis") as StageType;
              msgs.push({
                id: String(mo.id ?? genId("a")),
                kind: "ai",
                stage,
                subType: (mo.subType as string | null | undefined) ?? null,
                step: (mo.step as string | number | null | undefined) ?? null,
                content,
                ts: Number(mo.ts ?? Date.now()),
              });
            }
            continue;
          }

          const type = String(mo.type ?? "");
          if (type === "user") {
            const content = String(mo.content ?? "");
            if (!content) continue;
            msgs.push({ id: genId("u"), kind: "user", content, ts: Number(mo.timestamp ?? Date.now()) });
            continue;
          }
          if (type === "ai") {
            const content = String(mo.content ?? "");
            if (!content) continue;
            const stage = String(mo.stage ?? "analysis") as StageType;
            msgs.push({
              id: genId("a"),
              kind: "ai",
              stage,
              subType: (mo.subType as string | null | undefined) ?? null,
              step: (mo.step as string | number | null | undefined) ?? null,
              content,
              ts: Number(mo.timestamp ?? Date.now()),
            });
          }
        }
      }

      out.push({ sessionId, title, timestamp, agentId, maxStep, messages: msgs });
    }
    return out;
  } catch {
    return [];
  }
}

function saveHistory(items: ChatHistory[]) {
  try {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(items.slice(0, 50)));
  } catch {
    return;
  }
}

const stageMeta: Record<string, { label: string; icon: string; badge: string }> = {
  analysis: { label: "分析阶段", icon: "🎯", badge: "bg-sky-50 text-sky-700 border-sky-200" },
  execution: { label: "执行阶段", icon: "⚡", badge: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
  supervision: { label: "监督阶段", icon: "🔍", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  summary: { label: "总结阶段", icon: "📊", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  error: { label: "错误信息", icon: "❌", badge: "bg-red-50 text-red-700 border-red-200" },
  completed: { label: "完成", icon: "✅", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  complete: { label: "完成", icon: "✅", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

const subTypeMap: Record<string, string> = {
  analysis_status: "任务状态",
  analysis_history: "历史评估",
  analysis_strategy: "执行策略",
  analysis_progress: "完成度",
  analysis_task_status: "任务状态",
  execution_target: "执行目标",
  execution_process: "执行过程",
  execution_result: "执行结果",
  execution_quality: "质量检查",
  assessment: "质量评估",
  issues: "问题识别",
  suggestions: "改进建议",
  score: "质量评分",
  pass: "检查结果",
  completed_work: "已完成工作",
  incomplete_reasons: "未完成原因",
  evaluation: "效果评估",
  summary_overview: "总结概览",
};

const quickAgents = [
  { id: "1", label: "自动自主规划", desc: "CSDN发帖+通知" },
  { id: "3", label: "智能对话分析", desc: "对话分析与推理" },
  { id: "4", label: "ELK日志分析", desc: "日志检索分析" },
  { id: "5", label: "监控分析", desc: "监控与指标分析" },
] as const;

const caseByAgent: Record<string, Array<{ title: string; content: string }>> = {
  "1": [
    {
      title: "创作技术文章并通知",
      content:
        "我需要你帮我生成一篇文章，要求如下；\n\n1. 场景为互联网大厂java求职者面试\n2. 按照故事场景，以严肃的面试官和搞笑的水货程序员进行提问与回答\n3. 每次进行3轮提问，每轮3-5个问题，循序渐进\n4. 最后给出问题答案与业务场景讲解\n\n根据以上内容，直接提供：文章标题、文章内容、文章标签、文章简述（100字）\n\n将以上内容发布文章到CSDN，并进行微信公众号消息通知。",
    },
  ],
  "3": [
    { title: "1+1", content: "1+1" },
    { title: "检索项目学习计划", content: "检索小傅哥的相关项目，列出一份学习计划" },
    { title: "推荐入职单位", content: "根据当前北京互联网程序员加班情况，收入，公司文化等，列出一份大学生推荐入职单位。" },
  ],
  "4": [{ title: "查询限流用户", content: "通过ES查询被限流的用户，给出被限流用户列表。" }],
  "5": [{ title: "分析监控数据", content: "分析 Grafana 普罗米修斯系统运行数据，展示出所有接口 TPS、QPS 响应数据。" }],
};

export default function DocAgentAssistant() {
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>([]);
  const [agentLoading, setAgentLoading] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedMaxStep, setSelectedMaxStep] = useState("5");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const [history, setHistory] = useState<ChatHistory[]>(() => readHistory());
  const [current, setCurrent] = useState<ChatHistory>(() => ({
    sessionId: "",
    title: "",
    timestamp: Date.now(),
    messages: [],
    agentId: null,
    maxStep: "5",
  }));

  const thinkingRef = useRef<HTMLDivElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);

  const sessionIdDisplay = current.sessionId || "等待开始...";

  const syncSave = useCallback((chat: ChatHistory) => {
    setHistory((prev) => {
      const idx = prev.findIndex((c) => c.sessionId === chat.sessionId);
      const next = [...prev];
      if (idx >= 0) next[idx] = chat;
      else next.unshift(chat);
      saveHistory(next);
      return next;
    });
  }, []);

  const createNewChat = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setInput("");
    setCurrent({
      sessionId: "",
      title: "",
      timestamp: Date.now(),
      messages: [],
      agentId: selectedAgentId,
      maxStep: selectedMaxStep,
    });
  }, [selectedAgentId, selectedMaxStep]);

  const clearAllChats = useCallback(() => {
    if (!confirm("确定要清空所有对话记录吗？")) return;
    try {
      localStorage.removeItem(CHAT_HISTORY_KEY);
    } catch {
      return;
    }
    setHistory([]);
    createNewChat();
  }, [createNewChat]);

  const deleteChat = useCallback((sid: string) => {
    setHistory((prev) => {
      const next = prev.filter((c) => c.sessionId !== sid);
      saveHistory(next);
      return next;
    });
    if (current.sessionId === sid) {
      createNewChat();
    }
  }, [createNewChat, current.sessionId]);

  const loadChat = useCallback((sid: string) => {
    const chat = history.find((c) => c.sessionId === sid);
    if (!chat) return;
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setCurrent(chat);
    setSelectedAgentId(chat.agentId);
    setSelectedMaxStep(chat.maxStep || "5");
    setTimeout(() => {
      thinkingRef.current?.scrollTo({ top: thinkingRef.current.scrollHeight });
      resultRef.current?.scrollTo({ top: resultRef.current.scrollHeight });
    }, 0);
  }, [history]);

  const panels = useMemo(() => {
    const thinking: ChatMsg[] = [];
    const result: ChatMsg[] = [];
    for (const m of current.messages) {
      if (m.kind === "user") {
        thinking.push(m);
        result.push(m);
        continue;
      }
      if (m.stage === "summary" || m.stage === "completed" || m.stage === "complete") result.push(m);
      else thinking.push(m);
    }
    return { thinking, result };
  }, [current.messages]);

  const fetchAgents = useCallback(async () => {
    setAgentLoading(true);
    try {
      const resp = await fetch("http://localhost:8099/api/v1/agent/query_available_agents", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (!resp.ok) return;
      const data = (await resp.json()) as unknown;
      if (!data || typeof data !== "object") return;
      const d = data as { code?: unknown; data?: unknown };
      if (String(d.code ?? "") !== "0000") return;
      const arr = d.data;
      if (!Array.isArray(arr)) return;
      const opts: AgentOption[] = [];
      for (const it of arr) {
        if (!it || typeof it !== "object") continue;
        const id = String((it as { agentId?: unknown }).agentId ?? "");
        const name = String((it as { agentName?: unknown }).agentName ?? "");
        const description = String((it as { description?: unknown }).description ?? "");
        if (!id || !name) continue;
        opts.push({ id, name, description: description || undefined });
      }
      setAgentOptions(opts);
    } finally {
      setAgentLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const scrollBottom = useCallback(() => {
    thinkingRef.current?.scrollTo({ top: thinkingRef.current.scrollHeight });
    resultRef.current?.scrollTo({ top: resultRef.current.scrollHeight });
  }, []);

  const pushMsg = useCallback(
    (msg: ChatMsg, nextChat?: ChatHistory) => {
      setCurrent((prev) => {
        const base = nextChat ?? prev;
        const updated: ChatHistory = { ...base, messages: [...base.messages, msg] };
        if (updated.sessionId) syncSave(updated);
        return updated;
      });
      setTimeout(scrollBottom, 0);
    },
    [scrollBottom, syncSave]
  );

  const startChatIfNeeded = useCallback(
    (firstUserMessage: string): ChatHistory => {
      if (current.messages.length > 0 && current.sessionId) return current;
      const sid = generateSessionId();
      const title =
        firstUserMessage.substring(0, 20) + (firstUserMessage.length > 20 ? "..." : "");
      const chat: ChatHistory = {
        sessionId: sid,
        title,
        timestamp: Date.now(),
        messages: [],
        agentId: selectedAgentId,
        maxStep: selectedMaxStep,
      };
      syncSave(chat);
      setCurrent(chat);
      return chat;
    },
    [current, selectedAgentId, selectedMaxStep, syncSave]
  );

  const send = useCallback(async () => {
    const msg = input.trim();
    if (!msg) return;
    if (busy) return;

    const chat = startChatIfNeeded(msg);
    const userMsg: ChatMsg = { id: genId("u"), kind: "user", content: msg, ts: Date.now() };
    setInput("");
    setBusy(true);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setCurrent((prev) => {
      const updated: ChatHistory = {
        ...chat,
        agentId: selectedAgentId,
        maxStep: selectedMaxStep,
        messages: [...(chat.messages || []), userMsg],
      };
      syncSave(updated);
      return updated;
    });
    setTimeout(scrollBottom, 0);

    const payload = {
      aiAgentId: selectedAgentId,
      message: msg,
      sessionId: chat.sessionId,
      maxStep: parseInt(selectedMaxStep, 10),
    };

    try {
      const resp = await fetch("http://localhost:8099/api/v1/agent/auto_agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(payload),
        signal: abortRef.current.signal,
      });
      if (!resp.ok || !resp.body) {
        pushMsg({ id: genId("a"), kind: "ai", stage: "error", content: `请求失败: HTTP ${resp.status}`, ts: Date.now() });
        setBusy(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        buf = buf.replace(/\r\n/g, "\n");
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw || raw === "[DONE]") continue;
          let parsed: SseMsg | null = null;
          try {
            parsed = JSON.parse(raw) as SseMsg;
          } catch {
            parsed = { type: "error", content: raw };
          }
          const content = String(parsed?.content ?? "").trim();
          if (!content) continue;
          const stage = (parsed?.type ?? "analysis") as StageType;
          pushMsg({
            id: genId("a"),
            kind: "ai",
            stage,
            subType: parsed?.subType ?? null,
            step: parsed?.step ?? null,
            content,
            ts: Date.now(),
          });
        }
      }
      pushMsg({ id: genId("a"), kind: "ai", stage: "complete", content: "任务执行完成", ts: Date.now() });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushMsg({ id: genId("a"), kind: "ai", stage: "error", content: `连接中断: ${msg}`, ts: Date.now() });
    } finally {
      setBusy(false);
    }
  }, [busy, input, pushMsg, scrollBottom, selectedAgentId, selectedMaxStep, startChatIfNeeded, syncSave]);

  const cases = useMemo(() => {
    if (!selectedAgentId) return [];
    return caseByAgent[selectedAgentId] ?? [];
  }, [selectedAgentId]);

  const titleForHistory = useCallback((c: ChatHistory) => {
    if (c.title) return c.title;
    const firstUser = c.messages.find((m) => m.kind === "user") as { content?: string } | undefined;
    const t = (firstUser?.content ?? "").trim();
    if (!t) return "新对话";
    return t.substring(0, 20) + (t.length > 20 ? "..." : "");
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void send();
      }
    },
    [send]
  );

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr]">
      <aside className="rounded-xl border border-zinc-200 bg-white p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-zinc-900">对话历史</div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={createNewChat}>
              新建
            </Button>
            <Button size="sm" variant="secondary" onClick={clearAllChats}>
              清空
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          {history.length ? (
            history.map((c) => {
              const active = c.sessionId === current.sessionId && !!current.sessionId;
              const dt = new Date(c.timestamp || Date.now());
              const timeStr = dt.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
              return (
                <div
                  key={c.sessionId}
                  className={
                    active
                      ? "group rounded-lg border border-zinc-200 bg-zinc-50 p-2"
                      : "group rounded-lg border border-transparent p-2 hover:bg-zinc-50"
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => loadChat(c.sessionId)}
                    >
                      <div className="truncate text-sm font-medium text-zinc-900" title={titleForHistory(c)}>
                        {titleForHistory(c)}
                      </div>
                      <div className="text-xs text-zinc-500">{timeStr}</div>
                    </button>
                    <button
                      className="opacity-0 transition group-hover:opacity-100"
                      onClick={() => deleteChat(c.sessionId)}
                      aria-label="删除对话"
                    >
                      <span className="text-xs text-red-600 hover:underline">删除</span>
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-8 text-center text-sm text-zinc-500">暂无历史对话</div>
          )}
        </div>
      </aside>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-base font-semibold text-zinc-900">文档agent助手</div>
            <div className="text-sm text-zinc-500">会话ID: <span className="font-mono">{sessionIdDisplay}</span></div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={fetchAgents} disabled={agentLoading}>
              {agentLoading ? "加载中…" : "刷新智能体"}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xs font-medium text-zinc-700">选择智能体</div>
              <select
                value={selectedAgentId ?? ""}
                onChange={(e) => setSelectedAgentId(e.target.value || null)}
                className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900 outline-none focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200"
              >
                <option value="">选择智能体...</option>
                {agentOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <div className="hidden h-8 items-center gap-1 md:flex">
                {quickAgents.map((a) => {
                  const active = selectedAgentId === a.id;
                  return (
                    <button
                      key={a.id}
                      onClick={() => setSelectedAgentId(a.id)}
                      className={
                        active
                          ? "rounded-lg border border-zinc-900 bg-zinc-900 px-2 py-1 text-xs text-white"
                          : "rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                      }
                    >
                      <span className="font-semibold">{a.id}</span> {a.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="text-xs font-medium text-zinc-700">最大执行步数</div>
              <div className="flex items-center rounded-lg border border-zinc-200 bg-white p-1">
                {["1", "2", "3", "5", "10"].map((s) => {
                  const active = selectedMaxStep === s;
                  return (
                    <button
                      key={s}
                      onClick={() => setSelectedMaxStep(s)}
                      className={
                        active
                          ? "rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-white"
                          : "rounded-md px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                      }
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="text-xs font-medium text-zinc-700">提问案例</div>
            <select
              value=""
              onChange={(e) => {
                const idx = parseInt(e.target.value || "", 10);
                if (Number.isFinite(idx) && idx >= 0 && idx < cases.length) {
                  setInput(cases[idx]!.content);
                }
              }}
              className="h-8 min-w-[200px] rounded-lg border border-zinc-200 bg-white px-2 text-sm text-zinc-900 outline-none focus:border-zinc-300 focus:ring-2 focus:ring-zinc-200"
              disabled={!cases.length}
            >
              <option value="">{cases.length ? "选择案例..." : "请先选择智能体"}</option>
              {cases.map((c, i) => (
                <option key={c.title} value={String(i)}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-900">
              AI思考执行过程
            </div>
            <div ref={thinkingRef} className="h-[calc(100dvh-420px)] overflow-y-auto p-4">
              <div className="space-y-3">
                {panels.thinking.length ? (
                  panels.thinking.map((m) => (
                    <MessageItem key={m.id} msg={m} />
                  ))
                ) : (
                  <div className="text-sm text-zinc-500">等待输入问题…</div>
                )}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-900">
              最终执行结果
            </div>
            <div ref={resultRef} className="h-[calc(100dvh-420px)] overflow-y-auto p-4">
              <div className="space-y-3">
                {panels.result.length ? (
                  panels.result.map((m) => (
                    <MessageItem key={m.id} msg={m} />
                  ))
                ) : (
                  <div className="text-sm text-zinc-500">等待输出结果…</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="请输入您的问题..."
              maxLength={1000}
              disabled={busy}
            />
            <Button
              className="sm:w-[120px]"
              variant="primary"
              onClick={() => void send()}
              disabled={busy || !input.trim()}
            >
              {busy ? "处理中…" : "发送"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function MessageItem(props: { msg: ChatMsg }) {
  const { msg } = props;
  if (msg.kind === "user") {
    return (
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-zinc-700 text-xs font-semibold text-white">
          您
        </div>
        <div className="min-w-0 flex-1 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          <span className="font-semibold">您：</span>
          {msg.content}
        </div>
      </div>
    );
  }

  const meta = stageMeta[msg.stage] ?? { label: msg.stage, icon: "📝", badge: "bg-zinc-50 text-zinc-700 border-zinc-200" };
  const subLabel = msg.subType ? subTypeMap[msg.subType] ?? msg.subType : "";
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
        AI
      </div>
      <div className="min-w-0 flex-1 rounded-lg bg-zinc-50 p-3 text-sm text-zinc-900">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">AI助手：</span>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${meta.badge}`}>
            <span>{meta.icon}</span>
            <span>{meta.label}</span>
          </span>
          {subLabel ? (
            <span className="inline-flex items-center rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700">
              {subLabel}
            </span>
          ) : null}
          {msg.step ? (
            <span className="inline-flex items-center rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700">
              第{msg.step}步
            </span>
          ) : null}
        </div>
        <div className="mt-2">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className="my-2 leading-6">{children}</p>,
              ul: ({ children }) => <ul className="my-2 list-disc pl-5">{children}</ul>,
              ol: ({ children }) => <ol className="my-2 list-decimal pl-5">{children}</ol>,
              code: ({ className, children }) => {
                const isBlock = typeof className === "string" && className.includes("language-");
                if (!isBlock) {
                  return (
                    <code className="rounded bg-white px-1 py-0.5 font-mono text-[12px] text-rose-700">
                      {children}
                    </code>
                  );
                }
                return (
                  <code className="block overflow-x-auto rounded-lg border border-zinc-200 bg-white p-3 font-mono text-[12px] leading-5 text-zinc-900">
                    {children}
                  </code>
                );
              },
              pre: ({ children }) => <pre className="my-2">{children}</pre>,
            }}
          >
            {msg.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
