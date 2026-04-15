import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import {
  apiApplyRewriteReviewSession,
  apiCreateRewriteReviewSession,
  apiGetDoc,
  apiGetRewriteReviewSession,
  apiRollbackRewriteReviewSession,
  isAbortError,
} from "@/api";
import AsyncStateBanner, { type AsyncStatus } from "@/components/common/AsyncStateBanner";
import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import type { RewriteChainMeta, RewriteReviewOpcode, RewriteReviewSessionResponse } from "@/api/types";

type DiffRow =
  | { kind: "context"; id: number; left: string; right: string }
  | { kind: "add"; id: number; left: string; right: string }
  | { kind: "del"; id: number; left: string; right: string }
  | { kind: "mod"; id: number; left: string; right: string };

function buildDiffRows(baseText: string, targetText: string, opcodes: RewriteReviewOpcode[]): DiffRow[] {
  const a = splitLinesKeepEnds(baseText);
  const b = splitLinesKeepEnds(targetText);
  const rows: DiffRow[] = [];

  let curA = 0;
  let curB = 0;
  const sorted = [...opcodes].sort((x, y) => x.i1 - y.i1);

  for (const op of sorted) {
    if (curA < op.i1 || curB < op.j1) {
      const left = a.slice(curA, op.i1).join("");
      const right = b.slice(curB, op.j1).join("");
      if (left || right) rows.push({ kind: "context", id: 0, left, right });
    }

    const left = a.slice(op.i1, op.i2).join("");
    const right = b.slice(op.j1, op.j2).join("");
    const kind = op.tag === "insert" ? "add" : op.tag === "delete" ? "del" : "mod";
    rows.push({ kind, id: op.id, left, right });
    curA = op.i2;
    curB = op.j2;
  }

  const tailLeft = a.slice(curA).join("");
  const tailRight = b.slice(curB).join("");
  if (tailLeft || tailRight) rows.push({ kind: "context", id: 0, left: tailLeft, right: tailRight });
  return rows;
}

function splitLinesKeepEnds(text: string): string[] {
  if (!text) return [""];
  const parts = text.split("\n");
  return parts.map((p, i) => (i < parts.length - 1 ? `${p}\n` : p));
}

export default function RewriteReview() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const docId = Number(params.docId);
  const sessionId = params.sessionId ? Number(params.sessionId) : null;

  const [status, setStatus] = useState<AsyncStatus>("idle");
  const [error, setError] = useState<string | undefined>(undefined);

  const [docTitle, setDocTitle] = useState<string>("文档");
  const [style, setStyle] = useState("professional");
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [enableChain, setEnableChain] = useState(false);
  const [chainStrictness, setChainStrictness] = useState(1);
  const [chainMaxLoops, setChainMaxLoops] = useState(2);
  const [chainMeta, setChainMeta] = useState<RewriteChainMeta | null>(null);

  const [data, setData] = useState<RewriteReviewSessionResponse | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  useEffect(() => {
    if (!Number.isFinite(docId)) return;
    const ac = new AbortController();
    (async () => {
      try {
        const doc = await apiGetDoc(docId, ac.signal);
        setDocTitle(doc.title);
      } catch {
        return;
      }
    })();
    return () => ac.abort();
  }, [docId]);

  useEffect(() => {
    const st = location.state as unknown;
    if (st && typeof st === "object") {
      const obj = st as {
        start?: unknown;
        end?: unknown;
        enable_agent_chain?: unknown;
        chain_strictness?: unknown;
        chain_max_loops?: unknown;
      };
      const start = obj.start != null ? Number(obj.start) : NaN;
      const end = obj.end != null ? Number(obj.end) : NaN;
      if (Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start) {
        setSelection({ start, end });
      }
      if (obj.enable_agent_chain != null) setEnableChain(Boolean(obj.enable_agent_chain));
      if (obj.chain_strictness != null) {
        const v = Number(obj.chain_strictness);
        if (Number.isFinite(v)) setChainStrictness(Math.max(0, Math.min(2, Math.trunc(v))));
      }
      if (obj.chain_max_loops != null) {
        const v = Number(obj.chain_max_loops);
        if (Number.isFinite(v)) setChainMaxLoops(Math.max(0, Math.min(5, Math.trunc(v))));
      }
    }
  }, [location.state]);

  useEffect(() => {
    if (!Number.isFinite(docId)) return;
    const ac = new AbortController();
    (async () => {
      setStatus("loading");
      setError(undefined);
      try {
        if (sessionId) {
          const s = await apiGetRewriteReviewSession(sessionId, ac.signal);
          setData(s);
          setStyle(s.style);
          setSelectedIds([]);
          setStatus("success");
          return;
        }
        if (!selection) {
          setStatus("error");
          setError("未选择改写范围，请从文档详情页选择片段后进入审查页");
          return;
        }
        const s = await apiCreateRewriteReviewSession(
          {
            doc_id: docId,
            start: selection.start,
            end: selection.end,
            style,
            enable_agent_chain: enableChain,
            chain_strictness: chainStrictness,
            chain_max_loops: chainMaxLoops,
          },
          ac.signal
        );
        setChainMeta(s.chain ?? null);
        navigate(`/docs/${docId}/rewrite/${s.session_id}`, { replace: true });
      } catch (e) {
        if (isAbortError(e) || ac.signal.aborted) return;
        setStatus("error");
        setError(e instanceof Error ? e.message : "加载失败");
      }
    })();
    return () => ac.abort();
  }, [chainMaxLoops, chainStrictness, docId, enableChain, navigate, selection, sessionId, style]);

  const rows = useMemo(() => {
    if (!data) return [];
    return buildDiffRows(data.base_text, data.target_text, data.opcodes);
  }, [data]);

  const allOpcodeIds = useMemo(() => (data ? data.opcodes.map((o) => o.id) : []), [data]);
  const canApplySelected = selectedIds.length > 0 && status !== "loading";
  const canApplyAll = allOpcodeIds.length > 0 && status !== "loading";

  async function apply(opcodeIds: number[]) {
    if (!data) return;
    const ac = new AbortController();
    setStatus("loading");
    setError(undefined);
    try {
      await apiApplyRewriteReviewSession(data.session_id, { opcode_ids: opcodeIds }, ac.signal);
      const refreshed = await apiGetRewriteReviewSession(data.session_id, ac.signal);
      setData(refreshed);
      setSelectedIds([]);
      setStatus("success");
    } catch (e) {
      if (isAbortError(e) || ac.signal.aborted) return;
      setStatus("error");
      setError(e instanceof Error ? e.message : "提交失败");
    }
  }

  async function rollback(commitId: number) {
    if (!data) return;
    const ac = new AbortController();
    setStatus("loading");
    setError(undefined);
    try {
      await apiRollbackRewriteReviewSession(data.session_id, { commit_id: commitId }, ac.signal);
      const refreshed = await apiGetRewriteReviewSession(data.session_id, ac.signal);
      setData(refreshed);
      setSelectedIds([]);
      setStatus("success");
    } catch (e) {
      if (isAbortError(e) || ac.signal.aborted) return;
      setStatus("error");
      setError(e instanceof Error ? e.message : "回滚失败");
    }
  }

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-zinc-900">改写审查 · {docTitle}</div>
            <div className="mt-0.5 text-sm text-zinc-500">
              docId {docId}
              {data ? ` · session ${data.session_id} · ${data.status}` : ""}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="h-9 w-[160px]"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              disabled={!!data}
            />
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={enableChain}
                onChange={(e) => setEnableChain(e.target.checked)}
                disabled={!!data}
              />
              开启反思审查链
            </label>
            <select
              className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
              value={chainStrictness}
              onChange={(e) => setChainStrictness(Number(e.target.value))}
              disabled={!!data || !enableChain}
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
              value={String(chainMaxLoops)}
              onChange={(e) => {
                const raw = e.target.value;
                const n = raw.trim() ? Number(raw) : 2;
                setChainMaxLoops(Math.max(0, Math.min(5, Math.trunc(n))));
              }}
              disabled={!!data || !enableChain}
            />
            <Button variant="secondary" onClick={() => navigate(`/docs/${docId}`)}>
              返回详情
            </Button>
            <Button onClick={() => void apply(selectedIds)} disabled={!canApplySelected}>
              提交所选
            </Button>
            <Button onClick={() => void apply(allOpcodeIds)} disabled={!canApplyAll} variant="secondary">
              全部提交
            </Button>
          </div>
        </div>
        <div className="mt-3">
          <AsyncStateBanner status={status} message={error} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_320px]">
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="grid grid-cols-[1fr_56px_1fr] border-b border-zinc-100 bg-zinc-50 text-xs font-medium text-zinc-600">
            <div className="px-3 py-2">原文</div>
            <div className="px-3 py-2 text-center">操作</div>
            <div className="px-3 py-2">改后</div>
          </div>

          <div className="max-h-[70vh] overflow-auto">
            {data ? (
              rows.map((r, idx) => {
                const leftLines = splitLinesKeepEnds(r.left);
                const rightLines = splitLinesKeepEnds(r.right);
                const max = Math.max(leftLines.length, rightLines.length);
                const colorLeft =
                  r.kind === "del"
                    ? "bg-red-50 text-red-900"
                    : r.kind === "mod"
                      ? "bg-blue-50 text-blue-900"
                      : "bg-white text-zinc-900";
                const colorRight =
                  r.kind === "add"
                    ? "bg-green-50 text-green-900"
                    : r.kind === "mod"
                      ? "bg-blue-50 text-blue-900"
                      : "bg-white text-zinc-900";

                const canSelect = r.id !== 0;
                const checked = canSelect && selectedSet.has(r.id);

                return (
                  <div key={`${idx}-${r.id}`} className="border-b border-zinc-100">
                    {Array.from({ length: max }).map((_, lineIdx) => {
                      const leftText = leftLines[lineIdx] ?? "";
                      const rightText = rightLines[lineIdx] ?? "";
                      const arrow = r.kind === "add" ? "→" : r.kind === "del" ? "←" : r.kind === "mod" ? "↔" : "";
                      return (
                        <div
                          key={lineIdx}
                          className="grid grid-cols-[1fr_56px_1fr] border-t border-zinc-100 first:border-t-0"
                        >
                          <div className={`px-3 py-1 ${colorLeft}`}>
                            <div className="whitespace-pre-wrap break-words font-mono text-xs leading-5">
                              {leftText}
                            </div>
                          </div>

                          <div className="px-2 py-1">
                            {lineIdx === 0 ? (
                              <div className="flex flex-col items-center justify-start gap-1">
                                {canSelect ? (
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      const set = new Set(selectedIds);
                                      if (set.has(r.id)) set.delete(r.id);
                                      else set.add(r.id);
                                      setSelectedIds(Array.from(set).sort((a, b) => a - b));
                                    }}
                                  />
                                ) : (
                                  <div className="text-xs text-zinc-400">·</div>
                                )}
                                <div className="text-xs text-zinc-500">{arrow}</div>
                                <div className="text-[10px] text-zinc-400">{canSelect ? `#${r.id}` : ""}</div>
                              </div>
                            ) : (
                              <div className="h-5" />
                            )}
                          </div>

                          <div className={`px-3 py-1 ${colorRight}`}>
                            <div className="whitespace-pre-wrap break-words font-mono text-xs leading-5">
                              {rightText}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })
            ) : (
              <div className="px-3 py-6 text-sm text-zinc-500">加载中…</div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {enableChain || chainMeta ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="text-sm font-semibold text-zinc-900">反思审查链</div>
              <div className="mt-2 space-y-1 text-sm text-zinc-700">
                {chainMeta ? (
                  <>
                    <div>
                      评分：{chainMeta.overall_score.toFixed(1)} · 状态：{chainMeta.quality_passed ? "通过" : "未通过"} · 回环{" "}
                      {chainMeta.loops}/{chainMeta.max_loops} · 严格度 {chainMeta.strictness}
                    </div>
                    {chainMeta.final_notes.trim() ? (
                      <div className="rounded-md bg-zinc-50 px-2 py-1 text-xs text-zinc-600">
                        {chainMeta.final_notes}
                      </div>
                    ) : null}
                    {Array.isArray(chainMeta.steps) && chainMeta.steps.length ? (
                      <details className="rounded-md bg-white px-2 py-2">
                        <summary className="cursor-pointer text-sm text-zinc-900">查看节点回显</summary>
                        <div className="mt-2 space-y-2">
                          {chainMeta.steps.map((s, idx) => (
                            <div key={idx} className="rounded-md bg-zinc-50 p-2 text-xs text-zinc-700">
                              <div className="font-medium">
                                节点 {String((s as { node?: unknown }).node ?? "?")} ·{" "}
                                {String((s as { name?: unknown }).name ?? "")}
                              </div>
                              <div className="mt-1 whitespace-pre-wrap break-words">
                                {String((s as { reflection?: unknown }).reflection ?? "")}
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : null}
                  </>
                ) : (
                  <div className="text-sm text-zinc-500">已开启：将在本次生成时附带质量审查</div>
                )}
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="text-sm font-semibold text-zinc-900">提交记录</div>
            <div className="mt-3 space-y-2">
              {data?.commits?.length ? (
                data.commits
                  .slice()
                  .reverse()
                  .map((c) => (
                    <div key={c.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-zinc-600">
                          commit #{c.id} · {new Date(c.created_at).toLocaleString()}
                        </div>
                        <Button size="sm" variant="secondary" onClick={() => void rollback(c.id)}>
                          回滚到此
                        </Button>
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">包含改动组：{c.opcode_ids.join(", ") || "-"}</div>
                    </div>
                  ))
              ) : (
                <div className="text-sm text-zinc-500">暂无提交</div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="text-sm font-semibold text-zinc-900">颜色说明</div>
            <div className="mt-2 space-y-1 text-sm text-zinc-700">
              <div className="rounded-md bg-green-50 px-2 py-1 text-green-900">新增：绿色（在右侧）</div>
              <div className="rounded-md bg-red-50 px-2 py-1 text-red-900">删除：红色（在左侧）</div>
              <div className="rounded-md bg-blue-50 px-2 py-1 text-blue-900">修改：蓝色（左右同时）</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
